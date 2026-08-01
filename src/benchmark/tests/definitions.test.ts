import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { BENCHMARK_TEST_CASES } from '../cases/index.js';
import {
  createBenchmarkDefinition,
  deleteBenchmarkDefinition,
  listBenchmarkDefinitions,
  updateBenchmarkDefinition,
} from '../runtime/definitions.js';

test('benchmark definitions include immutable quick and comprehensive presets', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'benchmark-definitions-test-'));
  try {
    const definitions = await listBenchmarkDefinitions(path.join(directory, 'definitions.json'));
    const quick = definitions.find((definition) => definition.id === 'quick');
    const comprehensive = definitions.find((definition) => definition.id === 'comprehensive');
    assert.equal(quick?.type, 'preset');
    assert.ok((quick?.testIds.length || 0) > 0);
    const byId = new Map(BENCHMARK_TEST_CASES.map((testCase) => [testCase.id, testCase]));
    assert.deepEqual(
      new Set(quick?.testIds.map((id) => byId.get(id)?.category)),
      new Set(BENCHMARK_TEST_CASES.map((testCase) => testCase.category)),
    );
    assert.equal(comprehensive?.testIds.length, BENCHMARK_TEST_CASES.length);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('custom benchmark definitions persist selected tests and increment versions', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'benchmark-definitions-test-'));
  const filePath = path.join(directory, 'definitions.json');
  try {
    const firstTestId = BENCHMARK_TEST_CASES[0].id;
    const secondTestId = BENCHMARK_TEST_CASES[1].id;
    const created = await createBenchmarkDefinition({
      name: 'My focused benchmark',
      description: 'Focused selection',
      testIds: [firstTestId],
    }, filePath);
    assert.equal(created.type, 'custom');
    assert.deepEqual(created.testIds, [firstTestId]);

    const updated = await updateBenchmarkDefinition(created.id, {
      name: 'My focused benchmark',
      description: 'Expanded selection',
      testIds: [firstTestId, secondTestId],
    }, filePath);
    assert.equal(updated.version, 2);
    assert.deepEqual(updated.testIds, [firstTestId, secondTestId]);
    assert.equal((await listBenchmarkDefinitions(filePath)).length, 3);

    await deleteBenchmarkDefinition(created.id, filePath);
    assert.deepEqual((await listBenchmarkDefinitions(filePath)).map((definition) => definition.id), ['quick', 'comprehensive']);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('custom benchmark definitions reject empty, duplicate, and unknown test selections', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'benchmark-definitions-test-'));
  const filePath = path.join(directory, 'definitions.json');
  try {
    const testId = BENCHMARK_TEST_CASES[0].id;
    await assert.rejects(() => createBenchmarkDefinition({ name: 'Empty', testIds: [] }, filePath), /at least one/);
    await assert.rejects(() => createBenchmarkDefinition({ name: 'Duplicate', testIds: [testId, testId] }, filePath), /duplicate/);
    await assert.rejects(() => createBenchmarkDefinition({ name: 'Unknown', testIds: ['not-a-test'] }, filePath), /Unknown/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
