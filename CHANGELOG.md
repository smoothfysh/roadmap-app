# Changelog

Version history for the Roadmap App, newest first.

Each version matches the `version` field in `package.json`, which is shown in the
app footer (e.g. `v4.5.0`). Update this file whenever the version is bumped.

---

## 4.28.0 — 2026-08-13

- **Removed "Drag items to reorder"** from under the status legend at the top — the footer already
  says the same thing. Read-only previews keep their own line there, which isn't a duplicate.
- **Trimmed the ⓘ hint from the footer**, in both the editable and the read-only preview wording.
  "Click a team name to collapse / expand it" no longer trails the icon hint.
- **The status dots moved out of the heading and into the footer help row, with labels** — `● On
  track · ● At risk · ● Blocked`. Beside the heading they were three unlabelled circles whose
  meaning lived in `title` tooltips, which never fire on touch, so on a phone they read as
  decoration. They now sit next to the text that explains the same dots, and show in the read-only
  preview footer too.

## 4.27.0 — 2026-08-13

- **Compact view and Collapse all merged into one `View ▾` menu** in the top bar. They're both
  density controls, but sat at opposite ends of the page — compact view up top, Collapse all at
  the foot of each view.
- **The four `Collapse all` buttons are gone** — three from the bottom of the roadmap, innovation
  and impact views, plus the inline one in the Gantt's Workstream header. One control, one place.
- **Scoping is unchanged.** The Impact view's collapse still only touches lanes with items in the
  selected quarter; every other view still means every team. This now lives in one
  `collapseScopeIds` memo instead of being re-derived per view.
- **The action bar is sticky.** Without it, moving Collapse all to the top would have meant
  scrolling a long board back up to fold the lanes. Sits at `z-[45]` — above the Gantt's own
  sticky header and label column, below the modals. It is a **direct child of the page container**
  by necessity: a sticky element only sticks within its own parent's box, so while it was nested
  in the header block it unpinned as soon as that block scrolled past.
- The title and view tabs are **not** pinned — they scroll away as before. Only the action bar
  stays.
- The View menu only renders where it has something to offer: the compact-layout row is
  roadmap-only, and the whole button hides when there are no lanes to collapse.

## 4.26.0 — 2026-08-13

- **Top bar reworked for mobile.** On a phone the header CTAs bunched together and pushed
  Help off-screen, needing a horizontal scroll to reach it.
- **`Actions ▾` is now a burger icon, pinned top-left** on mobile and desktop alike. Its menu
  opens left-aligned; contents and handlers are unchanged (Undo, Share, CSV, JSON, Reset).
- **Help moved into the burger menu**, above Reset — it's a once-ever click and didn't earn a
  permanent slot in the bar.
- **Labels drop below the `sm` breakpoint.** Compact View becomes its icon alone; Cloud keeps
  the cloud glyph plus a `…`/`!` tell while saving or after a failure; Publish shows `●`/`✓`.
  Full wording returns at `sm` and up, so desktop is unchanged.
- **The roadmap title no longer looks like a button.** It had the same bordered-box chrome as
  the CTAs beside it; it's now a dashed-underline label that still opens on click, and
  truncates instead of squeezing its neighbours.

## 4.25.0 — 2026-08-12

- **Security fix: the published-roadmap table could be dumped by anyone.**
  `roadmap_published` granted `select` to the `anon` role with an RLS policy of
  `using (true)`. PostgREST doesn't require a filter, so
  `GET /rest/v1/roadmap_published?select=data` returned **every** published roadmap — no id
  needed. The anon key is public by design (it ships in the JS bundle), so this was open to
  anyone who loaded the site. Reported by internal security review.
- **Reads now go through a capability-checked function.** The policy and grant are gone;
  `roadmap_published` has RLS on with no policies, matching `roadmap_working`. The new
  `get_published(p_id)` (SECURITY DEFINER, `stable`) returns at most one row and has no
  unfiltered form, so the unguessable `r_<16 hex>` id is once again the only way in.
- **Live updates switched from Postgres Changes to Broadcast.** Postgres Changes evaluates
  RLS as `anon` and so requires exactly the table grant that was removed — and any table
  anon can subscribe to is a table anon can dump. A trigger now broadcasts to topic
  `published:<id>`; the viewer subscribes to that topic and re-reads via `get_published`.
  The payload is a signal only, so large roadmaps can't exceed the broadcast size cap. The
  "Live — updates automatically" indicator behaves exactly as before.
- **Rollout is two SQL steps around the deploy** so no viewer sees a broken roadmap:
  `supabase/migrate-01-published-read-rpc.sql` (additive), then deploy, then
  `supabase/migrate-02-revoke-public-read.sql` (breaking). `phase0-schema.sql` is updated to
  the same end state for fresh projects — re-running the old copy would reopen the hole.
