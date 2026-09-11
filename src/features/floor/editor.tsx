"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Armchair, Check, DoorOpen, Grid2X2, LockKeyhole, Minus, Plus, RotateCw, RotateCcw, Save, Square, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createFloor, saveFloor } from "./actions";
import { blankCanvas, canvasSchema, layoutCollisions, objectBounds, overlaps, resizeBounds, type FloorCanvas, type FloorObject, type FloorSnapshot } from "./model";

type Props = { branchId: string; floors: { id: string; name: string }[]; snapshot: FloorSnapshot | null; canEdit: boolean };
export function FloorEditor({ branchId, floors, snapshot, canEdit }: Props) {
  const router = useRouter();
  const [canvas, setCanvas] = useState<FloorCanvas>(() => snapshot?.draft ?? snapshot?.published ?? blankCanvas());
  const [baseline, setBaseline] = useState(canvas);
  const [published, setPublished] = useState(snapshot?.published ?? null);
  const [revision, setRevision] = useState(snapshot?.revision ?? 0);
  const [selected, setSelected] = useState<string | null>(null);
  const [history, setHistory] = useState<FloorCanvas[]>([]);
  const [newName, setNewName] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [view, setView] = useState<"draft" | "published">(canEdit ? "draft" : "published");
  const [zoom, setZoom] = useState(1);
  const [pending, startTransition] = useTransition();
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; x: number; y: number } | null>(null);
  const resize = useRef<{ id: string; corner: string; x: number; y: number; width: number; height: number; fromX: number; fromY: number } | null>(null);
  const gridId = useId().replace(/:/g, "");
  const dirty = JSON.stringify(canvas) !== JSON.stringify(baseline);
  const visibleCanvas = view === "published" ? published ?? blankCanvas() : canvas;
  const editable = canEdit && view === "draft" && !pending && !conflict;
  const object = visibleCanvas.objects.find(item => item.id === selected);
  const isBusy = (id: string) => snapshot?.tables.some(t => t.id === id && t.enabled && t.state !== "available") ?? false;
  const objectLocked = !editable || Boolean(object && isBusy(object.id));
  const collisions = layoutCollisions(canvas);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function announce(text: string, error = false) { setMessage(text); setIsError(error); }
  function change(next: FloorCanvas) {
    if (!editable) return;
    setHistory(items => [...items.slice(-29), structuredClone(canvas)]);
    setCanvas(next); setMessage("");
  }
  function patchObject(patch: Partial<FloorObject>) {
    if (!object || objectLocked) return;
    change({ ...canvas, objects: canvas.objects.map(item => item.id === object.id ? { ...item, ...patch } as FloorObject : item) });
  }
  function addObject(kind: FloorObject["kind"], capacity = 4) {
    if (!editable || canvas.objects.length >= 200) return;
    const base = { id: crypto.randomUUID(), x: 40, y: 40, width: kind === "zone" ? 300 : kind === "table" ? 110 : 180, height: kind === "zone" ? 200 : kind === "table" ? 100 : 40, rotation: 0 as const };
    const existingLabels = new Set([...canvas.objects.filter(item => item.kind === "table").map(t => t.label), ...(snapshot?.reservedLabels ?? [])]);
    let nextNumber = 1; while (existingLabels.has(String(nextNumber).padStart(2, "0"))) nextNumber++;
    const next: FloorObject = kind === "table" ? { ...base, kind, label: String(nextNumber).padStart(2, "0"), capacity, shape: capacity === 2 ? "round" : "rectangle", accessible: false } : { ...base, kind, label: kind.charAt(0).toUpperCase() + kind.slice(1) };
    if (kind !== "zone") {
      let found = false;
      for (let y = 40; y + next.height <= canvas.height && !found; y += 120) for (let x = 40; x + next.width <= canvas.width && !found; x += 140) {
        const candidate = { ...next, x, y };
        if (!canvas.objects.some(item => item.kind !== "zone" && overlaps(objectBounds(item), objectBounds(candidate)))) { next.x = x; next.y = y; found = true; }
      }
      if (!found) return announce("There isn’t a clear space for this object. Make room or enlarge the canvas first.", true);
    }
    change({ ...canvas, objects: [...canvas.objects, next] }); setSelected(next.id);
  }
  function point(event: React.PointerEvent) {
    const svg = svgRef.current, matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  }
  function beginDrag(event: React.PointerEvent<SVGGElement>, item: FloorObject) {
    setSelected(item.id);
    if (!editable || isBusy(item.id)) return;
    const p = point(event); if (!p) return;
    setHistory(items => [...items.slice(-29), structuredClone(canvas)]);
    drag.current = { id: item.id, x: p.x - item.x, y: p.y - item.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
  }
  // Corner handles resize in the object's own axes, so they are offered only on
  // an unrotated object. ponytail: rotate, then size, covers the same ground
  // without the inverse-rotation maths a rotated drag would need.
  function beginResize(event: React.PointerEvent<SVGRectElement>, item: FloorObject, corner: string) {
    if (!editable || isBusy(item.id)) return;
    const p = point(event); if (!p) return;
    setSelected(item.id);
    setHistory(items => [...items.slice(-29), structuredClone(canvas)]);
    resize.current = { id: item.id, corner, x: item.x, y: item.y, width: item.width, height: item.height, fromX: p.x, fromY: p.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
  }
  function resizeMove(p: DOMPoint) {
    const current = resize.current;
    if (!current) return;
    const dx = p.x - current.fromX, dy = p.y - current.fromY;
    setCanvas(value => ({ ...value, objects: value.objects.map(item =>
      item.id === current.id ? { ...item, ...resizeBounds(current, current.corner, dx, dy, value) } : item) }));
  }
  function dragMove(event: React.PointerEvent) {
    const p = point(event);
    if (!p || !editable) return;
    if (resize.current) return resizeMove(p);
    const current = drag.current;
    if (!current) return;
    setCanvas(value => ({ ...value, objects: value.objects.map(item => {
      if (item.id !== current.id) return item;
      const next = { ...item, x: Math.max(0, Math.round((p.x - current.x) / 10) * 10), y: Math.max(0, Math.round((p.y - current.y) / 10) * 10) };
      const bounds = objectBounds(next);
      next.x = Math.max(0, next.x + Math.max(0, -bounds.x) - Math.max(0, bounds.x + bounds.width - value.width));
      next.y = Math.max(0, next.y + Math.max(0, -bounds.y) - Math.max(0, bounds.y + bounds.height - value.height));
      return next;
    }) }));
  }
  function save(mode: "draft" | "publish") {
    if (!snapshot || !editable) return;
    const parsed = canvasSchema.safeParse(canvas);
    if (!parsed.success) return announce(parsed.error.issues[0]?.message ?? "Check the layout settings.", true);
    if (mode === "publish" && collisions.length) return announce(collisions[0], true);
    drag.current = null; resize.current = null;
    startTransition(async () => {
      try {
        const result = await saveFloor({ branchId, floorId: snapshot.id, expectedRevision: revision, canvas: parsed.data, mode });
        if (!result.ok) { setConflict(Boolean(result.conflict)); return announce(result.error, true); }
        setRevision(result.revision); setCanvas(parsed.data); setBaseline(parsed.data); setHistory([]);
        if (mode === "publish") setPublished(parsed.data);
        announce(result.message);
      } catch { announce("Connection interrupted. Your edits are still here. Reload before retrying if the save may have completed.", true); }
    });
  }
  function addFloor(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      try {
        const result = await createFloor({ branchId, name: newName });
        if (!result.ok) return announce(result.error, true);
        router.push(`/workspace/${branchId}/floor?floor=${result.floorId}`); router.refresh(); setNewName("");
      } catch { announce("We couldn’t confirm the new floor. Reload before trying again.", true); }
    });
  }

  return <section className="floor-editor">
    <div className="planner-top"><div><label htmlFor="floor-choice">Floor</label><select id="floor-choice" value={snapshot?.id ?? ""} disabled={pending || dirty || !floors.length} onChange={event => router.push(`/workspace/${branchId}/floor?floor=${event.target.value}`)}>{!floors.length && <option value="">No floors yet</option>}{floors.map(floor => <option key={floor.id} value={floor.id}>{floor.name}</option>)}</select></div>{canEdit && <form onSubmit={addFloor} className="new-floor-form"><label className="sr-only" htmlFor="new-floor">New floor name</label><input id="new-floor" placeholder="New floor name" value={newName} maxLength={50} required disabled={pending || dirty} onChange={event => setNewName(event.target.value)}/><Button type="submit" variant="outline" disabled={pending || dirty || !newName.trim()}><Plus/>Create floor</Button></form>}</div>
    {message && <div className={`planner-message ${isError ? "error" : ""}`} role={isError ? "alert" : "status"}><span>{message}</span>{conflict && <Button variant="outline" onClick={() => router.refresh()}>Discard edits & reload</Button>}</div>}
    {!snapshot ? <div className="planner-empty"><Grid2X2 size={38}/><h2>Start with a blank space.</h2><p>{canEdit ? "Name your first floor above. Then add tables, walls, and the places that make it yours." : "Your manager hasn’t created a floor yet."}</p></div> : <>
    <div className="planner-toolbar"><div className="planner-tabs" aria-label="Layout view">{canEdit && <button aria-pressed={view === "draft"} onClick={() => setView("draft")}>Draft editor</button>}<button aria-pressed={view === "published"} onClick={() => setView("published")}>Published floor</button></div><span className="revision-label">Revision {revision}{dirty ? " · Unsaved changes" : " · Saved"}</span>{canEdit && view === "draft" && <div className="planner-save"><Button variant="outline" disabled={!editable} onClick={() => save("draft")}><Save/>Save draft</Button><Button disabled={!editable || collisions.length > 0} onClick={() => save("publish")}><Upload/>{pending ? "Saving…" : "Publish layout"}</Button></div>}</div>
    {canEdit && view === "draft" && published && <div className="planner-recovery"><Button variant="ghost" disabled={!editable} onClick={() => { change(structuredClone(published)); setSelected(null); }}>Use published layout as draft</Button><span>Replace the current draft on screen; save when ready.</span></div>}
    <div className={`planner-body ${view === "published" ? "published-view" : ""}`}>
    {canEdit && view === "draft" && <aside className="object-palette"><h2>Make your space</h2><span className="palette-label">TABLES</span>{[2,4,8].map(seats => <button key={seats} disabled={!editable} onClick={() => addObject("table", seats)}><Armchair/>{seats} seats<Plus size={15}/></button>)}<button disabled={!editable} onClick={() => addObject("table", 6)}><Armchair/>Custom table<Plus size={15}/></button><span className="palette-label">ROOM BLOCKS</span>{[{ kind: "wall", icon: Square, name: "Wall" }, { kind: "counter", icon: Minus, name: "Counter" }, { kind: "entrance", icon: DoorOpen, name: "Entrance" }, { kind: "zone", icon: Grid2X2, name: "Zone" }].map(item => <button key={item.kind} disabled={!editable} onClick={() => addObject(item.kind as FloorObject["kind"])}><item.icon/>{item.name}<Plus size={15}/></button>)}<p>Drag to place. Use arrow keys for small moves. Table footprints include space for chairs.</p><Button variant="ghost" disabled={!editable || !history.length} onClick={() => { setCanvas(history[history.length - 1]); setHistory(items => items.slice(0,-1)); }}><RotateCcw/>Undo</Button><Button variant="ghost" disabled={pending || !dirty} onClick={() => { setCanvas(structuredClone(baseline)); setHistory([]); setSelected(null); }}>Discard local edits</Button></aside>}
    <div className="planner-stage"><div className="canvas-tools"><span>{visibleCanvas.width} × {visibleCanvas.height} units</span><div><button aria-label="Zoom out" disabled={zoom <= .75} onClick={() => setZoom(z => Math.max(.75, z - .25))}><Minus size={16}/></button><span>{Math.round(zoom * 100)}%</span><button aria-label="Zoom in" disabled={zoom >= 2} onClick={() => setZoom(z => Math.min(2, z + .25))}><Plus size={16}/></button></div></div>
    {view === "published" && !published ? <div className="planner-empty"><h2>No published layout yet.</h2><p>{canEdit ? "Save your draft as you work, then publish when the room is ready." : "Your manager is still preparing this room."}</p></div> : <div className="canvas-scroll"><svg ref={svgRef} role="group" aria-label={`${snapshot.name} floor plan. Select objects to inspect or edit them.`} className="planner-svg" viewBox={`0 0 ${visibleCanvas.width} ${visibleCanvas.height}`} style={{ width: `${zoom * 100}%`, minWidth: `${600 * zoom}px` }} onPointerMove={dragMove} onPointerUp={() => { drag.current = null; resize.current = null; }} onPointerCancel={() => { drag.current = null; resize.current = null; }} onPointerDown={event => { if (event.target === event.currentTarget) setSelected(null); }}>
      <defs><pattern id={gridId} width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#ccd9e8"/></pattern></defs><rect width="100%" height="100%" fill={`url(#${gridId})`} pointerEvents="none"/>
      {[...visibleCanvas.objects].sort((a,b) => Number(b.kind === "zone") - Number(a.kind === "zone")).map(item => {
        const state = snapshot.tables.find(t => t.id === item.id)?.state ?? "available";
        const active = item.id === selected;
        return <g key={item.id} role="button" tabIndex={0} aria-pressed={active} aria-label={`${item.kind === "table" ? `Table ${item.label}, ${item.capacity} seats, ${state}` : `${item.kind}: ${item.label}`}${isBusy(item.id) ? ", locked during service" : ""}`} className={`plan-object ${item.kind} ${state} ${active ? "chosen" : ""}`} transform={`translate(${item.x} ${item.y}) rotate(${item.rotation} ${item.width / 2} ${item.height / 2})`} onPointerDown={event => beginDrag(event, item)} onClick={() => setSelected(item.id)} onKeyDown={event => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(item.id); }
          if (editable && !isBusy(item.id) && ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key)) { event.preventDefault(); setSelected(item.id); const step = event.shiftKey ? 20 : 10; change({ ...canvas, objects: canvas.objects.map(o => o.id === item.id ? { ...o, x: Math.max(0, o.x + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0)), y: Math.max(0, o.y + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0)) } : o) }); }
        }}>
          {item.kind === "table" ? <>{item.shape === "round" ? <ellipse cx={item.width/2} cy={item.height/2} rx={item.width/2-8} ry={item.height/2-8}/> : <rect x="8" y="8" width={item.width-16} height={item.height-16} rx="12"/>}<text x={item.width/2} y={item.height/2-7} textAnchor="middle" className="plan-number">{item.label}</text><text x={item.width/2} y={item.height/2+16} textAnchor="middle" className="plan-seats">{item.capacity} seats{item.accessible ? " · A" : ""}</text>{isBusy(item.id) && <text x={item.width/2} y={item.height-14} textAnchor="middle" className="plan-state">{state}</text>}</> : <><rect width={item.width} height={item.height} rx={item.kind === "zone" ? 12 : 4}/><text x={item.width/2} y={Math.min(item.height/2+5,25)} textAnchor="middle" className="plan-block-label">{item.label}</text></>}
          {active && editable && !isBusy(item.id) && item.rotation === 0 && ([["nw",0,0],["ne",item.width,0],["sw",0,item.height],["se",item.width,item.height]] as const).map(([corner, hx, hy]) =>
            <rect key={corner} className={`resize-handle ${corner}`} x={hx - 7} y={hy - 7} width={14} height={14} rx={3}
              onPointerDown={event => beginResize(event, item, corner)}><title>Drag to resize {item.label}</title></rect>)}
        </g>;
      })}
    </svg></div>}
    <div className="canvas-caption"><span><span className="status-dot"/>Available</span><span><span className="status-dot busy"/>In service / reserved</span><span>A · Accessible</span></div>
    </div>
    <aside className="object-properties"><h2>{object ? (object.kind === "table" ? `Table ${object.label}` : object.label) : "Room settings"}</h2>{object ? <>{isBusy(object.id) && <p className="locked-note"><LockKeyhole size={16}/>This table is in service. Its settings are locked.</p>}<fieldset disabled={objectLocked}><label>{object.kind === "table" ? "Table number" : "Label"}<input value={object.label} maxLength={object.kind === "table" ? 12 : 30} onChange={event => patchObject({ label: event.target.value })}/></label>{object.kind === "table" && <><label>Seats<input type="number" min={1} max={30} value={object.capacity} onChange={event => patchObject({ capacity: Number(event.target.value) })}/></label><label>Shape<select value={object.shape} onChange={event => patchObject({ shape: event.target.value as "rectangle" | "round" })}><option value="rectangle">Rectangle</option><option value="round">Round</option></select></label><label className="accessible-check"><input type="checkbox" checked={object.accessible} onChange={event => patchObject({ accessible: event.target.checked })}/>Accessible seating</label></>}
    <div className="geometry-fields">{(["x","y","width","height"] as const).map(field => <label key={field}>{field === "x" ? "Left" : field === "y" ? "Top" : field.charAt(0).toUpperCase()+field.slice(1)}<input type="number" min={field === "width" || field === "height" ? 20 : 0} max={5000} step={10} value={object[field]} onChange={event => patchObject({ [field]: Number(event.target.value) })}/></label>)}</div><Button variant="outline" onClick={() => patchObject({ rotation: ((object.rotation + 90) % 360) as FloorObject["rotation"] })}><RotateCw/>Rotate · {object.rotation}°</Button><Button variant="ghost" onClick={() => { change({ ...canvas, objects: canvas.objects.filter(item => item.id !== object.id) }); setSelected(null); }}><Trash2/>Remove object</Button></fieldset><button className="clear-selection" onClick={() => setSelected(null)}>Back to room settings</button></> : <><p>Choose an object on the floor to adjust it.</p><fieldset disabled={!editable}><label>Room width<input type="number" min={400} max={5000} step={100} value={canvas.width} onChange={event => change({ ...canvas, width: Number(event.target.value) })}/></label><label>Room height<input type="number" min={400} max={5000} step={100} value={canvas.height} onChange={event => change({ ...canvas, height: Number(event.target.value) })}/></label></fieldset><p>Units describe the plan’s proportions. Adjust room dimensions before placing your tables.</p></>}{view === "draft" && collisions.length > 0 && <div className="layout-issues"><strong>{collisions.length} overlap{collisions.length > 1 ? "s" : ""} to resolve</strong><p>{collisions[0]}</p><span>You can save a draft while rearranging.</span></div>}</aside>
    </div><div className="planner-footnote"><Check size={16}/>{view === "draft" ? "Drafts stay separate from service. Publishing preserves table identities and checks current table states." : "This is the published layout. Live seating and order management will connect in the next stage."}</div>
    </>}
  </section>;
}
