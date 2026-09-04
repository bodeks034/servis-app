const { createClient } = require("@supabase/supabase-js");
const { HttpError } = require("./errors");

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "nalog-prilozi";
const MAX_BYTES = 2.5 * 1024 * 1024; // ~2.5 MB sirovo

function storageSpreman() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function supabaseAdmin() {
  if (!storageSpreman()) return null;
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function parsajDataUrl(dataUrl) {
  const m = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new HttpError(400, "Fajl nije u ispravnom formatu (data URL).");
  const mime = m[1];
  const buffer = Buffer.from(m[2], "base64");
  if (!buffer.length) throw new HttpError(400, "Prazan fajl.");
  if (buffer.length > MAX_BYTES) {
    throw new HttpError(400, "Fajl je prevelik (max ~2 MB). Smanjite kvalitet fotografije.");
  }
  if (!mime.startsWith("image/")) {
    throw new HttpError(400, "Dozvoljene su samo slike (foto / potpis).");
  }
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  return { mime, buffer, ext };
}

async function uploadPrilog({ firmaId, nalogId, tip, dataUrl }) {
  const { mime, buffer, ext } = parsajDataUrl(dataUrl);
  const path = `${firmaId}/${nalogId}/${tip}-${Date.now()}.${ext}`;
  const client = supabaseAdmin();

  if (!client) {
    // Radi i bez Storage-a (privremeno) — kompresovane slike u bazi.
    // Kad dodaš Supabase Storage, fajlovi idu u bucket.
    return { fajlUrl: dataUrl, path: null };
  }

  const { error } = await client.storage.from(BUCKET).upload(path, buffer, {
    contentType: mime,
    upsert: false,
  });
  if (error) {
    throw new HttpError(500, `Upload nije uspeo: ${error.message}`);
  }

  const { data } = client.storage.from(BUCKET).getPublicUrl(path);
  return { fajlUrl: data.publicUrl, path };
}

async function obrisiFajlAkoJeUStorage(fajlUrl) {
  const client = supabaseAdmin();
  if (!client || !fajlUrl || fajlUrl.startsWith("data:")) return;

  try {
    const marker = `/object/public/${BUCKET}/`;
    const idx = fajlUrl.indexOf(marker);
    if (idx === -1) return;
    const path = decodeURIComponent(fajlUrl.slice(idx + marker.length));
    await client.storage.from(BUCKET).remove([path]);
  } catch {
    // Ne blokiraj brisanje zapisa u bazi ako Storage cleanup padne.
  }
}

module.exports = {
  BUCKET,
  storageSpreman,
  uploadPrilog,
  obrisiFajlAkoJeUStorage,
};
