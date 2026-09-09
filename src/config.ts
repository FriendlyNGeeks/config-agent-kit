import path from 'node:path';

export const VERSION = '0.3.1';
export const ARCHITECTURES = ['arm64', 'x64', 'x86'] as const;
export const PLATFORMS = { arm64: 'linux/arm64', x64: 'linux/amd64', x86: 'linux/386' } as const;
export interface Publishing { dockerHubUsername: string; architecture: typeof ARCHITECTURES[number] }
export const getPublishing = (c: Config): Publishing => c.publishing ?? { dockerHubUsername: 'friendlyngeeks', architecture: 'arm64' };
export const dockerEnabled = (c: Config): boolean => getOperations(c).dockerWorkflow !== 'none' || c.deployment.kind !== 'none';
export const DOCKER_WORKFLOWS = ['none', 'compose', 'docker-first'] as const;
export const COMMAND_KEYS = ['build', 'local', 'buildApi', 'buildWeb', 'buildDesktop', 'electronBuild', 'prismaGenerate', 'dockerBuild', 'dockerUp', 'publishAll'] as const;
export interface Operations {
  dockerWorkflow: typeof DOCKER_WORKFLOWS[number]; dockerComposeFile?: string;
  changelogUpdate: boolean; dockerRebuild: boolean; electron: boolean;
  electronRebuild: boolean; portainerStackUpdate: boolean;
  portainerCredentialSource: 'homepage' | 'external'; homepageHost: string; homepagePath: string;
}
export const CONFIG_PATH = '.agents/scaffold.json';
export const STATE_PATH = '.agents/.scaffold-state.json';
export const CAPABILITIES = ['web', 'api', 'desktop', 'python', 'native'] as const;
export const MANAGERS = ['pnpm', 'npm', 'yarn', 'bun', 'none'] as const;
export const DATABASES = ['none', 'postgres', 'sqlite', 'mysql', 'mongodb', 'existing'] as const;
export const DEPLOYMENTS = ['none', 'docker', 'portainer'] as const;
export type Capability = typeof CAPABILITIES[number];
export interface Config {
  schemaVersion: 1;
  projectName: string;
  capabilities: Capability[];
  packageManager: typeof MANAGERS[number];
  database: typeof DATABASES[number];
  apps: { path: string; capabilities: Capability[] }[];
  commands: { verify: string[]; publishServices?: Record<string, string> } & Partial<Record<typeof COMMAND_KEYS[number], string>>;
  deployment: { kind: typeof DEPLOYMENTS[number]; host?: string; stackName?: string; composeFile?: string };
  workflow: 'validate' | 'run-local';
  operations?: Operations;
  sharedPackages?: string[];
  publishing?: Publishing;
  learningJournal?: boolean;
}

export function operationDefaults(c: Config): Operations {
  return { dockerWorkflow: c.deployment.kind === 'none' ? 'none' : 'compose', changelogUpdate: true,
    dockerRebuild: c.deployment.kind !== 'none' && c.workflow === 'run-local', electron: c.capabilities.includes('desktop'),
    electronRebuild: c.capabilities.includes('desktop'), portainerStackUpdate: false,
    portainerCredentialSource: 'homepage', homepageHost: 'watchtower', homepagePath: '' };
}
export const getOperations = (c: Config): Operations => c.operations ?? operationDefaults(c);
export function allScripts(c: Config): string[] {
  return [...new Set([...c.commands.verify, ...COMMAND_KEYS.flatMap(k => c.commands[k] ? [c.commands[k]!] : []), ...Object.values(c.commands.publishServices ?? {})])];
}

