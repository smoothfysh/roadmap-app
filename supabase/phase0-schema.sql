-- ============================================================
-- Roadmap App — Supabase Phase 0 schema (no-login, capability-key model)
--
-- WHAT TO DO: open your Supabase project → SQL Editor → New query →
-- paste this ENTIRE file → click RUN. That's it.
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

-- WORKING table: no policies at all => zero direct access for the public.
-- Everything goes through the SECURITY DEFINER functions below (which check the key).

-- PUBLISHED table: anyone may READ (that's how sharing works); nobody may write directly.
drop policy if exists "public read published" on public.roadmap_published;
create policy "public read published"
  on public.roadmap_published for select
  using (true);

-- Explicit table-level grant for the public role, so this works even if the project's
-- "Automatically expose new tables" setting is OFF (the recommended, more-secure choice).
-- The WORKING table is deliberately NOT granted to anyone — it's reached only via the
-- SECURITY DEFINER functions below.
grant select on public.roadmap_published to anon;

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

-- 5. Allow the public (anon) role to call the functions ------
grant execute on function public.create_roadmap(jsonb, text)          to anon;
grant execute on function public.load_working(text, text)             to anon;
grant execute on function public.save_working(text, text, jsonb, text) to anon;
grant execute on function public.publish(text, text)                  to anon;

-- 6. Enable Realtime on the published table (guarded so re-runs don't error)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'roadmap_published'
  ) then
    alter publication supabase_realtime add table public.roadmap_published;
  end if;
end $$;

-- Done. If an RPC later returns 404 from the app, run:  notify pgrst, 'reload schema';
