import test from "node:test";
import assert from "node:assert/strict";
import { ticketLabel, serviceDayIn } from "../src/features/queue/ticket.ts";

test("a queue number is padded and prefixed", () => {
  assert.equal(ticketLabel(1), "A001");
  assert.equal(ticketLabel(42), "A042");
  assert.equal(ticketLabel(999), "A999");
});

test("past the padding it keeps counting rather than wrapping", () => {
  assert.equal(ticketLabel(1000), "A1000");
  assert.equal(ticketLabel(12345), "A12345");
});

test("a missing or nonsense number renders as nothing, not as A000", () => {
  for (const bad of [null, undefined, 0, -1, 1.5, NaN, "7"]) assert.equal(ticketLabel(bad), "");
});

test("the service day follows the branch timezone, not the server", () => {
  // 18:30 UTC is already the next calendar day in Bangkok.
  const evening = new Date("2026-09-11T18:30:00Z");
  assert.equal(serviceDayIn("Asia/Bangkok", evening), "2026-09-12");
  assert.equal(serviceDayIn("UTC", evening), "2026-09-11");
  assert.equal(serviceDayIn("America/New_York", evening), "2026-09-11");
});

test("an unknown timezone falls back to UTC instead of throwing", () => {
  const at = new Date("2026-09-11T18:30:00Z");
  assert.equal(serviceDayIn("Not/AZone", at), "2026-09-11");
});
