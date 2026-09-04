/**
 * Demo podaci za poslednju registrovanu firmu:
 * 2 klijenta × sve kategorije (oprema + nalozi) + magacin + 1 račun.
 *
 * Pokretanje: node prisma/demo-podaci.js
 */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { sledeciBrojNaloga, sledeciBrojRacuna } = require("../src/lib/brojevi");
const { centralniMagacin } = require("../src/lib/magacin");

const prisma = new PrismaClient();

const MARKER = "[DEMO]";

async function main() {
  const admin = await prisma.korisnik.findFirst({
    where: { uloga: "admin", aktivan: true },
    orderBy: { createdAt: "desc" },
    include: { firma: true },
  });
  if (!admin) throw new Error("Nema registrovane firme/admina. Prvo se prijavi u app.");

  const firmaId = admin.firmaId;
  console.log(`Firma: ${admin.firma.naziv} (${firmaId})`);

  // Obriši prethodni demo za istu firmu (idempotentno)
  const stariKlijenti = await prisma.klijent.findMany({
    where: { firmaId, napomena: { contains: MARKER } },
    select: { id: true },
  });
  if (stariKlijenti.length) {
    const ids = stariKlijenti.map((k) => k.id);
    const nalozi = await prisma.radniNalog.findMany({
      where: { firmaId, klijentId: { in: ids } },
      select: { id: true },
    });
    const nalogIds = nalozi.map((n) => n.id);
    if (nalogIds.length) {
      await prisma.racunStavka.deleteMany({ where: { racun: { nalogId: { in: nalogIds } } } });
      await prisma.racun.deleteMany({ where: { nalogId: { in: nalogIds } } });
      await prisma.nalogUtroseniDeo.deleteMany({ where: { nalogId: { in: nalogIds } } });
      await prisma.nalogPrilog.deleteMany({ where: { nalogId: { in: nalogIds } } });
      await prisma.nalogIstorijaStatusa.deleteMany({ where: { nalogId: { in: nalogIds } } });
      await prisma.radniNalog.deleteMany({ where: { id: { in: nalogIds } } });
    }
    await prisma.oprema.deleteMany({ where: { firmaId, klijentId: { in: ids } } });
    await prisma.klijent.deleteMany({ where: { id: { in: ids } } });
    console.log("Obrisan stari demo.");
  }

  let kategorije = await prisma.kategorija.findMany();
  let tipovi = await prisma.tipUsluge.findMany();
  if (!kategorije.length || !tipovi.length) {
    require("child_process").execSync("node prisma/seed.js", { stdio: "inherit", cwd: __dirname + "/.." });
    kategorije = await prisma.kategorija.findMany();
    tipovi = await prisma.tipUsluge.findMany();
  }

  const kat = Object.fromEntries(kategorije.map((k) => [k.naziv, k]));
  const tipServis = tipovi.find((t) => t.naziv.includes("Servis")) || tipovi[0];
  const tipMontaza = tipovi.find((t) => t.naziv.includes("Montaža")) || tipovi[0];
  const tipDijag = tipovi.find((t) => t.naziv.includes("Dijagnostika")) || tipovi[0];
  const tipOdrz = tipovi.find((t) => t.naziv.includes("održavanje")) || tipovi[0];

  const klijentA = await prisma.klijent.create({
    data: {
      firmaId,
      tip: "pravno_lice",
      nazivIliIme: "Auto Centar Novi Sad d.o.o.",
      pibIliJmbg: "100123456",
      telefon: "021/555-010",
      email: "servis@autocentar-ns.rs",
      adresa: "Industrijska 12, Novi Sad",
      napomena: `${MARKER} pravno lice — demo`,
    },
  });

  const klijentB = await prisma.klijent.create({
    data: {
      firmaId,
      tip: "fizicko_lice",
      nazivIliIme: "Marko Petrović",
      pibIliJmbg: "0101985800021",
      telefon: "064/123-4567",
      email: "marko.petrovic@email.rs",
      adresa: "Bulevar Oslobođenja 45, Novi Sad",
      napomena: `${MARKER} fizičko lice — demo`,
    },
  });

  const opremaDef = [
    {
      kategorija: "Vozila",
      a: {
        naziv: "VW Passat B8",
        proizvodjac: "Volkswagen",
        model: "Passat 2.0 TDI",
        serijskiBroj: "VW-P-2019-001",
        vin: "WVWZZZ3CZKE123456",
        registracija: "NS-123-AB",
        kilometraza: 148500,
        boja: "Siva metalik",
        lokacija: "Parking firme",
      },
      b: {
        naziv: "Škoda Octavia",
        proizvodjac: "Škoda",
        model: "Octavia 1.6 TDI",
        serijskiBroj: "SK-O-2017-002",
        vin: "TMBJJ7NE5H0123456",
        registracija: "NS-456-CD",
        kilometraza: 192000,
        boja: "Bela",
        lokacija: "Kućna adresa",
      },
      nalogA: { naslov: "Zamena kočionih pločica", tip: tipServis, status: "u_toku", prioritet: "normalan", lokacijaTip: "radionica" },
      nalogB: { naslov: "Dijagnostika check engine", tip: tipDijag, status: "novo", prioritet: "hitno", lokacijaTip: "teren" },
    },
    {
      kategorija: "Nameštaj",
      a: {
        naziv: "Kancelarijski sto L-oblik",
        proizvodjac: "IKEA",
        model: "BEKANT",
        serijskiBroj: "NM-ST-001",
        boja: "Hrast",
        lokacija: "Kancelarija 2",
      },
      b: {
        naziv: "Kuhinjski ormarić",
        proizvodjac: "Jysk",
        model: "BILLY+",
        serijskiBroj: "NM-OR-002",
        boja: "Bela",
        lokacija: "Stan",
      },
      nalogA: { naslov: "Montaža i nivelisanje stola", tip: tipMontaza, status: "zavrseno", prioritet: "normalan", lokacijaTip: "teren" },
      nalogB: { naslov: "Popravka šarki ormarića", tip: tipServis, status: "novo", prioritet: "normalan", lokacijaTip: "teren" },
    },
    {
      kategorija: "Bela tehnika",
      a: {
        naziv: "Mašina za pranje veša",
        proizvodjac: "Bosch",
        model: "WAN28262BY",
        serijskiBroj: "BT-WP-001",
        lokacija: "Restoran — pomoćna prostorija",
      },
      b: {
        naziv: "Frižider",
        proizvodjac: "Gorenje",
        model: "NRK6202AXL4",
        serijskiBroj: "BT-FR-002",
        lokacija: "Kuhinja",
      },
      nalogA: { naslov: "Ne odvodi vodu — pumpa", tip: tipServis, status: "ceka_delove", prioritet: "hitno", lokacijaTip: "teren" },
      nalogB: { naslov: "Redovno održavanje / čišćenje", tip: tipOdrz, status: "novo", prioritet: "normalan", lokacijaTip: "teren" },
    },
    {
      kategorija: "Mašine i alati",
      a: {
        naziv: "Kompresor 50L",
        proizvodjac: "Metabo",
        model: "Basic 250-50 W",
        serijskiBroj: "MA-KO-001",
        satnice: 420,
        snagaKw: 1.5,
        lokacija: "Radionica",
      },
      b: {
        naziv: "Ugaona brusilica",
        proizvodjac: "Bosch",
        model: "GWS 750-125",
        serijskiBroj: "MA-UB-002",
        satnice: 85,
        snagaKw: 0.75,
        lokacija: "Alatnica",
      },
      nalogA: { naslov: "Zamena filtera i ulja", tip: tipOdrz, status: "u_toku", prioritet: "normalan", lokacijaTip: "radionica" },
      nalogB: { naslov: "Zamena ugljenih četkica", tip: tipServis, status: "novo", prioritet: "normalan", lokacijaTip: "radionica" },
    },
    {
      kategorija: "Poljoprivredna oprema",
      a: {
        naziv: "Traktor MTZ 82",
        proizvodjac: "Belarus",
        model: "MTZ-82.1",
        serijskiBroj: "PO-TR-001",
        satnice: 6850,
        snagaKw: 60,
        lokacija: "Gazdinstvo — hangar",
      },
      b: {
        naziv: "Kosilica rotaciona",
        proizvodjac: "SIP",
        model: "Roto 165",
        serijskiBroj: "PO-KO-002",
        satnice: 310,
        snagaKw: 12,
        lokacija: "Dvorište",
      },
      nalogA: { naslov: "Servis hidraulike i filtera", tip: tipServis, status: "novo", prioritet: "kritican", lokacijaTip: "teren" },
      nalogB: { naslov: "Oštrenje noževa", tip: tipOdrz, status: "zavrseno", prioritet: "normalan", lokacijaTip: "radionica" },
    },
  ];

  const sada = new Date();
  const zaDane = (d) => new Date(sada.getTime() + d * 86400000);

  let zavrsenZaRacun = null;

  for (const def of opremaDef) {
    const kategorijaId = kat[def.kategorija]?.id;
    if (!kategorijaId) {
      console.warn(`Preskačem — nema kategorije: ${def.kategorija}`);
      continue;
    }

    const opA = await prisma.oprema.create({
      data: {
        firmaId,
        klijentId: klijentA.id,
        kategorijaId,
        status: "ispravno",
        datumKupovine: zaDane(-800),
        garancijaDo: zaDane(200),
        ...def.a,
      },
    });
    const opB = await prisma.oprema.create({
      data: {
        firmaId,
        klijentId: klijentB.id,
        kategorijaId,
        status: def.kategorija === "Bela tehnika" ? "zakazan_servis" : "ispravno",
        datumKupovine: zaDane(-400),
        garancijaDo: zaDane(100),
        ...def.b,
      },
    });

    const nalogA = await prisma.$transaction(async (tx) => {
      const brojNaloga = await sledeciBrojNaloga(tx, firmaId);
      return tx.radniNalog.create({
        data: {
          brojNaloga,
          firmaId,
          klijentId: klijentA.id,
          opremaId: opA.id,
          kategorijaId,
          tipUslugeId: def.nalogA.tip.id,
          naslov: def.nalogA.naslov,
          opis: `${MARKER} Demo nalog — ${def.kategorija}`,
          prioritet: def.nalogA.prioritet,
          status: def.nalogA.status,
          lokacijaTip: def.nalogA.lokacijaTip,
          adresaIntervencije: klijentA.adresa,
          kreiraoId: admin.id,
          dodeljeniTehnicarId: admin.id,
          zakazanoZa: zaDane(1),
          zavrsenoAt: def.nalogA.status === "zavrseno" ? sada : null,
          istorijaStatusa: {
            create: [
              { noviStatus: "novo", promenioId: admin.id },
              ...(def.nalogA.status !== "novo"
                ? [{ stariStatus: "novo", noviStatus: def.nalogA.status, promenioId: admin.id }]
                : []),
            ],
          },
        },
      });
    });

    const nalogB = await prisma.$transaction(async (tx) => {
      const brojNaloga = await sledeciBrojNaloga(tx, firmaId);
      return tx.radniNalog.create({
        data: {
          brojNaloga,
          firmaId,
          klijentId: klijentB.id,
          opremaId: opB.id,
          kategorijaId,
          tipUslugeId: def.nalogB.tip.id,
          naslov: def.nalogB.naslov,
          opis: `${MARKER} Demo nalog — ${def.kategorija}`,
          prioritet: def.nalogB.prioritet,
          status: def.nalogB.status,
          lokacijaTip: def.nalogB.lokacijaTip,
          adresaIntervencije: klijentB.adresa,
          kreiraoId: admin.id,
          zakazanoZa: zaDane(2),
          zavrsenoAt: def.nalogB.status === "zavrseno" ? sada : null,
          istorijaStatusa: {
            create: [
              { noviStatus: "novo", promenioId: admin.id },
              ...(def.nalogB.status !== "novo"
                ? [{ stariStatus: "novo", noviStatus: def.nalogB.status, promenioId: admin.id }]
                : []),
            ],
          },
        },
      });
    });

    if (def.nalogA.status === "zavrseno") zavrsenZaRacun = nalogA;
    if (def.nalogB.status === "zavrseno" && !zavrsenZaRacun) zavrsenZaRacun = nalogB;

    console.log(`✓ ${def.kategorija}: 2 opreme + 2 naloga`);
  }

  // Magacin — par delova
  const magacin = await prisma.$transaction((tx) => centralniMagacin(tx, firmaId));
  const delovi = [
    { sifra: "DEMO-PL-001", naziv: "Kočione pločice prednje", jedinicaMere: "kom", prodajnaCena: 4500, minZaliha: 2, kolicina: 8 },
    { sifra: "DEMO-FLT-002", naziv: "Filter ulja", jedinicaMere: "kom", prodajnaCena: 1200, minZaliha: 5, kolicina: 15 },
    { sifra: "DEMO-PUMP-003", naziv: "Pumpa za veš mašinu", jedinicaMere: "kom", prodajnaCena: 3800, minZaliha: 1, kolicina: 3 },
  ];
  for (const d of delovi) {
    const deo = await prisma.deo.upsert({
      where: { firmaId_sifra: { firmaId, sifra: d.sifra } },
      create: {
        firmaId,
        sifra: d.sifra,
        naziv: d.naziv,
        jedinicaMere: d.jedinicaMere,
        prodajnaCena: d.prodajnaCena,
        minZaliha: d.minZaliha,
      },
      update: { naziv: d.naziv, prodajnaCena: d.prodajnaCena },
    });
    await prisma.stanjeZaliha.upsert({
      where: { deoId_magacinId: { deoId: deo.id, magacinId: magacin.id } },
      create: { deoId: deo.id, magacinId: magacin.id, kolicina: d.kolicina },
      update: { kolicina: d.kolicina },
    });
  }
  console.log("✓ Magacin: 3 dela");

  if (zavrsenZaRacun) {
    const bezPdv = 8000;
    const pdvStopa = 20;
    const iznosPdv = Math.round(bezPdv * (pdvStopa / 100) * 100) / 100;
    const ukupno = bezPdv + iznosPdv;
    await prisma.$transaction(async (tx) => {
      const postoji = await tx.racun.findUnique({ where: { nalogId: zavrsenZaRacun.id } });
      if (postoji) return;
      const brojRacuna = await sledeciBrojRacuna(tx, firmaId);
      await tx.racun.create({
        data: {
          nalogId: zavrsenZaRacun.id,
          firmaId,
          klijentId: zavrsenZaRacun.klijentId,
          brojRacuna,
          status: "neplacen",
          pdvStopa,
          iznosBezPdv: bezPdv,
          iznosPdv,
          ukupanIznos: ukupno,
          napomena: `${MARKER} Demo račun`,
          rokPlacanja: zaDane(15),
          stavke: {
            create: [
              { tip: "rad", opis: "Rad / usluga", kolicina: 1, cena: bezPdv, redosled: 0 },
            ],
          },
        },
      });
    });
    console.log("✓ Račun za jedan završen nalog");
  }

  console.log("\nGotovo. Osveži app na telefonu:");
  console.log(`  Klijenti: ${klijentA.nazivIliIme}, ${klijentB.nazivIliIme}`);
  console.log("  Oprema + nalozi za sve kategorije, magacin, 1 račun.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
