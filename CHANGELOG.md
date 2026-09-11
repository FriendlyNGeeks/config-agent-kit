# Changelog

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
