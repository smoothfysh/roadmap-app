# Roadmap App — Claude Context

## Project overview

Single-file React kanban board for sharing team roadmaps. All application logic lives in `src/App.jsx`.

Storage is `localStorage` by default. There is also an **optional Supabase cloud sync** (`src/cloud.js`, `src/supabaseClient.js`) for roadmaps shared by link — see **Supabase cloud sync** below. The app degrades to local-only when the env vars are absent, so most work never touches it.

Deployed to GitHub Pages at `roadmap.cadence-x.com` (CNAME in `public/CNAME`).

## Tech stack

- **React 19** with hooks only (no class components, no Redux)
- **Vite** for dev server and builds
- **Tailwind CSS v3** for styling (utility classes inline, no CSS files)
- **lucide-react** for icons
- **gh-pages** for deployment (`npm run deploy`)

## Commands

```bash
npm run dev        # start dev server (localhost:5173)
npm run build      # production build → dist/
npm run deploy     # build + push to gh-pages branch
```

## Workflow rules (must follow)

The user has explicitly asked for these — always obey:

- **Do NOT start the dev server.** Never run `npm run dev` or spin up a preview server after building. The user runs and checks the app themselves. Verifying with `npm run build` (compile check) is fine; launching a live server is not.

- **Back up `src/App.jsx` on every version bump.** Whenever you make new changes that increase the `package.json` version, first copy the current file to `src/App.<current-version>.jsx` (the version being replaced) *before* editing — e.g. at 4.5.0, run `cp src/App.jsx src/App.4.5.0.jsx`, then make changes and bump to 4.6.0. This gives a one-file rollback point. These backup `.jsx` files are not imported, so they're excluded from the build.

- **Update `CHANGELOG.md` on every version bump.** Add a new entry at the top (newest first) with the new version, the date, and a short bullet list of what changed, so there's a record of which changes are in which version.

- **Commit (and push) before deploying.** `npm run deploy` ships whatever is on disk to the live site, regardless of git state — so always `git commit` the change and `git push origin main` *before* running deploy, so git history always reflects what's actually live. Never let deployed work sit uncommitted. (Check first that no secret is staged: `.env.local` is gitignored and must stay that way; the Supabase anon key must only ever reach the live site via the build, never git.)

## Architecture

Three source files: `src/App.jsx` (everything the user sees), plus `src/cloud.js` (Supabase RPC wrappers, link builders, the local "My roadmaps" list) and `src/supabaseClient.js` (client construction from env vars).

`src/App.jsx` key sections (in file order):

| Section | What it does |
|---|---|
| `STORAGE_KEY` / `SCOPE_NAME` | Module-level IIFEs — read `?scope=name` from URL to support named local copies |
| `seedData` | Blank-slate default: 4 columns, 3 generic teams, no items |
| CSV helpers | `parseCsvLine`, `csvToItems`, `itemsToCsv`, `downloadCsv` |
| Share encoding | `encodeShareData` / `decodeShareData` — async, deflate-raw compressed, URL-safe base64 with `z` prefix |
| `extractDate` | Regex-based date pill extraction from item text (e.g. "15 FEB", "Q3 2026") |
| `columnStyles` | Tailwind class tokens keyed by column colour name |
| `TAG_STYLES` / `getTagStyle` / `extractTag` | Country-code badge colours — **clearly sectioned for manual editing** |
| `RoadmapTracker` | Main component — all state, handlers, and JSX |

## Data model

```js
{
  title: string,
  columns: [{ id, title, subtitle, color }],
  teams:   [{ id, name }],
  items:   [{ id, columnId, teamId, tag, text, flag, description,
              links: [{ id, url }] | null,          // jiraUrl / confluenceUrl are legacy, read-only
              startDate, endDate, milestones: [{ id, date, label }] | null }]
}
```

Stored in `localStorage` under key `roadmap-data` (or `roadmap-data-{scope}` for named copies).

## Key behaviours

