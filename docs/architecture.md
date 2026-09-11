# Tablejoy — restaurant platform blueprint

Status: proposed architecture, ready to guide implementation. Working name: Tablejoy.

Implementation update: an in-memory UI prototype and a separate Supabase staff-access foundation now exist. `/login` implements password authentication; `/workspace` lists authorized branches with server-side Drizzle queries. Core schema source enables RLS with no client policies. No migrations, live operational flows, or Supabase integration checks have been executed. See `supabase-setup.md` for the current boundary and setup steps.

## Product

A multi-tenant restaurant platform with three connected experiences:

1. **Guest mobile web:** scan a table QR, browse the menu, customize dishes, submit an order, track preparation, call staff, and request the bill. Joining the waiting list uses a separate restaurant QR. No account required for dining; optional login for rewards.
2. **Restaurant workspace:** live floor plan, smart queue, incoming orders, kitchen display, menu management, QR management, and staff permissions.
3. **Owner workspace:** switch between authorized restaurants and branches, manage brand settings and staff, and review branch-level performance.

Initial scope assumes dine-in ordering, host-confirmed seating, and payment recorded by staff. Online payments, delivery, and automatic SMS require separate provider integrations.

## Stack and boundaries

| Layer | Choice | Responsibility |
| --- | --- | --- |
| Web application | Next.js App Router + TypeScript | Guest and staff routes, server rendering, mutations |
| Interface | shadcn/ui + Tailwind CSS | Accessible components with custom blue/cream theme |
| Database | Supabase PostgreSQL | Tenant data, transactions, constraints, RLS |
| Database access | Drizzle ORM + migrations | Typed server-side queries and versioned schema |
| Staff identity | Supabase Auth + SSR cookies | Verified identity and session refresh |
| Live updates | Supabase Realtime | Authorized order, floor, and queue refreshes |
| Assets | Supabase Storage | Tenant-scoped menu images and branding |
| Floor editor | React + SVG or canvas | Coordinates, selection, dragging, snapping, zoom |
| Validation | Zod | All untrusted mutation input |

Start as a modular monolith: one deployable Next.js application, feature modules, one PostgreSQL database. Keep queue rules as pure TypeScript with transactional application in the server layer. Use a Node-capable host for the server-side PostgreSQL connection. No microservices needed for the initial product.

## Tenant hierarchy and login

```text
Platform
└── Organization (restaurant business / owner)
    ├── Organization memberships
    └── Restaurants (brands)
        └── Branches (physical locations)
            ├── Staff branch assignments
            ├── Floors and published layouts
            ├── Tables and dining sessions
            ├── Queue and reservations
            ├── Menu availability and orders
            └── Branch settings
```

Staff sign in with an individual account, then choose an authorized restaurant and branch. A restaurant does not share a password. Roles: owner, manager, host, cashier, kitchen, and server. Organization owners may manage all branches; other staff need explicit branch assignments. A URL branch identifier is context, never proof of access.

Every tenant-owned record carries `organization_id`; branch-owned records also carry `branch_id`. Composite foreign keys enforce that referenced branches, menus, tables, and sessions belong to the same tenant. Each server read and mutation validates membership and required permission. Enable RLS for every exposed table and tenant folder policies for Storage. Never expose the database URL or service-role key to the browser.

Drizzle connections using privileged database credentials may bypass RLS. Do not assume browser policies protect those queries: centralize tenant authorization, include tenant filters in every query, and use a restricted database role or carefully scoped transaction context if relying on RLS for direct database access. Test cross-tenant reads and writes before any live deployment.

## Routes and project structure

