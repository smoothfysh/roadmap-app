-- ============================================================
-- Roadmap App — migration 01 of 02: gated read + broadcast (ADDITIVE, SAFE)
--
-- WHY: `roadmap_published` was granted SELECT to `anon` with an RLS policy of
-- `using (true)`. PostgREST does not require a filter, so
--     GET /rest/v1/roadmap_published?select=data
-- returned EVERY published roadmap. The anon key is public by design (it ships
-- in the JS bundle), so anyone who loaded the site could dump the whole table.
-- The `r_<16 hex>` ids are unguessable, but enumeration bypasses that entirely.
--
-- THIS FILE ONLY ADDS THINGS. It does not remove the public read — run it
-- first, deploy the new app build, THEN run migrate-02 to close the hole.
-- That order means no viewer ever sees a broken roadmap.
--
-- Safe to run more than once (idempotent).
-- ============================================================

-- 1. Read the published copy through a key-less capability check ------
--
-- The id IS the capability. This function returns at most one row and has no
-- unfiltered form, so there is nothing to enumerate. `language sql` (not
-- plpgsql) avoids any output-name/column ambiguity on `data`; `stable` lets
-- PostgREST serve it over GET.
create or replace function public.get_published(p_id text)
returns table(data jsonb, published_at timestamptz)
language sql security definer stable set search_path = public
as $$
  select r.data, r.published_at
    from public.roadmap_published r
   where r.id = p_id;
$$;

grant execute on function public.get_published(text) to anon;

-- 2. Live updates without a table read grant --------------------------
--
-- Postgres Changes evaluates RLS as the `anon` role, so it needs exactly the
-- table grant we are about to revoke — and any table anon can subscribe to is
-- a table anon can dump. Broadcast has no such coupling: delivery is keyed on
-- the topic string, and the topic contains the unguessable id.
--
-- The payload is deliberately a SIGNAL ONLY (no roadmap data): broadcast
-- messages are size-capped, and a large roadmap would not fit. The client
-- re-reads through get_published() when a signal arrives.
create or replace function public.broadcast_published()
returns trigger
language plpgsql security definer set search_path = public, realtime
as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object('id', new.id, 'published_at', new.published_at),
      'published',                  -- event
      'published:' || new.id,       -- topic — knowing the id is the capability
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

-- 3. Make PostgREST notice the new function ---------------------------
notify pgrst, 'reload schema';

-- Next: deploy the app build that calls get_published(), then run
-- migrate-02-revoke-public-read.sql.
