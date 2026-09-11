"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Armchair, ArrowRight, Clock3, Plus, RefreshCw, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { joinQueue, seatTable, type ServiceResult } from "@/features/service/actions";
import type { ServiceSnapshot } from "@/features/service/repository";
import { canSeat, defaultPolicy, planSeating } from "./recommend";
import "./fair-queue.css";

export function FairQueue({ branchId, snapshot }: { branchId: string; snapshot: ServiceSnapshot }) {
  const router = useRouter();
  const [now, setNow] = useState(snapshot.generatedAt);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [name, setName] = useState("");
  const [size, setSize] = useState(2);
  const [accessible, setAccessible] = useState(false);
  const [floorId, setFloorId] = useState("");
  const [manualParty, setManualParty] = useState("");
  const [manualTable, setManualTable] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => { setNow(snapshot.generatedAt); }, [snapshot.generatedAt]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const tables = snapshot.tables.map(t => ({ ...t, status: t.state, x: 0, y: 0 }));
  const parties = snapshot.queue.map(p => ({ id: p.id, name: p.guestName, size: p.partySize, status: p.status, joinedAt: p.joinedAt, needsAccessible: p.needsAccessible, requestedFloorId: p.requestedFloorId }));
  const plan = planSeating(tables, parties, now);
  const waiting = parties.filter(p => p.status === "waiting");
  const chosenParty = parties.find(p => p.id === manualParty);
  const eligibleTables = chosenParty ? tables.filter(t => canSeat(t, chosenParty)) : [];
  const canOverride = chosenParty && eligibleTables.some(t => t.id === manualTable) && reason.trim().length >= 5;
  const oldest = waiting.length ? Math.max(...waiting.map(p => Math.max(0, Math.floor((now - p.joinedAt) / 60000)))) : 0;
  function run(task: () => Promise<ServiceResult>, success?: () => void) {
    startTransition(async () => {
      try {
        const result = await task();
        setError(!result.ok); setMessage(result.ok ? result.message : result.error);
        if (result.ok) { success?.(); router.refresh(); }
      } catch { setError(true); setMessage("Connection interrupted. Refresh to check the current queue before trying again."); }
    });
  }
  return <div className="fair-queue">
    <div className="fq-summary"><div><Users/><strong>{waiting.length}</strong><span>Waiting parties</span></div><div><Armchair/><strong>{tables.filter(t => t.status === "available").length}</strong><span>Available tables</span></div><div><Clock3/><strong>{oldest}<small> min</small></strong><span>Longest current wait</span></div><Button variant="outline" disabled={pending} onClick={() => startTransition(() => router.refresh())}><RefreshCw/>Refresh floor</Button></div>
    {message && <div className={`fq-notice ${error ? "error" : ""}`} role={error ? "alert" : "status"}>{message}</div>}
    <section className="fq-plan"><div className="fq-plan-heading"><div><span className="fq-eyebrow"><Sparkles size={16}/>FAIR QUEUE</span><h2>Suggested seats</h2><p>Fits the whole room, with arrival-time priority after {defaultPolicy.maxWaitMinutes} minutes.</p></div><span className="fq-count">{plan.length} possible matches</span></div>
      {plan.length ? <div className="fq-matches">{plan.map(item => <article key={item.party.id}><div className="fq-table">{item.table.label}<span>{item.table.capacity} seats</span></div><div className="fq-match-detail"><h3>{item.party.name} <small>· {item.party.size} guests</small></h3><p>{item.reason}</p>{item.overdue && <span className="fq-priority">Long-wait priority</span>}</div><Button disabled={pending} onClick={() => run(() => seatTable({ branchId, entryId: item.party.id, tableId: item.table.id }))}>Seat<ArrowRight/></Button></article>)}</div> : <p className="fq-empty">{waiting.length ? "No free table meets the waiting parties’ requirements yet." : "Everyone is seated. Ready for the next arrival."}</p>}
      <p className="fq-note">This is a snapshot of the floor. Seating checks current availability, requirements, and queue priority again. Reserved tables and called parties are excluded from new matches.</p>
    </section>
    <div className="fq-columns"><section className="fq-waiting"><h2>Waiting list</h2><form onSubmit={event => { event.preventDefault(); run(() => joinQueue({ branchId, guestName: name, partySize: size, needsAccessible: accessible, requestedFloorId: floorId || null }), () => { setName(""); setSize(2); setFloorId(""); setAccessible(false); }); }}>
      <fieldset disabled={pending}><div className="fq-entry"><label>Guest name<input required maxLength={60} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Jamie"/></label><label>Guests<input type="number" required min={1} max={30} value={size} onChange={e => setSize(Number(e.target.value))}/></label></div><label>Seating area<select value={floorId} onChange={e => setFloorId(e.target.value)}><option value="">Any area</option>{snapshot.rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label><label className="fq-checkbox"><input type="checkbox" checked={accessible} onChange={e => setAccessible(e.target.checked)}/>Accessible seating required</label><p className="fq-help">A selected area is a requirement and may increase the wait.</p><Button type="submit" disabled={!name.trim()}><Plus/>Add party</Button></fieldset>
    </form><ul>{parties.map(party => <li key={party.id}><span className="fq-avatar">{party.name.charAt(0).toUpperCase()}</span><div><strong>{party.name}</strong><span>{party.size} guests · {Math.max(0,Math.floor((now-party.joinedAt)/60000))} min{party.status === "offered" ? " · Called" : ""}</span>{party.needsAccessible && <small>Accessible table required</small>}{party.requestedFloorId && <small>{snapshot.rooms.find(r => r.id === party.requestedFloorId)?.name ?? "Requested area"} only</small>}</div><span className="fq-match-label">{plan.find(m => m.party.id === party.id)?.table.label ? `Table ${plan.find(m => m.party.id === party.id)!.table.label}` : party.status === "offered" ? "Manage in Service" : "Waiting for a match"}</span></li>)}</ul>{!parties.length && <p className="fq-empty">No one waiting.</p>}</section>
    <aside className="fq-manual"><span className="fq-eyebrow">HOST’S CHOICE</span><h2>Choose a different match</h2><p>Use your judgment when a party needs another arrangement. The reason is recorded with your staff account.</p><form onSubmit={event => { event.preventDefault(); if (!canOverride) return; run(() => seatTable({ branchId, entryId: manualParty, tableId: manualTable, overrideReason: reason }), () => { setManualParty(""); setManualTable(""); setReason(""); }); }}><fieldset disabled={pending}><label>Party<select required value={manualParty} onChange={e => { setManualParty(e.target.value); setManualTable(""); }}><option value="">Choose a waiting party</option>{waiting.map(p => <option value={p.id} key={p.id}>{p.name} · {p.size} guests</option>)}</select></label><label>Compatible table<select required value={manualTable} onChange={e => setManualTable(e.target.value)}><option value="">Choose a table</option>{eligibleTables.map(t => <option key={t.id} value={t.id}>Table {t.label} · {t.capacity} seats</option>)}</select></label><label>Reason<textarea required minLength={5} maxLength={240} rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. The recommended party is waiting for a friend"/></label><Button type="submit" disabled={!canOverride}>Confirm seating</Button></fieldset></form><p className="fq-help">Table capacity, accessibility, and the requested area always apply. An override cannot bypass them.</p><div className="fq-rules"><Clock3/><div><strong>Fairness comes first</strong><p>Long-wait parties keep priority when compatible seats exist. A smaller party can use a larger table when it doesn’t displace a higher-priority party.</p></div></div></aside></div>
  </div>;
}
