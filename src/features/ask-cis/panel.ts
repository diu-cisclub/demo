/**
 * Ask CIS panel controller. Loaded on first open (see AskCis.astro).
 * Quick answers: semantic search over the site. With "Wake the AI", a small
 * on-device language model writes an answer from the same passages.
 */
import { withBase } from '../../lib/url';
import { loadEmbedder } from './embedder';
import { buildIndex, retrieve, type Hit } from './retrieval';

const MIN_SCORE = 0.25; // below this, passages are unlikely to answer the question

export function mountAskCis(root: HTMLElement) {
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const panel = $('[data-ask-panel]');
  const launcher = $<HTMLButtonElement>('[data-ask-open]');
  const log = $('[data-ask-log]');
  const form = $<HTMLFormElement>('[data-ask-form]');
  const input = form.querySelector('input')!;
  const progress = $('[data-ask-progress]');
  const bar = $('[data-ask-bar]');
  const progressText = $('[data-ask-progress-text]');
  const base = withBase('/');
  let mode: 'off' | 'quick' | 'ai' = 'off';

  const say = (text: string, who: 'bot' | 'you') => {
    const p = document.createElement('p');
    p.className = `msg msg--${who}`;
    p.textContent = text;
    log.append(p);
    log.scrollTop = log.scrollHeight;
    return p;
  };
  const setProgress = (fraction: number, text: string) => {
    bar.style.transform = `scaleX(${Math.max(0.02, Math.min(1, fraction))})`;
    progressText.textContent = text;
  };

  function toggle(show = panel.hidden) {
    panel.hidden = !show;
    launcher.setAttribute('aria-expanded', String(show));
    if (show) (form.hidden ? $<HTMLButtonElement>('[data-ask-load]') : input).focus();
    else launcher.focus();
  }
  $('[data-ask-close]').addEventListener('click', () => toggle(false));
  panel.addEventListener('keydown', (e) => e.key === 'Escape' && toggle(false));

  // ── Quick answers ───────────────────────────────────────────────────────
  $('[data-ask-load]').addEventListener('click', async () => {
    $('[data-ask-start]').hidden = true;
    progress.hidden = false;
    try {
      await loadEmbedder(base, (f) => setProgress(f * 0.8, `Downloading model… ${Math.round(f * 100)}%`));
      setProgress(0.85, 'Reading the website…');
      await buildIndex(base, (f) => setProgress(0.85 + f * 0.15, 'Reading the website…'));
      mode = 'quick';
      progress.hidden = true;
      form.hidden = false;
      $('[data-ask-wake-row]').hidden = false;
      input.focus();
    } catch {
      progress.hidden = true;
      $('[data-ask-start]').hidden = false;
      say('The model could not be downloaded. Check your connection and try again.', 'bot');
    }
  });

  function showHits(hits: Hit[]) {
    const ul = document.createElement('ul');
    ul.className = 'hits';
    for (const { doc } of hits) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = withBase(doc.url);
      a.textContent = doc.title;
      const p = document.createElement('p');
      p.textContent = doc.text;
      li.append(a, p);
      ul.append(li);
    }
    log.append(ul);
    log.scrollTop = log.scrollHeight;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q || mode === 'off') return;
    input.value = '';
    say(q, 'you');
    const hits = (await retrieve(q, 4)).filter((h) => h.score >= MIN_SCORE);
    if (!hits.length) {
      say('I couldn’t find that on the website. Try other words, or ask the committee through the Contact page.', 'bot');
      return;
    }
    if (mode === 'quick') {
      say('These parts of the site look most relevant:', 'bot');
      showHits(hits.slice(0, 3));
      return;
    }
    const { answer } = await import('./llm');
    const bubble = say('…', 'bot');
    bubble.textContent = '';
    for await (const token of answer(q, hits)) {
      bubble.textContent += token;
      log.scrollTop = log.scrollHeight;
    }
    say('Sources:', 'bot');
    showHits(hits);
  });

  // ── Full AI (WebGPU) ────────────────────────────────────────────────────
  $('[data-ask-wake]').addEventListener('click', async () => {
    const { hasWebGPU, loadLLM } = await import('./llm');
    if (!(await hasWebGPU())) {
      $('[data-ask-wake-note]').textContent = 'This browser has no WebGPU, so quick answers it is. They work everywhere.';
      return;
    }
    if (!confirm('Download the on-device language model (about 300 MB)? It is cached for next time.')) return;
    $('[data-ask-wake-row]').hidden = true;
    progress.hidden = false;
    try {
      await loadLLM((f, text) => setProgress(f, text.replace(/\[[^\]]*]\s*/g, '').slice(0, 80)));
      mode = 'ai';
      say('AI is awake. Answers are written by a small model on your device from this website’s content, so double-check important details.', 'bot');
    } catch {
      $('[data-ask-wake-row]').hidden = false;
      say('The AI model could not start on this device. Quick answers still work.', 'bot');
    } finally {
      progress.hidden = true;
      input.focus();
    }
  });

  return { toggle };
}
