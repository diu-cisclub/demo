import type { EventCategory } from '../content.config';

/** Category → suffix of its colour token (`--cat-<key>` in tokens.css). */
const KEYS: Record<EventCategory, string> = {
  'AI & Tech': 'ai',
  'Workshops & Seminars': 'workshop',
  'Competitions & Wins': 'win',
  Partnerships: 'partner',
  Sports: 'sports',
  'Culture & Festivals': 'culture',
  'Community & Orientation': 'community',
};

export const categoryVar = (c: EventCategory): string => KEYS[c];

/** URL-safe id for filters, e.g. "competitions-wins". */
export const categorySlug = (c: string): string => c.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
