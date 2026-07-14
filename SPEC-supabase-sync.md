# Spec — Supabase sync (no-login)

Status: **draft for verification** · Author: interview with product owner · Date: 2026-07-08

---

## 1. Goal (one line)

Save roadmaps from my browser to a Supabase database and share **unlisted links** so
colleagues can view them **live**; anyone in the org can create and store **their own**
roadmaps; whose-content-is-whose is established by a **secret edit key**, with **no logins**.

---

## 2. Locked decisions (from the interview)

| # | Decision | Choice |
|---|---|---|
| 1 | Edit protection | **Secret edit link** — private key held in the browser; view links omit it |
| 2 | View access | **Anyone with the link** (unlisted, unguessable id) |
| 3 | Roadmaps per person | **Multiple** |
| 4 | Saving | **Auto-save** to the cloud (private working copy) |
| 5 | Undo | **In-session only** (Ctrl+Z while editing; not persisted after refresh) |
| 6 | Key recovery | **Show/copy your edit link** to save & reopen on any machine |
| 7 | Link format | **Random unguessable id** — `?id=…` to view, `?id=…&key=…` to edit |
| 8 | Viewer sync | **Live realtime** — viewers update without refresh |
| 9 | Draft vs live | **Auto-save private + explicit Publish** to update what viewers see |
| 10 | Existing R2 flow | **Keep untouched** — Supabase is purely additive |
| 11 | Finding your own | **Local "My roadmaps" list** in the browser |

---

## 3. Derived architecture — two copies per roadmap ⚠️ verify

Decisions 4, 8 and 9 together require each roadmap to hold **two versions**:

- **Working copy** — private, auto-saved as you edit. Only reachable with the edit key.
- **Published copy** — what viewers see. Updated only when you click **Publish**.
- **Realtime** pushes changes to the **published** copy, so viewers never see half-finished edits.

This is the single most important structural choice. Everything below assumes it.

**Ownership / "my content vs theirs":** every roadmap is an independent row with its own
`id` + secret key. There is no user table and no link between roadmaps. *Your* content =
the ids+keys your browser has saved in its local "My roadmaps" list (recoverable via edit links).

---

## 4. Data model (Supabase / Postgres)

Two tables to keep the private draft genuinely private while allowing public realtime reads.

```sql
-- Private working copy — never directly readable by the public.
create table roadmap_working (
  id            text primary key,          -- random, e.g. "r_8Kq2x9v"
  edit_key_hash text not null,             -- hash of the secret; raw key never stored
  data          jsonb not null,            -- whole { title, columns, teams, items, summary }
  title         text,
  updated_at    timestamptz default now()
);

-- Public published copy — anyone with the id can read; realtime enabled here.
create table roadmap_published (
  id            text primary key references roadmap_working(id) on delete cascade,
  data          jsonb not null,
  title         text,
  published_at  timestamptz default now()
);
```

All writes and the working-copy read go through **`security definer` RPCs** that verify the
edit key — the anon role can never write these tables directly:

- `create_roadmap(data) -> { id, key }` — makes a new row, returns id + freshly generated secret
- `load_working(id, key) -> data` — key-gated; used when reopening your edit link elsewhere
- `save_working(id, key, data)` — the auto-save target (debounced)
- `publish(id, key)` — copies working `data` → `roadmap_published`

Public read is the **only** direct table access the anon role gets:

```sql
-- anyone can read a published roadmap by id
alter table roadmap_published enable row level security;
create policy "public read published" on roadmap_published for select using (true);
-- (no insert/update/delete policies → anon cannot write; only the publish() RPC can)
```

Realtime is enabled on `roadmap_published` only, so viewers subscribe to published changes
and never receive working-draft data.

---

## 5. App flows

- **Create** → `create_roadmap` → store `{id, key, title}` in local "My roadmaps"; URL becomes `?id=…&key=…`.
- **Edit + auto-save** → on change (debounced ~1–2s) → `save_working(id, key, data)`. In-session Ctrl+Z undo is a local editor feature, independent of the cloud.
- **Publish** → `publish(id, key)`; a header shows **"Unpublished changes"** when working ≠ published.
- **Share** → copy the **view** link `?id=…` (no key). Copy **edit** link `?id=…&key=…` only to move machines / recover.
- **View (colleague)** → open `?id=…` → read `roadmap_published` → subscribe to realtime updates.
- **Recover / new machine** → open your saved edit link `?id=…&key=…` → `load_working` restores editing.
- **My roadmaps list** → picker built from localStorage; clearing the browser loses the list but saved edit links recover any roadmap.

---

## 6. What stays exactly as-is

- Manual publish: **Backup → R2 → `?location=`** (kept as a fallback/export)
- `#share=` compressed links, CSV import/export, localStorage offline/anonymous mode
- The whole board, all views, the Quarter Summary + Copy feature
- The app still works with **no cloud at all** — Supabase is opt-in per roadmap

---

## 7. Build plan (small, shippable compartments)

Each phase is independently testable and shippable.

- **Phase 0 — Backend only.** Supabase project, the two tables, the four RPCs, RLS. Verified in the SQL editor. No app change.
- **Phase 1 — Save & reopen your own.** Create + auto-save working copy + local "My roadmaps" list + edit-key in URL/localStorage + copy/recover edit link. (No sharing yet.)
- **Phase 2 — Publish & view.** Publish button + "unpublished changes" indicator; `?id=` public read of the published copy. Colleagues can view.
- **Phase 3 — Realtime.** Viewers’ boards update live on publish.
- **Phase 4 — Polish (optional).** Delete/rename cloud roadmap, one-time "import my current roadmap", presence ("N viewing").

---

## 8. Verified decisions ✓

All confirmed by the product owner (2026-07-08):

1. ✅ **Two-copy model** (§3) — working (private) + published (public).
2. ✅ **Publish is a manual button**, not automatic.
3. ✅ **In-session undo only** — after refresh, the last auto-save is the truth, no server-side revert.
4. ✅ **No org restriction on viewing** — unlisted link works for anyone who has it.
5. ✅ **Edit-key loss = view-only forever** — accepted, **but must be surfaced in the UI** (see §9).
6. ✅ **Phase order** — Phase 0/1 (save & reopen your own) first, before any sharing.

---

## 9. Edit-key safety in the UI (from verification #5)

Because losing the edit key permanently drops you to view-only, the risk must be visible and
the recovery path always one click away:

- **On create** — a mandatory "**Save your edit link**" moment: show the edit link with **Copy**
  and a clear line — *"This link is the only way to edit this roadmap later. Save it (bookmark or
  password manager). We can't recover it for you."* Confirm before continuing.
- **In "My roadmaps"** — each entry has a **Copy edit link** action and a small warning tooltip;
  a subtle badge if a roadmap exists only in this browser (not yet backed up anywhere).
- **In Share** — clearly separate the **View link** (safe to send) from the **Edit link** (keep private),
  each labelled with what it does and the "keep it safe" note on the edit link.
- **Optional nudge** — first time you create a cloud roadmap, a one-line explainer that there are no
  accounts, so the edit link *is* the password.
