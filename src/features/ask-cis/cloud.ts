/**
 * Cloud fallback for questions the built-in answers can't handle. Calls the
 * `ask` Edge Function on the club's Supabase project, which looks up the
 * relevant pages itself and asks Google Gemini for a short, grounded answer.
 * The visitor's browser only ever sends the question text.
 */
import { PUBLIC_SUPABASE_URL } from 'astro:env/client';

export interface CloudAnswer {
  answer: string;
  sources: { title: string; url: string }[];
}

export const cloudAvailable = Boolean(PUBLIC_SUPABASE_URL);

export async function askCloud(question: string): Promise<CloudAnswer> {
  const res = await fetch(`${PUBLIC_SUPABASE_URL}/functions/v1/ask`, {
    method: 'POST',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
    signal: AbortSignal.timeout(20000),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<CloudAnswer> & { error?: string };
  if (!res.ok || typeof body.answer !== 'string') throw new Error(body.error ?? 'unavailable');
  // Only ever link to pages of this site, whatever the server sends.
  const sources = (Array.isArray(body.sources) ? body.sources : [])
    .filter((s) => typeof s?.title === 'string' && typeof s?.url === 'string' && /^\/(?!\/)[\w\-/#.]*$/.test(s.url))
    .slice(0, 4);
  return { answer: body.answer.slice(0, 2000), sources };
}
