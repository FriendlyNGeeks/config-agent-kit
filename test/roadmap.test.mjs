import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PassThrough, Writable } from 'node:stream';
import { validateConfig, CONFIG_PATH, VERSION } from '../dist/config.js';
import { GENRES, inferGenre, recommendCapabilities } from '../dist/genres.js';
import { PREFERRED_AGENTS } from '../dist/agents.js';
import { detect } from '../dist/detect.js';
import { render } from '../dist/render.js';
import { plan, applyPlan } from '../dist/generate.js';
import { buildInvocation, scaffoldProject, SCAFFOLD_PROVIDERS, ScaffoldError } from '../dist/scaffold.js';
import { questionnaire } from '../dist/prompts.js';
import { setupQuestionnaire } from '../dist/setup-prompts.js';
import { main } from '../dist/cli.js';

const tempBase = path.resolve(process.env.AGENT_SCAFFOLD_TEST_TMP ?? path.join(os.tmpdir(), 'agent-scaffold-tests'));
fs.mkdirSync(tempBase, { recursive: true });
const roots = [];
const fixture = () => { const root = fs.mkdtempSync(path.join(tempBase, 'roadmap-')); roots.push(root); return root; };
afterEach(() => {
  process.exitCode = 0;
  for (const root of roots.splice(0)) {
    assert.ok(path.resolve(root).startsWith(tempBase + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
const put = (root, file, value) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), typeof value === 'string' ? value : JSON.stringify(value)); };
const get = (root, file) => fs.readFileSync(path.join(root, file), 'utf8');
const legacy = () => ({ schemaVersion: 1, projectName: 'sample', capabilities: ['web'], packageManager: 'npm', database: 'none', apps: [], commands: { verify: [] }, deployment: { kind: 'none' }, workflow: 'validate' });
const base = () => validateConfig(legacy());
const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 10000 });
async function capturedMain(args, runner) {
  const output = []; const original = console.log;
  console.log = (...parts) => output.push(parts.join(' '));
  try { await main(args, { runner }); return output.join('\n'); }
  finally { console.log = original; }
}
async function prompts(fn, answers) {
  const input = new PassThrough(); let count = 0, transcript = '';
  const output = new Writable({ write(chunk, encoding, done) {
    const text = chunk.toString(); transcript += text;
    if (text.endsWith(': ')) {
      const answer = answers[count++];
      assert.notEqual(answer, undefined, 'Unexpected question: ' + text);
      setImmediate(() => input.write(answer + '\n'));
    }
    done();
  } });
  try { const result = await fn({ input, output }); assert.equal(count, answers.length); return { result, transcript }; }
  finally { input.destroy(); output.destroy(); }
}

test('schema v1 migrates conservatively and v2 remains strict', () => {
  const old = legacy();
  assert.equal(validateConfig(old).schemaVersion, 2);
  assert.equal(old.schemaVersion, 1);
  assert.equal(validateConfig(old).preferredAgent, 'agnostic');
  assert.equal(validateConfig({ ...old, capabilities: ['python'] }).genre, 'general');
  assert.equal(validateConfig({ ...old, capabilities: ['api'] }).genre, 'service');
  for (const genre of GENRES) assert.equal(validateConfig({ ...base(), genre }).genre, genre);
  for (const preferredAgent of PREFERRED_AGENTS) assert.equal(validateConfig({ ...base(), preferredAgent }).preferredAgent, preferredAgent);
  for (const change of [{ genre: 'hacked' }, { preferredAgent: 'unknown' }, { promptMode: 'vibe' }, { schemaVersion: 88 }, { genre: undefined }]) assert.throws(() => validateConfig({ ...base(), ...change }));
});

test('project state distinguishes empty, unrecognized, and actual application evidence', () => {
  const root = fixture();
  assert.equal(detect(root).projectState, 'empty');
  assert.equal(detect(root).inferredGenre, undefined);
  assert.equal(detect(root).config.genre, 'general');
  put(root, 'README.md', 'A planned project');
  assert.equal(detect(root).projectState, 'unrecognized');
  put(root, 'pyproject.toml', '[project]\nname = "analysis"');
  assert.equal(detect(root).projectState, 'existing');
  assert.ok(detect(root).evidence.includes('pyproject.toml'));
  assert.equal(detect(root).inferredGenre, 'general');
});

