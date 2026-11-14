/**
 * Anti-spam without tracking: before a form can be sent, the browser spends
 * about a second of CPU finding a "proof of work". The database re-checks it
 * (supabase/schema.sql), accepts each proof once, and only for 60 minutes.
 * A person never notices; a bot sending thousands of requests pays for each.
 *
 * The work starts in the background as soon as someone begins typing, so it
 * is normally done before they press Send.
 */
import { b64u } from './envelope';

/** Must match `pow_bits` in supabase/schema.sql. */
export const POW_BITS = 20;
/** Proofs older than this are recomputed before sending (the server allows 60). */
const MAX_AGE_MIN = 45;

let pending: { promise: Promise<string>; stamp: number } | null = null;

function solve(): { promise: Promise<string>; stamp: number } {
  const salt = b64u(crypto.getRandomValues(new Uint8Array(16)));
  const stamp = Math.floor(Date.now() / 60000);
  const worker = new Worker(new URL('./pow.worker.ts', import.meta.url), { type: 'module' });
  const promise = new Promise<string>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<string>) => {
      resolve(e.data);
      worker.terminate();
    };
    worker.onerror = (err) => {
      reject(err);
      worker.terminate();
    };
    worker.postMessage({ prefix: `${salt}:${stamp}:`, bits: POW_BITS });
  });
  return { promise, stamp };
}

/** Start computing early (idempotent). */
export function warmUp(): void {
  if (!pending) pending = solve();
}

/** A fresh, unused proof. Each proof can be used once, so the next call starts a new one. */
export async function takeProof(): Promise<string> {
  const fresh = pending && Date.now() / 60000 - pending.stamp < MAX_AGE_MIN ? pending : solve();
  pending = null;
  return fresh.promise;
}
