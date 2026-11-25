-- CreateEnum
CREATE TYPE "HealthType" AS ENUM ('ILLNESS', 'TREATMENT', 'VACCINATION', 'DEWORMING', 'OTHER');

-- CreateEnum
CREATE TYPE "BreedingType" AS ENUM ('HEAT', 'INSEMINATION', 'PREGNANCY_CHECK', 'CALVING', 'ABORTION');

-- CreateEnum
CREATE TYPE "InseminationMethod" AS ENUM ('AI', 'NATURAL');

-- CreateEnum
CREATE TYPE "PregnancyResult" AS ENUM ('PREGNANT', 'NOT_PREGNANT');

-- AlterTable
ALTER TABLE "FarmSettings" ADD COLUMN     "gestationDays" INTEGER NOT NULL DEFAULT 283,
ADD COLUMN     "heatRepeatDays" INTEGER NOT NULL DEFAULT 21,
ADD COLUMN     "pregnancyCheckDays" INTEGER NOT NULL DEFAULT 60;

-- CreateTable
CREATE TABLE "HealthEvent" (
    "id" UUID NOT NULL,
    "animalId" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "type" "HealthType" NOT NULL,
    "title" TEXT NOT NULL,
    "medicine" TEXT,
    "dose" TEXT,
    "vetName" TEXT,
    "withdrawalEndDate" TEXT,
    "nextDueDate" TEXT,
    "expenseId" UUID,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientCreatedAt" TIMESTAMP(3),
    "updatedById" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientUpdatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,

    CONSTRAINT "HealthEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreedingEvent" (
    "id" UUID NOT NULL,
    "animalId" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "type" "BreedingType" NOT NULL,
    "method" "InseminationMethod",
    "sire" TEXT,
    "technician" TEXT,
    "result" "PregnancyResult",
    "calfId" UUID,
    "calfSex" "Sex",
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientCreatedAt" TIMESTAMP(3),
    "updatedById" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientUpdatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,

    CONSTRAINT "BreedingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" UUID NOT NULL,
    "animalId" UUID,
    "dueDate" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceKey" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientCreatedAt" TIMESTAMP(3),
    "updatedById" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientUpdatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HealthEvent_animalId_date_idx" ON "HealthEvent"("animalId", "date");

-- CreateIndex
CREATE INDEX "BreedingEvent_animalId_date_idx" ON "BreedingEvent"("animalId", "date");

-- CreateIndex
CREATE INDEX "Reminder_dueDate_idx" ON "Reminder"("dueDate");
