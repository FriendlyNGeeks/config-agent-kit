import fs from 'node:fs';
import { CONFIG_PATH, STATE_PATH, VERSION, json, object, type Config } from './config.js';
import { atomicWrite, exists, hash, read, readJson, safePath } from './files.js';
import { BEGIN, END, MANAGED_FILES, ROLE_MIGRATIONS, render } from './render.js';
import { localize, LOCAL_ENV, mergeLocalEnv, mergeIgnores } from './local-settings.js';

interface State { schemaVersion: 1; templateVersion: string; files: Record<string, string> }
export interface Change { path: string; action: 'create' | 'update' | 'delete' | 'unchanged' | 'conflict'; before?: string; after?: string; reason?: string }
export interface Plan { root: string; changes: Change[]; conflicts: string[]; config: Config }
const normalize = (s: string) => s.replaceAll('\r\n', '\n');
export function managed(content: string): { prefix: string; block: string; suffix: string } | undefined {
  let start = content.indexOf(BEGIN);
  const end = content.indexOf(END);
  if (start < 0 || end < start || content.indexOf(BEGIN, start + BEGIN.length) >= 0 || content.indexOf(END, end + END.length) >= 0) return undefined;
  // Include the metadata in the protected block even when custom notes precede it.
  const headers = [...content.slice(0, start).matchAll(/^---\r?\n(?:(?!^---\r?$)[\s\S])*?\r?\n---\r?\n\s*/gm)];
  const header = headers.find(match => match.index + match[0].length === start);
  if (header) start = header.index;
  else if (content.startsWith('---\n') || content.startsWith('---\r\n')) return undefined;
  return { prefix: content.slice(0, start), block: content.slice(start, end + END.length), suffix: content.slice(end + END.length) };
}
const bodyHash = (s: string) => hash(normalize(managed(s)?.block ?? s));
function loadState(root: string): State | undefined {
  const raw = readJson(root, STATE_PATH);
  if (raw === undefined) return undefined;
  const state = object(raw, 'state');
  if (state.schemaVersion !== 1 || typeof state.templateVersion !== 'string') throw new Error('Invalid or unsupported scaffold state.');
  const files = object(state.files, 'state files');
  for (const [file, digest] of Object.entries(files)) if (!MANAGED_FILES.includes(file) || typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) throw new Error('Invalid managed path or digest in scaffold state.');
  return state as unknown as State;
}

