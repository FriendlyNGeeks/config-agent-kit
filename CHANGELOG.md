# Changelog

## 1.4.1 — 2026-09-11

### New Features

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
