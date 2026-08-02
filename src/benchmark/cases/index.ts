import { describeBenchmarkOutcome } from './describeOutcome.js';
import { DEFAULT_BENCHMARK_CASES } from './suites/default.js';
import { DRAGONBALL_BENCHMARK_CASES } from './suites/dragonball.js';
import { FILE_EDIT_BENCHMARK_CASES } from './suites/fileEdit.js';
import type { BenchmarkTestCase, BenchmarkTestCaseDefinition } from './types.js';

// Register new suites here. Keeping registration explicit makes test ordering stable.
const BENCHMARK_CASE_GROUPS: readonly (readonly BenchmarkTestCaseDefinition[])[] = [
  DEFAULT_BENCHMARK_CASES,
  DRAGONBALL_BENCHMARK_CASES,
  FILE_EDIT_BENCHMARK_CASES,
];

function buildBenchmarkCatalog(
  suites: readonly (readonly BenchmarkTestCaseDefinition[])[],
): BenchmarkTestCase[] {
  const definitions = suites.flat();
  const seenIds = new Set<string>();

  return definitions.map((definition) => {
    if (seenIds.has(definition.id)) throw new Error(`Duplicate benchmark id: ${definition.id}`);
    seenIds.add(definition.id);

    return {
      ...definition,
      ...describeBenchmarkOutcome(definition),
    };
  });
}

export const BENCHMARK_TEST_CASES = buildBenchmarkCatalog(BENCHMARK_CASE_GROUPS);

export { describeBenchmarkOutcome } from './describeOutcome.js';
export { defineBenchmarkCases } from './types.js';
export type { BenchmarkCategory, BenchmarkDefinition, BenchmarkDefinitionType, BenchmarkTestCase, BenchmarkTestCaseDefinition } from './types.js';
