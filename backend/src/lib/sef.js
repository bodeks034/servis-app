/**
 * SEF / e-faktura — lokalni UBL-ish XML export.
 * Pravo slanje na SEF API zahteva sertifikat i SEF_API_URL / SEF_API_KEY.
 */
function escapuj(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function racunUblXml(racun, firma, klijent) {
  const stavke = (racun.stavke || [])
    .map(
      (s, i) => `
    <cac:InvoiceLine>
      <cbc:ID>${i + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="${escapuj(s.jedinica || "C62")}">${Number(s.kolicina)}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="RSD">${Number(s.cena) * Number(s.kolicina)}</cbc:LineExtensionAmount>
      <cac:Item><cbc:Name>${escapuj(s.opis)}</cbc:Name></cac:Item>
      <cac:Price><cbc:PriceAmount currencyID="RSD">${Number(s.cena)}</cbc:PriceAmount></cac:Price>
    </cac:InvoiceLine>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>${escapuj(racun.brojRacuna)}</cbc:ID>
  <cbc:IssueDate>${new Date(racun.izdatAt).toISOString().slice(0, 10)}</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>RSD</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${escapuj(firma?.naziv || "")}</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme><cbc:CompanyID>${escapuj(firma?.pib || "")}</cbc:CompanyID></cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${escapuj(klijent?.nazivIliIme || "")}</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme><cbc:CompanyID>${escapuj(klijent?.pibIliJmbg || "")}</cbc:CompanyID></cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${Number(racun.iznosPdv)}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:TaxExclusiveAmount currencyID="RSD">${Number(racun.iznosBezPdv)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RSD">${Number(racun.ukupanIznos)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="RSD">${Number(racun.ukupanIznos)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${stavke}
</Invoice>
`;
}

async function posaljiNaSef(xml) {
  const url = process.env.SEF_API_URL;
  const key = process.env.SEF_API_KEY;
  if (!url || !key) {
    return { ok: false, status: "export_samo", ref: null, napomena: "SEF API nije podešen — vraćen XML export." };
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/xml",
      },
      body: xml,
    });
    const txt = await res.text();
    if (!res.ok) return { ok: false, status: "greska", ref: null, napomena: txt.slice(0, 300) };
    return { ok: true, status: "poslato", ref: txt.slice(0, 120), napomena: null };
  } catch (e) {
    return { ok: false, status: "greska", ref: null, napomena: e.message };
  }
}

module.exports = { racunUblXml, posaljiNaSef };
