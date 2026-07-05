#!/usr/bin/env node
// Postinstall patch — three-stdlib ships a handful of malformed *.js.map
// files (e.g. postprocessing/EffectComposer.js.map and
// postprocessing/SSAOPass.js.map have a stray `"` between two concatenated
// JSON objects). esbuild refuses to parse them and aborts `vite dev` before
// the server can start. We overwrite any unparseable .map in
// node_modules/three-stdlib with a valid empty source map so esbuild is
// happy and bundles still build (just without fine-grained mapping for
// those few files).
//
// Idempotent: only writes files that fail to parse. Run automatically via
// `postinstall` in package.json so it self-heals after every `npm install`.
//
// Scope: we only walk the subdirs of three-stdlib actually known to host
// malformed maps (today: `postprocessing/`). This keeps the postinstall
// cheap and avoids touching valid maps elsewhere in the package.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const threeStdlib = path.join(repoRoot, 'node_modules', 'three-stdlib');

// Subdirs of three-stdlib whose *.js.map files we've seen ship malformed.
// Keep this list narrow — only patches the broken families we've observed.
const SCAN_SUBDIRS = ['postprocessing'];

const EMPTY_SOURCEMAP = JSON.stringify({
  version: 3,
  file: '',
  sources: [],
  sourcesContent: [],
  names: [],
  mappings: '',
});

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(p);
    } else {
      yield p;
    }
  }
}

if (!fs.existsSync(threeStdlib)) {
  // Three-stdlib not installed yet (e.g. partial install). Nothing to do.
  process.exit(0);
}

let patched = 0;
let scanned = 0;
for (const sub of SCAN_SUBDIRS) {
  const subPath = path.join(threeStdlib, sub);
  if (!fs.existsSync(subPath)) continue;
  for (const file of walk(subPath)) {
    if (!file.endsWith('.js.map')) continue;
    scanned++;
    try {
      JSON.parse(fs.readFileSync(file, 'utf8'));
      // Valid — leave it alone.
    } catch {
      fs.writeFileSync(file, EMPTY_SOURCEMAP);
      patched++;
      console.warn(
        `patched malformed source map: ${path.relative(repoRoot, file)}`,
      );
    }
  }
}

// Routine status line: this is informational, not a warning.
console.log(
  `three-stdlib source-map patch: scanned ${scanned}, patched ${patched}`,
);