export function plan(root: string, config: Config, mode: 'init' | 'update'): Plan {
  safePath(root);
  const state = loadState(root);
  if (mode === 'init' && state) throw new Error('This project is already initialized. Use update.');
  if (mode === 'update' && !state) throw new Error('No scaffold state found. Use init; existing instruction files are never silently adopted.');
  const desired = render(config);
  // Keep surviving legacy custom notes discoverable after moving generated roles.
  for (const [oldPath, newPath] of Object.entries(ROLE_MIGRATIONS)) {
    const old = read(root, oldPath);
    if (!old || !desired[newPath]) continue;
    const section = managed(old);
    const custom = section ? section.prefix + section.suffix : old;
    if (custom.trim()) desired[newPath] = desired[newPath]!.replace(END, '- Also read custom project guidance retained in `' + oldPath + '`.\n' + END);
  }
  const changes: Change[] = [];
  for (const file of new Set([...Object.keys(desired), ...Object.keys(state?.files ?? {})])) {
    const before = read(root, file), next = desired[file];
    if (before === undefined) {
      if (next !== undefined) changes.push({ path: file, action: 'create', after: next });
      continue;
    }
    const section = managed(before);
    if (!state?.files[file] || !section || bodyHash(before) !== state.files[file]) {
      changes.push({ path: file, action: 'conflict', before, after: next, reason: 'Unmanaged file or edited managed block. Preserve/move custom guidance and reconcile manually; nothing will be written.' });
      continue;
    }
    if (next === undefined && file.endsWith('/SKILL.md') && (section.prefix + section.suffix).trim()) {
      changes.push({ path: file, action: 'conflict', before, reason: 'This skill contains custom guidance. Move it to project documentation before disabling the skill; leaving an invalid or active skill would be misleading.' });
      continue;
    }
    const newline = before.includes('\r\n') ? '\r\n' : '\n';
    const replacement = next === undefined ? '' : normalize(managed(next)!.block).replaceAll('\n', newline);
    const after = section.prefix + replacement + section.suffix;
    changes.push({ path: file, action: next === undefined && !after.trim() ? 'delete' : before === after ? 'unchanged' : 'update', before, ...(next === undefined && !after.trim() ? {} : { after }) });
  }
  const newState: State = { schemaVersion: 1, templateVersion: VERSION, files: Object.fromEntries(Object.entries(desired).map(([file, content]) => [file, bodyHash(content)])) };
  const local = localize(config);
  for (const [file, after] of [[CONFIG_PATH, json(local.config)], [STATE_PATH, json(newState)]] as const) {
    const before = read(root, file);
    const unmanaged = mode === 'init' && before !== undefined;
    changes.push({ path: file, action: unmanaged ? 'conflict' : before === after ? 'unchanged' : before === undefined ? 'create' : 'update', before, after, ...(unmanaged ? { reason: 'Existing metadata is not owned by this generator.' } : {}) });
  }
  const envBefore = read(root, LOCAL_ENV);
  const envAfter = mergeLocalEnv(envBefore, local.values);
  changes.push({ path: LOCAL_ENV, action: envBefore === envAfter ? 'unchanged' : envBefore === undefined ? 'create' : 'update', before: envBefore, after: envAfter });
  for (const file of ['.gitignore', '.npmignore', '.dockerignore']) {
    const before = read(root, file);
    if (before === undefined && file !== '.gitignore') continue;
    const after = mergeIgnores(before);
    changes.push({ path: file, action: before === after ? 'unchanged' : before === undefined ? 'create' : 'update', before, after });
  }
  return { root, config, changes, conflicts: changes.filter(c => c.action === 'conflict').map(c => c.path) };
}

export function applyPlan(p: Plan): void {
  if (p.conflicts.length) throw new Error(`Conflicts in ${p.conflicts.join(', ')}. No files written.`);
  // Validate the entire plan before mutation. Stale previews must not overwrite concurrent edits.
  for (const change of p.changes) if (read(p.root, change.path) !== change.before) throw new Error(`File changed after preview: ${change.path}. Re-run the command.`);
  const completed: Change[] = [];
  try {
    for (const change of p.changes) {
      if (change.action === 'unchanged') continue;
      const file = safePath(p.root, change.path);
      if (change.action === 'delete') fs.unlinkSync(file);
      else {
        atomicWrite(file, change.after!, change.path === LOCAL_ENV ? 0o600 : undefined);
      }
      completed.push(change);
    }
  } catch (error) {
    const failures: string[] = [];
    for (const change of completed.reverse()) {
      try {
        const file = safePath(p.root, change.path);
        if (change.before === undefined) { if (exists(file)) fs.unlinkSync(file); }
        else atomicWrite(file, change.before);
      } catch { failures.push(change.path); }
    }
    throw new Error(`${(error as Error).message}${failures.length ? ` Rollback needs attention: ${failures.join(', ')}` : ' Applied file changes were rolled back.'}`);
  }
}

export function diff(change: Change): string {
  if (change.path === LOCAL_ENV) return `--- ${LOCAL_ENV}\n+++ ${LOCAL_ENV}\n[Local values hidden]`;
  const before = (change.before ?? '').split('\n'), after = (change.after ?? '').split('\n');
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  return [`--- ${change.path}`, `+++ ${change.path}`, ...before.slice(prefix, before.length - suffix).map(l => '-' + l), ...after.slice(prefix, after.length - suffix).map(l => '+' + l)].join('\n');
}
