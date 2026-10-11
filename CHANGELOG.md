# Changelog

## 1.5.0 — 2026-10-10

### New Features

- Add PCB build selection, KiCAD detection, software and manufacturer questions, and saved single-sided or double-sided copper-layer preferences.
- Generate a ten-step PCB skill covering vendor-linked BOM sourcing, concept renders, ERC/DRC, manufacturing, and measured bring-up validation.
- Skip application configuration questions for board-only projects while retaining mixed PCB and firmware guidance.
- Ask about KiCAD MCP installation and generate system-folder installation, Codex plugin registration, and connection verification guidance for the first agent task.

### Documentation and Release

- Document PCB setup, copper-layer preferences, vendor sourcing, and KiCAD MCP setup; update package and lockfile versions to 1.5.0.

## 1.4.3 — 2026-10-03

### Security Improvements

- Add explicit generated guidance for secret scanning, dependency vulnerability review, and configured static analysis.
- Add concrete XSS controls for safe rendering, contextual encoding, allowlist sanitization, dangerous-payload tests, and Content Security Policy preservation.
- Add concrete SQL-injection controls for parameterized queries, safe ORM use, identifier allowlists, and injection-shaped tests.

### Documentation and Release

- Update package and lockfile versions to 1.4.3.

## 1.4.2 — 2026-09-11

### Security Improvements

- Move local paths, Docker usernames, and hostnames/SSH aliases into secret.agent.env; generated instructions and scaffold.json use variable references instead of embedding these values.
- Load referenced settings as data without executing the file; stop updates when required local values are missing.
- Hide secret.agent.env contents from JSON previews and diffs, and restrict newly written local settings files to owner access on POSIX systems.
- Add exclusions for secret.agent.env and scaffold configuration/state files to existing .gitignore, .npmignore, and .dockerignore files; create .gitignore when missing and preserve existing rules.
- Highlight a privacy reminder in the completion summary: maintain exclusions for future packaging/deployment tools and separately untrack any files already committed.
- Preserve unrelated local settings and custom guidance during migration; keep passwords and API tokens in the existing credential provider.

### Documentation and Release

- Replace duplicate Quickstart examples with Basic, Intermediate, and Advanced one-line commands and concise explanations.
- Remove the redundant Prompt modes and genres section.
- Update package and lockfile versions to 1.4.2.

## 1.4.1 — 2026-09-11

### New Features

- Store local paths, Docker usernames, and hostnames/SSH aliases in secret.agent.env; resolve references in saved configuration and generated instructions.
- Merge local-file exclusions into existing ignore files, create .gitignore when needed, and show a distinct privacy reminder in the completion summary.
- Retry missing or invalid required prompt fields individually without restarting the questionnaire.
- Add a completion summary after successful generation and updates with file counts, active roles and skills, and next commands.
- Add centralized terminal styling for prompts, explanations, warnings, errors, and progress, with color controls and plain JSON output.
- Add author, site, date, title, and tag metadata to generated role and skill Markdown files.

### Documentation and Release

- Convert completed and pending roadmap items into status, feature, description, and priority tables; mark completion summaries as complete.
- Add the GitHub Actions npm publishing workflow with release version validation and tests.
- Update package and lockfile versions to 1.4.1.

## 1.4.0 — 2026-09-10

### New Features

- Add Vibing and Pro prompt modes with a shared validated configuration.
- Add project genres and automatic migration from configuration schema 1 to 2.
- Add optional Vite, Expo, and Electron Forge scaffolding with post-generation detection.
- Add preferred-agent selection and thin Claude and Gemini instruction adapters.
- Keep routine technical decisions with the coding agent through concise canonical guidance.

### Bug Fixes

- Derive CLI and template versions from package metadata to prevent release-version drift.
- Distinguish empty folders from recognized applications instead of treating fallback capabilities as evidence.
- Preserve existing settings, custom instructions, and partial scaffold output across updates and failures.
