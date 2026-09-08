# Deploy — stabilan način (bez lutanja projekata)

## Zašto je ranije “pucao”

1. **Dva Vercel projekta** (`servis-dispecer` + `backend`) u jednom monorepo-u
2. CLI deploy iz **pogrešnog foldera** (Root Directory = `frontend` / `backend`)
3. Prebacivanje `.vercel/project.json` između projekata
4. Složeni `vercel.json` sa `services` — nije potreban za običan Express
5. Veliki deo koda **nije commitovan** — GitHub deploy ≠ lokalni CLI deploy

## Ispravna arhitektura (zadrži je)

| Sloj | Šta | Host |
|------|-----|------|
| Frontend | statički HTML/JS PWA | Vercel project `servis-dispecer`, Root = `frontend` |
| Backend | Express + Prisma | Vercel project `backend`, Root = `backend` |
| Baza | Supabase PostgreSQL | pooler `:6543` + `connection_limit=1` |

**Ne radi iz početka.** Stack je dobar za ovu aplikaciju. Problem je deploy proces, ne kod.

## Deploy — uvek iz root foldera `servis-app`

### Backend
```bash
# 1) link na backend projekat (jednom)
npx vercel link --project backend --yes

# 2) deploy
npx vercel --prod --yes
```
U Vercel dashboard: Root Directory = **`backend`**.

### Frontend
```bash
npx vercel link --project servis-dispecer --yes
npx vercel --prod --yes
```
Root Directory = **`frontend`**.

### Nikad
- `cd frontend` pa `vercel` (traži `frontend/frontend` → puca)
- `vercel link --project backend-nine-pied-44` (pravi duplikat projekta)
- mešanje `services` u vercel.json bez potrebe

## Ako želiš još stabilnije (opciono kasnije)

Backend prebaci na **Railway / Render** (uvek uključen Node proces) — manje cold start + manje Prisma pool problema.  
Frontend ostaje na Vercel. To nije “iz početka”, samo drugi host za API.
