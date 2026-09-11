"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCheck, Minus, Plus, ShoppingBag, Utensils, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { translate, type Locale } from "@/i18n/dictionary";
import { LocaleSwitch } from "@/i18n/locale-switch";
import { formatMoney, orderTotalCents } from "./model";
import { placeOrder } from "./actions";

type Item = { id: string; name: string; category: string; kind: "a_la_carte" | "buffet"; priceCents: number; available: boolean };
type Placed = { name: string; quantity: number; unitPriceCents: number; status: string };
type Props = { tableId: string; label: string; restaurant: string; currency: string; menu: Item[]; placed: Placed[]; blocked: string | null; locale: Locale };

export function GuestMenu({ tableId, label, restaurant, currency, menu, placed, blocked, locale }: Props) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const router = useRouter();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [category, setCategory] = useState("");
  const [showCart, setShowCart] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [pending, startTransition] = useTransition();

  const all = t("guest.all");
  const buffet = menu.filter(item => item.kind === "buffet");
  const alaCarte = menu.filter(item => item.kind !== "buffet");
  const categories = useMemo(() => [all, ...new Set(alaCarte.map(item => item.category))], [alaCarte, all]);
  const shown = alaCarte.filter(item => !category || category === all || item.category === category);
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
      <div><strong>{restaurant}</strong><span>{t("guest.table")} {label}</span></div>
      <LocaleSwitch current={locale}/>
    </header>

    {blocked ? <div className="guest-blocked"><h1>{t("guest.welcome")}</h1><p>{t(blocked as Parameters<typeof translate>[1])}</p></div> : <>
      {message && <div className={`guest-message ${isError ? "error" : ""}`} role={isError ? "alert" : "status"}><span>{message}</span><button aria-label="Dismiss" onClick={() => setMessage("")}><X size={15}/></button></div>}

      {placed.length > 0 && <section className="guest-bill">
        <h2>{t("guest.alreadyOrdered")}</h2>
        <ul>{placed.map(line => <li key={line.name}><span>{line.quantity}× {line.name}</span><span>{money(line.unitPriceCents * line.quantity)}</span></li>)}</ul>
        <div className="guest-bill-total"><span>{t("guest.billSoFar")}</span><strong>{money(billTotal)}</strong></div>
      </section>}

      {showCart ? <section className="guest-cart-view">
        <button className="guest-back" onClick={() => setShowCart(false)}>{t("guest.backToMenu")}</button>
        <h1>{t("guest.yourOrder")}</h1>
        {lines.length === 0 ? <p className="guest-empty">{t("guest.nothingAdded")}</p> : <ul className="guest-lines">
          {lines.map(line => <li key={line.id}>
            <div><strong>{line.name}</strong><span>{money(line.priceCents)}{line.kind === "buffet" ? ` · ${line.quantity} ${t("menu.covers")}` : ""}</span></div>
            <div className="stepper">
              <button aria-label={`Remove one ${line.name}`} onClick={() => change(line.id, -1)}><Minus size={15}/></button>
              <span>{line.quantity}</span>
              <button aria-label={`Add one ${line.name}`} onClick={() => change(line.id, 1)}><Plus size={15}/></button>
            </div>
          </li>)}
        </ul>}
        <div className="guest-total"><span>{t("guest.total")}</span><strong>{money(total)}</strong></div>
        <Button className="w-full" disabled={!count || pending} onClick={submit}>{pending ? t("guest.sending") : t("guest.send")}<ArrowRight/></Button>
      </section> : <>
        {menu.length === 0 ? <p className="guest-empty">{t("guest.menuNotReady")}</p> : <>
          {buffet.length > 0 && <section className="guest-buffet">
            <h2>{t("menu.buffet")}</h2>
            <ul className="guest-menu">{buffet.map(item => <li key={item.id}>
              <div><strong>{item.name}</strong><span>{money(item.priceCents)} · {t("menu.perPerson")}</span></div>
              {cart[item.id] ? <div className="stepper">
                <button aria-label={`-1 ${item.name}`} onClick={() => change(item.id, -1)}><Minus size={15}/></button>
                <span>{cart[item.id]}</span>
                <button aria-label={`+1 ${item.name}`} onClick={() => change(item.id, 1)}><Plus size={15}/></button>
              </div> : <button className="guest-add" aria-label={`Add ${item.name}`} onClick={() => change(item.id, 1)}><Plus size={17}/></button>}
            </li>)}</ul>
          </section>}
          {categories.length > 2 && <nav className="guest-cats" aria-label="Menu categories">{categories.map(name =>
            <button key={name} aria-pressed={category === name || (!category && name === all)} className={category === name || (!category && name === all) ? "active" : ""} onClick={() => setCategory(name)}>{name}</button>)}</nav>}
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
        <ShoppingBag size={18}/><span>{count} {count > 1 ? t("guest.items") : t("guest.item")}</span><strong>{money(total)}</strong><ArrowRight size={18}/>
      </button>}

      {!isError && message && !count && <p className="guest-thanks"><CheckCheck size={16}/>{t("guest.thanks")}</p>}
    </>}
  </main>;
}
