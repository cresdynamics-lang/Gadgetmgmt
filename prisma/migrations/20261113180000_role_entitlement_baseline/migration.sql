-- Preserve legacy template editing without granting individual staff permissions.
CREATE TABLE "RoleEntitlement" (
    "role" "UserRole" NOT NULL,
    "pages" TEXT[],
    "capabilities" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RoleEntitlement_pkey" PRIMARY KEY ("role")
);
