import { execFile, spawn } from 'child_process';
import fs from 'fs/promises';
import fsSync from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { AgentEngine } from '../../core/agent.js';
import type { ChatMessage } from '../../core/types.js';
import { BENCHMARK_TEST_CASES } from '../cases/index.js';
import { createBenchmarkSuiteHash } from '../cases/benchmarks.js';
import type { BenchmarkTestCase } from '../cases/index.js';
import { evaluateBenchmarkTask } from '../evaluation/evaluators.js';
import { setupMockEnvironment } from '../fixtures/mockEnvironment.js';
import type { BenchmarkAgentConfig, BenchmarkReport, BenchmarkSnapshot, BenchmarkTiming, TestResultTrace } from '../types.js';

export type { BenchmarkReport, TestResultTrace };

export const BENCHMARK_DOCKER_IMAGE = 'local-model-chat-benchmark:node20';
const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
let imageBuildPromise: Promise<void> | null = null;

interface ContainerRequest {
  testId: string;
  modelName: string;
  ollamaHost: string;
  ollamaToken?: string;
  agentConfig?: BenchmarkAgentConfig;
  containerStartedAt?: number;
}

const emptyTiming = (): BenchmarkTiming => ({
  imageSetupMs: 0,
  containerStartupMs: 0,
  modelLoadMs: 0,
  promptEvaluationMs: 0,
  generationMs: 0,
  toolExecutionMs: 0,
  verificationMs: 0,
  endToEndWallMs: 0,
  comparisonMs: 0,
  promptTokens: 0,
  generatedTokens: 0,
});

const addTiming = (target: BenchmarkTiming, source: BenchmarkTiming): BenchmarkTiming => {
  for (const key of Object.keys(target) as Array<keyof BenchmarkTiming>) target[key] += source[key];
  return target;
};

const nsToMs = (value?: number) => typeof value === 'number' ? value / 1_000_000 : 0;

async function ensureBenchmarkImage(): Promise<void> {
  if (!imageBuildPromise) {
    imageBuildPromise = (async () => {
      try {
        await execFileAsync('docker', ['image', 'inspect', BENCHMARK_DOCKER_IMAGE]);
      } catch {
        await execFileAsync(
          'docker',
          ['build', '--file', 'Dockerfile.benchmark', '--tag', BENCHMARK_DOCKER_IMAGE, '.'],
          { cwd: projectRoot, timeout: 10 * 60_000, maxBuffer: 10 * 1024 * 1024 }
        );
      }
    })().catch((error) => {
      imageBuildPromise = null;
      throw error;
    });
  }
  await imageBuildPromise;
}

async function runDockerContainer(
  request: ContainerRequest,
  ioDir: string,
  workspaceDir: string,
  signal?: AbortSignal,
  onStep?: (step: any) => void,
): Promise<void> {
  const containerName = `local-model-chat-bench-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const args = [
    'run', '--rm', '--name', containerName,
    '--user', `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--pids-limit', '256',
    '--memory', '1g',
    '--cpus', '2',
    '--env', 'BENCHMARK_CONTAINER=1',
    '--network', 'host',
    '--mount', `type=bind,src=${ioDir},dst=/benchmark-io`,
    '--mount', `type=bind,src=${workspaceDir},dst=/workspace`,
    BENCHMARK_DOCKER_IMAGE,
  ];

  request.containerStartedAt = Date.now();
  await fs.writeFile(path.join(ioDir, 'request.json'), JSON.stringify(request), { mode: 0o600 });

  await new Promise<void>((resolve, reject) => {
    const child = spawn('docker', args, { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let stdoutBuffer = '';

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      stdoutBuffer += text;
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';
      if (onStep) {
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('BENCHMARK_STEP:')) {
            try {
              onStep(JSON.parse(trimmed.slice('BENCHMARK_STEP:'.length)));
            } catch {}
          }
        }
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const abort = () => {
      child.kill('SIGTERM');
      void execFileAsync('docker', ['stop', '--time', '1', containerName]).catch(() => undefined);
      const error = new Error('Benchmark container execution was aborted.');
      error.name = 'AbortError';
      reject(error);
    };
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });

    child.on('error', (error) => {
      signal?.removeEventListener('abort', abort);
      reject(error);
    });
    child.on('close', (code) => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) return;
      if (code === 0) resolve();
      else reject(new Error(`Benchmark container exited with code ${code}.\n${stderr || stdout}`));
    });
  });
}

