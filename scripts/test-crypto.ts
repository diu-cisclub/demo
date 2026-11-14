/**
 * Tests for the form encryption, key files and proof of work.
 * Run: node scripts/test-crypto.ts
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Let Node resolve the extension-less imports used inside src/ (Vite does this in the app).
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (err) {
      if (spec.startsWith('.')) return next(`${spec}.ts`, ctx);
      throw err;
    }
  },
});

const { sha256, leadingZeroBits } = await import('../src/features/secure-forms/sha256.ts');
const { seal, open, importPublicKey } = await import('../src/features/secure-forms/envelope.ts');
const { createKeyFile, unlockKeyFile, samePublicKey } = await import('../src/features/inbox/keys.ts');

let passed = 0;
const test = async (name: string, fn: () => Promise<void> | void) => {
  await fn();
  passed++;
  console.log(`ok  ${name}`);
};

await test('sha256 matches Web Crypto for many lengths', async () => {
  for (let len = 0; len < 200; len += 7) {
    const msg = crypto.getRandomValues(new Uint8Array(len));
    const expected = new Uint8Array(await crypto.subtle.digest('SHA-256', msg));
    assert.deepEqual(sha256(msg), expected);
  }
});

await test('leadingZeroBits counts correctly', () => {
  assert.equal(leadingZeroBits(new Uint8Array([0, 0, 0x0f, 1])), 20);
  assert.equal(leadingZeroBits(new Uint8Array([0x80])), 0);
  assert.equal(leadingZeroBits(new Uint8Array([0, 1])), 15);
});

const keyFile = await createKeyFile('correct horse battery staple');
const { privateKey, publicKey } = await unlockKeyFile(JSON.stringify(keyFile), 'correct horse battery staple');
const recipient = (await importPublicKey(keyFile.publicKey))!;

await test('seal → open round trip', async () => {
  const data = { name: 'Test নাম', interests: ['AI'], payment: { trxId: 'ABC123' } };
  const env = await seal(data, recipient, 'join');
  assert.match(env, /^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
  assert.deepEqual(await open(env, privateKey, 'join'), data);
});

await test('ciphertext length is padded (does not reveal message length)', async () => {
  const a = await seal({ m: 'a' }, recipient, 'contact');
  const b = await seal({ m: 'a'.repeat(300) }, recipient, 'contact');
  assert.equal(a.length, b.length);
});

await test('tampering or wrong kind is rejected', async () => {
  const env = await seal({ x: 1 }, recipient, 'join');
  await assert.rejects(open(env, privateKey, 'contact'));
  const parts = env.split('.');
  parts[3] = parts[3]!.slice(0, -2) + (parts[3]!.endsWith('A') ? 'BB' : 'AA');
  await assert.rejects(open(parts.join('.'), privateKey, 'join'));
});

await test('wrong passphrase cannot unlock the key file', async () => {
  await assert.rejects(unlockKeyFile(JSON.stringify(keyFile), 'wrong passphrase'), /Wrong passphrase/);
});

await test('unlocked private key cannot be exported', async () => {
  await assert.rejects(crypto.subtle.exportKey('jwk', privateKey));
});

await test('public key import rejects private keys and junk', async () => {
  assert.equal(await importPublicKey(''), null);
  assert.equal(await importPublicKey('{"kty":"RSA"}'), null);
  const priv = await crypto.subtle.exportKey('jwk', (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])).privateKey);
  assert.equal(await importPublicKey(JSON.stringify(priv)), null);
  assert.ok(samePublicKey(publicKey, keyFile.publicKey));
});

console.log(`\n${passed} crypto tests passed`);
