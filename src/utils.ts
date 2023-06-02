import * as base64 from 'https://denopkg.com/chiefbiiko/base64/mod.ts';

/**
 * Generate code verifier as per
 * https://developers.google.com/identity/protocols/OAuth2InstalledApp#step1-code-verifier
 */
export function generateCodeVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(96));
  const str = base64.fromUint8Array(bytes);
  // Replace the base64 chars that aren't allowed.
  return str.replace(/\+/g, '-').replace(/\//g, '.');
}

export class Throttler {
  #concurrency: number;
  #activeTasks = 0;
  #queue: (() => void)[] = [];

  constructor(concurrency: number) {
    this.#concurrency = concurrency;
  }

  async task<T>(fn: () => Promise<T>): Promise<T> {
    if (this.#activeTasks >= this.#concurrency) {
      await new Promise<void>((resolve) => {
        this.#queue.push(resolve);
      });
    }

    this.#activeTasks++;

    try {
      return await fn();
    } finally {
      this.#activeTasks--;
      if (this.#queue.length > 0) this.#queue.shift()!();
    }
  }
}
