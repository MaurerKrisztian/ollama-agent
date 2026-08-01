import { describeBenchmarkOutcome } from './describeOutcome.js';
import { DEFAULT_BENCHMARK_SUITE } from './suites/default.js';
import type { BenchmarkTestCase, BenchmarkTestCaseDefinition } from './types.js';

// Register new suites here. Keeping registration explicit makes test ordering stable.
const BENCHMARK_SUITES: readonly (readonly BenchmarkTestCaseDefinition[])[] = [
  DEFAULT_BENCHMARK_SUITE,
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

export const BENCHMARK_TEST_CASES = buildBenchmarkCatalog(BENCHMARK_SUITES);

export { describeBenchmarkOutcome } from './describeOutcome.js';
export { defineBenchmarkSuite } from './types.js';
export type { BenchmarkCategory, BenchmarkTestCase, BenchmarkTestCaseDefinition } from './types.js';
