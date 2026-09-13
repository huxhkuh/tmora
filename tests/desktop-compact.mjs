import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
await fs.mkdir("../../work", { recursive: true });
const profile = await fs.mkdtemp(path.resolve("../../work/compact-profile-"));
const options = {
  ...(process.env.BOU_TEST_EXE
    ? { executablePath: process.env.BOU_TEST_EXE, args: [] }
    : { args: [process.cwd()] }),
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: undefined,
    BOU_DESKTOP_TEST: "1",
    BOU_TEST_PROFILE: profile,
  },
};
const data = {
  version: 1,
  revision: 0,
  clients: [{ id: "c", name: "בדיקת צג זעיר" }],
  projects: [
    { id: "a", name: "עיצוב האתר", color: "#b94f2a" },
    { id: "b", name: "פיתוח המערכת", color: "#788463" },
  ].map((p) => ({
    ...p,
    clientId: "c",
    description: "",
    archived: false,
    priceType: "hourly",
    price: 200,
    goal: null,
  })),
  entries: [],
  timer: null,
};
const snapshot = (page) =>
  page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const req = indexedDB.open("bou-personal-time-v1");
      req.onsuccess = () => resolve(req.result);
    });
    return new Promise((resolve) => {
      const req = db.transaction("state").objectStore("state").get("main");
      req.onsuccess = () => {
        db.close();
        resolve(req.result);
      };
    });
  });
