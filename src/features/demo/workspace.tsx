"use client";

import { useEffect, useRef, useState } from "react";
import { Armchair, ArrowLeft, ArrowRight, Check, CheckCheck, ChevronDown, Clock3, Coffee, LayoutDashboard, Minus, MousePointer2, Plus, QrCode, RotateCcw, Save, Settings2, ShoppingBag, Sparkles, Square, Users, Utensils, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recommend, type QueueParty, type ServiceTable } from "@/features/queue/recommend";

type Block = { id: string; label: string; x: number; y: number; width: number; height: number };
type Branch = { tables: ServiceTable[]; blocks: Block[]; queue: QueueParty[] };
type View = "floor" | "queue" | "guest";
const initialTables: ServiceTable[] = [
  { id: "t1", label: "01", capacity: 2, x: 13, y: 19, status: "occupied" },
  { id: "t2", label: "02", capacity: 2, x: 13, y: 53, status: "available", accessible: true },
  { id: "t3", label: "03", capacity: 4, x: 36, y: 19, status: "occupied" },
  { id: "t4", label: "04", capacity: 4, x: 36, y: 53, status: "available" },
  { id: "t5", label: "05", capacity: 4, x: 59, y: 19, status: "reserved" },
  { id: "t6", label: "06", capacity: 8, x: 59, y: 53, status: "available" },
];
const menu = [ { id: "m1", name: "Pistachio cloud", description: "Pistachio cream, buttery crumble", price: 220, category: "Desserts", icon: "✳", color: "pistachio" }, { id: "m2", name: "Golden kunafa", description: "Crisp pastry, warm cheese, syrup", price: 180, category: "Desserts", icon: "✺", color: "golden" }, { id: "m3", name: "Creamy rose milk", description: "Chilled milk, a little rose magic", price: 95, category: "Drinks", icon: "❋", color: "rose" }, { id: "m4", name: "Iced blue latte", description: "Espresso, milk, butterfly pea", price: 120, category: "Drinks", icon: "✷", color: "blue" } ];
function seed(now: number): Record<string, Branch> {
  return Object.fromEntries(["little-spoon", "sunday-social"].map((id, index) => [id, { tables: initialTables.map(t => ({ ...t, status: index ? "available" as const : t.status })), blocks: [{ id: "counter", label: "SERVICE COUNTER", x: 31, y: 86, width: 40, height: 8 }], queue: [ { id: "q1", name: "Maya", size: 2, joinedAt: now - 10 * 60000, status: "waiting" as const }, { id: "q2", name: "James", size: 4, joinedAt: now - 8 * 60000, status: "waiting" as const }, { id: "q3", name: "Nina", size: 8, joinedAt: now - 5 * 60000, status: "waiting" as const } ] }]));
}

