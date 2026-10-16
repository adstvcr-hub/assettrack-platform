CREATE TYPE "RestaurantPaymentMethod" AS ENUM ('CASH', 'SINPE', 'CARD', 'OTHER');
CREATE TYPE "RestaurantSupplierInvoiceStatus" AS ENUM ('PENDING', 'PAID');

ALTER TABLE "restaurant_visits"
  ADD COLUMN "paymentMethod" "RestaurantPaymentMethod",
  ADD COLUMN "paymentReference" TEXT;

ALTER TABLE "restaurant_cash_sessions"
  ADD COLUMN "openingCash" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "expectedCash" INTEGER,
  ADD COLUMN "countedCash" INTEGER,
  ADD COLUMN "discrepancy" INTEGER;

ALTER TABLE "restaurant_cash_day_closes"
  ADD COLUMN "openingCash" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cashSales" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sinpeSales" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cardSales" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "otherSales" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "supplierInvoicesTotal" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "supplierPaymentsTotal" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "employeePaymentsTotal" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "expectedCash" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "countedCash" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "discrepancy" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "restaurant_supplier_invoices" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "cashSessionId" TEXT NOT NULL,
  "recordedById" TEXT NOT NULL,
  "supplierName" TEXT NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "invoiceDate" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "status" "RestaurantSupplierInvoiceStatus" NOT NULL DEFAULT 'PENDING',
  "paymentMethod" "RestaurantPaymentMethod",
  "paidAt" TIMESTAMP(3),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_supplier_invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "restaurant_employee_payments" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "cashSessionId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "recordedById" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "paymentMethod" "RestaurantPaymentMethod" NOT NULL,
  "note" TEXT,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_employee_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "restaurant_supplier_invoices_organizationId_supplierName_invoiceNumber_key" ON "restaurant_supplier_invoices"("organizationId", "supplierName", "invoiceNumber");
CREATE INDEX "restaurant_supplier_invoices_organizationId_createdAt_idx" ON "restaurant_supplier_invoices"("organizationId", "createdAt");
CREATE INDEX "restaurant_supplier_invoices_cashSessionId_idx" ON "restaurant_supplier_invoices"("cashSessionId");
CREATE INDEX "restaurant_employee_payments_organizationId_paidAt_idx" ON "restaurant_employee_payments"("organizationId", "paidAt");
CREATE INDEX "restaurant_employee_payments_cashSessionId_idx" ON "restaurant_employee_payments"("cashSessionId");
CREATE INDEX "restaurant_employee_payments_employeeId_paidAt_idx" ON "restaurant_employee_payments"("employeeId", "paidAt");

ALTER TABLE "restaurant_supplier_invoices" ADD CONSTRAINT "restaurant_supplier_invoices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restaurant_supplier_invoices" ADD CONSTRAINT "restaurant_supplier_invoices_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "restaurant_cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "restaurant_supplier_invoices" ADD CONSTRAINT "restaurant_supplier_invoices_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "restaurant_employee_payments" ADD CONSTRAINT "restaurant_employee_payments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restaurant_employee_payments" ADD CONSTRAINT "restaurant_employee_payments_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "restaurant_cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "restaurant_employee_payments" ADD CONSTRAINT "restaurant_employee_payments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "restaurant_employee_payments" ADD CONSTRAINT "restaurant_employee_payments_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
