import express from 'express';
import cors from 'cors';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { Server as SocketIOServer } from 'socket.io';
import { AgentEngine } from '../core/agent.js';
import { ContextManager } from '../core/context.js';
import { TOOL_DEFINITIONS } from '../core/tools.js';
import { BENCHMARK_TEST_CASES } from '../benchmark/cases/index.js';
import { createBenchmarkSuiteHash } from '../benchmark/cases/benchmarks.js';
import type { BenchmarkDefinition, BenchmarkTestCase } from '../benchmark/cases/index.js';
import { runBenchmarkCase, runBenchmarkSuite } from '../benchmark/runtime/runner.js';
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

import fsSync from 'node:fs';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: true, credentials: true },
});
const PORT = process.env.PORT || 3001;

const CONFIG_FILE_PATH = path.join(os.homedir(), '.local-model-chat-config.json');
const CHAT_SESSIONS_FILE_PATH = path.join(os.homedir(), '.local-model-chat-sessions.json');

function getInitialPersistedConfig(): {
  workingDir: string;
  ollamaHost: string;
  ollamaToken?: string;
  model: string;
  allowedCommands: string[];
  terminalMode: 'confirm' | 'auto';
  fileEditMode: 'confirm' | 'auto';
  enableThinking: boolean;
  complexityProfile: 'simple' | 'medium' | 'advanced';
} {
  let workingDir = process.cwd();
  let ollamaHost = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
  let ollamaToken = process.env.OLLAMA_TOKEN;
  let model = process.env.OLLAMA_MODEL || 'qwen3.5:9b';
  let allowedCommands = [...DEFAULT_COMMAND_WHITELIST];
  let terminalMode: 'confirm' | 'auto' = 'confirm';
  let fileEditMode: 'confirm' | 'auto' = 'confirm';
  let enableThinking = true;
  let complexityProfile: 'simple' | 'medium' | 'advanced' = 'simple';

  try {
    if (fsSync.existsSync(CONFIG_FILE_PATH)) {
      const data = fsSync.readFileSync(CONFIG_FILE_PATH, 'utf8');
      const parsed = JSON.parse(data);
      if (parsed.workingDir && typeof parsed.workingDir === 'string' && fsSync.existsSync(parsed.workingDir)) {
        workingDir = parsed.workingDir;
      }
      if (parsed.ollamaHost && typeof parsed.ollamaHost === 'string') {
        ollamaHost = parsed.ollamaHost;
      }
      if (parsed.ollamaToken !== undefined && typeof parsed.ollamaToken === 'string') {
        ollamaToken = parsed.ollamaToken;
      }
      if (parsed.model && typeof parsed.model === 'string') {
        model = parsed.model;
      }
      if (Array.isArray(parsed.allowedCommands)) {
        allowedCommands = parsed.allowedCommands;
      }
      if (parsed.terminalMode === 'confirm' || parsed.terminalMode === 'auto') {
        terminalMode = parsed.terminalMode;
      }
      if (parsed.fileEditMode === 'confirm' || parsed.fileEditMode === 'auto') {
        fileEditMode = parsed.fileEditMode;
      }
      if (typeof parsed.enableThinking === 'boolean') {
        enableThinking = parsed.enableThinking;
      }
      if (parsed.complexityProfile === 'simple' || parsed.complexityProfile === 'medium' || parsed.complexityProfile === 'advanced') {
        complexityProfile = parsed.complexityProfile;
      }
    }
  } catch (_) {}

  // Explicit environment configuration takes precedence over persisted UI settings.
  if (process.env.WORKING_DIR && fsSync.existsSync(process.env.WORKING_DIR)) workingDir = process.env.WORKING_DIR;
  if (process.env.OLLAMA_HOST) ollamaHost = process.env.OLLAMA_HOST;
  if (process.env.OLLAMA_TOKEN !== undefined) ollamaToken = process.env.OLLAMA_TOKEN;
  if (process.env.OLLAMA_MODEL) model = process.env.OLLAMA_MODEL;

  return { workingDir, ollamaHost, ollamaToken, model, allowedCommands, terminalMode, fileEditMode, enableThinking, complexityProfile };
}

function savePersistedConfig(updatedConfig: Record<string, any>) {
  try {
    let existing: Record<string, any> = {};
    if (fsSync.existsSync(CONFIG_FILE_PATH)) {
      existing = JSON.parse(fsSync.readFileSync(CONFIG_FILE_PATH, 'utf8'));
    }
    const merged = { ...existing, ...updatedConfig };
    fsSync.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(merged, null, 2), 'utf8');
  } catch (_) {}
}

app.use(cors());
app.use(express.json({ limit: '25mb' }));

const initialConfig = getInitialPersistedConfig();

