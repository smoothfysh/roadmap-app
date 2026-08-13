-- ============================================================
-- Migration 03 — delete_roadmap(): let an edit-key holder destroy their roadmap.
--
-- WHAT TO DO: Supabase project → SQL Editor → New query → paste this file → RUN.
--
-- ROLLOUT: this is PURELY ADDITIVE — one new function plus its execute grant.
-- Nothing is revoked, so no browser tab running an older bundle is affected, and
-- there is no additive-then-breaking split to worry about. The only ordering rule
-- is the obvious one: run this BEFORE deploying the app build that calls it, or
-- the RPC 404s for anyone who clicks Delete.
--
-- Safe to run more than once (idempotent).
-- ============================================================

-- Delete a roadmap outright — the private working copy AND the public published
-- copy. Requires the secret edit key, exactly like save_working and publish: the
-- capability that lets you change a roadmap is the capability that lets you
-- destroy it. Holding only the id (the view capability) is not enough.
--
-- Irreversible. Once this runs, every ?id=… view link for this roadmap is dead
-- and the edit key unlocks nothing. There is no soft-delete and no backup — the
-- app makes the user type DELETE and offers a JSON backup first, which is the
-- only safety net there is.
--
-- Both deletes are explicit rather than leaning on the
-- `roadmap_published.id references roadmap_working(id) on delete cascade` FK.
-- The cascade would do it, but a project provisioned before that clause landed
-- would silently orphan the published row — i.e. the roadmap would keep serving
-- to viewers after a "successful" delete. Deleting both by hand cannot fail that
-- way, and costs nothing.
--
-- Note for the realtime path: trg_broadcast_published is AFTER INSERT OR UPDATE
-- only, so a delete sends no signal. A viewer with the page already open keeps
-- showing the last content it fetched until it reloads; on reload get_published
-- returns no row and the app shows its not-found screen. Adding a delete
-- broadcast would be a nicety, not a security matter — the data is already gone.
create or replace function public.delete_roadmap(p_id text, p_key text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare v_ok boolean;
begin
  select true into v_ok from roadmap_working
   where id = p_id and edit_key_hash = crypt(p_key, edit_key_hash);
  if v_ok is null then raise exception 'not found or wrong key'; end if;

  delete from roadmap_published where id = p_id;
  delete from roadmap_working   where id = p_id;
end;
$$;

-- Callable by the public (anon) role — like every other RPC here. The function
-- checks the capability itself; the grant only says "you may ask".
grant execute on function public.delete_roadmap(text, text) to anon;

-- No policy and no table grant is added by this file, and none may be. Both
-- tables stay at RLS-on-with-no-policies; all access remains through capability
-- checked SECURITY DEFINER functions. See phase0-schema.sql section 3 for why.

notify pgrst, 'reload schema';

-- ---- Verify -------------------------------------------------
-- Wrong key must fail, right key must delete. Against your REST endpoint:
--
--   curl -s -X POST "$URL/rest/v1/rpc/delete_roadmap" \
--     -H "apikey: $ANON" -H "Content-Type: application/json" \
--     -d '{"p_id":"r_...","p_key":"wrong"}'
--   # expect: {"code":"P0001","message":"not found or wrong key"}
--
-- And confirm the tables are still ungrantable to anon — this must stay denied:
--
--   curl -s "$URL/rest/v1/roadmap_published?select=data" -H "apikey: $ANON"
--   # expect: permission denied for table roadmap_published
