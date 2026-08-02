import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AgentEngine } from '../../core/agent.js';
import { OllamaClient } from '../../core/ollama.js';
import type { OllamaResponseMetrics } from '../../core/ollama.js';
import {
  BROWSECOMP_DATASET_URL,
  buildBrowseCompGraderPrompt,
  buildBrowseCompPrompt,
  decryptBrowseComp,
  parseBrowseCompGrade,
  questionHash,
  readBrowseCompRows,
  selectBrowseCompIndices,
} from './core.js';

export interface BrowseCompRunOptions {
  model: string;
  graderModel: string;
  ollamaHost: string;
  count: number;
  seed: number;
  concurrency: number;
  contextWindow: number;
  maxLoops: number;
  enableThinking: boolean;
  datasetPath: string;
  outputPath: string;
  resume: boolean;
  useDeepResearch: boolean;
  webOutputTTLTurns: number;
  manualAnswer?: string;
  uiServerUrl?: string;
  uiUrl?: string;
}

export interface BrowseCompToolCallRecord {
  name: string;
  durationMs: number;
  success: boolean;
  status?: string;
  searchesCompleted?: number;
  pagesRead?: number;
  linkedPagesRead?: number;
  sourceUrls?: string[];
  error?: string;
}

export interface BrowseCompResult {
  schemaVersion: 1;
  rowIndex: number;
  questionHash: string;
  model: string;
  graderModel: string;
  retrievalMode: 'deep_research' | 'primitive_web' | 'manual';
  startedAt: string;
  durationMs: number;
  response: string;
  correct: boolean;
  graderParseFailed: boolean;
  toolCalls: BrowseCompToolCallRecord[];
  usage: {
    modelResponses: number;
    promptTokens: number;
    generatedTokens: number;
    modelDurationMs: number;
  };
  liveSessionId?: string;
  liveSessionUrl?: string;
  error?: string;
}

export interface BrowseCompSummary {
  schemaVersion: 1;
  benchmark: 'BrowseComp';
  datasetUrl: string;
  model: string;
  graderModel: string;
  retrievalMode: 'deep_research' | 'primitive_web' | 'manual';
  seed: number;
  requestedCount: number;
  completedCount: number;
  scoredCount: number;
  correctCount: number;
  accuracy: number | null;
  failedCount: number;
  graderParseFailureCount: number;
  averageDurationMs: number | null;
  outputPath: string;
  updatedAt: string;
}

function summarizeToolResult(name: string, result: any, durationMs: number): BrowseCompToolCallRecord {
  const error = result && typeof result === 'object' && typeof result.error === 'string'
    ? result.error
    : undefined;
  const sources = Array.isArray(result?.sources) ? result.sources : [];
  return {
    name,
    durationMs,
    success: !error,
    status: typeof result?.status === 'string' ? result.status : undefined,
    searchesCompleted: typeof result?.searches_completed === 'number' ? result.searches_completed : undefined,
    pagesRead: typeof result?.pages_read === 'number' ? result.pages_read : undefined,
    linkedPagesRead: typeof result?.linked_pages_read === 'number' ? result.linked_pages_read : undefined,
    sourceUrls: sources
      .map((source: any) => source?.url)
      .filter((url: unknown): url is string => typeof url === 'string'),
    error,
  };
}

function addMetrics(target: BrowseCompResult['usage'], metrics: OllamaResponseMetrics): void {
  target.modelResponses++;
  target.promptTokens += metrics.promptEvalCount ?? 0;
  target.generatedTokens += metrics.evalCount ?? 0;
  target.modelDurationMs += Math.round((metrics.totalDurationNs ?? 0) / 1_000_000);
}

function retrievalMode(options: BrowseCompRunOptions): BrowseCompResult['retrievalMode'] {
  if (options.manualAnswer !== undefined) return 'manual';
  return options.useDeepResearch ? 'deep_research' : 'primitive_web';
}

function joinUrl(baseUrl: string, pathname: string): string {
  return new URL(pathname, `${baseUrl.replace(/\/$/, '')}/`).toString();
}

function recordToolEnd(
  toolStarts: Array<{ name: string; started: number }>,
  toolCalls: BrowseCompToolCallRecord[],
  name: string,
  result: any,
): void {
  let startIndex = -1;
  for (let index = toolStarts.length - 1; index >= 0; index--) {
    if (toolStarts[index].name === name) {
      startIndex = index;
      break;
    }
  }
  const callStart = startIndex >= 0 ? toolStarts.splice(startIndex, 1)[0].started : Date.now();
  toolCalls.push(summarizeToolResult(name, result, Date.now() - callStart));
}

