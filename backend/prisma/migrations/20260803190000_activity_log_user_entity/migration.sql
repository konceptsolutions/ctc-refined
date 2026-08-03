-- AlterTable
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "entityType" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "entityId" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "entityLabel" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ActivityLog_userId_idx" ON "ActivityLog"("userId");
CREATE INDEX IF NOT EXISTS "ActivityLog_entityType_entityId_idx" ON "ActivityLog"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");
CREATE INDEX IF NOT EXISTS "ActivityLog_actionType_idx" ON "ActivityLog"("actionType");
CREATE INDEX IF NOT EXISTS "ActivityLog_module_idx" ON "ActivityLog"("module");
