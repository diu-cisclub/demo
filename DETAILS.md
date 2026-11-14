# DIU CIS Club Website: Project Details

This is the full brief for the DIU CIS Club website. It covers the idea, the features, the tech stack, how the code should be organized, the design direction, and everything collected from the club's Facebook page. **Status (14 Nov 2026): the site is built.** See `README.md` for how it works. This document stays as the original brief and content inventory.

---

## 1. What's in this folder

| Path | What it is |
|---|---|
| `DETAILS.md` | This document: the full brief |
| `CLAUDE.md` | Short instructions Claude Code reads automatically. Points here. |
| `content/facebook-posts.md` | Full text of all 201 posts from facebook.com/diucisclub, newest first (Post 000 is newest, Post 200 is the first meeting in Nov 2023). Each post lists its photo filenames. |
| `content/photos.zip` | 354 photos from those posts. **Extract it in place** (right-click → Extract All, keep the suggested folder) to get `content/photos/`, named `post-<id>-<n>.jpg` to match `facebook-posts.md`. About 590px wide (Facebook's feed size). |
| `prototype/neural-hero/` | A tiny trained digit-reading network for the home page hero (`weights.json`) and the script that trained it (`train_digits.py`). |

Your Downloads folder also has the original `cis-club-facebook-photos.zip` and `facebook-posts.md`. They're the same files, so you can delete those copies.

---

## 2. Goal and constraints

**Goal:** a website for DIU CIS Club (Computing & Information System, Daffodil International University) that shows off the club's AI focus in a way no other university club site does, while covering everything a club site needs: events, team, joining, contact.

**Hard constraints from the club:**
- **$0 cost.** No paid services, and no service that asks for a card, even for a free trial.
- **Fast loading.** Static pages, no heavy JavaScript on first load. AI features load only when someone uses them.
- **Unique and polished design.** Nothing that looks like a template.
- **Clean, organized code.** Easy for future club members to maintain: clear folders, small files, typed code, content kept separate from code.
- **An admin page** that can edit all text, images and content on the site without touching code.

**The core idea:** the AI runs *in the visitor's browser*, not on a server. That costs nothing, needs no API keys, and is the thing that makes the site stand out.

---

## 3. Missing inputs (decide before or during the build)

1. **Logo.** ✅ Provided (`logo.jpg.jpeg`, now `src/assets/brand/logo.jpg`). The palette is taken from it (section 9).
2. **Wings.** DIU StudentsHub says the club has 3+ "wings", including a Programming Wing. Decide whether wings get their own section or page. The full list of wings is still needed.
3. **Hosting.** Recommended: GitHub Pages or Cloudflare Pages (section 7).
4. **Join request backend account.** Someone needs to create a free Supabase project (no card) and add its URL and anon key to `.env`.
5. **Full current committee list.** The roles in section 12 come from birthday posts, which don't cover everyone. The full list is probably in the photos of the "Congratulations to the Newly Selected CIS Club Committee" post (pinned on Facebook) or with the club's executives.
6. **Membership fee.** ✅ Confirmed: ৳100 one-time. All Bangladeshi payment methods are listed on the join form; their account numbers are added later in /admin (Settings → Join page and payments).
7. **Higher-res photos.** The Facebook photos are about 590px. Swap in originals for hero and cover images when available.

---

## 4. Sitemap

Based on the existing friend-built site (Home, About, Events, Join, Resources, Gallery, Contact), improved:

### Home `/`
1. **Hero: the live neural network (Feature A).** Visitors draw a digit and watch the network read it.
2. **Happening now / upcoming events:** the next 2–3 events.
3. **Recent wins:** achievements from the posts, such as Robo Camp champions, World Robot Games silver, AI BuildFest champion, and the Top 20 at the Bangladesh AI Business Summit.
4. **About blurb + stats:** founded 2023, ~2K Facebook followers, number of events (computed from content), number of wins (computed).
5. **Advisors + Executive Committee preview:** links to About.
6. **Join call-to-action.**
7. Footer: socials (Facebook live; Instagram and LinkedIn when available), contact, quick links.

### About `/about`
Mission, short story/timeline (first meeting Nov 2023, inauguration Dec 2023, …), full advisor panel, full current Executive Committee, and **past committees by year** (data-driven, so a new committee each year means editing one file).

### Events `/events`
- Upcoming events at the top.
- Past events with a **Map / List toggle**. Map = the latent space view (Feature C). List = filterable by year and category.
- **Event detail page** `/events/<slug>`: title, date, venue, category, write-up, results/winners, photos.

### Join `/join`
Membership form (stored in Supabase) with an optional **AI puzzle** (Feature D). Solvers get a badge on their request. Shows the fee and what members get.

### Resources `/resources`
Learning links, guides and past workshop material. Content is editable in the admin. Ask CIS (Feature B) can answer from these.

### Gallery `/gallery`
**Generated automatically from event photos.** Photos live with each event, so they're uploaded once and appear in both places. Grouped by event, with a lightbox.

### Contact `/contact`
Contact form (stored in Supabase), email, phones, location map link, social links, short FAQ.

### On every page
- **Ask CIS** floating button (Feature B).
- **⌘K / Ctrl+K search** across the whole site (Feature E).

### Admin
- `/admin`: content editor for everything (section 6).
- `/admin/inbox`: join requests and contact messages.

---

## 5. The AI features

### Feature A: Live neural network hero
**What visitors see:** a drawing pad next to a drawing of a neural network (input → hidden layers → 10 output digits). As they draw, the network lights up layer by layer and the output bars show which digit it thinks it is. The hero itself is the model, so the club's subject is clear within seconds.

**How it works:**
- Prototype already trained: `prototype/neural-hero/weights.json`. It's a 64 → 16 → 12 → 10 network (ReLU, softmax output), trained on scikit-learn's bundled 8×8 handwritten digits plus shifted/thickened copies. **93.1% test accuracy.** About 10 KB of weights. Weight matrices are stored as `[out][in]`.
- Drawing pad: capture strokes on a larger canvas (e.g. 192×192), crop to the bounding box, center, downscale to 8×8, and normalize to 0–1. The training data uses values 0–16 divided by 16, so match that.
- Forward pass in plain TypeScript (a few matrix multiplies). No libraries.
- Render with Canvas 2D or SVG: nodes brighten with activation, edges by `|weight × activation|`. Only draw the strongest edges so it stays readable and fast.
- Retrain with `python3 prototype/neural-hero/train_digits.py` (needs numpy, scipy, scikit-learn).

**Requirements:** zero network requests (weights inlined at build), works with touch, "Clear" button, a short sample animation when idle, respects `prefers-reduced-motion`, keyboard-accessible alternative (buttons that load sample digits).

### Feature B: "Ask CIS" assistant (runs on the visitor's device)
**What visitors see:** a chat panel with a visible badge: "Running on your device · no servers". Answers questions about events, joining, committee, resources, and so on.

**Two levels, both opt-in so the main site stays fast:**
1. **Quick answers (default):** semantic search over site content using a small embedding model in the browser via Transformers.js (`@huggingface/transformers`). The model is `Xenova/all-MiniLM-L6-v2`, about 23 MB quantized and cached by the browser after the first load. Returns the best-matching passages with links.
2. **Full AI (button: "Wake the AI"):** a small instruction model via WebLLM (`@mlc-ai/web-llm`, needs WebGPU), e.g. a Qwen2.5 0.5B instruct build. It's a large download (hundreds of MB), so ask first and show progress. It answers using the retrieved passages (retrieval-augmented generation) and cites the pages it used.

**Details:**
- Build a `search-index.json` at build time from all content (events, people, resources, pages), chunked into ~300-word passages with title + URL.
- Embed passages in the browser on first use and cache them in IndexedDB. Optional upgrade: compute embeddings at build time in CI.
- Fallback when WebGPU isn't available: stay on Quick answers and say so plainly.
- Language: many posts are in Bangla. MiniLM-L6 is English-only, so either write English summaries for each event (recommended) or use a multilingual embedding model (bigger download). Decide during the build.
- Load all model code with dynamic `import()` only when the panel opens. Nothing on initial page load.

### Feature C: Event "latent space" map
**What visitors see:** on `/events`, a toggle between List and Map. The map shows every event as a point. Events about similar things sit close together (AI competitions in one region, sports in another, cultural festivals in another). Color shows category, size shows photo count or importance, hover shows the title, click opens the event.

**How it works (no download, runs at build time):**
- At build time, take each event's title + category + body. Run TF-IDF, then reduce to 2D with truncated SVD/PCA (latent semantic analysis) in plain TypeScript. Write `{slug, x, y}` into the page.
- Render as an inline SVG. It's just numbers, so it costs nothing at runtime.
- Optional later upgrade: embeddings + UMAP computed in CI.
- Accessibility: the List view is the default for screen readers. Map points are focusable links with titles.

### Feature D: Join form AI puzzle
**What visitors see:** below the join form, an optional "Prove you think like a model" challenge with 3 short AI puzzles. Solving them adds a "Puzzle solver" badge to the join request (visible in the admin inbox).

**Puzzle ideas (all checkable without a server):**
- Softmax/temperature: given logits for 3 tokens, which token does greedy decoding pick, and what changes at high temperature?
- Tokenization: how many tokens does a short string split into under a given simple rule?
- Prompt fix: pick which of 3 prompts would give the described output.

**Details:** answers are checked in the browser by comparing SHA-256 hashes (so the answers aren't sitting in the page source as plain text). It's a fun filter, not security. Store `puzzle_solved: boolean` with the request. Puzzles live in the content folder so the admin can change them each semester.

### Feature E: ⌘K / Ctrl+K site search
Instant keyword search from the moment the palette opens (prebuilt index, no download). If the visitor has already loaded the Ask CIS embedding model, results are re-ranked by meaning. Keyboard-first, works on mobile via a search icon.

---

## 6. Admin page (edit everything without code)

**Recommended: Sveltia CMS** (free, open source, a modern drop-in for Decap CMS). It lives at `/admin` as one HTML file plus a `config.yml`.
- It edits the Markdown/YAML content files in the GitHub repo through forms. Every save is a commit, the site rebuilds automatically (about a minute), and every change can be undone from git history.
- **Login:** GitHub account (club admins are added as repo collaborators). Check Sveltia's current docs for the simplest sign-in option (personal access token, or OAuth through a free Cloudflare Worker).
- **Collections to configure:** Events (folder of Markdown files + photos), People (advisors, committee, past committees), Achievements, Partners, Resources, Join puzzles, plus single-file settings for Site (name, logo, socials, contact info), Home (hero text, sections on/off), About (mission, story), Join (fee, benefits) and Contact (FAQ).
- **Images:** uploaded to `public/uploads/`. Note: images uploaded through the CMS aren't auto-optimized. Add a build step to generate WebP/AVIF sizes (e.g. with `sharp`) or keep event photos under `src/assets` and use Astro's `<Image>`.

**Join requests and contact messages (`/admin/inbox`):**
- Supabase free project with two tables: `join_requests` and `contact_messages`.
- Row Level Security: anonymous visitors can only **insert**. Signed-in admins can read and update status (new → approved / rejected).
- The inbox page signs admins in with Supabase Auth (email + password, accounts created in the Supabase dashboard) and lists requests with filters and an approve/reject action.
- Use plain `fetch` against Supabase's REST API (or the small `@supabase/supabase-js` client) only on the join, contact and inbox pages.
- Keep `schema.sql` in the repo so the database can be recreated.

---

## 7. Tech stack (all $0, no card)

| Need | Choice | Why |
|---|---|---|
| Framework | **Astro** + TypeScript | Ships zero JS by default. Interactive parts load as "islands" only where needed, which suits fast pages. |
| Content | Astro content collections (Markdown + YAML) with typed schemas (zod) | Content separate from code. Validation catches mistakes at build. |
| Styling | Plain CSS with design tokens (CSS custom properties), scoped component styles | No framework lock-in, tiny CSS, easy for juniors. |
| Fonts | Self-hosted via Fontsource | No Google Fonts request, faster and private. |
| In-browser AI | Transformers.js, WebLLM | Free, runs on the visitor's device. |
| Admin/CMS | Sveltia CMS | Free, git-based, no database for content. |
| Forms backend | Supabase free tier | Join requests, contact messages, admin login. |
| Hosting | GitHub Pages (GitHub Actions deploy) or Cloudflare Pages | Free, auto-deploys on push. |

Check each service's current free-tier terms when setting up, since they change over time. If the site is served from a sub-path (e.g. `username.github.io/repo/`), all internal links and image paths must use Astro's `base`. Use a single `withBase()` helper everywhere.

---

## 8. Code structure

```
diu-cis-club-site/
├─ astro.config.mjs
├─ package.json
├─ tsconfig.json              (strict mode)
├─ .env.example               (PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY)
├─ README.md                  (setup, how to add an event, how to deploy)
├─ public/
│  ├─ admin/                  (index.html + config.yml for Sveltia CMS)
│  └─ uploads/                (CMS-managed images)
├─ supabase/
│  └─ schema.sql              (tables + RLS policies)
├─ scripts/
│  └─ train_digits.py         (from prototype/neural-hero)
└─ src/
   ├─ content.config.ts       (all collection schemas in one place)
   ├─ content/
   │  ├─ events/              (one .md per event, slug = filename)
   │  ├─ people/              (one .yaml per person: name, role, group, term, photo)
   │  ├─ achievements/
   │  ├─ resources/
   │  ├─ puzzles/
   │  └─ settings/            (site.yaml, home.yaml, about.yaml, join.yaml, contact.yaml)
   ├─ layouts/
   │  └─ BaseLayout.astro
   ├─ components/             (small, reusable UI: Header, Footer, EventCard, PersonCard, Button, …)
   ├─ features/               (each AI feature is self-contained)
   │  ├─ neural-hero/         (component, model.ts, render.ts, weights.json)
   │  ├─ ask-cis/             (panel, embedder.ts, retrieval.ts, llm.ts)
   │  ├─ latent-map/          (component, lsa.ts build-time math)
   │  ├─ join-puzzle/
   │  └─ site-search/
   ├─ lib/                    (supabase.ts, dates.ts, url.ts withBase, content queries)
   ├─ pages/                  (index, about, events/index, events/[slug], join, resources,
   │                           gallery, contact, admin/inbox, 404, search-index.json.ts)
   └─ styles/
      ├─ tokens.css           (colors, type scale, spacing, radii, motion)
      └─ base.css             (reset, typography, focus styles)
```

**Conventions:**
- One feature = one folder. A feature can be removed by deleting its folder and its one usage.
- Components stay small (aim under ~150 lines). Logic goes in `.ts` files, markup in `.astro`.
- No hard-coded content in components. Everything comes from `src/content`, so the CMS can edit it.
- Typed everything (`strict: true`). `astro check` must pass before deploy.
- Dates stored as ISO (`2026-12-26`) and formatted in one helper.
- Comments explain *why*, not *what*.
- README covers: run locally, add an event, add a committee, deploy, rotate admin access.

---

## 9. Design direction

**Status: final palette taken from the logo** (see `src/styles/tokens.css`): Paper #F1EAE2, Ink #313036, Signal (crimson) #A33646. The provisional palette below is kept for reference only. Type: Bricolage Grotesque (variable) + Anek Bangla.

**Concept: "the lab notebook of a neural network."** A light, cool, paper-like page where color carries meaning: the accent color only appears where something is *active* (a firing neuron, the current page, a live event, a hovered map point). It's a calm page with one memorable live element (the hero network).

**Provisional palette:**
| Name | Hex | Use |
|---|---|---|
| Chalk | `#EEF1F6` | Page background |
| Paper | `#FFFFFF` | Raised surfaces |
| Ink | `#14214D` | Text, network edges at rest |
| Slate | `#5B6478` | Secondary text |
| Activation | `#F26B1D` | Active/live states only, used sparingly |
| Weight | `#3A6FF2` | Links, secondary data marks |

**Type:**
- One grotesk family for everything, e.g. **Schibsted Grotesk** (variable), with tabular numbers for dates and stats. Final pick can change with the logo.
- **Hind Siliguri** (or Noto Sans Bengali) as the Bangla fallback. Many posts and event names are in Bangla (e.g. হিম উৎসব), so Bangla must render well.
- Clear type scale, line length under ~75 characters, sentence-case headings.

**Layout notes:**
- Hero: headline + one line of copy + "Join the club" on the left, the live network on the right. On mobile, the network stacks under the headline.
- Sections are left-aligned, with varied layouts (not identical cards everywhere).
- Event cards lead with the photo and date. The achievements strip is denser and typographic.

**Avoid (generic AI-site tells):** dark background with neon gradients, purple-blue "AI" gradients, ALL-CAPS labels above every heading, identical rounded cards with the same shadow, fade-up animations on every section, emoji in headings.

**Quality floor:** responsive down to 360px, visible keyboard focus, `prefers-reduced-motion` respected, WCAG AA contrast, works without JS (except the interactive features).

**Performance budget:** home page under ~100 KB of JS on first load (the hero network only), Lighthouse 95+ for performance and accessibility, images in WebP/AVIF with width/height set, lazy-loaded below the fold.

---

## 10. Suggested build order

1. Scaffold Astro + TS, tokens, base layout, header/footer, `withBase` helper.
2. Content collections and schemas, then convert the events in section 13 into `src/content/events/*.md` with photos from `content/photos/`.
3. Pages: Home (static hero placeholder), About, Events list + detail, Gallery, Resources, Contact, Join (form without backend).
4. Feature A: neural hero.
5. Feature C: latent map.
6. Supabase: schema, join + contact forms, `/admin/inbox`.
7. Sveltia CMS config for every collection and setting.
8. Feature D: join puzzle.
9. Feature E: ⌘K search, then Feature B: Ask CIS.
10. Polish: accessibility pass, Lighthouse, README, deploy workflow.

---

## 11. Club facts

- **Full name:** Daffodil International University Computing and Information System Club (DIU CIS Club)
- **Department:** Computing & Information System (CIS), DIU. The department offers a major in Artificial Intelligence (post 167 mentions "Artificial Intelligence in IoT").
- **Founded:** first regular general meeting on **26 Nov 2023**. Official inauguration on **22 Dec 2023** at Bonomaya, Daffodil Smart City.
- **Motto (DIU StudentsHub):** "Code. Lead. Inspire."
- **Tagline used in posts:** "Where Innovation Meets Leadership"
- **Reach:** ~2K Facebook followers. 218+ students joined via DIU StudentsHub.
- **Membership fee:** ৳100 one-time (confirmed).
- **Location:** Daffodil Smart City, Birulia, Savar (Ashulia), Dhaka. Rooms used: Knowledge Tower (AB-4), International Conference Hall, Bonomaya 1/2, Shadhinota Shommelon Kendro, Central Field.

**Contact (from the Facebook page):**
- Email: cisclub@diu.edu.bd
- Phone: 01889-822468
- Phone: +880 1639-507665
- Facebook: https://www.facebook.com/diucisclub
- DIU StudentsHub: https://studentshub.daffodilvarsity.edu.bd/club/57/home
- Instagram / LinkedIn: not set up yet (the friend's site links to `#`)

---

## 12. People

### Faculty / advisor panel
| Name | Role |
|---|---|
| Shahriar Ahmed Israfil | Convener |
| Tamanna Akter | Co-Convener |
| Md. Sarwar Hossain Mollah | Advisor; Head, Dept. of CIS (Associate Professor) |
| Md. Mehedi Hasan | Advisor (spelled "Hasan" and "Hassan" in different posts; confirm) |

Other faculty mentioned: Ms. Sonia Nasrin (Lecturer, CIS; organized Hack The Future), Syed Tangim Pasha.

### Current Executive Committee (3rd committee, formed late 2025 / Jan 2026)
From birthday and achievement posts. **Incomplete; get the full list from the club.**

| Name | Role |
|---|---|
| Mabia Akonda Jemi | President |
| Md. Ariful Haque Piash | Vice President |
| Shinthiah Islam Ritu | Vice President |
| Delower Hussain | Vice President |
| A. F. M. Shah Arafin Atiq | General Secretary |
| Shumaiya Jaman Shimu | Joint Secretary |
| Samiul Haque Ann Nahian | Joint Secretary |
| Md. Samiul Islam | Joint Secretary |
| Jobaied Chowdhury Akash | Organizing Secretary |
| MD. Mahid Alam Marin | Deputy Organizing Secretary |
| Nusrat Jahan Jitu | Deputy Organizing Secretary |
| Indrojit Sarkar Pallab | Deputy Organizing Secretary |
| Jannatul Ferdous Bony | Secretary of Public Relations |
| Puspita Halder Isha | Deputy Secretary of Public Relations |
| MD. Shehabaul Alam | Deputy Secretary of Public Relations |
| MD. Jakaria Hossin Fahim | Press Secretary |
| T.M. Samin Ur Rahman Srabon | Design Secretary |
| Nafisa Tabassum Nusrat | Deputy Secretary of Design |
| Md. Mushfiqul Islam Ruhit | Media Secretary |
| Rayhan Parvaz | Deputy Media Secretary |
| Md. Sajjad Hossain Shovon | Sports Secretary |
| MD. Fuyad Hasan Fahim | Deputy Sports Secretary |
| Md. Abdul Ahad Pranto | Deputy Cultural Secretary |
| Md. Tanvir Hannan Anik | Executive Member |
| Fayek Ahanaf | Executive Member |
| Raihan Chowdhury Nibir | Executive Member |

Committee photos: the birthday posts include designed cards with each person's photo, but those are graphics, not portraits. Use clean initials avatars until real portraits are uploaded through the admin.

### Past committees
- **1st Executive Committee (2023–2024):** President Nishat Anjum Bristy. Vice Presidents Abdullah Al Noman and Tofayel Ahmed. Core members Kazi Sakib and Jannatul Hafsa Mim (post 188).
- **2nd Executive Committee (Oct 2024 – late 2025):** formed by election after the convener dissolved the 1st committee (posts 159, 160). The list is only in the announcement images (posts 140, 148). Farewell in late 2025 (post 086).
- **3rd Executive Committee (2026):** current, above.

**Privacy:** don't publish birthdays, student IDs (StudentsHub shows them), or personal phone/bKash numbers from posts.

---

## 13. Events inventory

Categories: **AI & Tech**, **Workshops & Seminars**, **Competitions & Wins**, **Partnerships**, **Sports**, **Culture & Festivals**, **Community & Orientation**.
"Posts" refers to post IDs in `content/facebook-posts.md`. Photos are `content/photos/post-<id>-*.jpg`. Dates come from post text. Where a post gave no date, the approximate date is in brackets.

### Upcoming / happening now (as of 14 Nov 2026)
| Event | Date | Venue | Category | Posts |
|---|---|---|---|---|
| International AI Builders Congress 2026: club invites members. Tracks "Idea to Unicorn" (3–5 member teams) and "Zero to Launch" (1-hour solo build). Registration free. | 26 Dec 2026 | DIU Ashulia campus | AI & Tech | 007 |
| FastRoboX 1.0: National Robotics Competition 2026 (club partner, 250K+ BDT prize pool) | 13–14 Nov 2026 | BUBT Permanent Campus, Mirpur-2 | Partnerships | 008 |

### 2026
| Event | Date | Venue | Category | Posts |
|---|---|---|---|---|
| Bangladesh AI Business Summit 2026: two member projects in national Top 20: **EON** (offline AI business assistant, Bangla/English/Banglish) and **Kupi (কুপি)** (AI learning platform, Team ImpactX Lab) | [Nov 2026] | National | Competitions & Wins | 000, 001 |
| CIS Premier League 2026 (cricket), by Dept. of CIS & DIU CIS Club | 10–12 Nov 2026 | Central Field, DIU | Sports | 006 |
| DIU Club Cup 2026 (football): beat DIU EEE Club 2–0, then DIU E-Business Club with a clean sheet | [Oct 2026] | DIU | Sports | 009, 010, 011 |
| World Robot Games 2026, Bangladesh National Qualifier: **Silver (2nd)**, Programmable Line Robot, Senior. Fayek Ahanaf, Nafisa Tabassum Nusrat, Shakila Akter, Md. Tawfiqur Rahman Srijon. Qualified for the international round in Japan (Nov 2026). | 25 Sep 2026 | International Hope School Dhaka, Uttara | Competitions & Wins | 013 |
| Welcome for CIS Batch 26 | 24 Sep 2026, 10 AM–1 PM | International Conference Hall, DSC | Community & Orientation | 017 |
| Club Enrollment Campaign Fall 2026 | 21–23 Sep 2026 | Booth 24, Student Lounge, Knowledge Tower | Community & Orientation | 016, 019 |
| DIU Central Orientation Fall 2026 (club stall 37) | 8 Sep 2026 | Shadhinota Shommelon Kendro, DSC | Community & Orientation | 023, 024 |
| Robo Camp 2026: **Line Follower Robot Champions** (Silicon Rookies / Falcon Bots) + Special Mention for Smart Home Automation System | [Aug 2026] | — | Competitions & Wins | 025 |
| **AI Project Competition 2026** (flagship). Organized by Dept. of CIS with DIU CIS Club. Grand prize ৳5 lakh. Proposals due 20 Apr 2026. Attended by the Adviser to the Ministry of Posts, Telecommunications and IT. | [mid 2026] | DIU | AI & Tech | 047, 033, 028 |
| Dean's List: Raihan Chowdhury Nibir (Fall 2025 & Spring 2026) and other CIS students | [2026] | — | Competitions & Wins | 022 |
| AI BuildFest 2026: **Champion, HealthTech** with ARBOR (Team Duoguard: Nafisa Tabassum Nusrat, Samara Habib, Sajid Hossain) | [Jun 2026] | — | Competitions & Wins | 036 |
| Green Genesis 2026: Official Club Partner (Youth for a Green Earth + BRAC University Outreach) | [2026] | — | Partnerships | 032 |
| Inauguration of Dewan Bari–Kakabo–Dattapara–DSC Road (club attended) | [2026] | Ashulia | Community & Orientation | 039 |
| DIU Central Orientation Summer 2026 | 11 May 2026, 9 AM | Shadhinota Shommelon Kendro, DSC | Community & Orientation | 042, 043 |
| Club Enrollment Campaign Spring 2026 | 7–8 Apr 2026 | Knowledge Tower, AB4 | Community & Orientation | 049, 050 |
| Meet the Alumni followed by Iftar Party 2026 (guest: Prof. Dr. Md. Fokhray Hossain, Dean FSIT) | [Mar 2026] | DSC | Community & Orientation | 055, 057 |
| Hult Prize at DIU: Official Club Partner | [Feb 2026] | DIU | Partnerships | 058, 063 |
| **হিম উৎসব ২০২৬ (Him Utsob 2026)**: winter cultural festival with pitha stalls, music and dance | 1 Feb 2026 | Bonomaya | Culture & Festivals | 061, 064–068 |
| DIU Central Orientation Spring 2026 (Booth 5) | 8 Jan 2026 | Shadhinota Shommelon Kendro, DSC | Community & Orientation | 072 |
| First meeting of the 3rd committee | [Jan 2026] | — | Community & Orientation | 071 |

### 2025
| Event | Date | Venue | Category | Posts |
|---|---|---|---|---|
| National Language Fest 2025: Club Partner (BAU Language Club). DIU students attended. | 5–6 Dec 2025 | Bangladesh Agricultural University, Mymensingh | Partnerships | 076, 080, 082 |
| **AI Fest 2025** (flagship). Dept. of CIS. Programming Contest (freshers), **PromptX** prompt-engineering contest and Project Showcase (seniors). Registration closed 25 Nov 2025. | [Dec 2025] | DIU | AI & Tech | 083, 081, 077 |
| DIU Job Utsob 2025: club volunteers (150+ companies) | 29–30 Nov 2025 | Daffodil Smart City | Community & Orientation | 078 |
| Farewell to the 2nd Executive Committee | [Nov 2025] | Online + DSC | Community & Orientation | 086 |
| Club Enrollment Campaign Fall 2025 | 18–19 Oct 2025 | DSC | Community & Orientation | 087 |
| CIS Fresher Orientation Fall 2025 + central orientation booth | 24 Sep 2025 | DSC | Community & Orientation | 089–093 |
| CIS Premier League 2025: final Tri-Batch Titans (15/16) vs One Seven (17) | 21 Jun – 27 Jul 2025 | Central Field, DIU | Sports | 094–103 |
| Closing & Recognition Giving Ceremony, Summer 2025 | [Jun 2025] | DIU | Community & Orientation | 106 |
| Club Enrollment Campaign Summer 2025: **3rd among all departmental clubs** | [May 2025] | DIU | Competitions & Wins | 107, 108 |
| CIS Orientation Summer 2025 | 20 May 2025 | International Conference Hall, Knowledge Tower | Community & Orientation | 109, 110 |
| CIS Departmental Tour 2025: Rangamati & Cox's Bazar (3 days, 4 nights) | from 1 May 2025 | Rangamati, Cox's Bazar | Culture & Festivals | 112 |
| Meet the Alumni followed by Iftar Party 2025 | 15 Mar 2025 | DSC | Community & Orientation | 115, 116, 117 |
| CIS Futsal Tournament 2025: champions "Elite of CIS" | [Feb 2025] | DIU | Sports | 119–122 |
| Member recruitment at DIU Orientation Spring 2025 + planning meeting | [Jan 2025] | DSC | Community & Orientation | 123, 126, 127 |
| DIU 23rd Foundation Day | [Jan 2025] | DSC | Culture & Festivals | 124, 125 |

### 2024
| Event | Date | Venue | Category | Posts |
|---|---|---|---|---|
| 4th DIU Data Science Summit 2024 ("AI in Education"): partner. Data hackathon, workshop, poster, project competition, **PromptCraft Challenge**. | 11 Dec 2024 | DIU | AI & Tech | 137 |
| **হিম উৎসব ১৪৩১ (Him Utsob 1431)**: winter cultural festival | 2 Dec 2024, 10 AM | Bonomaya 1 | Culture & Festivals | 129, 134, 135, 136 |
| Seminar: Career & Higher Study in the USA, with Md Moin Kabir (Graduate Research Assistant, Auburn University at Montgomery) | 21 Nov 2024, 8 PM | Online (Google Meet) | Workshops & Seminars | 139, 145, 138 |
| Session: Cyber Security & Cyber Security Leadership, Myth vs Reality, with Dr. Monjur Ahmed | 7 Nov 2024, 11 AM | Online (Google Meet) | Workshops & Seminars | 149 |
| Programming session: "You Can Start From Anywhere", led by Motiullah Sajit | 3 Nov 2024, 2:45–4 PM | Knowledge Tower, Room 702 | Workshops & Seminars | 152, 147 |
| 2nd Executive Committee formed (election, first meeting) | [Oct 2024] | DIU | Community & Orientation | 159, 160, 154, 140, 148 |
| **FunWithCode: C Programming Bootcamp** (2 days, for freshers). Guest: C M Khaled Saifullah, Software Engineer at Microsoft. Plus a Fun & Games day at Bonomaya-2. | 5–6 Oct 2024, 9 AM | Knowledge Tower (AB-4), Room 615 | Workshops & Seminars | 158, 157, 155, 153, 146, 151, 141 |
| CIS 20th batch orientation | 4 Sep 2024 | DIU | Community & Orientation | 161 |
| Heart for Humanity 2024: flood relief fundraising | 27 Aug 2024 | DIU | Community & Orientation | 162, 163 |
| **Hack The Future**: intro to competitive programming (ICPC, NCPC). Welcome by Md. Sarwar Hossain Mollah. Speaker: Saiful Islam (Asst. Prof., CSE). Organized by Ms. Sonia Nasrin. Limited to 50 seats. | 16 Mar 2024, 9 AM | Knowledge Tower, Room 604 | Workshops & Seminars | 172, 171 |
| Seminar: Careers & Higher Study in the USA, with MoonMoon Khanam (Auburn University at Montgomery) | 9 Mar 2024, 9 PM | Online | Workshops & Seminars | 176 |
| **চড়ুইভাতি ২০২৪ (Choruibhati, picnic)** + welcome for new members | 6 Mar 2024, 9 AM | DSC | Culture & Festivals | 177, 175, 174 |
| International Mother Language Day: prabhat feri and wreath at the DSC Shaheed Minar | 21 Feb 2024 | DSC Shaheed Minar | Culture & Festivals | 178 |
| Saint Martin Tour 2024 | 14–17 Feb 2024 | Saint Martin's Island | Culture & Festivals | 182 |
| CIS Premier League 2024: final | 5 Feb 2024, 12:30 PM | Central Ground, DIU | Sports | 181 |
| DIU 22nd Foundation Day: department decoration and rally | [Jan 2024] | DSC | Culture & Festivals | 185, 186, 187 |

### 2023
| Event | Date | Venue | Category | Posts |
|---|---|---|---|---|
| Daffodil AI Celebration 2023 (Dept. of CIS) | [Dec 2023] | DIU | AI & Tech | 191, 192, 193 |
| **Club Inauguration.** Chief Guest Prof. Dr. Syed Akhter Hossain, Special Guest Prof. Dr. Syed Mizanur Rahman, with Md. Sarwar Hossain Mollah. | 22 Dec 2023, 2:30 PM | Bonomaya, DSC | Community & Orientation | 197, 198, 194 |
| First Regular General Meeting | 26 Nov 2023 | DIU | Community & Orientation | 200 |

### Not events (skip or use selectively)
- Birthday wishes (many posts): use only to confirm committee roles. Don't publish birthdays.
- Holiday greetings (Eid, New Year, Victory Day, Independence Day, Language Day, Pohela Boishakh, May Day): skip, or use one or two in a "Culture" note.
- Statements on campus violence / national events (posts 084, 164) and a condolence post (184): leave off the website.
- Third-party payment details in posts (bKash/Nagad/bank numbers, e.g. posts 080, 082, 163, 182): never copy to the site.
- Generic DIU news shares (THE Impact Ranking, football final, foundation anniversary): optional "Campus" mentions at most.

### Achievements (for the Home "Recent wins" strip)
1. Bangladesh AI Business Summit 2026: EON and Kupi in the national Top 20 (posts 000, 001)
2. World Robot Games 2026 BD Qualifier: Silver; qualified for Japan (013)
3. Robo Camp 2026: Line Follower Robot Champions + Special Mention (025)
4. AI BuildFest 2026: Champion, HealthTech, with ARBOR (036)
5. DIU Club Enrollment Campaign Summer 2025: 3rd among departmental clubs (107)
6. Dean's List awards for members (022)

### Partners (for a logos/partners strip, once logos are collected)
Hult Prize at DIU, Green Genesis 2026 (Youth for a Green Earth / BRAC University), BAU Language Club (National Language Fest 2025), FastRoboX 1.0, 4th DIU Data Science Summit.

---

## 14. Seed ideas for the Resources page
Not from Facebook. Suggested starter list, all free (check links before publishing):
- Prompt engineering: promptingguide.ai, Anthropic's prompt engineering docs, OpenAI's prompt engineering guide
- Machine learning: Google's Machine Learning Crash Course, Kaggle Learn, fast.ai Practical Deep Learning, Hugging Face courses
- Foundations: CS50's Introduction to AI with Python, Andrej Karpathy's "Neural Networks: Zero to Hero"
- Programming: material from the club's C Programming Bootcamp and "You Can Start From Anywhere" session (ask the organizers for slides)
- Competitive programming: material from Hack The Future (ICPC/NCPC intro)