```text
src/
  app/
    (auth)/login/page.tsx
    (owner)/organizations/[organizationId]/page.tsx
    (staff)/workspace/[branchId]/
      layout.tsx                 # verified membership, restaurant switcher
      page.tsx                   # live service overview
      floor/page.tsx             # service floor + editor mode
      queue/page.tsx
      orders/page.tsx
      kitchen/page.tsx
      menu/page.tsx
      team/page.tsx
      settings/page.tsx
    (guest)/r/[restaurantSlug]/[branchSlug]/
      page.tsx                   # public restaurant menu
      queue/page.tsx             # join and check queue with opaque ticket
    (guest)/t/[qrToken]/page.tsx   # scan entry; exchanges valid token for session
    (guest)/dine/[sessionId]/
      menu/page.tsx
      cart/page.tsx
      orders/page.tsx
      bill/page.tsx
    api/                         # public boundaries, integrations, webhooks
  components/ui/                 # shadcn primitives
  components/layout/
  features/
    tenancy/                     # identity, authorization, role checks
    floor/                       # editor, geometry, layout validation
    queue/                       # scoring, eligibility, seating transaction
    menu/                        # modifiers, availability, prices
    ordering/                    # order submission and state transitions
    kitchen/                     # station routing and fulfillment
    dining/                      # session and guest capabilities
    rewards/                     # optional later phase
  db/
    schema/                      # domain-specific Drizzle tables
    index.ts                     # server-only connection
  lib/supabase/                  # request-scoped server client, browser client
  lib/validation/
drizzle/                         # reviewed migrations
supabase/tests/                  # RLS and tenancy checks
tests/                           # queue, transactions, critical journeys
docs/
```

## Data model

All primary IDs are UUIDs; timestamps use `timestamptz`. Store monetary values as integer minor units plus currency. Guest display times use the branch timezone. Preserve historical price and item names on submitted orders.

| Domain | Tables and important fields |
| --- | --- |
| Identity | `organizations`, `organization_memberships(user_id, role)`, `restaurants(organization_id, slug)`, `branches(restaurant_id, timezone, currency)`, `branch_staff(user_id, role)` |
| Floor | `floors(branch_id, name)`, `layout_versions(floor_id, version, state, dimensions)`, `floor_objects(layout_version_id, kind, x, y, width, height, rotation, configuration)` |
| Tables | `dining_tables(branch_id, label, min_capacity, max_capacity, accessible, enabled)`, `layout_table_placements(layout_version_id, table_id, x, y, rotation)`, `table_combinations`, `table_combination_members` |
| Service | `dining_sessions(branch_id, party_size, opened_at, closed_at, status)`, `session_tables(session_id, table_id, released_at)`, `guest_capabilities(session_id, token_hash, expires_at, revoked_at)` |
| QR | `table_qr_tokens(table_id, token_hash, rotated_at, revoked_at)`; restaurant queue QR points to public branch route |
| Queue | `queue_entries(branch_id, party_size, joined_at, status, accessibility_needs, zone_preference, notified_at, expires_at)`, `queue_offers(queue_entry_id, expires_at, state)`, `queue_offer_tables(offer_id, table_id)`, `queue_events` |
| Bookings | `reservations(branch_id, starts_at, ends_at, party_size, status)`, `reservation_tables` |
| Menu | `menu_categories`, `menu_items`, `modifier_groups(min_selections, max_selections)`, `modifier_options(price_delta)`, `menu_item_modifier_groups`, `branch_menu_items(available, price_override)` |
| Ordering | `orders(session_id, status, idempotency_key, subtotal, tax, service_charge, total)`, `order_items(item_name_snapshot, unit_price_snapshot, quantity, notes, status)`, `order_item_modifiers` |
| Checkout | `bills(session_id, state, total)`, `payments(bill_id, amount, method, provider_reference, status)`, `staff_requests(session_id, type, status)` |
| Operations | `branch_settings`, `audit_events(actor_id, action, before, after)`, `outbox_events(type, payload, processed_at)` |
| Optional engagement | `loyalty_accounts`, `loyalty_ledger`, `reward_redemptions`, `guest_favorites` |

Key invariants: unique table label per branch; one active session allocation per table; one active offer per table; at most one accepted offer per queue entry; unique idempotency key within its branch/session scope. Active offers and sessions must share one allocation authority or lock and validate the same table rows in a transaction; separate unique constraints alone cannot prevent an offer/session collision.

## Sandbox floor builder

The editor starts from a blank canvas. Set room dimensions, add zones, then place tables and fixed blocks. Supported blocks: wall, entrance, counter, kitchen, restroom, restricted area, and label. Tables support 2, 4, 8, or custom capacity; rectangular and round shapes; table number; accessible seating; and permitted combinations.

