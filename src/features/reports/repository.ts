import "server-only";
import { sql as raw } from "drizzle-orm";
import { getDatabase } from "@/db";
import { serviceDayIn } from "@/features/queue/ticket";

type Scope = { branchId: string; organizationId: string };
export type DailyRow = {
  day: string; revenueCents: number; covers: number; parties: number;
  orders: number; items: number; confirmSeconds: number; serveSeconds: number;
};
export type ReportSeries = { days: DailyRow[]; timezone: string; from: string; to: string };

// A continuous run of days, generated rather than grouped, so a closed day is a
// zero on the chart instead of a missing bar that shifts every later one.
export async function readDailySeries(scope: Scope, timezone: string, span = 30): Promise<ReportSeries> {
  const to = serviceDayIn(timezone);
  const rows = await getDatabase().execute(raw`
    with days as (
      select generate_series(${to}::date - ${span - 1}::int, ${to}::date, interval '1 day')::date as d
    ),
    sales as (
      select (o.created_at at time zone ${timezone})::date as d,
             coalesce(sum(oi.unit_price_cents * oi.quantity), 0)::int as revenue_cents,
             coalesce(sum(oi.quantity), 0)::int as items,
             count(distinct o.id)::int as orders
      from orders o join order_items oi on oi.order_id = o.id
      where o.branch_id = ${scope.branchId} and o.organization_id = ${scope.organizationId}
        and o.status <> 'cancelled'
        and (o.created_at at time zone ${timezone})::date > ${to}::date - ${span}::int
      group by 1
    ),
    guests as (
      select service_day as d,
             coalesce(sum(party_size), 0)::int as covers,
             count(*)::int as parties
      from queue_entries
      where branch_id = ${scope.branchId} and organization_id = ${scope.organizationId}
        and status = 'seated' and service_day > ${to}::date - ${span}::int
      group by 1
    ),
    timing as (
      -- Only tickets that actually reached a guest describe service time.
      select (created_at at time zone ${timezone})::date as d,
             coalesce(avg(extract(epoch from (confirmed_at - created_at))), 0)::int as confirm_s,
             coalesce(avg(extract(epoch from (served_at - confirmed_at))), 0)::int as serve_s
      from orders
      where branch_id = ${scope.branchId} and organization_id = ${scope.organizationId}
        and served_at is not null and confirmed_at is not null
        and (created_at at time zone ${timezone})::date > ${to}::date - ${span}::int
      group by 1
    )
    select days.d::text as day,
           coalesce(sales.revenue_cents, 0) as revenue_cents,
           coalesce(sales.items, 0) as items,
           coalesce(sales.orders, 0) as orders,
           coalesce(guests.covers, 0) as covers,
           coalesce(guests.parties, 0) as parties,
           greatest(coalesce(timing.confirm_s, 0), 0) as confirm_seconds,
           greatest(coalesce(timing.serve_s, 0), 0) as serve_seconds
    from days
    left join sales on sales.d = days.d
    left join guests on guests.d = days.d
    left join timing on timing.d = days.d
    order by days.d
  `);

  const list = (rows as unknown as Record<string, unknown>[]).map(row => ({
    day: String(row.day),
    revenueCents: Number(row.revenue_cents), covers: Number(row.covers), parties: Number(row.parties),
    orders: Number(row.orders), items: Number(row.items),
    confirmSeconds: Number(row.confirm_seconds), serveSeconds: Number(row.serve_seconds),
  }));
  return { days: list, timezone, from: list[0]?.day ?? to, to };
}
