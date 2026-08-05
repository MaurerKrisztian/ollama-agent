import { describeBenchmarkOutcome } from './describeOutcome.js';
import { loadDeclarativeBenchmarkCases } from './loader.js';
import type { BenchmarkTestCase, BenchmarkTestCaseDefinition } from './types.js';

// All benchmark cases are loaded dynamically from declarative JSON files in the root `benchmarks/cases/` directory.
const BENCHMARK_CASE_GROUPS: readonly (readonly BenchmarkTestCaseDefinition[])[] = [
  loadDeclarativeBenchmarkCases(),
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
