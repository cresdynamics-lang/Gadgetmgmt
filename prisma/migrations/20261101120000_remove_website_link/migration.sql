-- The public website is no longer linked to operations: drop its copied orders, messages,
-- live snapshot, visibility flag and the website permission.

-- DropIndex
DROP INDEX IF EXISTS "Product_showOnWebsite_idx";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN IF EXISTS "showOnWebsite";

-- DropTable
DROP TABLE IF EXISTS "WebsiteMessage";

-- DropTable
DROP TABLE IF EXISTS "WebsiteOrder";

-- Remove leftover website settings and grants
DELETE FROM "AppSetting" WHERE "key" LIKE 'website%';
DELETE FROM "UserPermission" WHERE "permission" = 'website.view';
