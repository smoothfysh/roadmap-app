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
// The generated file is round-tripped back through the real csvToItems as part of the
// CSV test, so a drift between the two shows up as a failing field comparison.
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

// Identical to itemsToCsv's escaping in src/App.jsx — quote anything containing a comma,
// a quote or a newline, and double up embedded quotes.
//
// Multi-line descriptions are preserved as-is. Until 4.34.0 they had to be flattened to
// spaces here, because csvToItems split records on newlines before parsing quotes and a
// quoted newline tore the record in half. splitCsvRecords fixed that, so the sample CSV
// now carries the same paragraph breaks as the sample JSON.
const escape = (val) => {
  const s = val === null || val === undefined ? "" : String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
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
