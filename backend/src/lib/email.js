const nodemailer = require("nodemailer");
const prisma = require("./prisma");

function smtpSpreman() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function transporter() {
  if (!smtpSpreman()) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function posaljiEmail({ firmaId, email, naslov, telo, html }) {
  const to = String(email || "").trim();
  if (!to) return { ok: false, status: "preskoceno", greska: "Nema emaila." };

  let status = "simulirano";
  let greska = null;
  const tx = transporter();
  if (tx) {
    try {
      await tx.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to,
        subject: naslov || "Servis Dispečer",
        text: telo || "",
        html: html || undefined,
      });
      status = "poslato";
    } catch (e) {
      status = "greska";
      greska = e.message;
    }
  }

  if (firmaId) {
    await prisma.notifikacijaLog.create({
      data: {
        firmaId,
        kanal: "email",
        primalac: to,
        naslov: naslov || "Email",
        telo: telo || "",
        status: greska ? `greska: ${greska}` : status,
      },
    });
  }
  return { ok: status === "poslato" || status === "simulirano", status, greska };
}

module.exports = { posaljiEmail, smtpSpreman };