- No change to `#share=` links, Backup/import, or any local-only behaviour.

## 4.24.0 — 2026-08-11

- **Free-form links replace the fixed JIRA/Confluence fields.** The item modal now has a
  single **Links** section: one empty URL field by default, `+ Add link` for as many more as
  you need. Nothing is stored until a URL is typed, and clearing a field removes that link.
- **Badges are derived from the URL.** Paste a Jira link and the badge becomes the blue "J",
  Confluence the "C", Miro a yellow "M" — Figma, GitHub, GitLab, Google Docs/Sheets/Slides/
  Drive/Forms, Looker, Notion, Slack, Teams, SharePoint, OneDrive, Loom, Linear, Asana,
  Trello, Monday, Airtable, Productboard, Amplitude, Condens, YouTube and Zoom are recognised
  too. Anything unrecognised gets a plain chain-link badge. The list is one editable table
  (`LINK_PROVIDERS`) near the tag colours.
- **Cards show one plain marker.** A blue square with a white link glyph, identical whatever
  is attached and however many — no count, no provider letter. Open the item to see the links
  themselves. (Hover gives the count.)
- **Old data keeps working.** Existing `jiraUrl` / `confluenceUrl` values — in localStorage,
  backups, share links, published roadmaps, scope JSONs and CSVs — are read as links with no
  migration step, and are folded into the new list the first time an item's links are edited.
  CSV export gains a `links` column and still writes the two legacy columns.

## 4.23.0 — 2026-08-10

- **Milestones on the Gantt.** Items can now carry key dates inside their timeline, drawn as small
  diamonds straddling the top edge of the bar. Hollow while the date is still ahead, solid once it
  has passed. Positions come from the same day→pixel mapping as the bars, so markers stay glued to
  their bar at every zoom level.
- **Click a diamond for its detail.** A read-only popover opens with the date, the label and the
  item it belongs to, joined to the diamond by a dotted leader line. It's drawn in a fixed overlay
  rather than inside the chart (the Gantt body is a horizontal scroller and would clip it), flips
  below the bar when there's no room above, and closes on outside click, `Esc`, scroll or resize.
- **Milestones section in the item modal.** Sits under Timeline, folded on every open with a count
  badge. Each row is a date picker plus a text field; the list is re-sorted by date on every write.
  Read-only previews show the list with the inputs disabled.
- Milestones closer than 14px nudge apart so each one stays separately clickable when zoomed out,
  and a milestone outside the item's start/end range is pinned to the nearest bar end with a note
  saying so in its popover.
- Collapsed workstream lanes stay plain — no diamonds on the muted summary band.
- Milestones ride through share links, JSON backups and CSV export/import (new `milestones` column,
  holding JSON like `enables` already does). The Details tab now scrolls so a long milestone list
  can't push the modal off-screen.

## 4.22.0 — 2026-08-06

- **Collapsed teams are now one shared setting across every view.** Collapse a team in BY TIME and
  it's also collapsed in BY INNOVATION TYPE, BY IMPACT and the Gantt — one arrangement of who you're
  looking at, not four.
  - The four per-view keys are replaced by a single `roadmap-teams-collapsed-<scope>`.
  - **Existing collapse state is migrated, not lost**: on first load the old per-view keys are merged
    (a team collapsed in *any* view stays collapsed), written to the new key, and removed. Runs once.
  - `Collapse all` / `Expand all` in any view now drives the shared set. In BY IMPACT both directions
    stay scoped to the lanes shown for the selected quarter, so teams with nothing that quarter are
    left as they were rather than being silently expanded.
- Internally the four near-identical state/toggle/persist trios collapse into one
  `collapsedTeams` + `toggleTeamCollapse` + `persistCollapsedTeams`, so all views share one code path.

## 4.21.0 — 2026-08-06

- **"BY IMPACT": swim lanes are now collapsible.** Click a team band to collapse or expand its
  initiatives, with a chevron showing the state.
  - A collapsed band rolls up the view's headline number for that lane — `N initiatives` and
    `M/N with outcome`, turning green once every initiative in the lane has an outcome metric. So you
    can scan outcome coverage team by team without expanding anything.
  - **"Collapse all" / "Expand all"** button below the board. It only counts lanes actually shown for
    the selected quarter, so the label stays correct as you page between quarters.
  - Remembered in `localStorage` per roadmap (`roadmap-impact-collapsed-<scope>`), independent of the
    other views' collapse state.
- Every view with team rows now collapses the same way: BY TIME, BY INNOVATION TYPE, BY IMPACT and
  the Gantt.

## 4.20.0 — 2026-08-06

