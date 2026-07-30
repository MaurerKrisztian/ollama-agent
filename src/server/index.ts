import express from 'express';
import cors from 'cors';
import { AgentEngine } from '../core/agent.js';
import { TOOL_DEFINITIONS } from '../core/tools.js';
import { runBenchmarkSuite, runSingleBenchmarkTest } from '../benchmark/runner.js';
import { BENCHMARK_TEST_CASES, BenchmarkTestCase } from '../benchmark/testCases.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize shared Agent Engine
const agent = new AgentEngine({
  model: 'qwen2.5-coder:7b',
  ollamaHost: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
  ollamaToken: process.env.OLLAMA_TOKEN,
  workingDir: process.cwd(),
});

const getPublicConfig = () => ({
  ...agent.getConfig(),
  ollamaTokenConfigured: agent.hasOllamaToken(),
});

// Per-session tool approval state
type ApprovalDecision = 'approve' | 'reject';
let pendingApprovalResolve: ((decision: ApprovalDecision) => void) | null = null;
let terminalRequireConfirm = true; // matches default toolSettings.terminalMode

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

// GET /api/config - Get current configuration & context stats
app.get('/api/config', (req, res) => {
  res.json({
    config: getPublicConfig(),
    context: agent.getContextManager().getContextInfo(),
  });
});

// POST /api/config - Update configuration
app.post('/api/config', (req, res) => {
  const { model, systemPrompt, workingDir, ollamaHost, ollamaToken, temperature } = req.body;

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

  agent.updateConfig({ model, systemPrompt, workingDir, ollamaHost, ollamaToken, temperature });

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

// GET /api/tools - List available agent tools
app.get('/api/tools', (req, res) => {
  res.json({
    tools: TOOL_DEFINITIONS,
    workingDir: agent.getConfig().workingDir,
  });
});

// POST /api/clear - Clear chat history context
app.post('/api/clear', (req, res) => {
  agent.resetChat();
  res.json({
    success: true,
    context: agent.getContextManager().getContextInfo(),
  });
});

// POST /api/chat/tool-approval - Approve or reject a pending tool execution
app.post('/api/chat/tool-approval', (req, res) => {
  const { decision } = req.body as { decision: ApprovalDecision };
  if (pendingApprovalResolve) {
    pendingApprovalResolve(decision);
    pendingApprovalResolve = null;
    res.json({ success: true });
  } else {
    res.status(400).json({ success: false, error: 'No pending approval.' });
  }
});

// POST /api/chat/tool-settings - Update tool approval preferences
app.post('/api/chat/tool-settings', (req, res) => {
  const { terminalMode } = req.body;
  if (terminalMode === 'confirm' || terminalMode === 'auto') {
    terminalRequireConfirm = terminalMode === 'confirm';
  }
  res.json({ success: true, terminalRequireConfirm });
});

// POST /api/chat - Stream chat completion via Server-Sent Events (SSE)
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Field "message" is required.' });
  }

  // Setup Server-Sent Events headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Intercept execute_command to pause & ask for approval when required
  const executor = agent.getToolExecutor();
  const originalExecuteCommand = executor.executeCommand.bind(executor);
  executor.executeCommand = async (command: string) => {
    if (terminalRequireConfirm) {
      // Notify client to show approval card
      sendEvent('tool_approval_required', { name: 'execute_command', args: { command } });
      // Wait for UI approval
      const decision = await new Promise<ApprovalDecision>((resolve) => {
        pendingApprovalResolve = resolve;
      });
      if (decision === 'reject') {
        return {
          command,
          stdout: '',
          stderr: 'Execution cancelled by user in Web UI.',
          exitCode: 1,
          error: 'Rejected by user.',
        };
      }
    }
    return originalExecuteCommand(command);
  };

  try {
    const finalContent = await agent.sendMessage(message, {
      onChunk: (chunk) => {
        sendEvent('chunk', { chunk });
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
    });

    sendEvent('context_update', agent.getContextManager().getContextInfo());
    sendEvent('done', { content: finalContent });
  } catch (err: any) {
    sendEvent('error', { error: err.message });
  } finally {
    // Restore original executor
    executor.executeCommand = originalExecuteCommand;
    pendingApprovalResolve = null;
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

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const report = await runBenchmarkSuite(targetModel, targetHost, (current, total, trace) => {
      sendEvent('test_complete', { current, total, trace });
    }, tests, agent.getOllamaToken());

    sendEvent('benchmark_done', { report });
  } catch (err: any) {
    sendEvent('error', { error: err.message });
  } finally {
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Server listening on http://localhost:${PORT}`);
  console.log(`🔌 Agent configured for Ollama host: ${agent.getConfig().ollamaHost}`);
  console.log(`📁 Active Working Directory: ${agent.getConfig().workingDir}\n`);
});
