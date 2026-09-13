import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
const profile = await fs.mkdtemp(path.resolve("../../work/lazy-updater-"));
const exe = (await fs.readFile("../../work/security-test-exe.txt", "utf8")).trim();
const app = await electron.launch({ executablePath: exe, args: [], env: {
  ...process.env, ELECTRON_RUN_AS_NODE: undefined, BOU_DESKTOP_TEST: "1", BOU_TEST_PROFILE: profile,
} });
try {
  const page = await app.firstWindow();
  const loaded = () => app.evaluate(({ app }) => {
    const load = process.getBuiltinModule("module").createRequire(app.getAppPath() + "/package.json");
    return Object.keys(load.cache).some(file => file.includes("electron-updater"));
  });
  await page.getByRole("button", { name: "גיבוי והגדרות", exact: true }).click();
  expect(await loaded()).toBe(false);
  await page.getByRole("button", { name: "בדיקת עדכונים", exact: true }).click();
  await expect.poll(loaded).toBe(true);
  await expect.poll(async () => (await page.evaluate(() => window.bouDesktop.getUpdateStatus())).phase,
    { timeout: 90000 }).toBe("current");
  expect(await app.evaluate(({ app }) => {
    const u = process.getBuiltinModule("module").createRequire(app.getAppPath() + "/package.json")("electron-updater").autoUpdater;
    return [u.autoDownload, u.autoInstallOnAppQuit, u.allowDowngrade, u.allowPrerelease, u.disableWebInstaller];
  })).toEqual([false, false, false, false, true]);
  console.log(JSON.stringify({ passed: true, checks: ["updater absent at startup and settings", "loaded only after explicit check", "real public feed check", "all update safeguards retained"], profile }));
} finally { await app.close(); }
