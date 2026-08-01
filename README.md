# 🤖 Local Model Chat — Ollama Agent Studio

A fully local, privacy-first AI coding agent with a **React Web UI**, **interactive CLI**, and a **Node.js REST server** — all powered by [Ollama](https://ollama.com) running on your own hardware.

No cloud, no API keys, no data leaving your machine.

---

## ✨ Features

### 🖥️ Web UI (React + Vite)
- **Live streaming chat** with glassmorphism dark UI
- **Drag-and-drop text attachments** — send up to 10 text files with a prompt and ask the model about their contents
- **Quick prompt chips** — 1-click: List Directory, Read File, Run Terminal Cmd, Edit File, Search Code, Create File
- **Welcome starter grid** — 6 interactive template cards on empty chat sessions
- **🟢 VRAM Loaded Model Badge** — shows which model is hot in GPU VRAM, memory size, quantization level
- **⚡ Loading indicator** — shows while Ollama is loading model weights into VRAM
- **Temperature slider** (0.0–1.0) in the header bar
- **System Prompt editor** modal
- **Optional project context** — send a bounded file list, package metadata, `.agent/AGENTS.md`, and on-demand project skill metadata to the model
- **Working-directory picker** — browse server-local folders and remember the selected project per browser
- **Remote Ollama connections** — configure an HTTP/HTTPS server URL with an optional bearer token
- **⚙️ Categorized Tool Settings modal** — grouped controls for 🛠️ Developer Tools, 📁 File System, 🌐 Web Research, and 🐚 Terminal Tools with group master toggles and individual switches
- **🎯 Tool Complexity Profiles (`simple` | `medium` | `advanced`)** — tailor tool schema complexity sent to Ollama models based on model size (3B–8B, 14B–32B, 70B+), preventing small-model parameter hallucinations while unlocking advanced options for large models
- **🎨 Color-Coded Tool Inspector (`ℹ`)** — inspect exact prompt descriptions and syntax color-coded JSON parameter schemas in real time
- **⚠️ Tool Approval Cards** — approve or reject terminal commands inline in the chat before they run
- **Context Inspector sidebar** — view token count, formatted context text, and raw JSON
- **Workdir context preview** — inspect and copy the exact current project snapshot appended to model requests
- **Tool call cards** — live display of every tool invocation and result in chat
- **Benchmark dashboard** — run agent tool tests with per-category filtering

### 🖱️ CLI (`agent` command)
- **Interactive REPL mode** — full conversation loop with tool output display
- **Single-shot mode** — `agent "list all files"` executes and exits
- **Terminal command confirmation** (default) — CLI pauses and asks `[y] Accept / [n] Reject / [a] Accept All` before running shell commands
- **Auto-approve mode** — `agent -y "run nvidia-smi"` skips confirmation entirely
- **Slash commands**: `/models`, `/model`, `/context`, `/json`, `/sys`, `/dir`, `/clear`, `/help`
- **Global command** — runs via `npm link` from any terminal directory, always from latest TypeScript source

### 🧠 Core Agent Engine
- Agentic multi-turn loop with automatic tool call parsing and execution
- **Language-Aware AST & LSP Developer Tools Engine** powered by the TypeScript Compiler API for in-process structural code navigation and type checking
- Configurable temperature, model, working directory, system prompt, tool complexity profiles, and automatic project context
- Context window management with token estimation
- Full streaming support via SSE

### 🛠️ Built-in Agent Tools

| Category | Tool | Description |
|---|---|---|
| 🛠️ **Developer Tools (AST & LSP)** | `get_document_symbols` | Get structural AST outline (classes, functions, interfaces, methods) with line numbers |
| | `go_to_definition` | Jump from a symbol usage to its exact declaration line & column |
| | `find_symbol_references` | Locate all occurrences and usage locations of a symbol across workspace files |
| | `get_code_diagnostics` | Fetch compiler errors, warnings, and type diagnostics for a file or workspace |
| | `get_type_hover` | Inspect type signatures, return types, and docstrings hover info for a symbol |
| | `map_module_dependencies` | Map import/export module dependencies and caller files without reading raw code text |
| 📁 **File System Tools** | `list_directory` | List files and subdirectories in a target directory |
| | `read_file` | Read the raw contents of any file in the workspace |
| | `edit_file` | Partial text replacement in existing files |
| | `replace_file` | Replace an existing file for broad rewrites after reading it |
| | `create_file` | Create new text or code files |
| | `grep_search` | Advanced codebase search with regex, case-sensitivity, whole word boundaries (`\b`), context lines (`context_lines`), result limits (`max_results`), and match highlighting (`>>>match<<<`) |
| | `grep_replace` | Multi-file batch search and replace (Grep + Sed combo) with `dry_run: true` preview support |
| 🌐 **Web Research Tools** | `web_search` | Search the public web and return concise result metadata |
| | `read_web_page` | Extract a public page's main content as bounded Markdown |
| 🐚 **Terminal Tools** | `execute_command` | Run terminal shell commands (with approval gate & whitelist) |

---

## 🎯 Tool Complexity Profiles (`simple` | `medium` | `advanced`)

Small local models (3B–8B parameters) perform best with short, 2-parameter tool schemas, while larger models (14B–70B+) thrive with advanced options. 

The **Tool Complexity Profile** selector allows matching schema complexity to your active Ollama model:

```
[ 🟢 Simple ]    [ 🟡 Medium ]    [ 🟣 Advanced ]
```

- 🟢 **Simple Profile** *(Default for 3B–8B models)*: Sends minimal 2-parameter schemas (e.g. `query`, `relative_path` for `grep_search`). Prevents parameter hallucinations and guarantees high tool invocation accuracy.
- 🟡 **Medium Profile** *(For 14B–32B models)*: Unlocks `is_regex`, `case_sensitive`, and `file_pattern` parameters.
- 🟣 **Advanced Profile** *(For 70B+ / Cloud models)*: Unlocks full schemas including `whole_word` (`\b`), `context_lines` (0–5 lines), `max_results` pagination, `highlight_match`, and `dry_run`.

*Note: Only **one single schema version** of each tool is loaded into the model context at any time.*

---

## 🏗️ Architecture

```
local-model-chat/
├── src/
│   ├── core/               # Shared engine (agent, tools, lsp, context, ollama client)
│   │   ├── agent.ts        # AgentEngine — agentic loop, streaming, tool dispatch
│   │   ├── lsp.ts          # LspManager — TypeScript Compiler API AST & LSP engine
│   │   ├── tools.ts        # Tool definitions, complexity profiles + ToolExecutor
│   │   ├── context.ts      # ContextManager — system prompt, message history
│   │   ├── ollama.ts       # OllamaClient — chat stream, model list, VRAM status
│   │   └── types.ts        # Shared TypeScript interfaces
│   ├── server/             # Express REST + SSE server
│   │   └── index.ts        # /api/chat (SSE), /api/config, /api/tools, /api/benchmark, /api/chat/tool-approval
│   ├── cli/                # Interactive terminal CLI
│   │   └── index.ts        # Commander CLI + readline REPL + confirmation prompt
│   ├── client/             # React + Vite Web UI
│   │   └── src/
│   │       ├── App.tsx                  # Root app, SSE consumer, state
│   │       ├── components/
│   │       │   ├── Header.tsx           # Model selector, VRAM badge, temp slider, tool settings btn
│   │       │   ├── ChatWindow.tsx       # Messages, approval cards, quick prompt chips
│   │       │   ├── ToolSettingsModal.tsx # Grouped tool controls, complexity selector & inspector
│   │       │   ├── ContextSidebar.tsx   # Token count, context viewer
│   │       │   ├── BenchmarkView.tsx    # Benchmark dashboard UI
│   │       │   └── SystemPromptModal.tsx
│   │       └── types.ts
│   └── benchmark/          # Extensible benchmark framework
│       ├── cases/          # Typed suites + explicit registry
│       ├── evaluation/     # Outcome-based verifiers
│       ├── fixtures/       # Disposable workspace fixtures
│       ├── runtime/        # Docker runner + container worker
│       └── tests/          # Benchmark framework tests
├── agent                   # Global CLI wrapper script (bash → local tsx)
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org) v18+
- [Ollama](https://ollama.com) running locally
- A pulled model (e.g. `ollama pull qwen2.5-coder:7b`)
- Docker (required for benchmarks; each test runs in a fresh container)

### Install
```bash
git clone <repo>
cd local-model-chat
npm install
```

### Run the Web UI
```bash
# Terminal 1: Start the backend server
npm run dev:server

# Terminal 2: Start the frontend dev server
npm run dev:client
```

Then open **http://localhost:5173** in your browser.

### Run the CLI
```bash
# Interactive REPL
npm run cli

# Single-shot prompt
npm run cli -- "list all files in working directory"

# Auto-approve terminal commands
npm run cli -- -y "check my GPU"
```

### Set up the global `agent` command
```bash
npm link
```

After linking, use `agent` from **any terminal directory**:
```bash
agent                                         # interactive mode
agent "read package.json"                     # single-shot
agent -y "run nvidia-smi"                     # auto-approve terminal
agent -m qwen2.5-coder:14b "explain tools.ts" # different model
agent -d /path/to/project                     # custom working dir
agent --help                                  # show all options
```

> The wrapper always runs directly from the TypeScript source — **any code change takes effect immediately**, no compilation step required.

---

## ⚙️ CLI Options

```
Usage: agent [options] [prompt]

Arguments:
  prompt                   Optional single-shot prompt (executes and exits)

Options:
  -m, --model <name>       Ollama model name         (default: qwen3.5:9b)
  -t, --temperature <val>  Temperature 0.0–1.0       (default: 0.2)
  -h, --host <url>         Ollama host URL            (default: http://127.0.0.1:11434)
  --token <token>          Optional bearer token      (or set OLLAMA_TOKEN)
  -d, --dir <path>         Working directory           (default: cwd)
  --workdir-info           Include project info, .agent instructions and skills
  --tool-profile <name>    Tool schema: simple, medium, or advanced
  --no-pruning             Disable automatic context pruning
  --no-prune-superseded-reads
  --no-invalidate-on-mutation
  --no-tool-ttl
  --terminal-ttl <turns>   Terminal-output context lifetime
  --web-ttl <turns>        Web-output context lifetime
  -y, --auto-approve       Skip terminal cmd confirmation
  -s, --system <prompt>    Custom system prompt
  -b, --benchmark          Run benchmark mode
  -c, --category <name>    Run one benchmark category
  --test <id-or-number>    Run one benchmark scenario
  --attempts <count>       Reliability attempts per case, 3–10 (default: 3)
  --help                   Show help
```

### CLI Slash Commands (interactive mode)
| Command | Description |
|---|---|
| `/models` | List available Ollama models |
| `/model <name>` | Switch active model |
| `/context` | Show formatted context window |
| `/json` | Show raw JSON context |
| `/sys <prompt>` | Update system prompt |
| `/workdir-info [on\|off]` | View or toggle automatic project context |
| `/tool-profile [simple\|medium\|advanced]` | View or change the active tool schema |
| `/pruning [setting] [value]` | View or change context-pruning and TTL settings |
| `/dir <path>` | Change working directory |
| `/clear` | Clear conversation history |
| `/help` | Show all slash commands |

---

## 🔒 Terminal Execution Safety

Shell command execution (`execute_command` tool) has a built-in approval gate and command whitelist:

| Mode | Behaviour |
|---|---|
| **Default (Confirm)** | CLI shows `[y/n/a]` prompt; Web UI shows Approve/Reject card |
| **Command Whitelist** | Whitelisted commands (e.g. `ls`, `pwd`, `git status`) execute without prompting |
| **Auto-Approve** | CLI `-y` flag; Web UI Tool Settings → Auto-Approve |
| **Benchmark** | The complete agent attempt, all tools, fixture, and verifier run in one fresh Docker container per test |

---

## 🧪 Benchmark Suite

Run from the Web UI → **Benchmark** tab, or via CLI:

```bash
# Run one scenario by its number within a category
npm run cli -- --benchmark --category web_search --test 4 --attempts 5

# Run AST/LSP code navigation test
npm run cli -- --benchmark --test test_ast_document_symbols

# Run full suite via API
curl -X POST http://localhost:3001/api/benchmark/run
```

- **47 outcome-based test cases** across 13 categories including AST/LSP navigation, information retrieval, terminal execution, project context, and web research.
- Every case uses a configurable reliability profile of 3–10 fresh attempts (default: 3). Reports show per-case and overall success rates and retain every attempt trace.
- Timing is split into image/setup, container startup, model load, prompt evaluation, generation, tool execution, verification, and end-to-end wall time. Model rankings compare only the average per-attempt prompt evaluation + generation + tool execution time.
- Pass/fail is determined from final answers, command results, or final workspace state—not from matching a prescribed tool call.
- Results retain assistant thinking, tool arguments, tool results, and their ordered execution trace for diagnosis.
- The Benchmark tab starts with the current agent configuration and supports run-only overrides for attempts per case, model, Ollama URL, temperature, context size, tool-loop limit, thinking, project context, tool-schema profile, and system prompt.
- The benchmark image is built automatically once per server/CLI process and reused. Build it manually with `npm run benchmark:image` if desired.
- On Linux, benchmark containers use host networking so the configured Ollama endpoint `http://127.0.0.1:11434` remains reachable unchanged.
- See [`src/benchmark/README.md`](src/benchmark/README.md) for the short guide and template for adding a benchmark suite.

---

## 🔧 REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/models` | List installed Ollama models |
| `GET` | `/api/models/running` | Get models currently loaded in VRAM |
| `GET` | `/api/config` | Get current agent configuration |
| `POST` | `/api/config` | Update model, temperature, working dir, system prompt, project context |
| `GET` | `/api/tools` | List available agent tools |
| `GET` | `/api/context` | Get full context window info |
| `GET` | `/api/context/workdir` | Preview the exact dynamic workdir context |
| `GET` | `/api/messages` | Get stored conversation messages for UI restoration |
| `POST` | `/api/clear` | Clear conversation history |
| `POST` | `/api/chat` | Send message (SSE stream) |
| `POST` | `/api/chat/tool-approval` | Approve or reject pending tool execution |
| `POST` | `/api/chat/tool-settings` | Update terminal approval & tool complexity settings |
| `GET` | `/api/benchmark/testcases` | List all benchmark test cases |
| `POST` | `/api/benchmark/run` | Run full benchmark suite |
| `POST` | `/api/benchmark/run-single` | Run single benchmark test |

---

## 🧩 Tech Stack

| Layer | Technology |
|---|---|
| **LLM Runtime** | [Ollama](https://ollama.com) (local, any model) |
| **Agent Core** | TypeScript, custom agentic loop |
| **Code Intelligence** | TypeScript Compiler API (AST & LSP engine) |
| **Backend** | Node.js, Express, Server-Sent Events |
| **Frontend** | React 18, Vite, Lucide icons, Vanilla CSS |
| **CLI** | Commander.js, Chalk, Readline |
| **Benchmark Sandbox** | Docker (`alpine`) |
| **Type Safety** | TypeScript strict mode throughout |

---

## 📄 License

MIT
