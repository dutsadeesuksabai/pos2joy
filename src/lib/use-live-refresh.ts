"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

// Refresh only the page a person is watching. A transition guards against
// overlapping RSC requests on slow connections; writes can pause polling too.
export function useLiveRefresh(intervalMs: number, paused = false) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  useEffect(() => { if (!pending) inFlight.current = false; }, [pending]);
  useEffect(() => {
    if (paused || pending) return;
    const refresh = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine || inFlight.current) return;
      inFlight.current = true;
      startTransition(() => router.refresh());
    };
    const timer = setInterval(refresh, intervalMs);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [intervalMs, paused, pending, router]);
}
