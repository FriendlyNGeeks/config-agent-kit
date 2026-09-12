#!/usr/bin/env node
import path from 'node:path';
import { colorized } from './colorized.js';
import { completionSummary } from './completion.js';
import { promptDefaults } from './prompt-defaults.js';
import { resolveLocalConfig, localize, LOCAL_ENV } from './local-settings.js';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GENRES, GENRE_PROFILES, recommendCapabilities, type Genre } from './genres.js';
import { PREFERRED_AGENTS } from './agents.js';
import { setupQuestionnaire, type PromptMode } from './setup-prompts.js';
import { buildInvocation, scaffoldProject, providerFor, ScaffoldError, type ScaffoldRunner, type ScaffoldSelection } from './scaffold.js';
import { parseArgs } from 'node:util';
import { CONFIG_PATH, VERSION, getOperations, getPublishing, json, validateConfig, type Config } from './config.js';
import { detect } from './detect.js';
import { doctor } from './doctor.js';
import { readJson } from './files.js';
import { applyPlan, diff, plan } from './generate.js';
import { confirm, questionnaire } from './prompts.js';

const HELP = `Agent Kit ${VERSION}

Usage: config-agent-kit [directory] [options]
       config-agent-kit <init|update|detect|doctor|scaffold> [directory] [options]

  scaffold  Run an opted-in native generator, re-detect, then configure Agent Kit
  init      Detect a project, prompt for capabilities, preview, then generate instructions
  update    Regenerate using saved answers; preserve text outside managed markers
  detect    Print inferred answers and evidence; read-only
  doctor    Check paths, scripts, generated-file drift and legacy conflicts; read-only

Options:
  --prompt-mode <mode>   vibe (few questions) or pro (full settings); not persisted
  --genre <genre>        web,mobile,game,data-science,embedded,service,desktop,library,general
  --preferred-agent <v>  agnostic,gpt,claude,gemini,llama
  --scaffolder <id>      vite,expo,electron-forge (explicit external execution)
  --framework <id>       Registered template choice for the selected scaffolder
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
Application starters are created only by opted-in external generators. No live deployments.
Exit codes: 0 success, 1 invalid input/doctor errors, 2 file conflicts, 130 cancelled.
`;

