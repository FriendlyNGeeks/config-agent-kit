# Agent Kit

`config-agent-kit` configures project instructions, role guidance, and reusable skills. It can optionally run a registered upstream application generator, then re-detect the project and configure its agents. It never deploys services.

Requires Node.js 22 or newer. Zero runtime dependencies. Upstream generators have their own requirements; current Vite starters require Node.js 22.12+ on the Node 22 line.

## Quickstart

**Basic** — Configure agent instructions with a few guided questions.

~~~powershell
npx config-agent-kit my-app --prompt-mode vibe
~~~

**Intermediate** — Choose project, database, Docker, and agent settings through the full questionnaire.

~~~powershell
npx config-agent-kit my-app --prompt-mode pro
~~~

**Advanced** — Write API/PostgreSQL guidance for GPT directly from flags, without prompts.

~~~powershell
npx config-agent-kit my-api --genre service --capabilities api --database postgres --preferred-agent gpt --yes
~~~

## Roadmap

| Status | Feature | Description | Priority |
| --- | --- | --- | --- |
| ✅ | Prompt mode selection | Vibing for fewer questions or Pro for full configuration. | High |
| ✅ | Genre selection | Tailor guidance for web, mobile, game, data science, embedded, and other projects. | High |
| ✅ | Project scaffolding | Run a supported upstream generator, then configure agent guidance. | High |
| ✅ | Preferred agent selection | Choose GPT, Claude, Gemini, Llama, or agent-agnostic guidance. | High |
| ✅ | Terminal color and emphasis | Centralized palette for prompts and results, with plain JSON and configurable color support. | High |
| ✅ | Completion summary | Show applied file counts, active guidance, and exact next commands after successful generation. | High |

### Pending

| Status | Feature | Description | Priority |
| --- | --- | --- | --- |
| ⏳ | Interactive change review | explain planned file changes with readable diffs before applying them. | High |
| ⏳ | Guided conflict resolution | preserve custom instructions while updating generated templates. | High |
| ⏳ | Project drift detection | propose updates when frameworks, services, scripts, or role assignments change. | High |
| ⏳ | Explain mode | show why each role and skill was selected and the project evidence behind it. | High |
| ⏳ | Instruction health report | extend doctor checks for broken references, missing commands, conflicting guidance, and outdated skills. | High |
| ⏳ | Team presets | reuse preferred agents, operational policies, roles, and skills across projects. | Medium |
| ⏳ | Custom role and skill templates | support user templates with metadata validation and previews. | Medium |
| ⏳ | Update snapshots and undo | restore instruction files affected by a toolkit update. | Medium |
| ⏳ | Monorepo instruction scoping | combine shared root rules with app- and package-specific guidance. | Medium |
| ⏳ | CI health checks | fail checks for invalid metadata, broken references, and stale command mappings. | Medium |
| ⏳ | Example gallery | demonstrate generated setups for web, API, Electron, Python, and monorepo projects. | Medium |
| ⏳ | Template version reporting | show installed template versions and changes available in an update. | Medium |
| ⏳ | Role and skill identity metadata | extend existing attribution with a distinct identity for each generated role and skill. | Medium |

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

Use the published version with `npx config-agent-kit@latest my-app`, or test this build with `npx <absolute-path-to-tgz> my-app`. The repository is MIT licensed. A locally built release is not published automatically.

Terminal styling is centralized in `src/colorized.ts`. Colors are enabled for interactive terminals; redirected output stays plain unless `FORCE_COLOR=1` is set. Set `NO_COLOR=1`, `NODE_DISABLE_COLORS=1`, or `FORCE_COLOR=0` to disable styling. JSON output always stays plain.

## Generated layout

Local paths, Docker usernames, and deployment/Homepage hostnames or SSH aliases are stored in the project-root `secret.agent.env`. Generated Markdown and `.agents/scaffold.json` contain `${AGENT_*}` references. The toolkit resolves these references as data when loading saved configuration; agents must read only the keys needed for their task, without sourcing the file or printing values. Keep actual passwords and API tokens in your credential provider.

Initialization and updates create `.gitignore` if missing and append protection rules to existing root `.gitignore`, `.npmignore`, and `.dockerignore` files, preserving existing content. Rules cover `secret.agent.env`, `.agents/scaffold.json`, and `.agents/.scaffold-state.json`, plus alternate scaffold-state paths. Existing tracked files remain tracked until you explicitly untrack them. Add these exclusions to any packaging or deployment ignore files created later. The completion summary highlights this reminder in magenta when color is enabled.

Updating an older installation moves configured local values into `secret.agent.env`. Keep this file with your local checkout; missing referenced values stop updates until restored. Custom guidance outside managed sections is preserved and should be reviewed separately for previously embedded private values.

Required prompt fields are validated in place: a missing or invalid name, username, hostname/alias, or path repeats only that question and preserves earlier answers.

