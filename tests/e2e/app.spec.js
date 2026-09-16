import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
const snapshot = (page) =>
  page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open("bou-personal-time-v1", 1);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return new Promise((res) => {
      const r = db.transaction("state").objectStore("state").get("main");
      r.onsuccess = () => {
        db.close();
        res(r.result);
      };
    });
  });
async function setup(page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "צור פרויקט ראשון", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "שם הלקוח", exact: true })
    .fill("סטודיו קדם");
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "פרויקט חדש", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "שם הפרויקט", exact: true })
    .fill("אתר חדש");
  await page.getByLabel("תמחור", { exact: true }).selectOption("hourly");
  await page.getByLabel("תעריף לשעה (₪)", { exact: true }).fill("250");
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
test("complete Hebrew workflow: customer > project > timer > reload > pause/resume > edit > reports > CSV > backup/restore", async ({
  page,
  browser,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await setup(page);
  await page.getByLabel("תיאור המשימה", { exact: true }).fill("אפיון מסך הבית");
  await page.getByLabel("סיווג הזמן", { exact: true }).selectOption("billable");
  await page.getByRole("button", { name: "התחל מדידה", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "השהיה", exact: true }),
  ).toBeVisible();
  const initial = await snapshot(page);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "השהיה", exact: true }),
  ).toBeVisible();
  expect((await snapshot(page)).timer.id).toBe(initial.timer.id);
  await page.getByRole("button", { name: "השהיה", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "המשך", exact: true }),
  ).toBeVisible();
  expect((await snapshot(page)).timer.runningSince).toBeNull();
  await page.reload();
  await page.getByRole("button", { name: "המשך", exact: true }).click();
  await page.getByRole("button", { name: "עצירה ושמירה", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "עריכת רישום אפיון מסך הבית",
      exact: true,
    }),
  ).toBeVisible();
  expect((await snapshot(page)).entries).toHaveLength(1);
  await page
    .getByRole("button", { name: "עריכת רישום אפיון מסך הבית", exact: true })
    .click();
  await page
    .getByLabel("מה עשית? (לא חובה)", { exact: true })
    .fill("אפיון ו־Design review");
  await page
    .getByLabel("אופן הזנת הזמן", { exact: true })
    .selectOption("duration");
  await page.getByLabel("תאריך התחלה", { exact: true }).fill("2026-09-07");
  await page.getByLabel("שעת התחלה", { exact: true }).fill("09:00:00");
  await page.getByLabel("משך בדקות", { exact: true }).fill("90");
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "דוחות", exact: true }).click();
  await page.getByLabel("מתאריך", { exact: true }).fill("2026-09-01");
  await page.getByLabel("עד תאריך", { exact: true }).fill("2026-09-30");
  await expect(page.locator(".metrics")).toContainText("1.5");
  await expect(page.locator(".metrics")).toContainText("375");
  await page.getByLabel("פרויקט", { exact: true }).selectOption({ label: "אתר חדש" });
  await page.getByRole("button", { name: "תצוגה מקדימה", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "ייצוא CSV", exact: true }).click();
  const dl = await downloadPromise;
  const bytes = await fs.readFile(await dl.path());
  expect(bytes.subarray(0, 3).toString("hex")).toBe("efbbbf");
  expect(bytes.toString()).toContain("אפיון ו־Design review");
  expect(bytes.toString()).toContain('"1.5"');
  await page
    .getByRole("button", { name: "גיבוי והגדרות", exact: true })
    .click();
  const bp = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "ייצוא גיבוי מלא", exact: true })
    .click();
  const bd = await bp;
  const backup = await fs.readFile(await bd.path());
  const parsed = JSON.parse(backup.toString());
  expect(parsed.entries).toHaveLength(1);
  const target = await browser.newContext();
  const restored = await target.newPage();
  await restored.goto("/");
  await restored
    .getByRole("button", { name: "גיבוי והגדרות", exact: true })
    .click();
  for (let i = 0; i < 2; i++) {
    await restored
      .locator("input[type=file]")
      .setInputFiles({
        name: "backup.json",
        mimeType: "application/json",
        buffer: backup,
      });
    await restored
      .getByRole("button", { name: "ייבוא ומיזוג", exact: true })
      .click();
    await expect(
      restored.getByText("הגיבוי מוזג בהצלחה. פריטים קיימים לא שוכפלו."),
    ).toBeVisible();
  }
  expect((await snapshot(restored)).entries).toHaveLength(1);
  await target.close();
  expect(errors).toEqual([]);
});
test("two tabs and simultaneous clicks preserve exactly one timer and one entry", async ({
  page,
  context,
}) => {
  await setup(page);
  const other = await context.newPage();
  await other.goto("/");
  await expect(
    other.getByRole("button", { name: "התחל מדידה", exact: true }),
  ).toBeVisible();
  await Promise.allSettled([
    page
      .getByRole("button", { name: "התחל מדידה", exact: true })
      .click({ timeout: 1500 }),
    other
      .getByRole("button", { name: "התחל מדידה", exact: true })
      .click({ timeout: 1500 }),
  ]);
  await expect(
    other.getByRole("button", { name: "עצירה ושמירה", exact: true }),
  ).toBeVisible();
  expect((await snapshot(page)).entries).toHaveLength(0);
  await Promise.allSettled([
    page
      .getByRole("button", { name: "עצירה ושמירה", exact: true })
      .click({ timeout: 1500 }),
    other
      .getByRole("button", { name: "עצירה ושמירה", exact: true })
      .click({ timeout: 1500 }),
  ]);
  await expect.poll(async () => (await snapshot(page)).timer).toBeNull();
  expect((await snapshot(page)).entries).toHaveLength(1);
});
test("mobile RTL, keyboard modal focus, midnight, overlap and negative validation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  expect(await page.locator("html").getAttribute("dir")).toBe("rtl");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    JSON.stringify(
      await page.evaluate(() =>
        [...document.querySelectorAll("body *")]
          .map((e) => ({
            tag: e.tagName,
            cls: e.className,
            left: e.getBoundingClientRect().left,
            right: e.getBoundingClientRect().right,
            width: e.getBoundingClientRect().width,
          }))
          .filter((e) => e.left < 0 || e.right > innerWidth),
      ),
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../../work/mobile-empty.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "הוספה ידנית", exact: true })
    .first()
    .click();
  await page.getByLabel("תאריך התחלה", { exact: true }).fill("2026-09-06");
  await page.getByLabel("שעת התחלה", { exact: true }).fill("23:30:00");
  await page.getByLabel("תאריך סיום", { exact: true }).fill("2026-09-07");
  await page.getByLabel("שעת סיום", { exact: true }).fill("01:30:00");
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  let s = await snapshot(page);
  expect(s.entries[0].segments[0].end - s.entries[0].segments[0].start).toBe(
    7200000,
  );
  await page
    .getByRole("button", { name: "הוספה ידנית", exact: true })
    .first()
    .click();
  await page.getByLabel("תאריך התחלה", { exact: true }).fill("2026-09-06");
  await page.getByLabel("שעת התחלה", { exact: true }).fill("23:00:00");
  await page.getByLabel("תאריך סיום", { exact: true }).fill("2026-09-06");
  await page.getByLabel("שעת סיום", { exact: true }).fill("22:00:00");
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("אחרי ההתחלה");
  await page.getByLabel("תאריך סיום", { exact: true }).fill("2026-09-07");
  await page.getByLabel("שעת סיום", { exact: true }).fill("01:00:00");
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("חופף");
  expect((await snapshot(page)).entries).toHaveLength(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Alt+KeyN");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "דוחות", exact: true }).click();
  await page.getByLabel("מתאריך", { exact: true }).fill("2026-09-07");
  await page.getByLabel("עד תאריך", { exact: true }).fill("2026-09-07");
  await expect(page.locator(".metrics")).toContainText("1.5");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    JSON.stringify(
      await page.evaluate(() =>
        [...document.querySelectorAll("body *")]
          .map((e) => ({
            tag: e.tagName,
            cls: e.className,
            left: e.getBoundingClientRect().left,
            right: e.getBoundingClientRect().right,
            width: e.getBoundingClientRect().width,
          }))
          .filter((e) => e.left < 0 || e.right > innerWidth),
      ),
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../../work/mobile-report.png",
    fullPage: true,
  });
});
