/**
 * End-to-end encryption for join requests and contact messages.
 *
 * The visitor's browser encrypts the form to the committee's PUBLIC key; only
 * the matching PRIVATE key (kept by the committee, never uploaded anywhere)
 * can decrypt it. The database, Supabase staff, and anyone who steals a
 * backup see only ciphertext.
 *
 * Scheme (ECIES, all via the browser's built-in Web Crypto):
 *   ephemeral ECDH P-256 key  ×  recipient public key  →  shared secret
 *   HKDF-SHA-256(shared, salt = ephemeral public key)  →  AES-256-GCM key
 *   AES-GCM(plaintext, additional data = submission kind)
 * Output: "v1.<ephemeral pub>.<iv>.<ciphertext>" in base64url.
 *
 * Plaintext is padded to a multiple of 512 bytes so message length leaks
 * almost nothing about the contents.
 */
const INFO = new TextEncoder().encode('diu-cis-club/inbox/v1');
const PAD_TO = 512;
const CURVE = { name: 'ECDH', namedCurve: 'P-256' } as const;

const b64u = (bytes: ArrayBuffer | Uint8Array): string =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const unb64u = (s: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function aesKey(privateKey: CryptoKey, publicKey: CryptoKey, salt: Uint8Array<ArrayBuffer>, usage: KeyUsage) {
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
  const hkdf = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: INFO }, hkdf, { name: 'AES-GCM', length: 256 }, false, [usage]);
}

/** Parses and checks the committee's public key from site settings. Returns null if missing or malformed. */
export async function importPublicKey(json: string): Promise<CryptoKey | null> {
  try {
    const jwk = JSON.parse(json) as JsonWebKey;
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y || jwk.d) return null; // never accept a private key here
    return await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, CURVE, false, []);
  } catch {
    return null;
  }
}

export async function seal(data: unknown, recipient: CryptoKey, kind: string): Promise<string> {
  const eph = await crypto.subtle.generateKey(CURVE, false, ['deriveBits']);
  const ephRaw = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
  const key = await aesKey(eph.privateKey, recipient, ephRaw, 'encrypt');
  const json = JSON.stringify(data);
  // JSON.parse ignores trailing whitespace, so spaces are a safe padding.
  const padded = json.padEnd(Math.ceil((json.length + 1) / PAD_TO) * PAD_TO, ' ');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(kind) },
    key,
    new TextEncoder().encode(padded),
  );
  return ['v1', b64u(ephRaw), b64u(iv), b64u(ct)].join('.');
}

/** Decrypts an envelope with the committee's private key (inbox only). Throws if tampered with. */
export async function open<T>(envelope: string, privateKey: CryptoKey, kind: string): Promise<T> {
  const [v, eph, iv, ct] = envelope.split('.');
  if (v !== 'v1' || !eph || !iv || !ct) throw new Error('Unknown envelope format');
  const ephRaw = unb64u(eph);
  const ephKey = await crypto.subtle.importKey('raw', ephRaw, CURVE, false, []);
  const key = await aesKey(privateKey, ephKey, ephRaw, 'decrypt');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(iv), additionalData: new TextEncoder().encode(kind) }, key, unb64u(ct));
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

export { b64u, unb64u };
