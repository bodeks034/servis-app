const prisma = require("./prisma");

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** In-app podsetnici: zakazano danas/sutra, SLA, niska zaliha, neplaćeni računi */
async function izracunajPodsetnike(firmaId, uloga, userId) {
  const danasOd = startOfDay();
  const danasDo = endOfDay();
  const sutraDo = endOfDay(addDays(new Date(), 1));
  const nalogFilter = { firmaId, status: { notIn: ["zavrseno", "otkazano"] } };
  if (uloga === "tehnicar") nalogFilter.dodeljeniTehnicarId = userId;

  const [zakazano, sla, niskiDelovi, neplaceni] = await Promise.all([
    prisma.radniNalog.findMany({
      where: {
        ...nalogFilter,
        zakazanoZa: { gte: danasOd, lte: sutraDo },
      },
      select: {
        id: true, brojNaloga: true, naslov: true, zakazanoZa: true, prioritet: true,
        klijent: { select: { nazivIliIme: true } },
      },
      orderBy: { zakazanoZa: "asc" },
      take: 30,
    }),
    prisma.radniNalog.findMany({
      where: {
        ...nalogFilter,
        slaRok: { lte: danasDo },
      },
      select: {
        id: true, brojNaloga: true, naslov: true, slaRok: true, prioritet: true,
        klijent: { select: { nazivIliIme: true } },
      },
      orderBy: { slaRok: "asc" },
      take: 20,
    }),
    uloga === "tehnicar"
      ? Promise.resolve([])
      : prisma.deo.findMany({
          where: { firmaId },
          include: { stanjeZaliha: true },
        }).then((delovi) =>
          delovi
            .map((d) => ({
              id: d.id,
              sifra: d.sifra,
              naziv: d.naziv,
              minZaliha: d.minZaliha,
              ukupnoNaStanju: d.stanjeZaliha.reduce((s, x) => s + x.kolicina, 0),
            }))
            .filter((d) => d.ukupnoNaStanju < d.minZaliha)
            .slice(0, 20)
        ),
    uloga === "tehnicar"
      ? Promise.resolve([])
      : prisma.racun.findMany({
          where: {
            firmaId,
            status: { not: "placen" },
            rokPlacanja: { lte: danasDo },
          },
          select: {
            id: true, brojRacuna: true, ukupanIznos: true, rokPlacanja: true, status: true,
            klijent: { select: { nazivIliIme: true } },
          },
          take: 20,
        }),
  ]);

  const stavke = [];
  for (const n of zakazano) {
    const danas = n.zakazanoZa >= danasOd && n.zakazanoZa <= danasDo;
    stavke.push({
      tip: danas ? "zakazano_danas" : "zakazano_sutra",
      prioritet: n.prioritet === "kritican" ? "visok" : "srednji",
      naslov: `${n.brojNaloga} · ${n.naslov}`,
      tekst: `${n.klijent?.nazivIliIme || "—"} · ${new Date(n.zakazanoZa).toLocaleString("sr-RS")}`,
      nalogId: n.id,
    });
  }
  for (const n of sla) {
    stavke.push({
      tip: "sla_istekao",
      prioritet: "visok",
      naslov: `SLA · ${n.brojNaloga}`,
      tekst: n.naslov,
      nalogId: n.id,
    });
  }
  for (const d of niskiDelovi) {
    stavke.push({
      tip: "niska_zaliha",
      prioritet: "srednji",
      naslov: `${d.sifra} · ${d.naziv}`,
      tekst: `Na stanju ${d.ukupnoNaStanju} (min ${d.minZaliha})`,
      deoId: d.id,
    });
  }
  for (const r of neplaceni) {
    stavke.push({
      tip: "racun_dospeo",
      prioritet: "srednji",
      naslov: r.brojRacuna,
      tekst: `${r.klijent?.nazivIliIme || "—"} · ${Number(r.ukupanIznos).toFixed(2)} RSD`,
      racunId: r.id,
    });
  }

  if (uloga !== "tehnicar" && uloga !== "klijent") {
    const planovi = await prisma.preventivniPlan.findMany({
      where: { firmaId, aktivan: true },
      include: { oprema: { include: { klijent: true } } },
      take: 40,
    });
    const sada = new Date();
    for (const p of planovi) {
      let dospeo = false;
      if (p.tipOkidaca === "vreme" && p.sledeciRokAt && new Date(p.sledeciRokAt) <= sada) {
        dospeo = true;
      }
      if (
        p.tipOkidaca === "kilometri" &&
        p.intervalKm != null &&
        p.oprema.kilometraza != null
      ) {
        const baza = p.poslednjiKm != null ? p.poslednjiKm : 0;
        dospeo = p.oprema.kilometraza >= baza + p.intervalKm;
      }
      if (
        p.tipOkidaca === "sati" &&
        p.intervalSati != null &&
        p.oprema.satnice != null
      ) {
        const baza = p.poslednjiSati != null ? Number(p.poslednjiSati) : 0;
        dospeo = Number(p.oprema.satnice) >= baza + Number(p.intervalSati);
      }
      if (dospeo) {
        stavke.push({
          tip: "preventiva",
          prioritet: "srednji",
          naslov: `Preventiva · ${p.oprema.naziv}`,
          tekst: `${p.naziv} · ${p.oprema.klijent?.nazivIliIme || ""}`,
          opremaId: p.opremaId,
          planId: p.id,
        });
      }
    }
  }

  return { broj: stavke.length, stavke };
}

module.exports = { izracunajPodsetnike, startOfDay, endOfDay, addDays };
