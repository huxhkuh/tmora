import test from "node:test";
import assert from "node:assert/strict";
import { billingDemo } from "./fixtures/billing.js";
import {
  HOUR,
  timerAction,
  elapsed,
  validateBackup,
  mergeBackup,
  sliceEntries,
  fresh,
  wallTime,
  manualSegments,
} from "../src/domain.js";
import { upgradeState, parseThresholds } from "../src/billing-model.js";
import {
  centsFor,
  workRows,
  summarize,
  budgetState,
  projectTimes,
  buildClientReport,
  reportHtml,
  reportCsv,
  exactDuration,
} from "../src/billing.js";
const opts = {
  projectId: "demo-project",
  from: "2026-09-14",
  to: "2026-09-16",
};
test("demo reconciles total, billable, internal, unclassified, rows and cents", () => {
  const state = billingDemo(),
    summary = summarize(workRows(state.entries)),
    r = buildClientReport(state, opts);
  assert.deepEqual(summary, {
    totalMs: 4.25 * HOUR,
    billableMs: 3.5 * HOUR,
    internalMs: 0.5 * HOUR,
    unclassifiedMs: 0.25 * HOUR,
    cents: 62500,
    unpricedMs: 0,
    fixedMs: 0,
  });
  assert.deepEqual(
    r.rows.map((r) => r.cents),
    [22500, 10000, 10000, 20000],
  );
  assert.equal(
    r.cents,
    r.rows.reduce((s, r) => s + r.cents, 0),
  );
});
test("millisecond time is not rounded per segment; pauses aggregate before half-up money rounding", () => {
  const e = billingDemo().entries[0];
  e.pricing.amount = 90;
  const a = e.segments[0].start;
  e.segments = [
    { start: a, end: a + 200 },
    { start: a + 1000, end: a + 1200 },
  ];
  const rows = workRows([e]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ms, 400);
  assert.equal(rows[0].cents, 1);
  assert.equal(centsFor(200, 90), 1);
  assert.equal(centsFor(199, 90), 0);
  assert.equal(centsFor(HOUR, 1.005), 101);
  assert.equal(centsFor(1000, 1e-7), 0);
  assert.equal(exactDuration(400), "00:00:00.400");
});
test("hundreds of tiny line amounts reconcile exactly without upward time rounding", () => {
  const e = billingDemo().entries[0],
    a = e.segments[0].start;
  const entries = Array.from({ length: 500 }, (_, i) => ({
    ...e,
    id: "tiny-" + i,
    segments: [{ start: a + i * 1000, end: a + i * 1000 + 100 }],
    pricing: { type: "hourly", amount: 150 },
  }));
  const rows = workRows(entries),
    s = summarize(rows);
  assert.equal(s.totalMs, 50000);
  assert.equal(s.cents, 0);
});
test("midnight and inclusive Israel date filters include only intersecting time and rate", () => {
  const state = billingDemo();
  state.entries = [state.entries[1]];
  const r = buildClientReport(state, { ...opts, from: "2026-09-16" });
  assert.equal(r.totalMs, HOUR / 2);
  assert.equal(r.cents, 10000);
  assert.equal(r.rows[0].date, "2026-09-16");
  assert.equal(
    buildClientReport(state, { ...opts, to: "2026-09-14" }).rows.length,
    0,
  );
  assert.throws(() =>
    buildClientReport(state, { ...opts, from: "2026-09-17" }),
  );
  assert.throws(() => buildClientReport(state, { ...opts, from: "" }));
});
test("DST transition uses real elapsed hours, independent of host timezone", () => {
  const state = billingDemo();
  state.entries = [
    {
      ...state.entries[0],
      segments: manualSegments({
        date: "2026-03-27",
        start: "00:00",
        endDate: "2026-03-28",
        end: "00:00",
        mode: "clock",
      }),
    },
  ];
  const r = buildClientReport(state, {
    ...opts,
    from: "2026-03-27",
    to: "2026-03-27",
  });
  assert.equal(r.totalMs, 23 * HOUR);
  assert.equal(r.cents, 345000);
});
test("active and paused timers are excluded from reports without being mutated, but included in budgets", () => {
  const s = billingDemo(),
    start = wallTime("2026-09-16", "15:00");
  timerAction(
    s,
    {
      type: "start",
      projectId: "demo-project",
      id: "live",
      expected: null,
      billingStatus: "billable",
    },
    start,
  );
  const before = structuredClone(s);
  buildClientReport(s, opts);
  assert.deepEqual(s, before);
  assert.equal(projectTimes(s, start + HOUR).get("demo-project"), 5.25 * HOUR);
  timerAction(s, { type: "pause", expected: "live" }, start + HOUR);
  assert.equal(buildClientReport(s, opts).cents, 62500);
  assert.equal(elapsed(s.timer, start + 2 * HOUR), HOUR);
  timerAction(s, { type: "stop", expected: "live" }, start + 2 * HOUR);
  assert.equal(buildClientReport(s, opts).cents, 82500);
});
test("rate changes preserve saved and active prices and new sessions use the new price", () => {
  const s = billingDemo(),
    start = wallTime("2026-09-16", "15:00");
  timerAction(
    s,
    {
      type: "start",
      projectId: "demo-project",
      id: "live",
      expected: null,
      billingStatus: "billable",
    },
    start,
  );
  s.projects[0].price = 350;
  timerAction(s, { type: "stop", expected: "live" }, start + HOUR);
  assert.equal(s.entries.at(-1).pricing.amount, 200);
  assert.equal(s.entries[0].pricing.amount, 150);
  timerAction(
    s,
    { type: "start", projectId: "demo-project", id: "new", expected: null },
    start + 2 * HOUR,
  );
  assert.equal(s.timer.pricing.amount, 350);
  assert.equal(s.timer.billingStatus, "unclassified");
});
test("missing, zero and exceeded budgets never divide by zero; all statuses and deletions count", () => {
  const s = billingDemo(),
    p = s.projects[0];
  assert.equal(budgetState({ ...p, goal: null }, HOUR).remainingMs, null);
  assert.deepEqual(budgetState({ ...p, goal: 0 }, 0).reached, []);
  assert.equal(budgetState({ ...p, goal: 0 }, HOUR).percentage, null);
  assert.equal(budgetState({ ...p, goal: 0 }, HOUR).overMs, HOUR);
  assert.deepEqual(
    budgetState({ ...p, goal: 0, budgetAlerts: [] }, HOUR).reached,
    [],
  );
  assert.deepEqual(budgetState(p, 4.25 * HOUR).reached, [80]);
  assert.equal(budgetState(p, 6 * HOUR).overMs, HOUR);
  s.entries.splice(0, 1);
  assert.deepEqual(budgetState(p, projectTimes(s, 0).get(p.id)).reached, []);
  assert.deepEqual(parseThresholds("100, 80, 80, 120"), [80, 100, 120]);
  assert.deepEqual(parseThresholds(""), []);
  for (const t of ["0", "Infinity", "1,", "-3", "1001"])
    assert.throws(() => parseThresholds(t));
});
test("legacy upgrades preserve timestamps, rate snapshots, goal and all unknown fields, idempotently", () => {
  const s = billingDemo();
  s.version = 1;
  s.extra = { kept: true };
  delete s.projects[0].budgetAlerts;
  for (const e of s.entries) {
    delete e.billingStatus;
    delete e.internalNotes;
  }
  const original = structuredClone(s),
    upgraded = validateBackup(s);
  assert.deepEqual(s, original);
  assert.equal(upgraded.version, 2);
  assert.equal(upgraded.projects[0].goal, 5);
  for (let i = 0; i < s.entries.length; i++) {
    assert.deepEqual(upgraded.entries[i].segments, s.entries[i].segments);
    assert.deepEqual(upgraded.entries[i].pricing, s.entries[i].pricing);
    assert.equal(upgraded.entries[i].billingStatus, "unclassified");
  }
  assert.deepEqual(upgradeState(structuredClone(upgraded)), upgraded);
  assert.deepEqual(upgraded.extra, { kept: true });
  const target = fresh();
  mergeBackup(target, original);
  mergeBackup(target, original);
  assert.equal(target.entries.length, 5);
});
test("invalid new fields reject an import atomically; a zero budget is valid", () => {
  for (const transform of [
    (s) => (s.projects[0].goal = -1),
    (s) => (s.projects[0].budgetAlerts = [NaN]),
    (s) => (s.projects[0].budgetAlerts = [0]),
    (s) => (s.entries[0].billingStatus = "yes"),
    (s) => (s.entries[0].internalNotes = {}),
    (s) => (s.version = 3),
  ]) {
    const s = billingDemo();
    transform(s);
    const target = fresh();
    assert.throws(() => mergeBackup(target, s));
    assert.deepEqual(target, fresh());
  }
  const s = billingDemo();
  s.projects[0].goal = 0;
  assert.equal(validateBackup(s).projects[0].goal, 0);
});
test("client exports omit private fields, internal/unclassified descriptions, and hidden rates structurally", () => {
  const state = billingDemo(),
    plain = buildClientReport(state, { ...opts, showRates: false });
  assert.equal("cents" in plain, false);
  assert.equal("rate" in plain.rows[0], false);
  for (const report of [buildClientReport(state, opts), plain])
    for (const output of [
      JSON.stringify(report),
      reportHtml(report),
      reportCsv(report),
    ]) {
      assert.ok(!output.includes("הערה פרטית"));
      assert.ok(!output.includes("בדיקה פנימית"));
      assert.ok(!output.includes("בירור שטרם"));
    }
  const html = reportHtml(plain),
    csv = reportCsv(plain);
  for (const output of [html, csv]) {
    assert.ok(!output.includes("150"));
    assert.ok(!output.includes("200"));
    assert.ok(!output.includes("625.00"));
  }
  assert.ok(!html.includes("תעריף"));
  assert.ok(!csv.includes("סכום"));
  assert.ok(reportHtml(buildClientReport(state, opts)).includes("625.00"));
});
test("HTML escapes hostile text, CSV resists formulas, and totals equal exported lines", () => {
  const s = billingDemo();
  s.entries[0].description = '=SUM(1,2) <script>alert(1)</script> "שלום"';
  const r = buildClientReport(s, opts),
    html = reportHtml(r),
    csv = reportCsv(r);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes('dir="rtl"'));
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.includes("\"'=SUM(1,2)"));
  assert.ok(csv.endsWith('"625.00"'));
});
test("fixed fees and missing rates count billable time without inventing a per-entry charge", () => {
  const s = billingDemo();
  s.entries[0].pricing = { type: "fixed", amount: 5000 };
  s.entries[1].pricing = { type: "none", amount: null };
  const summary = summarize(workRows(s.entries));
  assert.equal(summary.fixedMs, 1.5 * HOUR);
  assert.equal(summary.unpricedMs, HOUR);
  assert.equal(summary.cents, 20000);
  const html = reportHtml(buildClientReport(s, opts));
  assert.ok(html.includes("מחיר כולל"));
  assert.ok(html.includes("לא הוגדר"));
  assert.ok(!html.includes("5000"));
});
test("report project scope excludes other client entries", () => {
  const s = billingDemo();
  s.entries.push({
    ...s.entries[0],
    id: "other",
    projectId: "other-project",
    description: "other client secret",
  });
  assert.equal(buildClientReport(s, opts).rows.length, 4);
  assert.ok(
    !reportHtml(buildClientReport(s, opts)).includes("other client secret"),
  );
  assert.throws(() => buildClientReport(s, { ...opts, projectId: "" }));
});
