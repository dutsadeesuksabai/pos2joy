"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Armchair, Check, Clock3, QrCode, Receipt, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/features/orders/model";
import { recommend } from "@/features/queue/recommend";
import { closeTable, joinQueue, markTable, seatTable } from "./actions";
import type { ServiceSnapshot } from "./repository";

type Props = { branchId: string; currency: string; origin: string; snapshot: ServiceSnapshot; canBill: boolean };
type Tab = "floor" | "queue";

export function ServiceConsole({ branchId, currency, origin, snapshot, canBill }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("floor");
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [name, setName] = useState("");
  const [size, setSize] = useState(2);
  const [qrFor, setQrFor] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();

  // Waits are shown in minutes, so a minute is fast enough to re-render.
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);

  const table = snapshot.tables.find(item => item.id === selected) ?? null;
  const billFor = (tableId: string) => snapshot.bills.find(bill => bill.tableId === tableId && bill.status !== "served");
  const free = snapshot.tables.filter(item => item.state === "available").length;
  const matches = table && table.state === "available"
    ? recommend({ ...table, status: "available", x: 0, y: 0 }, snapshot.queue.map(entry => ({ id: entry.id, name: entry.guestName, size: entry.partySize, joinedAt: entry.joinedAt, status: "waiting" as const })), now)
    : [];

  function run(work: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) {
    startTransition(async () => {
      try {
        const result = await work();
        setIsError(!result.ok);
        setMessage(result.ok ? result.message : result.error);
        if (result.ok) router.refresh();
      } catch { setIsError(true); setMessage("Connection interrupted. Refresh to see the current floor."); }
    });
  }

  const waited = (joinedAt: number) => Math.max(0, Math.floor((now - joinedAt) / 60000));

  return <section className="pos">
    <div className="pos-tabs" role="tablist">
      <button role="tab" aria-selected={tab === "floor"} onClick={() => setTab("floor")}><Armchair size={17}/>Floor<span>{free}/{snapshot.tables.length}</span></button>
      <button role="tab" aria-selected={tab === "queue"} onClick={() => setTab("queue")}><Users size={17}/>Queue<span>{snapshot.queue.length}</span></button>
    </div>

    {message && <div className={`pos-message ${isError ? "error" : ""}`} role={isError ? "alert" : "status"}><span>{message}</span><button aria-label="Dismiss" onClick={() => setMessage("")}><X size={16}/></button></div>}

    <div className={`pos-body ${tab}`}>
      <div className="pos-main">
        {tab === "floor" ? <>
          {snapshot.tables.length === 0
            ? <p className="pos-empty">No tables yet. Publish a floor layout first, then tables appear here.</p>
            : <div className="table-grid">{snapshot.tables.map(item => {
                const bill = billFor(item.id);
                return <button key={item.id} className={`table-tile ${item.state} ${selected === item.id ? "chosen" : ""}`} aria-pressed={selected === item.id} onClick={() => setSelected(item.id === selected ? null : item.id)}>
                  <strong>{item.label}</strong>
                  <span>{item.capacity} seats{item.accessible ? " · A" : ""}</span>
                  <small>{item.state}</small>
                  {bill && bill.lines > 0 && <em>{formatMoney(bill.totalCents, currency)}</em>}
                </button>;
              })}</div>}
        </> : <>
          <form className="queue-form" onSubmit={event => { event.preventDefault(); if (!name.trim()) return; run(async () => { const r = await joinQueue({ branchId, guestName: name.trim(), partySize: size }); if (r.ok) { setName(""); setSize(2); } return r; }); }}>
            <label className="sr-only" htmlFor="guest-name">Guest name</label>
            <input id="guest-name" placeholder="Guest name" value={name} maxLength={60} required onChange={event => setName(event.target.value)}/>
            <label className="sr-only" htmlFor="party-size">Party size</label>
            <input id="party-size" type="number" min={1} max={30} value={size} required onChange={event => setSize(Math.max(1, Math.min(30, Number(event.target.value) || 1)))}/>
            <Button type="submit" disabled={pending || !name.trim()}>Add</Button>
          </form>
          {snapshot.queue.length === 0
            ? <p className="pos-empty">Nobody is waiting. Lovely.</p>
            : <ul className="queue-rows">{snapshot.queue.map((entry, index) => <li key={entry.id}>
                <span className="queue-no">{String(index + 1).padStart(2, "0")}</span>
                <div><strong>{entry.guestName}</strong><span><Users size={13}/>{entry.partySize} · <Clock3 size={13}/>{waited(entry.joinedAt)} min</span></div>
                {table && table.state === "available" && entry.partySize <= table.capacity
                  ? <Button disabled={pending} onClick={() => run(() => seatTable({ branchId, tableId: table.id, entryId: entry.id }))}>Seat at {table.label}</Button>
                  : <span className="queue-hint">{table ? (table.state !== "available" ? `${table.label} busy` : `needs ${entry.partySize}`) : "pick a table"}</span>}
              </li>)}</ul>}
        </>}
      </div>

      <aside className="pos-side">
        {!table ? <p className="pos-empty">Choose a table to seat guests, take its bill, or show its QR code.</p> : <>
          <div className="side-head"><div><strong>Table {table.label}</strong><span>{table.capacity} seats · {table.state}</span></div></div>

          {(() => { const bill = billFor(table.id); return bill && bill.lines > 0 ? <div className="bill-card">
            <div className="bill-head"><Receipt size={16}/>Open bill<span>{bill.lines} item{bill.lines > 1 ? "s" : ""}</span></div>
            <strong>{formatMoney(bill.totalCents, currency)}</strong>
          </div> : table.state === "occupied" ? <p className="pos-empty small">Seated. No orders on this bill yet.</p> : null; })()}

          <div className="side-actions">
            {table.state === "available" && <>
              <Button disabled={pending} onClick={() => run(() => seatTable({ branchId, tableId: table.id, entryId: null }))}><Check/>Seat walk-in</Button>
              <Button variant="outline" disabled={pending} onClick={() => run(() => markTable({ branchId, tableId: table.id, state: "reserved" }))}>Hold as reserved</Button>
            </>}
            {table.state === "reserved" && <>
              <Button disabled={pending} onClick={() => run(() => seatTable({ branchId, tableId: table.id, entryId: null }))}><Check/>Seat this table</Button>
              <Button variant="outline" disabled={pending} onClick={() => run(() => markTable({ branchId, tableId: table.id, state: "available" }))}>Release hold</Button>
            </>}
            {table.state === "occupied" && (canBill
              ? <Button disabled={pending} onClick={() => run(() => closeTable({ branchId, tableId: table.id }))}><Receipt/>Close bill &amp; free table</Button>
              : <p className="pos-empty small">Only a cashier or manager can close a bill.</p>)}
            <Button variant="ghost" onClick={() => setQrFor(qrFor === table.id ? null : table.id)}><QrCode/>{qrFor === table.id ? "Hide QR code" : "Show QR code"}</Button>
          </div>

          {qrFor === table.id && <div className="qr-card">
            <img alt={`QR code linking to the menu for table ${table.label}`} width={180} height={180}
              src={`/workspace/${branchId}/qr/${table.id}`}/>
            <code>{origin}/t/{table.id}</code>
            <p>Print this for table {table.label}. Guests can order once the table is seated.</p>
          </div>}

          {matches.length > 0 && <div className="match-card">
            <span className="eyebrow">BEST MATCH</span>
            <strong>{matches[0].party.name} · {matches[0].party.size} guests</strong>
            <p>{matches[0].reason}</p>
            <Button disabled={pending} onClick={() => run(() => seatTable({ branchId, tableId: table.id, entryId: matches[0].party.id }))}>Seat this party</Button>
          </div>}
        </>}
      </aside>
    </div>
  </section>;
}
