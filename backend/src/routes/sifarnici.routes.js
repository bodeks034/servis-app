const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const asyncHandler = require("../lib/asyncHandler");

const router = express.Router();
router.use(requireAuth);

router.get("/kategorije", asyncHandler(async (req, res) => {
  const kategorije = await prisma.kategorija.findMany({ orderBy: { naziv: "asc" } });
  res.json(kategorije);
}));

router.get("/tipovi-usluga", asyncHandler(async (req, res) => {
  const tipovi = await prisma.tipUsluge.findMany({ orderBy: { naziv: "asc" } });
  res.json(tipovi);
}));

module.exports = router;
