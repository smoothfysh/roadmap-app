// Cloud sync helpers (no-login, capability-key model).
//
// Ownership is by SECRET EDIT KEY, not accounts. Each roadmap has:
//   - a public `id`      → used to view the published copy (Phase 2)
//   - a secret `key`     → required to load/save the private working copy
// The browser keeps a local "My roadmaps" list of { id, key, title } so you can
// find your own. That list lives only in this browser — the saved edit link is the
// real recovery path (see SPEC-supabase-sync.md, verification #5).
import { supabase } from "./supabaseClient";

const LIST_KEY = "roadmap-cloud-list";

// ---------- Local "My roadmaps" list (browser-only) ----------
export function listLocalRoadmaps() {
  try {
    const v = JSON.parse(localStorage.getItem(LIST_KEY));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
export function rememberRoadmap(entry) {
  const list = listLocalRoadmaps().filter((r) => r.id !== entry.id);
  list.unshift({ ...entry, savedAt: Date.now() });
  localStorage.setItem(LIST_KEY, JSON.stringify(list));
}
export function forgetRoadmap(id) {
  localStorage.setItem(LIST_KEY, JSON.stringify(listLocalRoadmaps().filter((r) => r.id !== id)));
}

// ---------- Link builders ----------
const base = () => `${window.location.origin}${window.location.pathname}`;
export function editLink(id, key) {
  return `${base()}?id=${id}&key=${key}`;
}
export function viewLink(id) {
  return `${base()}?id=${id}`;
}

// ---------- RPC wrappers ----------
// Create a new cloud roadmap from the current data. Returns { id, key }.
export async function createRoadmap(data) {
  const title = (data && data.title) || "Untitled roadmap";
  const { data: rows, error } = await supabase.rpc("create_roadmap", { p_data: data, p_title: title });
  if (error) throw error;
  const { id, edit_key } = rows[0];
  rememberRoadmap({ id, key: edit_key, title });
  return { id, key: edit_key };
}

// Load the private working copy — requires the correct key.
export async function loadWorking(id, key) {
  const { data, error } = await supabase.rpc("load_working", { p_id: id, p_key: key });
  if (error) throw error;
  return data;
}

// Save (auto-save) the private working copy — requires the correct key.
export async function saveWorking(id, key, data) {
  const title = (data && data.title) || "Untitled roadmap";
  const { error } = await supabase.rpc("save_working", { p_id: id, p_key: key, p_data: data, p_title: title });
  if (error) throw error;
  rememberRoadmap({ id, key, title });
}

// Publish working → published.
export async function publishRoadmap(id, key) {
  const { error } = await supabase.rpc("publish", { p_id: id, p_key: key });
  if (error) throw error;
}

// Read the PUBLIC published copy by id (no key). Returns the data object, or null if
// the roadmap has never been published.
export async function loadPublished(id) {
  const { data, error } = await supabase
    .from("roadmap_published")
    .select("data")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? data.data : null;
}

// Canonical JSON (recursively sorted keys) so we can compare the working copy to the
// published copy reliably — Postgres jsonb doesn't preserve key order, so a plain
// JSON.stringify comparison would give false "unpublished changes".
export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",") + "}";
}
