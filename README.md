# Agent Kit

`config-agent-kit` configures project instructions, role guidance, and reusable skills. It does not generate application source, execute application commands, or deploy services.

Requires Node.js 22 or newer. Zero runtime dependencies.

## Roadmap:

- [ ] Prompt Mode Selection (Vibing { few prompts }, I'm A Pro { full menu })
- [ ] Genre Selection (Game, Data Science, Embedded, Mobile, Web, etc..)
- [ ] Project Scaffolding Concatenation
- [ ] Preferred Agent Selection (GPT, Claude, Gemini, LLama)

## Run locally

From this toolkit directory:

```powershell
npm ci
npm test
node dist/cli.js C:\repos\my-app
node dist/cli.js update C:\repos\my-app --interactive
node dist/cli.js doctor C:\repos\my-app
```

A positional directory starts interactive initialization. `init`, `update`, `detect`, and `doctor` also accept an explicit directory. No arguments initializes the current directory; `update` uses the current directory when omitted. Use `./update` to initialize a directory whose name matches a command.

Preview without creating files or directories:

```powershell
node dist/cli.js C:\repos\my-app --dry-run --diff
```

For an existing installation, preview the migration:

```powershell
node dist/cli.js update C:\repos\my-app --dry-run --diff
```

The package has been renamed locally but has not been published or reserved on npm. After public publication, users can run `npx config-agent-kit@latest my-app`. Until then, use the local CLI or the packaged archive with `npx <absolute-path-to-tgz> my-app`. The package remains marked private and UNLICENSED pending a publication/license decision.

## Generated layout

```text
AGENTS.md
.agents/
  project.md
  scaffold.json
  .scaffold-state.json
  roles/
    architect.md
    middleware.md
    qa.md
    security.md
    devops.md
    frontend.md
    backend.md
    desktop.md
    database.md
    python.md
    native.md
  skills/
    changelog-update/SKILL.md
    docker-publish/SKILL.md
    portainer-deploy/SKILL.md
    electron-rebuild/SKILL.md
    learning-journal/SKILL.md
```

Only applicable roles and skills are generated. `AGENTS.md` holds project-wide rules, routing, and the four authoritative policy flags. `project.md` holds project facts and command mappings. Roles define responsibilities, policies, and triggers; skills contain procedures loaded for matching tasks.

Architect, QA, and security roles are always included. Middleware is included for shared packages, desktop, or combined web/API projects. Framework and database roles follow selected capabilities. DevOps and docker-publish require Docker locally or for deployment. Portainer-deploy requires Portainer; electron-rebuild requires Electron. Changelog-update remains available even with automatic changelog updates disabled, for explicit release or documentation requests.

## Optional learning journal

The questionnaire asks whether to include learning-journal; default is no. Use `--learning-journal true` or `--learning-journal false` noninteractively.

The skill records durable decisions, verified fixes, flows, pitfalls, examples, and open questions in focused `learning/` documents. It searches existing topics before adding another, links to authoritative sources, and respects task scope. It creates a small topic index when there is actual learning content.

The CLI generates the skill only. It never creates placeholder learning entries and never owns, overwrites, or removes `learning/` documents. Disabling the skill preserves accumulated project knowledge. Skills do not grant permission to mutate external systems.

## Conditional questions

- Project name, capabilities, package manager, and database establish the project profile.
- Electron enables the Electron rebuild follow-up.
- Docker yes/no gates local Docker workflow, publication settings, and Portainer questions.
- Local workflow `none` supports remote-only deployments and skips local Compose and rebuild questions.
- Docker users select Docker Hub username/organization and `arm64`, `x64`, or `x86`.
- Portainer enables target host, stack, deployment Compose path, update policy, and credential-source questions.
- Homepage credential lookup enables its SSH host and file path questions. External credentials skip these.
- Changelog, optional learning-journal, and ordinary workflow preferences finish configuration.

Docker architecture maps to `linux/arm64`, `linux/amd64`, and `linux/386`, respectively. Default public image namespace is friendlyngeeks and architecture is arm64. No Docker login credentials are requested or stored.

## Compose paths

Compose paths are relative to the selected project directory, which contains `AGENTS.md`:

- `docker-compose.yml`: file in the project root.
- `docker/docker-compose.yml`: file in the project's docker subdirectory.
- `portainer.yml`: tracked deployment Compose file, commonly at the root.

These are not remote server paths, Portainer URLs, or volume locations. The CLI records paths but does not create Compose files. Blank means unknown and must be resolved before execution. Enter preserves a detected value; type `-` to clear it. Local Compose and deployment Compose are independent settings.

## Operational requirements

The four flags occur once in root `AGENTS.md`:

- `changelogUpdate`: update changelog for implemented behavior and version changes, subject to task scope.
- `dockerRebuild`: rebuild/recreate affected local services after runtime changes.
- `electronRebuild`: rebuild affected Electron runtime and packaging as appropriate.
- `portainerStackUpdate`: apply the full deployment workflow to stack changes unless user scope restricts it. Defaults to false for upgrades.

Skills preserve existing changelog entries and formatting conventions, metadata-derived versions, shared contracts, application environment ownership, ignore rules, and credential handling. Generated architecture requirements call for root docker-compose.yml and portainer.yml on new containerized scaffolds, root per-app build scripts, local image build/startup scripts, service/platform publish commands, and all-image publication.

Image references follow `<username>/<package-name>-<service-name>:<version>-<architecture>`. Names and versions come from package metadata at execution time. Example script names are `docker:publish-api:arm64` and `docker:publish:arm64`; they follow the selected architecture. The CLI detects existing conventional mappings and drops incompatible conventional platform mappings when the target changes. Custom script definitions must still be checked before execution.

Portainer deployment retains verification, task-only Git commit/push, changed-image publication, API stack update, image pulling, obsolete-service pruning, persistent storage preservation, bounded health checks, and recovery references. Failures stop subsequent steps. When Homepage lookup is selected, the CLI asks for the absolute path to your services.yaml on the selected SSH host. It reads only the matching Portainer widget; there is no default file path. Noninteractive configurations can supply --homepage-path; an unresolved path must be provided before credential lookup or deployment. Keys stay in memory and are sent only as X-API-Key. Host-side Compose recovery requires explicit scope.

The toolkit writes these instructions; running the toolkit itself never pushes Git, publishes images, or changes a live stack.

## Configuration and CLI

Use `node dist/cli.js --help` for all switches. Key options:

```text
--config <file>                 Validated JSON answers
--name <name>                   Project name
--capabilities <list>           web,api,desktop,python,native
--pm <manager>                  pnpm,npm,yarn,bun,none
--database <kind>               none,postgres,sqlite,mysql,mongodb,existing
--deployment <kind>             none,docker,portainer
--docker-workflow <value>       none,compose,docker-first
--docker-compose <path>         Local project-relative Compose path
--compose <path>                Deployment project-relative Compose path
--dockerhub-username <value>     Public image namespace
--architecture <value>          arm64,x64,x86
--host <alias>                  Portainer target SSH alias
--stack <name>                  Existing or intended stack name
--electron <boolean>            Electron support
--electron-rebuild <boolean>    Automatic Electron rebuilds
--docker-rebuild <boolean>      Automatic local Docker rebuilds
--portainer-update <boolean>    Automatic complete stack update workflow
--changelog <boolean>           Automatic changelog updates
--learning-journal <boolean>    Optional knowledge-documentation skill
--credential-source <value>     homepage,external
--homepage-host <alias>         Homepage SSH host
--homepage-path <path>          Absolute Homepage services.yaml path
--workflow <value>              validate,run-local
--interactive                  Revisit saved answers during update
--yes                          Accept without prompts
--dry-run                      Preview without writes
--diff                         Show changed lines
--json                         Machine-readable results
```

Booleans use `true` or `false`. `--interactive` cannot combine with `--yes` or `--json`. Machine-readable init/update requires `--yes` or `--dry-run`.

Config schema remains version 1. Existing configs default `learningJournal` to false. `commands.verify` and named build/rebuild/publication mappings contain package script names, never executable configuration code. `sharedPackages` stores project-relative ownership paths such as packages/config and packages/types. See examples/ for starting profiles.

## Safe updates and migration

Versions 0.1 and 0.2 used the agent-scaffold name. Version 0.3 migrates generated role content from `.agents/<role>.md` to `.agents/roles/<role>.md`, splitting operational procedures into skills.

- Existing `.agents/scaffold.json`, `.agents/.scaffold-state.json`, and `agent-scaffold` managed markers retain their historical names for compatibility.
- Custom text outside managed blocks remains intact. Surviving custom text in an old role file is linked from the corresponding new role.
- Edited managed content or an occupied unmanaged destination blocks the entire update. Reconcile the concrete conflict before retrying; no force overwrite exists.
- Skill YAML frontmatter is included in integrity checks. Add custom skill guidance after the managed end marker, preserving YAML as the first content.
- Removed selections remove only unchanged generated content; custom role text survives. Disabling a skill with custom suffix guidance blocks until those notes are moved to project documentation, avoiding a malformed or unexpectedly active skill. Learning documents are never managed.
- State paths are allowlisted; symlink/junction redirects and stale previews are rejected. File writes roll back on failure where possible.

Legacy deploy.md custom text remains preserved from earlier migrations; review any custom references to retired paths. Doctor reports missing backtick-delimited references, missing scripts/paths, conflicting flags, drift, duplicate validation commands, and environment-ignore gaps. It performs static checks only and never executes application scripts or contacts deployment hosts. Its instruction token count is a rough character-based estimate, not tokenizer measurement.

## Development and packaging

```powershell
npm ci
npm test
npm pack --pack-destination ..
```

The prepack build includes compiled dist files. Test coverage exercises conditional prompts, role migrations, protected skill metadata, journal preservation, stale plans, conflicts, rollback, platform selection, and CLI behavior. Public publication is a separate action requiring an npm account, a chosen license, removal of the private flag, and a fresh name-availability check.
