/**
 * Ready-made answers for Ask CIS, written at build time from the site's own
 * content, so common questions get a direct, correct sentence instantly on the
 * visitor's device. Served as /ask-index.json; matched in
 * src/features/ask-cis/matcher.ts. Anything without a good match goes to the
 * cloud fallback (supabase/functions/ask).
 *
 * Each answer has `q` (how people would ask it) and `keys` (extra words that
 * should lead to it). Add a new kind of question by adding a card here.
 */
import { getCollection } from 'astro:content';
import { eventUrl, getCommittees, getEventTimeline, getSettings, getWins } from './content';
import { formatEventDate } from './dates';
import { isRegistered } from '../features/secure-forms/payments';

export interface AnswerCard {
  id: string;
  q: string;
  keys: string;
  a: string;
  url?: string;
  link?: string;
}

const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

export async function buildAnswers(): Promise<AnswerCard[]> {
  const [site, join, contact, about, { upcoming, all }, wins, { advisors, current, past }, resources] = await Promise.all([
    getSettings('site'),
    getSettings('join'),
    getSettings('contact'),
    getSettings('about'),
    getEventTimeline(),
    getWins(),
    getCommittees(),
    getCollection('resources'),
  ]);
  const cards: AnswerCard[] = [];
  const add = (c: AnswerCard) => cards.push(c);

  // ── Joining and paying ──────────────────────────────────────────────────
  const methods = join.paymentMethods.filter((m) => m.enabled);
  const payable = methods.filter(isRegistered).map((m) => m.name);
  const payLine = payable.length
    ? `You can pay online with ${list(payable)}, or pay a club member in person.`
    : 'Online payment numbers are still being set up, so for now pay a club member in person.';
  add({
    id: 'fee',
    q: 'How much is the membership fee? What does it cost to join?',
    keys: 'fee cost price charge taka tk money amount membership subscription',
    a: `Membership is ৳${join.fee}, paid once. ${payLine}`,
    url: '/join/',
    link: 'Join page',
  });
  add({
    id: 'payment',
    q: 'How can I pay the fee? Which payment methods are accepted?',
    keys: `pay payment method account number wallet send money transaction trxid ${methods.map((m) => `${m.name} ${m.nameBn ?? ''}`).join(' ')}`,
    a: `The join form lists ${list(methods.map((m) => m.name))}. ${payable.length ? `${list(payable)} ${payable.length === 1 ? 'is' : 'are'} ready to receive payments now; enter the transaction ID on the form.` : 'Their account numbers are still being added, so for now send your request and pay a club member in person; it stays pending until then.'}`,
    url: '/join/',
    link: 'Join page',
  });
  add({
    id: 'join',
    q: 'How do I join the club? How can I become a member or register?',
    keys: 'join become member membership register registration apply application signup sign up enroll form process steps procedure',
    a: `Fill in the form on the Join page (it takes about two minutes) and pay the ৳${join.fee} fee. The committee then checks it and confirms your membership.`,
    url: '/join/',
    link: 'Join page',
  });
  add({
    id: 'benefits',
    q: 'What do members get? What are the benefits of joining?',
    keys: 'benefit benefits perks why join advantages get offer',
    a: `Members get: ${list(join.benefits.map((b) => b.charAt(0).toLowerCase() + b.slice(1)))}.`,
    url: '/join/',
    link: 'Join page',
  });

  // ── Events ──────────────────────────────────────────────────────────────
  const line = (e: (typeof all)[number]) => `${e.data.title} on ${formatEventDate(e.data)}${e.data.venue ? ` at ${e.data.venue}` : ''}`;
  add({
    id: 'next-event',
    q: 'What is the next event? What events are coming up soon?',
    keys: 'next upcoming soon future coming event events programme program schedule calendar',
    a: upcoming.length
      ? `Coming up: ${list(upcoming.slice(0, 3).map(line))}.`
      : 'No upcoming events are announced right now. New events appear on the Events page and the club’s Facebook page.',
    url: upcoming[0] ? eventUrl(upcoming[0]) : '/events/',
    link: upcoming[0] ? 'Event details' : 'Events page',
  });
  add({
    id: 'event-count',
    q: 'How many events has the club organised? What kind of events does the club do?',
    keys: 'how many events organised organized activities kinds types do',
    a: `The club has run or joined ${all.length} events since November 2023: AI contests and project competitions, programming bootcamps, seminars, cricket and futsal tournaments, cultural festivals like Him Utsob, and orientation programmes.`,
    url: '/events/',
    link: 'Events page',
  });
  for (const e of all) {
    const d = e.data;
    const isUpcoming = upcoming.includes(e);
    add({
      id: `event-${e.id}`,
      q: `When and where is ${d.title}? Tell me about ${d.title}.`,
      keys: [d.titleBn, d.category, d.venue, d.result, d.date.getFullYear()].filter(Boolean).join(' '),
      a: `${d.title} ${isUpcoming ? 'is' : 'was'} ${d.approximate ? 'in' : 'on'} ${formatEventDate(d)}${d.time ? `, ${d.time}` : ''}${d.venue ? ` at ${d.venue}` : ''}. ${d.summary}${d.result ? ` Result: ${d.result}.` : ''}`,
      url: eventUrl(e),
      link: 'Event page',
    });
  }
  add({
    id: 'wins',
    q: 'What has the club won? What are its achievements and awards?',
    keys: 'won win wins winner achievement achievements award awards prize champion medal result results',
    a: `Recent results: ${list(wins.slice(0, 5).map((w) => `${w.data.result} at ${w.data.title}`))}.`,
    url: '/events/',
    link: 'All events',
  });

  // ── People ──────────────────────────────────────────────────────────────
  for (const group of [advisors, current].filter((g) => g !== undefined)) {
    const byRole = new Map<string, string[]>();
    for (const m of group.data.members) byRole.set(m.role, [...(byRole.get(m.role) ?? []), m.name]);
    for (const [role, names] of byRole) {
      add({
        id: `role-${group.id}-${role}`,
        q: `Who is the ${role}?`,
        keys: `${role} ${group.data.name} committee`,
        a: `${list(names)} ${names.length > 1 ? 'are' : 'is'} ${role}${group.data.kind === 'advisors' ? ' of the club' : ` in the ${group.data.name} (${group.data.term})`}.`,
        url: '/about/#committee',
        link: 'Committee',
      });
    }
    for (const m of group.data.members) {
      add({ id: `person-${m.name}`, q: `Who is ${m.name}?`, keys: `${m.name} ${m.role}`, a: `${m.name} is ${m.role} (${group.data.name}).`, url: '/about/#committee', link: 'Committee' });
    }
  }
  if (current) {
    const top = current.data.members.slice(0, 5).map((m) => `${m.role} ${m.name}`);
    add({
      id: 'committee',
      q: 'Who runs the club? Who is on the executive committee?',
      keys: 'committee executive leaders leadership members team panel run runs organisers',
      a: `The ${current.data.name} (${current.data.term}) leads the club: ${list(top)}, and ${current.data.members.length - 5} more members.${advisors ? ` Faculty advisors: ${list(advisors.data.members.map((m) => `${m.name} (${m.role})`))}.` : ''}`,
      url: '/about/#committee',
      link: 'Full committee',
    });
  }
  for (const c of past) {
    add({
      id: `past-${c.id}`,
      q: `Who was on the ${c.data.name}? Previous committee.`,
      keys: `past previous former old ${c.data.term}`,
      a: c.data.members.length ? `${c.data.name} (${c.data.term}): ${list(c.data.members.map((m) => `${m.name} (${m.role})`))}.` : `${c.data.name} served ${c.data.term}. ${c.data.summary ?? ''}`.trim(),
      url: '/about/#committee',
      link: 'Committee',
    });
  }

  // ── The club ────────────────────────────────────────────────────────────
  add({ id: 'about', q: 'What is DIU CIS Club? What does the club do?', keys: 'about club what purpose mission goal cis computing information system', a: `${about.intro} ${about.mission}`, url: '/about/', link: 'About' });
  add({
    id: 'founded',
    q: 'When was the club founded? When did it start?',
    keys: 'founded start started began established history inauguration first meeting',
    a: 'The club held its first general meeting on 26 November 2023 and was officially inaugurated on 22 December 2023 at Bonomaya, Daffodil Smart City.',
    url: '/about/',
    link: 'Our story',
  });
  add({ id: 'motto', q: 'What is the club motto?', keys: 'motto slogan tagline', a: `The motto is “${site.motto}”`, url: '/about/', link: 'About' });
  add({
    id: 'contact',
    q: 'How do I contact the club? What is the email or phone number?',
    keys: 'contact email reach message talk',
    a: `Email ${site.email} or call ${list(site.phones)}. You can also use the form on the Contact page.`,
    url: '/contact/',
    link: 'Contact page',
  });
  add({ id: 'location', q: 'Where is the club located? Where are you?', keys: 'where location address campus place office find map', a: `The club is at ${site.address}, in the Department of Computing & Information System.`, url: '/contact/', link: 'Contact page' });
  add({ id: 'social', q: 'Is the club on Facebook or social media?', keys: 'facebook social media instagram linkedin follow page', a: `Follow the club on ${list(site.socials.map((s) => s.label))}.`, url: site.socials[0]?.url ?? '/contact/', link: site.socials[0]?.label ?? 'Contact' });

  // ── Learning ────────────────────────────────────────────────────────────
  const topics = [...new Set(resources.map((r) => r.data.topic))];
  add({
    id: 'learn',
    q: 'How do I start learning AI or programming? Where can I learn?',
    keys: 'learn learning start beginner study course courses resource resources tutorial ai ml machine learning programming',
    a: `The Resources page has free courses the committee recommends, grouped into ${list(topics.map((t) => t.toLowerCase()))}. A good start: ${list(resources.sort((a, b) => a.data.order - b.data.order).slice(0, 3).map((r) => r.data.title))}.`,
    url: '/resources/',
    link: 'Resources',
  });
  for (const t of topics) {
    const items = resources.filter((r) => r.data.topic === t).map((r) => r.data.title);
    add({ id: `topic-${t}`, q: `Where can I learn ${t}?`, keys: `${t} learn course`, a: `For ${t.toLowerCase()}: ${list(items)}.`, url: '/resources/', link: 'Resources' });
  }

  // ── FAQ and the site itself ─────────────────────────────────────────────
  contact.faq.forEach((f, i) => add({ id: `faq-${i}`, q: f.question, keys: '', a: f.answer, url: '/contact/', link: 'FAQ' }));
  add({
    id: 'privacy',
    q: 'Is my data safe? What happens to my join request details?',
    keys: 'privacy private data safe secure security encrypted information personal',
    a: 'Your form is encrypted on your device before it is sent, and only the committee can decrypt it. The site has no trackers or cookies.',
    url: '/privacy/',
    link: 'Privacy notice',
  });
  add({
    id: 'site-ai',
    q: 'How does the AI on this website work? What is the neural network on the home page?',
    keys: 'ai neural network digit drawing website site home hero model',
    a: 'The home page runs a small neural network (64→16→12→10) in your browser that reads digits you draw. This assistant answers common questions from the site’s own content instantly; unusual questions are answered by Google Gemini using the site’s pages.',
    url: '/',
    link: 'Home',
  });
  return cards;
}
