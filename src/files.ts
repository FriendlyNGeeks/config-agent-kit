import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
export function exists(file: string): boolean {
  try { fs.lstatSync(file); return true; } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false; throw e; }
}
// Refuse symlink/junction traversal, including ancestors of a not-yet-created root.
export function safePath(root: string, relative = '.'): string {
  const base = path.resolve(root);
  const target = path.resolve(base, relative);
  const within = path.relative(base, target);
  if (within === '..' || within.startsWith('..' + path.sep) || path.isAbsolute(within)) throw new Error('Path escapes project directory.');
  const parsed = path.parse(target);
  let current = parsed.root;
  for (const component of target.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    if (exists(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error(`Refusing symbolic link or junction: ${current}`);
  }
  return target;
}
export function read(root: string, relative: string): string | undefined {
  const file = safePath(root, relative);
  if (!exists(file)) return undefined;
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw new Error(`Expected a file: ${relative}`);
  if (stat.size > 2 * 1024 * 1024) throw new Error(`File exceeds 2 MiB read limit: ${relative}`);
  return fs.readFileSync(file, 'utf8');
}
export function readJson(root: string, relative: string): unknown {
  const content = read(root, relative);
  if (content === undefined) return undefined;
  try { return JSON.parse(content.replace(/^\uFEFF/, '')); } catch { throw new Error(`Invalid JSON in ${relative}.`); }
}
export function atomicWrite(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, content, { flag: 'wx', mode: exists(file) ? fs.statSync(file).mode : 0o644 });
    fs.renameSync(temp, file);
  } finally { if (exists(temp)) fs.unlinkSync(temp); }
}
