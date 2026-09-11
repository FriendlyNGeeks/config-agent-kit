import { agentAdapter, ADAPTER_FILES } from './agents.js';
import { reusableSkills, SKILL_NAMES } from './skills.js';
import { operationalRoles } from './roles.js';
import { MARKDOWN_METADATA } from './metadata.js';
import { VERSION, COMMAND_KEYS, getOperations, type Config } from './config.js';

export const BEGIN = '<!-- agent-scaffold:begin -->';
export const END = '<!-- agent-scaffold:end -->';
export const ROLE_NAMES = ['architect', 'middleware', 'qa', 'security', 'devops', 'frontend', 'backend', 'desktop', 'python', 'native', 'database'];
export const ROLE_MIGRATIONS = Object.fromEntries(ROLE_NAMES.map(name => ['.agents/' + name + '.md', '.agents/roles/' + name + '.md']));
export const MANAGED_FILES = [...ADAPTER_FILES, 'AGENTS.md', '.agents/project.md', '.agents/roles/frontend.md', '.agents/roles/backend.md', '.agents/roles/desktop.md', '.agents/roles/python.md', '.agents/roles/native.md', '.agents/roles/database.md', '.agents/deploy.md', '.agents/roles/architect.md', '.agents/roles/middleware.md', '.agents/roles/qa.md', '.agents/roles/security.md', '.agents/roles/devops.md', ...Object.keys(ROLE_MIGRATIONS), ...SKILL_NAMES.map(name => '.agents/skills/' + name + '/SKILL.md')];
const block = (body: string) => `${BEGIN}\n${body.trim()}\n${END}\n`;
export const packageCommand = (manager: Config['packageManager'], script: string) => `${manager} run ${script}`;

