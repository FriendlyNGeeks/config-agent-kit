import { CONFIG_PATH, allScripts, getOperations, validateConfig, type Config } from './config.js';
import { detect } from './detect.js';
import { exists, read, readJson, safePath } from './files.js';
import { plan } from './generate.js';
import { MANAGED_FILES } from './render.js';
import { resolveLocalConfig } from './local-settings.js';

export interface Finding { level: 'error' | 'warning' | 'info'; code: string; message: string }
export function doctor(root: string): { ok: boolean; findings: Finding[] } {
  const findings: Finding[] = [];
  const add = (level: Finding['level'], code: string, message: string) => findings.push({ level, code, message });
  let config: Config | undefined;
  try {
    const raw = readJson(root, CONFIG_PATH);
    if (raw !== undefined) config = validateConfig(resolveLocalConfig(raw, root));
    else add('warning', 'NOT_INITIALIZED', 'No scaffold configuration. Existing instructions will be checked for common legacy issues.');
    const detected = detect(root);
    for (const warning of detected.warnings) {
      if (config && warning.startsWith('Application type')) continue;
      if (config?.deployment.kind === 'portainer' && warning.startsWith('Portainer file')) continue;
      add('warning', 'DETECTION', warning);
    }
    if (config) {
      for (const app of config.apps) if (!exists(safePath(root, app.path))) add('warning', 'APP_PATH_MISSING', `Application path does not exist yet: ${app.path}`);
      for (const script of allScripts(config)) if (!detected.scripts[script]) add('error', 'SCRIPT_MISSING', `Root package script '${script}' does not exist.`);
      if (config.commands.verify.length === 0) add('warning', 'NO_CHECKS', 'No validation scripts are recorded; define project checks when application tooling is available.');
      if (config.packageManager !== detected.config.packageManager && read(root, 'package.json') !== undefined) add('warning', 'MANAGER_MISMATCH', 'Configured package manager differs from detected project metadata.');
      for (const cap of detected.config.capabilities) if (!config.capabilities.includes(cap) && !detected.warnings.some(w => w.startsWith('Application type'))) add('warning', 'CAPABILITY_MISMATCH', `Detected capability '${cap}' is not selected.`);
      if (config.deployment.composeFile && !exists(safePath(root, config.deployment.composeFile))) add('warning', 'COMPOSE_MISSING', `Compose file does not exist yet: ${config.deployment.composeFile}`);
      const ops = getOperations(config);
      if (config.deployment.kind === 'portainer' && ops.portainerCredentialSource === 'homepage' && !ops.homepagePath) add('warning', 'HOMEPAGE_PATH_MISSING', 'Configure your absolute services.yaml path with --homepage-path or update --interactive before credential lookup or deployment.');
      for (const shared of config.sharedPackages ?? []) if (!exists(safePath(root, shared))) add('warning', 'SHARED_PATH_MISSING', 'Shared package path does not exist: ' + shared);
      if (ops.dockerComposeFile && !exists(safePath(root, ops.dockerComposeFile))) add('warning', 'LOCAL_COMPOSE_MISSING', 'Local Compose file does not exist: ' + ops.dockerComposeFile);
      const required = [ ...(ops.dockerRebuild ? ['dockerUp'] : []), ...(ops.electronRebuild ? ['buildDesktop'] : []), ...(ops.portainerStackUpdate ? ['publishServices'] : []) ];
      for (const key of required) if (key === 'publishServices' ? !Object.keys(config.commands.publishServices ?? {}).length && !config.commands.publishAll : !config.commands[key as 'dockerUp' | 'buildDesktop']) add('warning', 'OPERATION_COMMAND_MISSING', 'Policy requires a command mapping: ' + key);
      for (const ignore of ['.gitignore', ...(ops.dockerWorkflow !== 'none' || config.deployment.kind !== 'none' ? ['.dockerignore'] : [])]) {
        const content = read(root, ignore);
        if (!content) add('warning', 'IGNORE_MISSING', ignore + ' is missing or empty; verify real environment files are excluded.');
        else if (!/^\s*(?:\*\*\/)?\.env(?:\.\*|\*)?\s*$/m.test(content)) add('warning', 'ENV_IGNORE_REVIEW', ignore + ' has no recognized broad environment exclusion; inspect effective rules.');
      }
      const generated = plan(root, config, 'update');
      for (const c of generated.changes) {
        if (c.action === 'conflict') add('error', 'MANAGED_CONFLICT', `Custom edits inside a managed block or missing markers: ${c.path}`);
        else if (c.action === 'create') add('error', 'GENERATED_FILE_MISSING', `Generated file is missing: ${c.path}`);
        else if (c.action !== 'unchanged') add('warning', 'UPDATE_AVAILABLE', `Run update to reconcile ${c.path}.`);
      }
    }
    const groups = new Map<string, string[]>();
    for (const script of ['lint', 'typecheck', 'test']) {
      const command = detected.scripts[script]?.trim();
      if (command) groups.set(command, [...groups.get(command) ?? [], script]);
    }
    for (const names of groups.values()) if (names.length > 1) add('warning', 'DUPLICATE_CHECKS', `These scripts execute identical commands: ${names.join(', ')}.`);
    if (detected.scripts.lint && /^(?:pnpm\s+exec\s+|npx\s+)?tsc\b/.test(detected.scripts.lint.trim())) add('warning', 'LINT_IS_TYPECHECK', 'The lint script appears to run TypeScript only; configure a real linter separately.');
    const files = [...new Set([...MANAGED_FILES, '.agents/qa.md', '.agents/devops.md', '.agents/architect.md', '.agents/middleware.md', '.agents/security.md'])];
    const contents: string[] = [];
    for (const file of files) {
      const content = read(root, file);
      if (!content) continue;
      contents.push(content);
      const namedProject = /keep (?:local )?containers under the Compose project name `([^`]+)`/i.exec(content)?.[1];
      const expectedProject = config?.deployment.stackName ?? config?.projectName ?? detected.config.projectName;
      if (namedProject && namedProject.toLowerCase() !== expectedProject.toLowerCase()) add('warning', 'COPIED_PROJECT_NAME', `${file} specifies a Compose project name different from the configured project/stack.`);
      if (/a Portainer stack change requires verification, Git push/i.test(content)) add('warning', 'IMPLICIT_DEPLOY', `${file} turns configuration edits into deployment; use explicit task triggers.`);
      if (content.includes('.agents/')) {
        for (const match of content.matchAll(/`(\.agents\/(?:roles\/[a-z-]+\.md|skills\/[a-z-]+\/SKILL\.md|[a-z-]+\.md))`/g)) if (!exists(safePath(root, match[1]!))) add('error', 'REFERENCE_MISSING', `${file} references missing ${match[1]}.`);
      }
    }
    const all = contents.join('\n');
    for (const flag of ['electronRebuild', 'dockerRebuild', 'portainerStackUpdate', 'changelogUpdate']) if (new RegExp(`${flag}:\\s*true`).test(all) && new RegExp(`${flag}:\\s*false`).test(all)) add('error', 'CONFLICTING_FLAGS', `${flag} has conflicting true/false instructions.`);
    const characters = contents.reduce((sum, s) => sum + s.length, 0);
    add('info', 'INSTRUCTION_SIZE', `${characters} instruction characters; approximately ${Math.ceil(characters / 4)} tokens if all listed files are read (characters/4 estimate, not tokenizer measurement).`);
    add('info', 'STATIC_ONLY', 'Static diagnostics only: no package scripts, builds, network requests, or deployments were executed.');
  } catch (error) { add('error', 'INVALID_PROJECT', (error as Error).message); }
  return { ok: !findings.some(f => f.level === 'error'), findings };
}
