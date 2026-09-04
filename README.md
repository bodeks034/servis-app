# Servis Dispečer

Aplikacija za servis vozila, nameštaja, bele tehnike, mašina i alata.

## Stek

| Sloj | Sada | Kasnije |
|---|---|---|
| Baza | Supabase PostgreSQL | MySQL / SQL Server (`DB_PROVIDER`) |
| Frontend | Vercel (static) | isto |
| Backend | Railway / Render | isto |

## Pokretanje lokalno

Vidi `backend/README.md`. Frontend: `http://localhost:5501` (API `http://localhost:4000/api`).

Deploy: vidi **`DEPLOY.md`**.

## Funkcije

- Multi-tenant (više firmi), uloge, tim
- Klijenti, oprema (VIN / km / satnice po kategoriji), nalozi (kanban + detalj)
- Foto pre/posle, potpis klijenta
- Magacin + utrošak delova
- Računi sa **stavkama i PDV-om**, PDF/štampa naloga i računa
- Kalendar (14 dana), in-app podsetnici (+ opciono email SMTP)
- Offline red čekanja, PWA

## Šta još nije (spoljašnji servisi)

- Prava **eFaktura / SEF** (zahteva sertifikat i SEF nalog)
- SMS (Twilio ili lokalni gateway)
- Automatski cloud deploy bez tvog Vercel/Railway naloga
