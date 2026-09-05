/**
 * SMS notifikacije — stub + opcionalni Twilio.
 * Bez TWILIO_* env var-ova samo loguje i upisuje u NotifikacijaLog.
 */
const prisma = require("./prisma");

async function posaljiSms({ firmaId, telefon, naslov, telo }) {
  const to = String(telefon || "").trim();
  if (!to) {
    return { ok: false, status: "preskoceno", greska: "Nema telefona." };
  }

  let status = "simulirano";
  let greska = null;

  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM) {
    try {
      const auth = Buffer.from(
        `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
      ).toString("base64");
      const body = new URLSearchParams({
        To: to,
        From: process.env.TWILIO_FROM,
        Body: `${naslov}\n${telo}`.slice(0, 1400),
      });
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        }
      );
      if (!res.ok) {
        const txt = await res.text();
        status = "greska";
        greska = txt.slice(0, 200);
      } else {
        status = "poslato";
      }
    } catch (e) {
      status = "greska";
      greska = e.message;
    }
  }

  if (firmaId) {
    await prisma.notifikacijaLog.create({
      data: {
        firmaId,
        kanal: "sms",
        primalac: to,
        naslov: naslov || "SMS",
        telo: telo || "",
        status: greska ? `greska: ${greska}` : status,
      },
    });
  }

  return { ok: status === "poslato" || status === "simulirano", status, greska };
}

module.exports = { posaljiSms };
