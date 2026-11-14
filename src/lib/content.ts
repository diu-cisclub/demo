/**
 * Content queries shared by pages. Pages ask for "upcoming events" or
 * "the current committee"; the sorting and filtering rules live here once.
 */
import { getCollection, getEntry, type CollectionEntry, type CollectionKey } from 'astro:content';
import { today, yearOf } from './dates';

export type EventEntry = CollectionEntry<'events'>;
type SettingsName = Extract<CollectionKey, 'site' | 'home' | 'about' | 'join' | 'contact'>;

/** Load one settings file (src/content/settings/<name>.yaml). */
export async function getSettings<N extends SettingsName>(name: N): Promise<CollectionEntry<N>['data']> {
  const entry = await getEntry(name, name);
  if (!entry) throw new Error(`Missing settings file: src/content/settings/${name}.yaml`);
  return entry.data as CollectionEntry<N>['data'];
}

const endOf = (e: EventEntry) => e.data.endDate ?? e.data.date;

/** All events, newest first. */
export async function getEvents(): Promise<EventEntry[]> {
  const events = await getCollection('events');
  return events.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/** Splits events into upcoming (soonest first, including ones running today) and past (newest first). */
export async function getEventTimeline() {
  const now = today().getTime();
  const all = await getEvents();
  const upcoming = all.filter((e) => !e.data.approximate && endOf(e).getTime() >= now).reverse();
  const past = all.filter((e) => !upcoming.includes(e));
  return { upcoming, past, all };
}

/** True when an event is running today. */
export const isHappeningNow = (e: EventEntry): boolean => {
  const now = today().getTime();
  return !e.data.approximate && e.data.date.getTime() <= now && endOf(e).getTime() >= now;
};

/** Events with a `result` are the club's wins. */
export async function getWins(): Promise<EventEntry[]> {
  return (await getEvents()).filter((e) => e.data.result);
}

export async function getCommittees() {
  const all = (await getCollection('committees')).sort((a, b) => b.data.order - a.data.order);
  const advisors = all.find((c) => c.data.kind === 'advisors');
  const executive = all.filter((c) => c.data.kind === 'executive');
  return { advisors, current: executive[0], past: executive.slice(1) };
}

export async function getResources() {
  const all = (await getCollection('resources')).sort((a, b) => a.data.order - b.data.order);
  // Group by topic, keeping topics in the order they first appear.
  const groups = new Map<string, typeof all>();
  for (const r of all) groups.set(r.data.topic, [...(groups.get(r.data.topic) ?? []), r]);
  return [...groups].map(([topic, items]) => ({ topic, items }));
}

export const eventUrl = (e: EventEntry) => `/events/${e.id}/`;

/** Group past events by year, newest year first. */
export function groupByYear(events: EventEntry[]) {
  const years = new Map<number, EventEntry[]>();
  for (const e of events) {
    const y = yearOf(e.data.date);
    years.set(y, [...(years.get(y) ?? []), e]);
  }
  return [...years].sort(([a], [b]) => b - a);
}

/** "MA" from "Mabia Akonda Jemi", skipping honorifics like "Md." */
export function initials(name: string): string {
  const words = name
    .replace(/\b(md|mr|ms|mrs|dr|prof)\.?\s/gi, '')
    .split(/[\s.]+/)
    .filter((w) => /^\p{L}/u.test(w));
  return ((words[0]?.[0] ?? '') + (words.length > 1 ? (words.at(-1)?.[0] ?? '') : '')).toUpperCase();
}
