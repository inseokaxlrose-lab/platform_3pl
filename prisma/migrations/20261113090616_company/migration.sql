-- CreateTable
CREATE TABLE "company" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL,
    "businessNumber" TEXT NOT NULL,
    "ceoName" TEXT,
    "businessType" TEXT,
    "businessItem" TEXT,
    "phone" TEXT,
    "fax" TEXT,
    "email" TEXT,
    "zipCode" TEXT,
    "address" TEXT,
    "addressDetail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_contact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "duty" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,

    CONSTRAINT "company_contact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_contact_companyId_sortOrder_idx" ON "company_contact"("companyId", "sortOrder");

-- AddForeignKey
ALTER TABLE "company" ADD CONSTRAINT "company_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_contact" ADD CONSTRAINT "company_contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
