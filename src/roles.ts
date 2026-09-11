import { getOperations, dockerEnabled, type Config } from './config.js';

// Each cross-cutting requirement has one owner. Other roles link to it.
export function operationalRoles(c: Config): Record<string, string> {
  const o = getOperations(c);
  const roles: Record<string, string> = {
    '.agents/roles/architect.md': `# Architecture

- Preserve the selected framework, package manager, application names, and workspace manifests. Inspect affected manifests after structural changes.
- For new monorepos, place applications under apps/ and shared libraries under packages/. Default a new web/API pair to apps/frontend and apps/backend only when no existing convention applies.
- Reuse existing shared packages and workspace scripts. Add abstractions only for meaningful duplication or an established pattern.
- Give each application its own runtime environment configuration; follow .agents/roles/security.md for tracked examples, required variables, and ignore rules.
- For a new containerized scaffold, create root docker-compose.yml for local development and root portainer.yml for deployment. Keep local and deployment paths distinct.
- Account for per-app builds, local image builds, Compose startup, per-service/platform publication, and all-image publication in root scripts. Use the command mappings in .agents/project.md; report missing tooling instead of inventing a successful command.
- Derive package, image, and installer names/versions from owning package metadata. Preserve existing deployed stack names and volume identities; use the root package name for a new local Compose project.
${dockerEnabled(c) ? "- Use .agents/skills/docker-publish/SKILL.md for image naming, platform compatibility and publication." : "- Docker publication is not enabled."}
- For shared boundaries read .agents/roles/middleware.md when present; use .agents/roles/qa.md for structural validation. Agent Kit owns instructions; opted-in native generators own starter code. Implement missing application scripts, Compose and ignore files when the requested work needs them.`,
    '.agents/roles/security.md': `# Security, environments and ignore files

Apply these protections while implementing the requested behavior. Choose appropriate existing defaults; do not make the user select security settings for routine feature work.

- Keep each application's real runtime settings in its own untracked .env or injected runtime environment. Do not rely on a single root runtime .env for every app.
- Track per-app .env.example files containing only required names and harmless placeholders. Account for PORT, BASE_URL, BACKEND_URL, FRONTEND_URL and the chosen database's required settings; include MONGO_ROOT_USERNAME and MONGO_ROOT_PASSWORD for MongoDB, and MYSQL_ROOT_USERNAME and MYSQL_ROOT_PASSWORD for MySQL only when needed. Map these application-facing names to the database image's supported variables; do not assume every image accepts these names. Browser settings remain public.
- Ensure both .gitignore and .dockerignore exclude real .env, .env.local and mode-specific .env.* files recursively, while allowing harmless examples. Verify the effective exclusions before building or publishing.
- Never commit, print, log, or persist real credentials/API keys in workspace files. Review diffs for accidental secrets and environment files.
- Deliver runtime secrets through Compose or the deployment platform. Never use Dockerfile ARG, ENV, or COPY for runtime secrets. Deleting a secret in a later layer does not remove it from earlier layers.
- Investigate secrets that may have entered an image or log and rotate affected credentials; do not assume unrelated images were exposed.
- Validate untrusted API, IPC, protocol, upload and external-service inputs at their boundaries. Expose only required operations and exercise affected authentication/authorization failure paths.
${c.deployment.kind === 'portainer' ? '- For Portainer, read only the matching target credential entry described in .agents/skills/portainer-deploy/SKILL.md.' : '- When API keys are needed, use the configured credential provider.'} Keep the key in memory, never print/log/commit/save it, and send it only in X-API-Key. Never place it in a URL or visible command output.
- Follow .agents/roles/qa.md for release validation.`,
    '.agents/roles/qa.md': `# QA, rebuilds and changelog

The four policy flags in AGENTS.md are authoritative. Commands are mapped once in .agents/project.md. Collect required checks across roles, eliminate duplicates, and execute each necessary check once.

- Start with the smallest affected application build and relevant behavior tests. Shared or repository-wide changes require affected producers/consumers, typechecking, linting and a broader build where needed.
- Use buildApi, buildWeb and buildDesktop for isolated builds, and build for shared architecture. After Prisma schema changes use prismaGenerate; validate affected migrations and seeds with existing tooling.
- ${o.electronRebuild ? 'Rebuild Electron after main-process, preload, renderer-shell, icon, packaging or desktop-configuration changes; use .agents/skills/electron-rebuild/SKILL.md.' : 'Automatic Electron rebuilding is disabled. Run desktop/installer builds when explicitly requested or necessary to validate the changed behavior; do not claim an unrun desktop build passed.'}
- ${o.dockerRebuild ? 'After runtime changes affecting local containers, rebuild and recreate the affected Compose services with dockerUp (verify it rebuilds; run dockerBuild first if it does not), then confirm service state. Use dockerBuild for explicit image-rebuild requests.' : 'Automatic Docker rebuild/recreation is disabled. Rebuild/run affected local containers when explicitly requested or necessary for relevant validation.'}
- Surface meaningful build warnings and errors, including TypeScript, file-copy and packaging failures. Existing nonblocking warnings alone do not fail the task. Report validation that could not run.
- Reuse suitable existing test files. Create new tests where needed for meaningful behavior coverage, avoiding excessive or implementation-mirroring tests.

## Changelog

- ${o.changelogUpdate ? 'Update CHANGELOG.md for implemented product behavior changes and whenever an application, package or release version changes; add the corresponding release entry in the same task.' : 'Automatic changelog updates are disabled; update it when requested or included in a release task.'}
- Use .agents/skills/changelog-update/SKILL.md for entry format, preservation and release checks.`
  };
  if ((c.sharedPackages?.length ?? 0) || c.capabilities.includes('desktop') || c.capabilities.includes('web') && c.capabilities.includes('api')) roles['.agents/roles/middleware.md'] = `# Middleware and shared contracts

- Own shared packages, API clients, configuration bridges, preload/IPC, protocols and cross-application contracts.
- Keep definitions in the existing packages/config, packages/types or packages/sdk ownership area where present. Recorded shared paths: ${c.sharedPackages?.length ? c.sharedPackages.map(p => '`' + p + '`').join(', ') : 'inspect the workspace; do not create packages solely because this reference names them'}.
- Avoid duplicate contract definitions inside apps. Update affected types/SDKs/configuration and all intended consumers when a contract changes.
- Preserve backward compatibility unless the task intentionally updates every consumer.
- Keep trust boundaries explicit between main, preload, renderer, web and API. Expose the smallest required IPC surface; validate payloads and API responses at boundaries.
- Read .agents/roles/security.md for security-sensitive boundaries. Build/typecheck affected producers and consumers using .agents/roles/qa.md, without repeating checks already completed.`;
  if (o.dockerWorkflow !== 'none' || c.deployment.kind !== 'none') roles['.agents/roles/devops.md'] = `# Docker and Portainer

- Local Docker workflow: ${o.dockerWorkflow}. ${o.dockerWorkflow === 'docker-first' ? 'Use Compose as the primary local runtime, with named services instead of ad hoc docker run.' : o.dockerWorkflow === 'compose' ? 'Use Compose when the task requires local containers; native application development can coexist.' : 'No local Docker workflow is selected; deployment settings do not imply local container execution.'}
- Local Compose source: ${o.dockerComposeFile ? '`' + o.dockerComposeFile + '`' : 'not specified; resolve the authoritative local file before running Compose'}.
- Check Docker availability with a Docker command before reporting daemon state. Use mapped dockerBuild/dockerUp commands and the rebuild policy in .agents/roles/qa.md.
- Validate every changed Compose file with a supported Compose CLI using config --quiet before publication/mutation. Keep resolved secret values out of output. Follow .agents/roles/security.md for environment files, ignore rules and build contexts.
- Use .agents/skills/docker-publish/SKILL.md for publication; .agents/roles/architect.md owns application scaffold requirements.
${c.deployment.kind === 'portainer' ? `
## Portainer

- Target SSH alias: \`${c.deployment.host}\`; stack name: \`${c.deployment.stackName}\`; deployment Compose source: ${c.deployment.composeFile ? '`' + c.deployment.composeFile + '`' : 'not specified; prefer the repository portainer.yml unless the existing stack uses another tracked file'}.
- ${o.portainerStackUpdate ? 'The selected automatic-update policy makes a Portainer stack change an end-to-end deployment task, unless the user explicitly restricts scope. Complete verification, Git push, image publication, deployment and health confirmation.' : 'Automatic stack updates are disabled. Complete the following sequence when deployment is requested; a stack-file edit alone does not initiate deployment.'}
- Use .agents/skills/portainer-deploy/SKILL.md for the complete deployment procedure.

` : '\n- Deployment is not Portainer-managed. Use the existing Compose workflow for authorized deployments, preserve stack/volume identities, verify service/application health, and retain previous release references.\n'}`;
  return roles;
}