- **"BY INNOVATION TYPE": swim lanes are now collapsible.** Click a team name in the leftmost cell
  of its lane to collapse or expand it.
  - A chevron in that cell shows the state. Collapsed, the lane shrinks to a thin strip that keeps
    the four category columns aligned and shows a per-category count — so you can still read how a
    team's work is spread across *Do or Die* / *Stay Relevant* / *Beat the Competition* / *Disrupt*
    without expanding it.
  - On mobile (which groups by category instead of showing lanes) the team sub-heading inside each
    category card is the toggle, sharing the same collapsed set so both layouts stay in step.
  - **"Collapse all" / "Expand all"** button below the grid.
  - Remembered in `localStorage` per roadmap (`roadmap-strategic-collapsed-<scope>`), independent of
    the BY TIME board and Gantt collapse state — each view keeps its own arrangement.

## 4.19.0 — 2026-08-06

- **"BY TIME": clicking a team name now collapses that team** instead of opening the details modal.
  - Click toggles collapse ⇄ expand. A chevron on the left shows the state, and a collapsed row
    shows a count of the items hidden in that column.
  - Collapsing applies to the whole team row — all four columns at once — and works in both the
    Compact and aligned layouts.
  - Remembered in `localStorage` per roadmap (`roadmap-board-collapsed-<scope>`), like the Gantt's
    lane collapse. It's a view preference only — never shared, exported or synced.
- **Team details moved to an ⓘ icon** next to the `+` in each team header. Always visible, including
  in read-only shared views, since it's now the only route to the modal (roster, notes, outcome and
  the team rename).
- **"Collapse all" / "Expand all"** button added below the board, beside *Add Team Row*.
- Clicking `+` on a collapsed team, or dropping an item onto one, now expands it first so the result
  isn't hidden.
- Footer help text updated to describe the new team-name and ⓘ behaviour.

## 4.18.0 — 2026-08-05

- **Gantt: the timeline now zooms.** Days can be shown per month, and any column can be drilled into.
  - **Click any header column to drill one step finer**: a half-year splits into its quarters, a
    quarter into its months, a month into **individual days** — day numbers with weekday initials and
    **weekends washed grey**. Drills stack, so clicking AUG then SEP leaves both showing days while
    every other month stays compact. Nesting works too: split Q1 27 into months, then open just FEB.
  - **Click the name above a drilled group to roll it back up** (e.g. "AUG 26" over a run of day
    columns). Rolling up also discards drills nested inside, so re-opening starts one step in.
  - **COMPACT / EXPAND buttons** (top right, next to the legend) are presets: **COMPACT** collapses
    everything back to whole months; **EXPAND** — the default — shows the current quarter day by day.
    Pressing either resets any per-column drilling and re-centres on today.
  - A **TODAY · 5 AUG** pill now sits on the red today line, replacing the bare "Today" tag.
  - The zoom is remembered in `localStorage` (`roadmap-gantt-zoom-<default|scope|cloud-id>`), per
    roadmap, alongside the collapsed-lane state. `EXPAND` is stored as a preset rather than a fixed
    list of months, so it keeps meaning "the current quarter" as the calendar moves on. Like collapse
    state it is a local view preference only — never written into the roadmap data, so sharing,
    backup, export and cloud sync are unaffected.
  - Drilling into a column deliberately does **not** re-centre the view: a drill only widens columns
    to the right of the click, so the column you clicked stays exactly where it was.
- Gridlines now carry a hierarchy: faintest between days, slightly stronger on Mondays, stronger at
  month starts, strongest where the timeline resolution changes. Weekend wash, gridlines and the
  today line are drawn once behind all lanes, so they run continuously down the chart instead of
  being repeated per row.
- Dragging from a workstream label no longer pans the timeline, so click-to-collapse can't be
  misread as a drag.
- Internals: the Gantt layout engine now works in **absolute days → pixels** rather than uniform
  column indices, since columns no longer share a single width. Columns are emitted recursively so a
  drill can nest, and one formula places every bar at any resolution — exact-date placement from
  4.17.0 is preserved at every zoom level (an item that ended yesterday stops flush against the today
  line whether its month is showing days, months, quarters or half-years).

## 4.17.0 — 2026-08-05

- **Fixed: Gantt bars are now placed on their exact dates.** Bars were snapped to quarter-month
  slots (roughly week-sized), with end dates rounded *up* to the right edge of their slot — so
  anything ending on the 1st–8th of a month was drawn as if it ended on the 8th. Combined with a
  today marker drawn at the exact day, an item that finished *yesterday* visibly stuck out past
  the red line, and items ending on the 1st, the 4th and today all rendered in the same place.
  Start/end positions now use the exact day-of-month, so:
  - an item that ended yesterday stops flush against the today marker;
  - an item ending today extends just past it (the day isn't over — it isn't late yet);
  - dates within the same week are now visually distinct.
