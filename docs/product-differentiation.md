# POS 2 joy — product differentiation proposal

Status: product recommendations, not an approved implementation scope. Prepared 11 September 2026. Existing implementation and concurrent project edits are preserved.

## Positioning

Build a restaurant workspace that helps small teams decide what to do next: where to seat a party, how to explain their wait, when to release orders to the kitchen, and which table needs attention. Let guests participate through a simple mobile experience without installing an app or creating an account to dine.

Suggested initial audience: restaurants serving groups, such as shabu, barbecue, and casual dining, where party size, configurable tables, waiting lists, and shared orders are central to service. Validate this segment with pilot operators before committing to all restaurant types.

The core product promise is **plan the room, understand the queue, and keep each table's meal moving**. Differentiate through the connected experience, transparent decisions, and ease of setup—not claims that any isolated feature is globally unique.

## Market baseline

FoodStory already advertises floor/table management, queues, QR ordering, CRM, inventory, and multi-branch management. SevenRooms advertises floor management, seating optimization, and predictive waitlists. Qashier advertises QR ordering, item/amount bill splitting, kitchen routing, and loyalty. Their published pages establish feature overlap, not a complete hands-on comparison of the products.

- FoodStory: https://foodstory.co/
- SevenRooms table management: https://sevenrooms.com/platform/table-management/
- Qashier restaurant operations: https://qashier.com/sg/restaurant-bar/

The proposals below are hypotheses about a useful product position and require customer validation. They are not claims that competitors lack the functionality.

## 1. Floor sandbox with service simulation

Extend the existing builder into a tool that compares alternative layouts before publishing. Owners define permitted table combinations, zones, party-size patterns, dining-time ranges, and staff availability. Replay the same arrivals against each layout to compare predicted waiting, seat utilization, and large-party delays.

Example: compare two 2-seat tables with one 4-seat table under the same Friday-night arrival pattern. Show assumptions and estimated ranges; do not present simulation outputs as guaranteed results. Keep the simulation isolated from live reservations and table allocations. A manager explicitly publishes the chosen layout.

Prototype this with deterministic scenarios first. Add historical replay only once reliable operational event data is available. This is the strongest visual signature for a product built around the user's sandbox idea.

## 2. Explainable queue with guest choices

Give hosts a recommendation plus its reason. Give guests choices that are genuinely available: sit outside sooner, wait for indoor seating, or accept a permitted split-table arrangement. Apply hard seating constraints and reservation protections before ranking.

For two-person and four-person parties competing for a four-seat table, balance elapsed wait and fit. Long waits get protection. A two-person party should not wait for an absent four-person party. Staff may override with a recorded reason.

Show guests their own wait range and whether a seating preference affects it; do not expose other guests' names or promise an exact seating time. Larger parties must not be repeatedly skipped. Guest choices should never silently change their requirements or surrender their original arrival time.

Start with explicit rules, not machine learning. Measure the longest waits, abandoned queues, and host overrides before tuning weights.

## 3. Shared table session designed for groups

Each diner joins the same active table session using their own phone. Items can belong to one diner or be marked shared. Show who has already added a shared dish, allow diners to suggest items to the group, and distinguish draft basket changes from confirmed kitchen orders.

Example: four friends can see that a shared platter was already selected, add individual drinks, and later review individual items plus their shares of communal dishes. Bill attribution is separate from taking payments. Multiple phones submitting simultaneously must not create duplicate orders or overwrite another person's basket.

Offer direct ordering and a group-confirmation mode as restaurant settings. Do not force voting, signup, or a table captain into every meal. Joining a session still needs on-site authorization; printed QR possession alone must not reveal another party's orders.

## 4. Configurable service rules with ready-made recipes

Let owners configure a small catalog of trusted workflows through simple blocks: event, condition, action. Start with validated templates rather than unrestricted automation.

Examples:

- A bill request waits too long → notify the assigned cashier or supervisor.
- A queue offer expires → release the hold according to the branch's grace policy.
- A buffet session approaches its agreed end time → show a guest reminder and alert staff.
- A table's first dish exceeds the branch's target → create a service follow-up task.

Owners can preview the rule using sample events before enabling it. Use permissions, audit records, deduplication, and bounded actions. Compensation, charges, seating changes, and customer messages need explicit restaurant configuration and appropriate staff controls.

## 5. A floor view that suggests the next service task

Evolve table colors into a concise service view: waiting for the first dish, an item delayed, assistance requested, bill requested, or cleaning required. Assign each task to a staff role, make acknowledgment visible, and escalate only when the branch's threshold is reached.

Example: two servers can see that a water request was already accepted by one colleague. The kitchen can flag a delayed dish, and the host can adjust new seating recommendations when kitchen load is high.

Base events on staff/kitchen acknowledgments and confirmed orders, not guessed surveillance or assumptions that a guest has finished eating. The interface should reduce repeated checking and duplicate work. Measure time to first dish and unresolved requests per shift.

## 6. An optional food passport that matches the visual reference

Add collection pages for dishes, cuisines, seasonal menus, or the owner's branches. Guests can save favorites and collect stamps from verified paid orders. Let restaurants write the story behind a dish, offer a rotating discovery set, or celebrate repeat visits.

Keep this separate from queue priority and optional for dining. Reward rules should reverse correctly on refunds. Let guests choose whether their preferences are remembered across the owner's restaurants. Dietary information must come from restaurant-maintained data; recommendations must not claim guaranteed allergen safety.

This is a retention and brand feature, not the main operational differentiator.

## Recommended order

1. **Reliable service foundation:** persistent floor publishing, transaction-safe table allocation, QR/session authorization, server-priced ordering, kitchen acknowledgment, and reconnect behavior.
2. **First signature release:** explainable queue plus a shared table session, built on the floor map. Optimize for group dining and simple phone use.
3. **Second signature release:** layout simulation with explicit assumptions, then a small set of configurable service workflows.
4. **Engagement:** optional food passports and cross-branch experiences once the operational loop is reliable.

Pilot the first signature release with a few suitable restaurants. Compare the same service periods using wait-time distribution, parties abandoning the queue, time to first dish, host overrides, and how often staff must manually repair an order or seating assignment. Set numerical success targets together with the pilot owners; do not invent guaranteed revenue gains.

## Visual execution

Preserve the deep blue, sky blue, cream, and rounded surfaces from the reference. Let staff see a clear operational floor and concise next actions. Use playful stamps, dish stories, and gentle celebration in the guest experience. Keep frequent actions reachable with one thumb and use explicit success acknowledgments so guests know an order really reached the restaurant.
