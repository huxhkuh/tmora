import { tr } from "./i18n.js";
import React, { useMemo, useState } from "react";
import { Download, Printer, Eye } from "lucide-react";
import { Field, Button, Empty } from "./ui.jsx";
import Entries from "./Entries.jsx";
import { dayKey, weekKey, sliceEntries, hours, money } from "./domain.js";
import {
  workRows,
  summarize,
  buildClientReport,
  reportMarkup,
  reportHtml,
  reportCsv,
  reportStyles,
  exactDuration,
} from "./billing.js";
import { read } from "./store.js";
export function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export default function Reports({ state, now, editEntry, remove, notify }) {
  const today = dayKey(now);
  const [from, setFrom] = useState(today.slice(0, 7) + "-01"),
    [to, setTo] = useState(today),
    [client, setClient] = useState(""),
    [project, setProject] = useState(""),
    [group, setGroup] = useState("day"),
    [showRates, setShowRates] = useState(true),
    [preview, setPreview] = useState(null),
    [busy, setBusy] = useState(false);
  const { entries, rows, totals, error } = useMemo(() => {
    try {
      const projectIds = new Set(
        state.projects
          .filter(
            (p) =>
              (!client || p.clientId === client) &&
              (!project || p.id === project),
          )
          .map((p) => p.id),
      );
      const entries = sliceEntries(
        state.entries.filter((e) => projectIds.has(e.projectId)),
        from,
        to,
      );
      const rows = workRows(entries);
      return { entries, rows, totals: summarize(rows), error: "" };
    } catch (e) {
      return { entries: [], rows: [], totals: summarize([]), error: e.message };
    }
  }, [state.entries, state.projects, from, to, client, project]);
  const key = JSON.stringify([project, from, to, showRates]);
  const ready =
    preview && preview.key === key && preview.revision === state.revision;
  const groups = new Map();
  for (const row of rows) {
    const k =
      group === "day"
        ? row.day
        : group === "week"
          ? weekKey(row.day)
          : row.day.slice(0, 7);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(row);
  }
  const generate = async () => {
    setBusy(true);
    try {
      const current = await read();
      const report = buildClientReport(current, {
        projectId: project,
        from,
        to,
        showRates,
      });
      setPreview({ report, revision: current.revision, key });
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const exportReport = async (type) => {
    try {
      // Recheck IndexedDB as another window may have edited a row since preview.
      const current = await read();
      if (!ready || current.revision !== preview.revision) {
        setPreview(null);
        notify(tr("הנתונים השתנו. יש ליצור תצוגה מקדימה חדשה."), true);
        return;
      }
      const report = preview.report,
        name = `temura-${from}-${to}`;
      if (type === "csv")
        download(name + ".csv", reportCsv(report), "text/csv;charset=utf-8");
      if (type === "html") {
        const { default: font } = await import(
          "@fontsource-variable/heebo/files/heebo-hebrew-wght-normal.woff2?inline"
        );
        download(
          name + ".html",
          reportHtml(report, font),
          "text/html;charset=utf-8",
        );
      }
      if (type === "print") {
        await document.fonts.ready;
        window.print();
      }
    } catch (e) {
      notify(e.message, true);
    }
  };
  return (
    <>
      <style>{reportStyles}</style>
      <div className="surface report-filter">
        <Field label={tr("מתאריך")}>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label={tr("עד תאריך")}>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        <Field label={tr("לקוח")}>
          <select
            value={client}
            onChange={(e) => {
              setClient(e.target.value);
              setProject("");
            }}
          >
            <option value="">{tr("כל הלקוחות")}</option>
            {state.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tr("פרויקט")}>
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">{tr("כל הפרויקטים")}</option>
            {state.projects
              .filter((p) => !client || p.clientId === client)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </Field>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {state.timer && (
        <p className="budget-alert" role="status">
          {tr(
            "יש מדידה פתוחה. היא ממשיכה כרגיל ואינה כלולה בדוח עד לעצירה ושמירה.",
          )}
        </p>
      )}
      <div className="metrics billing-metrics">
        <div>
          <span>{tr("זמן כולל")}</span>
          <strong>
            {hours(totals.totalMs)}
            <small>{tr(" שעות")}</small>
          </strong>
          <bdi>{exactDuration(totals.totalMs)}</bdi>
        </div>
        <div>
          <span>{tr("זמן לחיוב")}</span>
          <strong>
            {hours(totals.billableMs)}
            <small>{tr(" שעות")}</small>
          </strong>
          <bdi>{exactDuration(totals.billableMs)}</bdi>
        </div>
        <div>
          <span>{tr("זמן פנימי / טרם סווג")}</span>
          <strong className="small-metric">
            <bdi>
              {exactDuration(totals.internalMs)} /{" "}
              {exactDuration(totals.unclassifiedMs)}
            </bdi>
          </strong>
        </div>
        <div>
          <span>{tr("סך חיוב שעתי")}</span>
          <strong>{money(totals.cents / 100)}</strong>
        </div>
      </div>
      <p className="note">
        {tr(
          "הזמן הכולל כולל את כל הסיווגים. רק רישומים לחיוב נכנסים לדוח הלקוח. מחיר כולל ותעריף חסר אינם נכללים בסך החיוב השעתי.",
        )}
      </p>
      {totals.unclassifiedMs > 0 && (
        <p className="budget-alert">
          {tr(
            "יש זמן שטרם סווג. אפשר לסווג אותו דרך עריכת הרישום לפני הפקת דוח.",
          )}
        </p>
      )}
      {totals.unpricedMs > 0 && (
        <p className="error">
          {tr("יש זמן לחיוב ללא תעריף שמור. יש לבדוק אותו לפני מסירת הדוח.")}
        </p>
      )}
      <section className="surface client-report-section">
        <div className="section-head">
          <h2>{tr("דוח ללקוח")}</h2>
          <span className="muted">{tr("רישומים לחיוב בלבד")}</span>
        </div>
        <p className="note">
          {tr(
            "בחר פרויקט וטווח תאריכים. התיאורים יוצגו ללקוח; הערות פנימיות וזמן פנימי אינם נכללים. הדוח בעברית ואינו חשבונית מס.",
          )}
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={showRates}
            onChange={(e) => setShowRates(e.target.checked)}
          />
          {tr("הצגת תעריפים וסכומים בדוח")}
        </label>
        <div className="report-actions">
          <Button
            icon={Eye}
            kind="primary"
            disabled={!!error || !project || busy}
            onClick={generate}
          >
            {tr("תצוגה מקדימה")}
          </Button>
          <Button
            icon={Printer}
            disabled={!ready || !preview.report.rows.length}
            onClick={() => exportReport("print")}
          >
            {tr("הדפסה / שמירה כ־PDF")}
          </Button>
          <Button
            icon={Download}
            disabled={!ready || !preview.report.rows.length}
            onClick={() => exportReport("html")}
          >
            {tr("הורדת דוח HTML")}
          </Button>
          <Button
            icon={Download}
            disabled={!ready || !preview.report.rows.length}
            onClick={() => exportReport("csv")}
          >
            {tr("ייצוא CSV")}
          </Button>
        </div>
        {preview && !ready && (
          <p role="status" className="budget-alert">
            {tr("הנתונים או אפשרויות הדוח השתנו. יש ליצור תצוגה מקדימה חדשה.")}
          </p>
        )}
        {ready &&
          (preview.report.rows.length ? (
            <div
              className="report-preview"
              dangerouslySetInnerHTML={{ __html: reportMarkup(preview.report) }}
            />
          ) : (
            <Empty title={tr("אין רישומים לחיוב בטווח שנבחר")}>
              {tr("בדוק את הסיווגים ואת טווח התאריכים.")}
            </Empty>
          ))}
      </section>
      <section className="surface">
        <div className="section-head">
          <h2>{tr("התמונה לאורך זמן")}</h2>
          <div className="tabs">
            {[
              ["day", tr("יומי")],
              ["week", tr("שבועי")],
              ["month", tr("חודשי")],
            ].map(([k, label]) => (
              <button
                key={k}
                className={group === k ? "selected" : ""}
                aria-pressed={group === k}
                onClick={() => setGroup(k)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {[...groups]
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([k, rs]) => {
            const sum = summarize(rs);
            return (
              <div className="summary-row" key={k}>
                <bdi>{k}</bdi>
                <bdi>{exactDuration(sum.totalMs)}</bdi>
                <bdi>{money(sum.cents / 100)}</bdi>
              </div>
            );
          })}
        {!rows.length && <p className="muted">{tr("אין שעות בטווח שנבחר.")}</p>}
      </section>
      <div className="dashboard-columns report-groups">
        {[
          [
            tr("לפי לקוח"),
            state.clients,
            (r) => state.projects.find((p) => p.id === r.projectId)?.clientId,
          ],
          [tr("לפי פרויקט"), state.projects, (r) => r.projectId],
        ].map(([label, items, id]) => (
          <section className="surface" key={label}>
            <h2>{label}</h2>
            {items
              .filter((x) => rows.some((r) => id(r) === x.id))
              .map((x) => {
                const sum = summarize(rows.filter((r) => id(r) === x.id));
                return (
                  <div className="summary-row" key={x.id}>
                    <bdi>{x.name}</bdi>
                    <bdi>{exactDuration(sum.totalMs)}</bdi>
                    <bdi>{money(sum.cents / 100)}</bdi>
                  </div>
                );
              })}
          </section>
        ))}
      </div>
      <section className="surface entries-section">
        <div className="section-head">
          <h2>{tr("רישומי העבודה")}</h2>
          <span className="muted">{tr("שעות מדויקות, ללא עיגול בחישוב")}</span>
        </div>
        <Entries
          {...{ state, remove }}
          entries={entries}
          edit={editEntry}
          showValue
        />
      </section>
    </>
  );
}
