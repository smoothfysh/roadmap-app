// Supabase client — reads public config from .env.local (VITE_-prefixed vars are
// baked into the build). The anon key is safe to ship publicly *only* because no
// table grants it any direct access: both roadmap_working and roadmap_published
// have RLS on with no policies, and every read/write goes through a SECURITY
// DEFINER function that demands a capability (the secret edit key, or the
// unguessable roadmap id). Never add a `for select using (true)` policy — with
// one, `GET /rest/v1/<table>?select=*` dumps the table to anyone holding this key,
// which is everyone. See supabase/phase0-schema.sql.
//
// If the env vars are absent (e.g. a build without .env.local), `supabase` is null
// and `cloudEnabled` is false, so the app degrades gracefully to local-only mode.
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && anon ? createClient(url, anon) : null;
export const cloudEnabled = !!supabase;
