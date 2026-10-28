ALTER TABLE "UserPermission" ADD COLUMN IF NOT EXISTS "sessionMinutes" INTEGER;
ALTER TABLE "PermissionApproval" ADD COLUMN IF NOT EXISTS "sessionEndsAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);
