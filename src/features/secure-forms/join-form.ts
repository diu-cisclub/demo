/** Client controller for the membership form (JoinForm.astro). */
import { checked, isBot, prepare, text, validate, withBusy } from './form-kit';
import { submit, type JoinStatus } from './submit';

export async function mountJoinForm(root: HTMLElement): Promise<void> {
  const form = root.querySelector<HTMLFormElement>('[data-join-form]')!;
  const errorBox = root.querySelector<HTMLElement>('[data-error]')!;
  errorBox.tabIndex = -1;
  const key = await prepare(form, root.querySelector('[data-closed]')!);
  if (!key) return;

  const selected = () => form.querySelector<HTMLInputElement>('input[name=paymentMethod]:checked');

  // Show the panel for the chosen method: account details, or the "not set up yet" notice.
  form.addEventListener('change', (e) => {
    if ((e.target as HTMLInputElement).name !== 'paymentMethod') return;
    const id = selected()?.value;
    form.querySelectorAll<HTMLElement>('[data-panel-for]').forEach((p) => (p.hidden = p.dataset.panelFor !== id));
  });
  form.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const switchTo = target.closest<HTMLElement>('[data-switch-to]')?.dataset.switchTo;
    if (switchTo) {
      const radio = form.querySelector<HTMLInputElement>(`input[name=paymentMethod][value="${CSS.escape(switchTo)}"]`)!;
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      radio.focus();
    }
    const copy = target.closest<HTMLButtonElement>('[data-copy]');
    if (copy) {
      await navigator.clipboard?.writeText(copy.dataset.copy ?? '');
      copy.textContent = 'Copied';
      setTimeout(() => (copy.textContent = 'Copy number'), 1600);
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate(form)) return;
    const method = selected()!;
    const registered = method.dataset.registered === 'true';
    const panel = form.querySelector<HTMLElement>(`[data-panel-for="${CSS.escape(method.value)}"]`);
    const trxId = panel?.querySelector<HTMLInputElement>('[data-trx]')?.value.trim() ?? '';
    const paidFrom = panel?.querySelector<HTMLInputElement>('[data-paid-from]')?.value.trim() ?? '';
    // Only a registered online method with a transaction ID can be verified; everything else waits for payment.
    const status: JoinStatus = registered && trxId ? 'verify_payment' : 'awaiting_payment';
    const methodName = method.closest('label')?.querySelector('.method-name')?.firstChild?.textContent?.trim() ?? method.value;

    const ok = isBot(form)
      ? true // Pretend success so bots learn nothing.
      : await withBusy(form, errorBox, () =>
          submit(
            {
              kind: 'join',
              status,
              paymentMethod: method.value,
              puzzleSolved: text(form, 'puzzleSolved') === 'true',
              payload: {
                name: text(form, 'name'),
                studentId: text(form, 'studentId'),
                department: text(form, 'department'),
                batch: text(form, 'batch'),
                email: text(form, 'email'),
                phone: text(form, 'phone'),
                interests: checked(form, 'interests'),
                note: text(form, 'note'),
                payment: { method: method.value, methodName, registered, trxId, paidFrom },
              },
            },
            key,
          ),
        );
    if (!ok) return;

    const result = root.querySelector<HTMLElement>('[data-result]')!;
    const messages = root.querySelector<HTMLElement>('[data-messages]')!.dataset;
    result.querySelector('[data-result-text]')!.textContent = status === 'verify_payment' ? messages.paid! : messages.pending!;
    result.querySelector('[data-result-extra]')!.textContent =
      status === 'verify_payment'
        ? `Payment: ${methodName}, transaction ${trxId}.`
        : registered
          ? `When you’re ready, pay with ${methodName} and send the transaction ID to the committee, or pay a club member in person.`
          : (messages.alternatives ?? '');
    form.remove();
    result.hidden = false;
    result.focus();
  });
}