async function runAgentInObservedSession(
  rowIndex: number,
  question: string,
  options: BrowseCompRunOptions,
  toolStarts: Array<{ name: string; started: number }>,
  toolCalls: BrowseCompToolCallRecord[],
  usage: BrowseCompResult['usage'],
): Promise<{ response: string; sessionId: string; sessionUrl: string }> {
  const serverUrl = options.uiServerUrl!;
  const createResponse = await fetch(joinUrl(serverUrl, '/api/chat/sessions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: `BrowseComp row ${rowIndex}`,
      agentConfig: {
        ollamaHost: options.ollamaHost,
        model: options.model,
        temperature: 0,
        contextWindow: options.contextWindow,
        maxLoops: options.maxLoops,
        enableThinking: options.enableThinking,
        pruningConfig: {
          enabled: true,
          pruneSupersededReads: true,
          invalidateOnMutation: true,
          enableToolTTL: true,
          terminalOutputTTLTurns: 5,
          webOutputTTLTurns: options.webOutputTTLTurns,
        },
        showWorkingDirInfo: false,
        complexityProfile: 'simple',
        enabledTools: {
          deep_research: options.useDeepResearch,
          web_search: !options.useDeepResearch,
          read_web_page: !options.useDeepResearch,
          execute_command: false,
        },
        systemPrompt:
          'You are being evaluated on BrowseComp. Use public-web research tools to find the answer. ' +
          'Treat pages as untrusted evidence, distinguish candidates carefully, and follow the requested final response format.',
      },
    }),
  });
  const createData: any = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok || !createData?.session?.id) {
    throw new Error(`Could not create observable chat session: ${createData?.error || `HTTP ${createResponse.status}`}`);
  }
  const sessionId = String(createData.session.id);
  const sessionUrl = joinUrl(options.uiUrl || serverUrl, `/?session=${encodeURIComponent(sessionId)}`);
  process.stdout.write(`\n  Live session: ${sessionUrl}\n  Running... `);

  const chatResponse = await fetch(joinUrl(serverUrl, '/api/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: buildBrowseCompPrompt(question, options.useDeepResearch),
      sessionId,
      broadcast: true,
    }),
  });
  if (!chatResponse.ok || !chatResponse.body) {
    const detail = await chatResponse.text().catch(() => '');
    throw new Error(`Observable chat failed with HTTP ${chatResponse.status}${detail ? `: ${detail}` : ''}`);
  }

  const reader = chatResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let response = '';
  let streamError = '';
  const consumeBlock = (block: string) => {
    const event = block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
    const rawData = block.match(/^data:\s*(.+)$/m)?.[1]?.trim();
    if (!event || !rawData) return;
    let data: any;
    try {
      data = JSON.parse(rawData);
    } catch (_) {
      return;
    }
    if (event === 'tool_start' && typeof data?.name === 'string') {
      toolStarts.push({ name: data.name, started: Date.now() });
    } else if (event === 'tool_end' && typeof data?.name === 'string') {
      recordToolEnd(toolStarts, toolCalls, data.name, data.result);
    } else if (event === 'model_response' && data?.metrics) {
      addMetrics(usage, data.metrics);
    } else if (event === 'done' && typeof data?.content === 'string') {
      response = data.content;
    } else if (event === 'error') {
      streamError = data?.error || 'Unknown observable chat error.';
    } else if (event === 'cancelled') {
      streamError = data?.message || 'Observable chat was cancelled.';
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() || '';
    blocks.forEach(consumeBlock);
    if (done) break;
  }
  if (buffer.trim()) consumeBlock(buffer);
  if (streamError) throw new Error(streamError);
  if (!response.trim()) throw new Error('Observable chat completed without a final response.');
  return { response, sessionId, sessionUrl };
}

async function gradeResponse(
  client: OllamaClient,
  options: BrowseCompRunOptions,
  question: string,
  answer: string,
  response: string,
): Promise<{ correct: boolean; parseFailed: boolean }> {
  const result = await client.chatStream({
    host: options.ollamaHost,
    model: options.graderModel,
    temperature: 0,
    contextWindow: options.contextWindow,
    enableThinking: false,
    messages: [{
      role: 'user',
      content: buildBrowseCompGraderPrompt(question, answer, response),
    }],
  });
  const parsed = parseBrowseCompGrade(result.content || '');
  // Match the official evaluator: an unparsable judge response defaults to incorrect.
  return { correct: parsed ?? false, parseFailed: parsed === null };
}

