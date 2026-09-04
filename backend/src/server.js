require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const naloziRoutes = require("./routes/nalozi.routes");
const opremaRoutes = require("./routes/oprema.routes");
const klijentiRoutes = require("./routes/klijenti.routes");
const delovoRoutes = require("./routes/delovi.routes");
const sifarniciRoutes = require("./routes/sifarnici.routes");
const racuniRoutes = require("./routes/racuni.routes");
const korisniciRoutes = require("./routes/korisnici.routes");
const podsetniciRoutes = require("./routes/podsetnici.routes");

const app = express();

const origins = (process.env.FRONTEND_ORIGIN || "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: origins.includes("*") ? true : origins,
  })
);
app.use(express.json({ limit: "4mb" })); // foto/potpis kao data URL

app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/nalozi", naloziRoutes);
app.use("/api/oprema", opremaRoutes);
app.use("/api/klijenti", klijentiRoutes);
app.use("/api/delovi", delovoRoutes);
app.use("/api/sifarnici", sifarniciRoutes);
app.use("/api/racuni", racuniRoutes);
app.use("/api/korisnici", korisniciRoutes);
app.use("/api/podsetnici", podsetniciRoutes);

// Na Vercel-u putanje ponekad dođu bez /api prefiksa — dupliciraj rute
app.use("/auth", authRoutes);
app.use("/nalozi", naloziRoutes);
app.use("/oprema", opremaRoutes);
app.use("/klijenti", klijentiRoutes);
app.use("/delovi", delovoRoutes);
app.use("/sifarnici", sifarniciRoutes);
app.use("/racuni", racuniRoutes);
app.use("/korisnici", korisniciRoutes);
app.use("/podsetnici", podsetniciRoutes);

app.use((err, req, res, next) => {
  if (err && err.code === "P2002") {
    return res.status(409).json({ greska: "Zapis sa ovom vrednošću već postoji." });
  }
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    greska: status >= 500 ? "Došlo je do greške na serveru." : err.message,
  });
});

// Lokalno: klasičan Node server. Na Vercel-u: serverless export.
const PORT = process.env.PORT || 4000;
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Servis-app backend radi na portu ${PORT}`);
  });
}

module.exports = app;
