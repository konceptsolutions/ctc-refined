const crypto = require('crypto');
const { PrismaClient } = require('../node_modules/.prisma/client');
const p = new PrismaClient();

(async () => {
  // Ensure AI self-learning migration is recorded if tables already exist
  const aiTables = await p.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS c FROM information_schema.tables
    WHERE table_schema='public' AND table_name IN ('AiLearnedFact','AiMessageFeedback')
  `);
  if (aiTables[0]?.c === 2) {
    await p.$executeRawUnsafe(`
      INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      SELECT $1, 'manual', NOW(), '20260923120000_ai_self_learning', NULL, NULL, NOW(), 1
      WHERE NOT EXISTS (
        SELECT 1 FROM _prisma_migrations WHERE migration_name = '20260923120000_ai_self_learning'
      )
    `, crypto.randomUUID());
    console.log('ensured recorded: 20260923120000_ai_self_learning');
  }

  // Apply index migration idempotently + record
  const fs = require('fs');
  const path = require('path');
  const sqlPath = path.join(
    __dirname,
    '../prisma/migrations/20261001120000_part_list_performance_indexes/migration.sql',
  );
  const sql = fs.readFileSync(sqlPath, 'utf8');
  for (const stmt of sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('--'))) {
    await p.$executeRawUnsafe(stmt);
  }

  await p.$executeRawUnsafe(`
    INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
    SELECT $1, 'manual', NOW(), '20261001120000_part_list_performance_indexes', NULL, NULL, NOW(), 1
    WHERE NOT EXISTS (
      SELECT 1 FROM _prisma_migrations WHERE migration_name = '20261001120000_part_list_performance_indexes'
    )
  `, crypto.randomUUID());

  console.log('ensured recorded: 20261001120000_part_list_performance_indexes');

  const recent = await p.$queryRawUnsafe(`
    SELECT migration_name, finished_at
    FROM _prisma_migrations
    ORDER BY finished_at DESC NULLS LAST
    LIMIT 8
  `);
  console.log(recent);
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await p.$disconnect(); } catch (_) {}
  process.exit(1);
});
