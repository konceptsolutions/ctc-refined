/**
 * Count parts where movement stock != sum of PartRackShelf quantities.
 * Run: npx tsx src/scripts/count_stock_location_mismatch.ts
 */
import prisma from "../config/database";

async function main() {
  const [summary] = await prisma.$queryRaw<
    {
      mismatched_all_movements: number;
      mismatched_excl_reservation: number;
      total_parts: number;
    }[]
  >`
    WITH movement_all AS (
      SELECT
        sm."partId",
        SUM(CASE WHEN sm.type = 'in' THEN sm.quantity ELSE -sm.quantity END)::int AS stock_qty
      FROM "StockMovement" sm
      GROUP BY sm."partId"
    ),
    movement_excl_res AS (
      SELECT
        sm."partId",
        SUM(
          CASE
            WHEN sm."referenceType" = 'stock_reservation' THEN 0
            WHEN sm.type = 'in' THEN sm.quantity
            ELSE -sm.quantity
          END
        )::int AS stock_qty
      FROM "StockMovement" sm
      GROUP BY sm."partId"
    ),
    rack_shelf AS (
      SELECT
        prs."partId",
        COALESCE(SUM(prs.quantity), 0)::int AS located_qty
      FROM "PartRackShelf" prs
      GROUP BY prs."partId"
    )
    SELECT
      COUNT(*) FILTER (
        WHERE COALESCE(ma.stock_qty, 0) <> COALESCE(rs.located_qty, 0)
      )::int AS mismatched_all_movements,
      COUNT(*) FILTER (
        WHERE COALESCE(me.stock_qty, 0) <> COALESCE(rs.located_qty, 0)
      )::int AS mismatched_excl_reservation,
      COUNT(*)::int AS total_parts
    FROM "Part" p
    LEFT JOIN movement_all ma ON ma."partId" = p.id
    LEFT JOIN movement_excl_res me ON me."partId" = p.id
    LEFT JOIN rack_shelf rs ON rs."partId" = p.id
  `;

  const breakdown = await prisma.$queryRaw<
    {
      diff_sign: string;
      count: number;
    }[]
  >`
    WITH movement_stock AS (
      SELECT
        sm."partId",
        SUM(CASE WHEN sm.type = 'in' THEN sm.quantity ELSE -sm.quantity END)::int AS stock_qty
      FROM "StockMovement" sm
      GROUP BY sm."partId"
    ),
    rack_shelf_stock AS (
      SELECT
        prs."partId",
        COALESCE(SUM(prs.quantity), 0)::int AS located_qty
      FROM "PartRackShelf" prs
      GROUP BY prs."partId"
    )
    SELECT
      CASE
        WHEN COALESCE(m.stock_qty, 0) > COALESCE(r.located_qty, 0) THEN 'stock > rack/shelf (unlocated)'
        WHEN COALESCE(m.stock_qty, 0) < COALESCE(r.located_qty, 0) THEN 'stock < rack/shelf (over-assigned)'
        ELSE 'match'
      END AS diff_sign,
      COUNT(*)::int AS count
    FROM "Part" p
    LEFT JOIN movement_stock m ON m."partId" = p.id
    LEFT JOIN rack_shelf_stock r ON r."partId" = p.id
    GROUP BY 1
    ORDER BY 1
  `;

  const topMismatches = await prisma.$queryRaw<
    {
      part_no: string;
      brand: string | null;
      stock_qty: number;
      rack_shelf_qty: number;
      difference: number;
      location_rows: number;
    }[]
  >`
    WITH movement_stock AS (
      SELECT
        sm."partId",
        SUM(CASE WHEN sm.type = 'in' THEN sm.quantity ELSE -sm.quantity END)::int AS stock_qty
      FROM "StockMovement" sm
      GROUP BY sm."partId"
    ),
    rack_shelf_stock AS (
      SELECT
        prs."partId",
        COALESCE(SUM(prs.quantity), 0)::int AS located_qty,
        COUNT(*)::int AS location_rows
      FROM "PartRackShelf" prs
      GROUP BY prs."partId"
    )
    SELECT
      p."partNo" AS part_no,
      b.name AS brand,
      COALESCE(m.stock_qty, 0) AS stock_qty,
      COALESCE(r.located_qty, 0) AS rack_shelf_qty,
      COALESCE(m.stock_qty, 0) - COALESCE(r.located_qty, 0) AS difference,
      COALESCE(r.location_rows, 0) AS location_rows
    FROM "Part" p
    LEFT JOIN "Brand" b ON p."brandId" = b.id
    LEFT JOIN movement_stock m ON m."partId" = p.id
    LEFT JOIN rack_shelf_stock r ON r."partId" = p.id
    WHERE COALESCE(m.stock_qty, 0) <> COALESCE(r.located_qty, 0)
    ORDER BY ABS(COALESCE(m.stock_qty, 0) - COALESCE(r.located_qty, 0)) DESC
    LIMIT 15
  `;

  console.log("\n=== Stock vs Rack/Shelf Mismatch Report ===\n");
  console.log("Total parts in DB:", summary.total_parts);
  console.log(
    "Mismatched (all movements):",
    summary.mismatched_all_movements,
  );
  console.log(
    "Mismatched (excl. stock_reservation):",
    summary.mismatched_excl_reservation,
  );
  console.log("\nBreakdown (all movements):");
  for (const row of breakdown) {
    console.log(`  ${row.diff_sign}: ${row.count}`);
  }
  console.log("\nTop 15 mismatches by absolute difference:");
  console.table(topMismatches);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
