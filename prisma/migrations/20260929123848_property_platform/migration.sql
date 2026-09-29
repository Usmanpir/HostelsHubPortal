-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('HOSTELS', 'PROPERTY_MANAGEMENT', 'REAL_ESTATE', 'MIXED');

-- CreateEnum
CREATE TYPE "PropertyKind" AS ENUM ('HOSTEL', 'HOUSE', 'APARTMENT_BUILDING', 'APARTMENT', 'COMMERCIAL', 'PLOT', 'OTHER');

-- CreateEnum
CREATE TYPE "RentalMode" AS ENUM ('BY_BED', 'WHOLE_UNIT');

-- CreateEnum
CREATE TYPE "OwnerPayoutStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ListingPurpose" AS ENUM ('SALE', 'RENT');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'ACTIVE', 'UNDER_OFFER', 'SOLD', 'RENTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ListingPropertyType" AS ENUM ('HOUSE', 'APARTMENT', 'PORTION', 'ROOM', 'HOSTEL_BED', 'PLOT', 'SHOP', 'OFFICE', 'WAREHOUSE', 'BUILDING', 'FARMHOUSE', 'OTHER');

-- CreateEnum
CREATE TYPE "AreaUnit" AS ENUM ('SQFT', 'SQM', 'SQYD', 'MARLA', 'KANAL');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('WEBSITE', 'WALK_IN', 'PHONE', 'WHATSAPP', 'REFERRAL', 'PORTAL', 'SOCIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('NEW', 'CONTACTED', 'VIEWING', 'NEGOTIATION', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "LeadActivityType" AS ENUM ('NOTE', 'CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'STAGE_CHANGE');

-- CreateEnum
CREATE TYPE "ViewingStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "DealType" AS ENUM ('SALE', 'RENT');

-- CreateEnum
CREATE TYPE "DealStage" AS ENUM ('OPEN', 'AGREEMENT', 'CLOSED_WON', 'CLOSED_LOST');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RoomType" ADD VALUE 'STUDIO';
ALTER TYPE "RoomType" ADD VALUE 'APARTMENT';
ALTER TYPE "RoomType" ADD VALUE 'HOUSE';
ALTER TYPE "RoomType" ADD VALUE 'PORTION';
ALTER TYPE "RoomType" ADD VALUE 'SHOP';
ALTER TYPE "RoomType" ADD VALUE 'OFFICE';
ALTER TYPE "RoomType" ADD VALUE 'WAREHOUSE';

-- AlterTable
ALTER TABLE "Hostel" ADD COLUMN     "kind" "PropertyKind" NOT NULL DEFAULT 'HOSTEL',
ADD COLUMN     "managementFeePercent" DECIMAL(5,2),
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "rentalMode" "RentalMode" NOT NULL DEFAULT 'BY_BED';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "businessType" "BusinessType" NOT NULL DEFAULT 'HOSTELS',
ADD COLUMN     "dealerEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ownersEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicListingsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicProfileIntro" TEXT;

-- AlterTable
ALTER TABLE "ResidentAssignment" ADD COLUMN     "advanceRent" DECIMAL(12,2),
ADD COLUMN     "incrementIntervalMonths" INTEGER,
ADD COLUMN     "leaseEndDate" DATE,
ADD COLUMN     "leaseTerms" TEXT,
ADD COLUMN     "nextIncrementDate" DATE,
ADD COLUMN     "noticePeriodDays" INTEGER,
ADD COLUMN     "rentIncrementPercent" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "areaSqft" INTEGER,
ADD COLUMN     "bathrooms" INTEGER,
ADD COLUMN     "bedrooms" INTEGER,
ADD COLUMN     "furnished" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StoredFile" ADD COLUMN     "listingId" TEXT;

-- CreateTable
CREATE TABLE "PropertyOwner" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "idNumber" TEXT,
    "address" TEXT,
    "bankName" TEXT,
    "bankAccountTitle" TEXT,
    "bankAccountNumber" TEXT,
    "commissionPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "PropertyOwner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerPayout" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "rentCollected" DECIMAL(12,2) NOT NULL,
    "expenses" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "commission" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "adjustments" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netPayable" DECIMAL(12,2) NOT NULL,
    "status" "OwnerPayoutStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" DATE,
    "paymentMethod" "PaymentMethod",
    "reference" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "purpose" "ListingPurpose" NOT NULL,
    "propertyType" "ListingPropertyType" NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "price" DECIMAL(14,2) NOT NULL,
    "priceNegotiable" BOOLEAN NOT NULL DEFAULT false,
    "areaValue" DECIMAL(10,2),
    "areaUnit" "AreaUnit",
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "furnished" BOOLEAN NOT NULL DEFAULT false,
    "address" TEXT,
    "locality" TEXT,
    "city" TEXT,
    "description" TEXT,
    "features" TEXT[],
    "hostelId" TEXT,
    "roomId" TEXT,
    "ownerId" TEXT,
    "agentUserId" TEXT,
    "coverFileId" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "source" "LeadSource" NOT NULL DEFAULT 'OTHER',
    "stage" "LeadStage" NOT NULL DEFAULT 'NEW',
    "interest" "ListingPurpose",
    "listingId" TEXT,
    "budgetMin" DECIMAL(14,2),
    "budgetMax" DECIMAL(14,2),
    "preferredLocation" TEXT,
    "message" TEXT,
    "notes" TEXT,
    "assignedUserId" TEXT,
    "lostReason" TEXT,
    "nextFollowUpAt" TIMESTAMP(3),
    "lastContactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadActivity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "userId" TEXT,
    "type" "LeadActivityType" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Viewing" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "ViewingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "agentUserId" TEXT,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Viewing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "DealType" NOT NULL,
    "stage" "DealStage" NOT NULL DEFAULT 'OPEN',
    "listingId" TEXT,
    "leadId" TEXT,
    "clientName" TEXT NOT NULL,
    "agreedAmount" DECIMAL(14,2) NOT NULL,
    "commissionPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "commissionAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "agentUserId" TEXT,
    "commissionPaidAt" DATE,
    "expectedCloseDate" DATE,
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PropertyOwner_organizationId_name_idx" ON "PropertyOwner"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyOwner_organizationId_ownerCode_key" ON "PropertyOwner"("organizationId", "ownerCode");

