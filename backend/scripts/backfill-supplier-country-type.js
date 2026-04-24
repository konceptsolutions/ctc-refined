const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const normalizeCountry = (value) => String(value || "").trim().toLowerCase();

const inferSupplierTypeFromCountry = (country) => {
  const normalized = normalizeCountry(country);
  if (normalized === "" || normalized === "pakistan" || normalized === "pk") {
    return "local";
  }
  return "international";
};

const inferCurrencyFromCountry = (country, type) => {
  if (type === "local") return "PKR";

  const normalizedCountry = normalizeCountry(country);
  const countryCurrencyMap = {
    "united states": "USD",
    usa: "USD",
    us: "USD",
    "saudi arabia": "SAR",
    uae: "AED",
    "united arab emirates": "AED",
    china: "CNY",
    india: "INR",
    japan: "JPY",
    uk: "GBP",
    "united kingdom": "GBP",
    germany: "EUR",
    france: "EUR",
    italy: "EUR",
    spain: "EUR",
    turkey: "TRY",
    malaysia: "MYR",
    thailand: "THB",
    singapore: "SGD",
    canada: "CAD",
    australia: "AUD",
  };

  return countryCurrencyMap[normalizedCountry] || "USD";
};

async function run() {
  const suppliers = await prisma.supplier.findMany({
    select: { id: true, country: true, type: true, currencyName: true },
  });

  let updatedCount = 0;
  for (const supplier of suppliers) {
    const nextType = inferSupplierTypeFromCountry(supplier.country);
    const nextCurrencyName = inferCurrencyFromCountry(supplier.country, nextType);
    const currentCurrencyName = supplier.currencyName || "";

    if (supplier.type !== nextType || currentCurrencyName !== nextCurrencyName) {
      await prisma.supplier.update({
        where: { id: supplier.id },
        data: {
          type: nextType,
          currencyName: nextCurrencyName,
        },
      });
      updatedCount += 1;
    }
  }

  console.log(
    `Suppliers scanned: ${suppliers.length}, updated: ${updatedCount}`,
  );
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
