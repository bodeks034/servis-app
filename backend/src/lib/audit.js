const prisma = require("./prisma");

async function upisiAudit({ firmaId, korisnikId, akcija, entitet, entitetId, detalj }) {
  try {
    await prisma.auditLog.create({
      data: {
        firmaId,
        korisnikId: korisnikId || null,
        akcija: String(akcija).slice(0, 80),
        entitet: String(entitet).slice(0, 80),
        entitetId: entitetId || null,
        detalj: detalj ? String(detalj).slice(0, 2000) : null,
      },
    });
  } catch (e) {
    console.error("audit:", e.message);
  }
}

module.exports = { upisiAudit };
