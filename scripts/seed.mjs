import postgres from "postgres";
import { randomBytes } from "node:crypto";

// Creates one restaurant with a branch, a floor, a menu and a full staff roster
// so a fresh project can be signed into. Safe to re-run: every row is matched on
// its natural key first, and existing staff keep the password they already have.
const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
if (!api) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
if (!secret) {
  console.error("SUPABASE_SECRET_KEY is required to create staff logins.");
  console.error("Copy the secret (service_role) key from Project Settings > API keys and add it to .env.");
  console.error("It bypasses every access rule: keep it server-side and never prefix it with NEXT_PUBLIC_.");
  process.exit(1);
}

const domain = process.env.SEED_EMAIL_DOMAIN ?? "example.com";
// A generated password is printed once. Set SEED_PASSWORD to choose your own.
const password = process.env.SEED_PASSWORD ?? randomBytes(9).toString("base64url");
const restaurantName = process.env.SEED_RESTAURANT ?? "The Little Spoon";
const slug = restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const branchName = process.env.SEED_BRANCH ?? "Main branch";

// membership is the organisation-wide role; branch is the per-branch assignment.
// An owner needs no branch row because ownership already grants every branch.
const staff = [
  { role: "Owner", email: `owner@${domain}`, membership: "owner" },
  { role: "Manager", email: `manager@${domain}`, membership: "member", branch: "manager" },
  { role: "Host", email: `host@${domain}`, membership: "member", branch: "host" },
  { role: "Server", email: `server@${domain}`, membership: "member", branch: "server" },
  { role: "Kitchen", email: `kitchen@${domain}`, membership: "member", branch: "kitchen" },
  { role: "Cashier", email: `cashier@${domain}`, membership: "member", branch: "cashier" },
];

const dishes = [
  { name: "Pad Thai", category: "Mains", price_cents: 18000, sort_order: 1 },
  { name: "Green curry", category: "Mains", price_cents: 19500, sort_order: 2 },
  { name: "Pistachio cloud", category: "Desserts", price_cents: 22000, sort_order: 3 },
  { name: "Golden kunafa", category: "Desserts", price_cents: 18000, sort_order: 4 },
  { name: "Creamy rose milk", category: "Drinks", price_cents: 9500, sort_order: 5 },
  { name: "Iced blue latte", category: "Drinks", price_cents: 12000, sort_order: 6 },
];

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15, onnotice: () => {} });

// GoTrue owns password hashing, so logins are created through the admin API and
// only their IDs are used here. An address that already exists is reused as is.
async function ensureLogin(email) {
  const response = await fetch(`${api}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (response.ok) return { id: (await response.json()).id, created: true };
  const [existing] = await sql`select id from auth.users where email = ${email} limit 1`;
  if (existing) return { id: existing.id, created: false };
  const detail = await response.text();
  throw new Error(`could not create ${email}: ${response.status} ${detail.slice(0, 160)}`);
}

try {
  const logins = [];
  for (const person of staff) logins.push({ ...person, ...await ensureLogin(person.email) });

  const summary = await sql.begin(async tx => {
    const [found] = await tx`select id, organization_id from restaurants where slug = ${slug}`;
    let organizationId, restaurantId;
    if (found) ({ id: restaurantId, organization_id: organizationId } = found);
    else {
      [{ id: organizationId }] = await tx`insert into organizations ${tx({ name: restaurantName })} returning id`;
      [{ id: restaurantId }] = await tx`insert into restaurants ${tx({ organization_id: organizationId, name: restaurantName, slug })} returning id`;
    }

    let [branch] = await tx`select id from branches where restaurant_id = ${restaurantId} and name = ${branchName}`;
    if (!branch) [branch] = await tx`insert into branches ${tx({ organization_id: organizationId, restaurant_id: restaurantId, name: branchName })} returning id`;

    for (const person of logins) {
      await tx`insert into organization_memberships ${tx({ organization_id: organizationId, user_id: person.id, role: person.membership })}
               on conflict (organization_id, user_id) do update set role = excluded.role`;
      if (person.branch) {
        await tx`insert into branch_staff ${tx({ organization_id: organizationId, branch_id: branch.id, user_id: person.id, role: person.branch })}
                 on conflict (branch_id, user_id) do update set role = excluded.role`;
      }
    }

    await tx`insert into floors ${tx({ organization_id: organizationId, branch_id: branch.id, name: "Ground floor" })} on conflict (branch_id, name) do nothing`;
    for (const dish of dishes) {
      await tx`insert into menu_items ${tx({ ...dish, organization_id: organizationId, branch_id: branch.id })} on conflict (branch_id, name) do nothing`;
    }
    const [{ n: menuCount }] = await tx`select count(*)::int n from menu_items where branch_id = ${branch.id}`;
    return { organizationId, branchId: branch.id, menuCount };
  });

  const fresh = logins.filter(person => person.created).length;
  console.log(`\n${restaurantName} · ${branchName}`);
  console.log(`branch ${summary.branchId} · ${summary.menuCount} menu items · floor "Ground floor"\n`);
  for (const person of logins) console.log(`  ${person.role.padEnd(8)} ${person.email.padEnd(26)} ${person.created ? "new" : "already existed"}`);
  console.log(fresh ? `\nPassword for the ${fresh} new account(s): ${password}` : "\nNo new accounts; existing passwords are unchanged.");
  console.log("Sign in at /login, then open /workspace.");
  if (fresh) console.log("These are seeded demo logins. Change or remove them before this project serves real customers.");
} catch (wrapped) {
  let error = wrapped;
  while (error.cause && !error.code) error = error.cause;
  console.error(`Seeding failed${error.code ? ` [${error.code}]` : ""}: ${error.message}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
