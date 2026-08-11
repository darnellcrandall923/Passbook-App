# Passbook

A personal finance app — accounts, transactions, budgets, an accounts
calendar for recurring income and bills, and a monthly savings plan.

This version has a real backend: [Supabase](https://supabase.com)
provides a hosted Postgres database and login, so your data syncs
across every device you sign in on. There's no server for you to run —
Supabase hosts the database, and your frontend (on Netlify) talks to
it directly.

## 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com), sign up, and create a
   new project (the free tier is enough for personal use).
2. Once it's created, open **SQL Editor** in the left sidebar, click
   **New query**, paste in the contents of `supabase/schema.sql` from
   this folder, and run it. This creates the table that stores your
   data and locks it down so only you can read or write your own rows
   (row-level security).
3. Go to **Settings → API**. You'll need two values from this page:
   - **Project URL**
   - **anon / public** key

   Both are safe to use in client-side code — access control comes
   from the row-level security policies you just created, not from
   keeping these secret.

## 2. Configure environment variables

**Locally**, copy `.env.example` to `.env` and fill in the two values
from step 1:

```bash
cp .env.example .env
```

**On Netlify** (for your deployed site):
1. Site configuration → Environment variables → Add a variable
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the same
   values
3. Trigger a new deploy (env vars only take effect on the next build —
   go to Deploys → Trigger deploy → Deploy site)

## 3. Run it locally

```bash
npm install
npm run dev
```

Open the URL it prints. You'll see a sign-in screen — create an
account with any email and password. Depending on your Supabase
project's auth settings, it may ask you to confirm your email before
you can sign in (check Authentication → Settings in Supabase if you
want to turn that off for personal use).

## Put it on your phone

Same as before — deploy it (push to GitHub, it auto-deploys on
Netlify since it's linked to your repo), then open the live URL on
your phone:

- **iPhone**: open in Safari → Share icon → "Add to Home Screen"
- **Android**: open in Chrome → ⋮ menu → "Add to Home Screen" / "Install app"

Now that data lives in Supabase instead of the browser, signing in
with the same account on your phone shows the same data you entered
on your computer.

## About your data

- Stored in a Postgres database in your Supabase project, in a table
  called `user_data`. Each row is scoped to your account via
  row-level security — nobody but you (not even someone with your
  Netlify URL) can read or write your rows without your login.
- Syncs automatically: sign in with the same account anywhere, see
  the same data. Multiple devices editing at the same time will use
  "last write wins" per data type (accounts, transactions, etc.) —
  fine for one person using it themselves, but worth knowing if you
  ever add other users.
- You're the only one with access to your Supabase project, so you
  can also browse or export your raw data anytime from the Supabase
  dashboard (Table Editor → user_data).

## Tech stack

React + Vite, [Supabase](https://supabase.com) (Postgres + auth),
[Recharts](https://recharts.org) for charts, [Lucide](https://lucide.dev)
for icons, and [PapaParse](https://www.papaparse.com/) for CSV import.
"# Passbook-App" 
