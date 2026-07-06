#!/usr/bin/env node
/**
 * Build the Tauri 2 updater manifest (`latest.json`) and emit it next
 * to the repo root. Single-pass (no merge): scans local *.sig files
 * emitted by `cargo tauri build` and emits one latest.json with every
 * platform-specific signature found.
 *
 * Release workflow (LOCAL - no CI):
 *   1. `npm run release:local` runs `cargo tauri build` to produce
 *      signed installers under src-tauri/target/release/bundle/{nsis,appimage}/.
 *   2. This script reads the *.sig files from each bundle subdir and
 *      emits a Tauri 2 latest.json whose `platforms.<plat>.url` points
 *      at `https://github.com/<repo>/releases/download/<tag>/`.
 *   3. The user drags-and-drops latest.json + the binaries onto the
 *      GitHub Release matching that tag (via web UI).
 *
 * Tauri v2 latest.json schema (per tauri-plugin-updater):
 *   {
 *     "version":    "<semver, no leading 'v'>",
 *     "notes":      "<release notes>",
 *     "pub_date":   "<RFC3339 timestamp>",
 *     "platforms":  {
 *       "linux-x86_64":   { "signature": "<minisign sig text>", "url": "..." },
 *       "windows-x86_64": { "signature": "<minisign sig text>", "url": "..." }
 *     }
 *   }
 *
 * The `signature` field is the LITERAL text of the .sig file (including
 * the `untrusted comment:` line). Tauri's minisign-verify parses the
 * full text - DO NOT base64-encode.
 *
 * Required input (env OR --flag):
 *   TAG_NAME             e.g. v1.0.2        (env or --tag <vX.Y.Z>)
 *   GITHUB_REPOSITORY    e.g. owner/repo    (env or --repo <owner/repo>; default runepro123/dominations)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const bundleDir = path.join(repoRoot, 'src-tauri/target/release/bundle');

// Map a `cargo tauri build` bundle subdirectory to the platform key
// Tauri uses in latest.json. Extend here if more bundle types ship
// (deb, rpm, msi, app, dmg) - values are Tauri 2's exact strings.
const DIR_TO_PLATFORM = {
  appimage: 'linux-x86_64',
  nsis:     'windows-x86_64',
  deb:      'linux-x86_64',
  rpm:      'linux-x86_64',
  msi:      'windows-x86_64',
  app:      'darwin-x86_64',
};

// Allow either env vars or CLI args so this script works as a CI step
// (env) and as a manual local invocation (CLI).
const cliArgs = process.argv.slice(2);
function arg(name, fallback) {
  const i = cliArgs.indexOf(name);
  if (i >= 0 && i + 1 < cliArgs.length) return cliArgs[i + 1];
  return fallback;
}
const tag = process.env.TAG_NAME || arg('--tag');
const repo = process.env.GITHUB_REPOSITORY || arg('--repo', 'runepro123/dominations');

if (!tag) {
  console.error('ERROR: TAG_NAME env or --tag <vX.Y.Z> CLI arg is required');
  process.exit(1);
}

const releaseBase = `https://github.com/${repo}/releases/download/${tag}`;

// Walk the bundle dir and return every path ending in `.sig`.
function findSigFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findSigFiles(full));
    else if (entry.name.endsWith('.sig')) out.push(full);
  }
  return out;
}

const localSigs = findSigFiles(bundleDir);
if (localSigs.length === 0) {
  // Loud-fail instead of silently writing platforms: {}. Tauri's
  // in-app updater plugin hits a runtime exception on retrieval
  // ("None of the fallback platforms ... were found in the response
  // 'platforms' object") which is far worse UX than a CI failure
  // with a clear error message.
  const scannedDirs = ['appimage', 'nsis', 'deb', 'rpm', 'msi', 'app'].map((d) => {
    const fullPath = path.join(bundleDir, d);
    return `  - ${path.relative(repoRoot, fullPath)} (${fs.existsSync(fullPath) ? 'exists, but contains NO .sig file' : 'missing entirely'})`;
  }).join('\n');
  throw new Error(
    `No .sig files found in any bundle directory. Tauri produces these\n` +
    `only when the updater signing keypair is properly configured.\n` +
    `Most likely cause: cargo tauri build ran without a keypair at\n` +
    `~/.tauri/keys/keypair.key, or without TAURI_SIGNING_PRIVATE_KEY set,\n` +
    `or you skipped --bundles entirely. Check the build logs for\n` +
    `"Skipping signing" and re-run with the key.\n\n` +
    `Directories scanned:\n${scannedDirs}\n`
  );
}

const manifest = {
  version: tag.replace(/^v/, ''),
  notes: '',
  pub_date: new Date().toISOString(),
  platforms: {},
};

console.log(`Found ${localSigs.length} local .sig file(s):`);
for (const sigPath of localSigs) {
  const subdir = path.basename(path.dirname(sigPath));
  const platform = DIR_TO_PLATFORM[subdir];
  if (!platform) {
    console.warn(`  SKIP ${path.relative(repoRoot, sigPath)} (unknown subdir "${subdir}")`);
    continue;
  }
  const sigName = path.basename(sigPath);
  const artifactName = sigName.replace(/\.sig$/, '');
  const signature = fs.readFileSync(sigPath, 'utf8');
  manifest.platforms[platform] = {
    signature,
    url: `${releaseBase}/${artifactName}`,
  };
  console.log(`  + ${platform}: ${artifactName}`);
}

// Validate the result before writing - surface obvious bugs loudly.
for (const [platform, entry] of Object.entries(manifest.platforms)) {
  if (!entry.signature || !entry.url) {
    throw new Error(`platform ${platform} entry is missing signature or url: ${JSON.stringify(entry)}`);
  }
}

const outPath = path.join(repoRoot, 'latest.json');
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${outPath}`);
console.log(`Manifest base URL: ${releaseBase}`);
console.log(`Final manifest platforms: ${[...Object.keys(manifest.platforms)].join(', ') || '(none)'}`);
