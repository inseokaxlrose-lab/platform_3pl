-- CreateTable
CREATE TABLE "user_grid_setting" (
    "userId" TEXT NOT NULL,
    "gridId" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_grid_setting_pkey" PRIMARY KEY ("userId","gridId")
);

-- AddForeignKey
ALTER TABLE "user_grid_setting" ADD CONSTRAINT "user_grid_setting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
