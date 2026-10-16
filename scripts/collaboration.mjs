// Optional conflict protection for the existing branch/worktree workflow. No hooks are installed.
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
  existsSync,
  realpathSync,
} from 'node:fs';
import { resolve, relative, sep, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const fileHash = (path) =>
  existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : 'missing';
const cleanId = (id) => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id);
function lockPath(base, module) {
  if (!cleanId(module)) throw Error('Invalid module ID');
  return resolve(base, module);
}
export function claimModule(base, module, owner, workspace, branch) {
  if (!cleanId(owner)) throw Error('Owner must be a stable task/developer ID');
  mkdirSync(base, { recursive: true });
  const path = lockPath(base, module);
  try {
    mkdirSync(path);
  } catch (error) {
    if (error.code === 'EEXIST')
      throw Error(
        'Module already locked: ' +
          module +
          '. Inspect status; locks are never automatically stolen.',
      );
    throw error;
  }
  const lease = {
    module,
    owner,
    workspace: realpathSync(workspace),
    branch,
    claimedAt: new Date().toISOString(),
  };
  try {
    writeFileSync(resolve(path, 'owner.json'), JSON.stringify(lease, null, 2), { flag: 'wx' });
  } catch (error) {
    rmSync(path, { recursive: true });
    throw error;
  }
  return lease;
}
export function readClaim(base, module) {
  return JSON.parse(readFileSync(resolve(lockPath(base, module), 'owner.json'), 'utf8'));
}
function checkClaim(base, module, owner, workspace, branch) {
  const claim = readClaim(base, module);
  if (
    claim.owner !== owner ||
    claim.workspace !== realpathSync(workspace) ||
    claim.branch !== branch
  )
    throw Error('Module is owned by another task, worktree or branch');
}
export function releaseModule(base, module, owner, workspace, branch) {
  checkClaim(base, module, owner, workspace, branch);
  rmSync(lockPath(base, module), { recursive: true });
}
export function guardedWrite({
  root,
  base,
  manifest,
  module,
  owner,
  branch,
  file,
  expectedHash,
  content,
}) {
  checkClaim(base, module, owner, root, branch);
  const target = resolve(root, file);
  const rel = relative(root, target).split(sep).join('/');
  if (
    !rel ||
    rel.startsWith('../') ||
    rel === '..' ||
    !manifest.modules[module]?.paths.some((p) => (p.endsWith('/') ? rel.startsWith(p) : rel === p))
  )
    throw Error('File is outside the claimed module');
  // Reject a symlinked parent escaping the worktree as well as lexical traversal.
  const parent = realpathSync(dirname(target));
  const parentRel = relative(realpathSync(root), parent);
  if (
    parentRel === '..' ||
    parentRel.startsWith('..' + sep) ||
    resolve(parent) !== resolve(dirname(target))
  )
    throw Error('Symlinked or external directory is not writable');
  const mutex = resolve(lockPath(base, module), 'writing');
  try {
    mkdirSync(mutex);
  } catch (error) {
    if (error.code === 'EEXIST') throw Error('Another guarded write is active');
    throw error;
  }
  const temp = target + '.' + randomUUID() + '.pending';
  try {
    if (fileHash(target) !== expectedHash)
      throw Error('Stale file: re-read and merge before writing ' + rel);
    writeFileSync(temp, content, { flag: 'wx' });
    if (fileHash(target) !== expectedHash)
      throw Error('File changed during preparation; merge required');
    renameSync(temp, target);
    return fileHash(target);
  } finally {
    if (existsSync(temp)) rmSync(temp);
    rmSync(mutex, { recursive: true });
  }
}
function cli() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  const common = resolve(root, git('rev-parse', '--git-common-dir'));
  const base = resolve(common, 'module-locks');
  const branch = git('branch', '--show-current');
  const manifest = JSON.parse(readFileSync(resolve(root, 'modules.json'), 'utf8'));
  const [action, module, owner, file, expectedHash, contentFile] = process.argv.slice(2);
  if (!Object.hasOwn(manifest.modules, module)) throw Error('Unknown module; see modules.json');
  if (action === 'status') return console.log(readClaim(base, module));
  if (action === 'hash') return console.log(fileHash(resolve(root, owner)));
  if (!/^(feat|fix|docs)\//.test(branch))
    throw Error('Use the existing feat/, fix/ or docs/ branch workflow');
  if (action === 'claim') return console.log(claimModule(base, module, owner, root, branch));
  if (action === 'release') return releaseModule(base, module, owner, root, branch);
  if (action === 'write' && file && expectedHash && contentFile)
    return console.log(
      guardedWrite({
        root,
        base,
        manifest,
        module,
        owner,
        branch,
        file,
        expectedHash,
        content: readFileSync(resolve(contentFile)),
      }),
    );
  throw Error(
    'Usage: collaboration.mjs claim|release|status <module> <owner>; hash <module> <file>; write <module> <owner> <file> <expected-sha256|missing> <content-file>',
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    cli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
