/**
 * Builds the passages behind ⌘K search and Ask CIS: every event, page,
 * committee, resource and FAQ, cut into passages of ~300 words with a title
 * and URL. Served as /search-index.json at build time.
 */
import { getCollection } from 'astro:content';
import { getCommittees, getEvents, getSettings, eventUrl } from './content';
import { formatEventDate } from './dates';
import { isRegistered } from '../features/secure-forms/payments';

export interface SearchDoc {
  id: string;
  title: string;
  url: string;
  section: 'Event' | 'Page' | 'People' | 'Resource' | 'Question';
  text: string;
}

/** Markdown → plain text, good enough for search. */
const plain = (md: string) =>
  md
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[#*_>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function chunk(text: string, words = 300): string[] {
  const all = text.split(' ');
  const out: string[] = [];
  for (let i = 0; i < all.length; i += words) out.push(all.slice(i, i + words).join(' '));
  return out.length ? out : [''];
}

export async function buildSearchDocs(): Promise<SearchDoc[]> {
  const [events, site, about, join, contact, { advisors, current, past }, resources] = await Promise.all([
    getEvents(),
    getSettings('site'),
    getSettings('about'),
    getSettings('join'),
    getSettings('contact'),
    getCommittees(),
    getCollection('resources'),
  ]);
  const docs: SearchDoc[] = [];

  for (const e of events) {
    const d = e.data;
    const facts = [formatEventDate(d), d.time, d.venue, d.category, d.result].filter(Boolean).join('. ');
    chunk(`${d.summary} ${facts}. ${plain(e.body ?? '')}`).forEach((text, i) =>
      docs.push({ id: `event-${e.id}-${i}`, title: d.titleBn ? `${d.title} (${d.titleBn})` : d.title, url: eventUrl(e), section: 'Event', text }),
    );
  }

  const payable = join.paymentMethods.filter(isRegistered).map((m) => m.name);
  docs.push(
    { id: 'page-about', title: 'About the club', url: '/about/', section: 'Page', text: `${site.fullName}. ${site.motto} ${about.intro} ${about.mission} Founded ${site.founded.getFullYear()}.` },
    { id: 'page-story', title: 'The story so far', url: '/about/', section: 'Page', text: about.timeline.map((t) => `${t.date}: ${t.text}`).join(' ') },
    {
      id: 'page-join',
      title: 'Join the club',
      url: '/join/',
      section: 'Page',
      text: `${join.intro} Membership fee: ৳${join.fee}, ${join.feeNote}. Members get: ${join.benefits.join('; ')}. Payment options: ${join.paymentMethods.filter((m) => m.enabled).map((m) => m.name).join(', ')}. ${payable.length ? `Available to pay online now: ${payable.join(', ')}.` : 'Online payment numbers are not set up yet; pay a club member in person.'}`,
    },
    { id: 'page-contact', title: 'Contact', url: '/contact/', section: 'Page', text: `${contact.intro} Email ${site.email}. Phone ${site.phones.join(', ')}. Address: ${site.address}.` },
    { id: 'page-gallery', title: 'Gallery', url: '/gallery/', section: 'Page', text: 'Photos from club events, contests, festivals and tournaments.' },
    { id: 'page-privacy', title: 'Privacy notice', url: '/privacy/', section: 'Page', text: 'What the club collects, how join requests are encrypted, and how to have your data deleted.' },
  );

  for (const c of [advisors, current, ...past].filter((c) => c !== undefined)) {
    const members = c.data.members.map((m) => `${m.name} (${m.role})`).join(', ');
    docs.push({ id: `people-${c.id}`, title: `${c.data.name}, ${c.data.term}`, url: '/about/#committee', section: 'People', text: `${c.data.summary ?? ''} ${members}`.trim() });
  }
  for (const r of resources) {
    docs.push({ id: `resource-${r.id}`, title: r.data.title, url: '/resources/', section: 'Resource', text: `${r.data.topic}. ${r.data.description}` });
  }
  contact.faq.forEach((f, i) => docs.push({ id: `faq-${i}`, title: f.question, url: '/contact/', section: 'Question', text: f.answer }));
  return docs;
}
