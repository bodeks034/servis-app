const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const asyncHandler = require("../lib/asyncHandler");
const { HttpError } = require("../lib/errors");

const router = express.Router();
router.use(requireAuth);

function izracunajSledeciRok(plan, oprema) {
  if (plan.tipOkidaca === "vreme" && plan.intervalDana) {
    const od = plan.poslednjiServisAt ? new Date(plan.poslednjiServisAt) : new Date();
    const d = new Date(od);
    d.setDate(d.getDate() + plan.intervalDana);
    return d;
  }
  return plan.sledeciRokAt || null;
}

function planJeDospeo(plan, oprema) {
  if (!plan.aktivan) return false;
  if (plan.tipOkidaca === "vreme") {
    const rok = plan.sledeciRokAt || izracunajSledeciRok(plan, oprema);
    return rok && new Date(rok) <= new Date();
  }
  if (plan.tipOkidaca === "kilometri" && plan.intervalKm != null && oprema.kilometraza != null) {
    const baza = plan.poslednjiKm != null ? plan.poslednjiKm : 0;
    return oprema.kilometraza >= baza + plan.intervalKm;
  }
  if (plan.tipOkidaca === "sati" && plan.intervalSati != null && oprema.satnice != null) {
    const baza = plan.poslednjiSati != null ? Number(plan.poslednjiSati) : 0;
    return Number(oprema.satnice) >= baza + Number(plan.intervalSati);
  }
  return false;
}

router.get("/", asyncHandler(async (req, res) => {
  const lista = await prisma.preventivniPlan.findMany({
    where: { firmaId: req.user.firmaId },
    include: {
      oprema: { include: { klijent: true, kategorija: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(
    lista.map((p) => ({
      ...p,
      dospeo: planJeDospeo(p, p.oprema),
    }))
  );
}));

router.post("/", requireRole("admin", "dispecer"), asyncHandler(async (req, res) => {
  const {
    opremaId, naziv, tipOkidaca, intervalDana, intervalKm, intervalSati,
    poslednjiServisAt, poslednjiKm, poslednjiSati,
  } = req.body;
  if (!opremaId || !naziv || !tipOkidaca) {
    throw new HttpError(400, "Oprema, naziv i tip okidača su obavezni.");
  }
  const oprema = await prisma.oprema.findFirst({
    where: { id: opremaId, firmaId: req.user.firmaId },
  });
  if (!oprema) throw new HttpError(400, "Oprema nije pronađena.");

  const data = {
    firmaId: req.user.firmaId,
    opremaId,
    naziv: String(naziv).trim(),
    tipOkidaca,
    intervalDana: intervalDana != null ? parseInt(intervalDana, 10) : null,
    intervalKm: intervalKm != null ? parseInt(intervalKm, 10) : null,
    intervalSati: intervalSati != null ? Number(intervalSati) : null,
    poslednjiServisAt: poslednjiServisAt ? new Date(poslednjiServisAt) : null,
    poslednjiKm: poslednjiKm != null ? parseInt(poslednjiKm, 10) : null,
    poslednjiSati: poslednjiSati != null ? Number(poslednjiSati) : null,
    aktivan: true,
  };
  data.sledeciRokAt = tipOkidaca === "vreme" ? izracunajSledeciRok(data, oprema) : null;

  const plan = await prisma.preventivniPlan.create({
    data,
    include: { oprema: { include: { klijent: true } } },
  });
  res.status(201).json({ ...plan, dospeo: planJeDospeo(plan, plan.oprema) });
}));

router.patch("/:id", requireRole("admin", "dispecer"), asyncHandler(async (req, res) => {
  const postojeci = await prisma.preventivniPlan.findFirst({
    where: { id: req.params.id, firmaId: req.user.firmaId },
    include: { oprema: true },
  });
  if (!postojeci) throw new HttpError(404, "Plan nije pronađen.");

  const data = {};
  if (req.body.naziv !== undefined) data.naziv = String(req.body.naziv).trim();
  if (typeof req.body.aktivan === "boolean") data.aktivan = req.body.aktivan;
  if (req.body.intervalDana !== undefined) data.intervalDana = parseInt(req.body.intervalDana, 10) || null;
  if (req.body.intervalKm !== undefined) data.intervalKm = parseInt(req.body.intervalKm, 10) || null;
  if (req.body.intervalSati !== undefined) data.intervalSati = Number(req.body.intervalSati) || null;
  if (req.body.poslednjiServisAt !== undefined) {
    data.poslednjiServisAt = req.body.poslednjiServisAt ? new Date(req.body.poslednjiServisAt) : null;
  }
  if (req.body.poslednjiKm !== undefined) data.poslednjiKm = parseInt(req.body.poslednjiKm, 10) || null;
  if (req.body.poslednjiSati !== undefined) data.poslednjiSati = Number(req.body.poslednjiSati) || null;
  if (req.body.oznaciServis) {
    data.poslednjiServisAt = new Date();
    data.poslednjiKm = postojeci.oprema.kilometraza;
    data.poslednjiSati = postojeci.oprema.satnice;
  }

  const merged = { ...postojeci, ...data };
  if (merged.tipOkidaca === "vreme") {
    data.sledeciRokAt = izracunajSledeciRok(merged, postojeci.oprema);
  }

  const plan = await prisma.preventivniPlan.update({
    where: { id: postojeci.id },
    data,
    include: { oprema: { include: { klijent: true } } },
  });
  res.json({ ...plan, dospeo: planJeDospeo(plan, plan.oprema) });
}));

module.exports = router;
