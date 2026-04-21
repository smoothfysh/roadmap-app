import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, GripVertical, X, Circle, Download, Upload } from "lucide-react";

// ---------- Seed data reflecting the screenshot ----------
const seedData = {
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
      color: "rose",
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
  const fileInputRef = useRef(null);

  // Load from localStorage if available, else fetch CSV seed
  useEffect(() => {
    (async () => {
      try {
        const stored = localStorage.getItem("roadmap-data");
        if (stored) {
          setData(JSON.parse(stored));
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
          <div className="text-xs font-mono tracking-[0.2em] text-stone-500 uppercase border border-stone-300 px-2 py-1 bg-white">
            DEMAND: Growth Streams Roadmap
          </div>
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
                <p className="text-xs mt-1 opacity-80 font-mono">{col.subtitle}</p>
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

                  return (
                    <div
                      key={team.id}
                      className={`rounded-md transition-colors ${isDragOverSection ? "ring-2 ring-stone-800" : ""}`}
                      onDragOver={(e) => handleDragOverSection(e, col.id, team.id)}
                      onDrop={(e) => handleDropOnSection(e, col.id, team.id)}
                    >
                      {/* Team Header */}
                      <div className={`${styles.section} rounded-md px-3 py-2 mb-2 relative flex items-center justify-center`}>
                        <h3 className="text-xs font-bold tracking-wide text-stone-900 text-center">
                          {team.name}
                        </h3>
                        <button
                          onClick={() => setAddingTo({ columnId: col.id, teamId: team.id })}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-600 hover:text-stone-900 hover:bg-white/50 rounded w-5 h-5 flex items-center justify-center transition-colors"
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
                                    className="flex-1 leading-snug cursor-text"
                                    onDoubleClick={() => setEditingItem(item.id)}
                                    title="Double-click to edit"
                                  >
                                    {item.text}
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

      {/* Footer help */}
      <div className="max-w-[1800px] mx-auto mt-6 text-xs text-stone-500 font-mono flex flex-wrap gap-x-6 gap-y-1">
        <span><span className="font-bold">Drag</span> any item to reorder or move between columns</span>
        <span><span className="font-bold">Double-click</span> text to edit</span>
        <span><span className="font-bold">Click</span> the status dot to cycle flag state</span>
        <span><span className="font-bold">Hover</span> an item to reveal delete</span>
      </div>
    </div>
  );
}
