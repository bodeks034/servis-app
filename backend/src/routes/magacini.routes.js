const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const asyncHandler = require("../lib/asyncHandler");
const { HttpError } = require("../lib/errors");
const { centralniMagacin, mobilniMagacin } = require("../lib/magacin");

const router = express.Router();
router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  const lista = await prisma.magacin.findMany({
    where: { firmaId: req.user.firmaId },
    include: {
      tehnicar: { select: { id: true, ime: true, prezime: true } },
      stanjeZaliha: { include: { deo: true } },
    },
    orderBy: [{ tip: "asc" }, { naziv: "asc" }],
  });

  const out = lista.map((m) => ({
    id: m.id,
    naziv: m.naziv,
    tip: m.tip,
    tehnicarId: m.tehnicarId,
    tehnicar: m.tehnicar,
    stavke: m.stanjeZaliha
      .filter((s) => s.kolicina > 0)
      .map((s) => ({
        deoId: s.deoId,
        sifra: s.deo.sifra,
        naziv: s.deo.naziv,
        kolicina: s.kolicina,
      })),
  }));
  res.json(out);
}));

// POST /api/magacini/mobilni — kreiraj vozilo magacin za tehničara
router.post("/mobilni", requireRole("admin", "dispecer"), asyncHandler(async (req, res) => {
  const { tehnicarId } = req.body;
  if (!tehnicarId) throw new HttpError(400, "tehnicarId je obavezan.");
  const tehnicar = await prisma.korisnik.findFirst({
    where: { id: tehnicarId, firmaId: req.user.firmaId, aktivan: true },
  });
  if (!tehnicar) throw new HttpError(404, "Tehničar nije pronađen.");

  const magacin = await prisma.$transaction((tx) =>
    mobilniMagacin(tx, req.user.firmaId, tehnicar.id, `${tehnicar.ime} ${tehnicar.prezime}`)
  );
  res.status(201).json(magacin);
}));

// POST /api/magacini/transfer — premesti deo centralni ↔ vozilo
router.post("/transfer", requireRole("admin", "dispecer", "tehnicar"), asyncHandler(async (req, res) => {
  const { deoId, izMagacinaId, uMagacinId, kolicina } = req.body;
  const kol = parseInt(kolicina, 10);
  if (!deoId || !izMagacinaId || !uMagacinId || !Number.isFinite(kol) || kol < 1) {
    throw new HttpError(400, "deoId, izMagacinaId, uMagacinId i količina su obavezni.");
  }
  if (izMagacinaId === uMagacinId) {
    throw new HttpError(400, "Izvorni i odredišni magacin moraju biti različiti.");
  }

  await prisma.$transaction(async (tx) => {
    const [deo, iz, u] = await Promise.all([
      tx.deo.findFirst({ where: { id: deoId, firmaId: req.user.firmaId } }),
      tx.magacin.findFirst({ where: { id: izMagacinaId, firmaId: req.user.firmaId } }),
      tx.magacin.findFirst({ where: { id: uMagacinId, firmaId: req.user.firmaId } }),
    ]);
    if (!deo) throw new HttpError(400, "Deo nije pronađen.");
    if (!iz || !u) throw new HttpError(400, "Magacin nije pronađen.");

    if (req.user.uloga === "tehnicar") {
      const ok =
        (iz.tehnicarId === req.user.id || iz.tip === "centralni") &&
        (u.tehnicarId === req.user.id || u.tip === "centralni");
      if (!ok) throw new HttpError(403, "Nemate pristup ovom magacinu.");
    }

    const stanjeIz = await tx.stanjeZaliha.findUnique({
      where: { deoId_magacinId: { deoId, magacinId: iz.id } },
    });
    if (!stanjeIz || stanjeIz.kolicina < kol) {
      throw new HttpError(400, "Nema dovoljno na izvornom magacinu.");
    }
    await tx.stanjeZaliha.update({
      where: { id: stanjeIz.id },
      data: { kolicina: stanjeIz.kolicina - kol },
    });
    await tx.stanjeZaliha.upsert({
      where: { deoId_magacinId: { deoId, magacinId: u.id } },
      update: { kolicina: { increment: kol } },
      create: { deoId, magacinId: u.id, kolicina: kol },
    });
  });

  res.json({ ok: true });
}));

// Osiguraj centralni magacin postoji
router.post("/osiguraj-centralni", requireRole("admin", "dispecer"), asyncHandler(async (req, res) => {
  const m = await prisma.$transaction((tx) => centralniMagacin(tx, req.user.firmaId));
  res.json(m);
}));

module.exports = router;
