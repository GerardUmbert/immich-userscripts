#!/usr/bin/env node
// Checks whether a given Immich release still matches what the userscripts rely on.
// The Immich source is a blobless shallow clone kept in ./immich (git-ignored), so only
// the handful of files listed in anchors.mjs are ever downloaded.
//
//   node tools/check.mjs setup [ref]        create / refresh the clone (default: checkedAgainst)
//   node tools/check.mjs anchors [ref]      verify every assumption at a ref (exit code 2 if any is broken)
//   node tools/check.mjs diff <old> <new>   which anchored files changed between two refs
//
// IMMICH_DIR overrides where the clone lives. Refs are Immich tags (for example v3.4.0).
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anchors, checkedAgainst } from '../anchors.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const clone = resolve(process.env.IMMICH_DIR ?? join(root, 'immich'));
const REMOTE = 'https://github.com/immich-app/immich.git';

const git = (...args) => execFileSync('git', ['-C', clone, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const hasRef = (ref) => {
  try {
    git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
    return true;
  } catch {
    return false;
  }
};

function ensureRef(ref) {
  if (!existsSync(join(clone, '.git'))) {
    console.log(`Cloning immich ${ref} (no file contents yet) ...`);
    execFileSync(
      'git',
      ['clone', '--depth', '1', '--filter=blob:none', '--no-checkout', '--branch', ref, REMOTE, clone],
      { stdio: 'inherit' },
    );
    return;
  }
  if (hasRef(ref)) return;
  console.log(`Fetching ${ref} ...`);
  git('fetch', '--depth', '1', '--filter=blob:none', 'origin', 'tag', ref);
}

function read(ref, file) {
  try {
    return git('show', `${ref}:${file}`);
  } catch {
    return undefined;
  }
}

function runAnchors(ref) {
  ensureRef(ref);
  const broken = new Map();
  for (const anchor of anchors) {
    const text = read(ref, anchor.file);
    let reason;
    if (text === undefined) reason = 'file missing';
    else if (anchor.match && !anchor.match.test(text)) reason = 'pattern not found';
    else if (anchor.absent && anchor.absent.test(text)) reason = 'unexpected pattern found';
    if (!reason) continue;
    for (const script of anchor.scripts) {
      if (!broken.has(script)) broken.set(script, []);
      broken.get(script).push({ anchor, reason });
    }
  }
  return broken;
}

function anchorsCommand(ref = checkedAgainst) {
  const broken = runAnchors(ref);
  const failed = new Set([...broken.values()].flat().map((entry) => entry.anchor));
  for (const [script, entries] of broken) {
    console.log(`\n[${script}] ${entries.length} broken assumption${entries.length === 1 ? '' : 's'}`);
    for (const { anchor, reason } of entries) {
      console.log(`  - expected: ${anchor.means}`);
      console.log(`    ${reason}: ${anchor.file}`);
    }
  }
  console.log(`\n${anchors.length - failed.size}/${anchors.length} assumptions hold at ${ref}.`);
  if (failed.size > 0) process.exitCode = 2;
}

function diffCommand(oldRef, newRef) {
  if (!oldRef || !newRef) usage();
  ensureRef(oldRef);
  ensureRef(newRef);
  const files = [...new Set(anchors.map((anchor) => anchor.file))];
  let changed = 0;
  for (const file of files) {
    const before = read(oldRef, file);
    const after = read(newRef, file);
    if (before === after) continue;
    changed++;
    console.log(after === undefined ? `MISSING in ${newRef}: ${file}` : `changed: ${file}`);
  }
  console.log(changed === 0 ? `No anchored file changed between ${oldRef} and ${newRef}.` : `\n${changed}/${files.length} anchored files changed.`);
}

function usage() {
  console.error('usage: node tools/check.mjs <setup [ref] | anchors [ref] | diff <oldRef> <newRef>>');
  process.exit(1);
}

const [command, ...args] = process.argv.slice(2);
if (command === 'setup') ensureRef(args[0] ?? checkedAgainst);
else if (command === 'anchors') anchorsCommand(args[0]);
else if (command === 'diff') diffCommand(...args);
else usage();
