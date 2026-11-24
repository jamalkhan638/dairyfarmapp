-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'WORKER');

-- CreateEnum
CREATE TYPE "AnimalStatus" AS ENUM ('MILKING', 'DRY', 'YOUNG', 'SOLD', 'DECEASED');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('FEMALE', 'MALE');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'CONFLICT_RESOLVED');

-- CreateEnum
CREATE TYPE "ConflictStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ConflictType" AS ENUM ('DUPLICATE', 'EDIT', 'EDIT_DELETED', 'DELETE_EDITED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "language" TEXT NOT NULL DEFAULT 'ur',
    "accessVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "userId" UUID NOT NULL,
    "module" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canAdd" BOOLEAN NOT NULL DEFAULT false,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("userId","module")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "entity" TEXT NOT NULL,
    "recordId" UUID NOT NULL,
    "action" "AuditAction" NOT NULL,
    "userId" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientTime" TIMESTAMP(3),
    "mutationId" UUID,
    "changes" JSONB NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncMutation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "entity" TEXT NOT NULL,
    "recordId" UUID NOT NULL,
    "op" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncMutation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncChange" (
    "seq" BIGSERIAL NOT NULL,
    "entity" TEXT NOT NULL,
    "recordId" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncChange_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "SyncConflict" (
    "id" UUID NOT NULL,
    "entity" TEXT NOT NULL,
    "recordId" UUID NOT NULL,
    "type" "ConflictType" NOT NULL,
    "status" "ConflictStatus" NOT NULL DEFAULT 'OPEN',
    "mutationId" UUID NOT NULL,
    "mine" JSONB NOT NULL,
    "theirs" JSONB,
    "theirsVersion" INTEGER,
    "existingId" UUID,
    "resolution" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Animal" (
    "id" UUID NOT NULL,
    "tag" TEXT NOT NULL,
    "name" TEXT,
    "breed" TEXT,
    "sex" "Sex" NOT NULL DEFAULT 'FEMALE',
    "birthDate" TEXT,
    "birthDateEstimated" BOOLEAN NOT NULL DEFAULT false,
    "purchaseDate" TEXT,
    "purchasePricePaisa" INTEGER,
    "motherId" UUID,
    "photoId" UUID,
    "notes" TEXT,
    "status" "AnimalStatus" NOT NULL DEFAULT 'MILKING',
    "statusDate" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientCreatedAt" TIMESTAMP(3),
    "updatedById" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientUpdatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,

    CONSTRAINT "Animal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalStatusChange" (
    "id" UUID NOT NULL,
    "animalId" UUID NOT NULL,
    "status" "AnimalStatus" NOT NULL,
    "effectiveDate" TEXT NOT NULL,
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

    CONSTRAINT "AnimalStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "entity" TEXT NOT NULL,
    "recordId" UUID NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientCreatedAt" TIMESTAMP(3),
    "updatedById" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientUpdatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_recordId_idx" ON "AuditLog"("entity", "recordId");

-- CreateIndex
CREATE INDEX "SyncChange_entity_recordId_idx" ON "SyncChange"("entity", "recordId");

-- CreateIndex
CREATE INDEX "SyncConflict_status_idx" ON "SyncConflict"("status");

-- CreateIndex
CREATE INDEX "Animal_tag_idx" ON "Animal"("tag");

-- CreateIndex
CREATE INDEX "AnimalStatusChange_animalId_effectiveDate_idx" ON "AnimalStatusChange"("animalId", "effectiveDate");

-- CreateIndex
CREATE INDEX "Attachment_entity_recordId_idx" ON "Attachment"("entity", "recordId");

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalStatusChange" ADD CONSTRAINT "AnimalStatusChange_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Business rule: an ear tag can only belong to one animal that has not been deleted.
CREATE UNIQUE INDEX "Animal_tag_active_key" ON "Animal" (lower("tag")) WHERE "deletedAt" IS NULL;
