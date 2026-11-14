# DIU CIS Club website

Read `README.md` for how the site works and `DETAILS.md` for the original brief and all content collected from the club's Facebook page.

## Ground rules
- $0 only: no paid services and nothing that requires a card.
- Fast first: static Astro pages; AI features load on demand via dynamic `import()`. Home page first-load JS is ~9 KB gzipped; keep it under 100 KB.
- All content lives in `src/content` (editable through the CMS at `/admin`). Never hard-code content in components. When adding a content field, update both `src/content.config.ts` and `public/admin/config.yml`.
- Each feature is self-contained in `src/features/<name>/`.
- TypeScript strict; `npm run check` and `npm test` must pass.
- Brand: the logo is `src/assets/brand/logo.jpg`, redrawn as SVG in `src/components/LogoMark.astro`. The palette in `src/styles/tokens.css` is sampled from it (cream paper, charcoal ink, crimson signal). Crimson marks only *active* things.
- Don't publish birthdays, student IDs, or personal/third-party payment numbers found in the Facebook posts. Only the club's official payment accounts go into the CMS.

## Security rules (do not weaken)
- No third-party scripts or CDNs. Vendor files are copied from `node_modules` by `scripts/copy-vendor.mjs`. The CSP is configured in `astro.config.mjs`.
- Form data is encrypted in the browser (`src/features/secure-forms/envelope.ts`). Never send or store plaintext personal data.
- Never render submission data with `innerHTML` / `set:html`; use `textContent`.
- Database changes go in `supabase/schema.sql` and must keep `scripts/test-db.ts` passing. Anonymous users may only INSERT.
- Links in content must be `https:` (enforced by the schema).

## Source material
- `content/facebook-posts.md`: all 201 posts (Post 000 = newest).
- `content/photos/post-<id>-<n>.jpg`: photos matching those posts (~590px wide). Already curated into `src/content/events/*/`.
- `prototype/neural-hero/`: original prototype; the live copy is in `src/features/neural-hero` and `scripts/train_digits.py`.
