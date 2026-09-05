/** Podrazumevane checklist stavke po tipu usluge (naziv). */
const DEFAULT_CHECKLIST = {
  "Servis / popravka": [
    "Provera bezbednosti / isključenje napajanja",
    "Dijagnostika / utvrđivanje uzroka",
    "Zamena / popravka delova",
    "Test rada nakon intervencije",
    "Čišćenje radnog mesta",
    "Obaveštenje klijenta o rezultatu",
  ],
  "Montaža / instalacija": [
    "Provera isporuke i kompleta",
    "Priprema lokacije",
    "Montaža / povezivanje",
    "Podešavanje i test",
    "Obuka korisnika (kratko)",
    "Predaja dokumentacije",
  ],
  "Dijagnostika": [
    "Prikupljanje simptoma od klijenta",
    "Vizuelni pregled",
    "Merenja / dijagnostički alati",
    "Zapis nalaza i preporuka",
  ],
  "Garancijski servis": [
    "Provera garancijskog statusa",
    "Dokumentovanje kvara (foto)",
    "Intervencija u okviru garancije",
    "Test i potpis klijenta",
  ],
  "Redovno održavanje": [
    "Pregled po planu održavanja",
    "Zamena filtera / potrošnog materijala",
    "Podmazivanje / podešavanje",
    "Ažuriranje sati / kilometraže",
    "Zapis sledećeg servisa",
  ],
};

const FALLBACK = [
  "Pregled stanja",
  "Izvršenje radova",
  "Test i predaja klijentu",
];

function stavkeZaTipUsluge(nazivTipa) {
  const lista = DEFAULT_CHECKLIST[nazivTipa] || FALLBACK;
  return lista.map((tekst, i) => ({ tekst, redosled: i, zavrseno: false }));
}

/** Satnica SLA od momenta kreiranja, po prioritetu. */
function slaSatiZaPrioritet(prioritet) {
  if (prioritet === "kritican") return 4;
  if (prioritet === "hitno") return 24;
  return 72;
}

function izracunajSlaRok(prioritet, od = new Date()) {
  const sati = slaSatiZaPrioritet(prioritet);
  return new Date(od.getTime() + sati * 3600 * 1000);
}

module.exports = {
  stavkeZaTipUsluge,
  slaSatiZaPrioritet,
  izracunajSlaRok,
  DEFAULT_CHECKLIST,
};