export function Workspace() {
  const [branches, setBranches] = useState<Record<string, Branch>>({});
  const [branchId, setBranchId] = useState("little-spoon");
  const [view, setView] = useState<View>("floor");
  const [now, setNow] = useState(0);
  const [selected, setSelected] = useState("t4");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Branch | null>(null);
  const [history, setHistory] = useState<Branch[]>([]);
  const [message, setMessage] = useState("");
  const [showJoin, setShowJoin] = useState(false);
  const [name, setName] = useState("");
  const [size, setSize] = useState(2);
  const [capacity, setCapacity] = useState(4);
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; kind: "table" | "block"; offsetX: number; offsetY: number } | null>(null);
  useEffect(() => { const t = Date.now(); setNow(t); setBranches(seed(t)); const timer = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!showJoin) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = document.querySelector<HTMLElement>(".join-form");
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)") ?? []);
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements = focusable(), first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => { document.removeEventListener("keydown", trap); previous?.focus(); };
  }, [showJoin]);
  const live = branches[branchId];
  const display = editing && draft ? draft : live;
  const table = display?.tables.find(t => t.id === selected);
  const recommendations = live && table ? recommend(table, live.queue, now) : [];
  const waiting = live?.queue.filter(p => p.status === "waiting") ?? [];
  const free = live?.tables.filter(t => t.status === "available").length ?? 0;
  const restaurant = branchId === "little-spoon" ? "The Little Spoon" : "Sunday Social";
  function notify(text: string) { setMessage(text); }
  function update(change: (value: Branch) => Branch) { setBranches(all => ({ ...all, [branchId]: change(all[branchId]) })); }
  function edit(change: (value: Branch) => Branch) { if (!draft) return; setHistory(h => [...h.slice(-19), structuredClone(draft)]); setDraft(change(draft)); }
  function toggleEdit() {
    if (editing) { setEditing(false); setDraft(null); setHistory([]); notify("Draft discarded. The service floor is unchanged."); }
    else { setDraft(structuredClone(live)); setEditing(true); setHistory([]); }
  }
  function publish() {
    if (!draft) return;
    // Thresholds track the table footprint in globals.css; keep them in step.
    const overlap = draft.tables.some((a, i) => draft.tables.slice(i + 1).some(b => Math.abs(a.x - b.x) < 12 && Math.abs(a.y - b.y) < 16));
    const blocked = draft.tables.some(t => draft.blocks.some(b => t.x < b.x + b.width && t.x + 12 > b.x && t.y < b.y + b.height && t.y + 15 > b.y));
    if (overlap || blocked) return notify("Give each table clear space before publishing. A table overlaps another object.");
    update(() => draft); setEditing(false); setDraft(null); setHistory([]); notify("Demo layout published. Table numbers and service states were preserved.");
  }
  function seat(party: QueueParty) {
    if (!table || editing || !live) return;
    if (!recommend(table, live.queue, Date.now()).some(r => r.party.id === party.id)) return notify("This party is no longer eligible for that table.");
    update(b => ({ ...b, tables: b.tables.map(t => t.id === table.id ? { ...t, status: "occupied" } : t), queue: b.queue.map(p => p.id === party.id ? { ...p, status: "seated" } : p) }));
    notify(`${party.name}'s party seated at table ${table.label}.`);
  }
  function addTable() {
    if (!draft) return;
    const label = String(Math.max(0, ...draft.tables.map(t => Number(t.label))) + 1).padStart(2, "0");
    const id = crypto.randomUUID();
    edit(b => ({ ...b, tables: [...b.tables, { id, label, capacity, x: 78, y: 28, status: "available" }] })); setSelected(id);
  }
  function move(clientX: number, clientY: number) {
    const drag = dragRef.current, bounds = canvasRef.current?.getBoundingClientRect();
    if (!drag || !bounds || !draft) return;
    const object = drag.kind === "block" ? draft.blocks.find(b => b.id === drag.id) : null;
    const maxX = 100 - (object?.width ?? 13), maxY = 100 - (object?.height ?? 17);
    const x = Math.max(2, Math.min(maxX, Math.round(((clientX - bounds.left) / bounds.width * 100 - drag.offsetX) / 2) * 2));
    const y = Math.max(2, Math.min(maxY, Math.round(((clientY - bounds.top) / bounds.height * 100 - drag.offsetY) / 2) * 2));
    setDraft(b => b ? { ...b, tables: b.tables.map(t => drag.kind === "table" && t.id === drag.id ? { ...t, x, y } : t), blocks: b.blocks.map(block => drag.kind === "block" && block.id === drag.id ? { ...block, x, y } : block) } : b);
  }
  function startDrag(event: React.PointerEvent, id: string, kind: "table" | "block", x: number, y: number) {
    if (kind === "table") setSelected(id);
    if (!editing || !draft || (kind === "table" && draft.tables.find(t => t.id === id)?.status !== "available")) return;
    const bounds = canvasRef.current?.getBoundingClientRect(); if (!bounds) return;
    setHistory(h => [...h.slice(-19), structuredClone(draft)]);
    dragRef.current = { id, kind, offsetX: (event.clientX - bounds.left) / bounds.width * 100 - x, offsetY: (event.clientY - bounds.top) / bounds.height * 100 - y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="POS 2 joy home">POS 2 <span>joy</span><span className="brand-dot">✳</span></a>
      <div className="side-caption">A GOOD DAY TO SERVE</div>
      <div className="restaurant-picker"><div className="restaurant-mark"><Utensils size={20}/></div><div><strong>{restaurant}</strong><span>Bangkok · Main branch</span></div></div>
      <label className="sr-only" htmlFor="restaurant">Restaurant</label><select id="restaurant" className="restaurant-select" value={branchId} disabled={editing} onChange={e => { setBranchId(e.target.value); setSelected("t4"); setMessage(""); }}><option value="little-spoon">The Little Spoon</option><option value="sunday-social">Sunday Social</option></select>
      <span className="nav-label">WORKSPACE</span>
      <nav aria-label="Workspace">{[{ id: "floor", label: "Floor & tables", icon: LayoutDashboard }, { id: "queue", label: "Smart queue", icon: Users }, { id: "guest", label: "Guest experience", icon: QrCode }].map(item => <button key={item.id} disabled={editing} className={view === item.id ? "nav-item active" : "nav-item"} onClick={() => setView(item.id as View)}><item.icon size={19}/>{item.label}{item.id === "queue" && <span className="nav-count">{waiting.length}</span>}</button>)}</nav>
      <div className="side-note"><Sparkles size={24}/><h3>Little details.<br/>Happier tables.</h3><p>A little less waiting.<br/>A lot more enjoying.</p></div>
      <a className="nav-item" href="/login"><Users size={18}/>Staff sign in<ArrowRight size={16}/></a>
      <div className="profile"><span>AL</span><div><strong>Alex Lee</strong><small>Demo restaurant owner</small></div></div>
    </aside>
    <main className="main">
      <div className="demo-strip"><span>INTERACTIVE DESIGN PROTOTYPE</span> Sample data · changes reset on refresh · no live orders or login</div>
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> {view === "guest" ? "Guest experience" : view === "queue" ? "Smart queue" : "Floor & tables"}</div><span className="branch-chip"><Coffee size={15}/> Main branch <ChevronDown size={14}/></span></header>
      {view === "guest" ? <GuestPreview restaurant={restaurant}/> : <>
      <section className="page-heading"><div><div className="eyebrow">LET’S MAKE ROOM FOR GOOD TIMES</div><h1>{view === "queue" ? "A thoughtful kind of queue." : "Every table, a little story."}</h1><p>{view === "queue" ? "The right party, at the right table. With a little fairness built in." : "Your floor, your flow. Keep the good moments moving."}</p></div><Button onClick={() => setShowJoin(true)} disabled={editing}><Plus/>Add to queue</Button></section>
      <div className="metrics"><div><span className="metric-icon sky"><Armchair/></span><div><span>Available tables</span><strong>{free}<small> / {live?.tables.length ?? 0}</small></strong></div></div><div><span className="metric-icon cream"><Users/></span><div><span>Waiting parties</span><strong>{waiting.length}<small> parties</small></strong></div></div><div><span className="metric-icon pale"><Clock3/></span><div><span>Longest wait</span><strong>{waiting.length ? Math.max(...waiting.map(p => Math.floor((now - p.joinedAt) / 60000))) : 0}<small> min</small></strong></div></div><div className="service-card"><Sparkles/><div><strong>Room for a little joy.</strong><span>{waiting.length ? "Let’s find everyone a seat." : "Everyone has a place. Lovely."}</span></div></div></div>
      <div className={`workspace-grid ${view === "queue" ? "queue-focus" : ""}`}>
        <section className="floor-panel"><div className="panel-heading"><div><h2>{editing ? "Make it your space" : "The dining room"}</h2><span>{editing ? "Draft · drag free tables or blocks · 2% grid snap" : "Main floor · choose a table to see its best match"}</span></div><Button variant="outline" disabled={!live} onClick={toggleEdit}>{editing ? <X/> : <Settings2/>}{editing ? "Cancel edit" : "Edit layout"}</Button></div>
        <div className="canvas-tools"><div className="zoom-group" role="group" aria-label="Zoom"><button aria-label="Zoom out" disabled={zoom <= .5} onClick={() => setZoom(z => Math.round((z - .25) * 100) / 100)}><Minus size={14}/></button><span>{Math.round(zoom * 100)}%</span><button aria-label="Zoom in" disabled={zoom >= 2} onClick={() => setZoom(z => Math.round((z + .25) * 100) / 100)}><Plus size={14}/></button><button className="zoom-reset" disabled={zoom === 1} onClick={() => setZoom(1)}>Fit</button></div><span className="floor-hint"><MousePointer2 size={13}/>{editing ? "Drag to arrange" : "Select a table"}</span></div>
        <div className="canvas-viewport">
        <div className={`floor-canvas ${editing ? "editing" : ""}`} ref={canvasRef} style={{ width: `${zoom * 100}%`, height: `${zoom * 330}px`, fontSize: `${zoom}em` }} onPointerMove={event => move(event.clientX, event.clientY)} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }}>
          <span className="floor-zone">MAIN DINING</span><span className="window-label">WINDOW SIDE</span>
          {display?.blocks.map(block => <div key={block.id} role={editing ? "button" : undefined} tabIndex={editing ? 0 : undefined} aria-label={`${block.label}. Use arrow keys to move in edit mode.`} className="floor-block" style={{ left: `${block.x}%`, top: `${block.y}%`, width: `${block.width}%`, height: `${block.height}%` }} onPointerDown={e => startDrag(e, block.id, "block", block.x, block.y)} onKeyDown={e => { if (editing && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) { e.preventDefault(); edit(b => ({ ...b, blocks: b.blocks.map(v => v.id !== block.id ? v : { ...v, x: Math.max(0, Math.min(100 - v.width, v.x + (e.key === "ArrowRight" ? 2 : e.key === "ArrowLeft" ? -2 : 0))), y: Math.max(0, Math.min(100 - v.height, v.y + (e.key === "ArrowDown" ? 2 : e.key === "ArrowUp" ? -2 : 0))) }) })); } }}>{block.label}</div>)}
          {display?.tables.map(t => <button key={t.id} className={`dining-table ${t.status} ${selected === t.id ? "selected" : ""} ${t.capacity <= 2 ? "round-table" : ""}`} style={{ left: `${t.x}%`, top: `${t.y}%` }} aria-label={`Table ${t.label}, ${t.capacity} seats, ${t.status}${t.accessible ? ", accessible" : ""}`} aria-pressed={selected === t.id} onClick={() => setSelected(t.id)} onPointerDown={e => startDrag(e, t.id, "table", t.x, t.y)}><span className="chair chair-top"/><span className="chair chair-bottom"/>{t.capacity > 2 && <><span className="chair chair-left"/><span className="chair chair-right"/></>}<strong>{t.label}</strong><span>{t.capacity} seats</span><small>{t.status}</small></button>)}
          <div className="entrance"><ArrowRight size={14}/> ENTRANCE</div>
        </div>
        </div>
        <div className="floor-footer"><div className="legend"><span><i className="available"/>Available</span><span><i className="occupied"/>Occupied</span><span><i className="reserved"/>Reserved</span></div><span className="floor-hint">{display?.tables.length ?? 0} tables · {free} free</span></div>
        {table && !editing && <div className="table-detail"><div><strong>Table {table.label}</strong><span>{table.capacity} seats · {table.status}{table.accessible ? " · Accessible" : ""}</span></div><Button variant="outline" disabled={table.status === "available"} onClick={() => { update(b => ({ ...b, tables: b.tables.map(t => t.id === table.id ? { ...t, status: "available" } : t) })); notify(`Table ${table.label} is now available in the demo.`); }}><Check/>Mark available</Button></div>}
        </section>
        {editing ? <aside className="editor-panel">
          <div className="editor-head"><div><h2>Edit tables</h2><span>Draft · snaps to a 2% grid</span></div><Button variant="ghost" aria-label="Undo layout change" disabled={!history.length} onClick={() => { setDraft(history[history.length - 1]); setHistory(h => h.slice(0, -1)); }}><RotateCcw/></Button></div>
          <span className="editor-label">ADD TO THE ROOM</span>
          <div className="editor-add"><label>Seats<input aria-label="New table capacity" type="number" min={1} max={20} value={capacity} onChange={e => setCapacity(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}/></label><Button variant="outline" onClick={addTable}><Plus/>Table</Button><Button variant="outline" onClick={() => edit(b => ({ ...b, blocks: [...b.blocks, { id: crypto.randomUUID(), label: "WALL", x: 5, y: 5, width: 22, height: 5 }] }))}><Square/>Block</Button></div>
          <span className="editor-label">SELECTED TABLE</span>
          {table ? <div className="editor-fields">
            <strong className="editor-table-name">Table {table.label}<small>{table.capacity} seats</small></strong>
            {table.status !== "available" && <p className="locked-note">This table is {table.status}. Free it before moving or removing it.</p>}
            <fieldset disabled={table.status !== "available"}>
              <label>Seats<input type="number" min={1} max={20} value={table.capacity} onChange={e => edit(b => ({ ...b, tables: b.tables.map(t => t.id === table.id ? { ...t, capacity: Math.max(1, Math.min(20, Number(e.target.value) || 1)) } : t) }))}/></label>
              <label>Left %<input type="number" min={2} max={88} step={2} value={table.x} onChange={e => edit(b => ({ ...b, tables: b.tables.map(t => t.id === table.id ? { ...t, x: Math.max(2, Math.min(88, Number(e.target.value))) } : t) }))}/></label>
              <label>Top %<input type="number" min={2} max={85} step={2} value={table.y} onChange={e => edit(b => ({ ...b, tables: b.tables.map(t => t.id === table.id ? { ...t, y: Math.max(2, Math.min(85, Number(e.target.value))) } : t) }))}/></label>
              <Button variant="ghost" className="remove-table" onClick={() => { edit(b => ({ ...b, tables: b.tables.filter(t => t.id !== table.id) })); setSelected(""); }}><X/>Remove table</Button>
            </fieldset>
          </div> : <p className="editor-empty">Choose a table on the floor to change its seats or position.</p>}
          <div className="editor-actions"><Button variant="outline" onClick={toggleEdit}>Cancel</Button><Button onClick={publish}><Save/>Publish</Button></div>
        </aside> : <aside className="queue-panel"><div className="queue-title"><div><h2>A seat for everyone</h2><span>{waiting.length} parties in line</span></div><span className="sparkle-tile"><Sparkles size={19}/></span></div>
        <div className="queue-mode"><Sparkles size={15}/><strong>Smart queue is on</strong><span>FAIR + FLEXIBLE</span></div>
        {table && !editing && <div className="recommendation"><div className="eyebrow">BEST MATCH · TABLE {table.label}</div>{recommendations[0] ? <><h3>{recommendations[0].party.name}’s party <span>{recommendations[0].party.size} guests</span></h3><p>{recommendations[0].reason}</p><Button className="w-full" onClick={() => seat(recommendations[0].party)}>Seat this party <ArrowRight/></Button></> : <p>{table.status === "available" ? "No waiting party fits this table yet." : "This table is not available. Choose a free table."}</p>}</div>}
        
        <div className="queue-list">{waiting.length === 0 ? <div className="empty-state"><CheckCheck/><p>All caught up.<br/>Everyone’s at the table.</p></div> : waiting.map((party, index) => <div className="queue-row" key={party.id}><span className="queue-avatar">{party.name.charAt(0).toUpperCase()}</span><div><strong>{party.name}<span>#{String(index + 1).padStart(2, "0")}</span></strong><span><Users size={13}/>{party.size} guests <span>·</span><Clock3 size={13}/>{Math.floor((now - party.joinedAt) / 60000)} min</span></div><Button variant="ghost" aria-label={`Seat ${party.name} at selected table`} disabled={editing || !recommendations.some(r => r.party.id === party.id)} onClick={() => seat(party)}><ArrowRight/></Button></div>)}</div>
        <div className="queue-explanation"><span>GOOD TO KNOW</span><p>Smaller parties can use larger tables. We balance table fit with time waited, so no one keeps getting skipped.</p><div><Clock3 size={15}/>30-minute fairness threshold</div></div></aside>}
      </div>
      <div className="bottom-note"><span>Made for the little moments between “welcome” and “see you soon”.</span><span>POS 2 joy ✳</span></div>
      </>}
      {message && <div className="feedback" role="status"><Check size={18}/><span>{message}</span><button aria-label="Dismiss message" onClick={() => setMessage("")}><X size={16}/></button></div>}
      {showJoin && <div className="form-overlay"><section className="join-form" role="dialog" aria-modal="true" aria-labelledby="join-heading" onKeyDown={e => { if (e.key === "Escape") setShowJoin(false); }}><button className="close-form" aria-label="Close form" onClick={() => setShowJoin(false)}><X/></button><div className="eyebrow">THERE’S A PLACE FOR YOU</div><h2 id="join-heading">Join the good times.</h2><form onSubmit={e => { e.preventDefault(); if (!name.trim()) return; update(b => ({ ...b, queue: [...b.queue, { id: crypto.randomUUID(), name: name.trim().slice(0, 50), size, joinedAt: Date.now(), status: "waiting" }] })); setNow(Date.now()); setShowJoin(false); setName(""); notify("Party added to the demo queue."); }}><label>Guest name<input autoFocus required maxLength={50} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Jamie"/></label><label>Party size<input type="number" min={1} max={20} required value={size} onChange={e => setSize(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}/></label><Button type="submit" className="w-full">Add party <ArrowRight/></Button></form></section></div>}
    </main>
  </div>;
}

function GuestPreview({ restaurant }: { restaurant: string }) {
  const [category, setCategory] = useState("All");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [showCart, setShowCart] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const count = Object.values(cart).reduce((sum, n) => sum + n, 0);
  const total = menu.reduce((sum, item) => sum + item.price * (cart[item.id] || 0), 0);
  function change(id: string, delta: number) { setSubmitted(false); setCart(c => ({ ...c, [id]: Math.max(0, (c[id] || 0) + delta) })); }
  return <section className="guest-section"><div className="guest-intro"><div className="eyebrow">THE GUEST EXPERIENCE</div><h1>Scan. Settle in.<br/>Something delicious.</h1><p>A menu that feels right at home on your phone.</p><div className="guest-flow"><span><QrCode/>Scan your table</span><span><ShoppingBag/>Make it your own</span><span><Utensils/>Enjoy together</span></div><div className="guest-note"><Sparkles/><p>Next up: shared table orders, dessert passports, and little rewards for coming back.</p></div><span className="muted">Illustrative menu · THB · demo order only</span></div><div className="phone-preview"><div className="phone-top"><span>9:41</span><span>● ● ▰</span></div><div className="guest-header"><div className="guest-brand">{restaurant}<span>GOOD FOOD, GREAT COMPANY</span></div><span className="table-pill">Table 04</span></div>{showCart ? <div className="cart-view"><button className="back-link" onClick={() => setShowCart(false)}><ArrowLeft size={16}/>Back to menu</button><h2>Your happy little order.</h2>{submitted ? <div className="order-success"><CheckCheck size={40}/><h3>Demo order received!</h3><p>In the live app, your kitchen status will appear here.</p><Button onClick={() => { setShowCart(false); setSubmitted(false); }}>Back to menu</Button></div> : <>{menu.filter(item => cart[item.id] > 0).map(item => <div className="cart-row" key={item.id}><div><strong>{item.name}</strong><span>฿{item.price * cart[item.id]}</span></div><button aria-label={`Remove one ${item.name}`} onClick={() => change(item.id, -1)}><Minus size={14}/></button><span>{cart[item.id]}</span><button aria-label={`Add one ${item.name}`} onClick={() => change(item.id, 1)}><Plus size={14}/></button></div>)}{!count && <p>Your cart is waiting for something lovely.</p>}<div className="cart-total"><span>Total</span><strong>฿{total}</strong></div><Button className="w-full" disabled={!count} onClick={() => { setSubmitted(true); setCart({}); }}>Place demo order <ArrowRight/></Button></>}</div> : <><div className="guest-welcome"><span>HELLO, HUNGRY FRIEND</span><h2>A spoonful<br/>of happiness.<Sparkles/></h2><p>Made with love. Enjoyed together.</p></div><div className="guest-category">{["All", "Desserts", "Drinks"].map(c => <button aria-pressed={category === c} className={category === c ? "active" : ""} onClick={() => setCategory(c)} key={c}>{c}</button>)}</div><div className="guest-menu-heading"><h3>Find your favorite</h3><span>Made fresh daily</span></div><div className="menu-grid">{menu.filter(item => category === "All" || item.category === category).map(item => <article className="menu-item" key={item.id}><div className={`menu-art ${item.color}`} aria-hidden="true">{item.icon}</div><h4>{item.name}</h4><p>{item.description}</p><div><strong>฿{item.price}</strong><button aria-label={`Add ${item.name} to cart`} onClick={() => change(item.id, 1)}>{cart[item.id] ? cart[item.id] : <Plus size={16}/>}</button></div></article>)}</div><Button className="guest-cart" onClick={() => setShowCart(true)}><ShoppingBag/>Your order · {count}<span>฿{total}</span><ArrowRight/></Button></>}<div className="phone-footer">A LITTLE JOY IN EVERY BITE ✳</div></div></section>;
}
