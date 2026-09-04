-- CreateEnum
CREATE TYPE "Uloga" AS ENUM ('admin', 'dispecer', 'tehnicar', 'klijent');

-- CreateEnum
CREATE TYPE "TipKlijenta" AS ENUM ('fizicko_lice', 'pravno_lice');

-- CreateEnum
CREATE TYPE "StatusOpreme" AS ENUM ('ispravno', 'zakazan_servis', 'van_pogona');

-- CreateEnum
CREATE TYPE "Prioritet" AS ENUM ('normalan', 'hitno', 'kritican');

-- CreateEnum
CREATE TYPE "StatusNaloga" AS ENUM ('novo', 'u_toku', 'ceka_delove', 'zavrseno', 'otkazano');

-- CreateEnum
CREATE TYPE "LokacijaTip" AS ENUM ('radionica', 'teren');

-- CreateEnum
CREATE TYPE "TipPriloga" AS ENUM ('foto_pre', 'foto_posle', 'video', 'potpis_klijenta', 'pdf_izvestaj');

-- CreateEnum
CREATE TYPE "TipMagacina" AS ENUM ('centralni', 'mobilni');

-- CreateEnum
CREATE TYPE "StatusRacuna" AS ENUM ('neplacen', 'delimicno_placen', 'placen');

