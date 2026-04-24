import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, GripVertical, X, Circle, Download, Upload, Share2, ExternalLink } from "lucide-react";

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

// ---------- Seed data ----------
const seedData = {
  title: "My Roadmap",
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
  const rows = items.map((i) => headers.map((h) => escape(i[h])).join(","));
  return [headers.join(","), ...rows].join("\n");
}

const CSV_ITEM_HEADERS = ["id", "columnId", "teamId", "tag", "text", "flag", "description", "jiraUrl", "confluenceUrl"];

function downloadCsv(items, filename = "roadmap.csv") {
  const csv = itemsToCsv(items);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click();
  document.body.removeChild(link); URL.revokeObjectURL(url);
}

// ---------- Share encoding ----------
function encodeShareData(d) {
  return btoa(encodeURIComponent(JSON.stringify(d)));
}
function decodeShareData(str) {
  try { return JSON.parse(decodeURIComponent(atob(str))); } catch { return null; }
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

// ---------- Color tokens per column ----------
const columnStyles = {
  green: {
    header: "bg-emerald-400", headerText: "text-emerald-950",
    body: "bg-emerald-50", section: "bg-emerald-100",
    item: "bg-emerald-50 border-emerald-200 hover:border-emerald-400",
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
  risk: "bg-rose-200 border-rose-400",
  warning: "bg-amber-200 border-amber-400",
  done: "bg-gray-300 border-gray-400 line-through text-gray-600",
  null: "",
};

const tagColors = {
  "FR/DE": "bg-slate-800 text-white",
  "DE": "bg-yellow-400 text-black",
  "FR": "bg-red-600 text-white",
  "AT": "bg-blue-600 text-white",
};

function getTagColor(tag) {
  return tagColors[tag] || "bg-slate-600 text-white";
}

export default function RoadmapTracker() {
  const [data, setData] = useState(seedData);
  const [loading, setLoading] = useState(true);
  const [dragItem, setDragItem] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [dragOverSection, setDragOverSection] = useState(null);
  const [addingTo, setAddingTo] = useState(null); // { columnId, teamId }
  const [newItemTag, setNewItemTag] = useState("FR/DE");
  const [newItemText, setNewItemText] = useState("");
  const [expandedItem, setExpandedItem] = useState(null);
  const [editingSubtitle, setEditingSubtitle] = useState(null);
  const [editingTeam, setEditingTeam] = useState(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [sharedPreview, setSharedPreview] = useState(null);
  const [saveCopyName, setSaveCopyName] = useState("");
  const [shareCopied, setShareCopied] = useState(false);
  const fileInputRef = useRef(null);
  const backupInputRef = useRef(null);

  // Load from localStorage if available, else fetch CSV seed
  useEffect(() => {
    (async () => {
      // Detect share link in URL hash
      const hash = window.location.hash;
      if (hash.startsWith("#share=")) {
        const decoded = decodeShareData(hash.slice(7));
        if (decoded?.columns && decoded?.teams && decoded?.items) {
          setSharedPreview(decoded);
          // Remove hash from URL so refresh doesn't re-trigger the preview
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        }
      }

      // Load own data (always, so dismissing preview shows the user's roadmap)
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          // Migrate future column from rose → slate
          parsed.columns = parsed.columns.map((c) =>
            c.id === "future" && c.color === "rose" ? { ...c, color: "slate" } : c
          );
          if (!parsed.title) parsed.title = seedData.title;
          setData(parsed);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
          setLoading(false);
          return;
        }
      } catch (e) {
        // fall through to CSV load
      }

      // No localStorage — load from roadmap.csv in public folder
      try {
        const res = await fetch("/roadmap.csv");
        if (res.ok) {
          const text = await res.text();
          const items = csvToItems(text);
          const initial = { ...seedData, items };
          setData(initial);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
        }
      } catch (e) {
        console.warn("Could not load roadmap.csv, using empty seed", e);
      }
      setLoading(false);
    })();
  }, []);

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
    const encoded = encodeShareData(data);
    const url = `${window.location.origin}${window.location.pathname}#share=${encoded}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch {
      // Fallback for browsers that block clipboard without interaction
      prompt("Copy this share link:", url);
    }
  };

  const saveCopyAndSwitch = () => {
    const name = saveCopyName.trim();
    if (!name) return;
    const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (!slug) return;
    localStorage.setItem(`roadmap-data-${slug}`, JSON.stringify(sharedPreview));
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
        if (confirm(`Import ${items.length} items? This will replace your current roadmap.`)) {
          saveData({ ...data, items });
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
    const newItem = {
      id: `i${Date.now()}`, columnId, teamId,
      tag: newItemTag, text: newItemText.trim(), flag: null,
    };
    saveData({ ...data, items: [...data.items, newItem] });
    setNewItemText(""); setAddingTo(null);
  };

  const deleteItem = (id) => {
    saveData({ ...data, items: data.items.filter((i) => i.id !== id) });
  };

  const cycleFlag = (id) => {
    const flagCycle = [null, "risk", "warning", "done"];
    const newItems = data.items.map((i) => {
      if (i.id === id) {
        const currentIdx = flagCycle.indexOf(i.flag);
        return { ...i, flag: flagCycle[(currentIdx + 1) % flagCycle.length] };
      }
      return i;
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
    link.href = url; link.download = `roadmap-backup-${today}.json`;
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-stone-600 font-mono text-sm tracking-wider">LOADING ROADMAP...</div>
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
                className={`flex items-center gap-1.5 text-xs font-mono tracking-wider uppercase border px-2.5 py-1 rounded transition-colors ${
                  shareCopied
                    ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                    : "border-stone-300 bg-white text-stone-700 hover:text-stone-900 hover:bg-stone-100"
                }`}
                title="Copy a share link to your clipboard — recipients open the link and see a read-only preview with the option to save their own copy"
              >
                <Share2 className="w-3 h-3" />
                {shareCopied ? "Link copied!" : "Share"}
              </button>
              <button
                onClick={() => exportCsv(displayData.items)}
                className="flex items-center gap-1.5 text-xs font-mono tracking-wider text-stone-700 hover:text-stone-900 uppercase border border-stone-300 bg-white hover:bg-stone-100 px-2.5 py-1 rounded transition-colors"
                title="Download your current roadmap as a CSV file"
              >
                <Download className="w-3 h-3" />
                Export CSV
              </button>
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
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-black tracking-tight text-stone-900" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
              2026
            </h1>
            <div className="flex gap-1.5">
              <span className="w-3.5 h-3.5 rounded-full bg-emerald-500" title="On track"></span>
              <span className="w-3.5 h-3.5 rounded-full bg-amber-400" title="At risk"></span>
              <span className="w-3.5 h-3.5 rounded-full bg-rose-500" title="Blocked"></span>
            </div>
            <div className="ml-auto text-xs text-stone-500 font-mono">
              {isPreview ? "Read-only preview — save a copy to make edits" : "Drag items to reorder · Click status dot to cycle flag"}
            </div>
          </div>
        </div>

        {/* Columns */}
        <div className="max-w-[1800px] mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {displayData.columns.map((col) => {
            const styles = columnStyles[col.color] ?? columnStyles.slate;
            return (
              <div key={col.id} className="flex flex-col">
                {/* Column Header */}
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

                {/* Column Body */}
                <div className={`${styles.body} flex-1 rounded-b-lg p-3 space-y-4 min-h-[400px]`}>
                  {displayData.teams.map((team) => {
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
                            const { date, cleanText } = extractDate(item.text);
                            const isExpanded = expandedItem === item.id;
                            return (
                              <div
                                key={item.id}
                                draggable={!isPreview && !isExpanded}
                                onDragStart={!isPreview && !isExpanded ? () => handleDragStart(item) : undefined}
                                onDragOver={!isPreview ? (e) => handleDragOverItem(e, item) : undefined}
                                onDrop={!isPreview ? (e) => handleDrop(e, item) : undefined}
                                onDragEnd={!isPreview ? handleDragEnd : undefined}
                                onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                                className={`
                                  group relative rounded-md border px-2 py-1.5 text-xs transition-all cursor-pointer
                                  ${item.flag ? flagClass : styles.item}
                                  ${isDragOver ? "ring-2 ring-stone-800 translate-y-0.5" : ""}
                                  ${dragItem?.id === item.id ? "opacity-40" : ""}
                                  ${isExpanded ? "ring-1 ring-stone-400 shadow-sm" : ""}
                                `}
                              >
                                {/* Collapsed header row */}
                                <div className="flex items-center gap-1.5">
                                  {!isPreview && !isExpanded && (
                                    <GripVertical className="w-3 h-3 text-stone-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  )}
                                  <span className={`font-bold text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${getTagColor(item.tag)}`}>
                                    {item.tag}
                                  </span>
                                  <span className="flex-1 leading-snug flex flex-wrap items-center gap-1 min-w-0">
                                    <span className="truncate">{cleanText}</span>
                                    {date && (
                                      <span className="inline-flex items-center font-mono font-semibold text-[9px] tracking-wider bg-white border border-stone-400 text-stone-700 px-1.5 py-0.5 rounded-sm flex-shrink-0">
                                        {date}
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
                                  <button
                                    onClick={!isPreview ? (e) => { e.stopPropagation(); cycleFlag(item.id); } : (e) => e.stopPropagation()}
                                    className={`flex-shrink-0 transition-opacity ${!isPreview ? "opacity-60 hover:opacity-100" : "opacity-40 cursor-default"}`}
                                    title={!isPreview ? "Click to cycle status: none → at risk → warning → done" : undefined}
                                  >
                                    <Circle className={`w-3 h-3 ${
                                      item.flag === "risk" ? "fill-rose-500 text-rose-500" :
                                      item.flag === "warning" ? "fill-amber-400 text-amber-400" :
                                      item.flag === "done" ? "fill-gray-400 text-gray-400" :
                                      "text-stone-300"
                                    }`} />
                                  </button>
                                  {!isPreview && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
                                      className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-stone-400 hover:text-rose-600"
                                      title="Delete"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>

                                {/* Expanded panel */}
                                {isExpanded && (
                                  <div
                                    className="mt-2 pt-2 border-t border-stone-200 space-y-2"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {!isPreview ? (
                                      <>
                                        <div>
                                          <label className="text-[9px] font-mono uppercase tracking-wider text-stone-400 block mb-0.5">Title</label>
                                          <input
                                            type="text"
                                            defaultValue={item.text}
                                            autoFocus
                                            onBlur={(e) => updateItem(item.id, { text: e.target.value })}
                                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") e.target.blur(); }}
                                            className="w-full text-xs border border-stone-300 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:border-stone-500"
                                          />
                                        </div>
                                        <div>
                                          <label className="text-[9px] font-mono uppercase tracking-wider text-stone-400 block mb-0.5">Notes</label>
                                          <textarea
                                            defaultValue={item.description || ""}
                                            onBlur={(e) => updateItem(item.id, { description: e.target.value.trim() || null })}
                                            placeholder="Add a description or comment…"
                                            rows={3}
                                            className="w-full text-xs border border-stone-300 rounded px-1.5 py-1 bg-white resize-none focus:outline-none focus:border-stone-500"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <div className="flex items-center gap-1.5">
                                            <span className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center text-white font-bold text-[8px]" style={{ backgroundColor: "#0052CC" }}>J</span>
                                            <input
                                              type="url"
                                              defaultValue={item.jiraUrl || ""}
                                              onBlur={(e) => updateItem(item.id, { jiraUrl: e.target.value.trim() || null })}
                                              placeholder="JIRA issue URL"
                                              className="flex-1 text-xs border border-stone-300 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:border-stone-500 min-w-0"
                                            />
                                            {item.jiraUrl && (
                                              <a href={item.jiraUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex-shrink-0 text-stone-400 hover:text-stone-700">
                                                <ExternalLink className="w-3 h-3" />
                                              </a>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-1.5">
                                            <span className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center text-white font-bold text-[8px]" style={{ backgroundColor: "#0065FF" }}>C</span>
                                            <input
                                              type="url"
                                              defaultValue={item.confluenceUrl || ""}
                                              onBlur={(e) => updateItem(item.id, { confluenceUrl: e.target.value.trim() || null })}
                                              placeholder="Confluence page URL"
                                              className="flex-1 text-xs border border-stone-300 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:border-stone-500 min-w-0"
                                            />
                                            {item.confluenceUrl && (
                                              <a href={item.confluenceUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex-shrink-0 text-stone-400 hover:text-stone-700">
                                                <ExternalLink className="w-3 h-3" />
                                              </a>
                                            )}
                                          </div>
                                        </div>
                                      </>
                                    ) : (
                                      /* Preview mode: read-only */
                                      <>
                                        {item.description && (
                                          <p className="text-xs text-stone-600 leading-relaxed whitespace-pre-wrap">{item.description}</p>
                                        )}
                                        <div className="flex flex-wrap gap-2">
                                          {item.jiraUrl && (
                                            <a href={item.jiraUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                                               className="flex items-center gap-1 text-[10px] hover:underline" style={{ color: "#0052CC" }}>
                                              <span className="w-3.5 h-3.5 rounded flex items-center justify-center text-white font-bold text-[7px]" style={{ backgroundColor: "#0052CC" }}>J</span>
                                              JIRA <ExternalLink className="w-2.5 h-2.5" />
                                            </a>
                                          )}
                                          {item.confluenceUrl && (
                                            <a href={item.confluenceUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                                               className="flex items-center gap-1 text-[10px] hover:underline" style={{ color: "#0065FF" }}>
                                              <span className="w-3.5 h-3.5 rounded flex items-center justify-center text-white font-bold text-[7px]" style={{ backgroundColor: "#0065FF" }}>C</span>
                                              Confluence <ExternalLink className="w-2.5 h-2.5" />
                                            </a>
                                          )}
                                          {!item.description && !item.jiraUrl && !item.confluenceUrl && (
                                            <span className="text-[10px] text-stone-400 italic">No notes or links added</span>
                                          )}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* Add Item Form */}
                          {isAdding && (
                            <div className="rounded-md border-2 border-dashed border-stone-400 p-2 bg-white space-y-1.5">
                              <div className="flex gap-1.5">
                                <select
                                  value={newItemTag}
                                  onChange={(e) => setNewItemTag(e.target.value)}
                                  className="text-[10px] font-bold border border-stone-300 rounded px-1 py-0.5"
                                >
                                  <option value="FR/DE">FR/DE</option>
                                  <option value="DE">DE</option>
                                  <option value="FR">FR</option>
                                  <option value="AT">AT</option>
                                </select>
                                <input
                                  type="text"
                                  value={newItemText}
                                  onChange={(e) => setNewItemText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") addItem(col.id, team.id);
                                    if (e.key === "Escape") { setAddingTo(null); setNewItemText(""); }
                                  }}
                                  autoFocus
                                  placeholder="Describe the item..."
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
                          )}
                        </div>
                      </div>
                    );
                  })}
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
        <div className="max-w-[1800px] mx-auto mt-6 text-xs text-stone-500 font-mono flex flex-wrap gap-x-6 gap-y-1">
          {isPreview ? (
            <span>This is a read-only shared view — use <span className="font-bold">Save &amp; open</span> in the banner above to make your own editable copy</span>
          ) : (
            <>
              <span><span className="font-bold">Click</span> any item to expand · edit title, notes, JIRA &amp; Confluence links</span>
              <span><span className="font-bold">Drag</span> any item to reorder or move between columns</span>
              <span><span className="font-bold">Click</span> team name or quarter label to rename · status dot to cycle flag</span>
              <span><span className="font-bold">Hover</span> an item to reveal delete</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
