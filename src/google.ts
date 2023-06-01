import { Server } from 'https://deno.land/std@0.190.0/http/server.ts';
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

export function getTokens(): Promise<TokenResponse> {
  let server: Server;

  return new Promise<TokenResponse>((resolve, reject) => {
    const codeChallenge = generateCodeVerifier();
    const port = 3000;

    server = new Server({
      port,
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

        return new Response(`Done!`);
      },
    });

    server.listenAndServe();

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', `http://127.0.0.1:${port}`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set(
      'scope',
      'https://www.googleapis.com/auth/photoslibrary.readonly',
    );
    url.searchParams.set('code_challenge', codeChallenge);

    console.log('Visit to authorize:', url.href);
  }).finally(() => {
    server.close();
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

interface MediaItem {
  id: string;
  baseUrl: string;
}

interface AlbumResponse {
  mediaItems: MediaItem[];
  nextPageToken?: string;
}

async function photosFromAlbumRequest(
  token: string,
  albumId: string,
  pageToken = '',
): Promise<AlbumResponse> {
  const response = await fetch(
    'https://photoslibrary.googleapis.com/v1/mediaItems:search',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify({
        albumId,
        pageSize: 100,
        pageToken,
      }),
    },
  );

  if (!response.ok) {
    throw Error(`Failed to get photos from album: ${await response.text()}`);
  }
  return response.json();
}

export async function getPhotosFromAlbum(
  token: string,
  albumId: string,
): Promise<MediaItem[]> {
  let pageToken = '';
  const photos: MediaItem[] = [];

  while (true) {
    const data = await photosFromAlbumRequest(token, albumId, pageToken);
    photos.push(...data.mediaItems);
    if (!data.nextPageToken) return photos;
    pageToken = data.nextPageToken;
  }
}

export async function getAlbumIDByTitle(
  token: string,
  title: string,
): Promise<string> {
  const url = new URL('https://photoslibrary.googleapis.com/v1/albums');
  url.searchParams.set('pageSize', '50');

  while (true) {
    const response = await fetch(url, {
      headers: {
        Authorization: 'Bearer ' + token,
      },
    });

    if (!response.ok) {
      throw Error(`Failed to get albums: ${await response.text()}`);
    }

    const data = await response.json();

    for (const album of data.albums) {
      if (album.title === title) return album.id;
    }

    if (data.nextPageToken) {
      url.searchParams.set('pageToken', data.nextPageToken);
    } else {
      throw Error('Could not find album');
    }
  }
}
