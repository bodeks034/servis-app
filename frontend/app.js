if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((e) => console.warn("SW nije registrovan:", e));
  });
}

const TOKEN_KEY = "servis_token";
const USER_KEY = "servis_korisnik";
const API_KEY = "servis_api_base";
const QUEUE_KEY = "servis_offline_queue";

function jeZastarelaApiAdresa(url) {
  const u = String(url || "").toLowerCase();
  return (
    !u ||
    u.includes("localhost") ||
    u.includes("127.0.0.1") ||
    u.includes("servis-app-phi") ||
    u.includes("railway.app") ||
    u.includes("onrender.com")
  );
}

const PRODUKCIJA_API = "https://backend-nine-pied-44.vercel.app/api";

function procitajApiBase() {
  const onVercel =
    typeof location !== "undefined" && /\.vercel\.app$/i.test(location.hostname);
  const fromConfig = window.SERVIS_API_BASE
    ? String(window.SERVIS_API_BASE).replace(/\/$/, "")
    : "";
  const saved = (localStorage.getItem(API_KEY) || "").replace(/\/$/, "");

  // Na Vercel hostu nikad ne koristi localhost — to pravi "Failed to fetch" na telefonu
  if (onVercel && (!saved || jeZastarelaApiAdresa(saved))) {
    const url = fromConfig && !jeZastarelaApiAdresa(fromConfig) ? fromConfig : PRODUKCIJA_API;
    localStorage.setItem(API_KEY, url);
    return url;
  }

  if (saved && !jeZastarelaApiAdresa(saved)) return saved;
  if (fromConfig && !jeZastarelaApiAdresa(fromConfig)) {
    localStorage.setItem(API_KEY, fromConfig);
    return fromConfig;
  }
  if (fromConfig) return fromConfig;
  return onVercel ? PRODUKCIJA_API : "http://localhost:4000/api";
}

let API_BASE = procitajApiBase();
const apiInput = document.getElementById("api-url-input");
if (apiInput) {
  apiInput.value = API_BASE;
  apiInput.placeholder = "https://backend-nine-pied-44.vercel.app/api";
}

let token = localStorage.getItem(TOKEN_KEY) || null;
let trenutniKorisnik = null;
try { trenutniKorisnik = JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { trenutniKorisnik = null; }

let kategorije = [];
let tipoviUsluge = [];
let klijenti = [];
let oprema = [];
let nalozi = [];
let delovi = [];
let racuni = [];
let korisnici = [];
let currentView = "nalozi";
let categoryFilter = "sve";
let detaljNalog = null;
const catBadgeClass = {};

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jeDispecer() {
  return trenutniKorisnik && ["admin", "dispecer"].includes(trenutniKorisnik.uloga);
}

function ulogaLabel(u) {
  return { admin: "Admin", dispecer: "Dispečer", tehnicar: "Tehničar", klijent: "Klijent" }[u] || u;
}

function statusLabel(s) {
  return { novo: "Novo", u_toku: "U toku", ceka_delove: "Čeka delove", zavrseno: "Završeno", otkazano: "Otkazano" }[s] || s;
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("sr-RS", { dateStyle: "short", timeStyle: "short" });
}

function fmtDay(iso) {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

function uDatetimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function izDatetimeLocal(val) {
  if (!val) return null;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function api(putanja, opcije = {}) {
  let res;
  try {
    res = await fetch(API_BASE + putanja, {
      ...opcije,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(opcije.headers || {}),
      },
    });
  } catch (err) {
    if (jeZastarelaApiAdresa(API_BASE)) {
      throw new Error(
        "Pogrešan API URL (localhost). Upiši: https://backend-nine-pied-44.vercel.app/api"
      );
    }
    throw new Error(
      "Ne mogu da dostignem API: " + API_BASE + ". Proveri adresu ispod forme."
    );
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token && putanja !== "/auth/login") {
    odjaviSe(true);
    throw new Error("Sesija je istekla. Prijavite se ponovo.");
  }
  if (!res.ok) throw new Error(data.greska || "Greška u komunikaciji sa serverom.");
  return data;
}

let offlineQueue = [];
try { offlineQueue = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { offlineQueue = []; }

function sacuvajRed() {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(offlineQueue));
  azurirajIndikatorReda();
}

function jeMrezniProblem(err) {
  return err instanceof TypeError;
}

function azurirajIndikatorReda() {
  const el = document.getElementById("queue-indicator");
  if (!el) return;
  if (offlineQueue.length === 0) { el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  el.textContent = `${offlineQueue.length} čeka slanje — klik za pokušaj`;
}

document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "queue-indicator") posaljiRed();
});

async function posaljiIliZakaziZaKasnije(putanja, opcije, opis) {
  try {
    return await api(putanja, opcije);
  } catch (err) {
    if (jeMrezniProblem(err)) {
      offlineQueue.push({ putanja, opcije, opis, vreme: new Date().toISOString() });
      sacuvajRed();
      showToast("Nema konekcije — akcija je sačuvana, poslaće se automatski.");
      return { __queued: true };
    }
    throw err;
  }
}

async function posaljiRed() {
  if (offlineQueue.length === 0) return;
  const preostalo = [];
  for (const stavka of offlineQueue) {
    try {
      await api(stavka.putanja, stavka.opcije);
    } catch (err) {
      if (jeMrezniProblem(err)) { preostalo.push(stavka); continue; }
      showToast(`Greška pri slanju (${stavka.opis}): ${err.message}`);
    }
  }
  offlineQueue = preostalo;
  sacuvajRed();
  if (offlineQueue.length === 0 && token) {
    showToast("Sve sačuvane izmene su poslate.");
    await ucitajSve();
    render();
  }
}
window.addEventListener("online", posaljiRed);

function showToast(text) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

function sacuvajSesiju() {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  if (trenutniKorisnik) localStorage.setItem(USER_KEY, JSON.stringify(trenutniKorisnik));
  else localStorage.removeItem(USER_KEY);
}

function odjaviSe(tiho) {
  token = null;
  trenutniKorisnik = null;
  sacuvajSesiju();
  document.getElementById("app-shell").style.display = "none";
  document.getElementById("app-shell").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
  if (!tiho) showToast("Odjavljeni ste.");
}

document.querySelectorAll(".login-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".login-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("tab-login").classList.toggle("hidden", tab.dataset.tab !== "login");
    document.getElementById("tab-registracija").classList.toggle("hidden", tab.dataset.tab !== "registracija");
  });
});

function procitajApiSaEkrana() {
  let uneto = (document.getElementById("api-url-input").value || "").trim().replace(/\/$/, "");
  const onVercel =
    typeof location !== "undefined" && /\.vercel\.app$/i.test(location.hostname);
  if (onVercel && jeZastarelaApiAdresa(uneto)) {
    uneto = PRODUKCIJA_API;
    const input = document.getElementById("api-url-input");
    if (input) input.value = uneto;
  }
  if (uneto) {
    API_BASE = uneto;
    localStorage.setItem(API_KEY, API_BASE);
  }
}

document.getElementById("li-lozinka").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("btn-login").click();
});
document.getElementById("reg-lozinka").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("btn-registracija").click();
});

document.getElementById("btn-login").addEventListener("click", async () => {
  procitajApiSaEkrana();
  const email = document.getElementById("li-email").value.trim();
  const lozinka = document.getElementById("li-lozinka").value;
  const err = document.getElementById("li-error");
  err.textContent = "";
  try {
    const data = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, lozinka }) });
    token = data.token;
    trenutniKorisnik = data.korisnik;
    sacuvajSesiju();
    await ulazAkoUspesno();
  } catch (e) { err.textContent = e.message; }
});

document.getElementById("btn-registracija").addEventListener("click", async () => {
  procitajApiSaEkrana();
  const body = {
    nazivFirme: document.getElementById("reg-firma").value.trim(),
    ime: document.getElementById("reg-ime").value.trim(),
    prezime: document.getElementById("reg-prezime").value.trim(),
    email: document.getElementById("reg-email").value.trim(),
    lozinka: document.getElementById("reg-lozinka").value,
  };
  const err = document.getElementById("reg-error");
  err.textContent = "";
  try {
    const data = await api("/auth/registracija-firme", { method: "POST", body: JSON.stringify(body) });
    token = data.token;
    trenutniKorisnik = data.korisnik;
    sacuvajSesiju();
    await ulazAkoUspesno();
  } catch (e) { err.textContent = e.message; }
});

