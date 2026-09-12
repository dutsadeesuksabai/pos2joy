"use client";

import { useLiveRefresh } from "@/lib/use-live-refresh";
import { ticketLabel } from "@/features/queue/ticket";
import { translate, type Locale } from "@/i18n/dictionary";
import { LocaleSwitch } from "@/i18n/locale-switch";
import type { readCallBoard } from "./repository";

type Board = Awaited<ReturnType<typeof readCallBoard>>;

export function CallDisplay({ restaurant, branch, board, locale }: { restaurant: string; branch: string; board: Board; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  useLiveRefresh(10000);

  const [latest, ...earlier] = board.called;

  return <main className="call-screen">
    <header><div><strong>{restaurant}</strong><span>{branch}</span></div><LocaleSwitch current={locale}/></header>

    {latest ? <section className="call-now" aria-live="polite">
      <span className="call-label">{t("call.nowCalling")}</span>
      <h1>{ticketLabel(latest.ticketNo) || latest.guestName}</h1>
      <p className="call-name">{latest.guestName} · {latest.partySize} {t("call.guests")}</p>
      <p className="call-table">{t("call.table")} <b>{latest.tableLabel ?? "—"}</b></p>
    </section> : <section className="call-now idle">
      <h1>{t("call.welcome")}</h1>
      <p>{t("call.askStaff")}</p>
    </section>}

    <div className="call-lists">
      {earlier.length > 0 && <section>
        <h2>{t("call.alsoReady")}</h2>
        <ul className="call-ready">{earlier.map(entry =>
          <li key={entry.id}><span className="call-ticket">{ticketLabel(entry.ticketNo)}</span><span>{entry.guestName}</span><b>{entry.tableLabel ?? "—"}</b></li>)}</ul>
      </section>}

      <section>
        <h2>{t("call.waiting")} · {board.waiting.length}</h2>
        {board.waiting.length === 0
          ? <p className="call-empty">{t("call.nobody")}</p>
          : <ol className="call-waiting">{board.waiting.slice(0, 10).map((entry, index) =>
              <li key={entry.id}><span className="call-no">{ticketLabel(entry.ticketNo)}</span>{entry.guestName}<b>{entry.partySize}</b></li>)}</ol>}
      </section>
    </div>
  </main>;
}
