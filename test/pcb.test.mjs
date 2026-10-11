import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PassThrough, Writable } from 'node:stream';
import { validateConfig, CONFIG_PATH } from '../dist/config.js';
import { detect } from '../dist/detect.js';
import { render } from '../dist/render.js';
import { questionnaire } from '../dist/prompts.js';
import { setupQuestionnaire } from '../dist/setup-prompts.js';
import { promptDefaults } from '../dist/prompt-defaults.js';

const tempBase = path.resolve(process.env.AGENT_SCAFFOLD_TEST_TMP ?? path.join(os.tmpdir(), 'agent-scaffold-tests'));
fs.mkdirSync(tempBase, { recursive: true });
const roots = [];
const fixture = () => { const root = fs.mkdtempSync(path.join(tempBase, 'pcb-')); roots.push(root); return root; };
afterEach(() => { for (const root of roots.splice(0)) { assert.ok(path.resolve(root).startsWith(tempBase + path.sep)); fs.rmSync(root, { recursive: true, force: true }); } });
const base = () => validateConfig({ schemaVersion: 2, genre: 'pcb', preferredAgent: 'gpt', projectName: 'sensor-board', capabilities: ['pcb'], packageManager: 'none', database: 'none', apps: [], commands: { verify: [] }, deployment: { kind: 'none' }, workflow: 'validate' });
async function prompts(fn, answers) {
  const input = new PassThrough(); let count = 0, transcript = '';
  const output = new Writable({ write(chunk, encoding, done) {
    const text = chunk.toString(); transcript += text;
    if (text.endsWith(': ')) {
      const answer = answers[count++]; assert.notEqual(answer, undefined, 'Unexpected question: ' + text);
      setImmediate(() => input.write(answer + '\n'));
    }
    done();
  } });
  try { const result = await fn({ input, output }); assert.equal(count, answers.length); return { result, transcript }; }
  finally { input.destroy(); output.destroy(); }
}
const cli = (...args) => spawnSync(process.execPath, [fileURLToPath(new URL('../dist/cli.js', import.meta.url)), ...args], { encoding: 'utf8', timeout: 10000 });

test('PCB setup replaces fresh app defaults and offers no application generator', { timeout: 5000 }, async () => {
  const fresh = promptDefaults(validateConfig({ ...base(), genre: 'general', capabilities: ['web'] }));
  const { result, transcript } = await prompts(io => setupQuestionnaire(fresh, { mode: 'vibe', allowScaffold: true, requireScaffold: false, capabilitiesKnown: false }, io), ['', 'pcb']);
  assert.deepEqual(result.config.capabilities, ['pcb']);
  assert.equal(result.config.packageManager, 'none');
  assert.equal(result.config.database, 'none');
  assert.equal(result.config.operations.dockerWorkflow, 'none');
  assert.equal(result.selection, undefined);
  assert.doesNotMatch(transcript, /upstream generator/);
});

test('KiCAD asks vendor and copper preference in both modes and preserves saved answers', { timeout: 5000 }, async () => {
  for (const mode of ['vibe', 'pro']) for (const manufacturer of ['jlcpcb', 'pcbway', 'microfab']) {
    const answers = ['kicad', manufacturer, 'single-sided', 'no', ...(mode === 'pro' ? ['yes', 'no'] : [])];
    const { result, transcript } = await prompts(io => questionnaire(base(), io, { mode, skipIdentity: true }), answers);
    assert.deepEqual(result.pcb, { software: 'kicad', manufacturer, sides: 'single-sided', kicadMcpInstalled: false });
    assert.doesNotMatch(transcript, /Database|Does this project use Docker|Does this project use Electron/);
    const saved = await prompts(io => questionnaire(result, io, { mode: 'vibe' }), ['', '', '', '']);
    assert.deepEqual(saved.result.pcb, result.pcb);
  }
});

test('JLCONE skips the manufacturer question and clears an old KiCAD destination', { timeout: 5000 }, async () => {
  const c = validateConfig({ ...base(), pcb: { software: 'kicad', manufacturer: 'pcbway', sides: 'single-sided', kicadMcpInstalled: true } });
  const { result, transcript } = await prompts(io => questionnaire(c, io, { mode: 'vibe' }), ['jlcone-desktop', 'double-sided']);
  assert.deepEqual(result.pcb, { software: 'jlcone-desktop', sides: 'double-sided' });
  assert.doesNotMatch(transcript, /Which manufacturer/);
  assert.doesNotMatch(transcript, /Have you installed/);
});

