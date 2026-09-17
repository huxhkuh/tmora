import { tr } from "./i18n.js";
import React, { useState } from "react";
import { Button, Field, ProjectOptions } from "./ui.jsx";
import {
  BILLING_STATUSES,
  billingStatus,
  parseThresholds,
} from "./billing-model.js";
import { statusLabel } from "./billing.js";
import {
  uid,
  dayKey,
  clockKey,
  addDays,
  manualSegments,
  overlap,
  pricing,
  timerSegments,
  HOUR,
  duration,
} from "./domain.js";
function useSubmit(mutate, close) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return {
    error,
    busy,
    submit: async (fn) => {
      setBusy(true);
      setError("");
      try {
        await mutate(fn);
        close(true);
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    },
  };
}
function Footer({ error, busy, close, label = tr("שמירה") }) {
  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <footer className="form-footer">
        <Button kind="primary" type="submit" disabled={busy}>
          {busy ? tr("שומר\u2026") : label}
        </Button>
        <Button type="button" onClick={close}>
          {tr("ביטול")}
        </Button>
      </footer>
    </>
  );
}
function checkConcurrent(current, original) {
  if (original && JSON.stringify(current) !== JSON.stringify(original))
    throw Error(tr("הרשומה עודכנה בלשונית אחרת. יש לסגור ולפתוח אותה מחדש."));
}
export function ClientForm({ item, mutate, close }) {
  const [name, setName] = useState(item?.name || "");
  const ctl = useSubmit(mutate, close);
  const [id] = useState(item?.id || uid());
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        ctl.submit((s) => {
          if (!name.trim()) throw Error(tr("יש להזין שם לקוח."));
          const old = s.clients.find((c) => c.id === id);
          checkConcurrent(old, item);
          const c = { id, name: name.trim() };
          if (old) Object.assign(old, c);
          else if (!s.clients.some((c) => c.id === id)) s.clients.push(c);
        });
      }}
    >
      <Field label={tr("שם הלקוח")}>
        <input
          autoFocus
          required
          maxLength={150}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={tr("למשל, סטודיו קדם")}
        />
      </Field>
      <Footer {...ctl} close={close} />
    </form>
  );
}
export function ProjectForm({ item, state, mutate, close }) {
  const [thresholds, setThresholds] = useState(
    (item?.budgetAlerts ?? [80, 100]).join(", "),
  );
  const [v, setV] = useState(
    item || {
      id: uid(),
      name: "",
      clientId: state.clients[0]?.id || "",
      color: "#b94f2a",
      description: "",
      archived: false,
      priceType: "none",
      price: null,
      goal: null,
    },
  );
  const set = (k, x) => setV((v) => ({ ...v, [k]: x }));
  const ctl = useSubmit(mutate, close);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        ctl.submit((s) => {
          if (!v.name.trim() || !s.clients.some((c) => c.id === v.clientId))
            throw Error(tr("יש למלא שם פרויקט ולבחור לקוח."));
          if (
            v.priceType !== "none" &&
            (!Number.isFinite(Number(v.price)) ||
              v.price === null ||
              v.price === "" ||
              Number(v.price) < 0)
          )
            throw Error(tr("יש להזין מחיר תקין."));
          if (
            v.goal !== null &&
            (!Number.isFinite(Number(v.goal)) || Number(v.goal) < 0)
          )
            throw Error(tr("תקציב השעות צריך להיות אפס או מספר חיובי."));
          if (v.archived && s.timer?.projectId === v.id)
            throw Error(tr("יש לעצור ולשמור את הטיימר לפני העברה לארכיון."));
          const old = s.projects.find((p) => p.id === v.id);
          checkConcurrent(old, item);
          const p = {
            ...v,
            name: v.name.trim(),
            price: v.priceType === "none" ? null : Number(v.price),
            goal: v.goal === null ? null : Number(v.goal),
            budgetAlerts: parseThresholds(thresholds),
          };
          if (old) Object.assign(old, p);
          else s.projects.push(p);
        });
      }}
    >
      <Field label={tr("שם הפרויקט")}>
        <input
          autoFocus
          required
          maxLength={150}
          value={v.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder={tr("על מה נעבוד?")}
        />
      </Field>
      <div className="form-grid">
        <Field label={tr("לקוח")}>
          <select
            required
            value={v.clientId}
            onChange={(e) => set("clientId", e.target.value)}
          >
            <option value="">{tr("בחירת לקוח")}</option>
            {state.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tr("צבע מזהה")}>
          <input
            type="color"
            value={v.color}
            onChange={(e) => set("color", e.target.value)}
          />
        </Field>
      </div>
      <Field label={tr("תיאור קצר (לא חובה)")}>
        <textarea
          maxLength={1000}
          value={v.description}
          onChange={(e) => set("description", e.target.value)}
          rows={2}
        />
      </Field>
      <div className="form-grid">
        <Field label={tr("תמחור")}>
          <select
            value={v.priceType}
            onChange={(e) => set("priceType", e.target.value)}
          >
            <option value="none">{tr("ללא מחיר")}</option>
            <option value="hourly">{tr("תעריף שעתי")}</option>
            <option value="fixed">{tr("מחיר כולל לפרויקט")}</option>
          </select>
        </Field>
        {v.priceType !== "none" && (
          <Field
            label={
              v.priceType === "hourly"
                ? tr("תעריף לשעה (₪)")
                : tr("מחיר כולל (₪)")
            }
          >
            <input
              type="number"
              min="0"
              max="1000000000"
              step="0.01"
              required
              value={v.price ?? ""}
              onChange={(e) => set("price", e.target.value)}
            />
          </Field>
        )}
      </div>
      <p className="note">
        {tr(
          "תעריף חדש חל על רישומים חדשים בלבד. התעריף של מדידה שכבר התחילה נשמר.",
        )}
      </p>
      <Field
        label={tr("תקציב שעות (לא חובה)")}
        hint={tr(
          "ריק = ללא תקציב. אפס = כל זמן עבודה הוא חריגה. התקציב כולל גם זמן פנימי וטיימר פעיל.",
        )}
      >
        <input
          type="number"
          min="0"
          max="100000"
          step="0.01"
          value={v.goal ?? ""}
          onChange={(e) =>
            set("goal", e.target.value === "" ? null : e.target.value)
          }
        />
      </Field>
      <Field
        label={tr("התראות ניצול באחוזים")}
        hint={tr(
          "למשל 80, 100. ניתן להוסיף ספים מעל 100 או להשאיר ריק לביטול ההתראות.",
        )}
      >
        <input
          value={thresholds}
          onChange={(e) => setThresholds(e.target.value)}
          placeholder="80, 100"
          dir="ltr"
        />
      </Field>
      <label className="check">
        <input
          type="checkbox"
          checked={v.archived}
          onChange={(e) => set("archived", e.target.checked)}
        />
        {tr("העברה לארכיון")}
      </label>
      <Footer {...ctl} close={close} />
    </form>
  );
}
export function EntryForm({ item, state, mutate, close }) {
  const now = Date.now(),
    a = item?.segments[0]?.start ?? now,
    b = item?.segments.at(-1)?.end ?? now + HOUR;
  const [v, setV] = useState({
    id: item?.id || uid(),
    projectId:
      item?.projectId || state.projects.find((p) => !p.archived)?.id || "",
    description: item?.description || "",
    billingStatus: billingStatus(item ?? {}),
    internalNotes: item?.internalNotes ?? "",
    date: dayKey(a),
    start: clockKey(a),
    endDate: dayKey(b),
    end: clockKey(b),
    minutes: item ? duration(item.segments) / 60000 : 60,
    mode: item ? "keep" : "clock",
    allowOverlap: false,
    newPrice: false,
  });
  const set = (k, x) => setV((v) => ({ ...v, [k]: x }));
  const ctl = useSubmit(mutate, close);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        ctl.submit((s) => {
          const p = s.projects.find((p) => p.id === v.projectId);
          if (!p) throw Error(tr("יש לבחור פרויקט."));
          const old = s.entries.find((e) => e.id === v.id);
          checkConcurrent(old, item);
          const segments =
            v.mode === "keep" ? item.segments : manualSegments(v);
          const all = [
            ...s.entries,
            ...(s.timer
              ? [
                  {
                    id: s.timer.id,
                    segments: timerSegments(s.timer, Date.now()),
                  },
                ]
              : []),
          ];

          if (overlap(all, segments, v.id) && !v.allowOverlap)
            throw Error(
              tr(
                "הרישום חופף לזמן שכבר נמדד. בדוק את השעות, או סמן אישור חפיפה מפורש.",
              ),
            );
          const entry = {
            id: v.id,
            projectId: v.projectId,
            description: v.description,
            billingStatus: v.billingStatus,
            internalNotes: v.internalNotes,
            segments,
            pricing: item && !v.newPrice ? item.pricing : pricing(p),
            createdAt: item?.createdAt ?? Date.now(),
          };
          if (old) Object.assign(old, entry);
          else s.entries.push(entry);
        });
      }}
    >
      <Field label={tr("פרויקט")}>
        <select
          autoFocus
          required
          value={v.projectId}
          onChange={(e) => set("projectId", e.target.value)}
        >
          <option value="">{tr("בחירת פרויקט")}</option>
          <ProjectOptions state={state} includeArchived />
        </select>
      </Field>
      <Field label={tr("מה עשית? (לא חובה)")}>
        <input
          maxLength={1000}
          value={v.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder={tr("למשל, אפיון ועיצוב מסך הבית")}
        />
      </Field>
      <p className="note">
        {tr(
          "התיאור עשוי להופיע בדוח ללקוח. מידע פרטי יש לכתוב בהערות הפנימיות.",
        )}
      </p>
      <Field label={tr("סיווג הזמן")}>
        <select
          value={v.billingStatus}
          onChange={(e) => set("billingStatus", e.target.value)}
        >
          {BILLING_STATUSES.map((status) => (
            <option key={status} value={status}>
              {statusLabel(status)}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label={tr("הערות פנימיות")}
        hint={tr("נשמרות בגיבוי האישי בלבד ולא נכללות בדוח ללקוח.")}
      >
        <textarea
          maxLength={10000}
          rows={2}
          value={v.internalNotes}
          onChange={(e) => set("internalNotes", e.target.value)}
        />
      </Field>
      <Field label={tr("אופן הזנת הזמן")}>
        <select value={v.mode} onChange={(e) => set("mode", e.target.value)}>
          {item && (
            <option value="keep">{tr("שמירת מקטעי הזמן המקוריים")}</option>
          )}
          <option value="clock">{tr("שעת התחלה וסיום")}</option>
          <option value="duration">{tr("שעת התחלה ומשך")}</option>
        </select>
      </Field>
      {v.mode === "keep" ? (
        <div className="note">
          {item.segments.map((s, i) => (
            <div key={i}>
              <bdi>
                {dayKey(s.start)} {clockKey(s.start)} — {dayKey(s.end)}{" "}
                {clockKey(s.end)}
              </bdi>
            </div>
          ))}
          {tr(
            "השהיות אינן נכללות בזמן העבודה. שינוי לשעות ידניות יחליף את המקטעים.",
          )}
        </div>
      ) : (
        <>
          <div className="form-grid">
            <Field label={tr("תאריך התחלה")}>
              <input
                type="date"
                required
                value={v.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </Field>
            <Field label={tr("שעת התחלה")}>
              <input
                type="time"
                step="1"
                required
                value={v.start}
                onChange={(e) => set("start", e.target.value)}
              />
            </Field>
          </div>
          {v.mode === "clock" ? (
            <div className="form-grid">
              <Field label={tr("תאריך סיום")}>
                <input
                  type="date"
                  required
                  value={v.endDate}
                  onChange={(e) => set("endDate", e.target.value)}
                />
              </Field>
              <Field label={tr("שעת סיום")}>
                <input
                  type="time"
                  step="1"
                  required
                  value={v.end}
                  onChange={(e) => set("end", e.target.value)}
                />
              </Field>
              <Button
                type="button"
                onClick={() => set("endDate", addDays(v.date, 1))}
              >
                {tr("סיום ביום הבא")}
              </Button>
            </div>
          ) : (
            <Field label={tr("משך בדקות")}>
              <input
                type="number"
                min="0.01"
                max="525600"
                step="any"
                required
                value={v.minutes}
                onChange={(e) => set("minutes", e.target.value)}
              />
            </Field>
          )}
          <p className="note">
            {tr(
              "כל השעות לפי ישראל. בעבודה שחוצה חצות בחר את תאריך הסיום הבא.",
            )}
          </p>
        </>
      )}
      {item && (
        <>
          <p className="note">
            {tr("התעריף המקורי נשמר גם בהעברה לפרויקט אחר.")}
            {item.pricing.type === "hourly" && (
              <bdi> {item.pricing.amount} ₪</bdi>
            )}
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={v.newPrice}
              onChange={(e) => set("newPrice", e.target.checked)}
            />
            {tr("החל על הרישום את התמחור הנוכחי של הפרויקט הנבחר")}
          </label>
        </>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={v.allowOverlap}
          onChange={(e) => set("allowOverlap", e.target.checked)}
        />
        {tr("בדקתי ואני מאשר חפיפה לרישומים אחרים")}
      </label>
      <Footer {...ctl} close={close} />
    </form>
  );
}
