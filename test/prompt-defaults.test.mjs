import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { promptDefaults } from '../dist/prompt-defaults.js';
import { validateConfig } from '../dist/config.js';
import { confirm } from '../dist/prompts.js';

test('fresh prompt defaults use requested preferences without changing the source', () => {
  const source = validateConfig({ schemaVersion: 1, projectName: 'sample', capabilities: ['api'], packageManager: 'npm', database: 'none', apps: [], commands: { verify: [] }, deployment: { kind: 'none' }, workflow: 'validate' });
  const result = validateConfig(promptDefaults(source));
  assert.equal(result.genre, 'service');
  assert.equal(result.preferredAgent, 'gpt');
  assert.equal(result.database, 'postgres');
  assert.equal(result.learningJournal, true);
  assert.equal(result.operations.dockerWorkflow, 'docker-first');
  assert.equal(result.operations.dockerRebuild, true);
  assert.equal(source.database, 'none');
  assert.equal(promptDefaults({ ...source, database: 'sqlite' }).database, 'sqlite');
});

test('Enter accepts file writes while external generator confirmation still defaults to no', async () => {
  for (const [label, expected, hint] of [['Write these files?', true, '[Y/n]'], ['Run this external generator?', false, '[y/N]']]) {
    const input = new PassThrough();
    let text = '';
    const output = new Writable({ write(chunk, encoding, callback) {
      text += chunk.toString();
      if (chunk.toString().includes(hint)) setImmediate(() => input.write('\n'));
      callback();
    } });
    assert.equal(await confirm(label, { input, output }), expected);
    assert.ok(text.includes(hint));
    input.destroy(); output.destroy();
  }
});
