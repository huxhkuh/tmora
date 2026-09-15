import test from "node:test";
import assert from "node:assert/strict";
import {
  fresh,
  HOUR,
  wallTime,
  dayKey,
  weekKey,
  duration,
  elapsed,
  timerAction,
  sliceEntries,
  daily,
  manualSegments,
  value,
  pricing,
  validateBackup,
  mergeBackup,
  csv,
  overlap,
  recentProjects,
} from "../src/domain.js";
const fixture = () => ({
  ...fresh(),
  clients: [{ id: "c1", name: "לקוח" }],
  projects: [
    {
      id: "p1",
      name: "אתר",
      clientId: "c1",
      color: "#b94f2a",
      description: "",
      archived: false,
      priceType: "hourly",
      price: 250,
      goal: null,
    },
    {
      id: "p2",
      name: "מותג",
      clientId: "c1",
      color: "#657759",
      description: "",
      archived: false,
      priceType: "fixed",
      price: 5000,
      goal: 20,
    },
  ],
});
const start = (s, ts = 1000) =>
  timerAction(
    s,
    { type: "start", projectId: "p1", expected: null, id: "t1" },
    ts,
  );
test("timer survives serialization, refresh and sleep; pauses excluded", () => {
  let s = fixture();
  start(s);
  s = JSON.parse(JSON.stringify(s));
  assert.equal(elapsed(s.timer, 1000 + HOUR), HOUR);
  timerAction(s, { type: "pause", expected: "t1" }, 1000 + HOUR);
  assert.equal(elapsed(s.timer, 10 * HOUR), HOUR);
  timerAction(s, { type: "resume", expected: "t1" }, 10 * HOUR);
  timerAction(s, { type: "stop", expected: "t1" }, 11 * HOUR);
  assert.equal(duration(s.entries[0].segments), 2 * HOUR);
  assert.equal(s.timer, null);
});
test("double start and stop cannot duplicate entries", () => {
  const s = fixture();
  start(s);
  start(s, 2000);
  assert.equal(s.timer.createdAt, 1000);
  timerAction(s, { type: "stop", expected: "t1" }, 4000);
  timerAction(s, { type: "stop", expected: "t1" }, 5000);
  assert.equal(s.entries.length, 1);
  assert.equal(duration(s.entries[0].segments), 3000);
});
test("a double-click cannot restart the timer when the stop control becomes start", () => {
  const s = fixture();
  start(s);
  timerAction(s, { type: "stop", expected: "t1" }, 4000);
  timerAction(s, { type: "start", projectId: "p1", expected: null }, 4100);
  assert.equal(s.timer, null);
  timerAction(s, { type: "start", projectId: "p1", expected: null }, 4700);
  assert.ok(s.timer);
});
test("concurrent project switches are compare-and-swap; stale stop cannot stop winner", () => {
  const s = fixture();
  start(s);
  timerAction(
    s,
    { type: "start", projectId: "p2", expected: "t1", id: "t2" },
    3000,
  );
  timerAction(
    s,
    { type: "start", projectId: "p1", expected: "t1", id: "t3" },
    4000,
  );
  timerAction(s, { type: "stop", expected: "t1" }, 5000);
  assert.equal(s.entries.length, 1);
  assert.equal(duration(s.entries[0].segments), 2000);
  assert.equal(s.timer.id, "t2");
});
test("saved and running prices remain unchanged on project rate change", () => {
  const s = fixture();
  start(s, 0);
  s.projects[0].price = 1000;
  timerAction(s, { type: "stop", expected: "t1" }, HOUR);
  assert.equal(value(s.entries[0]), 250);
  assert.equal(pricing(s.projects[0]).amount, 1000);
  assert.equal(value({ ...s.entries[0], pricing: pricing(s.projects[1]) }), 0);
});
test("midnight work is split exactly by Israel day and filtered by intersection", () => {
  const ss = manualSegments({
    date: "2026-09-06",
    start: "23:30",
    endDate: "2026-09-07",
    end: "01:30",
    mode: "clock",
  });
  assert.equal(duration(ss), 2 * HOUR);
  const e = { id: "e", segments: ss, pricing: { type: "hourly", amount: 200 } };
  const rows = daily([e]);
  assert.deepEqual(
    rows.map((e) => duration(e.segments)),
    [0.5 * HOUR, 1.5 * HOUR],
  );
  assert.equal(
    duration(sliceEntries([e], "2026-09-07", "2026-09-07")[0].segments),
    1.5 * HOUR,
  );
  assert.equal(rows[0].day, "2026-09-06");
});
test("duration input crosses midnight and rejects negatives", () => {
  const s = manualSegments({
    date: "2026-09-06",
    start: "23:30",
    mode: "duration",
    minutes: 120,
  });
  assert.equal(dayKey(s[0].end), "2026-09-07");
  assert.throws(() =>
    manualSegments({
      date: "2026-09-06",
      start: "12:00",
      mode: "duration",
      minutes: -5,
    }),
  );
  assert.throws(() =>
    manualSegments({
      date: "2026-09-06",
      start: "12:00",
      mode: "clock",
      endDate: "2026-09-06",
      end: "11:00",
    }),
  );
});
test("Israel timezone independent of host; week begins Sunday", () => {
  assert.equal(
    new Date(wallTime("2026-09-07", "09:00")).toISOString(),
    "2026-09-07T06:00:00.000Z",
  );
  assert.equal(
    new Date(wallTime("2026-01-07", "09:00")).toISOString(),
    "2026-01-07T07:00:00.000Z",
  );
  assert.equal(weekKey("2026-09-07"), "2026-09-06");
  assert.equal(weekKey("2026-09-06"), "2026-09-06");
});
test("DST day length and ambiguous/nonexistent local time validation", () => {
  assert.equal(
    wallTime("2026-03-28", "00:00") - wallTime("2026-03-27", "00:00"),
    23 * HOUR,
  );
  assert.throws(() => wallTime("2026-03-27", "02:30"));
  assert.throws(() => wallTime("2026-10-25", "01:30"));
  assert.throws(() => wallTime("2026-02-31", "12:00"));
});
test("overlap detects intersections and ignores adjacency and edited ID", () => {
  const es = [{ id: "a", segments: [{ start: 1000, end: 2000 }] }];
  assert.equal(overlap(es, [{ start: 1500, end: 3000 }]), true);
  assert.equal(overlap(es, [{ start: 2000, end: 3000 }]), false);
  assert.equal(overlap(es, [{ start: 1500, end: 3000 }], "a"), false);
});
test("backup validates then merges idempotently; local changes win", () => {
  const s = fixture();
  start(s);
  timerAction(s, { type: "stop", expected: "t1" }, 4000);
  const backup = JSON.parse(JSON.stringify(s));
  assert.deepEqual(validateBackup(backup), backup);
  const target = fresh();
  mergeBackup(target, backup);
  target.projects[0].name = "עודכן";
  mergeBackup(target, backup);
  assert.equal(target.entries.length, 1);
  assert.equal(target.projects[0].name, "עודכן");
  assert.equal(target.clients.length, 1);
});
test("invalid backups rejected without mutation", () => {
  const s = fixture();
  for (const bad of [
    null,
    {},
    { ...s, version: 2 },
    { ...s, clients: [s.clients[0], s.clients[0]] },
    { ...s, projects: [{ ...s.projects[0], clientId: "missing" }] },
    {
      ...s,
      entries: [
        {
          id: "x",
          projectId: "p1",
          description: "",
          createdAt: 0,
          pricing: { type: "hourly", amount: 1 },
          segments: [{ start: 2, end: 1 }],
        },
      ],
    },
  ]) {
    const target = fresh();
    assert.throws(() => mergeBackup(target, bad));
    assert.deepEqual(target, fresh());
  }
});
test("imported timer is paused; repeated import cannot resurrect a saved session", () => {
  const backup = fixture();
  start(backup);
  timerAction(backup, { type: "pause", expected: "t1" }, 3000);
  const target = fresh();
  mergeBackup(target, backup);
  assert.equal(target.timer.runningSince, null);
  timerAction(target, { type: "stop", expected: "t1" }, 9000);
  mergeBackup(target, backup);
  assert.equal(target.timer, null);
  assert.equal(target.entries.length, 1);
});
test("CSV is Hebrew BOM/CRLF and escaped, protects formulas, keeps exact hours", () => {
  const s = fixture();
  s.entries = [
    {
      id: "e",
      projectId: "p1",
      description: '=SUM(1,2) "שלום"',
      pricing: { type: "hourly", amount: 250 },
      segments: [
        {
          start: wallTime("2026-09-07", "09:00"),
          end: wallTime("2026-09-07", "09:00") + 1000,
        },
      ],
    },
  ];
  const out = csv(s.entries, s);
  assert.equal(out.charCodeAt(0), 0xfeff);
  assert.ok(out.includes("\r\n"));
  assert.ok(out.includes('\'=SUM(1,2) ""שלום""'));
  assert.ok(out.includes(String(1 / 3600)));
});
test("recent projects order by last saved work, skip the archive and any history size", () => {
  const s = fixture();
  s.projects.push(
    { ...s.projects[0], id: "p3", name: "ארכיון", archived: true },
    { ...s.projects[0], id: "p4", name: "חדש" },
  );
  const entry = (id, projectId, day) => ({
    id,
    projectId,
    segments: [{ start: wallTime(day, "09:00"), end: wallTime(day, "10:00") }],
  });
  s.entries = [
    entry("e1", "p1", "2026-09-01"),
    entry("e2", "p2", "2026-09-08"),
    entry("e3", "p3", "2026-09-09"),
    entry("e4", "p1", "2026-09-07"),
  ];
  // p2 worked last, then p1; p4 never worked and the archived p3 is excluded.
  assert.deepEqual(
    recentProjects(s, 4).map((p) => p.id),
    ["p2", "p1", "p4"],
  );
  assert.deepEqual(
    recentProjects(s, 2).map((p) => p.id),
    ["p2", "p1"],
  );
  assert.deepEqual(
    s.projects.map((p) => p.id),
    ["p1", "p2", "p3", "p4"],
  );
  // One project may hold more entries than a spread can pass as arguments.
  const many = entry("m", "p4", "2026-09-10");
  s.entries = Array.from({ length: 150000 }, () => many);
  assert.equal(recentProjects(s, 1)[0].id, "p4");
});
