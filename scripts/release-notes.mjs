#!/usr/bin/env node
// Extract the CHANGELOG.md section for a given version (e.g. 1.0.1) and
// emit GitHub-flavoured markdown to stdout.
//
// Used by .github/workflows/release.yml after the bundle is built, so the
// GitHub release page gets the same text the UpdateModal will show in-app.
//
// Usage:
//   node scripts/release-notes.mjs <version>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const changelogPath = path.join(repoRoot, 'CHANGELOG.md');

const wanted = process.argv[2];
if (!wanted) {
  console.error('Usage: release-notes.mjs <version>  (e.g. 1.0.1)');
  process.exit(2);
}

if (!fs.existsSync(changelogPath)) {
  // No CHANGELOG.md yet — emit nothing; workflow falls back to default body.
  process.exit(0);
}

const md = fs.readFileSync(changelogPath, 'utf8');

// Sections are delimited by lines like '## [<version>] - YYYY-MM-DD'.
// We split on the `## [` marker so every section is its own chunk, then
// find the chunk that names the requested version. The leading '## ['
// marker is part of the section header — restore it after splitting.
const chunks = md.split(/^## \[/m).slice(1); // skip preamble
for (const chunk of chunks) {
  const close = chunk.indexOf(']');
  if (close < 0) continue;
  const sectionVersion = chunk.slice(0, close).trim();
  if (sectionVersion !== wanted) continue;
  process.stdout.write(`## [${chunk.trimEnd()}\n`);
  process.exit(0);
}

// No matching section — emit nothing so the workflow can keep its default.
process.exit(0);
