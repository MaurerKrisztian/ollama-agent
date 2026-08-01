import express from 'express';
import cors from 'cors';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { AgentEngine } from '../core/agent.js';
import { TOOL_DEFINITIONS } from '../core/tools.js';
import { runBenchmarkSuite, runSingleBenchmarkTest } from '../benchmark/runner.js';
import { BENCHMARK_TEST_CASES, BenchmarkTestCase } from '../benchmark/testCases.js';
import { isCommandWhitelisted, DEFAULT_COMMAND_WHITELIST } from '../core/commandWhitelist.js';

import fsSync from 'node:fs';

const app = express();
const PORT = process.env.PORT || 3001;

const CONFIG_FILE_PATH = path.join(os.homedir(), '.local-model-chat-config.json');

function getInitialPersistedConfig(): {
  workingDir: string;
  ollamaHost: string;
  ollamaToken?: string;
  model: string;
  allowedCommands: string[];
  terminalMode: 'confirm' | 'auto';
  fileEditMode: 'confirm' | 'auto';
  enableThinking: boolean;
} {
  let workingDir = process.cwd();
  let ollamaHost = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
  let ollamaToken = process.env.OLLAMA_TOKEN;
  let model = 'qwen3.5:9b';
  let allowedCommands = [...DEFAULT_COMMAND_WHITELIST];
  let terminalMode: 'confirm' | 'auto' = 'confirm';
  let fileEditMode: 'confirm' | 'auto' = 'confirm';
  let enableThinking = true;

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
    }
  } catch (_) {}

  return { workingDir, ollamaHost, ollamaToken, model, allowedCommands, terminalMode, fileEditMode, enableThinking };
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
});

// Auto-load MCP configuration if available
agent.loadMcpConfig().catch(() => {});

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

// Per-session tool approval state
type ApprovalDecisionPayload = { decision: 'approve' | 'reject'; reason?: string };
let pendingApprovalResolve: ((payload: ApprovalDecisionPayload) => void) | null = null;
let activeGenerationController: AbortController | null = null;

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
    const parts = stdout.trim().split(',').map((p) => p.trim());
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
        const parts = stdout.trim().split(',').map((p) => p.trim());
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

// GET /api/system/metrics - Fetch live CPU, System RAM, and GPU utilization metrics
app.get('/api/system/metrics', async (_req, res) => {
  try {
    const cpuUtil = getCpuUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUtil = Number(((usedMem / totalMem) * 100).toFixed(1));
    const gpu = await getGpuMetrics();

    res.json({
      success: true,
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
    });
  } catch (_) {
    res.json({ success: false, error: 'Hardware metrics unavailable' });
  }
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

  agent.updateConfig({ model, systemPrompt, workingDir, showWorkingDirInfo, ollamaHost, ollamaToken, temperature, contextWindow, maxLoops });

  const currentConfig = agent.getConfig();
  savePersistedConfig({
    workingDir: currentConfig.workingDir,
    ollamaHost: currentConfig.ollamaHost,
    ollamaToken: agent.getOllamaToken(),
    model: currentConfig.model,
  });

  res.json({
    success: true,
    config: getPublicConfig(),
    context: agent.getContextManager().getContextInfo(),
  });
});

// GET /api/context - Get detailed context info (raw JSON & converted text)
app.get('/api/context', (req, res) => {
  res.json(agent.getContextManager().getContextInfo());
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
  res.json({ messages: agent.getContextManager().getMessages() });
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
  const terminalManager = agent.getToolExecutor().getTerminalManager();
  res.json({ success: true, sessions: terminalManager.listSessions() });
});

// GET /api/terminal/sessions/:id/output - Fetch log output for terminal session
app.get('/api/terminal/sessions/:id/output', (req, res) => {
  const terminalManager = agent.getToolExecutor().getTerminalManager();
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
  res.json({ success: true, session: result.session });
});

// POST /api/terminal/sessions/:id/input - Send stdin input to terminal session
app.post('/api/terminal/sessions/:id/input', (req, res) => {
  const { input } = req.body || {};
  if (input === undefined || typeof input !== 'string') {
    return res.status(400).json({ success: false, error: 'input (string) is required.' });
  }
  const terminalManager = agent.getToolExecutor().getTerminalManager();
  const result = terminalManager.sendInput(req.params.id, input);
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error });
  }
  res.json({ success: true });
});

// DELETE /api/terminal/sessions/:id - Terminate session
app.delete('/api/terminal/sessions/:id', (req, res) => {
  const terminalManager = agent.getToolExecutor().getTerminalManager();
  const result = terminalManager.terminateSession(req.params.id);
  if (!result.success) {
    return res.status(404).json({ success: false, error: result.error });
  }
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
  mcpManager.setGlobalEnabled(enabled);
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
    const result = await agent.loadMcpConfig(configPath);
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
  mcpManager.toggleTool(name, enabled);
  res.json({
    success: true,
    allToolDetails: mcpManager.getAllToolDetails(),
    servers: mcpManager.getServersStatus(),
  });
});

// POST /api/clear - Clear chat history context & terminal sessions
app.post('/api/clear', (req, res) => {
  agent.resetChat();
  const terminalManager = agent.getToolExecutor().getTerminalManager();
  terminalManager.clearAllSessions();
  res.json({
    success: true,
    context: agent.getContextManager().getContextInfo(),
  });
});

