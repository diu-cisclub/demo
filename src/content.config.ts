/**
 * Every collection the site reads, with its schema.
 * The CMS config in public/admin/config.yml mirrors these fields: if you add
 * or rename a field here, update it there too.
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

export const EVENT_CATEGORIES = [
  'AI & Tech',
  'Workshops & Seminars',
  'Competitions & Wins',
  'Partnerships',
  'Sports',
  'Culture & Festivals',
  'Community & Orientation',
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

/** Links must be https: (never javascript:, data: or plain http). */
const httpsUrl = z.url({ protocol: /^https$/ });

/** Short, URL-safe ids (payment methods, puzzle options…). */
const slug = z.string().regex(/^[a-z0-9-]{1,32}$/, 'Use lowercase letters, digits and dashes only');

const events = defineCollection({
  // One folder per event: src/content/events/<slug>/index.md + its photos.
  loader: glob({
    base: './src/content/events',
    pattern: '*/index.md',
    generateId: ({ entry }) => entry.split('/')[0]!,
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      titleBn: z.string().optional(),
      date: z.coerce.date(),
      endDate: z.coerce.date().optional(),
      /** True when only the month is known; dates then show as "Dec 2025". */
      approximate: z.boolean().default(false),
      time: z.string().optional(),
      venue: z.string().optional(),
      category: z.enum(EVENT_CATEGORIES),
      summary: z.string().max(260),
      /** Set this on a win; it then appears in "Recent wins". */
      result: z.string().optional(),
      featured: z.boolean().default(false),
      registrationUrl: httpsUrl.optional(),
      photos: z.array(image()).default([]),
    }),
});

const committees = defineCollection({
  loader: glob({ base: './src/content/committees', pattern: '*.yaml' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      term: z.string(),
      /** Higher numbers are newer; the highest executive committee is "current". */
      order: z.number().int(),
      kind: z.enum(['advisors', 'executive']).default('executive'),
      summary: z.string().optional(),
      members: z
        .array(z.object({ name: z.string(), role: z.string(), photo: image().optional() }))
        .default([]),
    }),
});

const resources = defineCollection({
  loader: glob({ base: './src/content/resources', pattern: '*.yaml' }),
  schema: z.object({
    title: z.string(),
    url: httpsUrl,
    topic: z.string(),
    description: z.string(),
    order: z.number().int().default(100),
  }),
});

const puzzles = defineCollection({
  loader: glob({ base: './src/content/puzzles', pattern: '*.yaml' }),
  schema: z.object({
    title: z.string(),
    question: z.string(),
    options: z.array(z.object({ id: slug, label: z.string() })).min(2),
    /** Id of the correct option. Hashed at build time, so it never reaches the page as text. */
    answer: slug,
    explanation: z.string(),
    order: z.number().int().default(1),
  }),
});

// ── Single-file settings ───────────────────────────────────────────────────
const settingsFile = <S extends z.ZodType>(name: string, schema: S) =>
  defineCollection({ loader: glob({ base: './src/content/settings', pattern: `${name}.yaml` }), schema });

const link = z.object({ label: z.string(), url: httpsUrl });

const site = settingsFile(
  'site',
  z.object({
    name: z.string(),
    fullName: z.string(),
    motto: z.string(),
    description: z.string().max(200),
    founded: z.coerce.date(),
    followers: z.string(),
    email: z.email(),
    phones: z.array(z.string()).default([]),
    address: z.string(),
    mapUrl: httpsUrl,
    socials: z.array(link).default([]),
    /**
     * Public half of the inbox encryption key (JWK JSON). Join requests and
     * messages are encrypted with it in the visitor's browser. Generate it at
     * /admin/inbox → "Encryption key".
     */
    inboxPublicKey: z.string().default(''),
  }),
);

const home = settingsFile(
  'home',
  z.object({
    heroTitle: z.string(),
    heroLead: z.string(),
    networkCaption: z.string(),
    aboutBlurb: z.string(),
    joinTitle: z.string(),
    joinText: z.string(),
  }),
);

const about = settingsFile(
  'about',
  z.object({
    intro: z.string(),
    mission: z.string(),
    timeline: z.array(z.object({ date: z.coerce.string(), text: z.string() })),
  }),
);

const paymentMethod = z.object({
  id: slug,
  name: z.string(),
  nameBn: z.string().optional(),
  kind: z.enum(['mobile', 'bank', 'cash']),
  /** Leave on to list the method. A method only accepts payments once `details` is filled in. */
  enabled: z.boolean().default(true),
  /** Account / wallet number, bank details, or for cash, where to pay. Empty = not set up yet. */
  details: z.string().default(''),
  accountName: z.string().default(''),
  /** e.g. "Send Money (personal)", "Payment (merchant)". */
  accountType: z.string().default(''),
  instructions: z.string().default(''),
});
export type PaymentMethod = z.infer<typeof paymentMethod>;

const join = settingsFile(
  'join',
  z.object({
    intro: z.string(),
    fee: z.number().nonnegative(),
    feeNote: z.string(),
    benefits: z.array(z.string()),
    interests: z.array(z.string()),
    paymentMethods: z.array(paymentMethod),
    /** Shown when the chosen method has no account set up yet. */
    unregisteredNotice: z.string(),
    successPaid: z.string(),
    successPending: z.string(),
  }),
);

const contact = settingsFile(
  'contact',
  z.object({
    intro: z.string(),
    topics: z.array(z.string()).min(1),
    faq: z.array(z.object({ question: z.string(), answer: z.string() })),
  }),
);

export const collections = { events, committees, resources, puzzles, site, home, about, join, contact };
