#!/usr/bin/env node
/**
 * PROJECT ECHO - Architecture boundary checker.
 *
 * Enforces the layering contract from docs/01-ARCHITECTURE.md at build time.
 * Architecture rules that are not enforced by a machine are just wishes.
 *
 * Checks performed:
 *   1. Layer import direction (a layer may only import from allowed layers)
 *   2. `src/game/**` must not touch rendering, DOM or browser globals
 *   3. `src/game/**` must not use Math.random() (determinism, ADR-009)
 *   4. No relative imports that escape their own layer (use the `@/` alias)
 *   5. `src/content/**` must stay declarative (no imports from game/render/ui)
 *
 * Exit code 0 = clean, 1 = violations found.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');

/** Which layer may import from which. `app` is the composition root and may see everything. */
const ALLOWED_IMPORTS = {
  core: ['core'],
  content: ['core', 'content'],
  game: ['core', 'content', 'game'],
  // `platform` may read `content`: input tuning (deadzones, stick radius) is a
  // design-owned balance value and belongs in content/balance.ts (ADR-010).
  // `content` is pure data and depends only on `core`, so this adds no cycle.
  platform: ['core', 'content', 'platform'],
  render: ['core', 'content', 'game', 'platform', 'render'],
  ui: ['core', 'content', 'game', 'platform', 'ui'],
  app: ['core', 'content', 'game', 'platform', 'render', 'ui', 'app'],
};

/** Packages a given layer must never depend on. */
const FORBIDDEN_PACKAGES = {
  core: ['pixi.js'],
  content: ['pixi.js'],
  game: ['pixi.js'],
  platform: ['pixi.js'],
};

/** Browser globals that must not appear in the pure simulation. */
const FORBIDDEN_GLOBALS_IN_GAME = [
  { pattern: /\bdocument\s*\./, name: 'document' },
  { pattern: /\bwindow\s*\./, name: 'window' },
  { pattern: /\bnavigator\s*\./, name: 'navigator' },
  { pattern: /\blocalStorage\b/, name: 'localStorage' },
  { pattern: /\brequestAnimationFrame\b/, name: 'requestAnimationFrame' },
  { pattern: /\bMath\s*\.\s*random\s*\(/, name: 'Math.random() - use SeededRandom (ADR-009)' },
  { pattern: /\bDate\s*\.\s*now\s*\(/, name: 'Date.now() - the simulation owns its own clock' },
];

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const violations = [];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

function layerOf(relPath) {
  return relPath.split(sep)[0];
}

function collectImports(source) {
  const specs = [];
  for (const re of [IMPORT_RE, DYNAMIC_IMPORT_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(source)) !== null) specs.push(m[1]);
  }
  return specs;
}

/** Strip comments and string literals so text scans do not trip over prose. */
function stripNonCode(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

function report(file, message) {
  violations.push(`${relative(ROOT, file)}: ${message}`);
}

for (const file of walk(SRC)) {
  const rel = relative(SRC, file);
  const layer = layerOf(rel);
  const allowed = ALLOWED_IMPORTS[layer];
  if (!allowed) {
    report(file, `lives outside any known layer (expected one of: ${Object.keys(ALLOWED_IMPORTS).join(', ')})`);
    continue;
  }

  const source = readFileSync(file, 'utf8');
  const code = stripNonCode(source);

  // --- 1/4/5. Import rules -------------------------------------------------
  for (const spec of collectImports(source)) {
    if (spec.startsWith('@/')) {
      const targetLayer = spec.slice(2).split('/')[0];
      if (!allowed.includes(targetLayer)) {
        report(file, `layer "${layer}" must not import from layer "${targetLayer}" (${spec})`);
      }
      continue;
    }

    if (spec.startsWith('.')) {
      // Relative imports are only allowed inside the same layer directory.
      if (spec.includes('../../')) {
        report(file, `relative import escapes its layer - use the "@/" alias instead (${spec})`);
      }
      continue;
    }

    const forbidden = FORBIDDEN_PACKAGES[layer] ?? [];
    if (forbidden.some((pkg) => spec === pkg || spec.startsWith(`${pkg}/`))) {
      report(file, `layer "${layer}" must not depend on package "${spec}"`);
    }
  }

  // --- 2/3. Browser globals + determinism in the simulation ----------------
  if (layer === 'game') {
    for (const { pattern, name } of FORBIDDEN_GLOBALS_IN_GAME) {
      if (pattern.test(code)) {
        report(file, `simulation code must not use ${name}`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error(`\n  Architecture boundary check FAILED - ${violations.length} violation(s):\n`);
  for (const v of violations) console.error(`   x ${v}`);
  console.error('\n  See docs/01-ARCHITECTURE.md for the layering contract.\n');
  process.exit(1);
}

console.log('  Architecture boundary check passed.');
