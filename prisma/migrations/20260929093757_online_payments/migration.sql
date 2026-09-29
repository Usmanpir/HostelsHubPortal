-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('JAZZCASH', 'EASYPAISA', 'SIMULATOR');

-- CreateEnum
CREATE TYPE "GatewayEnvironment" AS ENUM ('SANDBOX', 'LIVE');

-- CreateEnum
CREATE TYPE "OnlinePaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "PaymentGatewayConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "environment" "GatewayEnvironment" NOT NULL DEFAULT 'SANDBOX',
    "merchantId" TEXT,
    "subMerchantId" TEXT,
    "secretsEncrypted" TEXT,
    "secretKeys" TEXT[],
    "lastTestedAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "PaymentGatewayConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnlinePayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "hostelId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "environment" "GatewayEnvironment" NOT NULL DEFAULT 'SANDBOX',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "OnlinePaymentStatus" NOT NULL DEFAULT 'PENDING',
    "txnRef" TEXT NOT NULL,
    "gatewayTxnId" TEXT,
    "responseCode" TEXT,
    "responseMessage" TEXT,
    "rawResponse" JSONB,
    "paymentId" TEXT,
    "initiatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastCheckedAt" TIMESTAMP(3),

    CONSTRAINT "OnlinePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentGatewayConfig_organizationId_provider_key" ON "PaymentGatewayConfig"("organizationId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "OnlinePayment_txnRef_key" ON "OnlinePayment"("txnRef");

-- CreateIndex
CREATE UNIQUE INDEX "OnlinePayment_paymentId_key" ON "OnlinePayment"("paymentId");

-- CreateIndex
CREATE INDEX "OnlinePayment_organizationId_createdAt_idx" ON "OnlinePayment"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "OnlinePayment_organizationId_hostelId_status_idx" ON "OnlinePayment"("organizationId", "hostelId", "status");

-- CreateIndex
CREATE INDEX "OnlinePayment_invoiceId_createdAt_idx" ON "OnlinePayment"("invoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "OnlinePayment_residentId_createdAt_idx" ON "OnlinePayment"("residentId", "createdAt");

-- CreateIndex
CREATE INDEX "OnlinePayment_status_createdAt_idx" ON "OnlinePayment"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "PaymentGatewayConfig" ADD CONSTRAINT "PaymentGatewayConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentGatewayConfig" ADD CONSTRAINT "PaymentGatewayConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlinePayment" ADD CONSTRAINT "OnlinePayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlinePayment" ADD CONSTRAINT "OnlinePayment_hostelId_fkey" FOREIGN KEY ("hostelId") REFERENCES "Hostel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlinePayment" ADD CONSTRAINT "OnlinePayment_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlinePayment" ADD CONSTRAINT "OnlinePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlinePayment" ADD CONSTRAINT "OnlinePayment_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlinePayment" ADD CONSTRAINT "OnlinePayment_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
