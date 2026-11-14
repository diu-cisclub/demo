/**
 * Copies third-party runtime files from node_modules into public/ so the site
 * serves them itself. Nothing is ever loaded from a CDN, which keeps the
 * Content-Security-Policy strict and the supply chain pinned by package-lock.
 * Runs automatically before `npm run dev` and `npm run build`.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  // Sveltia CMS for /admin
  ['node_modules/@sveltia/cms/dist/sveltia-cms.js', 'public/admin/sveltia-cms.js'],
];

for (const [from, to] of files) {
  mkdirSync(dirname(join(root, to)), { recursive: true });
  copyFileSync(join(root, from), join(root, to));
}
console.log(`copy-vendor: ${files.length} files copied`);
