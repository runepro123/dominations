#!/usr/bin/env node
/**
 * Build the Tauri 2 updater manifest (`latest.json`) for the GitHub
 * release and write it next to the repo root so softprops/action-gh-release
 * picks it up during the upload step.
 *
 * Behavior on the matrix:
 *   - Linux job (runs FIRST): the remote release has no latest.json yet,
 *     so this script constructs a fresh manifest containing only the
 *     linux entry found in src-tauri/target/release/bundle/appimage/.
 *   - Windows job (runs SECOND via `needs: linux`): fetches the remote
 *     latest.json (containing the linux entry uploaded by the first job),
 *     keeps that entry, and adds the windows entry from the local
 *     *.sig files in src-tauri/target/release/bundle/nsis/. The merged
 *     file is written back to disk; softprops then re-uploads with
 *     overwrite:true, clobbering the linux-only manifest.
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
 * The `signature` field is the literal text of the .sig file (including
 * the `untrusted comment:` line) — DO NOT base64-encode. Tauri's
 * minisign-verify parses the full text.
 *
 * The `url` field points at the per-tag download URL (binaries are
 * version-pinned, not "latest"-tracked) so future releases don't break
 * previously-deployed updates.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const bundleDir = path.join(repoRoot, 'src-tauri/target/release/bundle');

// Map a `cargo tauri build` bundle subdirectory to the platform key
// Tauri uses in latest.json. Extend here if more bundle types ship
// (deb, rpm, msi, app, dmg) — values are Tauri 2's exact strings.
const DIR_TO_PLATFORM = {
  appimage: 'linux-x86_64',
  nsis:     'windows-x86_64',
  deb:      'linux-x86_64',
  rpm:      'linux-x86_64',
  msi:      'windows-x86_64',
  app:      'darwin-x86_64',
};

const tag = process.env.TAG_NAME || process.env.GITHUB_REF_NAME;
const repo = process.env.GITHUB_REPOSITORY;

if (!tag || !repo) {
  console.error('ERROR: TAG_NAME and GITHUB_REPOSITORY must be set in the env');
  process.exit(1);
}

const releaseBase = `https://github.com/${repo}/releases/download/${tag}`;

// Walk the bundle dir and return every path ending in `.sig`.
function findSigFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findSigFiles(full));
    } else if (entry.name.endsWith('.sig')) {
      out.push(full);
    }
  }
  return out;
}

// Pull the existing latest.json from the release — used by the windows
// job to merge with the linux entry uploaded first. Returns null if
// the asset doesn't exist yet (linux first pass) or any fetch error.
async function fetchExistingManifest() {
  try {
    const url = execFileSync(
      'gh',
      [
        'release', 'view', tag,
        '--json', 'assets',
        '--jq', '.assets[] | select(.name == "latest.json") | .url',
      ],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    if (!url) return null;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.log(`Remote latest.json fetch returned HTTP ${resp.status} — building fresh manifest`);
      return null;
    }
    return await resp.json();
  } catch (e) {
    // gh CLI exits non-zero if there are no matching assets. That's the
    // expected case on the linux first pass; treat it as "no remote yet".
    console.log(`No remote latest.json to merge with: ${e.message?.split('\n')[0]}`);
    return null;
  }
}

const existing = await fetchExistingManifest();
const manifest = existing && typeof existing === 'object' && existing.platforms
  ? existing
  : {
      version: tag.replace(/^v/, ''),
      notes: '',
      pub_date: new Date().toISOString(),
      platforms: {},
    };

if (existing?.platforms) {
  console.log(
    `Merging with existing remote latest.json ` +
    `(${[...Object.keys(existing.platforms)].join(', ')} already present)`
  );
} else {
  console.log('No existing remote latest.json — building fresh manifest');
}

// Add (or overwrite) an entry for every local .sig file we find.
const localSigs = findSigFiles(bundleDir);
if (localSigs.length === 0) {
  // Loud-fail instead of silently writing platforms: {}. tauri's
  // in-app updater plugin hits a runtime exception on retrieval
  // ("None of the fallback platforms ... were found in the response
  // 'platforms' object") which is far worse UX than a CI failure
  // with a clear error message. The previous version of this script
  // happily wrote an empty platforms object and the release then
  // shipped to users completely broken for months at a time.
  const scannedDirs = ['appimage', 'nsis', 'deb', 'rpm', 'msi', 'app'].map((d) => {
    const fullPath = path.join(bundleDir, d);
    return `  - ${path.relative(repoRoot, fullPath)} (${fs.existsSync(fullPath) ? 'exists, but contains NO .sig file' : 'missing entirely'})`;
  }).join('\n');
  throw new Error(
    `No .sig files found in any bundle directory. Tauri produces these\n` +
    `only when the updater signing keypair is properly configured: an\n` +
    `empty manifest will reach the release and break the in-app updater\n` +
    `at runtime ("None of the fallback platforms ... were found").\n\n` +
    `Likely fix:\n` +
    `  1. Generate an updater keypair LOCALLY (one-time):\n` +
    `       cargo tauri signer generate -w ~/.tauri/keys/keypair.key\n` +
    `     (canonical Tauri 2 CLI invocation - also works as\n` +
    `      'tauri signer generate' if you have cargo-installed the\n` +
    `      tauri-cli binary and added its bin dir to PATH)\n` +
    `     It prints PUBLIC <base64>, PRIVATE <base64> + asks for a\n` +
    `     password. Save both outputs and the password.\n` +
    `  2. Paste the PUBLIC <base64> string into src-tauri/tauri.conf.json\n` +
    `     under plugins.updater.pubkey.\n` +
    `  3. Save the PRIVATE <base64> string + its password as GitHub\n` +
    `     repo secrets (Settings > Secrets and variables > Actions):\n` +
    `       TAURI_SIGNING_PRIVATE_KEY         = <private base64>\n` +
    `       TAURI_SIGNING_PRIVATE_KEY_PASSWORD = <password>\n` +
    `  4. Re-run the release pipeline (retag v1.0.1 --force or bump\n` +
    `     to v1.0.2 and push that tag).\n\n` +
    `Directories scanned:\n${scannedDirs}\n`
  );
}
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
  console.log(`  + ${platform}: ${artifactName} (sig: ${signature.trim().split('\n')[0]})`);
}

// Validate the result before writing — surface obvious bugs loudly.
for (const [platform, entry] of Object.entries(manifest.platforms)) {
  if (!entry.signature || !entry.url) {
    throw new Error(`platform ${platform} entry is missing signature or url: ${JSON.stringify(entry)}`);
  }
}

const outPath = path.join(repoRoot, 'latest.json');
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${outPath}`);
console.log(`Final manifest platforms: ${[...Object.keys(manifest.platforms)].join(', ')}`);
