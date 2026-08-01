# Benchmark architecture

The benchmark code is split by responsibility:

```text
benchmark/
├── cases/                   # Scenario definitions and the suite registry
│   ├── suites/              # One module per benchmark suite
│   ├── describeOutcome.ts   # Generates user-facing pass criteria
│   ├── index.ts             # Registers suites and builds the catalog
│   └── types.ts             # Case schema and defineBenchmarkSuite helper
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
import { defineBenchmarkSuite } from '../types.js';

export const MY_BENCHMARK_SUITE = defineBenchmarkSuite([
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
