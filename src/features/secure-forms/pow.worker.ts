/// <reference lib="webworker" />
/**
 * Proof-of-work search, off the main thread so the page stays smooth.
 * Finds a nonce such that SHA-256(prefix + nonce) starts with `bits` zero bits.
 */
import { leadingZeroBits, sha256 } from './sha256';

self.onmessage = (e: MessageEvent<{ prefix: string; bits: number }>) => {
  const { prefix, bits } = e.data;
  const enc = new TextEncoder();
  for (let nonce = 0; nonce < 2 ** 31; nonce++) {
    if (leadingZeroBits(sha256(enc.encode(prefix + nonce))) >= bits) {
      self.postMessage(prefix + nonce);
      return;
    }
  }
};