test('mobile inference is separate from capabilities and genre recommendations preserve explicit surfaces', () => {
  const root = fixture();
  put(root, 'package.json', { dependencies: { expo: '*', react: '*', 'react-native': '*' } });
  assert.equal(detect(root).inferredGenre, 'mobile');
  assert.ok(detect(root).config.capabilities.includes('native'));
  assert.equal(detect(root).config.operations.electron, false);
  assert.equal(inferGenre(['web'], ['phaser']), 'game');
  assert.deepEqual(recommendCapabilities('embedded', ['web', 'api'], true), ['web', 'api']);
  const result = run(root, '--yes', '--genre', 'embedded', '--capabilities', 'web,api');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(get(root, CONFIG_PATH)).capabilities, ['web', 'api']);
});

test('agent adapters are thin and do not change the canonical root policy', () => {
  const canonical = render(base())['AGENTS.md'];
  for (const agent of PREFERRED_AGENTS) {
    const files = render({ ...base(), preferredAgent: agent });
    assert.equal(files['AGENTS.md'], canonical);
    assert.equal(!!files['CLAUDE.md'], agent === 'claude');
    assert.equal(!!files['GEMINI.md'], agent === 'gemini');
    const adapter = files['CLAUDE.md'] ?? files['GEMINI.md'];
    if (adapter) { assert.ok(adapter.length < 500); assert.match(adapter, /@AGENTS.md/); }
  }
});

test('switching agents preserves custom adapter content and refuses unowned destinations', () => {
  const root = fixture();
  applyPlan(plan(root, { ...base(), preferredAgent: 'claude' }, 'init'));
  put(root, 'CLAUDE.md', get(root, 'CLAUDE.md') + '\nCustom context\n');
  applyPlan(plan(root, { ...base(), preferredAgent: 'gemini' }, 'update'));
  assert.match(get(root, 'CLAUDE.md'), /Custom context/);
  assert.doesNotMatch(get(root, 'CLAUDE.md'), /@AGENTS.md/);
  assert.match(get(root, 'GEMINI.md'), /@AGENTS.md/);
  assert.ok(plan(root, { ...base(), preferredAgent: 'claude' }, 'update').conflicts.includes('CLAUDE.md'));
});

test('Vibing uses one clarification and agent choice, preserving a full validated config', { timeout: 5000 }, async () => {
  const { result, transcript } = await prompts(io => questionnaire({ ...base(), genre: 'web' }, io, { mode: 'vibe', askAgent: true, capabilitiesKnown: false }), ['gpt', 'website-and-api']);
  assert.deepEqual(result.capabilities, ['web', 'api']);
  assert.equal(result.preferredAgent, 'gpt');
  assert.equal(result.schemaVersion, 2);
  assert.equal('promptMode' in result, false);
  assert.equal(result.operations.portainerStackUpdate, false);
  assert.doesNotMatch(transcript, /Choose.*Database|Does this project use Docker|credential lookup|Image architecture|Automatically/);
  assert.deepEqual(validateConfig(result), result);
});

test('Vibing on an existing project asks no operations questions and retains explicit settings', { timeout: 5000 }, async () => {
  const c = validateConfig({ ...base(), database: 'postgres', deployment: { kind: 'portainer', host: 'lab', stackName: 'sample' }, operations: { portainerStackUpdate: true } });
  const { result } = await prompts(io => questionnaire(c, io, { mode: 'vibe', capabilitiesKnown: true }), []);
  assert.deepEqual(result, c);
});

test('both prompt modes use the same schema and equivalent answers produce identical config', { timeout: 5000 }, async () => {
  const vibe = await prompts(io => questionnaire(base(), io, { mode: 'vibe', capabilitiesKnown: true }), []);
  const pro = await prompts(io => questionnaire(base(), io, { mode: 'pro' }), ['', '', '', '', 'no', 'no', '', 'no', '']);
  assert.deepEqual(vibe.result, pro.result);
});

