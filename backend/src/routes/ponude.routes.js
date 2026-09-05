const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const asyncHandler = require("../lib/asyncHandler");
const { HttpError } = require("../lib/errors");
const { sledeciBrojPonude, sledeciBrojRacuna } = require("../lib/brojevi");
const { posaljiSms } = require("../lib/sms");

const router = express.Router();
router.use(requireAuth);

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function iznosi(stavke, stopa) {
  const iznosBezPdv = round2(
    stavke.reduce((s, x) => s + Number(x.kolicina) * Number(x.cena), 0)
  );
  const iznosPdv = round2(iznosBezPdv * (stopa / 100));
  return { iznosBezPdv, iznosPdv, ukupanIznos: round2(iznosBezPdv + iznosPdv) };
}

const include = {
  klijent: true,
  nalog: { select: { id: true, brojNaloga: true, naslov: true } },
  stavke: { orderBy: { redosled: "asc" } },
  racun: { select: { id: true, brojRacuna: true } },
};

router.get("/", asyncHandler(async (req, res) => {
  const where = { firmaId: req.user.firmaId };
  if (req.user.uloga === "klijent") {
    const ja = await prisma.korisnik.findUnique({ where: { id: req.user.id } });
    if (!ja?.klijentId) return res.json([]);
    where.klijentId = ja.klijentId;
  }
  const lista = await prisma.ponuda.findMany({
    where,
    include,
    orderBy: { createdAt: "desc" },
  });
  res.json(lista);
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const p = await prisma.ponuda.findFirst({
    where: { id: req.params.id, firmaId: req.user.firmaId },
    include,
  });
  if (!p) throw new HttpError(404, "Ponuda nije pronađena.");
  res.json(p);
}));

router.post("/", requireRole("admin", "dispecer"), asyncHandler(async (req, res) => {
  const { klijentId, nalogId, naslov, napomena, pdvStopa, vaziDo, stavke } = req.body;
  if (!klijentId || !naslov) throw new HttpError(400, "Klijent i naslov su obavezni.");
  const stavkeLista = Array.isArray(stavke) ? stavke : [];
  if (!stavkeLista.length) throw new HttpError(400, "Dodajte bar jednu stavku.");

  const klijent = await prisma.klijent.findFirst({
    where: { id: klijentId, firmaId: req.user.firmaId },
  });
  if (!klijent) throw new HttpError(400, "Klijent nije pronađen.");

  const stopa = Number(pdvStopa != null ? pdvStopa : 20);
  const mapped = stavkeLista.map((s, i) => ({
    opis: String(s.opis || "Stavka").trim(),
    kolicina: Number(s.kolicina || 1),
    cena: Number(s.cena || 0),
    redosled: i,
  }));
  const { iznosBezPdv, iznosPdv, ukupanIznos } = iznosi(mapped, stopa);

  const ponuda = await prisma.$transaction(async (tx) => {
    const brojPonude = await sledeciBrojPonude(tx, req.user.firmaId);
    return tx.ponuda.create({
      data: {
        firmaId: req.user.firmaId,
        klijentId,
        nalogId: nalogId || null,
        brojPonude,
        naslov: String(naslov).trim(),
        napomena: napomena || null,
        pdvStopa: stopa,
        iznosBezPdv,
        iznosPdv,
        ukupanIznos,
        vaziDo: vaziDo ? new Date(vaziDo) : null,
        status: "nacrt",
        stavke: { create: mapped },
      },
      include,
    });
  });

  res.status(201).json(ponuda);
}));

