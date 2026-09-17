import { test, expect } from "@playwright/test";
const initial = {
  version: 1,
  revision: 0,
  clients: [{ id: "c", name: "לקוח לדוגמה" }],
  projects: [
    {
      id: "p",
      clientId: "c",
      name: "פרויקט שעתי",
      color: "#b94f2a",
      description: "עיצוב",
      archived: false,
      priceType: "hourly",
      price: 200,
      goal: 1,
    },
    {
      id: "q",
      clientId: "c",
      name: "פרויקט כולל",
      color: "#657759",
      description: "פיתוח",
      archived: false,
      priceType: "fixed",
      price: 1200,
      goal: null,
    },
  ],
  entries: [
    {
      id: "e",
      projectId: "p",
      description: "עבודה קודמת",
      createdAt: 1788760800000,
      segments: [{ start: 1788760800000, end: 1788768000000 }],
      pricing: { type: "hourly", amount: 200 },
    },
  ],
  timer: null,
};
async function restore(page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "גיבוי והגדרות", exact: true })
    .click();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "test.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(initial)),
    });
  await page.getByRole("button", { name: "ייבוא ומיזוג", exact: true }).click();
  await expect(
    page.getByText("הגיבוי מוזג בהצלחה. פריטים קיימים לא שוכפלו."),
  ).toBeVisible();
}
test("project budget, rate history, entry transfer, filters and explicit deletion", async ({
  page,
}) => {
  await restore(page);
  await page.getByRole("button", { name: "פרויקטים", exact: true }).click();
  await expect(page.getByText("חריגה מתקציב השעות")).toBeVisible();
  await page
    .getByRole("button", { name: "עריכת פרויקט פרויקט שעתי", exact: true })
    .click();
  await page.getByLabel("תעריף לשעה (₪)", { exact: true }).fill("500");
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "דוחות", exact: true }).click();
  await page.getByLabel("מתאריך", { exact: true }).fill("2026-09-01");
  await page.getByLabel("עד תאריך", { exact: true }).fill("2026-09-30");
  await expect(page.locator(".billing-metrics")).toContainText("02:00:00");
  await page.getByRole("button", { name: "עריכת רישום עבודה קודמת", exact: true }).click();
  await page.getByLabel("סיווג הזמן", { exact: true }).selectOption("billable");
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  await expect(page.locator(".metrics")).toContainText("400");
  await page
    .getByRole("button", { name: "עריכת רישום עבודה קודמת", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("פרויקט", { exact: true })
    .selectOption("q");
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".metrics")).toContainText("400");
  await page.getByLabel("פרויקט", { exact: true }).selectOption("p");
  await expect(page.locator(".metrics")).toContainText("0");
  await page.getByLabel("פרויקט", { exact: true }).selectOption("q");
  await expect(page.locator(".metrics")).toContainText("400");
  await page
    .getByRole("button", { name: "מחיקת רישום עבודה קודמת", exact: true })
    .click();
  await page.getByRole("button", { name: "ביטול", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "עריכת רישום עבודה קודמת", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "מחיקת רישום עבודה קודמת", exact: true })
    .click();
  await page
    .getByRole("button", { name: "כן, מחיקת הרישום", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("tbody tr")).toHaveCount(0);
});
test("long-open timer warns, stays accurate after clock advances, survives tab close", async ({
  page,
  context,
}) => {
  await restore(page);
  await page.getByRole("button", { name: "היום", exact: true }).click();
  await page.clock.install({ time: new Date("2026-09-08T06:00:00Z") });
  await page.getByRole("button", { name: "התחל מדידה", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "השהיה", exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(13 * 3600000);
  await expect(page.locator(".timer-warning")).toBeVisible();
  await expect(page.locator(".clock")).toHaveText("13:00:00");
  await expect(
    page.getByRole("button", { name: "השהיה", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "השהיה", exact: true }).click();
  // Wait for the IndexedDB transaction to commit, as reflected by the control.
  await expect(page.getByRole("button", { name: "המשך", exact: true })).toBeVisible();
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto("/");
  await expect(
    reopened.getByRole("button", { name: "המשך", exact: true }),
  ).toBeVisible();
  await expect(reopened.locator(".clock")).toHaveText("13:00:00");
});
test("archive retains reports and rejects malformed import", async ({
  page,
}) => {
  await restore(page);
  await page.getByRole("button", { name: "פרויקטים", exact: true }).click();
  await page
    .getByRole("button", { name: "עריכת פרויקט פרויקט שעתי", exact: true })
    .click();
  await page.getByLabel("העברה לארכיון", { exact: true }).check();
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "פרויקט שעתי", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "בארכיון", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "פרויקט שעתי", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "גיבוי והגדרות", exact: true })
    .click();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":99}'),
    });
  await expect(page.getByRole("alert")).toContainText("אינו בפורמט נתמך");
  await expect(
    page.getByRole("button", { name: "ייבוא ומיזוג", exact: true }),
  ).toHaveCount(0);
});
