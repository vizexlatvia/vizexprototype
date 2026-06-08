# VIZEXAPP Vercel deployment

Supabase remains the database and authentication provider. Vercel builds and serves the Vite + React frontend.

## Stack

- Frontend: Vite + React + TypeScript
- Database/Auth: Supabase
- Hosting: Vercel

`supabase_schema.sql` is not loaded by the app. Keep it in the repo as database setup documentation and run it manually in Supabase SQL Editor when the schema changes.

## Vercel settings

Import this project into Vercel.

- Framework Preset: `Vite`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`

## Environment variables

Set these in Vercel Project Settings -> Environment Variables:

```text
VITE_SUPABASE_URL=https://mzyvvnqlqeinvlrpcqhs.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
VITE_ADMIN_EMAIL=vizexlatvia@gmail.com
```

## Supabase settings after Vercel URL is known

Open Supabase:

`Authentication -> URL Configuration`

Set:

- Site URL: your production Vercel URL, for example `https://vizexprototype.vercel.app/`
- Redirect URLs:
  - your production Vercel URL, for example `https://vizexprototype.vercel.app/`
  - optional Vercel previews: `https://*-vizexlatvia.vercel.app/**`
  - optional local testing: `http://localhost:3000/**`

The React app builds password-reset and email-confirmation redirects dynamically from the current deployed URL, so the same frontend can run on Vercel production and preview deployments.

## Cloud data

Run `supabase_schema.sql` in Supabase SQL Editor to create or update:

- `client_email_registry`
- `client_profiles`
- `sites`
- `cameras`
- `recordings`
- `events`
- `app_settings`

The frontend reads these tables from Supabase and falls back to demo data if the schema is not ready yet.
