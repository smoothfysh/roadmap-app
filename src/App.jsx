import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, GripVertical, X, Circle, Download, Upload, Share2, ExternalLink, ChevronLeft, ChevronRight, Repeat, Rows3 } from "lucide-react";
import { version } from "../package.json";

// Single app-wide version shown in every tab footer — sourced from package.json.
// Bump the "version" field there on significant changes.
const APP_VERSION = `v${version}`;

// Centered app title shown at the top of every tab.
const APP_TITLE = "The best-laid plans of mice and men often go awry";

// ---------- Per-scope storage key (supports ?scope=name in URL) ----------
const STORAGE_KEY = (() => {
  try {
    const s = new URLSearchParams(window.location.search).get("scope");
    return s ? `roadmap-data-${s}` : "roadmap-data";
  } catch { return "roadmap-data"; }
})();

const SCOPE_NAME = (() => {
  try { return new URLSearchParams(window.location.search).get("scope") || null; } catch { return null; }
})();

const LOCATION_URL = (() => {
  try { return new URLSearchParams(window.location.search).get("location") || null; } catch { return null; }
})();

// ---------- Seed data ----------
const seedData = {
  title: "My Roadmap",
  heading: APP_TITLE,
  columns: [
    { id: "done", title: "DONE", subtitle: "Released stuff... already LIVE!", color: "green" },
    { id: "coming", title: "COMING SOON", subtitle: "Q2 2026", color: "blue" },
    { id: "after", title: "AFTER THAT", subtitle: "Q3 2026", color: "amber" },
    { id: "future", title: "FUTURE", subtitle: "Beyond the next 6 months", color: "slate" },
  ],
  teams: [
    { id: "team_a", name: "TEAM A" },
    { id: "team_b", name: "TEAM B" },
    { id: "team_c", name: "TEAM C" },
  ],
  items: [],
};

// ---------- CSV helpers ----------
function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function csvToItems(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cells[i] !== undefined ? cells[i].trim() : ""; });
    return {
      id: obj.id, columnId: obj.columnId, teamId: obj.teamId,
      tag: obj.tag, text: obj.text, flag: obj.flag === "" ? null : obj.flag,
      description: obj.description || null,
      jiraUrl: obj.jiraUrl || null,
      confluenceUrl: obj.confluenceUrl || null,
      strategicCategory: obj.strategicCategory || null,
      revenueType:       obj.revenueType || null,
      revenueUplift:     obj.revenueUplift ? Number(obj.revenueUplift) : null,
      revenueStream:     obj.revenueStream || null,
      enablerNote:       obj.enablerNote || null,
      enables:           (() => { try { return obj.enables ? JSON.parse(obj.enables) : null; } catch { return null; } })(),
      savingAmount:      obj.savingAmount ? Number(obj.savingAmount) : null,
      savingKind:        obj.savingKind || null,
      savingArea:        obj.savingArea || null,
      cadence:           obj.cadence || null,
      startDate:         obj.startDate || null,
      endDate:           obj.endDate || null,
      outcomeMax:        obj.outcomeMax ? Number(obj.outcomeMax) : null,
      metricName:        obj.metricName || null,
      metricDir:         obj.metricDir || null,
      metricValue:       obj.metricValue ? Number(obj.metricValue) : null,
      metricUnit:        obj.metricUnit || null,
      strategicNote:     obj.strategicNote || null,
    };
  });
}

