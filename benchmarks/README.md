# Declarative Benchmark Datasets & Fixtures

This directory contains the declarative benchmark test cases, suite manifests, fixtures, and verifier scripts used by the local model benchmark runner.

## Directory Structure

```text
benchmarks/
├── cases/                      # Individual scenario test JSON definitions
│   ├── default.json            # Core built-in benchmark test cases
│   ├── dragonball.json         # Real-world web search trivia test cases
│   ├── fileEdit.json           # File editing and refactoring test cases
│   └── examples.json           # Example demonstration test cases
├── definitions/                # Grouped benchmark suite manifest JSON files
│   └── sample_suite.json       # Custom benchmark suite definitions
├── fixtures/                   # Disposable workspace environment templates
│   ├── default/                # Comprehensive mock project environment
│   └── sample-node-app/        # Node.js calculator sample app
└── verifiers/                  # Helper verification scripts
    └── sample-calculator-verify.sh
```

## Adding New Test Cases

To add a new benchmark scenario:
1. Add a JSON object to a file in `benchmarks/cases/` (or create a new `.json` file in `benchmarks/cases/`).
2. Specify the scenario `id`, `name`, `category`, `prompt`, and observable outcome verifiers (`expectedFileState`, `expectedFileJson`, `expectedResponseSubstrings`, or `verificationScript`).
3. If mock workspace files are needed, add a template folder under `benchmarks/fixtures/<fixture-name>/`.

## Benchmark Suites

Group test cases into a runnable benchmark suite by adding a JSON manifest under `benchmarks/definitions/`:

```json
{
  "id": "my_custom_suite",
  "name": "My Custom Suite",
  "description": "A custom selection of benchmark test cases.",
  "type": "custom",
  "version": 1,
  "testIds": ["test_read_profile_file", "test_create_file"]
}
```

Both test cases and benchmark definitions added here are automatically picked up by the CLI, REST API, and Web UI.
