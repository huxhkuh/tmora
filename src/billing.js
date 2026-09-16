import {
  daily,
  duration,
  sliceEntries,
  timerSegments,
  HOUR,
  hms,
} from "./domain.js";
import { billingStatus } from "./billing-model.js";
import { tr } from "./i18n.js";

export const statusLabel = (status) =>
  ({
    billable: tr("לחיוב"),
    internal: tr("פנימי"),
    unclassified: tr("טרם סווג"),
  })[status];

// Decimal rational arithmetic, including legacy rates with more than two decimals.
// Money is rounded half-up once per entry/day, after joining its paused segments.
function decimalFraction(number) {
  if (!Number.isFinite(number) || number < 0)
    throw Error("Invalid nonnegative amount");
  const [mantissa, exponent = "0"] = String(number).toLowerCase().split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  const scale = fraction.length - Number(exponent);
  const digits = BigInt(whole + fraction);
  return scale >= 0
    ? [digits, 10n ** BigInt(scale)]
    : [digits * 10n ** BigInt(-scale), 1n];
}
export function centsFor(ms, rate) {
  const [m, md] = decimalFraction(ms),
    [r, rd] = decimalFraction(rate);
  const n = m * r * 100n,
    d = md * rd * BigInt(HOUR);
  const result = (2n * n + d) / (2n * d);
  if (result > BigInt(Number.MAX_SAFE_INTEGER))
    throw Error(tr("הסכום גדול מדי לחישוב מדויק."));
  return Number(result);
}
export function exactDuration(ms) {
  // Milliseconds are displayed when present; no upward rounding of tiny sessions.
  const whole = Math.floor(ms);
  return (
    hms(whole) +
    (whole % 1000 ? "." + String(whole % 1000).padStart(3, "0") : "")
  );
}
export function workRows(entries) {
  const grouped = new Map();
  for (const part of daily(entries)) {
    const key = `${part.id}:${part.day}`;
    const row = grouped.get(key);
    if (row) row.ms += duration(part.segments);
    else
      grouped.set(key, {
        id: part.id,
        day: part.day,
        projectId: part.projectId,
        description: part.description,
        status: billingStatus(part),
        ms: duration(part.segments),
        pricing: { ...part.pricing },
      });
  }
  return [...grouped.values()]
    .map((row) => ({
      ...row,
      cents:
        row.status === "billable" && row.pricing.type === "hourly"
          ? centsFor(row.ms, row.pricing.amount)
          : null,
    }))
    .sort((a, b) => a.day.localeCompare(b.day) || a.id.localeCompare(b.id));
}
export function summarize(rows) {
  const result = {
    totalMs: 0,
    billableMs: 0,
    internalMs: 0,
    unclassifiedMs: 0,
    cents: 0,
    unpricedMs: 0,
    fixedMs: 0,
  };
  for (const row of rows) {
    result.totalMs += row.ms;
    result[row.status + "Ms"] += row.ms;
    result.cents += row.cents ?? 0;
    if (!Number.isSafeInteger(result.cents))
      throw Error(tr("הסכום גדול מדי לחישוב מדויק."));
    if (row.status === "billable" && row.pricing.type === "none")
      result.unpricedMs += row.ms;
    if (row.status === "billable" && row.pricing.type === "fixed")
      result.fixedMs += row.ms;
  }
  return result;
}
export function budgetState(project, ms) {
  const budgetMs = project.goal == null ? null : project.goal * HOUR;
  const percentage =
    budgetMs === null || budgetMs === 0 ? null : (ms / budgetMs) * 100;
  const thresholds = [...new Set(project.budgetAlerts ?? [80, 100])].sort(
    (a, b) => a - b,
  );
  return {
    ms,
    budgetMs,
    remainingMs: budgetMs === null ? null : Math.max(0, budgetMs - ms),
    overMs: budgetMs === null ? 0 : Math.max(0, ms - budgetMs),
    percentage,
    reached: thresholds.filter(
      (n) => budgetMs !== null && (budgetMs === 0 ? ms > 0 : percentage >= n),
    ),
  };
}
export function projectTimes(state, now) {
  const totals = new Map();
  for (const e of state.entries)
    totals.set(
      e.projectId,
      (totals.get(e.projectId) ?? 0) + duration(e.segments),
    );
  if (state.timer)
    totals.set(
      state.timer.projectId,
      (totals.get(state.timer.projectId) ?? 0) +
        duration(timerSegments(state.timer, now)),
    );
  return totals;
}
export function buildClientReport(
  state,
  { projectId, from, to, showRates = true },
) {
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) throw Error(tr("יש לבחור פרויקט לדוח הלקוח."));
  const entries = sliceEntries(
    state.entries.filter((e) => e.projectId === projectId),
    from,
    to,
  );
  const rows = workRows(entries).filter((r) => r.status === "billable");
  // Explicit public projection. Notes, internal descriptions and project price never enter this object.
  return {
    project: project.name,
    client: state.clients.find((c) => c.id === project.clientId)?.name ?? "",
    from,
    to,
    showRates,
    rows: rows.map((r) => ({
      date: r.day,
      description: r.description,
      ms: r.ms,
      ...(showRates
        ? {
            rate: r.pricing.type === "hourly" ? r.pricing.amount : null,
            priceType: r.pricing.type,
            cents: r.cents,
          }
        : {}),
    })),
    totalMs: rows.reduce((sum, row) => sum + row.ms, 0),
    ...(showRates ? { cents: summarize(rows).cents } : {}),
  };
}
export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
export const ROUNDING_HE =
  "הזמן נמדד ללא עיגול. מקטעים של אותו רישום באותו יום מאוחדים לפני החישוב. סכום כל שורה מעוגל לאגורה הקרובה (חצי אגורה כלפי מעלה); הסכום הכולל הוא סכום השורות.";