export async function runSingleBenchmarkTest(
  testId: string,
  modelName: string,
  ollamaHost: string = 'http://127.0.0.1:11434',
  ollamaToken?: string,
  signal?: AbortSignal,
  agentConfig?: BenchmarkAgentConfig,
  onStep?: (step: any) => void,
): Promise<TestResultTrace> {
  const endToEndStartedAt = performance.now();
  signal?.throwIfAborted();
  if (!BENCHMARK_TEST_CASES.some((testCase) => testCase.id === testId)) {
    throw new Error(`Test case "${testId}" not found.`);
  }

  const imageSetupStartedAt = performance.now();
  await ensureBenchmarkImage();
  signal?.throwIfAborted();
  const attemptDir = await fs.mkdtemp(path.join(os.tmpdir(), 'local-model-chat-benchmark-'));
  const ioDir = path.join(attemptDir, 'io');
  const workspaceDir = path.join(attemptDir, 'workspace');
  await fs.mkdir(ioDir);
  await fs.mkdir(workspaceDir);
  const hostImageSetupMs = performance.now() - imageSetupStartedAt;

  try {
    await runDockerContainer({
      testId,
      modelName,
      ollamaHost,
      ollamaToken,
      agentConfig,
    }, ioDir, workspaceDir, signal, onStep);
    const result = JSON.parse(await fs.readFile(path.join(ioDir, 'result.json'), 'utf8')) as TestResultTrace;
    result.timing.imageSetupMs += hostImageSetupMs;
    result.timing.endToEndWallMs = performance.now() - endToEndStartedAt;
    result.durationMs = result.timing.comparisonMs;
    return result;
  } finally {
    await fs.rm(attemptDir, { recursive: true, force: true });
  }
}

