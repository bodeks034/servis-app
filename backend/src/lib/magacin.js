async function centralniMagacin(tx, firmaId) {
  let magacin = await tx.magacin.findFirst({
    where: { firmaId, tip: "centralni" },
  });
  if (!magacin) {
    magacin = await tx.magacin.create({
      data: { firmaId, naziv: "Centralni magacin", tip: "centralni" },
    });
  }
  return magacin;
}

async function mobilniMagacin(tx, firmaId, tehnicarId, imeTehnicara) {
  if (!tehnicarId) return null;
  let magacin = await tx.magacin.findFirst({
    where: { firmaId, tip: "mobilni", tehnicarId },
  });
  if (!magacin) {
    magacin = await tx.magacin.create({
      data: {
        firmaId,
        tip: "mobilni",
        tehnicarId,
        naziv: `Vozilo · ${imeTehnicara || "tehničar"}`,
      },
    });
  }
  return magacin;
}

/** Biraj magacin za utrošak: eksplicitni → mobilni tehničara → centralni. */
async function magacinZaUtrošak(tx, { firmaId, magacinId, tehnicarId }) {
  if (magacinId) {
    const m = await tx.magacin.findFirst({ where: { id: magacinId, firmaId } });
    if (!m) {
      const err = new Error("Magacin nije pronađen.");
      err.status = 400;
      throw err;
    }
    return m;
  }
  if (tehnicarId) {
    const mobilni = await tx.magacin.findFirst({
      where: { firmaId, tip: "mobilni", tehnicarId },
    });
    if (mobilni) {
      const stanje = await tx.stanjeZaliha.findMany({ where: { magacinId: mobilni.id } });
      if (stanje.some((s) => s.kolicina > 0)) return mobilni;
    }
  }
  return centralniMagacin(tx, firmaId);
}

module.exports = { centralniMagacin, mobilniMagacin, magacinZaUtrošak };
