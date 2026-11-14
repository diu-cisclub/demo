/**
 * Instant, on-device answer matching (BM25 with light stemming and campus
 * synonyms). Returns the best ready-made answer and a confidence score; weak
 * matches are passed to the cloud fallback instead of guessing.
 */
import type { AnswerCard } from '../../lib/answers';

const STOP = new Set('a an the is are was were be of to in on at for and or do does did i me my you your can could would please tell about there any this that it its with from by as what'.split(' '));

/** Words people use for the same thing. Keys and values are stems. */
const SYNONYMS: Record<string, string> = {
  tk: 'taka', bdt: 'taka', '৳': 'taka', price: 'fee', cost: 'fee', charge: 'fee', money: 'fee', taka: 'fee',
  register: 'join', registration: 'join', signup: 'join', enrol: 'join', enroll: 'join', apply: 'join', member: 'join', membership: 'join',
  gs: 'general', vp: 'vice', prez: 'president', chairman: 'president', head: 'president',
  programme: 'event', program: 'event', fest: 'festival', competition: 'contest', hackathon: 'contest',
  mail: 'email', number: 'phone', call: 'phone', whatsapp: 'phone',
  upcoming: 'next', soon: 'next', future: 'next',
  learn: 'learn', study: 'learn', course: 'learn', tutorial: 'learn',
  won: 'win', winner: 'win', award: 'win', prize: 'win', champion: 'win', achievement: 'win',
};

/** Crude English stemmer: drops -s, -es, -ed, -ing(s) when at least 3 letters remain. */
const stem = (w: string) => {
  const end = w.match(/(ings?|ed|es|s)$/)?.[0];
  return end && w.length - end.length >= 3 ? w.slice(0, -end.length) : w;
};

export function tokens(text: string): string[] {
  return (text.toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}৳]+/gu) ?? [])
    .filter((t) => !STOP.has(t))
    .map((t) => SYNONYMS[t] ?? SYNONYMS[stem(t)] ?? stem(t));
}

export interface Match {
  card: AnswerCard;
  /** 0…1: share of the question's meaningful words the answer covers, weighted by rarity. */
  confidence: number;
}

export function createMatcher(cards: AnswerCard[]) {
  // Answers are short, so a word being present matters more than how often it
  // repeats. Words in the question wording get a small bonus over keywords.
  const docs = cards.map((c) => {
    const question = new Set(tokens(c.q));
    const all = new Set([...question, ...tokens(c.keys)]);
    return { question, all };
  });
  const df = new Map<string, number>();
  docs.forEach((d) => d.all.forEach((t) => df.set(t, (df.get(t) ?? 0) + 1)));
  const idf = (t: string) => Math.log(1 + (cards.length - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
  const avg = docs.reduce((s, d) => s + d.all.size, 0) / docs.length;

  return (question: string): Match | null => {
    const q = [...new Set(tokens(question))];
    if (!q.length) return null;
    let best = -1;
    let bestScore = 0;
    docs.forEach((d, i) => {
      // Mild length normalisation so long keyword lists don't win by volume.
      const norm = Math.sqrt(0.6 + (0.4 * d.all.size) / avg);
      const score = q.reduce((s, t) => s + (d.all.has(t) ? (idf(t) * (d.question.has(t) ? 1.3 : 1)) / norm : 0), 0);
      if (score > bestScore) (bestScore = score), (best = i);
    });
    if (best < 0) return null;
    // Confidence: how much of the question's (rarity-weighted) meaning was matched.
    const covered = q.filter((t) => docs[best]!.all.has(t)).reduce((s, t) => s + idf(t), 0);
    // Words the site never uses ("process", "koto") count a little against a match, not fully.
    const total = q.reduce((s, t) => s + (df.has(t) ? idf(t) : 0.35 * Math.log(cards.length)), 0);
    return { card: cards[best]!, confidence: total ? covered / total : 0 };
  };
}
