#!/usr/bin/env node
/**
 * Publish the web build to the `gh-pages` branch.
 *
 * The normal route is `.github/workflows/deploy-pages.yml`, which builds and
 * deploys on every push. This script exists because that route needs a GitHub
 * Actions runner, and an account whose Actions are not enabled never gets one:
 * the job sits in the queue with `runner_id: 0` until GitHub cancels it after
 * fifteen minutes. Nothing is wrong with the workflow, and nothing in it can
 * fix that.
 *
 * So this does the same three things without a runner - build, put the output
 * on a branch, push - and GitHub's own branch-based Pages publishing takes it
 * from there. Once Actions works, the workflow takes over again and this script
 * becomes redundant rather than wrong.
 *
 * Usage:
 *   npm run publish:pages          # verify, build, publish
 *   npm run publish:pages -- --skip-verify
 *
 * The branch is orphaned on purpose: it holds build output and no source, so
 * its history never tangles with the development branch.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BRANCH = 'gh-pages';
const skipVerify = process.argv.includes('--skip-verify');

function run(command, args, options = {}) {
  return execFileSync(command, args, { stdio: 'inherit', ...options });
}

function capture(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' }).trim();
}

const sourceSha = capture('git', ['rev-parse', '--short', 'HEAD']);
const sourceBranch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);

if (capture('git', ['status', '--porcelain']).length > 0) {
  // Publishing an uncommitted state produces a live site nobody can reproduce
  // from a commit - the worst thing to hand someone testing on a phone.
  console.error('\n  Arbeitsverzeichnis nicht sauber. Erst committen.\n');
  process.exit(1);
}

if (!skipVerify) {
  console.log('\n  Qualitäts-Gate …');
  run('npm', ['run', 'verify']);
}

console.log('\n  Bauen …');
run('npm', ['run', 'build']);

if (!existsSync('dist/index.html')) {
  console.error('\n  dist/index.html fehlt nach dem Bauen.\n');
  process.exit(1);
}

// A throwaway worktree rather than switching branches in place: a checkout
// would blow away node_modules-adjacent state and, if anything failed midway,
// leave the working copy on the wrong branch.
const worktree = mkdtempSync(join(tmpdir(), 'echo-pages-'));
rmSync(worktree, { recursive: true, force: true });

try {
  const remoteHasBranch =
    capture('git', ['ls-remote', '--heads', 'origin', BRANCH]).length > 0;

  if (remoteHasBranch) {
    run('git', ['fetch', 'origin', BRANCH]);
    run('git', ['worktree', 'add', '-B', BRANCH, worktree, `origin/${BRANCH}`]);
    // Wipe the previous build. Without this, files from an older build linger
    // forever - and a stale `index.html` would point at bundles that are gone.
    run('git', ['rm', '-rq', '--ignore-unmatch', '.'], { cwd: worktree });
  } else {
    run('git', ['worktree', 'add', '--orphan', '-b', BRANCH, worktree]);
  }

  cpSync('dist', worktree, { recursive: true });
  // Pages runs Jekyll over a branch by default, which silently drops files and
  // directories whose names start with an underscore.
  writeFileSync(join(worktree, '.nojekyll'), '');

  run('git', ['add', '-A'], { cwd: worktree });

  const changed = execFileSync('git', ['status', '--porcelain'], {
    cwd: worktree,
    encoding: 'utf8',
  }).trim();

  if (changed.length === 0) {
    console.log('\n  Keine Änderung gegenüber der veröffentlichten Fassung.\n');
  } else {
    run(
      'git',
      [
        '-c',
        'commit.gpgsign=false',
        'commit',
        '-q',
        '-m',
        `Web-App aus ${sourceBranch}@${sourceSha}`,
      ],
      { cwd: worktree },
    );
    run('git', ['push', '-u', 'origin', BRANCH], { cwd: worktree });
    console.log(`\n  Veröffentlicht: ${sourceBranch}@${sourceSha} → ${BRANCH}`);
  }

  console.log('\n  https://sharkyt207.github.io/Shooter-New/');
  console.log('  (Einmalig: Settings → Pages → Source: Deploy from a branch → gh-pages / root)\n');
} finally {
  run('git', ['worktree', 'remove', '--force', worktree], { stdio: 'ignore' });
}
