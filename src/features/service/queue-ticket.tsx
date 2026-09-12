"use client";

import { useLiveRefresh } from "@/lib/use-live-refresh";
import { ticketLabel } from "@/features/queue/ticket";
import { translate, type Locale } from "@/i18n/dictionary";
import { LocaleSwitch } from "@/i18n/locale-switch";
import type { readQueueTicket } from "./repository";

type Ticket = NonNullable<Awaited<ReturnType<typeof readQueueTicket>>>;

export function QueueTicketView({ locale, ticket }: { locale: Locale; ticket: Ticket }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const done = ticket.status === "seated" || ticket.status === "cancelled" || ticket.status === "no_show";
  useLiveRefresh(15000, done);

  return <main className="qticket">
    <header>
      <div><strong>{ticket.restaurantName}</strong><span>{ticket.branchName}</span></div>
      <LocaleSwitch current={locale}/>
    </header>

    <section className={`qticket-card ${ticket.status}`}>
      <span className="qticket-label">{t("queue.yourNumber")}</span>
      <strong className="qticket-no">{ticketLabel(ticket.ticketNo)}</strong>
      <p className="qticket-party">{t("queue.party")} {ticket.partySize}</p>
    </section>

    {ticket.status === "offered" ? <section className="qticket-state ready">
      <h1>{t("queue.called")}</h1>
      <p>{t("queue.goToTable")} <b>{ticket.tableLabel ?? "—"}</b></p>
    </section> : ticket.status === "seated" ? <section className="qticket-state">
      <h1>{t("queue.seated")}</h1>
    </section> : done ? <section className="qticket-state">
      <p>{t("queue.noShow")}</p>
    </section> : <section className="qticket-state">
      <h1>{t("queue.waiting")}</h1>
      <p>{ticket.ahead === 0 ? t("queue.youAreNext") : `${ticket.ahead} ${t("queue.aheadOfYou")}`}</p>
    </section>}

    {!done && <p className="qticket-foot">{t("queue.refreshes")}</p>}
  </main>;
}
