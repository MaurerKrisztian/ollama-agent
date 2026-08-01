# Benchmark architecture

The benchmark code is split by responsibility:

```text
benchmark/
├── cases/                   # Scenario definitions and the suite registry
│   ├── suites/              # One module per benchmark suite
│   ├── describeOutcome.ts   # Generates user-facing pass criteria
│   ├── benchmarks.ts        # Quick/comprehensive preset definitions
│   ├── index.ts             # Registers case groups and builds the catalog
│   └── types.ts             # Test-case and benchmark-definition schemas
├── evaluation/              # Outcome verifiers
├── fixtures/                # Disposable workspace setup
├── runtime/                 # Docker runner and container entry point
├── tests/                   # Benchmark framework tests
└── types.ts                 # Runtime/report types
```

## Add a benchmark

1. Add a suite module under `cases/suites/` (or append to an existing suite).
2. Register a new suite once in `cases/index.ts`.
3. Add any files the scenario needs to `fixtures/mockEnvironment.ts`.
4. Run `npm test` and `npm run typecheck`.

Minimal suite module:

```ts
import { defineBenchmarkCases } from '../types.js';

export const MY_BENCHMARK_CASES = defineBenchmarkCases([
  {
    id: 'test_read_service_version',
    name: 'Read service version',
    category: 'file_reading',
    prompt: 'Read package.json and report its version.',
    expectedResponseSubstrings: ['2.0.0'],
    description: 'Checks version discovery from a workspace file.',
    objective: 'Test targeted file reading.',
  },
]);
```

Outcome descriptions are generated from the configured verifiers. Every case must
define at least one observable verifier, such as `expectedResponseSubstrings`,
`expectedFileState`, `expectedDirectoryEntries`, `expectedToolResults`,
`expectedFileJson`, or `verificationScript`.

IDs must be unique across all registered suites. The registry checks this at startup.

## Benchmark definitions

A benchmark definition is a named, ordered selection of existing test IDs. The Web UI
ships with two immutable definitions: **Quick Benchmark**, which contains one
representative case for every category, and **Comprehensive Benchmark**, which contains
the complete catalog. Custom definitions can be created, edited, and deleted in the
runner. They are persisted in `benchmark_runs/definitions.json` and are independent of
saved run reports.

Each completed report contains a snapshot of the definition name, version, test IDs,
and suite hash. Rankings are scoped to a matching suite hash, and the UI prevents
per-test comparisons across different test selections.

## Reliability and timing

Suite and individual-case runs execute each selected case 3–10 times in independent
containers (default: 3). The success rate is successful attempts divided by total
attempts. A case is marked fully reliable only when every configured attempt passes.

Reports retain image/setup, container startup, model load, prompt evaluation,
generation, tool execution, verification, and end-to-end wall time. Rankings use
only the average per-attempt comparison time: prompt evaluation + generation + tool execution. Ollama's
native response metrics provide model load, prompt evaluation, generation, and token
counts; the remaining phases use wall-clock measurements.

## Saved runs

Completed suite runs are saved by default under `benchmark_runs/` in the detected
project installation root. This path is resolved at runtime, so another clone or
computer automatically uses its own project path. The Web UI can select a custom
server-local output directory or disable saving for a run. Each run
uses a unique, date-prefixed directory:

```text
benchmark_runs/
└── 2026-08-01_12-34-56-000-model-name-optional-run-name-abc123/
    ├── report.json   # Versioned, machine-readable result and effective model config
    └── index.html    # Self-contained report; no server or external assets required
```

`report.json` uses the current `BenchmarkRunBundle` schema from `benchmark/types.ts` and
includes `schemaVersion`, `runId`, the optional friendly `runName`, an ISO `runDate`, the effective `modelConfig`,
and the complete benchmark report and traces. The runner's **Compare & top list**
tab discovers these bundles from the selected output directory.
