import type { Request, Response, NextFunction } from 'express';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const express: typeof import('express') = require('express');
const cors: typeof import('cors') = require('cors');
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';
import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { Server as SocketIOServer } from 'socket.io';
import { AgentEngine } from '../core/agent.js';
import type { AgentSendMessageOptions } from '../core/agent.js';
import { ContextManager } from '../core/context.js';
import { BUILTIN_TOOLS, TOOL_DEFINITIONS, TOOL_GROUP_METADATA } from '../core/tools.js';
import type { FileDiff } from '../core/tools/fileTools.js';
import { BENCHMARK_TEST_CASES } from '../benchmark/cases/index.js';
import { createBenchmarkSuiteHash } from '../benchmark/cases/benchmarks.js';
import type { BenchmarkDefinition, BenchmarkTestCase } from '../benchmark/cases/index.js';
import { runBenchmarkCase, runBenchmarkSuite, BENCHMARK_DOCKER_IMAGE } from '../benchmark/runtime/runner.js';
import {
  DEFAULT_BENCHMARK_OUTPUT_DIR,
  BENCHMARK_PROJECT_ROOT,
  deleteSavedBenchmarkRun,
  listSavedBenchmarkRuns,
  saveBenchmarkReport,
} from '../benchmark/runtime/results.js';
import {
  createBenchmarkDefinition,
  deleteBenchmarkDefinition,
  getBenchmarkDefinition,
  listBenchmarkDefinitions,
  resolveBenchmarkTests,
  updateBenchmarkDefinition,
} from '../benchmark/runtime/definitions.js';
import type { BenchmarkAgentConfig, BenchmarkSnapshot } from '../benchmark/types.js';
import { isCommandWhitelisted, DEFAULT_COMMAND_WHITELIST } from '../core/commandWhitelist.js';
import { handleOpenAiChatCompletions, handleOpenAiModels } from './openaiAdapter.js';
import { ChatSessionStore } from './chatSessions.js';
import {
  formatProjectSkillList,
  listProjectSkills,
  loadProjectSkill,
  parseSkillReferences,
} from '../core/skills.js';

import fsSync from 'node:fs';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: true, credentials: true },
});
const PORT = process.env.PORT || 3012;

import {
  CONFIG_FILE_PATH,
  CHAT_SESSIONS_DIR,
  CHAT_SESSIONS_FILE_PATH,
  getInitialPersistedConfig,
  savePersistedConfig,
  BUILTIN_PROFILES,
  detectLiveOllamaDaemonEnv,
} from './configStore.js';

app.use(cors());
app.use(express.json({ limit: '25mb' }));

const initialConfig = getInitialPersistedConfig();

// Initialize shared Agent Engine
const agent = new AgentEngine({
  model: initialConfig.model,
  classifierModel: initialConfig.classifierModel,
  ollamaHost: initialConfig.ollamaHost,
  ollamaToken: initialConfig.ollamaToken,
  workingDir: initialConfig.workingDir,
  enableThinking: initialConfig.enableThinking,
  preventRepeatedCalls: initialConfig.preventRepeatedCalls,
  complexityProfile: initialConfig.complexityProfile,
  enabledTools: initialConfig.enabledTools,
  maxLoops: initialConfig.maxLoops,
  temperature: initialConfig.temperature,
  contextWindow: initialConfig.contextWindow,
  systemPrompt: initialConfig.systemPrompt,
  showWorkingDirInfo: initialConfig.showWorkingDirInfo,
  pruningConfig: initialConfig.pruningConfig,
  terminalGuiMode: initialConfig.terminalGuiMode,
  customTerminalCmd: initialConfig.customTerminalCmd,
});

const chatSessions = new ChatSessionStore(CHAT_SESSIONS_DIR, CHAT_SESSIONS_FILE_PATH);
agent.getContextManager().setMessages(chatSessions.getActive().messages);

type ChatRuntime = { engine: AgentEngine; ready: Promise<void> };
const chatRuntimes = new Map<string, ChatRuntime>();

// The original engine is also the authoritative source for global configuration
// endpoints. Its chat session can be deleted, which removes it from chatRuntimes,
// so global settings must not rely on the runtime map containing it.
function getConfigurableEngines(): AgentEngine[] {
  return [...new Set([agent, ...[...chatRuntimes.values()].map(({ engine }) => engine)])];
}

// GET /api/skills - List valid workspace and application-bundled skills
app.get('/api/skills', async (_req, res) => {
  try {
    res.json({ skills: await listProjectSkills(agent.getConfig().workingDir) });
  } catch (err: any) {
    res.status(500).json({ skills: [], error: err.message });
  }
});