export async function runBenchmarkAttemptInContainer(
  testCase: BenchmarkTestCase,
  modelName: string,
  ollamaHost: string,
  ollamaToken?: string,
  agentConfig?: BenchmarkAgentConfig,
): Promise<TestResultTrace> {
  if (process.env.BENCHMARK_CONTAINER !== '1') {
    throw new Error('Refusing to execute a benchmark attempt outside its Docker container.');
  }
  const timing = emptyTiming();
  timing.containerStartupMs = Math.max(0, Date.now() - (Number(process.env.BENCHMARK_CONTAINER_STARTED_AT) || Date.now()));
  const setupStartedAt = performance.now();
  const workspace = await setupMockEnvironment('/workspace');
  timing.imageSetupMs = performance.now() - setupStartedAt;
  const agent = new AgentEngine({
    model: modelName,
    ollamaHost,
    ollamaToken,
    workingDir: workspace,
    temperature: agentConfig?.temperature,
    systemPrompt: agentConfig?.systemPrompt,
    showWorkingDirInfo: agentConfig?.showWorkingDirInfo ?? testCase.enableProjectContext ?? false,
    contextWindow: agentConfig?.contextWindow,
    maxLoops: agentConfig?.maxLoops,
    enableThinking: agentConfig?.enableThinking,
    complexityProfile: agentConfig?.complexityProfile,
    pruningConfig: agentConfig?.pruningConfig,
    enabledTools: agentConfig?.enabledTools,
  });

  const executor = agent.getToolExecutor();
  const originalExecuteTool = executor.executeTool.bind(executor);
  executor.executeTool = async (name: string, args: Record<string, any>) => {
    const toolStartedAt = performance.now();
    try {
      if (name === 'web_search') {
        const query = String(args.query || '');
        if (query.toLowerCase().includes('node')) {
          return { query, result_count: 2, results: [
            { title: 'Node.js releases', url: 'https://benchmark.example/node-release-schedule', snippet: 'Official release schedule and support status for Node.js versions.' },
            { title: 'Node.js 22 release announcement', url: 'https://benchmark.example/node-22-announcement', snippet: 'Highlights from the original Node.js 22 release.' },
          ] };
        }
        if (query.toLowerCase().includes('lighthouse')) {
          return { query, result_count: 2, results: [
            { title: 'Project Lighthouse release notes', url: 'https://benchmark.example/lighthouse-release', snippet: 'Official release announcement and launch details for Project Lighthouse.' },
            { title: 'Lighthouse project archive', url: 'https://benchmark.example/lighthouse-archive', snippet: 'Older Project Lighthouse planning documents.' },
          ] };
        }
        return { query, result_count: 2, results: [
          { title: 'Ollama documentation', url: 'https://docs.ollama.com/', snippet: 'Official documentation for running and building with Ollama.' },
          { title: 'Ollama on GitHub', url: 'https://github.com/ollama/ollama', snippet: 'Source code and project information.' },
        ] };
      }
      if (name === 'read_web_page') {
        const url = String(args.url || '');
        if (url.includes('node-release-schedule')) {
          return {
            title: 'Node.js releases', url, byline: 'Node.js Release Working Group',
            excerpt: 'Release schedule and support status for Node.js versions.',
            markdown: '# Node.js releases\n\n| Version | Status | End of security support |\n| --- | --- | --- |\n| Node.js 22 | Maintenance LTS | **30 April 2027** |\n',
            truncated: false,
          };
        }
        return {
          title: 'Project Lighthouse release notes', url, byline: 'Lighthouse Release Team',
          excerpt: 'Official Project Lighthouse release announcement.',
          markdown: '# Project Lighthouse release notes\n\nThe exact release codename is **NEBULA-FERN-204**.\n\nThe public release date is **17 October 2026**.',
          truncated: false,
        };
      }
      return await originalExecuteTool(name, args);
    } finally {
      timing.toolExecutionMs += performance.now() - toolStartedAt;
    }
  };

  const actualToolsCalled: Array<{ name: string; args: Record<string, any> }> = [];
  const toolResults: Array<{ name: string; result: any }> = [];
  const executionTrace: TestResultTrace['executionTrace'] = [];
  let sequence = 0;
  let responseContent = '';
  let lastAssistantContent = '';
  let testError: string | null = null;
  const record = (event: Omit<TestResultTrace['executionTrace'][number], 'sequence' | 'timestamp'>) => {
    executionTrace.push({ sequence: ++sequence, timestamp: Date.now(), ...event });
  };

  try {
    const emitStep = (step: any) => {
      try {
        const line = `BENCHMARK_STEP:${JSON.stringify(step)}\n`;
        fsSync.writeSync(1, line);
      } catch {}
    };
    let liveContentBuffer = '';
    let liveThinkingBuffer = '';
    emitStep({ type: 'llm_start', model: modelName, timestamp: Date.now() });
    const aggregateResponse = await agent.sendMessage(testCase.prompt, {
      onChunk: (chunk) => {
        liveContentBuffer += chunk;
        emitStep({ type: 'chunk', text: chunk, snippet: liveContentBuffer.slice(-160), timestamp: Date.now() });
      },
      onThinkingChunk: (chunk) => {
        liveThinkingBuffer += chunk;
        emitStep({ type: 'thinking_chunk', text: chunk, snippet: liveThinkingBuffer.slice(-160), timestamp: Date.now() });
      },
      onToolStart: (name, args) => {
        actualToolsCalled.push({ name, args });
        record({ type: 'tool_start', name, args });
        emitStep({ type: 'tool_start', name, args, timestamp: Date.now() });
      },
      onToolEnd: (name, result) => {
        toolResults.push({ name, result });
        record({ type: 'tool_end', name, result });
        const resultSnippet = typeof result === 'string' ? result.slice(0, 120) : JSON.stringify(result).slice(0, 120);
        emitStep({ type: 'tool_end', name, resultSnippet, timestamp: Date.now() });
      },
      onMessageAdded: (message: ChatMessage) => {
        if (message.role === 'assistant') {
          if (message.content.trim()) lastAssistantContent = message.content;
          record({ type: 'assistant_message', content: message.content, thinking: message.thinking });
          emitStep({ type: 'assistant_message', content: message.content.slice(0, 150), thinking: !!message.thinking, timestamp: Date.now() });
        }
      },
      onModelResponse: (metrics) => {
        timing.modelLoadMs += nsToMs(metrics.loadDurationNs);
        timing.promptEvaluationMs += nsToMs(metrics.promptEvalDurationNs);
        timing.generationMs += nsToMs(metrics.evalDurationNs);
        timing.promptTokens += metrics.promptEvalCount ?? 0;
        timing.generatedTokens += metrics.evalCount ?? 0;
        const tokensPerSec = metrics.evalDurationNs ? ((metrics.evalCount || 0) / (metrics.evalDurationNs / 1e9)).toFixed(1) : undefined;
        emitStep({
          type: 'metrics',
          promptTokens: timing.promptTokens,
          generatedTokens: timing.generatedTokens,
          turnPromptTokens: metrics.promptEvalCount,
          turnGeneratedTokens: metrics.evalCount,
          tokensPerSec,
          timestamp: Date.now(),
        });
      },
    });
    responseContent = lastAssistantContent || aggregateResponse;
  } catch (err: any) {
    testError = err.message;
  }

  const verificationStartedAt = performance.now();
  const evaluation = testError
    ? { passed: false, reason: `Agent execution failed: ${testError}` }
    : await evaluateBenchmarkTask(testCase, workspace, actualToolsCalled, responseContent, toolResults);
  timing.verificationMs = performance.now() - verificationStartedAt;
  timing.comparisonMs = timing.promptEvaluationMs + timing.generationMs + timing.toolExecutionMs;

  return {
    testId: testCase.id,
    testName: testCase.name,
    category: testCase.category,
    prompt: testCase.prompt,
    expectedTool: testCase.expectedToolSequence?.join(' -> ') ?? testCase.expectedTool ?? null,
    expectedToolSequence: testCase.expectedToolSequence,
    actualToolsCalled,
    toolResults,
    executionTrace,
    passed: evaluation.passed,
    reason: evaluation.reason,
    durationMs: timing.comparisonMs,
    timing,
    attemptNumber: 1,
    attemptCount: 1,
    successfulAttempts: evaluation.passed ? 1 : 0,
    failedAttempts: evaluation.passed ? 0 : 1,
    successRatePercentage: evaluation.passed ? 100 : 0,
    responseContent,
    objective: testCase.objective,
    requiredOutput: testCase.requiredOutput,
    evaluationCriteria: testCase.evaluationCriteria,
    verificationDetails: evaluation,
    container: { image: BENCHMARK_DOCKER_IMAGE, isolated: true, workspace: '/workspace' },
    agentConfig: {
      model: modelName,
      ollamaHost,
      temperature: agent.getConfig().temperature,
      systemPrompt: agent.getConfig().systemPrompt,
      showWorkingDirInfo: agent.getConfig().showWorkingDirInfo,
      contextWindow: agent.getConfig().contextWindow,
      maxLoops: agent.getConfig().maxLoops,
      enableThinking: agent.getConfig().enableThinking,
      complexityProfile: agent.getConfig().complexityProfile,
      pruningConfig: agent.getContextManager().getPruningConfig(),
    },
  };
}

