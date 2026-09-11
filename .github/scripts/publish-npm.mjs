import { spawnSync } from 'node:child_process';

const tag = process.env.NPM_DIST_TAG;
if (!['latest', 'next'].includes(tag)) throw new Error('Invalid npm distribution tag.');
// npm.cmd requires a shell on Windows; arguments here are fixed or allowlisted.
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['publish', '--access', 'public', '--tag', tag], {
  stdio: 'inherit', shell: process.platform === 'win32',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