- **Short bars no longer spill past their end date.** A bar too narrow to meet the 10px minimum
  width now grows *leftward* instead of rightward, so a one- or two-day item can't overshoot the
  today marker. Same rule applies to the collapsed-lane summary band.
- Removed the old "minimum quarter-month span" inflation, which stretched short items forward by
  up to a week. Reversed start/end dates are now swapped cleanly rather than approximated.

## 4.16.1 — 2026-08-05

- **Fixed: the Gantt "today" marker could show a stale date.** The timeline layout read the
  current date inside a `useMemo` keyed only on the items array, so "today" was frozen at the
  moment the layout was first computed — a tab left open past midnight kept drawing the old
  line, and on a published/preview roadmap (where the items never change locally) it stayed at
  page-load date for the life of the tab. The current date is now state that re-reads as the day
  rolls over, checked on a 1-minute tick plus on tab focus/visibility change (background tabs
  throttle timers, so the tick alone isn't enough). The marker's placement maths was already
  correct and is unchanged.

## 4.16.0 — 2026-08-05

- **Gantt swim lanes are now collapsible.** Click anywhere in a workstream's label cell in the
  Gantt view to collapse that lane; click again to expand it. The whole cell is the hit area
  (not just the text), with a subtle hover highlight.
  - All lanes are **expanded by default**.
  - A collapsed lane stays visible as a slim muted band spanning that workstream's overall
    date range, with an "N items hidden" note next to the name — so the row still shows *when*
    the work sits without listing every item.
  - **Collapse all / Expand all** button in the "Workstream" header cell, for isolating a
    single lane quickly.
- Collapse state is remembered in `localStorage` only (key
  `roadmap-gantt-collapsed-<default|scope|cloud-id>`) — it is a per-browser view preference and
  is never written into the roadmap data, so it doesn't affect sharing, backup, export or cloud
  sync. Each scoped/cloud roadmap keeps its own collapse state.

## 4.15.0 — 2026-07-29

- **Publish now sanity-checks the live version before overwriting it.** In cloud edit mode
  (`?id=…&key=…`), clicking **PUBLISH** first re-reads the published copy:
  - If nothing newer is live, it publishes immediately — same one-click behaviour as before.
  - If someone published *after* this session opened the roadmap (e.g. you edited on another
    machine and forgot), a confirm modal appears showing when the live version was published,
    when your version was loaded, and an items/teams/columns comparison — with
    **Overwrite anyway** / **Cancel**, and a pointer to *↩ Revert to published*.
  - If the check can't run (offline / read failed), it says so rather than publishing blind,
    and lets you proceed anyway.
- The check compares two **server-issued** `published_at` stamps (the one recorded at load vs
  the one read at click time), so a drifted local clock can't skew it. Identical published
  content is treated as safe even if the stamp moved, to avoid false warnings.
- `cloud.js`: added `loadPublishedRow()` (returns `data` + `published_at`); `loadPublished()`
  is unchanged for existing callers. *Revert to published* now also refreshes the baseline stamp.
- Publish buttons show a brief **Checking…** state during the pre-publish read.

## 4.14.0 — 2026-07-27

- **Redesigned the Gantt view** for a cleaner, wider timeline:
  - **Variable-resolution columns** — individual months for the previous/current/next quarter,
    then the two nearest future quarters, then calendar half-years further out (and coarse
    quarters for any past items). Near-term is detailed, far-term is compressed.
  - **Full browser width** — dropped the `max-w-[1400px]` cap so the board fills the viewport.
  - **Default scroll** now lands on the last month of the previous quarter (≈1 month of
    back-history + the current quarter), still scrollable both directions.
  - **Two-line workstream labels** — a team name like `AUTHENTICATION (aka FIREFLY)` renders as
    a bold main name (`Authentication`) with a lighter codename (`Firefly`) beneath it. This
    parsing/casing is Gantt-only; stored team names are unchanged.
  - **Pastel status bars** — soft fill + coloured left accent + right-aligned grey country tag,
    replacing the saturated solid bars. Colours still map to status (this mapping is local to
    the Gantt view; other views are untouched).
  - Collapsed the 3-row header (year/quarter/month) into a single column-label row.
  - **Today marker** — a thin vertical red line (with a `Today` tag in the header) marks the
    current date across all rows.
  - **Drag-to-pan** — click and drag anywhere on the empty timeline to scroll left/right;
    starting the drag on a bar still opens that item.
  - **Default scroll centres the current month** in the visible area (clamped to the left edge
    when there isn't enough history to fully centre it).
  - Bumped the item bar height slightly for legibility.

## 4.13.0 — 2026-07-20

- Added SEO/discoverability metadata to `index.html`: `description`, `classification`,
  `category`, and `keywords` meta tags, plus a `SoftwareApplication` JSON-LD schema block
  (name, url, description, category, author, offer, feature list, audience, keywords).

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
