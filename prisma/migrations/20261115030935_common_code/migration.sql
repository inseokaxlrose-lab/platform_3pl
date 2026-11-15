-- CreateTable
CREATE TABLE "code_group" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "code_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_item" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "code_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "code_group_code_key" ON "code_group"("code");

-- CreateIndex
CREATE INDEX "code_item_groupId_sortOrder_idx" ON "code_item"("groupId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "code_item_groupId_code_key" ON "code_item"("groupId", "code");

-- AddForeignKey
ALTER TABLE "code_item" ADD CONSTRAINT "code_item_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "code_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
