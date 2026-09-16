import { tr } from "./i18n.js";
export const BILLING_STATUSES = ["unclassified", "billable", "internal"];
export const billingStatus = (entry) => entry.billingStatus ?? "unclassified";

// Additive, idempotent upgrade. Never reconstruct a historical price from a project.
export function upgradeState(state) {
  if (![1, 2].includes(state.version)) throw Error("Unsupported data version");
  for (const p of state.projects) {
    p.goal ??= null;
    p.budgetAlerts ??= [80, 100];
  }
  for (const e of [...state.entries, ...(state.timer ? [state.timer] : [])]) {
    e.billingStatus ??= "unclassified";
    e.internalNotes ??= "";
  }
  state.tasks ??= [];
  state.version = 2;
  return state;
}

export function parseThresholds(text) {
  if (!text.trim()) return [];
  const values = text.split(/[,،]/).map((v) => Number(v.trim()));
  if (
    values.length > 10 ||
    values.some((v) => !Number.isFinite(v) || v <= 0 || v > 1000)
  )
    throw Error(tr("יש להזין עד 10 ספים בין 0 ל־1000, מופרדים בפסיקים."));
  return [...new Set(values)].sort((a, b) => a - b);
}
