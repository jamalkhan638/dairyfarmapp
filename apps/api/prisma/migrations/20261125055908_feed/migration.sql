-- CreateEnum
CREATE TYPE "FeedCategory" AS ENUM ('CONCENTRATE', 'GREEN_FODDER', 'SILAGE', 'MINERAL', 'OTHER');

-- CreateTable
CREATE TABLE "Supplier" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
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

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedItem" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "FeedCategory" NOT NULL,
    "bagWeightGrams" INTEGER,
    "notes" TEXT,
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

    CONSTRAINT "FeedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedPurchase" (
    "id" UUID NOT NULL,
    "feedItemId" UUID NOT NULL,
    "supplierId" UUID,
    "date" TEXT NOT NULL,
    "quantityGrams" INTEGER NOT NULL,
    "bags" DOUBLE PRECISION,
    "totalPaisa" INTEGER NOT NULL,
    "costPerKgPaisa" INTEGER NOT NULL,
    "paymentType" "SaleType" NOT NULL,
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

    CONSTRAINT "FeedPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "amountPaisa" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "purchaseId" UUID,
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

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedConsumption" (
    "id" UUID NOT NULL,
    "feedItemId" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "quantityGrams" INTEGER NOT NULL,
    "wastedGrams" INTEGER NOT NULL DEFAULT 0,
    "animalIds" UUID[],
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

    CONSTRAINT "FeedConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAdjustment" (
    "id" UUID NOT NULL,
    "feedItemId" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "changeGrams" INTEGER NOT NULL,
    "reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientCreatedAt" TIMESTAMP(3),
    "updatedById" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientUpdatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,

    CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedPurchase_feedItemId_date_idx" ON "FeedPurchase"("feedItemId", "date");

-- CreateIndex
CREATE INDEX "FeedPurchase_supplierId_idx" ON "FeedPurchase"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierPayment_supplierId_date_idx" ON "SupplierPayment"("supplierId", "date");

-- CreateIndex
CREATE INDEX "FeedConsumption_date_idx" ON "FeedConsumption"("date");

-- CreateIndex
CREATE INDEX "FeedConsumption_feedItemId_date_idx" ON "FeedConsumption"("feedItemId", "date");

-- CreateIndex
CREATE INDEX "StockAdjustment_feedItemId_idx" ON "StockAdjustment"("feedItemId");

-- Names are unique (ignoring case) among records that are not deleted.
CREATE UNIQUE INDEX "Supplier_name_active_key" ON "Supplier" (lower("name")) WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "FeedItem_name_active_key" ON "FeedItem" (lower("name")) WHERE "deletedAt" IS NULL;
