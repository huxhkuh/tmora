import { upgradeState } from "../src/billing-model.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { fresh, validateBackup, mergeBackup, csv } from "../src/domain.js";
const load = createRequire(import.meta.url);
const { appURL, updateIdentity, verifyInstaller } = load("../desktop/security.cjs");
const { createUpdates } = load("../desktop/updates.cjs");
const fixture = () => ({ ...fresh(), clients: [{ id: "c", name: "לקוח" }], projects: [{ id: "p", name: "פרויקט", clientId: "c", color: "#123456", description: "", archived: false, priceType: "none", price: null, goal: null }], entries: [{ id: "e", projectId: "p", description: "", createdAt: 1000, pricing: { type: "none", amount: null }, segments: [{ start: 1000, end: 2000 }] }] });
const metadata = () => ({ version: "1.4.2", tag: "v1.4.2", path: "Bou-Time-1.4.2-x64-Setup.exe", sha512: Buffer.alloc(64, 2).toString("base64"), files: [{ url: "Bou-Time-1.4.2-x64-Setup.exe", size: 2000000, sha512: Buffer.alloc(64, 2).toString("base64") }] });

test("only exact local app documents qualify for navigation/IPC", () => {
  for (const good of ["bou://app/", "bou://app/?floating=1", "bou://app/index.html#projects"]) assert.equal(appURL(good), true);
  for (const bad of ["garbage", "https://app/", "file:///app/", "bou://app.evil/", "bou://evil@app/", "bou://app:99/", "bou://app/assets/evil.html", "javascript:alert(1)", "data:text/html,hi"]) assert.equal(appURL(bad), false, bad);
});
test("update metadata must describe one bounded official stable setup, not arbitrary executable URLs", () => {
  assert.equal(updateIdentity(metadata()).version, "1.4.2");
  for (const modify of [
    (m) => m.files[0].url = "https://evil.invalid/payload.exe",
    (m) => m.files[0].url = "../payload.exe",
    (m) => m.tag = "v1.4.1",
    (m) => m.version = "1.4.2-beta",
    (m) => m.files[0].size = 2 ** 40,
    (m) => m.files[0].sha512 = "invalid",
    (m) => m.files.push(m.files[0]),
    (m) => m.path = "alternate.exe",
  ]) { const m = metadata(); modify(m); assert.throws(() => updateIdentity(m)); }
});
test("installer recheck accepts matching bytes and rejects same-size cache replacement and truncation", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "temura-security-"));
  const file = path.join(dir, "update.exe");
  const data = Buffer.from("verified release bytes");
  const expected = { size: data.length, sha512: createHash("sha512").update(data).digest("base64") };
  try {
    await fs.writeFile(file, data); await verifyInstaller(file, expected);
    await fs.writeFile(file, Buffer.alloc(data.length, 1)); await assert.rejects(verifyInstaller(file, expected));
    await fs.writeFile(file, "short"); await assert.rejects(verifyInstaller(file, expected));
    await assert.rejects(verifyInstaller("relative.exe", expected));
  } finally { await fs.rm(file, { force: true }); await fs.rmdir(dir); }
});
test("a downloaded update changed before confirmation cannot trigger installation", async () => {
  const updater = new EventEmitter(); let installed = false, verified = false;
  updater.checkForUpdates = async () => ({ isUpdateAvailable: true, updateInfo: metadata() });
  updater.downloadUpdate = async () => [];
  updater.quitAndInstall = () => { installed = true; };
  const c = createUpdates({ updater, version: "1.4.1", publish() {}, validateUpdate: updateIdentity, confirmInstall: async () => true, verifyDownloaded: async () => { verified = true; throw Error("tampered"); } });
  await c.action("check"); await c.action("download"); await c.action("install");
  assert.equal(verified, true); assert.equal(installed, false); assert.equal(c.snapshot().phase, "error");
});
test("hostile backups reject prototype keys, null records, deep nesting and unrenderable timestamps without changing data", () => {
  const prototype = JSON.parse(JSON.stringify(fixture()).replace('"name":"לקוח"', '"name":"לקוח","__proto__":{"polluted":true}'));
  let nested = {}; const deep = nested;
  for (let i = 0; i < 30; i++) { nested.next = {}; nested = nested.next; }
  const hugeDate = fixture(); hugeDate.entries[0].createdAt = 1e100;
  const running = fixture(); running.timer = { ...running.entries[0], id: "timer", runningSince: 1e100 };
  for (const bad of [prototype, { ...fixture(), clients: [null] }, { ...fixture(), extra: deep }, hugeDate, running]) {
    const target = fresh(); assert.throws(() => mergeBackup(target, bad)); assert.deepEqual(target, fresh());
  }
  assert.equal({}.polluted, undefined);
  assert.deepEqual(validateBackup(fixture()), upgradeState(fixture()));
});
test("CSV neutralizes spreadsheet formulas even after whitespace and control characters", () => {
  for (const text of ["=1+1", "  =1+1", "\n=1+1", "\t@SUM(1)", "\r+1", " -1+2"]) {
    const s = fixture(); s.clients[0].name = text;
    const exported = csv(s.entries, s);
    assert.ok(exported.includes(`"'${text}"`), JSON.stringify(text));
  }
});
