const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const asyncHandler = require("../lib/asyncHandler");
const { HttpError } = require("../lib/errors");
const { containsText } = require("../lib/search");
const { sledeciBrojNaloga } = require("../lib/brojevi");
const { centralniMagacin, magacinZaUtrošak } = require("../lib/magacin");
const { uploadPrilog, obrisiFajlAkoJeUStorage } = require("../lib/storage");
const { nalogHtml, zapisnikHtml, zapisnikZatecenoHtml, zapisnikZavrsenoHtml } = require("../lib/pdfHtml");
const { stavkeZaTipUsluge, izracunajSlaRok } = require("../lib/checklist");
const { upisiAudit } = require("../lib/audit");
const { obavestiOStatusuNaloga, obavestiOZakazivanju } = require("../lib/notifikacije");

const router = express.Router();
router.use(requireAuth);

const TIP_PRILOGA = [
  "foto_pre", "foto_posle", "potpis_klijenta", "potpis_servisa", "potpis_preuzeo", "video", "pdf_izvestaj",
];

const tehnicarSelect = { select: { id: true, ime: true, prezime: true, telefon: true } };

const nalogInclude = {
  klijent: true,
  oprema: true,
  kategorija: true,
  tipUsluge: true,
  dodeljeniTehnicar: tehnicarSelect,
};

const detaljInclude = {
  ...nalogInclude,
  kreirao: tehnicarSelect,
  istorijaStatusa: { orderBy: { promenjenoAt: "asc" } },
  prilozi: { orderBy: { uploadedAt: "desc" } },
  utroseniDelovi: { include: { deo: true } },
  usluge: { orderBy: { redosled: "asc" } },
  checklist: { orderBy: { redosled: "asc" } },
  racun: { select: { id: true, brojRacuna: true, status: true, ukupanIznos: true } },
};

const STATUSI = ["novo", "u_toku", "ceka_delove", "zavrseno", "otkazano"];

async function nalogFirme(id, firmaId) {
  const nalog = await prisma.radniNalog.findFirst({ where: { id, firmaId } });
  if (!nalog) throw new HttpError(404, "Nalog nije pronađen.");
  return nalog;
}

function filterZaUlogu(req, where) {
  if (req.user.uloga === "tehnicar") {
    where.dodeljeniTehnicarId = req.user.id;
  }
  return where;
}

async function filterKlijentPortal(req, where) {
  if (req.user.uloga === "klijent") {
    const ja = await prisma.korisnik.findUnique({ where: { id: req.user.id } });
    if (!ja?.klijentId) throw new HttpError(403, "Nalog nije vezan za klijenta.");
    where.klijentId = ja.klijentId;
  }
  return where;
}

// GET /api/nalozi
router.get("/", asyncHandler(async (req, res) => {
  const { kategorijaId, status, pretraga } = req.query;
  const where = filterZaUlogu(req, { firmaId: req.user.firmaId });
  await filterKlijentPortal(req, where);
  if (kategorijaId) where.kategorijaId = kategorijaId;
  if (status) where.status = status;
  if (pretraga) {
    where.OR = [
      { naslov: containsText(pretraga) },
      { brojNaloga: containsText(pretraga) },
      { klijent: { nazivIliIme: containsText(pretraga) } },
    ];
  }

  const nalozi = await prisma.radniNalog.findMany({
    where,
    include: nalogInclude,
    orderBy: { createdAt: "desc" },
  });
  res.json(nalozi);
}));