// Initialize shared Agent Engine
const agent = new AgentEngine({
  model: initialConfig.model,
  ollamaHost: initialConfig.ollamaHost,
  ollamaToken: initialConfig.ollamaToken,
  workingDir: initialConfig.workingDir,
  enableThinking: initialConfig.enableThinking,
  complexityProfile: initialConfig.complexityProfile,
});

const chatSessions = new ChatSessionStore(CHAT_SESSIONS_FILE_PATH);
agent.getContextManager().setMessages(chatSessions.getActive().messages);

type ChatRuntime = { engine: AgentEngine; ready: Promise<void> };
const chatRuntimes = new Map<string, ChatRuntime>();

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
let fileEditRequireConfirm = initialConfig.fileEditMode === 'confirm';
let allowedCommandsState: string[] = initialConfig.allowedCommands;

const getPublicConfig = () => ({
  ...agent.getConfig(),
  ollamaTokenConfigured: agent.hasOllamaToken(),
  terminalMode: terminalRequireConfirm ? 'confirm' : 'auto',
  fileEditMode: fileEditRequireConfirm ? 'confirm' : 'auto',
  allowedCommands: allowedCommandsState,
});

type ApprovalDecisionPayload = { decision: 'approve' | 'reject'; reason?: string };
const pendingApprovalResolves = new Map<string, (payload: ApprovalDecisionPayload) => void>();
const activeGenerationControllers = new Map<string, AbortController>();

const saveChatSession = (sessionId: string, engine: AgentEngine = getChatRuntime(sessionId).engine) =>
  chatSessions.save(sessionId, engine.getContextManager().getMessages());
const getSessionContext = (sessionId: string) => {
  const session = chatSessions.getSession(sessionId);
  if (!session) return undefined;
  const context = new ContextManager(agent.getConfig().systemPrompt, agent.getContextManager().getTools(), { enabled: false });
  context.setMessages(session.messages);
  return context.getContextInfo();
};
const getChatSessionsState = () => ({
  sessions: chatSessions.list(),
  activeSessionId: chatSessions.getActiveId(),
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

// GET /api/models/running - Fetch currently loaded models in VRAM
app.get('/api/models/running', async (req, res) => {
  try {
    const runningModels = await agent.getRunningModels();
    res.json({ success: true, runningModels });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, runningModels: [] });
  }
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
    io.emit('system:metrics:error');
  } finally {
    metricsCollectionInFlight = false;
  }
}

