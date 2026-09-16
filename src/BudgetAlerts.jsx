import React, { useMemo } from "react";
import { tr } from "./i18n.js";
import { budgetState, projectTimes } from "./billing.js";
import { elapsed } from "./domain.js";
export default function BudgetAlerts({ state, now }) {
  const saved = useMemo(
    () => projectTimes({ entries: state.entries, timer: null }, now),
    [state.entries],
  );
  const alerts = state.projects
    .filter((p) => !p.archived)
    .flatMap((p) => {
      const ms =
        (saved.get(p.id) ?? 0) +
        (state.timer?.projectId === p.id ? elapsed(state.timer, now) : 0);
      const b = budgetState(p, ms);
      return b.reached.length ? [{ p, b }] : [];
    });
  return (
    <div aria-live="polite" className="budget-alerts">
      {alerts.map(({ p, b }) => (
        <p className="budget-alert" key={p.id}>
          <bdi>{p.name}</bdi> ·{" "}
          {b.budgetMs === 0
            ? tr("נמדד זמן בפרויקט שתקציבו אפס.")
            : tr("ניצול התקציב הגיע לסף {0}%.", [b.reached.at(-1)])}
        </p>
      ))}
    </div>
  );
}
