const { PrismaClient } = require("@prisma/client");

// Na Vercel serverless-u svaki cold start može da napravi novi client —
// bez globalThis brzo potroši Supabase pool (EMAXCONNSESSION).
const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__servisPrisma ||
  new PrismaClient({
    log: process.env.PRISMA_LOG === "1" ? ["error", "warn"] : ["error"],
  });

if (!globalForPrisma.__servisPrisma) {
  globalForPrisma.__servisPrisma = prisma;
}

module.exports = prisma;
