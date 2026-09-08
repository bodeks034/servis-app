const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const asyncHandler = require("../lib/asyncHandler");
const { HttpError } = require("../lib/errors");
const { upisiAudit } = require("../lib/audit");

const router = express.Router();
router.use(requireAuth);
router.use(requireRole("admin", "dispecer", "knjigovodja"));

router.get("/", asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "100", 10) || 100, 500);
  const logovi = await prisma.auditLog.findMany({
    where: { firmaId: req.user.firmaId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  res.json(logovi);
}));

router.post("/test", requireRole("admin"), asyncHandler(async (req, res) => {
  await upisiAudit({
    firmaId: req.user.firmaId,
    korisnikId: req.user.id,
    akcija: "test",
    entitet: "sistem",
    detalj: "Ručni audit test",
  });
  res.json({ ok: true });
}));

module.exports = router;
