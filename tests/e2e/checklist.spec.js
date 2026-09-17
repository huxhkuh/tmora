import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

const card = (page, name) => page.locator(".project-card").filter({ has: page.getByRole("heading", { name, exact: true }) });
async function openList(page, name) {
  const c = card(page, name);
  if (!(await c.locator("details").getAttribute("open")) && !(await c.locator("details").evaluate((d) => d.open)))
    await c.locator("summary").click();
  return c;
}
async function addTask(page, project, title) {
  const c = await openList(page, project);
  await c.getByRole("textbox", { name: `משימה חדשה בפרויקט ${project}` }).fill(title);
  await c.getByRole("button", { name: `הוספת משימה לפרויקט ${project}` }).click();
  await expect(c.getByRole("checkbox", { name: title, exact: true })).toBeVisible();
}

test("project checklist CRUD, tab sync, project edit, reload, full backup/restore and mobile RTL", async ({ page, context, browser }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "צור פרויקט ראשון", exact: true }).click();
  await page.getByRole("textbox", { name: "שם הלקוח", exact: true }).fill("סטודיו בדיקות");
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  await page.getByRole("textbox", { name: "שם הפרויקט", exact: true }).fill("עיצוב האתר");
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  await page.getByRole("button", { name: "פרויקטים", exact: true }).click();
  await page.getByRole("button", { name: "פרויקט חדש", exact: true }).click();
  await page.getByRole("textbox", { name: "שם הפרויקט", exact: true }).fill("מיתוג העסק");
  await page.getByRole("button", { name: "שמירה", exact: true }).click();

  await addTask(page, "עיצוב האתר", "אפיון מסכי האתר");
  await addTask(page, "עיצוב האתר", "משימה למחיקה");
  await addTask(page, "מיתוג העסק", "Design review עם הלקוח");
  const site = card(page, "עיצוב האתר");
  await site.getByRole("checkbox", { name: "אפיון מסכי האתר" }).check();
  await expect(site.locator("summary")).toContainText("1 מתוך 2 הושלמו");
  await site.getByRole("button", { name: "עריכת משימה אפיון מסכי האתר" }).click();
  await site.getByRole("textbox", { name: "עריכת שם המשימה" }).fill("אפיון מסכים ותוכן");
  await site.getByRole("button", { name: "שמירת המשימה" }).click();
  await expect(site.getByRole("checkbox", { name: "אפיון מסכים ותוכן" })).toBeChecked();
  await site.getByRole("button", { name: "מחיקת משימה משימה למחיקה" }).click();
  await site.getByRole("button", { name: "ביטול", exact: true }).click();
  await expect(site.getByRole("checkbox", { name: "משימה למחיקה" })).toBeVisible();
  await site.getByRole("button", { name: "מחיקת משימה משימה למחיקה" }).click();
  await site.getByRole("button", { name: "כן, למחוק" }).click();
  await expect(site.getByRole("checkbox")).toHaveCount(1);
  await expect(card(page, "מיתוג העסק").getByRole("checkbox")).toHaveCount(1);

  // A second window updates the same checklist via the real persistence layer.
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "פרויקטים", exact: true }).click();
  const otherSite = await openList(other, "עיצוב האתר");
  await otherSite.getByRole("checkbox", { name: "אפיון מסכים ותוכן" }).uncheck();
  await expect(site.getByRole("checkbox", { name: "אפיון מסכים ותוכן" })).not.toBeChecked();
  await other.close();
  await site.getByRole("button", { name: "עריכת פרויקט עיצוב האתר" }).click();
  await page.getByRole("textbox", { name: "שם הפרויקט", exact: true }).fill("האתר החדש");
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  // A click dispatches the async save; the dialog closes only after its
  // IndexedDB transaction commits. Do not abort that transaction with reload.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(card(page, "האתר החדש")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "פרויקטים", exact: true }).click();
  const renamed = await openList(page, "האתר החדש");
  await expect(renamed.getByRole("checkbox", { name: "אפיון מסכים ותוכן" })).not.toBeChecked();
  await renamed.getByRole("checkbox", { name: "אפיון מסכים ותוכן" }).check();
  await openList(page, "מיתוג העסק");
  await page.screenshot({ path: "../checklist-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.dir)).toBe("rtl");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "../checklist-mobile.png", fullPage: true });

  await page.getByRole("button", { name: "גיבוי והגדרות", exact: true }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "ייצוא גיבוי מלא", exact: true }).click();
  const download = await downloading;
  const bytes = await fs.readFile(await download.path());
  const backup = JSON.parse(bytes.toString("utf8"));
  expect(backup.tasks).toHaveLength(2);
  expect(backup.tasks.find((t) => t.title === "אפיון מסכים ותוכן").completed).toBe(true);

  const clean = await browser.newContext();
  try {
    const restored = await clean.newPage();
    await restored.goto("http://127.0.0.1:5184/");
    await restored.getByRole("button", { name: "גיבוי והגדרות", exact: true }).click();
    for (let i = 0; i < 2; i++) {
      await restored.getByLabel("בחירת קובץ גיבוי לשחזור").setInputFiles({ name: "checklist-backup.json", mimeType: "application/json", buffer: bytes });
      await expect(restored.locator(".import-preview")).toContainText("2 משימות");
      await restored.getByRole("button", { name: "ייבוא ומיזוג", exact: true }).click();
      await expect(restored.locator(".import-preview")).toHaveCount(0);
    }
    await restored.getByRole("button", { name: "פרויקטים", exact: true }).click();
    const restoredSite = await openList(restored, "האתר החדש");
    await expect(restoredSite.getByRole("checkbox")).toHaveCount(1);
    await expect(restoredSite.getByRole("checkbox", { name: "אפיון מסכים ותוכן" })).toBeChecked();
    const restoredBrand = await openList(restored, "מיתוג העסק");
    await expect(restoredBrand.getByRole("checkbox", { name: "Design review עם הלקוח" })).not.toBeChecked();

    // Simulate a real persistence failure: the optimistic check must roll back.
    await restored.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        IDBObjectStore.prototype.put = put;
        throw new DOMException("כשל שמירה לצורך בדיקה", "QuotaExceededError");
      };
    });
    await restoredSite.getByRole("checkbox", { name: "אפיון מסכים ותוכן" }).click();
    await expect(restoredSite.getByRole("alert")).toContainText("כשל שמירה לצורך בדיקה");
    await expect(restoredSite.getByRole("checkbox", { name: "אפיון מסכים ותוכן" })).toBeChecked();
    await restored.reload();
    await restored.getByRole("button", { name: "פרויקטים", exact: true }).click();
    await expect((await openList(restored, "האתר החדש")).getByRole("checkbox", { name: "אפיון מסכים ותוכן" })).toBeChecked();
  } finally { await clean.close(); }
  expect(errors).toEqual([]);
});
