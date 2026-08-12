-- ============================================================
-- Roadmap App — Supabase Phase 0 schema (no-login, capability-key model)
--
-- WHAT TO DO (new project): open your Supabase project → SQL Editor → New query →
-- paste this ENTIRE file → click RUN. That's it.
--
-- EXISTING project already running the pre-4.25.0 schema: this file is the same
-- end state, but running it revokes the public read immediately, which breaks any
-- browser tab still on an older bundle. For a no-downtime rollout use the two
-- migration files instead — migrate-01-published-read-rpc.sql, then deploy the
-- app, then migrate-02-revoke-public-read.sql.
--
-- Safe to run more than once (idempotent).
-- ============================================================

-- 1. Extension used for random ids/keys and password-style hashing.
-- On Supabase, extensions live in the "extensions" schema (not public).
create extension if not exists pgcrypto with schema extensions;

-- 2. Tables ---------------------------------------------------

-- Private WORKING copy — auto-saved as you edit. Never readable by the public.
create table if not exists public.roadmap_working (
  id            text primary key,
  edit_key_hash text not null,          -- hash of your secret key; the raw key is never stored
  data          jsonb not null,         -- whole { title, columns, teams, items, summary }
  title         text,
  updated_at    timestamptz not null default now()
);

-- Public PUBLISHED copy — what viewers see. Realtime is enabled on this table.
create table if not exists public.roadmap_published (
  id            text primary key references public.roadmap_working(id) on delete cascade,
  data          jsonb not null,
  title         text,
  published_at  timestamptz not null default now()
);

-- 3. Row Level Security --------------------------------------
alter table public.roadmap_working   enable row level security;
alter table public.roadmap_published enable row level security;

-- NEITHER table grants direct access to anyone. Both have RLS on with no policies,
-- so every read and write goes through the SECURITY DEFINER functions below, which
-- each require a capability: the secret edit key for the working copy, or the
-- unguessable id for the published copy.
--
-- The published table used to carry `for select using (true)` + `grant select to anon`.
-- Do not put that back. PostgREST does not require a filter, so a blanket select
-- policy makes the table a dumpable public collection:
--     GET /rest/v1/roadmap_published?select=data   ->   every roadmap, no id needed.
-- The anon key is public by design (it ships in the JS bundle), so that was readable
-- by anyone who loaded the site. Reads now go through get_published() instead.
drop policy if exists "public read published" on public.roadmap_published;
revoke select on public.roadmap_published from anon;
revoke select on public.roadmap_published from authenticated;

-- 4. Functions (RPCs) — run with owner rights, so they bypass RLS -------

-- Create a new roadmap. Returns the id + the RAW edit key. This is the ONLY
-- time the raw key is ever returned — the app must save it immediately.
create or replace function public.create_roadmap(p_data jsonb, p_title text)
returns table(id text, edit_key text)
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_id  text := 'r_' || encode(gen_random_bytes(8), 'hex');
  v_key text := encode(gen_random_bytes(24), 'hex');
begin
  insert into roadmap_working(id, edit_key_hash, data, title)
  values (v_id, crypt(v_key, gen_salt('bf')), p_data, p_title);
  id := v_id; edit_key := v_key; return next;
end;
$$;

-- Load the working copy — requires the correct key (used when reopening an edit link).
create or replace function public.load_working(p_id text, p_key text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare v_data jsonb;
begin
  select data into v_data from roadmap_working
   where id = p_id and edit_key_hash = crypt(p_key, edit_key_hash);
  if v_data is null then raise exception 'not found or wrong key'; end if;
  return v_data;
end;
$$;

-- Auto-save the working copy — requires the correct key.
create or replace function public.save_working(p_id text, p_key text, p_data jsonb, p_title text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  update roadmap_working
     set data = p_data, title = p_title, updated_at = now()
   where id = p_id and edit_key_hash = crypt(p_key, edit_key_hash);
  if not found then raise exception 'not found or wrong key'; end if;
end;
$$;

-- Publish — copy the working copy into the published copy. Requires the correct key.
create or replace function public.publish(p_id text, p_key text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare v_data jsonb; v_title text;
begin
  select data, title into v_data, v_title from roadmap_working
   where id = p_id and edit_key_hash = crypt(p_key, edit_key_hash);
  if v_data is null then raise exception 'not found or wrong key'; end if;
  insert into roadmap_published(id, data, title, published_at)
  values (p_id, v_data, v_title, now())
  on conflict (id) do update
    set data = excluded.data, title = excluded.title, published_at = now();
end;
$$;

-- Read the published copy. The id IS the capability: this returns at most one row
-- and has no unfiltered form, so there is nothing to enumerate. `language sql`
-- (not plpgsql) avoids output-name/column ambiguity on `data`; `stable` lets
-- PostgREST serve it over GET.
create or replace function public.get_published(p_id text)
returns table(data jsonb, published_at timestamptz)
language sql security definer stable set search_path = public
as $$
  select r.data, r.published_at
    from public.roadmap_published r
   where r.id = p_id;
$$;

-- 5. Allow the public (anon) role to call the functions ------
grant execute on function public.create_roadmap(jsonb, text)          to anon;
grant execute on function public.load_working(text, text)             to anon;
grant execute on function public.save_working(text, text, jsonb, text) to anon;
grant execute on function public.publish(text, text)                  to anon;
grant execute on function public.get_published(text)                  to anon;

-- 6. Realtime — broadcast, NOT Postgres Changes --------------
--
-- Postgres Changes evaluates RLS as the `anon` role, so it would require a table
-- select grant — and any table anon can subscribe to is a table anon can dump.
-- Broadcast has no such coupling: delivery is keyed on the topic string, and the
-- topic carries the unguessable id.
--
-- The payload is a SIGNAL ONLY (no roadmap data): broadcast messages are
-- size-capped and a large roadmap would not fit. The client re-reads through
-- get_published() when a signal arrives.
create or replace function public.broadcast_published()
returns trigger
language plpgsql security definer set search_path = public, realtime
as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object('id', new.id, 'published_at', new.published_at),
      'published',                  -- event
      'published:' || new.id,       -- topic
      false                         -- public topic: no RLS check, nothing to enumerate
    );
  exception when others then
    -- Never let a notification failure roll back an actual publish.
    raise warning 'broadcast_published failed for %: %', new.id, sqlerrm;
  end;
  return null;                      -- AFTER trigger: return value is ignored
end;
$$;

drop trigger if exists trg_broadcast_published on public.roadmap_published;
create trigger trg_broadcast_published
  after insert or update on public.roadmap_published
  for each row execute function public.broadcast_published();

-- Remove the old Postgres Changes replication if an earlier run added it.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'roadmap_published'
  ) then
    alter publication supabase_realtime drop table public.roadmap_published;
  end if;
end $$;

-- Done. If an RPC later returns 404 from the app, run:  notify pgrst, 'reload schema';