test('guided setup offers mode, genre and opt-in scaffolding without persisting UX', { timeout: 5000 }, async () => {
  const { result } = await prompts(io => setupQuestionnaire({ ...base(), genre: 'general' }, { allowScaffold: true, requireScaffold: false, capabilitiesKnown: false }, io), ['vibe', 'my-project', 'web', 'yes', 'react']);
  assert.deepEqual(result.selection, { provider: 'vite', framework: 'react' });
  assert.equal(result.mode, 'vibe');
  assert.equal('mode' in result.config, false);
});

test('scaffold dry-run never invokes runner or creates target and read-only commands reject new options', async () => {
  const parent = fixture(), root = path.join(parent, 'new-app');
  let calls = 0;
  const output = await capturedMain(['scaffold', root, '--genre', 'web', '--dry-run', '--json'], async () => { calls++; return 0; });
  const preview = JSON.parse(output);
  assert.equal(preview.provisional, true);
  assert.equal(preview.written, false);
  assert.equal(calls, 0);
  assert.equal(fs.existsSync(root), false);
  for (const flag of ['--genre', '--preferred-agent', '--prompt-mode', '--scaffolder', '--framework']) assert.equal(run('detect', root, flag, 'web').status, 1);
});

test('trusted provider registry builds argument arrays and rejects command, framework, traversal and nonempty targets', () => {
  for (const provider of SCAFFOLD_PROVIDERS) {
    const root = path.join(fixture(), 'new-app');
    const invocation = buildInvocation(root, { provider: provider.id, framework: Object.keys(provider.frameworks)[0] }, provider.genres[0]);
    assert.equal(invocation.command, process.execPath);
    assert.ok(invocation.args.includes('--package=' + provider.package));
    assert.equal(invocation.root, root);
    assert.equal(invocation.cwd, provider.target === 'current' ? root : path.dirname(root));
  }
  const root = fixture();
  for (const selection of [{ provider: 'vite;calc', framework: 'react' }, { provider: 'vite', framework: 'react && calc' }]) assert.throws(() => buildInvocation(root, selection, 'web'));
  assert.throws(() => buildInvocation(root + '/../escape', { provider: 'vite', framework: 'react' }, 'web'));
  put(root, 'keep.txt', 'Keep');
  assert.throws(() => buildInvocation(root, { provider: 'vite', framework: 'react' }, 'web'));
});

test('successful CLI scaffold re-detects real workspace facts and applies preferred-agent adapter', async () => {
  const root = path.join(fixture(), 'new-app');
  let calls = 0;
  const output = await capturedMain(['scaffold', root, '--genre', 'web', '--framework', 'react', '--preferred-agent', 'gemini', '--yes', '--json'], async (invocation, options) => {
    calls++; assert.equal(options.shell, false); assert.equal(options.json, true);
    put(invocation.root, 'package.json', { name: 'generated-app', dependencies: { vite: '*', react: '*', express: '*' }, scripts: { build: 'vite build' } });
    put(invocation.root, 'package-lock.json', {});
    return 0;
  });
  assert.equal(calls, 1);
  assert.equal(JSON.parse(output).written, true);
  const c = JSON.parse(get(root, CONFIG_PATH));
  assert.equal(c.packageManager, 'npm');
  assert.equal(c.projectName, 'generated-app');
  assert.deepEqual(c.capabilities, ['web', 'api']);
  assert.equal(c.commands.build, 'build');
  assert.match(get(root, 'GEMINI.md'), /@AGENTS.md/);
});

test('failed scaffold preserves partial output, propagates exit code and writes no kit files', async () => {
  const root = path.join(fixture(), 'new-app');
  await assert.rejects(capturedMain(['scaffold', root, '--genre', 'web', '--yes'], async invocation => {
    put(invocation.root, 'partial.txt', 'upstream output'); return 7;
  }), error => error instanceof ScaffoldError && error.exitCode === 7);
  assert.equal(get(root, 'partial.txt'), 'upstream output');
  assert.equal(fs.existsSync(path.join(root, 'AGENTS.md')), false);
});

