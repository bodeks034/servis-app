/*
  Warnings:

  - You are about to alter the column `ukupan_iznos` on the `racuni` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - Added the required column `iznos_bez_pdv` to the `racuni` table without a default value. This is not possible if the table is not empty.
  - Added the required column `iznos_pdv` to the `racuni` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TipStavkeRacuna" AS ENUM ('rad', 'deo', 'ostalo');

-- AlterTable
ALTER TABLE "oprema" ADD COLUMN     "boja" TEXT,
ADD COLUMN     "kilometraza" INTEGER,
ADD COLUMN     "registracija" TEXT,
ADD COLUMN     "satnice" DECIMAL(12,1),
ADD COLUMN     "snaga_kw" DECIMAL(10,2),
ADD COLUMN     "vin" TEXT;

-- AlterTable
ALTER TABLE "racuni" ADD COLUMN     "iznos_bez_pdv" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "iznos_pdv" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "napomena" TEXT,
ADD COLUMN     "pdv_stopa" DECIMAL(5,2) NOT NULL DEFAULT 20,
ALTER COLUMN "ukupan_iznos" SET DATA TYPE DECIMAL(12,2);

-- CreateTable
CREATE TABLE "racun_stavke" (
    "id" TEXT NOT NULL,
    "racun_id" TEXT NOT NULL,
    "tip" "TipStavkeRacuna" NOT NULL DEFAULT 'ostalo',
    "opis" TEXT NOT NULL,
    "kolicina" DECIMAL(12,2) NOT NULL,
    "cena" DECIMAL(12,2) NOT NULL,
    "redosled" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "racun_stavke_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "racun_stavke" ADD CONSTRAINT "racun_stavke_racun_id_fkey" FOREIGN KEY ("racun_id") REFERENCES "racuni"("id") ON DELETE CASCADE ON UPDATE CASCADE;
