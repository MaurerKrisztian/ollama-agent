import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  buildBrowseCompPrompt,
  decryptBrowseComp,
  parseBrowseCompGrade,
  parseCsv,
  selectBrowseCompIndices,
} from '../browsecomp/core.js';
import { parseBrowseCompArgs } from '../browsecomp/cli.js';

function encrypt(value: string, password: string): string {
  const input = Buffer.from(value, 'utf8');
  const digest = createHash('sha256').update(password).digest();
  const encrypted = Buffer.alloc(input.length);
  for (let index = 0; index < input.length; index++) encrypted[index] = input[index] ^ digest[index % digest.length];
  return encrypted.toString('base64');
}

test('BrowseComp CSV parser handles quotes, commas, and embedded newlines', () => {
  const rows = parseCsv('problem,answer,canary\n"one, two","line 1\nline 2",key\n');
  assert.deepEqual(rows, [{ problem: 'one, two', answer: 'line 1\nline 2', canary: 'key' }]);
});

test('BrowseComp decryption matches the official repeated SHA-256 XOR scheme', () => {
  const encrypted = encrypt('Plastic Man', 'test-canary');
  assert.equal(decryptBrowseComp(encrypted, 'test-canary'), 'Plastic Man');
});

test('BrowseComp sample selection is deterministic and unique', () => {
  const first = selectBrowseCompIndices(100, 20, 42);
  const second = selectBrowseCompIndices(100, 20, 42);
  assert.deepEqual(first, second);
  assert.equal(new Set(first).size, 20);
  assert.notDeepEqual(first, selectBrowseCompIndices(100, 20, 43));
});

test('BrowseComp prompt requests deep research and official response fields', () => {
  const prompt = buildBrowseCompPrompt('Who is it?');
  assert.match(prompt, /deep_research/);
  assert.match(prompt, /Exact Answer:/);
  assert.match(prompt, /Confidence:/);
  assert.match(prompt, /Who is it\?/);
});

test('BrowseComp prompt can use primitive web tools without deep research', () => {
  const prompt = buildBrowseCompPrompt('Who is it?', false);
  assert.doesNotMatch(prompt, /Use the deep_research tool/);
  assert.match(prompt, /web_search repeatedly/);
  assert.match(prompt, /read_web_page/);
  assert.match(prompt, /Exact Answer:/);
});

test('BrowseComp grade parser accepts official yes/no output only', () => {
  assert.equal(parseBrowseCompGrade('reasoning: match\ncorrect: yes\nconfidence: 80'), true);
  assert.equal(parseBrowseCompGrade('correct: no'), false);
  assert.equal(parseBrowseCompGrade('the answer is yes'), null);
});

test('BrowseComp CLI defaults the grader to the selected agent model', () => {
  const options = parseBrowseCompArgs(['--model', 'fixture:7b', '--count', '3'], '/project');
  assert.ok(options);
  assert.equal(options.model, 'fixture:7b');
  assert.equal(options.graderModel, 'fixture:7b');
  assert.equal(options.count, 3);
  assert.equal(options.datasetPath, '/project/.cache/browsecomp/browse_comp_test_set.csv');
  assert.equal(options.uiServerUrl, 'http://127.0.0.1:3001');
  assert.equal(options.uiUrl, 'http://127.0.0.1:3001');
  assert.equal(options.useDeepResearch, true);
  assert.equal(options.webOutputTTLTurns, 5);
});

test('BrowseComp CLI supports development UI links and direct execution', () => {
  const observed = parseBrowseCompArgs([
    '--ui-server', 'http://127.0.0.1:3001',
    '--ui-url', 'http://127.0.0.1:3000',
  ], '/project');
  assert.equal(observed?.uiServerUrl, 'http://127.0.0.1:3001');
  assert.equal(observed?.uiUrl, 'http://127.0.0.1:3000');

  const direct = parseBrowseCompArgs(['--no-ui-session'], '/project');
  assert.equal(direct?.uiServerUrl, undefined);
  assert.equal(direct?.uiUrl, undefined);

  const primitiveWeb = parseBrowseCompArgs(['--no-deep-search'], '/project');
  assert.equal(primitiveWeb?.useDeepResearch, false);

  const noWebExpiry = parseBrowseCompArgs(['--disable-web-ttl'], '/project');
  assert.equal(noWebExpiry?.webOutputTTLTurns, 0);
  assert.equal(parseBrowseCompArgs(['--web-search-ttl', '12'], '/project')?.webOutputTTLTurns, 12);

  const manual = parseBrowseCompArgs(['--count', '1', '--seed', '7', '--manual-answer', 'Example Person'], '/project');
  assert.equal(manual?.manualAnswer, 'Example Person');
  assert.throws(
    () => parseBrowseCompArgs(['--count', '2', '--manual-answer', 'Example Person'], '/project'),
    /requires --count 1/,
  );
});
