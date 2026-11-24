-- CreateEnum
CREATE TYPE "MilkSession" AS ENUM ('MORNING', 'EVENING');

-- CreateEnum
CREATE TYPE "MilkUsageType" AS ENUM ('CALF_FED', 'HOME', 'DISCARDED');

-- CreateTable
CREATE TABLE "MilkRecord" (
    "id" UUID NOT NULL,
    "animalId" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "session" "MilkSession" NOT NULL,
    "quantityMl" INTEGER NOT NULL,
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientCreatedAt" TIMESTAMP(3),
    "updatedById" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientUpdatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,

    CONSTRAINT "MilkRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MilkUsage" (
    "id" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "type" "MilkUsageType" NOT NULL,
    "quantityMl" INTEGER NOT NULL,
    "animalId" UUID,
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientCreatedAt" TIMESTAMP(3),
    "updatedById" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientUpdatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,

    CONSTRAINT "MilkUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MilkRecord_date_idx" ON "MilkRecord"("date");

-- CreateIndex
CREATE INDEX "MilkRecord_animalId_date_idx" ON "MilkRecord"("animalId", "date");

-- CreateIndex
CREATE INDEX "MilkUsage_date_idx" ON "MilkUsage"("date");

-- Business rule: one milk entry per cow, date and session (deleted entries don't count).
CREATE UNIQUE INDEX "MilkRecord_animal_date_session_key" ON "MilkRecord" ("animalId", "date", "session") WHERE "deletedAt" IS NULL;