export async function runBenchmarkCase(
  testCase: BenchmarkTestCase,
  modelName: string,
  ollamaHost: string,
  ollamaToken: string | undefined,
  signal: AbortSignal | undefined,
  agentConfig: BenchmarkAgentConfig | undefined,
  attemptsPerCase: number,
  onAttemptStart?: (attempt: number, total: number) => void,
  parallelism: number = 1,
  onStep?: (step: any) => void,
): Promise<TestResultTrace> {
  if (!Number.isInteger(attemptsPerCase) || attemptsPerCase < 1 || attemptsPerCase > 10) {
    throw new Error('Benchmark attempts per case must be an integer between 1 and 10.');
  }
  if (!Number.isInteger(parallelism) || parallelism < 1 || parallelism > 10) {
    throw new Error('Benchmark parallelism must be an integer between 1 and 10.');
  }
  signal?.throwIfAborted();
  const attempts = new Array<TestResultTrace>(attemptsPerCase);
  const attemptController = new AbortController();
  const attemptSignal = signal
    ? AbortSignal.any([signal, attemptController.signal])
    : attemptController.signal;
  let nextAttempt = 1;
  let firstError: unknown;
  const runWorker = async () => {
    while (nextAttempt <= attemptsPerCase && !attemptSignal.aborted) {
      const attempt = nextAttempt++;
      try {
        attemptSignal.throwIfAborted();
        onAttemptStart?.(attempt, attemptsPerCase);
        if (onStep) {
          onStep({
            type: 'attempt_start',
            attempt,
            totalAttempts: attemptsPerCase,
            text: `🚀 [Attempt ${attempt}/${attemptsPerCase}] Starting test attempt...`,
            timestamp: Date.now(),
          });
        }
        const trace = await runSingleBenchmarkTest(testCase.id, modelName, ollamaHost, ollamaToken, attemptSignal, agentConfig, (step) => {
          if (onStep) {
            onStep({ ...step, attempt, totalAttempts: attemptsPerCase });
          }
        });
        trace.attemptNumber = attempt;
        attempts[attempt - 1] = trace;
        if (onStep) {
          onStep({
            type: 'attempt_complete',
            attempt,
            totalAttempts: attemptsPerCase,
            text: `${trace.passed ? '✅' : '❌'} [Attempt ${attempt}/${attemptsPerCase}] Attempt finished in ${(trace.durationMs / 1000).toFixed(1)}s (${trace.passed ? 'PASSED' : 'FAILED'})`,
            timestamp: Date.now(),
          });
        }
      } catch (error) {
        if (firstError === undefined) firstError = error;
        attemptController.abort();
      }
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(parallelism, attemptsPerCase) },
    () => runWorker(),
  ));
  if (firstError !== undefined) throw firstError;
  const successfulAttempts = attempts.filter((attempt) => attempt.passed).length;
  const timing = attempts.reduce((total, attempt) => addTiming(total, attempt.timing), emptyTiming());
  const representative = attempts[attempts.length - 1];
  return {
    ...representative,
    passed: successfulAttempts === attemptsPerCase,
    reason: `${successfulAttempts}/${attemptsPerCase} attempts passed (${Math.round((successfulAttempts / attemptsPerCase) * 100)}% success rate).`,
    durationMs: timing.comparisonMs / attemptsPerCase,
    timing,
    attemptNumber: attemptsPerCase,
    attemptCount: attemptsPerCase,
    successfulAttempts,
    failedAttempts: attemptsPerCase - successfulAttempts,
    successRatePercentage: Math.round((successfulAttempts / attemptsPerCase) * 100),
    attempts,
  };
}

