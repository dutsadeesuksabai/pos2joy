"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCheck, Minus, Plus, ShoppingBag, Utensils, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney, orderTotalCents } from "./model";
import { placeOrder } from "./actions";

type Item = { id: string; name: string; category: string; priceCents: number; available: boolean };
type Placed = { name: string; quantity: number; unitPriceCents: number; status: string };
type Props = { tableId: string; label: string; restaurant: string; currency: string; menu: Item[]; placed: Placed[]; blocked: string | null };

export function GuestMenu({ tableId, label, restaurant, currency, menu, placed, blocked }: Props) {
  const router = useRouter();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [category, setCategory] = useState("All");
  const [showCart, setShowCart] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [pending, startTransition] = useTransition();

  const categories = useMemo(() => ["All", ...new Set(menu.map(item => item.category))], [menu]);
  const shown = menu.filter(item => category === "All" || item.category === category);
  const lines = menu.filter(item => cart[item.id] > 0).map(item => ({ ...item, quantity: cart[item.id] }));
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const total = orderTotalCents(lines.map(line => ({ unitPriceCents: line.priceCents, quantity: line.quantity })));
  const billTotal = orderTotalCents(placed);
  const money = (cents: number) => formatMoney(cents, currency);

  function change(id: string, delta: number) {
    setMessage("");
    setCart(current => {
      const next = Math.max(0, (current[id] ?? 0) + delta);
      const { [id]: _drop, ...rest } = current;
      return next ? { ...rest, [id]: next } : rest;
    });
  }

  function submit() {
    if (!count) return;
    startTransition(async () => {
      try {
        const result = await placeOrder({ tableId, cart: { items: lines.map(line => ({ menuItemId: line.id, quantity: line.quantity })) } });
        setIsError(!result.ok);
        setMessage(result.ok ? result.message : result.error);
        if (result.ok) { setCart({}); setShowCart(false); router.refresh(); }
      } catch { setIsError(true); setMessage("Your order didn’t send. Check your connection and try again."); }
    });
  }

  return <main className="guest">
    <header className="guest-top">
      <div><strong>{restaurant}</strong><span>Table {label}</span></div>
      <Utensils size={20}/>
    </header>

    {blocked ? <div className="guest-blocked"><h1>Welcome!</h1><p>{blocked}</p></div> : <>
      {message && <div className={`guest-message ${isError ? "error" : ""}`} role={isError ? "alert" : "status"}><span>{message}</span><button aria-label="Dismiss" onClick={() => setMessage("")}><X size={15}/></button></div>}

      {placed.length > 0 && <section className="guest-bill">
        <h2>Already ordered</h2>
        <ul>{placed.map(line => <li key={line.name}><span>{line.quantity}× {line.name}</span><span>{money(line.unitPriceCents * line.quantity)}</span></li>)}</ul>
        <div className="guest-bill-total"><span>Bill so far</span><strong>{money(billTotal)}</strong></div>
      </section>}

      {showCart ? <section className="guest-cart-view">
        <button className="guest-back" onClick={() => setShowCart(false)}>← Back to menu</button>
        <h1>Your order</h1>
        {lines.length === 0 ? <p className="guest-empty">Nothing added yet.</p> : <ul className="guest-lines">
          {lines.map(line => <li key={line.id}>
            <div><strong>{line.name}</strong><span>{money(line.priceCents)}</span></div>
            <div className="stepper">
              <button aria-label={`Remove one ${line.name}`} onClick={() => change(line.id, -1)}><Minus size={15}/></button>
              <span>{line.quantity}</span>
              <button aria-label={`Add one ${line.name}`} onClick={() => change(line.id, 1)}><Plus size={15}/></button>
            </div>
          </li>)}
        </ul>}
        <div className="guest-total"><span>Total</span><strong>{money(total)}</strong></div>
        <Button className="w-full" disabled={!count || pending} onClick={submit}>{pending ? "Sending…" : "Send to the kitchen"}<ArrowRight/></Button>
      </section> : <>
        {menu.length === 0 ? <p className="guest-empty">The menu isn’t ready yet. Please ask a member of staff.</p> : <>
          {categories.length > 2 && <nav className="guest-cats" aria-label="Menu categories">{categories.map(name =>
            <button key={name} aria-pressed={category === name} className={category === name ? "active" : ""} onClick={() => setCategory(name)}>{name}</button>)}</nav>}
          <ul className="guest-menu">{shown.map(item => <li key={item.id}>
            <div><strong>{item.name}</strong><span>{money(item.priceCents)}</span></div>
            {cart[item.id] ? <div className="stepper">
              <button aria-label={`Remove one ${item.name}`} onClick={() => change(item.id, -1)}><Minus size={15}/></button>
              <span>{cart[item.id]}</span>
              <button aria-label={`Add one ${item.name}`} onClick={() => change(item.id, 1)}><Plus size={15}/></button>
            </div> : <button className="guest-add" aria-label={`Add ${item.name}`} onClick={() => change(item.id, 1)}><Plus size={17}/></button>}
          </li>)}</ul>
        </>}
      </>}

      {count > 0 && !showCart && <button className="guest-bar" onClick={() => setShowCart(true)}>
        <ShoppingBag size={18}/><span>{count} item{count > 1 ? "s" : ""}</span><strong>{money(total)}</strong><ArrowRight size={18}/>
      </button>}

      {!isError && message && !count && <p className="guest-thanks"><CheckCheck size={16}/>Thank you! Your order is with the kitchen.</p>}
    </>}
  </main>;
}
