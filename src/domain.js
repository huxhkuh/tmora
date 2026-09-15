import { tr, locale } from "./i18n.js";
import { validateTasks } from "./tasks.js";
import { checkBackupTree } from "./backup-safety.js";
export const TZ = "Asia/Jerusalem";
export const HOUR = 3600000;
export const fresh = () => ({
  version: 1,
  clients: [],
  projects: [],
  tasks: [],
  entries: [],
  timer: null,
  revision: 0,
});
export const uid = () => crypto.randomUUID();
export function parts(ts) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(ts)
      .map((p) => [p.type, p.value]),
  );
}
export function dayKey(ts) {
  const p = parts(ts);
  return `${p.year}-${p.month}-${p.day}`;
}
export function clockKey(ts) {
  const p = parts(ts);
  return `${p.hour}:${p.minute}:${p.second}`;
}
export function addDays(day, n) {
  return new Date(Date.parse(day + "T12:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function weekKey(day) {
  return addDays(day, -new Date(day + "T12:00:00Z").getUTCDay());
}
// Explicit Israel wall-clock conversion; reject missing / ambiguous DST times.
export function wallTime(day, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}(:\d{2})?$/.test(time))
    throw Error(tr("יש להזין תאריך ושעה תקינים."));
  const normalized = time.length === 5 ? time + ":00" : time;
  if (day < "1970-01-01" || day > "2100-12-31")
    throw Error(tr("יש לבחור תאריך בין 1970 ל־2100."));
  const naive = Date.parse(`${day}T${normalized}Z`);
  const matches = [2, 3]
    .map((h) => naive - h * HOUR)
    .filter(
      (t) =>
        Number.isFinite(t) && dayKey(t) === day && clockKey(t) === normalized,
    );
  if (matches.length !== 1)
    throw Error(
      matches.length
        ? tr(
            "השעה מופיעה פעמיים במעבר לשעון חורף. יש לבחור שעה מחוץ לשעת המעבר.",
          )
        : tr("התאריך או השעה אינם קיימים בשעון ישראל."),
    );
  return matches[0];
}
export const duration = (segments) =>
  segments.reduce((n, s) => n + s.end - s.start, 0);
export const timerSegments = (t, now) =>
  t
    ? [
        ...t.segments,
        ...(t.runningSince !== null
          ? [{ start: t.runningSince, end: Math.max(t.runningSince, now) }]
          : []),
      ]
    : [];
export const elapsed = (t, now = Date.now()) => duration(timerSegments(t, now));
// Active projects, most recently worked on first. Read the entries once: a
// comparator that scans them rescans everything per comparison, and spreading
// one project's entries into Math.max throws above roughly 125k of them.
export function recentProjects(state, limit) {
  const lastEnd = new Map();
  for (const e of state.entries) {
    const end = e.segments.at(-1).end;
    if (end > (lastEnd.get(e.projectId) ?? 0)) lastEnd.set(e.projectId, end);
  }
  return state.projects
    .filter((p) => !p.archived)
    .sort((a, b) => (lastEnd.get(b.id) ?? 0) - (lastEnd.get(a.id) ?? 0))
    .slice(0, limit);
}
export function hms(ms) {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}
export const hours = (ms) =>
  (ms / HOUR).toLocaleString(locale(), { maximumFractionDigits: 2 });
export const money = (n) =>
  n.toLocaleString(locale(), {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  });
export const pricing = (p) => ({
  type: p.priceType,
  amount: p.price === null ? null : Number(p.price),
});
export const value = (e) =>
  e.pricing.type === "hourly"
    ? (duration(e.segments) / HOUR) * e.pricing.amount
    : 0;
