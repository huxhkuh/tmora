import { fresh, wallTime } from "../../src/domain.js";
export function billingDemo() {
  const entry = (
    id,
    description,
    day,
    start,
    end,
    rate,
    status = "billable",
    endDate = day,
  ) => ({
    id,
    projectId: "demo-project",
    description,
    internalNotes: "הערה פרטית שאסור להציג ללקוח",
    segments: [{ start: wallTime(day, start), end: wallTime(endDate, end) }],
    pricing: { type: "hourly", amount: rate },
    billingStatus: status,
    createdAt: wallTime(day, start),
  });
  return {
    ...fresh(),
    clients: [{ id: "demo-client", name: "סטודיו הדגמה" }],
    projects: [
      {
        id: "demo-project",
        clientId: "demo-client",
        name: "אתר לדוגמה",
        description: "נתונים להדגמה בלבד",
        color: "#b94f2a",
        archived: false,
        priceType: "hourly",
        price: 200,
        goal: 5,
        budgetAlerts: [80, 100],
      },
    ],
    entries: [
      entry("demo-1", "אפיון מסכי האתר", "2026-09-14", "10:00", "11:30", 150),
      entry(
        "demo-2",
        "פיתוח טופס יצירת קשר",
        "2026-09-15",
        "23:30",
        "00:30",
        200,
        "billable",
        "2026-09-16",
      ),
      entry(
        "demo-3",
        "בדיקות ותיקוני נגישות",
        "2026-09-16",
        "10:00",
        "11:00",
        200,
      ),
      entry(
        "demo-4",
        "בדיקה פנימית חסויה",
        "2026-09-16",
        "12:00",
        "12:30",
        200,
        "internal",
      ),
      entry(
        "demo-5",
        "בירור שטרם סווג",
        "2026-09-16",
        "13:00",
        "13:15",
        200,
        "unclassified",
      ),
    ],
  };
}
