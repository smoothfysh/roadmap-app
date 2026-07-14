// Supabase client — reads public config from .env.local (VITE_-prefixed vars are
// baked into the build). The anon key is safe to ship publicly; the database's
// RLS + SECURITY DEFINER functions are what protect the data.
//
// If the env vars are absent (e.g. a build without .env.local), `supabase` is null
// and `cloudEnabled` is false, so the app degrades gracefully to local-only mode.
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && anon ? createClient(url, anon) : null;
export const cloudEnabled = !!supabase;
