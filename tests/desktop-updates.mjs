// Real NSIS differential download + installation, using only build-update-qa's
// isolated application identity. --install explicitly opts into the QA install.
import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import http from "node:http";
import { createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { fresh } from "../src/domain.js";
if (!process.argv.includes("--install")) throw Error("Pass --install to install the isolated QA application.");
const root = (await fs.readFile("../../work/latest-update-qa.txt", "utf8")).trim();
if (!root.startsWith(path.resolve("../../work/update-qa-"))) throw Error("QA path outside workspace");
const descriptor = JSON.parse(await fs.readFile(path.join(root, "qa.json"), "utf8"));
if (!/^temura-update-qa-update-qa-[a-z0-9]+$/.test(descriptor.name) || descriptor.cache !== path.join(process.env.LOCALAPPDATA, `${descriptor.name}-updater`)) throw Error("Unexpected QA identity");
const installDir = path.join(root, "installed");
const exe = path.join(installDir, "Temura Update QA.exe");
const profile = descriptor.profile;
if (profile !== path.join(root, "profile")) throw Error("Expected a baked-in isolated QA profile");
// Preserve only this harness's previous state when rerunning, so a previous
// successful/cancelled download cannot influence differential byte counts.
for (const [source, label] of [[profile, "profile"], [descriptor.cache, "cache"]]) {
  try { await fs.rename(source, path.join(root, `${label}-previous-${Date.now()}`)); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}
const run = (file, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(file, args, { windowsHide: true, ...options });
  child.on("error", reject); child.on("exit", (code) => code === 0 ? resolve() : reject(Error(`Process failed: ${code}`)));
});
const hash = async (file) => createHash("sha512").update(await fs.readFile(file)).digest("base64");
const payload = path.join(root, "9.0.1", "Bou-Time-9.0.1-x64-Setup.exe");
const fullSize = (await fs.stat(payload)).size;
let mode = "current", payloadBytes = 0, ranges = 0;
const server = http.createServer(async (req, res) => {
  try {
    const name = path.basename(new URL(req.url, "http://localhost").pathname);
    if (mode === "offline") { res.writeHead(503); res.end("QA offline"); return; }
    if (name === "latest.yml") {
      const v = mode === "current" ? "9.0.0" : "9.0.1";
      let metadata = await fs.readFile(path.join(root, v, "latest.yml"), "utf8");
      if (mode === "bad-hash") metadata = metadata.replace(/sha512: .+/g, `sha512: ${Buffer.alloc(64).toString("base64")}`);
      res.end(metadata); return;
    }
    if (!/^Bou-Time-9\.0\.[01]-x64-Setup\.exe(\.blockmap)?$/.test(name)) { res.writeHead(404); res.end(); return; }
    const v = name.includes("9.0.0") ? "9.0.0" : "9.0.1";
    const file = path.join(root, v, name);
    const stat = await fs.stat(file);
    const match = mode === "ignore-range" ? null : /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || "");
    const start = match ? Number(match[1]) : 0, end = match?.[2] ? Number(match[2]) : stat.size - 1;
    if (match) { ranges++; res.statusCode = 206; res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`); }
    res.setHeader("Content-Length", end - start + 1); res.setHeader("Accept-Ranges", "bytes");
    const stream = createReadStream(file, { start, end, highWaterMark: 64 * 1024 });
    res.on("close", () => stream.destroy());
    for await (const chunk of stream) {
      if (res.destroyed) break;
      if (name.endsWith(".exe")) payloadBytes += chunk.length;
      res.write(chunk);
      if (mode === "slow" && name.endsWith(".exe")) await new Promise((r) => setTimeout(r, 100));
    }
    res.end();
  } catch { if (!res.headersSent) res.writeHead(500); res.end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const env = { ...process.env, ELECTRON_RUN_AS_NODE: undefined, BOU_DESKTOP_TEST: "1", BOU_TEST_PROFILE: profile };
let app, page;
const errors = [];
async function launch() {
  app = await electron.launch({ executablePath: exe, args: [], env });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await app.evaluate(({ app }, url) => {
    const load = process.getBuiltinModule("module").createRequire(app.getAppPath() + "/package.json");
    const u = load("electron-updater").autoUpdater;
    u.setFeedURL({ provider: "generic", url, useMultipleRangeRequest: false });
  }, url);
  await page.getByRole("button", { name: "גיבוי והגדרות", exact: true }).click();
}
const section = () => page.locator(".desktop-updates");
const check = () => section().getByRole("button", { name: "בדיקת עדכונים" }).click();
const download = () => section().getByRole("button", { name: "הורדת העדכון" }).click();
try {
  await run(path.join(root, "9.0.0", "Bou-Time-9.0.0-x64-Setup.exe"), ["/S", "/currentuser", `/D=${installDir}`], { env });
  expect(await hash(path.join(descriptor.cache, "installer.exe"))).toBe(await hash(path.join(root, "9.0.0", "Bou-Time-9.0.0-x64-Setup.exe")));
  console.log("QA installation and seeded cache verified");
  await launch();
  await check(); await expect(section()).toContainText("אתה משתמש בגרסה העדכנית");
  mode = "offline"; await check(); await expect(section()).toContainText("העדכון לא הושלם");
  mode = "slow"; await check(); await download();
  await section().getByRole("button", { name: "ביטול הורדה" }).click();
  await expect(section()).toContainText("ההורדה בוטלה", { timeout: 30000 });
  mode = "new"; payloadBytes = 0; ranges = 0;
  await check(); await download();
  await expect(section()).toContainText("העדכון מוכן להתקנה", { timeout: 120000 });
  const downloadedPath = await app.evaluate(({ app }) => process.getBuiltinModule("module").createRequire(app.getAppPath() + "/package.json")("electron-updater").autoUpdater.installerPath);
  expect(await hash(downloadedPath)).toBe(await hash(payload));
  expect(ranges).toBeGreaterThan(0); expect(payloadBytes).toBeLessThan(fullSize / 2);
  const delta = { payloadBytes, fullSize, ranges, savedPercent: Math.round((1 - payloadBytes / fullSize) * 100) };
  console.log(JSON.stringify({ differentialDownload: delta }));
  await page.screenshot({ path: path.join(root, "updates-ready.png") });
  // Seed realistic persisted data including a running timer, with a task.
  const seed = fresh();
  seed.clients = [{ id: "c", name: "בדיקת שדרוג" }];
  seed.projects = [{ id: "p", clientId: "c", name: "נתונים לשימור", color: "#b94f2a", description: "", archived: false, priceType: "hourly", price: 250, goal: null }];
  seed.tasks = [{ id: "t", projectId: "p", title: "לשמור משימה בעדכון", completed: true }];
  await page.locator("input[type=file]").setInputFiles({ name: "seed.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(seed)) });
  await page.getByRole("button", { name: "ייבוא ומיזוג", exact: true }).click();
  await expect(page.locator(".import-preview")).toHaveCount(0);
  await page.getByRole("button", { name: "היום", exact: true }).click();
  // Use the main timer's accessible action, avoiding floating window shortcuts.
  await page.getByRole("button", { name: "התחל מדידה", exact: true }).click();
  await page.getByRole("button", { name: "גיבוי והגדרות", exact: true }).click();
  const readData = () => page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open("bou-personal-time-v1", 1);
    req.onsuccess = () => { const db = req.result; const get = db.transaction("state").objectStore("state").get("main"); get.onsuccess = () => { resolve(get.result); db.close(); }; get.onerror = reject; }; req.onerror = reject;
  }));
  const before = await readData(); expect(before.timer.runningSince).toBeGreaterThan(0);
  // Normal exit must not install a downloaded update.
  await app.close(); app = null;
  await launch();
  expect(await app.evaluate(({ app }) => app.getVersion())).toBe("9.0.0");
  payloadBytes = 0;
  await check(); await download();
  await expect(section()).toContainText("העדכון מוכן להתקנה", { timeout: 30000 });
  expect(payloadBytes).toBe(0);
  await app.close(); app = null;
  await launch();
  mode = "bad-hash";
  await check(); await download();
  await expect(section()).toContainText("העדכון לא הושלם", { timeout: 120000 });
  await expect(section().getByRole("button", { name: "התקנה והפעלה מחדש" })).toHaveCount(0);
  mode = "ignore-range"; payloadBytes = 0;
  await check(); await download();
  await expect(section()).toContainText("העדכון מוכן להתקנה", { timeout: 120000 });
  expect(await hash(downloadedPath)).toBe(await hash(payload));
  expect(payloadBytes).toBeLessThan(fullSize * 1.2);
  console.log("Server ignored Range: promptly aborted partial response and verified full fallback");
  await app.close(); app = null; await launch(); mode = "bad-hash";
  await check(); await download(); await expect(section()).toContainText("העדכון לא הושלם", { timeout: 120000 });
  // Simulate a user/cleaner clearing the installer cache: a full, verified
  // download must still work. Only move the test application's cache file.
  const cacheInstaller = path.join(descriptor.cache, "installer.exe");
  const cacheSaved = path.join(descriptor.cache, "qa-saved-installer.exe");
  await fs.rename(cacheInstaller, cacheSaved);
  mode = "new"; payloadBytes = 0;
  await check(); await download(); await expect(section()).toContainText("העדכון מוכן להתקנה", { timeout: 120000 });
  expect(payloadBytes).toBeGreaterThanOrEqual(fullSize);
  await fs.rename(cacheSaved, cacheInstaller);
  console.log("Cache reuse, corrupt hash rejection and full-download fallback verified");
  const installFile = await app.evaluate(({ app }) => process.getBuiltinModule("module").createRequire(app.getAppPath() + "/package.json")("electron-updater").autoUpdater.installerPath);
  expect(installFile.startsWith(descriptor.cache + path.sep)).toBe(true);
  const changedFile = await fs.open(installFile, "r+");
  try { await changedFile.write(Buffer.from([0]), 0, 1, 0); } finally { await changedFile.close(); }
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); });
  await section().getByRole("button", { name: "התקנה והפעלה מחדש" }).click();
  await expect(section()).toContainText("העדכון לא הושלם", { timeout: 30000 });
  expect(await app.evaluate(({ app }) => app.getVersion())).toBe("9.0.0");
  await fs.copyFile(payload, installFile);
  await check(); await download();
  await expect(section()).toContainText("העדכון מוכן להתקנה", { timeout: 30000 });
  console.log("Installer modified after download was rejected before execution");
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }); });
  await section().getByRole("button", { name: "התקנה והפעלה מחדש" }).click();
  await expect(section().getByRole("button", { name: "התקנה והפעלה מחדש" })).toBeEnabled();
  expect(await app.evaluate(({ app }) => app.getVersion())).toBe("9.0.0");
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); });
  const previousApp = app;
  await section().getByRole("button", { name: "התקנה והפעלה מחדש" }).click();
  // NSIS's relaunched child can keep the old Playwright process pipes open.
  // Verify the actual new package and window instead of waiting for pipe EOF.
  app = null;
  console.log("Explicit in-app installation launched; waiting for upgraded QA application");
  await expect.poll(async () => {
    const { extractFile, uncacheAll } = await import("@electron/asar");
    // The installer replaces this archive in place. Its header/offsets may be
    // completely different after pruning dependencies; never reuse old metadata.
    uncacheAll();
    try { return JSON.parse(extractFile(path.join(installDir, "resources/app.asar"), "package.json").toString()).version; } catch { return null; }
  }, { timeout: 120000 }).toBe("9.0.1");
  // Wait for the updater's automatic relaunch, then politely close this QA EXE
  // only. Never target the user's Bou Time.exe or an unscoped process name.
  const script = `$p = Get-Process | Where-Object { $_.Path -eq '${exe.replace(/'/g, "''")}' -and $_.MainWindowHandle -ne 0 }; if (!$p) { exit 1 }; $p | ForEach-Object { [void]$_.CloseMainWindow(); $_.WaitForExit(15000) | Out-Null }`;
  await expect.poll(async () => { try { await run("powershell.exe", ["-NoProfile", "-Command", script]); return true; } catch { return false; } }, { timeout: 60000 }).toBe(true);
  await previousApp.close().catch(() => {});
  await launch();
  expect(await app.evaluate(({ app }) => app.getVersion())).toBe("9.0.1");
  expect(await readData()).toEqual(before);
  await check(); await expect(section()).toContainText("אתה משתמש בגרסה העדכנית");
  expect(errors).toEqual([]);
  if (process.env.BOU_VERIFY_COMPRESSION === "1") {
    const measure = () => JSON.parse(execFileSync(process.env.BOU_PERF_PYTHON,
      ["scripts/windows-disk.py", installDir], { encoding: "utf8", windowsHide: true }));
    const verifyFiles = async () => {
      for (const file of ["Temura Update QA.exe", "resources/app.asar", "icudtl.dat", "LICENSES.chromium.html"])
        expect(await hash(path.join(installDir, file))).toBe(await hash(path.join(root, "9.0.1/win-unpacked", file)));
    };
    const disk = measure();
    expect(disk.logical - disk.physical).toBeGreaterThan(100_000_000);
    await verifyFiles();
    await app.close(); app = null;
    // Reinstall over already-compressed files, then verify byte contents, state,
    // relaunch and that the new installation remains compressed.
    await run(payload, ["/S", "/currentuser", `/D=${installDir}`]);
    await launch();
    expect(await readData()).toEqual(before);
    await verifyFiles();
    const reinstalled = measure();
    expect(reinstalled.logical - reinstalled.physical).toBeGreaterThan(100_000_000);
    await fs.writeFile(path.join(root, "disk.json"), JSON.stringify({ disk, reinstalled }, null, 2));
    console.log(JSON.stringify({ compressedInstallVerified: true, logical: disk.logical, physical: disk.physical,
      reinstallOverCompressedFiles: true, hashesAndDataUnchanged: true }));
  }
  await fs.writeFile(path.join(root, "result.json"), JSON.stringify({ passed: true, delta, checks: ["real cache seeded by NSIS", "no update", "network error", "server ignores Range: immediate verified full fallback", "cancel/retry", "differential SHA-512 verified", "normal exit does not install", "ready download reused after restart without payload transfer", "corrupt download rejected", "missing cache falls back to full download", "installer modified after download rejected before execution", "defer restart", "real NSIS update and automatic relaunch", "client/project/task/running timer unchanged"] }, null, 2));
  console.log(JSON.stringify({ passed: true, delta, root }));
} finally {
  if (app) await app.close();
  server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
}
