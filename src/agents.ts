export const PREFERRED_AGENTS = ['agnostic', 'gpt', 'claude', 'gemini', 'llama'] as const;
export type PreferredAgent = typeof PREFERRED_AGENTS[number];
export const AGENT_PROFILES: Record<PreferredAgent, { label: string; adapterFile?: string }> = {
  agnostic: { label: 'Any agent' },
  gpt: { label: 'GPT / Codex' },
  claude: { label: 'Claude Code', adapterFile: 'CLAUDE.md' },
  gemini: { label: 'Gemini CLI', adapterFile: 'GEMINI.md' },
  llama: { label: 'Llama / local runtime' }
};
export const ADAPTER_FILES = ['CLAUDE.md', 'GEMINI.md'];
export function agentAdapter(agent: PreferredAgent): { file: string; body: string } | undefined {
  const file = AGENT_PROFILES[agent]?.adapterFile;
  if (!file) return undefined;
  return { file, body: '# Agent Kit entry point\n\n@AGENTS.md\n\nUse AGENTS.md as the canonical project instructions. Load only the matching roles and skills it references. This adapter adds no separate policy.' };
}
