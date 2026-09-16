import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { billingDemo } from "../fixtures/billing.js";

async function seed(page, data = billingDemo()) {
  await page.goto("/?demo=1");
  await page.evaluate(async (data) => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open("bou-demo-time-v1", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("state");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("state", "readwrite");
      tx.objectStore("state").put(data, "main");
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, data);
  await page.reload();
}
async function report(page) {
  await page.getByRole("button", { name: "דוחות", exact: true }).click();
  await page.getByLabel("מתאריך", { exact: true }).fill("2026-09-14");
  await page.getByLabel("עד תאריך", { exact: true }).fill("2026-09-16");
  await page.getByLabel("פרויקט", { exact: true }).selectOption("demo-project");
  await page.getByRole("button", { name: "תצוגה מקדימה", exact: true }).click();
  await expect(page.locator(".client-report")).toBeVisible();
}
async function downloaded(page, button) {
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name: button, exact: true }).click();
  return await promise;
}

test("offline client report: totals, midnight, private notes, hidden prices and embedded Hebrew font", async ({
  page,
  context,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await seed(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await report(page);
  await expect(page.locator(".billing-metrics")).toContainText("04:15:00");
  await expect(page.locator(".billing-metrics")).toContainText("03:30:00");
  await expect(page.locator(".client-report tbody tr")).toHaveCount(4);
  await expect(page.locator(".client-report")).toContainText("625.00");
  await expect(page.locator(".client-report")).not.toContainText("הערה פרטית");
  await expect(page.locator(".client-report")).not.toContainText(
    "בדיקה פנימית",
  );
  const csv = await downloaded(page, "ייצוא CSV");
  const csvText = await fs.readFile(await csv.path(), "utf8");
  expect(csvText.charCodeAt(0)).toBe(0xfeff);
  expect(csvText).toContain('"625.00"');
  const html = await downloaded(page, "הורדת דוח HTML");
  const htmlText = await fs.readFile(await html.path(), "utf8");
  expect(htmlText).toContain("data:font/woff2;base64,");
  expect(htmlText).not.toContain("הערה פרטית");
  await page.getByLabel("הצגת תעריפים וסכומים בדוח").uncheck();
  await expect(
    page.getByRole("button", { name: "ייצוא CSV", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "תצוגה מקדימה", exact: true }).click();
  const plain = await downloaded(page, "הורדת דוח HTML");
  const plainText = await fs.readFile(await plain.path(), "utf8");
  expect(plainText).not.toContain("625.00");
  expect(plainText).not.toContain("תעריף");
  await expect(page.locator(".client-report")).not.toContainText("₪");
  expect(errors).toEqual([]);
});

test("project budgets handle zero, settings and edits; original prices survive time edits until explicitly repriced", async ({
  page,
}) => {
  await seed(page);
  await expect(page.locator(".budget-alerts")).toContainText("80%");
  await page.getByRole("button", { name: "פרויקטים", exact: true }).click();
  await expect(page.locator(".goal")).toContainText("00:45:00");
  await page.getByRole("button", { name: "עריכת פרויקט אתר לדוגמה" }).click();
  await page.getByLabel("תעריף לשעה (₪)", { exact: true }).fill("300");
  await page.getByLabel("תקציב שעות (לא חובה)").fill("0");
  await page.getByLabel("התראות ניצול באחוזים").fill("90, 100, 120");
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  await expect(page.locator(".budget-alerts")).toContainText("תקציבו אפס");
  await report(page);
  await expect(page.locator(".client-report")).toContainText("625.00");
  await page
    .getByRole("button", { name: "עריכת רישום אפיון מסכי האתר", exact: true })
    .click();
  await page.getByLabel("אופן הזנת הזמן").selectOption("duration");
  await page.getByLabel("משך בדקות").fill("120");
  await page.getByLabel("הערות פנימיות").fill("סוד מעודכן");
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "ייצוא CSV", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "תצוגה מקדימה", exact: true }).click();
  await expect(page.locator(".client-report")).toContainText("700.00");
  await expect(page.locator(".client-report")).not.toContainText("סוד מעודכן");
  await page
    .getByRole("button", { name: "עריכת רישום אפיון מסכי האתר", exact: true })
    .click();
  await page
    .getByLabel("החל על הרישום את התמחור הנוכחי של הפרויקט הנבחר")
    .check();
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  await page.getByRole("button", { name: "תצוגה מקדימה", exact: true }).click();
  await expect(page.locator(".client-report")).toContainText("1000.00");
  await page
    .getByRole("button", { name: "מחיקת רישום אפיון מסכי האתר", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "כן, מחיקת הרישום", exact: true })
    .click();
  await page.getByRole("button", { name: "תצוגה מקדימה", exact: true }).click();
  await expect(page.locator(".client-report")).toContainText("400.00");
  await page.getByRole("button", { name: "פרויקטים", exact: true }).click();
  await expect(page.locator(".goal")).toContainText("02:45:00");
});

test("v1 recovery, active timer, client preview and reports survive reload without losing time", async ({
  page,
}) => {
  const s = billingDemo();
  s.version = 1;
  for (const e of s.entries) {
    delete e.billingStatus;
    delete e.internalNotes;
  }
  s.timer = {
    id: "legacy-timer",
    projectId: "demo-project",
    description: "טיימר פתוח",
    segments: [],
    runningSince: Date.now() - 60000,
    createdAt: Date.now() - 60000,
    pricing: { type: "hourly", amount: 90 },
  };
  await seed(page, s);
  await page.getByRole("button", { name: "דוחות", exact: true }).click();
  await expect(
    page.getByText(
      "יש מדידה פתוחה. היא ממשיכה כרגיל ואינה כלולה בדוח עד לעצירה ושמירה.",
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "גיבוי והגדרות", exact: true })
    .click();
  const dl = await downloaded(page, "הורדת הנתונים מלפני השדרוג");
  expect(JSON.parse(await fs.readFile(await dl.path(), "utf8"))).toEqual(s);
  const backup = await downloaded(page, "ייצוא גיבוי מלא");
  const saved = JSON.parse(await fs.readFile(await backup.path(), "utf8"));
  expect(saved.version).toBe(2);
  expect(saved.entries[0].billingStatus).toBe("unclassified");
  expect(saved.entries[0].pricing.amount).toBe(150);
  expect(saved.timer.pricing.amount).toBe(90);
  expect(saved.timer.runningSince).toBeNull();
  expect(
    saved.timer.segments[0].end - saved.timer.segments[0].start,
  ).toBeGreaterThan(60000);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "השהיה", exact: true }),
  ).toBeVisible();
  await page.getByLabel("סיווג הזמן", { exact: true }).selectOption("billable");
  await page.getByRole("button", { name: "עצירה ושמירה", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "עריכת רישום טיימר פתוח", exact: true }),
  ).toBeVisible();
});

test("mobile reports and Hebrew print layout have no page clipping or private UI in print", async ({
  page,
}) => {
  await seed(page);
  await report(page);
  await page.evaluate(() => {
    localStorage.setItem("bou-ui-mode", "dark");
  });
  await page.reload();
  await report(page);
  await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
  await expect(page.locator(".client-report th").first()).toHaveCSS(
    "color",
    "rgb(37, 42, 37)",
  );
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".client-report")).toBeVisible();
  await expect(page.locator(".sidebar")).not.toBeVisible();
  await expect(page.locator(".billing-metrics")).not.toBeVisible();
  await expect(page.locator(".entries-section")).not.toBeVisible();
  const reportBox = await page.locator(".client-report").boundingBox();
  expect(reportBox.width).toBeGreaterThan(600);
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".client-report")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
