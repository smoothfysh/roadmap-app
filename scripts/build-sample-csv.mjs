// Generate public/sample-roadmap.csv from public/sample-roadmap.json.
//
// The two sample files must describe the same roadmap, so only the JSON is edited by
// hand — run this afterwards to regenerate the CSV:
//
//   node scripts/build-sample-csv.mjs
//
// CSV_ITEM_HEADERS and the escaping rules below are a deliberate copy of itemsToCsv in
// src/App.jsx. If that header list changes, change it here too — a sample CSV whose
// columns don't match the importer is worse than no sample at all.
//
// Note what the CSV format cannot carry: title, heading, summary, columns and teams are
// all item-level-only omissions. csvToItems returns items and nothing else, and the
// importer invents teams from the teamId strings. That asymmetry is the point of
// shipping both files — the JSON restores a whole roadmap, the CSV adds rows to one.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "public", "sample-roadmap.json");
const out = join(here, "..", "public", "sample-roadmap.csv");

const CSV_ITEM_HEADERS = ["id", "columnId", "teamId", "tag", "text", "flag", "description", "links", "jiraUrl", "confluenceUrl", "strategicCategory", "revenueType", "revenueUplift", "revenueStream", "enablerNote", "enables", "savingAmount", "savingKind", "savingArea", "cadence", "startDate", "endDate", "milestones", "outcomeMax", "metricName", "metricDir", "metricValue", "metricUnit", "strategicNote"];

// Newlines are flattened to spaces before escaping. This is NOT cosmetic: csvToItems
// does `csvText.split(/\r?\n/)` BEFORE it parses quotes, so a newline inside a quoted
// field splits the row in two. The tail of the record then lands in a phantom row and
// every field after `description` reads back as null. Verified — with paragraph breaks
// left in, these 36 items parse as 44 rows and lose their dates, links and milestones.
//
// So the sample CSV must be single-line-per-record to be importable at all. (The same
// limitation applies to the app's own CSV export: an item with a multi-line description
// exports fine and re-imports broken. That's a bug in the importer, not here.)
const escape = (val) => {
  const s = val === null || val === undefined ? "" : String(val).replace(/\s*\n+\s*/g, " ").trim();
  if (s.includes(",") || s.includes('"')) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const { items } = JSON.parse(readFileSync(src, "utf8"));

const rows = items.map((i) => CSV_ITEM_HEADERS.map((h) => {
  if (h === "enables")    return escape(i.enables?.length    > 0 ? JSON.stringify(i.enables)    : null);
  if (h === "milestones") return escape(i.milestones?.length > 0 ? JSON.stringify(i.milestones) : null);
  if (h === "links")      return escape(i.links?.length      > 0 ? JSON.stringify(i.links)      : null);
  return escape(i[h]);
}).join(","));

writeFileSync(out, [CSV_ITEM_HEADERS.join(","), ...rows].join("\n") + "\n", "utf8");
console.log(`Wrote ${out} — ${items.length} items, ${CSV_ITEM_HEADERS.length} columns.`);
