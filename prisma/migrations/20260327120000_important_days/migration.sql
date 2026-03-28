-- CreateTable
CREATE TABLE "ImportantDay" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportantDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImportantDay_userId_date_key" ON "ImportantDay"("userId", "date");

-- AddForeignKey
ALTER TABLE "ImportantDay" ADD CONSTRAINT "ImportantDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
