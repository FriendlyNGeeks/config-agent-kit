import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { detect, type Detection } from './detect.js';
import { exists, readJson, safePath } from './files.js';
import type { Genre } from './genres.js';

export interface ScaffoldProvider {
  id: string; label: string; genres: Genre[]; package: string; binary: string;
  frameworks: Record<string, string>; target: 'current' | 'parent'; extra: string[];
  detectedDependencies: string[];
}
export const SCAFFOLD_PROVIDERS: ScaffoldProvider[] = [
  { id: 'vite', label: 'Vite (web / browser game)', genres: ['web', 'game'], package: 'create-vite@latest', binary: 'create-vite', target: 'current',
    frameworks: { react: 'react-ts', vue: 'vue-ts', svelte: 'svelte-ts', vanilla: 'vanilla-ts', preact: 'preact-ts', solid: 'solid-ts' }, extra: ['--no-interactive'], detectedDependencies: ['vite'] },
  { id: 'expo', label: 'Expo (React Native mobile)', genres: ['mobile'], package: 'create-expo-app@latest', binary: 'create-expo-app', target: 'parent',
    frameworks: { 'react-native': 'blank-typescript' }, extra: ['--yes', '--no-install', '--no-agents-md'], detectedDependencies: ['expo'] },
  { id: 'electron-forge', label: 'Electron Forge (desktop)', genres: ['desktop'], package: 'create-electron-app@latest', binary: 'create-electron-app', target: 'parent',
    frameworks: { electron: 'vite-typescript' }, extra: [], detectedDependencies: ['electron', '@electron-forge/cli'] }
];
export interface ScaffoldSelection { provider: string; framework: string }
export interface ScaffoldInvocation { command: string; args: string[]; cwd: string; root: string; provider: string }
export type ScaffoldRunner = (invocation: ScaffoldInvocation, options: { shell: false; json: boolean; signal: AbortSignal }) => Promise<number>;
export class ScaffoldError extends Error {
  constructor(message: string, public exitCode = 1) { super(message); }
}
export function providerFor(id: string): ScaffoldProvider {
  const provider = SCAFFOLD_PROVIDERS.find(p => p.id === id);
  if (!provider) throw new Error('Unknown scaffolder. Choose: ' + SCAFFOLD_PROVIDERS.map(p => p.id).join(', '));
  return provider;
}
export function validateSelection(selection: ScaffoldSelection, genre: Genre): ScaffoldProvider {
  const provider = providerFor(selection.provider);
  if (!provider.genres.includes(genre)) throw new Error(`${provider.id} supports ${provider.genres.join(', ')}; no automatic ${genre} scaffolder is selected.`);
  if (!Object.hasOwn(provider.frameworks, selection.framework)) throw new Error('Unsupported framework for ' + provider.id + ': ' + Object.keys(provider.frameworks).join(', '));
  return provider;
}

// Call npm's JavaScript entry through Node, avoiding .cmd shell execution on Windows.
export function npmEntry(): string {
  const bin = path.dirname(process.execPath);
  const candidates = [path.join(bin, 'node_modules/npm/bin/npm-cli.js'), path.resolve(bin, '../lib/node_modules/npm/bin/npm-cli.js')];
  if (process.env.npm_execpath) candidates.unshift(path.join(path.dirname(process.env.npm_execpath), 'npm-cli.js'));
  for (const dir of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) candidates.push(path.join(dir, 'node_modules/npm/bin/npm-cli.js'));
  const found = candidates.find(p => exists(p) && fs.statSync(p).isFile());
  if (!found) throw new Error('Cannot locate npm-cli.js. Install Node.js with npm or run this CLI through npx.');
  return found;
}
export function validateScaffoldTarget(root: string): string {
  if (root.split(/[\\/]/).includes('..')) throw new Error('Scaffold target cannot contain parent traversal.');
  const full = safePath(root);
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(path.basename(full))) throw new Error('Use a lowercase project directory name with letters, digits, dots, underscores or dashes for scaffolding. Parent directories may contain spaces.');
  if (exists(full) && (!fs.statSync(full).isDirectory() || fs.readdirSync(full).length)) throw new Error('Scaffolding requires an empty or new directory. Configure existing projects with init.');
  return full;
}
export function buildInvocation(root: string, selection: ScaffoldSelection, genre: Genre, npmCli = npmEntry()): ScaffoldInvocation {
  const provider = validateSelection(selection, genre);
  const full = validateScaffoldTarget(root);
  return { command: process.execPath,
    args: [npmCli, 'exec', '--yes', '--package=' + provider.package, '--', provider.binary,
      provider.target === 'current' ? '.' : path.basename(full), '--template', provider.frameworks[selection.framework]!, ...provider.extra],
    cwd: provider.target === 'current' ? full : path.dirname(full), root: full, provider: provider.id };
}
export const runProcess: ScaffoldRunner = (invocation, options) => new Promise((resolve, reject) => {
  const child = spawn(invocation.command, invocation.args, { cwd: invocation.cwd, shell: false,
    stdio: options.json ? ['ignore', 'pipe', 'pipe'] : 'inherit', signal: options.signal });
  if (options.json) { child.stdout?.pipe(process.stderr); child.stderr?.pipe(process.stderr); }
  child.once('error', reject);
  child.once('exit', (code, signal) => resolve(signal === 'SIGINT' ? 130 : code ?? 1));
});
export async function scaffoldProject(invocation: ScaffoldInvocation, runner: ScaffoldRunner = runProcess, json = false): Promise<Detection> {
  // Recheck after confirmation. This execution is deliberately outside plan/applyPlan.
  validateScaffoldTarget(invocation.root);
  safePath(invocation.cwd);
  const abort = new AbortController();
  const interrupt = () => abort.abort();
  process.once('SIGINT', interrupt);
  try {
    fs.mkdirSync(invocation.cwd, { recursive: true });
    const code = await runner(invocation, { shell: false, json, signal: abort.signal });
    if (abort.signal.aborted || code === 130) throw new ScaffoldError('Scaffolding cancelled. External files remain; no Agent Kit files generated.', 130);
    if (code) throw new ScaffoldError(`Scaffolder exited with code ${code}. External files remain; no Agent Kit files generated.`, code);
    try {
      const detection = detect(invocation.root);
      if (!detection.hasApplicationEvidence) throw new Error('No application manifest was created.');
      const manifest = readJson(invocation.root, 'package.json') as { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> } | undefined;
      const deps = { ...manifest?.dependencies, ...manifest?.devDependencies };
      if (!providerFor(invocation.provider).detectedDependencies.some(dep => Object.hasOwn(deps, dep))) throw new Error('The expected framework dependencies were not created.');
      return detection;
    } catch (error) { throw new ScaffoldError(`Scaffolder completed, but detection failed: ${(error as Error).message} External files remain; no Agent Kit files generated.`); }
  } catch (error) {
    if (error instanceof ScaffoldError) throw error;
    throw new ScaffoldError(`Scaffolding ${abort.signal.aborted ? 'cancelled' : 'failed'}: ${(error as Error).message} External files remain; no Agent Kit files generated.`, abort.signal.aborted ? 130 : 1);
  } finally { process.removeListener('SIGINT', interrupt); }
}
