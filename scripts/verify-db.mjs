import postgres from "postgres";

// Checks that the applied migration really enforces what the schema claims.
// Everything runs inside one transaction that is always rolled back, so this is
// safe against a configured project and leaves no rows behind.
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const tables = ["organizations", "organization_memberships", "restaurants", "branches", "branch_staff",
  "floors", "layout_versions", "dining_tables", "queue_entries", "menu_items", "orders", "order_items"];
const uuid = () => crypto.randomUUID();
let passed = 0, failed = 0;
const ok = name => { passed++; console.log(`  ok    ${name}`); };
const bad = (name, detail) => { failed++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); };

// A constraint proves itself by refusing the write, not by accepting it.
async function refuses(sql, name, write) {
  try {
    await sql.savepoint(tx => write(tx));
    bad(name, "the database accepted it");
  } catch (error) {
    if (error.code?.startsWith("23")) ok(`${name} [${error.code}]`);
    else bad(name, `unexpected ${error.code ?? ""} ${error.message}`);
  }
}

class Rollback extends Error {}
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15, onnotice: () => {} });

try {
  const present = await sql`select tablename, rowsecurity from pg_tables where schemaname = 'public'`;
  const byName = new Map(present.map(row => [row.tablename, row.rowsecurity]));
  for (const table of tables) {
    if (!byName.has(table)) bad(`table ${table} exists`, "missing — run npm run db:migrate");
    else if (!byName.get(table)) bad(`RLS enabled on ${table}`, "row security is OFF");
    else ok(`${table} present, RLS on`);
  }
  if (failed) throw new Rollback();

  await sql.begin(async tx => {
    const orgA = uuid(), orgB = uuid(), restA = uuid(), restB = uuid(), branchA = uuid(), floorA = uuid(), tableA = uuid();
    const tag = Date.now();
    await tx`insert into organizations ${tx([{ id: orgA, name: "verify A" }, { id: orgB, name: "verify B" }])}`;
    await tx`insert into restaurants ${tx([{ id: restA, organization_id: orgA, name: "A", slug: `verify-a-${tag}` }, { id: restB, organization_id: orgB, name: "B", slug: `verify-b-${tag}` }])}`;
    await tx`insert into branches ${tx({ id: branchA, organization_id: orgA, restaurant_id: restA, name: "Main" })}`;
    await tx`insert into floors ${tx({ id: floorA, organization_id: orgA, branch_id: branchA, name: "Ground" })}`;
    ok("seeded a tenant");

    // The composite foreign keys are the cross-tenant guard: one organization
    // must never be able to attach another organization's rows to itself.
    await refuses(tx, "a branch cannot borrow another org's restaurant", t =>
      t`insert into branches ${t({ id: uuid(), organization_id: orgA, restaurant_id: restB, name: "Stolen" })}`);
    await refuses(tx, "a floor cannot sit in another org's branch", t =>
      t`insert into floors ${t({ id: uuid(), organization_id: orgB, branch_id: branchA, name: "Stolen" })}`);

    const canvas = JSON.stringify({ width: 1000, height: 700, objects: [] });
    await tx`insert into layout_versions ${tx({ id: uuid(), organization_id: orgA, branch_id: branchA, floor_id: floorA, version: 1, state: "published", canvas })}`;
    await refuses(tx, "only one published layout per floor", t =>
      t`insert into layout_versions ${t({ id: uuid(), organization_id: orgA, branch_id: branchA, floor_id: floorA, version: 2, state: "published", canvas })}`);
    await tx`insert into layout_versions ${tx({ id: uuid(), organization_id: orgA, branch_id: branchA, floor_id: floorA, version: 3, state: "draft", canvas })}`;
    await refuses(tx, "only one draft layout per floor", t =>
      t`insert into layout_versions ${t({ id: uuid(), organization_id: orgA, branch_id: branchA, floor_id: floorA, version: 4, state: "draft", canvas })}`);

    const table = extra => ({ id: uuid(), organization_id: orgA, branch_id: branchA, floor_id: floorA, label: "01", capacity: 4, ...extra });
    await tx`insert into dining_tables ${tx(table({ id: tableA }))}`;
    await refuses(tx, "table numbers are unique per branch", t => t`insert into dining_tables ${t(table())}`);
    await refuses(tx, "a table cannot seat zero", t => t`insert into dining_tables ${t(table({ label: "02", capacity: 0 }))}`);
    await refuses(tx, "a retired table cannot stay occupied", t => t`insert into dining_tables ${t(table({ label: "03", enabled: false, state: "occupied" }))}`);
    await refuses(tx, "an unknown table state is rejected", t => t`insert into dining_tables ${t(table({ label: "04", state: "vip" }))}`);

    const menuA = uuid();
    await tx`insert into menu_items ${tx({ id: menuA, organization_id: orgA, branch_id: branchA, name: "Pad Thai", category: "Main", price_cents: 18000 })}`;
    await refuses(tx, "a menu price cannot be negative", t =>
      t`insert into menu_items ${t({ id: uuid(), organization_id: orgA, branch_id: branchA, name: "Free", category: "Main", price_cents: -1 })}`);

    const orderA = uuid();
    await tx`insert into orders ${tx({ id: orderA, organization_id: orgA, branch_id: branchA, table_id: tableA })}`;
    await refuses(tx, "an order cannot point at another org's table", t =>
      t`insert into orders ${t({ id: uuid(), organization_id: orgB, branch_id: branchA, table_id: tableA })}`);
    await tx`insert into order_items ${tx({ id: uuid(), organization_id: orgA, branch_id: branchA, order_id: orderA, menu_item_id: menuA, name: "Pad Thai", unit_price_cents: 18000, quantity: 2 })}`;
    await refuses(tx, "an order line cannot have zero quantity", t =>
      t`insert into order_items ${t({ id: uuid(), organization_id: orgA, branch_id: branchA, order_id: orderA, menu_item_id: menuA, name: "Pad Thai", unit_price_cents: 18000, quantity: 0 })}`);
    await refuses(tx, "a role outside the staff set is rejected", t =>
      t`insert into organization_memberships ${t({ id: uuid(), organization_id: orgA, user_id: uuid(), role: "superuser" })}`);

    throw new Rollback();
  }).catch(error => { if (!(error instanceof Rollback)) throw error; });

  console.log(`\n${passed} checks passed, ${failed} failed. Nothing was written; the transaction rolled back.`);
  process.exitCode = failed ? 1 : 0;
} catch (wrapped) {
  if (wrapped instanceof Rollback) { console.log(`\n${passed} passed, ${failed} failed.`); process.exitCode = 1; }
  else {
    let error = wrapped;
    while (error.cause && !error.code) error = error.cause;
    console.error(`Verification failed${error.code ? ` [${error.code}]` : ""}: ${error.message}`);
    if (error.code === "28P01") console.error("The database password is wrong. Reset it under Project Settings > Database.");
    process.exitCode = 1;
  }
} finally {
  await sql.end({ timeout: 5 });
}
