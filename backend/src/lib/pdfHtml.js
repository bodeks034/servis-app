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

function fmtMoney(n) {
  return Number(n || 0).toLocaleString("sr-RS", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function htmlShell(title, body) {
  return `<!DOCTYPE html>
<html lang="sr"><head><meta charset="UTF-8"><title>${esc(title)}</title>
<style>
  body{font-family:Segoe UI,Arial,sans-serif;color:#1B2226;margin:24px;font-size:13px;}
  h1{font-size:20px;margin:0 0 4px;} h2{font-size:15px;margin:18px 0 8px;}
  .muted{color:#5B666E;} .mono{font-family:Consolas,monospace;}
  table{width:100%;border-collapse:collapse;margin-top:8px;}
  th,td{border-bottom:1px solid #D7DCDD;padding:8px 6px;text-align:left;}
  th{font-size:11px;text-transform:uppercase;color:#5B666E;}
  .right{text-align:right;} .totals td{border:none;padding:4px 6px;}
  .head{display:flex;justify-content:space-between;gap:16px;margin-bottom:16px;}
  .box{border:1px solid #D7DCDD;border-radius:6px;padding:10px 12px;}
  img.sig{max-height:80px;border:1px solid #eee;background:#fff;}
  @media print{button{display:none!important;} body{margin:12px;}}
</style></head><body>
<button onclick="window.print()" style="padding:8px 14px;margin-bottom:14px;cursor:pointer;">Štampaj / sačuvaj PDF</button>
${body}
<script>window.addEventListener('load',()=>{ /* ready for print */ });</script>
</body></html>`;
}

function nalogHtml(nalog, firma) {
  const delovi = (nalog.utroseniDelovi || [])
    .map(
      (d) =>
        `<tr><td>${esc(d.deo?.naziv || "")}</td><td class="mono">${d.kolicina}</td><td class="right mono">${fmtMoney(d.cenaPoKomadu)}</td><td class="right mono">${fmtMoney(Number(d.cenaPoKomadu) * d.kolicina)}</td></tr>`
    )
    .join("");
  const potpis = (nalog.prilozi || []).find((p) => p.tip === "potpis_klijenta");
  const opremaExtra = [
    nalog.oprema?.vin && `VIN: ${nalog.oprema.vin}`,
    nalog.oprema?.registracija && `Reg: ${nalog.oprema.registracija}`,
    nalog.oprema?.kilometraza != null && `Km: ${nalog.oprema.kilometraza}`,
    nalog.oprema?.satnice != null && `Satnice: ${nalog.oprema.satnice}`,
    nalog.oprema?.serijskiBroj && `S/N: ${nalog.oprema.serijskiBroj}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const body = `
  <div class="head">
    <div>
      <div class="muted">${esc(firma?.naziv || "Servis")}</div>
      <h1>Radni nalog ${esc(nalog.brojNaloga)}</h1>
      <div class="muted">${esc(nalog.tipUsluge?.naziv || "")} · ${esc(nalog.kategorija?.naziv || "")}</div>
    </div>
    <div class="box">
      <div><strong>Status:</strong> ${esc(nalog.status)}</div>
      <div><strong>Prioritet:</strong> ${esc(nalog.prioritet)}</div>
      <div><strong>Zakazano:</strong> ${fmt(nalog.zakazanoZa)}</div>
    </div>
  </div>
  <h2>${esc(nalog.naslov)}</h2>
  <p>${esc(nalog.opis || "")}</p>
  <div class="box">
    <div><strong>Klijent:</strong> ${esc(nalog.klijent?.nazivIliIme || "—")}</div>
    <div><strong>Telefon:</strong> ${esc(nalog.klijent?.telefon || "—")}</div>
    <div><strong>Adresa:</strong> ${esc(nalog.adresaIntervencije || nalog.klijent?.adresa || "—")}</div>
    <div><strong>Oprema:</strong> ${esc(nalog.oprema?.naziv || "—")}${opremaExtra ? `<div class="muted">${esc(opremaExtra)}</div>` : ""}</div>
    <div><strong>Tehničar:</strong> ${nalog.dodeljeniTehnicar ? esc(nalog.dodeljeniTehnicar.ime + " " + nalog.dodeljeniTehnicar.prezime) : "—"}</div>
  </div>
  <h2>Utrošeni delovi</h2>
  <table><thead><tr><th>Deo</th><th>Kol.</th><th class="right">Cena</th><th class="right">Iznos</th></tr></thead>
  <tbody>${delovi || `<tr><td colspan="4" class="muted">Nema delova</td></tr>`}</tbody></table>
  ${
    potpis
      ? `<h2>Potpis klijenta</h2><img class="sig" src="${esc(potpis.fajlUrl)}" alt="Potpis">`
      : ""
  }
  <p class="muted" style="margin-top:24px;">Generisano ${fmt(new Date())}</p>`;
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
  <div class="head">
    <div>
      <div class="muted">${esc(firma?.naziv || "Servis")}${firma?.pib ? ` · PIB ${esc(firma.pib)}` : ""}</div>
      <h1>Račun ${esc(racun.brojRacuna)}</h1>
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
  <table class="totals" style="margin-top:16px;max-width:320px;margin-left:auto;">
    <tr><td>Osnovica</td><td class="right mono">${fmtMoney(racun.iznosBezPdv)}</td></tr>
    <tr><td>PDV (${esc(Number(racun.pdvStopa))}%)</td><td class="right mono">${fmtMoney(racun.iznosPdv)}</td></tr>
    <tr><td><strong>Ukupno</strong></td><td class="right mono"><strong>${fmtMoney(racun.ukupanIznos)}</strong></td></tr>
  </table>
  ${racun.napomena ? `<p class="muted">${esc(racun.napomena)}</p>` : ""}
  <p class="muted" style="margin-top:24px;">Ovo je interní račun / predračun servisa. Za eFakturu koristite SEF kada bude povezan.</p>`;
  return htmlShell(`Račun ${racun.brojRacuna}`, body);
}

module.exports = { nalogHtml, racunHtml };