-- CreateTable
CREATE TABLE "firme" (
    "id" TEXT NOT NULL,
    "naziv" TEXT NOT NULL,
    "pib" TEXT,
    "maticni_broj" TEXT,
    "adresa" TEXT,
    "logo_url" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'standard',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "firme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "korisnici" (
    "id" TEXT NOT NULL,
    "firma_id" TEXT NOT NULL,
    "ime" TEXT NOT NULL,
    "prezime" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefon" TEXT,
    "password_hash" TEXT NOT NULL,
    "uloga" "Uloga" NOT NULL,
    "aktivan" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "korisnici_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "klijenti" (
    "id" TEXT NOT NULL,
    "firma_id" TEXT NOT NULL,
    "tip" "TipKlijenta" NOT NULL,
    "naziv_ili_ime" TEXT NOT NULL,
    "pib_ili_jmbg" TEXT,
    "telefon" TEXT,
    "email" TEXT,
    "adresa" TEXT,
    "napomena" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "klijenti_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kategorije" (
    "id" TEXT NOT NULL,
    "naziv" TEXT NOT NULL,
    "ikonica" TEXT,

    CONSTRAINT "kategorije_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipovi_usluga" (
    "id" TEXT NOT NULL,
    "naziv" TEXT NOT NULL,

    CONSTRAINT "tipovi_usluga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oprema" (
    "id" TEXT NOT NULL,
    "firma_id" TEXT NOT NULL,
    "klijent_id" TEXT,
    "kategorija_id" TEXT NOT NULL,
    "naziv" TEXT NOT NULL,
    "proizvodjac" TEXT,
    "model" TEXT,
    "serijski_broj" TEXT,
    "datum_kupovine" TIMESTAMP(3),
    "garancija_do" TIMESTAMP(3),
    "lokacija" TEXT,
    "status" "StatusOpreme" NOT NULL DEFAULT 'ispravno',
    "napomena" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oprema_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radni_nalozi" (
    "id" TEXT NOT NULL,
    "broj_naloga" TEXT NOT NULL,
    "firma_id" TEXT NOT NULL,
    "klijent_id" TEXT NOT NULL,
    "oprema_id" TEXT NOT NULL,
    "kategorija_id" TEXT NOT NULL,
    "tip_usluge_id" TEXT NOT NULL,
    "naslov" TEXT NOT NULL,
    "opis" TEXT,
    "prioritet" "Prioritet" NOT NULL DEFAULT 'normalan',
    "status" "StatusNaloga" NOT NULL DEFAULT 'novo',
    "lokacija_tip" "LokacijaTip" NOT NULL,
    "adresa_intervencije" TEXT,
    "dodeljeni_tehnicar_id" TEXT,
    "kreirao_id" TEXT NOT NULL,
    "zakazano_za" TIMESTAMP(3),
    "sla_rok" TIMESTAMP(3),
    "zavrseno_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "radni_nalozi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nalog_istorija_statusa" (
    "id" TEXT NOT NULL,
    "nalog_id" TEXT NOT NULL,
    "stari_status" "StatusNaloga",
    "novi_status" "StatusNaloga" NOT NULL,
    "promenio_id" TEXT NOT NULL,
    "promenjeno_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nalog_istorija_statusa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nalog_prilozi" (
    "id" TEXT NOT NULL,
    "nalog_id" TEXT NOT NULL,
    "tip" "TipPriloga" NOT NULL,
    "fajl_url" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nalog_prilozi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delovi" (
    "id" TEXT NOT NULL,
    "firma_id" TEXT NOT NULL,
    "sifra" TEXT NOT NULL,
    "naziv" TEXT NOT NULL,
    "jedinica_mere" TEXT,
    "nabavna_cena" DECIMAL(65,30),
    "prodajna_cena" DECIMAL(65,30),
    "min_zaliha" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "delovi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "magacini" (
    "id" TEXT NOT NULL,
    "firma_id" TEXT NOT NULL,
    "naziv" TEXT NOT NULL,
    "tip" "TipMagacina" NOT NULL DEFAULT 'centralni',
    "tehnicar_id" TEXT,

    CONSTRAINT "magacini_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stanje_zaliha" (
    "id" TEXT NOT NULL,
    "deo_id" TEXT NOT NULL,
    "magacin_id" TEXT NOT NULL,
    "kolicina" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stanje_zaliha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nalog_utroseni_delovi" (
    "id" TEXT NOT NULL,
    "nalog_id" TEXT NOT NULL,
    "deo_id" TEXT NOT NULL,
    "kolicina" INTEGER NOT NULL,
    "cena_po_komadu" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "nalog_utroseni_delovi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "racuni" (
    "id" TEXT NOT NULL,
    "nalog_id" TEXT NOT NULL,
    "firma_id" TEXT NOT NULL,
    "klijent_id" TEXT NOT NULL,
    "broj_racuna" TEXT NOT NULL,
    "status" "StatusRacuna" NOT NULL DEFAULT 'neplacen',
    "ukupan_iznos" DECIMAL(65,30) NOT NULL,
    "izdat_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rok_placanja" TIMESTAMP(3),
    "placen_at" TIMESTAMP(3),

    CONSTRAINT "racuni_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "korisnici_email_key" ON "korisnici"("email");

-- CreateIndex
CREATE INDEX "korisnici_firma_id_idx" ON "korisnici"("firma_id");

-- CreateIndex
CREATE INDEX "klijenti_firma_id_idx" ON "klijenti"("firma_id");

-- CreateIndex
CREATE INDEX "oprema_firma_id_idx" ON "oprema"("firma_id");

-- CreateIndex
CREATE INDEX "radni_nalozi_firma_id_idx" ON "radni_nalozi"("firma_id");

-- CreateIndex
CREATE UNIQUE INDEX "radni_nalozi_firma_id_broj_naloga_key" ON "radni_nalozi"("firma_id", "broj_naloga");

-- CreateIndex
CREATE INDEX "delovi_firma_id_idx" ON "delovi"("firma_id");

-- CreateIndex
CREATE UNIQUE INDEX "delovi_firma_id_sifra_key" ON "delovi"("firma_id", "sifra");

-- CreateIndex
CREATE INDEX "magacini_firma_id_idx" ON "magacini"("firma_id");

-- CreateIndex
CREATE UNIQUE INDEX "stanje_zaliha_deo_id_magacin_id_key" ON "stanje_zaliha"("deo_id", "magacin_id");

-- CreateIndex
CREATE UNIQUE INDEX "racuni_nalog_id_key" ON "racuni"("nalog_id");

-- CreateIndex
CREATE INDEX "racuni_firma_id_idx" ON "racuni"("firma_id");

-- CreateIndex
CREATE UNIQUE INDEX "racuni_firma_id_broj_racuna_key" ON "racuni"("firma_id", "broj_racuna");

-- AddForeignKey
ALTER TABLE "korisnici" ADD CONSTRAINT "korisnici_firma_id_fkey" FOREIGN KEY ("firma_id") REFERENCES "firme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "klijenti" ADD CONSTRAINT "klijenti_firma_id_fkey" FOREIGN KEY ("firma_id") REFERENCES "firme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oprema" ADD CONSTRAINT "oprema_firma_id_fkey" FOREIGN KEY ("firma_id") REFERENCES "firme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oprema" ADD CONSTRAINT "oprema_klijent_id_fkey" FOREIGN KEY ("klijent_id") REFERENCES "klijenti"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oprema" ADD CONSTRAINT "oprema_kategorija_id_fkey" FOREIGN KEY ("kategorija_id") REFERENCES "kategorije"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radni_nalozi" ADD CONSTRAINT "radni_nalozi_firma_id_fkey" FOREIGN KEY ("firma_id") REFERENCES "firme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radni_nalozi" ADD CONSTRAINT "radni_nalozi_klijent_id_fkey" FOREIGN KEY ("klijent_id") REFERENCES "klijenti"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radni_nalozi" ADD CONSTRAINT "radni_nalozi_oprema_id_fkey" FOREIGN KEY ("oprema_id") REFERENCES "oprema"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radni_nalozi" ADD CONSTRAINT "radni_nalozi_kategorija_id_fkey" FOREIGN KEY ("kategorija_id") REFERENCES "kategorije"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radni_nalozi" ADD CONSTRAINT "radni_nalozi_tip_usluge_id_fkey" FOREIGN KEY ("tip_usluge_id") REFERENCES "tipovi_usluga"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radni_nalozi" ADD CONSTRAINT "radni_nalozi_dodeljeni_tehnicar_id_fkey" FOREIGN KEY ("dodeljeni_tehnicar_id") REFERENCES "korisnici"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radni_nalozi" ADD CONSTRAINT "radni_nalozi_kreirao_id_fkey" FOREIGN KEY ("kreirao_id") REFERENCES "korisnici"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nalog_istorija_statusa" ADD CONSTRAINT "nalog_istorija_statusa_nalog_id_fkey" FOREIGN KEY ("nalog_id") REFERENCES "radni_nalozi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nalog_prilozi" ADD CONSTRAINT "nalog_prilozi_nalog_id_fkey" FOREIGN KEY ("nalog_id") REFERENCES "radni_nalozi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delovi" ADD CONSTRAINT "delovi_firma_id_fkey" FOREIGN KEY ("firma_id") REFERENCES "firme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "magacini" ADD CONSTRAINT "magacini_firma_id_fkey" FOREIGN KEY ("firma_id") REFERENCES "firme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stanje_zaliha" ADD CONSTRAINT "stanje_zaliha_deo_id_fkey" FOREIGN KEY ("deo_id") REFERENCES "delovi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stanje_zaliha" ADD CONSTRAINT "stanje_zaliha_magacin_id_fkey" FOREIGN KEY ("magacin_id") REFERENCES "magacini"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nalog_utroseni_delovi" ADD CONSTRAINT "nalog_utroseni_delovi_nalog_id_fkey" FOREIGN KEY ("nalog_id") REFERENCES "radni_nalozi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nalog_utroseni_delovi" ADD CONSTRAINT "nalog_utroseni_delovi_deo_id_fkey" FOREIGN KEY ("deo_id") REFERENCES "delovi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "racuni" ADD CONSTRAINT "racuni_nalog_id_fkey" FOREIGN KEY ("nalog_id") REFERENCES "radni_nalozi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "racuni" ADD CONSTRAINT "racuni_firma_id_fkey" FOREIGN KEY ("firma_id") REFERENCES "firme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "racuni" ADD CONSTRAINT "racuni_klijent_id_fkey" FOREIGN KEY ("klijent_id") REFERENCES "klijenti"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
