/**
 * The committee's encryption key pair.
 *
 * - The PUBLIC key goes into the CMS (Site settings → Inbox public key) and is
 *   published with the site; browsers encrypt forms with it.
 * - The PRIVATE key is saved as a file, itself encrypted with a passphrase
 *   (PBKDF2-SHA-256, 600,000 rounds → AES-256-GCM). Share the file and the
 *   passphrase only with committee admins, through different channels.
 *   If both are lost, existing requests can never be read again.
 */
import { b64u, unb64u } from '../secure-forms/envelope';

const CURVE = { name: 'ECDH', namedCurve: 'P-256' } as const;
const ITERATIONS = 600_000;
const FORMAT = 'diu-cis-club-inbox-key';

export interface KeyFile {
  format: typeof FORMAT;
  version: 1;
  createdAt: string;
  publicKey: string;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  iv: string;
  data: string;
}

async function passphraseKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Public JWK reduced to the fields needed, as the string pasted into the CMS. */
const publicString = (jwk: JsonWebKey) => JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y });

export async function createKeyFile(passphrase: string): Promise<KeyFile> {
  const pair = await crypto.subtle.generateKey(CURVE, true, ['deriveBits']);
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapKey = await passphraseKey(passphrase, salt, ITERATIONS);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrapKey, new TextEncoder().encode(JSON.stringify(privateJwk)));
  return {
    format: FORMAT,
    version: 1,
    createdAt: new Date().toISOString(),
    publicKey: publicString(privateJwk),
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: b64u(salt) },
    iv: b64u(iv),
    data: b64u(data),
  };
}

/** Unlocks a key file. The resulting key can decrypt but can never be exported again. */
export async function unlockKeyFile(fileText: string, passphrase: string): Promise<{ privateKey: CryptoKey; publicKey: string }> {
  let file: KeyFile;
  try {
    file = JSON.parse(fileText) as KeyFile;
  } catch {
    throw new Error('That file is not an inbox key file.');
  }
  if (file.format !== FORMAT || file.version !== 1) throw new Error('That file is not an inbox key file.');
  const wrapKey = await passphraseKey(passphrase, unb64u(file.kdf.salt), file.kdf.iterations);
  let jwk: JsonWebKey;
  try {
    jwk = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(file.iv) }, wrapKey, unb64u(file.data))));
  } catch {
    throw new Error('Wrong passphrase for this key file.');
  }
  const privateKey = await crypto.subtle.importKey('jwk', jwk, CURVE, false, ['deriveBits']);
  return { privateKey, publicKey: file.publicKey };
}

/** True when two public-key strings describe the same key. */
export function samePublicKey(a: string, b: string): boolean {
  try {
    const x = JSON.parse(a) as JsonWebKey;
    const y = JSON.parse(b) as JsonWebKey;
    return x.x === y.x && x.y === y.y && x.crv === y.crv;
  } catch {
    return false;
  }
}
