-- ============================================================
-- Roadmap App — migration 02 of 02: close the public read (BREAKING)
--
-- RUN THIS ONLY AFTER:
--   1. migrate-01-published-read-rpc.sql has been run, and
--   2. the app build that calls get_published() is deployed to every site
--      you serve (personal `npm run deploy` AND `npm run deploy:company`).
--
-- Any browser tab still running an older bundle will fail to load published
-- roadmaps after this runs, until it is reloaded. That is the intended
-- trade-off — the old bundle is the one that can dump the table.
--
-- Safe to run more than once (idempotent).
-- ============================================================

-- 1. Remove the blanket public read -----------------------------------
-- After this, `roadmap_published` has RLS on with NO select policy and no
-- grant to anon — the same posture `roadmap_working` has always had. Reads go
-- exclusively through get_published(p_id), which cannot return more than one
-- row. The publish() function still writes fine: it is SECURITY DEFINER and
-- runs as the table owner, bypassing RLS.
drop policy if exists "public read published" on public.roadmap_published;
revoke select on public.roadmap_published from anon;

-- Belt and braces: `authenticated` is not used by this app, but the project
-- may have been created with "expose new tables" on at some point.
revoke select on public.roadmap_published from authenticated;

-- 2. Drop the now-unused Postgres Changes replication -----------------
-- Live updates come from the broadcast trigger added in migrate-01. Leaving
-- the table in the realtime publication would only produce WAL traffic that
-- can no longer be delivered to anyone.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'roadmap_published'
  ) then
    alter publication supabase_realtime drop table public.roadmap_published;
  end if;
end $$;

notify pgrst, 'reload schema';

-- ============================================================
-- VERIFY — paste your own project URL and anon key. The first must now fail,
-- the second must still work:
--
--   # must return: permission denied for table roadmap_published
--   curl "$URL/rest/v1/roadmap_published?select=data" -H "apikey: $ANON"
--
--   # must return the one roadmap
--   curl "$URL/rest/v1/rpc/get_published?p_id=r_xxxxxxxxxxxxxxxx" -H "apikey: $ANON"
-- ============================================================
