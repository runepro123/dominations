#!/usr/bin/env node
// Sync the version field in package.json AND src-tauri/tauri.conf.json.
//
// Usage:
//   node scripts/release-version.mjs           # bumps patch from current
//   node scripts/release-version.mjs 1.2.0    # sets explicit
//
// Both files must agree on the version — Tauri reads tauri.conf.json's
// `version` field at build time and uses it to populate the in-binary
// app version (what getVersion() returns). package.json's version is the
// one humans / GitHub look at, so they must stay in lockstep.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = path.join(repoRoot, 'package.json');
const tauriPath = path.join(repoRoot, 'src-tauri', 'tauri.conf.json');

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function writeJSON(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

const arg = process.argv[2];
const pkg = readJSON(pkgPath);
const current = pkg.version || '0.0.0';

let next;
if (!arg) {
  const parts = current.split('.').map((n) => Number.parseInt(n, 10));
  const major = Number.isFinite(parts[0]) ? parts[0] : 0;
  const minor = Number.isFinite(parts[1]) ? parts[1] : 0;
  const patch = Number.isFinite(parts[2]) ? parts[2] : 0;
  next = `${major}.${minor}.${patch + 1}`;
} else {
  if (!/^\d+\.\d+\.\d+(?:[-+][\w.]+)?$/.test(arg)) {
    console.error(`Not a valid SemVer: "${arg}"`);
    process.exit(1);
  }
  next = arg;
}

pkg.version = next;
writeJSON(pkgPath, pkg);

const tauri = readJSON(tauriPath);
tauri.version = next;

// Rewrite the hardcoded `/v<X.Y.Z>/` segment in
// `plugins.updater.endpoints[]` so the per-tag fallback URL follows the
// bump. The `releases/download/v<X.Y.Z>/` URL is the version-pinned
// fallback clients built from THIS version fall through to when the
// `releases/latest` URL is stale or down. Keeping it in sync means
// clients update against the correct manifest path on the next launch.
if (Array.isArray(tauri.plugins?.updater?.endpoints)) {
  const fromSeg = `releases/download/v${current}/`;
  const toSeg = `releases/download/v${next}/`;
  tauri.plugins.updater.endpoints = tauri.plugins.updater.endpoints.map(
    (ep) => typeof ep === 'string' && ep.includes(fromSeg) ? ep.replace(fromSeg, toSeg) : ep,
  );
}

writeJSON(tauriPath, tauri);

console.log('');
console.log(`Synced version ${current} -> ${next}`);
console.log(`  ${path.relative(repoRoot, pkgPath)}`);
console.log(`  ${path.relative(repoRoot, tauriPath)}`);
console.log('');
console.log('Next steps:');
console.log(`  1. Update CHANGELOG.md — move [Unreleased] into [${next}]`);
console.log(`  2. git add . && git commit -m "Release v${next}"`);
console.log(`  3. git tag v${next} && git push origin v${next}`);
console.log('');
