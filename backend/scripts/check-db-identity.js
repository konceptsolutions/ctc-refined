const { PrismaClient } = require('../node_modules/.prisma/client');
const p = new PrismaClient();

(async () => {
  const schemas = await p.$queryRawUnsafe(`
    SELECT schema_name FROM information_schema.schemata ORDER BY 1
  `);
  console.log('schemas', schemas);

  const activity = await p.$queryRawUnsafe(`
    SELECT id, action, entity, "entityId", details, "createdAt"
    FROM "ActivityLog"
    WHERE "createdAt" >= '2026-10-01'
      AND (
        details ILIKE '%DPOR%' OR details ILIKE '%return%' OR action ILIKE '%return%'
        OR entity ILIKE '%return%' OR entity ILIKE '%dpo%'
      )
    ORDER BY "createdAt" DESC
    LIMIT 30
  `).catch((e) => ({ error: e.message }));
  console.log('activity', activity);

  const tables = await p.$queryRawUnsafe(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_name ILIKE '%return%'
    ORDER BY 1,2
  `);
  console.log('return tables', tables);

  // Check current_database and inet
  const db = await p.$queryRawUnsafe(`SELECT current_database(), inet_server_addr(), inet_server_port()`);
  console.log('db info', db);

  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await p.$disconnect(); } catch (_) {}
  process.exit(1);
});
