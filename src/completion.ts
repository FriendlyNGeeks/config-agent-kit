import { colorized } from './colorized.js';
import { VERSION } from './config.js';
import type { Plan } from './generate.js';

// Commands are displayed for the current platform's default shell, never executed.
const quote = (value: string) => process.platform === 'win32'
  ? "'" + value.replaceAll("'", "''") + "'"
  : "'" + value.replaceAll("'", "'\\''") + "'";

export function completionSummary(plan: Plan, scaffoldCompleted = false): string {
  const count = (action: string) => plan.changes.filter(change => change.action === action).length;
  const active = plan.changes.filter(change => change.after !== undefined);
  const roles = active.filter(change => change.path.startsWith('.agents/roles/')).length;
  const skills = active.filter(change => change.path.endsWith('/SKILL.md')).length;
  const changed = count('create') + count('update') + count('delete');
  return [
    colorized('success', `\nDone. ${plan.config.projectName} is configured.`),
    colorized('heading', 'Completion summary'),
    `Files: ${count('create')} created, ${count('update')} updated, ${count('delete')} deleted, ${count('unchanged')} unchanged (including toolkit metadata).`,
    changed ? 'Project instructions now reflect your selected capabilities and policies.' : 'Your generated instructions are already up to date.',
    `Active guidance: ${roles} roles, ${skills} skills; preferred agent: ${plan.config.preferredAgent}.`,
    ...(scaffoldCompleted ? ['Application starter generated; Agent Kit guidance is configured for the detected project.'] : []),
    'Add custom guidance outside managed markers. Review AGENTS.md before starting work.',
    colorized('heading', '\nNext commands'),
    colorized('info', 'Check the generated configuration:'),
    `  ${process.platform === 'win32' ? 'Set-Location -LiteralPath' : 'cd --'} ${quote(plan.root)}`,
    `  npx config-agent-kit@${VERSION} doctor .`,
    colorized('info', 'Revisit your configuration when needed:'),
    `  npx config-agent-kit@${VERSION} update . --interactive`,
  ].join('\n');
}
