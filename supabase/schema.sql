-- ============================================================================
-- DIU CIS Club: database for join requests and contact messages.
--
-- Run this once in Supabase → SQL Editor (it is safe to re-run).
-- Security model, in one paragraph:
--   * Visitors (role `anon`) can only INSERT. They can never read, change or
--     delete anything, including what they sent themselves.
--   * Everything personal is encrypted in the visitor's browser before it is
--     sent (`ciphertext`). The database never sees names, phones or payment
--     IDs in plain text, so a leaked backup or a stolen admin password alone
--     reveals nothing personal.
--   * Only signed-in committee admins who passed two-factor authentication
--     (`aal2`) and are marked `club_role = admin` can read rows or change status.
--   * Every insert must carry a fresh proof-of-work, each usable once, and the
--     whole table accepts at most 300 new rows per hour, so bots cannot flood it.
--   * Every admin change and deletion is written to an audit log.
-- ============================================================================

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Must match POW_BITS in src/features/secure-forms/pow.ts.
create or replace function private.pow_bits() returns int language sql immutable as $$ select 20 $$;

-- ── Table ───────────────────────────────────────────────────────────────────
create table if not exists public.submissions (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  kind           text not null check (kind in ('join', 'contact')),
  status         text not null,
  -- Which payment option a member chose (e.g. 'bkash'). Not personal data.
  payment_method text check (payment_method ~ '^[a-z0-9-]{1,32}$'),
  puzzle_solved  boolean not null default false,
  -- "v1.<key>.<iv>.<data>" produced by src/features/secure-forms/envelope.ts.
  ciphertext     text not null check (ciphertext ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' and length(ciphertext) <= 12000),
  -- Proof of work as sent by the browser; cleared by the trigger once checked.
  pow            text check (pow is null or length(pow) <= 120),
  pow_digest     bytea unique,
  reviewed_at    timestamptz,
  reviewed_by    uuid,
  constraint status_matches_kind check (
    (kind = 'join'    and status in ('awaiting_payment', 'verify_payment', 'approved', 'rejected')) or
    (kind = 'contact' and status in ('unread', 'done'))
  )
);
create index if not exists submissions_created_at_idx on public.submissions (created_at desc);

create table if not exists private.audit_log (
  id            bigint generated always as identity primary key,
  at            timestamptz not null default now(),
  actor         uuid,
  action        text not null,
  submission_id uuid not null,
  detail        text
);

-- ── Who is an admin? ────────────────────────────────────────────────────────
-- app_metadata can only be changed with the service key / SQL, never by users.
create or replace function private.is_admin() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'club_role') = 'admin', false)
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

-- ── Insert guard: proof of work, replay protection, flood limit ──────────────
-- SECURITY DEFINER so it can count rows that `anon` cannot see. It lives in the
-- unexposed `private` schema and is only reachable through the trigger.
create or replace function private.guard_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  parts  text[];
  stamp  bigint;
  digest bytea;
  bits   int := private.pow_bits();
begin
  -- The server, not the browser, owns these fields.
  new.id := gen_random_uuid();
  new.created_at := now();
  new.reviewed_at := null;
  new.reviewed_by := null;
  if new.kind = 'contact' then
    new.status := 'unread';
    new.payment_method := null;
    new.puzzle_solved := false;
  elsif new.status not in ('awaiting_payment', 'verify_payment') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  -- Proof of work: "<salt>:<unix minute>:<nonce>" whose SHA-256 starts with `bits` zero bits.
  parts := string_to_array(coalesce(new.pow, ''), ':');
  if array_length(parts, 1) is distinct from 3
     or parts[1] !~ '^[A-Za-z0-9_-]{16,64}$'
     or parts[2] !~ '^[0-9]{1,12}$'
     or parts[3] !~ '^[0-9]{1,12}$' then
    raise exception 'invalid_proof' using errcode = '22023';
  end if;
  stamp := parts[2]::bigint;
  if abs(floor(extract(epoch from now()) / 60) - stamp) > 60 then
    raise exception 'invalid_proof' using errcode = '22023', detail = 'stale';
  end if;
  digest := sha256(convert_to(new.pow, 'UTF8'));
  if get_byte(digest, 0) <> 0 or get_byte(digest, 1) <> 0
     or get_byte(digest, 2) >= (256 >> (bits - 16)) then
    raise exception 'invalid_proof' using errcode = '22023', detail = 'insufficient work';
  end if;
  if exists (select 1 from public.submissions where pow_digest = digest) then
    raise exception 'invalid_proof' using errcode = '22023', detail = 'reused';
  end if;
  new.pow_digest := digest;
  new.pow := null;

  -- Flood limits across all visitors (no IPs are stored, so they are global):
  -- 300 per hour, and 20,000 rows in total so the free 500 MB database can
  -- never be filled. Export and delete handled requests to free space.
  if (select count(*) from public.submissions where created_at > now() - interval '1 hour') >= 300
     or (select count(*) from public.submissions) >= 20000 then
    raise exception 'rate_limited' using errcode = '22023';
  end if;
  return new;
