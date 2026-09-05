async function sledeciBroj(tx, model, firmaId, field, prefix) {
  const godina = new Date().getFullYear();
  const starts = `${prefix}-${godina}-`;
  const zapisi = await tx[model].findMany({
    where: { firmaId, [field]: { startsWith: starts } },
    select: { [field]: true },
  });
  const max = zapisi.reduce((acc, red) => {
    const n = parseInt(String(red[field]).slice(starts.length), 10);
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 1000);
  return `${starts}${max + 1}`;
}

function sledeciBrojNaloga(tx, firmaId) {
  return sledeciBroj(tx, "radniNalog", firmaId, "brojNaloga", "WO");
}

function sledeciBrojRacuna(tx, firmaId) {
  return sledeciBroj(tx, "racun", firmaId, "brojRacuna", "R");
}

function sledeciBrojPonude(tx, firmaId) {
  return sledeciBroj(tx, "ponuda", firmaId, "brojPonude", "P");
}

module.exports = { sledeciBrojNaloga, sledeciBrojRacuna, sledeciBrojPonude };
