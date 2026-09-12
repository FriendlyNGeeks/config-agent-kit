import { getOperations, type Config } from './config.js';

// Defaults for a new interactive setup only; saved and explicit settings take precedence.
export function promptDefaults(source: Config): Config {
  const config = structuredClone(source);
  config.genre = 'service';
  config.preferredAgent = 'gpt';
  if (config.database === 'none') config.database = 'postgres';
  config.learningJournal = true;
  config.operations = { ...getOperations(config), dockerWorkflow: 'docker-first', dockerRebuild: true };
  return config;
}