-- CreateIndex
CREATE INDEX "OwnerPayout_organizationId_periodStart_idx" ON "OwnerPayout"("organizationId", "periodStart");

-- CreateIndex
CREATE INDEX "OwnerPayout_ownerId_periodStart_idx" ON "OwnerPayout"("ownerId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_coverFileId_key" ON "Listing"("coverFileId");

-- CreateIndex
CREATE INDEX "Listing_organizationId_status_purpose_idx" ON "Listing"("organizationId", "status", "purpose");

-- CreateIndex
CREATE INDEX "Listing_organizationId_isPublished_idx" ON "Listing"("organizationId", "isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_organizationId_code_key" ON "Listing"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_organizationId_slug_key" ON "Listing"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "Lead_organizationId_stage_idx" ON "Lead"("organizationId", "stage");

-- CreateIndex
CREATE INDEX "Lead_organizationId_assignedUserId_idx" ON "Lead"("organizationId", "assignedUserId");

-- CreateIndex
CREATE INDEX "Lead_organizationId_nextFollowUpAt_idx" ON "Lead"("organizationId", "nextFollowUpAt");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_organizationId_code_key" ON "Lead"("organizationId", "code");

-- CreateIndex
CREATE INDEX "LeadActivity_leadId_createdAt_idx" ON "LeadActivity"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "Viewing_organizationId_scheduledAt_idx" ON "Viewing"("organizationId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Viewing_leadId_idx" ON "Viewing"("leadId");

-- CreateIndex
CREATE INDEX "Deal_organizationId_stage_idx" ON "Deal"("organizationId", "stage");

-- CreateIndex
CREATE INDEX "Deal_organizationId_agentUserId_idx" ON "Deal"("organizationId", "agentUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_organizationId_code_key" ON "Deal"("organizationId", "code");

-- CreateIndex
CREATE INDEX "Hostel_ownerId_idx" ON "Hostel"("ownerId");

-- CreateIndex
CREATE INDEX "ResidentAssignment_organizationId_leaseEndDate_idx" ON "ResidentAssignment"("organizationId", "leaseEndDate");

-- AddForeignKey
ALTER TABLE "Hostel" ADD CONSTRAINT "Hostel_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PropertyOwner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyOwner" ADD CONSTRAINT "PropertyOwner_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerPayout" ADD CONSTRAINT "OwnerPayout_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerPayout" ADD CONSTRAINT "OwnerPayout_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PropertyOwner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerPayout" ADD CONSTRAINT "OwnerPayout_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_hostelId_fkey" FOREIGN KEY ("hostelId") REFERENCES "Hostel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PropertyOwner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_agentUserId_fkey" FOREIGN KEY ("agentUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_coverFileId_fkey" FOREIGN KEY ("coverFileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_agentUserId_fkey" FOREIGN KEY ("agentUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_agentUserId_fkey" FOREIGN KEY ("agentUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Backfill roles for existing organizations ───────────────────────────────
-- Owner and Admin get the new owners / sales & leasing permissions.
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT r."id", p.permission
FROM "Role" r
CROSS JOIN (VALUES ('owners.view'), ('owners.manage'), ('listings.view'), ('listings.manage'),
                   ('leads.view'), ('leads.manage'), ('deals.view'), ('deals.manage')) AS p(permission)
WHERE r."key" IN ('OWNER', 'ADMIN') AND r."isSystem" = true
ON CONFLICT DO NOTHING;

-- Accountants can see owner statements and deal commissions.
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT r."id", p.permission
FROM "Role" r
CROSS JOIN (VALUES ('owners.view'), ('deals.view')) AS p(permission)
WHERE r."key" = 'ACCOUNTANT' AND r."isSystem" = true
ON CONFLICT DO NOTHING;

-- New system role "Agent" for every organization that doesn't have it yet.
INSERT INTO "Role" ("id", "organizationId", "key", "name", "description", "isSystem", "defaultAllHostels", "createdAt", "updatedAt")
SELECT 'role_agent_' || md5(o."id"), o."id", 'AGENT', 'Agent', 'Property dealer agent: listings, leads, viewings and deals.', true, true, NOW(), NOW()
FROM "Organization" o
WHERE NOT EXISTS (SELECT 1 FROM "Role" r WHERE r."organizationId" = o."id" AND r."key" = 'AGENT');

INSERT INTO "RolePermission" ("roleId", "permission")
SELECT r."id", p.permission
FROM "Role" r
CROSS JOIN (VALUES ('dashboard.view'), ('hostels.view'), ('rooms.view'), ('listings.view'), ('listings.manage'),
                   ('leads.view'), ('leads.manage'), ('deals.view'), ('announcements.view')) AS p(permission)
WHERE r."key" = 'AGENT' AND r."isSystem" = true
ON CONFLICT DO NOTHING;
