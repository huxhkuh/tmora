import { tr } from "./i18n.js";
import React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Empty, Dot } from "./ui.jsx";
import { duration, hms, dayKey, clockKey, money } from "./domain.js";
import { billingStatus } from "./billing-model.js";
import { statusLabel, workRows, summarize } from "./billing.js";
export default function Entries({
  entries,
  state,
  edit,
  remove,
  showValue = false,
}) {
  if (!entries.length)
    return (
      <Empty title={tr("עוד אין כאן שעות עבודה")}>
        {tr("התחל מדידה או הוסף עבודה ידנית. כל מה שעשית יופיע כאן.")}
      </Empty>
    );

  return (
    <div className="table-scroll">
      <table className="entries-table">
        <thead>
          <tr>
            <th>{tr("פרויקט / משימה")}</th>
            <th>{tr("תאריך ושעות")}</th>
            <th>{tr("משך")}</th>
            <th>{tr("סיווג")}</th>
            {showValue && <th>{tr("שווי שעתי")}</th>}
            <th>
              <span className="sr-only">{tr("פעולות")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {[...entries]
            .sort((a, b) => b.segments[0].start - a.segments[0].start)
            .map((e) => {
              const p = state.projects.find((p) => p.id === e.projectId);
              return (
                <tr key={e.id}>
                  <td className="entry-project">
                    <div className="row-title">
                      <Dot color={p?.color} />
                      <bdi>{p?.name}</bdi>
                    </div>
                    <span className="subtext">
                      <bdi>{e.description || tr("ללא תיאור")}</bdi>
                    </span>
                  </td>
                  <td className="entry-date">
                    <bdi className="subtext">{dayKey(e.segments[0].start)}</bdi>
                    <br />
                    <bdi className="time-range">
                      {clockKey(e.segments[0].start)} –{" "}
                      {clockKey(e.segments.at(-1).end)}
                    </bdi>
                    {dayKey(e.segments[0].start) !==
                      dayKey(e.segments.at(-1).end) && (
                      <small className="subtext">
                        {tr("סיום ")}
                        {dayKey(e.segments.at(-1).end)}
                      </small>
                    )}
                    {e.segments.length > 1 && (
                      <small className="subtext">
                        {e.segments.length}
                        {tr(" מקטעים")}
                      </small>
                    )}
                  </td>
                  <td className="entry-duration" data-label={tr("משך עבודה")}>
                    <bdi className="duration">{hms(duration(e.segments))}</bdi>
                  </td>
                  <td className="entry-status" data-label={tr("סיווג")}>
                    <span className={`billing-badge ${billingStatus(e)}`}>
                      {statusLabel(billingStatus(e))}
                    </span>
                  </td>
                  {showValue && (
                    <td className="entry-value" data-label={tr("שווי שעתי")}>
                      {billingStatus(e) !== "billable"
                        ? "—"
                        : e.pricing.type === "hourly"
                          ? money(summarize(workRows([e])).cents / 100)
                          : e.pricing.type === "fixed"
                            ? tr("מחיר כולל")
                            : tr("ללא מחיר")}
                    </td>
                  )}
                  <td className="entry-actions">
                    <div className="row-actions">
                      <button
                        className="icon-button"
                        aria-label={tr("עריכת רישום {0}", [
                          e.description || p?.name,
                        ])}
                        onClick={() =>
                          edit(state.entries.find((x) => x.id === e.id) || e)
                        }
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-button danger"
                        aria-label={tr("מחיקת רישום {0}", [
                          e.description || p?.name,
                        ])}
                        onClick={() => remove(e.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