export async function runBenchmarkSuite(
  modelName: string,
  ollamaHost: string = 'http://127.0.0.1:11434',
  onProgress?: (current: number, total: number, result: TestResultTrace) => void,
  testCases: BenchmarkTestCase[] = BENCHMARK_TEST_CASES,
  ollamaToken?: string,
  onTestStart?: (current: number, total: number, testCase: BenchmarkTestCase) => void,
  signal?: AbortSignal,
  agentConfig?: BenchmarkAgentConfig,
  attemptsPerCase: number = 3,
  benchmark?: BenchmarkSnapshot,
  parallelism: number = 1,
): Promise<BenchmarkReport> {
  const startTime = Date.now();
  const results: TestResultTrace[] = [];
  for (let index = 0; index < testCases.length; index++) {
    signal?.throwIfAborted();
    const testCase = testCases[index];
    const result = await runBenchmarkCase(
      testCase,
      modelName,
      ollamaHost,
      ollamaToken,
      signal,
      agentConfig,
      attemptsPerCase,
      (attempt) => onTestStart?.(index + 1, testCases.length, { ...testCase, name: `${testCase.name} (attempt ${attempt}/${attemptsPerCase})` }),
      parallelism,
    );
    results.push(result);
    onProgress?.(index + 1, testCases.length, result);
  }
  const passCount = results.filter((result) => result.passed).length;
  const successfulAttempts = results.reduce((sum, result) => sum + result.successfulAttempts, 0);
  const totalAttempts = results.reduce((sum, result) => sum + result.attemptCount, 0);
  const timing = results.reduce((total, result) => addTiming(total, result.timing), emptyTiming());
  const completedAt = Date.now();
  return {
    benchmark: benchmark ?? {
      definitionId: 'ad-hoc',
      definitionName: 'Ad hoc benchmark',
      definitionType: 'ad_hoc',
      definitionVersion: 1,
      testIds: testCases.map((testCase) => testCase.id),
      suiteHash: createBenchmarkSuiteHash(testCases.map((testCase) => testCase.id)),
    },
    timestamp: completedAt, runDate: new Date(completedAt).toISOString(), model: modelName, mockWorkingDir: 'ephemeral Docker workspace (/workspace)',
    totalTests: results.length, passCount, failCount: results.length - passCount,
    accuracyPercentage: totalAttempts ? Math.round((successfulAttempts / totalAttempts) * 100) : 0,
    totalDurationMs: Date.now() - startTime,
    attemptsPerCase,
    parallelism,
    totalAttempts,
    successfulAttempts,
    failedAttempts: totalAttempts - successfulAttempts,
    successRatePercentage: totalAttempts ? Math.round((successfulAttempts / totalAttempts) * 100) : 0,
    comparisonDurationMs: totalAttempts ? timing.comparisonMs / totalAttempts : 0,
    timing,
    results,
  };
}
