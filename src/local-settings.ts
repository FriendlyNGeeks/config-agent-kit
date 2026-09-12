import { parseEnv } from 'node:util';
import { getOperations, getPublishing, dockerEnabled, type Config } from './config.js';
import { read } from './files.js';

export const LOCAL_ENV = 'secret.agent.env';
export const LOCAL_GUIDANCE = 'Resolve ${AGENT_*} references from the project-root secret.agent.env before using paths, usernames or hosts. Read only the required keys as data; never execute/source the file or print its values. If a key is missing, ask for it. Keep this file out of Git, packages and container build contexts.';

function fields(config: Config): [Record<string, unknown>, string, string][] {
  const ops = config.operations!;
  const rows: [object, string, string][] = [
    [config.deployment, 'host', 'AGENT_DEPLOY_HOST'],
    [config.deployment, 'composeFile', 'AGENT_DEPLOY_COMPOSE_PATH'],
    [ops, 'homepageHost', 'AGENT_HOMEPAGE_HOST'],
    [ops, 'homepagePath', 'AGENT_HOMEPAGE_PATH'],
    [ops, 'dockerComposeFile', 'AGENT_DOCKER_COMPOSE_PATH'],
  ];
  if (config.publishing) rows.push([config.publishing, 'dockerHubUsername', 'AGENT_DOCKER_USERNAME']);
  config.apps.forEach((app, i) => rows.push([app, 'path', `AGENT_APP_${i + 1}_PATH`]));
  (config.sharedPackages ?? []).forEach((_, i) => rows.push([config.sharedPackages!, String(i), `AGENT_SHARED_${i + 1}_PATH`]));
  return rows as [Record<string, unknown>, string, string][];
}

export function localize(source: Config): { config: Config; values: Record<string, string> } {
  const config = structuredClone(source);
  config.operations = structuredClone(getOperations(config));
  if (dockerEnabled(config)) config.publishing = structuredClone(getPublishing(config));
  const values: Record<string, string> = {};
  for (const [owner, field, key] of fields(config)) {
    const value = owner[field];
    if (typeof value !== 'string' || !value) continue;
    values[key] = value;
    owner[field] = '${' + key + '}';
  }
  return { config, values };
}

export function resolveLocalConfig(raw: unknown, root: string): unknown {
  // Only references in known local fields are resolved, never process environment variables.
  const config = structuredClone(raw) as Config;
  if (!config || !config.operations || !Array.isArray(config.apps) || !config.deployment) return raw;
  let values: ReturnType<typeof parseEnv> | undefined;
  for (const [owner, field, key] of fields(config)) {
    if (owner[field] !== '${' + key + '}') continue;
    values ??= parseEnv(read(root, LOCAL_ENV) ?? '');
    if (!values[key]) throw new Error(`Missing ${key} in ${LOCAL_ENV}. Restore the local settings file before updating.`);
    owner[field] = values[key];
  }
  return config;
}

export function mergeLocalEnv(before: string | undefined, values: Record<string, string>): string {
  let text = before ?? '# Agent Kit local paths, usernames and host aliases. Do not commit or publish.\n';
  const existing = parseEnv(text);
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const additions: string[] = [];
  for (const [key, value] of Object.entries(values)) {
    if (existing[key] === value) continue;
    // Config validation excludes quotes/newlines from these fields; do not interpret escapes.
    if (/[\r\n"']/u.test(value)) throw new Error(`Unsupported characters in ${key}.`);
    if (existing[key] !== undefined) {
      const pattern = new RegExp(`^(?:export[ \\t]+)?${key}[ \\t]*=[^\\r\\n]*`, 'gm');
      const matches = text.match(pattern);
      if (!matches || matches.length !== 1 || parseEnv(matches[0])[key] !== existing[key]) throw new Error(`Cannot safely update multiline or duplicate ${key} in ${LOCAL_ENV}.`);
      text = text.replace(pattern, () => `${key}='${value}'`);
      continue;
    }
    additions.push(`${key}='${value}'`);
  }
  return additions.length ? text + (text.endsWith('\n') ? '' : newline) + additions.join(newline) + newline : text;
}

export const IGNORE_ENTRIES = [LOCAL_ENV, '.agents/scaffold.json', '.agents/.scaffold-state.json', '.agents/scaffold-state.json', 'agents/scaffold-state.json'];
export function mergeIgnores(before = ''): string {
  const newline = before.includes('\r\n') ? '\r\n' : '\n';
  // Append after existing negations; repeated updates leave an identical final block.
  const block = ['# Agent Kit local configuration', ...IGNORE_ENTRIES].join(newline) + newline;
  if (before.endsWith(block)) return before;
  return before + (before && !before.endsWith('\n') ? newline : '') + block;
}