document.getElementById("btn-logout").addEventListener("click", () => odjaviSe());

async function ulazAkoUspesno() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app-shell").classList.remove("hidden");
  document.getElementById("app-shell").style.display = "contents";
  const firma = trenutniKorisnik.firmaNaziv ? ` · ${trenutniKorisnik.firmaNaziv}` : "";
  document.getElementById("who-info").textContent =
    `${trenutniKorisnik.ime} ${trenutniKorisnik.prezime} · ${ulogaLabel(trenutniKorisnik.uloga)}${firma}`;
  document.getElementById("nav-tim").classList.toggle("hidden", !jeDispecer());
  azurirajIndikatorReda();
  await ucitajSifarnike();
  await ucitajSve();
  render();
  posaljiRed();
}

async function ucitajSifarnike() {
  kategorije = await api("/sifarnici/kategorije");
  tipoviUsluge = await api("/sifarnici/tipovi-usluga");
  const klase = ["c1", "c2", "c3", "c4", "c5"];
  kategorije.forEach((k, i) => { catBadgeClass[k.id] = klase[i % klase.length]; });
}

async function ucitajSve() {
  const zahtevi = [api("/klijenti"), api("/oprema"), api("/nalozi"), api("/delovi"), api("/racuni")];
  zahtevi.push(api("/korisnici").catch(() => []));
  const rez = await Promise.all(zahtevi);
  klijenti = rez[0];
  oprema = rez[1];
  nalozi = rez[2];
  delovi = rez[3];
  racuni = rez[4];
  korisnici = rez[5] || [];
}

