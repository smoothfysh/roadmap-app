import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, GripVertical, X, Circle, Download, Upload } from "lucide-react";

// ---------- Seed data reflecting the screenshot ----------
const seedData = {
  title: "DEMAND: Growth Streams Roadmap",
  columns: [
    {
      id: "done",
      title: "DONE",
      subtitle: "Released stuff... already LIVE!",
      color: "green",
    },
    {
      id: "coming",
      title: "COMING SOON",
      subtitle: "Q2 2026",
      color: "blue",
    },
    {
      id: "after",
      title: "AFTER THAT",
      subtitle: "Q3 2026",
      color: "amber",
    },
    {
      id: "future",
      title: "FUTURE",
      subtitle: "Beyond the next 6 months",
      color: "slate",
    },
  ],
  teams: [
    { id: "firefly", name: "AUTHENTICATION (Team FIREFLY)" },
    { id: "waterfly", name: "USER MANAGEMENT ++ (Team WATERFLY)" },
    { id: "monet", name: "GROWTH STREAMS (Team MONET)" },
  ],
  items: [],
};

// ---------- CSV helpers ----------
// Parse a single CSV line respecting quoted fields
function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
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
    headers.forEach((h, i) => {
      obj[h] = cells[i] !== undefined ? cells[i].trim() : "";
    });
    return {
      id: obj.id,
      columnId: obj.columnId,
      teamId: obj.teamId,
      tag: obj.tag,
      text: obj.text,
      flag: obj.flag === "" ? null : obj.flag,
    };
  });
}

