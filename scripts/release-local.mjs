#!/usr/bin/env node
/**
 * Local release orchestrator (no CI). Replaces the GitHub Actions pipeline.
 *
 * Steps (in order):
 *   1. Read version from src-tauri/tauri.conf.json - this becomes the
 *      tag THE USER WILL CREATE on GitHub (e.g. v1.0.2).
 *   2. Run `cargo tauri build --bundles <list>` - this rebuilds the
 *      Vite frontend per tauri.conf.json `beforeBuildCommand`, then
 *      bundles the chosen installers. Pass bundle names as args to
 *      override the default list, e.g.:
 *        node scripts/release-local.mjs nsis appimage
 *   3. Run scripts/build-manifest.mjs with TAG_NAME=v<X.Y.Z> so the
 *      manifest url() field maps to GitHub Releases download paths.
 *   4. Print the EXACT checklist of files to drag-drop onto the
 *      GitHub Release page (with the release URL at the end so you
 *      can copy-paste into your browser).
 *
 * You still do (manually, in your browser):
 *   - Open the new-release page and tag v<X.Y.Z>
 *   - Drag-drop the listed files onto the GitHub Release page
 *   - Click Publish
 *
 * Prerequisites on your dev machine (run once, not every release):
 *   - Rust toolchain (rustup)
 *   - Tauri CLI: `cargo install tauri-cli --locked --version "^2.11"`
 *     OR use `npm run tauri` (which uses the local @tauri-apps/cli)
 *   - Windows NSIS: Visual Studio C++ build tools (or MSVC)
 *   - Linux AppImage: libwebkit2gtk-4.1-dev + libappindicator3-dev +
 *     librsvg2-dev + patchelf (apt-get on Ubuntu; best on Linux or
 *     WSL ubuntu - NOT on vanilla Windows)
 *   - macOS DMG: Xcode CLI tools + create-dmg (must run on a macOS host)
 *   - Signing keypair at ~/.tauri/keys/keypair.key. Generate once:
 *       cargo tauri signer generate -w ~/.tauri/keys/keypair.key
 *     (prompts for password; remember it - you don't lose it)
 *
 * Password: Tauri prompts interactively for the keypair password.
 * To skip the prompt, set TAURI_SIGNING_PRIVATE_KEY_PASSWORD in your
 * shell env (do NOT commit it).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const config = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'src-tauri/tauri.conf.json'), 'utf8'),
);
const version = config.version;
const tag = `v${version}`;
const repo = process.env.GITHUB_REPOSITORY || 'runepro123/dominations';

console.log(`\n=== Local Release Build: ${tag}  (host: ${repo}) ===\n`);

// Pick the bundles list. Defaults are platform-aware: appimage needs
// Linux so we skip it by default on Windows runners. Pass explicit
// bundle names as args to override (e.g. `release-local.mjs nsis
// appimage`).
// Tauri 2 valid bundle targets covered by the CLI:
//   nsis       Windows NSIS installer
//   appimage   Linux AppImage (single-file, requires libwebkit2gtk on Linux/WSL)
//   deb        Debian .deb package
//   rpm        Fedora/RHEL .rpm package
//   msi        Windows MSI (alternative to NSIS)
//   app        macOS .app bundle (raw - NOT signed or DMG'd)
//   dmg        macOS .dmg disk image (requires create-dmg + macOS host)
const VALID_BUNDLES = ['nsis', 'appimage', 'deb', 'rpm', 'msi', 'app', 'dmg'];
const argBundles = process.argv.slice(2).filter((a) => VALID_BUNDLES.includes(a));
const isWindows = process.platform === 'win32';
const bundles = argBundles.length > 0
  ? argBundles
  : (isWindows ? ['nsis'] : ['nsis', 'appimage']);
console.log(`Target bundles: ${bundles.join(', ')}`);

console.log(`\n--> npm run tauri:build -- --bundles ${bundles.join(',')}`);
execSync(`npm run tauri:build -- --bundles ${bundles.join(',')}`, {
  stdio: 'inherit',
  cwd: repoRoot,
});

console.log(`\n--> node scripts/build-manifest.mjs --tag ${tag} --repo ${repo}`);
execSync(`node scripts/build-manifest.mjs --tag ${tag} --repo ${repo}`, {
  stdio: 'inherit',
  cwd: repoRoot,
  env: { ...process.env, TAG_NAME: tag, GITHUB_REPOSITORY: repo },
});

// Walk a dir recursively and return every file path.
function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

console.log(`\n=== BUILD COMPLETE for ${tag} ===\n`);
console.log(`Next steps (you do these manually in your browser):\n`);
console.log(`  1. Open the new-release page for tag=${tag}:`);
console.log(`     https://github.com/${repo}/releases/new?tag=${tag}\n`);
console.log(`  2. Drag and drop these files onto the release assets box:\n`);
console.log(`     [always]`);
console.log(`       latest.json                                                   (repo root)`);

for (const subdir of bundles) {
  const files = walk(path.join(repoRoot, 'src-tauri/target/release/bundle', subdir));
  if (files.length === 0) continue;
  console.log(`\n     [${subdir}]  src-tauri/target/release/bundle/${subdir}/`);
  for (const f of files) {
    console.log(`       ${path.relative(repoRoot, f)}`);
  }
}

console.log(`\n  3. Click "Publish release". Done.\n`);
console.log(`After publishing, every existing v${version} client that still has the old`);
console.log(`endpoints[] will see the new ${tag} manifest on its next launch and offer`);
console.log(`the update.\n`);