function render() {
  const content = document.getElementById("content");
  const q = document.getElementById("search").value.trim().toLowerCase();
  const btnNew = document.getElementById("btn-new");

  if (currentView === "nalozi") {
    document.getElementById("view-title").textContent = "Radni nalozi";
    btnNew.textContent = "+ Novi nalog";
    btnNew.classList.remove("hidden");
    btnNew.onclick = otvoriModalNalog;

    const filtered = nalozi.filter((n) => {
      if (n.status === "otkazano") return false;
      const matchesCat = categoryFilter === "sve" || n.kategorijaId === categoryFilter;
      const matchesQ = !q ||
        n.naslov.toLowerCase().includes(q) ||
        (n.brojNaloga || "").toLowerCase().includes(q) ||
        (n.klijent?.nazivIliIme || "").toLowerCase().includes(q);
      return matchesCat && matchesQ;
    });

    const kritican = filtered.filter((n) => n.prioritet === "kritican" && n.status !== "zavrseno").length;
    const uToku = filtered.filter((n) => n.status === "u_toku").length;
    const zavrseno = filtered.filter((n) => n.status === "zavrseno").length;

    let html = `<div class="stats-row">
      <div class="stat-card"><div class="label">Ukupno naloga</div><div class="value">${filtered.length}</div></div>
      <div class="stat-card danger"><div class="label">Kritični (aktivni)</div><div class="value">${kritican}</div></div>
      <div class="stat-card"><div class="label">U toku</div><div class="value">${uToku}</div></div>
      <div class="stat-card success"><div class="label">Završeno</div><div class="value">${zavrseno}</div></div>
    </div>`;

    html += `<div><span class="cat-chip ${categoryFilter === "sve" ? "active" : ""}" data-cat="sve">Sve kategorije</span>`;
    kategorije.forEach((k) => {
      html += `<span class="cat-chip ${categoryFilter === k.id ? "active" : ""}" data-cat="${k.id}">${esc(k.naziv)}</span>`;
    });
    html += `</div>`;

    const statusi = [["novo", "Novo"], ["u_toku", "U toku"], ["ceka_delove", "Čeka delove"], ["zavrseno", "Završeno"]];
    html += `<div class="board">`;
    for (const [key, label] of statusi) {
      const items = filtered.filter((n) => n.status === key);
      html += `<div><div class="col-head"><span class="title">${label}</span><span class="count">${items.length}</span></div>
        <div class="col-drop" data-status="${key}">`;
      if (items.length === 0) html += `<div class="empty" style="padding:16px 0;">Nema naloga</div>`;
      for (const n of items) {
        const teh = n.dodeljeniTehnicar ? `${esc(n.dodeljeniTehnicar.ime)} ${esc(n.dodeljeniTehnicar.prezime)}` : "";
        html += `<div class="card ${key}" draggable="true" data-id="${n.id}">
          <div class="card-id">${esc(n.brojNaloga)} · ${esc(n.tipUsluge?.naziv || "")} ${n.__queued ? '<span class="badge queued">čeka slanje</span>' : ""}</div>
          <div class="card-title">${esc(n.naslov)}</div>
          <div class="card-meta"><span>${esc(n.klijent?.nazivIliIme || "—")}</span>
            <span class="badge ${catBadgeClass[n.kategorijaId] || "c1"}">${esc(n.kategorija?.naziv || "")}</span></div>
          <div class="card-meta" style="margin-top:6px;">
            ${n.prioritet !== "normalan" ? `<span class="badge ${n.prioritet}">${n.prioritet === "kritican" ? "Kritično" : "Hitno"}</span>` : "<span></span>"}
            <span>${teh}</span>
          </div></div>`;
      }
      html += `</div></div>`;
    }
    html += `</div>`;
    content.innerHTML = html;
    attachDrag();
    document.querySelectorAll(".cat-chip").forEach((chip) => {
      chip.addEventListener("click", () => { categoryFilter = chip.dataset.cat; render(); });
    });
  }

  else if (currentView === "kalendar") {
    document.getElementById("view-title").textContent = "Kalendar";
    btnNew.classList.add("hidden");
    btnNew.onclick = null;
    content.innerHTML = `<p class="muted">Učitavanje...</p>`;
    (async () => {
      try {
        const od = new Date(); od.setHours(0,0,0,0);
        const doD = new Date(); doD.setDate(doD.getDate() + 14); doD.setHours(23,59,59,999);
        const lista = await api(`/podsetnici/kalendar?od=${encodeURIComponent(od.toISOString())}&do=${encodeURIComponent(doD.toISOString())}`);
        if (!lista.length) {
          content.innerHTML = `<div class="empty">Nema zakazanih naloga u narednih 14 dana.</div>`;
          return;
        }
        const byDay = {};
        for (const n of lista) {
          const key = new Date(n.zakazanoZa).toLocaleDateString("sr-RS", { weekday: "long", day: "numeric", month: "long" });
          (byDay[key] ||= []).push(n);
        }
        let html = "";
        for (const [dan, items] of Object.entries(byDay)) {
          html += `<div class="cal-day"><h4>${esc(dan)}</h4>`;
          for (const n of items) {
            html += `<div class="cal-item" data-id="${n.id}">
              <strong class="mono">${esc(n.brojNaloga)}</strong> ${esc(n.naslov)}
              <div class="muted">${esc(n.klijent?.nazivIliIme || "")} · ${new Date(n.zakazanoZa).toLocaleTimeString("sr-RS", { hour: "2-digit", minute: "2-digit" })}
              ${n.dodeljeniTehnicar ? ` · ${esc(n.dodeljeniTehnicar.ime)} ${esc(n.dodeljeniTehnicar.prezime)}` : ""}</div>
            </div>`;
          }
          html += `</div>`;
        }
        content.innerHTML = html;
        content.querySelectorAll(".cal-item").forEach((el) => {
          el.addEventListener("click", () => otvoriDetaljNaloga(el.dataset.id));
        });
      } catch (e) {
        content.innerHTML = `<p class="error-msg">${esc(e.message)}</p>`;
      }
    })();
  }

  else if (currentView === "podsetnici") {
    document.getElementById("view-title").textContent = "Podsetnici";
    btnNew.textContent = "Pošalji email";
    btnNew.classList.toggle("hidden", !jeDispecer());
    btnNew.onclick = async () => {
      try {
        const r = await api("/podsetnici/posalji-email", { method: "POST", body: "{}" });
        showToast(r.poruka || `Poslato: ${r.broj} podsetnika`);
      } catch (e) { showToast(e.message); }
    };
    content.innerHTML = `<p class="muted">Učitavanje...</p>`;
    (async () => {
      try {
        const data = await api("/podsetnici");
        if (!data.stavke.length) {
          content.innerHTML = `<div class="empty">Nema aktivnih podsetnika. Sve je u redu.</div>`;
          return;
        }
        content.innerHTML = data.stavke.map((s) =>
          `<div class="podsetnik ${s.prioritet === "visok" ? "visok" : ""}" ${s.nalogId ? `data-nalog="${s.nalogId}" style="cursor:pointer"` : ""}>
            <div class="t">${esc(s.naslov)}</div>
            <div class="s">${esc(s.tip)} · ${esc(s.tekst)}</div>
          </div>`
        ).join("");
        content.querySelectorAll("[data-nalog]").forEach((el) => {
          el.addEventListener("click", () => otvoriDetaljNaloga(el.dataset.nalog));
        });
      } catch (e) {
        content.innerHTML = `<p class="error-msg">${esc(e.message)}</p>`;
      }
    })();
  }

  else if (currentView === "oprema") {
    document.getElementById("view-title").textContent = "Oprema i vozila";
    btnNew.textContent = "+ Nova oprema";
    btnNew.classList.remove("hidden");
    btnNew.onclick = () => otvoriModalOprema();

    const filtered = oprema.filter((o) =>
      !q || o.naziv.toLowerCase().includes(q) || (o.klijent?.nazivIliIme || "").toLowerCase().includes(q) ||
      (o.serijskiBroj || "").toLowerCase().includes(q) || (o.vin || "").toLowerCase().includes(q) ||
      (o.registracija || "").toLowerCase().includes(q)
    );
    let html = `<table><thead><tr><th>Naziv</th><th>Kategorija</th><th>Klijent</th><th>Identifikacija</th><th>Garancija</th><th>Status</th></tr></thead><tbody>`;
    if (filtered.length === 0) html += `<tr><td colspan="6" class="empty">Nema unetih jedinica</td></tr>`;
    for (const o of filtered) {
      const gar = o.garancijaDo ? new Date(o.garancijaDo).toLocaleDateString("sr-RS") : "—";
      const idn = [o.vin && `VIN ${o.vin}`, o.registracija, o.serijskiBroj && `S/N ${o.serijskiBroj}`, o.kilometraza != null && `${o.kilometraza} km`, o.satnice != null && `${o.satnice} h`].filter(Boolean).join(" · ");
      html += `<tr class="clickable" data-id="${o.id}"><td>${esc(o.naziv)}</td><td><span class="badge ${catBadgeClass[o.kategorijaId] || "c1"}">${esc(o.kategorija?.naziv || "")}</span></td>
        <td>${esc(o.klijent?.nazivIliIme || "—")}</td><td class="mono">${esc(idn || (o.proizvodjac || "") + " " + (o.model || ""))}</td>
        <td class="mono">${gar}</td><td>${esc(o.status)}</td></tr>`;
    }
    html += `</tbody></table>`;
    content.innerHTML = html;
    content.querySelectorAll("tr.clickable").forEach((row) => {
      row.addEventListener("click", () => otvoriModalOprema(oprema.find((o) => o.id === row.dataset.id)));
    });
  }

  else if (currentView === "klijenti") {
    document.getElementById("view-title").textContent = "Klijenti";
    btnNew.textContent = "+ Novi klijent";
    btnNew.classList.remove("hidden");
    btnNew.onclick = () => otvoriModalKlijent();

    const filtered = klijenti.filter((k) =>
      !q || k.nazivIliIme.toLowerCase().includes(q) || (k.telefon || "").includes(q)
    );
    let html = `<table><thead><tr><th>Naziv / ime</th><th>Tip</th><th>Telefon</th><th>Email</th><th>Adresa</th></tr></thead><tbody>`;
    if (filtered.length === 0) html += `<tr><td colspan="5" class="empty">Nema unetih klijenata</td></tr>`;
    for (const k of filtered) {
      html += `<tr class="clickable" data-id="${k.id}"><td>${esc(k.nazivIliIme)}</td><td>${k.tip === "pravno_lice" ? "Pravno lice" : "Fizičko lice"}</td>
        <td class="mono">${esc(k.telefon || "")}</td><td>${esc(k.email || "")}</td><td>${esc(k.adresa || "")}</td></tr>`;
    }
    html += `</tbody></table>`;
    content.innerHTML = html;
    content.querySelectorAll("tr.clickable").forEach((row) => {
      row.addEventListener("click", () => otvoriModalKlijent(klijenti.find((k) => k.id === row.dataset.id)));
    });
  }

  else if (currentView === "magacin") {
    document.getElementById("view-title").textContent = "Magacin delova";
    btnNew.textContent = "+ Novi deo";
    btnNew.classList.remove("hidden");
    btnNew.onclick = otvoriModalDeo;

    const filtered = delovi.filter((d) =>
      !q || d.naziv.toLowerCase().includes(q) || d.sifra.toLowerCase().includes(q)
    );
    let html = `<table><thead><tr><th>Šifra</th><th>Naziv</th><th>Na stanju</th><th>Min. zaliha</th><th></th></tr></thead><tbody>`;
    if (filtered.length === 0) html += `<tr><td colspan="5" class="empty">Nema unetih delova</td></tr>`;
    for (const d of filtered) {
      const low = d.ukupnoNaStanju < d.minZaliha;
      html += `<tr><td class="mono">${esc(d.sifra)}</td><td>${esc(d.naziv)}</td>
        <td class="mono ${low ? "low-stock" : ""}">${d.ukupnoNaStanju}${low ? " ⚠" : ""}</td>
        <td class="mono">${d.minZaliha}</td>
        <td><button class="btn btn-sm" data-prijem="${d.id}">Prijem</button></td></tr>`;
    }
    html += `</tbody></table>`;
    content.innerHTML = html;
    content.querySelectorAll("[data-prijem]").forEach((b) => {
      b.addEventListener("click", () => otvoriPrijem(b.dataset.prijem));
    });
  }

  else if (currentView === "racuni") {
    document.getElementById("view-title").textContent = "Računi";
    btnNew.textContent = "+ Izdaj račun";
    btnNew.classList.remove("hidden");
    btnNew.onclick = otvoriModalRacun;

    const filtered = racuni.filter((r) =>
      !q || (r.klijent?.nazivIliIme || "").toLowerCase().includes(q) || r.brojRacuna.toLowerCase().includes(q)
    );
    let html = `<table><thead><tr><th>Broj računa</th><th>Klijent</th><th>Nalog</th><th>Bez PDV</th><th>PDV</th><th>Ukupno</th><th>Status</th><th></th></tr></thead><tbody>`;
    if (filtered.length === 0) html += `<tr><td colspan="8" class="empty">Nema izdatih računa</td></tr>`;
    for (const r of filtered) {
      const pill = r.status === "placen"
        ? '<span class="badge" style="background:var(--success-bg); color:var(--success-ink);">Plaćen</span>'
        : r.status === "delimicno_placen"
          ? '<span class="badge" style="background:var(--warn-bg); color:var(--warn-ink);">Delimično</span>'
          : '<span class="badge" style="background:var(--danger-bg); color:var(--danger-ink);">Neplaćen</span>';
      html += `<tr><td class="mono">${esc(r.brojRacuna)}</td><td>${esc(r.klijent?.nazivIliIme || "—")}</td>
        <td>${esc(r.nalog?.brojNaloga || "")} — ${esc(r.nalog?.naslov || "")}</td>
        <td class="mono">${Number(r.iznosBezPdv != null ? r.iznosBezPdv : r.ukupanIznos).toFixed(2)}</td>
        <td class="mono">${Number(r.iznosPdv || 0).toFixed(2)} (${Number(r.pdvStopa != null ? r.pdvStopa : 20)}%)</td>
        <td class="mono">${Number(r.ukupanIznos).toFixed(2)}</td>
        <td>${pill}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-sm" data-pdf-racun="${r.id}">PDF</button>
          ${r.status !== "placen" ? `<button class="btn btn-sm" data-placen="${r.id}">Plaćen</button>` : ""}
        </td></tr>`;
    }
    html += `</tbody></table>`;
    content.innerHTML = html;
    content.querySelectorAll("[data-pdf-racun]").forEach((b) => {
      b.addEventListener("click", () => otvoriPdf(`/racuni/${b.dataset.pdfRacun}/pdf`));
    });
    content.querySelectorAll("[data-placen]").forEach((b) => {
      b.addEventListener("click", async () => {
        try {
          const azuriran = await api(`/racuni/${b.dataset.placen}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status: "placen" }),
          });
          const i = racuni.findIndex((r) => r.id === azuriran.id);
          if (i >= 0) racuni[i] = azuriran;
          render();
        } catch (e) { showToast(e.message); }
      });
    });
  }

  else if (currentView === "izvestaji") {
    document.getElementById("view-title").textContent = "Izveštaji";
    btnNew.classList.add("hidden");
    btnNew.onclick = null;

    const total = nalozi.length;
    const done = nalozi.filter((n) => n.status === "zavrseno").length;
    const critical = nalozi.filter((n) => n.prioritet === "kritican" && n.status !== "zavrseno" && n.status !== "otkazano").length;
    const neplaceni = racuni.filter((r) => r.status !== "placen").reduce((s, r) => s + Number(r.ukupanIznos), 0);
    let catRows = "";
    kategorije.forEach((k) => {
      const c = nalozi.filter((n) => n.kategorijaId === k.id).length;
      catRows += `<div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--line); font-size:13px;">
        <span class="badge ${catBadgeClass[k.id]}">${esc(k.naziv)}</span><span class="mono">${c}</span></div>`;
    });
    content.innerHTML = `<div class="stats-row">
        <div class="stat-card"><div class="label">Ukupno naloga</div><div class="value">${total}</div></div>
        <div class="stat-card success"><div class="label">Završeno</div><div class="value">${done}</div></div>
        <div class="stat-card danger"><div class="label">Kritični aktivni</div><div class="value">${critical}</div></div>
        <div class="stat-card"><div class="label">Neplaćeno (iznos)</div><div class="value" style="font-size:18px;">${neplaceni.toFixed(0)}</div></div>
      </div>
      <div class="stat-card" style="max-width:420px;"><div class="label" style="margin-bottom:8px;">Nalozi po kategoriji</div>${catRows}</div>`;
  }

  else if (currentView === "tim") {
    document.getElementById("view-title").textContent = "Tim";
    btnNew.textContent = "+ Novi član";
    btnNew.classList.toggle("hidden", !jeDispecer());
    btnNew.onclick = otvoriModalKorisnik;

    const filtered = korisnici.filter((k) =>
      !q || `${k.ime} ${k.prezime} ${k.email}`.toLowerCase().includes(q)
    );
    let html = `<table><thead><tr><th>Ime</th><th>Uloga</th><th>Email</th><th>Telefon</th><th>Status</th><th></th></tr></thead><tbody>`;
    if (filtered.length === 0) html += `<tr><td colspan="6" class="empty">Nema članova tima</td></tr>`;
    for (const k of filtered) {
      html += `<tr><td>${esc(k.ime)} ${esc(k.prezime)}</td><td>${ulogaLabel(k.uloga)}</td>
        <td>${esc(k.email)}</td><td class="mono">${esc(k.telefon || "")}</td>
        <td>${k.aktivan ? "Aktivan" : "Neaktivan"}</td>
        <td>${jeDispecer() && k.id !== trenutniKorisnik.id
          ? `<button class="btn btn-sm" data-toggle="${k.id}" data-aktivan="${k.aktivan}">${k.aktivan ? "Deaktiviraj" : "Aktiviraj"}</button>`
          : ""}</td></tr>`;
    }
    html += `</tbody></table>`;
    content.innerHTML = html;
    content.querySelectorAll("[data-toggle]").forEach((b) => {
      b.addEventListener("click", async () => {
        try {
          const azuriran = await api(`/korisnici/${b.dataset.toggle}`, {
            method: "PATCH",
            body: JSON.stringify({ aktivan: b.dataset.aktivan !== "true" }),
          });
          const i = korisnici.findIndex((k) => k.id === azuriran.id);
          if (i >= 0) korisnici[i] = azuriran;
          render();
        } catch (e) { showToast(e.message); }
      });
    });
  }
}

function attachDrag() {
  document.querySelectorAll(".card").forEach((card) => {
    let dragged = false;
    card.addEventListener("dragstart", (e) => {
      dragged = true;
      card.classList.add("dragging");
      e.dataTransfer.setData("text/plain", card.dataset.id);
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
    card.addEventListener("click", () => {
      if (dragged) { dragged = false; return; }
      otvoriDetaljNaloga(card.dataset.id);
    });
  });
  document.querySelectorAll(".col-drop").forEach((drop) => {
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("dragover"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
    drop.addEventListener("drop", async (e) => {
      e.preventDefault();
      drop.classList.remove("dragover");
      const id = e.dataTransfer.getData("text/plain");
      const noviStatus = drop.dataset.status;
      const nalog = nalozi.find((n) => n.id === id);
      if (nalog) nalog.status = noviStatus;
      render();
      try {
        await posaljiIliZakaziZaKasnije(
          `/nalozi/${id}/status`,
          { method: "PATCH", body: JSON.stringify({ noviStatus }) },
          `Status naloga → ${noviStatus}`
        );
      } catch (err) {
        showToast(err.message);
        if (nalog) { await ucitajSve(); render(); }
      }
    });
  });
}

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((i) => i.classList.remove("active"));
    item.classList.add("active");
    currentView = item.dataset.view;
    document.getElementById("search").value = "";
    render();
  });
});
document.getElementById("search").addEventListener("input", render);

function popuniTehnicare(selectId, izabrani) {
  const aktivni = korisnici.filter((k) => k.aktivan && k.uloga !== "klijent");
  const el = document.getElementById(selectId);
  el.innerHTML = `<option value="">— nedodeljen —</option>` +
    aktivni.map((k) => `<option value="${k.id}" ${k.id === izabrani ? "selected" : ""}>${esc(k.ime)} ${esc(k.prezime)} (${ulogaLabel(k.uloga)})</option>`).join("");
}

function otvoriModalNalog() {
  document.getElementById("f-naslov").value = "";
  document.getElementById("f-opis").value = "";
  document.getElementById("f-adresa").value = "";
  document.getElementById("f-zakazano").value = "";
  document.getElementById("nalog-error").textContent = "";
  document.getElementById("f-kategorija").innerHTML = kategorije.map((k) => `<option value="${k.id}">${esc(k.naziv)}</option>`).join("");
  document.getElementById("f-tip-usluge").innerHTML = tipoviUsluge.map((t) => `<option value="${t.id}">${esc(t.naziv)}</option>`).join("");
  document.getElementById("f-klijent").innerHTML =
    klijenti.map((k) => `<option value="${k.id}">${esc(k.nazivIliIme)}</option>`).join("") ||
    `<option value="">Nema klijenata — dodaj prvo</option>`;
  popuniTehnicare("f-tehnicar");
  osveziOpremuUFormi();
  document.getElementById("overlay-nalog").classList.add("open");
}

document.getElementById("f-kategorija").addEventListener("change", osveziOpremuUFormi);
document.getElementById("f-klijent").addEventListener("change", osveziOpremuUFormi);

function osveziOpremuUFormi() {
  const katId = document.getElementById("f-kategorija").value;
  const klijentId = document.getElementById("f-klijent").value;
  const lista = oprema.filter((o) =>
    o.kategorijaId === katId && (!o.klijentId || o.klijentId === klijentId)
  );
  document.getElementById("f-oprema").innerHTML =
    lista.map((o) => `<option value="${o.id}">${esc(o.naziv)}</option>`).join("") ||
    `<option value="">Nema opreme za ovog klijenta u kategoriji</option>`;
}

document.getElementById("cancel-nalog").addEventListener("click", () => document.getElementById("overlay-nalog").classList.remove("open"));

document.getElementById("save-nalog").addEventListener("click", async () => {
  const naslov = document.getElementById("f-naslov").value.trim();
  const err = document.getElementById("nalog-error");
  if (!naslov) { err.textContent = "Unesite naziv problema."; return; }
  const klijentId = document.getElementById("f-klijent").value;
  const opremaId = document.getElementById("f-oprema").value;
  if (!klijentId || !opremaId) { err.textContent = "Izaberite klijenta i opremu."; return; }
  const body = {
    naslov,
    opis: document.getElementById("f-opis").value.trim(),
    kategorijaId: document.getElementById("f-kategorija").value,
    tipUslugeId: document.getElementById("f-tip-usluge").value,
    klijentId,
    opremaId,
    prioritet: document.getElementById("f-prioritet").value,
    lokacijaTip: document.getElementById("f-lokacija").value,
    adresaIntervencije: document.getElementById("f-adresa").value.trim(),
    dodeljeniTehnicarId: document.getElementById("f-tehnicar").value || null,
    zakazanoZa: izDatetimeLocal(document.getElementById("f-zakazano").value),
  };
  try {
    const rezultat = await posaljiIliZakaziZaKasnije("/nalozi", { method: "POST", body: JSON.stringify(body) }, `Novi nalog: ${naslov}`);
    if (rezultat.__queued) {
      nalozi.unshift({
        id: "privremeno-" + Date.now(),
        brojNaloga: "(čeka slanje)",
        naslov, status: "novo", prioritet: body.prioritet, kategorijaId: body.kategorijaId,
        kategorija: kategorije.find((k) => k.id === body.kategorijaId),
        klijent: klijenti.find((k) => k.id === body.klijentId),
        tipUsluge: tipoviUsluge.find((t) => t.id === body.tipUslugeId),
        __queued: true,
      });
    } else {
      nalozi.unshift(rezultat);
    }
    document.getElementById("overlay-nalog").classList.remove("open");
    currentView = "nalozi";
    document.querySelectorAll(".nav-item").forEach((i) => i.classList.remove("active"));
    document.querySelector('[data-view="nalozi"]').classList.add("active");
    render();
  } catch (e) { err.textContent = e.message; }
});

function tipPrilogaLabel(tip) {
  return {
    foto_pre: "Foto pre",
    foto_posle: "Foto posle",
    potpis_klijenta: "Potpis",
    video: "Video",
    pdf_izvestaj: "PDF",
  }[tip] || tip;
}

function otvoriPdf(putanja) {
  const url = API_BASE + putanja + (putanja.includes("?") ? "&" : "?") + "t=" + Date.now();
  // Token ne može u query lako — otvori blob preko fetch
  fetch(url, { headers: { Authorization: "Bearer " + token } })
    .then((r) => {
      if (!r.ok) throw new Error("PDF nije dostupan.");
      return r.text();
    })
    .then((html) => {
      const w = window.open("", "_blank");
      if (!w) { showToast("Dozvoli iskačuće prozore za PDF."); return; }
      w.document.write(html);
      w.document.close();
    })
    .catch((e) => showToast(e.message));
}

function tipKategorijeOpreme(katNaziv) {
  const n = (katNaziv || "").toLowerCase();
  if (n.includes("vozil")) return "vozilo";
  if (n.includes("mašin") || n.includes("masin") || n.includes("alat") || n.includes("poljopriv")) return "masina";
  return "opste";
}

function azurirajExtraPoljaOpreme() {
  const katId = document.getElementById("fo-kategorija").value;
  const kat = kategorije.find((k) => k.id === katId);
  const tip = tipKategorijeOpreme(kat?.naziv);
  const box = document.getElementById("fo-extra");
  box.classList.add("show");
  box.querySelectorAll("[data-extra]").forEach((el) => {
    const show = el.dataset.extra === tip || el.dataset.extra === "opste" || tip === "opste";
    // vozilo: vin/reg/km; masina: satnice/snaga; opste: boja + serijski već postoji
    if (tip === "vozilo") el.style.display = el.dataset.extra === "vozilo" || el.dataset.extra === "opste" ? "" : "none";
    else if (tip === "masina") el.style.display = el.dataset.extra === "masina" || el.dataset.extra === "opste" ? "" : "none";
    else el.style.display = el.dataset.extra === "opste" ? "" : "none";
  });
}

function kompresujSliku(file, maxW = 1280, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Ne mogu da pročitam fajl."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Neispravna slika."));
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxW) {
          h = Math.round((h * maxW) / w);
          w = maxW;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function otvoriDetaljNaloga(id) {
  const body = document.getElementById("nalog-detalj-body");
  body.innerHTML = `<p class="muted">Učitavanje...</p>`;
  document.getElementById("overlay-nalog-detalj").classList.add("open");
  try {
    detaljNalog = await api(`/nalozi/${id}`);
  } catch (e) {
    body.innerHTML = `<p class="error-msg">${esc(e.message)}</p><div class="modal-actions"><button class="btn" id="zatvori-detalj">Zatvori</button></div>`;
    document.getElementById("zatvori-detalj").onclick = () => document.getElementById("overlay-nalog-detalj").classList.remove("open");
    return;
  }
  renderDetalj();
}

function renderDetalj() {
  const n = detaljNalog;
  const zatvoren = n.status === "zavrseno" || n.status === "otkazano";
  const deloviOptions = delovi.map((d) =>
    `<option value="${d.id}">${esc(d.sifra)} — ${esc(d.naziv)} (stanje ${d.ukupnoNaStanju})</option>`
  ).join("");

  const utrosakRedovi = (n.utroseniDelovi || []).map((u) =>
    `<tr>
      <td>${esc(u.deo?.naziv || "")}</td>
      <td class="mono">${u.kolicina}</td>
      <td class="mono">${Number(u.cenaPoKomadu).toFixed(2)}</td>
      <td>${zatvoren ? "" : `<button class="btn btn-sm btn-danger" data-ukloni-deo="${u.id}">Ukloni</button>`}</td>
    </tr>`
  ).join("") || `<tr><td colspan="4" class="empty" style="padding:12px;">Nema utrošenih delova</td></tr>`;

  const istorija = (n.istorijaStatusa || []).map((h) =>
    `<div class="history-item">${fmtDate(h.promenjenoAt)} · ${h.stariStatus ? statusLabel(h.stariStatus) + " → " : ""}${statusLabel(h.noviStatus)}</div>`
  ).join("");

  const tehnicarSelect = korisnici.filter((k) => k.aktivan && k.uloga !== "klijent")
    .map((k) => `<option value="${k.id}" ${n.dodeljeniTehnicarId === k.id ? "selected" : ""}>${esc(k.ime)} ${esc(k.prezime)}</option>`)
    .join("");

  const prilozi = n.prilozi || [];
  const potpis = prilozi.find((p) => p.tip === "potpis_klijenta");
  const fotke = prilozi.filter((p) => p.tip !== "potpis_klijenta");
  const galerija = fotke.map((p) =>
    `<div class="prilog-card">
      <img src="${esc(p.fajlUrl)}" alt="${esc(tipPrilogaLabel(p.tip))}" data-zoom="${esc(p.fajlUrl)}">
      <div class="cap"><span>${esc(tipPrilogaLabel(p.tip))}</span>
        ${zatvoren ? "" : `<button class="btn btn-sm btn-danger" data-obrisi-prilog="${p.id}">×</button>`}
      </div>
    </div>`
  ).join("") || `<p class="muted">Još nema fotografija.</p>`;

  document.getElementById("nalog-detalj-body").innerHTML = `
    <div class="detail-head">
      <div>
        <div class="card-id">${esc(n.brojNaloga)} · ${esc(statusLabel(n.status))}</div>
        <h3>${esc(n.naslov)}</h3>
      </div>
      <button class="btn" id="zatvori-detalj">Zatvori</button>
    </div>
    <div class="prilog-actions" style="margin-top:0;">
      <button class="btn btn-sm" id="d-pdf">PDF / štampa</button>
    </div>
    <div class="detail-meta">
      <div><div class="k">Klijent</div><div class="v">${esc(n.klijent?.nazivIliIme || "—")}</div></div>
      <div><div class="k">Oprema</div><div class="v">${esc(n.oprema?.naziv || "—")}</div></div>
      <div><div class="k">Kategorija / usluga</div><div class="v">${esc(n.kategorija?.naziv || "")} · ${esc(n.tipUsluge?.naziv || "")}</div></div>
      <div><div class="k">Tehničar</div><div class="v">${n.dodeljeniTehnicar ? esc(n.dodeljeniTehnicar.ime + " " + n.dodeljeniTehnicar.prezime) : "Nedodeljen"}</div></div>
    </div>
    <div class="status-actions">
      ${["novo", "u_toku", "ceka_delove", "zavrseno", "otkazano"].map((s) =>
        `<button class="btn btn-sm ${n.status === s ? "btn-primary" : ""}" data-status="${s}" style="width:auto;">${statusLabel(s)}</button>`
      ).join("")}
    </div>
    <div class="field-row">
      <div class="field"><label>Tehničar</label>
        <select id="d-tehnicar" ${jeDispecer() && !zatvoren ? "" : "disabled"}>
          <option value="">— nedodeljen —</option>${tehnicarSelect}
        </select>
      </div>
      <div class="field"><label>Zakazano za</label>
        <input id="d-zakazano" type="datetime-local" value="${uDatetimeLocal(n.zakazanoZa)}" ${zatvoren ? "disabled" : ""}>
      </div>
    </div>
    <div class="field-row">
      <div class="field"><label>Prioritet</label>
        <select id="d-prioritet" ${zatvoren ? "disabled" : ""}>
          <option value="normalan" ${n.prioritet === "normalan" ? "selected" : ""}>Normalan</option>
          <option value="hitno" ${n.prioritet === "hitno" ? "selected" : ""}>Hitno</option>
          <option value="kritican" ${n.prioritet === "kritican" ? "selected" : ""}>Kritičan</option>
        </select>
      </div>
      <div class="field"><label>Lokacija</label>
        <select id="d-lokacija" ${zatvoren ? "disabled" : ""}>
          <option value="radionica" ${n.lokacijaTip === "radionica" ? "selected" : ""}>Radionica</option>
          <option value="teren" ${n.lokacijaTip === "teren" ? "selected" : ""}>Teren</option>
        </select>
      </div>
    </div>
    <div class="field"><label>Adresa intervencije</label>
      <input id="d-adresa" value="${esc(n.adresaIntervencije || "")}" ${zatvoren ? "disabled" : ""}></div>
    <div class="field"><label>Opis / beleška sa terena</label>
      <textarea id="d-opis" ${zatvoren ? "disabled" : ""}>${esc(n.opis || "")}</textarea></div>
    ${zatvoren ? "" : `<div class="modal-actions" style="margin-top:0;"><button class="btn btn-primary" id="d-sacuvaj" style="width:auto;">Sačuvaj izmene</button></div>`}

    <div class="section-title">Fotografije</div>
    <div class="prilog-grid">${galerija}</div>
    ${zatvoren ? "" : `
      <div class="prilog-actions">
        <label class="btn btn-sm" style="margin:0; cursor:pointer;">
          Foto pre
          <input type="file" accept="image/*" capture="environment" data-foto-tip="foto_pre" hidden>
        </label>
        <label class="btn btn-sm" style="margin:0; cursor:pointer;">
          Foto posle
          <input type="file" accept="image/*" capture="environment" data-foto-tip="foto_posle" hidden>
        </label>
      </div>
      <p class="muted">Na telefonu otvara kameru. Slike se kompresuju pre slanja.</p>
    `}

    <div class="section-title">Potpis klijenta</div>
    ${potpis ? `
      <div class="prilog-card" style="max-width:280px;">
        <img src="${esc(potpis.fajlUrl)}" alt="Potpis" data-zoom="${esc(potpis.fajlUrl)}" style="height:100px; object-fit:contain;">
        <div class="cap"><span>Sačuvan ${fmtDate(potpis.uploadedAt)}</span>
          ${zatvoren ? "" : `<button class="btn btn-sm btn-danger" data-obrisi-prilog="${potpis.id}">Ukloni</button>`}
        </div>
      </div>
    ` : `<p class="muted">Nema potpisa.</p>`}
    ${zatvoren ? "" : `
      <div class="signature-box" style="margin-top:10px;"><canvas id="sig-canvas" width="640" height="160"></canvas></div>
      <div class="prilog-actions">
        <button class="btn btn-sm" id="sig-clear">Obriši</button>
        <button class="btn btn-sm btn-primary" id="sig-save" style="width:auto;">Sačuvaj potpis</button>
      </div>
    `}

    <div class="section-title">Utrošeni delovi</div>
    <table><thead><tr><th>Deo</th><th>Kol.</th><th>Cena</th><th></th></tr></thead><tbody>${utrosakRedovi}</tbody></table>
    ${zatvoren ? "" : `
      <div class="field-row" style="margin-top:10px;">
        <div class="field"><label>Dodaj deo</label><select id="d-deo">${deloviOptions || "<option value=''>Nema delova u magacinu</option>"}</select></div>
        <div class="field"><label>Količina</label><input id="d-kol" type="number" min="1" value="1"></div>
      </div>
      <button class="btn btn-sm" id="d-dodaj-deo">Dodaj na nalog</button>
      <p class="muted" style="margin-top:8px;">Zaliha se skida odmah. Ako deo nije na stanju, prvo uradi prijem u magacinu.</p>
    `}
    ${n.racun ? `<p class="muted" style="margin-top:12px;">Račun: ${esc(n.racun.brojRacuna)} (${esc(n.racun.status)})</p>` : ""}
    <div class="section-title">Istorija statusa</div>
    ${istorija || `<p class="muted">Nema istorije.</p>`}
  `;

  document.getElementById("zatvori-detalj").onclick = () => document.getElementById("overlay-nalog-detalj").classList.remove("open");
  const pdfBtn = document.getElementById("d-pdf");
  if (pdfBtn) pdfBtn.onclick = () => otvoriPdf(`/nalozi/${n.id}/pdf`);

  document.querySelectorAll("#nalog-detalj-body [data-zoom]").forEach((img) => {
    img.addEventListener("click", () => {
      document.getElementById("lightbox-img").src = img.dataset.zoom;
      document.getElementById("lightbox").classList.add("open");
    });
  });

  document.querySelectorAll("#nalog-detalj-body [data-status]").forEach((b) => {
    b.addEventListener("click", async () => {
      try {
        await api(`/nalozi/${n.id}/status`, { method: "PATCH", body: JSON.stringify({ noviStatus: b.dataset.status }) });
        await ucitajSve();
        detaljNalog = await api(`/nalozi/${n.id}`);
        renderDetalj();
        render();
      } catch (e) { showToast(e.message); }
    });
  });

  const sacuvaj = document.getElementById("d-sacuvaj");
  if (sacuvaj) {
    sacuvaj.onclick = async () => {
      try {
        const azuriran = await api(`/nalozi/${n.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            opis: document.getElementById("d-opis").value,
            prioritet: document.getElementById("d-prioritet").value,
            lokacijaTip: document.getElementById("d-lokacija").value,
            adresaIntervencije: document.getElementById("d-adresa").value.trim(),
            dodeljeniTehnicarId: document.getElementById("d-tehnicar").value || null,
            zakazanoZa: izDatetimeLocal(document.getElementById("d-zakazano").value),
          }),
        });
        const i = nalozi.findIndex((x) => x.id === n.id);
        if (i >= 0) nalozi[i] = { ...nalozi[i], ...azuriran };
        showToast("Nalog je sačuvan.");
        detaljNalog = await api(`/nalozi/${n.id}`);
        renderDetalj();
        render();
      } catch (e) { showToast(e.message); }
    };
  }

  const dodaj = document.getElementById("d-dodaj-deo");
  if (dodaj) {
    dodaj.onclick = async () => {
      const deoId = document.getElementById("d-deo").value;
      const kolicina = document.getElementById("d-kol").value;
      if (!deoId) { showToast("Izaberite deo."); return; }
      try {
        await api(`/nalozi/${n.id}/delovi`, { method: "POST", body: JSON.stringify({ deoId, kolicina }) });
        delovi = await api("/delovi");
        detaljNalog = await api(`/nalozi/${n.id}`);
        renderDetalj();
      } catch (e) { showToast(e.message); }
    };
  }

  document.querySelectorAll("[data-ukloni-deo]").forEach((b) => {
    b.addEventListener("click", async () => {
      try {
        await api(`/nalozi/${n.id}/delovi/${b.dataset.ukloniDeo}`, { method: "DELETE" });
        delovi = await api("/delovi");
        detaljNalog = await api(`/nalozi/${n.id}`);
        renderDetalj();
      } catch (e) { showToast(e.message); }
    });
  });

  document.querySelectorAll("[data-foto-tip]").forEach((input) => {
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        showToast("Šaljem fotografiju...");
        const dataUrl = await kompresujSliku(file);
        await api(`/nalozi/${n.id}/prilozi`, {
          method: "POST",
          body: JSON.stringify({ tip: input.dataset.fotoTip, dataUrl }),
        });
        detaljNalog = await api(`/nalozi/${n.id}`);
        renderDetalj();
        showToast("Fotografija sačuvana.");
      } catch (e) { showToast(e.message); }
      input.value = "";
    });
  });

  document.querySelectorAll("[data-obrisi-prilog]").forEach((b) => {
    b.addEventListener("click", async () => {
      try {
        await api(`/nalozi/${n.id}/prilozi/${b.dataset.obrisiPrilog}`, { method: "DELETE" });
        detaljNalog = await api(`/nalozi/${n.id}`);
        renderDetalj();
      } catch (e) { showToast(e.message); }
    });
  });

  const canvas = document.getElementById("sig-canvas");
  if (canvas) {
    setupSignaturePad(canvas);
    document.getElementById("sig-clear").onclick = () => {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.dataset.empty = "1";
    };
    document.getElementById("sig-save").onclick = async () => {
      if (canvas.dataset.empty !== "0") {
        showToast("Nacrtajte potpis prvo.");
        return;
      }
      try {
        const dataUrl = canvas.toDataURL("image/png");
        await api(`/nalozi/${n.id}/prilozi`, {
          method: "POST",
          body: JSON.stringify({ tip: "potpis_klijenta", dataUrl }),
        });
        detaljNalog = await api(`/nalozi/${n.id}`);
        renderDetalj();
        showToast("Potpis sačuvan.");
      } catch (e) { showToast(e.message); }
    };
  }
}

