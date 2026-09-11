import type { Capability } from './config.js';

export const GENRES = ['web', 'mobile', 'game', 'data-science', 'embedded', 'service', 'desktop', 'library', 'general'] as const;
export type Genre = typeof GENRES[number];
export interface GenreProfile { label: string; capabilities: Capability[]; scaffolders: string[] }
export const GENRE_PROFILES: Record<Genre, GenreProfile> = {
  web: { label: 'Web', capabilities: ['web'], scaffolders: ['vite'] },
  mobile: { label: 'Mobile', capabilities: ['native'], scaffolders: ['expo'] },
  game: { label: 'Game', capabilities: ['native'], scaffolders: ['vite'] },
  'data-science': { label: 'Data Science', capabilities: ['python'], scaffolders: [] },
  embedded: { label: 'Embedded', capabilities: ['native'], scaffolders: [] },
  service: { label: 'Service / API', capabilities: ['api'], scaffolders: [] },
  desktop: { label: 'Desktop', capabilities: ['desktop'], scaffolders: ['electron-forge'] },
  library: { label: 'Library', capabilities: ['native'], scaffolders: [] },
  general: { label: 'Not sure yet', capabilities: ['web'], scaffolders: [] }
};

export function inferGenre(capabilities: readonly string[], dependencies: readonly string[] = []): Genre {
  if (dependencies.some(d => ['expo', 'react-native'].includes(d))) return 'mobile';
  if (dependencies.some(d => ['phaser', 'pixi.js'].includes(d))) return 'game';
  if (capabilities.includes('desktop')) return 'desktop';
  if (capabilities.includes('web')) return 'web';
  if (capabilities.length === 1 && capabilities[0] === 'api') return 'service';
  return 'general';
}

// Recommendations only fill an unknown profile; detected/explicit capabilities survive.
export function recommendCapabilities(genre: Genre, current: Capability[], known: boolean): Capability[] {
  return known ? [...current] : [...GENRE_PROFILES[genre].capabilities];
}
