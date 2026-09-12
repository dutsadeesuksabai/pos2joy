export type QueueParty = { id: string; name: string; size: number; joinedAt: number; needsAccessible?: boolean; requestedFloorId?: string | null; status: "waiting" | "offered" | "seated" | "cancelled" | "no_show" };
export type ServiceTable = { id: string; label: string; capacity: number; floorId?: string; accessible?: boolean; status: "available" | "occupied" | "reserved" | "held"; x: number; y: number };
export type QueuePolicy = { maxWaitMinutes: number; fitWeight: number };
export const defaultPolicy: QueuePolicy = { maxWaitMinutes: 30, fitWeight: 10 };

export function canSeat(table: ServiceTable, party: QueueParty) {
  return table.status === "available" && Number.isInteger(table.capacity) && table.capacity > 0 && party.status === "waiting" && Number.isInteger(party.size) && party.size > 0 && party.size <= table.capacity && Number.isFinite(party.joinedAt) && (!party.needsAccessible || table.accessible === true) && (!party.requestedFloorId || party.requestedFloorId === table.floorId);
}

// Single-table explanations remain useful, but live service uses the plan below
// so recommendations for different tables cannot reuse the same waiting party.
export function recommend(table: ServiceTable, parties: QueueParty[], now: number, policy = defaultPolicy) {
  if (table.status !== "available") return [];
  if (!Number.isFinite(now) || !Number.isFinite(policy.maxWaitMinutes) || policy.maxWaitMinutes < 0 || !Number.isFinite(policy.fitWeight) || policy.fitWeight < 0) throw new Error("Invalid queue policy or time");
  return parties.filter(p => canSeat(table, p)).map(p => {
    const wait = Math.max(0, (now - p.joinedAt) / 60000);
    return { party: p, wait, overdue: wait >= policy.maxWaitMinutes, score: wait + policy.fitWeight * p.size / table.capacity, reason: wait >= policy.maxWaitMinutes ? "Maximum wait reached — arrival time takes priority" : `${p.size === table.capacity ? "Exact table fit" : `${table.capacity - p.size} spare seats`} · waiting ${Math.floor(wait)} min` };
  }).sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.overdue && b.overdue ? a.party.joinedAt - b.party.joinedAt : b.score - a.score) || a.party.joinedAt - b.party.joinedAt || a.party.id.localeCompare(b.party.id));
}

export type SeatingSuggestion = { table: ServiceTable; party: QueueParty; wait: number; overdue: boolean; reason: string };

// Priority-preserving bipartite matching. Earlier-priority parties stay assigned;
// augmenting paths move them to another eligible table to admit additional parties.
// This maximizes the number of compatible parties seated, not a global revenue score.
export function planSeating(tables: ServiceTable[], parties: QueueParty[], now: number, policy = defaultPolicy): SeatingSuggestion[] {
  if (!Number.isFinite(now) || !Number.isFinite(policy.maxWaitMinutes) || policy.maxWaitMinutes < 0 || !Number.isFinite(policy.fitWeight) || policy.fitWeight < 0) throw new Error("Invalid queue policy or time");
  if (new Set(tables.map(t => t.id)).size !== tables.length || new Set(parties.map(p => p.id)).size !== parties.length) throw new Error("Duplicate table or queue identity");
  // All parties prefer the same table order; sort once for the room.
  const available = tables.filter(table => table.status === "available").sort((a,b) => a.capacity - b.capacity || Number(Boolean(a.accessible)) - Number(Boolean(b.accessible)) || a.id.localeCompare(b.id));
  const tableById = new Map(available.map(table => [table.id, table]));
  const candidates = parties.map(party => {
    const options = available.filter(table => canSeat(table, party));
    const wait = Math.max(0, (now - party.joinedAt) / 60000);
    return { party, options, wait, overdue: wait >= policy.maxWaitMinutes, score: wait + (options.length ? policy.fitWeight * party.size / options[0].capacity : 0) };
  }).filter(item => item.options.length).sort((a,b) => Number(b.overdue) - Number(a.overdue) || (a.overdue && b.overdue ? a.party.joinedAt - b.party.joinedAt : b.score - a.score) || a.party.joinedAt - b.party.joinedAt || a.party.id.localeCompare(b.party.id));
  const owners = new Map<string, typeof candidates[number]>();
  function assign(candidate: typeof candidates[number], visited: Set<string>): boolean {
    // Prefer unused eligible tables before moving somebody already assigned.
    for (const table of candidate.options) if (!visited.has(table.id) && !owners.has(table.id)) { visited.add(table.id); owners.set(table.id, candidate); return true; }
    for (const table of candidate.options) {
      if (visited.has(table.id)) continue;
      visited.add(table.id);
      const previous = owners.get(table.id);
      if (previous && assign(previous, visited)) { owners.set(table.id, candidate); return true; }
    }
    return false;
  }
  for (const candidate of candidates) {
    // Later-priority parties cannot add a seat once every available table is
    // assigned. Avoid searching the entire graph for each remaining party.
    if (owners.size === available.length) break;
    assign(candidate, new Set());
  }
  const assigned = new Map<string, ServiceTable>();
  for (const [tableId, candidate] of owners) assigned.set(candidate.party.id, tableById.get(tableId)!);
  return candidates.flatMap(candidate => {
    const table = assigned.get(candidate.party.id);
    if (!table) return [];
    const explanation = recommend(table, [candidate.party], now, policy)[0];
    return [{ table, party: candidate.party, wait: candidate.wait, overdue: candidate.overdue, reason: `${explanation.reason}${candidate.party.needsAccessible ? " · accessible seating" : ""}${candidate.party.requestedFloorId ? " · requested area" : ""}` }];
  });
}