function setupSignaturePad(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.strokeStyle = "#1B2226";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  canvas.dataset.empty = "1";
  let drawing = false;

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return {
      x: ((src.clientX - r.left) / r.width) * canvas.width,
      y: ((src.clientY - r.top) / r.height) * canvas.height,
    };
  }
  function start(e) {
    e.preventDefault();
    drawing = true;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function move(e) {
    if (!drawing) return;
    e.preventDefault();
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    canvas.dataset.empty = "0";
  }
  function end() { drawing = false; }

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  canvas.addEventListener("mouseup", end);
  canvas.addEventListener("mouseleave", end);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);
}

document.getElementById("lightbox").addEventListener("click", () => {
  document.getElementById("lightbox").classList.remove("open");
  document.getElementById("lightbox-img").src = "";
});

function otvoriModalOprema(postojeca) {
  document.getElementById("oprema-modal-title").textContent = postojeca ? "Izmena opreme" : "Nova oprema / uređaj";
  document.getElementById("fo-id").value = postojeca?.id || "";
  document.getElementById("fo-naziv").value = postojeca?.naziv || "";
  document.getElementById("fo-proizvodjac").value = postojeca?.proizvodjac || "";
  document.getElementById("fo-model").value = postojeca?.model || "";
  document.getElementById("fo-serijski").value = postojeca?.serijskiBroj || "";
  document.getElementById("fo-lokacija").value = postojeca?.lokacija || "";
  document.getElementById("fo-vin").value = postojeca?.vin || "";
  document.getElementById("fo-registracija").value = postojeca?.registracija || "";
  document.getElementById("fo-km").value = postojeca?.kilometraza ?? "";
  document.getElementById("fo-satnice").value = postojeca?.satnice ?? "";
  document.getElementById("fo-snaga").value = postojeca?.snagaKw ?? "";
  document.getElementById("fo-boja").value = postojeca?.boja || "";
  document.getElementById("fo-kupovina").value = fmtDay(postojeca?.datumKupovine);
  document.getElementById("fo-garancija").value = fmtDay(postojeca?.garancijaDo);
  document.getElementById("oprema-error").textContent = "";
  document.getElementById("fo-kategorija").innerHTML = kategorije.map((k) =>
    `<option value="${k.id}" ${postojeca?.kategorijaId === k.id ? "selected" : ""}>${esc(k.naziv)}</option>`
  ).join("");
  document.getElementById("fo-klijent").innerHTML =
    `<option value="">— interna oprema, bez klijenta —</option>` +
    klijenti.map((k) => `<option value="${k.id}" ${postojeca?.klijentId === k.id ? "selected" : ""}>${esc(k.nazivIliIme)}</option>`).join("");
  azurirajExtraPoljaOpreme();
  document.getElementById("overlay-oprema").classList.add("open");
}

