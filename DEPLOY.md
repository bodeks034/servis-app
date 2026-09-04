# Deploy (besplatno)

## Frontend — već na Vercel
https://servis-dispecer.vercel.app/

## Backend — drugi Vercel projekat (umesto Railway)

1. [vercel.com/new](https://vercel.com/new) → Import **bodeks034/servis-app**
2. **Root Directory** = `backend`
3. Framework: Other
4. Environment Variables (isti kao lokalni `backend/.env`):

| Key | Napomena |
|---|---|
| `DATABASE_URL` | Session pooler OK; bolje Transaction `:6543?pgbouncer=true` |
| `DIRECT_URL` | Session / direct (za Prisma) |
| `JWT_SECRET` | iz `.env` |
| `DB_PROVIDER` | `postgresql` |
| `FRONTEND_ORIGIN` | `https://servis-dispecer.vercel.app` |

5. Deploy → dobiješ npr. `https://servis-app-api-xxx.vercel.app`
6. Provera: `https://…vercel.app/api/health`
7. U frontendu (login polje ili `frontend/config.js`):
   `https://…vercel.app/api`

Migracije se i dalje rade **lokalno** (`npx prisma migrate deploy`), ne na Vercel-u.
