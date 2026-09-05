const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const asyncHandler = require("../lib/asyncHandler");
const { HttpError } = require("../lib/errors");
const { centralniMagacin } = require("../lib/magacin");

const router = express.Router();
router.use(requireAuth);

function saStanjem(deo) {
  const poMagacinu = (deo.stanjeZaliha || []).map((s) => ({
    magacinId: s.magacinId,
    magacinNaziv: s.magacin?.naziv || null,
    tip: s.magacin?.tip || null,
    kolicina: s.kolicina,
  }));
  return {
    ...deo,
    stanjeZaliha: undefined,
    poMagacinu,
    ukupnoNaStanju: poMagacinu.reduce((zbir, s) => zbir + s.kolicina, 0),
  };
}

router.get("/", asyncHandler(async (req, res) => {
  const delovi = await prisma.deo.findMany({
    where: { firmaId: req.user.firmaId },
    include: {
      stanjeZaliha: {
        include: { magacin: { select: { id: true, naziv: true, tip: true } } },
      },
    },
    orderBy: { naziv: "asc" },
  });
  res.json(delovi.map(saStanjem));
}));

router.post("/", asyncHandler(async (req, res) => {
  const { sifra, naziv, jedinicaMere, nabavnaCena, prodajnaCena, minZaliha } = req.body;
  if (!sifra || !naziv) {
    throw new HttpError(400, "Šifra i naziv su obavezni.");
  }

  const deo = await prisma.deo.create({
    data: {
      firmaId: req.user.firmaId,
      sifra: String(sifra).trim(),
      naziv: String(naziv).trim(),
      jedinicaMere: jedinicaMere || null,
      nabavnaCena: nabavnaCena || null,
      prodajnaCena: prodajnaCena || null,
      minZaliha: minZaliha || 0,
    },
    include: {
      stanjeZaliha: {
        include: { magacin: { select: { id: true, naziv: true, tip: true } } },
      },
    },
  });
  res.status(201).json(saStanjem(deo));
}));

// POST /api/delovi/:id/prijem — ulaz robe u centralni magacin
router.post("/:id/prijem", asyncHandler(async (req, res) => {
  const kol = parseInt(req.body.kolicina, 10);
  if (!Number.isFinite(kol) || kol < 1) {
    throw new HttpError(400, "Količina mora biti najmanje 1.");
  }

  const deo = await prisma.$transaction(async (tx) => {
    const postojeci = await tx.deo.findFirst({
      where: { id: req.params.id, firmaId: req.user.firmaId },
    });
    if (!postojeci) throw new HttpError(404, "Deo nije pronađen.");

    const magacin = await centralniMagacin(tx, req.user.firmaId);
    await tx.stanjeZaliha.upsert({
      where: { deoId_magacinId: { deoId: postojeci.id, magacinId: magacin.id } },
      update: { kolicina: { increment: kol } },
      create: { deoId: postojeci.id, magacinId: magacin.id, kolicina: kol },
    });

    return tx.deo.findUnique({
      where: { id: postojeci.id },
      include: {
        stanjeZaliha: {
          include: { magacin: { select: { id: true, naziv: true, tip: true } } },
        },
      },
    });
  });

  res.json(saStanjem(deo));
}));

module.exports = router;
