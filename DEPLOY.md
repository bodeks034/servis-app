# Deploy

## Frontend → Vercel

1. Push repo na GitHub (ili import folder).
2. Vercel → New Project → Root Directory = `frontend`
3. Build: nije potreban (static). Output: `.`
4. U `frontend/config.js` stavi URL backenda:
   ```js
   window.SERVIS_API_BASE = "https://tvoj-api.up.railway.app/api";
   ```
5. Deploy.

## Backend → Railway (preporuka)

1. New Project → Deploy from GitHub → root `backend`
2. Env variables:
   - `DATABASE_URL`, `DIRECT_URL` (Supabase Session pooler)
   - `JWT_SECRET`
   - `DB_PROVIDER=postgresql`
   - `FRONTEND_ORIGIN=https://tvoja-app.vercel.app`
   - opciono: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - opciono SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
3. Start: `npx prisma migrate deploy && node src/server.js`
   (već u `railway.toml` / `Dockerfile`)

## Backend → Render

Koristi `render.yaml` u root-u ili ručno Web Service sa root `backend`.

## Provera

- `https://tvoj-api.../api/health` → `{"status":"ok"}`
- Frontend login sa API adresom backenda