// GET /api/skills/:name - Get full skill content including instructions
app.get('/api/skills/:name', async (req, res) => {
  const name = req.params.name;
  if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    return res.status(400).json({ error: 'Invalid skill name.' });
  }
  try {
    const skill = await loadProjectSkill(agent.getConfig().workingDir, name);
    if (!skill) {
      return res.status(404).json({ error: `Skill "${name}" not found.` });
    }
    res.json({ success: true, skill });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/skills/:name/raw - Get raw SKILL.md content for a skill
app.get('/api/skills/:name/raw', async (req, res) => {
  const name = req.params.name;
  if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    return res.status(400).json({ error: 'Invalid skill name.' });
  }
  try {
    const skill = await loadProjectSkill(agent.getConfig().workingDir, name);
    if (!skill) {
      return res.status(404).json({ error: `Skill "${name}" not found.` });
    }
    res.json({ success: true, content: skill.instructions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function createChatRuntime(sessionId: string, existingEngine?: AgentEngine): ChatRuntime {
  const session = chatSessions.getSession(sessionId);
  if (!session) throw new Error('Chat session not found.');
  const engine = existingEngine || new AgentEngine({
    ...agent.getConfig(),
    ollamaToken: agent.getOllamaToken(),
  });
  engine.getContextManager().setMessages(session.messages);
  const ready = engine.loadMcpConfig().then(() => undefined).catch(() => undefined);
  const runtime = { engine, ready };
  chatRuntimes.set(sessionId, runtime);
  return runtime;
}

function getChatRuntime(sessionId: string): ChatRuntime {
  return chatRuntimes.get(sessionId) || createChatRuntime(sessionId);
}

createChatRuntime(chatSessions.getActiveId(), agent);

let terminalRequireConfirm = initialConfig.terminalMode === 'confirm';
let fileEditMode: 'confirm' | 'auto' | 'batch' = initialConfig.fileEditMode;
let allowedCommandsState: string[] = initialConfig.allowedCommands;

// ----- Checkpoint system -----
type FileSnapshot = { path: string; before: string | null };
type CheckpointEntry = {
  promptId: string;
  promptText: string;
  timestamp: number;
  snapshots: FileSnapshot[];
};
const sessionCheckpoints = new Map<string, CheckpointEntry[]>(); // sessionId -> entries

const getPublicConfig = () => {
  const liveEnv = detectLiveOllamaDaemonEnv();
  return {
    ...agent.getConfig(),
    ...liveEnv,
    ollamaTokenConfigured: agent.hasOllamaToken(),
    terminalMode: terminalRequireConfirm ? 'confirm' : 'auto',
    fileEditMode,
    allowedCommands: allowedCommandsState,
  };
};

const getPublicConfigAsync = async () => {
  const cfg = agent.getConfig();
  const supportsThinking = await agent.checkModelThinkingSupport(cfg.model);
  const effectiveThinking = (cfg.enableThinking !== false) && supportsThinking;
  const supportsNativeTools = await agent.checkModelToolSupport(cfg.model);
  const toolMode = supportsNativeTools ? 'native' : 'prompt_fallback';
  return {
    ...getPublicConfig(),
    supportsThinking,
    effectiveThinking,
    supportsNativeTools,
    toolMode,
  };
};

type ApprovalDecisionPayload = { decision: 'approve' | 'reject'; reason?: string };
const pendingApprovalResolves = new Map<string, (payload: ApprovalDecisionPayload) => void>();
const activeGenerationControllers = new Map<string, AbortController>();
type ActiveToolState = {
  name: string;
  args: Record<string, any>;
  progress?: any;
};
const activeToolStates = new Map<string, ActiveToolState>();

const saveChatSession = (sessionId: string, engine: AgentEngine = getChatRuntime(sessionId).engine) =>
  chatSessions.save(sessionId, engine.getContextManager().getMessages());
const getSessionContext = (sessionId: string) => {
  const session = chatSessions.getSession(sessionId);
  if (!session) return undefined;
  // Use the live session agent's ContextManager (which holds the actual Ollama prompt token count)
  // instead of creating a throwaway ContextManager that would lose lastActualPromptTokens.
  const runtime = chatRuntimes.get(sessionId);
  if (runtime) {
    return runtime.engine.getContextManager().getContextInfo();
  }
  // Fallback for sessions without a live runtime (e.g. inactive sessions listed in sidebar)
  const context = new ContextManager(agent.getConfig().systemPrompt, agent.getActiveTools(), { enabled: false });
  context.setMessages(session.messages);
  return context.getContextInfo();
};
const getChatSessionsState = () => {
  const activeId = chatSessions.getActiveId();
  return {
    sessions: chatSessions.list(),
    activeSessionId: activeId,
    isGenerating: activeGenerationControllers.has(activeId),
    activeGenerationsCount: activeGenerationControllers.size,
    activeToolState: activeToolStates.get(activeId) || null,
  };
};

const broadcastChatSessions = () => {
  io.emit('chat:sessions', getChatSessionsState());
};

// ─── Editor API ──────────────────────────────────────────────────────────────

/** Recursively build a lightweight file-tree for the editor panel. */
function buildFileTree(
  dir: string,
  workingDir: string,
  depth = 0,
  maxDepth = 6,
): Array<{ name: string; path: string; type: 'file' | 'dir'; children?: any[] }> {
  if (depth > maxDepth) return [];
  const IGNORE = new Set(['node_modules', 'dist', '.git', '.cache', '__pycache__', '.next', 'coverage', '.nyc_output']);
  let entries: import('node:fs').Dirent[] = [];
  try {
    entries = fsSync.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const result: any[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.agent' && entry.name !== '.env') continue;
    if (IGNORE.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(workingDir, fullPath).replaceAll('\\', '/');
    if (entry.isDirectory()) {
      result.push({ name: entry.name, path: relPath, type: 'dir', children: buildFileTree(fullPath, workingDir, depth + 1, maxDepth) });
    } else {
      result.push({ name: entry.name, path: relPath, type: 'file' });
    }
  }
  // Dirs first, then files — both alphabetically
  result.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return result;
}

// GET /api/editor/tree  — file-tree for the current workingDir (or ?dir=subpath)
app.get('/api/editor/tree', (req, res) => {
  const workingDir = agent.getConfig().workingDir || process.cwd();
  const subDir = typeof req.query.dir === 'string' ? req.query.dir : '';
  const baseDir = subDir ? path.resolve(workingDir, subDir) : workingDir;
  // Security: refuse traversal outside workingDir
  if (!baseDir.startsWith(workingDir)) return res.status(403).json({ success: false, error: 'Access denied.' });
  res.json({ success: true, tree: buildFileTree(baseDir, workingDir), workingDir });
});

// Helper to safely resolve a relative or absolute file path within workingDir
function resolveEditorPath(workingDir: string, inputPath: string): { absPath: string; relPath: string } | null {
  if (!inputPath || typeof inputPath !== 'string') return null;
  const normWorking = path.resolve(workingDir);
  let target = inputPath.trim();

  if (target.startsWith(normWorking)) {
    target = target.slice(normWorking.length);
  } else if (target.startsWith(normWorking.replace(/^[\/\\]+/, ''))) {
    target = target.slice(normWorking.replace(/^[\/\\]+/, '').length);
  }

  target = target.replace(/^(\.\/|\/|\\)+/, '');
  const absPath = path.resolve(normWorking, target);
  if (!absPath.startsWith(normWorking)) return null;
  return { absPath, relPath: target };
}

// GET /api/editor/file?path=<relative>  — read a file
app.get('/api/editor/file', async (req, res) => {
  const workingDir = agent.getConfig().workingDir || process.cwd();
  const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
  const resolved = resolveEditorPath(workingDir, rawPath);
  if (!resolved) return res.status(400).json({ success: false, error: 'Invalid or out-of-bounds path.' });

  try {
    const content = await fs.readFile(resolved.absPath, 'utf-8');
    res.json({ success: true, content, path: resolved.relPath });
  } catch (err: any) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// PUT /api/editor/file  — write a file (snapshots previous content for checkpoint revert)
app.put('/api/editor/file', async (req, res) => {
  const workingDir = agent.getConfig().workingDir || process.cwd();
  const { path: rawPath, content, sessionId: bodySessionId } = req.body ?? {};
  if (!rawPath || content === undefined) return res.status(400).json({ success: false, error: 'Missing path or content.' });
  const resolved = resolveEditorPath(workingDir, rawPath);
  if (!resolved) return res.status(400).json({ success: false, error: 'Invalid or out-of-bounds path.' });

  const { absPath, relPath } = resolved;

  try {
    // Snapshot for checkpoint before overwriting
    let before: string | null = null;
    try { before = await fs.readFile(absPath, 'utf-8'); } catch { before = null; }

    // Ensure parent directory exists
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, content, 'utf-8');

    // Store snapshot in the active session's checkpoint list
    const activeSessionId = chatSessions.getActiveId();
    const sid = bodySessionId || activeSessionId;
    const existing = sessionCheckpoints.get(sid) ?? [];
    const checkpointId = `editor-save-${Date.now()}`;
    const newEntry: CheckpointEntry = {
      promptId: checkpointId,
      promptText: `[Editor] Saved ${relPath}`,
      timestamp: Date.now(),
      snapshots: [{ path: absPath, before }],
    };
    existing.push(newEntry);
    sessionCheckpoints.set(sid, existing);
    // Notify all clients about the new checkpoint
    io.emit('checkpoint_saved', {
      promptId: checkpointId,
      promptText: newEntry.promptText,
      timestamp: newEntry.timestamp,
      snapshotCount: 1,
      snapshotPaths: [absPath],
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/editor/file  — delete a file (snapshots for revert)
app.delete('/api/editor/file', async (req, res) => {
  const workingDir = agent.getConfig().workingDir || process.cwd();
  const { path: rawPath } = req.body ?? {};
  if (!rawPath) return res.status(400).json({ success: false, error: 'Missing path.' });
  const resolved = resolveEditorPath(workingDir, rawPath);
  if (!resolved) return res.status(400).json({ success: false, error: 'Invalid or out-of-bounds path.' });
  const { absPath, relPath } = resolved;
  try {
    const stat = await fs.stat(absPath);
    if (stat.isDirectory()) {
      await fs.rm(absPath, { recursive: true, force: true });
    } else {
      let before: string | null = null;
      try { before = await fs.readFile(absPath, 'utf-8'); } catch { before = null; }
      await fs.unlink(absPath);
      // Snapshot deletion for revert
      const sid = chatSessions.getActiveId();
      const existing = sessionCheckpoints.get(sid) ?? [];
      const checkpointId = `editor-delete-${Date.now()}`;
      existing.push({ promptId: checkpointId, promptText: `[Editor] Deleted ${relPath}`, timestamp: Date.now(), snapshots: [{ path: absPath, before }] });
      sessionCheckpoints.set(sid, existing);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/editor/mkdir  — create a directory
app.post('/api/editor/mkdir', async (req, res) => {
  const workingDir = agent.getConfig().workingDir || process.cwd();
  const { path: relPath } = req.body ?? {};
  if (!relPath) return res.status(400).json({ success: false, error: 'Missing path.' });
  const absPath = path.resolve(workingDir, relPath);
  if (!absPath.startsWith(workingDir)) return res.status(403).json({ success: false, error: 'Access denied.' });
  try {
    await fs.mkdir(absPath, { recursive: true });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── LSP proxy routes ──────────────────────────────────────────────────────────
// All LSP routes reuse the LspManager already living inside the ToolExecutor.
const getLsp = () => agent.getToolExecutor().getLspManager();

// GET /api/editor/lsp/diagnostics?path=<relative>
app.get('/api/editor/lsp/diagnostics', (req, res) => {
  const relPath = typeof req.query.path === 'string' ? req.query.path : undefined;
  try {
    const result = getLsp().getDiagnostics(relPath);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/editor/lsp/hover  — { path, line, character }
app.post('/api/editor/lsp/hover', (req, res) => {
  const { path: relPath, line, character } = req.body ?? {};
  if (!relPath) return res.status(400).json({ success: false, error: 'Missing path.' });
  try {
    res.json(getLsp().getHover(relPath, Number(line), Number(character)));
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/editor/lsp/definition  — { path, line, character }
app.post('/api/editor/lsp/definition', (req, res) => {
  const { path: relPath, line, character } = req.body ?? {};
  if (!relPath) return res.status(400).json({ success: false, error: 'Missing path.' });
  try {
    res.json(getLsp().getDefinition(relPath, Number(line), Number(character)));
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/editor/lsp/references  — { path, line, character }
app.post('/api/editor/lsp/references', (req, res) => {
  const { path: relPath, line, character } = req.body ?? {};
  if (!relPath) return res.status(400).json({ success: false, error: 'Missing path.' });
  try {
    res.json(getLsp().findReferences(relPath, Number(line), Number(character)));
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/editor/lsp/completion  — { path, line, character }
app.post('/api/editor/lsp/completion', (req, res) => {
  const { path: relPath, line, character } = req.body ?? {};
  if (!relPath) return res.status(400).json({ success: false, error: 'Missing path.' });
  try {
    res.json(getLsp().getCompletions(relPath, Number(line), Number(character)));
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/models - Fetch models from current or specified Ollama host
app.get('/api/models', async (req, res) => {
  try {
    const models = await agent.getAvailableModels();
    res.json({ success: true, models, activeModel: agent.getConfig().model });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/models/pull - Download a model while relaying Ollama's NDJSON progress
app.post('/api/models/pull', async (req, res) => {
  const model = typeof req.body?.model === 'string' ? req.body.model.trim() : '';
  if (!model || model.length > 200 || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*(?::[a-zA-Z0-9][a-zA-Z0-9._-]*)?$/.test(model)) {
    return res.status(400).json({ success: false, error: 'Enter a valid Ollama model name, for example qwen3.5:9b.' });
  }

  const controller = new AbortController();
  req.on('aborted', () => controller.abort());
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  // Disable Nagle's algorithm for low-latency streaming on Windows
  res.socket?.setNoDelay(true);
  res.flushHeaders();

  try {
    await agent.pullModel(model, (progress) => {
      res.write(`${JSON.stringify(progress)}\n`);
      (res as any).flush?.();
    }, controller.signal);
    res.end();
  } catch (err: any) {
    if (!res.writableEnded) {
      res.write(`${JSON.stringify({ error: err?.name === 'AbortError' ? 'Download cancelled.' : err.message })}\n`);
      res.end();
    }
  }
});

// POST /api/models/unload - Immediately release a model's RAM/VRAM allocation
app.post('/api/models/unload', async (req, res) => {
  const model = typeof req.body?.model === 'string' ? req.body.model.trim() : '';
  if (!model) return res.status(400).json({ success: false, error: 'A model name is required.' });

  try {
    await agent.unloadModel(model);
    const runningModels = await agent.getRunningModels();
    io.emit('models:running', runningModels);
    res.json({ success: true, model, runningModels });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/models/restart-server - Execute restart of local Ollama server process with configured env variables
app.post('/api/models/restart-server', async (req, res) => {
  const currentConfig = agent.getConfig();
  const host = currentConfig.ollamaHost;

  const isLocalHost = host.includes('127.0.0.1') || host.includes('localhost') || host.includes('0.0.0.0');
  if (!isLocalHost) {
    return res.status(400).json({
      success: false,
      error: 'Cannot restart remote Ollama server over network API. Please execute environment variable restart on the remote host machine directly.',
    });
  }

  const numParallel = req.body?.ollamaNumParallel ?? currentConfig.ollamaNumParallel ?? 4;
  const flashAttention = req.body?.ollamaFlashAttention ?? currentConfig.ollamaFlashAttention ?? true;
  const maxLoadedModels = req.body?.ollamaMaxLoadedModels ?? currentConfig.ollamaMaxLoadedModels ?? 1;
  const modelsPath = req.body?.ollamaModelsPath ?? currentConfig.ollamaModelsPath ?? '';
  const origins = req.body?.ollamaOrigins ?? currentConfig.ollamaOrigins ?? '';
  const loadTimeout = req.body?.ollamaLoadTimeout ?? currentConfig.ollamaLoadTimeout ?? '';

  const configUpdate = {
    ollamaNumParallel: numParallel,
    ollamaFlashAttention: flashAttention,
    ollamaMaxLoadedModels: maxLoadedModels,
    ollamaModelsPath: modelsPath,
    ollamaOrigins: origins,
    ollamaLoadTimeout: loadTimeout,
  };
  for (const engine of getConfigurableEngines()) engine.updateConfig(configUpdate);
  savePersistedConfig({
    ...currentConfig,
    ...configUpdate,
  });

  const envVars = {
    ...process.env,
    OLLAMA_NUM_PARALLEL: String(numParallel),
    OLLAMA_FLASH_ATTENTION: flashAttention ? '1' : '0',
    OLLAMA_MAX_LOADED_MODELS: String(maxLoadedModels),
    ...(modelsPath ? { OLLAMA_MODELS: modelsPath } : {}),
    ...(origins ? { OLLAMA_ORIGINS: origins } : {}),
    ...(loadTimeout ? { OLLAMA_LOAD_TIMEOUT: loadTimeout } : {}),
  };

  const isWin = process.platform === 'win32';
  const killCmd = isWin ? 'taskkill /F /IM ollama.exe 2>nul' : 'pkill -f "ollama serve" || true';
  const launchCmd = 'ollama serve';

  try {
    const { exec, spawn } = await import('child_process');
    if (process.platform === 'linux') {
      const systemdCmd = `sudo -n sed -i 's/OLLAMA_NUM_PARALLEL=[0-9]*/OLLAMA_NUM_PARALLEL=${numParallel}/g' /etc/systemd/system/ollama.service /lib/systemd/system/ollama.service 2>/dev/null; sudo -n systemctl daemon-reload && sudo -n systemctl restart ollama`;
      exec(systemdCmd, { timeout: 2000 }, (sysErr) => {
        if (!sysErr) {
          return res.json({
            success: true,
            message: `Systemd service file updated and Ollama restarted with OLLAMA_NUM_PARALLEL=${numParallel}.`,
          });
        }
        exec(killCmd, { timeout: 2000 }, () => {
          setTimeout(() => {
            try {
              const child = spawn('ollama', ['serve'], { env: envVars, detached: true, stdio: 'ignore' });
              child.unref();
            } catch (_) {}
            res.json({
              success: true,
              message: `Local Ollama server restarted with OLLAMA_NUM_PARALLEL=${numParallel}. (Copy Systemd command below if Systemd requires sudo).`,
            });
          }, 500);
        });
      });
    } else {
      exec(killCmd, { timeout: 2000 }, () => {
        setTimeout(() => {
          try {
            const child = spawn(isWin ? 'ollama.exe' : 'ollama', ['serve'], { env: envVars, detached: true, stdio: 'ignore' });
            child.unref();
          } catch (_) {}
          res.json({
            success: true,
            message: `Local Ollama server restarted with OLLAMA_NUM_PARALLEL=${numParallel}.`,
          });
        }, 500);
      });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/models/create - Create a custom model alias from a Modelfile
app.post('/api/models/create', async (req, res) => {
  const { name, modelfile } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Model name is required.' });
  }
  if (typeof modelfile !== 'string' || !modelfile.trim()) {
    return res.status(400).json({ success: false, error: 'Modelfile content is required.' });
  }
  try {
    await agent.getOllamaClient().createModel(name.trim(), modelfile.trim());
    res.json({ success: true, name: name.trim() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/models/copy - Copy / clone a model tag
app.post('/api/models/copy', async (req, res) => {
  const { source, destination } = req.body || {};
  if (typeof source !== 'string' || !source.trim() || typeof destination !== 'string' || !destination.trim()) {
    return res.status(400).json({ success: false, error: 'Both source and destination model names are required.' });
  }
  try {
    await agent.getOllamaClient().copyModel(source.trim(), destination.trim());
    res.json({ success: true, source: source.trim(), destination: destination.trim() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/models/delete - Delete a local model tag
app.delete('/api/models/delete', async (req, res) => {
  const model = typeof req.body?.name === 'string' ? req.body.name.trim() : (typeof req.query?.name === 'string' ? req.query.name.trim() : '');
  if (!model) return res.status(400).json({ success: false, error: 'A model name is required.' });
  try {
    await agent.getOllamaClient().deleteModel(model);
    res.json({ success: true, model });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/profiles - Fetch model profile templates
app.get('/api/profiles', (_req, res) => {
  const persisted = getInitialPersistedConfig();
  const custom = persisted.customProfiles || [];
  res.json({
    success: true,
    builtinProfiles: BUILTIN_PROFILES,
    customProfiles: custom,
    activeProfileId: persisted.activeProfileId || null,
  });
});

// POST /api/profiles - Save custom profile templates
app.post('/api/profiles', (req, res) => {
  const { customProfiles, activeProfileId } = req.body || {};
  if (customProfiles !== undefined && !Array.isArray(customProfiles)) {
    return res.status(400).json({ success: false, error: 'customProfiles must be an array.' });
  }
  const update: Record<string, any> = {};
  if (customProfiles !== undefined) update.customProfiles = customProfiles;
  if (activeProfileId !== undefined) update.activeProfileId = activeProfileId;
  savePersistedConfig(update);
  res.json({ success: true, customProfiles, activeProfileId });
});

const execAsync = promisify(exec);
let prevCpuTimes: { idle: number; total: number } | null = null;

function getCpuUsage(): number {
  try {
    const cpus = os.cpus();
    if (!cpus || cpus.length === 0) return 0;
    let idle = 0;
    let total = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        total += (cpu.times as any)[type];
      }
      idle += cpu.times.idle;
    }

    if (!prevCpuTimes) {
      prevCpuTimes = { idle, total };
      return 0;
    }

    const idleDiff = idle - prevCpuTimes.idle;
    const totalDiff = total - prevCpuTimes.total;
    prevCpuTimes = { idle, total };

    if (totalDiff <= 0) return 0;
    const usage = 100 - (100 * idleDiff) / totalDiff;
    return Math.min(100, Math.max(0, Number(usage.toFixed(1))));
  } catch (_) {
    return 0;
  }
}

async function getGpuMetrics(): Promise<{ name: string; gpuUtil: number; memUtil: number; memUsedMb: number; memTotalMb: number } | null> {
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  // 1. NVIDIA GPUs on Linux & Windows
  try {
    const cmd = 'nvidia-smi --query-gpu=name,utilization.gpu,utilization.memory,memory.used,memory.total --format=csv,noheader,nounits';
    const { stdout } = await execAsync(cmd, { timeout: 1500 });
    const parts = stdout.trim().split(/\r?\n/, 1)[0].split(',').map((p) => p.trim());
    if (parts.length >= 5 && parts[0]) {
      return {
        name: parts[0],
        gpuUtil: Number(parts[1]) || 0,
        memUtil: Number(parts[2]) || 0,
        memUsedMb: Number(parts[3]) || 0,
        memTotalMb: Number(parts[4]) || 0,
      };
    }
  } catch (_) {
    if (isWin) {
      try {
        const nvsmiPath = '"C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe"';
        const { stdout } = await execAsync(`${nvsmiPath} --query-gpu=name,utilization.gpu,utilization.memory,memory.used,memory.total --format=csv,noheader,nounits`, { timeout: 1500 });
        const parts = stdout.trim().split(/\r?\n/, 1)[0].split(',').map((p) => p.trim());
        if (parts.length >= 5 && parts[0]) {
          return {
            name: parts[0],
            gpuUtil: Number(parts[1]) || 0,
            memUtil: Number(parts[2]) || 0,
            memUsedMb: Number(parts[3]) || 0,
            memTotalMb: Number(parts[4]) || 0,
          };
        }
      } catch (_) {}
    }
  }

  // 2. Apple Silicon / macOS Metal GPUs
  if (isMac) {
    try {
      const { stdout } = await execAsync('sysctl -n machdep.cpu.brand_string', { timeout: 1000 });
      const name = stdout.trim();
      if (name.includes('Apple')) {
        return {
          name,
          gpuUtil: 0,
          memUtil: 0,
          memUsedMb: 0,
          memTotalMb: 0,
        };
      }
    } catch (_) {}
  }

  return null;
}

async function getSystemMetrics() {
  const cpuUtil = getCpuUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memUtil = Number(((usedMem / totalMem) * 100).toFixed(1));
  const gpu = await getGpuMetrics();

  return {
    cpu: {
      utilization: cpuUtil,
      cores: os.cpus().length,
    },
    memory: {
      usedGb: Number((usedMem / (1024 * 1024 * 1024)).toFixed(2)),
      totalGb: Number((totalMem / (1024 * 1024 * 1024)).toFixed(2)),
      utilization: memUtil,
    },
    gpu,
  };
}

// Keep the endpoint for API compatibility; the web client receives these metrics via Socket.IO.
app.get('/api/system/metrics', async (_req, res) => {
  try {
    res.json({ success: true, ...await getSystemMetrics() });
  } catch (_) {
    res.json({ success: false, error: 'Hardware metrics unavailable' });
  }
});

let liveStateInterval: NodeJS.Timeout | null = null;
let metricsCollectionInFlight = false;
let runningModelsCollectionInFlight = false;

const getConfigState = () => ({
  config: getPublicConfig(),
  context: agent.getContextManager().getContextInfo(),
});

const getConfigStateAsync = async () => ({
  config: await getPublicConfigAsync(),
  context: agent.getContextManager().getContextInfo(),
});

function broadcastTerminalSessions() {
  io.emit('terminal:sessions', listAllTerminalSessions());
}

function getTerminalManagers() {
  return [...new Set([...chatRuntimes.values()].map(({ engine }) => engine.getToolExecutor().getTerminalManager()))];
}

function listAllTerminalSessions() {
  return getTerminalManagers().flatMap((manager) => manager.listSessions());
}

function findTerminalManager(sessionId: string) {
  return getTerminalManagers().find((manager) => manager.listSessions().some((session) => session.sessionId === sessionId));
}

async function broadcastRunningModels() {
  if (runningModelsCollectionInFlight) return;
  runningModelsCollectionInFlight = true;
  try {
    io.emit('models:running', await agent.getRunningModels());
  } catch (_) {
    io.emit('models:running', []);
  } finally {
    runningModelsCollectionInFlight = false;
  }
}

async function broadcastSystemMetrics() {
  if (metricsCollectionInFlight) return;
  metricsCollectionInFlight = true;
  try {
    io.emit('system:metrics', await getSystemMetrics());
  } catch (_) {
    io.emit('system:metrics', null);
  } finally {
    metricsCollectionInFlight = false;
  }
}

function startLiveStateUpdates() {
  if (liveStateInterval) return;
  liveStateInterval = setInterval(() => {
    broadcastSystemMetrics();
    broadcastRunningModels();
    broadcastTerminalSessions();
  }, 3000);
}

io.on('connection', async (socket) => {
  startLiveStateUpdates();

  socket.emit('terminal:sessions', listAllTerminalSessions());
  socket.emit('config:state', await getConfigStateAsync());
  socket.emit('models:running', await agent.getRunningModels());

  try {
    socket.emit('system:metrics', await getSystemMetrics());
  } catch (_) {
    socket.emit('system:metrics', null);
  }

  socket.on('terminal:sessions:request', () => {
    socket.emit('terminal:sessions', listAllTerminalSessions());
  });

  socket.on('models:running:request', () => {
    void broadcastRunningModels();
  });

  // Client joins a session-specific room so the server can target it with chat:stream events
  socket.on('session:join', (sessionId: string) => {
    // Leave any previously joined session rooms
    for (const room of socket.rooms) {
      if (room !== socket.id && room.startsWith('session:')) {
        socket.leave(room);
      }
    }
    if (typeof sessionId === 'string' && sessionId) {
      socket.join(`session:${sessionId}`);
    }
  });

  socket.on('disconnect', () => {
    if (io.engine.clientsCount === 0 && liveStateInterval) {
      clearInterval(liveStateInterval);
      liveStateInterval = null;
    }
  });
});
app.get('/api/models/show', async (req, res) => {
  try {
    const modelName = typeof req.query.name === 'string' ? req.query.name : agent.getConfig().model;
    try {
      const details = await agent.getModelDetails(modelName);
      const supportsThinking = await agent.checkModelThinkingSupport(modelName);
      const supportsNativeTools = await agent.checkModelToolSupport(modelName);
      return res.json({ success: true, name: modelName, details, supportsThinking, supportsNativeTools });
    } catch (err: any) {
      // If Ollama returns 404 (model not pulled or name missing tag), return success: false with error string (200 status)
      return res.json({ success: false, name: modelName, error: err.message });
    }
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

// GET /api/config - Get current configuration & context stats
app.get('/api/config', async (req, res) => {
  res.json({
    config: await getPublicConfigAsync(),
    context: agent.getContextManager().getContextInfo(),
  });
});

// GET /api/directories - Browse server-local directories for the workdir picker
app.get('/api/directories', async (req, res) => {
  const requestedPath =
    typeof req.query.path === 'string' && req.query.path.trim()
      ? req.query.path.trim()
      : agent.getConfig().workingDir;
  const resolvedPath = path.resolve(requestedPath);
  try {
    const stats = await fs.stat(resolvedPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ success: false, error: 'Path is not a directory' });
    }
    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
    const directories = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => ({ name: entry.name, fullPath: path.join(resolvedPath, entry.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({
      success: true,
      currentPath: resolvedPath,
      parentPath: path.dirname(resolvedPath) !== resolvedPath ? path.dirname(resolvedPath) : null,
      directories,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: `Cannot browse directory: ${err.message}` });
  }
});

// POST /api/directories/create - Create a new directory inside currentPath
app.post('/api/directories/create', async (req, res) => {
  const { parentPath, folderName } = req.body || {};
  if (!parentPath || typeof parentPath !== 'string' || !folderName || typeof folderName !== 'string') {
    return res.status(400).json({ success: false, error: 'parentPath and folderName are required.' });
  }

  const sanitizedFolderName = folderName.trim();
  if (!sanitizedFolderName || sanitizedFolderName.includes('/') || sanitizedFolderName.includes('\\')) {
    return res.status(400).json({ success: false, error: 'Invalid folder name.' });
  }

  const newDirPath = path.resolve(parentPath.trim(), sanitizedFolderName);
  try {
    await fs.mkdir(newDirPath, { recursive: true });
    res.json({ success: true, newDirPath });
  } catch (err: any) {
    res.status(500).json({ success: false, error: `Failed to create directory: ${err.message}` });
  }
});

// POST /api/config - Update configuration
app.post('/api/config', async (req, res) => {
  const {
    model,
    classifierModel,
    systemPrompt,
    workingDir,
    showWorkingDirInfo,
    ollamaHost,
    ollamaToken,
    temperature,
    contextWindow,
    maxLoops,
    topP,
    topK,
    minP,
    repeatPenalty,
    presencePenalty,
    frequencyPenalty,
    seed,
    numPredict,
    stop,
    keepAlive,
    numGpu,
    numThread,
    ollamaNumParallel,
    ollamaFlashAttention,
    ollamaMaxLoadedModels,
    ollamaModelsPath,
    lowVram,
    f16Kv,
    mirostat,
    mirostatEta,
    mirostatTau,
    ollamaOrigins,
    ollamaLoadTimeout,
    planMode,
  } = req.body;

  if (ollamaHost !== undefined) {
    try {
      const parsed = new URL(ollamaHost);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error();
    } catch (_) {
      return res.status(400).json({ success: false, error: 'Ollama server URL must be a valid HTTP or HTTPS URL.' });
    }
  }

  if (workingDir) {
    const dirResult = agent.getToolExecutor().setWorkingDir(workingDir);
    if (!dirResult.success) {
      return res.status(400).json({ success: false, error: dirResult.error });
    }
  }

  const configUpdate = {
    model,
    classifierModel,
    systemPrompt,
    workingDir,
    showWorkingDirInfo,
    ollamaHost,
    ollamaToken,
    temperature,
    contextWindow,
    maxLoops,
    topP,
    topK,
    minP,
    repeatPenalty,
    presencePenalty,
    frequencyPenalty,
    seed,
    numPredict,
    stop,
    keepAlive,
    numGpu,
    numThread,
    ollamaNumParallel,
    ollamaFlashAttention,
    ollamaMaxLoadedModels,
    ollamaModelsPath,
    lowVram,
    f16Kv,
    mirostat,
    mirostatEta,
    mirostatTau,
    ollamaOrigins,
    ollamaLoadTimeout,
    planMode,
  };
  for (const engine of getConfigurableEngines()) engine.updateConfig(configUpdate);

  const currentConfig = agent.getConfig();
  savePersistedConfig({
    workingDir: currentConfig.workingDir,
    ollamaHost: currentConfig.ollamaHost,
    ollamaToken: agent.getOllamaToken(),
    model: currentConfig.model,
    classifierModel: currentConfig.classifierModel,
    temperature: currentConfig.temperature,
    contextWindow: currentConfig.contextWindow,
    systemPrompt: currentConfig.systemPrompt,
    showWorkingDirInfo: currentConfig.showWorkingDirInfo,
    enableThinking: currentConfig.enableThinking,
    planMode: currentConfig.planMode,
    maxLoops: currentConfig.maxLoops,
    complexityProfile: currentConfig.complexityProfile,
    preventRepeatedCalls: currentConfig.preventRepeatedCalls,
    topP: currentConfig.topP,
    topK: currentConfig.topK,
    minP: currentConfig.minP,
    repeatPenalty: currentConfig.repeatPenalty,
    presencePenalty: currentConfig.presencePenalty,
    frequencyPenalty: currentConfig.frequencyPenalty,
    seed: currentConfig.seed,
    numPredict: currentConfig.numPredict,
    stop: currentConfig.stop,
    keepAlive: currentConfig.keepAlive,
    numGpu: currentConfig.numGpu,
    numThread: currentConfig.numThread,
    ollamaNumParallel: req.body.ollamaNumParallel ?? currentConfig.ollamaNumParallel,
    ollamaFlashAttention: req.body.ollamaFlashAttention ?? currentConfig.ollamaFlashAttention,
    ollamaMaxLoadedModels: req.body.ollamaMaxLoadedModels ?? currentConfig.ollamaMaxLoadedModels,
    ollamaModelsPath: req.body.ollamaModelsPath ?? currentConfig.ollamaModelsPath,
    lowVram: req.body.lowVram ?? currentConfig.lowVram,
    f16Kv: req.body.f16Kv ?? currentConfig.f16Kv,
    mirostat: req.body.mirostat ?? currentConfig.mirostat,
    mirostatEta: req.body.mirostatEta ?? currentConfig.mirostatEta,
    mirostatTau: req.body.mirostatTau ?? currentConfig.mirostatTau,
    ollamaOrigins: req.body.ollamaOrigins ?? currentConfig.ollamaOrigins,
    ollamaLoadTimeout: req.body.ollamaLoadTimeout ?? currentConfig.ollamaLoadTimeout,
    enabledTools: currentConfig.enabledTools,
    allowedCommands: allowedCommandsState,
    terminalMode: terminalRequireConfirm ? 'confirm' : 'auto',
    fileEditMode,
  });

  const asyncState = await getConfigStateAsync();
  io.emit('config:state', asyncState);

  res.json({
    success: true,
    config: asyncState.config,
    context: asyncState.context,
  });
});

// GET /api/context - Get detailed context info (raw JSON & converted text)
app.get('/api/context', (req, res) => {
  const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : '';
  const context = sessionId ? getSessionContext(sessionId) : agent.getContextManager().getContextInfo();
  if (!context) return res.status(404).json({ error: 'Chat session not found.' });
  res.json(context);
});

// GET /api/context/workdir - Preview the exact dynamic text appended to the system prompt
app.get('/api/context/workdir', async (_req, res) => {
  try {
    const enabled = agent.getConfig().showWorkingDirInfo;
    res.json({
      enabled,
      content: await agent.getWorkingDirectoryPromptContext(),
    });
  } catch (err: any) {
    res.status(500).json({ enabled: agent.getConfig().showWorkingDirInfo, content: '', error: err.message });
  }
});

// GET /api/skills - List valid workspace and application-bundled skills
app.get('/api/skills', async (_req, res) => {
  try {
    res.json({ skills: await listProjectSkills(agent.getConfig().workingDir) });
  } catch (err: any) {
    res.status(500).json({ skills: [], error: err.message });
  }
});

// GET /api/messages - Restore the visible chat after a browser reload
app.get('/api/messages', (_req, res) => {
  const sessionId = typeof _req.query.sessionId === 'string' ? _req.query.sessionId : chatSessions.getActiveId();
  const session = chatSessions.getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'Chat session not found.' });
  res.json({
    messages: session.messages,
    activeSessionId: session.id,
  });
});

// GET /api/chat/sessions - List persisted conversations without their message payloads
app.get('/api/chat/sessions', (_req, res) => {
  res.json({
    success: true,
    capabilities: { observableChatSessions: true },
    ...getChatSessionsState(),
  });
});

// POST /api/chat/sessions - Save the current conversation and start a new one
app.post('/api/chat/sessions', (req, res) => {
  const session = chatSessions.create(req.body?.title, false);
  const requestedConfig = req.body?.agentConfig;
  if (requestedConfig && typeof requestedConfig === 'object') {
    const globalConfig = agent.getConfig();
    const requestedPruning = requestedConfig.pruningConfig && typeof requestedConfig.pruningConfig === 'object'
      ? requestedConfig.pruningConfig
      : {};
    const globalPruning = globalConfig.pruningConfig || agent.getContextManager().getPruningConfig();
    const sessionEngine = new AgentEngine({
      ...globalConfig,
      ollamaToken: agent.getOllamaToken(),
      model: typeof requestedConfig.model === 'string' && requestedConfig.model.trim()
        ? requestedConfig.model.trim()
        : globalConfig.model,
      ollamaHost: typeof requestedConfig.ollamaHost === 'string' && requestedConfig.ollamaHost.trim()
        ? requestedConfig.ollamaHost.trim()
        : globalConfig.ollamaHost,
      temperature: typeof requestedConfig.temperature === 'number' ? requestedConfig.temperature : globalConfig.temperature,
      contextWindow: Number.isInteger(requestedConfig.contextWindow) ? requestedConfig.contextWindow : globalConfig.contextWindow,
      maxLoops: Number.isInteger(requestedConfig.maxLoops) ? requestedConfig.maxLoops : globalConfig.maxLoops,
      enableThinking: typeof requestedConfig.enableThinking === 'boolean' ? requestedConfig.enableThinking : globalConfig.enableThinking,
      planMode: typeof requestedConfig.planMode === 'boolean' ? requestedConfig.planMode : globalConfig.planMode,
      complexityProfile: requestedConfig.complexityProfile === 'simple' || requestedConfig.complexityProfile === 'medium' || requestedConfig.complexityProfile === 'advanced'
        ? requestedConfig.complexityProfile
        : globalConfig.complexityProfile,
      enabledTools: requestedConfig.enabledTools && typeof requestedConfig.enabledTools === 'object'
        ? { ...globalConfig.enabledTools, ...requestedConfig.enabledTools }
        : globalConfig.enabledTools,
      pruningConfig: {
        ...globalPruning,
        enabled: typeof requestedPruning.enabled === 'boolean' ? requestedPruning.enabled : globalPruning.enabled,
        enableToolTTL: typeof requestedPruning.enableToolTTL === 'boolean'
          ? requestedPruning.enableToolTTL
          : globalPruning.enableToolTTL,
        webOutputTTLTurns: Number.isInteger(requestedPruning.webOutputTTLTurns) && requestedPruning.webOutputTTLTurns >= 0
          ? requestedPruning.webOutputTTLTurns
          : globalPruning.webOutputTTLTurns,
      },
      showWorkingDirInfo: typeof requestedConfig.showWorkingDirInfo === 'boolean'
        ? requestedConfig.showWorkingDirInfo
        : globalConfig.showWorkingDirInfo,
      systemPrompt: typeof requestedConfig.systemPrompt === 'string' && requestedConfig.systemPrompt.trim()
        ? requestedConfig.systemPrompt
        : globalConfig.systemPrompt,
    });
    createChatRuntime(session.id, sessionEngine);
  }
  io.emit('chat:sessions', { sessions: chatSessions.list() });
  res.status(201).json({
    success: true,
    session,
    messages: [],
    context: getSessionContext(session.id),
    sessions: chatSessions.list(),
    activeSessionId: session.id,
    isGenerating: activeGenerationControllers.has(session.id),
    activeToolState: activeToolStates.get(session.id) || null,
  });
});

// POST /api/chat/sessions/:id/activate - Switch the agent context to a saved conversation
app.post('/api/chat/sessions/:id/activate', (req, res) => {
  const session = chatSessions.getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, error: 'Chat session not found.' });
  }
  res.json({
    success: true,
    session,
    messages: session.messages,
    context: getSessionContext(session.id),
    sessions: chatSessions.list(),
    activeSessionId: session.id,
    isGenerating: activeGenerationControllers.has(session.id),
    activeToolState: activeToolStates.get(session.id) || null,
  });
});

// PATCH /api/chat/sessions/:id - Rename a conversation
app.patch('/api/chat/sessions/:id', (req, res) => {
  if (typeof req.body?.title !== 'string' || !req.body.title.trim()) {
    return res.status(400).json({ success: false, error: 'A non-empty title is required.' });
  }
  const session = chatSessions.rename(req.params.id, req.body.title);
  if (!session) {
    return res.status(404).json({ success: false, error: 'Chat session not found.' });
  }
  io.emit('chat:sessions', { sessions: chatSessions.list() });
  res.json({ success: true, session, ...getChatSessionsState() });
});

// DELETE /api/chat/sessions/:id - Delete a conversation and activate the newest remaining one
app.delete('/api/chat/sessions/:id', (req, res) => {
  if (activeGenerationControllers.has(req.params.id)) {
    return res.status(409).json({ success: false, error: 'Cancel this chat generation before deleting it.' });
  }
  const activeSession = chatSessions.delete(req.params.id);
  if (!activeSession) {
    return res.status(404).json({ success: false, error: 'Chat session not found.' });
  }
  chatRuntimes.delete(req.params.id);
  io.emit('chat:sessions', { sessions: chatSessions.list() });
  res.json({
    success: true,
    deletedSessionId: req.params.id,
    ...getChatSessionsState(),
  });
});

// GET /api/tools - List available agent tools
app.get('/api/tools', (req, res) => {
  res.json({
    tools: agent.getActiveTools(),
    workingDir: agent.getConfig().workingDir,
  });
});

// GET /api/tools/definitions - Full builtin tool list with UI group metadata (single source of truth for tool toggles)
app.get('/api/tools/definitions', (_req, res) => {
  const definitions = BUILTIN_TOOLS.map((tool) => {
    const meta = TOOL_GROUP_METADATA[tool.name] ?? {
      group: '⚙️ Other',
      groupColor: 'var(--text-muted)',
      groupDescription: '',
    };
    return { name: tool.name, ...meta };
  });
  res.json({ definitions });
});

// GET /api/terminal/sessions - List active & background terminal sessions
app.get('/api/terminal/sessions', (_req, res) => {
  res.json({ success: true, sessions: listAllTerminalSessions() });
});

// GET /api/terminal/sessions/:id/output - Fetch log output for terminal session
app.get('/api/terminal/sessions/:id/output', (req, res) => {
  const terminalManager = findTerminalManager(req.params.id);
  if (!terminalManager) return res.status(404).json({ success: false, error: 'Terminal session not found.' });
  const tailLines = req.query.tail_lines ? parseInt(req.query.tail_lines as string, 10) : 100;
  const result = terminalManager.readOutput(req.params.id, tailLines);
  if (!result.success) {
    return res.status(404).json({ success: false, error: result.error });
  }
  res.json({ success: true, output: result.output });
});

// POST /api/terminal/sessions - Start new terminal session
app.post('/api/terminal/sessions', (req, res) => {
  const { command, sessionId, guiMode } = req.body || {};
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ success: false, error: 'command (string) is required.' });
  }
  const terminalManager = agent.getToolExecutor().getTerminalManager();
  const config = agent.getConfig();
  const result = terminalManager.startSession(command, sessionId, config.workingDir, {
    guiMode: guiMode ?? config.terminalGuiMode,
    customTerminalCmd: config.customTerminalCmd,
  });
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error });
  }
  broadcastTerminalSessions();
  res.json({ success: true, session: result.session });
});

// POST /api/terminal/sessions/:id/input - Send stdin input to terminal session
app.post('/api/terminal/sessions/:id/input', (req, res) => {
  const { input } = req.body || {};
  if (input === undefined || typeof input !== 'string') {
    return res.status(400).json({ success: false, error: 'input (string) is required.' });
  }
  const terminalManager = findTerminalManager(req.params.id);
  if (!terminalManager) return res.status(404).json({ success: false, error: 'Terminal session not found.' });
  const result = terminalManager.sendInput(req.params.id, input);
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error });
  }
  res.json({ success: true });
});

// DELETE /api/terminal/sessions/:id - Terminate and remove terminal session
app.delete('/api/terminal/sessions/:id', (req, res) => {
  const terminalManager = findTerminalManager(req.params.id);
  if (!terminalManager) return res.status(404).json({ success: false, error: 'Terminal session not found.' });
  const action = req.query.action;
  const result = action === 'kill'
    ? terminalManager.terminateSession(req.params.id)
    : terminalManager.removeSession(req.params.id);
  if (!result.success) {
    return res.status(404).json({ success: false, error: result.error });
  }
  broadcastTerminalSessions();
  res.json({ success: true });
});

// GET /api/mcp/servers - Status of connected MCP servers and tools
app.get('/api/mcp/servers', async (req, res) => {
  const mcpManager = agent.getToolExecutor().getMcpManager();
  const rawConfig = await mcpManager.getRawConfigContent();
  res.json({
    success: true,
    mcpEnabled: mcpManager.isGlobalEnabled(),
    configPath: mcpManager.getConfigPath(),
    rawConfig,
    servers: mcpManager.getServersStatus(),
    mcpTools: mcpManager.getToolDefinitions(),
    allToolDetails: mcpManager.getAllToolDetails(),
  });
});

// POST /api/mcp/toggle-global - Master toggle for MCP support
app.post('/api/mcp/toggle-global', (req, res) => {
  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ success: false, error: 'enabled (boolean) is required.' });
  }
  const mcpManager = agent.getToolExecutor().getMcpManager();
  for (const { engine } of chatRuntimes.values()) {
    engine.getToolExecutor().getMcpManager().setGlobalEnabled(enabled);
  }
  res.json({
    success: true,
    mcpEnabled: mcpManager.isGlobalEnabled(),
    servers: mcpManager.getServersStatus(),
    allToolDetails: mcpManager.getAllToolDetails(),
  });
});

// POST /api/mcp/toggle-server - Enable or disable an individual MCP server
app.post('/api/mcp/toggle-server', async (req, res) => {
  try {
    const { name, enabled } = req.body || {};
    if (typeof name !== 'string' || typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'name (string) and enabled (boolean) are required.' });
    }

    const mcpManager = agent.getToolExecutor().getMcpManager();
    const toggleRes = await mcpManager.toggleServer(name, enabled);
    await Promise.all([...chatRuntimes.values()]
      .filter(({ engine }) => engine !== agent)
      .map(({ engine }) => engine.loadMcpConfig().catch(() => undefined)));
    const updatedRaw = await mcpManager.getRawConfigContent();

    res.json({
      success: toggleRes.success,
      configPath: mcpManager.getConfigPath(),
      rawConfig: updatedRaw,
      servers: mcpManager.getServersStatus(),
      mcpTools: mcpManager.getToolDefinitions(),
      allToolDetails: mcpManager.getAllToolDetails(),
      error: toggleRes.error,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/mcp/reload - Reload MCP servers from config file
app.post('/api/mcp/reload', async (req, res) => {
  try {
    const { configPath } = req.body || {};
    const reloadResults = await Promise.all([...chatRuntimes.values()].map(({ engine }) => engine.loadMcpConfig(configPath)));
    const result = reloadResults.find((entry) => !entry.success) || reloadResults[0];
    const mcpManager = agent.getToolExecutor().getMcpManager();
    const rawConfig = await mcpManager.getRawConfigContent();
    res.json({
      success: result.success,
      configPath: mcpManager.getConfigPath(),
      rawConfig,
      servers: mcpManager.getServersStatus(),
      mcpTools: mcpManager.getToolDefinitions(),
      allToolDetails: mcpManager.getAllToolDetails(),
      error: result.error,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/mcp/config - Save updated MCP JSON configuration
app.post('/api/mcp/config', async (req, res) => {
  try {
    const { rawConfig } = req.body || {};
    if (typeof rawConfig !== 'string') {
      return res.status(400).json({ success: false, error: 'rawConfig string is required.' });
    }
    const mcpManager = agent.getToolExecutor().getMcpManager();
    const saveRes = await mcpManager.saveRawConfig(rawConfig);
    await Promise.all([...chatRuntimes.values()]
      .filter(({ engine }) => engine !== agent)
      .map(({ engine }) => engine.loadMcpConfig().catch(() => undefined)));
    const updatedRaw = await mcpManager.getRawConfigContent();
    res.json({
      success: saveRes.success,
      configPath: mcpManager.getConfigPath(),
      rawConfig: updatedRaw,
      servers: mcpManager.getServersStatus(),
      mcpTools: mcpManager.getToolDefinitions(),
      allToolDetails: mcpManager.getAllToolDetails(),
      error: saveRes.error,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/mcp/toggle-tool - Enable or disable an MCP tool
app.post('/api/mcp/toggle-tool', (req, res) => {
  const { name, enabled } = req.body || {};
  if (typeof name !== 'string' || typeof enabled !== 'boolean') {
    return res.status(400).json({ success: false, error: 'name (string) and enabled (boolean) are required.' });
  }
  const mcpManager = agent.getToolExecutor().getMcpManager();
  for (const { engine } of chatRuntimes.values()) {
    engine.getToolExecutor().getMcpManager().toggleTool(name, enabled);
  }
  res.json({
    success: true,
    allToolDetails: mcpManager.getAllToolDetails(),
    servers: mcpManager.getServersStatus(),
  });
});

// POST /api/clear - Clear chat history context & terminal sessions
app.post('/api/clear', (req, res) => {
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : chatSessions.getActiveId();
  const session = chatSessions.getSession(sessionId);
  if (!session) return res.status(404).json({ success: false, error: 'Chat session not found.' });
  if (activeGenerationControllers.has(sessionId)) return res.status(409).json({ success: false, error: 'Cancel this chat generation first.' });
  const sessionAgent = getChatRuntime(sessionId).engine;
  sessionAgent.resetChat();
  saveChatSession(sessionId, sessionAgent);
  const terminalManager = sessionAgent.getToolExecutor().getTerminalManager();
  terminalManager.clearAllSessions();
  broadcastTerminalSessions();
  res.json({
    success: true,
    context: sessionAgent.getContextManager().getContextInfo(),
  });
});

// POST /api/chat/rewind - Rewind context to a specific prompt message ID
app.post('/api/chat/rewind', (req, res) => {
  const { messageId, sessionId } = req.body || {};
  if (typeof messageId !== 'string') {
    return res.status(400).json({ success: false, error: 'messageId string is required.' });
  }
  const session = typeof sessionId === 'string' ? chatSessions.getSession(sessionId) : undefined;
  if (!session) return res.status(404).json({ success: false, error: 'Chat session not found.' });
  if (activeGenerationControllers.has(sessionId)) return res.status(409).json({ success: false, error: 'Cancel this chat generation first.' });
  const sessionAgent = getChatRuntime(sessionId).engine;
  const result = sessionAgent.rewindToMessage(messageId);
  if (!result.success) {
    return res.status(404).json({ success: false, error: 'Message not found in context.' });
  }
  saveChatSession(sessionId, sessionAgent);
  res.json({
    success: true,
    rewoundMessage: result.rewoundMessage,
    context: sessionAgent.getContextManager().getContextInfo(),
  });
});

// POST /api/chat/compact - Compact conversation history into a structured summary
app.post('/api/chat/compact', async (req, res) => {
  let compactController: AbortController | null = null;
  let compactSessionId = '';
  try {
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
    const session = chatSessions.getSession(sessionId);
    if (!session) return res.status(404).json({ success: false, error: 'Chat session not found.' });
    if (activeGenerationControllers.has(sessionId)) return res.status(409).json({ success: false, error: 'This chat is currently generating.' });
    compactController = new AbortController();
    compactSessionId = sessionId;
    activeGenerationControllers.set(sessionId, compactController);
    const sessionRuntime = getChatRuntime(sessionId);
    await sessionRuntime.ready;
    const sessionAgent = sessionRuntime.engine;
    const result = await sessionAgent.compactContext();
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.reason || 'Context cannot be compacted.' });
    }
    saveChatSession(sessionId, sessionAgent);
    res.json({
      success: true,
      summary: result.summary,
      message: result.message,
      context: result.context,
      messages: sessionAgent.getContextManager().getMessages(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (compactController && activeGenerationControllers.get(compactSessionId) === compactController) {
      activeGenerationControllers.delete(compactSessionId);
    }
  }
});

// GET /api/context/pruning - Get active context pruning configuration
app.get('/api/context/pruning', (_req, res) => {
  res.json({
    success: true,
    pruningConfig: agent.getContextManager().getPruningConfig(),
  });
});

// POST /api/context/pruning - Update context pruning configuration
app.post('/api/context/pruning', (req, res) => {
  const updates = req.body || {};
  for (const engine of getConfigurableEngines()) engine.updateConfig({ pruningConfig: updates });
  savePersistedConfig({
    pruningConfig: agent.getContextManager().getPruningConfig(),
  });
  res.json({
    success: true,
    pruningConfig: agent.getContextManager().getPruningConfig(),
    context: agent.getContextManager().getContextInfo(),
  });
});

// POST /api/chat/tool-approval - Approve or reject a pending tool execution
app.post('/api/chat/tool-approval', (req, res) => {
  const { decision, reason, sessionId } = req.body as { decision: 'approve' | 'reject'; reason?: string; sessionId?: string };
  const pendingApprovalResolve = typeof sessionId === 'string' ? pendingApprovalResolves.get(sessionId) : undefined;
  if (pendingApprovalResolve && sessionId) {
    pendingApprovalResolve({ decision, reason });
    pendingApprovalResolves.delete(sessionId);
    res.json({ success: true });
  } else {
    res.status(400).json({ success: false, error: 'No pending approval.' });
  }
});

// POST /api/chat/revert-files - Selectively revert individual files from a checkpoint
app.post('/api/chat/revert-files', async (req, res) => {
  const { sessionId, promptId, revertPaths } = req.body as {
    sessionId?: string;
    promptId?: string;
    revertPaths?: string[];
  };
  if (!sessionId || !promptId || !Array.isArray(revertPaths)) {
    return res.status(400).json({ success: false, error: 'sessionId, promptId and revertPaths are required.' });
  }
  const entries = sessionCheckpoints.get(sessionId) ?? [];
  let checkpoint = entries.find((e) => e.promptId === promptId);
  if (!checkpoint && entries.length > 0) {
    checkpoint = entries[entries.length - 1];
  }
  if (!checkpoint) {
    return res.status(404).json({ success: false, error: 'Checkpoint not found.' });
  }
  const pathSet = new Set(revertPaths);
  const toRevert = checkpoint.snapshots.filter((s) => pathSet.has(s.path));
  const errors: string[] = [];
  for (const snap of toRevert) {
    try {
      if (snap.before === null) {
        await fs.unlink(snap.path).catch(() => {});
      } else {
        await fs.mkdir(path.dirname(snap.path), { recursive: true });
        await fs.writeFile(snap.path, snap.before, 'utf8');
      }
    } catch (err: any) {
      errors.push(`${snap.path}: ${err.message}`);
    }
  }
  if (errors.length > 0) {
    return res.status(207).json({ success: false, errors, reverted: toRevert.length - errors.length });
  }
  res.json({ success: true, reverted: toRevert.length });
});

// GET /api/chat/checkpoints - Return checkpoint list for a session
app.get('/api/chat/checkpoints', (req, res) => {
  const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : '';
  const entries = sessionCheckpoints.get(sessionId) ?? [];
  const formatted = entries.map((e) => ({
    promptId: e.promptId,
    promptText: e.promptText,
    timestamp: e.timestamp,
    snapshotPaths: e.snapshots.map((s) => s.path),
    snapshotCount: e.snapshots.length,
  }));
  res.json({ success: true, checkpoints: formatted });
});

// POST /api/chat/revert - Revert ALL files to the state before a given promptId (full checkpoint revert)
app.post('/api/chat/revert', async (req, res) => {
  const { sessionId, promptId } = req.body as { sessionId?: string; promptId?: string };
  if (!sessionId || !promptId) {
    return res.status(400).json({ success: false, error: 'sessionId and promptId are required.' });
  }
  const entries = sessionCheckpoints.get(sessionId) ?? [];
  const targetIdx = entries.findIndex((e) => e.promptId === promptId);
  if (targetIdx === -1) {
    return res.status(404).json({ success: false, error: 'Checkpoint not found.' });
  }
  // Collect all snapshots at and after the target checkpoint (in reverse order so earliest pre-prompt state wins)
  const toRevert = entries.slice(targetIdx).flatMap((e) => e.snapshots);
  // Deduplicate: keep the earliest snapshot per path when iterating forward (earliest pre-prompt state)
  const seen = new Set<string>();
  const unique: FileSnapshot[] = [];
  for (const snap of toRevert) {
    if (!seen.has(snap.path)) {
      seen.add(snap.path);
      unique.push(snap);
    }
  }
  const errors: string[] = [];
  for (const snap of unique) {
    try {
      if (snap.before === null) {
        // File didn't exist before — delete it (best-effort)
        await fs.unlink(snap.path).catch(() => {});
      } else {
        await fs.mkdir(path.dirname(snap.path), { recursive: true });
        await fs.writeFile(snap.path, snap.before, 'utf8');
      }
    } catch (err: any) {
      errors.push(`${snap.path}: ${err.message}`);
    }
  }
  // Remove checkpoints at and after the target
  sessionCheckpoints.set(sessionId, entries.slice(0, targetIdx));
  if (errors.length > 0) {
    return res.status(207).json({ success: false, errors, reverted: unique.length - errors.length });
  }
  res.json({ success: true, reverted: unique.length });
});


// POST /api/chat/tool-settings - Update tool approval preferences & max loops & thinking
app.post('/api/chat/tool-settings', (req, res) => {
  const { terminalMode, fileEditMode: newFileEditMode, allowedCommands, maxLoops, enableThinking, planMode, preventRepeatedCalls, complexityProfile, enabledTools, terminalGuiMode, customTerminalCmd } = req.body;
  if (terminalMode === 'confirm' || terminalMode === 'auto') {
    terminalRequireConfirm = terminalMode === 'confirm';
  }
  if (newFileEditMode === 'confirm' || newFileEditMode === 'auto' || newFileEditMode === 'batch') {
    fileEditMode = newFileEditMode;
  }
  if (Array.isArray(allowedCommands)) {
    allowedCommandsState = allowedCommands.map((c) => String(c).trim()).filter(Boolean);
  }
  if (typeof maxLoops === 'number' && maxLoops >= 0 && maxLoops <= 50) {
    for (const engine of getConfigurableEngines()) engine.updateConfig({ maxLoops });
  }
  if (typeof enableThinking === 'boolean') {
    for (const engine of getConfigurableEngines()) engine.updateConfig({ enableThinking });
  }
  if (typeof planMode === 'boolean') {
    for (const engine of getConfigurableEngines()) engine.updateConfig({ planMode });
  }
  if (typeof preventRepeatedCalls === 'boolean') {
    for (const engine of getConfigurableEngines()) engine.updateConfig({ preventRepeatedCalls });
  }
  if (complexityProfile === 'simple' || complexityProfile === 'medium' || complexityProfile === 'advanced') {
    for (const engine of getConfigurableEngines()) engine.updateConfig({ complexityProfile });
  }
  if (typeof terminalGuiMode === 'boolean') {
    for (const engine of getConfigurableEngines()) engine.updateConfig({ terminalGuiMode });
  }
  if (typeof customTerminalCmd === 'string') {
    for (const engine of getConfigurableEngines()) engine.updateConfig({ customTerminalCmd });
  }
  if (enabledTools && typeof enabledTools === 'object' && !Array.isArray(enabledTools)) {
    const sanitizedEnabledTools = Object.fromEntries(BUILTIN_TOOLS.map((tool) => [
      tool.name,
      enabledTools[tool.name] !== undefined
        ? Boolean(enabledTools[tool.name])
        : tool.name !== 'apply_patch',
    ]));
    for (const engine of getConfigurableEngines()) engine.updateConfig({ enabledTools: sanitizedEnabledTools });
  }

  savePersistedConfig({
    allowedCommands: allowedCommandsState,
    terminalMode: terminalRequireConfirm ? 'confirm' : 'auto',
    fileEditMode,
    enableThinking: agent.getConfig().enableThinking,
    preventRepeatedCalls: agent.getConfig().preventRepeatedCalls,
    complexityProfile: agent.getConfig().complexityProfile,
    enabledTools: agent.getConfig().enabledTools,
    maxLoops: agent.getConfig().maxLoops,
    terminalGuiMode: agent.getConfig().terminalGuiMode,
    customTerminalCmd: agent.getConfig().customTerminalCmd,
  });

  io.emit('config:state', getConfigState());

  res.json({
    success: true,
    terminalRequireConfirm,
    fileEditMode,
    allowedCommands: allowedCommandsState,
    config: getPublicConfig(),
  });
});

// POST /api/chat/cancel - Abort active Ollama generations
app.post('/api/chat/cancel', (req, res) => {
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
  if (req.body?.all || !sessionId) {
    let cancelledCount = 0;
    for (const [id, controller] of activeGenerationControllers.entries()) {
      controller.abort();
      cancelledCount++;
      const pendingApprovalResolve = pendingApprovalResolves.get(id);
      if (pendingApprovalResolve) {
        pendingApprovalResolve({ decision: 'reject', reason: 'Generation cancelled by user' });
        pendingApprovalResolves.delete(id);
      }
    }
    activeGenerationControllers.clear();
    broadcastChatSessions();
    return res.json({ success: true, cancelledCount });
  }

  const activeGenerationController = activeGenerationControllers.get(sessionId);
  if (!activeGenerationController) {
    return res.status(409).json({ success: false, error: 'No active generation.' });
  }

  activeGenerationController.abort();
  activeGenerationControllers.delete(sessionId);
  const pendingApprovalResolve = pendingApprovalResolves.get(sessionId);
  if (pendingApprovalResolve) {
    pendingApprovalResolve({ decision: 'reject', reason: 'Generation cancelled by user' });
    pendingApprovalResolves.delete(sessionId);
  }
  broadcastChatSessions();
  res.json({ success: true });
});

// POST /api/chat - Stream chat completion via Socket.IO (works on all platforms including Windows)
app.post('/api/chat', async (req, res) => {
  const {
    message: requestedMessage,
    sessionId,
    attachments = [],
    imageAttachments = [],
    regenerateFromToolMessageId,
    planMode,
  } = req.body;
  const isDeepResearchRegeneration = typeof regenerateFromToolMessageId === 'string';
  const message = isDeepResearchRegeneration ? '' : requestedMessage;

  if (typeof sessionId !== 'string' || !chatSessions.getSession(sessionId)) {
    return res.status(404).json({ error: 'A valid chat session is required.' });
  }
  if (activeGenerationControllers.has(sessionId)) {
    return res.status(409).json({ error: 'This chat is already generating.' });
  }

  if (!isDeepResearchRegeneration && (!message || typeof message !== 'string')) {
    return res.status(400).json({ error: 'Field "message" is required.' });
  }
  if (isDeepResearchRegeneration && (attachments.length > 0 || imageAttachments.length > 0)) {
    return res.status(400).json({ error: 'Attachments cannot be added when regenerating from a deep-research result.' });
  }
  if (!Array.isArray(attachments) || attachments.length > 10) {
    return res.status(400).json({ error: 'Attachments must be an array of at most 10 text files.' });
  }
  if (!Array.isArray(imageAttachments) || imageAttachments.length > 5) {
    return res.status(400).json({ error: 'Image attachments must be an array of at most 5 images.' });
  }
  const validAttachments = attachments.every((file: any) =>
    file && typeof file.name === 'string' && file.name.length <= 255 &&
    typeof file.content === 'string' && typeof file.size === 'number' &&
    file.size >= 0 && Buffer.byteLength(file.content, 'utf8') <= 512 * 1024
  );
  const validImages = imageAttachments.every((img: any) =>
    img && typeof img.name === 'string' && typeof img.base64 === 'string' && img.base64.length > 0
  );
  if (!validImages) {
    return res.status(400).json({ error: 'Invalid image attachment data.' });
  }
  const rawImagesBase64 = imageAttachments.map((img: any) =>
    img.base64.replace(/^data:image\/[a-zA-Z]+;base64,/, '')
  );
  const totalAttachmentSize = attachments.reduce(
    (total: number, file: any) =>
      total + (typeof file?.content === 'string' ? Buffer.byteLength(file.content, 'utf8') : 0),
    0,
  );
  if (!validAttachments || totalAttachmentSize > 1024 * 1024) {
    return res.status(400).json({ error: 'Invalid attachment or attachment size limit exceeded (512 KB each, 1 MB total).' });
  }

  if (!isDeepResearchRegeneration && /^\/skills\s*$/i.test(message)) {
    const skills = await listProjectSkills(agent.getConfig().workingDir);
    const content = formatProjectSkillList(skills);
    // Respond immediately, emit events via Socket.IO
    res.status(202).json({ success: true });
    const skillMsg = {
      id: `skills-${Date.now()}`,
      role: 'assistant',
      content,
      timestamp: Date.now(),
    };
    io.to(`session:${sessionId}`).emit('chat:stream', { sessionId, event: 'message_added', data: skillMsg });
    io.to(`session:${sessionId}`).emit('chat:stream', { sessionId, event: 'done', data: { content } });
    return;
  }

  const skillReferences = parseSkillReferences(message);
  if (skillReferences.names.length > 0 && !skillReferences.request) {
    return res.status(400).json({ error: 'Add a request before or after the @skill:<name> reference.' });
  }
  const loadedSkills = await Promise.all(
    skillReferences.names.map((name) => loadProjectSkill(agent.getConfig().workingDir, name))
  );
  const missingSkillIndex = loadedSkills.findIndex((skill) => skill === null);
  if (missingSkillIndex >= 0) {
    return res.status(404).json({
      error: `Skill "${skillReferences.names[missingSkillIndex]}" was not found. Type @ to see available skills.`,
    });
  }
  const selectedSkills = loadedSkills.filter((skill): skill is NonNullable<typeof skill> => skill !== null);
  const effectiveMessage = selectedSkills.length > 0 ? skillReferences.request : message;

  const generationController = new AbortController();
  activeGenerationControllers.set(sessionId, generationController);
  broadcastChatSessions();
  const sessionRuntime = getChatRuntime(sessionId);
  try {
    await sessionRuntime.ready;
  } catch (err: any) {
    activeGenerationControllers.delete(sessionId);
    return res.status(500).json({ error: err.message });
  }
  const sessionAgent = sessionRuntime.engine;
  const effectivePlanMode = typeof planMode === 'boolean' ? planMode : agent.getConfig().planMode;
  sessionAgent.updateConfig({ planMode: effectivePlanMode });

  const modelMessage = attachments.length
    ? `${effectiveMessage}\n\nThe user attached the following text files. Use their contents to answer the request.\n\n${attachments
        .map((file: any) => `<attached_file name=${JSON.stringify(file.name)}>\n${file.content}\n</attached_file>`)
        .join('\n\n')}`
    : effectiveMessage;

  // Respond immediately — streaming events are delivered via Socket.IO (cross-platform, no HTTP buffering)
  res.status(202).json({ success: true });

  // All stream events go to the session room via Socket.IO
  const sendEvent = (event: string, data: any) => {
    io.to(`session:${sessionId}`).emit('chat:stream', { sessionId, event, data });
  };

  // Intercept /compact command
  if (message.trim().toLowerCase() === '/compact') {
    try {
      sendEvent('chunk', { chunk: '⚡ Compacting conversation context with Ollama...' });
      const compactRes = await sessionAgent.compactContext();
      if (compactRes.success && compactRes.message) {
        saveChatSession(sessionId, sessionAgent);
        const fullMessages = sessionAgent.getContextManager().getMessages();
        sendEvent('context_compacted', {
          message: compactRes.message,
          context: compactRes.context,
          messages: fullMessages,
        });
        sendEvent('done', {
          fullText: compactRes.message.displayContent || compactRes.message.content,
          context: compactRes.context,
        });
      } else {
        sendEvent('error', { error: compactRes.reason || 'Context is already minimal.' });
      }
    } catch (err: any) {
      sendEvent('error', { error: err.message });
    } finally {
      if (activeGenerationControllers.get(sessionId) === generationController) activeGenerationControllers.delete(sessionId);
      broadcastChatSessions();
    }
    return;
  }

  // Checkpoint: create a new entry for this prompt turn
  const promptId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const currentCheckpoint: CheckpointEntry = {
    promptId,
    promptText: typeof message === 'string' ? message.slice(0, 200) : '',
    timestamp: Date.now(),
    snapshots: [],
  };
  const snapshotCache = new Map<string, string | null>(); // absolute path -> original content

  const captureSnapshotByPath = async (absPath: string) => {
    if (snapshotCache.has(absPath)) return; // already captured for this turn
    let before: string | null = null;
    try {
      const stat = await fs.stat(absPath);
      if (stat.isDirectory()) {
        const entries = await fs.readdir(absPath, { recursive: true, withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile()) {
            const filePath = path.join(entry.path || (entry as any).parentPath || absPath, entry.name);
            await captureSnapshotByPath(filePath);
          }
        }
        return;
      }
      before = await fs.readFile(absPath, 'utf8');
    } catch (_) {
      before = null; // file didn't exist
    }
    snapshotCache.set(absPath, before);
    currentCheckpoint.snapshots.push({ path: absPath, before });
  };

  const captureSnapshot = async (name: string, args: Record<string, any>) => {
    // Determine the absolute file path being modified
    const workingDir = sessionAgent.getConfig().workingDir || process.cwd();
    const relativePath = args.relative_path || args.file_path || '';
    if (!relativePath) return;
    const absPath = path.isAbsolute(relativePath) ? relativePath : path.join(workingDir, relativePath);
    await captureSnapshotByPath(absPath);
  };

  const captureCommandSnapshot = async (command: string) => {
    if (!command) return;
    const workingDir = sessionAgent.getConfig().workingDir || process.cwd();
    const tokens = command.split(/\s+/).filter((t) => t && !t.startsWith('-'));
    for (const token of tokens) {
      const cleanToken = token.replace(/^['"]|['"]$/g, '');
      if (!cleanToken) continue;
      const absPath = path.isAbsolute(cleanToken) ? cleanToken : path.join(workingDir, cleanToken);
      try {
        await fs.access(absPath);
        await captureSnapshotByPath(absPath);
      } catch (_) {
        // file doesn't exist yet
      }
    }
  };

  // Intercept mutating tools to pause & ask for approval when required
  const executor = sessionAgent.getToolExecutor();
  const originalExecuteCommand = executor.executeCommand.bind(executor);
  const originalExecuteTool = executor.executeTool.bind(executor);

  executor.executeTool = async (name: string, args: Record<string, any>, onProgress?: (progress: any) => void) => {
    if (name === 'start_terminal_session' && args.command) {
      await captureCommandSnapshot(args.command);
    }
    if (
      name === 'start_terminal_session' &&
      terminalRequireConfirm &&
      !isCommandWhitelisted(args.command || '', allowedCommandsState)
    ) {
      sendEvent('tool_approval_required', { name, args });
      const { decision, reason } = await new Promise<ApprovalDecisionPayload>((resolve) => {
        pendingApprovalResolves.set(sessionId, resolve);
      });
      if (decision === 'reject') {
        const msg = reason ? `Terminal session rejected by user: "${reason}"` : 'Terminal session execution rejected by user in Web UI.';
        return {
          error: msg,
          command: args.command,
          cancelled: true,
        };
      }
    }
    if (['edit_file', 'replace_file', 'create_file', 'apply_patch'].includes(name)) {
      // Always snapshot before writing (for checkpoint revert)
      await captureSnapshot(name, args);

      if (fileEditMode === 'confirm') {
        // Per-edit approval flow
        let diff: FileDiff | undefined = undefined;
        try {
          diff = await executor.previewFileDiff(name, args);
        } catch (_) {}

        sendEvent('tool_approval_required', { name, args, diff });
        const { decision, reason } = await new Promise<ApprovalDecisionPayload>((resolve) => {
          pendingApprovalResolves.set(sessionId, resolve);
        });
        if (decision === 'reject') {
          const msg = reason ? `File edit rejected by user: "${reason}"` : 'File edit rejected by user in Web UI.';
          return {
            error: msg,
            file_path: args.relative_path,
            cancelled: true,
          };
        }
      }
      // fileEditMode === 'auto' or 'batch': execute immediately
      // (batch mode snapshots already captured above; review card shown after turn)
    }
    return originalExecuteTool(name, args, onProgress);
  };

  executor.executeCommand = async (command: string) => {
    await captureCommandSnapshot(command);
    if (terminalRequireConfirm && !isCommandWhitelisted(command, allowedCommandsState)) {
      // Notify client to show approval card
      sendEvent('tool_approval_required', { name: 'execute_command', args: { command } });
      // Wait for UI approval
      const { decision, reason } = await new Promise<ApprovalDecisionPayload>((resolve) => {
        pendingApprovalResolves.set(sessionId, resolve);
      });
      if (decision === 'reject') {
        const msg = reason ? `Execution rejected by user: "${reason}"` : 'Execution cancelled by user in Web UI.';
        return {
          command,
          stdout: '',
          stderr: msg,
          exitCode: 1,
          error: msg,
          cancelled: true,
        };
      }
    }
    return originalExecuteCommand(command);
  };

  try {
    const sendCallbacks: AgentSendMessageOptions = {
      userDisplayContent: message,
      userAttachments: attachments,
      userImages: rawImagesBase64,
      userImageAttachments: imageAttachments,
      selectedSkills: selectedSkills.length > 0 ? selectedSkills : undefined,
      onChunk: (chunk) => {
        sendEvent('chunk', { chunk });
      },
      onThinkingChunk: (thinkingChunk) => {
        sendEvent('thinking_chunk', { chunk: thinkingChunk });
      },
      onMessageAdded: (msg) => {
        if (msg.role === 'user' && currentCheckpoint.promptId !== msg.id) {
          currentCheckpoint.promptId = msg.id;
        }
        saveChatSession(sessionId, sessionAgent);
        sendEvent('message_added', msg);
      },
      onMessageUpdated: (msg) => {
        saveChatSession(sessionId, sessionAgent);
        sendEvent('message_updated', msg);
      },
      onContextCompacted: ({ message, context, messages }) => {
        saveChatSession(sessionId, sessionAgent);
        sendEvent('context_compacted', { message, context, messages });
      },
      onToolStream: (name, argsText) => {
        activeToolStates.set(sessionId, { name, args: { _streaming: true, _rawText: argsText } });
        sendEvent('tool_stream', { name, argsText });
      },
      onToolStart: (name, args) => {
        activeToolStates.set(sessionId, { name, args });
        sendEvent('tool_start', { name, args });
        sendEvent('context_update', sessionAgent.getContextManager().getContextInfo());
      },
      onToolProgress: (name, progress) => {
        const state = activeToolStates.get(sessionId);
        if (state) state.progress = progress;
        sendEvent('tool_progress', { name, progress });
      },
      onToolEnd: (name, result) => {
        activeToolStates.delete(sessionId);
        sendEvent('tool_end', { name, result });
        sendEvent('context_update', sessionAgent.getContextManager().getContextInfo());
        if (name.includes('terminal') || name === 'execute_command') {
          broadcastTerminalSessions();
        }
      },
      onModelResponse: (metrics) => {
        sendEvent('model_response', { metrics });
        sendEvent('context_update', sessionAgent.getContextManager().getContextInfo());
      },
      onEvalCount: (evalCount) => {
        sendEvent('eval_count_update', { evalCount });
      },
      onMaxLoopsReached: (limit) => {
        sendEvent('max_loops_reached', { maxLoops: limit });
      },
      signal: generationController.signal,
    };
    const finalContent = isDeepResearchRegeneration
      ? await sessionAgent.regenerateDeepResearchAnswer(regenerateFromToolMessageId, sendCallbacks)
      : await sessionAgent.sendMessage(modelMessage, sendCallbacks);

    // --- Filter out unchanged files (where before === after) ---
    const verifiedSnapshots: typeof currentCheckpoint.snapshots = [];
    for (const snap of currentCheckpoint.snapshots) {
      let after: string | null = null;
      try { after = await fs.readFile(snap.path, 'utf8'); } catch (_) { after = null; }
      if (snap.before !== after) {
        verifiedSnapshots.push(snap);
      }
    }
    currentCheckpoint.snapshots = verifiedSnapshots;

    // --- Save checkpoint ---
    const existing = sessionCheckpoints.get(sessionId) ?? [];
    if (currentCheckpoint.snapshots.length > 0) {
      existing.push(currentCheckpoint);
      sessionCheckpoints.set(sessionId, existing);
      sendEvent('checkpoint_saved', {
        promptId: currentCheckpoint.promptId,
        promptText: currentCheckpoint.promptText,
        timestamp: currentCheckpoint.timestamp,
        snapshotCount: currentCheckpoint.snapshots.length,
        snapshotPaths: currentCheckpoint.snapshots.map((s) => s.path),
      });
    }

    // --- Batch review: emit changed-files event (non-blocking) ---
    if (fileEditMode === 'batch' && currentCheckpoint.snapshots.length > 0 && !generationController.signal.aborted) {
      const changedFiles = await Promise.all(
        currentCheckpoint.snapshots.map(async (snap) => {
          let after: string | null = null;
          try { after = await fs.readFile(snap.path, 'utf8'); } catch (_) { after = null; }
          return { path: snap.path, before: snap.before, after };
        }),
      );
      sendEvent('batch_review_ready', { promptId: currentCheckpoint.promptId, files: changedFiles });
    }

    sendEvent('context_update', sessionAgent.getContextManager().getContextInfo());
    sendEvent('done', { content: finalContent });
  } catch (err: any) {
    if (err?.name === 'AbortError' || generationController.signal.aborted) {
      sendEvent('cancelled', { message: 'Generation cancelled.' });
    } else {
      sendEvent('error', { error: err.message });
    }
  } finally {
    // Restore original executor
    executor.executeTool = originalExecuteTool;
    executor.executeCommand = originalExecuteCommand;
    pendingApprovalResolves.delete(sessionId);
    activeToolStates.delete(sessionId);
    if (activeGenerationControllers.get(sessionId) === generationController) activeGenerationControllers.delete(sessionId);
    saveChatSession(sessionId, sessionAgent);
    broadcastChatSessions();
    // HTTP response was already sent (202) — no res.end() needed
  }
});

// GET /api/benchmark/testcases - List defined benchmark tasks
app.get('/api/benchmark/testcases', (req, res) => {
  res.json({ testCases: BENCHMARK_TEST_CASES });
});

// GET /api/benchmark/frameworks - Check host config status for framework adapters
app.get('/api/benchmark/frameworks', (_req, res) => {
  const home = os.homedir();
  const hostConfigs: Record<string, { exists: boolean; path: string }> = {
    pi: {
      exists: fsSync.existsSync(path.join(home, '.pi')),
      path: '~/.pi',
    },
    opencode: {
      exists: fsSync.existsSync(path.join(home, '.config', 'opencode')),
      path: '~/.config/opencode',
    },
    'claude-code': {
      exists: fsSync.existsSync(path.join(home, '.claude')),
      path: '~/.claude',
    },
    hermes: {
      exists: fsSync.existsSync(path.join(home, '.hermes')),
      path: '~/.hermes',
    },
    openclaw: {
      exists: fsSync.existsSync(path.join(home, '.openclaw')),
      path: '~/.openclaw',
    },
  };
  res.json({ success: true, hostConfigs });
});

// GET /api/benchmark/docker-status - Check Docker daemon and benchmark image availability
app.get('/api/benchmark/docker-status', async (_req, res) => {
  const execAsync = promisify(exec);
  try {
    await execAsync('docker info', { timeout: 5000 });
  } catch {
    res.json({ success: true, dockerAvailable: false, imageAvailable: false, imageName: BENCHMARK_DOCKER_IMAGE });
    return;
  }
  let imageAvailable = false;
  try {
    await execAsync(`docker image inspect ${BENCHMARK_DOCKER_IMAGE}`, { timeout: 5000 });
    imageAvailable = true;
  } catch {
    // image not built yet
  }
  res.json({ success: true, dockerAvailable: true, imageAvailable, imageName: BENCHMARK_DOCKER_IMAGE });
});

// POST /api/benchmark/docker-build - Build (or rebuild) the benchmark Docker image, streaming output as SSE
app.post('/api/benchmark/docker-build', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (type: string, data: Record<string, unknown>) => {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const child = spawn(
    'docker',
    ['build', '--file', 'Dockerfile.benchmark', '--tag', BENCHMARK_DOCKER_IMAGE, '.'],
    { cwd: BENCHMARK_PROJECT_ROOT },
  );

  const handleData = (chunk: Buffer) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      if (line.trim()) sendEvent('log', { line });
    }
  };

  child.stdout.on('data', handleData);
  child.stderr.on('data', handleData);

  child.on('close', (code) => {
    if (code === 0) {
      sendEvent('done', { success: true });
    } else {
      sendEvent('error', { success: false, error: `docker build exited with code ${code}` });
    }
    res.end();
  });

  child.on('error', (err) => {
    sendEvent('error', { success: false, error: err.message });
    res.end();
  });

  req.on('close', () => child.kill());
});

app.get('/api/benchmark/definitions', async (_req, res) => {
  try {
    res.json({ success: true, definitions: await listBenchmarkDefinitions() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/benchmark/definitions', async (req, res) => {
  try {
    const definition = await createBenchmarkDefinition(req.body);
    res.status(201).json({ success: true, definition });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.put('/api/benchmark/definitions/:id', async (req, res) => {
  try {
    const definition = await updateBenchmarkDefinition(req.params.id, req.body);
    res.json({ success: true, definition });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/benchmark/definitions/:id', async (req, res) => {
  try {
    await deleteBenchmarkDefinition(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

const resolveRequestedBenchmark = async (body: Record<string, any>): Promise<{
  definition: BenchmarkDefinition;
  tests: BenchmarkTestCase[];
  snapshot: BenchmarkSnapshot;
}> => {
  if (typeof body.benchmarkId !== 'string' || !body.benchmarkId) {
    throw new Error('Parameter "benchmarkId" is required.');
  }
  const definition = await getBenchmarkDefinition(body.benchmarkId);
  const tests = resolveBenchmarkTests(definition);
  return {
    definition,
    tests,
    snapshot: {
      definitionId: definition.id,
      definitionName: definition.name,
      definitionType: definition.type,
      definitionVersion: definition.version,
      testIds: [...definition.testIds],
      suiteHash: createBenchmarkSuiteHash(definition.testIds),
    },
  };
};

const parseBenchmarkOutput = (body: Record<string, any>) => ({
  save: body.saveResults !== false,
  runName: typeof body.runName === 'string' ? body.runName.trim().slice(0, 100) : '',
  directory: typeof body.outputDirectory === 'string' && body.outputDirectory.trim()
    ? path.resolve(body.outputDirectory.trim())
    : DEFAULT_BENCHMARK_OUTPUT_DIR,
});

// GET /api/benchmark/runs - Discover portable reports in a benchmark output directory
app.get('/api/benchmark/runs', async (req, res) => {
  const directory = typeof req.query.directory === 'string' && req.query.directory.trim()
    ? path.resolve(req.query.directory.trim())
    : DEFAULT_BENCHMARK_OUTPUT_DIR;
  try {
    const runs = await listSavedBenchmarkRuns(directory);
    res.json({ success: true, directory, defaultDirectory: DEFAULT_BENCHMARK_OUTPUT_DIR, projectRoot: BENCHMARK_PROJECT_ROOT, runs });
  } catch (err: any) {
    res.status(400).json({ success: false, directory, defaultDirectory: DEFAULT_BENCHMARK_OUTPUT_DIR, projectRoot: BENCHMARK_PROJECT_ROOT, error: err.message });
  }
});

app.get('/api/benchmark/report', async (req, res) => {
  const runId = typeof req.query.runId === 'string' ? req.query.runId : '';
  if (!runId || path.basename(runId) !== runId) {
    return res.status(400).send('Invalid benchmark run ID.');
  }
  const directory = typeof req.query.directory === 'string' && req.query.directory.trim()
    ? path.resolve(req.query.directory.trim())
    : DEFAULT_BENCHMARK_OUTPUT_DIR;
  const htmlPath = path.join(directory, runId, 'index.html');
  try {
    await fs.access(htmlPath);
    res.sendFile(htmlPath);
  } catch (_) {
    res.status(404).send('Benchmark report not found.');
  }
});

app.delete('/api/benchmark/runs/:runId', async (req, res) => {
  const directory = typeof req.query.directory === 'string' && req.query.directory.trim()
    ? path.resolve(req.query.directory.trim())
    : DEFAULT_BENCHMARK_OUTPUT_DIR;
  try {
    const deletedDirectory = await deleteSavedBenchmarkRun(req.params.runId, directory);
    res.json({ success: true, runId: req.params.runId, deletedDirectory });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

const parseBenchmarkAgentConfig = (value: unknown): BenchmarkAgentConfig => {
  if (!value || typeof value !== 'object') return {};
  const input = value as Record<string, unknown>;
  const config: BenchmarkAgentConfig = {};
  if (typeof input.temperature === 'number' && input.temperature >= 0 && input.temperature <= 1) config.temperature = input.temperature;
  if (typeof input.systemPrompt === 'string' && input.systemPrompt.trim()) config.systemPrompt = input.systemPrompt;
  if (typeof input.showWorkingDirInfo === 'boolean') config.showWorkingDirInfo = input.showWorkingDirInfo;
  if (typeof input.contextWindow === 'number' && Number.isInteger(input.contextWindow) && input.contextWindow >= 1024) config.contextWindow = input.contextWindow;
  if (typeof input.maxLoops === 'number' && Number.isInteger(input.maxLoops) && input.maxLoops >= 0 && input.maxLoops <= 50) config.maxLoops = input.maxLoops;
  if (typeof input.enableThinking === 'boolean') config.enableThinking = input.enableThinking;
  if (input.complexityProfile === 'simple' || input.complexityProfile === 'medium' || input.complexityProfile === 'advanced') {
    config.complexityProfile = input.complexityProfile;
  }
  if (input.pruningConfig && typeof input.pruningConfig === 'object') {
    const pruning = input.pruningConfig as Record<string, unknown>;
    const current = agent.getContextManager().getPruningConfig();
    config.pruningConfig = {
      enabled: typeof pruning.enabled === 'boolean' ? pruning.enabled : current.enabled,
      pruneSupersededReads: typeof pruning.pruneSupersededReads === 'boolean' ? pruning.pruneSupersededReads : current.pruneSupersededReads,
      invalidateOnMutation: typeof pruning.invalidateOnMutation === 'boolean' ? pruning.invalidateOnMutation : current.invalidateOnMutation,
      enableToolTTL: typeof pruning.enableToolTTL === 'boolean' ? pruning.enableToolTTL : current.enableToolTTL,
      terminalOutputTTLTurns: typeof pruning.terminalOutputTTLTurns === 'number' && Number.isInteger(pruning.terminalOutputTTLTurns) && pruning.terminalOutputTTLTurns >= 0 ? pruning.terminalOutputTTLTurns : current.terminalOutputTTLTurns,
      webOutputTTLTurns: typeof pruning.webOutputTTLTurns === 'number' && Number.isInteger(pruning.webOutputTTLTurns) && pruning.webOutputTTLTurns >= 0 ? pruning.webOutputTTLTurns : current.webOutputTTLTurns,
    };
  }
  if (input.enabledTools && typeof input.enabledTools === 'object' && !Array.isArray(input.enabledTools)) {
    const rawTools = input.enabledTools as Record<string, unknown>;
    config.enabledTools = Object.fromEntries(
      Object.entries(rawTools)
        .filter(([, v]) => typeof v === 'boolean')
        .map(([k, v]) => [k, v as boolean])
    );
  }
  if (typeof input.framework === 'string' && input.framework.trim()) config.framework = input.framework.trim();
  if (typeof input.mountHostConfig === 'boolean') config.mountHostConfig = input.mountHostConfig;
  if (typeof input.frameworkConfigPath === 'string' && input.frameworkConfigPath.trim()) config.frameworkConfigPath = input.frameworkConfigPath.trim();
  return config;
};

const parseBenchmarkAttempts = (value: unknown): number => {
  const attempts = typeof value === 'number' ? value : Number(value ?? 3);
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 10) {
    throw new Error('Benchmark attempts per case must be an integer between 1 and 10.');
  }
  return attempts;
};

const parseBenchmarkParallelism = (value: unknown): number => {
  const parallelism = typeof value === 'number' ? value : Number(value ?? 1);
  if (!Number.isInteger(parallelism) || parallelism < 1 || parallelism > 10) {
    throw new Error('Benchmark parallelism must be an integer between 1 and 10.');
  }
  return parallelism;
};

// POST /api/benchmark/run - Synchronous named benchmark run
app.post('/api/benchmark/run', async (req, res) => {
  const targetModel = req.body.model || agent.getConfig().model;
  const targetHost = req.body.host || agent.getConfig().ollamaHost;
  const benchmarkAgentConfig = parseBenchmarkAgentConfig(req.body.agentConfig);
  const output = parseBenchmarkOutput(req.body);

  try {
    const { tests, snapshot } = await resolveRequestedBenchmark(req.body);
    const attemptsPerCase = parseBenchmarkAttempts(req.body.attemptsPerCase);
    const parallelism = parseBenchmarkParallelism(req.body.parallelism);
    const report = await runBenchmarkSuite(targetModel, targetHost, undefined, tests, agent.getOllamaToken(), undefined, undefined, benchmarkAgentConfig, attemptsPerCase, snapshot, parallelism);
    const savedRun = output.save
      ? await saveBenchmarkReport(report, output.directory, { ...benchmarkAgentConfig, model: targetModel, ollamaHost: targetHost }, output.runName)
      : undefined;
    res.json({ success: true, report, savedRun });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/benchmark/run-single - Execute single test case 1-by-1 (with optional SSE streaming)
app.post('/api/benchmark/run-single', async (req, res) => {
  const { testId, model, host, stream } = req.body;
  if (!testId) {
    return res.status(400).json({ success: false, error: 'Parameter "testId" is required.' });
  }

  const isStream = stream === true || req.headers.accept === 'text/event-stream';
  if (isStream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // Disable Nagle's algorithm for low-latency SSE on Windows
    res.socket?.setNoDelay(true);
  }

  const sendEvent = (event: string, data: any) => {
    if (isStream && !res.writableEnded && !res.destroyed) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      (res as any).flush?.();
    }
  };

  const targetModel = model || agent.getConfig().model;
  const targetHost = host || agent.getConfig().ollamaHost;
  const benchmarkAgentConfig = parseBenchmarkAgentConfig(req.body.agentConfig);
  const singleController = new AbortController();

  res.on('close', () => {
    if (!res.writableEnded) {
      singleController.abort();
    }
  });

  try {
    const attemptsPerCase = parseBenchmarkAttempts(req.body.attemptsPerCase);
    const parallelism = req.body.parallelism !== undefined ? parseBenchmarkParallelism(req.body.parallelism) : 1;
    const testCase = BENCHMARK_TEST_CASES.find((candidate) => candidate.id === testId);
    if (!testCase) {
      if (isStream) {
        sendEvent('error', { error: `Test case "${testId}" not found.` });
        return res.end();
      }
      return res.status(404).json({ success: false, error: `Test case "${testId}" not found.` });
    }

    if (isStream) {
      sendEvent('test_start', { current: 1, total: 1, test: { id: testCase.id, name: testCase.name, category: testCase.category } });
    }

    const trace = await runBenchmarkCase(
      testCase,
      targetModel,
      targetHost,
      agent.getOllamaToken(),
      singleController.signal,
      benchmarkAgentConfig,
      attemptsPerCase,
      undefined,
      parallelism,
      (step) => sendEvent('test_step', { ...step, testId })
    );

    if (isStream) {
      sendEvent('test_complete', { current: 1, total: 1, trace });
      res.end();
    } else {
      res.json({ success: true, trace });
    }
  } catch (err: any) {
    if (singleController.signal.aborted) {
      if (isStream) sendEvent('cancelled', { message: 'Aborted by user' });
      else if (!res.writableEnded) res.status(499).json({ success: false, error: 'Benchmark single test aborted by user.' });
      return;
    }
    if (isStream) {
      sendEvent('error', { error: err.message });
      res.end();
    } else {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

// POST /api/benchmark/run-stream - Real-time SSE named benchmark stream
app.post('/api/benchmark/run-stream', async (req, res) => {
  const targetModel = req.body.model || agent.getConfig().model;
  const targetHost = req.body.host || agent.getConfig().ollamaHost;
  const benchmarkAgentConfig = parseBenchmarkAgentConfig(req.body.agentConfig);
  const output = parseBenchmarkOutput(req.body);
  let requestedBenchmark;
  try {
    requestedBenchmark = await resolveRequestedBenchmark(req.body);
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
  const { tests, snapshot } = requestedBenchmark;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // Disable Nagle's algorithm for low-latency SSE on Windows
  res.socket?.setNoDelay(true);
  const benchmarkController = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) benchmarkController.abort();
  });

  const sendEvent = (event: string, data: any) => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      (res as any).flush?.();
    }
  };

  try {
    const attemptsPerCase = parseBenchmarkAttempts(req.body.attemptsPerCase);
    const parallelism = parseBenchmarkParallelism(req.body.parallelism);
    const report = await runBenchmarkSuite(
      targetModel,
      targetHost,
      (current, total, trace) => {
        sendEvent('test_complete', { current, total, trace });
      },
      tests,
      agent.getOllamaToken(),
      (current, total, testCase) => {
        sendEvent('test_start', {
          current,
          total,
          test: { id: testCase.id, name: testCase.name, category: testCase.category },
        });
      },
      benchmarkController.signal,
      benchmarkAgentConfig,
      attemptsPerCase,
      snapshot,
      parallelism,
      (step) => sendEvent('test_step', step),
    );

    let savedRun;
    let saveError;
    if (output.save) {
      try {
        savedRun = await saveBenchmarkReport(report, output.directory, {
          ...benchmarkAgentConfig,
          model: targetModel,
          ollamaHost: targetHost,
        }, output.runName);
      } catch (err: any) {
        saveError = err.message;
      }
    }
    sendEvent('benchmark_done', { report, savedRun, saveError });
  } catch (err: any) {
    if (benchmarkController.signal.aborted || err?.name === 'AbortError') {
      sendEvent('cancelled', { message: 'Benchmark stopped.' });
    } else {
      sendEvent('error', { error: err.message });
    }
  } finally {
    res.end();
  }
});

// OpenAI API Compatibility Endpoints (for official benchmark CLI harnesses like TerminalBench 2.0 / SWE-bench)
app.get('/v1/models', (req, res) => handleOpenAiModels(agent, req, res));
app.post('/v1/chat/completions', (req, res) => handleOpenAiChatCompletions(agent, req, res));

// In production the API server also hosts the built React application.
const clientDistDirectory = path.resolve(process.env.CLIENT_DIST_DIR || path.join(process.cwd(), 'dist/client'));
const clientIndexPath = path.join(clientDistDirectory, 'index.html');
if (fsSync.existsSync(clientIndexPath)) {
  app.use(express.static(clientDistDirectory));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/v1/') || !req.accepts('html')) return next();
    res.sendFile(clientIndexPath);
  });
}

httpServer.listen(PORT, () => {
  console.log(`\n🚀 Server listening on http://localhost:${PORT}`);
  console.log(`🔌 Agent configured for Ollama host: ${agent.getConfig().ollamaHost}`);
  console.log(`📁 Active Working Directory: ${agent.getConfig().workingDir}\n`);
});
