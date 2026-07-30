# 🤖 Local Model Chat — Ollama Agent Studio

A fully local, privacy-first AI coding agent with a **React Web UI**, **interactive CLI**, and a **Node.js REST server** — all powered by [Ollama](https://ollama.com) running on your own hardware.

No cloud, no API keys, no data leaving your machine.

---

## ✨ Features

### 🖥️ Web UI (React + Vite)
- **Live streaming chat** with glassmorphism dark UI
- **Quick prompt chips** — 1-click: List Directory, Read File, Run Terminal Cmd, Edit File, Search Code, Create File
- **Welcome starter grid** — 6 interactive template cards on empty chat sessions
- **🟢 VRAM Loaded Model Badge** — shows which model is hot in GPU VRAM, memory size, quantization level
- **⚡ Loading indicator** — shows while Ollama is loading model weights into VRAM
- **Temperature slider** (0.0–1.0) in the header bar
- **System Prompt editor** modal
- **Remote Ollama connections** — configure an HTTP/HTTPS server URL with an optional bearer token
- **⚙️ Tool Settings modal** — configure terminal approval mode, file edit mode, and toggle individual tools on/off
- **⚠️ Tool Approval Cards** — approve or reject terminal commands inline in the chat before they run
- **Context Inspector sidebar** — view token count, formatted context text, and raw JSON
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
- Configurable temperature, model, working directory, system prompt
- Context window management with token estimation
- Full streaming support via SSE

### 🛠️ Built-in Agent Tools
| Tool | Description |
|---|---|
| `list_directory` | List files and subdirectories in a path |
| `read_file` | Read any file in the workspace |
| `edit_file` | Partial text replacement in existing files |
| `replace_file` | Replace an existing file for broad rewrites after reading it |
| `create_file` | Create new files with content |
| `grep_search` | Search codebase for text/symbols |
| `execute_command` | Run terminal shell commands (with approval gate) |
| `web_search` | Search the public web and return concise result metadata |
| `read_web_page` | Extract a public page's main content as bounded Markdown |

### 🧪 Benchmark Suite
- **42 targeted test cases** across 11 categories:
  - Directory Reading, File Reading, File Creation, File Editing
  - Code Editing, Code Search, Discrimination (no-tool), Multi-Step Workflow
  - **Terminal Execution (Isolated Docker Sandbox)**
  - **Information Retrieval** from short, medium, and long files with grounded-answer checks
- Isolated Docker container sandbox for terminal benchmark tests — no host system risk
- Per-category filter chips in the UI
- CLI category filtering, for example: `npm run cli -- --benchmark --category web_search`

---

## 🏗️ Architecture

```
local-model-chat/
├── src/
│   ├── core/               # Shared engine (agent, tools, context, ollama client)
│   │   ├── agent.ts        # AgentEngine — agentic loop, streaming, tool dispatch
│   │   ├── tools.ts        # Tool definitions + ToolExecutor
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
│   │       │   ├── ToolSettingsModal.tsx # Tool approval & toolset preferences
│   │       │   ├── ContextSidebar.tsx   # Token count, context viewer
│   │       │   ├── BenchmarkView.tsx    # Benchmark dashboard UI
│   │       │   └── SystemPromptModal.tsx
│   │       └── types.ts
│   └── benchmark/          # Benchmark runner + test cases
│       ├── runner.ts       # AgentBenchmarkRunner + Docker sandbox
│       └── testCases.ts    # 42 test cases across 11 categories
├── agent                   # Global CLI wrapper script (bash → local tsx)
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org) v18+
- [Ollama](https://ollama.com) running locally
- A pulled model (e.g. `ollama pull qwen2.5-coder:7b`)
- Docker (optional, for terminal benchmark sandbox)

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
  -m, --model <name>       Ollama model name         (default: qwen2.5-coder:7b)
  -t, --temperature <val>  Temperature 0.0–1.0       (default: 0.2)
  -h, --host <url>         Ollama host URL            (default: http://127.0.0.1:11434)
  --token <token>          Optional bearer token      (or set OLLAMA_TOKEN)
  -d, --dir <path>         Working directory           (default: cwd)
  -y, --auto-approve       Skip terminal cmd confirmation
  -s, --system <prompt>    Custom system prompt
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
| `/dir <path>` | Change working directory |
| `/clear` | Clear conversation history |
| `/help` | Show all slash commands |

---

## 🔒 Terminal Execution Safety

Shell command execution (`execute_command` tool) has a built-in approval gate:

| Mode | Behaviour |
|---|---|
| **Default (Confirm)** | CLI shows `[y/n/a]` prompt; Web UI shows Approve/Reject card |
| **Auto-Approve** | CLI `-y` flag; Web UI Tool Settings → Auto-Approve |
| **Benchmark** | Commands run inside an isolated Docker `alpine` container — zero host risk |

---

## 🧪 Benchmark

Run from the Web UI → **Benchmark** tab, or via the server API:

```bash
# Run full suite via API
curl -X POST http://localhost:3001/api/benchmark/run

# Run single test
curl -X POST http://localhost:3001/api/benchmark/run-single \
  -H "Content-Type: application/json" \
  -d '{"testId": "dir_read_1", "model": "qwen2.5-coder:7b"}'
```

**Latest `qwen2.5-coder:7b` targeted run:** web search 3/3. Local-model results can vary between runs.

---

## 🔧 REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/models` | List installed Ollama models |
| `GET` | `/api/models/running` | Get models currently loaded in VRAM |
| `GET` | `/api/config` | Get current agent configuration |
| `POST` | `/api/config` | Update model, temperature, working dir, system prompt |
| `GET` | `/api/tools` | List available agent tools |
| `GET` | `/api/context` | Get full context window info |
| `GET` | `/api/messages` | Get stored conversation messages for UI restoration |
| `POST` | `/api/clear` | Clear conversation history |
| `POST` | `/api/chat` | Send message (SSE stream) |
| `POST` | `/api/chat/tool-approval` | Approve or reject pending tool execution |
| `POST` | `/api/chat/tool-settings` | Update terminal approval mode |
| `GET` | `/api/benchmark/testcases` | List all benchmark test cases |
| `POST` | `/api/benchmark/run` | Run full benchmark suite |
| `POST` | `/api/benchmark/run-single` | Run single benchmark test |

---

## 🧩 Tech Stack

| Layer | Technology |
|---|---|
| **LLM Runtime** | [Ollama](https://ollama.com) (local, any model) |
| **Agent Core** | TypeScript, custom agentic loop |
| **Backend** | Node.js, Express, Server-Sent Events |
| **Frontend** | React 18, Vite, Lucide icons, Vanilla CSS |
| **CLI** | Commander.js, Chalk, Readline |
| **Benchmark Sandbox** | Docker (`alpine`) |
| **Type Safety** | TypeScript strict mode throughout |

---

## 📄 License

MIT
