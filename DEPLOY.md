# Deploy (besplatno)

## Frontend — već na Vercel
https://servis-dispecer.vercel.app/

## Backend — drugi Vercel projekat (besplatno)

1. [vercel.com/new](https://vercel.com/new) → Import **bodeks034/servis-app**
2. **Root Directory** = `backend` (obavezno)
3. Framework Preset: **Other** (ili neka Vercel detektuje Express)
4. Build Command: `prisma generate` (već u vercel.json)
5. Output Directory: **ostavi prazno**
6. Env variables: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `DB_PROVIDER=postgresql`, `FRONTEND_ORIGIN=https://servis-dispecer.vercel.app`
7. Deploy

Provera: otvori **root** URL API projekta (ne `/api` prvo):
- `https://xxx.vercel.app/` → `{"status":"ok",...}`
- `https://xxx.vercel.app/api/health` → `{"status":"ok"}`

Na frontendu API adresa: `https://xxx.vercel.app/api`

Ako vidiš Vercel stranicu **"Deployment not found"**:
- deploy nije uspeo ili si na pogrešnom URL-u
- u Vercel → Project → **Deployments** otvori poslednji **Ready** deployment
- Root Directory mora biti `backend`
