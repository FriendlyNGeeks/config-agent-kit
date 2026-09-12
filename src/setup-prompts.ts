import { GENRES, GENRE_PROFILES, recommendCapabilities } from './genres.js';
import { type Config, type Capability } from './config.js';
import { SCAFFOLD_PROVIDERS, validateSelection, type ScaffoldSelection } from './scaffold.js';
import { promptSession, terminalIO, type PromptIO } from './prompt-io.js';

export type PromptMode = 'vibe' | 'pro';
export interface SetupOptions { mode?: PromptMode; allowScaffold: boolean; requireScaffold: boolean; capabilitiesKnown: boolean; selection?: ScaffoldSelection }
export async function setupQuestionnaire(defaults: Config, options: SetupOptions, io: PromptIO = terminalIO): Promise<{ config: Config; mode: PromptMode; selection?: ScaffoldSelection }> {
  const session = promptSession(io);
  const { askValid, pick, yesNo } = session;
  try {
    const mode = options.mode ?? await pick<PromptMode>('How would you like to work?', ['vibe', 'pro'], 'vibe', { vibe: 'Vibing — describe what you want; use sensible defaults', pro: "I'm A Pro — show all project and operational settings" });
    let config = structuredClone(defaults);
    config.projectName = await askValid('Project name', config.projectName, value => {
      if (value.length > 120 || !/^(?:@[a-zA-Z0-9_.-]+\/)?[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value)) throw new Error('Use a package-style project name of at most 120 characters.');
    });
    config.genre = await pick('What are you building?', GENRES, config.genre, Object.fromEntries(GENRES.map(g => [g, GENRE_PROFILES[g].label])));
    config.capabilities = recommendCapabilities(config.genre, config.capabilities, options.capabilitiesKnown);
    let selection = options.selection;
    const providers = SCAFFOLD_PROVIDERS.filter(p => p.genres.includes(config.genre));
    if (!selection && options.allowScaffold && (options.requireScaffold || providers.length > 0 && await yesNo('Create application starter files with an upstream generator? Choose no to configure this folder only.', false))) {
      if (!providers.length) {
        if (options.requireScaffold) throw new Error('No automatic scaffolder for this genre. Use init to configure instructions, or choose a supported genre.');
      } else {
        const id = providers.length === 1 ? providers[0]!.id : await pick('Application generator', providers.map(p => p.id), providers[0]!.id);
        const provider = providers.find(p => p.id === id)!;
        const frameworks = Object.keys(provider.frameworks);
        io.output.write(session.paint('info', 'Generator: ' + provider.label + '\n'));
        const framework = frameworks.length === 1 ? frameworks[0]! : await pick('Framework (TypeScript starter)', frameworks, frameworks[0]!);
        selection = { provider: id, framework };
      }
    }
    if (selection) validateSelection(selection, config.genre);
    return { config, mode, selection };
  } finally { session.close(); }
}

// One product/runtime question resolves ambiguous genres without an operations interview.
const SURFACES: Record<string, Record<string, Capability[]>> = {
  web: { 'website': ['web'], 'website-and-api': ['web', 'api'] },
  mobile: { 'react-native': ['web', 'native'], 'native-mobile': ['native'] },
  game: { 'browser-game': ['web'], 'native-game': ['native'], 'python-game': ['python'] },
  'data-science': { 'python-analysis': ['python'], 'python-with-api': ['python', 'api'] },
  embedded: { 'native-firmware': ['native'], 'micropython': ['python', 'native'] },
  service: { 'node-api': ['api'], 'python-api': ['python', 'api'], 'native-service': ['native', 'api'] },
  desktop: { 'electron': ['desktop', 'web'], 'native-desktop': ['desktop', 'native'] },
  library: { 'native-library': ['native'], 'python-library': ['python'], 'javascript-library': ['native'] },
  general: { 'website': ['web'], 'service': ['api'], 'python': ['python'], 'native': ['native'] }
};
export async function clarifySurface(config: Config, session: ReturnType<typeof promptSession>): Promise<void> {
  const choices = SURFACES[config.genre]!;
  const surface = await session.pick('Which description fits best?', Object.keys(choices), Object.keys(choices)[0]!);
  config.capabilities = [...choices[surface]!];
  if (config.operations) {
    config.operations.electron = surface === 'electron';
    config.operations.electronRebuild = surface === 'electron';
  }
  if (surface.startsWith('python') || surface === 'micropython' || surface.startsWith('native')) {
    config.packageManager = 'none'; config.commands = { verify: [] };
  }
}
