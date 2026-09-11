import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export const terminalIO = { input: stdin as NodeJS.ReadableStream, output: stdout as NodeJS.WritableStream };
export type PromptIO = typeof terminalIO;
export function promptSession(io: PromptIO = terminalIO) {
  const rl = readline.createInterface(io);
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  const ask = async (label: string, fallback = '') => (await rl.question(`${label}${fallback ? ` [${fallback}]` : ''}: `, { signal: controller.signal })).trim() || fallback;
  const pick = async <T extends string>(label: string, values: readonly T[], fallback: T, labels?: Partial<Record<T, string>>): Promise<T> => {
    while (true) {
      io.output.write(`\n${label}\n${values.map((v, i) => `  ${i + 1}. ${labels?.[v] ?? v}`).join('\n')}\n`);
      const answer = await ask('Choose number or name', fallback);
      const selected = values[Number(answer) - 1] ?? (values.includes(answer as T) ? answer as T : undefined);
      if (selected) return selected;
      io.output.write('Choose one of the listed values.\n');
    }
  };
  return { ask, pick, yesNo: async (label: string, fallback: boolean) => await pick(label, ['yes', 'no'], fallback ? 'yes' : 'no') === 'yes',
    close() { process.removeListener('SIGINT', interrupt); rl.close(); } };
}
