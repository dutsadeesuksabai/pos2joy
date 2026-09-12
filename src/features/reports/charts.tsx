"use client";

import { formatMoney } from "@/features/orders/model";
import { translate, type Locale } from "@/i18n/dictionary";
import type { DailyRow } from "./repository";

// Validated with the dataviz palette checker against a light surface:
// adjacent CVD ΔE 32.1 (protan), normal-vision ΔE 38.1 — both well clear.
const WAIT = "#0754c9";
const COOK = "#c98207";

const CHART_W = 720, CHART_H = 150, PAD_B = 20;
const shortDay = (day: string) => day.slice(5).replace("-", "/");

// One measure per chart. Takings and covers are different scales, and a second
// y-axis would let either be read as the other.
function BarChart({ rows, value, label, colour, format }: {
  rows: DailyRow[]; value: (row: DailyRow) => number; label: string; colour: string; format: (n: number) => string;
}) {
  const max = Math.max(1, ...rows.map(value));
  const slot = CHART_W / Math.max(1, rows.length);
  const width = Math.max(3, slot - 4); // a 2px surface gap either side
  const plot = CHART_H - PAD_B;
  const peak = rows.reduce((best, row) => value(row) > value(best) ? row : best, rows[0]);

  return <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="chart" role="img" aria-label={label}>
    {[0.5, 1].map(step => <line key={step} className="chart-grid" x1="0" x2={CHART_W} y1={plot - plot * step} y2={plot - plot * step}/>)}
    {rows.map((row, index) => {
      const raw = value(row);
      const height = raw === 0 ? 0 : Math.max(2, (raw / max) * (plot - 6));
      return <g key={row.day}>
        <rect className="chart-bar" x={index * slot + 2} y={plot - height} width={width} height={height} rx="4" fill={colour}>
          <title>{`${row.day} — ${format(raw)}`}</title>
        </rect>
        {/* Label the ends only: a number on every bar is noise. */}
        {(index === 0 || index === rows.length - 1 || row.day === peak?.day) && raw > 0 &&
          <text className="chart-value" x={index * slot + 2 + width / 2} y={plot - height - 5} textAnchor="middle">{format(raw)}</text>}
        {index % Math.ceil(rows.length / 7) === 0 &&
          <text className="chart-axis" x={index * slot + 2 + width / 2} y={CHART_H - 5} textAnchor="middle">{shortDay(row.day)}</text>}
      </g>;
    })}
  </svg>;
}

export function DailyCharts({ rows, currency, locale }: { rows: DailyRow[]; currency: string; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const money = (cents: number) => formatMoney(cents, currency);
  const minutes = (seconds: number) => `${Math.round(seconds / 60)} ${t("staff.min")}`;
  const maxService = Math.max(1, ...rows.map(row => row.confirmSeconds + row.serveSeconds));
  const slot = CHART_W / Math.max(1, rows.length);
  const width = Math.max(3, slot - 4);
  const plot = CHART_H - PAD_B;

  const totals = rows.reduce((sum, row) => ({
    revenue: sum.revenue + row.revenueCents, covers: sum.covers + row.covers, orders: sum.orders + row.orders,
  }), { revenue: 0, covers: 0, orders: 0 });
  const timed = rows.filter(row => row.serveSeconds > 0);
  const avgService = timed.length ? timed.reduce((s, r) => s + r.confirmSeconds + r.serveSeconds, 0) / timed.length : 0;

  return <div className="reports">
    <div className="report-heroes">
      <article><span>{t("report.totalRevenue")}</span><strong>{money(totals.revenue)}</strong></article>
      <article><span>{t("report.totalCovers")}</span><strong>{totals.covers}</strong></article>
      <article><span>{t("report.totalOrders")}</span><strong>{totals.orders}</strong></article>
      <article><span>{t("report.avgService")}</span><strong>{avgService > 0 ? minutes(avgService) : "—"}</strong></article>
    </div>

    <figure className="chart-card">
      <figcaption>{t("report.revenueChart")}</figcaption>
      <BarChart rows={rows} value={row => row.revenueCents} label={t("report.revenueChart")} colour={WAIT} format={money}/>
    </figure>

    <figure className="chart-card">
      <figcaption>{t("report.coversChart")}</figcaption>
      <BarChart rows={rows} value={row => row.covers} label={t("report.coversChart")} colour="#1c7a51" format={n => String(n)}/>
    </figure>

    <figure className="chart-card">
      <figcaption>{t("report.serviceChart")}</figcaption>
      {/* Two series, so identity is never colour alone: a legend is always present. */}
      <div className="chart-legend">
        <span><i style={{ background: WAIT }}/>{t("report.toConfirm")}</span>
        <span><i style={{ background: COOK }}/>{t("report.toServe")}</span>
      </div>
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="chart" role="img" aria-label={t("report.serviceChart")}>
        {[0.5, 1].map(step => <line key={step} className="chart-grid" x1="0" x2={CHART_W} y1={plot - plot * step} y2={plot - plot * step}/>)}
        {rows.map((row, index) => {
          const total = row.confirmSeconds + row.serveSeconds;
          if (total === 0) return null;
          const scale = (plot - 6) / maxService;
          const cook = Math.max(2, row.serveSeconds * scale);
          const wait = Math.max(0, row.confirmSeconds * scale);
          const x = index * slot + 2;
          return <g key={row.day}>
            <rect className="chart-bar" x={x} y={plot - cook} width={width} height={cook} rx="4" fill={COOK}>
              <title>{`${row.day} — ${t("report.toServe")} ${minutes(row.serveSeconds)}`}</title>
            </rect>
            {/* 2px of surface between stacked segments keeps the split readable. */}
            {wait > 2 && <rect className="chart-bar" x={x} y={plot - cook - wait - 2} width={width} height={wait} rx="4" fill={WAIT}>
              <title>{`${row.day} — ${t("report.toConfirm")} ${minutes(row.confirmSeconds)}`}</title>
            </rect>}
            {index % Math.ceil(rows.length / 7) === 0 &&
              <text className="chart-axis" x={x + width / 2} y={CHART_H - 5} textAnchor="middle">{shortDay(row.day)}</text>}
          </g>;
        })}
      </svg>
    </figure>

    {/* Colour is never the only way to read this: the same numbers, as a table. */}
    <details className="report-table">
      <summary>{t("report.tableView")}</summary>
      <table>
        <thead><tr><th>{t("report.day")}</th><th>{t("dash.revenueToday")}</th><th>{t("dash.covers")}</th><th>{t("report.totalOrders")}</th><th>{t("report.toConfirm")}</th><th>{t("report.toServe")}</th></tr></thead>
        <tbody>{rows.filter(row => row.revenueCents || row.covers || row.orders).reverse().map(row => <tr key={row.day}>
          <td>{row.day}</td><td>{money(row.revenueCents)}</td><td>{row.covers}</td><td>{row.orders}</td>
          <td>{row.confirmSeconds ? minutes(row.confirmSeconds) : "—"}</td><td>{row.serveSeconds ? minutes(row.serveSeconds) : "—"}</td>
        </tr>)}</tbody>
      </table>
    </details>
  </div>;
}
