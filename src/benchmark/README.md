# Benchmark architecture

## BrowseComp web-search benchmark

The repository includes a standalone runner for OpenAI's BrowseComp benchmark. It
downloads and caches the official encrypted dataset, creates a fresh agent for every
question, requires the agent to invoke `deep_research`, and grades the response with
the official BrowseComp judge prompt through an Ollama model.

Start with a small run:

```bash
npm run benchmark:browsecomp -- --model qwen3.5:9b --count 20
```

When the app server is running on `http://127.0.0.1:3001`, each question is
created as an isolated chat session and the CLI prints a link immediately. Open
that link to follow thinking tokens, answer tokens, tool calls, research phases,
and tool results live in the normal chat UI. For a Vite development client, set
its browser-facing origin separately:

```bash
npm run benchmark:browsecomp -- \
  --model qwen3.5:9b \
  --host http://127.0.0.1:11435 \
  --count 1 \
  --ui-server http://127.0.0.1:3001 \
  --ui-url http://127.0.0.1:3000
```

If the app server is unavailable, the runner reports that live observation is
disabled and falls back to its direct execution path. Pass `--no-ui-session` to
select direct execution explicitly.

To test the model's own iterative browsing loop without the bundled
`deep_research` orchestration tool, pass `--no-deep-research` (or its
`--no-deep-search` alias). This disables `deep_research` and enables
`web_search` plus `read_web_page`:

```bash
npm run benchmark:browsecomp -- \
  --model qwen3.6:latest \
  --host http://127.0.0.1:11435 \
  --context-window 65536 \
  --max-loops 0 \
  --no-thinking \
  --no-deep-research \
  --web-search-ttl 0 \
  --count 1
```

`--web-search-ttl 0` disables expiry of `web_search`, `read_web_page`, and
`deep_research` outputs. `--disable-web-ttl` is an equivalent shorthand.

To grade a manual answer for one deterministically selected task, use
`--manual-answer`. This skips agent generation and all web tools, invokes only
the configured Ollama judge, and labels the result's retrieval mode as `manual`:

```bash
npm run benchmark:browsecomp -- \
  --grader-model qwen3.6:latest \
  --host http://127.0.0.1:11435 \
  --count 1 \
  --seed 1 \
  --manual-answer "First Last"
```

Useful options include `--grader-model`, `--seed`, `--concurrency`, `--no-thinking`,
`--ui-server`, `--ui-url`, `--dataset`, and `--output`. Run with `--help` for the complete list. To continue an
interrupted run, reuse its output path and configuration:

```bash
npm run benchmark:browsecomp -- \
  --model qwen3.5:9b \
  --count 20 \
  --output benchmark_runs/browsecomp/my-run.jsonl \
  --resume
```

The JSONL file is checkpointed after every question. A neighboring
`.summary.json` file reports accuracy, failures, judge parse failures, and average
duration. Saved records include candidate responses, tool statistics, source URLs,
and token/timing metrics, but never decrypted reference answers or question text.

The default subset shuffle is deterministic for this runner, but it is not Python's
`random.Random(0)` ordering used by `simple-evals`. Use the complete 1,266-question
set when comparing a score directly with published full-dataset results.

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

Suite and individual-case runs execute each selected case 1–10 times in independent
containers (default: 3). A one-attempt run is useful for a quick check; selecting the
maximum displays a warning because it can consume significant time and compute. The success rate is successful attempts divided by total
attempts. A case is marked fully reliable only when every configured attempt passes.
Attempts run sequentially by default. Run parallelism can be set from 1–10 to execute
that many attempts concurrently in independent containers.

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
