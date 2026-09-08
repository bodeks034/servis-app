const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const asyncHandler = require("../lib/asyncHandler");
const { HttpError } = require("../lib/errors");
const { upisiAudit } = require("../lib/audit");

const router = express.Router();
router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  const where = { firmaId: req.user.firmaId };
  if (req.query.nalogId) where.nalogId = String(req.query.nalogId);
  if (req.query.status) where.status = String(req.query.status);
  const lista = await prisma.rezervacijaDela.findMany({
    where,
    include: {
      deo: { select: { id: true, sifra: true, naziv: true, barkod: true } },
      nalog: { select: { id: true, brojNaloga: true, naslov: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(lista);
}));

router.post("/", requireRole("admin", "dispecer", "tehnicar", "magacioner"), asyncHandler(async (req, res) => {
  const { nalogId, deoId, kolicina } = req.body;
  const kol = parseInt(kolicina, 10);
  if (!nalogId || !deoId || !Number.isFinite(kol) || kol < 1) {
    throw new HttpError(400, "Nalog, deo i količina su obavezni.");
  }

  const nalog = await prisma.radniNalog.findFirst({
    where: { id: nalogId, firmaId: req.user.firmaId },
  });
  if (!nalog) throw new HttpError(404, "Nalog nije pronađen.");
  if (["zavrseno", "otkazano"].includes(nalog.status)) {
    throw new HttpError(400, "Nalog je zatvoren.");
  }
  if (req.user.uloga === "tehnicar" && nalog.dodeljeniTehnicarId !== req.user.id) {
    throw new HttpError(403, "Ovaj nalog nije dodeljen vama.");
  }

  const deo = await prisma.deo.findFirst({ where: { id: deoId, firmaId: req.user.firmaId } });
  if (!deo) throw new HttpError(400, "Deo nije pronađen.");

  const rezervacija = await prisma.rezervacijaDela.create({
    data: {
      firmaId: req.user.firmaId,
      nalogId: nalog.id,
      deoId: deo.id,
      kolicina: kol,
      status: "rezervisano",
    },
    include: {
      deo: { select: { id: true, sifra: true, naziv: true, barkod: true } },
      nalog: { select: { id: true, brojNaloga: true } },
    },
  });

  await upisiAudit({
    firmaId: req.user.firmaId,
    korisnikId: req.user.id,
    akcija: "rezervacija",
    entitet: "deo",
    entitetId: deo.id,
    detalj: `${kol}× ${deo.naziv} → ${nalog.brojNaloga}`,
  });

  res.status(201).json(rezervacija);
}));

router.patch("/:id", requireRole("admin", "dispecer", "tehnicar", "magacioner"), asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!["rezervisano", "utroseno", "otkazano"].includes(status)) {
    throw new HttpError(400, "Nepoznat status rezervacije.");
  }
  const postojeci = await prisma.rezervacijaDela.findFirst({
    where: { id: req.params.id, firmaId: req.user.firmaId },
  });
  if (!postojeci) throw new HttpError(404, "Rezervacija nije pronađena.");

  const azurirana = await prisma.rezervacijaDela.update({
    where: { id: postojeci.id },
    data: { status },
    include: {
      deo: { select: { id: true, sifra: true, naziv: true, barkod: true } },
      nalog: { select: { id: true, brojNaloga: true } },
    },
  });
  res.json(azurirana);
}));

module.exports = router;
