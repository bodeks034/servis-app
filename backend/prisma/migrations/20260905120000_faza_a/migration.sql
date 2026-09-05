-- AlterTable
ALTER TABLE "radni_nalozi" ADD COLUMN IF NOT EXISTS "zapoceto_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "nalog_utroseni_delovi" ADD COLUMN IF NOT EXISTS "magacin_id" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "nalog_checklist_stavke" (
    "id" TEXT NOT NULL,
    "nalog_id" TEXT NOT NULL,
    "tekst" TEXT NOT NULL,
    "zavrseno" BOOLEAN NOT NULL DEFAULT false,
    "redosled" INTEGER NOT NULL DEFAULT 0,
    "zavrseno_at" TIMESTAMP(3),

    CONSTRAINT "nalog_checklist_stavke_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "nalog_checklist_stavke_nalog_id_idx" ON "nalog_checklist_stavke"("nalog_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "magacini_tehnicar_id_idx" ON "magacini"("tehnicar_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "nalog_checklist_stavke" ADD CONSTRAINT "nalog_checklist_stavke_nalog_id_fkey"
    FOREIGN KEY ("nalog_id") REFERENCES "radni_nalozi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "magacini" ADD CONSTRAINT "magacini_tehnicar_id_fkey"
    FOREIGN KEY ("tehnicar_id") REFERENCES "korisnici"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
