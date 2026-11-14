import type { APIRoute } from 'astro';
import { buildAnswers } from '../lib/answers';

/** Ready-made answers for Ask CIS, rebuilt with every deploy. */
export const GET: APIRoute = async () =>
  new Response(JSON.stringify(await buildAnswers()), { headers: { 'Content-Type': 'application/json' } });
