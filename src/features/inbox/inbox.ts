/**
 * Committee inbox controller.
 *
 * Flow: password → authenticator code (the database only serves rows to
 * sessions with two-factor, `aal2`) → unlock the private key file → decrypt
 * and list requests in this tab.
 *
 * Security notes for maintainers:
 *  - Everything decrypted came from the public internet. It is only ever put
 *    into the page with textContent, never innerHTML.
 *  - The session lives in sessionStorage (gone when the tab closes) and the
 *    private key only in memory. Both are dropped after 20 idle minutes.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from 'astro:env/client';
import { open } from '../secure-forms/envelope';
import { createKeyFile, samePublicKey, unlockKeyFile } from './keys';

type Kind = 'join' | 'contact';
interface Row {
  id: string;
  created_at: string;
  kind: Kind;
  status: string;
  payment_method: string | null;
  puzzle_solved: boolean;
  ciphertext: string;
  reviewed_at: string | null;
}
type Payload = Record<string, unknown> & {
  name?: string;
  email?: string;
  payment?: { methodName?: string; trxId?: string; paidFrom?: string; registered?: boolean };
};
interface Item extends Row {
  data: Payload | null;
}

const STATUSES: Record<Kind, Record<string, string>> = {
  join: { awaiting_payment: 'Awaiting payment', verify_payment: 'Check payment', approved: 'Approved', rejected: 'Rejected' },
  contact: { unread: 'Unread', done: 'Done' },
};
const IDLE_LIMIT_MS = 20 * 60 * 1000;

/** Tiny DOM builder that can only create text, never HTML. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string | null, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
const dateFmt = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Dhaka' });
/** Formats a timestamp; anything unparseable (it may come from a forged payload) is shown as-is. */
const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
};
const str = (v: unknown) => (Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v));

