"use client";

import { BellRing, Clock3, Receipt, TrendingUp, Users, Utensils } from "lucide-react";
import { formatMoney } from "@/features/orders/model";
import { ticketLabel } from "@/features/queue/ticket";
import { translate, type Locale } from "@/i18n/dictionary";
import type { BranchInsights } from "./repository";

type Called = { id: string; ticketNo: number; guestName: string; partySize: number; calledTableLabel: string | null };
type Props = { insights: BranchInsights; called: Called[]; currency: string; locale: Locale; canBill: boolean };

const minutes = (seconds: number) => Math.round(seconds / 60);

// The numbers a manager glances at between covers. Takings and the open-bill
// total are only shown to whoever is allowed to close a bill.
export function Dashboard({ insights, called, currency, locale, canBill }: Props) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const { tables, queue, bills, topDishes } = insights;
  const money = (cents: number) => formatMoney(cents, currency);

  return <section className="dash">
    <div className="dash-grid">
      <article className="dash-tile free">
        <span className="dash-label"><Utensils size={13}/>{t("dash.free")}</span>
        <strong>{tables.free}<small>/{tables.total}</small></strong>
        <span className="dash-sub">{tables.total_capacity - tables.seated_capacity} {t("dash.seatsFree")}</span>
      </article>

      <article className={`dash-tile ${queue.waiting > 0 ? "attention" : ""}`}>
        <span className="dash-label"><Users size={13}/>{t("dash.waiting")}</span>
        <strong>{queue.waiting}</strong>
        <span className="dash-sub">{queue.longest_wait_s > 0 ? `${minutes(queue.longest_wait_s)} ${t("staff.min")} ${t("dash.longest")}` : t("dash.none")}</span>
      </article>

      <article className={`dash-tile ${called.length > 0 ? "calling" : ""}`}>
        <span className="dash-label"><BellRing size={13}/>{t("dash.calling")}</span>
        <strong>{called.length}</strong>
        <span className="dash-sub">{queue.no_show_today > 0 ? `${queue.no_show_today} ${t("dash.noShows")}` : t("dash.none")}</span>
      </article>

      <article className="dash-tile">
        <span className="dash-label"><Users size={13}/>{t("dash.coversToday")}</span>
        <strong>{queue.covers_today}<small> {t("dash.covers")}</small></strong>
        <span className="dash-sub">{queue.seated_today} {t("dash.parties")}</span>
      </article>

      <article className="dash-tile">
        <span className="dash-label"><Clock3 size={13}/>{t("dash.avgWait")}</span>
        <strong>{queue.avg_wait_s > 0 ? minutes(queue.avg_wait_s) : 0}<small> {t("staff.min")}</small></strong>
        <span className="dash-sub">{insights.day}</span>
      </article>

      {canBill && <>
        <article className="dash-tile money">
          <span className="dash-label"><TrendingUp size={13}/>{t("dash.revenueToday")}</span>
          <strong>{money(bills.revenue_cents)}</strong>
          <span className="dash-sub">{bills.items_today} {t("guest.items")}</span>
        </article>
        <article className="dash-tile">
          <span className="dash-label"><Receipt size={13}/>{t("dash.openBills")}</span>
          <strong>{bills.open_bills}</strong>
          <span className="dash-sub">{money(bills.open_cents)}</span>
        </article>
      </>}

      {topDishes.length > 0 && <article className="dash-tile wide">
        <span className="dash-label"><Utensils size={13}/>{t("dash.topDishes")}</span>
        <ol className="dash-top">{topDishes.map(dish => <li key={dish.name}><span>{dish.name}</span><b>{dish.sold}</b></li>)}</ol>
      </article>}
    </div>

    {/* The list a host is asked for by name: who has been called, and where. */}
    <div className={`dash-called ${called.length ? "" : "idle"}`}>
      <span className="dash-label"><BellRing size={13}/>{t("dash.calling")}</span>
      {called.length === 0
        ? <p>{t("dash.nobodyCalled")}</p>
        : <ul>{called.map(entry => <li key={entry.id}>
            <b>{ticketLabel(entry.ticketNo)}</b>
            <span>{entry.guestName} · {entry.partySize}</span>
            <em>{entry.calledTableLabel ?? "—"}</em>
          </li>)}</ul>}
    </div>
  </section>;
}
