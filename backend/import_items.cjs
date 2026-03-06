const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function importItems() {
  try {
    console.log('Starting item import...');
    
    // Read the JSON file
    const rawData = fs.readFileSync('../Item-list.json', 'utf8');
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
        
        // Only parse priceA if it's not empty
        const priceAValue = item["price a"]?.replace(/,/g, '').trim();
        const priceA = priceAValue && priceAValue !== "" ? parseFloat(priceAValue) : null;
        
        // Only parse priceB if it's not empty
        const priceBValue = item["price b"]?.replace(/,/g, '').trim();
        const priceB = priceBValue && priceBValue !== "" ? parseFloat(priceBValue) : null;
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
        
        // Check if part already exists by partNo only (ssPartNo field doesn't exist in schema)
        const existingPart = await prisma.part.findFirst({
          where: {
            partNo: masterPartNo
          }
        });

        if (existingPart) {
          // Update only Price A and Price B for existing part
          await prisma.part.update({
            where: { id: existingPart.id },
            data: {
              priceA: priceA,
              priceB: priceB
            }
          });
          console.log(`✅ Updated Price A/B for existing item ${index + 1}: ${masterPartNo} (A: ${priceA}, B: ${priceB})`);
          successCount++;
          continue;
        }

        // If part doesn't exist, create minimal part with only essential fields + Price A/B
        // Find or create brand (required for part creation)
        let brandRecord = await prisma.brand.findFirst({
          where: { name: { equals: brand, mode: 'insensitive' } }
        });

        if (!brandRecord) {
          brandRecord = await prisma.brand.create({
            data: { name: brand }
          });
          console.log(`Created new brand: ${brand}`);
        }

        // Create the part with minimal data + Price A/B
        const newPart = await prisma.part.create({
          data: {
            partNo: masterPartNo,
            description: description || masterPartNo, // Use partNo as fallback description
            cost: cost || 0,
            priceA: priceA,  // Only import Price A
            priceB: priceB,  // Only import Price B
            // Do NOT set priceM - keep it null/default
            uom: "PCS", // Default unit
            weight: weight || 0,
            status: "active",
            brandId: brandRecord.id,
            // Optional fields only if they exist
            ...(origin && { origin }),
            ...(grade && { grade })
          }
        });

        console.log(`✅ Created new item ${index + 1}: ${masterPartNo} with Price A: ${priceA}, Price B: ${priceB}`);
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
