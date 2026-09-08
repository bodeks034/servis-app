const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const asyncHandler = require("../lib/asyncHandler");
const { HttpError } = require("../lib/errors");
const { upisiAudit } = require("../lib/audit");

const router = express.Router();
router.use(requireAuth);

function parseCoords(body) {
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new HttpError(400, "lat i lng su obavezni.");
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new HttpError(400, "Neispravne koordinate.");
  }
  return { lat, lng };
}

/** POST /api/lokacije/me — serviser šalje svoju trenutnu lokaciju */
router.post("/me", asyncHandler(async (req, res) => {
  const { lat, lng } = parseCoords(req.body);
  const now = new Date();
  const korisnik = await prisma.korisnik.update({
    where: { id: req.user.id },
    data: { lastLat: lat, lastLng: lng, lastGeoAt: now },
    select: {
      id: true, ime: true, prezime: true, uloga: true,
      lastLat: true, lastLng: true, lastGeoAt: true,
    },
  });
  res.json(korisnik);
}));

/** POST /api/lokacije/oprema/:id — snimi GPS na vozilo/opremu */
router.post("/oprema/:id", requireRole("admin", "dispecer", "tehnicar"), asyncHandler(async (req, res) => {
  const { lat, lng } = parseCoords(req.body);
  const oprema = await prisma.oprema.findFirst({
    where: { id: req.params.id, firmaId: req.user.firmaId },
  });
  if (!oprema) throw new HttpError(404, "Oprema nije pronađena.");

  const now = new Date();
  const azurirana = await prisma.oprema.update({
    where: { id: oprema.id },
    data: { geoLat: lat, geoLng: lng, geoAt: now },
    include: { kategorija: true, klijent: { select: { nazivIliIme: true } } },
  });

  await upisiAudit({
    firmaId: req.user.firmaId,
    korisnikId: req.user.id,
    akcija: "geo",
    entitet: "oprema",
    entitetId: oprema.id,
    detalj: `${lat.toFixed(5)},${lng.toFixed(5)}`,
  });

  res.json(azurirana);
}));

/** GET /api/lokacije — pregled servisera, vozila i aktivnih naloga sa GPS */
router.get("/", asyncHandler(async (req, res) => {
  const firmaId = req.user.firmaId;

  const [serviseri, vozila, nalozi] = await Promise.all([
    prisma.korisnik.findMany({
      where: {
        firmaId,
        aktivan: true,
        uloga: { in: ["tehnicar", "dispecer", "admin"] },
        lastLat: { not: null },
        lastLng: { not: null },
      },
      select: {
        id: true, ime: true, prezime: true, uloga: true, telefon: true,
        lastLat: true, lastLng: true, lastGeoAt: true,
      },
      orderBy: { lastGeoAt: "desc" },
    }),
    prisma.oprema.findMany({
      where: {
        firmaId,
        geoLat: { not: null },
        geoLng: { not: null },
        OR: [
          { vin: { not: null } },
          { registracija: { not: null } },
          { kategorija: { naziv: { contains: "vozil", mode: "insensitive" } } },
        ],
      },
      select: {
        id: true, naziv: true, registracija: true, vin: true,
        geoLat: true, geoLng: true, geoAt: true,
        klijent: { select: { nazivIliIme: true } },
        kategorija: { select: { naziv: true } },
      },
      orderBy: { geoAt: "desc" },
    }),
    prisma.radniNalog.findMany({
      where: {
        firmaId,
        geoLat: { not: null },
        geoLng: { not: null },
        status: { in: ["novo", "u_toku", "ceka_delove"] },
      },
      select: {
        id: true, brojNaloga: true, naslov: true, status: true,
        geoLat: true, geoLng: true, geoAt: true,
        adresaIntervencije: true,
        dodeljeniTehnicar: { select: { id: true, ime: true, prezime: true } },
        oprema: { select: { id: true, naziv: true, registracija: true } },
        klijent: { select: { nazivIliIme: true } },
      },
      orderBy: { geoAt: "desc" },
      take: 100,
    }),
  ]);

  res.json({ serviseri, vozila, nalozi });
}));

module.exports = router;
