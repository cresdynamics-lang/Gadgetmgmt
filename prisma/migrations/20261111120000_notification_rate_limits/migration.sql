CREATE TABLE "NotificationRateLimit" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,
    CONSTRAINT "NotificationRateLimit_pkey" PRIMARY KEY ("key")
);
