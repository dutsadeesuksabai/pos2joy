"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Armchair, BellRing, Check, Clock3, Printer, QrCode, Receipt, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/features/orders/model";
import { translate, type Locale } from "@/i18n/dictionary";
import { ticketLabel } from "@/features/queue/ticket";
import { canSeat, planSeating } from "@/features/queue/recommend";
import { callQueue, cancelCall, closeTable, joinQueue, markTable, seatTable } from "./actions";
import type { ServiceSnapshot } from "./repository";

type Props = { branchId: string; currency: string; origin: string; snapshot: ServiceSnapshot; canBill: boolean; canQueue: boolean; locale: Locale };
type Tab = "floor" | "queue";

export function ServiceConsole({ branchId, currency, origin, snapshot, canBill, canQueue, locale }: Props) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("floor");
  const showQueue = canQueue && tab === "queue";
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [name, setName] = useState("");
  const [size, setSize] = useState(2);
  const [qrFor, setQrFor] = useState<string | null>(null);
  const [now, setNow] = useState(snapshot.generatedAt);
  const [pending, startTransition] = useTransition();

  // Waits are shown in minutes, so a minute is fast enough to re-render.
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);

  const table = snapshot.tables.find(item => item.id === selected) ?? null;
  const billFor = (tableId: string) => snapshot.bills.find(bill => bill.tableId === tableId && bill.status !== "served");
  const free = snapshot.tables.filter(item => item.state === "available").length;
  const serviceTables = snapshot.tables.map(t => ({ ...t, status: t.state, x: 0, y: 0 }));
  const queueParties = snapshot.queue.map(entry => ({ id: entry.id, name: entry.guestName, size: entry.partySize, joinedAt: entry.joinedAt, status: entry.status, needsAccessible: entry.needsAccessible, requestedFloorId: entry.requestedFloorId }));
  const matches = planSeating(serviceTables, queueParties, now).filter(match => match.table.id === table?.id);

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
  // The Call button lights up on its own: it takes the smallest free table that
  // fits, so a host never has to choose one before calling the next party.
  const freeFor = (entryId: string) => {
    const party = queueParties.find(item => item.id === entryId);
    return party ? serviceTables.filter(item => canSeat(item, party)).sort((a, b) => a.capacity - b.capacity)[0] : undefined;
  };
  // A slip prints from its own window so the receipt page size applies.
  const printSlip = (entryId: string) => window.open(`/workspace/${branchId}/slip/${entryId}`, "_blank", "width=420,height=640");
  const calledTable = (entryId: string) => snapshot.queue.find(entry => entry.id === entryId)?.calledTableLabel ?? null;

  return <section className="pos">
    {canQueue && <div className="pos-tabs" role="tablist">
      <button role="tab" aria-selected={tab === "floor"} onClick={() => setTab("floor")}><Armchair size={17}/>{t("staff.floor")}<span>{free}/{snapshot.tables.length}</span></button>
      <button role="tab" aria-selected={tab === "queue"} onClick={() => setTab("queue")}><Users size={17}/>{t("staff.queue")}<span>{snapshot.queue.length}</span></button>
    </div>}

    {message && <div className={`pos-message ${isError ? "error" : ""}`} role={isError ? "alert" : "status"}><span>{message}</span><button aria-label="Dismiss" onClick={() => setMessage("")}><X size={16}/></button></div>}

    <div className={`pos-body ${tab}`}>
      <div className="pos-main">
        {!showQueue ? <>
          {snapshot.tables.length === 0
            ? <p className="pos-empty">{t("staff.noTables")}<br/><Link className="pos-fix" href={`/workspace/${branchId}/floor`}>{t("staff.setUpFloor")}</Link></p>
            : <div className="table-grid">{snapshot.tables.map(item => {
                const bill = billFor(item.id);
                return <button key={item.id} className={`table-tile ${item.state} ${selected === item.id ? "chosen" : ""}`} aria-pressed={selected === item.id} onClick={() => setSelected(item.id === selected ? null : item.id)}>
                  <strong>{item.label}</strong>
                  <span>{item.capacity} {t("staff.seats")}{item.accessible ? " · A" : ""}</span>
                  <small>{item.state}</small>
                  {bill && bill.lines > 0 && <em>{formatMoney(bill.totalCents, currency)}</em>}
                </button>;
              })}</div>}
        </> : <>
          <form className="queue-form" onSubmit={event => { event.preventDefault(); if (!name.trim()) return; run(async () => { const r = await joinQueue({ branchId, guestName: name.trim(), partySize: size }); if (r.ok) { setName(""); setSize(2); if (r.entryId) printSlip(r.entryId); } return r; }); }}>
            <label className="sr-only" htmlFor="guest-name">{t("staff.guestName")}</label>
            <input id="guest-name" placeholder={t("staff.guestName")} value={name} maxLength={60} required onChange={event => setName(event.target.value)}/>
            <label className="sr-only" htmlFor="party-size">{t("staff.partySize")}</label>
            <input id="party-size" type="number" min={1} max={30} value={size} required onChange={event => setSize(Math.max(1, Math.min(30, Number(event.target.value) || 1)))}/>
            <Button type="submit" disabled={pending || !name.trim()}>{t("staff.add")}</Button>
          </form>
          <a className="call-link" href={`/call/${branchId}`} target="_blank" rel="noreferrer"><BellRing size={14}/>{t("staff.openCallDisplay")}</a>
          {snapshot.queue.length === 0
            ? <p className="pos-empty">{t("staff.nobodyWaiting")}</p>
            : <ul className="queue-rows">{snapshot.queue.map(entry => <li key={entry.id}>
                <button className="queue-no" title={t("staff.printSlip")} onClick={() => printSlip(entry.id)}>{ticketLabel(entry.ticketNo)}<Printer size={11}/></button>
                <div><strong>{entry.guestName}</strong><span><Users size={13}/>{entry.partySize} · <Clock3 size={13}/>{waited(entry.joinedAt)} {t("staff.min")}</span></div>
                {entry.status === "offered"
                  ? <div className="queue-called">
                      <span>{t("staff.called")}{calledTable(entry.id) ? ` → ${calledTable(entry.id)}` : ""}</span>
                      <button disabled={pending} onClick={() => run(() => cancelCall({ branchId, entryId: entry.id }))}>{t("staff.noShow")}</button>
                    </div>
                  : table && canSeat({ ...table, status: table.state, x: 0, y: 0 }, queueParties.find(party => party.id === entry.id)!)
                  ? <div className="queue-acts">
                      <Button disabled={pending} onClick={() => run(() => callQueue({ branchId, entryId: entry.id, tableId: table.id }))}><BellRing/>{t("staff.call")}</Button>
                      <Button variant="outline" disabled={pending} onClick={() => run(() => seatTable({ branchId, tableId: table.id, entryId: entry.id }))}>{t("staff.seat")}</Button>
                    </div>
                  : freeFor(entry.id)
                  ? <Button disabled={pending} onClick={() => run(() => callQueue({ branchId, entryId: entry.id, tableId: freeFor(entry.id)!.id }))}><BellRing/>Call</Button>
                  : <span className="queue-hint">{snapshot.tables.length === 0 ? t("staff.noTablesYet") : t("staff.noFreeTable")}</span>}
              </li>)}</ul>}
        </>}
      </div>

      <aside className="pos-side">
        {!table ? <p className="pos-empty">{t("staff.pickTable")}</p> : <>
          <div className="side-head"><div><strong>{t("staff.table")} {table.label}</strong><span>{table.capacity} {t("staff.seats")} · {table.state}</span></div></div>

          {(() => {
            const bill = billFor(table.id);
            const lines = snapshot.items.filter(item => item.tableId === table.id);
            return bill && lines.length > 0 ? <div className="bill-card">
              <div className="bill-head"><Receipt size={16}/>{t("staff.openBill")}<span>{bill.lines} item{bill.lines > 1 ? "s" : ""}</span></div>
              <ul className="bill-lines">{lines.map(line => <li key={line.name}>
                <span>{line.quantity}× {line.name}</span><span>{formatMoney(line.unitPriceCents * line.quantity, currency)}</span>
              </li>)}</ul>
              <strong>{formatMoney(bill.totalCents, currency)}</strong>
            </div> : table.state === "occupied" ? <p className="pos-empty small">{t("staff.noOrders")}</p> : null;
          })()}

          <div className="side-actions">
            {canQueue && table.state === "available" && <>
              <Button disabled={pending} onClick={() => run(() => seatTable({ branchId, tableId: table.id, entryId: null }))}><Check/>{t("staff.seat")}</Button>
              <Button variant="outline" disabled={pending} onClick={() => run(() => markTable({ branchId, tableId: table.id, state: "reserved" }))}>{t("staff.reserve")}</Button>
            </>}
            {canQueue && table.state === "reserved" && <>
              <Button disabled={pending} onClick={() => run(() => seatTable({ branchId, tableId: table.id, entryId: null }))}><Check/>Seat</Button>
              <Button variant="outline" disabled={pending} onClick={() => run(() => markTable({ branchId, tableId: table.id, state: "available" }))}>{t("staff.free")}</Button>
            </>}
            {table.state === "occupied" && (canBill
              ? <Button disabled={pending} onClick={() => run(() => closeTable({ branchId, tableId: table.id }))}><Receipt/>{t("staff.closeBill")}</Button>
              : <p className="pos-empty small">{t("staff.cashierCloses")}</p>)}
            <Button variant="ghost" onClick={() => setQrFor(qrFor === table.id ? null : table.id)}><QrCode/>{qrFor === table.id ? t("staff.hideQr") : t("staff.qrCode")}</Button>
          </div>

          {qrFor === table.id && <div className="qr-card">
            <img alt={`QR code linking to the menu for table ${table.label}`} width={180} height={180}
              src={`/workspace/${branchId}/qr/${table.id}`}/>
            <code>{origin}/t/{table.id}</code>
            <p>{t("staff.printFor")} {table.label}</p>
          </div>}

          {matches.length > 0 && <div className="match-card">
            <span className="eyebrow">{t("staff.bestMatch")}</span>
            <strong>{matches[0].party.name} · {matches[0].party.size} guests</strong>
            <p>{matches[0].reason}</p>
            <Button disabled={pending} onClick={() => run(() => seatTable({ branchId, tableId: table.id, entryId: matches[0].party.id }))}>Seat this party</Button>
          </div>}
        </>}
      </aside>
    </div>
  </section>;
}
