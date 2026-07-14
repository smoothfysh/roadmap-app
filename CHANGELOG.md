# Changelog

Version history for the Roadmap App, newest first.

Each version matches the `version` field in `package.json`, which is shown in the
app footer (e.g. `v4.5.0`). Update this file whenever the version is bumped.

---

## 4.12.0 — 2026-07-14

- Added a **Help** button (top-right of the header, next to Actions) that opens a new
  `public/help.html` FAQ page in a new tab — a plain-language explainer of where roadmap data
  is stored (local storage by default, Share link, Cloud save/publish, Backup JSON/CSV), with
  the Cadence X logo in the header.

## 4.11.0 — 2026-07-08

- **Cloud roadmaps now use isolated local storage.** Editing a cloud roadmap no longer overwrites
  your default local roadmap (`roadmap-data`); each cloud roadmap caches under its own key
  (`roadmap-cloud-<id>`).
- Added an **offline fallback**: if the cloud fetch fails when opening a `?id=&key=` link, the app
  loads that roadmap's local cache (staying in cloud mode) instead of dropping to the default.
- Swapping between roadmaps is via the **Cloud/Synced button → "My roadmaps" list → Open**
  (unchanged; now cleanly isolated per roadmap).

## 4.10.2 — 2026-07-08

- Properly fixed the header-hint overlap: the hint was still absolutely positioned on wide (2xl)
  screens and overlapped the status dots after the title. Removed absolute positioning entirely —
  title + dots are now grouped, and the hint is a normal flex item that wraps to its own line the
  moment it no longer fits after the red dot. No overlap at any width.

## 4.10.1 — 2026-07-08

- Fixed the header hint ("Read-only preview — save a copy to make edits" / "Drag items to reorder")
  overlapping the centred title on narrower windows. It was absolutely positioned; now the row
  wraps and the hint drops to its own centred line below the title, only sitting inline-right on
  very wide (2xl+) screens.
- Also fixed a crash (blank page) introduced in 4.10.0: an undo effect referenced `isPreview` in its
  dependency array before it was initialised (temporal dead zone) — now keyed off `sharedPreview`.

## 4.10.0 — 2026-07-08

- **Safeguards against accidental data loss** (esp. Reset in a cloud roadmap).
- **Revert to published** — a button in the Cloud panel restores your working copy from the
  last published version (recover after a bad edit or Reset). Enabled when you have unpublished changes.
- **Cloud-aware Reset warning** — in a cloud roadmap, Reset now explains it clears the working
  copy and auto-saves blank (published stays live), and points to Revert / Ctrl+Z.
- **In-session undo (Ctrl/⌘+Z)** — reverts recent changes, including a Reset, within the session
  (lost on refresh). Also in the Actions menu as "Undo last change". Undo snapshots are deep-cloned
  so in-place edits can't corrupt history; capped at 50; skipped while typing in a field.

## 4.9.0 — 2026-07-08

- **Top toolbar reorganised** to reduce clutter (Option C).
- Bar now shows only the frequently-used / live items: **Compact View**, the live **Cloud**
  status (Cloud/Saving/Synced), and **Publish** — Compact sits beside the cloud status.
- Everything else moved into a single **Actions ▾** dropdown, grouped: **Share as URL**,
  **CSV** (Export / Import), **JSON · full backup** (renamed **Backup JSON** / **Restore JSON**),
  and **Reset roadmap**.
- Menu closes on outside-click and Escape; Share stays open briefly so "Link copied!" is visible.

## 4.8.0 — 2026-07-08

- Cloud sync **Phase 3: realtime.**
- When viewing a published roadmap via a `?id=` link, the board now **updates live** the moment
  the owner publishes — no refresh (Supabase Realtime subscription on the published row).
- A **"Live — updates automatically"** badge (bottom-right) shows the realtime connection status.
- Completes the no-login cloud sync feature: save & reopen (Phase 1), publish & view (Phase 2),
  realtime (Phase 3). Presence ("N viewing") remains an optional Phase 4 extra.

## 4.7.0 — 2026-07-08

- Cloud sync **Phase 2: Publish + public view.**
- **Publish** button (top bar + Cloud panel) copies your private working copy to the public
  published copy that viewers see. An **"Unpublished changes"** indicator (amber) appears when
  the working copy differs from what's published.
- **Public view link** (`?id=` without a key) — anyone with the link reads the published copy
  read-only. Not-yet-published / bad links show a clear "Roadmap not published" screen.
- Cloud panel now has **Copy view link** (safe to share) and **Copy edit link** (keep private).
- Unpublished detection uses a canonical (sorted-key) comparison so Postgres jsonb key
  reordering doesn't cause false "unpublished" flags.
- Realtime live updates for viewers come in Phase 3.

## 4.6.0 — 2026-07-08

- Added **cloud sync** via Supabase (no logins) — Phase 1: save & reopen your own roadmaps.
- New **Cloud** button in the top bar: "Save to cloud" creates a private cloud copy that
  **auto-saves** as you edit (debounced), and a **"My roadmaps"** list (stored in this browser).
- Ownership is by **secret edit link** (`?id=…&key=…`) — no accounts. Reopen a roadmap on any
  machine via its edit link.
- **Edit-link safety**: after creating, a modal makes you confirm you've saved the edit link
  (it's the only way back in); the Cloud panel repeats the warning and offers Copy edit link.
- Config in `.env.local` (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`); anon key is public-safe.
  Degrades to local-only mode if not configured. Publish + public view + realtime come in Phase 2/3.

## 4.5.0 — 2026-07-08

- Added a **Copy** button to the Quarter Summary modal.
- Copies the summary to the clipboard as rich formatting, so pasting into Google
  Slides, Google Docs or Word keeps headings, bold, italics, lists and quotes.
- Writes both `text/html` (formatted) and a clean `text/plain` fallback.
- Available in **read-only / shared mode** too (so viewers can copy); the Edit
  button stays hidden for viewers.

## 4.4.0 — 2026-07-08

- Added the **Quarter Summary** feature.
- New `✦ QUARTER SUMMARY` button next to *Add Team Row*.
- Opens a modal with a read-only view and a manual **Markdown editor** (formatting
  toolbar + live preview) — paste or write the summary yourself.
- Summary is stored on `data.summary`, so it saves to localStorage and travels with
  **Backup** and **share links** automatically.
- Viewers see the summary read-only; the button only appears for them when a summary
  exists in the shared file.

## 4.3.0 — 2026-07-05

- Added a team-detail modal on the *By Time* view headers.

## 4.2.0 — 2026-07-02

- Added a **Compact View** toggle to the *By Time* tab for cross-column team-row alignment.

## 4.1.1 — 2026-06-19

- Fixed the mobile header layout.

## 4.1.0 — 2026-06-19

- Merged the Enabler/Strategic outcome types into a single free-text **Enables / Supports** axis.

## 4.0.0 — 2026-06-19

- Added the **by IMPACT** tab and the Outcome Metric modal.
- Removed the old *By Revenue Impact* view.

## 3.5.0 — 2026-06-15

- Gantt view: fractional day-of-month bars, quarter-start default, quarter header row, full-width lane separators.

---

_Entries from 3.5.0 to 4.3.0 were reconstructed from git commit messages. Commits
before 3.5.0 (initial development, Apr–Jun 2026) were not version-tagged, so they
are not listed here._
