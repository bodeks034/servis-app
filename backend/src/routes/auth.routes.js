const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../lib/prisma");
const asyncHandler = require("../lib/asyncHandler");
const { HttpError } = require("../lib/errors");

const router = express.Router();

function potpisiToken(korisnik) {
  return jwt.sign(
    {
      id: korisnik.id,
      firmaId: korisnik.firmaId,
      uloga: korisnik.uloga,
      email: korisnik.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: "14d" }
  );
}

function javniKorisnik(korisnik, firma) {
  return {
    id: korisnik.id,
    ime: korisnik.ime,
    prezime: korisnik.prezime,
    email: korisnik.email,
    telefon: korisnik.telefon,
    uloga: korisnik.uloga,
    klijentId: korisnik.klijentId || null,
    firmaId: korisnik.firmaId,
    firmaNaziv: firma ? firma.naziv : undefined,
  };
}

// POST /api/auth/registracija-firme
router.post("/registracija-firme", asyncHandler(async (req, res) => {
  const { nazivFirme, ime, prezime, email, lozinka } = req.body;

  if (!nazivFirme || !ime || !prezime || !email || !lozinka) {
    throw new HttpError(400, "Sva polja su obavezna.");
  }
  if (String(lozinka).length < 6) {
    throw new HttpError(400, "Lozinka mora imati najmanje 6 karaktera.");
  }

  const emailNorm = String(email).trim().toLowerCase();
  const postojeci = await prisma.korisnik.findUnique({ where: { email: emailNorm } });
  if (postojeci) {
    throw new HttpError(409, "Korisnik sa ovim emailom već postoji.");
  }

  const passwordHash = await bcrypt.hash(lozinka, 10);

  const firma = await prisma.firma.create({
    data: {
      naziv: nazivFirme.trim(),
      korisnici: {
        create: {
          ime: ime.trim(),
          prezime: prezime.trim(),
          email: emailNorm,
          passwordHash,
          uloga: "admin",
        },
      },
      magacini: {
        create: { naziv: "Centralni magacin", tip: "centralni" },
      },
    },
    include: { korisnici: true },
  });

  const admin = firma.korisnici[0];
  const token = potpisiToken({ ...admin, firmaId: firma.id });

  res.status(201).json({
    token,
    korisnik: javniKorisnik(admin, firma),
    firma: { id: firma.id, naziv: firma.naziv },
  });
}));

// POST /api/auth/login
router.post("/login", asyncHandler(async (req, res) => {
  const { email, lozinka } = req.body;
  if (!email || !lozinka) {
    throw new HttpError(400, "Email i lozinka su obavezni.");
  }

  const korisnik = await prisma.korisnik.findUnique({
    where: { email: String(email).trim().toLowerCase() },
    include: { firma: { select: { id: true, naziv: true } } },
  });
  if (!korisnik || !korisnik.aktivan) {
    throw new HttpError(401, "Pogrešan email ili lozinka.");
  }

  const ispravna = await bcrypt.compare(lozinka, korisnik.passwordHash);
  if (!ispravna) {
    throw new HttpError(401, "Pogrešan email ili lozinka.");
  }

  const token = potpisiToken(korisnik);
  res.json({
    token,
    korisnik: javniKorisnik(korisnik, korisnik.firma),
    firma: korisnik.firma,
  });
}));

// GET /api/auth/ja — proveri token i vrati trenutnog korisnika (za obnovu sesije)
router.get("/ja", asyncHandler(async (req, res) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new HttpError(401, "Niste ulogovani.");

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new HttpError(401, "Token nije validan ili je istekao.");
  }

  const korisnik = await prisma.korisnik.findFirst({
    where: { id: payload.id, aktivan: true },
    include: { firma: { select: { id: true, naziv: true } } },
  });
  if (!korisnik) throw new HttpError(401, "Nalog nije aktivan.");

  res.json({
    korisnik: javniKorisnik(korisnik, korisnik.firma),
    firma: korisnik.firma,
  });
}));

module.exports = router;
