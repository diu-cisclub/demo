import type { APIRoute } from 'astro';
import { buildSearchDocs } from '../lib/search-docs';

/** Static JSON built once per deploy; read by ⌘K search and Ask CIS. */
export const GET: APIRoute = async () =>
  new Response(JSON.stringify({ builtAt: new Date().toISOString(), docs: await buildSearchDocs() }), {
    headers: { 'Content-Type': 'application/json' },
  });