// POST /api/nalozi
router.post("/", asyncHandler(async (req, res) => {
  const {
    klijentId, opremaId, kategorijaId, tipUslugeId,
    naslov, opis, prioritet, lokacijaTip, adresaIntervencije,
    dodeljeniTehnicarId, zakazanoZa, slaRok, stanjeGoriva, kmPriPrijemu,
  } = req.body;

  if (!klijentId || !opremaId || !kategorijaId || !tipUslugeId || !naslov) {
    throw new HttpError(400, "Nedostaju obavezna polja.");
  }

  const firmaId = req.user.firmaId;
  const [klijent, opremaRec, kategorija, tipUsluge] = await Promise.all([
    prisma.klijent.findFirst({ where: { id: klijentId, firmaId } }),
    prisma.oprema.findFirst({ where: { id: opremaId, firmaId } }),
    prisma.kategorija.findUnique({ where: { id: kategorijaId } }),
    prisma.tipUsluge.findUnique({ where: { id: tipUslugeId } }),
  ]);
  if (!klijent) throw new HttpError(400, "Klijent nije pronađen.");
  if (!opremaRec) throw new HttpError(400, "Oprema nije pronađena.");
  if (!kategorija) throw new HttpError(400, "Kategorija nije pronađena.");
  if (!tipUsluge) throw new HttpError(400, "Tip usluge nije pronađen.");
  if (opremaRec.klijentId && opremaRec.klijentId !== klijentId) {
    throw new HttpError(400, "Oprema ne pripada izabranom klijentu.");
  }

  const tehnicarId = dodeljeniTehnicarId || (req.user.uloga === "tehnicar" ? req.user.id : null);
  if (tehnicarId) {
    const tehnicar = await prisma.korisnik.findFirst({
      where: { id: tehnicarId, firmaId, aktivan: true },
    });
    if (!tehnicar) throw new HttpError(400, "Tehničar nije pronađen.");
  }

  const prioritetVal = prioritet || "normalan";
  let sla =
    slaRok ? new Date(slaRok) : izracunajSlaRok(prioritetVal);

  const ugovor = await prisma.ugovor.findFirst({
    where: {
      firmaId,
      klijentId,
      aktivan: true,
      OR: [{ kraj: null }, { kraj: { gte: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
  });
  if (!slaRok && ugovor?.slaReakcijaSati) {
    sla = new Date(Date.now() + ugovor.slaReakcijaSati * 3600 * 1000);
  }

  const checklistStavke = stavkeZaTipUsluge(tipUsluge.naziv);

  const nalog = await prisma.$transaction(async (tx) => {
    const brojNaloga = await sledeciBrojNaloga(tx, firmaId);
    return tx.radniNalog.create({
      data: {
        brojNaloga,
        firmaId,
        klijentId,
        opremaId,
        kategorijaId,
        tipUslugeId,
        naslov: String(naslov).trim(),
        opis: opis ? String(opis).trim() : null,
        prioritet: prioritetVal,
        lokacijaTip: lokacijaTip || "radionica",
        adresaIntervencije: adresaIntervencije ? String(adresaIntervencije).trim() : null,
        dodeljeniTehnicarId: tehnicarId,
        kreiraoId: req.user.id,
        zakazanoZa: zakazanoZa ? new Date(zakazanoZa) : null,
        slaRok: Number.isNaN(sla.getTime()) ? izracunajSlaRok(prioritetVal) : sla,
        stanjeGoriva: stanjeGoriva ? String(stanjeGoriva).trim() : null,
        kmPriPrijemu: kmPriPrijemu != null && kmPriPrijemu !== "" ? parseInt(kmPriPrijemu, 10) : null,
        status: "novo",
        istorijaStatusa: {
          create: { noviStatus: "novo", promenioId: req.user.id },
        },
        checklist: {
          create: checklistStavke,
        },
      },
      include: { ...nalogInclude, checklist: { orderBy: { redosled: "asc" } }, usluge: true },
    });
  });

  if (nalog.kmPriPrijemu != null) {
    await prisma.oprema.update({
      where: { id: nalog.opremaId },
      data: { kilometraza: nalog.kmPriPrijemu },
    }).catch(() => {});
  }
  await upisiAudit({
    firmaId: req.user.firmaId,
    korisnikId: req.user.id,
    akcija: "kreiranje",
    entitet: "nalog",
    entitetId: nalog.id,
    detalj: nalog.brojNaloga,
  });

  res.status(201).json(nalog);
}));

// PATCH /api/nalozi/:id/status
router.patch("/:id/status", asyncHandler(async (req, res) => {
  const { noviStatus } = req.body;
  if (!STATUSI.includes(noviStatus)) {
    throw new HttpError(400, "Nepoznat status.");
  }

  const postojeci = await nalogFirme(req.params.id, req.user.firmaId);
  if (req.user.uloga === "tehnicar" && postojeci.dodeljeniTehnicarId !== req.user.id) {
    throw new HttpError(403, "Ovaj nalog nije dodeljen vama.");
  }

  const forsiraj = req.body.forsiraj === true || req.body.forsira === true;
  if (
    !forsiraj &&
    (noviStatus === "u_toku" || noviStatus === "ceka_delove") &&
    !postojeci.zapZatecenoAt
  ) {
    throw new HttpError(
      400,
      "Prvo sačuvajte zapisnik o zatečenom stanju (korak 1), pa tek onda pređite na rad."
    );
  }
  if (!forsiraj && noviStatus === "zavrseno" && !postojeci.zapZavrsenoZapAt) {
    throw new HttpError(
      400,
      "Prvo sačuvajte zapisnik o završenom poslu (korak 3), pa tek onda zatvorite nalog."
    );
  }

  const data = {
    status: noviStatus,
    zavrsenoAt: noviStatus === "zavrseno" ? new Date() : postojeci.zavrsenoAt,
    istorijaStatusa: {
      create: {
        stariStatus: postojeci.status,
        noviStatus,
        promenioId: req.user.id,
      },
    },
  };
  if ((noviStatus === "u_toku" || noviStatus === "ceka_delove") && !postojeci.zapocetoAt) {
    data.zapocetoAt = new Date();
  }

  const nalog = await prisma.radniNalog.update({
    where: { id: postojeci.id },
    data,
    include: nalogInclude,
  });

  await upisiAudit({
    firmaId: req.user.firmaId,
    korisnikId: req.user.id,
    akcija: "status",
    entitet: "nalog",
    entitetId: nalog.id,
    detalj: `${postojeci.status} → ${noviStatus}`,
  });

  try {
    await obavestiOStatusuNaloga(nalog, noviStatus);
  } catch (e) {
    console.error("notifikacija status:", e.message);
  }

  res.json(nalog);
}));

// POST /api/nalozi/:id/geo — GPS lokacija sa terena
router.post("/:id/geo", asyncHandler(async (req, res) => {
  const lat = Number(req.body.lat);
  const lng = Number(req.body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new HttpError(400, "lat i lng su obavezni.");
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new HttpError(400, "Neispravne koordinate.");
  }

  const postojeci = await nalogFirme(req.params.id, req.user.firmaId);
  if (req.user.uloga === "tehnicar" && postojeci.dodeljeniTehnicarId !== req.user.id) {
    throw new HttpError(403, "Ovaj nalog nije dodeljen vama.");
  }

  const nalog = await prisma.radniNalog.update({
    where: { id: postojeci.id },
    data: { geoLat: lat, geoLng: lng, geoAt: new Date() },
    include: nalogInclude,
  });

  await upisiAudit({
    firmaId: req.user.firmaId,
    korisnikId: req.user.id,
    akcija: "geo",
    entitet: "nalog",
    entitetId: nalog.id,
    detalj: `${lat.toFixed(5)},${lng.toFixed(5)}`,
  });

  res.json(nalog);
}));

// POST /api/nalozi/:id/delovi — utrošak dela sa skidanjem zalihe
router.post("/:id/delovi", asyncHandler(async (req, res) => {
  const { deoId, kolicina, magacinId } = req.body;
  const kol = parseInt(kolicina, 10);
  if (!deoId || !Number.isFinite(kol) || kol < 1) {
    throw new HttpError(400, "Deo i količina (najmanje 1) su obavezni.");
  }

  const rezultat = await prisma.$transaction(async (tx) => {
    const nalog = await tx.radniNalog.findFirst({
      where: { id: req.params.id, firmaId: req.user.firmaId },
    });
    if (!nalog) throw new HttpError(404, "Nalog nije pronađen.");
    if (nalog.status === "zavrseno" || nalog.status === "otkazano") {
      throw new HttpError(400, "Nalog je zatvoren — delovi se ne mogu dodati.");
    }
    if (req.user.uloga === "tehnicar" && nalog.dodeljeniTehnicarId !== req.user.id) {
      throw new HttpError(403, "Ovaj nalog nije dodeljen vama.");
    }

    const deo = await tx.deo.findFirst({ where: { id: deoId, firmaId: req.user.firmaId } });
    if (!deo) throw new HttpError(400, "Deo nije pronađen.");

    let magacin;
    try {
      magacin = await magacinZaUtrošak(tx, {
        firmaId: req.user.firmaId,
        magacinId: magacinId || null,
        tehnicarId: nalog.dodeljeniTehnicarId || req.user.id,
      });
    } catch (e) {
      throw new HttpError(e.status || 400, e.message);
    }

    const stanje = await tx.stanjeZaliha.findUnique({
      where: { deoId_magacinId: { deoId, magacinId: magacin.id } },
    });
    if (!stanje || stanje.kolicina < kol) {
      throw new HttpError(400, `Nema dovoljno na magacinu „${magacin.naziv}”.`);
    }

    await tx.stanjeZaliha.update({
      where: { id: stanje.id },
      data: { kolicina: stanje.kolicina - kol },
    });

    return tx.nalogUtroseniDeo.create({
      data: {
        nalogId: nalog.id,
        deoId,
        magacinId: magacin.id,
        kolicina: kol,
        cenaPoKomadu: deo.prodajnaCena || 0,
      },
      include: { deo: true },
    });
  });

  res.status(201).json(rezultat);
}));

// DELETE /api/nalozi/:id/delovi/:utrosakId — vrati na stanje
router.delete("/:id/delovi/:utrosakId", asyncHandler(async (req, res) => {
  await prisma.$transaction(async (tx) => {
    const nalog = await tx.radniNalog.findFirst({
      where: { id: req.params.id, firmaId: req.user.firmaId },
    });
    if (!nalog) throw new HttpError(404, "Nalog nije pronađen.");
    if (nalog.status === "zavrseno" || nalog.status === "otkazano") {
      throw new HttpError(400, "Nalog je zatvoren.");
    }

    const utrosak = await tx.nalogUtroseniDeo.findFirst({
      where: { id: req.params.utrosakId, nalogId: nalog.id },
    });
    if (!utrosak) throw new HttpError(404, "Stavka nije pronađena.");

    let magacinId = utrosak.magacinId;
    if (!magacinId) {
      const m = await centralniMagacin(tx, req.user.firmaId);
      magacinId = m.id;
    }
    await tx.stanjeZaliha.upsert({
      where: { deoId_magacinId: { deoId: utrosak.deoId, magacinId } },
      update: { kolicina: { increment: utrosak.kolicina } },
      create: { deoId: utrosak.deoId, magacinId, kolicina: utrosak.kolicina },
    });
    await tx.nalogUtroseniDeo.delete({ where: { id: utrosak.id } });
  });

  res.json({ ok: true });
}));

// PATCH /api/nalozi/:id
router.patch("/:id", asyncHandler(async (req, res) => {
  const postojeci = await nalogFirme(req.params.id, req.user.firmaId);
  if (req.user.uloga === "tehnicar" && postojeci.dodeljeniTehnicarId !== req.user.id) {
    throw new HttpError(403, "Ovaj nalog nije dodeljen vama.");
  }

  const {
    naslov, opis, prioritet, lokacijaTip, adresaIntervencije,
    dodeljeniTehnicarId, zakazanoZa, slaRok, stanjeGoriva, kmPriPrijemu,
    zapMesto, zapRadnoVreme, zapVremeDolaska, zapKmDolaska,
    zapVremeOdlaska, zapKmOdlaska, zapStanjeProizvoda, zapGarancija, zapJosPotrebno,
    zapStanjeZateceno, zapOpisZateceno, potvrdiZateceno, potvrdiZavrsenoZap,
  } = req.body;

  const data = {};
  if (naslov !== undefined) data.naslov = String(naslov).trim();
  if (opis !== undefined) data.opis = opis ? String(opis).trim() : null;
  if (prioritet !== undefined) data.prioritet = prioritet;
  if (lokacijaTip !== undefined) data.lokacijaTip = lokacijaTip;
  if (adresaIntervencije !== undefined) {
    data.adresaIntervencije = adresaIntervencije ? String(adresaIntervencije).trim() : null;
  }
  if (zakazanoZa !== undefined) {
    data.zakazanoZa = zakazanoZa ? new Date(zakazanoZa) : null;
  }
  if (slaRok !== undefined) {
    data.slaRok = slaRok ? new Date(slaRok) : null;
  }
  if (stanjeGoriva !== undefined) {
    data.stanjeGoriva = stanjeGoriva ? String(stanjeGoriva).trim() : null;
  }
  if (kmPriPrijemu !== undefined) {
    data.kmPriPrijemu = kmPriPrijemu === "" || kmPriPrijemu == null
      ? null
      : parseInt(kmPriPrijemu, 10);
  }
  if (zapMesto !== undefined) data.zapMesto = zapMesto ? String(zapMesto).trim() : null;
  if (zapRadnoVreme !== undefined) data.zapRadnoVreme = zapRadnoVreme ? String(zapRadnoVreme).trim() : null;
  if (zapVremeDolaska !== undefined) data.zapVremeDolaska = zapVremeDolaska ? String(zapVremeDolaska).trim() : null;
  if (zapVremeOdlaska !== undefined) data.zapVremeOdlaska = zapVremeOdlaska ? String(zapVremeOdlaska).trim() : null;
  if (zapJosPotrebno !== undefined) data.zapJosPotrebno = zapJosPotrebno ? String(zapJosPotrebno).trim() : null;
  if (zapKmDolaska !== undefined) {
    data.zapKmDolaska = zapKmDolaska === "" || zapKmDolaska == null ? null : parseInt(zapKmDolaska, 10);
  }
  if (zapKmOdlaska !== undefined) {
    data.zapKmOdlaska = zapKmOdlaska === "" || zapKmOdlaska == null ? null : parseInt(zapKmOdlaska, 10);
  }
  if (zapStanjeProizvoda !== undefined) {
    data.zapStanjeProizvoda = ["ispravan", "neispravan"].includes(zapStanjeProizvoda)
      ? zapStanjeProizvoda
      : null;
  }
  if (zapStanjeZateceno !== undefined) {
    data.zapStanjeZateceno = ["ispravan", "neispravan"].includes(zapStanjeZateceno)
      ? zapStanjeZateceno
      : null;
  }
  if (zapOpisZateceno !== undefined) {
    data.zapOpisZateceno = zapOpisZateceno ? String(zapOpisZateceno).trim() : null;
  }
  if (zapGarancija !== undefined) {
    data.zapGarancija = ["garantni", "vangaranti"].includes(zapGarancija) ? zapGarancija : null;
  }
  if (potvrdiZateceno === true) data.zapZatecenoAt = new Date();
  if (potvrdiZavrsenoZap === true) data.zapZavrsenoZapAt = new Date();
  if (dodeljeniTehnicarId !== undefined) {
    if (req.user.uloga === "tehnicar") {
      throw new HttpError(403, "Tehničar ne može da preusmeri nalog.");
    }
    if (dodeljeniTehnicarId) {
      const tehnicar = await prisma.korisnik.findFirst({
        where: { id: dodeljeniTehnicarId, firmaId: req.user.firmaId, aktivan: true },
      });
      if (!tehnicar) throw new HttpError(400, "Tehničar nije pronađen.");
      data.dodeljeniTehnicarId = dodeljeniTehnicarId;
    } else {
      data.dodeljeniTehnicarId = null;
    }
  }

  const nalog = await prisma.radniNalog.update({
    where: { id: postojeci.id },
    data,
    include: nalogInclude,
  });

  if (data.kmPriPrijemu != null) {
    await prisma.oprema.update({
      where: { id: nalog.opremaId },
      data: { kilometraza: data.kmPriPrijemu },
    }).catch(() => {});
  }

  if (data.zakazanoZa) {
    try {
      await obavestiOZakazivanju(nalog);
    } catch (e) {
      console.error("notifikacija zakazivanje:", e.message);
    }
  }

  await upisiAudit({
    firmaId: req.user.firmaId,
    korisnikId: req.user.id,
    akcija: "izmena",
    entitet: "nalog",
    entitetId: nalog.id,
    detalj: Object.keys(data).join(", "),
  });

  res.json(nalog);
}));

// POST /api/nalozi/:id/usluge
router.post("/:id/usluge", asyncHandler(async (req, res) => {
  const { opis, kolicina, cena } = req.body;
  if (!opis || cena == null) throw new HttpError(400, "Opis i cena usluge su obavezni.");
  const nalog = await prisma.radniNalog.findFirst({
    where: filterZaUlogu(req, { id: req.params.id, firmaId: req.user.firmaId }),
  });
  if (!nalog) throw new HttpError(404, "Nalog nije pronađen.");
  if (nalog.status === "zavrseno" || nalog.status === "otkazano") {
    throw new HttpError(400, "Nalog je zatvoren.");
  }
  const maxRed = await prisma.nalogUsluga.aggregate({
    where: { nalogId: nalog.id },
    _max: { redosled: true },
  });
  const usluga = await prisma.nalogUsluga.create({
    data: {
      nalogId: nalog.id,
      opis: String(opis).trim(),
      kolicina: Number(kolicina || 1),
      cena: Number(cena),
      redosled: (maxRed._max.redosled || 0) + 1,
    },
  });
  res.status(201).json(usluga);
}));

router.delete("/:id/usluge/:uslugaId", asyncHandler(async (req, res) => {
  const nalog = await prisma.radniNalog.findFirst({
    where: filterZaUlogu(req, { id: req.params.id, firmaId: req.user.firmaId }),
  });
  if (!nalog) throw new HttpError(404, "Nalog nije pronađen.");
  if (nalog.status === "zavrseno" || nalog.status === "otkazano") {
    throw new HttpError(400, "Nalog je zatvoren.");
  }
  const usluga = await prisma.nalogUsluga.findFirst({
    where: { id: req.params.uslugaId, nalogId: nalog.id },
  });
  if (!usluga) throw new HttpError(404, "Usluga nije pronađena.");
  await prisma.nalogUsluga.delete({ where: { id: usluga.id } });
  res.json({ ok: true });
}));

// PATCH /api/nalozi/:id/checklist/:stavkaId
router.patch("/:id/checklist/:stavkaId", asyncHandler(async (req, res) => {
  const nalog = await prisma.radniNalog.findFirst({
    where: filterZaUlogu(req, { id: req.params.id, firmaId: req.user.firmaId }),
  });
  if (!nalog) throw new HttpError(404, "Nalog nije pronađen.");
  if (nalog.status === "zavrseno" || nalog.status === "otkazano") {
    throw new HttpError(400, "Nalog je zatvoren.");
  }

  const stavka = await prisma.nalogChecklistStavka.findFirst({
    where: { id: req.params.stavkaId, nalogId: nalog.id },
  });
  if (!stavka) throw new HttpError(404, "Stavka nije pronađena.");

  const zavrseno = req.body.zavrseno === true || req.body.zavrseno === false
    ? req.body.zavrseno
    : !stavka.zavrseno;

  const azurirana = await prisma.nalogChecklistStavka.update({
    where: { id: stavka.id },
    data: {
      zavrseno,
      zavrsenoAt: zavrseno ? new Date() : null,
    },
  });
  res.json(azurirana);
}));

// POST /api/nalozi/:id/prilozi — foto pre/posle ili potpis (data URL)
router.post("/:id/prilozi", asyncHandler(async (req, res) => {
  const { tip, dataUrl } = req.body;
  if (!TIP_PRILOGA.includes(tip)) {
    throw new HttpError(400, "Nepoznat tip priloga.");
  }
  if (!dataUrl) throw new HttpError(400, "Nedostaje fajl.");

  const nalog = await prisma.radniNalog.findFirst({
    where: filterZaUlogu(req, { id: req.params.id, firmaId: req.user.firmaId }),
  });
  if (!nalog) throw new HttpError(404, "Nalog nije pronađen.");
  if (nalog.status === "otkazano") {
    throw new HttpError(400, "Na otkazanom nalogu se ne mogu dodavati prilozi.");
  }

  // Jedan potpis po tipu — novi zamenjuje stari
  if (["potpis_klijenta", "potpis_servisa", "potpis_preuzeo"].includes(tip)) {
    const stari = await prisma.nalogPrilog.findMany({
      where: { nalogId: nalog.id, tip },
    });
    for (const s of stari) {
      await obrisiFajlAkoJeUStorage(s.fajlUrl);
      await prisma.nalogPrilog.delete({ where: { id: s.id } });
    }
  }

  const { fajlUrl } = await uploadPrilog({
    firmaId: req.user.firmaId,
    nalogId: nalog.id,
    tip,
    dataUrl,
  });

  const prilog = await prisma.nalogPrilog.create({
    data: {
      nalogId: nalog.id,
      tip,
      fajlUrl,
      uploadedBy: req.user.id,
    },
  });

  res.status(201).json(prilog);
}));

// DELETE /api/nalozi/:id/prilozi/:prilogId
router.delete("/:id/prilozi/:prilogId", asyncHandler(async (req, res) => {
  const nalog = await prisma.radniNalog.findFirst({
    where: filterZaUlogu(req, { id: req.params.id, firmaId: req.user.firmaId }),
  });
  if (!nalog) throw new HttpError(404, "Nalog nije pronađen.");

  const prilog = await prisma.nalogPrilog.findFirst({
    where: { id: req.params.prilogId, nalogId: nalog.id },
  });
  if (!prilog) throw new HttpError(404, "Prilog nije pronađen.");

  await obrisiFajlAkoJeUStorage(prilog.fajlUrl);
  await prisma.nalogPrilog.delete({ where: { id: prilog.id } });
  res.json({ ok: true });
}));

// GET /api/nalozi/:id/pdf — HTML za stampu / PDF
router.get("/:id/pdf", asyncHandler(async (req, res) => {
  const nalog = await prisma.radniNalog.findFirst({
    where: filterZaUlogu(req, { id: req.params.id, firmaId: req.user.firmaId }),
    include: {
      ...nalogInclude,
      firma: { select: { naziv: true, pib: true, adresa: true } },
      kreirao: tehnicarSelect,
      prilozi: true,
      utroseniDelovi: { include: { deo: true } },
      usluge: { orderBy: { redosled: "asc" } },
    },
  });
  if (!nalog) throw new HttpError(404, "Nalog nije pronađen.");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(nalogHtml(nalog, nalog.firma));
}));

async function ucitajNalogZaZapisnik(req) {
  const nalog = await prisma.radniNalog.findFirst({
    where: filterZaUlogu(req, { id: req.params.id, firmaId: req.user.firmaId }),
    include: {
      ...nalogInclude,
      firma: { select: { naziv: true, pib: true, adresa: true } },
      prilozi: true,
      utroseniDelovi: { include: { deo: true } },
      usluge: { orderBy: { redosled: "asc" } },
    },
  });
  if (!nalog) throw new HttpError(404, "Nalog nije pronađen.");
  return nalog;
}

// GET /api/nalozi/:id/zapisnik/zateceno — korak 1
router.get("/:id/zapisnik/zateceno", asyncHandler(async (req, res) => {
  const nalog = await ucitajNalogZaZapisnik(req);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(zapisnikZatecenoHtml(nalog, nalog.firma));
}));

// GET /api/nalozi/:id/zapisnik/zavrseno — korak 3
router.get("/:id/zapisnik/zavrseno", asyncHandler(async (req, res) => {
  const nalog = await ucitajNalogZaZapisnik(req);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(zapisnikZavrsenoHtml(nalog, nalog.firma));
}));

// GET /api/nalozi/:id/zapisnik — alias za završeni (kompatibilnost)
router.get("/:id/zapisnik", asyncHandler(async (req, res) => {
  const nalog = await ucitajNalogZaZapisnik(req);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(zapisnikHtml(nalog, nalog.firma));
}));

// GET /api/nalozi/:id
router.get("/:id", asyncHandler(async (req, res) => {
  const nalog = await prisma.radniNalog.findFirst({
    where: filterZaUlogu(req, { id: req.params.id, firmaId: req.user.firmaId }),
    include: detaljInclude,
  });
  if (!nalog) throw new HttpError(404, "Nalog nije pronađen.");
  res.json(nalog);
}));

module.exports = router;
