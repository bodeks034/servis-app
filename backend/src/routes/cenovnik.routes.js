const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const asyncHandler = require("../lib/asyncHandler");
const { HttpError } = require("../lib/errors");
const { upisiAudit } = require("../lib/audit");
const { containsText } = require("../lib/search");

const router = express.Router();
router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  const where = { firmaId: req.user.firmaId };
  if (req.query.aktivan !== "0") where.aktivan = true;
  if (req.query.q) {
    where.OR = [
      { naziv: containsText(req.query.q) },
      { sifra: containsText(req.query.q) },
    ];
  }
  const lista = await prisma.cenovnikStavka.findMany({
    where,
    orderBy: [{ tip: "asc" }, { naziv: "asc" }],
  });
  res.json(lista);
}));

router.post("/", requireRole("admin", "dispecer", "knjigovodja"), asyncHandler(async (req, res) => {
  const { sifra, naziv, jedinica, cena, tip } = req.body;
  if (!naziv || cena == null) throw new HttpError(400, "Naziv i cena su obavezni.");
  const stavka = await prisma.cenovnikStavka.create({
    data: {
      firmaId: req.user.firmaId,
      sifra: sifra ? String(sifra).trim() : null,
      naziv: String(naziv).trim(),
      jedinica: jedinica || "kom",
      cena: Number(cena),
      tip: ["usluga", "deo", "ostalo"].includes(tip) ? tip : "usluga",
    },
  });
  await upisiAudit({
    firmaId: req.user.firmaId,
    korisnikId: req.user.id,
    akcija: "kreiranje",
    entitet: "cenovnik",
    entitetId: stavka.id,
    detalj: stavka.naziv,
  });
  res.status(201).json(stavka);
}));

router.patch("/:id", requireRole("admin", "dispecer", "knjigovodja"), asyncHandler(async (req, res) => {
  const postojeci = await prisma.cenovnikStavka.findFirst({
    where: { id: req.params.id, firmaId: req.user.firmaId },
  });
  if (!postojeci) throw new HttpError(404, "Stavka nije pronađena.");

  const { sifra, naziv, jedinica, cena, tip, aktivan } = req.body;
  const data = {};
  if (sifra !== undefined) data.sifra = sifra ? String(sifra).trim() : null;
  if (naziv !== undefined) data.naziv = String(naziv).trim();
  if (jedinica !== undefined) data.jedinica = jedinica || "kom";
  if (cena !== undefined) data.cena = Number(cena);
  if (tip !== undefined && ["usluga", "deo", "ostalo"].includes(tip)) data.tip = tip;
  if (typeof aktivan === "boolean") data.aktivan = aktivan;

  const stavka = await prisma.cenovnikStavka.update({ where: { id: postojeci.id }, data });
  await upisiAudit({
    firmaId: req.user.firmaId,
    korisnikId: req.user.id,
    akcija: "izmena",
    entitet: "cenovnik",
    entitetId: stavka.id,
  });
  res.json(stavka);
}));

router.delete("/:id", requireRole("admin", "dispecer"), asyncHandler(async (req, res) => {
  const postojeci = await prisma.cenovnikStavka.findFirst({
    where: { id: req.params.id, firmaId: req.user.firmaId },
  });
  if (!postojeci) throw new HttpError(404, "Stavka nije pronađena.");
  await prisma.cenovnikStavka.update({
    where: { id: postojeci.id },
    data: { aktivan: false },
  });
  res.json({ ok: true });
}));

module.exports = router;