/** CSV cell that spreadsheet apps will not run as a formula. */
const csvCell = (v: unknown) => {
  const s = str(v);
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

export async function mountInbox(root: HTMLElement): Promise<void> {
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const errorBox = $('[data-error]');
  const showError = (msg: string) => {
    errorBox.textContent = msg;
    errorBox.hidden = false;
    errorBox.focus();
  };
  const clearError = () => (errorBox.hidden = true);
  const step = (name: string) => root.querySelectorAll<HTMLElement>('[data-step]').forEach((s) => (s.hidden = s.dataset.step !== name));

  if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    $('[data-unconfigured]').hidden = false;
    return;
  }

  const db: SupabaseClient = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  let privateKey: CryptoKey | null = null;
  let items: Item[] = [];
  let kind: Kind = 'join';
  let current: Item | null = null;

  // ── Auth ──────────────────────────────────────────────────────────────
  async function route() {
    clearError();
    const { data: session } = await db.auth.getSession();
    $('[data-signout]').hidden = !session.session;
    if (!session.session) return step('signin');
    const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== 'aal2') return aal?.nextLevel === 'aal2' ? step('verify') : startEnroll();
    if (!privateKey) return step('unlock');
    step('list');
    await load();
  }

  async function startEnroll() {
    // Clear half-finished enrolments so they don't pile up.
    const { data: factors } = await db.auth.mfa.listFactors();
    for (const f of factors?.all ?? []) if (f.status === 'unverified') await db.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await db.auth.mfa.enroll({ factorType: 'totp', friendlyName: `CIS inbox ${new Date().toISOString().slice(0, 10)}` });
    if (error || !data) return showError(error?.message ?? 'Could not start two-step setup.');
    $<HTMLImageElement>('[data-qr]').src = data.totp.qr_code;
    $('[data-secret]').textContent = data.totp.secret;
    $('[data-enroll-form]').dataset.factorId = data.id;
    step('enroll');
  }

  async function verifyCode(factorId: string, code: string) {
    const { error } = await db.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) return showError('That code did not work. Wait for a new code and try again.');
    await route();
  }

  const formValue = (form: HTMLFormElement, name: string) => (form.elements.namedItem(name) as HTMLInputElement).value.trim();

  $<HTMLFormElement>('[data-signin-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const { error } = await db.auth.signInWithPassword({ email: formValue(form, 'email'), password: (form.elements.namedItem('password') as HTMLInputElement).value });
    // One message for every failure, so attackers can't probe which emails exist.
    if (error) return showError('Email or password is incorrect.');
    form.reset();
    await route();
  });
  $<HTMLFormElement>('[data-enroll-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    await verifyCode(form.dataset.factorId!, formValue(form, 'code'));
  });
  $<HTMLFormElement>('[data-verify-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    // Read the form before awaiting: currentTarget is null once the event has finished dispatching.
    const code = formValue(e.currentTarget as HTMLFormElement, 'code');
    const { data } = await db.auth.mfa.listFactors();
    const factor = data?.totp[0];
    if (!factor) return startEnroll();
    await verifyCode(factor.id, code);
  });

  async function signOut() {
    privateKey = null;
    items = [];
    await db.auth.signOut();
    location.reload();
  }
  $('[data-signout]').addEventListener('click', signOut);

  // Forget everything after a period of inactivity.
  let idle = window.setTimeout(signOut, IDLE_LIMIT_MS);
  for (const evt of ['pointerdown', 'keydown']) {
    window.addEventListener(evt, () => {
      clearTimeout(idle);
      idle = window.setTimeout(signOut, IDLE_LIMIT_MS);
    });
  }

  // ── Keys ──────────────────────────────────────────────────────────────
  $<HTMLFormElement>('[data-unlock-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const file = (form.elements.namedItem('file') as HTMLInputElement).files?.[0];
    if (!file || file.size > 10_000) return showError('Choose the inbox key file.');
    try {
      const unlocked = await unlockKeyFile(await file.text(), (form.elements.namedItem('passphrase') as HTMLInputElement).value);
      privateKey = unlocked.privateKey;
      $('[data-key-mismatch]').hidden = samePublicKey(unlocked.publicKey, root.dataset.siteKey ?? '');
      form.reset();
      await route();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not unlock the key.');
    }
  });

  $<HTMLFormElement>('[data-create-key-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const pass = (form.elements.namedItem('passphrase') as HTMLInputElement).value;
    if (pass !== (form.elements.namedItem('confirm') as HTMLInputElement).value) return showError('The passphrases do not match.');
    const keyFile = await createKeyFile(pass);
    const url = URL.createObjectURL(new Blob([JSON.stringify(keyFile, null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `cis-inbox-key-${keyFile.createdAt.slice(0, 10)}.json` });
    a.click();
    URL.revokeObjectURL(url);
    form.reset();
    $<HTMLTextAreaElement>('[data-new-public-key]').value = keyFile.publicKey;
    $('[data-new-key]').hidden = false;
  });
  $('[data-copy-public]').addEventListener('click', () => navigator.clipboard?.writeText($<HTMLTextAreaElement>('[data-new-public-key]').value));

  // ── Data ──────────────────────────────────────────────────────────────
  async function load() {
    const { data, error } = await db
      .from('submissions')
      .select('id, created_at, kind, status, payment_method, puzzle_solved, ciphertext, reviewed_at')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) return showError('Could not load requests. Your session may have expired; sign in again.');
    items = await Promise.all(
      (data as Row[]).map(async (row) => ({
        ...row,
        data: await open<Payload>(row.ciphertext, privateKey!, row.kind).catch(() => null),
      })),
    );
    render();
  }

  const statusFilter = $<HTMLSelectElement>('[data-status-filter]');
  const visible = () => items.filter((i) => i.kind === kind && (!statusFilter.value || i.status === statusFilter.value));

  function render() {
    for (const k of ['join', 'contact'] as const) $(`[data-count="${k}"]`).textContent = `(${items.filter((i) => i.kind === k).length})`;
    const head = $('[data-head]');
    const cols = kind === 'join' ? ['Received', 'Name', 'Student ID', 'Payment', 'Badge', 'Status'] : ['Received', 'Name', 'Topic', 'Status'];
    const tr = el('tr');
    cols.forEach((c) => tr.append(el('th', c)));
    head.replaceChildren(tr);

    const rows = visible().map((item) => {
      const row = el('tr');
      row.tabIndex = 0;
      const d = item.data;
      const cells =
        kind === 'join'
          ? [when(item.created_at), d ? str(d.name) : 'Cannot decrypt', str(d?.studentId), str(d?.payment?.methodName ?? item.payment_method), item.puzzle_solved ? 'Puzzle solver' : '']
          : [when(item.created_at), d ? str(d.name) : 'Cannot decrypt', str(d?.topic)];
      cells.forEach((c) => row.append(el('td', c)));
      const status = el('td');
      status.append(el('span', STATUSES[item.kind][item.status] ?? item.status, `pill pill--${item.status}`));
      row.append(status);
      const openIt = () => showDetail(item);
      row.addEventListener('click', openIt);
      row.addEventListener('keydown', (e) => e.key === 'Enter' && openIt());
      return row;
    });
    $('[data-rows]').replaceChildren(...rows);
    $('[data-empty]').hidden = rows.length > 0;
  }

  function fillStatusOptions(select: HTMLSelectElement, k: Kind, withAll: boolean) {
    const opts = Object.entries(STATUSES[k]).map(([value, label]) => Object.assign(el('option', label), { value }));
    select.replaceChildren(...(withAll ? [Object.assign(el('option', 'All statuses'), { value: '' })] : []), ...opts);
  }

  root.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach((tab) =>
    tab.addEventListener('click', () => {
      kind = tab.dataset.kind as Kind;
      root.querySelectorAll('[data-kind]').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      fillStatusOptions(statusFilter, kind, true);
      render();
    }),
  );
  fillStatusOptions(statusFilter, kind, true);
  statusFilter.addEventListener('change', render);
  $('[data-refresh]').addEventListener('click', load);

  // ── Detail dialog ─────────────────────────────────────────────────────
  const dialog = $<HTMLDialogElement>('[data-detail]');
  const LABELS: Record<string, string> = {
    name: 'Name', studentId: 'Student ID', department: 'Department', batch: 'Batch', email: 'Email', phone: 'Phone',
    interests: 'Interests', note: 'Note', topic: 'Topic', message: 'Message', sentAt: 'Sent at',
  };

  function showDetail(item: Item) {
    current = item;
    const d = item.data ?? {};
    $('[data-detail-title]').textContent = item.data ? str(d.name) : 'Cannot decrypt (different key?)';
    const fields: [string, unknown][] = Object.entries(LABELS).filter(([k]) => d[k] !== undefined && d[k] !== '').map(([k, label]) => [label, k === 'sentAt' ? when(str(d[k])) : d[k]]);
    if (d.payment) {
      fields.push(['Payment method', `${str(d.payment.methodName)}${d.payment.registered ? '' : ' (not set up at the time)'}`]);
      if (d.payment.trxId) fields.push(['Transaction ID', d.payment.trxId]);
      if (d.payment.paidFrom) fields.push(['Paid from', d.payment.paidFrom]);
    }
    fields.push(['Puzzle', item.puzzle_solved ? 'Solved all puzzles' : 'Not solved']);
    if (item.reviewed_at) fields.push(['Last reviewed', when(item.reviewed_at)]);
    const dl = $('[data-detail-fields]');
    dl.replaceChildren(...fields.flatMap(([k, v]) => [el('dt', k), el('dd', str(v))]));
    if (item.kind === 'contact' && typeof d.email === 'string') {
      const reply = el('a', `Reply to ${d.email}`);
      reply.href = `mailto:${encodeURIComponent(d.email)}`;
      const dd = el('dd');
      dd.append(reply);
      dl.append(el('dt', 'Reply'), dd);
    }
    const select = $<HTMLSelectElement>('[data-detail-status]');
    fillStatusOptions(select, item.kind, false);
    select.value = item.status;
    dialog.showModal();
  }

  $('[data-close]').addEventListener('click', () => dialog.close());
  $('[data-save]').addEventListener('click', async () => {
    if (!current) return;
    const status = $<HTMLSelectElement>('[data-detail-status]').value;
    const { error } = await db.from('submissions').update({ status }).eq('id', current.id);
    if (error) return showError('Could not save. Sign in again and retry.');
    current.status = status;
    dialog.close();
    render();
  });
  $('[data-delete]').addEventListener('click', async () => {
    if (!current || !confirm('Delete this request permanently? This cannot be undone.')) return;
    const { error } = await db.from('submissions').delete().eq('id', current.id);
    if (error) return showError('Could not delete. Sign in again and retry.');
    items = items.filter((i) => i !== current);
    dialog.close();
    render();
  });

  // ── Export (decrypted, generated on this device) ─────────────────────────
  $('[data-export]').addEventListener('click', () => {
    const keys = kind === 'join' ? ['name', 'studentId', 'department', 'batch', 'email', 'phone', 'interests', 'note'] : ['name', 'email', 'topic', 'message'];
    const header = ['received', 'status', ...keys, ...(kind === 'join' ? ['payment', 'trxId', 'paidFrom', 'puzzle'] : [])];
    const lines = visible().map((i) => {
      const d = i.data ?? {};
      const base = [when(i.created_at), STATUSES[i.kind][i.status], ...keys.map((k) => d[k])];
      return (kind === 'join' ? [...base, d.payment?.methodName, d.payment?.trxId, d.payment?.paidFrom, i.puzzle_solved ? 'yes' : ''] : base).map(csvCell).join(',');
    });
    const blob = new Blob([`﻿${[header.map(csvCell).join(','), ...lines].join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: `cis-${kind}-${new Date().toISOString().slice(0, 10)}.csv` }).click();
    URL.revokeObjectURL(url);
  });

  await route();
}