Interactions: drag from palette, select, move, resize blocks, rotate, duplicate, delete, grid snap, pan/zoom, undo/redo, and numeric position editing for keyboard users. Touch tablets use larger handles. Desktop/tablet is recommended for building; staff phones get a usable service list and simplified floor view.

Use world coordinates independent of viewport size. Convert pointer coordinates through the canvas transform. Validate collisions, room boundaries, duplicate table labels, and invalid combinations. Geometry is operational guidance; the product must not claim that a layout certifies building or accessibility compliance.

Separate **draft editing** from **published service layout**. Saving a draft must not move live tables. Publishing uses optimistic version checks and a transaction. Reject removal, disabling, or capacity reduction of occupied, held, or imminently reserved tables. Preserve stable table IDs and printed QR codes across layout versions. Archive referenced tables rather than deleting history. Resolve concurrent edits with a clear reload/review prompt.

## Smart queue rules

Use transparent rules first, with configurable defaults and reasons visible to the host. The system recommends; staff confirm seating. Never rank guests using spending, protected attributes, or loyalty tier by default.

1. Filter to waiting parties and free eligible tables. Respect party size, accessibility needs, hard zone requirements, active offers, reservations, enabled status, and permitted table combinations.
2. Calculate wait minutes from database time. A party over the configured maximum wait receives priority among eligible parties. Within that group use arrival time.
3. Otherwise calculate `score = waitingMinutes + fitWeight × (partySize / tableCapacity)`. Suggested starting fit weight: 10 minutes, to be tuned with actual service data.
4. If a large party can only fit one scarce table, protect that capacity for a configurable short period when it approaches its maximum wait. Do not hold every large table indefinitely. Use compatible free smaller tables first.
5. For multiple available tables, evaluate a small candidate assignment set to reduce wasted capacity and avoid assigning a two-person party to the only table that can seat an eight-person party. Start with a bounded deterministic matching routine; document when it falls back to greedy matching.
6. Explain each recommendation: “Fits table 04 exactly; waiting 12 minutes.” Break equal scores by `joined_at`, then queue ID for determinism.

Example with a free four-seat table and fit weight 10:

| Party | Waiting | Fit bonus | Score | Result |
| --- | --- | --- | --- | --- |
| 2 guests | 10 min | 5 | 15 | Remains eligible |
| 4 guests | 8 min | 10 | 18 | Recommended first |
| 2 guests | 25 min | 5 | 30 | Goes before the 4-person party above |

If there is no suitable larger party, seat the two-person party at the four-seat table immediately. A configurable maximum wait (for example 30 minutes) overrides fit among compatible parties. An eight-person party cannot be put at a four-seat table; it needs a suitable table or an approved combination. Waiting estimates are ranges based on recent completed dining sessions by party size and service period; show “not enough data” when appropriate.

Queue states: `waiting → offered → seated`; offer decline/expiry returns the entry to waiting according to a documented grace policy; explicit outcomes include `cancelled` and `no_show`. Preserve original arrival time on the first missed offer; repeated misses require host review. Manual overrides require a reason and audit event.

Seating must be atomic: authenticate host, validate branch, lock candidate table rows in a stable order, lock the queue entry, recheck availability and offer expiry, create the dining session, allocate every table, transition the queue entry, and insert an outbox event. Concurrent losers retry or receive a stale recommendation response. Notification delivery happens after commit; use a durable worker/cron for retries and expiration, not browser timers.

## QR ordering and guest safety

Scan → confirm restaurant and table → open active dining session → menu → modifiers → shared cart/order → kitchen status → bill request. Keep an always-visible table label and branch name to prevent ordering to the wrong table.

A printed table QR is not sufficient authorization to read an active party's order history. Exchange a valid QR for a short-lived, scoped dining capability after an on-site confirmation such as a host-provided session code. Store only capability hashes. Bind access to the active session, rotate on close/reopen, expire cookies, rate limit exchanges and submissions, and revoke on table transfer. Avoid personal information in QR URLs. Customers can browse the public menu before joining a session.