function itemsToCsv(items) {
  const headers = ["id", "columnId", "teamId", "tag", "text", "flag"];
  const escape = (val) => {
    const s = val === null || val === undefined ? "" : String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const rows = items.map((i) =>
    headers.map((h) => escape(i[h])).join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

function downloadCsv(items, filename = "roadmap.csv") {
  const csv = itemsToCsv(items);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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

  // Optional leading separator (" - ", " – ", ", ") and optional filler word ("by ")
  const sep = `\\s*[-–,]?\\s*(?:by\\s+)?`;
  // Optional trailing parenthetical like "(was 25MAR)" to tolerate
  const trailing = `(?:\\s*\\([^)]*\\))?\\s*$`;

  // Try each pattern in priority order
  const patterns = [
    // "Q4 2025", "Q3 2026"
    new RegExp(`${sep}(Q[1-4]\\s+\\d{4})${trailing}`, "i"),
    // "15 FEB", "05 JAN" (1-2 digit day + space + month)
    new RegExp(`${sep}(\\d{1,2}\\s+(?:${months}))${trailing}`, "i"),
    // "25MAR" (no space)
    new RegExp(`${sep}(\\d{1,2}(?:${months}))${trailing}`, "i"),
    // "Mid APR", "End of MAY", "Beginning of JUNE"
    new RegExp(`${sep}((?:Mid|Early|Late|End of|Beginning of)\\s+(?:${months}))${trailing}`, "i"),
    // Plain month at the end: "- MAY", "- JUNE"
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
    header: "bg-emerald-400",
    headerText: "text-emerald-950",
    body: "bg-emerald-50",
    section: "bg-emerald-100",
    item: "bg-emerald-50 border-emerald-200 hover:border-emerald-400",
    addBtn: "bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border-emerald-300",
  },
  blue: {
    header: "bg-sky-300",
    headerText: "text-sky-950",
    body: "bg-sky-50",
    section: "bg-sky-100",
    item: "bg-white border-sky-200 hover:border-sky-400",
    addBtn: "bg-sky-100 hover:bg-sky-200 text-sky-900 border-sky-300",
  },
  amber: {
    header: "bg-amber-300",
    headerText: "text-amber-950",
    body: "bg-violet-50",
    section: "bg-violet-100",
    item: "bg-white border-violet-200 hover:border-violet-400",
    addBtn: "bg-violet-100 hover:bg-violet-200 text-violet-900 border-violet-300",
  },
  rose: {
    header: "bg-rose-300",
    headerText: "text-rose-950",
    body: "bg-amber-50",
    section: "bg-amber-100",
    item: "bg-white border-amber-200 hover:border-amber-400",
    addBtn: "bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300",
  },
  slate: {
    header: "bg-slate-300",
    headerText: "text-slate-800",
    body: "bg-slate-50",
    section: "bg-slate-100",
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
  const [editingItem, setEditingItem] = useState(null);
  const [editingSubtitle, setEditingSubtitle] = useState(null);
  const [editingTeam, setEditingTeam] = useState(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const fileInputRef = useRef(null);
  const backupInputRef = useRef(null);

  // Load from localStorage if available, else fetch CSV seed
  useEffect(() => {
    (async () => {
      try {
        const stored = localStorage.getItem("roadmap-data");
        if (stored) {
          const parsed = JSON.parse(stored);
          // Migrate future column from rose → slate
          parsed.columns = parsed.columns.map((c) =>
            c.id === "future" && c.color === "rose" ? { ...c, color: "slate" } : c
          );
          if (!parsed.title) parsed.title = seedData.title;
          setData(parsed);
          localStorage.setItem("roadmap-data", JSON.stringify(parsed));
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
          localStorage.setItem("roadmap-data", JSON.stringify(initial));
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
      localStorage.setItem("roadmap-data", JSON.stringify(newData));
    } catch (e) {
      console.error("Save failed:", e);
    }
  };

  // Export current data as CSV download
  const exportCsv = () => {
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(data.items, `roadmap-${today}.csv`);
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
  const handleDragStart = (item) => {
    setDragItem(item);
  };

  const handleDragOverItem = (e, overItem) => {
    e.preventDefault();
    e.stopPropagation();
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
    e.preventDefault();
    e.stopPropagation();
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
    setDragItem(null);
    setDragOverId(null);
    setDragOverSection(null);
  };

  const handleDropOnSection = (e, columnId, teamId) => {
    e.preventDefault();
    if (!dragItem) return;

    const newItems = [...data.items];
    const idx = newItems.findIndex((i) => i.id === dragItem.id);
    if (idx === -1) return;

    const [moved] = newItems.splice(idx, 1);
    moved.columnId = columnId;
    moved.teamId = teamId;
    newItems.push(moved);

    saveData({ ...data, items: newItems });
    setDragItem(null);
    setDragOverId(null);
    setDragOverSection(null);
  };

  const handleDragEnd = () => {
    setDragItem(null);
    setDragOverId(null);
    setDragOverSection(null);
  };

  // ---------- Item CRUD ----------
  const addItem = (columnId, teamId) => {
    if (!newItemText.trim()) return;
    const newItem = {
      id: `i${Date.now()}`,
      columnId,
      teamId,
      tag: newItemTag,
      text: newItemText.trim(),
      flag: null,
    };
    saveData({ ...data, items: [...data.items, newItem] });
    setNewItemText("");
    setAddingTo(null);
  };

  const deleteItem = (id) => {
    saveData({ ...data, items: data.items.filter((i) => i.id !== id) });
  };

  const cycleFlag = (id) => {
    const flagCycle = [null, "risk", "warning", "done"];
    const newItems = data.items.map((i) => {
      if (i.id === id) {
        const currentIdx = flagCycle.indexOf(i.flag);
        const nextIdx = (currentIdx + 1) % flagCycle.length;
        return { ...i, flag: flagCycle[nextIdx] };
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
    const newTeams = data.teams.map((t) =>
      t.id === teamId ? { ...t, name: trimmed } : t
    );
    saveData({ ...data, teams: newTeams });
  };

  const addTeam = () => {
    const name = prompt("New team name (e.g. 'PAYMENTS (Team IRIS)'):");
    if (!name || !name.trim()) return;
    const newTeam = {
      id: `team_${Date.now()}`,
      name: name.trim(),
    };
    saveData({ ...data, teams: [...data.teams, newTeam] });
  };

  const deleteTeam = (teamId) => {
    const team = data.teams.find((t) => t.id === teamId);
    if (!team) return;
    const itemCount = data.items.filter((i) => i.teamId === teamId).length;
    if (itemCount > 0) {
      alert(
        `Cannot delete "${team.name}" — it still has ${itemCount} item${itemCount === 1 ? "" : "s"}. Move or delete the items first.`
      );
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
    link.href = url;
    link.download = `roadmap-backup-${today}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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

  const resetToSeed = async () => {
    if (!confirm("Reset the roadmap from roadmap.csv? Your current changes will be lost.")) return;
    try {
      const res = await fetch("/roadmap.csv");
      if (res.ok) {
        const text = await res.text();
        const items = csvToItems(text);
        saveData({ ...seedData, items });
      } else {
        alert("Could not load roadmap.csv");
      }
    } catch (e) {
      alert("Error loading roadmap.csv: " + e.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-stone-600 font-mono text-sm tracking-wider">LOADING ROADMAP...</div>
      </div>
    );
  }

  // ---------- Render ----------
  return (
    <div className="min-h-screen bg-stone-50 p-6" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      {/* Header */}
      <div className="max-w-[1800px] mx-auto mb-6">
        <div className="flex items-center justify-between mb-2">
          {editingTitle ? (
            <input
              type="text"
              defaultValue={data.title || seedData.title}
              autoFocus
              onBlur={(e) => {
                updateTitle(e.target.value);
                setEditingTitle(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.target.blur();
                if (e.key === "Escape") setEditingTitle(false);
              }}
              className="text-xs font-mono tracking-[0.2em] text-stone-500 uppercase border border-stone-500 px-2 py-1 bg-white min-w-[260px]"
            />
          ) : (
            <div
              className="text-xs font-mono tracking-[0.2em] text-stone-500 uppercase border border-stone-300 px-2 py-1 bg-white cursor-text hover:text-stone-800 hover:border-stone-500"
              onClick={() => setEditingTitle(true)}
              title="Click to edit title"
            >
              {data.title || seedData.title}
            </div>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 text-xs font-mono tracking-wider text-stone-700 hover:text-stone-900 uppercase border border-stone-300 bg-white hover:bg-stone-100 px-2.5 py-1 rounded transition-colors"
              title="Download your current roadmap as a CSV file"
            >
              <Download className="w-3 h-3" />
              Export CSV
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs font-mono tracking-wider text-stone-700 hover:text-stone-900 uppercase border border-stone-300 bg-white hover:bg-stone-100 px-2.5 py-1 rounded transition-colors"
              title="Load a CSV file to replace the current roadmap"
            >
              <Upload className="w-3 h-3" />
              Import CSV
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleImport}
              className="hidden"
            />
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
            <input
              ref={backupInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleBackupImport}
              className="hidden"
            />
            <button
              onClick={resetToSeed}
              className="text-xs font-mono tracking-wider text-stone-500 hover:text-stone-800 uppercase"
              title="Reload from roadmap.csv in /public"
            >
              Reset
            </button>
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
            Drag items to reorder · Click status dot to cycle flag
          </div>
        </div>
      </div>

      {/* Columns */}
      <div className="max-w-[1800px] mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {data.columns.map((col) => {
          const styles = columnStyles[col.color];
          return (
            <div key={col.id} className="flex flex-col">
              {/* Column Header */}
              <div className={`${styles.header} ${styles.headerText} rounded-t-lg px-4 py-5 text-center shadow-sm`}>
                <h2 className="text-xl font-bold tracking-wider">{col.title}</h2>
                {editingSubtitle === col.id ? (
                  <input
                    type="text"
                    defaultValue={col.subtitle}
                    autoFocus
                    onBlur={(e) => {
                      updateColumnSubtitle(col.id, e.target.value);
                      setEditingSubtitle(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.target.blur();
                      if (e.key === "Escape") setEditingSubtitle(null);
                    }}
                    className="text-xs mt-1 font-mono text-center bg-white/60 border border-stone-900/30 rounded px-1.5 py-0.5 w-full max-w-[180px] mx-auto block"
                  />
                ) : (
                  <p
                    className="text-xs mt-1 opacity-80 font-mono cursor-text hover:opacity-100 hover:underline decoration-dotted underline-offset-2"
                    onClick={() => setEditingSubtitle(col.id)}
                    title="Click to edit"
                  >
                    {col.subtitle || <span className="italic opacity-50">click to set quarter</span>}
                  </p>
                )}
              </div>

              {/* Column Body */}
              <div className={`${styles.body} flex-1 rounded-b-lg p-3 space-y-4 min-h-[400px]`}>
                {data.teams.map((team) => {
                  const teamItems = data.items.filter(
                    (i) => i.columnId === col.id && i.teamId === team.id
                  );
                  const sectionKey = `${col.id}-${team.id}`;
                  const isDragOverSection = dragOverSection === sectionKey;
                  const isAdding = addingTo?.columnId === col.id && addingTo?.teamId === team.id;

                  const isFirstColumn = col.id === data.columns[0].id;
                  return (
                    <div
                      key={team.id}
                      className={`rounded-md transition-colors ${isDragOverSection ? "ring-2 ring-stone-800" : ""}`}
                      onDragOver={(e) => handleDragOverSection(e, col.id, team.id)}
                      onDrop={(e) => handleDropOnSection(e, col.id, team.id)}
                    >
                      {/* Team Header */}
                      <div className={`${styles.section} rounded-md mb-2 relative group min-h-[32px]`}>
                        {editingTeam === team.id ? (
                          <div className="px-8 py-2">
                            <input
                              type="text"
                              defaultValue={team.name}
                              autoFocus={isFirstColumn}
                              onFocus={(e) => e.target.select()}
                              onBlur={(e) => {
                                if (isFirstColumn) {
                                  updateTeamName(team.id, e.target.value);
                                  setEditingTeam(null);
                                }
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
                            className="text-xs font-bold tracking-wide text-stone-900 text-center cursor-text hover:underline decoration-dotted underline-offset-2 px-8 py-2 m-0 flex items-center justify-center min-h-[32px]"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setEditingTeam(team.id);
                            }}
                            title="Click to edit team name"
                          >
                            <span>{team.name}</span>
                          </h3>
                        )}
                        {/* Delete team button — only shown in first column to avoid clutter */}
                        {col.id === data.columns[0].id && editingTeam !== team.id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteTeam(team.id);
                            }}
                            className="absolute left-1.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Delete team (must be empty)"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setAddingTo({ columnId: col.id, teamId: team.id });
                          }}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-stone-600 hover:text-stone-900 hover:bg-white/50 rounded w-5 h-5 flex items-center justify-center transition-colors"
                          title="Add item"
                        >
                          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
                        </button>
                      </div>

                      {/* Team Items */}
                      <div className="space-y-1.5">
                        {teamItems.map((item) => {
                          const isDragOver = dragOverId === item.id;
                          const flagClass = flagStyles[item.flag] || "";
                          const { date, cleanText } = extractDate(item.text);
                          return (
                            <div
                              key={item.id}
                              draggable
                              onDragStart={() => handleDragStart(item)}
                              onDragOver={(e) => handleDragOverItem(e, item)}
                              onDrop={(e) => handleDrop(e, item)}
                              onDragEnd={handleDragEnd}
                              className={`
                                group relative rounded-md border px-2 py-1.5 text-xs cursor-move
                                transition-all
                                ${item.flag ? flagClass : styles.item}
                                ${isDragOver ? "ring-2 ring-stone-800 translate-y-0.5" : ""}
                                ${dragItem?.id === item.id ? "opacity-40" : ""}
                              `}
                            >
                              <div className="flex items-start gap-1.5">
                                <GripVertical className="w-3 h-3 mt-0.5 text-stone-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                                <span className={`font-bold text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${getTagColor(item.tag)}`}>
                                  {item.tag}
                                </span>
                                {editingItem === item.id ? (
                                  <input
                                    type="text"
                                    defaultValue={item.text}
                                    autoFocus
                                    onBlur={(e) => {
                                      updateItem(item.id, { text: e.target.value });
                                      setEditingItem(null);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") e.target.blur();
                                      if (e.key === "Escape") setEditingItem(null);
                                    }}
                                    className="flex-1 bg-white border border-stone-400 rounded px-1 text-xs"
                                  />
                                ) : (
                                  <span
                                    className="flex-1 leading-snug cursor-text flex flex-wrap items-center gap-1"
                                    onDoubleClick={() => setEditingItem(item.id)}
                                    title="Double-click to edit"
                                  >
                                    <span>{cleanText}</span>
                                    {date && (
                                      <span
                                        className="inline-flex items-center font-mono font-semibold text-[9px] tracking-wider bg-white border border-stone-400 text-stone-700 px-1.5 py-0.5 rounded-sm"
                                        title="Target date"
                                      >
                                        {date}
                                      </span>
                                    )}
                                  </span>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    cycleFlag(item.id);
                                  }}
                                  className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                                  title="Click to cycle status: none → at risk → warning → done"
                                >
                                  <Circle
                                    className={`w-3 h-3 ${
                                      item.flag === "risk" ? "fill-rose-500 text-rose-500" :
                                      item.flag === "warning" ? "fill-amber-400 text-amber-400" :
                                      item.flag === "done" ? "fill-gray-400 text-gray-400" :
                                      "text-stone-300"
                                    }`}
                                  />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteItem(item.id);
                                  }}
                                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-stone-400 hover:text-rose-600"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        {/* Add Item Form (appears when + is clicked) */}
                        {isAdding && (
                          <div className={`rounded-md border-2 border-dashed border-stone-400 p-2 bg-white space-y-1.5`}>
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
                                  if (e.key === "Escape") {
                                    setAddingTo(null);
                                    setNewItemText("");
                                  }
                                }}
                                autoFocus
                                placeholder="Describe the item..."
                                className="flex-1 text-xs border border-stone-300 rounded px-1.5 py-0.5"
                              />
                            </div>
                            <div className="flex gap-1.5 justify-end">
                              <button
                                onClick={() => {
                                  setAddingTo(null);
                                  setNewItemText("");
                                }}
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

      {/* Footer help */}
      <div className="max-w-[1800px] mx-auto mt-6 text-xs text-stone-500 font-mono flex flex-wrap gap-x-6 gap-y-1">
        <span><span className="font-bold">Drag</span> any item to reorder or move between columns</span>
        <span><span className="font-bold">Double-click</span> item text to edit · <span className="font-bold">click</span> team name or quarter to edit</span>
        <span><span className="font-bold">Click</span> the status dot to cycle flag state</span>
        <span><span className="font-bold">Hover</span> an item to reveal delete</span>
      </div>
    </div>
  );
}