export function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[], label: string): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Unknown ${label} field: ${key}`);
}
function choice<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) throw new Error(`${label} must be one of: ${values.join(', ')}.`);
  return value as T;
}
function text(value: unknown, label: string, pattern: RegExp, max = 120): string {
  if (typeof value !== 'string' || !value.length || value.length > max || !pattern.test(value)) throw new Error(`Invalid ${label}.`);
  return value;
}
export function relativePath(value: unknown, label = 'path'): string {
  const result = text(value, label, /^[a-zA-Z0-9_./ \\-]+$/, 240).replaceAll('\\', '/');
  if (path.posix.isAbsolute(result) || result.split('/').some(p => p === '..' || p === '' || /[. ]$/.test(p) && p !== '.' || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw new Error(`${label} must be a safe relative path without parent traversal.`);
  return path.posix.normalize(result);
}
function capabilityList(value: unknown): Capability[] {
  if (!Array.isArray(value) || !value.length) throw new Error('Select at least one capability.');
  return [...new Set(value.map(v => choice(v, CAPABILITIES, 'capability')))];
}
const scriptName = (value: unknown) => text(value, 'package script name', /^[a-zA-Z0-9][a-zA-Z0-9:_.-]*$/);

export function validateConfig(input: unknown): Config {
  const c = object(input, 'configuration');
  keys(c, ['schemaVersion', 'projectName', 'capabilities', 'packageManager', 'database', 'apps', 'commands', 'deployment', 'workflow', 'operations', 'sharedPackages', 'publishing', 'learningJournal'], 'configuration');
  if (c.schemaVersion !== 1) throw new Error('Unsupported configuration schemaVersion; expected 1.');
  if (c.learningJournal !== undefined && typeof c.learningJournal !== 'boolean') throw new Error('learningJournal must be a boolean.');
  const capabilities = capabilityList(c.capabilities);
  const commands = object(c.commands, 'commands');
  keys(commands, ['verify', ...COMMAND_KEYS, 'publishServices'], 'commands');
  if (!Array.isArray(commands.verify)) throw new Error('commands.verify must be an array of package script names.');
  const deployment = object(c.deployment, 'deployment');
  keys(deployment, ['kind', 'host', 'stackName', 'composeFile'], 'deployment');
  const kind = choice(deployment.kind, DEPLOYMENTS, 'deployment.kind');
  if (kind === 'none' && Object.keys(deployment).some(k => k !== 'kind')) throw new Error('Deployment fields require docker or portainer deployment.');
  if (kind === 'portainer' && (!deployment.host || !deployment.stackName)) throw new Error('Portainer requires a host alias and existing or intended stack name.');
  if (kind === 'docker' && deployment.host !== undefined) throw new Error('A host alias requires Portainer deployment.');
  if (!Array.isArray(c.apps)) throw new Error('apps must be an array.');
  const apps = c.apps.map(a => {
    const app = object(a, 'app');
    keys(app, ['path', 'capabilities'], 'app');
    const appCapabilities = capabilityList(app.capabilities);
    if (appCapabilities.some(cap => !capabilities.includes(cap))) throw new Error('App capabilities must also be selected at project level.');
    return { path: relativePath(app.path, 'app path'), capabilities: appCapabilities };
  });
  if (new Set(apps.map(a => a.path.toLowerCase())).size !== apps.length) throw new Error('Duplicate app paths.');
  const result: Config = {
    schemaVersion: 1, learningJournal: c.learningJournal === true,
    projectName: text(c.projectName, 'project name (use letters, digits, dashes, underscores, dots or an npm scope)', /^(?:@[a-zA-Z0-9_.-]+\/)?[a-zA-Z0-9][a-zA-Z0-9_.-]*$/),
    capabilities, packageManager: choice(c.packageManager, MANAGERS, 'packageManager'),
    database: choice(c.database, DATABASES, 'database'), apps,
    commands: { verify: [...new Set(commands.verify.map(scriptName))], ...Object.fromEntries(COMMAND_KEYS.flatMap(k => commands[k] !== undefined ? [[k, scriptName(commands[k])]] : [])), ...(commands.publishServices !== undefined ? { publishServices: Object.fromEntries(Object.entries(object(commands.publishServices, 'publishServices')).map(([k, v]) => [scriptName(k), scriptName(v)])) } : {}) },
    deployment: { kind, ...(deployment.host !== undefined ? { host: text(deployment.host, 'host alias', /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/) } : {}), ...(deployment.stackName !== undefined ? { stackName: text(deployment.stackName, 'stack name', /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/) } : {}), ...(deployment.composeFile !== undefined ? { composeFile: relativePath(deployment.composeFile, 'Compose file') } : {}) },
    workflow: choice(c.workflow, ['validate', 'run-local'], 'workflow')
  };
  if (result.packageManager === 'none' && allScripts(result).length) throw new Error('Package scripts require a package manager.');
  if (c.sharedPackages !== undefined && !Array.isArray(c.sharedPackages)) throw new Error('sharedPackages must be an array.');
  result.sharedPackages = [...new Set(((c.sharedPackages ?? []) as unknown[]).map(p => relativePath(p, 'shared package path')))];
  const defaults = operationDefaults(result);
  const ops = c.operations === undefined ? defaults : object(c.operations, 'operations');
  keys(ops as unknown as Record<string, unknown>, [...Object.keys(defaults), 'dockerComposeFile'], 'operations');
  const merged = { ...defaults, ...ops } as Operations;
  for (const key of ['changelogUpdate', 'dockerRebuild', 'electron', 'electronRebuild', 'portainerStackUpdate'] as const) if (typeof merged[key] !== 'boolean') throw new Error(`operations.${key} must be a boolean.`);
  merged.dockerWorkflow = choice(merged.dockerWorkflow, DOCKER_WORKFLOWS, 'dockerWorkflow');
  if (merged.dockerComposeFile !== undefined) merged.dockerComposeFile = relativePath(merged.dockerComposeFile, 'local Compose file');
  merged.portainerCredentialSource = choice(merged.portainerCredentialSource, ['homepage', 'external'], 'Portainer credential source');
  merged.homepageHost = text(merged.homepageHost, 'Homepage SSH alias', /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/);
  if (merged.homepagePath !== '') merged.homepagePath = text(merged.homepagePath, 'Homepage absolute file path', /^\/[a-zA-Z0-9_./ -]+$/, 240);
  if (merged.homepagePath.split('/').includes('..')) throw new Error('Homepage path cannot contain parent traversal.');
  if (merged.dockerRebuild && merged.dockerWorkflow === 'none') throw new Error('dockerRebuild requires a Docker workflow.');
  if (merged.dockerComposeFile && merged.dockerWorkflow === 'none') throw new Error('Local Compose path requires a Docker workflow.');
  if (merged.electron && !capabilities.includes('desktop')) throw new Error('Electron requires the desktop capability.');
  if (merged.electronRebuild && !merged.electron) throw new Error('electronRebuild requires Electron.');
  if (merged.portainerStackUpdate && kind !== 'portainer') throw new Error('portainerStackUpdate requires Portainer deployment.');
  result.operations = merged;
  if (dockerEnabled(result)) {
    const publishing = c.publishing === undefined ? getPublishing(result) : object(c.publishing, 'publishing');
    keys(publishing as unknown as Record<string, unknown>, ['dockerHubUsername', 'architecture'], 'publishing');
    result.publishing = {
      dockerHubUsername: text(publishing.dockerHubUsername, 'Docker Hub username', /^[a-z0-9][a-z0-9_-]*$/, 64),
      architecture: choice(publishing.architecture, ARCHITECTURES, 'publishing.architecture')
    };
  }
  const architecture = result.publishing?.architecture;
  const compatible = (script: string) => {
    const suffix = /^docker:publish(?:-[a-zA-Z0-9_.-]+)?:([^:]+)$/.exec(script)?.[1];
    return !suffix || suffix === architecture;
  };
  if (result.commands.publishAll && !compatible(result.commands.publishAll)) delete result.commands.publishAll;
  if (result.commands.publishServices) result.commands.publishServices = Object.fromEntries(Object.entries(result.commands.publishServices).filter(([, script]) => compatible(script)));
  return result;
}

export function json(value: unknown): string { return JSON.stringify(value, null, 2) + '\n'; }
