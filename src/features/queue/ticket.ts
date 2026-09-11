// Queue numbers restart each service day, so they stay short enough to read off
// a wall screen. The letter keeps them from being mistaken for a table number,
// which is the other number on that same display.
// ponytail: one prefix for the whole branch. Split per seating area only if a
// restaurant actually runs separate queues.
export const ticketPrefix = "A";

export function ticketLabel(ticketNo: number | null | undefined) {
  if (typeof ticketNo !== "number" || !Number.isInteger(ticketNo) || ticketNo < 1) return "";
  return `${ticketPrefix}${String(ticketNo).padStart(3, "0")}`;
}

// The service day is the branch's own calendar day, not the server's, so a shop
// open past midnight still numbers by the date its staff would name.
export function serviceDayIn(timezone: string, at = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  }
}
