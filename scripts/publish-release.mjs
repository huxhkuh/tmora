// Run only after the Windows job succeeds. Never replace a published payload.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const repository = 'huxhkuh/tmora';
assert.equal(process.env.GITHUB_REPOSITORY, repository);
assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
const commit = process.env.GITHUB_SHA;
assert.match(commit, /^[0-9a-f]{40}$/);
const { version } = JSON.parse(await fs.readFile('package.json', 'utf8'));
assert.match(version, /^\d+\.\d+\.\d+$/);
const tag = `v${version}`;
const notes = `docs/releases/${tag}.md`;
await fs.access(notes);
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const api = endpoint => JSON.parse(gh('api', `repos/${repository}/${endpoint}`));
assert.equal(api('branches/main').commit.sha, commit, 'Main moved: build its new commit before publishing');
// A failed draft upload can be investigated safely. A rerun never overwrites it.
const releases = JSON.parse(gh('api', '--paginate', '--slurp', `repos/${repository}/releases?per_page=100`)).flat();
assert(!releases.some(r => r.tag_name === tag), `${tag} already exists; inspect it rather than replacing assets`);
const tags = JSON.parse(gh('api', '--paginate', '--slurp', `repos/${repository}/tags?per_page=100`)).flat();
assert(!tags.some(t => t.name === tag), `${tag} already exists; do not retarget it`);
const names = ['Temura-Install.exe', 'Bou-Install.exe', `Bou-Time-${version}-x64-Setup.exe`,
  `Bou-Time-${version}-x64-Portable.exe`, `Bou-Time-${version}-x64-Setup.exe.blockmap`,
  'latest.yml', 'windows-release.json', 'SHA256SUMS.txt'];
const expected = await Promise.all(names.map(async name => {
  const bytes = await fs.readFile(path.join('../windows', name));
  return { name, size: bytes.length, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}` };
}));
console.log(gh('release', 'create', tag, ...names.map(n => path.join('../windows', n)),
  '--repo', repository, '--target', commit, '--draft', '--title', `תמורה ${version} — תקציבי שעות ודוחות ללקוח`,
  '--notes-file', notes));
const draft = api(`releases/tags/${tag}`);
assert.equal(draft.draft, true);
assert.equal(draft.target_commitish, commit);
assert.equal(draft.assets.length, names.length);
for (const asset of expected) {
  const uploaded = draft.assets.find(a => a.name === asset.name);
  assert(uploaded, `Missing asset ${asset.name}`);
  assert.equal(uploaded.state, 'uploaded');
  assert.equal(uploaded.size, asset.size, asset.name);
  assert.equal(uploaded.digest, asset.digest, asset.name);
}
assert.equal(api('branches/main').commit.sha, commit, 'Main changed during upload; draft remains unpublished');
gh('release', 'edit', tag, '--repo', repository, '--draft=false', '--latest');
const published = api('releases/latest');
assert.equal(published.tag_name, tag);
assert.equal(published.draft, false);
console.log(`Published ${published.html_url} with all eight verified assets`);
