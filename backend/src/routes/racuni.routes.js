const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const asyncHandler = require("../lib/asyncHandler");
const { HttpError } = require("../lib/errors");
const { sledeciBrojRacuna } = require("../lib/brojevi");
const { racunHtml } = require("../lib/pdfHtml");

const router = express.Router();
router.use(requireAuth);

const racunInclude = {
  klijent: true,
  nalog: { select: { brojNaloga: true, naslov: true } },
  stavke: { orderBy: { redosled: "asc" } },
};

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

router.get("/", asyncHandler(async (req, res) => {
  const racuni = await prisma.racun.findMany({
    where: { firmaId: req.user.firmaId },
    include: racunInclude,
    orderBy: { izdatAt: "desc" },
  });
  res.json(racuni);
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const racun = await prisma.racun.findFirst({
    where: { id: req.params.id, firmaId: req.user.firmaId },
    include: {
      ...racunInclude,
      firma: { select: { naziv: true, pib: true, adresa: true } },
    },
  });
  if (!racun) throw new HttpError(404, "Račun nije pronađen.");
  res.json(racun);
}));

router.get("/:id/pdf", asyncHandler(async (req, res) => {
  const racun = await prisma.racun.findFirst({
    where: { id: req.params.id, firmaId: req.user.firmaId },
    include: {
      ...racunInclude,
      firma: { select: { naziv: true, pib: true, adresa: true, maticniBroj: true } },
    },
  });
  if (!racun) throw new HttpError(404, "Račun nije pronađen.");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(racunHtml(racun, racun.firma));
}));

router.post("/", asyncHandler(async (req, res) => {
  const { nalogId, cenaRada, rokPlacanjaDana, pdvStopa, napomena } = req.body;
  const stopa = Number(pdvStopa != null ? pdvStopa : 20);

  const nalog = await prisma.radniNalog.findFirst({
    where: { id: nalogId, firmaId: req.user.firmaId },
    include: { utroseniDelovi: { include: { deo: true } }, klijent: true },
  });

  if (!nalog) throw new HttpError(404, "Nalog nije pronađen.");
  if (nalog.status !== "zavrseno") {
    throw new HttpError(400, "Račun se može izdati samo za završen nalog.");
  }

  const postojeciRacun = await prisma.racun.findUnique({ where: { nalogId } });
  if (postojeciRacun) {
    throw new HttpError(409, "Za ovaj nalog već postoji račun.");
  }

  const stavkeData = [];
  let redosled = 0;
  const rad = Number(cenaRada || 0);
  if (rad > 0) {
    stavkeData.push({ tip: "rad", opis: "Rad / usluga", kolicina: 1, cena: rad, redosled: redosled++ });
  }
  for (const d of nalog.utroseniDelovi) {
    stavkeData.push({
      tip: "deo",
      opis: d.deo?.naziv || "Deo",
      kolicina: d.kolicina,
      cena: Number(d.cenaPoKomadu),
      redosled: redosled++,
    });
  }
  if (stavkeData.length === 0) {
    throw new HttpError(400, "Račun mora imati bar jednu stavku (rad ili delovi).");
  }

  const iznosBezPdv = round2(
    stavkeData.reduce((s, x) => s + Number(x.kolicina) * Number(x.cena), 0)
  );
  const iznosPdv = round2(iznosBezPdv * (stopa / 100));
  const ukupanIznos = round2(iznosBezPdv + iznosPdv);

  const rokPlacanja = new Date();
  rokPlacanja.setDate(rokPlacanja.getDate() + (rokPlacanjaDana || 15));

  const racun = await prisma.$transaction(async (tx) => {
    const brojRacuna = await sledeciBrojRacuna(tx, req.user.firmaId);
    return tx.racun.create({
      data: {
        nalogId: nalog.id,
        firmaId: req.user.firmaId,
        klijentId: nalog.klijentId,
        brojRacuna,
        pdvStopa: stopa,
        iznosBezPdv,
        iznosPdv,
        ukupanIznos,
        napomena: napomena || null,
        rokPlacanja,
        status: "neplacen",
        stavke: { create: stavkeData },
      },
      include: racunInclude,
    });
  });

  res.status(201).json(racun);
}));

router.patch("/:id/status", asyncHandler(async (req, res) => {
  const { status } = req.body;
  const dozvoljeni = ["neplacen", "delimicno_placen", "placen"];
  if (!dozvoljeni.includes(status)) {
    throw new HttpError(400, "Nepoznat status računa.");
  }

  const racun = await prisma.racun.findFirst({
    where: { id: req.params.id, firmaId: req.user.firmaId },
  });
  if (!racun) throw new HttpError(404, "Račun nije pronađen.");

  const azuriran = await prisma.racun.update({
    where: { id: racun.id },
    data: {
      status,
      placenAt: status === "placen" ? new Date() : racun.placenAt,
    },
    include: racunInclude,
  });
  res.json(azuriran);
}));

module.exports = router;