export async function main(argv = process.argv.slice(2), dependencies: { runner?: ScaffoldRunner } = {}): Promise<void> {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
    genre: { type: 'string' }, 'preferred-agent': { type: 'string' }, 'prompt-mode': { type: 'string' }, framework: { type: 'string' }, scaffolder: { type: 'string' },
    'dockerhub-username': { type: 'string' }, architecture: { type: 'string' }, config: { type: 'string' }, name: { type: 'string' }, capabilities: { type: 'string' }, pm: { type: 'string' }, database: { type: 'string' }, deployment: { type: 'string' }, host: { type: 'string' }, stack: { type: 'string' }, compose: { type: 'string' }, workflow: { type: 'string' }, yes: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, diff: { type: 'boolean' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' }
    , 'docker-workflow': { type: 'string' }, 'docker-compose': { type: 'string' }, 'docker-rebuild': { type: 'string' }, electron: { type: 'string' }, 'electron-rebuild': { type: 'string' }, 'portainer-update': { type: 'string' }, changelog: { type: 'string' }, 'credential-source': { type: 'string' }, 'homepage-host': { type: 'string' }, 'homepage-path': { type: 'string' }, interactive: { type: 'boolean' }, 'learning-journal': { type: 'string' }
  } });
  if (values.help) { console.log(HELP); return; }
  if (values.version) { console.log(VERSION); return; }
  const knownCommands = ['init', 'update', 'detect', 'doctor', 'scaffold'];
  const positionalTarget = positionals[0] !== undefined && !knownCommands.includes(positionals[0]);
  const command = positionalTarget ? 'init' : positionals[0] ?? 'init';
  if (positionalTarget && positionals.length > 1) throw new Error('Expected one target directory. Use --help.');
  if (!['init', 'update', 'detect', 'doctor', 'scaffold'].includes(command) || positionals.length > 2) throw new Error('Expected init, update, detect, or doctor and one optional directory. Use --help.');
  const target = (positionalTarget ? positionals[0] : positionals[1]) ?? '.';
  const root = path.resolve(target);
  const wantsScaffold = command === 'scaffold' || values.scaffolder !== undefined;
  if (wantsScaffold && target.split(/[\\/]/).includes('..')) throw new Error('Scaffold target cannot contain parent traversal.');
  if (command === 'update' && (values.scaffolder || values.framework)) throw new Error('Scaffolding is only available for new projects.');
  if (values.framework && !values.scaffolder && command !== 'scaffold') throw new Error('--framework requires --scaffolder or the scaffold command.');
  if (values['prompt-mode'] && !['vibe', 'pro'].includes(values['prompt-mode'])) throw new Error('--prompt-mode must be vibe or pro.');
  if (values.genre && !GENRES.includes(values.genre as Genre)) throw new Error('Unknown genre: ' + values.genre);
  if (values['preferred-agent'] && !PREFERRED_AGENTS.includes(values['preferred-agent'] as Config['preferredAgent'])) throw new Error('Unknown preferred agent.');
  if (command === 'detect' || command === 'doctor') {
    const unsupported = Object.keys(values).filter(k => !['json', 'help', 'version'].includes(k));
    if (unsupported.length) throw new Error(`${command} does not accept ${unsupported.map(k => '--' + k).join(', ')}. Selection and write options apply to init/update.`);
  }
  if (command === 'doctor') {
    const result = doctor(root);
    if (values.json) console.log(json(result));
    else for (const finding of result.findings) console.log(colorized(finding.level, `${finding.level.toUpperCase()} ${finding.code}: ${finding.message}`));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  let detection = detect(root);
  // Never expose raw package script values: manifests can contain embedded credentials.
  if (command === 'detect') { console.log(json({ ...detection, scripts: Object.keys(detection.scripts) })); return; }
  if (values.json && !values.yes && !values['dry-run']) throw new Error('--json requires --yes or --dry-run for init/update.');
  let raw: unknown = detection.config;
  if (command === 'update') {
    raw = resolveLocalConfig(readJson(root, CONFIG_PATH), root);
    if (!raw) throw new Error('No saved configuration; use init first.');
  }
  if (values.config) {
    const configFile = path.resolve(values.config);
    raw = resolveLocalConfig(readJson(path.dirname(configFile), path.basename(configFile)), path.basename(path.dirname(configFile)) === '.agents' ? path.dirname(path.dirname(configFile)) : path.dirname(configFile));
    if (!raw) throw new Error('Configuration file not found.');
  }
  let config: Config = validateConfig(raw);
  const configure = (source: Config): Config => {
    const candidate = structuredClone(source);
    candidate.operations = structuredClone(getOperations(source));
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
    if (values.genre) candidate.genre = values.genre as Genre;
    if (values['preferred-agent']) candidate.preferredAgent = values['preferred-agent'] as Config['preferredAgent'];
    return candidate;
  };
  const freshPrompts = command !== 'update' && !values.config && !values.yes && !values['dry-run'];
  let candidate = configure(freshPrompts ? promptDefaults(config) : config);
  const capabilitiesKnown = detection.capabilitiesKnown || !!values.capabilities || !!values.config || command === 'update';
  if (values.genre && !capabilitiesKnown) {
    candidate.capabilities = recommendCapabilities(candidate.genre, candidate.capabilities, false);
    if (!values.pm && candidate.capabilities.every(c => c === 'python' || c === 'native')) { candidate.packageManager = 'none'; candidate.commands = { verify: [] }; }
  }
  let mode = values['prompt-mode'] as PromptMode | undefined;
  let selection: ScaffoldSelection | undefined;
  if (values.scaffolder) {
    const provider = providerFor(values.scaffolder);
    if (!values.genre && !values.config && candidate.genre === 'general') candidate.genre = provider.genres[0]!;
    selection = { provider: provider.id, framework: values.framework ?? Object.keys(provider.frameworks)[0]! };
  }
  const interactive = values.interactive || (command === 'init' || command === 'scaffold') && !values.yes && !values['dry-run'];
  if (values.interactive && (values.yes || values.json)) throw new Error('--interactive cannot be combined with --yes or --json.');
  if (wantsScaffold && detection.projectState !== 'empty') throw new Error('Scaffolding requires an empty or new directory; use init for existing projects.');
  if (interactive) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Interactive init requires a terminal. Use --yes or --dry-run, optionally with --config.');
    const setup = await setupQuestionnaire(candidate, { mode, allowScaffold: command !== 'update' && detection.projectState === 'empty', requireScaffold: command === 'scaffold', capabilitiesKnown, selection });
    candidate = setup.config; mode = setup.mode; selection = setup.selection;
  } else if (command === 'scaffold' && !selection) {
    const provider = GENRE_PROFILES[candidate.genre].scaffolders[0];
    if (!provider) throw new Error('Choose --genre and --scaffolder for a supported starter.');
    selection = { provider, framework: values.framework ?? Object.keys(providerFor(provider).frameworks)[0]! };
  }
  let scaffoldCompleted = false;
  if (selection) {
    if (target.split(/[\\/]/).includes('..')) throw new Error('Scaffold target cannot contain parent traversal.');
    // Reject invalid project options before starting an external process.
    candidate = validateConfig(candidate);
    const invocation = buildInvocation(root, selection, candidate.genre);
    if (values['dry-run']) {
      const preview = { scaffold: invocation, provisional: true, written: false, message: 'No process started. Application facts and the Agent Kit plan will be determined after scaffolding.' };
      console.log(values.json ? json(preview) : JSON.stringify(preview, null, 2));
      return;
    }
    if (!values.json) console.log(colorized('warning', 'External generator (application files are not rolled back):\n' + JSON.stringify(invocation, null, 2)));
    if (!values.yes && !await confirm('Run this external generator?')) { console.log(colorized('warning', 'Cancelled; no files written.')); return; }
    detection = await scaffoldProject(invocation, dependencies.runner, !!values.json);
    scaffoldCompleted = true;
    candidate = configure({ ...(freshPrompts ? promptDefaults(detection.config) : detection.config), genre: candidate.genre, preferredAgent: candidate.preferredAgent, learningJournal: candidate.learningJournal });
  }
  if (interactive) config = await questionnaire(candidate, undefined, { mode, skipIdentity: true, askAgent: !values['preferred-agent'], capabilitiesKnown: scaffoldCompleted ? detection.capabilitiesKnown || !!values.capabilities : capabilitiesKnown });
  else config = validateConfig(candidate);
  if (config.publishing && config.packageManager !== 'none') {
    const arch = config.publishing.architecture;
    const all = 'docker:publish:' + arch;
    if (!config.commands.publishAll && detection.scripts[all]) config.commands.publishAll = all;
    for (const name of Object.keys(detection.scripts)) {
      const match = /^docker:publish-([a-zA-Z0-9_.-]+):(arm64|x64|x86)$/.exec(name);
      if (match && match[2] === arch) (config.commands.publishServices ??= {})[match[1]!] ??= name;
    }
  }
  const result = plan(root, config, command === 'update' ? 'update' : 'init');
  const publicResult = { ...result, config: localize(config).config, changes: result.changes.map(change => change.path === LOCAL_ENV ? { ...change, before: change.before === undefined ? undefined : '[Local values hidden]', after: '[Local values hidden]' } : change) };
  if (!values.json) {
    console.log(colorized('info', 'Profile: ' + config.genre + '; agent: ' + config.preferredAgent + '; capabilities: ' + config.capabilities.join(', ') + '; package manager: ' + config.packageManager + '; database: ' + config.database + '; deployment: ' + config.deployment.kind + '; automatic live update: ' + getOperations(config).portainerStackUpdate));
    console.log(colorized('heading', `\n${values['dry-run'] ? 'Preview' : 'Plan'} for ${config.projectName}\nTarget: ${root}`));
    for (const warning of detection.warnings) {
      if (warning.startsWith('Portainer file') && config.deployment.kind === 'portainer') continue;
      if (warning.startsWith('Application type') && (interactive || command === 'update' || values.config || values.capabilities || !values.yes && !values['dry-run'] && command === 'init')) continue;
      console.log(colorized('warning', `NOTE ${warning}`));
    }
    for (const change of result.changes) {
      console.log(colorized(change.action, `${change.action.toUpperCase().padEnd(10)} ${change.path}${change.reason ? ': ' + change.reason : ''}`));
      if (values.diff && change.action !== 'unchanged') console.log(diff(change));
    }
  }
  if (result.conflicts.length) {
    if (values.json) console.log(json({ ...publicResult, written: false }));
    else console.log(colorized('error', (scaffoldCompleted ? 'Application scaffold remains; no Agent Kit files written. ' : 'No files written. ') + 'Reconcile existing instructions manually, or generate into a separate directory with --config.'));
    process.exitCode = 2;
    return;
  }
  if (values['dry-run']) {
    if (values.json) console.log(json({ ...publicResult, written: false }));
    else console.log(colorized('success', 'Dry run complete; no files or directories written.'));
    return;
  }
  if (interactive && !await confirm()) { console.log(colorized('warning', scaffoldCompleted ? 'Cancelled Agent Kit generation; application scaffold remains.' : 'Cancelled; no files written.')); return; }
  applyPlan(result);
  if (values.json) console.log(json({ ...publicResult, written: true }));
  else console.log(completionSummary(result, scaffoldCompleted));
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main().catch((error: unknown) => {
  const e = error as Error;
  const cancelled = e.name === 'AbortError' || e.message.includes('readline was closed');
  const message = cancelled ? 'Cancelled; no Agent Kit files written.' : e.message;
  if (process.argv.includes('--json')) console.error(json({ error: message }));
  else console.error(colorized(cancelled ? 'warning' : 'error', `Error: ${message}`, process.stderr));
  process.exitCode = error instanceof ScaffoldError ? error.exitCode : cancelled ? 130 : 1;
});
