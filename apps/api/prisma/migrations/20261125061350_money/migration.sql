-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('VET', 'MEDICINE', 'LABOUR', 'ELECTRICITY', 'TRANSPORT', 'REPAIRS', 'OTHER');

-- CreateEnum
CREATE TYPE "CapitalType" AS ENUM ('ANIMAL_PURCHASE', 'EQUIPMENT', 'OWNER_INVESTMENT', 'OWNER_WITHDRAWAL', 'ANIMAL_SALE');

-- AlterTable
ALTER TABLE "SupplierPayment" ADD COLUMN     "expenseId" UUID;

-- CreateTable
CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amountPaisa" INTEGER NOT NULL,
    "description" TEXT,
    "supplierId" UUID,
    "paymentType" "SaleType" NOT NULL DEFAULT 'CASH',
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "cashPaymentId" UUID,
    "animalId" UUID,
    "receiptPhotoId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientCreatedAt" TIMESTAMP(3),
    "updatedById" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientUpdatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapitalEntry" (
    "id" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "type" "CapitalType" NOT NULL,
    "amountPaisa" BIGINT NOT NULL,
    "description" TEXT,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "animalId" UUID,
    "receiptPhotoId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientCreatedAt" TIMESTAMP(3),
    "updatedById" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientUpdatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,

    CONSTRAINT "CapitalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarmSettings" (
    "id" UUID NOT NULL,
    "farmName" TEXT,
    "openingCashPaisa" BIGINT NOT NULL DEFAULT 0,
    "openingCashDate" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientCreatedAt" TIMESTAMP(3),
    "updatedById" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientUpdatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,

    CONSTRAINT "FarmSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Expense_date_idx" ON "Expense"("date");

-- CreateIndex
CREATE INDEX "Expense_supplierId_idx" ON "Expense"("supplierId");

-- CreateIndex
CREATE INDEX "CapitalEntry_date_idx" ON "CapitalEntry"("date");