io.on('connection', (socket) => {
  socket.emit('config:state', getConfigState());
  socket.emit('terminal:sessions', listAllTerminalSessions());
  void broadcastSystemMetrics();
  void broadcastRunningModels();
  if (!liveStateInterval) {
    liveStateInterval = setInterval(() => {
      broadcastTerminalSessions();
      void broadcastSystemMetrics();
      void broadcastRunningModels();
    }, 3000);
  }

  socket.on('terminal:sessions:request', () => {
    socket.emit('terminal:sessions', listAllTerminalSessions());
  });

  socket.on('models:running:request', () => {
    void broadcastRunningModels();
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
      return res.json({ success: true, name: modelName, details });
    } catch (err: any) {
      // If Ollama returns 404 (model not pulled or name missing tag), return success: false with error string (200 status)
      return res.json({ success: false, name: modelName, error: err.message });
    }
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

// GET /api/config - Get current configuration & context stats
app.get('/api/config', (req, res) => {
  res.json({
    config: getPublicConfig(),
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
    const stat = await fs.stat(resolvedPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ success: false, error: 'The selected path is not a directory.' });
    }
    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
    const directories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ name: entry.name, path: path.join(resolvedPath, entry.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const parent = path.dirname(resolvedPath);
    res.json({
      success: true,
      current: resolvedPath,
      parent: parent === resolvedPath ? null : parent,
      directories,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: `Cannot browse directory: ${err.message}` });
  }
});

// POST /api/config - Update configuration
app.post('/api/config', (req, res) => {
  const { model, systemPrompt, workingDir, showWorkingDirInfo, ollamaHost, ollamaToken, temperature, contextWindow, maxLoops } = req.body;

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

  const configUpdate = { model, systemPrompt, workingDir, showWorkingDirInfo, ollamaHost, ollamaToken, temperature, contextWindow, maxLoops };
  for (const { engine } of chatRuntimes.values()) engine.updateConfig(configUpdate);

  const currentConfig = agent.getConfig();
  savePersistedConfig({
    workingDir: currentConfig.workingDir,
    ollamaHost: currentConfig.ollamaHost,
    ollamaToken: agent.getOllamaToken(),
    model: currentConfig.model,
  });

  io.emit('config:state', getConfigState());

  res.json({
    success: true,
    config: getPublicConfig(),
    context: agent.getContextManager().getContextInfo(),
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
  res.json({ success: true, ...getChatSessionsState() });
});

// POST /api/chat/sessions - Save the current conversation and start a new one
app.post('/api/chat/sessions', (req, res) => {
  const session = chatSessions.create(req.body?.title, false);
  io.emit('chat:sessions', { sessions: chatSessions.list() });
  res.status(201).json({
    success: true,
    session,
    messages: [],
    context: getSessionContext(session.id),
    sessions: chatSessions.list(),
    activeSessionId: session.id,
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
  const { command, sessionId } = req.body || {};
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ success: false, error: 'command (string) is required.' });
  }
  const terminalManager = agent.getToolExecutor().getTerminalManager();
  const result = terminalManager.startSession(command, sessionId, agent.getConfig().workingDir);
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

// DELETE /api/terminal/sessions/:id - Terminate session
app.delete('/api/terminal/sessions/:id', (req, res) => {
  const terminalManager = findTerminalManager(req.params.id);
  if (!terminalManager) return res.status(404).json({ success: false, error: 'Terminal session not found.' });
  const result = terminalManager.terminateSession(req.params.id);
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
  agent.getContextManager().setPruningConfig(updates);
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

// POST /api/chat/tool-settings - Update tool approval preferences & max loops & thinking
app.post('/api/chat/tool-settings', (req, res) => {
  const { terminalMode, fileEditMode, allowedCommands, maxLoops, enableThinking, complexityProfile } = req.body;
  if (terminalMode === 'confirm' || terminalMode === 'auto') {
    terminalRequireConfirm = terminalMode === 'confirm';
  }
  if (fileEditMode === 'confirm' || fileEditMode === 'auto') {
    fileEditRequireConfirm = fileEditMode === 'confirm';
  }
  if (Array.isArray(allowedCommands)) {
    allowedCommandsState = allowedCommands.map((c) => String(c).trim()).filter(Boolean);
  }
  if (typeof maxLoops === 'number' && maxLoops >= 0 && maxLoops <= 50) {
    for (const { engine } of chatRuntimes.values()) engine.updateConfig({ maxLoops });
  }
  if (typeof enableThinking === 'boolean') {
    for (const { engine } of chatRuntimes.values()) engine.updateConfig({ enableThinking });
  }
  if (complexityProfile === 'simple' || complexityProfile === 'medium' || complexityProfile === 'advanced') {
    for (const { engine } of chatRuntimes.values()) engine.updateConfig({ complexityProfile });
  }

  savePersistedConfig({
    allowedCommands: allowedCommandsState,
    terminalMode: terminalRequireConfirm ? 'confirm' : 'auto',
    fileEditMode: fileEditRequireConfirm ? 'confirm' : 'auto',
    enableThinking: agent.getConfig().enableThinking,
    complexityProfile: agent.getConfig().complexityProfile,
  });

  io.emit('config:state', getConfigState());

  res.json({
    success: true,
    terminalRequireConfirm,
    fileEditRequireConfirm,
    allowedCommands: allowedCommandsState,
    config: getPublicConfig(),
  });
});

// POST /api/chat/cancel - Abort the active Ollama generation
app.post('/api/chat/cancel', (req, res) => {
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
  const activeGenerationController = activeGenerationControllers.get(sessionId);
  if (!activeGenerationController) {
    return res.status(409).json({ success: false, error: 'No active generation.' });
  }

  activeGenerationController.abort();
  const pendingApprovalResolve = pendingApprovalResolves.get(sessionId);
  if (pendingApprovalResolve) {
    pendingApprovalResolve({ decision: 'reject', reason: 'Generation cancelled by user' });
    pendingApprovalResolves.delete(sessionId);
  }
  res.json({ success: true });
});

// POST /api/chat - Stream chat completion via Server-Sent Events (SSE)
app.post('/api/chat', async (req, res) => {
  const { message, sessionId, attachments = [], imageAttachments = [] } = req.body;

  if (typeof sessionId !== 'string' || !chatSessions.getSession(sessionId)) {
    return res.status(404).json({ error: 'A valid chat session is required.' });
  }
  if (activeGenerationControllers.has(sessionId)) {
    return res.status(409).json({ error: 'This chat is already generating.' });
  }

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Field "message" is required.' });
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

  const generationController = new AbortController();
  activeGenerationControllers.set(sessionId, generationController);
  const sessionRuntime = getChatRuntime(sessionId);
  try {
    await sessionRuntime.ready;
  } catch (err: any) {
    activeGenerationControllers.delete(sessionId);
    return res.status(500).json({ error: err.message });
  }
  const sessionAgent = sessionRuntime.engine;

  const modelMessage = attachments.length
    ? `${message}\n\nThe user attached the following text files. Use their contents to answer the request.\n\n${attachments
        .map((file: any) => `<attached_file name=${JSON.stringify(file.name)}>\n${file.content}\n</attached_file>`)
        .join('\n\n')}`
    : message;

  // Setup Server-Sent Events headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Intercept /compact command
  if (message.trim().toLowerCase() === '/compact') {
    try {
      sendEvent('chunk', { chunk: '⚡ Compacting conversation context with Ollama...' });
      const compactRes = await sessionAgent.compactContext();
      if (compactRes.success && compactRes.message) {
        saveChatSession(sessionId, sessionAgent);
        sendEvent('message_added', compactRes.message);
        sendEvent('context_update', compactRes.context);
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
    }
    res.end();
    return;
  }
  res.on('close', () => {
    if (res.writableEnded || activeGenerationControllers.get(sessionId) !== generationController) return;
    generationController.abort();
    const pendingApprovalResolve = pendingApprovalResolves.get(sessionId);
    if (pendingApprovalResolve) {
      pendingApprovalResolve({ decision: 'reject', reason: 'Client disconnected' });
      pendingApprovalResolves.delete(sessionId);
    }
  });

  // Intercept mutating tools to pause & ask for approval when required
  const executor = sessionAgent.getToolExecutor();
  const originalExecuteCommand = executor.executeCommand.bind(executor);
  const originalExecuteTool = executor.executeTool.bind(executor);

  executor.executeTool = async (name: string, args: Record<string, any>) => {
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
    if ((name === 'edit_file' || name === 'replace_file') && fileEditRequireConfirm) {
      const diff = await executor.previewFileDiff(name, args);
      // An edit without a valid preview cannot change the file. Execute it
      // immediately so the tool error is returned to the model for correction
      // instead of asking the user to approve a guaranteed no-op.
      if (!diff) {
        return originalExecuteTool(name, args);
      }
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
    return originalExecuteTool(name, args);
  };

  executor.executeCommand = async (command: string) => {
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
    const finalContent = await sessionAgent.sendMessage(modelMessage, {
      userDisplayContent: message,
      userAttachments: attachments,
      userImages: rawImagesBase64,
      userImageAttachments: imageAttachments,
      onChunk: (chunk) => {
        sendEvent('chunk', { chunk });
      },
      onThinkingChunk: (thinkingChunk) => {
        sendEvent('thinking_chunk', { chunk: thinkingChunk });
      },
      onMessageAdded: (msg) => {
        sendEvent('message_added', msg);
      },
      onToolStart: (name, args) => {
        sendEvent('tool_start', { name, args });
      },
      onToolEnd: (name, result) => {
        sendEvent('tool_end', { name, result });
      },
      onMaxLoopsReached: (limit) => {
        sendEvent('max_loops_reached', { maxLoops: limit });
      },
      signal: generationController.signal,
    });

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
    if (activeGenerationControllers.get(sessionId) === generationController) activeGenerationControllers.delete(sessionId);
    saveChatSession(sessionId, sessionAgent);
    io.emit('chat:sessions', { sessions: chatSessions.list() });
    res.end();
  }
});

// GET /api/benchmark/testcases - List defined benchmark tasks
app.get('/api/benchmark/testcases', (req, res) => {
  res.json({ testCases: BENCHMARK_TEST_CASES });
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
  return config;
};

const parseBenchmarkAttempts = (value: unknown): number => {
  const attempts = typeof value === 'number' ? value : Number(value ?? 3);
  if (!Number.isInteger(attempts) || attempts < 3 || attempts > 10) {
    throw new Error('Benchmark attempts per case must be an integer between 3 and 10.');
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

// POST /api/benchmark/run-single - Execute single test case 1-by-1
app.post('/api/benchmark/run-single', async (req, res) => {
  const { testId, model, host } = req.body;
  if (!testId) {
    return res.status(400).json({ success: false, error: 'Parameter "testId" is required.' });
  }

  const targetModel = model || agent.getConfig().model;
  const targetHost = host || agent.getConfig().ollamaHost;
  const benchmarkAgentConfig = parseBenchmarkAgentConfig(req.body.agentConfig);

  try {
    const attemptsPerCase = parseBenchmarkAttempts(req.body.attemptsPerCase);
    const parallelism = parseBenchmarkParallelism(req.body.parallelism);
    const testCase = BENCHMARK_TEST_CASES.find((candidate) => candidate.id === testId);
    if (!testCase) return res.status(404).json({ success: false, error: `Test case "${testId}" not found.` });
    const trace = await runBenchmarkCase(testCase, targetModel, targetHost, agent.getOllamaToken(), undefined, benchmarkAgentConfig, attemptsPerCase, undefined, parallelism);
    res.json({ success: true, trace });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
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
  const benchmarkController = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) benchmarkController.abort();
  });

  const sendEvent = (event: string, data: any) => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
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
