const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const asyncHandler = require("../lib/asyncHandler");
const { HttpError } = require("../lib/errors");

const router = express.Router();
router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  const where = { firmaId: req.user.firmaId };
  if (req.user.uloga === "klijent") {
    const ja = await prisma.korisnik.findUnique({ where: { id: req.user.id } });
    if (!ja?.klijentId) return res.json([]);
    where.klijentId = ja.klijentId;
  }
  const lista = await prisma.ugovor.findMany({
    where,
    include: { klijent: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(lista);
}));

/** Aktivni ugovor za klijenta — za SLA pri kreiranju naloga */
router.get("/za-klijenta/:klijentId", asyncHandler(async (req, res) => {
  const ugovor = await prisma.ugovor.findFirst({
    where: {
      firmaId: req.user.firmaId,
      klijentId: req.params.klijentId,
      aktivan: true,
      OR: [{ kraj: null }, { kraj: { gte: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(ugovor || null);
}));

router.post("/", requireRole("admin", "dispecer"), asyncHandler(async (req, res) => {
  const {
    klijentId, naziv, tip, slaReakcijaSati, slaResavanjeSati,
    mesecnaCena, pocetak, kraj, napomena,
  } = req.body;
  if (!klijentId || !naziv || !pocetak) {
    throw new HttpError(400, "Klijent, naziv i početak su obavezni.");
  }
  const klijent = await prisma.klijent.findFirst({
    where: { id: klijentId, firmaId: req.user.firmaId },
  });
  if (!klijent) throw new HttpError(400, "Klijent nije pronađen.");

  const ugovor = await prisma.ugovor.create({
    data: {
      firmaId: req.user.firmaId,
      klijentId,
      naziv: String(naziv).trim(),
      tip: ["pausal", "po_pozivu", "sla"].includes(tip) ? tip : "po_pozivu",
      slaReakcijaSati: slaReakcijaSati != null ? parseInt(slaReakcijaSati, 10) : null,
      slaResavanjeSati: slaResavanjeSati != null ? parseInt(slaResavanjeSati, 10) : null,
      mesecnaCena: mesecnaCena != null ? Number(mesecnaCena) : null,
      pocetak: new Date(pocetak),
      kraj: kraj ? new Date(kraj) : null,
      napomena: napomena || null,
      aktivan: true,
    },
    include: { klijent: true },
  });
  res.status(201).json(ugovor);
}));

router.patch("/:id", requireRole("admin", "dispecer"), asyncHandler(async (req, res) => {
  const postojeci = await prisma.ugovor.findFirst({
    where: { id: req.params.id, firmaId: req.user.firmaId },
  });
  if (!postojeci) throw new HttpError(404, "Ugovor nije pronađen.");

  const data = {};
  for (const f of ["naziv", "napomena", "tip"]) {
    if (req.body[f] !== undefined) data[f] = req.body[f];
  }
  if (typeof req.body.aktivan === "boolean") data.aktivan = req.body.aktivan;
  if (req.body.slaReakcijaSati !== undefined) {
    data.slaReakcijaSati = req.body.slaReakcijaSati === null || req.body.slaReakcijaSati === ""
      ? null
      : parseInt(req.body.slaReakcijaSati, 10);
  }
  if (req.body.slaResavanjeSati !== undefined) {
    data.slaResavanjeSati = req.body.slaResavanjeSati === null || req.body.slaResavanjeSati === ""
      ? null
      : parseInt(req.body.slaResavanjeSati, 10);
  }
  if (req.body.mesecnaCena !== undefined) {
    data.mesecnaCena = req.body.mesecnaCena === "" || req.body.mesecnaCena == null
      ? null
      : Number(req.body.mesecnaCena);
  }
  if (req.body.pocetak) data.pocetak = new Date(req.body.pocetak);
  if (req.body.kraj !== undefined) data.kraj = req.body.kraj ? new Date(req.body.kraj) : null;

  const ugovor = await prisma.ugovor.update({
    where: { id: postojeci.id },
    data,
    include: { klijent: true },
  });
  res.json(ugovor);
}));

module.exports = router;
