# Supabase setup — step-by-step (first-timer guide)

You only need to do this **once**. ~10 minutes. It's all free.

At the end you'll hand me **two values** (Project URL + anon key) and I'll wire the app to them.

---

## Step 1 — Create an account

1. Go to **https://supabase.com** → click **Start your project** / **Sign in**.
2. Sign in with **GitHub** (easiest — you already have GitHub) or email.

## Step 2 — Create a project

1. Click **New project**.
2. **Organization**: accept the default one it offers (create one if asked — any name).
3. **Name**: `roadmap-app` (anything you like).
4. **Database Password**: click **Generate a password**, then **save it** in your password
   manager. _(You won't need it day-to-day, but don't lose it.)_
5. **Region**: pick **Central EU (Frankfurt)** — closest to you, lowest latency.
6. **Plan**: **Free**.
7. Click **Create new project** and wait ~2 minutes while it sets up.

## Step 3 — Run the database script

1. In the left sidebar click **SQL Editor**.
2. Click **+ New query**.
3. Open the file **`supabase/phase0-schema.sql`** (in this repo), copy the **whole** thing,
   and paste it into the editor.
4. Click **Run** (or press Ctrl/Cmd + Enter).
5. You should see **"Success. No rows returned."** — that's correct. This created the two
   tables, the security rules, the four functions, and turned on realtime.

_(If you ever change the script, just paste and Run again — it's safe to re-run.)_

## Step 4 — Copy your two API values

1. Left sidebar → **Project Settings** (the gear) → **API**.
2. Copy these two and paste them into a message to me:
   - **Project URL** — looks like `https://abcdxyz.supabase.co`
   - **anon public** key — a long string under "Project API keys" labelled **`anon` / `public`**

⚠️ **Important:** on that same page there's also a **`service_role`** key. That one is an
admin master key — **never** put it in the app, never send it to anyone, never commit it.
We only use the **anon public** key, which is designed to be shared publicly (our database
rules + functions are what keep data safe).

## Step 5 — (optional) Confirm it works

Left sidebar → **Database** → **Tables**. You should see **`roadmap_working`** and
**`roadmap_published`**. Both empty for now — that's expected.

---

## That's everything on the Supabase side

Send me the **Project URL** and the **anon public** key and I'll:

- add them to the app (as `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`),
- build **Phase 1** (create + auto-save + your local "My roadmaps" list + save/recover edit link),
- then Phase 2 (publish + view) and Phase 3 (realtime).

### Two things worth knowing about the free tier
- **Auto-pause:** a free project pauses after ~1 week of no activity. Your data is safe —
  you just click **Restore** in the dashboard and it's back in a minute. (Once we're using it
  regularly this won't happen.)
- **Plenty of room:** 500 MB database + 5 GB bandwidth/month — a roadmap is tiny, so free is
  fine indefinitely for this.
