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

module.exports = { centralniMagacin };
