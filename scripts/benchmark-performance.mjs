import { performance } from "node:perf_hooks";
import { planSeating } from "../src/features/queue/recommend.ts";
import { summarizeBills } from "../src/features/service/bill-summary.ts";

const now = 1800000000000;
const tables = Array.from({ length: 100 }, (_, i) => ({ id: `t${i}`, label: `${i}`, capacity: [2,4,8][i % 3], floorId: `f${i % 2}`, accessible: i % 4 === 0, status: "available", x: 0, y: 0 }));
const parties = Array.from({ length: 500 }, (_, i) => ({ id: `p${i}`, name: `Guest ${i}`, size: [2,3,4,6][i % 4], status: "waiting", joinedAt: now - i * 12000, needsAccessible: i % 9 === 0 }));
const rows = Array.from({ length: 5000 }, (_, i) => ({ id: `o${i % 500}`, tableId: `t${i % 100}`, status: "placed", createdAt: new Date(now - i % 500), name: `Dish ${i % 20}`, quantity: 2, unitPriceCents: 1250 }));
function measure(name, work) {
  for (let i=0; i<10; i++) work();
  const samples = Array.from({ length: 100 }, () => { const start = performance.now(); work(); return performance.now() - start; }).sort((a,b) => a-b);
  return { name, samples: samples.length, p50Ms: Number(samples[49].toFixed(3)), p95Ms: Number(samples[94].toFixed(3)) };
}
console.log(JSON.stringify({ note: "Synthetic local CPU only; excludes DB, network and browser rendering.", results: [measure("100 tables / 500 parties", () => planSeating(tables, parties, now)), measure("500 bills / 5000 lines", () => summarizeBills(rows))] }, null, 2));
