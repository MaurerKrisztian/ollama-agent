import assert from 'node:assert/strict';
import test from 'node:test';
import { BENCHMARK_TEST_CASES } from '../cases/index.js';
import { evaluateBenchmarkTask, evaluateFileState, evaluateJsonValues, evaluateScriptVerification } from '../evaluation/evaluators.js';
import { setupMockEnvironment } from '../fixtures/mockEnvironment.js';

test('every benchmark defines at least one observable outcome verifier', () => {
  for (const testCase of BENCHMARK_TEST_CASES) {
    assert.ok(
      testCase.verificationScript ||
      testCase.expectedFileJson ||
      testCase.expectedFileState?.length ||
      testCase.expectedDirectoryEntries?.length ||
      testCase.expectedResponseSubstrings?.length ||
      testCase.expectedToolResults?.length ||
      testCase.multiStepPrompts?.some(s => s.expectedFileState?.length || s.expectedFileJson || s.verificationScript),
      `${testCase.id} has no outcome verifier`,
    );
  }
});

test('benchmark UI descriptions are derived from configured outcomes', () => {
  const rootListing = BENCHMARK_TEST_CASES.find((testCase) => testCase.id === 'test_list_root_directory');
  assert.ok(rootListing);
  assert.match(rootListing.requiredOutput, /README\.md/);
  assert.match(rootListing.requiredOutput, /user_profile\.json/);
  assert.doesNotMatch(rootListing.requiredOutput, /Tool call request/i);
  assert.match(rootListing.evaluationCriteria, /chosen tool name does not determine the verdict/i);
});

test('evaluateFileState detects existing files and expected content', async () => {
  const mockDir = await setupMockEnvironment();
  const res = await evaluateFileState(mockDir, [
    { relativePath: 'user_profile.json', mustExist: true, containsSubstrings: ['9482'] },
  ]);
  assert.equal(res.passed, true);
});

test('evaluateJsonValues verifies JSON key-value pairs correctly', async () => {
  const mockDir = await setupMockEnvironment();
  const res = await evaluateJsonValues(mockDir, {
    relativePath: 'user_profile.json',
    values: { userId: 9482 },
  });
  assert.equal(res.passed, true);
});

test('evaluateScriptVerification executes exit code 0 script in workspace', async () => {
  const mockDir = await setupMockEnvironment();
  const res = await evaluateScriptVerification(mockDir, 'echo "verification success"');
  assert.equal(res.passed, true);
  assert.match(res.details?.stdout || '', /verification success/);
});

test('outcome evaluation ignores the chosen tool trajectory', async () => {
  const mockDir = await setupMockEnvironment();
  const testCase = {
    id: 'outcome-only',
    name: 'Outcome only',
    category: 'directory_reading' as const,
    prompt: 'List the modules directory.',
    expectedTool: 'list_directory',
    expectedDirectoryEntries: [{ relativePath: 'modules', entries: ['formatter.ts', 'utility.js'] }],
    description: 'Outcome test',
    objective: 'Outcome test',
    requiredOutput: 'Both entries',
    evaluationCriteria: 'Both entries are reported',
  };
  const result = await evaluateBenchmarkTask(
    testCase,
    mockDir,
    [{ name: 'execute_command', args: { command: 'ls modules' } }],
    'formatter.ts\nutility.js',
    [{ name: 'execute_command', result: { stdout: 'formatter.ts\nutility.js', exitCode: 0 } }],
  );
  assert.equal(result.passed, true);
  assert.equal(result.details?.toolTraceUsedForScoring, false);
});

test('outcome evaluation fails a correct tool call with an incorrect final answer', async () => {
  const mockDir = await setupMockEnvironment();
  const testCase = {
    id: 'wrong-outcome',
    name: 'Wrong outcome',
    category: 'file_reading' as const,
    prompt: 'Read the user ID.',
    expectedTool: 'read_file',
    expectedResponseSubstrings: ['9482'],
    description: 'Outcome test',
    objective: 'Outcome test',
    requiredOutput: 'Correct user ID',
    evaluationCriteria: 'Correct user ID is reported',
  };
  const result = await evaluateBenchmarkTask(
    testCase,
    mockDir,
    [{ name: 'read_file', args: { relative_path: 'user_profile.json' } }],
    'The user ID is 1234.',
  );
  assert.equal(result.passed, false);
  assert.match(result.reason, /9482/);
});
