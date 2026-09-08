const { posaljiSms } = require("./sms");
const { posaljiEmail } = require("./email");
const prisma = require("./prisma");

async function obavestiOStatusuNaloga(nalog, noviStatus) {
  const firmaId = nalog.firmaId;
  const naslov = `${nalog.brojNaloga} → ${noviStatus}`;
  const telo = `${nalog.naslov || "Nalog"} — status: ${noviStatus}`;

  const klijent = nalog.klijent || (nalog.klijentId
    ? await prisma.klijent.findUnique({ where: { id: nalog.klijentId } })
    : null);

  if (klijent?.telefon) {
    await posaljiSms({ firmaId, telefon: klijent.telefon, naslov, telo });
  }
  if (klijent?.email) {
    await posaljiEmail({
      firmaId,
      email: klijent.email,
      naslov: `Servis Dispečer · ${naslov}`,
      telo,
    });
  }

  if (nalog.dodeljeniTehnicarId) {
    const teh = await prisma.korisnik.findUnique({ where: { id: nalog.dodeljeniTehnicarId } });
    if (teh?.telefon) {
      await posaljiSms({
        firmaId,
        telefon: teh.telefon,
        naslov: `Nalog ${nalog.brojNaloga}`,
        telo: `Status: ${noviStatus}. ${nalog.naslov || ""}`,
      });
    }
    if (teh?.email) {
      await posaljiEmail({
        firmaId,
        email: teh.email,
        naslov: `Nalog ${nalog.brojNaloga}`,
        telo: `Status: ${noviStatus}. ${nalog.naslov || ""}`,
      });
    }
  }
}

async function obavestiOZakazivanju(nalog) {
  if (!nalog.zakazanoZa) return;
  const kada = new Date(nalog.zakazanoZa).toLocaleString("sr-RS");
  const firmaId = nalog.firmaId;
  const klijent = nalog.klijent || (nalog.klijentId
    ? await prisma.klijent.findUnique({ where: { id: nalog.klijentId } })
    : null);
  const telo = `Termin: ${kada}. ${nalog.naslov || ""}`;
  if (klijent?.telefon) {
    await posaljiSms({ firmaId, telefon: klijent.telefon, naslov: nalog.brojNaloga, telo });
  }
  if (klijent?.email) {
    await posaljiEmail({ firmaId, email: klijent.email, naslov: `Termin ${nalog.brojNaloga}`, telo });
  }
}

module.exports = { obavestiOStatusuNaloga, obavestiOZakazivanju };
