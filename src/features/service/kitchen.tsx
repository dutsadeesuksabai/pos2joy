"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChefHat, Clock3, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { advanceTicket } from "./actions";
import type { KitchenTicket } from "./repository";

type Props = { branchId: string; tickets: KitchenTicket[] };

export function KitchenBoard({ branchId, tickets }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();

  // ponytail: a kitchen screen is left open, so it polls. Swap for Supabase
  // Realtime if 15s ever feels slow, or if the request cost starts to matter.
  useEffect(() => {
    const tick = setInterval(() => { setNow(Date.now()); router.refresh(); }, 15000);
    return () => clearInterval(tick);
  }, [router]);

  function move(orderId: string, status: "preparing" | "served" | "cancelled") {
    startTransition(async () => {
      try {
        const result = await advanceTicket({ branchId, orderId, status });
        setIsError(!result.ok);
        setMessage(result.ok ? result.message : result.error);
        if (result.ok) router.refresh();
      } catch { setIsError(true); setMessage("Connection lost. Refresh."); }
    });
  }

  const waited = (createdAt: number) => Math.max(0, Math.floor((now - createdAt) / 60000));

  return <section className="kitchen">
    {message && <div className={`pos-message ${isError ? "error" : ""}`} role={isError ? "alert" : "status"}><span>{message}</span><button aria-label="Dismiss" onClick={() => setMessage("")}><X size={16}/></button></div>}

    {tickets.length === 0
      ? <p className="pos-empty"><ChefHat size={30}/><br/>No tickets.</p>
      : <div className="ticket-grid">{tickets.map(ticket => {
          const minutes = waited(ticket.createdAt);
          return <article key={ticket.id} className={`ticket ${ticket.status} ${minutes >= 20 ? "late" : ""}`}>
            <header>
              <strong>Table {ticket.tableLabel}</strong>
              <span className={minutes >= 20 ? "late-clock" : ""}><Clock3 size={13}/>{minutes} min</span>
            </header>
            <ul>{ticket.lines.map(line => <li key={line.name}><b>{line.quantity}×</b><span>{line.name}</span></li>)}</ul>
            <footer>
              {ticket.status === "placed"
                ? <Button disabled={pending} onClick={() => move(ticket.id, "preparing")}><ChefHat/>Start</Button>
                : <Button disabled={pending} onClick={() => move(ticket.id, "served")}><Check/>Served</Button>}
              <Button variant="ghost" disabled={pending} onClick={() => move(ticket.id, "cancelled")} aria-label={`Cancel the ticket for table ${ticket.tableLabel}`}><X/></Button>
            </footer>
          </article>;
        })}</div>}
  </section>;
}
