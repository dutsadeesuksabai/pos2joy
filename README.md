# Tablejoy

Restaurant QR ordering, a sandbox floor builder, and a fair, table-aware queue.

**Current state: architecture, unbuilt UI prototype, and Supabase staff-access integration source. This is not a live restaurant system.** The `/` demo uses in-memory sample data, makes no Supabase requests, and resets on refresh. `/login` and `/workspace` contain real Supabase/Drizzle integration code that requires configuration and database setup. No real orders, QR sessions, notifications, payments, or multi-user synchronization are implemented.

Read [the product and technical blueprint](docs/architecture.md) for the full tenant hierarchy, route structure, database design, queue algorithm, floor publishing lifecycle, guest security, design tokens, and implementation milestones.

## Run locally

Use Node.js 22 or later:

```sh
npm install
npm run dev
```

Open the URL printed by Next.js. A Supabase account is not needed for the demo. Dependencies are installed and `package-lock.json` is committed.

```sh
npm test
npm run typecheck
npm run build
```

## Prototype features

- Restaurant switcher with separate sample state for two businesses.
- Live-service floor with available, occupied, and reserved tables.
- Draft editor: drag free tables and blocks, create custom-capacity tables, remove free tables, numeric table position editing, undo, collision checks, and publish/cancel.
- Queue entry, table selection, explainable single-table recommendations, and demo seating.
- Mobile guest menu, category filters, cart quantities, and explicitly simulated order submission.
- Deep blue, sky blue, cream, rounded cards, and playful typography inspired by the supplied reference. Abstract menu marks are placeholders for licensed food photography.

The prototype editor uses a fixed normalized canvas and simplified collision rectangles. Production resize/rotate, zones, table combinations, persisted drafts, version conflicts, reservation windows, atomic seating, QR token generation, and the full kitchen workflow remain to be implemented.

## Backend foundation

The [Supabase setup guide](docs/supabase-setup.md) covers environment configuration, migrations, the first owner, staff assignments, and integration checks. Staff login verifies identity with Supabase, refreshes SSR cookies through `src/proxy.ts`, and reads authorized branches through server-only Drizzle queries. Each branch route checks membership and role permissions again; changing a URL does not grant access.

`src/db/schema.ts` covers core tenant, floor, queue, menu, and order tables with database role/status checks, cross-tenant foreign keys, and RLS enabled without client policies. Two migrations are generated and reviewed in `drizzle/`; neither has been applied to any database. `0001` adds `menu_items`, `orders`, and `order_items` and is additive only. Run `npm run db:migrate` once a project is configured, or `npm run db:generate` after changing the schema. Never put a database URL or privileged key in a `NEXT_PUBLIC_` variable. Read the setup guide before connecting a database: the current server connection has privileged access and authorization is enforced in the server data-access layer.

## Validation in this environment

`npm test` (39 tests), `npm run typecheck`, and `npm run build` all pass. Against the production build with no Supabase environment configured, `/` and `/login` return 200 and every `/workspace` route redirects a signed-out visitor to `/login` with `Cache-Control: private, no-store`.

Not yet validated: anything touching the database. `src/features/floor/repository.ts` holds the revision locking, lock ordering, and publish transaction, and no test covers it because that needs a live Postgres. Set `DATABASE_URL` and apply the migration against a throwaway Supabase project before trusting the floor publish path. No migrations have been applied, no RLS policies exist, and no deployment was created.
