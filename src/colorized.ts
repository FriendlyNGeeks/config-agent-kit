import { styleText } from 'node:util';

// Change the palette here; callers select a meaning rather than a color.
export const palette = {
  heading: ['cyan', 'bold'], question: ['cyan', 'bold'], info: ['blue'],
  success: ['green'], warning: ['yellow'], error: ['red', 'bold'],
  muted: ['dim'], create: ['green'], update: ['cyan'], delete: ['yellow'],
  conflict: ['red', 'bold'], unchanged: ['dim'],
  privacy: ['magenta', 'bold'],
} satisfies Record<string, Parameters<typeof styleText>[0]>;
export type Tone = keyof typeof palette;
type Output = { isTTY?: boolean };

export function colorized(tone: Tone, text: string, stream: Output = process.stdout, env: NodeJS.ProcessEnv = process.env): string {
  // Explicit checks also support early Node 22 releases and custom prompt streams.
  if (env.NO_COLOR !== undefined || env.NODE_DISABLE_COLORS !== undefined || env.FORCE_COLOR === '0') return text;
  const forced = env.FORCE_COLOR !== undefined && ['', '1', '2', '3', 'true'].includes(env.FORCE_COLOR);
  if (!forced && (!stream.isTTY || env.TERM === 'dumb')) return text;
  return styleText(palette[tone], text, { validateStream: false });
}
