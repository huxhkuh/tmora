import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

// Exercise the real publisher in a child process. Its GitHub CLI transport is
// replaced before import, so no test can create a real release or upload files.
const mock = `
const cp = require('node:child_process');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
let created = false, branches = 0;
const scenario = process.env.RELEASE_TEST_SCENARIO;
const draft = () => {
  const names = fs.readdirSync('../windows');
  const assets = names.map(name => {
    const bytes = fs.readFileSync('../windows/' + name);
    return { name, size: bytes.length, state: 'uploaded', digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex') };
  });
  if (scenario === 'bad-digest') assets[0].digest = 'sha256:wrong';
  if (scenario === 'missing-upload') assets.pop();
  return { tag_name: 'v1.6.0', draft: true, target_commitish: process.env.GITHUB_SHA, assets };
};
cp.execFileSync = (command, args) => {
  if (command !== 'gh') throw Error('Unexpected executable');
  fs.appendFileSync('calls.jsonl', JSON.stringify(args) + '\\n');
  if (args[0] === 'api') {
    const endpoint = args.at(-1);
    if (endpoint.endsWith('/branches/main')) {
      branches++;
      return JSON.stringify({ commit: { sha: scenario === 'moved-main' || (scenario === 'moved-during-upload' && branches > 1) ? 'f'.repeat(40) : process.env.GITHUB_SHA } });
    }
    if (endpoint.endsWith('/releases?per_page=100')) return JSON.stringify([created ? [draft()] : scenario === 'existing-release' ? [{ tag_name: 'v1.6.0', draft: false }] : []]);
    if (endpoint.endsWith('/tags?per_page=100')) return JSON.stringify([[]]);
    if (endpoint.endsWith('/releases/latest')) return JSON.stringify({ tag_name: 'v1.6.0', draft: false, html_url: 'https://example.invalid/release' });
  }
  if (args[0] === 'release' && args[1] === 'create') { created = true; return 'draft'; }
  if (args[0] === 'release' && args[1] === 'edit') return '';
  throw Error('Unexpected GitHub command: ' + JSON.stringify(args));
};
require('node:module').syncBuiltinESMExports();
`;
for (const scenario of ['success', 'bad-digest', 'missing-upload', 'existing-release', 'moved-main', 'moved-during-upload']) {
  test(`release publisher: ${scenario}`, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'temura-publish-test-'));
    const repo = path.join(root, 'repo');
    try {
      await fs.mkdir(path.join(repo, 'docs/releases'), { recursive: true });
      await fs.mkdir(path.join(root, 'windows'));
      await fs.writeFile(path.join(repo, 'package.json'), JSON.stringify({ version: '1.6.0' }));
      await fs.writeFile(path.join(repo, 'docs/releases/v1.6.0.md'), 'Test notes');
      await fs.writeFile(path.join(repo, 'mock.cjs'), mock);
      const names = ['Temura-Install.exe', 'Bou-Install.exe', 'Bou-Time-1.6.0-x64-Setup.exe',
        'Bou-Time-1.6.0-x64-Portable.exe', 'Bou-Time-1.6.0-x64-Setup.exe.blockmap',
        'latest.yml', 'windows-release.json', 'SHA256SUMS.txt'];
      for (const name of names) await fs.writeFile(path.join(root, 'windows', name), `test-${name}`);
      const result = spawnSync(process.execPath, ['--require', './mock.cjs', path.resolve('scripts/publish-release.mjs')], {
        cwd: repo, encoding: 'utf8', timeout: 10000,
        env: { ...process.env, GITHUB_REPOSITORY: 'huxhkuh/tmora', GITHUB_REF: 'refs/heads/main',
          GITHUB_SHA: 'a'.repeat(40), RELEASE_TEST_SCENARIO: scenario },
      });
      assert.ifError(result.error);
      const calls = (await fs.readFile(path.join(repo, 'calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
      const creates = calls.filter(c => c[0] === 'release' && c[1] === 'create');
      const publishes = calls.filter(c => c[0] === 'release' && c[1] === 'edit');
      assert.equal(result.status === 0, scenario === 'success', result.stderr);
      assert.equal(publishes.length, scenario === 'success' ? 1 : 0);
      if (scenario === 'existing-release' || scenario === 'moved-main') assert.equal(creates.length, 0);
      else {
        assert.equal(creates.length, 1);
        assert(creates[0].includes('--draft'));
        assert.equal(creates[0].filter(a => names.some(n => a === path.join('../windows', n))).length, 8);
      }
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });
}
