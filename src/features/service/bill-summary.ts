export type BillLineRow = {
  id: string; tableId: string; status: string; createdAt: Date;
  name: string | null; quantity: number | null; unitPriceCents: number | null;
};

// Fold the joined result once instead of fetching lines twice (SUM + detail).
// Preserve empty bills and each order's identity, even for the same table.
export function summarizeBills(rows: BillLineRow[]) {
  const bills = new Map<string, { id: string; tableId: string; status: string; createdAt: number; totalCents: number; lines: number }>();
  const items: { tableId: string; name: string; quantity: number; unitPriceCents: number }[] = [];
  for (const row of rows) {
    let bill = bills.get(row.id);
    if (!bill) {
      bill = { id: row.id, tableId: row.tableId, status: row.status, createdAt: row.createdAt.getTime(), totalCents: 0, lines: 0 };
      bills.set(row.id, bill);
    }
    if (row.name !== null && row.quantity !== null && row.unitPriceCents !== null) {
      bill.totalCents += row.quantity * row.unitPriceCents;
      bill.lines++;
      items.push({ tableId: row.tableId, name: row.name, quantity: row.quantity, unitPriceCents: row.unitPriceCents });
    }
  }
  return { bills: [...bills.values()].sort((a, b) => b.createdAt - a.createdAt), items };
}