export function render(config: Config): Record<string, string> {
  const files: Record<string, string> = {};
  const add = (file: string, body: string) => {
    files[file] = (file.startsWith('.agents/roles/') ? `---\n${MARKDOWN_METADATA}\n---\n\n` : '') + block(body);
  };
  const selected = (cap: Config['capabilities'][number]) => config.capabilities.includes(cap);
  if (selected('web')) add('.agents/roles/frontend.md', `# Frontend\n
- Follow the framework and styling conventions in the owning application; inspect its manifest first.
- Keep entry points focused on composition. Keep feature components and state near their owner.
- Extract the responsibility being changed when a component becomes difficult to understand; avoid arbitrary file-size rules.
- Preserve accessibility, responsive behavior, and loading/error states.
- Keep runtime settings in the owning application configuration; follow .agents/roles/security.md for environment examples and ignore files. Keep browser configuration public. Standard Vite environment values are build-time settings; use an explicit runtime-config mechanism when the same image must move between environments.
- Validate changed interactions with the existing test tools. Avoid source-text assertions as a substitute for user behavior.
- Use shared contracts when already present; do not invent a shared package for a single consumer.`);
  if (selected('api')) add('.agents/roles/backend.md', `# Backend\n
- Follow the owning application's runtime, routing, validation, and error conventions.
- Keep server entry points focused on assembling routes and dependencies; keep business logic in feature-owned modules.
- Validate untrusted inputs at the boundary. Preserve public contracts unless the task changes them.
- Update affected consumers when contracts change; use existing shared definitions.
- Test the changed behavior and relevant error paths with the existing test tools.
- Follow .agents/roles/security.md for per-app environment settings, examples, secret delivery and ignore files; read .agents/roles/middleware.md when present for shared contracts.
${config.database !== 'none' ? '- Read `.agents/roles/database.md` for persistence or migration changes.' : '- Add persistence only when the requested behavior needs it.'}`);
  if (selected('desktop')) add('.agents/roles/desktop.md', `# Desktop\n
- Inspect the actual desktop framework, application manifest, and packaging scripts before working.
- Keep main-process, preload/IPC, and renderer responsibilities separate.
- Validate messages across process boundaries and expose only required operations.
- For Electron, preserve context isolation and existing security boundaries; do not expose unrestricted Node access to renderer content.
- Follow .agents/roles/qa.md for Electron rebuild policy, desktop build commands, and installer validation.
- Derive installer versions from owning package metadata. Do not hardcode versions in instructions.
- Verify the relevant target platform; a successful web build does not validate a native desktop artifact.`);
  if (selected('python')) add('.agents/roles/python.md', `# Python\n
- Use the project's declared Python version and dependency/environment tooling.
- Reuse existing modules and boundaries. Keep CLI or service entry points focused on composition.
- Inspect pyproject.toml, requirements files, and existing test/lint configuration before choosing commands.
- Run the narrow affected tests and configured checks. Do not install a competing environment manager.
- Keep virtual environments, model weights, caches, and generated data out of ordinary searches and commits.
- Treat GPU support and native libraries as explicit runtime requirements; do not assume ARM64 or CPU-only compatibility.`);
  if (selected('native')) add('.agents/roles/native.md', `# Native code\n
- Use the existing build system, compiler/toolchain, and dependency conventions.
- Record platform-specific requirements in the owning project's documentation.
- Preserve memory/resource ownership and interface boundaries; test failure and cleanup paths that change.
- Build only affected targets first. Validate on the intended OS and architecture before claiming native compatibility.
- Keep generated binaries and vendored dependencies out of routine source searches.
- Do not introduce Node, Electron, Docker, or another runtime unless the task requires it.`);
  if (config.database !== 'none') add('.agents/roles/database.md', `# Database\n
Own schema, validation and migration choices using the existing tooling. Ask about missing product behavior, not routine database rules.
- Database choice: ${config.database}. Inspect existing schema, migration tooling, and deployment configuration before changes.
- Use reviewed, versioned migrations where the database/tooling supports them; preserve required data backfills and custom constraints.
- For Prisma with a relational database, schema synchronization is not a replacement for migration history. Establish a baseline before switching an existing database to migrations.
- Run migrations as a deliberate release step and validate risky changes on a restored/test database.
- Preserve existing volume identities and data. A previous application image does not undo a database migration.
- Verify schema compatibility when updating services independently. Document recovery steps for irreversible changes.
- Supply only this application's required credentials; never scaffold unrelated database root credentials.`);
  for (const [file, body] of Object.entries(operationalRoles(config))) add(file, body);
  const ops = getOperations(config);
  const triggers: Record<string, string> = { architect: 'Scaffolding, workspace layout and ownership', middleware: 'Shared contracts, configuration bridges, SDKs, IPC and preload', qa: 'Behavior changes, validation, rebuilds, versions and changelog', security: 'Authentication, credentials, environment/ignore files and trust boundaries', devops: 'Docker, Compose, publication and Portainer' };
  for (const [file, body] of Object.entries(reusableSkills(config))) {
    const end = body.indexOf('\n---\n', 4) + 5;
    files[file] = body.slice(0, end) + '\n' + block(body.slice(end));
  }
  const routes = Object.keys(files).filter(f => !f.includes('/skills/')).map(f => { const role = f.split('/').pop()!.replace('.md', ''); return `- ${triggers[role] ?? role}: read \`${f}\` when affected.`; }).join('\n');
  add('AGENTS.md', `# Project instructions\n
Read \`.agents/project.md\` for this repository's actual structure and command references. The user's requested scope takes precedence over template defaults. Read only the matching references below, once per task.

${routes}

Skills live in .agents/skills; load only a matching skill when its procedure is needed. Role references identify operational triggers. ${config.learningJournal ? "Use the learning-journal skill for durable knowledge; search only relevant topics in learning/." : ""}

## Operational flags

\`\`\`yaml
changelogUpdate: ${ops.changelogUpdate}
dockerRebuild: ${ops.dockerRebuild}
electronRebuild: ${ops.electronRebuild}
portainerStackUpdate: ${ops.portainerStackUpdate}
\`\`\`

QA owns rebuild/changelog behavior; DevOps owns deployment sequencing. Explicit user scope restrictions take precedence.

- Turn the user's plain-language feature request into working code. Own routine technical choices, security defaults and database rules; ask only for missing product decisions or consequential actions outside the requested scope.
- Follow existing conventions, make the smallest complete change, and preserve unrelated work. Keep modules focused; avoid speculative abstractions.
- Read only affected roles and skills. Search narrowly and run each relevant check once. QA owns rebuilds and changelog; other local execution uses the ${config.workflow} workflow.
- Keep secrets out of source and logs, validate untrusted input, and preserve existing data. Handle these as implementation responsibilities rather than a setup questionnaire.
- An enabled Portainer policy is a standing workflow preference within user scope. Do not repeatedly reconfirm already authorized work.
- Finish with what works, what was checked, and any unresolved limitation. Never claim unrun checks passed.`);
  const appLines = config.apps.length ? config.apps.map(a => `- \`${a.path}\`: ${a.capabilities.join(', ')}.`).join('\n') : '- No application paths are recorded yet. Inspect the repository before selecting paths; this toolkit generates instructions, not application source.';
  const commandLines = [...config.commands.verify.map(s => `- verify: \`${packageCommand(config.packageManager, s)}\`.`), ...COMMAND_KEYS.flatMap(k => config.commands[k] ? [`- ${k}: \`${packageCommand(config.packageManager, config.commands[k]!)}\`.`] : []), ...Object.entries(config.commands.publishServices ?? {}).map(([service, script]) => `- publishServices.${service}: \`${packageCommand(config.packageManager, script)}\`.`)].join('\n') || '- No package scripts are recorded. Inspect or implement required scripts before running commands; report missing mappings.';
  add('.agents/project.md', `# ${config.projectName}\n
- Genre: ${config.genre ?? 'general'}.
- Preferred agent: ${config.preferredAgent ?? 'agnostic'}.
- Capabilities: ${config.capabilities.join(', ')}.
- Package manager: ${config.packageManager}.
- Database: ${config.database}.
- Electron: ${ops.electron ? 'enabled' : 'not selected'}.
- Shared packages: ${config.sharedPackages?.join(', ') || 'inspect existing workspace'}.
- Template version: ${VERSION}. Editable answers: \`.agents/scaffold.json\`.

## Application ownership\n
${appLines}

## Commands\n
${commandLines}

These are references to root package scripts, not a mandatory checklist. Confirm definitions in package.json before running them and select affected workspace checks where appropriate. Re-run \`config-agent-kit doctor\` after scripts or paths change. Add custom guidance outside managed markers so updates preserve it.`);
  const adapter = agentAdapter(config.preferredAgent ?? 'agnostic');
  if (adapter) add(adapter.file, adapter.body);
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
}
