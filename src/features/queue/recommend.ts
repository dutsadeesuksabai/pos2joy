export type QueueParty = { id: string; name: string; size: number; joinedAt: number; needsAccessible?: boolean; status: "waiting" | "seated" };
export type ServiceTable = { id: string; label: string; capacity: number; accessible?: boolean; status: "available" | "occupied" | "reserved"; x: number; y: number };
export type QueuePolicy = { maxWaitMinutes: number; fitWeight: number };
export const defaultPolicy: QueuePolicy = { maxWaitMinutes: 30, fitWeight: 10 };

// Single-table recommendation only. Production multi-table matching and allocation
// must be implemented in the transactional server layer described in docs.
export function recommend(table: ServiceTable, parties: QueueParty[], now: number, policy = defaultPolicy) {
  if (table.status !== "available") return [];
  if (!Number.isFinite(now) || !Number.isFinite(policy.maxWaitMinutes) || policy.maxWaitMinutes < 0 || !Number.isFinite(policy.fitWeight) || policy.fitWeight < 0) throw new Error("Invalid queue policy or time");
  return parties.filter(p => p.status === "waiting" && Number.isInteger(p.size) && p.size > 0 && p.size <= table.capacity && Number.isFinite(p.joinedAt) && (!p.needsAccessible || table.accessible)).map(p => {
    const wait = Math.max(0, (now - p.joinedAt) / 60000);
    return { party: p, wait, overdue: wait >= policy.maxWaitMinutes, score: wait + policy.fitWeight * p.size / table.capacity, reason: wait >= policy.maxWaitMinutes ? "Maximum wait reached — arrival time takes priority" : `${p.size === table.capacity ? "Exact table fit" : `${table.capacity - p.size} spare seats`} · waiting ${Math.floor(wait)} min` };
  }).sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.overdue && b.overdue ? a.party.joinedAt - b.party.joinedAt : b.score - a.score) || a.party.joinedAt - b.party.joinedAt || a.party.id.localeCompare(b.party.id));
}
