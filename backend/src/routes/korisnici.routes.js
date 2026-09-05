const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const asyncHandler = require("../lib/asyncHandler");
const { HttpError } = require("../lib/errors");

const { mobilniMagacin } = require("../lib/magacin");

const router = express.Router();
router.use(requireAuth);

const publicSelect = {
  id: true,
  ime: true,
  prezime: true,
  email: true,
  telefon: true,
  uloga: true,
  aktivan: true,
  vestine: true,
  klijentId: true,
  createdAt: true,
};

const DOZVOLJENE_ULOGE = ["admin", "dispecer", "tehnicar", "klijent"];
const VESTINE_OPCIJE = ["vozila", "namestaj", "bela_tehnika", "masine", "poljoprivreda", "elektronika", "klima", "hidraulika"];

// GET /api/korisnici — tim firme (bez lozinke)
router.get("/", asyncHandler(async (req, res) => {
  const korisnici = await prisma.korisnik.findMany({
    where: { firmaId: req.user.firmaId },
    select: publicSelect,
    orderBy: [{ aktivan: "desc" }, { prezime: "asc" }],
  });
  res.json(korisnici);
}));

/** Predloži tehničare po veštini (kategorija naziv → skill tag) */
router.get("/matching", requireRole("admin", "dispecer"), asyncHandler(async (req, res) => {
  const skillMap = {
    vozila: "vozila",
    nameštaj: "namestaj",
    namestaj: "namestaj",
    "bela tehnika": "bela_tehnika",
    "mašine i alati": "masine",
    masine: "masine",
    "poljoprivredna oprema": "poljoprivreda",
  };
  const kat = String(req.query.kategorija || "").toLowerCase();
  const skill = skillMap[kat] || null;

  const lista = await prisma.korisnik.findMany({
    where: {
      firmaId: req.user.firmaId,
      aktivan: true,
      uloga: { in: ["tehnicar", "dispecer", "admin"] },
    },
    select: publicSelect,
    orderBy: { prezime: "asc" },
  });

  const scored = lista.map((k) => {
    const v = Array.isArray(k.vestine) ? k.vestine : [];
    const match = skill ? v.includes(skill) : true;
    return { ...k, skillMatch: match, vestine: v };
  });
  scored.sort((a, b) => Number(b.skillMatch) - Number(a.skillMatch));
  res.json(scored);
}));

// POST /api/korisnici — admin/dispečer dodaje tehničara ili kolegu
router.post("/", requireRole("admin", "dispecer"), asyncHandler(async (req, res) => {
  const { ime, prezime, email, lozinka, telefon, uloga, vestine, klijentId } = req.body;
  if (!ime || !prezime || !email || !lozinka) {
    throw new HttpError(400, "Ime, prezime, email i lozinka su obavezni.");
  }
  if (String(lozinka).length < 6) {
    throw new HttpError(400, "Lozinka mora imati najmanje 6 karaktera.");
  }

  const novaUloga = DOZVOLJENE_ULOGE.includes(uloga) ? uloga : "tehnicar";
  if (novaUloga === "admin" && req.user.uloga !== "admin") {
    throw new HttpError(403, "Samo admin može da doda drugog admina.");
  }

  let vezaniKlijentId = null;
  if (novaUloga === "klijent") {
    if (!klijentId) throw new HttpError(400, "Za portal klijenta obavezan je klijentId.");
    const k = await prisma.klijent.findFirst({
      where: { id: klijentId, firmaId: req.user.firmaId },
    });
    if (!k) throw new HttpError(400, "Klijent nije pronađen.");
    vezaniKlijentId = k.id;
  }

  const emailNorm = String(email).trim().toLowerCase();
  const postojeci = await prisma.korisnik.findUnique({ where: { email: emailNorm } });
  if (postojeci) {
    throw new HttpError(409, "Korisnik sa ovim emailom već postoji.");
  }

  const vestineLista = Array.isArray(vestine)
    ? vestine.filter((v) => VESTINE_OPCIJE.includes(v))
    : [];

  const korisnik = await prisma.korisnik.create({
    data: {
      firmaId: req.user.firmaId,
      ime: String(ime).trim(),
      prezime: String(prezime).trim(),
      email: emailNorm,
      telefon: telefon ? String(telefon).trim() : null,
      passwordHash: await bcrypt.hash(lozinka, 10),
      uloga: novaUloga,
      vestine: vestineLista,
      klijentId: vezaniKlijentId,
    },
    select: publicSelect,
  });

  if (novaUloga === "tehnicar") {
    await prisma.$transaction((tx) =>
      mobilniMagacin(tx, req.user.firmaId, korisnik.id, `${korisnik.ime} ${korisnik.prezime}`)
    );
  }

  res.status(201).json(korisnik);
}));

// PATCH /api/korisnici/:id — aktivacija / deaktivacija, izmena uloge
router.patch("/:id", requireRole("admin", "dispecer"), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { aktivan, uloga, telefon, vestine } = req.body;

  const postojeci = await prisma.korisnik.findFirst({
    where: { id, firmaId: req.user.firmaId },
  });
  if (!postojeci) throw new HttpError(404, "Korisnik nije pronađen.");
  if (postojeci.id === req.user.id && aktivan === false) {
    throw new HttpError(400, "Ne možete deaktivirati sopstveni nalog.");
  }

  const data = {};
  if (typeof aktivan === "boolean") data.aktivan = aktivan;
  if (telefon !== undefined) data.telefon = telefon ? String(telefon).trim() : null;
  if (uloga && DOZVOLJENE_ULOGE.includes(uloga)) {
    if (uloga === "admin" && req.user.uloga !== "admin") {
      throw new HttpError(403, "Samo admin može da postavi admina.");
    }
    data.uloga = uloga;
  }
  if (vestine !== undefined) {
    data.vestine = Array.isArray(vestine)
      ? vestine.filter((v) => VESTINE_OPCIJE.includes(v))
      : [];
  }

  const korisnik = await prisma.korisnik.update({
    where: { id },
    data,
    select: publicSelect,
  });
  res.json(korisnik);
}));

module.exports = router;