- **Share links**: `#share=<compressed>` in URL hash → non-destructive read-only preview with option to save as named local copy. Links are deflate-raw compressed to stay short enough for Slack.
- **Named scopes**: `?scope=name` fetches `/name.json` from the public folder and shows it as a read-only preview. If the file doesn't exist, an error screen is shown. To publish a scope: click **Backup**, rename the file to `<scope>.json`, drop it in `public/`, and deploy. Personal saved copies (via "Save & open" in the share banner) are stored in `localStorage` with a `_savedCopy` marker and load even when no matching JSON file exists.
- **Tag auto-detection**: Titles prefixed `FR: …`, `DE/AT: …` etc. split into `tag` + `text` at save time. Country badge colours are in the `TAG_STYLES` constant — easy to extend.
- **Date pills**: Date-like suffixes (e.g. `- Mid APR`, `Q2 2026`) are stripped from display text and shown as a separate pill badge.
- **Expand/collapse**: Clicking an item expands it to show/edit its description and links. Only one item open at a time.
- **Gantt milestones**: `item.milestones` (null when unused) draws diamonds straddling the top edge of the item's bar — hollow while the date is ahead, solid once passed. Positions come from `buildGanttLayout`'s `pxOfDay`, so they can't drift from the bar. Clicking one opens a read-only popover; it is rendered in a **fixed-position overlay outside the Gantt's `overflow-x-auto` body** (drawing it inside a lane gets it clipped) and dismisses on outside click, `Esc`, scroll or resize. Entry is the collapsible **Milestones** section in the item modal, under Timeline, folded on every open. Always write via `writeMilestones` — it sorts by date and collapses an empty list to `null`.
- **Item links**: `item.links` (null when unused) is a free-form list of `{ id, url }`. The badge glyph and colour are **derived from the URL** by `detectLinkProvider` against the `LINK_PROVIDERS` table (first match wins — keep Confluence above Jira), never stored, so the same URL always renders the same badge. Unrecognised hosts get a chain-link badge. Always write via `writeLinks` — it drops empty rows, collapses an empty list to `null`, and clears any legacy `jiraUrl`/`confluenceUrl` it folded in. Read via `getItemLinks`, which is what makes old data (localStorage, backups, share links, published roadmaps, scope JSONs, CSVs) render without a migration pass. Empty modal rows are UI state (`blankLinks`, keyed by throwaway id) and are never persisted. Cards show a single **generic** marker — blue square, white chain-link glyph, no count and no provider letter, identical for every item that has links (the user asked for this explicitly). Provider badges appear only in the modal.
- **Cloud roadmaps**: `?id=…&key=…` edits a Supabase-backed roadmap (debounced auto-save, cached per-roadmap in `localStorage` under `roadmap-cloud-{id}`); `?id=…` alone is a read-only view of the published copy that live-updates when the owner publishes. Independent of `#share=` links and `?scope=`. See **Supabase cloud sync**.
- **Top bar**: sticky (`z-[45]` — above the Gantt's own sticky header at `z-30` and label column at `z-40`, below the modals at `z-50`+). It must stay a **direct child of the `p-6` page container** — a sticky element only sticks inside its own parent's box, so nesting it back under the header block silently unpins it once that block scrolls past. It also carries `-mx-6 -mt-6 px-6` so its background spans the page padding. Only this bar is pinned; the big title and the view tabs scroll away. Burger menu pinned top-left holds Share / CSV / JSON / Help / Reset; the `View ▾` menu on the right holds the two density settings (compact layout, collapse all lanes); cloud status and Publish stay outside as live status. Labels drop below the `sm` breakpoint so the row fits a phone. The roadmap title sits beside the burger as a dashed-underline label — deliberately *not* button-shaped, since it's a title, not a CTA.
- **Collapse all lanes**: one control in the `View ▾` menu, driven by `collapseScopeIds`. Scope is per-view: every team, except in the Impact view, which only touches lanes with items in the selected quarter (teams with nothing that quarter keep whatever state they had). The collapsed set itself is shared across all views — `TEAMS_COLLAPSE_KEY`. Sticky is load-bearing here: it's what keeps the control reachable on a long board.
- **Drag-and-drop**: HTML5 native drag; dragging is disabled while an item is expanded.
- **Migration**: `useEffect` repairs stale `localStorage` data on load (colour renames, orphan team IDs from old CSV imports).
- **Reset**: Always resets to blank `seedData` — does not restore any previous file. Eraser icon, amber — it wipes content only.
- **Delete roadmap**: The destructive twin of Reset (Trash2, red), below it in the burger menu. Destroys the roadmap itself: the Supabase working *and* published rows via the `delete_roadmap` RPC, the local content, the edit key (its "My roadmaps" entry), and the view prefs — with an optional checkbox escalating to a whole-browser wipe of every `roadmap-` key. **The server delete runs first and aborts the whole thing on failure**: the local list entry is the only copy of the edit key, so wiping it before a failed delete strands the roadmap in the cloud, published and unremovable. Gated by a type-`DELETE` modal (no backdrop-click close, Escape ignored while in flight) that offers a JSON backup first. Ends with `window.location.replace` onto the bare URL — a hard reload is what guarantees no in-flight debounced auto-save writes the deleted roadmap back. Local wipes go through `wipeLocalRoadmap` / `wipeAllRoadmapStorage` (top of App.jsx); the latter sweeps by `roadmap-` prefix, so **any new localStorage key must carry that prefix** or it silently survives.

## Supabase cloud sync

Optional, no-login, **capability-key** model — there are no user accounts. Schema lives in `supabase/phase0-schema.sql` (the canonical end state; paste-and-run in the SQL Editor, idempotent). Setup walkthrough is `SUPABASE-SETUP.md`; the design rationale is `SPEC-supabase-sync.md`.

Two tables, two secrets:

| Table | Holds | Capability required |
|---|---|---|
| `roadmap_working` | private draft, auto-saved as you edit | secret **edit key** — 24 random bytes, stored only as a bcrypt hash, returned in raw form exactly once at creation |
| `roadmap_published` | the copy viewers see | the **id** — `r_` + 16 hex, 64 bits of entropy |

URLs: `?id=…&key=…` opens the editable working copy; `?id=…` alone opens the read-only published copy.

### Security model — read this before touching any policy or grant

**Neither table grants any direct access to any role.** Both have RLS enabled with **no policies at all**. Every read and write goes through a `SECURITY DEFINER` function that checks a capability: `create_roadmap`, `load_working`, `save_working`, `publish`, `delete_roadmap` (edit key) and `get_published` (id).

`delete_roadmap` (added 4.32.0, `supabase/migrate-03-delete-roadmap.sql`) removes both rows. It requires the **edit key**, not the id — the capability to change a roadmap is the capability to destroy it; the id alone must never delete. It deletes from `roadmap_published` and `roadmap_working` explicitly rather than relying on the FK cascade, so a project provisioned before that `on delete cascade` clause can't orphan a published row and keep serving a "deleted" roadmap. Note `trg_broadcast_published` is AFTER INSERT OR UPDATE only, so a delete sends no realtime signal: a viewer with the page already open keeps showing stale content until reload.

This is load-bearing, not belt-and-braces. The anon key is public by design — it ships in the JS bundle and is readable by anyone who loads the site — so **a table grant is a public grant**. In v4.25.0 `roadmap_published` carried `for select using (true)` + `grant select to anon`, and because PostgREST does not require a filter, `GET /rest/v1/roadmap_published?select=data` returned every published roadmap to anyone. Found by internal security review; closed in 4.25.0. Do not reintroduce it — and note that an id-only grant is just as bad, because the id *is* the secret.

Consequences to keep in mind when changing this area:

- **Never add a `for select`/`for insert`/`for update` policy or a table `grant` on either table.** New data access = a new `SECURITY DEFINER` function taking a capability argument, granted `execute` to `anon`. After adding one, run `notify pgrst, 'reload schema';` or the RPC 404s.
- **Realtime must stay on Broadcast, never Postgres Changes.** Postgres Changes evaluates RLS as the `anon` role and therefore needs a table select grant — i.e. it cannot coexist with the model above. A trigger (`broadcast_published`) publishes to topic `published:<id>`; the viewer subscribes to that topic (`App.jsx`, "Realtime" effect) and re-reads via `get_published`. The broadcast payload is a **signal only** — broadcast messages are size-capped and a large roadmap would not fit, so never put roadmap data in it.
- **Rotating the anon key fixes nothing.** If a leak is reported, the question is which grant or policy is too broad.
- **Residual risk, accepted by the user:** anyone holding a `?id=` link can read that roadmap indefinitely and there is no audit trail. Inherent to capability URLs. Tightening it further means real auth (Supabase Auth + per-roadmap ownership), which is a much larger change — don't start it uninvited.

### Schema changes need a rollout order

Revoking access breaks any browser tab still running an older bundle, so split anything breaking into additive-then-breaking and put the deploy in between: run the additive SQL → `git push` and deploy **both** sites → run the breaking SQL. `supabase/migrate-01-published-read-rpc.sql` and `migrate-02-revoke-public-read.sql` are the worked example. Verify with curl against the REST endpoint — the unfiltered request must return `permission denied`, the RPC must still return its one row.

## Deployment notes

- `vite.config.js` has `base: '/'` — must match the custom domain root.
- `public/CNAME` contains `roadmap.cadence-x.com` — do not remove or the custom domain breaks.
- `public/roadmap.csv` is the seed CSV loaded on first visit (before any `localStorage` exists). Updating this file and deploying changes what new visitors see.
- `public/sample-roadmap.json` / `public/sample-roadmap.csv` are the try-me fixtures behind the burger menu's **Download sample JSON / CSV**, for testing Restore JSON and Import CSV. A fictional apparel platform ("Threadhouse"), 36 items over 9 workstreams, written to hit every feature: all five flags, all four strategic categories, every outcome type, all three tag-style branches (known `DE`, known combo `FR/DE`, unlisted combo `ES/IT`, unknown single `NL`), every date-pill format, milestones, unscheduled items, a markdown summary, ten link providers plus an unrecognised host, and one item still on legacy `jiraUrl`/`confluenceUrl`. **Only the JSON is hand-edited** — regenerate the CSV with `node scripts/build-sample-csv.mjs`, which reuses the app's own `CSV_ITEM_HEADERS`. That script flattens newlines because `csvToItems` splits on `\n` *before* parsing quotes, so a multi-line description silently splits the record and nulls every field after it (a real importer bug the app's own CSV export also trips over). Links go through `import.meta.env.BASE_URL`, not a leading slash, so they resolve under the company build's `--base=./`.

## Do not break

The user has repeatedly flagged these as critical — never change their behaviour as a side effect of unrelated work:

- **Top-of-screen CTA** — the primary action bar at the top of the board.
- **Sharing** — `handleShare` / `encodeShareData` / `decodeShareData` (App.jsx, "Share encoding" section). The `#share=<compressed>` URL flow must keep working end to end.
- **Saving** — `exportBackup` / `handleBackupImport` (Backup button + JSON import), and the `_savedCopy` path that lets a shared preview be saved as a named local copy in `localStorage`.
- **The Supabase RLS posture** — no policies and no table grants on `roadmap_working` or `roadmap_published`; all access via capability-checked `SECURITY DEFINER` functions. A blanket select policy here exposed every published roadmap to the internet once already (see **Supabase cloud sync**). Realtime stays on Broadcast for the same reason.

If a change touches any of the above, call it out explicitly before making it.

## Version

`APP_VERSION` (App.jsx, top of file) is derived from `package.json`'s `version` field — not hardcoded. Bump `package.json` when deploying significant changes; the footer picks it up automatically.

Before bumping the version for new work, snapshot `src/App.jsx` → `src/App.<current-version>.jsx` (see **Workflow rules**).
