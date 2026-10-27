// Versioning for Stomake.
//   pnpm release <patch|minor|major|x.y.z> [--push]
//     bumps package.json + src-tauri/Cargo.toml(.lock), moves CHANGELOG "Unreleased" into the new
//     version, commits "release: vX.Y.Z" and tags vX.Y.Z. --push also pushes the commit and tag,
//     which starts the GitHub Actions release build.
//   node scripts/release.mjs notes <x.y.z>
//     prints that version's CHANGELOG section (the GitHub Release description).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const CHANGELOG = 'CHANGELOG.md';
const SEMVER = /^\d+\.\d+\.\d+$/;
const [cmd, ...rest] = process.argv.slice(2);

function fail(msg) {
  console.error(`release: ${msg}`);
  process.exit(1);
}

/** body of the `## [heading]` section, up to the next `## ` heading */
function section(text, heading) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## [${heading}]`));
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  return { start, end: end < 0 ? lines.length : end, body: lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim() };
}

if (cmd === 'notes') {
  const version = rest[0]?.replace(/^v/, '');
  if (!version || !SEMVER.test(version)) fail('usage: node scripts/release.mjs notes <x.y.z>');
  const s = section(readFileSync(CHANGELOG, 'utf8'), version);
  if (!s?.body) fail(`CHANGELOG.md has no entries for ${version}`);
  console.log(s.body);
  process.exit(0);
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const push = rest.includes('--push');
if (!cmd) fail('usage: pnpm release <patch|minor|major|x.y.z> [--push]');
if (git('status', '--porcelain')) fail('working tree is not clean; commit or stash first');

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);
const next =
  cmd === 'major' ? `${major + 1}.0.0` : cmd === 'minor' ? `${major}.${minor + 1}.0` : cmd === 'patch' ? `${major}.${minor}.${patch + 1}` : cmd.replace(/^v/, '');
if (!SEMVER.test(next)) fail(`not a version: ${cmd}`);
if (git('tag', '--list', `v${next}`)) fail(`tag v${next} already exists`);

const log = readFileSync(CHANGELOG, 'utf8');
const unreleased = section(log, 'Unreleased');
if (!unreleased?.body) fail('CHANGELOG.md "## [Unreleased]" is empty; describe the changes first');
const lines = log.split('\n');
const date = new Date().toISOString().slice(0, 10);
lines.splice(unreleased.start, unreleased.end - unreleased.start, '## [Unreleased]', '', `## [${next}] - ${date}`, '', unreleased.body, '');
writeFileSync(CHANGELOG, lines.join('\n'));

pkg.version = next;
writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const cargo = 'src-tauri/Cargo.toml';
writeFileSync(cargo, readFileSync(cargo, 'utf8').replace(/^version = ".*"$/m, `version = "${next}"`));
const lock = 'src-tauri/Cargo.lock';
writeFileSync(lock, readFileSync(lock, 'utf8').replace(/(name = "stomake"\nversion = )".*"/, `$1"${next}"`));

git('add', 'package.json', CHANGELOG, cargo, lock);
git('commit', '-m', `release: v${next}`);
git('tag', '-a', `v${next}`, '-m', `Stomake v${next}`);
console.log(`v${next} committed and tagged`);
if (push) {
  git('push', '--follow-tags');
  console.log('pushed; GitHub Actions is building the installers');
} else {
  console.log('push with: git push --follow-tags');
}
