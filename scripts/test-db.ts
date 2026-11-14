/**
 * Runs supabase/schema.sql in an in-memory Postgres (PGlite) and attacks it
 * the way an outsider would: reading as an anonymous visitor, forging fields,
 * replaying proofs, skipping 2FA, flooding. Supabase's `auth` schema and
 * roles are stubbed to behave like the real ones.
 * Run: node scripts/test-db.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { sha256, leadingZeroBits } from '../src/features/secure-forms/sha256.ts';

const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated;
  grant execute on all functions in schema auth to anon, authenticated;
`);
await db.exec(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));

const enc = new TextEncoder();
function proof(bits = 20, minute = Math.floor(Date.now() / 60000)): string {
  const salt = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url');
  for (let n = 0; ; n++) if (leadingZeroBits(sha256(enc.encode(`${salt}:${minute}:${n}`))) >= bits) return `${salt}:${minute}:${n}`;
}
const CT = `v1.${'A'.repeat(87)}.${'B'.repeat(16)}.${'C'.repeat(700)}`;

/** Run SQL as a given role with given JWT claims, like PostgREST does. */
async function as(role: string, claims: object, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await tx.exec(`set local role ${role}`);
    return tx.query(sql, params);
  });
}
const insert = (role: string, values: Record<string, unknown>) => {
  const cols = Object.keys(values);
  return as(role, { role }, `insert into public.submissions (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(values));
};
const good = () => ({ kind: 'join', status: 'awaiting_payment', payment_method: 'bkash', ciphertext: CT, pow: proof() });

const admin = { role: 'authenticated', sub: '00000000-0000-0000-0000-000000000001', aal: 'aal2', app_metadata: { club_role: 'admin' } };
let passed = 0;
const test = async (name: string, fn: () => Promise<void>) => {
  await fn();
  passed++;
  console.log(`ok  ${name}`);
};

await test('visitor can submit a valid request', async () => {
  await insert('anon', good());
});
await test('visitor cannot read anything back', async () => {
  await assert.rejects(as('anon', { role: 'anon' }, 'select * from public.submissions'), /permission denied/);
});
await test('visitor cannot update or delete', async () => {
  await assert.rejects(as('anon', { role: 'anon' }, `update public.submissions set status = 'approved'`), /permission denied/);
  await assert.rejects(as('anon', { role: 'anon' }, 'delete from public.submissions'), /permission denied/);
});
await test('visitor cannot forge server-owned columns', async () => {
  await assert.rejects(insert('anon', { ...good(), reviewed_by: admin.sub }), /permission denied/);
  await assert.rejects(insert('anon', { ...good(), id: '00000000-0000-0000-0000-000000000009' }), /permission denied/);
  await assert.rejects(insert('anon', { ...good(), status: 'approved' }), /invalid_status/);
});
await test('contact messages are forced to "unread" with no payment data', async () => {
  await insert('anon', { kind: 'contact', status: 'verify_payment', payment_method: 'bkash', puzzle_solved: true, ciphertext: CT, pow: proof() });
  const r = await as('authenticated', admin, `select status, payment_method, puzzle_solved from public.submissions where kind = 'contact'`);
  assert.deepEqual(r.rows[0], { status: 'unread', payment_method: null, puzzle_solved: false });
});
await test('missing, weak, stale or malformed proofs are refused', async () => {
  await assert.rejects(insert('anon', { ...good(), pow: null }), /invalid_proof/);
  await assert.rejects(insert('anon', { ...good(), pow: proof(8) }), /invalid_proof/);
  await assert.rejects(insert('anon', { ...good(), pow: proof(20, Math.floor(Date.now() / 60000) - 120) }), /invalid_proof/);
  await assert.rejects(insert('anon', { ...good(), pow: "x:1:1'; drop table x; --" }), /invalid_proof/);
});
await test('a proof can be used only once', async () => {
  const p = proof();
  await insert('anon', { ...good(), pow: p });
  await assert.rejects(insert('anon', { ...good(), pow: p }), /invalid_proof/);
});
await test('plaintext or oversized ciphertext is refused', async () => {
  await assert.rejects(insert('anon', { ...good(), ciphertext: 'name: Alice, phone: 017…' }), /check constraint/);
  await assert.rejects(insert('anon', { ...good(), ciphertext: `v1.a.b.${'C'.repeat(12001)}` }), /check constraint/);
  await assert.rejects(insert('anon', { ...good(), payment_method: '<script>' }), /check constraint/);
});
await test('signed-in users without 2FA see nothing', async () => {
  const r = await as('authenticated', { ...admin, aal: 'aal1' }, 'select id from public.submissions');
  assert.equal(r.rows.length, 0);
});
await test('signed-in non-admins see nothing, even with 2FA', async () => {
  const r = await as('authenticated', { ...admin, app_metadata: {}, user_metadata: { club_role: 'admin' } }, 'select id from public.submissions');
  assert.equal(r.rows.length, 0);
});
await test('admins with 2FA can read, but not the hidden columns', async () => {
  const r = await as('authenticated', admin, 'select id, kind, status, ciphertext from public.submissions');
  assert.ok(r.rows.length >= 3);
  await assert.rejects(as('authenticated', admin, 'select pow_digest from public.submissions'), /permission denied/);
  await assert.rejects(as('authenticated', admin, 'select * from private.audit_log'), /permission denied/);
});
await test('admins can change status only; changes are audited', async () => {
  await as('authenticated', admin, `update public.submissions set status = 'approved' where kind = 'join'`);
  await assert.rejects(as('authenticated', admin, `update public.submissions set ciphertext = 'v1.a.b.c'`), /permission denied/);
  await assert.rejects(as('authenticated', admin, `update public.submissions set status = 'done' where kind = 'join'`), /status_matches_kind/);
  const log = await db.query(`select count(*)::int as n from private.audit_log where action = 'status'`);
  assert.ok((log.rows[0] as { n: number }).n >= 1);
});
await test('non-admins cannot delete; admins can, and it is audited', async () => {
  await as('authenticated', { ...admin, aal: 'aal1' }, 'delete from public.submissions');
  assert.ok(((await db.query('select count(*)::int as n from public.submissions')).rows[0] as { n: number }).n >= 3);
  await as('authenticated', admin, `delete from public.submissions where kind = 'contact'`);
  const log = await db.query(`select count(*)::int as n from private.audit_log where action = 'delete'`);
  assert.equal((log.rows[0] as { n: number }).n, 1);
});
await test('visitors cannot call the private helper functions', async () => {
  await assert.rejects(as('anon', { role: 'anon' }, 'select private.is_admin()'), /permission denied/);
});
await test('flood limit stops inserts after 300 per hour', async () => {
  // The trigger requires a proof, so seed directly with the trigger disabled.
  await db.exec(`alter table public.submissions disable trigger guard_insert;
    insert into public.submissions (kind, status, ciphertext) select 'join', 'awaiting_payment', '${CT}' from generate_series(1, 300);
    alter table public.submissions enable trigger guard_insert;`);
  await assert.rejects(insert('anon', good()), /rate_limited/);
});

console.log(`\n${passed} database security tests passed`);