The server validates menu availability, modifier bounds, and quantities, then recomputes price, tax, and service charges. Never trust client totals. Submit using an idempotency key and an atomic order transaction. Realtime is a refresh signal; reload authoritative state after reconnect and show a disconnected state. Offline guests can browse cached menus and keep an explicitly local draft, but orders must never appear submitted until the server acknowledges them.

Kitchen item states: `new → accepted → preparing → ready → served`, with permitted cancellation paths and role checks. Order-level state is derived consistently from item states. A closed or paid session rejects new orders. Apply payment webhook signature validation and provider-event deduplication when adding online payments.

## Visual direction from the reference

Use the supplied image as a mood reference, not copied branding. Tablejoy should feel friendly and food-focused for guests, calm and legible during busy service for staff.

| Token | Value | Use |
| --- | --- | --- |
| Primary blue | `#0754C9` | Main buttons, selected navigation |
| Deep blue | `#083779` | Sidebar, key headings |
| Sky blue | `#72CFF3` | Highlights and playful accents |
| Cream | `#FFF8EA` | Guest backgrounds and warm panels |
| Paper | `#F5F8FE` | Staff workspace background |
| Ink | `#172338` | Main text |
| Muted | `#64748B` | Secondary information |
| Radius | 16–24px cards; full buttons | Friendly rounded geometry |

Typography: rounded expressive display headings (for example locally hosted Nunito ExtraBold) with an easy-to-read body font such as Inter; include a Thai-capable font when adding Thai. Main body 16px, controls at least 44px touch targets, visible focus rings, status labels alongside color, and reduced-motion support.

Guest home: compact blue greeting, cream food feature card with real photography, category pills, two-column menu on phones, clear prices and modifier entry, sticky cart, and bottom navigation. Avoid putting a decorative hero above the menu.

Staff workspace: deep-blue slim sidebar; restaurant/branch switcher; current shift header; compact live metrics; central floor canvas; queue panel on the right. Show table number, seats, service state, and elapsed time. On narrow screens, switch floor/queue/orders through tabs and present tables as cards.

Floor editor: top bar with draft status and publish; left block palette; center dotted canvas; right selected-object properties. Live mode has seating actions instead of editing handles.

## Useful engagement ideas

Keep these optional per restaurant: dish favorites, a dessert passport, visit stamps, chef recommendations, group ordering into one table session, language switching, allergen details, and a gentle “call staff” action. Award rewards from verified paid orders with an immutable ledger and refund reversals. Do not require loyalty enrollment to order or join the queue.

## Delivery stages and acceptance

1. **Foundation:** visual tokens, routing, Supabase Auth, tenant schema, migrations, role checks. Acceptance: users cannot access another tenant by changing IDs.
2. **Floor + queue:** draft/publish builder, table state, queue join, explainable recommendations, host seating. Acceptance: simultaneous hosts cannot allocate the same table; larger parties do not starve.
3. **Ordering:** QR exchange, mobile menu, modifiers, orders, kitchen, staff requests. Acceptance: duplicate submit creates one order; totals are server-authoritative; closed session access is revoked.
4. **Operations:** menu editor, staff management, bill handling, audit history, reconnect handling. Acceptance: complete scan-to-order-to-kitchen-to-close journey on a phone and tablet.
5. **Engagement and expansion:** loyalty, reservations, online payments, analytics. Add only after core service is reliable.

Test the queue with incompatible capacities, old parties, reservations, accessibility requirements, table combinations, expired offers, and deterministic ties. Test database transactions under simultaneous seating and ordering. Validate RLS, guest token isolation, keyboard operation, touch editing, and reconnect recovery before production.

## Official implementation references

- Next.js authentication and data access boundaries: https://nextjs.org/docs/app/guides/authentication
- Supabase server-side sessions: https://supabase.com/docs/guides/auth/server-side
- Supabase row-level security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Drizzle database setup: https://orm.drizzle.team/docs/get-started

These links inform implementation choices; the product rules, scoring defaults, and delivery stages above are proposed design decisions.
