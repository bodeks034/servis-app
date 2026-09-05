const express = require("express");
const nodemailer = require("nodemailer");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const asyncHandler = require("../lib/asyncHandler");
const { HttpError } = require("../lib/errors");
const { izracunajPodsetnike, startOfDay, endOfDay, addDays } = require("../lib/podsetnici");

const router = express.Router();
router.use(requireAuth);

// GET /api/podsetnici
router.get("/", asyncHandler(async (req, res) => {
  const data = await izracunajPodsetnike(req.user.firmaId, req.user.uloga, req.user.id);
  res.json(data);
}));

// GET /api/podsetnici/kalendar?od=&do=&tehnicarId=&status=
router.get("/kalendar", asyncHandler(async (req, res) => {
  const od = req.query.od ? new Date(req.query.od) : startOfDay(new Date());
  const doDatuma = req.query.do ? new Date(req.query.do) : endOfDay(addDays(new Date(), 14));

  const where = {
    firmaId: req.user.firmaId,
    zakazanoZa: { gte: od, lte: doDatuma },
    status: { not: "otkazano" },
  };
  if (req.user.uloga === "tehnicar") {
    where.dodeljeniTehnicarId = req.user.id;
  } else if (req.query.tehnicarId) {
    where.dodeljeniTehnicarId = String(req.query.tehnicarId);
  }
  if (req.query.status && req.query.status !== "sve") {
    where.status = String(req.query.status);
  }

  const [nalozi, nezakazani] = await Promise.all([
    prisma.radniNalog.findMany({
      where,
      include: {
        klijent: { select: { nazivIliIme: true } },
        oprema: { select: { naziv: true } },
        kategorija: { select: { id: true, naziv: true } },
        tipUsluge: { select: { naziv: true } },
        dodeljeniTehnicar: { select: { id: true, ime: true, prezime: true } },
      },
      orderBy: { zakazanoZa: "asc" },
    }),
    req.query.nezakazani === "1" && req.user.uloga !== "tehnicar"
      ? prisma.radniNalog.findMany({
          where: {
            firmaId: req.user.firmaId,
            zakazanoZa: null,
            status: { notIn: ["zavrseno", "otkazano"] },
          },
          include: {
            klijent: { select: { nazivIliIme: true } },
            kategorija: { select: { naziv: true } },
            dodeljeniTehnicar: { select: { id: true, ime: true, prezime: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 40,
        })
      : Promise.resolve([]),
  ]);

  res.json({ nalozi, nezakazani });
}));

function mailerSpreman() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

// POST /api/podsetnici/posalji-email — šalje sažetak podsetnika na email admina/dispečera
router.post("/posalji-email", requireRole("admin", "dispecer"), asyncHandler(async (req, res) => {
  if (!mailerSpreman()) {
    throw new HttpError(400, "SMTP nije podešen (SMTP_HOST, SMTP_USER, SMTP_PASS u .env).");
  }
  const email = req.body.email || req.user.email;
  const data = await izracunajPodsetnike(req.user.firmaId, req.user.uloga, req.user.id);
  if (data.broj === 0) {
    return res.json({ ok: true, poruka: "Nema podsetnika za slanje." });
  }

  const lines = data.stavke.map((s) => `• [${s.tip}] ${s.naslov} — ${s.tekst}`).join("\n");
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: `Servis Dispečer — ${data.broj} podsetnika`,
    text: `Pregled podsetnika:\n\n${lines}\n`,
  });

  res.json({ ok: true, poslatona: email, broj: data.broj });
}));

module.exports = router;