export function stopTimer(s, now, expected) {
  if (!s.timer || (expected && s.timer.id !== expected)) return;
  const t = s.timer,
    segments = timerSegments(t, now).filter((x) => x.end > x.start);
  if (segments.length && !s.entries.some((e) => e.id === t.id))
    s.entries.push({
      id: t.id,
      projectId: t.projectId,
      description: t.description,
      segments,
      pricing: t.pricing,
      createdAt: t.createdAt,
    });
  s.timer = null;
  s.lastStoppedAt = now;
}
export function timerAction(s, action, now = Date.now()) {
  const t = s.timer;
  if (action.type === "start") {
    if (s.lastStoppedAt && now - s.lastStoppedAt < 600) return;
    // Compare-and-swap against the timer observed by the initiating UI.
    if ((t?.id ?? null) !== (action.expected ?? null)) return;
    if (t?.projectId === action.projectId) return;
    const p = s.projects.find((p) => p.id === action.projectId && !p.archived);
    if (!p) throw Error(tr("יש לבחור פרויקט פעיל."));
    stopTimer(s, now);
    s.timer = {
      id: action.id || uid(),
      projectId: p.id,
      description: action.description || "",
      pricing: pricing(p),
      segments: [],
      runningSince: now,
      createdAt: now,
    };
  } else {
    if (!t || t.id !== action.expected) return;
    if (action.type === "pause" && t.runningSince !== null) {
      if (now > t.runningSince)
        t.segments.push({ start: t.runningSince, end: now });
      t.runningSince = null;
    }
    if (action.type === "resume" && t.runningSince === null)
      t.runningSince = now;
    if (action.type === "stop") stopTimer(s, now, action.expected);
  }
}
export function sliceEntries(entries, from, to) {
  const start = wallTime(from, "00:00"),
    end = wallTime(addDays(to, 1), "00:00");
  return entries
    .map((e) => ({
      ...e,
      segments: e.segments
        .map((s) => ({
          start: Math.max(start, s.start),
          end: Math.min(end, s.end),
        }))
        .filter((s) => s.end > s.start),
    }))
    .filter((e) => e.segments.length);
}
export function daily(entries) {
  const result = [];
  for (const e of entries)
    for (const seg of e.segments) {
      let cursor = seg.start;
      while (cursor < seg.end) {
        const day = dayKey(cursor),
          end = Math.min(seg.end, wallTime(addDays(day, 1), "00:00"));
        result.push({ ...e, day, segments: [{ start: cursor, end }] });
        cursor = end;
      }
    }
  return result;
}
export function overlap(entries, segments, except) {
  return entries.some(
    (e) =>
      e.id !== except &&
      e.segments.some((a) =>
        segments.some((b) => a.start < b.end && b.start < a.end),
      ),
  );
}
export function manualSegments({ date, start, end, endDate, minutes, mode }) {
  const a = wallTime(date, start);
  const b =
    mode === "duration"
      ? a + Number(minutes) * 60000
      : wallTime(endDate || date, end);
  if (!Number.isFinite(b) || b <= a)
    throw Error(
      tr(
        "שעת הסיום חייבת להיות אחרי ההתחלה. בעבודה שחוצה חצות, בחר את יום הסיום הבא.",
      ),
    );
  if (b - a > 366 * 24 * HOUR)
    throw Error(tr("משך הרישום גדול משנה. יש לבדוק את התאריכים."));
  return [{ start: a, end: b }];
}
const isStr = (x) => typeof x === "string" && x.length <= 10000;
const validId = (x) => isStr(x) && x.length > 0 && x.length <= 100;
const finite = (x) => typeof x === "number" && Number.isFinite(x);
const validPrice = (p) =>
  p &&
  ["none", "hourly", "fixed"].includes(p.type) &&
  (p.type === "none" ? p.amount === null : finite(p.amount) && p.amount >= 0);