let app;
try {
  app = await electron.launch(options);
  let page = await app.firstWindow();
  await page
    .getByRole("button", { name: "גיבוי והגדרות", exact: true })
    .click();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "projects.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(data)),
    });
  await page.getByRole("button", { name: "ייבוא ומיזוג", exact: true }).click();
  await expect(
    page.getByText("הגיבוי מוזג בהצלחה. פריטים קיימים לא שוכפלו."),
  ).toBeVisible();
  await page.getByRole("button", { name: "היום", exact: true }).click();
  await page.getByRole("button", { name: "צג צף", exact: true }).click();
  await expect.poll(() => app.windows().length).toBe(2);
  let child = app.windows().find((w) => w !== page);
  const a = child.getByRole("button", {
    name: "עבודה על עיצוב האתר",
    exact: true,
  });
  const b = child.getByRole("button", {
    name: "עבודה על פיתוח המערכת",
    exact: true,
  });
  await expect(a).toBeVisible();
  await expect(b).toBeVisible();
  // Chromium does not expose custom bou:// fetches in Resource Timing. Its
  // debugger script inventory includes already-loaded dynamic entry chunks.
  const loadedResources = [];
  const scripts = await child.context().newCDPSession(child);
  scripts.on("Debugger.scriptParsed", ({ url }) => loadedResources.push(url));
  await scripts.send("Debugger.enable");
  await scripts.send("Debugger.disable");
  await scripts.detach();
  expect(loadedResources.some(url => /\/App-[^/]+\.js/.test(url))).toBe(false);
  expect(loadedResources.some(url => /\/FloatingApp-[^/]+\.js/.test(url))).toBe(true);
  const size = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes("floating=1"))
        .getContentSize(),
    );
  await expect.poll(size).toEqual([240, 154]);
  expect((await b.boundingBox()).y).toBeGreaterThan((await a.boundingBox()).y);
  await a.click();
  await expect(a).toHaveAttribute("aria-pressed", "true");
  await expect(child.locator(".focus-digits")).not.toHaveText("00:00:00");
  const old = (await snapshot(page)).timer;
  await b.dblclick();
  await expect(b).toHaveAttribute("aria-pressed", "true");
  let s = await snapshot(page);
  expect(s.entries).toHaveLength(1);
  expect(s.entries[0].id).toBe(old.id);
  expect(s.timer.projectId).toBe("b");
  expect(s.entries[0].segments.at(-1).end).toBe(s.timer.runningSince);
  await child.getByRole("button", { name: "השהיה", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "המשך", exact: true }),
  ).toBeVisible();
  await b.click();
  await expect(
    page.getByRole("button", { name: "השהיה", exact: true }),
  ).toBeVisible();
  expect((await snapshot(page)).entries).toHaveLength(1);
  await child.getByRole("button", { name: "הגדלת הצג", exact: true }).click();
  await expect.poll(size).toEqual([340, 217]);
  await child.getByRole("button", { name: "מצב זעיר", exact: true }).click();
  await expect.poll(size).toEqual([240, 154]);
  expect(
    await child.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
  await child.screenshot({ path: "../windows-tiny.png" });
  const running = (await snapshot(page)).timer.id;
  await child
    .getByRole("button", { name: "סגירת הצג הצף", exact: true })
    .click();
  expect((await snapshot(page)).timer.id).toBe(running);
  await app.close();
  app = await electron.launch(options);
  page = await app.firstWindow();
  await expect(
    page.getByRole("button", { name: "השהיה", exact: true }),
  ).toBeVisible();
  expect((await snapshot(page)).timer.id).toBe(running);
  await page.getByRole("button", { name: "עצירה ושמירה", exact: true }).click();
  expect((await snapshot(page)).entries).toHaveLength(2);
  await page.getByRole("button", { name: "גיבוי והגדרות", exact: true }).click();
  await page.getByLabel("שפת הממשק", { exact: true }).selectOption("en");
  await page.getByRole("radio", { name: "Forest", exact: true }).check();
  await page.getByRole("button", { name: "Floating timer", exact: true }).click();
  await expect.poll(() => app.windows().length).toBe(2);
  child = app.windows().find((w) => w !== page);
  await expect(child.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(child.locator("html")).toHaveAttribute("data-theme", "forest");
  await page.getByRole("radio", { name: "Dark", exact: true }).check();
  await expect(child.locator("html")).toHaveAttribute("data-mode", "dark");
  await child.getByRole("button", { name: "Switch to light display", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Light", exact: true })).toBeChecked();
  await child.getByRole("button", { name: "Switch to dark display", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Dark", exact: true })).toBeChecked();
  // Respect the deliberate 600 ms protection against a stop/start double-click.
  await expect.poll(async () => Date.now() - (await snapshot(page)).lastStoppedAt).toBeGreaterThanOrEqual(600);
  await child.getByRole("button", { name: "Work on עיצוב האתר", exact: true }).click();
  await expect(child.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  expect(await child.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await child.screenshot({ path: "../windows-tiny-english.png" });
  await page.getByLabel("Interface language", { exact: true }).selectOption("he");
  await expect(child.locator("html")).toHaveAttribute("dir", "rtl");
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()
    .find(w => !w.webContents.getURL().includes("floating=1")).minimize());
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()
    .find(w => !w.webContents.getURL().includes("floating=1")).isMinimized())).toBe(true);
  const clockBefore = await child.locator('.focus-digits').textContent();
  await expect(child.locator('.focus-digits')).not.toHaveText(clockBefore, { timeout: 4000 });
  await app.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find(w => !w.webContents.getURL().includes("floating=1"));
    main.restore(); main.show();
  });
  await child.getByRole("button", { name: "עצירה ושמירה", exact: true }).click();
  await child.getByRole("button", { name: "סגירת הצג הצף", exact: true }).click();
  console.log(
    JSON.stringify({
      passed: true,
      packaged: await app.evaluate(({ app }) => app.isPackaged),
      checks: [
        "240x154 native size",
        "stacked projects",
        "switch boundary exact",
        "double click safe",
        "paused project resumes",
        "340x217 expanded size",
        "no overflow",
        "close and restart persistence",
        "English tiny layout and live language/theme/mode sync in both directions",
        "native main minimizes while floating time continues, then restores",
      ],
    }),
  );
} finally {
  if (app) await app.close();
}