test('PCB configuration rejects invalid software, sides, vendor and unrelated settings', () => {
  for (const pcb of [{ software: 'other' }, { software: 'kicad', sides: 'three' }, { software: 'kicad', manufacturer: 'other' }, { software: 'kicad', arbitrary: true }, { software: 'jlcone-desktop', manufacturer: 'jlcpcb' }, { software: 'kicad', kicadMcpInstalled: 'yes' }, { software: 'jlcone-desktop', kicadMcpInstalled: true }]) {
    assert.throws(() => validateConfig({ ...base(), pcb }));
  }
  assert.throws(() => validateConfig({ ...base(), genre: 'web', capabilities: ['web'], pcb: { software: 'kicad' } }));
  assert.equal(validateConfig({ ...base(), pcb: { software: 'kicad' } }).pcb.sides, undefined);
});

test('KiCAD files establish project evidence and PCB defaults without changing source', () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, 'sensor.kicad_pcb'), '(kicad_pcb)');
  const d = detect(root);
  assert.equal(d.projectState, 'existing');
  assert.equal(d.capabilitiesKnown, true);
  assert.equal(d.config.genre, 'pcb');
  assert.deepEqual(d.config.capabilities, ['pcb']);
  assert.equal(d.config.packageManager, 'none');
  assert.deepEqual(d.config.pcb, { software: 'kicad' });
  assert.equal(promptDefaults(d.config).operations.dockerWorkflow, 'none');
  assert.equal(fs.readFileSync(path.join(root, 'sensor.kicad_pcb'), 'utf8'), '(kicad_pcb)');
});

test('CLI creates vendor-specific skill and saved preferences; updates and retirement are managed', () => {
  const root = fixture();
  let result = cli(root, '--genre', 'pcb', '--pcb-software', 'kicad', '--pcb-manufacturer', 'pcbway', '--pcb-sides', 'single-sided', '--kicad-mcp-installed', 'false', '--yes');
  assert.equal(result.status, 0, result.stderr);
  const skillPath = path.join(root, '.agents/skills/pcb-design/SKILL.md');
  const skill = fs.readFileSync(skillPath, 'utf8');
  assert.equal([...skill.matchAll(/^## \d+\./gm)].length, 10);
  assert.match(skill, /Manufacturing destination: PCBWay/);
  assert.match(skill, /Single-sided \(one copper layer\)/);
  assert.match(skill, /source URL, stock\/price check date/);
  assert.match(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), /\.agents\/skills\/pcb-design\/SKILL.md/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, CONFIG_PATH), 'utf8')).pcb, { software: 'kicad', manufacturer: 'pcbway', sides: 'single-sided', kicadMcpInstalled: false });
  assert.match(skill, /User-reported MCP status: not installed/);
  assert.match(result.stdout, /First PCB agent task/);
  assert.equal(cli('doctor', root, '--json').status, 0);
  result = cli('update', root, '--kicad-mcp-installed', 'true', '--yes');
  assert.equal(result.status, 0, result.stderr);
  assert.match(fs.readFileSync(skillPath, 'utf8'), /User-reported MCP status: installed/);
  result = cli('update', root, '--pcb-software', 'jlcone-desktop', '--yes');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, CONFIG_PATH), 'utf8')).pcb, { software: 'jlcone-desktop', sides: 'single-sided' });
  result = cli('update', root, '--genre', 'web', '--capabilities', 'web', '--yes');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(skillPath), false);
});

test('MCP answers remain hints; JLCONE has no KiCAD installation workflow', { timeout: 5000 }, async () => {
  const { result } = await prompts(io => questionnaire(base(), io, { mode: 'vibe' }), ['kicad', 'jlcpcb', 'no-preference', 'yes']);
  assert.equal(result.pcb.kicadMcpInstalled, true);
  const files = render(result);
  assert.match(files['.agents/project.md'], /installed; verify connection/);
  const jlcone = render(validateConfig({ ...base(), pcb: { software: 'jlcone-desktop' } }));
  assert.doesNotMatch(jlcone['.agents/skills/pcb-design/SKILL.md'], /## KiCAD MCP setup/);
  const root = fixture();
  assert.equal(cli(root, '--genre', 'pcb', '--kicad-mcp-installed', 'yes', '--yes').status, 1);
  assert.equal(fs.existsSync(path.join(root, 'AGENTS.md')), false);
});

test('PCB preview writes nothing; mixed firmware projects receive PCB and native guidance', () => {
  const root = path.join(fixture(), 'preview-board');
  assert.equal(cli(root, '--genre', 'pcb', '--dry-run', '--json').status, 0);
  assert.equal(fs.existsSync(root), false);
  const mixed = render(validateConfig({ ...base(), genre: 'embedded', capabilities: ['native', 'pcb'], pcb: { software: 'kicad', manufacturer: 'microfab', sides: 'no-preference' } }));
  assert.ok(mixed['.agents/roles/native.md']);
  assert.ok(mixed['.agents/skills/pcb-design/SKILL.md']);
  assert.equal(render(validateConfig({ ...base(), genre: 'web', capabilities: ['web'] }))['.agents/skills/pcb-design/SKILL.md'], undefined);
});
