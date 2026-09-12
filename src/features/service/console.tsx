"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, Check, Clock3, Printer, QrCode, Receipt, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/features/orders/model";
import { translate, type Locale } from "@/i18n/dictionary";
import { ticketLabel } from "@/features/queue/ticket";
import { canSeat, planSeating } from "@/features/queue/recommend";
import { callQueue, cancelCall, closeTable, joinQueue, markTable, seatTable } from "./actions";
import { Dashboard } from "./dashboard";
import type { BranchInsights, ServiceSnapshot } from "./repository";

type Props = { branchId: string; currency: string; origin: string; snapshot: ServiceSnapshot; canBill: boolean; canQueue: boolean; locale: Locale; insights: BranchInsights };

// One screen: the room on the left, the waiting list on the right. Seating used
// to mean switching tabs to pick a table and switching back to press Seat; now
// a party is chosen and a table tapped, and the tables that cannot take them
// are dimmed so the wrong one is hard to hit.
export function ServiceConsole({ branchId, currency, origin, snapshot, canBill, canQueue, locale, insights }: Props) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const router = useRouter();
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [seatingId, setSeatingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [name, setName] = useState("");
  const [size, setSize] = useState(2);
  const [qrOpen, setQrOpen] = useState(false);
  const [now, setNow] = useState(snapshot.generatedAt);
  const [pending, startTransition] = useTransition();

  // Waits are shown in minutes, so a minute is fast enough to re-render.
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);

  const table = snapshot.tables.find(item => item.id === selectedTable) ?? null;
  const billByTable = useMemo(() => {
    const result = new Map<string, typeof snapshot.bills[number]>();
    for (const bill of snapshot.bills) if (bill.status !== "served" && !result.has(bill.tableId)) result.set(bill.tableId, bill);
    return result;
  }, [snapshot.bills]);
  const linesByTable = useMemo(() => {
    const result = new Map<string, typeof snapshot.items>();
    for (const item of snapshot.items) {
      const lines = result.get(item.tableId) ?? [];
      lines.push(item); result.set(item.tableId, lines);
    }
    return result;
  }, [snapshot.items]);
  const billFor = (tableId: string) => billByTable.get(tableId);
  const linesFor = (tableId: string) => linesByTable.get(tableId) ?? [];
  const free = snapshot.tables.filter(item => item.state === "available").length;
  const serviceTables = useMemo(() => snapshot.tables.map(item => ({ ...item, status: item.state, x: 0, y: 0 })), [snapshot.tables]);
  const queueParties = useMemo(() => snapshot.queue.map(entry => ({ id: entry.id, name: entry.guestName, size: entry.partySize, joinedAt: entry.joinedAt, status: entry.status, needsAccessible: entry.needsAccessible, requestedFloorId: entry.requestedFloorId })), [snapshot.queue]);

  const seating = seatingId ? snapshot.queue.find(entry => entry.id === seatingId) ?? null : null;
  const seatingParty = seating ? queueParties.find(party => party.id === seating.id)! : null;
  const fits = (tableId: string) => {
    if (!seatingParty) return true;
    const candidate = serviceTables.find(item => item.id === tableId);
    return Boolean(candidate && canSeat(candidate, seatingParty));
  };
  const plan = useMemo(() => planSeating(serviceTables, queueParties, now), [serviceTables, queueParties, now]);
  const matches = plan.filter(match => match.table.id === table?.id);
  const freeFor = (entryId: string) => {
    const party = queueParties.find(item => item.id === entryId);
    return party ? serviceTables.filter(item => canSeat(item, party)).sort((a, b) => a.capacity - b.capacity)[0] : undefined;
  };

  function run(work: () => Promise<{ ok: true; message: string; entryId?: string } | { ok: false; error: string }>) {
    startTransition(async () => {
      try {
        const result = await work();
        setIsError(!result.ok);
        setMessage(result.ok ? result.message : result.error);
        if (result.ok) router.refresh();
      } catch { setIsError(true); setMessage(t("staff.connectionLost")); }
    });
  }

  const waited = (joinedAt: number) => Math.max(0, Math.floor((now - joinedAt) / 60000));
  // A slip prints from its own window so the receipt page size applies.
  const printSlip = (entryId: string) => window.open(`/workspace/${branchId}/slip/${entryId}`, "_blank", "width=420,height=640");
  const stateWord = (state: string) => state === "occupied" ? t("staff.occupied") : state === "reserved" ? t("staff.reservedState") : t("staff.available");

  // Tapping a table means "seat the chosen party here" while one is chosen, and
  // "inspect this table" otherwise.
  function tapTable(tableId: string) {
    if (seating) {
      if (!fits(tableId)) return;
      const entryId = seating.id;
      setSeatingId(null);
      run(() => seatTable({ branchId, tableId, entryId }));
      return;
    }
    setQrOpen(false);
    setSelectedTable(tableId === selectedTable ? null : tableId);
  }

  const called = snapshot.queue.filter(entry => entry.status === "offered")
    .map(entry => ({ id: entry.id, ticketNo: entry.ticketNo, guestName: entry.guestName, partySize: entry.partySize, calledTableLabel: entry.calledTableLabel }));

  return <section className="pos">
    <Dashboard insights={insights} called={called} currency={currency} locale={locale} canBill={canBill}/>
    {message && <div className={`pos-message ${isError ? "error" : ""}`} role={isError ? "alert" : "status"}><span>{message}</span><button aria-label="Dismiss" onClick={() => setMessage("")}><X size={16}/></button></div>}

    <div className={`pos-body ${canQueue ? "" : "solo"}`}>
      <div className="pos-tables">
        {seating && <div className="seating-banner" role="status">
          <span><b>{ticketLabel(seating.ticketNo)} {seating.guestName}</b> · {seating.partySize} · {t("staff.tapTable")}</span>
          <button onClick={() => setSeatingId(null)}>{t("staff.cancel")}</button>
        </div>}

        {snapshot.tables.length > 0 && <div className="table-legend">
          <span><i className="is-free"/>{t("staff.available")}</span>
          <span><i className="is-busy"/>{t("staff.occupied")}</span>
          <span><i className="is-held"/>{t("staff.reservedState")}</span>
        </div>}

        {snapshot.tables.length === 0
          ? <p className="pos-empty">{t("staff.noTables")}<br/><Link className="pos-fix" href={`/workspace/${branchId}/floor`}>{t("staff.setUpFloor")}</Link></p>
          : <div className="table-grid">{snapshot.tables.map(item => {
              const bill = billFor(item.id);
              const blocked = Boolean(seating) && !fits(item.id);
              return <button key={item.id} disabled={pending || blocked}
                className={`table-tile ${item.state} ${selectedTable === item.id ? "chosen" : ""} ${blocked ? "blocked" : ""} ${seating && !blocked ? "target" : ""}`}
                aria-pressed={selectedTable === item.id} onClick={() => tapTable(item.id)}>
                <strong>{item.label}</strong>
                <span>{item.capacity} {t("staff.seats")}{item.accessible ? " · A" : ""}</span>
                <small>{stateWord(item.state)}</small>
                {bill && bill.lines > 0 && <em>{formatMoney(bill.totalCents, currency)}</em>}
              </button>;
            })}</div>}
      </div>

      {canQueue && <aside className="pos-queue">
        <div className="queue-head"><Users size={16}/><strong>{t("staff.queue")}</strong><span>{snapshot.queue.length}</span></div>
        <form className="queue-form" onSubmit={event => { event.preventDefault(); if (!name.trim()) return; run(async () => { const r = await joinQueue({ branchId, guestName: name.trim(), partySize: size }); if (r.ok) { setName(""); setSize(2); if (r.entryId) printSlip(r.entryId); } return r; }); }}>
          <label className="sr-only" htmlFor="guest-name">{t("staff.guestName")}</label>
          <input id="guest-name" placeholder={t("staff.guestName")} value={name} maxLength={60} required onChange={event => setName(event.target.value)}/>
          <label className="sr-only" htmlFor="party-size">{t("staff.partySize")}</label>
          <input id="party-size" type="number" min={1} max={30} value={size} required onChange={event => setSize(Math.max(1, Math.min(30, Number(event.target.value) || 1)))}/>
          <Button type="submit" disabled={pending || !name.trim()}>{t("staff.add")}</Button>
        </form>

        {snapshot.queue.length === 0
          ? <p className="pos-empty">{t("staff.nobodyWaiting")}</p>
          : <ul className="queue-rows">{snapshot.queue.map(entry => {
              const called = entry.status === "offered";
              return <li key={entry.id} className={seatingId === entry.id ? "picked" : ""}>
                <button className="queue-pick" disabled={pending || called} onClick={() => { setSelectedTable(null); setSeatingId(seatingId === entry.id ? null : entry.id); }}>
                  <span className="queue-no">{ticketLabel(entry.ticketNo)}</span>
                  <span className="queue-who"><strong>{entry.guestName}</strong><small><Users size={12}/>{entry.partySize} · <Clock3 size={12}/>{waited(entry.joinedAt)} {t("staff.min")}</small></span>
                </button>
                <div className="queue-side">
                  {called
                    ? <><span className="queue-tag">{t("staff.called")}{entry.calledTableLabel ? ` → ${entry.calledTableLabel}` : ""}</span>
                        <button className="queue-link" disabled={pending} onClick={() => run(() => cancelCall({ branchId, entryId: entry.id }))}>{t("staff.noShow")}</button></>
                    : freeFor(entry.id)
                    ? <Button variant="outline" disabled={pending} onClick={() => run(() => callQueue({ branchId, entryId: entry.id, tableId: freeFor(entry.id)!.id }))}><BellRing size={15}/>{t("staff.call")}</Button>
                    : <span className="queue-tag muted">{snapshot.tables.length === 0 ? t("staff.noTablesYet") : t("staff.noFreeTable")}</span>}
                  <button className="queue-link" title={t("staff.printSlip")} disabled={pending} onClick={() => printSlip(entry.id)}><Printer size={13}/></button>
                </div>
              </li>;
            })}</ul>}

        <a className="call-link" href={`/call/${branchId}`} target="_blank" rel="noreferrer"><BellRing size={13}/>{t("staff.openCallDisplay")}</a>
      </aside>}
    </div>

    {/* One bar for whatever the selected table can do, within reach of a thumb. */}
    {table && !seating && <div className="pos-actionbar">
      <div className="bar-table">
        <strong>{table.label}</strong>
        <span>{table.capacity} {t("staff.seats")} · {stateWord(table.state)}</span>
        {(() => { const bill = billFor(table.id), lines = linesFor(table.id);
          return bill && lines.length > 0 ? <em title={lines.map(l => `${l.quantity}x ${l.name}`).join(", ")}>{t("staff.openBill")} {formatMoney(bill.totalCents, currency)}</em> : null; })()}
      </div>
      <div className="bar-actions">
        {canQueue && table.state === "available" && <>
          <Button disabled={pending} onClick={() => run(() => seatTable({ branchId, tableId: table.id, entryId: null }))}><Check/>{t("staff.walkIn")}</Button>
          <Button variant="outline" disabled={pending} onClick={() => run(() => markTable({ branchId, tableId: table.id, state: "reserved" }))}>{t("staff.reserve")}</Button>
        </>}
        {canQueue && table.state === "reserved" && <>
          <Button disabled={pending} onClick={() => run(() => seatTable({ branchId, tableId: table.id, entryId: null }))}><Check/>{t("staff.seat")}</Button>
          <Button variant="outline" disabled={pending} onClick={() => run(() => markTable({ branchId, tableId: table.id, state: "available" }))}>{t("staff.free")}</Button>
        </>}
        {table.state === "occupied" && canBill && <Button disabled={pending} onClick={() => run(() => closeTable({ branchId, tableId: table.id }))}><Receipt/>{t("staff.closeBill")}</Button>}
        <Button variant="ghost" onClick={() => setQrOpen(!qrOpen)}><QrCode/>{qrOpen ? t("staff.hideQr") : t("staff.qrCode")}</Button>
        <Button variant="ghost" aria-label={t("staff.cancel")} onClick={() => { setSelectedTable(null); setQrOpen(false); }}><X/></Button>
      </div>
      {qrOpen && <div className="bar-qr">
        <img alt={`QR ${table.label}`} width={150} height={150} src={`/workspace/${branchId}/qr/${table.id}`}/>
        <code>{origin}/t/{table.id}</code>
      </div>}
      {matches.length > 0 && table.state === "available" && <button className="bar-match" disabled={pending} onClick={() => run(() => seatTable({ branchId, tableId: table.id, entryId: matches[0].party.id }))}>
        <span className="eyebrow">{t("staff.bestMatch")}</span>{matches[0].party.name} · {matches[0].party.size}
      </button>}
    </div>}
  </section>;
}
