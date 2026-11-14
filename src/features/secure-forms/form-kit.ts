/** Small helpers shared by the join and contact form controllers. */
import { importPublicKey } from './envelope';
import { warmUp } from './pow';
import { backendConfigured, SubmitError } from './submit';

/** Trimmed text value of a field ('' if missing). */
export const text = (form: HTMLFormElement, name: string): string =>
  ((form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? '').trim();

/** Every checked value of a checkbox group. */
export const checked = (form: HTMLFormElement, name: string): string[] =>
  [...form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)].map((i) => i.value);

/**
 * Opens the form only when everything needed for a secure send is in place:
 * a backend and a valid committee public key. Returns the key, or null if the
 * form must stay closed (the "not open yet" notice is shown instead).
 */
export async function prepare(form: HTMLFormElement, closedNotice: HTMLElement): Promise<CryptoKey | null> {
  const key = backendConfigured && window.isSecureContext ? await importPublicKey(form.dataset.publicKey ?? '') : null;
  if (!key) {
    closedNotice.hidden = false;
    return null;
  }
  form.hidden = false;
  // Start the anti-spam proof of work as soon as someone starts filling in the form.
  form.addEventListener('focusin', warmUp, { once: true });
  return key;
}

/** Runs a send with a busy button and a visible, specific error on failure. */
export async function withBusy(form: HTMLFormElement, errorBox: HTMLElement, task: () => Promise<void>): Promise<boolean> {
  const button = form.querySelector<HTMLButtonElement>('[data-submit]')!;
  const label = button.textContent;
  errorBox.hidden = true;
  button.disabled = true;
  button.textContent = 'Encrypting and sending…';
  try {
    await task();
    return true;
  } catch (err) {
    errorBox.textContent = err instanceof SubmitError ? err.message : 'Something went wrong. Please try again.';
    errorBox.hidden = false;
    errorBox.focus();
    return false;
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

/** Bots fill hidden fields; people don't. */
export const isBot = (form: HTMLFormElement): boolean => text(form, 'website') !== '';

/** Native validation with the browser's own messages, focusing the first problem. */
export function validate(form: HTMLFormElement): boolean {
  const first = [...form.elements].find((el) => el instanceof HTMLElement && 'checkValidity' in el && !(el as HTMLInputElement).checkValidity());
  if (first) {
    (first as HTMLInputElement).reportValidity();
    return false;
  }
  return true;
}
