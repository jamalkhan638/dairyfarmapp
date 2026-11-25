-- CreateEnum
CREATE TYPE "SaleType" AS ENUM ('CASH', 'CREDIT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK', 'MOBILE');

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "defaultSaleType" "SaleType" NOT NULL DEFAULT 'CREDIT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientCreatedAt" TIMESTAMP(3),
    "updatedById" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientUpdatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerRate" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "ratePaisaPerLitre" INTEGER NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
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

    CONSTRAINT "CustomerRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MilkDelivery" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "session" "MilkSession" NOT NULL,
    "quantityMl" INTEGER NOT NULL,
    "ratePaisaPerLitre" INTEGER NOT NULL,
    "amountPaisa" INTEGER NOT NULL,
    "saleType" "SaleType" NOT NULL,
    "cashPaymentId" UUID,
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

    CONSTRAINT "MilkDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPayment" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "amountPaisa" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "deliveryId" UUID,
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

    CONSTRAINT "CustomerPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerRate_customerId_effectiveFrom_idx" ON "CustomerRate"("customerId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "MilkDelivery_date_idx" ON "MilkDelivery"("date");

-- CreateIndex
CREATE INDEX "MilkDelivery_customerId_date_idx" ON "MilkDelivery"("customerId", "date");

-- CreateIndex
CREATE INDEX "CustomerPayment_customerId_date_idx" ON "CustomerPayment"("customerId", "date");

-- Business rules (deleted records don't count):
-- one delivery per customer, date and milking;
CREATE UNIQUE INDEX "MilkDelivery_customer_date_session_key" ON "MilkDelivery" ("customerId", "date", "session") WHERE "deletedAt" IS NULL;
-- one rate per customer per start date;
CREATE UNIQUE INDEX "CustomerRate_customer_from_key" ON "CustomerRate" ("customerId", "effectiveFrom") WHERE "deletedAt" IS NULL;
-- customer names are unique (ignoring case).
CREATE UNIQUE INDEX "Customer_name_active_key" ON "Customer" (lower("name")) WHERE "deletedAt" IS NULL;