document.getElementById("cancel-oprema").addEventListener("click", () => document.getElementById("overlay-oprema").classList.remove("open"));
document.getElementById("fo-kategorija").addEventListener("change", azurirajExtraPoljaOpreme);

document.getElementById("save-oprema").addEventListener("click", async () => {
  const naziv = document.getElementById("fo-naziv").value.trim();
  const err = document.getElementById("oprema-error");
  if (!naziv) { err.textContent = "Unesite naziv opreme."; return; }
  const id = document.getElementById("fo-id").value;
  const body = {
    kategorijaId: document.getElementById("fo-kategorija").value,
    klijentId: document.getElementById("fo-klijent").value || null,
    naziv,
    proizvodjac: document.getElementById("fo-proizvodjac").value.trim(),
    model: document.getElementById("fo-model").value.trim(),
    serijskiBroj: document.getElementById("fo-serijski").value.trim(),
    lokacija: document.getElementById("fo-lokacija").value.trim(),
    vin: document.getElementById("fo-vin").value.trim(),
    registracija: document.getElementById("fo-registracija").value.trim(),
    kilometraza: document.getElementById("fo-km").value,
    satnice: document.getElementById("fo-satnice").value,
    snagaKw: document.getElementById("fo-snaga").value,
    boja: document.getElementById("fo-boja").value.trim(),
    datumKupovine: document.getElementById("fo-kupovina").value || null,
    garancijaDo: document.getElementById("fo-garancija").value || null,
  };
  try {
    if (id) {
      const azurirana = await api(`/oprema/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      const i = oprema.findIndex((o) => o.id === id);
      if (i >= 0) oprema[i] = azurirana;
    } else {
      oprema.unshift(await api("/oprema", { method: "POST", body: JSON.stringify(body) }));
    }
    document.getElementById("overlay-oprema").classList.remove("open");
    render();
  } catch (e) { err.textContent = e.message; }
});

function otvoriModalKlijent(postojeci) {
  document.getElementById("klijent-modal-title").textContent = postojeci ? "Izmena klijenta" : "Novi klijent";
  document.getElementById("fk-id").value = postojeci?.id || "";
  document.getElementById("fk-naziv").value = postojeci?.nazivIliIme || "";
  document.getElementById("fk-telefon").value = postojeci?.telefon || "";
  document.getElementById("fk-email").value = postojeci?.email || "";
  document.getElementById("fk-adresa").value = postojeci?.adresa || "";
  document.getElementById("fk-pib").value = postojeci?.pibIliJmbg || "";
  document.getElementById("fk-tip").value = postojeci?.tip || "fizicko_lice";
  document.getElementById("klijent-error").textContent = "";
  document.getElementById("overlay-klijent").classList.add("open");
}

document.getElementById("cancel-klijent").addEventListener("click", () => document.getElementById("overlay-klijent").classList.remove("open"));

document.getElementById("save-klijent").addEventListener("click", async () => {
  const naziv = document.getElementById("fk-naziv").value.trim();
  const err = document.getElementById("klijent-error");
  if (!naziv) { err.textContent = "Unesite naziv/ime klijenta."; return; }
  const id = document.getElementById("fk-id").value;
  const body = {
    tip: document.getElementById("fk-tip").value,
    nazivIliIme: naziv,
    telefon: document.getElementById("fk-telefon").value.trim(),
    email: document.getElementById("fk-email").value.trim(),
    adresa: document.getElementById("fk-adresa").value.trim(),
    pibIliJmbg: document.getElementById("fk-pib").value.trim(),
  };
  try {
    if (id) {
      const azuriran = await api(`/klijenti/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      const i = klijenti.findIndex((k) => k.id === id);
      if (i >= 0) klijenti[i] = azuriran;
    } else {
      klijenti.unshift(await api("/klijenti", { method: "POST", body: JSON.stringify(body) }));
    }
    document.getElementById("overlay-klijent").classList.remove("open");
    render();
  } catch (e) { err.textContent = e.message; }
});

function otvoriModalDeo() {
  document.getElementById("fd-sifra").value = "";
  document.getElementById("fd-naziv").value = "";
  document.getElementById("fd-jedinica").value = "";
  document.getElementById("fd-min").value = "0";
  document.getElementById("fd-cena").value = "";
  document.getElementById("deo-error").textContent = "";
  document.getElementById("overlay-deo").classList.add("open");
}

document.getElementById("cancel-deo").addEventListener("click", () => document.getElementById("overlay-deo").classList.remove("open"));

document.getElementById("save-deo").addEventListener("click", async () => {
  const sifra = document.getElementById("fd-sifra").value.trim();
  const naziv = document.getElementById("fd-naziv").value.trim();
  const err = document.getElementById("deo-error");
  if (!sifra || !naziv) { err.textContent = "Šifra i naziv su obavezni."; return; }
  const body = {
    sifra, naziv,
    jedinicaMere: document.getElementById("fd-jedinica").value.trim(),
    minZaliha: parseInt(document.getElementById("fd-min").value || "0", 10),
    prodajnaCena: parseFloat(document.getElementById("fd-cena").value || "0"),
  };
  try {
    delovi.unshift(await api("/delovi", { method: "POST", body: JSON.stringify(body) }));
    document.getElementById("overlay-deo").classList.remove("open");
    render();
  } catch (e) { err.textContent = e.message; }
});

function otvoriPrijem(id) {
  const d = delovi.find((x) => x.id === id);
  if (!d) return;
  document.getElementById("fp-id").value = id;
  document.getElementById("fp-naziv").textContent = `${d.sifra} — ${d.naziv} (trenutno ${d.ukupnoNaStanju})`;
  document.getElementById("fp-kolicina").value = "1";
  document.getElementById("prijem-error").textContent = "";
  document.getElementById("overlay-prijem").classList.add("open");
}

document.getElementById("cancel-prijem").addEventListener("click", () => document.getElementById("overlay-prijem").classList.remove("open"));

document.getElementById("save-prijem").addEventListener("click", async () => {
  const id = document.getElementById("fp-id").value;
  const kolicina = parseInt(document.getElementById("fp-kolicina").value, 10);
  const err = document.getElementById("prijem-error");
  if (!kolicina || kolicina < 1) { err.textContent = "Unesite količinu."; return; }
  try {
    const azuriran = await api(`/delovi/${id}/prijem`, { method: "POST", body: JSON.stringify({ kolicina }) });
    const i = delovi.findIndex((d) => d.id === id);
    if (i >= 0) delovi[i] = azuriran;
    document.getElementById("overlay-prijem").classList.remove("open");
    render();
  } catch (e) { err.textContent = e.message; }
});

function otvoriModalRacun() {
  const zavrseniBezRacuna = nalozi.filter((n) => n.status === "zavrseno" && !racuni.some((r) => r.nalog?.brojNaloga === n.brojNaloga));
  document.getElementById("fr-nalog").innerHTML =
    zavrseniBezRacuna.map((n) => `<option value="${n.id}">${esc(n.brojNaloga)} — ${esc(n.naslov)}</option>`).join("") ||
    `<option value="">Nema završenih naloga bez računa</option>`;
  document.getElementById("fr-cena-rada").value = "0";
  document.getElementById("fr-pdv").value = "20";
  document.getElementById("fr-rok").value = "15";
  document.getElementById("fr-napomena").value = "";
  document.getElementById("racun-error").textContent = "";
  document.getElementById("overlay-racun").classList.add("open");
}

document.getElementById("cancel-racun").addEventListener("click", () => document.getElementById("overlay-racun").classList.remove("open"));

document.getElementById("save-racun").addEventListener("click", async () => {
  const nalogId = document.getElementById("fr-nalog").value;
  const err = document.getElementById("racun-error");
  if (!nalogId) { err.textContent = "Izaberite nalog."; return; }
  const body = {
    nalogId,
    cenaRada: parseFloat(document.getElementById("fr-cena-rada").value || "0"),
    pdvStopa: parseFloat(document.getElementById("fr-pdv").value || "20"),
    rokPlacanjaDana: parseInt(document.getElementById("fr-rok").value || "15", 10),
    napomena: document.getElementById("fr-napomena").value.trim(),
  };
  try {
    racuni.unshift(await api("/racuni", { method: "POST", body: JSON.stringify(body) }));
    document.getElementById("overlay-racun").classList.remove("open");
    render();
  } catch (e) { err.textContent = e.message; }
});

function otvoriModalKorisnik() {
  document.getElementById("fu-ime").value = "";
  document.getElementById("fu-prezime").value = "";
  document.getElementById("fu-email").value = "";
  document.getElementById("fu-telefon").value = "";
  document.getElementById("fu-lozinka").value = "";
  document.getElementById("fu-uloga").value = "tehnicar";
  document.getElementById("korisnik-error").textContent = "";
  document.getElementById("overlay-korisnik").classList.add("open");
}

document.getElementById("cancel-korisnik").addEventListener("click", () => document.getElementById("overlay-korisnik").classList.remove("open"));

document.getElementById("save-korisnik").addEventListener("click", async () => {
  const err = document.getElementById("korisnik-error");
  const body = {
    ime: document.getElementById("fu-ime").value.trim(),
    prezime: document.getElementById("fu-prezime").value.trim(),
    email: document.getElementById("fu-email").value.trim(),
    telefon: document.getElementById("fu-telefon").value.trim(),
    lozinka: document.getElementById("fu-lozinka").value,
    uloga: document.getElementById("fu-uloga").value,
  };
  if (!body.ime || !body.prezime || !body.email || !body.lozinka) {
    err.textContent = "Ime, prezime, email i lozinka su obavezni.";
    return;
  }
  try {
    korisnici.push(await api("/korisnici", { method: "POST", body: JSON.stringify(body) }));
    document.getElementById("overlay-korisnik").classList.remove("open");
    render();
  } catch (e) { err.textContent = e.message; }
});

async function pokreniAkoImaSesiju() {
  if (!token || !trenutniKorisnik) return;
  try {
    const data = await api("/auth/ja");
    trenutniKorisnik = data.korisnik;
    sacuvajSesiju();
    await ulazAkoUspesno();
  } catch {
    odjaviSe(true);
  }
}

pokreniAkoImaSesiju();