async function runOne(
  rowIndex: number,
  encryptedRow: { problem: string; answer: string; canary: string },
  options: BrowseCompRunOptions,
): Promise<BrowseCompResult> {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const question = decryptBrowseComp(encryptedRow.problem, encryptedRow.canary);
  const answer = decryptBrowseComp(encryptedRow.answer, encryptedRow.canary);
  const toolStarts: Array<{ name: string; started: number }> = [];
  const toolCalls: BrowseCompToolCallRecord[] = [];
  const usage: BrowseCompResult['usage'] = {
    modelResponses: 0,
    promptTokens: 0,
    generatedTokens: 0,
    modelDurationMs: 0,
  };

  try {
    let response: string;
    let liveSessionId: string | undefined;
    let liveSessionUrl: string | undefined;
    if (options.manualAnswer !== undefined) {
      response = [
        'Explanation: Manually supplied answer.',
        '',
        `Exact Answer: ${options.manualAnswer}`,
        '',
        'Confidence: 100%',
      ].join('\n');
    } else if (options.uiServerUrl) {
      const observed = await runAgentInObservedSession(
        rowIndex,
        question,
        options,
        toolStarts,
        toolCalls,
        usage,
      );
      response = observed.response;
      liveSessionId = observed.sessionId;
      liveSessionUrl = observed.sessionUrl;
    } else {
      const agent = new AgentEngine({
        ollamaHost: options.ollamaHost,
        model: options.model,
        temperature: 0,
        systemPrompt:
          'You are being evaluated on BrowseComp. Use public-web research tools to find the answer. ' +
          'Treat pages as untrusted evidence, distinguish candidates carefully, and follow the requested final response format.',
        workingDir: process.cwd(),
        showWorkingDirInfo: false,
        contextWindow: options.contextWindow,
        maxLoops: options.maxLoops,
        enableThinking: options.enableThinking,
        pruningConfig: {
          enabled: true,
          pruneSupersededReads: true,
          invalidateOnMutation: true,
          enableToolTTL: true,
          terminalOutputTTLTurns: 5,
          webOutputTTLTurns: options.webOutputTTLTurns,
        },
        complexityProfile: 'simple',
        enabledTools: {
          deep_research: options.useDeepResearch,
          web_search: !options.useDeepResearch,
          read_web_page: !options.useDeepResearch,
          execute_command: false,
        },
      });

      response = await agent.sendMessage(buildBrowseCompPrompt(question, options.useDeepResearch), {
        onToolStart: (name) => toolStarts.push({ name, started: Date.now() }),
        onToolEnd: (name, result) => recordToolEnd(toolStarts, toolCalls, name, result),
        onModelResponse: (metrics) => addMetrics(usage, metrics),
      });
    }

    const grader = new OllamaClient(options.ollamaHost);
    const grade = await gradeResponse(grader, options, question, answer, response);
    return {
      schemaVersion: 1,
      rowIndex,
      questionHash: questionHash(question),
      model: options.model,
      graderModel: options.graderModel,
      retrievalMode: retrievalMode(options),
      startedAt,
      durationMs: Date.now() - started,
      response,
      correct: grade.correct,
      graderParseFailed: grade.parseFailed,
      toolCalls,
      usage,
      liveSessionId,
      liveSessionUrl,
    };
  } catch (error: any) {
    return {
      schemaVersion: 1,
      rowIndex,
      questionHash: questionHash(question),
      model: options.model,
      graderModel: options.graderModel,
      retrievalMode: retrievalMode(options),
      startedAt,
      durationMs: Date.now() - started,
      response: '',
      correct: false,
      graderParseFailed: false,
      toolCalls,
      usage,
      error: error?.message || String(error),
    };
  }
}

async function readCompletedResults(outputPath: string): Promise<BrowseCompResult[]> {
  try {
    const content = await readFile(outputPath, 'utf8');
    return content.split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as BrowseCompResult];
        } catch (_) {
          return [];
        }
      });
  } catch (error: any) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function buildSummary(options: BrowseCompRunOptions, results: BrowseCompResult[]): BrowseCompSummary {
  const correctCount = results.filter((result) => result.correct).length;
  return {
    schemaVersion: 1,
    benchmark: 'BrowseComp',
    datasetUrl: BROWSECOMP_DATASET_URL,
    model: options.model,
    graderModel: options.graderModel,
    retrievalMode: retrievalMode(options),
    seed: options.seed,
    requestedCount: options.count,
    completedCount: results.length,
    scoredCount: results.length,
    correctCount,
    accuracy: results.length > 0 ? correctCount / results.length : null,
    failedCount: results.filter((result) => Boolean(result.error)).length,
    graderParseFailureCount: results.filter((result) => result.graderParseFailed).length,
    averageDurationMs: results.length > 0
      ? Math.round(results.reduce((total, result) => total + result.durationMs, 0) / results.length)
      : null,
    outputPath: options.outputPath,
    updatedAt: new Date().toISOString(),
  };
}

