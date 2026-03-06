const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function importItems() {
  try {
    console.log('Starting item import...');
    
    // Read the JSON file
    const rawData = fs.readFileSync('./Item-list.json', 'utf8');
    const items = JSON.parse(rawData);
    
    console.log(`Found ${items.length} items to import`);
    
    let successCount = 0;
    let errorCount = 0;
    let skipCount = 0;
    
    for (const [index, item] of items.entries()) {
      try {
        // Extract data from JSON structure
        const masterPartNo = item["Master Part no"] || item["masterPartNo"] || "";
        const description = item["Discription"] || item["description"] || "";
        const category = item["Catigory"] || item["category"] || "";
        const brand = item["brand"] || "";
        const cost = parseFloat(item["cost"]?.replace(/,/g, '') || "0");
        const priceA = parseFloat(item["price a"]?.replace(/,/g, '') || "0");
        const priceB = parseFloat(item["price b"]?.replace(/,/g, '') || "0");
        const ssPartNo = item["ss part no"] || item["ssPartNo"] || "";
        const application = item["application"] || "";
        const subCategory = item["sub catigory"] || item["subCategory"] || "";
        const origin = item["origin"] || "";
        const grade = item["grade"] || "";
        const weight = parseFloat(item["weight"]?.replace(/,/g, '') || "0");
        const size = item["size"] || "";
        
        // Skip if essential data is missing
        if (!masterPartNo || !description || !brand) {
          console.log(`Skipping item ${index + 1}: Missing essential data (Master Part No, Description, or Brand)`);
          skipCount++;
          continue;
        }
        
        // Find or create brand
        let brandRecord = await prisma.brand.findFirst({
          where: { name: { equals: brand, mode: 'insensitive' } }
        });
        
        if (!brandRecord) {
          brandRecord = await prisma.brand.create({
            data: { name: brand }
          });
          console.log(`Created new brand: ${brand}`);
        }
        
        // Find or create category
        let categoryRecord = await prisma.category.findFirst({
          where: { name: { equals: category, mode: 'insensitive' } }
        });
        
        if (!categoryRecord) {
          categoryRecord = await prisma.category.create({
            data: { name: category }
          });
          console.log(`Created new category: ${category}`);
        }
        
        // Find or create subcategory
        let subcategoryRecord = null;
        if (subCategory) {
          subcategoryRecord = await prisma.subcategory.findFirst({
            where: { name: { equals: subCategory, mode: 'insensitive' } }
          });
          
          if (!subcategoryRecord) {
            subcategoryRecord = await prisma.subcategory.create({
              data: { 
                name: subCategory,
                categoryId: categoryRecord.id
              }
            });
            console.log(`Created new subcategory: ${subCategory}`);
          }
        }
        
        // Check if part already exists
        const existingPart = await prisma.part.findFirst({
          where: { 
            OR: [
              { partNo: masterPartNo },
              { ssPartNo: ssPartNo }
            ]
          }
        });
        
        if (existingPart) {
          console.log(`Skipping item ${index + 1}: Part already exists - ${masterPartNo}`);
          skipCount++;
          continue;
        }
        
        // Create the part
        const newPart = await prisma.part.create({
          data: {
            partNo: masterPartNo,
            description: description,
            cost: cost,
            priceA: priceA,  // Only import Price A
            priceB: priceB,  // Only import Price B
            // Do NOT set priceM - keep it null/default
            uom: "PCS", // Default unit
            weight: weight,
            size: size,
            status: "active",
            brandId: brandRecord.id,
            categoryId: categoryRecord.id,
            subcategoryId: subcategoryRecord?.id,
            ssPartNo: ssPartNo,
            origin: origin,
            grade: grade,
            // Additional fields that might be useful
            reorderLevel: 0,
            minStock: 0,
            maxStock: 0
          }
        });
        
        console.log(`✅ Imported item ${index + 1}: ${masterPartNo} - ${description}`);
        successCount++;
        
      } catch (error) {
        console.error(`❌ Error importing item ${index + 1}:`, error.message);
        errorCount++;
      }
    }
    
    console.log('\n=== Import Summary ===');
    console.log(`Total items processed: ${items.length}`);
    console.log(`Successfully imported: ${successCount}`);
    console.log(`Skipped (duplicates): ${skipCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log('=====================\n');
    
  } catch (error) {
    console.error('Fatal error during import:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the import
importItems();
