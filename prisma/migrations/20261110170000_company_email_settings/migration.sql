-- CreateTable
CREATE TABLE "NotificationEmailSettings" (
    "id" TEXT NOT NULL DEFAULT 'company',
    "senderEmail" TEXT NOT NULL,
    "senderName" TEXT NOT NULL DEFAULT 'GadgetHub',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationEmailSettings_pkey" PRIMARY KEY ("id")
);
