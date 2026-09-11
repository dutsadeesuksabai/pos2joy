"use client";

import { useEffect } from "react";
import { ticketLabel } from "@/features/queue/ticket";
import { translate, type Locale } from "@/i18n/dictionary";
import type { readQueueTicket } from "./repository";

type Ticket = NonNullable<Awaited<ReturnType<typeof readQueueTicket>>>;

export function QueueSlip({ locale, ticket, qrSvg, url }: { locale: Locale; ticket: Ticket; qrSvg: string; url: string }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  // Staff open this to hand a slip over, so it goes straight to the dialog.
  // ponytail: the browser drives the printer. Receipt width is set in CSS, so
  // any thermal printer with a driver works; no ESC/POS, no native bridge.
  useEffect(() => { const id = setTimeout(() => window.print(), 350); return () => clearTimeout(id); }, []);

  const joined = new Date(ticket.joinedAt).toLocaleString(locale === "zh" ? "zh-CN" : locale === "th" ? "th-TH" : "en-GB",
    { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return <main className="slip">
    <div className="slip-paper">
      <div className="slip-shop">{ticket.restaurantName}</div>
      <div className="slip-branch">{ticket.branchName}</div>
      <div className="slip-rule"/>
      <div className="slip-kind">{t("slip.queueTicket")}</div>
      <div className="slip-no">{ticketLabel(ticket.ticketNo)}</div>
      <div className="slip-meta">{t("queue.party")} {ticket.partySize}</div>
      <div className="slip-meta">{t("queue.joinedAt")} {joined}</div>
      <div className="slip-rule"/>
      <div className="slip-qr" aria-label={t("slip.scanToTrack")} dangerouslySetInnerHTML={{ __html: qrSvg }}/>
      <div className="slip-scan">{t("slip.scanToTrack")}</div>
      <div className="slip-url">{url}</div>
      <div className="slip-keep">{t("slip.keepThis")}</div>
    </div>
    <button className="slip-print" onClick={() => window.print()}>Print</button>
  </main>;
}
