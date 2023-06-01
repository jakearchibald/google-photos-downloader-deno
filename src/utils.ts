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
