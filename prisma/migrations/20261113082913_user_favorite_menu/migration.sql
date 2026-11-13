-- CreateTable
CREATE TABLE "user_favorite_menu" (
    "userId" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_favorite_menu_pkey" PRIMARY KEY ("userId","href")
);

-- AddForeignKey
ALTER TABLE "user_favorite_menu" ADD CONSTRAINT "user_favorite_menu_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
