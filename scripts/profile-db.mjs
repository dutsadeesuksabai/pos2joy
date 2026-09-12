import postgres from "postgres";

// Read-only operational probe. Output contains plans/timings, never guest rows,
// credentials or query parameters. Run with a branch UUID, before/after indexes.
const branchId = process.argv[2];
if (!process.env.DATABASE_URL || !/^[0-9a-f-]{36}$/i.test(branchId ?? "")) {
  console.error("Usage: npm run db:profile -- <branch-uuid> (DATABASE_URL required)");
  process.exit(1);
}
const db = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, connect_timeout: 10, onnotice: () => {} });
try {
  const profiles = await db.begin("read only", async tx => {
    await tx`set local statement_timeout = '10s'`;
    const [branch] = await tx`select organization_id from branches where id = ${branchId}`;
    if (!branch) throw new Error("BRANCH_NOT_FOUND");
    const queries = [
      ["active queue", "select id, guest_name, party_size, status, joined_at from queue_entries where branch_id = $1 and organization_id = $2 and status in ('waiting','offered') order by joined_at, id"],
      ["service bill lines", "select o.id, o.table_id, o.status, o.created_at, i.name, i.quantity, i.unit_price_cents from orders o left join order_items i on i.order_id = o.id where o.branch_id = $1 and o.organization_id = $2 and o.status in ('placed','preparing','served') order by i.name"],
      ["guest menu", "select id, name, category, price_cents from menu_items where branch_id = $1 and organization_id = $2 and available = true order by sort_order, name"],
    ];
    const results = [];
    for (const [name, query] of queries) {
      const samples = [];
      let plan;
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        const [result] = await tx.unsafe(`explain (analyze, buffers, format json) ${query}`, [branchId, branch.organization_id]);
        plan = result["QUERY PLAN"][0];
        samples.push({ roundTripMs: performance.now() - start, executionMs: plan["Execution Time"] });
      }
      const nodes = [];
      const visit = node => { nodes.push({ type: node["Node Type"], index: node["Index Name"], actualRows: node["Actual Rows"], sharedHits: node["Shared Hit Blocks"], sharedReads: node["Shared Read Blocks"] }); for (const child of node.Plans ?? []) visit(child); };
      visit(plan.Plan);
      results.push({ name, samples, nodes });
    }
    return results;
  });
  console.log(JSON.stringify({ readOnly: true, profiles }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ profile: "unavailable", code: error.code ?? (error.message === "BRANCH_NOT_FOUND" ? error.message : "unknown") }));
  process.exitCode = 1;
} finally { await db.end({ timeout: 3 }); }
