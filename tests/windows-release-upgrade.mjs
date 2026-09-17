// Real NSIS upgrade only on an ephemeral GitHub-hosted Windows runner.
// Every Electron launch uses a disposable data profile and a COPY of its EXE.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { _electron as electron, expect } from '@playwright/test';
import { flipFuses, FuseVersion, FuseV1Options } from '@electron/fuses';
import { billingDemo } from './fixtures/billing.js';

assert.equal(process.platform, 'win32');
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'This test performs a real installation; use a disposable Actions runner');
assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
const version = JSON.parse(await fs.readFile('package.json', 'utf8')).version;
const root = await fs.mkdtemp(path.resolve('../../work/windows-release-'));
const installed = path.join(root, 'installed');
const profile = path.join(root, 'profile');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const oldName = 'Bou-Time-1.5.5-x64-Setup.exe';
const response = await fetch(`https://github.com/huxhkuh/tmora/releases/download/v1.5.5/${oldName}`, { signal: AbortSignal.timeout(180000) });
assert.equal(response.status, 200);
const oldBytes = Buffer.from(await response.arrayBuffer());
assert.equal(hash(oldBytes), '5da391e4001a4b9aaf97cfcf86cd29be3129c5576ac6213c60cca2598cce8609');
const oldSetup = path.join(root, oldName);
await fs.writeFile(oldSetup, oldBytes);
function install(setup) {
  const result = spawnSync(setup, ['/S', '/currentuser', `/D=${installed}`], { timeout: 180000, windowsHide: true, encoding: 'utf8' });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Installer failed: ${result.stderr}`);
}
async function testCopy(name) {
  const copy = path.join(root, name);
  await fs.cp(installed, copy, { recursive: true });
  const exe = path.join(copy, 'Bou Time.exe');
  await flipFuses(exe, { version: FuseVersion.V1, [FuseV1Options.EnableNodeCliInspectArguments]: true });
  return exe;
}
let app;
async function launch(exe, dataProfile = profile) {
  app = await electron.launch({ executablePath: exe, args: [], timeout: 60000,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, BOU_DESKTOP_TEST: '1', BOU_TEST_PROFILE: dataProfile } });
  const page = await app.firstWindow();
  await expect(page.getByRole('button', { name: 'גיבוי והגדרות', exact: true })).toBeVisible();
  return page;
}
async function put(page, state) {
  await page.evaluate(data => new Promise((resolve, reject) => {
    const request = indexedDB.open('bou-personal-time-v1', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('state', 'readwrite');
      tx.objectStore('state').put(data, 'main');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }), state);
  await page.reload();
}
const read = (page, key = 'main') => page.evaluate(key => new Promise((resolve, reject) => {
  const request = indexedDB.open('bou-personal-time-v1', 1);
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const db = request.result, get = db.transaction('state').objectStore('state').get(key);
    get.onsuccess = () => { db.close(); resolve(get.result); };
    get.onerror = () => { db.close(); reject(get.error); };
  };
}), key);
try {
  install(oldSetup);
  let page = await launch(await testCopy('old-test-copy'));
  assert.equal(await app.evaluate(({ app }) => app.getVersion()), '1.5.5');
  const now = Date.now();
  const seed = {
    version: 1, revision: 10,
    clients: [{ id: 'client', name: 'לקוח בדיקת שדרוג' }],
    projects: [{ id: 'project', clientId: 'client', name: 'שימור נתונים', description: '', archived: false,
      color: '#b94f2a', priceType: 'hourly', price: 250, goal: 10 }],
    tasks: [{ id: 'task', projectId: 'project', title: 'משימה שנשמרה', completed: true }],
    entries: Array.from({ length: 1000 }, (_, i) => ({
      id: `entry-${i}`, projectId: 'project', description: `עבודה היסטורית ${i}`,
      pricing: { type: 'hourly', amount: i % 2 ? 150 : 200 }, createdAt: now - (i + 1) * 3600000,
      segments: [{ start: now - (i + 1) * 3600000, end: now - (i + 1) * 3600000 + 600000 }],
    })),
    timer: { id: 'running', projectId: 'project', description: 'מדידה בזמן שדרוג',
      pricing: { type: 'hourly', amount: 175 }, segments: [], runningSince: now - 90000, createdAt: now - 90000 },
  };
  await put(page, seed);
  await expect(page.getByRole('button', { name: 'השהיה', exact: true })).toBeVisible();
  assert.deepEqual(await read(page), seed);
  await app.close(); app = null;
  const newSetup = path.resolve(`../windows/Bou-Time-${version}-x64-Setup.exe`);
  install(newSetup);
  const expectedAsar = hash(await fs.readFile('../windows/win-unpacked/resources/app.asar'));
  assert.equal(hash(await fs.readFile(path.join(installed, 'resources/app.asar'))), expectedAsar);
  const newExe = await testCopy('new-test-copy');
  page = await launch(newExe);
  assert.equal(await app.evaluate(({ app }) => app.getVersion()), version);
  await expect(page.getByRole('button', { name: 'השהיה', exact: true })).toBeVisible();
  const upgraded = await read(page);
  assert.equal(upgraded.version, 2);
  assert.deepEqual(await read(page, 'before-billing-v2'), seed);
  // Check all original fields independently of the migration implementation.
  assert.deepEqual(upgraded.clients, seed.clients);
  assert.deepEqual(upgraded.tasks, seed.tasks);
  assert.equal(upgraded.entries.length, 1000);
  for (let i = 0; i < seed.entries.length; i++) {
    const { billingStatus, internalNotes, ...original } = upgraded.entries[i];
    assert.deepEqual(original, seed.entries[i]);
    assert.equal(billingStatus, 'unclassified'); assert.equal(internalNotes, '');
  }
  const { billingStatus, internalNotes, ...originalTimer } = upgraded.timer;
  assert.deepEqual(originalTimer, seed.timer);
  assert.equal(billingStatus, 'unclassified'); assert.equal(internalNotes, '');
  const { budgetAlerts, ...originalProject } = upgraded.projects[0];
  assert.deepEqual(originalProject, seed.projects[0]); assert.deepEqual(budgetAlerts, [80, 100]);
  await page.reload();
  await expect(page.getByRole('button', { name: 'השהיה', exact: true })).toBeVisible();
  assert.deepEqual(await read(page), upgraded);
  await app.close(); app = null;
  // Reinstall over the already-compressed files, then reopen the same profile.
  install(newSetup);
  assert.equal(hash(await fs.readFile(path.join(installed, 'resources/app.asar'))), expectedAsar);
  page = await launch(await testCopy('reinstalled-test-copy'));
  await expect(page.getByRole('button', { name: 'השהיה', exact: true })).toBeVisible();
  assert.deepEqual(await read(page), upgraded);
  await app.close(); app = null;

  // Exercise the packaged report under Electron's real origin and CSP.
  page = await launch(newExe, path.join(root, 'report-profile'));
  await put(page, billingDemo());
  await page.getByRole('button', { name: 'דוחות', exact: true }).click();
  await page.getByLabel('מתאריך', { exact: true }).fill('2026-09-14');
  await page.getByLabel('עד תאריך', { exact: true }).fill('2026-09-16');
  await page.getByLabel('פרויקט', { exact: true }).selectOption('demo-project');
  for (const withRates of [true, false]) {
    await page.getByLabel('הצגת תעריפים וסכומים בדוח').setChecked(withRates);
    await page.getByRole('button', { name: 'תצוגה מקדימה', exact: true }).click();
    await expect(page.locator('.client-report tbody tr')).toHaveCount(4);
    if (withRates) await expect(page.locator('.client-report')).toContainText('625.00');
    else await expect(page.locator('.client-report')).not.toContainText('₪');
    const target = path.join(root, `report-${withRates ? 'priced' : 'hours'}`);
    await app.evaluate(({ session }, file) => session.defaultSession.once('will-download', (_e, item) => item.setSavePath(file)), `${target}.html`);
    await page.getByRole('button', { name: 'הורדת דוח HTML', exact: true }).click();
    await expect.poll(() => fs.readFile(`${target}.html`, 'utf8').catch(() => '')).toContain('data:font/woff2;base64,');
    const html = await fs.readFile(`${target}.html`, 'utf8');
    assert(!html.includes('הערה פרטית')); assert(!html.includes('בדיקה פנימית'));
    if (!withRates) { assert(!html.includes('625.00')); assert(!html.includes('תעריף')); }
    await page.evaluate(() => document.fonts.ready);
    const pdf = await app.evaluate(async ({ BrowserWindow }) => [...await BrowserWindow.getAllWindows()[0].webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true })]);
    assert(Buffer.from(pdf).subarray(0, 5).toString() === '%PDF-');
    await fs.writeFile(`${target}.pdf`, Buffer.from(pdf));
    await page.locator('.client-report').screenshot({ path: `${target}.png` });
  }
  console.log(JSON.stringify({ passed: true, from: '1.5.5', to: version, entries: 1000,
    checks: ['real NSIS upgrade and reinstall', 'exact original recovery copy', 'historical prices and running timer',
      'idempotent migration', 'packaged Hebrew report and hours-only export'], evidence: root }));
} finally { if (app) await app.close(); }
