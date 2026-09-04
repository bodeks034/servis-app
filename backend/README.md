# Servis-app backend — pokretanje

## 1. Supabase baza

1. supabase.com → New project
2. Project Settings → Database → Connection string → **URI**
3. Za Prisma migracije koristi **direct** konekciju (port 5432), ne pooler, ako migrate javlja grešku

## 2. Lokalno

```bash
cd backend
npm install
cp .env.example .env
```

U `.env`:
- `DATABASE_URL` — Supabase URI
- `JWT_SECRET` — dugačak nasumičan tekst
- `DB_PROVIDER=postgresql`
- `FRONTEND_ORIGIN` — npr. `http://localhost:5500,https://tvoja-app.vercel.app`

## 3. Tabele i početni podaci

```bash
npx prisma migrate dev --name init
npx prisma generate
npm run seed
```

Seed ubacuje kategorije (Vozila, Nameštaj, Bela tehnika, Mašine i alati, Poljoprivredna oprema) i tipove usluga.

Ako si već ranije radio `migrate`, pokreni ponovo `npx prisma migrate dev --name unique-per-firma` da se primene unique brojevi naloga/računa po firmi, pa `npm run seed` za novu kategoriju.

## 4. Server

```bash
npm run dev
```

Provera: `http://localhost:4000/api/health` → `{"status":"ok"}`.

## 5. Deploy backenda

Railway, Render ili Fly.io: poveži repo, root `backend/`, iste env varijable kao u `.env`.
Start komanda: `npx prisma migrate deploy && npx prisma generate && node src/server.js`

`FRONTEND_ORIGIN` stavi na Vercel URL da CORS pusti frontend.

## Multi-tenant

JWT nosi `firmaId`. Svaka ruta filtrira po njemu. Firma A ne vidi podatke firme B.

## Prelazak na MySQL (kasnije)

1. U `prisma/schema.prisma` promeni `provider = "mysql"`
2. U `.env`: nova `DATABASE_URL` i `DB_PROVIDER=mysql`
3. `npx prisma migrate dev` (nova migracija na čistoj MySQL bazi — ne mešaj Postgres dump)

Prisma podržava PostgreSQL, MySQL i SQL Server. Oracle nije u Prismi; to bi bio drugi ORM, isti API.

Pretraga (`containsText`) skida PostgreSQL `mode: insensitive` kad je `DB_PROVIDER=mysql`.
