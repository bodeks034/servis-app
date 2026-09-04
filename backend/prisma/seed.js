// Pokreće se jednom nakon prve migracije: npm run seed
// Unosi zajedničke šifarnike (kategorije i tipove usluga) koje koriste sve firme.

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const kategorije = [
    "Vozila",
    "Nameštaj",
    "Bela tehnika",
    "Mašine i alati",
    "Poljoprivredna oprema",
  ];
  for (const naziv of kategorije) {
    const postoji = await prisma.kategorija.findFirst({ where: { naziv } });
    if (!postoji) {
      await prisma.kategorija.create({ data: { naziv } });
      console.log(`Dodata kategorija: ${naziv}`);
    }
  }

  const tipoviUsluga = [
    "Servis / popravka",
    "Montaža / instalacija",
    "Dijagnostika",
    "Garancijski servis",
    "Redovno održavanje",
  ];
  for (const naziv of tipoviUsluga) {
    const postoji = await prisma.tipUsluge.findFirst({ where: { naziv } });
    if (!postoji) {
      await prisma.tipUsluge.create({ data: { naziv } });
      console.log(`Dodat tip usluge: ${naziv}`);
    }
  }

  console.log("Seed završen.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