end $$;

-- ── Update guard: stamp the reviewer and audit every change ──────────────────
create or replace function private.on_review() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    insert into private.audit_log (actor, action, submission_id, detail)
    values (auth.uid(), 'delete', old.id, old.kind || ':' || old.status);
    return old;
  end if;
  new.reviewed_at := now();
  new.reviewed_by := auth.uid();
  insert into private.audit_log (actor, action, submission_id, detail)
  values (auth.uid(), 'status', new.id, old.status || ' -> ' || new.status);
  return new;
end $$;

revoke all on function private.pow_bits(), private.is_admin(), private.guard_insert(), private.on_review() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

drop trigger if exists guard_insert on public.submissions;
create trigger guard_insert before insert on public.submissions
  for each row execute function private.guard_insert();
drop trigger if exists on_review on public.submissions;
create trigger on_review before update or delete on public.submissions
  for each row execute function private.on_review();

-- ── Privileges: least privilege, column by column ────────────────────────────
revoke all on table public.submissions from public, anon, authenticated;
grant insert (kind, status, payment_method, puzzle_solved, ciphertext, pow) on public.submissions to anon, authenticated;
grant select (id, created_at, kind, status, payment_method, puzzle_solved, ciphertext, reviewed_at) on public.submissions to authenticated;
grant update (status) on public.submissions to authenticated;
grant delete on public.submissions to authenticated;
revoke all on table private.audit_log from public, anon, authenticated;
-- Defence in depth: no policies, so only the SECURITY DEFINER triggers can write here.
alter table private.audit_log enable row level security;

-- ── Row Level Security ──────────────────────────────────────────────────────
alter table public.submissions enable row level security;

drop policy if exists "visitors can submit" on public.submissions;
create policy "visitors can submit" on public.submissions
  for insert to anon, authenticated
  with check (kind in ('join', 'contact'));

drop policy if exists "admins can read" on public.submissions;
create policy "admins can read" on public.submissions
  for select to authenticated using ((select private.is_admin()));

drop policy if exists "admins can update" on public.submissions;
create policy "admins can update" on public.submissions
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists "admins can delete" on public.submissions;
create policy "admins can delete" on public.submissions
  for delete to authenticated using ((select private.is_admin()));

-- New tables in `public` must not become reachable by accident.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

-- ============================================================================
-- Make a committee member an admin (run after creating their user in
-- Authentication → Users, with "Auto confirm" on). Replace the email:
--
--   update auth.users
--      set raw_app_meta_data = raw_app_meta_data || '{"club_role": "admin"}'
--    where email = 'someone@diu.edu.bd';
--
-- Remove an admin:
--   update auth.users set raw_app_meta_data = raw_app_meta_data - 'club_role'
--    where email = 'someone@diu.edu.bd';
--
-- Optional: delete handled requests after a year (enable pg_cron first):
--   select cron.schedule('purge-old-submissions', '0 3 * * *',
--     $$ delete from public.submissions
--        where created_at < now() - interval '1 year'
--          and status in ('approved', 'rejected', 'done') $$);
-- ============================================================================
