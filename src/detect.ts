import fs from 'node:fs';
import path from 'node:path';
import { CAPABILITIES, validateConfig, type Capability, type Config } from './config.js';
import { exists, read, readJson, safePath } from './files.js';

interface Manifest { name?: string; packageManager?: string; scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string>; workspaces?: string[] | { packages?: string[] } }
export interface Detection { config: Config; warnings: string[]; evidence: string[]; scripts: Record<string, string> }
function manifest(root: string, file: string): Manifest | undefined {
  const value = readJson(root, file);
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid package manifest: ${file}`);
  return value as Manifest;
}
function capabilitiesFor(pkg: Manifest | undefined, directory: string, root: string): Capability[] {
  const deps = Object.keys({ ...pkg?.dependencies, ...pkg?.devDependencies });
  const result: Capability[] = [];
  if (deps.some(d => /^(react|vue|svelte|vite|next|nuxt|@angular\/core|astro)$/.test(d))) result.push('web');
  if (deps.some(d => /^(express|fastify|hono|koa|@nestjs\/core|@hapi\/hapi)$/.test(d))) result.push('api');
  if (deps.some(d => /^(electron|electron-builder|@electron-forge\/cli)$/.test(d))) result.push('desktop');
  if (['pyproject.toml', 'requirements.txt', 'setup.py'].some(f => exists(safePath(root, path.posix.join(directory, f))))) result.push('python');
  if (['CMakeLists.txt', 'Cargo.toml', 'go.mod'].some(f => exists(safePath(root, path.posix.join(directory, f))))) result.push('native');
  return result;
}
export function detect(root: string): Detection {
  safePath(root);
  if (exists(root) && !fs.statSync(root).isDirectory()) throw new Error('Project target must be a directory.');
  const warnings: string[] = [], evidence: string[] = [];
  const pkg = manifest(root, 'package.json');
  const workspaces = Array.isArray(pkg?.workspaces) ? pkg.workspaces : pkg?.workspaces?.packages ?? [];
  const workspaceYaml = read(root, 'pnpm-workspace.yaml') ?? '';
  const yamlPaths = [...workspaceYaml.matchAll(/^\s*-\s*['"]?([a-zA-Z0-9_./*-]+)['"]?\s*$/gm)].map(m => m[1]!);
  const directories = new Set<string>(['.']);
  for (const pattern of [...workspaces, ...yamlPaths, 'apps/*', 'packages/*']) {
    if (!/^[a-zA-Z0-9_./*-]+$/.test(pattern) || pattern.includes('..') || pattern.startsWith('/') || pattern.includes('**')) { warnings.push(`Skipped unsupported workspace pattern: ${pattern}`); continue; }
    if (!pattern.includes('*')) { if (exists(safePath(root, pattern))) directories.add(pattern); continue; }
    if (!pattern.endsWith('/*') || pattern.slice(0, -2).includes('*')) continue;
    const parent = pattern.slice(0, -2);
    const full = safePath(root, parent);
    if (!exists(full) || !fs.statSync(full).isDirectory()) continue;
    for (const entry of fs.readdirSync(full, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.startsWith('.')) directories.add(`${parent}/${entry.name}`);
    }
  }
  if (directories.size > 100) throw new Error('More than 100 workspace directories; provide an explicit configuration.');
  const apps: Config['apps'] = [];
  const capabilities = new Set<Capability>();
  const databases = new Set<Config['database']>();
  const dbMap: Record<string, Config['database']> = { pg: 'postgres', postgres: 'postgres', sqlite3: 'sqlite', 'better-sqlite3': 'sqlite', mysql2: 'mysql', mysql: 'mysql', mongoose: 'mongodb', mongodb: 'mongodb' };
  for (const dir of directories) {
    const p = dir === '.' ? pkg : manifest(root, `${dir}/package.json`);
    const caps = capabilitiesFor(p, dir, root);
    for (const cap of caps) capabilities.add(cap);
    if (caps.length) apps.push({ path: dir, capabilities: caps });
    if (p) evidence.push(path.posix.join(dir, 'package.json'));
    for (const dep of Object.keys({ ...p?.dependencies, ...p?.devDependencies })) if (dbMap[dep]) databases.add(dbMap[dep]);
    for (const prisma of ['prisma/schema.prisma', 'schema.prisma']) {
      const schema = read(root, path.posix.join(dir, prisma));
      if (schema) {
        const provider = /datasource\s+\w+\s*\{[^}]*provider\s*=\s*"(\w+)"/s.exec(schema)?.[1];
        const match: Record<string, Config['database']> = { postgresql: 'postgres', sqlite: 'sqlite', mysql: 'mysql', mongodb: 'mongodb' };
        if (provider && match[provider]) databases.add(match[provider]);
        evidence.push(path.posix.join(dir, prisma));
      }
    }
  }
  const lockfiles = [['pnpm-lock.yaml', 'pnpm'], ['package-lock.json', 'npm'], ['yarn.lock', 'yarn'], ['bun.lock', 'bun'], ['bun.lockb', 'bun']] as const;
  const locks = lockfiles.filter(([file]) => exists(safePath(root, file)));
  const declared = pkg?.packageManager?.split('@')[0];
  const inferred = declared ?? locks[0]?.[1] ?? (workspaceYaml ? 'pnpm' : pkg ? 'npm' : capabilities.has('python') || capabilities.has('native') ? 'none' : 'pnpm');
  if (new Set(locks.map(l => l[1])).size > 1) warnings.push('Multiple package-manager lockfiles; confirm the intended package manager.');
  if (declared && locks.some(l => l[1] !== declared)) warnings.push('packageManager disagrees with a lockfile.');
  if (!capabilities.size) { capabilities.add('web'); warnings.push('Application type could not be detected; defaulted to web. Review capabilities.'); }
  const composeFiles = ['portainer.yml', 'portainer.yaml', 'portainer-compose.yml', 'compose.yaml', 'compose.yml', 'docker-compose.yml', 'docker-compose.yaml', 'docker/docker-compose.yml'].filter(f => exists(safePath(root, f)));
  const composeFile = composeFiles[0];
  const compose = composeFile ? read(root, composeFile) ?? '' : '';
  const stack = /^name:\s*['"]?([a-zA-Z0-9_.-]+)['"]?\s*$/m.exec(compose)?.[1];
  const scripts: Record<string, string> = {};
  for (const [name, command] of Object.entries(pkg?.scripts ?? {})) if (typeof command === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9:_.-]*$/.test(name)) scripts[name] = command;
  const verify = ['lint', 'typecheck', 'test'].filter(s => scripts[s]);
  const seen = new Set<string>();
  const uniqueChecks = verify.filter(s => {
    const signature = scripts[s]!.trim();
    if (seen.has(signature)) { warnings.push(`Check '${s}' duplicates another check; omitted from suggested validation.`); return false; }
    seen.add(signature); return true;
  });
  if (composeFile?.includes('portainer')) warnings.push('Portainer file detected. Select portainer and provide a host to enable its guidance; no host is guessed.');
  if (databases.size > 1) warnings.push('Multiple databases detected; selected existing.');
  const rawName = pkg?.name ?? path.basename(path.resolve(root));
  const projectName = /^(?:@[a-zA-Z0-9_.-]+\/)?[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(rawName) ? rawName : rawName.toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^[^a-z0-9]+/, '') || 'my-project';
  const config = validateConfig({ schemaVersion: 1, projectName, capabilities: CAPABILITIES.filter(c => capabilities.has(c)), packageManager: inferred, database: databases.size === 1 ? [...databases][0] : databases.size ? 'existing' : 'none', apps, commands: { verify: uniqueChecks, ...(scripts.build ? { build: 'build' } : {}), ...(scripts.dev ? { local: 'dev' } : {}) }, deployment: composeFile ? { kind: 'docker', composeFile, ...(stack ? { stackName: stack } : {}) } : { kind: 'none' }, workflow: 'validate' });
  const mappings = { buildApi: 'build:api', buildWeb: 'build:web', buildDesktop: 'build:desktop', electronBuild: 'electron:build', prismaGenerate: 'prisma:generate', dockerBuild: 'docker:build', dockerUp: 'docker:up', publishAll: 'docker:publish:arm64' } as const;
  for (const [key, script] of Object.entries(mappings)) if (scripts[script]) config.commands[key as keyof typeof mappings] = script;
  config.commands.publishServices = Object.fromEntries(Object.keys(scripts).filter(s => /^docker:publish-.+:arm64$/.test(s)).map(s => [s.slice('docker:publish-'.length, -':arm64'.length), s]));
  config.sharedPackages = [...directories].filter(d => d.startsWith('packages/') && exists(safePath(root, `${d}/package.json`)));
  const localCompose = composeFiles.find(f => !f.includes('portainer'));
  if (localCompose) config.operations!.dockerComposeFile = localCompose;
  return { config: validateConfig(config), warnings, evidence, scripts };
}