// POST /api/chat/rewind - Rewind context to a specific prompt message ID
app.post('/api/chat/rewind', (req, res) => {
  const { messageId } = req.body || {};
  if (typeof messageId !== 'string') {
    return res.status(400).json({ success: false, error: 'messageId string is required.' });
  }
  const result = agent.rewindToMessage(messageId);
  if (!result.success) {
    return res.status(404).json({ success: false, error: 'Message not found in context.' });
  }
  res.json({
    success: true,
    rewoundMessage: result.rewoundMessage,
    context: agent.getContextManager().getContextInfo(),
  });
});

// POST /api/chat/compact - Compact conversation history into a structured summary
app.post('/api/chat/compact', async (_req, res) => {
  try {
    const result = await agent.compactContext();
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.reason || 'Context cannot be compacted.' });
    }
    res.json({
      success: true,
      summary: result.summary,
      message: result.message,
      context: result.context,
      messages: agent.getContextManager().getMessages(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
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
  const { decision, reason } = req.body as { decision: 'approve' | 'reject'; reason?: string };
  if (pendingApprovalResolve) {
    pendingApprovalResolve({ decision, reason });
    pendingApprovalResolve = null;
    res.json({ success: true });
  } else {
    res.status(400).json({ success: false, error: 'No pending approval.' });
  }
});

// POST /api/chat/tool-settings - Update tool approval preferences & max loops & thinking
app.post('/api/chat/tool-settings', (req, res) => {
  const { terminalMode, fileEditMode, allowedCommands, maxLoops, enableThinking } = req.body;
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
    agent.updateConfig({ maxLoops });
  }
  if (typeof enableThinking === 'boolean') {
    agent.updateConfig({ enableThinking });
  }

  savePersistedConfig({
    allowedCommands: allowedCommandsState,
    terminalMode: terminalRequireConfirm ? 'confirm' : 'auto',
    fileEditMode: fileEditRequireConfirm ? 'confirm' : 'auto',
    enableThinking: agent.getConfig().enableThinking,
  });

  res.json({
    success: true,
    terminalRequireConfirm,
    fileEditRequireConfirm,
    allowedCommands: allowedCommandsState,
    config: getPublicConfig(),
  });
});

// POST /api/chat/cancel - Abort the active Ollama generation
app.post('/api/chat/cancel', (_req, res) => {
  if (!activeGenerationController) {
    return res.status(409).json({ success: false, error: 'No active generation.' });
  }

  activeGenerationController.abort();
  if (pendingApprovalResolve) {
    pendingApprovalResolve({ decision: 'reject', reason: 'Generation cancelled by user' });
    pendingApprovalResolve = null;
  }
  res.json({ success: true });
});

// POST /api/chat - Stream chat completion via Server-Sent Events (SSE)
app.post('/api/chat', async (req, res) => {
  const { message, attachments = [], imageAttachments = [] } = req.body;

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
      const compactRes = await agent.compactContext();
      if (compactRes.success && compactRes.message) {
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
    }
    res.end();
    return;
  }
  const generationController = new AbortController();
  activeGenerationController = generationController;
  res.on('close', () => {
    if (res.writableEnded || activeGenerationController !== generationController) return;
    generationController.abort();
    if (pendingApprovalResolve) {
      pendingApprovalResolve({ decision: 'reject', reason: 'Client disconnected' });
      pendingApprovalResolve = null;
    }
  });

  // Intercept mutating tools to pause & ask for approval when required
  const executor = agent.getToolExecutor();
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
        pendingApprovalResolve = resolve;
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
        pendingApprovalResolve = resolve;
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
        pendingApprovalResolve = resolve;
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
    const finalContent = await agent.sendMessage(modelMessage, {
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

    sendEvent('context_update', agent.getContextManager().getContextInfo());
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
    pendingApprovalResolve = null;
    if (activeGenerationController === generationController) {
      activeGenerationController = null;
    }
    res.end();
  }
});

// GET /api/benchmark/testcases - List defined benchmark tasks
app.get('/api/benchmark/testcases', (req, res) => {
  res.json({ testCases: BENCHMARK_TEST_CASES });
});

// POST /api/benchmark/run - Synchronous benchmark run (optional category filter)
app.post('/api/benchmark/run', async (req, res) => {
  const targetModel = req.body.model || agent.getConfig().model;
  const targetHost = req.body.host || agent.getConfig().ollamaHost;
  const category = req.body.category as string | undefined;

  const tests: BenchmarkTestCase[] = category
    ? BENCHMARK_TEST_CASES.filter((t) => t.category === category)
    : BENCHMARK_TEST_CASES;

  try {
    const report = await runBenchmarkSuite(targetModel, targetHost, undefined, tests, agent.getOllamaToken());
    res.json({ success: true, report });
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

  try {
    const trace = await runSingleBenchmarkTest(testId, targetModel, targetHost, agent.getOllamaToken());
    res.json({ success: true, trace });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/benchmark/run-stream - Real-time SSE benchmark stream (optional category filter)
app.post('/api/benchmark/run-stream', async (req, res) => {
  const targetModel = req.body.model || agent.getConfig().model;
  const targetHost = req.body.host || agent.getConfig().ollamaHost;
  const category = req.body.category as string | undefined;

  const tests: BenchmarkTestCase[] = category
    ? BENCHMARK_TEST_CASES.filter((t) => t.category === category)
    : BENCHMARK_TEST_CASES;

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
    );

    sendEvent('benchmark_done', { report });
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

app.listen(PORT, () => {
  console.log(`\n🚀 Server listening on http://localhost:${PORT}`);
  console.log(`🔌 Agent configured for Ollama host: ${agent.getConfig().ollamaHost}`);
  console.log(`📁 Active Working Directory: ${agent.getConfig().workingDir}\n`);
});
