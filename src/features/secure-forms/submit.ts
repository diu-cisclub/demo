/**
 * Sends an encrypted submission to Supabase. Anonymous visitors may only
 * INSERT into `submissions`; they can never read anything back (see
 * supabase/schema.sql). No cookies or credentials are sent.
 */
import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from 'astro:env/client';
import { seal } from './envelope';
import { takeProof } from './pow';

export type Kind = 'join' | 'contact';
export type JoinStatus = 'awaiting_payment' | 'verify_payment';

export interface Submission {
  kind: Kind;
  payload: Record<string, unknown>;
  status?: JoinStatus;
  paymentMethod?: string;
  puzzleSolved?: boolean;
}

export const backendConfigured = Boolean(PUBLIC_SUPABASE_URL && PUBLIC_SUPABASE_PUBLISHABLE_KEY);

/** Error with a message that is safe and useful to show the visitor. */
export class SubmitError extends Error {}

const FRIENDLY: Record<string, string> = {
  rate_limited: 'A lot of requests are arriving right now. Please try again in an hour, or email the club.',
  invalid_proof: 'Your browser’s security check expired. Please press Send again.',
};

export async function submit(s: Submission, recipient: CryptoKey): Promise<void> {
  if (!backendConfigured) throw new SubmitError('Online forms are not connected yet. Please email the club instead.');

  const send = async () =>
    fetch(`${PUBLIC_SUPABASE_URL}/rest/v1/submissions`, {
      method: 'POST',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      headers: {
        apikey: PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        kind: s.kind,
        status: s.kind === 'join' ? s.status : 'unread',
        payment_method: s.paymentMethod ?? null,
        puzzle_solved: s.puzzleSolved ?? false,
        ciphertext: await seal({ ...s.payload, sentAt: new Date().toISOString() }, recipient, s.kind),
        pow: await takeProof(),
      }),
    });

  let res: Response;
  try {
    res = await send();
    // A stale or reused proof gets one automatic retry with a new proof.
    if (res.status === 400 && (await res.clone().text()).includes('invalid_proof')) res = await send();
  } catch {
    throw new SubmitError('Could not reach the server. Check your connection and try again.');
  }
  if (!res.ok) {
    const body = await res.text();
    const code = Object.keys(FRIENDLY).find((k) => body.includes(k));
    throw new SubmitError(code ? FRIENDLY[code]! : 'Something went wrong while sending. Please try again, or email the club.');
  }
}
