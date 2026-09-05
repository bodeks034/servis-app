const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const asyncHandler = require("../lib/asyncHandler");
const { HttpError } = require("../lib/errors");
const { containsText } = require("../lib/search");

const router = express.Router();
router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  const { kategorijaId, klijentId, pretraga } = req.query;
  const oprema = await prisma.oprema.findMany({
    where: {
      firmaId: req.user.firmaId,
      ...(kategorijaId && { kategorijaId }),
      ...(klijentId && { klijentId }),
      ...(pretraga && {
        OR: [
          { naziv: containsText(pretraga) },
          { vin: containsText(pretraga) },
          { registracija: containsText(pretraga) },
          { serijskiBroj: containsText(pretraga) },
        ],
      }),
    },
    include: { klijent: true, kategorija: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(oprema);
}));

function datumIliNull(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function brojIliNull(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapOpremaBody(body) {
  const data = {};
  const fields = [
    "kategorijaId", "naziv", "proizvodjac", "model", "serijskiBroj",
    "vin", "registracija", "boja", "lokacija", "status", "napomena",
  ];
  for (const f of fields) {
    if (body[f] !== undefined) {
      data[f] = body[f] === "" ? null : body[f];
    }
  }
  if (body.naziv !== undefined) data.naziv = String(body.naziv).trim();
  if (body.klijentId !== undefined) data.klijentId = body.klijentId || null;
  if (body.garancijaDo !== undefined) data.garancijaDo = datumIliNull(body.garancijaDo);
  if (body.datumKupovine !== undefined) data.datumKupovine = datumIliNull(body.datumKupovine);
  if (body.kilometraza !== undefined) data.kilometraza = brojIliNull(body.kilometraza);
  if (body.satnice !== undefined) data.satnice = brojIliNull(body.satnice);
  if (body.snagaKw !== undefined) data.snagaKw = brojIliNull(body.snagaKw);
  return data;
}

router.post("/", asyncHandler(async (req, res) => {
  const body = req.body;
  if (!body.kategorijaId || !body.naziv) {
    throw new HttpError(400, "Kategorija i naziv su obavezni.");
  }

  if (body.klijentId) {
    const klijent = await prisma.klijent.findFirst({
      where: { id: body.klijentId, firmaId: req.user.firmaId },
    });
    if (!klijent) throw new HttpError(400, "Klijent nije pronađen.");
  }

  const nova = await prisma.oprema.create({
    data: {
      firmaId: req.user.firmaId,
      status: body.status || "ispravno",
      ...mapOpremaBody(body),
      kategorijaId: body.kategorijaId,
      naziv: String(body.naziv).trim(),
      klijentId: body.klijentId || null,
    },
    include: { klijent: true, kategorija: true },
  });
  res.status(201).json(nova);
}));

router.patch("/:id", asyncHandler(async (req, res) => {
  const postojeci = await prisma.oprema.findFirst({
    where: { id: req.params.id, firmaId: req.user.firmaId },
  });
  if (!postojeci) throw new HttpError(404, "Oprema nije pronađena.");

  if (req.body.klijentId) {
    const klijent = await prisma.klijent.findFirst({
      where: { id: req.body.klijentId, firmaId: req.user.firmaId },
    });
    if (!klijent) throw new HttpError(400, "Klijent nije pronađen.");
  }

  const azurirana = await prisma.oprema.update({
    where: { id: postojeci.id },
    data: mapOpremaBody(req.body),
    include: { klijent: true, kategorija: true },
  });
  res.json(azurirana);
}));

// GET /api/oprema/:id/istorija — svi nalozi za jedinicu + MTTR/MTBF
router.get("/:id/istorija", asyncHandler(async (req, res) => {
  const oprema = await prisma.oprema.findFirst({
    where: { id: req.params.id, firmaId: req.user.firmaId },
    include: { klijent: true, kategorija: true },
  });
  if (!oprema) throw new HttpError(404, "Oprema nije pronađena.");

  const nalozi = await prisma.radniNalog.findMany({
    where: { firmaId: req.user.firmaId, opremaId: oprema.id },
    include: {
      tipUsluge: true,
      dodeljeniTehnicar: { select: { ime: true, prezime: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const zavrseni = nalozi.filter((n) => n.status === "zavrseno" && n.zavrsenoAt);
  let mttrSati = null;
  if (zavrseni.length) {
    const sum = zavrseni.reduce((s, n) => {
      const start = n.zapocetoAt || n.createdAt;
      return s + (new Date(n.zavrsenoAt) - new Date(start));
    }, 0);
    mttrSati = Math.round((sum / zavrseni.length / 3600000) * 10) / 10;
  }

  let mtbfDani = null;
  if (nalozi.length >= 2) {
    const sorted = [...nalozi].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    let gap = 0;
    for (let i = 1; i < sorted.length; i++) {
      gap += new Date(sorted[i].createdAt) - new Date(sorted[i - 1].createdAt);
    }
    mtbfDani = Math.round((gap / (sorted.length - 1) / 86400000) * 10) / 10;
  }

  res.json({
    oprema,
    nalozi,
    metrike: {
      brojNaloga: nalozi.length,
      brojZavrsenih: zavrseni.length,
      mttrSati,
      mtbfDani,
    },
  });
}));

module.exports = router;
