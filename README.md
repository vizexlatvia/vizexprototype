# VIZEXAPP frontend

VIZEXAPP frontend is now structured as a Vite + React + TypeScript app.

## Stack

- Frontend: React + Vite + TypeScript
- Database/Auth: Supabase
- Hosting: Vercel

## Local setup

Install Node.js with npm, then run:

```bash
npm install
npm run dev
```

Vite will print a local URL, usually:

```text
http://127.0.0.1:5173/
```

## Build

```bash
npm run build
```

The production output is generated in:

```text
dist/
```

## Supabase environment

Create `.env.local` from `.env.example`:

```text
VITE_SUPABASE_URL=https://mzyvvnqlqeinvlrpcqhs.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
VITE_ADMIN_EMAIL=vizexlatvia@gmail.com
```

The current app also has fallback values in `src/lib/config.ts` so the prototype can keep using the existing Supabase project while we are still moving fast.

## Vercel

Use the settings in `VERCEL_DEPLOYMENT.md`.
