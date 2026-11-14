// @ts-check
import { defineConfig, envField } from 'astro/config';
import { loadEnv } from 'vite';

// Read .env at config time so the Content-Security-Policy can name the exact
// Supabase origin instead of allowing every *.supabase.co project.
const env = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '');
const supabaseOrigin = env.PUBLIC_SUPABASE_URL ? new URL(env.PUBLIC_SUPABASE_URL).origin : '';

export default defineConfig({
  // SITE_URL / BASE_PATH are set by the deploy workflow (see README → Deploy).
  site: env.SITE_URL || 'http://localhost:4321',
  base: env.BASE_PATH || '/',
  trailingSlash: 'ignore',
  // Astro 7 defaults to JSX-style whitespace collapsing, which eats spaces
  // between inline elements. Keep HTML semantics.
  compressHTML: true,
  build: { format: 'directory' },
  image: { layout: 'constrained', responsiveStyles: true },
  // Shiki's inline styles conflict with the CSP, and content has no code blocks.
  markdown: { syntaxHighlight: false },
  // Never inline assets as data: URLs; the CSP only allows files from 'self'.
  vite: { build: { assetsInlineLimit: 0 } },

  env: {
    schema: {
      PUBLIC_SUPABASE_URL: envField.string({ context: 'client', access: 'public', optional: true, url: true }),
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: envField.string({ context: 'client', access: 'public', optional: true }),
    },
  },

  security: {
    // Emitted as a <meta> CSP on every page, with hashes for Astro's own
    // inline scripts/styles. Nothing else may run or load.
    csp: {
      algorithm: 'SHA-384',
      scriptDirective: { resources: ["'self'"] },
      styleDirective: { resources: ["'self'"] },
      directives: [
        "default-src 'self'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        // Only this site and the club's own Supabase project (forms, inbox, Ask CIS fallback).
        /** @type {`connect-src ${string}`} */ (`connect-src 'self' ${supabaseOrigin}`.trim()),
        "worker-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-src 'none'",
        "manifest-src 'self'",
        'upgrade-insecure-requests',
      ],
    },
  },
});
