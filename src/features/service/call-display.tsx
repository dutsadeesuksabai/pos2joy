"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ticketLabel } from "@/features/queue/ticket";
import type { readCallBoard } from "./repository";

type Board = Awaited<ReturnType<typeof readCallBoard>>;

export function CallDisplay({ restaurant, branch, board }: { restaurant: string; branch: string; board: Board }) {
  const router = useRouter();
  // ponytail: the wall screen polls. Sound and Realtime come later; this keeps
  // the display a plain page with nothing to install or keep connected.
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 10000);
    return () => clearInterval(timer);
  }, [router]);

  const [latest, ...earlier] = board.called;

  return <main className="call-screen">
    <header><strong>{restaurant}</strong><span>{branch}</span></header>

    {latest ? <section className="call-now" aria-live="polite">
      <span className="call-label">NOW CALLING</span>
      <h1>{ticketLabel(latest.ticketNo) || latest.guestName}</h1>
      <p className="call-name">{latest.guestName} · {latest.partySize} guests</p>
      <p className="call-table">TABLE <b>{latest.tableLabel ?? "—"}</b></p>
    </section> : <section className="call-now idle">
      <h1>Welcome</h1>
      <p>Please see a member of staff to join the queue.</p>
    </section>}

    <div className="call-lists">
      {earlier.length > 0 && <section>
        <h2>Also ready</h2>
        <ul className="call-ready">{earlier.map(entry =>
          <li key={entry.id}><span className="call-ticket">{ticketLabel(entry.ticketNo)}</span><span>{entry.guestName}</span><b>{entry.tableLabel ?? "—"}</b></li>)}</ul>
      </section>}

      <section>
        <h2>Waiting · {board.waiting.length}</h2>
        {board.waiting.length === 0
          ? <p className="call-empty">Nobody waiting</p>
          : <ol className="call-waiting">{board.waiting.slice(0, 10).map((entry, index) =>
              <li key={entry.id}><span className="call-no">{ticketLabel(entry.ticketNo)}</span>{entry.guestName}<b>{entry.partySize}</b></li>)}</ol>}
      </section>
    </div>
  </main>;
}
