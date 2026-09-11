"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Plus, Trash2, UtensilsCrossed, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/features/orders/model";
import { translate, type Locale } from "@/i18n/dictionary";
import { addMenuItem, copyMenuFrom, deleteMenuItem, editMenuItem } from "./actions";
import type { MenuRow } from "./repository";

type Sister = { id: string; name: string; restaurantName: string; items: number };
type Props = { branchId: string; currency: string; items: MenuRow[]; sisters: Sister[]; locale: Locale };
type Kind = "a_la_carte" | "buffet";

export function MenuEditor({ branchId, currency, items, sisters, locale }: Props) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("a_la_carte");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [source, setSource] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [pending, startTransition] = useTransition();

  const money = (cents: number) => formatMoney(cents, currency);
  const groups = ["a_la_carte", "buffet"] as const;
  const known = [...new Set(items.filter(item => item.kind === kind).map(item => item.category))];

  function run(work: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>, after?: () => void) {
    startTransition(async () => {
      try {
        const result = await work();
        setIsError(!result.ok);
        setMessage(result.ok ? result.message : result.error);
        if (result.ok) { after?.(); router.refresh(); }
      } catch { setIsError(true); setMessage(t("staff.connectionLost")); }
    });
  }

  return <section className="menu-admin">
    {message && <div className={`pos-message ${isError ? "error" : ""}`} role={isError ? "alert" : "status"}><span>{message}</span><button aria-label="Dismiss" onClick={() => setMessage("")}><X size={16}/></button></div>}

    <form className="menu-new" onSubmit={event => {
      event.preventDefault();
      const value = Number(price);
      if (!name.trim() || !category.trim() || !Number.isFinite(value) || value < 0) return;
      run(() => addMenuItem({ branchId, name: name.trim(), category: category.trim(), kind, price: value, available: true, sortOrder: 0 }),
        () => { setName(""); setPrice(""); });
    }}>
      <div className="kind-toggle" role="group" aria-label={t("menu.group")}>
        {groups.map(option => <button key={option} type="button" aria-pressed={kind === option} onClick={() => { setKind(option); setCategory(""); }}>
          {option === "buffet" ? t("menu.buffet") : t("menu.alaCarte")}
        </button>)}
      </div>
      <div className="menu-fields">
        <label>{kind === "buffet" ? t("menu.tierName") : t("menu.dishName")}
          <input value={name} maxLength={80} required placeholder={kind === "buffet" ? "Gold" : "Pad Thai"} onChange={event => setName(event.target.value)}/></label>
        <label>{t("menu.category")}
          <input value={category} maxLength={40} required list="menu-categories" placeholder={kind === "buffet" ? t("menu.buffet") : "Mains"} onChange={event => setCategory(event.target.value)}/>
          <datalist id="menu-categories">{known.map(item => <option key={item} value={item}/>)}</datalist></label>
        <label>{kind === "buffet" ? t("menu.perPerson") : t("menu.price")}
          <input type="number" min={0} step="0.01" value={price} required placeholder="0.00" onChange={event => setPrice(event.target.value)}/></label>
        <Button type="submit" disabled={pending || !name.trim() || !category.trim() || price === ""}><Plus/>{t("staff.add")}</Button>
      </div>
    </form>

    {sisters.length > 0 && <form className="menu-copy" onSubmit={event => {
      event.preventDefault();
      if (source) run(() => copyMenuFrom({ branchId, sourceBranchId: source }), () => setSource(""));
    }}>
      <label htmlFor="copy-from"><Copy size={14}/>{t("menu.copyFrom")}</label>
      <select id="copy-from" value={source} onChange={event => setSource(event.target.value)}>
        <option value="">—</option>
        {sisters.map(sister => <option key={sister.id} value={sister.id} disabled={sister.items === 0}>
          {sister.restaurantName} · {sister.name} ({sister.items})
        </option>)}
      </select>
      <Button type="submit" variant="outline" disabled={pending || !source}>{t("menu.copy")}</Button>
    </form>}

    {items.length === 0
      ? <p className="pos-empty"><UtensilsCrossed size={28}/><br/>{t("menu.empty")}</p>
      : groups.filter(group => items.some(item => item.kind === group)).map(group => <div className="menu-group" key={group}>
          <h2>{group === "buffet" ? t("menu.buffet") : t("menu.alaCarte")}{group === "buffet" && <em>{t("menu.tiersCount").replace("{n}", String(items.filter(item => item.kind === "buffet").length))}</em>}</h2>
          <ul className="menu-list">{items.filter(item => item.kind === group).map(item => <li key={item.id} className={item.available ? "" : "off"}>
            <div className="menu-what"><strong>{item.name}</strong><span>{item.category}{group === "buffet" ? ` · ${t("menu.perPerson")}` : ""}</span></div>
            <span className="menu-price">{money(item.priceCents)}</span>
            <label className="menu-avail">
              <input type="checkbox" checked={item.available} disabled={pending}
                onChange={event => run(() => editMenuItem({ branchId, id: item.id, available: event.target.checked }))}/>
              {item.available ? t("menu.onSale") : t("menu.soldOut")}
            </label>
            <button className="menu-del" disabled={pending} aria-label={`${t("menu.remove")} ${item.name}`}
              onClick={() => run(() => deleteMenuItem({ branchId, id: item.id }))}><Trash2 size={15}/></button>
          </li>)}</ul>
        </div>)}
  </section>;
}
