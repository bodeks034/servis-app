const jwt = require("jsonwebtoken");

// Proverava JWT token iz "Authorization: Bearer ..." headera.
// Ako je validan, u req.user stavlja { id, firmaId, uloga } — ovo je
// KLJUČNO za multi-tenant izolaciju: svaki sledeći upit ka bazi
// filtrira podatke po req.user.firmaId, tako da jedna firma nikad
// ne može da vidi podatke druge firme.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ greska: "Niste ulogovani." });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, firmaId, uloga, email }
    next();
  } catch (err) {
    return res.status(401).json({ greska: "Token nije validan ili je istekao." });
  }
}

// Ograničava rutu na određene uloge, npr. requireRole("admin", "dispecer")
function requireRole(...dozvoljeneUloge) {
  return (req, res, next) => {
    if (!req.user || !dozvoljeneUloge.includes(req.user.uloga)) {
      return res.status(403).json({ greska: "Nemate dozvolu za ovu akciju." });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
