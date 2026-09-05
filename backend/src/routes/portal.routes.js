const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const asyncHandler = require("../lib/asyncHandler");
const { HttpError } = require("../lib/errors");
const { stavkeZaTipUsluge, izracunajSlaRok } = require("../lib/checklist");
const { sledeciBrojNaloga } = require("../lib/brojevi");
const { posaljiSms } = require("../lib/sms");

const router = express.Router();
router.use(requireAuth);
router.use(requireRole("klijent"));

async function klijentIdZa(req) {
  const ja = await prisma.korisnik.findUnique({ where: { id: req.user.id } });
  if (!ja?.klijentId) throw new HttpError(403, "Nalog nije vezan za klijenta.");
  return ja.klijentId;
}

router.get("/pregled", asyncHandler(async (req, res) => {
  const klijentId = await klijentIdZa(req);
  const [klijent, nalozi, oprema, ponude, racuni, ugovori] = await Promise.all([
    prisma.klijent.findFirst({ where: { id: klijentId, firmaId: req.user.firmaId } }),
    prisma.radniNalog.findMany({
      where: { firmaId: req.user.firmaId, klijentId },
      include: {
        oprema: true,
        kategorija: true,
        tipUsluge: true,
        dodeljeniTehnicar: { select: { ime: true, prezime: true, telefon: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.oprema.findMany({
      where: { firmaId: req.user.firmaId, klijentId },
      include: { kategorija: true },
      orderBy: { naziv: "asc" },
    }),
    prisma.ponuda.findMany({
      where: { firmaId: req.user.firmaId, klijentId },
      include: { stavke: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.racun.findMany({
      where: { firmaId: req.user.firmaId, klijentId },
      orderBy: { izdatAt: "desc" },
      take: 30,
    }),
    prisma.ugovor.findMany({
      where: { firmaId: req.user.firmaId, klijentId, aktivan: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  res.json({ klijent, nalozi, oprema, ponude, racuni, ugovori });
}));

/** Prijava kvara — kreira nalog */
router.post("/prijava-kvara", asyncHandler(async (req, res) => {
  const klijentId = await klijentIdZa(req);
  const { opremaId, naslov, opis, prioritet } = req.body;
  if (!opremaId || !naslov) throw new HttpError(400, "Oprema i opis problema su obavezni.");

  const oprema = await prisma.oprema.findFirst({
    where: { id: opremaId, firmaId: req.user.firmaId, klijentId },
  });
  if (!oprema) throw new HttpError(400, "Oprema nije pronađena.");

  const tip = await prisma.tipUsluge.findFirst({
    where: { naziv: "Servis / popravka" },
  }) || await prisma.tipUsluge.findFirst();
  if (!tip) throw new HttpError(500, "Nema tipova usluge u sistemu.");

  const ugovor = await prisma.ugovor.findFirst({
    where: {
      firmaId: req.user.firmaId,
      klijentId,
      aktivan: true,
      OR: [{ kraj: null }, { kraj: { gte: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
  });

  const prioritetVal = ["hitno", "kritican"].includes(prioritet) ? prioritet : "normalan";
  let slaRok = izracunajSlaRok(prioritetVal);
  if (ugovor?.slaReakcijaSati) {
    slaRok = new Date(Date.now() + ugovor.slaReakcijaSati * 3600 * 1000);
  }

  const checklist = stavkeZaTipUsluge(tip.naziv);
  const nalog = await prisma.$transaction(async (tx) => {
    const brojNaloga = await sledeciBrojNaloga(tx, req.user.firmaId);
    return tx.radniNalog.create({
      data: {
        brojNaloga,
        firmaId: req.user.firmaId,
        klijentId,
        opremaId,
        kategorijaId: oprema.kategorijaId,
        tipUslugeId: tip.id,
        naslov: String(naslov).trim(),
        opis: opis ? String(opis).trim() : null,
        prioritet: prioritetVal,
        lokacijaTip: "teren",
        kreiraoId: req.user.id,
        slaRok,
        status: "novo",
        istorijaStatusa: { create: { noviStatus: "novo", promenioId: req.user.id } },
        checklist: { create: checklist },
      },
      include: { oprema: true, kategorija: true, tipUsluge: true },
    });
  });

  const dispeceri = await prisma.korisnik.findMany({
    where: {
      firmaId: req.user.firmaId,
      aktivan: true,
      uloga: { in: ["admin", "dispecer"] },
      telefon: { not: null },
    },
    take: 3,
  });
  for (const d of dispeceri) {
    await posaljiSms({
      firmaId: req.user.firmaId,
      telefon: d.telefon,
      naslov: `Nova prijava ${nalog.brojNaloga}`,
      telo: naslov,
    });
  }

  res.status(201).json(nalog);
}));

module.exports = router;
