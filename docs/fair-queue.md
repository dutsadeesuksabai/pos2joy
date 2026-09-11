# Fair Queue

Open a branch's Service screen and follow **Fair Queue** to
`/workspace/[branchId]/fair-queue`. Staff need `queue:manage` permission.

The screen uses enabled tables and waiting parties from that branch. Hosts can
add a party with an accessibility requirement and a required seating area, see
the proposed seating plan, confirm a match, or choose another compatible match
with a recorded reason. Blue, sky and cream styling follows the project palette.

## Assignment rules

- Capacity, availability, accessibility and requested area are hard constraints.
- Waiting time plus fit determines priority until the default 30-minute threshold.
- Once that threshold is reached, earlier arrivals take priority among compatible
  parties. This is a priority threshold, not a promise of seating within 30 minutes.
- The matcher considers all free tables together, assigns each party/table at
  most once, and can move an earlier assignment to another compatible table to
  seat additional parties. It maximizes the number of parties that can be seated
  without dropping previously assigned higher-priority parties.
- Called parties and reserved tables are excluded from new suggestions.

The algorithm does not combine tables, predict departure times, optimize total
revenue or guarantee a globally optimal fit score. Accessibility means a table
flag configured by the restaurant; it does not certify the building's access.

## Confirmation and records

The browser shows a snapshot. Refresh retrieves current floor and queue data;
the displayed waiting clock updates every 30 seconds without fetching new data.
Seating uses a database transaction, rechecks staff authorization, locks branch,
tables and queue, and recomputes the plan using database time. Stale or invalid
choices fail without partially opening a bill. A different match requires a
reason; hard seating requirements still apply.

`queue_seating_events` stores staff, table, party, decision, reason and timestamp.
Queue entries also retain their seating metadata. The event table has RLS enabled
and tenant-scoped foreign keys. There is no history viewer yet. Called arrivals
use the separate Service flow and are recorded as seated from the call board;
the call-board choice itself is not scored by Fair Queue.

Schema changes are included in migration `0002_absurd_marvel_boy.sql`. Apply
the project's pending migrations before using the updated service repository.

## Verification

`npm test` includes capacity, area, accessibility, long-wait priority, deterministic
ties and 200 seeded comparisons against an exhaustive maximum-matching search.
These unit tests do not prove database concurrency or end-to-end browser behavior.
