# DIU CIS Club website

The website of the Daffodil International University Computing & Information System Club. It is a static Astro site that costs nothing to run, and join requests are end-to-end encrypted.

- **Live neural network** on the home page: draw a digit and watch a 64→16→12→10 network read it (`src/features/neural-hero`).
- **Ask CIS**, an assistant. Common questions are answered instantly on the device from ready-made answers written from the content at build time (`src/lib/answers.ts`). Anything else goes to a small Supabase Edge Function that answers with Google Gemini (free tier) from the site's pages (`src/features/ask-cis`, `supabase/functions/ask`).
- **Event landscape**: a 3D topographic model (three.js). Events are placed by latent semantic analysis of their write-ups, similar events form hills, and a timeline grows it from 2023 to today (`src/features/latent-map`).
- **Join form** with every Bangladeshi payment method, optional AI puzzles, and end-to-end encryption (`src/features/secure-forms`, `src/features/join-puzzle`).
- **⌘K / Ctrl+K search** (`src/features/site-search`).
- **Content editor** at `/admin` (Sveltia CMS) and a **committee inbox** at `/admin/inbox`.

---

## Run it locally

Requires Node.js 22.18 or newer.

```bash
npm ci            # install exactly what package-lock.json lists
npm run dev       # http://localhost:4321
npm test          # neural-net, encryption and database-security tests
npm run check     # TypeScript check (must pass before deploying)
npm run build     # production build into dist/
```

