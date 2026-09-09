import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { ARCHITECTURES, getPublishing, CAPABILITIES, DATABASES, DOCKER_WORKFLOWS, MANAGERS, getOperations, validateConfig, type Config } from './config.js';

export const COMPOSE_HELP = 'Compose file path, relative to the project directory you selected (the folder containing AGENTS.md). Examples: docker-compose.yml means a file at the project root; docker/docker-compose.yml means a file in its docker subfolder. For Portainer, use the tracked deployment file, often portainer.yml. This is not a remote server path, Portainer URL, or data-volume location. The CLI records the path but does not create the Compose file. Leave blank if unknown; resolve it before running/deploying. Enter keeps a detected value; type - to clear it.';

export async function questionnaire(defaults: Config, io = { input: stdin as NodeJS.ReadableStream, output: stdout as NodeJS.WritableStream }): Promise<Config> {
  const { input, output: stdout } = io;
  const rl = readline.createInterface({ input, output: stdout });
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  const ask = async (label: string, fallback = '') => (await rl.question(`${label}${fallback ? ` [${fallback}]` : ''}: `, { signal: controller.signal })).trim() || fallback;
  const pick = async <T extends string>(label: string, values: readonly T[], fallback: T): Promise<T> => {
    while (true) {
      stdout.write(`\n${label}\n${values.map((v, i) => `  ${i + 1}. ${v}`).join('\n')}\n`);
      const answer = await ask('Choose number or name', fallback);
      const selected = values[Number(answer) - 1] ?? (values.includes(answer as T) ? answer as T : undefined);
      if (selected) return selected;
      stdout.write('Choose one of the listed values.\n');
    }
  };
  const yesNo = async (label: string, fallback: boolean) => await pick(label, ['yes', 'no'], fallback ? 'yes' : 'no') === 'yes';
  const composePath = async (label: string, fallback?: string) => {
    stdout.write(`\n${COMPOSE_HELP}\n`);
    const value = await ask(label, fallback ?? '');
    return value === '-' || !value ? undefined : value;
  };
  try {
    stdout.write('\nAgent Kit — project configuration\nCreates AGENTS.md and selected .agents references; does not scaffold application code.\n');
    let config = structuredClone(defaults);
    while (true) {
      config.projectName = await ask('Project name', config.projectName);
      stdout.write(`\nCapabilities: ${CAPABILITIES.map((c, i) => `${i + 1}=${c}`).join(', ')}\n`);
      const answer = await ask('Select names or numbers separated by commas', config.capabilities.join(','));
      config.capabilities = answer.split(',').map(s => s.trim()).map(s => CAPABILITIES[Number(s) - 1] ?? s) as Config['capabilities'];
      config.packageManager = await pick('Package manager', MANAGERS, config.packageManager);
      if (config.packageManager === 'none') config.commands = { verify: [] };
      config.database = await pick('Database', DATABASES, config.database);
      const ops = structuredClone(getOperations(config));
      ops.electron = await yesNo('Does this project use Electron?', ops.electron);
      if (ops.electron && !config.capabilities.includes('desktop')) config.capabilities.push('desktop');
      ops.electronRebuild = ops.electron && await yesNo('Automatically rebuild Electron after runtime, preload, renderer, icon or desktop configuration changes?', ops.electronRebuild);
      const docker = await yesNo('Does this project use Docker locally or for deployment?', ops.dockerWorkflow !== 'none' || config.deployment.kind !== 'none');
      ops.dockerWorkflow = docker ? await pick('Local Docker workflow: none = native tools; compose = containers when needed; docker-first = Compose is the primary local runtime', DOCKER_WORKFLOWS, ops.dockerWorkflow) : 'none';
      ops.dockerRebuild = ops.dockerWorkflow !== 'none' && await yesNo('Automatically rebuild/recreate affected local Compose services after container runtime changes?', ops.dockerRebuild);
      ops.dockerComposeFile = ops.dockerWorkflow === 'none' ? undefined : await composePath('Local Compose file path (optional)', ops.dockerComposeFile);
      const portainer = docker && await yesNo('Will this project be deployed through Portainer?', config.deployment.kind === 'portainer');
      const kind = portainer ? 'portainer' : docker ? 'docker' : 'none';
      if (docker) {
        const publishing = getPublishing(config);
        config.publishing = {
          dockerHubUsername: await ask('Docker Hub username or organization (image namespace, not a password)', publishing.dockerHubUsername),
          architecture: await pick('Image architecture: arm64 = ARM 64-bit; x64 = Intel/AMD 64-bit (linux/amd64); x86 = Intel/AMD 32-bit (linux/386)', ARCHITECTURES, publishing.architecture)
        };
      } else { delete config.publishing; }
      const old = config.deployment;
      config.deployment = { kind };
      if (kind !== 'none') {
        const compose = portainer ? await composePath('Portainer deployment Compose file path (optional)', old.kind === 'portainer' || old.composeFile?.includes('portainer') ? old.composeFile : undefined) : ops.dockerComposeFile;
        if (compose) config.deployment.composeFile = compose;
        const stack = await ask('Existing or intended stack/project name', old.stackName ?? config.projectName.replace(/^@/, '').replaceAll('/', '-'));
        config.deployment.stackName = stack;
      }
      if (kind === 'portainer') config.deployment.host = await ask('Target SSH alias: enigma, neko, zerosol, watchtower, or your own alias', old.host ?? '');
      ops.portainerStackUpdate = portainer && await yesNo('Automatically complete verification, Git push, image publication, Portainer update and health checks when a stack changes (unless user scope restricts it)?', ops.portainerStackUpdate);
      if (portainer) {
        ops.portainerCredentialSource = await pick('Portainer credential lookup', ['homepage', 'external'], ops.portainerCredentialSource);
        if (ops.portainerCredentialSource === 'homepage') {
          ops.homepageHost = await ask('SSH host holding Homepage widgets', ops.homepageHost);
          do {
            ops.homepagePath = await ask('Absolute path to your Homepage services.yaml on that SSH host (required; only the matching widget will be read)', ops.homepagePath);
            if (!ops.homepagePath) stdout.write('Enter your services.yaml path to use Homepage credential lookup.\n');
          } while (!ops.homepagePath);
        }
      }
      ops.changelogUpdate = await yesNo('Automatically update CHANGELOG.md for implemented product changes and version changes?', ops.changelogUpdate);
      config.operations = ops;
      config.learningJournal = await yesNo('Include the learning-journal skill for durable project knowledge?', config.learningJournal ?? false);
      config.workflow = await pick('Ordinary change workflow', ['validate', 'run-local'], config.workflow);
      config.apps = config.apps.map(a => ({ ...a, capabilities: a.capabilities.filter(c => config.capabilities.includes(c)) })).filter(a => a.capabilities.length);
      try { return validateConfig(config); }
      catch (error) { stdout.write(`\n${(error as Error).message} Let's correct the answers.\n`); }
    }
  } finally { process.removeListener('SIGINT', interrupt); rl.close(); }
}

export async function confirm(): Promise<boolean> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try { return /^(y|yes)$/i.test((await rl.question('Write these files? [y/N]: ')).trim()); }
  finally { rl.close(); }
}
