// Prisma "mode: insensitive" radi samo na PostgreSQL (Supabase).
// MySQL/MariaDB su za VARCHAR obično već case-insensitive — tada mode ne sme da stoji.
// Pri prelasku na MySQL u .env stavi DB_PROVIDER=mysql (uz Prisma provider = "mysql").
function containsText(value) {
  const provider = (process.env.DB_PROVIDER || "postgresql").toLowerCase();
  if (provider === "mysql" || provider === "mariadb" || provider === "sqlserver") {
    return { contains: value };
  }
  return { contains: value, mode: "insensitive" };
}

module.exports = { containsText };
