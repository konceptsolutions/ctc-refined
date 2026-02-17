-- Migration to Add Foreign Keys to Remaining Tables
-- This script adds the missing foreign key relationships

-- 1. Add accountId to Customer table
ALTER TABLE "Customer" 
ADD COLUMN IF NOT EXISTS "accountId" TEXT;

-- Add foreign key constraint for Customer -> Account
ALTER TABLE "Customer" 
ADD CONSTRAINT IF NOT EXISTS "Customer_accountId_fkey" 
FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL;

-- 2. Add categoryId to Brand table
ALTER TABLE "Brand" 
ADD COLUMN IF NOT EXISTS "categoryId" TEXT;

-- Add foreign key constraint for Brand -> Category
ALTER TABLE "Brand" 
ADD CONSTRAINT IF NOT EXISTS "Brand_categoryId_fkey" 
FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL;

-- 3. Add mainGroupId to Category table
ALTER TABLE "Category" 
ADD COLUMN IF NOT EXISTS "mainGroupId" TEXT;

-- Add foreign key constraint for Category -> MainGroup
ALTER TABLE "Category" 
ADD CONSTRAINT IF NOT EXISTS "Category_mainGroupId_fkey" 
FOREIGN KEY ("mainGroupId") REFERENCES "MainGroup"("id") ON DELETE SET NULL;

-- 4. Add companyId to Store table
ALTER TABLE "Store" 
ADD COLUMN IF NOT EXISTS "companyId" TEXT;

-- Add foreign key constraint for Store -> CompanyProfile
ALTER TABLE "Store" 
ADD CONSTRAINT IF NOT EXISTS "Store_companyId_fkey" 
FOREIGN KEY ("companyId") REFERENCES "CompanyProfile"("id") ON DELETE SET NULL;

-- 5. Add indexes for performance
CREATE INDEX IF NOT EXISTS "idx_Customer_accountId" ON "Customer"("accountId");
CREATE INDEX IF NOT EXISTS "idx_Brand_categoryId" ON "Brand"("categoryId");
CREATE INDEX IF NOT EXISTS "idx_Category_mainGroupId" ON "Category"("mainGroupId");
CREATE INDEX IF NOT EXISTS "idx_Store_companyId" ON "Store"("companyId");

-- 6. Verify the foreign keys were added successfully
SELECT 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_name IN ('Customer', 'Brand', 'Category', 'Store')
ORDER BY tc.table_name, kcu.column_name;

-- 7. Update statistics
ANALYZE "Customer";
ANALYZE "Brand";
ANALYZE "Category";
ANALYZE "Store";

-- Migration completed
SELECT 'Foreign keys added successfully to Customer, Brand, Category, and Store tables' as migration_status;
