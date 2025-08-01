import { generateCodeVerifier } from './utils.ts';

const clientId =
  '330772666691-aotopofva7f70lhgb3bn53qp55iltsof.apps.googleusercontent.com';
const clientSecret = 'wfonil0u58f7HMkCk0n1YdZZ';

interface RefreshTokenResponse {
  access: string;
  expires: number;
}

interface TokenResponse extends RefreshTokenResponse {
  access: string;
  refresh: string;
  expires: number;
}

interface GetTokensOptions {
  responsePromise?: Promise<Response>;
}

export function getTokens({
  responsePromise = Promise.resolve(new Response(`Done!`)),
}: GetTokensOptions = {}): Promise<TokenResponse> {
  let server: Deno.HttpServer<Deno.NetAddr> | undefined;

  return new Promise<TokenResponse>((resolve, reject) => {
    const codeChallenge = generateCodeVerifier();

    server = Deno.serve({
      port: 0,
      async handler(request): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname !== '/') {
          return new Response('Not found', { status: 404 });
        }

        if (url.searchParams.has('error')) {
          return new Response(
            `Something went wrong: ${url.searchParams.get('error')}`,
          );
        }

        if (!url.searchParams.has('code')) {
          return new Response(`URL is missing code param`);
        }

        const body = new URLSearchParams({
          code: url.searchParams.get('code')!,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: `http://127.0.0.1:${port}`,
          grant_type: 'authorization_code',
          code_verifier: codeChallenge,
        });

        try {
          const response = await fetch('https://oauth2.googleapis.com/token', {
            body,
            method: 'POST',
          });

          const data = await response.json();

          if (
            !('access_token' in data) ||
            !('refresh_token' in data) ||
            !('expires_in' in data)
          ) {
            reject(Error(`Unexpected response: ${JSON.stringify(data)}`));
            return new Response(`Something went wrong.`);
          }

          resolve({
            access: data.access_token,
            refresh: data.refresh_token,
            expires: data.expires_in * 1000,
          });
        } catch (err) {
          reject(err);
          return new Response(`Something went wrong.`);
        }

        return responsePromise;
      },
    });

    const port = server.addr.port;

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', `http://127.0.0.1:${port}`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set(
      'scope',
      'https://www.googleapis.com/auth/photospicker.mediaitems.readonly',
    );
    url.searchParams.set('code_challenge', codeChallenge);

    console.log('Visit to authorize:', url.href);
  }).finally(() => {
    server?.shutdown();
  });
}

export async function refreshToken(
  refresh: string,
): Promise<RefreshTokenResponse> {
  const body = new URLSearchParams({
    refresh_token: refresh,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    body,
    method: 'POST',
  });

  const data = await response.json();

  if (!('access_token' in data) || !('expires_in' in data)) {
    throw Error(`Unexpected response: ${JSON.stringify(data)}`);
  }

  return {
    access: data.access_token,
    expires: data.expires_in * 1000,
  };
}

interface PickerResponseData {
  id: string;
  /** True if the user has selected media items */
  mediaItemsSet: boolean;
  pickerUri: string;
  pollingConfig: {
    /** A string representing seconds, ending in s, eg '5s' */
    pollInterval: string;
  };
}

interface MediaItem {
  id: string;
  baseUrl: string;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createPickerSession(
  token: string,
): Promise<PickerResponseData> {
  const response = await fetch(
    'https://photospicker.googleapis.com/v1/sessions',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
      },
    },
  );

  if (!response.ok) {
    throw Error(`Failed to create picker session: ${await response.text()}`);
  }

  return await response.json();
}

export async function awaitItemsPicked(
  token: string,
  session: PickerResponseData,
) {
  let data = session;

  // Await the user picking photos.
  while (true) {
    if (data.mediaItemsSet) return;

    await wait(parseFloat(data.pollingConfig.pollInterval.slice(0, -1)) * 1000);

    const response = await fetch(
      `https://photospicker.googleapis.com/v1/sessions/${data.id}`,
      {
        headers: {
          Authorization: 'Bearer ' + token,
        },
      },
    );

    if (!response.ok) {
      throw Error(`Failed to poll picker session: ${await response.text()}`);
    }

    data = await response.json();
  }
}

interface PickedMediaItem {
  id: string;
  type: 'PHOTO' | 'VIDEO' | 'TYPE_UNSPECIFIED';
  mediaFile: {
    baseUrl: string;
  };
}

interface MetaItemsResponse {
  mediaItems: PickedMediaItem[];
  nextPageToken?: string;
}

export async function getPickedItems(
  token: string,
  sessionId: string,
): Promise<MediaItem[]> {
  const mediaItems: MediaItem[] = [];
  let pageToken = '';

  while (true) {
    const url = new URL(`https://photospicker.googleapis.com/v1/mediaItems`);
    url.searchParams.set('sessionId', sessionId);
    url.searchParams.set('pageSize', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await fetch(url, {
      headers: {
        Authorization: 'Bearer ' + token,
      },
    });

    if (!response.ok) {
      throw Error(`Failed to get picked items: ${await response.text()}`);
    }

    const data: MetaItemsResponse = await response.json();

    for (const item of data.mediaItems) {
      if (item.type !== 'PHOTO') {
        throw Error(`Unexpected item type: ${item.type}`);
      }

      mediaItems.push({
        id: item.id,
        baseUrl: item.mediaFile.baseUrl,
      });
    }

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return mediaItems;
}

export async function fetchOriginalPhoto(
  token: string,
  baseUrl: string,
): Promise<Response> {
  const response = await fetch(baseUrl + '=d', {
    headers: {
      Authorization: 'Bearer ' + token,
    },
  });

  if (!response.ok) throw Error(response.statusText);

  return response;
}