export function validateBackup(input) {
  checkBackupTree(input);
  const s = structuredClone(input);
  if (
    !s ||
    s.version !== 1 ||
    !["clients", "projects", "entries"].every(
      (k) => Array.isArray(s[k]) && s[k].length < 100000,
    )
  )
    throw Error(tr("קובץ הגיבוי אינו בפורמט נתמך."));
  for (const k of ["clients", "projects", "entries"])
    if (
      s[k].some((x) => !x || typeof x !== "object" || Array.isArray(x)) ||
      new Set(s[k].map((x) => x.id)).size !== s[k].length
    )
      throw Error(tr("הגיבוי מכיל מזהים כפולים."));
  if (!s.clients.every((c) => validId(c.id) && isStr(c.name) && c.name.trim()))
    throw Error(tr("פרטי הלקוחות בגיבוי אינם תקינים."));
  const clients = new Set(s.clients.map((c) => c.id));
  const projects = new Set(s.projects.map((p) => p.id));
  if (
    !s.projects.every(
      (p) =>
        validId(p.id) &&
        isStr(p.name) &&
        p.name.trim() &&
        clients.has(p.clientId) &&
        /^#[0-9a-f]{6}$/i.test(p.color) &&
        isStr(p.description) &&
        typeof p.archived === "boolean" &&
        validPrice({ type: p.priceType, amount: p.price }) &&
        (p.goal === null || (finite(p.goal) && p.goal > 0)),
    )
  )
    throw Error(tr("פרטי הפרויקטים בגיבוי אינם תקינים."));
  s.tasks = validateTasks(s.tasks, s.projects);
  const validSegments = (ss) =>
    Array.isArray(ss) &&
    ss.length < 100000 &&
    ss.every(
      (a, i) =>
        a &&
        finite(a.start) &&
        finite(a.end) &&
        a.start >= 0 &&
        a.end > a.start &&
        a.end < 4102444800000 &&
        a.end - a.start <= 366 * 24 * HOUR &&
        (i === 0 || a.start >= ss[i - 1].end),
    );
  const common = (e) =>
    e &&
    validId(e.id) &&
    projects.has(e.projectId) &&
    isStr(e.description) &&
    validPrice(e.pricing) &&
    finite(e.createdAt) &&
    e.createdAt >= 0 &&
    e.createdAt < 4102444800000 &&
    validSegments(e.segments);
  if (!s.entries.every((e) => common(e) && e.segments.length))
    throw Error(tr("רישומי הזמן בגיבוי אינם תקינים."));
  if (
    s.timer !== null &&
    (!common(s.timer) ||
      !(
        s.timer.runningSince === null ||
        (finite(s.timer.runningSince) &&
          s.timer.runningSince < 4102444800000 &&
          s.timer.runningSince >= s.timer.createdAt &&
          s.timer.runningSince >= (s.timer.segments.at(-1)?.end ?? 0))
      ) ||
      s.entries.some((e) => e.id === s.timer.id))
  )
    throw Error(tr("הטיימר בגיבוי אינו תקין."));
  return s;
}
export function mergeBackup(s, input) {
  const backup = validateBackup(input);
  s.tasks ??= [];
  // Preserve local records on ID conflicts. A backup cannot restart a running timer.
  for (const k of ["clients", "projects", "entries", "tasks"]) {
    const existing = new Set(s[k].map((x) => x.id));
    for (const x of backup[k])
      if (!existing.has(x.id) && !(k === "entries" && s.timer?.id === x.id))
        s[k].push(x);
  }
  if (
    backup.timer &&
    !s.timer &&
    !s.entries.some((e) => e.id === backup.timer.id)
  )
    s.timer = { ...backup.timer, runningSince: null };
  return s;
}
export function csv(entries, s) {
  const safe = (x) =>
    '"' +
    String(x ?? "")
      .replace(/^(?:\s*[=+@\-]|[\t\r\n])/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const rows = [
    [
      tr("תאריך"),
      tr("לקוח"),
      tr("פרויקט"),
      tr("תיאור"),
      tr("התחלה \u2014 שעון ישראל"),
      tr("סיום \u2014 שעון ישראל"),
      tr("שעות מדויקות"),
      tr("סוג תמחור"),
      tr("תעריף שעתי שנשמר"),
      tr("שווי שעתי \u2014 ₪"),
    ],
  ];

  for (const e of daily(entries)) {
    const p = s.projects.find((p) => p.id === e.projectId),
      c = s.clients.find((c) => c.id === p?.clientId);
    rows.push([
      e.day,
      c?.name,
      p?.name,
      e.description,
      clockKey(e.segments[0].start),
      clockKey(e.segments[0].end),
      duration(e.segments) / HOUR,
      { none: tr("ללא מחיר"), hourly: tr("שעתי"), fixed: tr("מחיר כולל") }[
        e.pricing.type
      ],
      e.pricing.type === "hourly" ? e.pricing.amount : "",
      e.pricing.type === "hourly" ? value(e) : "",
    ]);
  }
  return "\uFEFF" + rows.map((r) => r.map(safe).join(",")).join("\r\n");
}
