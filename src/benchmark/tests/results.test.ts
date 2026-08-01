import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { deleteSavedBenchmarkRun, listSavedBenchmarkRuns, saveBenchmarkReport } from '../runtime/results.js';
import type { BenchmarkReport, TestResultTrace } from '../types.js';

const timing = {
  imageSetupMs: 10,
  containerStartupMs: 20,
  modelLoadMs: 30,
  promptEvaluationMs: 40,
  generationMs: 50,
  toolExecutionMs: 60,
  verificationMs: 5,
  endToEndWallMs: 250,
  comparisonMs: 150,
  promptTokens: 100,
  generatedTokens: 20,
};

const trace: TestResultTrace = {
  testId: 'portable-result',
  testName: 'Portable result',
  category: 'file_reading',
  prompt: 'Read the result.',
  expectedTool: 'read_file',
  actualToolsCalled: [],
  toolResults: [],
  executionTrace: [],
  passed: true,
  reason: 'Expected result found.',
  durationMs: 125,
  timing,
  attemptNumber: 1,
  attemptCount: 1,
  successfulAttempts: 1,
  failedAttempts: 0,
  successRatePercentage: 100,
  responseContent: 'done',
  objective: 'Verify persistence.',
  requiredOutput: 'A saved run.',
  evaluationCriteria: 'The run is portable.',
  container: { image: 'benchmark:test', isolated: true, workspace: '/workspace' },
  agentConfig: {
    model: 'test/model:1',
    ollamaHost: 'http://127.0.0.1:11434',
    temperature: 0.25,
    systemPrompt: 'Test prompt with </script> content.',
  },
};

const report: BenchmarkReport = {
  benchmark: {
    definitionId: 'portable',
    definitionName: 'Portable benchmark',
    definitionType: 'custom',
    definitionVersion: 1,
    testIds: [trace.testId],
    suiteHash: 'fnv1a-test',
  },
  timestamp: Date.parse('2026-08-01T12:34:56.000Z'),
  runDate: '2026-08-01T12:34:56.000Z',
  model: 'test/model:1',
  mockWorkingDir: '/workspace',
  totalTests: 1,
  passCount: 1,
  failCount: 0,
  accuracyPercentage: 100,
  totalDurationMs: 125,
  attemptsPerCase: 1,
  totalAttempts: 1,
  successfulAttempts: 1,
  failedAttempts: 0,
  successRatePercentage: 100,
  comparisonDurationMs: 150,
  timing,
  results: [trace],
};

test('benchmark reports save as unique, discoverable JSON and standalone HTML bundles', async () => {
  const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'benchmark-results-test-'));
  try {
    const config = { model: report.model, ollamaHost: trace.agentConfig.ollamaHost, temperature: 0.25 };
    const first = await saveBenchmarkReport(report, outputDirectory, config, 'My comparison run');
    const second = await saveBenchmarkReport(report, outputDirectory, config);

    assert.notEqual(first.runId, second.runId);
    assert.match(first.runId, /my-comparison-run/);
    assert.equal(first.runName, 'My comparison run');
    assert.equal(first.runDate, report.runDate);

    const bundle = JSON.parse(await fs.readFile(first.reportPath, 'utf8'));
    assert.equal(bundle.schemaVersion, 1);
    assert.equal(bundle.runName, 'My comparison run');
    assert.equal(bundle.modelConfig.temperature, 0.25);
    assert.equal(bundle.modelConfig.systemPrompt, trace.agentConfig.systemPrompt);
    assert.equal(bundle.report.results[0].testId, trace.testId);
    assert.equal(bundle.report.benchmark.definitionName, 'Portable benchmark');
    assert.equal(bundle.report.successRatePercentage, 100);
    assert.equal(bundle.report.comparisonDurationMs, 150);
    assert.deepEqual(bundle.report.timing, timing);

    const html = await fs.readFile(first.htmlPath, 'utf8');
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /application\/json/);
    assert.doesNotMatch(html, /<script[^>]+src=/i);
    assert.doesNotMatch(html, /Test prompt with <\/script>/);

    const discovered = await listSavedBenchmarkRuns(outputDirectory);
    assert.equal(discovered.length, 2);
    assert.equal(discovered[0].accuracyPercentage, 100);
    assert.equal(discovered[0].successRatePercentage, 100);
    assert.equal(discovered[0].comparisonDurationMs, 150);
    assert.equal(discovered[0].benchmark.suiteHash, 'fnv1a-test');
    assert.deepEqual(discovered[0].results.map((result) => result.testId), [trace.testId]);

    assert.equal(await deleteSavedBenchmarkRun(first.runId, outputDirectory), first.directory);
    assert.deepEqual((await listSavedBenchmarkRuns(outputDirectory)).map((run) => run.runId), [second.runId]);
  } finally {
    await fs.rm(outputDirectory, { recursive: true, force: true });
  }
});

test('benchmark deletion rejects paths and non-benchmark directories', async () => {
  const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'benchmark-delete-test-'));
  try {
    await fs.mkdir(path.join(outputDirectory, 'ordinary-folder'));
    await assert.rejects(() => deleteSavedBenchmarkRun('../outside', outputDirectory), /Invalid benchmark run ID/);
    await assert.rejects(() => deleteSavedBenchmarkRun('ordinary-folder', outputDirectory), /not found or its report is invalid/);
    assert.ok((await fs.stat(path.join(outputDirectory, 'ordinary-folder'))).isDirectory());
  } finally {
    await fs.rm(outputDirectory, { recursive: true, force: true });
  }
});

test('missing benchmark output directory is an empty comparison list', async () => {
  const missing = path.join(os.tmpdir(), `missing-benchmark-results-${Date.now()}`);
  assert.deepEqual(await listSavedBenchmarkRuns(missing), []);
});
