/**
 * Ask CIS panel controller (loaded on first open, see AskCis.astro).
 * 1. Ready-made answers, matched on the device: instant and private.
 * 2. Low confidence → the cloud fallback (cloud.ts), clearly labelled.
 * 3. If that is unavailable → the closest page from the site search.
 */
import type { AnswerCard } from '../../lib/answers';
import { withBase } from '../../lib/url';
import { keywordSearch, loadIndex } from '../site-search/search';
import { askCloud, cloudAvailable } from './cloud';
import { createMatcher } from './matcher';

/** Below this, a ready-made answer is more likely wrong than right. Tuned on test questions. */
const CONFIDENT = 0.55;

export function mountAskCis(root: HTMLElement) {
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const panel = $('[data-ask-panel]');
  const launcher = $<HTMLButtonElement>('[data-ask-open]');
  const log = $('[data-ask-log]');
  const form = $<HTMLFormElement>('[data-ask-form]');
  const input = form.querySelector('input')!;
  const base = withBase('/');
  const matcher = fetch(`${base}ask-index.json`)
    .then((r) => r.json() as Promise<AnswerCard[]>)
    .then(createMatcher);

  /** Appends a message; text only (answers may come from the cloud). */
  function say(text: string, who: 'bot' | 'you', extra?: { links?: { label: string; url: string }[]; note?: string }) {
    const box = document.createElement('div');
    box.className = `msg msg--${who}`;
    const p = document.createElement('p');
    p.textContent = text;
    box.append(p);
    if (extra?.links?.length) {
      const nav = document.createElement('p');
      nav.className = 'msg-links';
      for (const l of extra.links) {
        const a = document.createElement('a');
        a.href = l.url.startsWith('/') ? withBase(l.url) : l.url;
        a.textContent = l.label;
        nav.append(a);
      }
      box.append(nav);
    }
    if (extra?.note) {
      const n = document.createElement('p');
      n.className = 'msg-note';
      n.textContent = extra.note;
      box.append(n);
    }
    log.append(box);
    log.scrollTop = log.scrollHeight;
    return box;
  }

  function toggle(show = panel.hidden) {
    panel.hidden = !show;
    launcher.setAttribute('aria-expanded', String(show));
    (show ? input : launcher).focus();
  }
  $('[data-ask-close]').addEventListener('click', () => toggle(false));
  panel.addEventListener('keydown', (e) => e.key === 'Escape' && toggle(false));
  root.querySelectorAll<HTMLButtonElement>('[data-ask-suggest]').forEach((b) =>
    b.addEventListener('click', () => {
      input.value = b.textContent ?? '';
      form.requestSubmit();
    }),
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = input.value.trim().slice(0, 300);
    if (!q) return;
    input.value = '';
    say(q, 'you');

    const match = (await matcher)(q);
    if (match && match.confidence >= CONFIDENT) {
      const { a, url, link } = match.card;
      say(a, 'bot', url && link ? { links: [{ label: link, url }] } : undefined);
      return;
    }

    const thinking = say('Thinking…', 'bot');
    thinking.classList.add('is-thinking');
    try {
      if (!cloudAvailable) throw new Error('offline');
      const { answer, sources } = await askCloud(q);
      thinking.remove();
      say(answer, 'bot', { links: sources.map((s) => ({ label: s.title, url: s.url })), note: 'Answered by Google Gemini from this website’s pages.' });
    } catch {
      thinking.remove();
      // Last resort: point to the closest page.
      const [hit] = keywordSearch(await loadIndex(base), q, 1);
      if (match && match.confidence >= 0.3) say(match.card.a, 'bot', match.card.url && match.card.link ? { links: [{ label: match.card.link, url: match.card.url }] } : undefined);
      else if (hit) say('I’m not sure, but this page looks related:', 'bot', { links: [{ label: hit.title, url: hit.url }] });
      else say('I don’t know that one. The committee can help: use the Contact page.', 'bot', { links: [{ label: 'Contact', url: '/contact/' }] });
    }
  });

  return { toggle };
}
