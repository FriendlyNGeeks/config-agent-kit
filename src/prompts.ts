import { promptSession, terminalIO, type PromptIO } from './prompt-io.js';
import { clarifySurface, type PromptMode } from './setup-prompts.js';
import { PREFERRED_AGENTS, AGENT_PROFILES } from './agents.js';
import { ARCHITECTURES, getPublishing, CAPABILITIES, DATABASES, DOCKER_WORKFLOWS, MANAGERS, getOperations, relativePath, validateConfig, type Config } from './config.js';

export const COMPOSE_HELP = 'Compose file path, relative to the project directory you selected (the folder containing AGENTS.md). Examples: docker-compose.yml means a file at the project root; docker/docker-compose.yml means a file in its docker subfolder. For Portainer, use the tracked deployment file, often portainer.yml. This is not a remote server path, Portainer URL, or data-volume location. The CLI records the path but does not create the Compose file. Leave blank if unknown; resolve it before running/deploying. Enter keeps a detected value; type - to clear it.';

export interface QuestionnaireOptions { mode?: PromptMode; skipIdentity?: boolean; askAgent?: boolean; capabilitiesKnown?: boolean }
export async function questionnaire(defaults: Config, io: PromptIO = terminalIO, options: QuestionnaireOptions = {}): Promise<Config> {
  const session = promptSession(io);
  const { askValid, pick, yesNo } = session;
  const required = (pattern: RegExp, label: string, max = 120) => (value: string) => {
    if (!value || value.length > max || !pattern.test(value)) throw new Error(`${label} is required and must have a valid format. Please answer this question again.`);
  };
  const host = required(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, 'Hostname or SSH alias');
  const stdout = io.output;
  const composePath = async (label: string, fallback?: string) => {
    stdout.write(session.paint('info', `\n${COMPOSE_HELP}\n`));
    const value = await askValid(label, fallback ?? '', value => { if (value && value !== '-') relativePath(value, 'Compose path'); });
    return value === '-' || !value ? undefined : value;
  };
  try {
    stdout.write(session.paint('heading', '\nAgent Kit — project configuration\nConfigures AGENTS.md and selected roles and skills.\n'));
    let config = structuredClone(defaults);
    if (options.askAgent) config.preferredAgent = await pick('Preferred coding agent', PREFERRED_AGENTS, config.preferredAgent, Object.fromEntries(PREFERRED_AGENTS.map(a => [a, AGENT_PROFILES[a].label])));
    if (options.mode === 'vibe') {
      if (!options.capabilitiesKnown) await clarifySurface(config, session);
      stdout.write(session.paint('info', '\nDescribe features in your own words. Your agent handles routine validation, secrets and data protection. You can revisit settings with update --interactive --prompt-mode pro.\n'));
      return validateConfig(config);
    }
    {
      if (!options.skipIdentity) config.projectName = await askValid('Project name', config.projectName, required(/^(?:@[a-zA-Z0-9_.-]+\/)?[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, 'Project name'));
      stdout.write(session.paint('info', `\nCapabilities: ${CAPABILITIES.map((c, i) => `${i + 1}=${c}`).join(', ')}\n`));
      const answer = await askValid('Select names or numbers separated by commas', config.capabilities.join(','), value => {
        if (value.split(',').some(s => !CAPABILITIES.includes((CAPABILITIES[Number(s.trim()) - 1] ?? s.trim()) as Config['capabilities'][number]))) throw new Error('Choose the listed capability names or numbers.');
      });
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
          dockerHubUsername: await askValid('Docker Hub username or organization (image namespace, not a password)', publishing.dockerHubUsername, required(/^[a-z0-9][a-z0-9_-]*$/, 'Docker Hub username', 64)),
          architecture: await pick('Image architecture: arm64 = ARM 64-bit; x64 = Intel/AMD 64-bit (linux/amd64); x86 = Intel/AMD 32-bit (linux/386)', ARCHITECTURES, publishing.architecture)
        };
      } else { delete config.publishing; }
      const old = config.deployment;
      config.deployment = { kind };
      if (kind !== 'none') {
        const compose = portainer ? await composePath('Portainer deployment Compose file path (optional)', old.kind === 'portainer' || old.composeFile?.includes('portainer') ? old.composeFile : undefined) : ops.dockerComposeFile;
        if (compose) config.deployment.composeFile = compose;
        const stack = await askValid('Existing or intended stack/project name', old.stackName ?? config.projectName.replace(/^@/, '').replaceAll('/', '-'), required(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, 'Stack name'));
        config.deployment.stackName = stack;
      }
      if (kind === 'portainer') config.deployment.host = await askValid('Target SSH hostname or alias (required)', old.host ?? '', host);
      ops.portainerStackUpdate = portainer && await yesNo('Automatically complete verification, Git push, image publication, Portainer update and health checks when a stack changes (unless user scope restricts it)?', ops.portainerStackUpdate);
      if (portainer) {
        ops.portainerCredentialSource = await pick('Portainer credential lookup', ['homepage', 'external'], ops.portainerCredentialSource);
        if (ops.portainerCredentialSource === 'homepage') {
          ops.homepageHost = await askValid('SSH host holding Homepage widgets', ops.homepageHost, host);
          do {
            ops.homepagePath = await askValid('Absolute path to your Homepage services.yaml on that SSH host (required; only the matching widget will be read)', ops.homepagePath, value => {
              if (value && (!/^\/[a-zA-Z0-9_./ -]+$/.test(value) || value.length > 240 || value.split('/').includes('..'))) throw new Error('Enter an absolute path without parent traversal.');
            });
            if (!ops.homepagePath) stdout.write(session.paint('warning', 'Enter your services.yaml path to use Homepage credential lookup.\n'));
          } while (!ops.homepagePath);
        }
      }
      ops.changelogUpdate = await yesNo('Automatically update CHANGELOG.md for implemented product changes and version changes?', ops.changelogUpdate);
      config.operations = ops;
      config.learningJournal = await yesNo('Include the learning-journal skill for durable project knowledge?', config.learningJournal ?? false);
      config.workflow = await pick('Ordinary change workflow', ['validate', 'run-local'], config.workflow);
      config.apps = config.apps.map(a => ({ ...a, capabilities: a.capabilities.filter(c => config.capabilities.includes(c)) })).filter(a => a.capabilities.length);
      return validateConfig(config);
    }
  } finally { session.close(); }
}

export async function confirm(label = 'Write these files?', io: PromptIO = terminalIO): Promise<boolean> {
  const session = promptSession(io);
  const writeFiles = label === 'Write these files?';
  try { return /^(y|yes)$/i.test(await session.ask(label, writeFiles ? 'yes' : 'no', writeFiles ? 'Y/n' : 'y/N')); }
  finally { session.close(); }
}
