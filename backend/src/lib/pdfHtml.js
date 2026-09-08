function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("sr-RS");
}

function fmtDay(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("sr-RS");
}

function fmtMoney(n) {
  return Number(n || 0).toLocaleString("sr-RS", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const SAGLASNOST = `Naručilac je saglasan: 1) Da se izvrše navedeni potrebni radovi 2) Da se izvrše i obave i oni nepredvidivi radovi koji su neophodni za izvršenje naručenih radova 3) Da se izvršeni radovi i ugrađeni delovi naplate po važećim cenama servisa 4) Da rok završetka radova može da bude produžen u slučaju nedostatka rezervnih delova, dodatnih problema ili više sile 5) Da po preuzimanju vozila/opreme podigne stare delove, u protivnom će biti uništeni 6) Da isplati vrednost popravke pre preuzimanja 7) U slučaju spora nadležan je Sud u sedištu servisa.`;

function htmlShell(title, body) {
  return `<!DOCTYPE html>
<html lang="sr"><head><meta charset="UTF-8"><title>${esc(title)}</title>
<style>
  body{font-family:Segoe UI,Arial,sans-serif;color:#1B2226;margin:18px;font-size:12px;}
  h1{font-size:18px;margin:0 0 2px;text-align:center;letter-spacing:.02em;}
  h2{font-size:13px;margin:14px 0 6px;border-bottom:1px solid #222;padding-bottom:3px;}
  .muted{color:#5B666E;} .mono{font-family:Consolas,monospace;}
  table{width:100%;border-collapse:collapse;margin-top:4px;}
  th,td{border:1px solid #9aa3a8;padding:5px 6px;text-align:left;vertical-align:top;}
  th{font-size:10px;text-transform:uppercase;background:#f3f5f6;}
  .right{text-align:right;} .center{text-align:center;}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;margin:8px 0;}
  .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;}
  .box{border:1px solid #9aa3a8;padding:8px 10px;}
  .label{font-size:10px;color:#5B666E;text-transform:uppercase;}
  .val{font-weight:600;margin-top:2px;}
  .sig-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:28px;}
  .sig-box{text-align:center;}
  .sig-box img{max-height:70px;max-width:100%;border-bottom:1px solid #222;display:block;margin:0 auto 6px;}
  .sig-line{border-top:1px solid #222;margin-top:48px;padding-top:4px;font-size:11px;}
  .legal{font-size:10px;line-height:1.35;margin-top:14px;border:1px solid #ccc;padding:8px;}
  @media print{button{display:none!important;} body{margin:10px;}}
</style></head><body>
<button onclick="window.print()" style="padding:8px 14px;margin-bottom:12px;cursor:pointer;">Štampaj / sačuvaj PDF</button>
${body}
</body></html>`;
}

function nalogHtml(nalog, firma) {
  const o = nalog.oprema || {};
  const delovi = (nalog.utroseniDelovi || []).map((d, i) => {
    const iznos = Number(d.cenaPoKomadu) * Number(d.kolicina);
    return `<tr>
      <td class="center mono">${i + 1}.</td>
      <td class="mono">${esc(d.deo?.sifra || "")}</td>
      <td>${esc(d.deo?.naziv || "")}</td>
      <td class="center mono">${d.kolicina}</td>
      <td class="right mono">${fmtMoney(d.cenaPoKomadu)}</td>
      <td class="right mono">${fmtMoney(iznos)}</td>
    </tr>`;
  }).join("");

  const usluge = (nalog.usluge || []).map((u, i) => {
    const iznos = Number(u.cena) * Number(u.kolicina);
    return `<tr>
      <td class="center mono">${i + 1}.</td>
      <td>${esc(u.opis)}</td>
      <td class="center mono">${Number(u.kolicina)}</td>
      <td class="right mono">${fmtMoney(u.cena)}</td>
      <td class="right mono">${fmtMoney(iznos)}</td>
    </tr>`;
  }).join("");

  const prilozi = nalog.prilozi || [];
  const potpisNar = prilozi.find((p) => p.tip === "potpis_klijenta");
  const potpisServ = prilozi.find((p) => p.tip === "potpis_servisa");
  const potpisPreuzeo = prilozi.find((p) => p.tip === "potpis_preuzeo");

  const markaModel = [o.proizvodjac, o.model || o.naziv].filter(Boolean).join(" ") || o.naziv || "—";
  const kreirao = nalog.kreirao
    ? `${nalog.kreirao.ime} ${nalog.kreirao.prezime}`
    : "—";

  const emptyDelovi = Array.from({ length: Math.max(0, 10 - (nalog.utroseniDelovi || []).length) }, (_, i) =>
    `<tr><td class="center muted">${(nalog.utroseniDelovi || []).length + i + 1}.</td><td></td><td></td><td></td><td></td><td></td></tr>`
  ).join("");
  const emptyUsluge = Array.from({ length: Math.max(0, 5 - (nalog.usluge || []).length) }, (_, i) =>
    `<tr><td class="center muted">${(nalog.usluge || []).length + i + 1}.</td><td></td><td></td><td></td><td></td></tr>`
  ).join("");

  const body = `
  <div class="muted center">${esc(firma?.naziv || "Servis")}${firma?.pib ? ` · PIB ${esc(firma.pib)}` : ""}${firma?.adresa ? ` · ${esc(firma.adresa)}` : ""}</div>
  <h1>RADNI NALOG BR. ${esc(nalog.brojNaloga)}</h1>

  <table style="margin-top:10px;">
    <tr>
      <th>Broj naloga</th><th>Datum prijema</th><th>Završetak radova</th><th>Izradio radni nalog</th>
    </tr>
    <tr>
      <td class="mono">${esc(nalog.brojNaloga)}</td>
      <td>${fmtDay(nalog.createdAt)}</td>
      <td>${nalog.zavrsenoAt ? fmtDay(nalog.zavrsenoAt) : ""}</td>
      <td>${esc(kreirao)}</td>
    </tr>
  </table>

  <table style="margin-top:8px;">
    <tr><th colspan="2">Naručilac radova</th></tr>
    <tr>
      <td style="width:50%"><strong>${esc(nalog.klijent?.nazivIliIme || "—")}</strong><br>${esc(nalog.klijent?.adresa || nalog.adresaIntervencije || "")}</td>
      <td>Tel: ${esc(nalog.klijent?.telefon || "—")}<br>${esc(nalog.klijent?.email || "")}</td>
    </tr>
  </table>

  <table style="margin-top:8px;">
    <tr><th>Napomena</th></tr>
    <tr><td><strong>${esc(nalog.naslov)}</strong><div style="white-space:pre-wrap;margin-top:4px;">${esc(nalog.opis || "")}</div></td></tr>
  </table>

  <h2 style="margin-top:12px;">Vozilo / oprema</h2>
  <table>
    <tr>
      <th>Marka i model</th><th>Reg. oznaka</th><th>Broj šasije</th><th>Stanje Km</th><th>Stanje goriva</th>
    </tr>
    <tr>
      <td>${esc(markaModel)}</td>
      <td class="mono">${esc(o.registracija || "")}</td>
      <td class="mono">${esc(o.vin || o.serijskiBroj || "")}</td>
      <td class="mono">${nalog.kmPriPrijemu != null ? nalog.kmPriPrijemu : (o.kilometraza != null ? o.kilometraza : "")}</td>
      <td>${esc(nalog.stanjeGoriva || "")}</td>
    </tr>
    <tr>
      <th>Snaga (kW)</th><th>Zapremina (ccm)</th><th>Broj motora</th><th>God. proizv.</th><th>Boja</th>
    </tr>
    <tr>
      <td class="mono">${o.snagaKw != null ? o.snagaKw : ""}</td>
      <td class="mono">${o.zapreminaCcm != null ? o.zapreminaCcm : ""}</td>
      <td class="mono">${esc(o.brojMotora || "")}</td>
      <td class="mono">${o.godinaProizvodnje != null ? o.godinaProizvodnje : ""}</td>
      <td>${esc(o.boja || "")}</td>
    </tr>
  </table>

  <h2>DELOVI</h2>
  <table>
    <thead><tr><th class="center">R.b.</th><th>Kataloški broj</th><th>Naziv</th><th class="center">Kol.</th><th class="right">Cena</th><th class="right">Vrednost</th></tr></thead>
    <tbody>${delovi}${emptyDelovi}</tbody>
  </table>

  <h2>USLUGE</h2>
  <table>
    <thead><tr><th class="center">R.b.</th><th>Usluga</th><th class="center">Kol.</th><th class="right">Cena</th><th class="right">Vrednost</th></tr></thead>
    <tbody>${usluge}${emptyUsluge}</tbody>
  </table>

  <div class="legal">${esc(SAGLASNOST)}</div>

  <div class="sig-row">
    <div class="sig-box">
      ${potpisServ ? `<img src="${esc(potpisServ.fajlUrl)}" alt="Potpis servisa">` : `<div class="sig-line"></div>`}
      <div>Odgovorno lice servisa</div>
    </div>
    <div class="sig-box">
      ${potpisNar ? `<img src="${esc(potpisNar.fajlUrl)}" alt="Potpis naručioca">` : `<div class="sig-line"></div>`}
      <div>Naručilac radova</div>
    </div>
    <div class="sig-box">
      ${potpisPreuzeo ? `<img src="${esc(potpisPreuzeo.fajlUrl)}" alt="Preuzeo">` : `<div class="sig-line"></div>`}
      <div>Vozilo preuzeo</div>
    </div>
  </div>`;

  return htmlShell(`Nalog ${nalog.brojNaloga}`, body);
}

function racunHtml(racun, firma) {
  const stavke = (racun.stavke || [])
    .map(
      (s) =>
        `<tr><td>${esc(s.opis)}</td><td class="mono">${Number(s.kolicina)}</td><td class="right mono">${fmtMoney(s.cena)}</td><td class="right mono">${fmtMoney(Number(s.kolicina) * Number(s.cena))}</td></tr>`
    )
    .join("");
  const body = `
  <div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:16px;">
    <div>
      <div class="muted">${esc(firma?.naziv || "Servis")}${firma?.pib ? ` · PIB ${esc(firma.pib)}` : ""}</div>
      <h1 style="text-align:left;">Račun ${esc(racun.brojRacuna)}</h1>
      <div class="muted">Datum: ${fmt(racun.izdatAt)} · Rok: ${fmt(racun.rokPlacanja)}</div>
    </div>
    <div class="box">
      <div><strong>Status:</strong> ${esc(racun.status)}</div>
      <div><strong>Nalog:</strong> ${esc(racun.nalog?.brojNaloga || "")}</div>
    </div>
  </div>
  <div class="box">
    <div><strong>Kupac:</strong> ${esc(racun.klijent?.nazivIliIme || "—")}</div>
    <div>${esc(racun.klijent?.adresa || "")}</div>
    <div>${esc(racun.klijent?.pibIliJmbg || "")}</div>
  </div>
  <h2>Stavke</h2>
  <table><thead><tr><th>Opis</th><th>Kol.</th><th class="right">Cena</th><th class="right">Iznos</th></tr></thead>
  <tbody>${stavke || `<tr><td colspan="4" class="muted">Nema stavki</td></tr>`}</tbody></table>
  <table style="margin-top:16px;max-width:320px;margin-left:auto;border:none;">
    <tr><td style="border:none;">Osnovica</td><td class="right mono" style="border:none;">${fmtMoney(racun.iznosBezPdv)}</td></tr>
    <tr><td style="border:none;">PDV (${esc(Number(racun.pdvStopa))}%)</td><td class="right mono" style="border:none;">${fmtMoney(racun.iznosPdv)}</td></tr>
    <tr><td style="border:none;"><strong>Ukupno</strong></td><td class="right mono" style="border:none;"><strong>${fmtMoney(racun.ukupanIznos)}</strong></td></tr>
  </table>
  ${racun.napomena ? `<p class="muted">${esc(racun.napomena)}</p>` : ""}`;
  return htmlShell(`Račun ${racun.brojRacuna}`, body);
}

module.exports = { nalogHtml, racunHtml };
