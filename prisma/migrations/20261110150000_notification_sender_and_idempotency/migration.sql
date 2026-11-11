-- AlterTable
ALTER TABLE "StaffAlert" ADD COLUMN     "requestKey" TEXT,
ADD COLUMN     "senderId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "StaffAlert_requestKey_key" ON "StaffAlert"("requestKey");

-- CreateIndex
CREATE INDEX "StaffAlert_senderId_createdAt_idx" ON "StaffAlert"("senderId", "createdAt");

-- AddForeignKey
ALTER TABLE "StaffAlert" ADD CONSTRAINT "StaffAlert_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