To test the join form locally, copy `.env.example` to `.env` and fill in the Supabase values (see [Inbox setup](#inbox-setup-one-time)).

## Where things live

```
src/
  content/            ← ALL text and photos. Edited through /admin.
    events/<slug>/    one folder per event: index.md + its photos
    committees/       advisors and each year's committee
    resources/ puzzles/ settings/
  content.config.ts   schemas: what fields each kind of content has
  features/           one folder per feature; delete the folder + its one usage to remove it
  components/         small shared UI pieces
  layouts/ pages/     page templates and routes
  lib/                helpers: dates, URLs, content queries, search index
  styles/tokens.css   colours, type scale, spacing: re-brand here
supabase/schema.sql   the database (tables, security rules)
public/admin/         the CMS (config.yml lists every editable field)
scripts/              tests, network training script, vendor copy
```

Rules the code follows: content never lives in components; every link goes through `withBase()`; dates are stored as ISO (`2026-12-26`) and formatted only in `src/lib/dates.ts`; comments explain *why*.

## Everyday tasks (no code needed)

All of these happen at **`https://<site>/admin`**. Every save is a Git commit, and the site rebuilds in about a minute.

| Task | Where in /admin |
|---|---|
| Add an event, its photos, or a result | **Events → New Event**. The first photo is the cover. Fill in "Result" for a win and it appears under "Recent wins". |
| New committee for the year | **Committees → New Committee**, with a higher "Order" than the last one |
| Set up a payment method (bKash, Nagad…) | **Settings → Join page and payments → Payment methods**. Fill in "Account number or where to pay". Until it's filled, members who pick that method are told their request is pending and to pay in person. |
| Change the puzzles | **Join puzzles** |
| Edit home, about, contact, FAQ, socials | **Settings** |

Photos are resized and converted to modern formats automatically at build time.

**Signing in to /admin:** create a GitHub *fine-grained personal access token* limited to this repository with **Contents: Read and write** permission and an expiry date. Then choose "Sign In Using Access Token". Each editor must be a collaborator on the repository with 2FA enabled on GitHub.

## Inbox setup (one time)

Join requests and contact messages are stored in a free Supabase database (no card required). Do these steps once:

1. **Create the project.** At supabase.com, create a free project and pick the Singapore region (closest to Dhaka).
2. **Create the database.** Open **SQL Editor**, paste all of `supabase/schema.sql`, and run it.
3. **Lock down sign-ups.** In **Authentication → Sign In / Providers**:
   - turn **off** "Allow new users to sign up",
   - keep Email enabled,
   - in **Multi-Factor**, keep TOTP enabled.
4. **Create committee admins.** In **Authentication → Users → Add user**, create a user with a long password and tick "Auto confirm". Then run the "make admin" SQL at the bottom of `schema.sql` with their email.
5. **Connect the site.** In **Project Settings → API keys**, copy the project URL and the **publishable** key (never the secret key). In GitHub, add them under **Settings → Secrets and variables → Actions → Variables** as `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
6. **Create the encryption key.** Open `/admin/inbox`, expand "No key yet? Create one", choose a passphrase of 14 or more characters, and save the downloaded key file somewhere safe. Copy the public key into **/admin → Settings → Site → Inbox public key** and publish.

The forms open after the next deploy. At first sign-in, each admin scans a QR code with an authenticator app. After that, every sign-in asks for a password, a 6-digit code, and the key file with its passphrase.

> **Back up the key file and passphrase.** Store them separately, for example the file in the committee's shared drive and the passphrase in a password manager. If both are lost, existing requests can never be decrypted. That is the point of the encryption.

## Ask CIS cloud fallback (one time)

Built-in answers work without this. To also answer unusual questions:

1. Create a free API key at [Google AI Studio](https://aistudio.google.com/apikey) (no card needed).
2. In Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**: name it `ask`, paste [supabase/functions/ask/index.ts](supabase/functions/ask/index.ts), and deploy.
3. In the function's **Settings**, turn **off** "Verify JWT". Visitors aren't signed in; the function checks the origin and rate-limits instead.
4. In **Edge Functions → Secrets**, add `GEMINI_API_KEY` with the key. Optional: `GEMINI_MODEL` (default `gemini-3.5-flash-lite`).

## Deploy (GitHub Pages)

1. Push this folder to a GitHub repository. In `public/admin/config.yml`, replace `OWNER/REPO` with that repository.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main`. `.github/workflows/deploy.yml` then:
   - runs all tests and the type check,
   - builds the site and deploys it,
   - rebuilds every morning so "upcoming" events stay accurate,
   - pings Supabase weekly so the free database isn't paused.

**Use a club-only address.** Use a custom domain, or an organisation's root site (`<org>.github.io`), rather than a project page under a personal account. Every project page under the same `*.github.io` account shares one browser origin. The CMS keeps its GitHub token in that origin's storage.

## Security model

| Threat | Defence |
|---|---|
| Database breach, a stolen backup, or the database provider reading the data | Personal data is encrypted in the visitor's browser with the committee's public key (ECDH P-256 + AES-256-GCM, padded to hide length). The database stores only ciphertext. |
| Visitors reading or changing data | Row Level Security and column grants: anonymous users can only insert. Tested in `scripts/test-db.ts`. |
| Stolen admin password | Reading requires two-factor sign-in (`aal2`) **and** the `club_role` mark, which users can't set themselves. Decrypting also needs the key file and its passphrase. |
| Spam and floods | Each submission needs a fresh proof of work (about a second of the visitor's CPU), checked and used once by the database. There's a global cap of 300 per hour and 20,000 rows in total. A hidden honeypot field catches bots. No IP addresses are stored. |
| Malicious content in submissions (XSS) | The inbox renders submissions as text only, never HTML. CSV exports neutralise spreadsheet formulas. |
| Injected or third-party scripts | A strict Content-Security-Policy with hashed inline scripts. No CDN scripts: everything is served from the site. Pages may only connect to the site itself and the club's Supabase project. |
| Clickjacking the inbox | The inbox refuses to render inside a frame. |
| Tampered public key (someone with CMS access swaps it) | The inbox warns when the unlocked key doesn't match the site's public key. Every change is in Git history. |
| Vulnerable or hijacked dependencies | Exact version pins with a lockfile, `npm ci`, Dependabot updates, and minimal workflow permissions. |
| Tracking | No analytics, cookies or third-party requests from the browser. Ask CIS's cloud fallback stores neither questions nor IPs (Google may use free-tier requests to improve its products; the panel says so). |
| Abuse of the Ask CIS function | Only the site's own origin may call it; per-IP and global rate limits; 300-character questions; it answers only from the site's own pages, so it can't be used as a free general AI. The free tier can't bill anyone. |

Limitations to know about:
- The puzzle badge is self-reported.
- GitHub Pages can't send custom HTTP headers, so the CSP is delivered as a `<meta>` tag.
- Someone running the proof of work in fast native code can still hit the hourly cap and block the forms for up to an hour.

Report security problems to cisclub@diu.edu.bd (also listed in `/.well-known/security.txt`).

## Retraining the hero network

```bash
pip install numpy scipy scikit-learn
python3 scripts/train_digits.py      # writes src/features/neural-hero/weights.json
node scripts/test-hero.ts            # checks it still reads the sample digits
```