const amount = (cents) => (cents / 100).toFixed(2);
export const reportStyles = `
.client-report { --ink:#252a25; --cream:#f2f3ee; --surface:white; --muted:#535b53; --line:#d8dcd7; color-scheme:light; direction:rtl; color:#252a25; background:white; font:14px/1.7 'Heebo Variable',Arial,sans-serif; padding:32px; text-align:right; }
.client-report * { box-sizing:border-box; }
.client-report header { border-bottom:3px solid #b94f2a; padding-bottom:20px; margin-bottom:24px; }
.client-report h1 { font-size:28px; margin:0 0 8px; }
.client-report p { margin:6px 0; }
.client-report table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:13px; }
.client-report th,.client-report td { padding:10px 7px; border-bottom:1px solid #d8dcd7; text-align:right; vertical-align:top; overflow-wrap:anywhere; }
.client-report th { background:#f2f3ee; white-space:normal; line-height:1.5; }
.client-report th small { font-size:10px; }
.client-report .duration-column { width:20%; }
.client-report .description { width:36%; white-space:pre-wrap; }
.client-report .numeric { direction:ltr; text-align:right; font-variant-numeric:tabular-nums; }
.client-report .report-total { border-top:2px solid #343d34; margin-top:16px; padding-top:12px; font-weight:bold; }
.client-report footer { margin-top:24px; font-size:11px; color:#535b53; }
@page { size:A4; margin:16mm; }
@media print { .client-report { padding:0; font-size:12px; } .client-report h1 { font-size:24px; } .client-report table { font-size:11px; } .client-report tr { break-inside:avoid; } .client-report thead { display:table-header-group; } .client-report footer { break-inside:avoid; } }
`;
export function reportMarkup(report) {
  const esc = escapeHtml;
  const rows = report.rows
    .map(
      (r) =>
        `<tr><td><bdi>${esc(r.date)}</bdi></td><td class="description">${esc(r.description || "ללא תיאור")}</td><td class="numeric">${exactDuration(r.ms)}</td>${report.showRates ? `<td class="numeric">${r.rate === null ? "—" : esc(r.rate)}</td><td class="numeric">${r.cents === null ? (r.priceType === "fixed" ? "מחיר כולל" : "לא הוגדר") : amount(r.cents)}</td>` : ""}</tr>`,
    )
    .join("");
  return `<article class="client-report" lang="he" dir="rtl"><header><h1>דוח שעות עבודה</h1><p><b>לקוח:</b> <bdi>${esc(report.client)}</bdi></p><p><b>פרויקט:</b> <bdi>${esc(report.project)}</bdi></p><p><bdi>${esc(report.from)}</bdi> עד <bdi>${esc(report.to)}</bdi> · שעון ישראל</p></header><table><thead><tr><th>תאריך</th><th class="description">תיאור העבודה</th><th class="duration-column">משך<br><small>שעות:דקות:שניות</small></th>${report.showRates ? "<th>תעריף לשעה<br>(₪)</th><th>סכום (₪)</th>" : ""}</tr></thead><tbody>${rows}</tbody></table><div class="report-total">סך זמן לחיוב: <bdi>${exactDuration(report.totalMs)}</bdi>${report.showRates ? ` · סך חיוב שעתי: <bdi>${amount(report.cents)} ₪</bdi>` : ""}</div><footer><p>הדוח כולל רישומים שנשמרו וסווגו לחיוב בלבד.</p><p>${report.showRates ? ROUNDING_HE : "הזמן נמדד ללא עיגול. הדוח אינו מציג מחירים."}</p>${report.showRates ? "<p>מחיר כולל לפרויקט או תעריף שלא הוגדר אינם נכללים בסכום השעתי.</p>" : ""}<p>דוח עבודה בלבד · אינו חשבונית מס</p></footer></article>`;
}
export function reportHtml(report, fontData = "") {
  const fontCss = fontData.startsWith("data:font/woff2;base64,")
    ? `@font-face{font-family:'Heebo Variable';src:url('${fontData}') format('woff2');font-weight:100 900;font-display:swap;}`
    : "";
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>דוח שעות עבודה</title><style>${fontCss}${reportStyles}body{margin:0;background:white}</style></head><body>${reportMarkup(report)}</body></html>`;
}
export function reportCsv(report) {
  const safe = (x) =>
    '"' +
    String(x ?? "")
      .replace(/^(?:\s*[=+@\-]|[\t\r\n])/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const header = [
    "תאריך",
    "לקוח",
    "פרויקט",
    "תיאור העבודה",
    "משך",
    "שעות מדויקות",
    ...(report.showRates ? ["תעריף לשעה (₪)", "סכום (₪)"] : []),
  ];
  const rows = report.rows.map((r) => [
    r.date,
    report.client,
    report.project,
    r.description,
    exactDuration(r.ms),
    r.ms / HOUR,
    ...(report.showRates
      ? [
          r.rate ?? "",
          r.cents === null
            ? r.priceType === "fixed"
              ? "מחיר כולל"
              : "לא הוגדר"
            : amount(r.cents),
        ]
      : []),
  ]);
  rows.push([
    "סה״כ",
    "",
    "",
    "",
    exactDuration(report.totalMs),
    report.totalMs / HOUR,
    ...(report.showRates ? ["", amount(report.cents)] : []),
  ]);
  return (
    "\uFEFF" +
    [header, ...rows].map((row) => row.map(safe).join(",")).join("\r\n")
  );
}
