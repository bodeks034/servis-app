const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const asyncHandler = require("../lib/asyncHandler");
const { HttpError } = require("../lib/errors");
const { containsText } = require("../lib/search");

const router = express.Router();
router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  const { pretraga } = req.query;
  const klijenti = await prisma.klijent.findMany({
    where: {
      firmaId: req.user.firmaId,
      ...(pretraga && { nazivIliIme: containsText(pretraga) }),
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(klijenti);
}));

router.post("/", asyncHandler(async (req, res) => {
  const { tip, nazivIliIme, telefon, email, adresa, pibIliJmbg, napomena } = req.body;
  if (!tip || !nazivIliIme) {
    throw new HttpError(400, "Tip i naziv/ime su obavezni.");
  }

  const klijent = await prisma.klijent.create({
    data: {
      firmaId: req.user.firmaId,
      tip,
      nazivIliIme: String(nazivIliIme).trim(),
      telefon: telefon || null,
      email: email || null,
      adresa: adresa || null,
      pibIliJmbg: pibIliJmbg || null,
      napomena: napomena || null,
    },
  });
  res.status(201).json(klijent);
}));

router.patch("/:id", asyncHandler(async (req, res) => {
  const postojeci = await prisma.klijent.findFirst({
    where: { id: req.params.id, firmaId: req.user.firmaId },
  });
  if (!postojeci) throw new HttpError(404, "Klijent nije pronađen.");

  const { tip, nazivIliIme, telefon, email, adresa, pibIliJmbg, napomena } = req.body;
  const data = {};
  if (tip !== undefined) data.tip = tip;
  if (nazivIliIme !== undefined) data.nazivIliIme = String(nazivIliIme).trim();
  if (telefon !== undefined) data.telefon = telefon || null;
  if (email !== undefined) data.email = email || null;
  if (adresa !== undefined) data.adresa = adresa || null;
  if (pibIliJmbg !== undefined) data.pibIliJmbg = pibIliJmbg || null;
  if (napomena !== undefined) data.napomena = napomena || null;

  const klijent = await prisma.klijent.update({ where: { id: postojeci.id }, data });
  res.json(klijent);
}));

module.exports = router;