function itemsToCsv(items) {
  const headers = CSV_ITEM_HEADERS;
  const escape = (val) => {
    const s = val === null || val === undefined ? "" : String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const rows = items.map((i) => headers.map((h) => {
    if (h === "enables") return escape(i.enables?.length > 0 ? JSON.stringify(i.enables) : null);
    return escape(i[h]);
  }).join(","));
  return [headers.join(","), ...rows].join("\n");
}

const CSV_ITEM_HEADERS = ["id", "columnId", "teamId", "tag", "text", "flag", "description", "jiraUrl", "confluenceUrl", "strategicCategory", "revenueType", "revenueUplift", "revenueStream", "enablerNote", "enables", "savingAmount", "savingKind", "savingArea", "cadence", "startDate", "endDate", "outcomeMax", "metricName", "metricDir", "metricValue", "metricUnit", "strategicNote"];

function downloadCsv(items, filename = "roadmap.csv") {
  const csv = itemsToCsv(items);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click();
  document.body.removeChild(link); URL.revokeObjectURL(url);
}

// ---------- Share encoding — deflate-compressed URL-safe base64 ----------
// Compressed links are ~5-10x shorter than raw JSON, keeping URLs short enough for Slack.
// "z" prefix marks the compressed format; old uncompressed links still decode via fallback.
async function encodeShareData(d) {
  const json = JSON.stringify(d);
  if (typeof CompressionStream !== "undefined") {
    try {
      const cs = new CompressionStream("deflate-raw");
      const writer = cs.writable.getWriter();
      writer.write(new TextEncoder().encode(json));
      writer.close();
      const buf = await new Response(cs.readable).arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      bytes.forEach((b) => (binary += String.fromCharCode(b)));
      return "z" + btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    } catch { /* fall through */ }
  }
  // Fallback: plain URL-safe base64 (no compression)
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function decodeShareData(str) {
  // Compressed format (z-prefix)
  if (str.startsWith("z")) {
    try {
      const b64 = str.slice(1).replace(/-/g, "+").replace(/_/g, "/");
      const padded = b64 + "==".slice(0, (4 - (b64.length % 4)) % 4);
      const binary = atob(padded);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const ds = new DecompressionStream("deflate-raw");
      const writer = ds.writable.getWriter();
      writer.write(bytes);
      writer.close();
      return JSON.parse(await new Response(ds.readable).text());
    } catch { return null; }
  }
  // URL-safe base64 (previous version, no compression)
  try {
    const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "==".slice(0, (4 - (b64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    // Oldest format: btoa(encodeURIComponent(json))
    try { return JSON.parse(decodeURIComponent(atob(str))); } catch { return null; }
  }
}

// ---------- Status history helpers ----------
const FLAG_LABELS = { warning: "At Risk", risk: "Blocked", completed: "Done", done: "Deprioritised" };

// ---------- Revenue helpers ----------
function formatUplift(val) {
  if (val == null) return null;
  if (val >= 1_000_000) return `€${parseFloat((val / 1_000_000).toFixed(1))}M`;
  if (val >= 1_000)     return `€${Math.round(val / 1_000)}K`;
  return `€${val}`;
}

// ---------- Outcome metric helpers (the "by IMPACT" view) ----------
// An item's outcome has two independent axes that can both be set at once:
//   1. a quantified VALUE — Revenue (€), a KPI Metric, or a Cost Saving (mutually exclusive)
//   2. an ENABLES/SUPPORTS note — what it unlocks: a strategic KR or another topic (free text)
// Icon + chip colour per outcome flavour. Dashed border marks the qualitative enables chip.
const OUTCOME_STYLES = {
  direct:  { icon: "💶", chip: "border-green-200 bg-green-50 text-green-800" },
  metric:  { icon: "📈", chip: "border-sky-200 bg-sky-50 text-sky-800" },
  saving:  { icon: "💰", chip: "border-teal-200 bg-teal-50 text-teal-800" },
  enables: { icon: "🔓", chip: "border-violet-200 bg-violet-50 text-violet-800 border-dashed" },
};

// Quantified value-type labels + active-button styling, used by the modal value-type picker.
const VALUE_TYPES = [
  { val: null,     label: "None",          active: "border-stone-400 bg-stone-100 text-stone-900" },
  { val: "direct", label: "💶 Revenue",     active: "border-green-600 bg-green-50 text-green-800"  },
  { val: "metric", label: "📈 Metric",      active: "border-sky-500 bg-sky-50 text-sky-800"        },
  { val: "saving", label: "💰 Cost Saving", active: "border-teal-500 bg-teal-50 text-teal-800"     },
];

// Cadence → trailing suffix shown after a € amount on the outcome chip.
const CADENCE_SUFFIX = { once: "one-time", recurring: "recurring", month: "/ month", year: "/ year", incremental: "incremental" };
const METRIC_UNITS   = ["%", "pp", "#", "x"];

// Format a € amount or a min–max range, sharing the K/M suffix when possible: (10000, 25000) -> "€10–25K".
function formatRange(min, max) {
  if (min == null) return null;
  if (max == null || max === min) return formatUplift(min);
  const a = formatUplift(min), b = formatUplift(max);
  const sa = (a.match(/[KM]$/) || [])[0];
  const sb = (b.match(/[KM]$/) || [])[0];
  if (sa && sa === sb) return `${a.replace(/[KM]$/, "")}–${b.replace("€", "")}`;
  return `${a}–${b}`;
}

// All outcome chips for an item → array of { icon, chip, label?, value?, suffix? }.
// May contain a value chip and/or an "enables" chip; empty array when nothing is set.
// Shared by the "by IMPACT" board and the modal live preview so both always agree.
function outcomeChips(item) {
  const chips = [];
  const t = item.revenueType;
  if (t === "direct") {
    const value = formatRange(item.revenueUplift, item.outcomeMax);
    if (value) chips.push({ ...OUTCOME_STYLES.direct, value, suffix: CADENCE_SUFFIX[item.cadence] || null });
  } else if (t === "saving") {
    const value = formatUplift(item.savingAmount);
    if (value) chips.push({ ...OUTCOME_STYLES.saving, value: `${value} saved`, suffix: CADENCE_SUFFIX[item.cadence] || null });
  } else if (t === "metric" && item.metricName) {
    const arrow = item.metricDir === "down" ? "↓" : "↑";
    const sign  = item.metricDir === "down" ? "−" : "+";
    const unit  = item.metricUnit === "x" ? "×" : (item.metricUnit || "");
    const value = item.metricValue != null ? `${sign}${item.metricValue}${unit}` : null;
    chips.push({ ...OUTCOME_STYLES.metric, label: `${arrow} ${item.metricName}`, value });
  }
  // enablerNote is the merged "enables / supports" note; fall back to the legacy strategicNote
  // field so old share links / scope JSONs that predate the merge still render their chip.
  const note = item.enablerNote || item.strategicNote;
  if (note) chips.push({ ...OUTCOME_STYLES.enables, label: note });
  return chips;
}

// ---------- Strategic view categories ----------
const STRATEGIC_CATEGORIES = [
  { id: "do-or-die",        label: "Do or Die",            image: "/animal-dino.png",    headerBg: "bg-pink-300",   headerText: "text-pink-950",   bodyBg: "bg-pink-50"   },
  { id: "stay-relevant",    label: "Stay Relevant",        image: "/animal-bird.png",    headerBg: "bg-yellow-300", headerText: "text-yellow-950", bodyBg: "bg-yellow-50" },
  { id: "beat-competition", label: "Beat the Competition", image: "/animal-lion.png",    headerBg: "bg-sky-300",    headerText: "text-sky-950",    bodyBg: "bg-sky-50"    },
  { id: "disrupt",          label: "Disrupt",              image: "/animal-unicorn.png", headerBg: "bg-violet-300", headerText: "text-violet-950", bodyBg: "bg-violet-50" },
];

const STATUS_OPTIONS = [
  { flag: null,        label: "On Track",     dot: "text-stone-300" },
  { flag: "warning",   label: "At Risk",      dot: "fill-amber-400 text-amber-400" },
  { flag: "risk",      label: "Blocked",      dot: "fill-rose-500 text-rose-500" },
  { flag: "completed", label: "Done",         dot: "fill-emerald-500 text-emerald-500" },
  { flag: "done",      label: "Deprioritised",dot: "fill-gray-400 text-gray-400" },
];
const FLAG_COLORS = {
  warning:   "text-amber-600",
  risk:      "text-rose-600",
  completed: "text-emerald-600",
  done:      "text-stone-400",
};

function formatHistoryDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1)  return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24)  return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7)  return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

// ---------- Date extraction ----------
// Pull a date-ish token out of the text for display as a pill.
// Handles: "15 FEB", "05 JAN", "31 MAR", "Mid APR", "End of JUNE",
// "Q4 2025", "Q3 2026", "25MAR" (no space), month-only "MAY",
// and trailing parentheticals like "MAY (was 25MAR)".
// Returns { date: string|null, cleanText: string }
function extractDate(text) {
  if (!text) return { date: null, cleanText: text };

  const months = "JAN|FEB|MAR|APR|MAY|JUN|JUNE|JUL|JULY|AUG|SEP|SEPT|OCT|NOV|DEC|JANUARY|FEBRUARY|MARCH|APRIL|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER";
  const sep = `\\s*[-–,]?\\s*(?:by\\s+)?`;
  const trailing = `(?:\\s*\\([^)]*\\))?\\s*$`;

  const patterns = [
    new RegExp(`${sep}(Q[1-4]\\s+\\d{4})${trailing}`, "i"),
    new RegExp(`${sep}(\\d{1,2}\\s+(?:${months}))${trailing}`, "i"),
    new RegExp(`${sep}(\\d{1,2}(?:${months}))${trailing}`, "i"),
    new RegExp(`${sep}((?:Mid|Early|Late|End of|Beginning of)\\s+(?:${months}))${trailing}`, "i"),
    new RegExp(`\\s+[-–]\\s+(?:by\\s+)?((?:${months}))${trailing}`, "i"),
  ];

  for (const re of patterns) {
    const match = text.match(re);
    if (match) {
      return {
        date: match[1].trim().toUpperCase().replace(/\s+/g, " "),
        cleanText: text.slice(0, match.index).trim().replace(/[-–,]\s*$/, "").trim(),
      };
    }
  }
  return { date: null, cleanText: text };
}

const MONTHS_ABBR = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const GANTT_LABEL_W = 190;        // sticky team-label column width (px)
const GANTT_VISIBLE_MONTHS = 9;   // prev + current + next quarter fill the viewport
const GANTT_MIN_COL = 60;         // floor so months stay readable on small screens
const MONTH_QUARTER = { JAN: "Q1", FEB: "Q1", MAR: "Q1", APR: "Q2", MAY: "Q2", JUN: "Q2", JUL: "Q3", AUG: "Q3", SEP: "Q3", OCT: "Q4", NOV: "Q4", DEC: "Q4" };

// "2026-06-15" -> "15 JUN" (the due-date pill). Null for empty/invalid input.
function formatDatePill(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return null;
  return `${d} ${MONTHS_ABBR[m - 1]}`;
}

// Due-date pill + clean title for an item. Prefers the End date; falls back to a
// date parsed out of the title (legacy items / published JSONs that embed the date).
function getItemDisplay(item) {
  const { date, cleanText } = extractDate(item.text);
  const pill = (item.endDate && formatDatePill(item.endDate)) || date;
  return { pill, cleanText };
}

// First working day of the quarter that `iso` falls in, e.g. "2026-06-15" -> "2026-04-01".
// If the 1st of the quarter's first month is a weekend, roll forward to the Monday.
function quarterStartWorkingDay(iso) {
  const [y, m] = iso.split("-").map(Number);
  const qMonth = Math.floor((m - 1) / 3) * 3 + 1; // 1, 4, 7 or 10
  const dow = new Date(y, qMonth - 1, 1).getDay(); // 0=Sun … 6=Sat
  const day = dow === 0 ? 2 : dow === 6 ? 3 : 1;   // Sun→Mon(2nd), Sat→Mon(3rd)
  return `${y}-${String(qMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Quarter token (e.g. "Q2") found in a column's subtitle/title, or null.
function getColumnQuarter(col) {
  const m = col ? `${col.subtitle || ""} ${col.title || ""}`.match(/Q[1-4]/i) : null;
  return m ? m[0].toUpperCase() : null;
}

// 3-letter month for an item: from its End date if set, else from its title date.
function getItemMonth(item) {
  if (item.endDate) {
    const mm = Number(item.endDate.split("-")[1]);
    if (mm >= 1 && mm <= 12) return MONTHS_ABBR[mm - 1];
  }
  const { date } = extractDate(item.text);
  const m = date && date.match(/JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC/i);
  return m ? m[0].slice(0, 3).toUpperCase() : null;
}

// The quarter an item belongs to: its column's quarter, else derived from its End
// date / title date (used to place DONE items in a quarter and build the badge).
function getItemQuarter(item, columns) {
  const colQ = getColumnQuarter(columns.find((c) => c.id === item.columnId));
  if (colQ) return colQ;
  const month = getItemMonth(item);
  if (month) return MONTH_QUARTER[month];
  const { date } = extractDate(item.text);
  const dateQ = date && date.match(/Q[1-4]/i);
  return dateQ ? dateQ[0].toUpperCase() : null;
}

// One-time vs recurring picker for an item's revenue uplift / cost saving (field: `cadence`).
function CadenceToggle({ value, disabled, onSelect }) {
  const opts = [
    { val: "once",      label: "One-time",  icon: <span className="font-bold text-[11px] leading-none">1×</span> },
    { val: "recurring", label: "Recurring", icon: <Repeat className="w-3 h-3" /> },
  ];
  return (
    <div className="flex gap-2">
      {opts.map((o) => (
        <button key={o.val} disabled={disabled}
          onClick={disabled ? undefined : () => onSelect(value === o.val ? null : o.val)}
          className={`inline-flex items-center gap-1.5 text-[10px] font-mono px-3 py-1.5 rounded border transition-colors ${
            value === o.val
              ? "border-stone-400 bg-stone-100 text-stone-900 font-bold"
              : "border-stone-200 text-stone-500 hover:border-stone-400 hover:text-stone-700"
          }`}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Color tokens per column ----------
const columnStyles = {
  green: {
    header: "bg-emerald-400", headerText: "text-emerald-950",
    body: "bg-emerald-50", section: "bg-emerald-300",
    item: "bg-white border-emerald-200 hover:border-emerald-400",
    addBtn: "bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border-emerald-300",
  },
  blue: {
    header: "bg-sky-300", headerText: "text-sky-950",
    body: "bg-sky-50", section: "bg-sky-100",
    item: "bg-white border-sky-200 hover:border-sky-400",
    addBtn: "bg-sky-100 hover:bg-sky-200 text-sky-900 border-sky-300",
  },
  amber: {
    header: "bg-amber-300", headerText: "text-amber-950",
    body: "bg-violet-50", section: "bg-violet-100",
    item: "bg-white border-violet-200 hover:border-violet-400",
    addBtn: "bg-violet-100 hover:bg-violet-200 text-violet-900 border-violet-300",
  },
  rose: {
    header: "bg-rose-300", headerText: "text-rose-950",
    body: "bg-amber-50", section: "bg-amber-100",
    item: "bg-white border-amber-200 hover:border-amber-400",
    addBtn: "bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300",
  },
  slate: {
    header: "bg-slate-300", headerText: "text-slate-800",
    body: "bg-slate-50", section: "bg-slate-100",
    item: "bg-white border-slate-200 hover:border-slate-400",
    addBtn: "bg-slate-100 hover:bg-slate-200 text-slate-900 border-slate-300",
  },
};

const flagStyles = {
  warning:   "bg-amber-200 border-amber-400",
  risk:      "bg-rose-200 border-rose-400",
  completed: "bg-emerald-100 border-emerald-400",
  done:      "bg-gray-300 border-gray-400 line-through text-gray-600",
  null: "",
};

// ---------- Tag colour tokens — edit these to adjust country badge colours ----------
const TAG_STYLES = {
  "FR":    "bg-red-600 text-white",
  "DE":    "bg-yellow-400 text-black",
  "AT":    "bg-blue-600 text-white",
  "FR/DE": "bg-slate-800 text-white",
  "DE/FR": "bg-slate-800 text-white",
};
const TAG_COMBO_STYLE   = "bg-slate-700 text-white";                         // any unlisted multi-country combo (e.g. FR/AT)
const TAG_UNKNOWN_STYLE = "bg-white border border-stone-400 text-stone-700"; // single unrecognised country — styled like a date pill
// ------------------------------------------------------------------------------------

function getTagStyle(tag) {
  if (!tag) return null;
  if (TAG_STYLES[tag]) return TAG_STYLES[tag];
  if (tag.includes("/")) return TAG_COMBO_STYLE;
  return TAG_UNKNOWN_STYLE;
}

// ---------- Tag extraction from item title ----------
// Recognises prefixes like "FR: title", "DE: title", "FR/DE: title"
// Country codes must be 2–3 uppercase letters; combinations separated by /
function extractTag(text) {
  const match = text.match(/^([A-Z]{2,3}(?:\/[A-Z]{2,3})*)\s*:\s*(.+)$/);
  if (match) return { tag: match[1], text: match[2].trim() };
  return { tag: null, text };
}

export default function RoadmapTracker() {
  const [data, setData] = useState(seedData);
  const [loading, setLoading] = useState(true);
  const [dragItem, setDragItem] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [dragOverSection, setDragOverSection] = useState(null);
  const [addingTo, setAddingTo] = useState(null); // { columnId, teamId }
  const [newItemText, setNewItemText] = useState("");
  const [expandedItem, setExpandedItem] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, text }
  const [flagPickerOpen, setFlagPickerOpen] = useState(null); // item id
  const [activeView, setActiveView] = useState("roadmap"); // "roadmap" | "strategic" | "revenue" | "impact" | "gantt"
  // "BY TIME" layout toggle. Compact ON (default) = each column flows independently (original layout).
  // Compact OFF = team rows align to the same level across all columns. Persisted across visits.
  const [compactView, setCompactView] = useState(() => {
    try {
      const v = localStorage.getItem("roadmap-compact-view");
      return v === null ? true : v === "true";
    } catch { return true; }
  });
  const [ganttColW, setGanttColW] = useState(96); // month column width, sized so ~9 months fill the viewport
  const [modalTab, setModalTab] = useState("details"); // "details" | "outcome"
  const initialModalTabRef = useRef("details"); // tab to land on when the modal next opens (reset after use)
  const [impactColIdx, setImpactColIdx] = useState(1);   // index into displayData.columns for the "by IMPACT" quarter navigator
  const [editingSubtitle, setEditingSubtitle] = useState(null);
  const [editingTeam, setEditingTeam] = useState(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingHeading, setEditingHeading] = useState(false);
  const [sharedPreview, setSharedPreview] = useState(null);
  const [saveCopyName, setSaveCopyName] = useState("");
  const [shareCopied, setShareCopied] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [scopeError, setScopeError] = useState(null);
  const [locationError, setLocationError] = useState(false);
  const fileInputRef = useRef(null);
  const backupInputRef = useRef(null);
  const ganttHeaderRef = useRef(null);
  const ganttBodyRef = useRef(null);

  // Load from localStorage if available, else fetch CSV seed
  useEffect(() => {
    (async () => {
      // Detect share link in URL hash
      const hash = window.location.hash;
      if (hash.startsWith("#share=")) {
        const decoded = await decodeShareData(hash.slice(7));
        if (decoded?.columns && decoded?.teams && decoded?.items) {
          setSharedPreview(decoded);
          // Remove hash from URL so refresh doesn't re-trigger the preview
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        }
      }

      // If a ?location= URL is provided, fetch the JSON from that external URL.
      if (LOCATION_URL) {
        let loaded = false;
        try {
          const res = await fetch(LOCATION_URL);
          if (res.ok) {
            const text = await res.text();
            const parsed = JSON.parse(text);
            if (parsed?.columns && parsed?.teams && parsed?.items) {
              parsed.columns = parsed.columns.map((c) =>
                c.id === "future" && c.color === "rose" ? { ...c, color: "slate" } : c
              );
              if (!parsed.title) parsed.title = seedData.title;
              const knownTeamIds = new Set(parsed.teams.map((t) => t.id));
              const orphanIds = [...new Set(
                parsed.items.filter((i) => i.teamId && !knownTeamIds.has(i.teamId)).map((i) => i.teamId)
              )];
              orphanIds.forEach((id) =>
                parsed.teams.push({ id, name: id.toUpperCase().replace(/[-_]/g, " ") })
              );
              setData(parsed);
              setSharedPreview(parsed);
              loaded = true;
            }
          }
        } catch { /* network error, CORS, or invalid JSON */ }

        if (!loaded) setLocationError(true);
        setLoading(false);
        return;
      }

      // If a scope is set, the CSV file is the source of truth — check it before localStorage.
      // This ensures colleagues always see the latest pushed file, and stale cached data
      // from previous visits cannot mask a missing-file error.
      if (SCOPE_NAME) {
        let scopeLoaded = false;
        try {
          const res = await fetch(`/${SCOPE_NAME}.json`);
          if (res.ok) {
            const text = await res.text();
            // JSON.parse throws if Vite returned the HTML SPA fallback instead of a real file
            const parsed = JSON.parse(text);
            if (parsed?.columns && parsed?.teams && parsed?.items) {
              parsed.columns = parsed.columns.map((c) =>
                c.id === "future" && c.color === "rose" ? { ...c, color: "slate" } : c
              );
              if (!parsed.title) parsed.title = seedData.title;
              const knownTeamIds = new Set(parsed.teams.map((t) => t.id));
              const orphanIds = [...new Set(
                parsed.items.filter((i) => i.teamId && !knownTeamIds.has(i.teamId)).map((i) => i.teamId)
              )];
              orphanIds.forEach((id) =>
                parsed.teams.push({ id, name: id.toUpperCase().replace(/[-_]/g, " ") })
              );
              setData(parsed);
              setSharedPreview(parsed);
              scopeLoaded = true;
            }
          }
        } catch { /* file missing, network error, or HTML returned instead of JSON */ }

        if (scopeLoaded) {
          setLoading(false);
          return;
        }

        // File not found — only load from localStorage if explicitly saved as a personal copy
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed._savedCopy) {
              setData(parsed);
              setLoading(false);
              return;
            }
          }
        } catch { /* fall through */ }

        // No valid file and no saved copy — show the error screen
        setScopeError(SCOPE_NAME);
        setLoading(false);
        return;
      }

      // No scope — load own data from localStorage if available.
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          // Migrate: future column rose → slate
          parsed.columns = parsed.columns.map((c) =>
            c.id === "future" && c.color === "rose" ? { ...c, color: "slate" } : c
          );
          if (!parsed.title) parsed.title = seedData.title;
          // Migrate: the old default heading "2026" → the app title.
          if (!parsed.heading || parsed.heading === "2026") parsed.heading = seedData.heading;
          // Migrate: add any teams that items reference but are missing from the teams list.
          // This repairs a mismatch that occurs when items were loaded from a CSV whose
          // teamIds (e.g. "firefly") no longer exist in the stored teams array.
          const knownTeamIds = new Set(parsed.teams.map((t) => t.id));
          const orphanIds = [...new Set(
            parsed.items.filter((i) => i.teamId && !knownTeamIds.has(i.teamId)).map((i) => i.teamId)
          )];
          if (orphanIds.length > 0) {
            orphanIds.forEach((id) =>
              parsed.teams.push({ id, name: id.toUpperCase().replace(/[-_]/g, " ") })
            );
          }
          // Migrate: the legacy "enabler"/"strategic" outcome types are merged into the
          // free-text "enables / supports" note (enablerNote). Value types are now only
          // direct/metric/saving, so these items lose their value type but keep the note.
          parsed.items = parsed.items.map((i) =>
            i.revenueType === "strategic"
              ? { ...i, revenueType: null, enablerNote: i.enablerNote || i.strategicNote || null, strategicNote: null }
              : i.revenueType === "enabler"
              ? { ...i, revenueType: null }
              : i
          );
          setData(parsed);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
          setLoading(false);
          return;
        }
      } catch (e) {
        // fall through to CSV seed
      }

      // No scope, no localStorage — load default roadmap.csv seed.
      // Derive teams from the teamIds in the CSV so items always match their teams.
      try {
        const res = await fetch("/roadmap.csv");
        if (res.ok) {
          const text = await res.text();
          const items = csvToItems(text);
          const uniqueTeamIds = [...new Set(items.map((i) => i.teamId).filter(Boolean))];
          const teams = uniqueTeamIds.length > 0
            ? uniqueTeamIds.map((id) => ({ id, name: id.toUpperCase().replace(/[-_]/g, " ") }))
            : seedData.teams;
          const initial = { ...seedData, teams, items };
          setData(initial);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
        }
      } catch (e) {
        console.warn("Could not load roadmap.csv, using empty seed", e);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!expandedItem) return;
    setModalTab(initialModalTabRef.current || "details");
    initialModalTabRef.current = "details";
    const handler = (e) => { if (e.key === "Escape") setExpandedItem(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [expandedItem]);

  // Save to localStorage on change
  const saveData = (newData) => {
    setData(newData);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
    } catch (e) {
      console.error("Save failed:", e);
    }
  };

  // ---------- Share ----------
  const handleShare = async () => {
    setShareLoading(true);
    try {
      const encoded = await encodeShareData(data);
      const url = `${window.location.origin}${window.location.pathname}#share=${encoded}`;
      try {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2500);
      } catch {
        // Fallback for browsers that block clipboard without interaction
        prompt("Copy this share link:", url);
      }
    } finally {
      setShareLoading(false);
    }
  };

  const saveCopyAndSwitch = () => {
    const name = saveCopyName.trim();
    if (!name) return;
    const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (!slug) return;
    localStorage.setItem(`roadmap-data-${slug}`, JSON.stringify({ ...sharedPreview, _savedCopy: true }));
    window.location.href = `${window.location.pathname}?scope=${slug}`;
  };

  const dismissPreview = () => {
    setSharedPreview(null);
  };

  // Export CSV — exports whatever is currently displayed (own data or shared preview)
  const exportCsv = (items) => {
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(items, `roadmap-${today}.csv`);
  };

  // Import a CSV file uploaded by the user
  const handleImport = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const items = csvToItems(text);
        if (!Array.isArray(items) || items.length === 0) {
          alert("No items found in that CSV file.");
          return;
        }
        // Detect team IDs in the CSV that don't exist in the current teams list
        const knownTeamIds = new Set(data.teams.map((t) => t.id));
        const newTeams = [...new Set(items.map((i) => i.teamId).filter(Boolean))]
          .filter((id) => !knownTeamIds.has(id))
          .map((id) => ({ id, name: id.toUpperCase().replace(/[-_]/g, " ") }));
        // Merge: keep existing items, append imported ones (skip any whose ID already exists)
        const existingIds = new Set(data.items.map((i) => i.id));
        const newItems = items.filter((i) => !existingIds.has(i.id));
        const confirmMsg = [
          `Add ${newItems.length} new item${newItems.length === 1 ? "" : "s"} from the CSV? Your existing items will be kept.`,
          newTeams.length > 0 ? `\n${newTeams.length} new team row${newTeams.length === 1 ? "" : "s"} will also be added: ${newTeams.map((t) => t.name).join(", ")}` : "",
          existingIds.size > 0 && items.length - newItems.length > 0 ? `\n${items.length - newItems.length} item${items.length - newItems.length === 1 ? "" : "s"} skipped (IDs already exist).` : "",
        ].join("");
        if (confirm(confirmMsg)) {
          saveData({ ...data, teams: [...data.teams, ...newTeams], items: [...data.items, ...newItems] });
        }
      } catch (err) {
        alert("Failed to parse CSV: " + err.message);
      }
    };
    reader.readAsText(file);
    event.target.value = ""; // reset so same file can be re-imported
  };

  // ---------- Drag handlers ----------
  const handleDragStart = (item) => { setDragItem(item); setExpandedItem(null); };

  const handleDragOverItem = (e, overItem) => {
    e.preventDefault(); e.stopPropagation();
    if (!dragItem || dragItem.id === overItem.id) return;
    setDragOverId(overItem.id);
    setDragOverSection(null);
  };

  const handleDragOverSection = (e, columnId, teamId) => {
    e.preventDefault();
    if (!dragItem) return;
    setDragOverSection(`${columnId}-${teamId}`);
    setDragOverId(null);
  };

  const handleDrop = (e, targetItem) => {
    e.preventDefault(); e.stopPropagation();
    if (!dragItem) return;
    const newItems = [...data.items];
    const fromIdx = newItems.findIndex((i) => i.id === dragItem.id);
    const toIdx = newItems.findIndex((i) => i.id === targetItem.id);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = newItems.splice(fromIdx, 1);
    moved.columnId = targetItem.columnId;
    moved.teamId = targetItem.teamId;
    const newToIdx = newItems.findIndex((i) => i.id === targetItem.id);
    newItems.splice(newToIdx, 0, moved);
    saveData({ ...data, items: newItems });
    setDragItem(null); setDragOverId(null); setDragOverSection(null);
  };

  const handleDropOnSection = (e, columnId, teamId) => {
    e.preventDefault();
    if (!dragItem) return;
    const newItems = [...data.items];
    const idx = newItems.findIndex((i) => i.id === dragItem.id);
    if (idx === -1) return;
    const [moved] = newItems.splice(idx, 1);
    moved.columnId = columnId; moved.teamId = teamId;
    newItems.push(moved);
    saveData({ ...data, items: newItems });
    setDragItem(null); setDragOverId(null); setDragOverSection(null);
  };

  const handleDragEnd = () => {
    setDragItem(null); setDragOverId(null); setDragOverSection(null);
  };

  // ---------- Item CRUD ----------
  const addItem = (columnId, teamId) => {
    if (!newItemText.trim()) return;
    const { tag, text } = extractTag(newItemText.trim());
    const newItem = {
      id: `i${Date.now()}`, columnId, teamId,
      tag: tag || null, text, flag: null,
    };
    saveData({ ...data, items: [...data.items, newItem] });
    setNewItemText(""); setAddingTo(null);
  };

  const deleteItem = (id) => {
    saveData({ ...data, items: data.items.filter((i) => i.id !== id) });
  };

  const setFlag = (id, newFlag) => {
    const newItems = data.items.map((i) => {
      if (i.id === id) {
        if (i.flag === newFlag) return i;
        const entry = { flag: newFlag, at: Date.now() };
        return { ...i, flag: newFlag, statusHistory: [...(i.statusHistory || []), entry] };
      }
      return i;
    });
    saveData({ ...data, items: newItems });
  };

  // Remove status-history log entries (for accidental status clicks). The item's current
  // flag is left untouched — this only edits the log. Pass index === null to clear all.
  const removeStatusEntry = (id, index) => {
    const newItems = data.items.map((i) => {
      if (i.id !== id) return i;
      const hist = index === null
        ? []
        : (i.statusHistory || []).filter((_, idx) => idx !== index);
      const { statusHistory, ...rest } = i;
      return hist.length > 0 ? { ...rest, statusHistory: hist } : rest;
    });
    saveData({ ...data, items: newItems });
  };

  const updateItem = (id, updates) => {
    const newItems = data.items.map((i) => (i.id === id ? { ...i, ...updates } : i));
    saveData({ ...data, items: newItems });
  };

  const updateTitle = (newTitle) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    saveData({ ...data, title: trimmed });
  };

  const updateHeading = (newHeading) => {
    const trimmed = newHeading.trim();
    saveData({ ...data, heading: trimmed || seedData.heading });
  };

  const updateColumnSubtitle = (columnId, newSubtitle) => {
    const newColumns = data.columns.map((c) =>
      c.id === columnId ? { ...c, subtitle: newSubtitle } : c
    );
    saveData({ ...data, columns: newColumns });
  };

  // ---------- Team CRUD ----------
  const updateTeamName = (teamId, newName) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const newTeams = data.teams.map((t) => t.id === teamId ? { ...t, name: trimmed } : t);
    saveData({ ...data, teams: newTeams });
  };

  const addTeam = () => {
    const name = prompt("New team name (e.g. 'PAYMENTS (Team IRIS)'):");
    if (!name || !name.trim()) return;
    saveData({ ...data, teams: [...data.teams, { id: `team_${Date.now()}`, name: name.trim() }] });
  };

  const deleteTeam = (teamId) => {
    const team = data.teams.find((t) => t.id === teamId);
    if (!team) return;
    const itemCount = data.items.filter((i) => i.teamId === teamId).length;
    if (itemCount > 0) {
      alert(`Cannot delete "${team.name}" — it still has ${itemCount} item${itemCount === 1 ? "" : "s"}. Move or delete the items first.`);
      return;
    }
    if (!confirm(`Delete the team "${team.name}"?`)) return;
    saveData({ ...data, teams: data.teams.filter((t) => t.id !== teamId) });
  };

  // ---------- Full backup (JSON) ----------
  const exportBackup = () => {
    const today = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const slug = (data.title || "roadmap").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    link.href = url; link.download = `${slug}-${today}.json`;
    document.body.appendChild(link); link.click();
    document.body.removeChild(link); URL.revokeObjectURL(url);
  };

  const handleBackupImport = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed.columns || !parsed.teams || !parsed.items) {
          alert("That doesn't look like a valid backup file (missing columns, teams, or items).");
          return;
        }
        if (confirm(`Restore backup with ${parsed.items.length} items, ${parsed.teams.length} teams? This will replace everything.`)) {
          saveData(parsed);
        }
      } catch (err) {
        alert("Failed to parse backup file: " + err.message);
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const resetToSeed = () => {
    if (!confirm("Reset to a blank roadmap? All current items will be removed and team names reset to generic ones.")) return;
    saveData(seedData);
  };

  // ---------- Derived display state ----------
  const displayData = sharedPreview ?? data;
  const isPreview = !!sharedPreview;

  // ---- "BY TIME" render helpers (shared by compact + aligned layouts) ----
  const renderColumnHeader = (col, styles) => (
    <div className={`${styles.header} ${styles.headerText} rounded-t-lg px-4 py-5 text-center shadow-sm`}>
      <h2 className="text-xl font-bold tracking-wider">{col.title}</h2>
      {editingSubtitle === col.id && !isPreview ? (
        <input
          type="text"
          defaultValue={col.subtitle}
          autoFocus
          onBlur={(e) => { updateColumnSubtitle(col.id, e.target.value); setEditingSubtitle(null); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.target.blur();
            if (e.key === "Escape") setEditingSubtitle(null);
          }}
          className="text-xs mt-1 font-mono text-center bg-white/60 border border-stone-900/30 rounded px-1.5 py-0.5 w-full max-w-[180px] mx-auto block"
        />
      ) : (
        <p
          className={`text-xs mt-1 opacity-80 font-mono ${!isPreview ? "cursor-text hover:opacity-100 hover:underline decoration-dotted underline-offset-2" : ""}`}
          onClick={() => { if (!isPreview) setEditingSubtitle(col.id); }}
          title={!isPreview ? "Click to edit" : undefined}
        >
          {col.subtitle || <span className="italic opacity-50">click to set quarter</span>}
        </p>
      )}
    </div>
  );

  const renderTeamBlock = (col, styles, team) => {
    const teamItems = displayData.items.filter(
      (i) => i.columnId === col.id && i.teamId === team.id
    );
    const sectionKey = `${col.id}-${team.id}`;
    const isDragOverSection = dragOverSection === sectionKey;
    const isAdding = !isPreview && addingTo?.columnId === col.id && addingTo?.teamId === team.id;
    const isFirstColumn = col.id === displayData.columns[0].id;

    return (
      <div
        key={team.id}
        className={`rounded-md transition-colors ${isDragOverSection ? "ring-2 ring-stone-800" : ""}`}
        onDragOver={!isPreview ? (e) => handleDragOverSection(e, col.id, team.id) : undefined}
        onDrop={!isPreview ? (e) => handleDropOnSection(e, col.id, team.id) : undefined}
      >
        {/* Team Header */}
        <div className={`${styles.section} rounded-md mb-2 relative group min-h-[32px]`}>
          {editingTeam === team.id && !isPreview ? (
            <div className="px-8 py-2">
              <input
                type="text"
                defaultValue={team.name}
                autoFocus={isFirstColumn}
                onFocus={(e) => e.target.select()}
                onBlur={(e) => {
                  if (isFirstColumn) { updateTeamName(team.id, e.target.value); setEditingTeam(null); }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.target.blur();
                  if (e.key === "Escape") setEditingTeam(null);
                }}
                readOnly={!isFirstColumn}
                className="text-xs font-bold text-stone-900 text-center bg-white border border-stone-500 rounded px-2 py-0.5 w-full"
              />
            </div>
          ) : (
            <h3
              className={`text-xs font-bold tracking-wide text-stone-900 text-center px-8 py-2 m-0 flex items-center justify-center min-h-[32px] ${!isPreview ? "cursor-text hover:underline decoration-dotted underline-offset-2" : ""}`}
              onMouseDown={!isPreview ? (e) => { e.preventDefault(); setEditingTeam(team.id); } : undefined}
              title={!isPreview ? "Click to edit team name" : undefined}
            >
              <span>{team.name}</span>
            </h3>
          )}
          {/* Delete team button — only in first column, not in preview */}
          {!isPreview && isFirstColumn && editingTeam !== team.id && (
            <button
              onClick={(e) => { e.stopPropagation(); deleteTeam(team.id); }}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Delete team (must be empty)"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
          {/* Add item button */}
          {!isPreview && (
            <button
              onClick={(e) => { e.stopPropagation(); setAddingTo({ columnId: col.id, teamId: team.id }); }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-stone-600 hover:text-stone-900 hover:bg-white/50 rounded w-5 h-5 flex items-center justify-center transition-colors"
              title="Add item"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            </button>
          )}
        </div>

        {/* Team Items */}
        <div className="space-y-1.5">
          {teamItems.map((item) => {
            const isDragOver = dragOverId === item.id;
            const flagClass = flagStyles[item.flag] || "";
            const { pill, cleanText } = getItemDisplay(item);
            const isExpanded = expandedItem === item.id;
            return (
              <div
                key={item.id}
                draggable={!isPreview}
                onDragStart={!isPreview ? () => handleDragStart(item) : undefined}
                onDragOver={!isPreview ? (e) => handleDragOverItem(e, item) : undefined}
                onDrop={!isPreview ? (e) => handleDrop(e, item) : undefined}
                onDragEnd={!isPreview ? handleDragEnd : undefined}
                onClick={() => setExpandedItem(item.id)}
                className={`
                  group relative rounded-md border px-2 py-1.5 text-xs transition-all cursor-pointer
                  ${item.flag ? flagClass : styles.item}
                  ${isDragOver ? "ring-2 ring-stone-800 translate-y-0.5" : ""}
                  ${dragItem?.id === item.id ? "opacity-40" : ""}
                `}
              >
                {/* Collapsed header row */}
                <div className="flex items-center gap-1.5">
                  {!isPreview && !isExpanded && (
                    <GripVertical className="w-3 h-3 text-stone-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                  {item.tag && (
                    <span className={`font-bold text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${getTagStyle(item.tag)}`}>
                      {item.tag}
                    </span>
                  )}
                  <span className="flex-1 leading-snug flex flex-wrap items-center gap-1 min-w-0">
                    <span className="truncate">{cleanText}</span>
                    {pill && (
                      <span className="inline-flex items-center font-mono font-semibold text-[9px] tracking-wider bg-white border border-stone-400 text-stone-700 px-1.5 py-0.5 rounded-sm flex-shrink-0">
                        {pill}
                      </span>
                    )}
                  </span>
                  {/* Notes indicator */}
                  {item.description && !isExpanded && (
                    <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-stone-400" title="Has notes" />
                  )}
                  {/* JIRA badge */}
                  {item.jiraUrl && (
                    <a
                      href={item.jiraUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex-shrink-0 w-4 h-4 rounded flex items-center justify-center text-white font-bold text-[8px] hover:opacity-75 transition-opacity"
                      style={{ backgroundColor: "#0052CC" }}
                      title={`JIRA: ${item.jiraUrl}`}
                    >J</a>
                  )}
                  {/* Confluence badge */}
                  {item.confluenceUrl && (
                    <a
                      href={item.confluenceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex-shrink-0 w-4 h-4 rounded flex items-center justify-center text-white font-bold text-[8px] hover:opacity-75 transition-opacity"
                      style={{ backgroundColor: "#0065FF" }}
                      title={`Confluence: ${item.confluenceUrl}`}
                    >C</a>
                  )}
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={!isPreview ? (e) => { e.stopPropagation(); setFlagPickerOpen(flagPickerOpen === item.id ? null : item.id); } : (e) => e.stopPropagation()}
                      className={`flex-shrink-0 transition-opacity ${!isPreview ? "opacity-60 hover:opacity-100" : "opacity-40 cursor-default"}`}
                      title={!isPreview ? "Set status" : undefined}
                    >
                      <Circle className={`w-3 h-3 ${
                        item.flag === "risk"      ? "fill-rose-500 text-rose-500" :
                        item.flag === "warning"   ? "fill-amber-400 text-amber-400" :
                        item.flag === "completed" ? "fill-emerald-500 text-emerald-500" :
                        item.flag === "done"      ? "fill-gray-400 text-gray-400" :
                        "text-stone-300"
                      }`} />
                    </button>
                    {flagPickerOpen === item.id && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setFlagPickerOpen(null); }} />
                        <div className="absolute bottom-full right-0 mb-1.5 bg-white border border-stone-200 rounded-lg shadow-lg z-50 py-1 min-w-[140px]" onClick={(e) => e.stopPropagation()}>
                          {STATUS_OPTIONS.map((opt) => (
                            <button
                              key={String(opt.flag)}
                              onClick={(e) => { e.stopPropagation(); setFlag(item.id, opt.flag); setFlagPickerOpen(null); }}
                              className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono hover:bg-stone-50 transition-colors ${item.flag === opt.flag ? "bg-stone-50 font-bold" : ""}`}
                            >
                              <Circle className={`w-2.5 h-2.5 flex-shrink-0 ${opt.dot}`} />
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  {!isPreview && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ id: item.id, text: item.text }); }}
                      className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-stone-400 hover:text-rose-600"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>

              </div>
            );
          })}

          {/* Add Item Form */}
          {isAdding && (() => {
            const liveTag = extractTag(newItemText.trim()).tag;
            const liveStyle = liveTag ? getTagStyle(liveTag) : null;
            return (
              <div className="rounded-md border-2 border-dashed border-stone-400 p-2 bg-white space-y-1.5">
                <div className="flex items-center gap-1.5">
                  {liveTag && (
                    <span className={`font-bold text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${liveStyle}`}>
                      {liveTag}
                    </span>
                  )}
                  <input
                    type="text"
                    value={newItemText}
                    onChange={(e) => setNewItemText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addItem(col.id, team.id);
                      if (e.key === "Escape") { setAddingTo(null); setNewItemText(""); }
                    }}
                    autoFocus
                    placeholder="FR: feature name, or just a title…"
                    className="flex-1 text-xs border border-stone-300 rounded px-1.5 py-0.5"
                  />
                </div>
                <div className="flex gap-1.5 justify-end">
                  <button
                    onClick={() => { setAddingTo(null); setNewItemText(""); }}
                    className="text-[10px] px-2 py-0.5 text-stone-600 hover:text-stone-900"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => addItem(col.id, team.id)}
                    className="text-[10px] px-2 py-0.5 bg-stone-800 text-white rounded hover:bg-stone-700"
                  >
                    Add
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    );
  };

  // Aligned layout (lg+ only): one grid row per team so team headers line up across all columns.
  const renderAlignedBoard = () => (
    <div className="max-w-[1800px] mx-auto grid grid-cols-4 gap-x-4">
      {displayData.columns.map((col) => {
        const styles = columnStyles[col.color] ?? columnStyles.slate;
        return <div key={`hdr-${col.id}`}>{renderColumnHeader(col, styles)}</div>;
      })}
      {displayData.teams.map((team, ti) => {
        const isLastTeam = ti === displayData.teams.length - 1;
        return displayData.columns.map((col) => {
          const styles = columnStyles[col.color] ?? columnStyles.slate;
          return (
            <div
              key={`${col.id}-${team.id}`}
              className={`${styles.body} px-3 pt-3 ${isLastTeam ? "pb-3 rounded-b-lg" : "pb-2"}`}
            >
              {renderTeamBlock(col, styles, team)}
            </div>
          );
        });
      })}
    </div>
  );

  // Gantt: size month columns so ~9 months (prev/current/next quarter) fill the viewport width.
  useEffect(() => {
    if (activeView !== "gantt") return;
    const el = ganttBodyRef.current;
    if (!el) return;
    const compute = () => {
      const avail = el.clientWidth - GANTT_LABEL_W;
      if (avail > 0) setGanttColW(Math.max(GANTT_MIN_COL, Math.floor(avail / GANTT_VISIBLE_MONTHS)));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeView]);

  // Gantt: on open, scroll so the previous quarter sits at the left edge.
  useEffect(() => {
    if (activeView !== "gantt") return;
    const el = ganttBodyRef.current;
    if (!el) return;
    const keyOf = (iso) => { const [y, m] = iso.split("-").map(Number); return y * 12 + (m - 1); };
    const starts = [];
    displayData.items.forEach((it) => {
      const s = it.startDate ? keyOf(it.startDate) : (it.endDate ? keyOf(it.endDate) : null);
      if (s != null) starts.push(s);
    });
    if (!starts.length) return;
    const now = new Date();
    const prevQuarterStartKey = now.getFullYear() * 12 + (Math.floor(now.getMonth() / 3) * 3 - 3);
    const minK = Math.min(Math.min(...starts), prevQuarterStartKey);
    el.scrollLeft = Math.max(0, (prevQuarterStartKey - minK) * ganttColW);
  }, [activeView, ganttColW]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-stone-600 font-mono text-sm tracking-wider">LOADING ROADMAP...</div>
      </div>
    );
  }

  if (locationError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-center space-y-3 max-w-md px-4">
          <div className="text-stone-800 font-mono font-bold text-sm tracking-wider uppercase">Roadmap not found</div>
          <p className="text-stone-600 text-sm">
            Could not load a roadmap from the specified URL. The file may not exist, or the server may not allow cross-origin requests.
          </p>
          <p className="text-stone-400 text-xs font-mono break-all">{LOCATION_URL}</p>
          <a
            href={window.location.pathname}
            className="inline-block mt-2 text-xs text-indigo-600 hover:text-indigo-900 underline underline-offset-2 font-mono"
          >
            ← Go to my roadmap
          </a>
        </div>
      </div>
    );
  }

  if (scopeError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-center space-y-3 max-w-sm px-4">
          <div className="text-stone-800 font-mono font-bold text-sm tracking-wider uppercase">Roadmap not found</div>
          <p className="text-stone-600 text-sm">
            No roadmap exists for scope <span className="font-mono font-bold">"{scopeError}"</span>.
          </p>
          <p className="text-stone-400 text-xs font-mono">
            Expected file: <span className="font-semibold">{scopeError}.json</span> in the public folder.
          </p>
          <a
            href={window.location.pathname}
            className="inline-block mt-2 text-xs text-indigo-600 hover:text-indigo-900 underline underline-offset-2 font-mono"
          >
            ← Go to my roadmap
          </a>
        </div>
      </div>
    );
  }

  // ---------- Render ----------
  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>

      {/* Shared-preview banner */}
      {isPreview && (
        <div className="bg-indigo-700 text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
          <div className="flex items-center gap-2">
            <span className="bg-white/20 border border-white/30 rounded px-1.5 py-0.5 font-bold tracking-wider text-[10px]">READ ONLY</span>
            <span className="opacity-90">Viewing shared roadmap — changes here won't be saved</span>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="opacity-70 hidden sm:inline">Save as a local copy to edit:</span>
            <input
              type="text"
              value={saveCopyName}
              onChange={(e) => setSaveCopyName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveCopyAndSwitch()}
              placeholder="give it a name…"
              className="bg-white/15 border border-white/30 rounded px-2 py-0.5 text-white placeholder-white/40 text-xs w-36 focus:outline-none focus:border-white/70"
            />
            <button
              onClick={saveCopyAndSwitch}
              disabled={!saveCopyName.trim()}
              className="bg-white text-indigo-700 font-bold text-[11px] px-3 py-0.5 rounded hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Save &amp; open
            </button>
            <span className="opacity-30 hidden sm:inline">|</span>
            <button
              onClick={dismissPreview}
              className="opacity-75 hover:opacity-100 underline underline-offset-2 transition-opacity"
            >
              View my roadmap
            </button>
          </div>
        </div>
      )}

      {/* Scope indicator (shown when browsing a named local copy) */}
      {SCOPE_NAME && !isPreview && (
        <div className="bg-indigo-50 border-b border-indigo-200 px-4 py-1.5 flex items-center gap-3 font-mono text-xs text-indigo-700">
          <span>Scope: <span className="font-bold">{SCOPE_NAME}</span></span>
          <span className="opacity-40">·</span>
          <a href={window.location.pathname} className="underline hover:text-indigo-900">← my default roadmap</a>
        </div>
      )}

      <div className="p-6">
        {/* Header */}
        <div className="max-w-[1800px] mx-auto mb-6">
          <div className="flex items-center justify-between mb-2">
            {editingTitle && !isPreview ? (
              <input
                type="text"
                defaultValue={data.title || seedData.title}
                autoFocus
                onBlur={(e) => { updateTitle(e.target.value); setEditingTitle(false); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.target.blur();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                className="text-xs font-mono tracking-[0.2em] text-stone-500 uppercase border border-stone-500 px-2 py-1 bg-white min-w-[260px]"
              />
            ) : (
              <div
                className={`text-xs font-mono tracking-[0.2em] text-stone-500 uppercase border border-stone-300 px-2 py-1 bg-white ${!isPreview ? "cursor-text hover:text-stone-800 hover:border-stone-500" : ""}`}
                onClick={() => { if (!isPreview) setEditingTitle(true); }}
                title={!isPreview ? "Click to edit title" : undefined}
              >
                {displayData.title || seedData.title}
              </div>
            )}
            <div className="flex items-center gap-3">
              {/* Share button */}
              <button
                onClick={handleShare}
                disabled={shareLoading}
                className={`flex items-center gap-1.5 text-xs font-mono tracking-wider uppercase border px-2.5 py-1 rounded transition-colors disabled:opacity-60 disabled:cursor-wait ${
                  shareCopied
                    ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                    : "border-stone-300 bg-white text-stone-700 hover:text-stone-900 hover:bg-stone-100"
                }`}
                title="Copy a share link to your clipboard — recipients open the link and see a read-only preview with the option to save their own copy"
              >
                <Share2 className="w-3 h-3" />
                {shareLoading ? "Generating…" : shareCopied ? "Link copied!" : "Share as URL Encoded"}
              </button>
              <button
                onClick={() => exportCsv(displayData.items)}
                className="flex items-center gap-1.5 text-xs font-mono tracking-wider text-stone-700 hover:text-stone-900 uppercase border border-stone-300 bg-white hover:bg-stone-100 px-2.5 py-1 rounded transition-colors"
                title="Download your current roadmap as a CSV file"
              >
                <Download className="w-3 h-3" />
                Export CSV
              </button>
              {activeView === "roadmap" && (
                <button
                  onClick={() => setCompactView((v) => {
                    const next = !v;
                    try { localStorage.setItem("roadmap-compact-view", String(next)); } catch {}
                    return next;
                  })}
                  aria-pressed={compactView}
                  className={`flex items-center gap-1.5 text-xs font-mono tracking-wider uppercase border px-2.5 py-1 rounded transition-colors ${
                    compactView
                      ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                      : "border-stone-300 bg-white text-stone-700 hover:text-stone-900 hover:bg-stone-100"
                  }`}
                  title={compactView
                    ? "Compact view ON — each column flows independently. Click to align team rows across all columns."
                    : "Compact view OFF — team rows align across all columns. Click for the compact, independent layout."}
                >
                  <Rows3 className="w-3 h-3" />
                  Compact View
                </button>
              )}
              {!isPreview && (
                <>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 text-xs font-mono tracking-wider text-stone-700 hover:text-stone-900 uppercase border border-stone-300 bg-white hover:bg-stone-100 px-2.5 py-1 rounded transition-colors"
                    title="Load a CSV file to replace the current roadmap"
                  >
                    <Upload className="w-3 h-3" />
                    Import CSV
                  </button>
                  <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleImport} className="hidden" />
                  <button
                    onClick={exportBackup}
                    className="flex items-center gap-1.5 text-xs font-mono tracking-wider text-stone-700 hover:text-stone-900 uppercase border border-stone-300 bg-white hover:bg-stone-100 px-2.5 py-1 rounded transition-colors"
                    title="Save a full backup (includes teams, columns, items) as JSON"
                  >
                    <Download className="w-3 h-3" />
                    Backup
                  </button>
                  <button
                    onClick={() => backupInputRef.current?.click()}
                    className="flex items-center gap-1.5 text-xs font-mono tracking-wider text-stone-700 hover:text-stone-900 uppercase border border-stone-300 bg-white hover:bg-stone-100 px-2.5 py-1 rounded transition-colors"
                    title="Restore a full backup"
                  >
                    <Upload className="w-3 h-3" />
                    Restore
                  </button>
                  <input ref={backupInputRef} type="file" accept=".json,application/json" onChange={handleBackupImport} className="hidden" />
                  <button
                    onClick={resetToSeed}
                    className="text-xs font-mono tracking-wider text-stone-500 hover:text-stone-800 uppercase"
                    title="Clear all items and reset to a blank roadmap"
                  >
                    Reset
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="relative flex items-center justify-center gap-3">
            {editingHeading && !isPreview ? (
              <input
                type="text"
                defaultValue={displayData.heading || seedData.heading}
                autoFocus
                maxLength={60}
                onBlur={(e) => { updateHeading(e.target.value); setEditingHeading(false); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.target.blur();
                  if (e.key === "Escape") setEditingHeading(false);
                }}
                className="text-2xl sm:text-4xl font-black italic tracking-tight text-stone-900 text-center bg-white border border-stone-400 rounded px-3 py-1 w-[min(90vw,820px)]"
                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
              />
            ) : (
              <h1
                className={`text-2xl sm:text-4xl font-black italic tracking-tight text-stone-900 text-center ${!isPreview ? "cursor-text hover:text-stone-600" : ""}`}
                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                onClick={() => { if (!isPreview) setEditingHeading(true); }}
                title={!isPreview ? "Click to edit title" : undefined}
              >
                {displayData.heading || seedData.heading}
              </h1>
            )}
            <div className="flex gap-1.5 flex-shrink-0">
              <span className="w-3.5 h-3.5 rounded-full bg-emerald-500" title="On track"></span>
              <span className="w-3.5 h-3.5 rounded-full bg-amber-400" title="At risk"></span>
              <span className="w-3.5 h-3.5 rounded-full bg-rose-500" title="Blocked"></span>
            </div>
            <div className="hidden sm:block absolute right-0 text-xs text-stone-500 font-mono">
              {isPreview ? "Read-only preview — save a copy to make edits" : "Drag items to reorder"}
            </div>
          </div>
        </div>

        {/* View tabs */}
        <div className="max-w-[1800px] mx-auto flex gap-1 border-b border-stone-200 mb-6">
          {[{ id: "roadmap", label: "By Time" }, { id: "strategic", label: "By Innovation Type" }, { id: "impact", label: "by IMPACT" }, { id: "gantt", label: "Gantt" }].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveView(id)}
              className={`text-xs font-mono font-semibold uppercase tracking-wider px-4 py-2 rounded-t-md border border-b-0 transition-colors -mb-px ${
                activeView === id
                  ? "bg-stone-50 border-stone-200 text-stone-900"
                  : "text-stone-400 border-transparent hover:text-stone-700 hover:bg-stone-100"
              }`}
            >{label}</button>
          ))}
        </div>

        {/* Roadmap view */}
        {activeView === "roadmap" && <>
        {/* Columns — aligned rows (lg+) when Compact View is off */}
        {!compactView && (
          <div className="hidden lg:block">{renderAlignedBoard()}</div>
        )}
        {/* Columns — compact / independent flow (default; also small screens when aligned) */}
        <div className={`max-w-[1800px] mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4${!compactView ? " lg:hidden" : ""}`}>
          {displayData.columns.map((col) => {
            const styles = columnStyles[col.color] ?? columnStyles.slate;
            return (
              <div key={col.id} className="flex flex-col">
                {renderColumnHeader(col, styles)}

                {/* Column Body */}
                <div className={`${styles.body} flex-1 rounded-b-lg p-3 space-y-5 min-h-[400px]`}>
                  {displayData.teams.map((team) => renderTeamBlock(col, styles, team))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Add Team button */}
        {!isPreview && (
          <div className="max-w-[1800px] mx-auto mt-4 flex justify-center">
            <button
              onClick={addTeam}
              className="flex items-center gap-1.5 text-xs font-mono tracking-wider text-stone-600 hover:text-stone-900 uppercase border border-dashed border-stone-400 hover:border-stone-700 hover:bg-white px-4 py-2 rounded transition-colors"
              title="Add a new team row (will appear in every column)"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Team Row
            </button>
          </div>
        )}

        {/* Footer help */}
        <div className="max-w-[1800px] mx-auto mt-6 text-xs text-stone-500 font-mono flex flex-wrap items-center gap-x-6 gap-y-1">
          {isPreview ? (
            <span>This is a read-only shared view — use <span className="font-bold">Save &amp; open</span> in the banner above to make your own editable copy</span>
          ) : (
            <>
              <span><span className="font-bold">Click</span> any item to expand · edit title, notes, JIRA &amp; Confluence links</span>
              <span><span className="font-bold">Drag</span> any item to reorder or move between columns</span>
              <span><span className="font-bold">Click</span> team name or quarter label to rename · status dot to cycle flag</span>
              <span><span className="font-bold">Author</span> Cadence-X</span>
            </>
          )}
          <span className="ml-auto opacity-40">{APP_VERSION}</span>
        </div>
        </>}

        {/* Strategic view */}
        {activeView === "strategic" && (
          <div className="max-w-[1800px] mx-auto">
            {/* ── Mobile layout: stacked per category ── */}
            <div className="md:hidden space-y-4">
              {STRATEGIC_CATEGORIES.map((cat) => {
                const catItems = displayData.items.filter((i) => i.strategicCategory === cat.id);
                return (
                  <div key={cat.id} className="rounded-xl overflow-hidden border border-stone-200">
                    <div className={`${cat.headerBg} ${cat.headerText} flex items-center gap-3 px-4 py-3`}>
                      <img src={cat.image} alt={cat.label} style={{ height: "40px", width: "auto", objectFit: "contain" }} />
                      <span className="font-bold text-sm uppercase tracking-wide">"{cat.label}"</span>
                    </div>
                    <div className={`${cat.bodyBg} p-3 space-y-3`}>
                      {catItems.length === 0 ? (
                        <div className="text-[11px] text-stone-400 italic text-center py-3">No items assigned yet</div>
                      ) : (
                        displayData.teams.map((team) => {
                          const teamItems = displayData.items
                            .filter((i) => i.teamId === team.id && i.strategicCategory === cat.id)
                            .sort((a, b) => displayData.columns.findIndex((c) => c.id === b.columnId) - displayData.columns.findIndex((c) => c.id === a.columnId));
                          if (teamItems.length === 0) return null;
                          return (
                            <div key={team.id}>
                              <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1.5">{team.name}</div>
                              <div className="space-y-1.5">
                                {teamItems.map((item) => {
                                  const col = displayData.columns.find((c) => c.id === item.columnId);
                                  const { cleanText } = extractDate(item.text);
                                  const flagClass = flagStyles[item.flag] || "";
                                  return (
                                    <div key={item.id} onClick={() => setExpandedItem(item.id)}
                                      className={`rounded-md border px-2 py-1.5 text-xs cursor-pointer transition-all hover:shadow-sm ${item.flag ? flagClass : "bg-white border-stone-200 hover:border-stone-400"}`}>
                                      <div className="flex items-start gap-1.5">
                                        {item.tag && <span className={`font-bold text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${getTagStyle(item.tag)}`}>{item.tag}</span>}
                                        <span className="flex-1 leading-snug">{cleanText}</span>
                                        <Circle className={`w-2.5 h-2.5 flex-shrink-0 mt-0.5 ${item.flag === "risk" ? "fill-rose-500 text-rose-500" : item.flag === "warning" ? "fill-amber-400 text-amber-400" : item.flag === "completed" ? "fill-emerald-500 text-emerald-500" : item.flag === "done" ? "fill-gray-400 text-gray-400" : "text-stone-200"}`} />
                                      </div>
                                      {col && <div className="mt-1"><span className="inline-flex font-mono font-semibold text-[9px] tracking-wider bg-white border border-stone-300 text-stone-600 px-1.5 py-0.5 rounded-sm">{col.subtitle || col.title}</span></div>}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Desktop layout: grid ── */}
            <div className="hidden md:block">
            {/* Animal images row */}
            <div style={{ display: "grid", gridTemplateColumns: "140px repeat(4, 1fr)", gap: "12px", alignItems: "flex-end" }}>
              <div />
              {STRATEGIC_CATEGORIES.map((cat) => (
                <div key={cat.id} className="flex justify-center items-end" style={{ height: "120px" }}>
                  <img src={cat.image} alt={cat.label} style={{ height: "110px", width: "auto", objectFit: "contain" }} />
                </div>
              ))}
            </div>

            {/* Category header row */}
            <div style={{ display: "grid", gridTemplateColumns: "140px repeat(4, 1fr)" }}>
              <div />
              {STRATEGIC_CATEGORIES.map((cat, i) => (
                <div key={cat.id} className={`${cat.headerBg} ${cat.headerText} px-4 py-3 text-center font-bold text-sm tracking-wide uppercase ${i === 0 ? "rounded-tl-lg" : ""} ${i === 3 ? "rounded-tr-lg" : ""}`}>
                  "{cat.label}"
                </div>
              ))}
            </div>

            {/* Team swim lane rows */}
            {displayData.teams.map((team) => {
              return (
                <div key={team.id} style={{ display: "grid", gridTemplateColumns: "140px repeat(4, 1fr)", marginTop: "10px" }}>
                  <div className="bg-stone-200 border border-stone-300 rounded-l-lg flex items-center justify-center p-3 text-xs font-bold tracking-wide uppercase text-stone-900 text-center">
                    {team.name}
                  </div>
                  {STRATEGIC_CATEGORIES.map((cat, catIdx) => {
                    const isLastCat = catIdx === 3;
                    const cellItems = displayData.items
                      .filter((i) => i.teamId === team.id && i.strategicCategory === cat.id)
                      .sort((a, b) => displayData.columns.findIndex((c) => c.id === b.columnId) - displayData.columns.findIndex((c) => c.id === a.columnId));
                    return (
                      <div key={cat.id} className={`${cat.bodyBg} border border-stone-200 border-l-0 p-2 min-h-[100px] ${isLastCat ? "rounded-r-lg" : ""}`}>
                        {cellItems.length === 0 ? (
                          <div className="text-[10px] text-stone-300 italic text-center pt-6">—</div>
                        ) : (
                          cellItems.map((item) => {
                            const col = displayData.columns.find((c) => c.id === item.columnId);
                            const { cleanText } = extractDate(item.text);
                            const flagClass = flagStyles[item.flag] || "";
                            return (
                              <div key={item.id} onClick={() => setExpandedItem(item.id)}
                                className={`rounded-md border px-2 py-1.5 text-xs mb-1.5 last:mb-0 cursor-pointer transition-all hover:shadow-sm ${item.flag ? flagClass : "bg-white border-stone-200 hover:border-stone-400"}`}>
                                <div className="flex items-start gap-1.5">
                                  {item.tag && <span className={`font-bold text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${getTagStyle(item.tag)}`}>{item.tag}</span>}
                                  <span className="flex-1 leading-snug">{cleanText}</span>
                                  <Circle className={`w-2.5 h-2.5 flex-shrink-0 mt-0.5 ${item.flag === "risk" ? "fill-rose-500 text-rose-500" : item.flag === "warning" ? "fill-amber-400 text-amber-400" : item.flag === "completed" ? "fill-emerald-500 text-emerald-500" : item.flag === "done" ? "fill-gray-400 text-gray-400" : "text-stone-200"}`} />
                                </div>
                                {col && <div className="mt-1"><span className="inline-flex font-mono font-semibold text-[9px] tracking-wider bg-white border border-stone-300 text-stone-600 px-1.5 py-0.5 rounded-sm">{col.subtitle || col.title}</span></div>}
                              </div>
                            );
                          })
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            </div>{/* closes desktop grid */}

            {/* Unassigned items */}
            {(() => {
              const unassigned = displayData.items.filter((i) => !i.strategicCategory);
              if (unassigned.length === 0) return null;
              return (
                <div className="mt-6 border border-dashed border-stone-300 rounded-lg p-4 bg-white">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-stone-400 mb-3">
                    Unassigned — {unassigned.length} item{unassigned.length !== 1 ? "s" : ""} not yet categorised
                    {!isPreview && <span className="normal-case opacity-70"> · click an item to open it and assign a strategic category</span>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {unassigned.map((item) => {
                      const { cleanText } = extractDate(item.text);
                      const col = displayData.columns.find((c) => c.id === item.columnId);
                      return (
                        <div
                          key={item.id}
                          onClick={() => setExpandedItem(item.id)}
                          className="cursor-pointer bg-stone-50 border border-stone-200 hover:border-stone-400 rounded-md px-2.5 py-1.5 text-xs flex items-center gap-1.5 transition-colors"
                        >
                          {item.tag && <span className={`font-bold text-[10px] px-1 py-0.5 rounded ${getTagStyle(item.tag)}`}>{item.tag}</span>}
                          <span>{cleanText}</span>
                          {col && <span className="font-mono text-[9px] text-stone-400 bg-white border border-stone-200 px-1 py-0.5 rounded">{col.subtitle || col.title}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Strategic footer */}
            <div className="mt-6 text-xs text-stone-500 font-mono flex flex-wrap items-center gap-x-6 gap-y-1">
              {!isPreview && <span><span className="font-bold">Click</span> any item to open it and assign a strategic category</span>}
              <span className="ml-auto opacity-40">{APP_VERSION}</span>
            </div>
          </div>
        )}

        {/* ── by IMPACT view ── */}
        {activeView === "impact" && (() => {
          const safeIdx     = Math.min(impactColIdx, displayData.columns.length - 1);
          const selectedCol = displayData.columns[safeIdx];
          const doneColId   = displayData.columns[0]?.id;
          const selQuarter  = getColumnQuarter(selectedCol);
          // Same timeline rule as the Revenue view: an item belongs to the selected quarter if
          // it sits in that column, or it's a DONE item whose release date falls in that quarter.
          const inTimeline = (i) =>
            i.columnId === selectedCol.id ||
            (selQuarter != null && i.columnId === doneColId && getItemQuarter(i, displayData.columns) === selQuarter);
          // Exclude deprioritised items (the "done" flag → "Deprioritised") from this view.
          const timelineItems = displayData.items.filter((i) => i.flag !== "done" && inTimeline(i));
          const withOutcome   = timelineItems.filter((i) => outcomeChips(i).length > 0).length;

          const flagDot = (flag) =>
            flag === "risk" ? "fill-rose-500 text-rose-500"
            : flag === "warning" ? "fill-amber-400 text-amber-400"
            : flag === "completed" ? "fill-emerald-500 text-emerald-500"
            : flag === "done" ? "fill-gray-400 text-gray-400"
            : "text-stone-200";

          const OutcomeCell = ({ item }) => {
            const chips = outcomeChips(item);
            if (chips.length === 0) {
              return (
                <button
                  disabled={isPreview}
                  onClick={isPreview ? undefined : () => { initialModalTabRef.current = "outcome"; setExpandedItem(item.id); }}
                  className="inline-flex items-center gap-2 text-[11px] px-2.5 py-1 rounded-md border border-dashed border-stone-300 text-stone-400 enabled:hover:border-stone-500 enabled:hover:text-stone-600 transition-colors"
                >
                  <Circle className="w-2.5 h-2.5" />{isPreview ? "No outcome set" : "— set an outcome —"}
                </button>
              );
            }
            return (
              <div className="flex flex-col items-start gap-1.5">
                {chips.map((o, idx) => (
                  <span key={idx} className={`inline-flex items-center gap-2 text-[12px] px-2.5 py-1 rounded-md border ${o.chip}`}>
                    <span>{o.icon}</span>
                    {o.label && <span className="font-semibold leading-snug">{o.label}</span>}
                    {o.value && <span className="font-mono font-bold whitespace-nowrap">{o.value}</span>}
                    {o.suffix && <span className="text-[10px] uppercase tracking-wider opacity-70 whitespace-nowrap">{o.suffix}</span>}
                  </span>
                ))}
              </div>
            );
          };

          return (
            <div className="max-w-[1400px] mx-auto">
              {/* Quarter navigator */}
              <div className="flex items-center justify-center mb-6">
                <div className="flex items-center gap-3 bg-white border-2 border-stone-900 rounded-xl px-4 py-2.5" style={{ boxShadow: "3px 3px 0px #1c1917" }}>
                  <button
                    onClick={() => setImpactColIdx((i) => Math.max(0, i - 1))}
                    disabled={safeIdx === 0}
                    className="w-7 h-7 flex items-center justify-center border-[1.5px] border-stone-900 rounded-md text-stone-900 hover:bg-stone-900 hover:text-white disabled:border-stone-300 disabled:text-stone-300 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-mono font-extrabold text-base tracking-tight text-stone-900 min-w-[140px] text-center select-none">
                    {selectedCol.subtitle || selectedCol.title}
                  </span>
                  <button
                    onClick={() => setImpactColIdx((i) => Math.min(displayData.columns.length - 1, i + 1))}
                    disabled={safeIdx === displayData.columns.length - 1}
                    className="w-7 h-7 flex items-center justify-center border-[1.5px] border-stone-900 rounded-md text-stone-900 hover:bg-stone-900 hover:text-white disabled:border-stone-300 disabled:text-stone-300 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Outcome coverage summary */}
              <div className="flex items-center justify-center mb-6 text-xs text-stone-500 font-mono">
                <span className="font-bold text-stone-900">{withOutcome}</span>&nbsp;of&nbsp;
                <span className="font-bold text-stone-900">{timelineItems.length}</span>&nbsp;initiatives have an outcome metric
              </div>

              {/* Swimlane board */}
              <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                {/* Column header */}
                <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <div className="px-4 py-3 text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500 bg-stone-50 border-b border-stone-200">Initiative</div>
                  <div className="px-4 py-3 text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500 bg-stone-50 border-b border-l border-stone-200">Outcome Metric</div>
                </div>

                {displayData.teams.map((team) => {
                  const teamItems = timelineItems.filter((i) => i.teamId === team.id);
                  if (teamItems.length === 0) return null;
                  return (
                    <div key={team.id}>
                      <div className="px-4 py-2 bg-stone-200 text-stone-800 text-[11px] font-mono font-bold uppercase tracking-widest">{team.name}</div>
                      {teamItems.map((item) => {
                        const { cleanText } = extractDate(item.text);
                        return (
                          <div key={item.id} className="grid border-b border-stone-100" style={{ gridTemplateColumns: "1fr 1fr" }}>
                            <div onClick={() => setExpandedItem(item.id)} className="px-4 py-3 flex items-center gap-2 cursor-pointer hover:bg-stone-50 transition-colors">
                              {item.tag && <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${getTagStyle(item.tag)}`}>{item.tag}</span>}
                              <span className="text-sm text-stone-800 leading-snug">{cleanText}</span>
                              <Circle className={`ml-auto w-2.5 h-2.5 flex-shrink-0 ${flagDot(item.flag)}`} />
                            </div>
                            <div className="px-4 py-3 border-l border-stone-100 flex items-center">
                              <OutcomeCell item={item} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {timelineItems.length === 0 && (
                  <div className="px-4 py-10 text-center text-xs text-stone-400 italic">
                    No initiatives in {selectedCol.subtitle || selectedCol.title}
                  </div>
                )}
              </div>

              <div className="mt-6 text-xs text-stone-500 font-mono flex flex-wrap items-center gap-x-6 gap-y-1">
                {!isPreview && <span><span className="font-bold">Click</span> any initiative to set its outcome metric</span>}
                <span className="ml-auto opacity-40">{APP_VERSION}</span>
              </div>
            </div>
          );
        })()}

        {/* ── Gantt view ── */}
        {activeView === "gantt" && (() => {
          const LABEL = GANTT_LABEL_W, COL = ganttColW;
          const ymKey = (iso) => { const [y, m] = iso.split("-").map(Number); return y * 12 + (m - 1); };
          const dayOf = (iso) => Number(iso.split("-")[2]) || 1;
          // Day-of-month snapped to quarter slots. Start = left edge of its slot, End = right edge.
          const startFrac = (d) => (d <= 8 ? 0    : d <= 15 ? 0.25 : d <= 23 ? 0.5  : 0.75);
          const endFrac   = (d) => (d <= 8 ? 0.25 : d <= 15 ? 0.5  : d <= 23 ? 0.75 : 1);
          // Fractional month position: each item's bar runs from startPos → endPos (in month units).
          const scheduled = displayData.items
            .map((it) => {
              // No start date → default to the first working day of the end date's quarter.
              const sIso = it.startDate || (it.endDate ? quarterStartWorkingDay(it.endDate) : null);
              const eIso = it.endDate || it.startDate;
              if (!sIso || !eIso) return null;
              let a = ymKey(sIso) + startFrac(dayOf(sIso));
              let b = ymKey(eIso) + endFrac(dayOf(eIso));
              if (b < a) { const t = a; a = b - 0.25; b = t; } // guard reversed dates
              if (b - a < 0.25) b = a + 0.25;                  // keep a visible minimum
              return { it, startPos: a, endPos: b };
            })
            .filter(Boolean);
          const unscheduled = displayData.items.filter((it) => !it.startDate && !it.endDate);

          const barCls = (flag) =>
            flag === "warning" ? "bg-amber-400 text-amber-950"
            : flag === "risk" ? "bg-rose-500 text-white"
            : flag === "completed" ? "bg-emerald-500 text-white"
            : flag === "done" ? "bg-stone-400 text-white"
            : "bg-sky-500 text-white";

          const UnscheduledStrip = () => (unscheduled.length === 0 ? null : (
            <div className="mt-4 bg-white border border-dashed border-stone-300 rounded-xl px-4 py-3">
              <div className="text-[9px] font-mono uppercase tracking-wider text-stone-400 mb-2">Unscheduled — no start/end date set ({unscheduled.length})</div>
              <div className="flex flex-wrap gap-2">
                {unscheduled.map((it) => {
                  const { cleanText } = getItemDisplay(it);
                  return (
                    <button key={it.id} onClick={() => setExpandedItem(it.id)}
                      className="text-[11px] bg-stone-100 border border-stone-200 rounded px-2 py-1 hover:border-stone-400 transition-colors">
                      {it.tag && <span className="font-bold">{it.tag}: </span>}{cleanText}
                    </button>
                  );
                })}
              </div>
            </div>
          ));

          if (scheduled.length === 0) {
            return (
              <div className="max-w-[1400px] mx-auto">
                <div className="bg-white border border-stone-200 rounded-xl px-6 py-10 text-center">
                  <div className="text-sm font-bold text-stone-700 mb-1">Nothing scheduled yet</div>
                  <div className="text-xs text-stone-400">Open an item and set a <span className="font-semibold">Start</span> / <span className="font-semibold">End</span> date to place it on the Gantt.</div>
                </div>
                <UnscheduledStrip />
                <div className="mt-6 text-xs text-stone-500 font-mono flex items-center"><span className="ml-auto opacity-40">{APP_VERSION}</span></div>
              </div>
            );
          }

          const itemsMinK = Math.floor(Math.min(...scheduled.map((x) => x.startPos)));
          const itemsMaxK = Math.ceil(Math.max(...scheduled.map((x) => x.endPos))) - 1;
          // Always show at least the prev/current/next-quarter window (9 months), even if
          // no items fall in those months; extend further to cover any out-of-window items.
          const gNow = new Date();
          const gQ = Math.floor(gNow.getMonth() / 3);
          const windowStart = gNow.getFullYear() * 12 + (gQ * 3 - 3);
          const windowEnd = gNow.getFullYear() * 12 + (gQ * 3 + 5);
          const minK = Math.min(itemsMinK, windowStart);
          const maxK = Math.max(itemsMaxK, windowEnd);
          const months = [];
          for (let k = minK; k <= maxK; k++) months.push({ y: Math.floor(k / 12), m: (k % 12) + 1 });
          const N = months.length;
          const years = [];
          months.forEach((mo, i) => { const g = years[years.length - 1]; if (g && g.y === mo.y) g.count++; else years.push({ y: mo.y, start: i, count: 1 }); });
          const quarters = [];
          months.forEach((mo, i) => {
            const q = Math.floor((mo.m - 1) / 3) + 1;
            const g = quarters[quarters.length - 1];
            if (g && g.y === mo.y && g.q === q) g.count++;
            else quarters.push({ y: mo.y, q, start: i, count: 1 });
          });
          const gridCols = `repeat(${N}, ${COL}px)`;

          return (
            <div className="max-w-[1400px] mx-auto">
              {/* Legend */}
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs mb-3">
                {[["On Track", "bg-sky-500"], ["At Risk", "bg-amber-400"], ["Blocked", "bg-rose-500"], ["Done", "bg-emerald-500"], ["Deprioritised", "bg-stone-400"]].map(([lbl, cls]) => (
                  <span key={lbl} className="flex items-center gap-1.5"><span className={`w-3 h-3 rounded ${cls}`} />{lbl}</span>
                ))}
              </div>

              {/* Pinned header (syncs horizontally with the body) */}
              <div ref={ganttHeaderRef} className="sticky top-0 z-30 overflow-hidden border border-b-0 border-stone-200 rounded-t-xl bg-white">
                <div className="flex">
                  <div className="sticky left-0 z-40 bg-white border-r border-stone-200 flex-shrink-0" style={{ width: LABEL, height: 30 }} />
                  <div style={{ display: "grid", gridTemplateColumns: gridCols }}>
                    {years.map((g) => (
                      <div key={g.y} style={{ gridColumn: `${g.start + 1} / span ${g.count}`, height: 30 }}
                        className="flex items-center justify-center text-xs font-black uppercase tracking-wider text-stone-600 bg-stone-50 border-r border-stone-200">{g.y}</div>
                    ))}
                  </div>
                </div>
                <div className="flex">
                  <div className="sticky left-0 z-40 bg-white border-r border-stone-200 flex-shrink-0" style={{ width: LABEL, height: 22 }} />
                  <div style={{ display: "grid", gridTemplateColumns: gridCols }}>
                    {quarters.map((g, i) => (
                      <div key={i} style={{ gridColumn: `${g.start + 1} / span ${g.count}`, height: 22 }}
                        className="flex items-center justify-center text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500 bg-stone-100/70 border-r border-stone-200">Q{g.q}</div>
                    ))}
                  </div>
                </div>
                <div className="flex">
                  <div className="sticky left-0 z-40 bg-white border-r border-stone-200 flex-shrink-0 flex items-center px-3" style={{ width: LABEL, height: 26 }}>
                    <span className="text-[9px] font-mono uppercase tracking-wider text-stone-400">Team / Month</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: gridCols }}>
                    {months.map((mo, i) => (
                      <div key={i} className={`flex items-center justify-center text-[10px] font-mono font-semibold text-stone-500 bg-white border-r ${mo.m % 3 === 0 ? "border-stone-200" : "border-stone-100"}`} style={{ height: 26 }}>{MONTHS_ABBR[mo.m - 1]}</div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Body — scrolls horizontally; page handles vertical scroll */}
              <div ref={ganttBodyRef}
                onScroll={(e) => { if (ganttHeaderRef.current) ganttHeaderRef.current.scrollLeft = e.currentTarget.scrollLeft; }}
                className="overflow-x-auto border border-stone-200 rounded-b-xl bg-white">
                {displayData.teams.map((team) => {
                  const teamRows = scheduled.filter((x) => x.it.teamId === team.id);
                  return (
                    <div key={team.id} className="flex border-b border-stone-200 last:border-b-0" style={{ width: LABEL + N * COL }}>
                      <div className="sticky left-0 z-20 bg-stone-100 border-r border-stone-200 flex-shrink-0 flex items-center px-3 text-[11px] font-bold uppercase tracking-wide text-stone-800 leading-tight" style={{ width: LABEL }}>
                        {team.name}
                      </div>
                      <div className="flex-shrink-0" style={{ width: N * COL, backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${COL - 1}px, #f5f5f4 ${COL - 1}px, #f5f5f4 ${COL}px)` }}>
                        {teamRows.length === 0 ? (
                          <div style={{ height: 34 }} />
                        ) : teamRows.map(({ it, startPos, endPos }) => {
                          const { cleanText } = getItemDisplay(it);
                          const left = (startPos - minK) * COL;
                          const width = (endPos - startPos) * COL;
                          return (
                            <div key={it.id} className="relative" style={{ height: 34 }}>
                              <div onClick={() => setExpandedItem(it.id)} title={cleanText}
                                style={{ position: "absolute", top: 5, left: left + 2, width: Math.max(8, width - 4) }}
                                className={`h-6 rounded-md flex items-center px-2 text-[10px] font-semibold overflow-hidden whitespace-nowrap cursor-pointer shadow-sm hover:brightness-105 transition ${barCls(it.flag)}`}>
                                {it.tag && <span className="font-bold mr-1 opacity-90">{it.tag}</span>}{cleanText}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <UnscheduledStrip />

              <div className="mt-6 text-xs text-stone-500 font-mono flex flex-wrap items-center gap-x-6 gap-y-1">
                {!isPreview && <span><span className="font-bold">Click</span> any bar to open the item · set Start/End dates in the modal</span>}
                <span className="ml-auto opacity-40">{APP_VERSION}</span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Item modal */}
      {expandedItem && (() => {
        const modalItem = displayData.items.find((i) => i.id === expandedItem);
        if (!modalItem) return null;
        const { pill, cleanText } = getItemDisplay(modalItem);
        return (
          <div
            className="fixed inset-0 bg-stone-900/50 flex items-center justify-center p-6 z-50"
            onClick={() => setExpandedItem(null)}
          >
            <div
              className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Read-only banner */}
              {isPreview && (
                <div className="text-center text-[9px] font-mono font-semibold uppercase tracking-[0.25em] text-stone-400 bg-stone-50 border-b border-stone-100 py-1.5">
                  Read Only
                </div>
              )}

              {/* Modal header */}
              <div className="px-5 py-4 border-b border-stone-100 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    {modalItem.tag && (
                      <span className={`font-bold text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${getTagStyle(modalItem.tag)}`}>
                        {modalItem.tag}
                      </span>
                    )}
                    {pill && (
                      <span className="inline-flex items-center font-mono font-semibold text-[9px] tracking-wider bg-white border border-stone-400 text-stone-700 px-1.5 py-0.5 rounded-sm">
                        {pill}
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-bold text-stone-900 leading-snug">{cleanText}</div>
                </div>
                <button
                  onClick={() => setExpandedItem(null)}
                  className="flex-shrink-0 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded p-1 transition-colors"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal inner tabs */}
              <div className="flex border-b border-stone-100">
                {[{ id: "details", label: "Details" }, { id: "outcome", label: "Outcome Metric" }].map(({ id, label }) => (
                  <button key={id} onClick={() => setModalTab(id)}
                    className={`text-[10px] font-mono font-semibold uppercase tracking-wider px-5 py-2.5 border-b-2 transition-colors ${modalTab === id ? "border-stone-700 text-stone-900" : "border-transparent text-stone-400 hover:text-stone-700"}`}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Modal body — Details tab */}
              {modalTab === "details" && (
              <div className="px-5 py-4 space-y-4">
                <div>
                  <label className="text-[9px] font-mono uppercase tracking-wider text-stone-400 block mb-1">
                    Title <span className="normal-case opacity-60">— prefix with country code to set tag, e.g. FR: name</span>
                  </label>
                  <input
                    type="text"
                    defaultValue={modalItem.tag ? `${modalItem.tag}: ${modalItem.text}` : modalItem.text}
                    autoFocus={!isPreview}
                    readOnly={isPreview}
                    onBlur={isPreview ? undefined : (e) => {
                      const { tag, text } = extractTag(e.target.value.trim());
                      updateItem(modalItem.id, { tag: tag || null, text: text || e.target.value.trim() });
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                    className={`w-full text-xs border border-stone-300 rounded px-2 py-1 focus:outline-none focus:border-stone-500 ${isPreview ? "bg-stone-100" : "bg-white"}`}
                  />
                </div>
                <div>
                  <label className="text-[9px] font-mono uppercase tracking-wider text-stone-400 block mb-2">
                    Timeline <span className="normal-case opacity-60">— End date sets the due pill &amp; places the item on the Gantt</span>
                  </label>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-[9px] text-stone-400 block mb-1">Start</label>
                      <input type="date" key={modalItem.id + "-start"}
                        defaultValue={modalItem.startDate ?? ""}
                        disabled={isPreview}
                        onChange={isPreview ? undefined : (e) => updateItem(modalItem.id, { startDate: e.target.value || null })}
                        className={`w-full text-xs border border-stone-300 rounded px-2 py-1.5 focus:outline-none focus:border-stone-500 ${isPreview ? "bg-stone-100 text-stone-500" : "bg-white"}`} />
                    </div>
                    <div className="flex-1">
                      <label className="text-[9px] text-stone-400 block mb-1">End (due)</label>
                      <input type="date" key={modalItem.id + "-end"}
                        defaultValue={modalItem.endDate ?? ""}
                        disabled={isPreview}
                        onChange={isPreview ? undefined : (e) => updateItem(modalItem.id, { endDate: e.target.value || null })}
                        className={`w-full text-xs border border-stone-300 rounded px-2 py-1.5 focus:outline-none focus:border-stone-500 ${isPreview ? "bg-stone-100 text-stone-500" : "bg-white"}`} />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-[9px] font-mono uppercase tracking-wider text-stone-400 block mb-1">Strategic Category</label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      disabled={isPreview}
                      onClick={isPreview ? undefined : () => updateItem(modalItem.id, { strategicCategory: null })}
                      className={`text-[10px] font-mono px-2 py-1 rounded border transition-colors ${!modalItem.strategicCategory ? "border-stone-400 bg-stone-100 font-bold text-stone-900" : "border-stone-200 text-stone-400 hover:border-stone-400 hover:text-stone-700"}`}
                    >None</button>
                    {STRATEGIC_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        disabled={isPreview}
                        onClick={isPreview ? undefined : () => updateItem(modalItem.id, { strategicCategory: cat.id })}
                        className={`text-[10px] font-mono px-2 py-1 rounded border transition-colors ${modalItem.strategicCategory === cat.id ? `${cat.headerBg} ${cat.headerText} border-transparent font-bold` : "border-stone-200 text-stone-500 hover:border-stone-400 hover:text-stone-700"}`}
                      >"{cat.label}"</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[9px] font-mono uppercase tracking-wider text-stone-400 block mb-1">Notes</label>
                  <textarea
                    defaultValue={modalItem.description || ""}
                    readOnly={isPreview}
                    onBlur={isPreview ? undefined : (e) => updateItem(modalItem.id, { description: e.target.value.trim() || null })}
                    placeholder={isPreview ? "No notes added" : "Add a description or comment…"}
                    rows={8}
                    className={`w-full text-xs border border-stone-300 rounded px-2 py-1 resize-none focus:outline-none focus:border-stone-500 ${isPreview ? "bg-stone-100" : "bg-white"}`}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center text-white font-bold text-[8px]" style={{ backgroundColor: "#0052CC" }}>J</span>
                    <input
                      type="url"
                      defaultValue={modalItem.jiraUrl || ""}
                      readOnly={isPreview}
                      onBlur={isPreview ? undefined : (e) => updateItem(modalItem.id, { jiraUrl: e.target.value.trim() || null })}
                      placeholder="JIRA issue URL"
                      className="flex-1 text-xs border border-stone-300 rounded px-2 py-1 bg-white focus:outline-none focus:border-stone-500 min-w-0"
                    />
                    {modalItem.jiraUrl && (
                      <a href={modalItem.jiraUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 text-stone-400 hover:text-stone-700">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center text-white font-bold text-[8px]" style={{ backgroundColor: "#0065FF" }}>C</span>
                    <input
                      type="url"
                      defaultValue={modalItem.confluenceUrl || ""}
                      readOnly={isPreview}
                      onBlur={isPreview ? undefined : (e) => updateItem(modalItem.id, { confluenceUrl: e.target.value.trim() || null })}
                      placeholder="Confluence page URL"
                      className="flex-1 text-xs border border-stone-300 rounded px-2 py-1 bg-white focus:outline-none focus:border-stone-500 min-w-0"
                    />
                    {modalItem.confluenceUrl && (
                      <a href={modalItem.confluenceUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 text-stone-400 hover:text-stone-700">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
              )}{/* end details tab */}

              {/* Modal body — Outcome Metric tab */}
              {modalTab === "outcome" && (() => {
                const usedMetrics = [...new Set(displayData.items.map((i) => i.metricName).filter(Boolean))];
                const previewChips = outcomeChips(modalItem);
                return (
                  <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
                    {/* Value type — the quantified part (mutually exclusive) */}
                    <div>
                      <label className="text-[9px] font-mono uppercase tracking-wider text-stone-400 block mb-2">Value Type <span className="normal-case opacity-60">— how this is measured</span></label>
                      <div className="flex gap-2 flex-wrap">
                        {VALUE_TYPES.map(({ val, label, active }) => (
                          <button key={String(val)} disabled={isPreview} onClick={isPreview ? undefined : () => updateItem(modalItem.id, { revenueType: val })}
                            className={`text-[10px] font-mono px-3 py-1.5 rounded border transition-colors ${
                              modalItem.revenueType === val
                                ? `${active} font-bold`
                                : "border-stone-200 text-stone-500 hover:border-stone-400 hover:text-stone-700"
                            }`}>{label}</button>
                        ))}
                      </div>
                    </div>

                    {/* Live preview — exactly what shows in the "by IMPACT" column (value + enables chips) */}
                    <div className="rounded-md bg-stone-50 border border-stone-200 px-3 py-2 flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] font-mono uppercase tracking-wider text-stone-400">Preview</span>
                      {previewChips.length > 0 ? (
                        previewChips.map((c, idx) => (
                          <span key={idx} className={`inline-flex items-center gap-2 text-[12px] px-2.5 py-1 rounded-md border ${c.chip}`}>
                            <span>{c.icon}</span>
                            {c.label && <span className="font-semibold">{c.label}</span>}
                            {c.value && <span className="font-mono font-bold">{c.value}</span>}
                            {c.suffix && <span className="text-[10px] uppercase tracking-wider opacity-70">{c.suffix}</span>}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-stone-400 italic">Set a value type or an "enables" note below — chips update when you click out of a field</span>
                      )}
                    </div>

                    {/* Cost impact + value — saving only */}
                    {modalItem.revenueType === "saving" && (
                      <>
                        <div>
                          <label className="text-[9px] font-mono uppercase tracking-wider text-stone-400 block mb-2">Cost Impact</label>
                          <div className="flex gap-2 flex-wrap">
                            {[{ val: "reduce", label: "Reduces a cost" }, { val: "utilize", label: "Utilises existing spend" }].map(({ val, label }) => (
                              <button key={val} disabled={isPreview} onClick={isPreview ? undefined : () => updateItem(modalItem.id, { savingKind: val })}
                                className={`text-[10px] font-mono px-3 py-1.5 rounded border transition-colors ${
                                  modalItem.savingKind === val
                                    ? "border-teal-500 bg-teal-50 text-teal-800 font-bold"
                                    : "border-stone-200 text-stone-500 hover:border-stone-400 hover:text-stone-700"
                                }`}>{label}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-[9px] font-mono uppercase tracking-wider text-stone-400 block mb-1">Value (€)</label>
                          <input type="number" key={modalItem.id + "-saving"}
                            defaultValue={modalItem.savingAmount ?? ""}
                            readOnly={isPreview}
                            onBlur={isPreview ? undefined : (e) => updateItem(modalItem.id, { savingAmount: e.target.value ? Number(e.target.value) : null })}
                            placeholder="e.g. 240000"
                            className={`w-full text-xs border border-stone-300 rounded px-2 py-1.5 focus:outline-none focus:border-stone-500 ${isPreview ? "bg-stone-100" : "bg-white"}`} />
                          {modalItem.savingAmount && (
                            <div className="text-[9px] text-stone-400 mt-1">Displays as {formatUplift(modalItem.savingAmount)} on the chip</div>
                          )}
                        </div>
                        <div>
                          <label className="text-[9px] font-mono uppercase tracking-wider text-stone-400 block mb-2">Frequency</label>
                          <CadenceToggle value={modalItem.cadence} disabled={isPreview}
                            onSelect={(v) => updateItem(modalItem.id, { cadence: v })} />
                        </div>
                        <div>
                          <label className="text-[9px] font-mono uppercase tracking-wider text-stone-400 block mb-1">Cost Area / Vendor <span className="normal-case opacity-60">— optional</span></label>
                          <input type="text" key={modalItem.id + "-savingarea"}
                            defaultValue={modalItem.savingArea ?? ""}
                            readOnly={isPreview}
                            onBlur={isPreview ? undefined : (e) => updateItem(modalItem.id, { savingArea: e.target.value.trim() || null })}
                            placeholder="e.g. Acme Search license, manual ops"
                            className={`w-full text-xs border border-stone-300 rounded px-2 py-1.5 focus:outline-none focus:border-stone-500 ${isPreview ? "bg-stone-100" : "bg-white"}`} />
                        </div>
                      </>
                    )}

                    {/* Uplift (+ optional range) — direct only */}
                    {modalItem.revenueType === "direct" && (
                      <div>
                        <label className="text-[9px] font-mono uppercase tracking-wider text-stone-400 block mb-1">Revenue Uplift (€) <span className="normal-case opacity-60">— leave "to" blank for a single value, or fill it for a range</span></label>
                        <div className="flex items-center gap-2">
                          <input type="number" key={modalItem.id + "-uplift"}
                            defaultValue={modalItem.revenueUplift ?? ""}
                            readOnly={isPreview}
                            onBlur={isPreview ? undefined : (e) => updateItem(modalItem.id, { revenueUplift: e.target.value ? Number(e.target.value) : null })}
                            placeholder="e.g. 10000"
                            className="flex-1 min-w-0 text-xs border border-stone-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-stone-500" />
                          <span className="text-stone-400 text-xs">to</span>
                          <input type="number" key={modalItem.id + "-upliftmax"}
                            defaultValue={modalItem.outcomeMax ?? ""}
                            readOnly={isPreview}
                            onBlur={isPreview ? undefined : (e) => updateItem(modalItem.id, { outcomeMax: e.target.value ? Number(e.target.value) : null })}
                            placeholder="e.g. 25000"
                            className="flex-1 min-w-0 text-xs border border-stone-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-stone-500" />
                        </div>
                        {modalItem.revenueUplift != null && (
                          <div className="text-[9px] text-stone-400 mt-1">Shows as {formatRange(modalItem.revenueUplift, modalItem.outcomeMax)} on the chip</div>
                        )}
                      </div>
                    )}

                    {/* Cadence — direct only */}
                    {modalItem.revenueType === "direct" && (
                      <div>
                        <label className="text-[9px] font-mono uppercase tracking-wider text-stone-400 block mb-2">Cadence</label>
                        <div className="flex gap-2 flex-wrap">
                          {[{ v: "once", l: "One-time" }, { v: "month", l: "Per month" }, { v: "year", l: "Per year" }].map(({ v, l }) => (
                            <button key={v} disabled={isPreview}
                              onClick={isPreview ? undefined : () => updateItem(modalItem.id, { cadence: modalItem.cadence === v ? null : v })}
                              className={`text-[10px] font-mono px-3 py-1.5 rounded border transition-colors ${
                                modalItem.cadence === v
                                  ? "border-green-600 bg-green-50 text-green-800 font-bold"
                                  : "border-stone-200 text-stone-500 hover:border-stone-400 hover:text-stone-700"
                              }`}>{l}</button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Metric (KPI) — metric only */}
                    {modalItem.revenueType === "metric" && (
                      <>
                        <div>
                          <label className="text-[9px] font-mono uppercase tracking-wider text-stone-400 block mb-2">Direction</label>
                          <div className="flex gap-2">
                            {[{ v: "up", l: "↑ Increase" }, { v: "down", l: "↓ Decrease" }].map(({ v, l }) => (
                              <button key={v} disabled={isPreview}
                                onClick={isPreview ? undefined : () => updateItem(modalItem.id, { metricDir: v })}
                                className={`text-[10px] font-mono px-3 py-1.5 rounded border transition-colors ${
                                  (modalItem.metricDir || "up") === v
                                    ? "border-sky-500 bg-sky-50 text-sky-800 font-bold"
                                    : "border-stone-200 text-stone-500 hover:border-stone-400 hover:text-stone-700"
                                }`}>{l}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-[9px] font-mono uppercase tracking-wider text-stone-400 block mb-1">Metric <span className="normal-case opacity-60">— what moves</span></label>
                          <input type="text" list="metric-datalist" key={modalItem.id + "-metricname"}
                            defaultValue={modalItem.metricName ?? ""}
                            readOnly={isPreview}
                            onBlur={isPreview ? undefined : (e) => updateItem(modalItem.id, { metricName: e.target.value.trim() || null })}
                            placeholder="e.g. # of leads, CT Opt-In rate, Churn"
                            className={`w-full text-xs border border-stone-300 rounded px-2 py-1.5 focus:outline-none focus:border-stone-500 ${isPreview ? "bg-stone-100" : "bg-white"}`} />
                          <datalist id="metric-datalist">
                            {usedMetrics.map((m) => <option key={m} value={m} />)}
                          </datalist>
                        </div>
                        <div>
                          <label className="text-[9px] font-mono uppercase tracking-wider text-stone-400 block mb-1">Change</label>
                          <div className="flex items-center gap-2">
                            <input type="number" step="any" key={modalItem.id + "-metricval"}
                              defaultValue={modalItem.metricValue ?? ""}
                              readOnly={isPreview}
                              onBlur={isPreview ? undefined : (e) => updateItem(modalItem.id, { metricValue: e.target.value ? Number(e.target.value) : null })}
                              placeholder="e.g. 1.5"
                              className="flex-1 min-w-0 text-xs border border-stone-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-stone-500" />
                            <select key={modalItem.id + "-metricunit"} disabled={isPreview}
                              value={modalItem.metricUnit || "%"}
                              onChange={isPreview ? undefined : (e) => updateItem(modalItem.id, { metricUnit: e.target.value })}
                              className="text-xs border border-stone-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-stone-500">
                              {METRIC_UNITS.map((u) => <option key={u} value={u}>{u === "x" ? "×" : u}</option>)}
                            </select>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Enables / Supports — always available, independent of the value type above */}
                    <div className="border-t border-stone-100 pt-4">
                      <label className="text-[9px] font-mono uppercase tracking-wider text-stone-400 block mb-1">
                        Enables / Supports <span className="normal-case opacity-60">— what this unlocks: a strategic KR, or another topic (optional, shows alongside any value above)</span>
                      </label>
                      <input type="text" key={modalItem.id + "-enables"}
                        defaultValue={modalItem.enablerNote ?? ""}
                        readOnly={isPreview}
                        onBlur={isPreview ? undefined : (e) => updateItem(modalItem.id, { enablerNote: e.target.value.trim() || null })}
                        placeholder="e.g. KR7 + Reducing churn, Enabler for KR6, better fraud detection"
                        className={`w-full text-xs border border-stone-300 rounded px-2 py-1.5 focus:outline-none focus:border-stone-500 ${isPreview ? "bg-stone-100" : "bg-white"}`} />
                    </div>
                  </div>
                );
              })()}

              {/* Status history */}
              {modalItem.statusHistory?.length > 0 && (
                <div className="px-5 pb-4">
                  <div className="border-t border-stone-100 pt-3">
                    <div className="flex items-center mb-2">
                      <div className="text-[9px] font-mono uppercase tracking-wider text-stone-400">Status history</div>
                      {!isPreview && (
                        <button
                          onClick={() => removeStatusEntry(modalItem.id, null)}
                          className="ml-auto text-[9px] font-mono uppercase tracking-wider text-stone-400 hover:text-rose-600 transition-colors"
                          title="Clear the entire status history"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {modalItem.statusHistory.map((entry, idx) => ({ entry, idx })).reverse().slice(0, 8).map(({ entry, idx }) => (
                        <div key={idx} className="group flex items-center gap-2">
                          <Circle className={`w-2.5 h-2.5 flex-shrink-0 ${entry.flag ? `fill-current ${FLAG_COLORS[entry.flag]}` : "text-stone-300"}`} />
                          <span className={`text-[11px] font-mono font-semibold flex-shrink-0 ${entry.flag ? FLAG_COLORS[entry.flag] : "text-stone-400"}`}>
                            {FLAG_LABELS[entry.flag] || "On Track"}
                          </span>
                          <span className="text-[10px] text-stone-400 ml-auto flex-shrink-0">{formatHistoryDate(entry.at)}</span>
                          {!isPreview && (
                            <button
                              onClick={() => removeStatusEntry(modalItem.id, idx)}
                              className="flex-shrink-0 text-stone-300 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-all"
                              title="Remove this entry"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Modal footer */}
              <div className="px-5 py-3 border-t border-stone-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-mono text-stone-400 mr-1">Status</span>
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={String(opt.flag)}
                      disabled={isPreview}
                      onClick={isPreview ? undefined : () => setFlag(modalItem.id, opt.flag)}
                      className={`flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded border transition-colors ${
                        modalItem.flag === opt.flag
                          ? "border-stone-400 bg-stone-100 font-bold text-stone-900"
                          : "border-stone-200 text-stone-500 hover:border-stone-400 hover:bg-stone-50"
                      }`}
                    >
                      <Circle className={`w-2.5 h-2.5 flex-shrink-0 ${opt.dot}`} />
                      {opt.label}
                    </button>
                  ))}
                </div>
                {!isPreview && (
                  <button
                    onClick={() => setDeleteConfirm({ id: modalItem.id, text: modalItem.text })}
                    className="text-[10px] font-mono text-stone-400 hover:text-rose-600 uppercase tracking-wider border border-stone-200 hover:border-rose-300 px-2.5 py-1 rounded transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 bg-stone-900/50 flex items-center justify-center p-6 z-[60]"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4">
              <div className="text-sm font-bold text-stone-900 mb-1">Delete this item?</div>
              <p className="text-xs text-stone-500 leading-relaxed line-clamp-2">"{deleteConfirm.text}"</p>
            </div>
            <div className="px-5 pb-4 flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="text-xs font-mono uppercase tracking-wider text-stone-600 hover:text-stone-900 border border-stone-200 hover:border-stone-400 px-3 py-1.5 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { deleteItem(deleteConfirm.id); setDeleteConfirm(null); setExpandedItem(null); }}
                className="text-xs font-mono uppercase tracking-wider text-white bg-rose-500 hover:bg-rose-600 px-3 py-1.5 rounded transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
