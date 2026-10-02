const { PrismaClient } = require('../node_modules/.prisma/client');
const p = new PrismaClient();
(async () => {
  const migs = await p.$queryRawUnsafe(`
    SELECT migration_name, finished_at
    FROM _prisma_migrations
    WHERE migration_name ILIKE '%ai%'
       OR migration_name ILIKE '%cleared%'
       OR migration_name ILIKE '%index%'
       OR migration_name ILIKE '%2026092%'
       OR migration_name ILIKE '%2026093%'
       OR migration_name ILIKE '%202610%'
    ORDER BY finished_at DESC NULLS LAST
  `);
  console.log('filtered migrations', migs);

  const tables = await p.$queryRawUnsafe(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public'
      AND table_name IN ('AiLearnedFact','AiMessageFeedback','UserPasswordHistory')
    ORDER BY table_name
  `);
  console.log('tables', tables);

  const cols = await p.$queryRawUnsafe(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema='public'
      AND (
        column_name IN ('isCleared','confirmQuantity','confirmKhiQuantity','isTemporary','tempPartNo','tempBrand')
        OR column_name ILIKE '%cleared%'
      )
    ORDER BY table_name, column_name
  `);
  console.log('notable columns', cols);

  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await p.$disconnect(); } catch (_) {}
  process.exit(1);
});
