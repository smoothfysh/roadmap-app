# Roadmap App — Claude Context

## Project overview

Single-file React kanban board for sharing team roadmaps. All application logic lives in `src/App.jsx`. No backend — data persists in `localStorage` only.

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

## Architecture

Everything is in `src/App.jsx`. Key sections (in file order):

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
  items:   [{ id, columnId, teamId, tag, text, flag, description, jiraUrl, confluenceUrl }]
}
```

Stored in `localStorage` under key `roadmap-data` (or `roadmap-data-{scope}` for named copies).

## Key behaviours

- **Share links**: `#share=<compressed>` in URL hash → non-destructive read-only preview with option to save as named local copy. Links are deflate-raw compressed to stay short enough for Slack.
- **Named scopes**: `?scope=name` fetches `/name.json` from the public folder and shows it as a read-only preview. If the file doesn't exist, an error screen is shown. To publish a scope: click **Backup**, rename the file to `<scope>.json`, drop it in `public/`, and deploy. Personal saved copies (via "Save & open" in the share banner) are stored in `localStorage` with a `_savedCopy` marker and load even when no matching JSON file exists.
- **Tag auto-detection**: Titles prefixed `FR: …`, `DE/AT: …` etc. split into `tag` + `text` at save time. Country badge colours are in the `TAG_STYLES` constant — easy to extend.
- **Date pills**: Date-like suffixes (e.g. `- Mid APR`, `Q2 2026`) are stripped from display text and shown as a separate pill badge.
- **Expand/collapse**: Clicking an item expands it to show/edit description, JIRA URL, and Confluence URL. Only one item open at a time.
- **Drag-and-drop**: HTML5 native drag; dragging is disabled while an item is expanded.
- **Migration**: `useEffect` repairs stale `localStorage` data on load (colour renames, orphan team IDs from old CSV imports).
- **Reset**: Always resets to blank `seedData` — does not restore any previous file.

## Deployment notes

- `vite.config.js` has `base: '/'` — must match the custom domain root.
- `public/CNAME` contains `roadmap.cadence-x.com` — do not remove or the custom domain breaks.
- `public/roadmap.csv` is the seed CSV loaded on first visit (before any `localStorage` exists). Updating this file and deploying changes what new visitors see.

## Version

Footer displays `v1.0.0` (hardcoded in the JSX footer). Bump manually when deploying significant changes.