test('successful process with failed detection stops before Agent Kit generation', async () => {
  const root = path.join(fixture(), 'new-app');
  const invocation = buildInvocation(root, { provider: 'vite', framework: 'react' }, 'web');
  await assert.rejects(scaffoldProject(invocation, async i => { put(i.root, 'package.json', '{bad'); return 0; }), /Scaffolder completed, but detection failed/);
  assert.equal(get(root, 'package.json'), '{bad');
  assert.equal(fs.existsSync(path.join(root, CONFIG_PATH)), false);
});

test('post-scaffold instruction conflict keeps upstream and custom files intact', async () => {
  const root = path.join(fixture(), 'new-app');
  const output = await capturedMain(['scaffold', root, '--genre', 'web', '--yes', '--json'], async i => {
    put(i.root, 'package.json', { name: 'sample', dependencies: { vite: '*' } });
    put(i.root, 'AGENTS.md', 'Upstream custom instructions'); return 0;
  });
  assert.equal(process.exitCode, 2);
  assert.equal(JSON.parse(output).written, false);
  assert.equal(get(root, 'AGENTS.md'), 'Upstream custom instructions');
  assert.equal(fs.existsSync(path.join(root, CONFIG_PATH)), false);
});

test('scaffold cancellation uses 130, preserves output and cleans up signal listeners', async () => {
  const root = path.join(fixture(), 'new-app');
  const count = process.listenerCount('SIGINT');
  const invocation = buildInvocation(root, { provider: 'vite', framework: 'react' }, 'web');
  await assert.rejects(scaffoldProject(invocation, async (i, options) => {
    put(i.root, 'partial.txt', 'Keep'); process.emit('SIGINT'); assert.equal(options.signal.aborted, true); return 0;
  }), error => error.exitCode === 130);
  assert.equal(process.listenerCount('SIGINT'), count);
  assert.equal(get(root, 'partial.txt'), 'Keep');
});

test('CLI version comes from package metadata and --yes never needs a mode', () => {
  assert.equal(run('--version').stdout.trim(), VERSION);
  const root = fixture();
  assert.equal(run(root, '--yes', '--genre', 'data-science').status, 0);
  const c = JSON.parse(get(root, CONFIG_PATH));
  assert.equal(c.packageManager, 'none');
  assert.equal(c.genre, 'data-science');
  assert.equal('promptMode' in c, false);
});

test('unsupported genres and invalid flags never reach the scaffold runner', async () => {
  for (const flags of [['--genre', 'embedded'], ['--genre', 'web', '--framework', 'react;calc'], ['--genre', 'web', '--preferred-agent', 'bogus'], ['--genre', 'web', '--prompt-mode', 'unknown']]) {
    let calls = 0;
    await assert.rejects(capturedMain(['scaffold', path.join(fixture(), 'new-app'), '--yes', ...flags], async () => { calls++; return 0; }));
    assert.equal(calls, 0);
  }
});

test('empty success and wrong framework output fail post-scaffold checks', async () => {
  for (const wrongManifest of [undefined, { dependencies: { express: '*' } }]) {
    const root = path.join(fixture(), 'new-app');
    const invocation = buildInvocation(root, { provider: 'vite', framework: 'react' }, 'web');
    await assert.rejects(scaffoldProject(invocation, async i => { if (wrongManifest) put(i.root, 'package.json', wrongManifest); return 0; }), /detection failed/);
    assert.equal(fs.existsSync(path.join(root, CONFIG_PATH)), false);
  }
});

test('Expo and Electron success use real framework evidence after scaffold', async () => {
  for (const [provider, genre, framework, deps, expected] of [['expo', 'mobile', 'react-native', { expo: '*', react: '*', 'react-native': '*' }, 'native'], ['electron-forge', 'desktop', 'electron', { electron: '*', '@electron-forge/cli': '*', vite: '*' }, 'desktop']]) {
    const root = path.join(fixture(), 'new-app');
    await capturedMain(['scaffold', root, '--genre', genre, '--scaffolder', provider, '--framework', framework, '--yes'], async i => { put(i.root, 'package.json', { name: 'sample', dependencies: deps }); return 0; });
    const c = JSON.parse(get(root, CONFIG_PATH));
    assert.equal(c.genre, genre);
    assert.ok(c.capabilities.includes(expected));
    assert.equal(c.operations.electron, provider === 'electron-forge');
  }
});