/** Izmena sadržaja ponude (nacrt / poslata) */
router.patch("/:id", requireRole("admin", "dispecer"), asyncHandler(async (req, res) => {
  const p = await prisma.ponuda.findFirst({
    where: { id: req.params.id, firmaId: req.user.firmaId },
    include: { racun: true },
  });
  if (!p) throw new HttpError(404, "Ponuda nije pronađena.");
  if (p.racun) throw new HttpError(400, "Ponuda već ima račun — ne može se menjati.");
  if (!["nacrt", "poslata", "odbijena"].includes(p.status)) {
    throw new HttpError(400, "Odobrena / istekla ponuda se ne može menjati.");
  }

  const {
    klijentId, nalogId, naslov, napomena, pdvStopa, vaziDo, stavke, status,
  } = req.body;

  if (klijentId) {
    const klijent = await prisma.klijent.findFirst({
      where: { id: klijentId, firmaId: req.user.firmaId },
    });
    if (!klijent) throw new HttpError(400, "Klijent nije pronađen.");
  }

  const stopa = Number(pdvStopa != null ? pdvStopa : p.pdvStopa);
  let mapped = null;
  let iznosiMap = null;
  if (Array.isArray(stavke)) {
    if (!stavke.length) throw new HttpError(400, "Dodajte bar jednu stavku.");
    mapped = stavke.map((s, i) => ({
      opis: String(s.opis || "Stavka").trim(),
      kolicina: Number(s.kolicina || 1),
      cena: Number(s.cena || 0),
      redosled: i,
    }));
    iznosiMap = iznosi(mapped, stopa);
  }

  const data = {};
  if (klijentId) data.klijentId = klijentId;
  if (nalogId !== undefined) data.nalogId = nalogId || null;
  if (naslov !== undefined) data.naslov = String(naslov).trim();
  if (napomena !== undefined) data.napomena = napomena || null;
  if (pdvStopa !== undefined) data.pdvStopa = stopa;
  if (vaziDo !== undefined) data.vaziDo = vaziDo ? new Date(vaziDo) : null;
  if (status && ["nacrt", "poslata", "odbijena"].includes(status)) data.status = status;
  if (iznosiMap) {
    data.iznosBezPdv = iznosiMap.iznosBezPdv;
    data.iznosPdv = iznosiMap.iznosPdv;
    data.ukupanIznos = iznosiMap.ukupanIznos;
  }

  const azurirana = await prisma.$transaction(async (tx) => {
    if (mapped) {
      await tx.ponudaStavka.deleteMany({ where: { ponudaId: p.id } });
      await tx.ponudaStavka.createMany({
        data: mapped.map((s) => ({ ...s, ponudaId: p.id })),
      });
    }
    return tx.ponuda.update({
      where: { id: p.id },
      data,
      include,
    });
  });

  res.json(azurirana);
}));

router.patch("/:id/status", asyncHandler(async (req, res) => {
  const { status } = req.body;
  const dozvoljeno = ["nacrt", "poslata", "odobrena", "odbijena", "istekla"];
  if (!dozvoljeno.includes(status)) throw new HttpError(400, "Nepoznat status.");

  const p = await prisma.ponuda.findFirst({
    where: { id: req.params.id, firmaId: req.user.firmaId },
    include: { klijent: true },
  });
  if (!p) throw new HttpError(404, "Ponuda nije pronađena.");

  if (req.user.uloga === "klijent") {
    const ja = await prisma.korisnik.findUnique({ where: { id: req.user.id } });
    if (ja?.klijentId !== p.klijentId) throw new HttpError(403, "Nemate pristup.");
    if (!["odobrena", "odbijena"].includes(status)) {
      throw new HttpError(403, "Klijent može samo da odobri ili odbije.");
    }
  } else if (!["admin", "dispecer"].includes(req.user.uloga)) {
    throw new HttpError(403, "Nemate dozvolu.");
  }

  const azurirana = await prisma.ponuda.update({
    where: { id: p.id },
    data: {
      status,
      odobrenoAt: status === "odobrena" ? new Date() : p.odobrenoAt,
    },
    include,
  });

  if (status === "poslata" && p.klijent?.telefon) {
    await posaljiSms({
      firmaId: req.user.firmaId,
      telefon: p.klijent.telefon,
      naslov: `Ponuda ${p.brojPonude}`,
      telo: `${p.naslov} — ${Number(p.ukupanIznos).toFixed(2)} RSD. Prijava u portal za odobrenje.`,
    });
  }

  res.json(azurirana);
}));

// Pretvori odobrenu ponudu u račun
router.post("/:id/u-racun", requireRole("admin", "dispecer"), asyncHandler(async (req, res) => {
  const p = await prisma.ponuda.findFirst({
    where: { id: req.params.id, firmaId: req.user.firmaId },
    include: { stavke: true, racun: true },
  });
  if (!p) throw new HttpError(404, "Ponuda nije pronađena.");
  if (p.status !== "odobrena") throw new HttpError(400, "Samo odobrena ponuda može u račun.");
  if (p.racun) throw new HttpError(409, "Račun već postoji za ovu ponudu.");

  const racun = await prisma.$transaction(async (tx) => {
    const brojRacuna = await sledeciBrojRacuna(tx, req.user.firmaId);
    const rok = new Date();
    rok.setDate(rok.getDate() + 15);
    return tx.racun.create({
      data: {
        firmaId: req.user.firmaId,
        klijentId: p.klijentId,
        nalogId: p.nalogId || null,
        ponudaId: p.id,
        brojRacuna,
        pdvStopa: p.pdvStopa,
        iznosBezPdv: p.iznosBezPdv,
        iznosPdv: p.iznosPdv,
        ukupanIznos: p.ukupanIznos,
        napomena: `Iz ponude ${p.brojPonude}`,
        rokPlacanja: rok,
        stavke: {
          create: p.stavke.map((s) => ({
            tip: "ostalo",
            opis: s.opis,
            kolicina: s.kolicina,
            cena: s.cena,
            redosled: s.redosled,
          })),
        },
      },
      include: { stavke: true, klijent: true },
    });
  });

  res.status(201).json(racun);
}));

module.exports = router;
