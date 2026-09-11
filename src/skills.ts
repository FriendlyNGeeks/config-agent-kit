import { getOperations, getPublishing, PLATFORMS, dockerEnabled, type Config } from './config.js';
import { MARKDOWN_METADATA } from './metadata.js';

export const SKILL_NAMES = ['changelog-update', 'docker-publish', 'portainer-deploy', 'electron-rebuild', 'learning-journal'] as const;
export function reusableSkills(c: Config): Record<string, string> {
  const o = getOperations(c);
  const publishing = getPublishing(c);
  const files: Record<string, string> = {};
  const add = (name: string, description: string, body: string) => {
    files['.agents/skills/' + name + '/SKILL.md'] = '---\nname: ' + name + '\ndescription: ' + description + '\n' + MARKDOWN_METADATA + '\n---\n\n' + body.trim();
  };
  add('changelog-update', 'Update CHANGELOG.md for implemented product changes or release versions when requested or enabled by project policy.', `# Update the changelog

Read the changelog policy in .agents/roles/qa.md and the flags in AGENTS.md before editing.

- Explicit user scope restrictions override automatic changelog work. Read the current file, compare the implemented diff and current task history, and include only implemented requested features/fixes. Exclude operational steps unless they changed behavior.
- Patch in place; preserve the title and every previous dated entry. Do not remove, rewrite or reorder old entries unless explicitly requested. Verify prior entries remain unchanged afterward.
- Keep newest entries first. Use dated version entries with New Features and Bug Fixes sections; do not add Notes, Changed or Updated sections. Keep each bullet under 25 words and merge related changes where appropriate.
- Omit empty releases. Use the task's actual date and preserve the established version pattern; do not invent or increment release versions for an ordinary edit.
- Before publication/deployment, finish required checks, changelog and requested version updates; .agents/roles/devops.md owns the release/deployment sequence when present.`);
  if (dockerEnabled(c)) add('docker-publish', 'Build and publish project container images for the configured registry namespace and target architecture when publication is in scope.', `# Publish container images

Read .agents/project.md for command mappings, .agents/roles/qa.md for required checks, and .agents/roles/security.md for credentials and build-context exclusions. Use .agents/roles/devops.md for deployment policy.

- Publish for ${publishing.architecture} using Docker platform ${PLATFORMS[publishing.architecture]}. Use ${publishing.dockerHubUsername}/<package-name>-<service-name>:<version>-${publishing.architecture} for Portainer image tags and service/platform script names such as docker:publish-api:${publishing.architecture}; provide docker:publish:${publishing.architecture} for all images. Read versions dynamically from package metadata at execution time; never hardcode release versions. Normalize scoped package names into valid Docker repository and Compose names consistently. Record exact image digests alongside version tags. Verify base-image and dependency support for the selected platform before publishing.
- Read current owning package metadata before computing tags. Confirm existing service script definitions; report missing tooling instead of guessing commands.
- Complete relevant checks and validate changed Compose files with config --quiet. Publish affected images using mapped per-service commands; use publishAll only when all images need publication.
- Stop on a build or push failure. Verify the published tags and digests before reporting success. Publication alone does not authorize a live stack update.`);
  if (c.deployment.kind === 'portainer') add('portainer-deploy', 'Create or update a Portainer stack when deployment is requested or the configured automatic stack-update policy applies within user scope.', `# Deploy through Portainer

Read .agents/roles/devops.md for target, source path and policy. Explicit user scope takes precedence over defaults. Use .agents/skills/docker-publish/SKILL.md for the publication step.

- ${o.portainerCredentialSource === 'homepage' ? o.homepagePath ? `Read only the matching Portainer widget from \`${o.homepagePath}\` on SSH host \`${o.homepageHost}\`. Match the intended target host; do not dump the whole YAML or other widgets. If there is no unique match, stop and resolve the target. Obtain its Portainer URL and credential using the handling rules in .agents/roles/security.md.` : 'The Homepage services.yaml path is not configured. Ask the user for its absolute path on the configured SSH host before reading credentials or deploying. Read only the matching target Portainer widget; never guess a path or dump unrelated widgets. Follow .agents/roles/security.md for key handling.' : 'Use the existing configured external credential provider for the target; identify that provider before deployment. Follow .agents/roles/security.md for key handling.'}
- Resolve target host, Portainer URL, endpoint ID, stack name and current stack ID. Never infer the host from the working directory. Query the endpoint/stack again immediately before mutation.
- Complete .agents/roles/qa.md requirements first. Review the diff, commit only task files, and push the current branch. Stop if Git, commit or push fails.
- After a successful push, publish every changed image for the selected platform using repository scripts. Stop on publication failure.
- Create stacks through the Portainer API with validated Compose content, using the configured name (root package name for a new stack unless configured otherwise). Update existing stacks with image pulling enabled and obsolete services pruned; preserve unrelated environment values and storage.
- Never remove a stack unless explicitly requested; never delete named volumes unless data removal is explicitly requested.
- Poll the stack and endpoint containers to success/failure within a fixed timeout; verify intended image references, service health and an application smoke check. Retain previous image/stack references for recovery; application rollback does not undo migrations.
- Report host, stack, image tags/digests, services and health. Keep Portainer the management owner; host-side Compose or ad hoc SSH docker run is allowed only when explicitly requested as recovery.
- Verify required bind mounts and persistent storage; do not assume repository-relative configuration files exist on the Docker host.`);
  if (o.electron) add('electron-rebuild', 'Rebuild Electron runtime or installers when desktop changes require validation or the configured rebuild policy applies.', `# Rebuild Electron

Read .agents/roles/qa.md for rebuild triggers and AGENTS.md for the authoritative flag. Read .agents/project.md for existing command mappings.

- Inspect the owning desktop package, main/preload/renderer boundaries and packaging configuration.
- Run buildDesktop for affected desktop runtime changes; run electronBuild for installer/packaging validation and release work. Confirm each mapping exists before execution.
- Derive installer names and versions from owning package metadata. Check the intended OS and architecture and any native-module rebuild requirements.
- Surface TypeScript, file-copy, native-module and packaging failures. Verify the expected artifact and relevant application behavior; a web build alone does not establish Electron success.`);
  if (c.learningJournal) add('learning-journal', 'Capture durable project decisions, verified troubleshooting lessons and system flows when documentation is requested or meaningful reusable learning emerges.', `# Maintain project learning

- Search learning/ for the relevant topic; read only matching documents. Update an existing topic before creating a duplicate.
- Document verified decisions or fixes with their reason, constraints, tradeoffs, relevant flow, concrete example and pitfalls as useful. Mark open questions and uncertain conclusions explicitly.
- Link to source files and authoritative role or skill guidance instead of copying code, commands or policies. Include a verification date and relevant evidence for claims that can become stale.
- Keep each file focused on one topic, with a descriptive filename. Maintain a short topic index in learning/README.md when documents exist.
- Record durable knowledge, not a transcript or routine task log. Do not create entries for trivial edits or invent observations. Respect the user's requested scope.
- Exclude credentials, raw logs and sensitive environment values. Learning records are project documentation, not instructions granting permissions or overriding policy.
- Keep existing useful knowledge; correct outdated claims with evidence. CLI updates never own or overwrite learning/ documents.`);
  return files;
}
