# Supabase staff-access setup

Implemented source: password sign-in/sign-out, cookie refresh, server-verified identity, authorized restaurant/branch discovery through Drizzle, and branch role checks. This integration has not been executed against Supabase in this environment. The `/` demo still uses only in-memory sample data.

## 1. Install and check the application

```sh
npm install
npm run typecheck
npm test
npm run build
```

The current environment rejects npm registry requests with `EACCES`; there is no lockfile yet. Run these commands from an environment with registry access and commit the resolved lockfile. Do not treat the dependency-free tests as a substitute for the build or database tests.

## 2. Configure one Supabase project

Copy `.env.example` to `.env` and enter the project URL, publishable key, and PostgreSQL connection URL. Keep these values local; do not paste the database password into chat or client code. Enable email/password authentication and create individual staff accounts through Supabase Auth for the initial setup. No public signup, invitation sender, or password-reset flow is implemented yet.

`DATABASE_URL` is used only by server-side Drizzle and the explicit migration command. This initial implementation relies on a private database role with access to these RLS-protected tables, typically the Supabase database owner. Every application query independently verifies the current user and membership. Before broad production use, separate the migration identity from a restricted application database role and audit every new data-access method. A browser publishable key cannot access these tables.

Use a direct or session-mode PostgreSQL connection supported by the deployment environment for migrations. The application disables prepared statements and uses a small connection pool. Adjust pool size for the final hosting concurrency; deploy to a Node-capable host with PostgreSQL network access.

## 3. Generate, inspect, and apply the schema

```sh
npm run db:generate
```

Review the SQL under `drizzle/`. It must contain RLS enablement on every table, composite foreign keys, role/status CHECK constraints, and the unique partial index for published layouts. This checkout has not generated or applied migrations. If any prior migration has been applied elsewhere, preserve its history and generate an incremental change; the queue timestamp column is now correctly named `joined_at`.

Once the generated migration is reviewed:

```sh
npm run db:migrate
```

This command reads `.env` and applies migrations explicitly. Application startup does not modify the database. All core tables have RLS enabled with **no client policies**, so `anon` and `authenticated` Data API callers have no row access. This is intentional: current staff data goes through verified server queries. Add carefully scoped policies and integration tests before introducing client-side Realtime or Data API queries.

## 4. Seed a restaurant and its staff

```sh
npm run db:seed
```

Creates one restaurant with a branch, a ground floor, a short menu, and six logins:
an owner plus a manager, host, server, kitchen, and cashier, each already assigned
the matching branch role. Logins are created through the Supabase admin API, so this
needs `SUPABASE_SECRET_KEY` (the secret/service_role key) in `.env`. That key bypasses
every access rule: keep it server-side and never give it a `NEXT_PUBLIC_` prefix.

The generated password is printed once, at the end of the run. Set `SEED_PASSWORD` to
choose your own, and `SEED_RESTAURANT`, `SEED_BRANCH`, or `SEED_EMAIL_DOMAIN` to change
the names. Re-running is safe: rows are matched on their natural keys and accounts that
already exist keep the password they have. **These are demo logins. Change or remove
them before the project serves real customers.**

### Assigning an owner by hand


Prefer `npm run db:seed` above. To create a business for a real owner instead, create them in Supabase Auth, take their user UUID, and run this transaction in the Supabase SQL editor with your own details.

```sql
begin;

do $$
declare
  owner_user_id uuid := 'REPLACE-WITH-AUTH-USER-UUID';
  new_organization_id uuid;
  new_restaurant_id uuid;
begin
  if not exists (select 1 from auth.users where id = owner_user_id) then
    raise exception 'Create this user in Supabase Auth first';
  end if;

  insert into public.organizations (name)
  values ('Little Spoon Group') returning id into new_organization_id;

  insert into public.organization_memberships (organization_id, user_id, role)
  values (new_organization_id, owner_user_id, 'owner');

  insert into public.restaurants (organization_id, name, slug)
  values (new_organization_id, 'The Little Spoon', 'the-little-spoon')
  returning id into new_restaurant_id;

  insert into public.branches (organization_id, restaurant_id, name, timezone, currency)
  values (new_organization_id, new_restaurant_id, 'Main branch', 'Asia/Bangkok', 'THB');
end $$;

commit;
```

Members need both an `organization_memberships` row with role `member` and a matching `branch_staff` row. Allowed branch roles: `manager`, `host`, `server`, `kitchen`, `cashier`. Owners inherit branch access within their own organization. Role changes currently happen through an administrator; team-management mutations are not implemented. Do not use shared staff passwords.

## 5. Verify the integration

Start `npm run dev`, open `/login`, sign in, and select a branch at `/workspace`. `/workspace/[branchId]` shows verified branch information and role permissions. It deliberately does not reuse demo state as live restaurant data.

Before enabling live operational data, verify against a test Supabase project:

- Valid staff can sign in and out; invalid credentials show a generic error; refresh preserves the session.
- An owner sees only their organizations' branches.
- A member sees only explicitly assigned branches; removing membership revokes access.
- Changing a branch UUID to another organization's branch produces the same not-found response as a nonexistent branch.
- Browser `anon` and `authenticated` roles cannot read or mutate the core tables.
- PostgreSQL rejects cross-tenant foreign keys, invalid role/status values, nonpositive party sizes, and multiple published layouts for one floor.
- Separate signed-in browser sessions never receive each other's rendered branch data or session cookies.

The automated tenancy tests currently exercise pure permission decisions, **not** PostgreSQL policies or HTTP routes. Database integration tests, browser checks, and a successful Next.js build remain pending.

## Next implementation stage

Persist floor drafts and publish with optimistic version checks. Add dining-session/table allocations and transaction-safe seating before connecting the queue UI. Implement guest capabilities, server-priced orders, and kitchen transitions afterward. The broader design is in `docs/architecture.md`.

Implementation references: [Supabase SSR clients and proxy](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs), [Next.js server authorization](https://nextjs.org/docs/app/guides/authentication), [Drizzle RLS](https://orm.drizzle.team/docs/rls).