```text
secret.agent.env
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

New interactive setups default to Service / API, GPT / Codex, PostgreSQL when no database is detected, Docker with the docker-first workflow, automatic local Compose rebuilding, and learning-journal enabled. Writing generated files defaults to yes (`Y/n`). Saved configurations and explicit options take precedence. Noninteractive defaults are unchanged; use `--learning-journal true` or `--learning-journal false` to select that skill noninteractively.

The skill records durable decisions, verified fixes, flows, pitfalls, examples, and open questions in focused `learning/` documents. It searches existing topics before adding another, links to authoritative sources, and respects task scope. It creates a small topic index when there is actual learning content.

The CLI generates the skill only. It never creates placeholder learning entries and never owns, overwrites, or removes `learning/` documents. Disabling the skill preserves accumulated project knowledge. Skills do not grant permission to mutate external systems.

## Conditional questions

These detailed questions appear in Pro mode. Vibing uses detected or conservative defaults and shows a short summary before writing.

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

## Native project scaffolding

~~~powershell
npx config-agent-kit scaffold my-app
npx config-agent-kit scaffold my-app --genre web --scaffolder vite --framework react --preferred-agent gpt --yes
npx config-agent-kit scaffold phone-app --genre mobile --scaffolder expo --yes
npx config-agent-kit scaffold desktop-app --genre desktop --scaffolder electron-forge --yes
npx config-agent-kit scaffold my-app --genre web --dry-run --json
~~~

Guided init offers a starter only for a new or empty directory. The explicit scaffold command or --scaffolder opts into execution; --yes accepts that explicitly selected handoff without prompts. Ordinary --yes initialization never launches an upstream generator.

| Provider | Genre | Framework choices | Target strategy |
|---|---|---|---|
| Vite | web, browser game | react, vue, svelte, vanilla, preact, solid (TypeScript templates) | Run in the chosen root with dot |
| Expo | mobile | react-native (blank TypeScript) | Run from parent with target basename |
| Electron Forge | desktop | electron (Vite TypeScript) | Run from parent with target basename |

Game engines, embedded toolchains, data-science starters, services and libraries can all receive Agent Kit configuration. Automatic scaffolding is deliberately unavailable where no trusted provider is registered. A Vite game selection means a browser starter, not a game-engine generator.

The CLI prints the executable, arguments and working directory before confirmation. It invokes npm's JavaScript entry through Node with shell:false, including on Windows. IDs and templates are allowlisted; no raw shell command from configuration is executed. Generator downloads require network access. Expo skips dependency installation and upstream agent files; Electron Forge may install dependencies. The selected package manager is re-detected from actual generated files, rather than assumed from the launcher.

Scaffolding requires an empty/new directory with a lowercase package-style basename. Parent directories may contain spaces. Traversal and symlink/junction targets are rejected. A nonempty unrecognized folder can receive instructions via init but cannot be overwritten by a scaffolder.

Dry-run never creates a target or starts a process. A scaffold preview is marked provisional: it shows the exact invocation, because the final instruction diff requires real application files. After success, detection runs again; then Agent Kit previews and applies only its managed files. A failed or cancelled generator leaves its output intact and generates no Agent Kit files. A later instruction conflict also leaves the application scaffold intact. Upstream output is not part of Agent Kit rollback. With --json, upstream logs go to stderr and the final structured result goes to stdout. External failure exit codes are propagated; cancellation uses 130.

Provider references: [Vite](https://vite.dev/guide/), [Expo](https://docs.expo.dev/more/create-expo/), [Electron Forge](https://www.electronforge.io/templates/vite-%2B-typescript). Upstream latest releases can change; inspect the preview before execution.

## Preferred agents

Choose agnostic, gpt, claude, gemini, or llama with the questionnaire or --preferred-agent. AGENTS.md and .agents remain canonical for every choice. Claude gets a small CLAUDE.md that imports AGENTS.md; Gemini gets the same import in GEMINI.md. GPT/Codex and agnostic add no redundant adapter. Llama/local records the preference without assuming a particular runtime or instruction filename. No agent is launched, and no model version or security policy is selected by this setting.

Adapters follow documented [Claude imports](https://code.claude.com/docs/en/memory) and [Gemini imports](https://geminicli.com/docs/cli/gemini-md/). They share the existing conflict, custom-text and safe-update rules. These are instruction adapters, not model integrations. Tools without native skill discovery should read the routed SKILL.md on demand; the CLI does not duplicate a skill tree for each agent.

## Configuration and CLI

Use `node dist/cli.js --help` for all switches. Key options:

```text
--prompt-mode <mode>            vibe,pro (session only)
--genre <genre>                 Project taxonomy; general when unknown
--preferred-agent <agent>       agnostic,gpt,claude,gemini,llama
--scaffolder <provider>          vite,expo,electron-forge (opt-in)
--framework <framework>          Provider-specific template choice
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

Config schema is now version 2, with validated genre and preferredAgent fields. Version 1 configs migrate on update; ambiguous genres become general and the preferred agent defaults to agnostic. Prompt mode is session-only and is never saved. Existing configs default `learningJournal` to false. `commands.verify` and named build/rebuild/publication mappings contain package script names, never executable configuration code. `sharedPackages` stores project-relative ownership paths such as packages/config and packages/types. See examples/ for starting profiles.

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

The prepack build includes compiled dist files. Test coverage exercises conditional prompts, role migrations, protected skill metadata, journal preservation, stale plans, conflicts, rollback, platform selection, and CLI behavior. Public publication is a separate action requiring npm publishing access. Package and CLI versions are read from the same package metadata.
