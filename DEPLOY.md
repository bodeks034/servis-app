# Deploy — stabilan način (bez lutanja projekata)

## Zašto je ranije “pucao”

1. **Dva Vercel projekta** (`servis-dispecer` + `backend`) u jednom monorepo-u
2. CLI deploy iz **pogrešnog foldera** (Root Directory = `frontend` / `backend`)
3. Prebacivanje `.vercel/project.json` između projekata
4. Brisanje `services` iz `backend/vercel.json` → API daje **NOT_FOUND** (za ovaj projekat Services **mora** ostati)
5. Veliki deo koda nije bio commitovan — GitHub deploy ≠ lokalni CLI deploy

## Ispravna arhitektura (zadrži je)

| Sloj | Šta | Host |
|------|-----|------|
| Frontend | statički HTML/JS PWA | Vercel project `servis-dispecer`, Root = `frontend` |
| Backend | Express + Prisma | Vercel project `backend`, Root = `backend` |
| Baza | Supabase PostgreSQL | pooler `:6543` + `connection_limit=1` |

**Ne radi iz početka.** Stack je dobar. Problem je deploy proces.

## Deploy — uvek iz root foldera `servis-app`

### Backend
```bash
npx vercel link --project backend --yes
npx vercel --prod --yes
```
Root Directory u dashboardu = **`backend`**.  
`backend/vercel.json` mora imati **`services` + rewrite** na Express.

### Frontend
```bash
npx vercel link --project servis-dispecer --yes
npx vercel --prod --yes
```
Root Directory = **`frontend`**.

### Nikad
- `cd frontend` pa `vercel` (traži `frontend/frontend` → puca)
- `vercel link --project backend-nine-pied-44` (pravi duplikat projekta)
- brisanje `services` iz backend `vercel.json`

## Produkcija
- App: https://servis-dispecer.vercel.app/
- API: https://backend-nine-pied-44.vercel.app/api