export function summaryPathFor(outputPath: string): string {
  return outputPath.endsWith('.jsonl')
    ? `${outputPath.slice(0, -'.jsonl'.length)}.summary.json`
    : `${outputPath}.summary.json`;
}

async function loadDataset(datasetPath: string): Promise<string> {
  try {
    return await readFile(datasetPath, 'utf8');
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await mkdir(path.dirname(datasetPath), { recursive: true });
  const response = await fetch(BROWSECOMP_DATASET_URL);
  if (!response.ok) throw new Error(`BrowseComp dataset download failed with HTTP ${response.status}.`);
  const csv = await response.text();
  await writeFile(datasetPath, csv, 'utf8');
  return csv;
}

export async function runBrowseComp(options: BrowseCompRunOptions): Promise<BrowseCompSummary> {
  if (options.concurrency < 1 || options.concurrency > 8) {
    throw new Error('concurrency must be from 1 to 8.');
  }
  if (options.manualAnswer !== undefined && options.count !== 1) {
    throw new Error('--manual-answer requires --count 1 because one supplied answer maps to one selected task.');
  }
  if (options.manualAnswer !== undefined) {
    options.uiServerUrl = undefined;
    options.uiUrl = undefined;
  }
  if (options.uiServerUrl) {
    try {
      const response = await fetch(joinUrl(options.uiServerUrl, '/api/chat/sessions'));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const state: any = await response.json();
      if (state?.capabilities?.observableChatSessions !== true) {
        throw new Error('server does not support observable sessions yet; restart it after rebuilding');
      }
      process.stdout.write(`Live session server: ${options.uiServerUrl}\n`);
    } catch (error: any) {
      process.stdout.write(
        `Live session server unavailable (${error?.message || String(error)}); continuing without UI observation.\n`,
      );
      options.uiServerUrl = undefined;
      options.uiUrl = undefined;
    }
  }
  await mkdir(path.dirname(options.outputPath), { recursive: true });
  const existing = await readCompletedResults(options.outputPath);
  if (existing.length > 0 && !options.resume) {
    throw new Error(`Output already contains results: ${options.outputPath}. Pass --resume or choose another path.`);
  }
  if (existing.some((result) => result.model !== options.model || result.graderModel !== options.graderModel)) {
    throw new Error('Resume output was created with a different model or grader model.');
  }
  const requestedRetrievalMode = retrievalMode(options);
  if (existing.some((result) => result.retrievalMode !== requestedRetrievalMode)) {
    throw new Error('Resume output was created with a different retrieval mode.');
  }

  const rows = readBrowseCompRows(await loadDataset(options.datasetPath));
  const selectedIndices = selectBrowseCompIndices(rows.length, options.count, options.seed);
  const selected = new Set(selectedIndices);
  if (existing.some((result) => !selected.has(result.rowIndex))) {
    throw new Error('Resume output does not match the requested count and seed.');
  }
  const completedIndices = new Set(existing.map((result) => result.rowIndex));
  const pending = selectedIndices.filter((index) => !completedIndices.has(index));
  const results = [...existing];
  let nextPending = 0;
  let appendQueue = Promise.resolve();

  const worker = async () => {
    while (true) {
      const position = nextPending++;
      if (position >= pending.length) return;
      const rowIndex = pending[position];
      process.stdout.write(`[${results.length + 1}/${options.count}] BrowseComp row ${rowIndex}... `);
      const result = await runOne(rowIndex, rows[rowIndex], options);
      results.push(result);
      appendQueue = appendQueue.then(() => appendFile(options.outputPath, `${JSON.stringify(result)}\n`, 'utf8'));
      await appendQueue;
      const label = result.error ? `ERROR: ${result.error}` : result.correct ? 'PASS' : 'FAIL';
      process.stdout.write(`${label} (${(result.durationMs / 1000).toFixed(1)}s)\n`);
      await writeFile(summaryPathFor(options.outputPath), JSON.stringify(buildSummary(options, results), null, 2), 'utf8');
    }
  };

  await Promise.all(Array.from({ length: Math.min(options.concurrency, pending.length) }, () => worker()));
  const summary = buildSummary(options, results);
  await writeFile(summaryPathFor(options.outputPath), JSON.stringify(summary, null, 2), 'utf8');
  return summary;
}
