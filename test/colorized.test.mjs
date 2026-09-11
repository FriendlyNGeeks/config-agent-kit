import test from 'node:test';
import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { colorized, palette } from '../dist/colorized.js';

test('terminal styles preserve text and reset formatting for every tone', () => {
  for (const tone of Object.keys(palette)) {
    const result = colorized(tone, 'Message', { isTTY: true }, {});
    assert.match(result, /\u001b\[/);
    assert.equal(stripVTControlCharacters(result), 'Message');
    assert.match(result, /\u001b\[\d+m$/);
  }
});

test('color policy supports redirected streams, explicit opt-out and forced colors', () => {
  assert.equal(colorized('info', 'Message', {}, {}), 'Message');
  assert.equal(colorized('info', 'Message', { isTTY: true }, { TERM: 'dumb' }), 'Message');
  assert.match(colorized('info', 'Message', {}, { FORCE_COLOR: '1' }), /\u001b\[/);
  for (const env of [{ NO_COLOR: '' }, { NODE_DISABLE_COLORS: '1' }, { FORCE_COLOR: '0' }, { NO_COLOR: '1', FORCE_COLOR: '1' }]) {
    assert.equal(colorized('info', 'Message', { isTTY: true }, env), 'Message');
  }
});

test('CLI colors human output but never JSON, including errors', () => {
  const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
  const root = fileURLToPath(new URL('..', import.meta.url));
  const env = { ...process.env, FORCE_COLOR: '1' };
  delete env.NO_COLOR;
  delete env.NODE_DISABLE_COLORS;
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { env, encoding: 'utf8' });
  const text = run('init', root, '--dry-run');
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /\u001b\[/);
  const json = run('init', root, '--dry-run', '--json');
  assert.equal(json.status, 0, json.stderr);
  assert.doesNotMatch(json.stdout, /\u001b\[/);
  assert.equal(JSON.parse(json.stdout).written, false);
  const error = run('--unknown-option', '--json');
  assert.equal(error.status, 1);
  assert.doesNotMatch(error.stderr, /\u001b\[/);
  assert.equal(typeof JSON.parse(error.stderr).error, 'string');
});
