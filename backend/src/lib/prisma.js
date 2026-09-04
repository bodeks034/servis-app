const { PrismaClient } = require("@prisma/client");

// Jedna instanca Prisma klijenta za ceo backend (dobra praksa, izbegava previše konekcija ka bazi)
const prisma = new PrismaClient();

module.exports = prisma;
