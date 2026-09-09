#!/usr/bin/env node
import path from 'node:path';
import { parseArgs } from 'node:util';
import { CONFIG_PATH, VERSION, getOperations, getPublishing, json, validateConfig, type Config } from './config.js';
import { detect } from './detect.js';
import { doctor } from './doctor.js';
import { readJson } from './files.js';
import { applyPlan, diff, plan } from './generate.js';
import { confirm, questionnaire } from './prompts.js';

const HELP = `Agent Kit ${VERSION}

Usage: config-agent-kit [directory] [options]
       config-agent-kit <init|update|detect|doctor> [directory] [options]

  init      Detect a project, prompt for capabilities, preview, then generate instructions
  update    Regenerate using saved answers; preserve text outside managed markers
  detect    Print inferred answers and evidence; read-only
  doctor    Check paths, scripts, generated-file drift and legacy conflicts; read-only

Options:
  --config <file>         Read answers from JSON (validated, never executed)
  --name <name>           Override project name
  --capabilities <list>   Comma-separated web,api,desktop,python,native
  --pm <manager>          pnpm, npm, yarn, bun, none
  --database <kind>       none, postgres, sqlite, mysql, mongodb, existing
  --deployment <kind>     none, docker, portainer
  --host <alias>          Portainer target alias (never guessed)
  --stack <name>          Existing/intended stack name
  --compose <path>        Deployment Compose file relative to selected project root (e.g. portainer.yml); records a path, does not create a file
  --docker-workflow <v>   none, compose, docker-first (local workflow)
  --docker-compose <p>    Local Compose path relative to project root
  --dockerhub-username <v> Docker Hub username/organization (Docker only)
  --architecture <v>     arm64, x64, x86 (Docker only)
  --docker-rebuild <v>    true or false: automatic local container rebuilds
  --electron <v>          true or false: Electron support
  --electron-rebuild <v>  true or false: automatic Electron rebuilds
  --portainer-update <v>  true or false: stack changes trigger complete deployment
  --changelog <v>         true or false: automatic changelog updates
  --credential-source <v> homepage or external
  --homepage-host <v>     SSH host with Homepage services.yaml
  --homepage-path <v>     Absolute services.yaml path on that host
  --learning-journal <v>  true or false: include the optional learning skill
  --interactive          Revisit prompts during update
  --workflow <mode>       validate or run-local
  --yes                  Accept answers and write without interactive prompts
  --dry-run              Preview only; never create directories or write files
  --diff                 Include proposed changed lines in text preview
  --json                 Machine-readable output; init/update require --yes or --dry-run
  --help, -h             Show help
  --version, -v          Show version

No arguments starts interactive init in the current directory.
This tool generates instruction files, not application source or live deployments.
Exit codes: 0 success, 1 invalid input/doctor errors, 2 file conflicts, 130 cancelled.
`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({ allowPositionals: true, strict: true, options: {
    'dockerhub-username': { type: 'string' }, architecture: { type: 'string' }, config: { type: 'string' }, name: { type: 'string' }, capabilities: { type: 'string' }, pm: { type: 'string' }, database: { type: 'string' }, deployment: { type: 'string' }, host: { type: 'string' }, stack: { type: 'string' }, compose: { type: 'string' }, workflow: { type: 'string' }, yes: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, diff: { type: 'boolean' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' }
    , 'docker-workflow': { type: 'string' }, 'docker-compose': { type: 'string' }, 'docker-rebuild': { type: 'string' }, electron: { type: 'string' }, 'electron-rebuild': { type: 'string' }, 'portainer-update': { type: 'string' }, changelog: { type: 'string' }, 'credential-source': { type: 'string' }, 'homepage-host': { type: 'string' }, 'homepage-path': { type: 'string' }, interactive: { type: 'boolean' }, 'learning-journal': { type: 'string' }
  } });
  if (values.help) { console.log(HELP); return; }
  if (values.version) { console.log(VERSION); return; }
  const knownCommands = ['init', 'update', 'detect', 'doctor'];
  const positionalTarget = positionals[0] !== undefined && !knownCommands.includes(positionals[0]);
  const command = positionalTarget ? 'init' : positionals[0] ?? 'init';
  if (positionalTarget && positionals.length > 1) throw new Error('Expected one target directory. Use --help.');
  if (!['init', 'update', 'detect', 'doctor'].includes(command) || positionals.length > 2) throw new Error('Expected init, update, detect, or doctor and one optional directory. Use --help.');
  const root = path.resolve((positionalTarget ? positionals[0] : positionals[1]) ?? '.');
  if (command === 'detect' || command === 'doctor') {
    const unsupported = Object.keys(values).filter(k => !['json', 'help', 'version'].includes(k));
    if (unsupported.length) throw new Error(`${command} does not accept ${unsupported.map(k => '--' + k).join(', ')}. Selection and write options apply to init/update.`);
  }
  if (command === 'doctor') {
    const result = doctor(root);
    if (values.json) console.log(json(result));
    else for (const finding of result.findings) console.log(`${finding.level.toUpperCase()} ${finding.code}: ${finding.message}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  const detection = detect(root);
  // Never expose raw package script values: manifests can contain embedded credentials.
  if (command === 'detect') { console.log(json({ ...detection, scripts: Object.keys(detection.scripts) })); return; }
  if (values.json && !values.yes && !values['dry-run']) throw new Error('--json requires --yes or --dry-run for init/update.');
  let raw: unknown = detection.config;
  if (command === 'update') {
    raw = readJson(root, CONFIG_PATH);
    if (!raw) throw new Error('No saved configuration; use init first.');
  }
  if (values.config) {
    const configFile = path.resolve(values.config);
    raw = readJson(path.dirname(configFile), path.basename(configFile));
    if (!raw) throw new Error('Configuration file not found.');
  }
  let config: Config = validateConfig(raw);
  const candidate = structuredClone(config);
  candidate.operations = structuredClone(getOperations(config));
  if (values.name !== undefined) candidate.projectName = values.name;
  if (values.capabilities !== undefined) {
    candidate.capabilities = values.capabilities.split(',').map(s => s.trim()) as Config['capabilities'];
    candidate.apps = candidate.apps.map(a => ({ ...a, capabilities: a.capabilities.filter(c => candidate.capabilities.includes(c)) })).filter(a => a.capabilities.length);
    if (!candidate.capabilities.includes('desktop')) { candidate.operations.electron = false; candidate.operations.electronRebuild = false; }
  }
  if (values.pm !== undefined) {
    candidate.packageManager = values.pm as Config['packageManager'];
    if (values.pm === 'none') candidate.commands = { verify: [] };
  }
  if (values.database !== undefined) candidate.database = values.database as Config['database'];
  if (values.deployment !== undefined) {
    candidate.deployment = values.deployment === 'none' ? { kind: 'none' } : { ...candidate.deployment, kind: values.deployment as Config['deployment']['kind'] };
    if (values.deployment === 'docker') delete candidate.deployment.host;
    if (values.deployment !== 'portainer') candidate.operations.portainerStackUpdate = false;
  }
  if (values.host !== undefined) candidate.deployment.host = values.host;
  if (values.stack !== undefined) candidate.deployment.stackName = values.stack;
  if (values.compose !== undefined) candidate.deployment.composeFile = values.compose;
  if (values.workflow !== undefined) candidate.workflow = values.workflow as Config['workflow'];
  const ops = candidate.operations;
  if (values['docker-workflow'] !== undefined) {
    ops.dockerWorkflow = values['docker-workflow'] as typeof ops.dockerWorkflow;
    if (ops.dockerWorkflow === 'none') { ops.dockerRebuild = false; delete ops.dockerComposeFile; }
  }
  if (values['docker-compose'] !== undefined) ops.dockerComposeFile = values['docker-compose'];
  for (const [flag, key] of [['docker-rebuild', 'dockerRebuild'], ['electron', 'electron'], ['electron-rebuild', 'electronRebuild'], ['portainer-update', 'portainerStackUpdate'], ['changelog', 'changelogUpdate']] as const) {
    const value = values[flag];
    if (value !== undefined) {
      if (value !== 'true' && value !== 'false') throw new Error(`--${flag} must be true or false.`);
      ops[key] = value === 'true';
    }
  }
  if (values.electron === 'true' && !candidate.capabilities.includes('desktop')) candidate.capabilities.push('desktop');
  if (values.electron === 'false' && values['electron-rebuild'] === undefined) ops.electronRebuild = false;
  if (values['credential-source']) ops.portainerCredentialSource = values['credential-source'] as typeof ops.portainerCredentialSource;
  if (values['homepage-host']) ops.homepageHost = values['homepage-host'];
  if (values['homepage-path']) ops.homepagePath = values['homepage-path'];
  if (values['dockerhub-username'] !== undefined || values.architecture !== undefined) {
    candidate.publishing = { ...getPublishing(candidate),
      ...(values['dockerhub-username'] !== undefined ? { dockerHubUsername: values['dockerhub-username'] } : {}),
      ...(values.architecture !== undefined ? { architecture: values.architecture as NonNullable<Config['publishing']>['architecture'] } : {}) };
  }
  if (values['learning-journal'] !== undefined) {
    if (!['true', 'false'].includes(values['learning-journal'])) throw new Error('--learning-journal must be true or false.');
    candidate.learningJournal = values['learning-journal'] === 'true';
  }
  const interactive = values.interactive || command === 'init' && !values.yes && !values['dry-run'];
  if (values.interactive && (values.yes || values.json)) throw new Error('--interactive cannot be combined with --yes or --json.');
  if (interactive) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Interactive init requires a terminal. Use --yes or --dry-run, optionally with --config.');
    config = await questionnaire(candidate);
  } else config = validateConfig(candidate);
  if (config.publishing && config.packageManager !== 'none') {
    const arch = config.publishing.architecture;
    const all = 'docker:publish:' + arch;
    if (!config.commands.publishAll && detection.scripts[all]) config.commands.publishAll = all;
    for (const name of Object.keys(detection.scripts)) {
      const match = /^docker:publish-([a-zA-Z0-9_.-]+):(arm64|x64|x86)$/.exec(name);
      if (match && match[2] === arch) (config.commands.publishServices ??= {})[match[1]!] ??= name;
    }
  }
  const result = plan(root, config, command as 'init' | 'update');
  if (!values.json) {
    console.log(`\n${values['dry-run'] ? 'Preview' : 'Plan'} for ${config.projectName}\nTarget: ${root}`);
    for (const warning of detection.warnings) {
      if (warning.startsWith('Portainer file') && config.deployment.kind === 'portainer') continue;
      if (warning.startsWith('Application type') && (command === 'update' || values.config || values.capabilities || !values.yes && !values['dry-run'] && command === 'init')) continue;
      console.log(`NOTE ${warning}`);
    }
    for (const change of result.changes) {
      console.log(`${change.action.toUpperCase().padEnd(10)} ${change.path}${change.reason ? ': ' + change.reason : ''}`);
      if (values.diff && change.action !== 'unchanged') console.log(diff(change));
    }
  }
  if (result.conflicts.length) {
    if (values.json) console.log(json({ ...result, written: false }));
    else console.log('No files written. Reconcile existing instructions manually, or generate into a separate directory with --config.');
    process.exitCode = 2;
    return;
  }
  if (values['dry-run']) {
    if (values.json) console.log(json({ ...result, written: false }));
    else console.log('Dry run complete; no files or directories written.');
    return;
  }
  if (interactive && !await confirm()) { console.log('Cancelled; no files written.'); return; }
  applyPlan(result);
  if (values.json) console.log(json({ ...result, written: true }));
  else console.log('Done. Add custom guidance outside managed markers. Run config-agent-kit doctor to check the result.');
}

main().catch((error: unknown) => {
  const e = error as Error;
  const cancelled = e.name === 'AbortError' || e.message.includes('readline was closed');
  const message = cancelled ? 'Cancelled; no files written.' : e.message;
  if (process.argv.includes('--json')) console.error(json({ error: message }));
  else console.error(`Error: ${message}`);
  process.exitCode = cancelled ? 130 : 1;
});
