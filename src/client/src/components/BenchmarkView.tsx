import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Cpu,
  FolderTree,
  ChevronDown,
  ChevronUp,
  Loader2,
  Zap,
  Info,
  X,
  Target,
  FileCode2,
  CheckCheck,
  RotateCw,
  Square,
  Trophy,
  Save,
  BarChart3,
  Trash2,
} from 'lucide-react';
import { AgentConfig, ContextPruningConfig, OllamaModelInfo, ToolComplexityProfile, ToolSettings } from '../types';
import { highlightJson } from './JsonEditor';
import { ToolTogglePanel } from './ToolTogglePanel';

interface HighlightedJsonProps {
  value: unknown;
  emptyText?: string;
  style?: React.CSSProperties;
}

const HighlightedJson: React.FC<HighlightedJsonProps> = ({ value, emptyText = '', style }) => {
  const json = JSON.stringify(value, null, 2) ?? emptyText;

  return (
    <pre
      className="benchmark-json"
      style={{ fontSize: '0.775rem', ...style }}
      dangerouslySetInnerHTML={{ __html: highlightJson(json) }}
    />
  );
};

export interface TestResultTrace {
  testId: string;
  testName: string;
  category: string;
  prompt: string;
  expectedTool: string | null;
  expectedToolSequence?: string[];
  actualToolsCalled: Array<{ name: string; args: Record<string, any> }>;
  toolResults: Array<{ name: string; result: any }>;
  executionTrace: Array<{
    sequence: number;
    timestamp: number;
    type: 'assistant_message' | 'tool_start' | 'tool_end';
    name?: string;
    args?: Record<string, any>;
    result?: any;
    content?: string;
    thinking?: string;
  }>;
  passed: boolean;
  reason: string;
  durationMs: number;
  timing: BenchmarkTiming;
  attemptNumber: number;
  attemptCount: number;
  successfulAttempts: number;
  failedAttempts: number;
  successRatePercentage: number;
  attempts?: TestResultTrace[];
  responseContent: string;
  objective: string;
  requiredOutput: string;
  evaluationCriteria: string;
  verificationDetails?: { passed: boolean; reason: string; details?: Record<string, any> };
  container: { image: string; isolated: boolean; workspace: string };
  agentConfig: {
    model: string;
    ollamaHost: string;
    temperature?: number;
    systemPrompt?: string;
    showWorkingDirInfo?: boolean;
    contextWindow?: number;
    maxLoops?: number;
    enableThinking?: boolean;
    complexityProfile?: ToolComplexityProfile;
    pruningConfig?: AgentConfig['pruningConfig'];
  };
}

interface BenchmarkTiming {
  imageSetupMs: number;
  containerStartupMs: number;
  modelLoadMs: number;
  promptEvaluationMs: number;
  generationMs: number;
  toolExecutionMs: number;
  verificationMs: number;
  endToEndWallMs: number;
  comparisonMs: number;
  promptTokens: number;
  generatedTokens: number;
}

export interface BenchmarkTestCaseInfo {
  id: string;
  name: string;
  category: string;
  prompt: string;
  expectedTool?: string | null;
  expectedToolSequence?: string[];
  expectedResponseSubstrings?: string[];
  expectedFileState?: unknown[];
  expectedFileJson?: unknown;
  expectedDirectoryEntries?: unknown[];
  expectedToolResults?: unknown[];
  description: string;
  objective: string;
  requiredOutput: string;
  evaluationCriteria: string;
}

interface BenchmarkDefinition {
  id: string;
  name: string;
  description: string;
  type: 'preset' | 'custom';
  version: number;
  testIds: string[];
  createdAt?: string;
  updatedAt?: string;
}

interface BenchmarkSnapshot {
  definitionId: string;
  definitionName: string;
  definitionType: 'preset' | 'custom' | 'ad_hoc';
  definitionVersion: number;
  testIds: string[];
  suiteHash: string;
}

export interface BenchmarkReport {
  benchmark: BenchmarkSnapshot;
  timestamp: number;
  runDate: string;
  model: string;
  mockWorkingDir: string;
  totalTests: number;
  passCount: number;
  failCount: number;
  accuracyPercentage: number;
  totalDurationMs: number;
  attemptsPerCase: number;
  parallelism: number;
  totalAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  successRatePercentage: number;
  comparisonDurationMs: number;
  timing: BenchmarkTiming;
  results: TestResultTrace[];
}

interface SavedBenchmarkRun {
  runId: string;
  runName: string;
  runDate: string;
  outputDirectory: string;
  directory: string;
  reportPath: string;
  htmlPath: string;
  model: string;
  modelConfig: TestResultTrace['agentConfig'];
  benchmark: BenchmarkSnapshot;
  totalTests: number;
  passCount: number;
  failCount: number;
  accuracyPercentage: number;
  totalDurationMs: number;
  attemptsPerCase: number;
  parallelism: number;
  totalAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  successRatePercentage: number;
  comparisonDurationMs: number;
  timing: BenchmarkTiming;
  results: Array<Pick<TestResultTrace, 'testId' | 'testName' | 'category' | 'passed' | 'reason' | 'durationMs' | 'attemptCount' | 'successfulAttempts' | 'failedAttempts' | 'successRatePercentage' | 'timing'>>;
}

interface BenchmarkViewProps {
  models: OllamaModelInfo[];
  currentConfig: AgentConfig;
  toolSettings: ToolSettings;
}

interface BenchmarkFormConfig {
  model: string;
  ollamaHost: string;
  temperature: number;
  contextWindow: number;
  maxLoops: number;
  enableThinking: boolean;
  showWorkingDirInfo: boolean;
  complexityProfile: ToolComplexityProfile;
  systemPrompt: string;
  pruningConfig: Required<ContextPruningConfig>;
  enabledTools: Record<string, boolean>;
}



const getBenchmarkDefaults = (config: AgentConfig, toolSettings: ToolSettings): BenchmarkFormConfig => ({
  model: config.model,
  ollamaHost: config.ollamaHost,
  temperature: config.temperature,
  contextWindow: config.contextWindow ?? 16384,
  maxLoops: toolSettings.maxLoops ?? config.maxLoops ?? 25,
  enableThinking: toolSettings.enableThinking ?? config.enableThinking ?? true,
  showWorkingDirInfo: config.showWorkingDirInfo,
  complexityProfile: toolSettings.complexityProfile ?? config.complexityProfile ?? 'simple',
  systemPrompt: config.systemPrompt,
  pruningConfig: {
    enabled: config.pruningConfig?.enabled ?? true,
    pruneSupersededReads: config.pruningConfig?.pruneSupersededReads ?? true,
    invalidateOnMutation: config.pruningConfig?.invalidateOnMutation ?? true,
    enableToolTTL: config.pruningConfig?.enableToolTTL ?? true,
    terminalOutputTTLTurns: config.pruningConfig?.terminalOutputTTLTurns ?? 5,
    webOutputTTLTurns: config.pruningConfig?.webOutputTTLTurns ?? 5,
  },
  enabledTools: { ...(toolSettings.enabledTools as Record<string, boolean>) },
});

const formatRunDate = (runDate: string) => new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
}).format(new Date(runDate));

const flattenConfig = (value: Record<string, unknown>, prefix = ''): Record<string, unknown> =>
  Object.entries(value).reduce<Record<string, unknown>>((flattened, [key, entry]) => {
    const field = prefix ? `${prefix}.${key}` : key;
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      Object.assign(flattened, flattenConfig(entry as Record<string, unknown>, field));
    } else {
      flattened[field] = entry;
    }
    return flattened;
  }, {});

const formatConfigValue = (value: unknown): string => {
  if (value === undefined) return 'Not set';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
};

const formatMs = (value: number): string => value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;

const sumTimings = (results: TestResultTrace[]): BenchmarkTiming => results.reduce<BenchmarkTiming>((total, result) => ({
  imageSetupMs: total.imageSetupMs + result.timing.imageSetupMs,
  containerStartupMs: total.containerStartupMs + result.timing.containerStartupMs,
  modelLoadMs: total.modelLoadMs + result.timing.modelLoadMs,
  promptEvaluationMs: total.promptEvaluationMs + result.timing.promptEvaluationMs,
  generationMs: total.generationMs + result.timing.generationMs,
  toolExecutionMs: total.toolExecutionMs + result.timing.toolExecutionMs,
  verificationMs: total.verificationMs + result.timing.verificationMs,
  endToEndWallMs: total.endToEndWallMs + result.timing.endToEndWallMs,
  comparisonMs: total.comparisonMs + result.timing.comparisonMs,
  promptTokens: total.promptTokens + result.timing.promptTokens,
  generatedTokens: total.generatedTokens + result.timing.generatedTokens,
}), {
  imageSetupMs: 0, containerStartupMs: 0, modelLoadMs: 0, promptEvaluationMs: 0,
  generationMs: 0, toolExecutionMs: 0, verificationMs: 0, endToEndWallMs: 0,
  comparisonMs: 0, promptTokens: 0, generatedTokens: 0,
});

const CONFIG_FIELD_ORDER = [
  'model',
  'ollamaHost',
  'temperature',
  'contextWindow',
  'maxLoops',
  'enableThinking',
  'showWorkingDirInfo',
  'complexityProfile',
  'systemPrompt',
];

export const BenchmarkView: React.FC<BenchmarkViewProps> = ({
  models,
  currentConfig,
  toolSettings,
}) => {
  const [benchmarkConfig, setBenchmarkConfig] = useState<BenchmarkFormConfig>(() => getBenchmarkDefaults(currentConfig, toolSettings));
  const [configDirty, setConfigDirty] = useState(false);
  const [attemptsPerCase, setAttemptsPerCase] = useState(3);
  const [parallelism, setParallelism] = useState(1);
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [liveResults, setLiveResults] = useState<TestResultTrace[]>([]);
  const [testCasesInfo, setTestCasesInfo] = useState<BenchmarkTestCaseInfo[]>([]);
  const [benchmarkDefinitions, setBenchmarkDefinitions] = useState<BenchmarkDefinition[]>([]);
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState('quick');
  const [editingBenchmarkId, setEditingBenchmarkId] = useState<string | null>(null);
  const [definitionName, setDefinitionName] = useState('');
  const [definitionDescription, setDefinitionDescription] = useState('');
  const [definitionTestIds, setDefinitionTestIds] = useState<string[]>([]);
  const [definitionSaving, setDefinitionSaving] = useState(false);
  const [showSelectedBenchmarkTests, setShowSelectedBenchmarkTests] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [wasStopped, setWasStopped] = useState(false);
  const benchmarkAbortController = useRef<AbortController | null>(null);
  const singleAbortController = useRef<AbortController | null>(null);
  const [runningSingleId, setRunningSingleId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    current: number;
    completed: number;
    total: number;
    testName?: string;
  } | null>(null);
  const [expandedTestId, setExpandedTestId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'runner' | 'compare'>('runner');
  const [saveResults, setSaveResults] = useState(true);
  const [runName, setRunName] = useState('');
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showOutputSettings, setShowOutputSettings] = useState(false);
  const [outputDirectory, setOutputDirectory] = useState('');
  const [defaultOutputDirectory, setDefaultOutputDirectory] = useState('');
  const [projectRoot, setProjectRoot] = useState('');
  const [outputLocationMode, setOutputLocationMode] = useState<'project' | 'custom'>('project');
  const [savedRuns, setSavedRuns] = useState<SavedBenchmarkRun[]>([]);
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [savedRun, setSavedRun] = useState<SavedBenchmarkRun | null>(null);
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);
  const [showMatchingConfigs, setShowMatchingConfigs] = useState(false);
  const [activeAttemptIndices, setActiveAttemptIndices] = useState<Record<string, number>>({});
  const [liveSteps, setLiveSteps] = useState<Array<{ timestamp: number; text: string; type: string; detail?: string }>>([]);
  const [liveStreamingText, setLiveStreamingText] = useState<string>('');
  const [liveThinkingText, setLiveThinkingText] = useState<string>('');
  const [liveActiveTool, setLiveActiveTool] = useState<string | null>(null);
  const [liveMetrics, setLiveMetrics] = useState<{ promptTokens?: number; generatedTokens?: number; tokensPerSec?: string } | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (isRunning || runningSingleId !== null) {
      const start = Date.now();
      setElapsedMs(0);
      const interval = setInterval(() => {
        setElapsedMs(Date.now() - start);
      }, 100);
      return () => clearInterval(interval);
    } else {
      setElapsedMs(0);
    }
  }, [isRunning, runningSingleId]);
  const [runSort, setRunSort] = useState<{ key: 'rank' | 'model' | 'date' | 'elapsed' | 'total' | 'average'; direction: 'asc' | 'desc' }>({ key: 'rank', direction: 'asc' });

  const loadSavedRuns = async (directory?: string) => {
    setRunsLoading(true);
    try {
      const query = directory?.trim() ? `?directory=${encodeURIComponent(directory.trim())}` : '';
      const response = await fetch(`/api/benchmark/runs${query}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not load benchmark runs.');
      setOutputDirectory(data.directory);
      setDefaultOutputDirectory(data.defaultDirectory);
      setProjectRoot(data.projectRoot || '');
      setSavedRuns(data.runs || []);
      setSelectedRunIds((previous) => {
        const available = new Set<string>((data.runs || []).map((run: SavedBenchmarkRun) => run.runId));
        const retained = previous.filter((id) => available.has(id));
        if (!retained.length) return (data.runs || []).slice(0, 1).map((run: SavedBenchmarkRun) => run.runId);
        const firstSuite = (data.runs || []).find((run: SavedBenchmarkRun) => run.runId === retained[0])?.benchmark.suiteHash;
        return retained.filter((id) => (data.runs || []).find((run: SavedBenchmarkRun) => run.runId === id)?.benchmark.suiteHash === firstSuite);
      });
    } catch (err: any) {
      alert(`Could not load saved benchmarks: ${err.message}`);
    } finally {
      setRunsLoading(false);
    }
  };

  useEffect(() => {
    if (!configDirty) setBenchmarkConfig(getBenchmarkDefaults(currentConfig, toolSettings));
  }, [currentConfig, toolSettings, configDirty]);

  const updateBenchmarkConfig = <K extends keyof BenchmarkFormConfig>(key: K, value: BenchmarkFormConfig[K]) => {
    setConfigDirty(true);
    setBenchmarkConfig((previous) => ({ ...previous, [key]: value }));
  };

  const resetBenchmarkConfig = () => {
    setBenchmarkConfig(getBenchmarkDefaults(currentConfig, toolSettings));
    setConfigDirty(false);
  };

  const updatePruningConfig = <K extends keyof BenchmarkFormConfig['pruningConfig']>(
    key: K,
    value: BenchmarkFormConfig['pruningConfig'][K],
  ) => {
    setConfigDirty(true);
    setBenchmarkConfig((previous) => ({
      ...previous,
      pruningConfig: { ...previous.pruningConfig, [key]: value },
    }));
  };

  const benchmarkRequestConfig = () => ({
    model: benchmarkConfig.model,
    host: benchmarkConfig.ollamaHost,
    attemptsPerCase,
    parallelism,
    agentConfig: {
      temperature: benchmarkConfig.temperature,
      contextWindow: benchmarkConfig.contextWindow,
      maxLoops: benchmarkConfig.maxLoops,
      enableThinking: benchmarkConfig.enableThinking,
      showWorkingDirInfo: benchmarkConfig.showWorkingDirInfo,
      complexityProfile: benchmarkConfig.complexityProfile,
      systemPrompt: benchmarkConfig.systemPrompt,
      pruningConfig: benchmarkConfig.pruningConfig,
      enabledTools: benchmarkConfig.enabledTools,
    },
  });

  const validateBenchmarkConfig = (): string | null => {
    if (!benchmarkConfig.model.trim()) return 'Select a model.';
    try {
      const url = new URL(benchmarkConfig.ollamaHost);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'Ollama API URL must use HTTP or HTTPS.';
    } catch (_) {
      return 'Enter a valid Ollama API URL.';
    }
    if (!Number.isFinite(benchmarkConfig.temperature) || benchmarkConfig.temperature < 0 || benchmarkConfig.temperature > 1) return 'Temperature must be between 0 and 1.';
    if (!Number.isInteger(benchmarkConfig.contextWindow) || benchmarkConfig.contextWindow < 1024) return 'Context window must be an integer of at least 1024.';
    if (!Number.isInteger(benchmarkConfig.maxLoops) || benchmarkConfig.maxLoops < 0 || benchmarkConfig.maxLoops > 50) return 'Maximum tool loops must be an integer between 0 and 50.';
    if (!Number.isInteger(attemptsPerCase) || attemptsPerCase < 1 || attemptsPerCase > 10) return 'Attempts per case must be an integer between 1 and 10.';
    if (!Number.isInteger(parallelism) || parallelism < 1 || parallelism > 10) return 'Parallelism must be an integer between 1 and 10.';
    if (!benchmarkConfig.systemPrompt.trim()) return 'System prompt cannot be empty.';
    if (!Number.isInteger(benchmarkConfig.pruningConfig.terminalOutputTTLTurns) || benchmarkConfig.pruningConfig.terminalOutputTTLTurns < 0) return 'Terminal output TTL must be a non-negative integer.';
    if (!Number.isInteger(benchmarkConfig.pruningConfig.webOutputTTLTurns) || benchmarkConfig.pruningConfig.webOutputTTLTurns < 0) return 'Web output TTL must be a non-negative integer.';
    return null;
  };

  // Modal State for Test Info
  const [selectedInfoTest, setSelectedInfoTest] = useState<BenchmarkTestCaseInfo | TestResultTrace | null>(null);

  useEffect(() => {
    void Promise.all([
      fetch('/api/benchmark/testcases').then((res) => res.json()).then((data) => {
        if (data.testCases) setTestCasesInfo(data.testCases);
      }),
      fetch('/api/benchmark/definitions').then((res) => res.json()).then((data) => {
        if (data.definitions) setBenchmarkDefinitions(data.definitions);
      }),
      loadSavedRuns(),
    ]).catch((err) => console.error('Error initializing benchmark view:', err));
  }, []);

  useEffect(() => () => benchmarkAbortController.current?.abort(), []);

  const handleRunAllBenchmarks = async () => {
    const configError = validateBenchmarkConfig();
    if (configError) {
      alert(configError);
      return;
    }
    const selectedDefinition = benchmarkDefinitions.find((definition) => definition.id === selectedBenchmarkId);
    if (!selectedDefinition) {
      alert('Select a benchmark.');
      return;
    }
    const controller = new AbortController();
    benchmarkAbortController.current = controller;
    setIsRunning(true);
    setIsStopping(false);
    setWasStopped(false);
    setReport(null);
    setLiveResults([]);
    setProgress({ current: 0, completed: 0, total: selectedDefinition.testIds.length });

    try {
      const response = await fetch('/api/benchmark/run-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...benchmarkRequestConfig(),
          saveResults,
          runName,
          benchmarkId: selectedDefinition.id,
          ...(outputLocationMode === 'custom' && outputDirectory.trim() ? { outputDirectory: outputDirectory.trim() } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Server connection error ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const block of lines) {
          if (!block.trim()) continue;
          const eventLine = block.match(/^event:\s*(.+)$/m);
          const dataLine = block.match(/^data:\s*(.+)$/m);

          if (eventLine && dataLine) {
            const eventType = eventLine[1].trim();
            const eventData = JSON.parse(dataLine[1].trim());

            if (eventType === 'test_start') {
              setProgress({
                current: eventData.current,
                completed: eventData.current - 1,
                total: eventData.total,
                testName: eventData.test.name,
              });
              setLiveStreamingText('');
              setLiveThinkingText('');
              setLiveActiveTool(null);
              setLiveMetrics(null);
              setLiveSteps((prev) => [...prev.slice(-24), { timestamp: Date.now(), type: 'start', text: `🚀 Starting Test: ${eventData.test.name}` }]);
            } else if (eventType === 'test_step') {
              if (eventData.type === 'llm_start') {
                setLiveSteps((prev) => [...prev.slice(-24), { timestamp: eventData.timestamp || Date.now(), type: 'llm_start', text: `🤖 Ollama LLM Inference started for ${eventData.model || 'model'} (Evaluating prompt tokens...)` }]);
              } else if (eventData.type === 'chunk') {
                setLiveStreamingText(eventData.snippet || '');
              } else if (eventData.type === 'thinking_chunk') {
                setLiveThinkingText(eventData.snippet || '');
              } else if (eventData.type === 'metrics') {
                setLiveMetrics({
                  promptTokens: eventData.promptTokens,
                  generatedTokens: eventData.generatedTokens,
                  tokensPerSec: eventData.tokensPerSec,
                });
              } else if (eventData.type === 'tool_start') {
                setLiveActiveTool(eventData.name);
                setLiveSteps((prev) => [...prev.slice(-24), { timestamp: eventData.timestamp || Date.now(), type: eventData.type, text: `🛠️ Executing Tool: ${eventData.name}`, detail: eventData.args ? JSON.stringify(eventData.args) : undefined }]);
              } else if (eventData.type === 'tool_end') {
                setLiveActiveTool(null);
                setLiveSteps((prev) => [...prev.slice(-24), { timestamp: eventData.timestamp || Date.now(), type: eventData.type, text: `✅ Finished Tool: ${eventData.name}`, detail: eventData.resultSnippet }]);
              } else if (eventData.type === 'assistant_message') {
                setLiveSteps((prev) => [...prev.slice(-24), { timestamp: eventData.timestamp || Date.now(), type: eventData.type, text: `💬 Model Turn Completed` }]);
              }
            } else if (eventType === 'test_complete') {
              setLiveStreamingText('');
              setLiveThinkingText('');
              setLiveActiveTool(null);
              setProgress((prev) => ({
                current: eventData.current,
                completed: eventData.current,
                total: eventData.total,
                testName: prev?.testName,
              }));
              setLiveResults((prev) => {
                const filtered = prev.filter((r) => r.testId !== eventData.trace.testId);
                return [...filtered, eventData.trace];
              });
              const verdict = eventData.trace.passed ? 'PASSED' : 'FAILED';
              setLiveSteps((prev) => [...prev.slice(-24), { timestamp: Date.now(), type: 'complete', text: `${eventData.trace.passed ? '✅' : '❌'} Test ${verdict}: ${eventData.trace.testName} (${(eventData.trace.durationMs / 1000).toFixed(2)}s)` }]);
            } else if (eventType === 'benchmark_done') {
              setReport(eventData.report);
              if (eventData.savedRun) {
                setSavedRun(eventData.savedRun);
                void loadSavedRuns(eventData.savedRun.outputDirectory);
              }
              if (eventData.saveError) alert(`Benchmark completed, but saving failed: ${eventData.saveError}`);
            } else if (eventType === 'cancelled') {
              setWasStopped(true);
            } else if (eventType === 'error') {
              alert(`Benchmark Stream Error: ${eventData.error}`);
            }
          }
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setWasStopped(true);
      } else {
        alert(`Benchmark execution failed: ${err.message}`);
      }
    } finally {
      if (benchmarkAbortController.current === controller) {
        benchmarkAbortController.current = null;
      }
      setIsRunning(false);
      setIsStopping(false);
      setProgress(null);
    }
  };

  const handleStopBenchmarks = () => {
    if (!benchmarkAbortController.current) return;
    setIsStopping(true);
    benchmarkAbortController.current.abort();
  };

  const handleRunSingleTest = async (testId: string) => {
    const configError = validateBenchmarkConfig();
    if (configError) {
      alert(configError);
      return;
    }
    const controller = new AbortController();
    singleAbortController.current = controller;
    setRunningSingleId(testId);
    setLiveStreamingText('');
    setLiveThinkingText('');
    setLiveActiveTool(null);
    setLiveMetrics(null);
    setLiveSteps([{ timestamp: Date.now(), type: 'start', text: `🚀 Initializing single test execution for ${testId}...` }]);
    try {
      const res = await fetch('/api/benchmark/run-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testId, stream: true, ...benchmarkRequestConfig() }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Server connection error ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const block of lines) {
          if (!block.trim()) continue;
          const eventLine = block.match(/^event:\s*(.+)$/m);
          const dataLine = block.match(/^data:\s*(.+)$/m);

          if (eventLine && dataLine) {
            const eventType = eventLine[1].trim();
            const eventData = JSON.parse(dataLine[1].trim());

            if (eventType === 'test_start') {
              setLiveSteps((prev) => [...prev.slice(-24), { timestamp: Date.now(), type: 'start', text: `🐳 Docker Sandbox active for ${eventData.test.name}` }]);
            } else if (eventType === 'test_step') {
              if (eventData.type === 'llm_start') {
                setLiveSteps((prev) => [...prev.slice(-24), { timestamp: eventData.timestamp || Date.now(), type: 'llm_start', text: `🤖 Ollama LLM Inference started for ${eventData.model || 'model'} (Evaluating prompt tokens...)` }]);
              } else if (eventData.type === 'chunk') {
                setLiveStreamingText(eventData.snippet || '');
              } else if (eventData.type === 'thinking_chunk') {
                setLiveThinkingText(eventData.snippet || '');
              } else if (eventData.type === 'metrics') {
                setLiveMetrics({
                  promptTokens: eventData.promptTokens,
                  generatedTokens: eventData.generatedTokens,
                  tokensPerSec: eventData.tokensPerSec,
                });
              } else if (eventData.type === 'tool_start') {
                setLiveActiveTool(eventData.name);
                setLiveSteps((prev) => [...prev.slice(-24), { timestamp: eventData.timestamp || Date.now(), type: eventData.type, text: `🛠️ Executing Tool: ${eventData.name}`, detail: eventData.args ? JSON.stringify(eventData.args) : undefined }]);
              } else if (eventData.type === 'tool_end') {
                setLiveActiveTool(null);
                setLiveSteps((prev) => [...prev.slice(-24), { timestamp: eventData.timestamp || Date.now(), type: eventData.type, text: `✅ Finished Tool: ${eventData.name}`, detail: eventData.resultSnippet }]);
              } else if (eventData.type === 'assistant_message') {
                setLiveSteps((prev) => [...prev.slice(-24), { timestamp: eventData.timestamp || Date.now(), type: eventData.type, text: `💬 Model Turn Completed` }]);
              }
            } else if (eventType === 'test_complete') {
              setLiveStreamingText('');
              setLiveThinkingText('');
              setLiveActiveTool(null);
              if (eventData.trace) {
                setLiveResults((prev) => {
                  const filtered = prev.filter((r) => r.testId !== testId);
                  return [...filtered, eventData.trace];
                });
                const verdict = eventData.trace.passed ? 'PASSED' : 'FAILED';
                setLiveSteps((prev) => [...prev.slice(-24), { timestamp: Date.now(), type: 'complete', text: `${eventData.trace.passed ? '✅' : '❌'} Test ${verdict}: ${eventData.trace.testName} (${(eventData.trace.durationMs / 1000).toFixed(2)}s)` }]);
              }
            } else if (eventType === 'error') {
              alert(`Test execution failed: ${eventData.error}`);
            }
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        alert(`Error running single test: ${err.message}`);
      }
    } finally {
      if (singleAbortController.current === controller) {
        singleAbortController.current = null;
      }
      setRunningSingleId(null);
    }
  };

  const handleStopSingleTest = () => {
    if (singleAbortController.current) {
      singleAbortController.current.abort();
      singleAbortController.current = null;
    }
  };

  const reloadBenchmarkDefinitions = async (selectId?: string) => {
    const response = await fetch('/api/benchmark/definitions');
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Could not load benchmarks.');
    setBenchmarkDefinitions(data.definitions);
    if (selectId) setSelectedBenchmarkId(selectId);
  };

  const beginCreateBenchmark = () => {
    setShowSelectedBenchmarkTests(false);
    setEditingBenchmarkId('new');
    setDefinitionName('');
    setDefinitionDescription('');
    setDefinitionTestIds([]);
  };

  const beginEditBenchmark = (definition: BenchmarkDefinition) => {
    if (definition.type !== 'custom') return;
    setShowSelectedBenchmarkTests(false);
    setEditingBenchmarkId(definition.id);
    setDefinitionName(definition.name);
    setDefinitionDescription(definition.description);
    setDefinitionTestIds([...definition.testIds]);
  };

  const toggleDefinitionTest = (testId: string) => {
    setDefinitionTestIds((previous) => previous.includes(testId)
      ? previous.filter((id) => id !== testId)
      : [...previous, testId]);
  };

  const saveBenchmarkDefinition = async () => {
    if (!definitionName.trim()) return alert('Benchmark name is required.');
    if (!definitionTestIds.length) return alert('Select at least one test.');
    setDefinitionSaving(true);
    try {
      const creating = editingBenchmarkId === 'new';
      const response = await fetch(
        creating ? '/api/benchmark/definitions' : `/api/benchmark/definitions/${encodeURIComponent(editingBenchmarkId || '')}`,
        {
          method: creating ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: definitionName,
            description: definitionDescription,
            testIds: definitionTestIds,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not save benchmark.');
      await reloadBenchmarkDefinitions(data.definition.id);
      setEditingBenchmarkId(null);
    } catch (err: any) {
      alert(`Could not save benchmark: ${err.message}`);
    } finally {
      setDefinitionSaving(false);
    }
  };

  const removeBenchmarkDefinition = async (definition: BenchmarkDefinition) => {
    if (definition.type !== 'custom' || !window.confirm(`Delete benchmark "${definition.name}"? Saved run reports will not be deleted.`)) return;
    try {
      const response = await fetch(`/api/benchmark/definitions/${encodeURIComponent(definition.id)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not delete benchmark.');
      await reloadBenchmarkDefinitions('quick');
      setEditingBenchmarkId(null);
    } catch (err: any) {
      alert(`Could not delete benchmark: ${err.message}`);
    }
  };

  const toggleExpand = (testId: string) => {
    setExpandedTestId((prev) => (prev === testId ? null : testId));
  };

  const passCount = liveResults.reduce((sum, result) => sum + result.successfulAttempts, 0);
  const failCount = liveResults.reduce((sum, result) => sum + result.failedAttempts, 0);
  const completedAttempts = passCount + failCount;
  const accuracyPercentage = completedAttempts > 0 ? Math.round((passCount / completedAttempts) * 100) : 0;
  const liveTiming = sumTimings(liveResults);
  const totalDurationMs = completedAttempts ? liveTiming.comparisonMs / completedAttempts : 0;
  const configLocked = isRunning || runningSingleId !== null;
  const selectedBenchmark = benchmarkDefinitions.find((definition) => definition.id === selectedBenchmarkId);
  const runsBySuite = new Map<string, SavedBenchmarkRun[]>();
  savedRuns.forEach((run) => runsBySuite.set(run.benchmark.suiteHash, [...(runsBySuite.get(run.benchmark.suiteHash) || []), run]));
  const performanceRankById = new Map<string, number>();
  runsBySuite.forEach((runs) => runs
    .sort((a, b) => b.successRatePercentage - a.successRatePercentage || a.comparisonDurationMs - b.comparisonDurationMs || b.runDate.localeCompare(a.runDate))
    .forEach((run, index) => performanceRankById.set(run.runId, index + 1)));
  const rankedRuns = [...savedRuns].sort((a, b) => {
    if (runSort.key === 'model') {
      const comparison = a.model.localeCompare(b.model, undefined, { numeric: true, sensitivity: 'base' });
      return runSort.direction === 'asc' ? comparison : -comparison;
    }
    if (runSort.key === 'total') {
      const comparison = a.timing.comparisonMs - b.timing.comparisonMs;
      return runSort.direction === 'asc' ? comparison : -comparison;
    }
    if (runSort.key === 'elapsed') {
      const comparison = a.totalDurationMs - b.totalDurationMs;
      return runSort.direction === 'asc' ? comparison : -comparison;
    }
    if (runSort.key === 'average') {
      const comparison = a.comparisonDurationMs - b.comparisonDurationMs;
      return runSort.direction === 'asc' ? comparison : -comparison;
    }
    if (runSort.key === 'date') {
      const comparison = a.runDate.localeCompare(b.runDate);
      return runSort.direction === 'asc' ? comparison : -comparison;
    }
    return b.successRatePercentage - a.successRatePercentage || a.comparisonDurationMs - b.comparisonDurationMs || b.runDate.localeCompare(a.runDate);
  });
  const comparedRuns = rankedRuns.filter((run) => selectedRunIds.includes(run.runId));
  const comparedTestIds = Array.from(new Set(comparedRuns.flatMap((run) => run.results.map((result) => result.testId))));
  const flattenedConfigs = comparedRuns.map((run) => flattenConfig(run.modelConfig as unknown as Record<string, unknown>));
  const comparedConfigFields = Array.from(new Set(flattenedConfigs.flatMap((config) => Object.keys(config))))
    .sort((left, right) => {
      const leftIndex = CONFIG_FIELD_ORDER.indexOf(left);
      const rightIndex = CONFIG_FIELD_ORDER.indexOf(right);
      if (leftIndex !== -1 || rightIndex !== -1) {
        if (leftIndex === -1) return 1;
        if (rightIndex === -1) return -1;
        return leftIndex - rightIndex;
      }
      return left.localeCompare(right);
    });
  const comparedConfigRows = comparedConfigFields.map((field) => {
    const values = flattenedConfigs.map((config) => formatConfigValue(config[field]));
    return { field, values, differs: new Set(values).size > 1 };
  });
  const configDifferenceCount = comparedConfigRows.filter((row) => row.differs).length;

  const toggleComparedRun = (runId: string) => {
    const run = savedRuns.find((candidate) => candidate.runId === runId);
    const selectedSuiteHash = savedRuns.find((candidate) => selectedRunIds.includes(candidate.runId))?.benchmark.suiteHash;
    if (run && selectedSuiteHash && run.benchmark.suiteHash !== selectedSuiteHash) {
      alert('Only runs of the same benchmark test set can be compared. Clear the current selection first.');
      return;
    }
    setSelectedRunIds((previous) => previous.includes(runId)
      ? previous.filter((id) => id !== runId)
      : [...previous, runId]);
  };

  const toggleRunSort = (key: 'model' | 'date' | 'elapsed' | 'total' | 'average') => {
    setRunSort((previous) => previous.key === key
      ? { key, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: key === 'date' ? 'desc' : 'asc' });
  };

  const sortIndicator = (key: 'model' | 'date' | 'elapsed' | 'total' | 'average') =>
    runSort.key === key ? (runSort.direction === 'asc' ? '▲' : '▼') : '↕';

  const handleDeleteRun = async (run: SavedBenchmarkRun) => {
    if (!window.confirm(`Delete benchmark ${run.runId}?\n\nThis permanently removes its report.json and index.html files.`)) return;
    setDeletingRunId(run.runId);
    try {
      const response = await fetch(`/api/benchmark/runs/${encodeURIComponent(run.runId)}?directory=${encodeURIComponent(run.outputDirectory)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not delete benchmark run.');
      setSavedRuns((previous) => previous.filter((item) => item.runId !== run.runId));
      setSelectedRunIds((previous) => previous.filter((id) => id !== run.runId));
      setSavedRun((previous) => previous?.runId === run.runId ? null : previous);
    } catch (err: any) {
      alert(`Could not delete benchmark: ${err.message}`);
    } finally {
      setDeletingRunId(null);
    }
  };

  return (
    <div className="benchmark-view" style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="benchmark-tabs" style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)' }}>
        <button className={activeTab === 'runner' ? 'active' : ''} onClick={() => setActiveTab('runner')}><Play size={15} /> Runner</button>
        <button className={activeTab === 'compare' ? 'active' : ''} onClick={() => { setActiveTab('compare'); void loadSavedRuns(outputDirectory); }}><BarChart3 size={15} /> Compare & top list <span>{savedRuns.length}</span></button>
      </div>

      {activeTab === 'compare' ? (
        <div className="benchmark-comparison" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div className="glass-panel" style={{ padding: '20px', borderRadius: '14px' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'end', flexWrap: 'wrap' }}>
              <label style={{ flex: '1 1 420px', display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                Benchmark directory
                <input value={outputDirectory} onChange={(event) => setOutputDirectory(event.target.value)} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#111827', color: 'var(--text-main)' }} />
              </label>
              <button onClick={() => void loadSavedRuns(outputDirectory)} disabled={runsLoading} className="benchmark-secondary-button">
                {runsLoading ? <Loader2 size={15} className="spin" /> : <RotateCw size={15} />} Refresh
              </button>
            </div>
          </div>

          {rankedRuns.length === 0 ? (
            <div className="glass-panel benchmark-empty-runs"><Trophy size={28} /><strong>No saved benchmark runs found</strong><span>Complete a suite run with saving enabled, or choose another directory.</span></div>
          ) : (
            <>
              <div className="glass-panel benchmark-ranking">
                <div className="benchmark-ranking-header"><Trophy size={19} color="var(--accent-amber)" /><h3>Leaderboard</h3><span>{runSort.key === 'rank' ? 'Success rate first, then comparison time' : `Sorted by ${runSort.key} (${runSort.direction === 'asc' ? 'ascending' : 'descending'})`}</span></div>
                <div className="benchmark-table-scroll"><table><thead><tr><th>Compare</th><th>Suite rank</th><th>Run label</th><th>Benchmark</th><th><button className={runSort.key === 'model' ? 'benchmark-sort-active' : ''} onClick={() => toggleRunSort('model')}>Model <span>{sortIndicator('model')}</span></button></th><th><button className={runSort.key === 'date' ? 'benchmark-sort-active' : ''} onClick={() => toggleRunSort('date')}>Generated <span>{sortIndicator('date')}</span></button></th><th>Score</th><th>Passed</th><th><button className={runSort.key === 'elapsed' ? 'benchmark-sort-active' : ''} onClick={() => toggleRunSort('elapsed')} title="Actual start-to-finish benchmark duration">Wall time <span>{sortIndicator('elapsed')}</span></button></th><th><button className={runSort.key === 'total' ? 'benchmark-sort-active' : ''} onClick={() => toggleRunSort('total')}>Total compare <span>{sortIndicator('total')}</span></button></th><th><button className={runSort.key === 'average' ? 'benchmark-sort-active' : ''} onClick={() => toggleRunSort('average')}>Avg compare <span>{sortIndicator('average')}</span></button></th><th>Actions</th></tr></thead>
                  <tbody>{rankedRuns.map((run) => <tr key={run.runId}>
                    <td><input type="checkbox" checked={selectedRunIds.includes(run.runId)} onChange={() => toggleComparedRun(run.runId)} /></td>
                    <td className="benchmark-rank">#{performanceRankById.get(run.runId)}</td><td><strong>{run.runName || 'Unlabeled'}</strong></td><td><strong>{run.benchmark.definitionName}</strong><small>{run.benchmark.testIds.length} tests · {run.attemptsPerCase} attempts · parallelism {run.parallelism ?? 1} · v{run.benchmark.definitionVersion}</small></td><td><strong>{run.model}</strong><small>{run.runId}</small></td>
                    <td>{formatRunDate(run.runDate)}</td><td><strong className={run.successRatePercentage === 100 ? 'benchmark-pass' : ''}>{run.successRatePercentage}%</strong></td>
                    <td>{run.successfulAttempts}/{run.totalAttempts}</td><td>{formatMs(run.totalDurationMs)}</td><td>{formatMs(run.timing.comparisonMs)}</td><td>{formatMs(run.comparisonDurationMs)}</td>
                    <td><div className="benchmark-run-actions"><a href={`/api/benchmark/report?directory=${encodeURIComponent(run.outputDirectory)}&runId=${encodeURIComponent(run.runId)}`} target="_blank" rel="noreferrer">Open HTML</a><button onClick={() => void handleDeleteRun(run)} disabled={deletingRunId === run.runId} title="Delete this saved benchmark">{deletingRunId === run.runId ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />} Delete</button></div></td>
                  </tr>)}</tbody></table></div>
              </div>

              {comparedRuns.length > 0 && <div className="glass-panel benchmark-matrix">
                <div className="benchmark-ranking-header"><BarChart3 size={19} color="var(--accent-primary)" /><h3>Per-test comparison</h3><span>{comparedRuns.length} selected run{comparedRuns.length === 1 ? '' : 's'}</span></div>
                <div className="benchmark-table-scroll"><table><thead><tr><th>Test</th>{comparedRuns.map((run) => <th key={run.runId}>{run.runName || run.model}<small>{run.runName ? run.model : 'Unnamed run'}</small><small>{run.successRatePercentage}% success · {formatMs(run.comparisonDurationMs)} compare</small><small>{formatRunDate(run.runDate)}</small></th>)}</tr></thead>
                  <tbody>{comparedTestIds.map((testId) => {
                    const label = comparedRuns.flatMap((run) => run.results).find((result) => result.testId === testId)?.testName || testId;
                    return <tr key={testId}><td><strong>{label}</strong><small>{testId}</small></td>{comparedRuns.map((run) => {
                      const result = run.results.find((item) => item.testId === testId);
                      return <td key={run.runId}>{result ? <><span className={result.successRatePercentage === 100 ? 'benchmark-pass' : 'benchmark-fail'}>{result.successRatePercentage}%</span><small>{result.successfulAttempts}/{result.attemptCount} · {formatMs(result.durationMs)} avg</small></> : <span className="muted">—</span>}</td>;
                    })}</tr>;
                  })}</tbody></table></div>
              </div>}

              {comparedRuns.length > 0 && <details className="glass-panel benchmark-config-disclosure">
                <summary>
                  <span className="benchmark-config-summary-title"><Cpu size={17} color="var(--accent-teal)" /><strong>Model configuration comparison</strong></span>
                  <span className="benchmark-config-summary-meta">{configDifferenceCount} difference{configDifferenceCount === 1 ? '' : 's'} · {comparedRuns.length} run{comparedRuns.length === 1 ? '' : 's'}</span>
                </summary>
                <div className="benchmark-config-toolbar">
                  <span>Distinct values use different colors.</span>
                  <label><input type="checkbox" checked={showMatchingConfigs} onChange={(event) => setShowMatchingConfigs(event.target.checked)} /> Show matching settings</label>
                </div>
                <div className="benchmark-table-scroll"><table className="benchmark-config-table"><thead><tr><th>Setting</th>{comparedRuns.map((run) => <th key={run.runId}>{run.runName || run.model}<small>{run.runName ? run.model : 'Unnamed run'} · {formatRunDate(run.runDate)}</small></th>)}</tr></thead>
                  <tbody>{comparedConfigRows
                    .filter((row) => showMatchingConfigs || comparedRuns.length < 2 || row.differs)
                    .map(({ field, values, differs }) => {
                      const distinctValues = Array.from(new Set(values));
                      return <tr key={field} className={differs ? 'benchmark-config-diff' : ''}>
                        <td><strong>{field}</strong></td>
                        {values.map((value, index) => <td key={comparedRuns[index].runId} className={differs ? `benchmark-config-value benchmark-config-value-${distinctValues.indexOf(value) % 4}` : ''}><code>{value}</code></td>)}
                      </tr>;
                    })}</tbody></table></div>
              </details>}
            </>
          )}
        </div>
      ) : <>
      {/* Top Banner & Control Panel */}
      <div className="glass-panel benchmark-hero" style={{ padding: '24px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
        <div className="benchmark-hero-copy">
          <div className="benchmark-title" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <Zap size={22} color="var(--accent-amber)" />
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-main)' }}>
              Dockerized Outcome Benchmark Suite
            </h2>
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', maxWidth: '560px', lineHeight: 1.5 }}>
            Run each task repeatedly in fresh containers, compare model reliability, and inspect complete timing and execution traces.
          </p>
        </div>

        {/* Primary benchmark action */}
        <div className="benchmark-actions" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            onClick={isRunning ? handleStopBenchmarks : runningSingleId !== null ? handleStopSingleTest : handleRunAllBenchmarks}
            disabled={isStopping || (!isRunning && runningSingleId === null && (editingBenchmarkId !== null || !selectedBenchmark))}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: (isRunning || runningSingleId !== null) ? 'rgba(239, 68, 68, 0.16)' : 'var(--accent-gradient)',
              border: (isRunning || runningSingleId !== null) ? '1px solid rgba(239, 68, 68, 0.55)' : 'none',
              color: '#fff',
              padding: '10px 20px',
              borderRadius: '8px',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: isStopping || (!isRunning && runningSingleId === null && (editingBenchmarkId !== null || !selectedBenchmark)) ? 'not-allowed' : 'pointer',
              boxShadow: (isRunning || runningSingleId !== null) ? '0 4px 14px rgba(239, 68, 68, 0.2)' : '0 4px 14px rgba(99, 102, 241, 0.35)',
              transition: 'all 0.2s',
            }}
          >
            {isStopping ? <Loader2 size={18} className="spin" /> : (isRunning || runningSingleId !== null) ? <Square size={17} /> : <Play size={18} />}
            <span>
              {isRunning
                ? isStopping
                  ? 'Stopping…'
                  : `Stop Benchmark (${progress ? `${progress.current}/${progress.total}` : ''})`
                : runningSingleId !== null
                ? 'Stop 1-by-1 Test'
                : `Run ${selectedBenchmark?.name || 'Benchmark'} (${selectedBenchmark?.testIds.length || 0})`}
            </span>
          </button>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '20px', borderRadius: '14px', border: '1px solid rgba(56, 189, 248, 0.28)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '6px' }}>
          <Target size={18} color="#38bdf8" />
          <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1rem' }}>Benchmark Run Setup</h3>
        </div>
        <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          Choose what to test, which model to test, and how reliability attempts should be scheduled.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px', alignItems: 'end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            Model
            <select value={benchmarkConfig.model} disabled={configLocked} onChange={(event) => updateBenchmarkConfig('model', event.target.value)} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#111827', color: 'var(--text-main)' }}>
              {models.map((model) => <option key={model.name} value={model.name}>{model.name}</option>)}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            Benchmark
            <select value={selectedBenchmarkId} disabled={configLocked || editingBenchmarkId !== null} onChange={(event) => { setSelectedBenchmarkId(event.target.value); setShowSelectedBenchmarkTests(false); }} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#111827', color: 'var(--text-main)' }}>
              {benchmarkDefinitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.name} ({definition.testIds.length} tests)</option>)}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            Reliability attempts per case (1–10)
            <input type="number" min="1" max="10" value={attemptsPerCase} disabled={configLocked} onChange={(event) => setAttemptsPerCase(Number(event.target.value))} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#111827', color: 'var(--text-main)' }} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            Concurrent attempts (1–10)
            <input type="number" min="1" max="10" value={parallelism} disabled={configLocked} onChange={(event) => setParallelism(Number(event.target.value))} title="1 runs attempts sequentially; higher values start this many isolated containers at once." style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#111827', color: 'var(--text-main)' }} />
          </label>
        </div>

        {attemptsPerCase === 10 && (
          <div role="alert" style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.55)', background: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24', fontSize: '0.82rem' }}>
            <strong>Maximum reliability run:</strong> every selected case will run 10 times. This can take significant time and compute.
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-color)' }}>
          <button className="benchmark-secondary-button" disabled={!selectedBenchmark || editingBenchmarkId !== null} onClick={() => setShowSelectedBenchmarkTests((visible) => !visible)}>
            <FileCode2 size={14} /> {showSelectedBenchmarkTests ? 'Hide test cases' : `View test cases (${selectedBenchmark?.testIds.length || 0})`}
          </button>
          <button className="benchmark-secondary-button" disabled={configLocked || editingBenchmarkId !== null} onClick={beginCreateBenchmark}>Create custom</button>
          {selectedBenchmark?.type === 'custom' && <>
            <button className="benchmark-secondary-button" disabled={configLocked || editingBenchmarkId !== null} onClick={() => beginEditBenchmark(selectedBenchmark)}>Edit</button>
            <button className="benchmark-secondary-button" disabled={configLocked || editingBenchmarkId !== null} onClick={() => void removeBenchmarkDefinition(selectedBenchmark)}><Trash2 size={14} /> Delete</button>
          </>}
        </div>
        {selectedBenchmark && editingBenchmarkId === null && <p style={{ margin: '12px 0 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>{selectedBenchmark.description} · Version {selectedBenchmark.version}</p>}

        {selectedBenchmark && showSelectedBenchmarkTests && editingBenchmarkId === null && <div style={{ marginTop: '14px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
          <div style={{ marginBottom: '9px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            These tests run in the order shown.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '7px', maxHeight: '360px', overflowY: 'auto' }}>
            {selectedBenchmark.testIds.map((testId, index) => {
              const testCase = testCasesInfo.find((candidate) => candidate.id === testId);
              return <div key={testId} style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 10px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'rgba(15,23,42,.55)' }}>
                <span style={{ minWidth: '22px', color: 'var(--text-dim)', fontSize: '0.72rem', textAlign: 'right' }}>{index + 1}.</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong style={{ display: 'block', color: 'var(--text-main)', fontSize: '0.8rem' }}>{testCase?.name || testId}</strong>
                  <small style={{ color: 'var(--text-dim)' }}>{testCase?.category || 'Missing test'} · {testId}</small>
                </div>
                {testCase && <button className="benchmark-secondary-button" onClick={() => setSelectedInfoTest(testCase)} title="View test specification"><Info size={13} /> Info</button>}
              </div>;
            })}
          </div>
        </div>}

        {editingBenchmarkId !== null && <div style={{ marginTop: '18px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(280px, 2fr)', gap: '12px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>Name
              <input value={definitionName} maxLength={100} onChange={(event) => setDefinitionName(event.target.value)} placeholder="My benchmark" style={{ padding: '9px 10px', borderRadius: '7px', border: '1px solid var(--border-color)', background: '#111827', color: 'var(--text-main)' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>Description
              <input value={definitionDescription} maxLength={500} onChange={(event) => setDefinitionDescription(event.target.value)} placeholder="What this benchmark measures" style={{ padding: '9px 10px', borderRadius: '7px', border: '1px solid var(--border-color)', background: '#111827', color: 'var(--text-main)' }} />
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 8px' }}>
            <strong style={{ fontSize: '0.88rem' }}>Selected tests ({definitionTestIds.length}/{testCasesInfo.length})</strong>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="benchmark-secondary-button" onClick={() => setDefinitionTestIds(testCasesInfo.map((testCase) => testCase.id))}>Select all</button>
              <button className="benchmark-secondary-button" onClick={() => setDefinitionTestIds([])}>Clear</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '7px', maxHeight: '340px', overflowY: 'auto', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '9px', background: 'rgba(15,23,42,.55)' }}>
            {testCasesInfo.map((testCase) => <label key={testCase.id} style={{ display: 'flex', alignItems: 'start', gap: '8px', padding: '6px', color: 'var(--text-main)', fontSize: '0.78rem' }}>
              <input type="checkbox" checked={definitionTestIds.includes(testCase.id)} onChange={() => toggleDefinitionTest(testCase.id)} />
              <span><strong style={{ display: 'block' }}>{testCase.name}</strong><small style={{ color: 'var(--text-dim)' }}>{testCase.category}</small></span>
            </label>)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'end', gap: '9px', marginTop: '12px' }}>
            <button className="benchmark-secondary-button" disabled={definitionSaving} onClick={() => setEditingBenchmarkId(null)}>Cancel</button>
            <button className="benchmark-secondary-button" disabled={definitionSaving} onClick={() => void saveBenchmarkDefinition()}>{definitionSaving ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Save benchmark</button>
          </div>
        </div>}
      </div>

      <div className="glass-panel benchmark-collapsible-panel" style={{ borderColor: 'rgba(99, 102, 241, 0.28)' }}>
        <button className="benchmark-collapsible-toggle benchmark-collapsible-toggle-agent" type="button" onClick={() => setShowAdvancedSettings((visible) => !visible)} aria-expanded={showAdvancedSettings}>
          <div>
            <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1rem' }}>Advanced Agent Configuration</h3>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              Direct agent behavior initialized from the current agent. Changes here apply only to benchmark runs.
            </p>
          </div>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
            {showAdvancedSettings ? 'Hide settings' : 'Show settings'}
            <ChevronDown size={16} style={{ transform: showAdvancedSettings ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
          </span>
        </button>

        {showAdvancedSettings && <div style={{ padding: '16px 20px 20px', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px', paddingTop: '4px' }}>
          <button
            onClick={resetBenchmarkConfig}
            disabled={configLocked || !configDirty}
            style={{ padding: '7px 12px', borderRadius: '7px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.06)', color: 'var(--text-main)', cursor: configLocked || !configDirty ? 'not-allowed' : 'pointer', opacity: configLocked || !configDirty ? 0.55 : 1 }}
          >
            Reset to current agent
          </button>
          </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            Ollama API URL
            <input value={benchmarkConfig.ollamaHost} disabled={configLocked} onChange={(event) => updateBenchmarkConfig('ollamaHost', event.target.value)} style={{ padding: '9px 10px', borderRadius: '7px', border: '1px solid var(--border-color)', background: '#111827', color: 'var(--text-main)' }} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            Temperature (0–1)
            <input type="number" min="0" max="1" step="0.05" value={benchmarkConfig.temperature} disabled={configLocked} onChange={(event) => updateBenchmarkConfig('temperature', Number(event.target.value))} style={{ padding: '9px 10px', borderRadius: '7px', border: '1px solid var(--border-color)', background: '#111827', color: 'var(--text-main)' }} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            Context window
            <input type="number" min="1024" step="1024" value={benchmarkConfig.contextWindow} disabled={configLocked} onChange={(event) => updateBenchmarkConfig('contextWindow', Number(event.target.value))} style={{ padding: '9px 10px', borderRadius: '7px', border: '1px solid var(--border-color)', background: '#111827', color: 'var(--text-main)' }} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            Maximum tool loops (0 = unlimited)
            <input type="number" min="0" max="50" value={benchmarkConfig.maxLoops} disabled={configLocked} onChange={(event) => updateBenchmarkConfig('maxLoops', Number(event.target.value))} style={{ padding: '9px 10px', borderRadius: '7px', border: '1px solid var(--border-color)', background: '#111827', color: 'var(--text-main)' }} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            Tool schema profile
            <select value={benchmarkConfig.complexityProfile} disabled={configLocked} onChange={(event) => updateBenchmarkConfig('complexityProfile', event.target.value as ToolComplexityProfile)} style={{ padding: '9px 10px', borderRadius: '7px', border: '1px solid var(--border-color)', background: '#111827', color: 'var(--text-main)' }}>
              <option value="simple">Simple</option>
              <option value="medium">Medium</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)', fontSize: '0.82rem', alignSelf: 'end', minHeight: '38px' }}>
            <input type="checkbox" checked={benchmarkConfig.enableThinking} disabled={configLocked} onChange={(event) => updateBenchmarkConfig('enableThinking', event.target.checked)} />
            Enable model thinking
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)', fontSize: '0.82rem', alignSelf: 'end', minHeight: '38px' }}>
            <input type="checkbox" checked={benchmarkConfig.showWorkingDirInfo} disabled={configLocked} onChange={(event) => updateBenchmarkConfig('showWorkingDirInfo', event.target.checked)} />
            Include project context
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-muted)', fontSize: '0.78rem', gridColumn: '1 / -1' }}>
            System prompt
            <textarea value={benchmarkConfig.systemPrompt} disabled={configLocked} rows={4} onChange={(event) => updateBenchmarkConfig('systemPrompt', event.target.value)} style={{ padding: '10px', borderRadius: '7px', border: '1px solid var(--border-color)', background: '#111827', color: 'var(--text-main)', resize: 'vertical', lineHeight: 1.45 }} />
          </label>

          <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
            <div style={{ color: 'var(--text-main)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '10px' }}>Context Pruning</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)', fontSize: '0.8rem' }}>
                <input type="checkbox" checked={benchmarkConfig.pruningConfig.enabled} disabled={configLocked} onChange={(event) => updatePruningConfig('enabled', event.target.checked)} />
                Enable context pruning
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)', fontSize: '0.8rem' }}>
                <input type="checkbox" checked={benchmarkConfig.pruningConfig.pruneSupersededReads} disabled={configLocked || !benchmarkConfig.pruningConfig.enabled} onChange={(event) => updatePruningConfig('pruneSupersededReads', event.target.checked)} />
                Prune superseded reads
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)', fontSize: '0.8rem' }}>
                <input type="checkbox" checked={benchmarkConfig.pruningConfig.invalidateOnMutation} disabled={configLocked || !benchmarkConfig.pruningConfig.enabled} onChange={(event) => updatePruningConfig('invalidateOnMutation', event.target.checked)} />
                Invalidate reads after mutation
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)', fontSize: '0.8rem' }}>
                <input type="checkbox" checked={benchmarkConfig.pruningConfig.enableToolTTL} disabled={configLocked || !benchmarkConfig.pruningConfig.enabled} onChange={(event) => updatePruningConfig('enableToolTTL', event.target.checked)} />
                Enable tool-output TTL
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                Terminal output TTL (turns)
                <input type="number" min="0" value={benchmarkConfig.pruningConfig.terminalOutputTTLTurns} disabled={configLocked || !benchmarkConfig.pruningConfig.enabled || !benchmarkConfig.pruningConfig.enableToolTTL} onChange={(event) => updatePruningConfig('terminalOutputTTLTurns', Number(event.target.value))} style={{ padding: '9px 10px', borderRadius: '7px', border: '1px solid var(--border-color)', background: '#111827', color: 'var(--text-main)' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                Web output TTL (turns)
                <input type="number" min="0" value={benchmarkConfig.pruningConfig.webOutputTTLTurns} disabled={configLocked || !benchmarkConfig.pruningConfig.enabled || !benchmarkConfig.pruningConfig.enableToolTTL} onChange={(event) => updatePruningConfig('webOutputTTLTurns', Number(event.target.value))} style={{ padding: '9px 10px', borderRadius: '7px', border: '1px solid var(--border-color)', background: '#111827', color: 'var(--text-main)' }} />
              </label>
            </div>
          </div>

          {/* ── Tool Access ── */}
          <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
            <div style={{ marginBottom: '10px' }}>
              <div style={{ color: 'var(--text-main)', fontSize: '0.85rem', fontWeight: 600 }}>Tool Access</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '2px' }}>Choose which tools the agent may call during this benchmark run. Disabling tools here does not affect the chat agent.</div>
            </div>
            <ToolTogglePanel
              enabledTools={benchmarkConfig.enabledTools}
              onChange={(updated) => { setConfigDirty(true); setBenchmarkConfig((prev) => ({ ...prev, enabledTools: updated })); }}
              variant="compact"
              disabled={configLocked}
            />
          </div>
        </div>
        </div>}
      </div>

      <div className="glass-panel benchmark-output-panel benchmark-collapsible-panel">
        <button className="benchmark-collapsible-toggle benchmark-collapsible-toggle-output" type="button" onClick={() => setShowOutputSettings((visible) => !visible)} aria-expanded={showOutputSettings}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
          <Save size={18} color="var(--accent-teal)" />
          <div><h3 style={{ margin: 0, fontSize: '0.95rem' }}>Portable result bundle</h3><span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Each suite run gets a unique folder containing report.json and a standalone index.html.</span></div>
          </div>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
            {saveResults ? 'Saving enabled' : 'Saving disabled'} · {showOutputSettings ? 'Hide' : 'Show'}
            <ChevronDown size={16} style={{ transform: showOutputSettings ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
          </span>
        </button>
        {showOutputSettings && <div style={{ padding: '16px 20px 20px', borderTop: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)', fontSize: '0.82rem', paddingBottom: '9px' }}>
            <input type="checkbox" checked={saveResults} disabled={configLocked} onChange={(event) => setSaveResults(event.target.checked)} /> Save completed suite runs
          </label>
          <label style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            Run label (optional)
            <input value={runName} maxLength={100} disabled={configLocked || !saveResults} onChange={(event) => setRunName(event.target.value)} placeholder="e.g. Context pruning experiment" style={{ padding: '9px 10px', borderRadius: '7px', border: '1px solid var(--border-color)', background: '#111827', color: 'var(--text-main)' }} />
          </label>
          <label style={{ flex: '0 1 210px', display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            Save location
            <select value={outputLocationMode} disabled={configLocked || !saveResults} onChange={(event) => setOutputLocationMode(event.target.value as 'project' | 'custom')} style={{ padding: '9px 10px', borderRadius: '7px', border: '1px solid var(--border-color)', background: '#111827', color: 'var(--text-main)' }}>
              <option value="project">Project default</option>
              <option value="custom">Custom directory</option>
            </select>
          </label>
          <label style={{ flex: '1 1 360px', display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            {outputLocationMode === 'project' ? 'Automatic project output directory' : 'Custom output directory'}
            <input value={outputLocationMode === 'project' ? defaultOutputDirectory : outputDirectory} readOnly={outputLocationMode === 'project'} disabled={configLocked || !saveResults} onChange={(event) => setOutputDirectory(event.target.value)} placeholder={outputLocationMode === 'project' ? 'Detecting project directory…' : '/path/to/benchmark_runs'} style={{ padding: '9px 10px', borderRadius: '7px', border: '1px solid var(--border-color)', background: outputLocationMode === 'project' ? 'rgba(17, 24, 39, 0.6)' : '#111827', color: 'var(--text-main)' }} />
            {outputLocationMode === 'project' && <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>Detected from this installation{projectRoot ? `: ${projectRoot}` : ''}</span>}
          </label>
        </div>
        </div>}
      </div>

      {savedRun && (
        <div className="glass-panel animate-fade-in benchmark-saved-notice">
          <CheckCircle2 size={18} color="#34d399" />
          <div><strong>Benchmark saved{savedRun.runName ? `: ${savedRun.runName}` : ''}</strong><span>{savedRun.directory}</span></div>
          <a href={`/api/benchmark/report?directory=${encodeURIComponent(savedRun.outputDirectory)}&runId=${encodeURIComponent(savedRun.runId)}`} target="_blank" rel="noreferrer">Open standalone report</a>
        </div>
      )}

      {wasStopped && !isRunning && (
        <div className="glass-panel animate-fade-in" style={{ padding: '12px 18px', borderRadius: '10px', border: '1px solid rgba(245, 158, 11, 0.35)', color: 'var(--accent-amber)', fontSize: '0.85rem' }}>
          Benchmark stopped. Completed results are preserved below.
        </div>
      )}

      {/* Live Stream / Single Test Active Run Status Card */}
      {(isRunning || runningSingleId !== null) && (
        <div
          className="glass-panel animate-fade-in"
          style={{
            padding: '20px 24px',
            borderRadius: '14px',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            background: 'rgba(245, 158, 11, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Loader2 size={22} className="spin" color="#f59e0b" />
              <div>
                <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  {runningSingleId ? '1-by-1 Single Test Execution Active' : `Benchmark Suite Run Active (${progress ? `${progress.current}/${progress.total}` : 'Initializing'})`}
                </h4>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Executing model tool calls, execution flow & system assertions in isolated Docker container
                </span>
              </div>
            </div>

            {/* Live Elapsed Timer Badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(15, 23, 42, 0.8)', padding: '6px 16px', borderRadius: '20px', border: '1px solid rgba(245, 158, 11, 0.35)' }}>
              <Clock size={15} color="#f59e0b" />
              <span style={{ fontFamily: 'var(--font-code)', fontSize: '0.9rem', fontWeight: 700, color: '#fbbf24' }}>
                {(elapsedMs / 1000).toFixed(1)}s elapsed
              </span>
            </div>
          </div>

          {/* Active Test Metadata & Prompt Preview */}
          {(() => {
            const currentTest = runningSingleId
              ? testCasesInfo.find((t) => t.id === runningSingleId)
              : testCasesInfo.find((t) => t.name === progress?.testName);

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', background: 'rgba(15, 23, 42, 0.65)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <div>
                    <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>Active Test</span>
                    <strong style={{ fontSize: '0.875rem', color: 'var(--text-main)', display: 'block', marginTop: '2px' }}>{currentTest?.name || progress?.testName || runningSingleId || 'Running...'}</strong>
                  </div>

                  <div>
                    <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>Target Model</span>
                    <strong style={{ fontSize: '0.875rem', color: 'var(--accent-teal)', display: 'block', marginTop: '2px' }}>{benchmarkConfig.model}</strong>
                  </div>

                  <div>
                    <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>Category</span>
                    <strong style={{ fontSize: '0.875rem', color: 'var(--accent-primary)', display: 'block', marginTop: '2px' }}>{currentTest?.category || 'General'}</strong>
                  </div>

                  <div>
                    <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>Environment</span>
                    <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>Docker Sandbox Container</span>
                  </div>
                </div>

                {currentTest?.prompt && (
                  <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)', fontSize: '0.78rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Active Prompt: </span>
                    <span style={{ color: '#fcd34d', fontFamily: 'var(--font-code)' }}>"{currentTest.prompt}"</span>
                  </div>
                )}

                {/* Live Real-time Activity Badges */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {liveActiveTool && (
                    <span style={{ background: 'rgba(99, 102, 241, 0.2)', border: '1px solid rgba(99, 102, 241, 0.5)', color: '#a5b4fc', padding: '4px 10px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Loader2 size={13} className="spin" /> Executing Tool: <code>{liveActiveTool}</code>
                    </span>
                  )}
                  {liveMetrics && (
                    <span style={{ background: 'rgba(20, 184, 166, 0.15)', border: '1px solid rgba(20, 184, 166, 0.35)', color: '#5eead4', padding: '4px 10px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600 }}>
                      ⚡ {liveMetrics.tokensPerSec ? `${liveMetrics.tokensPerSec} tok/s` : 'Processing'} · {liveMetrics.promptTokens ?? 0} prompt tokens · {liveMetrics.generatedTokens ?? 0} generated tokens
                    </span>
                  )}
                  {benchmarkConfig.enableThinking !== false && (
                    <span style={{ background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.35)', color: '#c084fc', padding: '4px 10px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600 }}>
                      🧠 Thinking Mode Enabled
                    </span>
                  )}
                </div>

                {/* Live Model Thinking Box (if streaming thinking chunks) */}
                {liveThinkingText && (
                  <div style={{ background: 'rgba(168, 85, 247, 0.08)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(168, 85, 247, 0.25)', fontSize: '0.78rem' }}>
                    <span style={{ color: '#c084fc', fontWeight: 700, display: 'block', marginBottom: '4px' }}>🧠 Live Model Reasoning Stream:</span>
                    <span style={{ color: '#e9d5ff', fontFamily: 'var(--font-code)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{liveThinkingText}...</span>
                  </div>
                )}

                {/* Live Model Response Content Box (if streaming content chunks) */}
                {liveStreamingText && (
                  <div style={{ background: 'rgba(56, 189, 248, 0.08)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.25)', fontSize: '0.78rem' }}>
                    <span style={{ color: '#38bdf8', fontWeight: 700, display: 'block', marginBottom: '4px' }}>💬 Live Response Generation Stream:</span>
                    <span style={{ color: '#bae6fd', fontFamily: 'var(--font-code)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{liveStreamingText}...</span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Live Real-Time Execution Console */}
          <div style={{ background: '#090d16', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(56, 189, 248, 0.25)', fontFamily: 'var(--font-code)', fontSize: '0.78rem', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#38bdf8', fontSize: '0.72rem', fontWeight: 700, borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '6px', textTransform: 'uppercase' }}>
              <span>Live Execution Log Feed</span>
              <span>{liveSteps.length} steps recorded</span>
            </div>
            {liveSteps.length === 0 ? (
              <div style={{ color: 'var(--text-dim)', fontStyle: 'italic', padding: '6px 0' }}>Initializing Docker container & agent loop...</div>
            ) : (
              <>
                {liveSteps.map((step, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', lineHeight: 1.4 }}>
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem', flexShrink: 0 }}>
                      {new Date(step.timestamp).toLocaleTimeString()}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ color: step.type === 'complete' ? '#34d399' : step.type === 'llm_start' ? '#fbbf24' : step.type.startsWith('tool') ? '#a7f3d0' : '#e2e8f0' }}>
                        {step.text}
                      </span>
                      {step.detail && (
                        <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {step.detail}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {!liveStreamingText && !liveThinkingText && liveSteps.some((s) => s.type === 'llm_start' || s.type === 'start') && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fbbf24', fontSize: '0.74rem', padding: '4px 0', borderTop: '1px dashed rgba(255, 255, 255, 0.1)', marginTop: '4px' }}>
                    <Loader2 size={12} className="spin" />
                    <span>Ollama is evaluating prompt tokens & loading model weights for <code>{benchmarkConfig.model}</code>. Streamed tokens and tool calls will appear here live...</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Progress bar for suite runs */}
          {isRunning && progress && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                <span>Suite Progress ({progress.completed} of {progress.total} finished)</span>
                <span>{Math.round((progress.completed / progress.total) * 100)}%</span>
              </div>
              <div style={{ height: '8px', width: '100%', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${(progress.completed / progress.total) * 100}%`,
                    background: 'var(--accent-gradient)',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Live Scorecards */}
      {liveResults.length > 0 && (
        <div className="animate-fade-in benchmark-scorecards" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          <div className="glass-panel" style={{ padding: '20px', borderRadius: '14px', borderLeft: `4px solid ${accuracyPercentage === 100 ? '#10b981' : accuracyPercentage >= 75 ? '#f59e0b' : '#ef4444'}` }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Success Rate</span>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: accuracyPercentage === 100 ? '#10b981' : accuracyPercentage >= 75 ? '#f59e0b' : '#ef4444', marginTop: '4px' }}>
              {accuracyPercentage}%
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              {passCount} of {completedAttempts} attempts passed
            </span>
          </div>

          <div className="glass-panel" style={{ padding: '20px', borderRadius: '14px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Successful Attempts</span>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
              {passCount}
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Required outcomes verified</span>
          </div>

          <div className="glass-panel" style={{ padding: '20px', borderRadius: '14px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Failed Attempts</span>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: failCount > 0 ? '#ef4444' : 'var(--text-dim)', marginTop: '4px' }}>
              {failCount}
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Outcome verification failures</span>
          </div>

          <div className="glass-panel" style={{ padding: '20px', borderRadius: '14px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Avg Comparison Time</span>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#38bdf8', marginTop: '4px' }}>
              {(totalDurationMs / 1000).toFixed(2)}s
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              Prompt evaluation + generation + tools
            </span>
          </div>
        </div>
      )}

      {liveResults.length > 0 && (
        <div className="glass-panel animate-fade-in" style={{ padding: '18px 20px', borderRadius: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <strong>Detailed duration totals</strong>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Ranking uses only prompt evaluation + generation + tool execution.</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
            {[
              ['Image/setup', liveTiming.imageSetupMs],
              ['Container startup', liveTiming.containerStartupMs],
              ['Model load', liveTiming.modelLoadMs],
              ['Prompt evaluation', liveTiming.promptEvaluationMs],
              ['Generation', liveTiming.generationMs],
              ['Tool execution', liveTiming.toolExecutionMs],
              ['Verification', liveTiming.verificationMs],
              ['End-to-end wall', liveTiming.endToEndWallMs],
              ['Comparison', liveTiming.comparisonMs],
            ].map(([label, value]) => (
              <div key={String(label)} style={{ padding: '10px 12px', borderRadius: '8px', background: 'rgba(15,23,42,.7)' }}>
                <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem' }}>{label}</span>
                <strong style={{ color: label === 'Comparison' ? '#38bdf8' : 'var(--text-main)' }}>{formatMs(Number(value))}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Task List (With 1-by-1 Run / Rerun Buttons & Category Filters) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div className="benchmark-list-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)' }}>
            Benchmark Tasks ({testCasesInfo.length}) - Run Individual Tests 1-by-1 or Rerun
          </h3>

          {/* Category Filter Pills */}
          <div className="benchmark-filters" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: `All (${testCasesInfo.length})` },
              { id: 'directory_reading', label: 'Directory' },
              { id: 'file_reading', label: 'File Read' },
              { id: 'file_creation', label: 'Create File' },
              { id: 'file_editing', label: 'Edit Text' },
              { id: 'code_editing', label: 'Code Refactor' },
              { id: 'code_search', label: 'Code Search' },
              { id: 'discrimination', label: 'Discrimination' },
              { id: 'multi_step_workflow', label: '⚡ Multi-Step Workflow' },
              { id: 'terminal_execution', label: '🐚 Terminal (Docker Sandbox)' },
              { id: 'information_retrieval', label: '🔎 Information Retrieval' },
              { id: 'project_context', label: '🧭 Project Context' },
              { id: 'web_search', label: '🌐 Web Search' },
              { id: 'real_web_search', label: '🔍 Real Web Search' },
              { id: 'ast_lsp_navigation', label: '🌳 AST/LSP' },
            ].map((cat) => {
              const catTotal = cat.id === 'all' ? testCasesInfo.length : testCasesInfo.filter((t) => t.category === cat.id).length;
              const categoryResults = cat.id === 'all' ? liveResults : liveResults.filter((r) => r.category === cat.id);
              const catPassed = categoryResults.reduce((sum, result) => sum + result.successfulAttempts, 0);
              const catRan = categoryResults.reduce((sum, result) => sum + result.attemptCount, 0);
              const showScore = catRan > 0;
              return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                style={{
                  background: selectedCategory === cat.id ? 'var(--accent-primary)' : 'rgba(30, 41, 59, 0.6)',
                  color: selectedCategory === cat.id ? '#fff' : 'var(--text-muted)',
                  border: `1px solid ${selectedCategory === cat.id ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                  padding: '4px 10px',
                  borderRadius: '16px',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <span>{cat.label}</span>
                {showScore && (
                  <span style={{
                    background: catPassed === catRan ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)',
                    color: catPassed === catRan ? '#34d399' : '#f87171',
                    borderRadius: '8px',
                    padding: '1px 5px',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                  }}>
                    {catPassed}/{catRan}
                  </span>
                )}
              </button>
            );
            })}
          </div>
        </div>

        {testCasesInfo
          .filter((tc) => selectedCategory === 'all' || tc.category === selectedCategory)
          .map((tc) => {
          const resultTrace = liveResults.find((r) => r.testId === tc.id);
          const isSingleRunning = runningSingleId === tc.id;
          const isExpanded = expandedTestId === tc.id;

          return (
            <div
              key={tc.id}
              className="glass-panel animate-fade-in benchmark-test-card"
              style={{
                borderRadius: '12px',
                overflow: 'hidden',
                borderLeft: `4px solid ${resultTrace ? (resultTrace.passed ? '#10b981' : '#ef4444') : 'var(--border-color)'}`,
              }}
            >
              {/* Card Header */}
              <div
                className="benchmark-test-header"
                style={{
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(30, 41, 59, 0.4)',
                }}
              >
                <div className="benchmark-test-summary" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  {resultTrace ? (
                    resultTrace.passed ? <CheckCircle2 size={22} color="#10b981" /> : <XCircle size={22} color="#ef4444" />
                  ) : (
                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', border: '2px solid var(--text-dim)' }} />
                  )}
                  <div>
                    <div className="benchmark-test-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>{tc.name}</span>
                      <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.08)', color: 'var(--text-muted)' }}>
                        {tc.category}
                      </span>
                      {/* Info Button */}
                      <button
                        onClick={() => setSelectedInfoTest(tc)}
                        title="View Test Specification & Required Output"
                        style={{
                          background: 'rgba(99, 102, 241, 0.15)',
                          border: '1px solid rgba(99, 102, 241, 0.3)',
                          color: 'var(--accent-primary)',
                          padding: '2px 6px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        <Info size={14} />
                        <span>Info</span>
                      </button>
                    </div>
                    <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)', display: 'block', marginTop: '2px', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                      Prompt: "{tc.prompt}"
                    </span>
                  </div>
                </div>

                <div className="benchmark-test-actions" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {resultTrace && (
                    <div style={{ textAlign: 'right', fontSize: '0.8rem' }}>
                      <div style={{ color: 'var(--text-muted)' }}>
                        Success: <strong style={{ color: '#fff' }}>{resultTrace.successfulAttempts}/{resultTrace.attemptCount} ({resultTrace.successRatePercentage}%)</strong>
                      </div>
                      <div style={{ color: resultTrace.passed ? '#10b981' : '#ef4444' }}>
                        Called: <strong>{resultTrace.actualToolsCalled.map((t) => t.name).join(' -> ') || 'None'}</strong>
                      </div>
                    </div>
                  )}

                  {resultTrace && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                      <Clock size={14} />
                      <span>{formatMs(resultTrace.durationMs)} avg compare</span>
                    </div>
                  )}

                  {/* 1-by-1 Run / Stop Button */}
                  {isSingleRunning ? (
                    <button
                      onClick={handleStopSingleTest}
                      title="Stop running test"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'rgba(239, 68, 68, 0.16)',
                        border: '1px solid rgba(239, 68, 68, 0.55)',
                        color: '#ef4444',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      <Square size={14} fill="#ef4444" />
                      <span>Stop</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleRunSingleTest(tc.id)}
                      disabled={isRunning || runningSingleId !== null}
                      title={resultTrace ? 'Rerun this single test' : 'Run this single test'}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: resultTrace ? 'rgba(255, 255, 255, 0.08)' : 'var(--accent-gradient)',
                        border: '1px solid var(--border-color)',
                        color: '#fff',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: isRunning || runningSingleId !== null ? 'not-allowed' : 'pointer',
                        opacity: isRunning || runningSingleId !== null ? 0.6 : 1,
                        transition: 'all 0.2s',
                      }}
                    >
                      {resultTrace ? (
                        <RotateCw size={14} color="var(--accent-teal)" />
                      ) : (
                        <Play size={14} />
                      )}
                      <span>{resultTrace ? 'Rerun' : 'Run Test'}</span>
                    </button>
                  )}

                  {resultTrace && (
                    <button
                      onClick={() => toggleExpand(tc.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                    >
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  )}
                </div>
              </div>

              {/* Expandable Trace Drawer */}
              {resultTrace && isExpanded && (
                <div className="benchmark-trace" style={{ padding: '16px 20px', borderTop: '1px solid var(--border-color)', background: 'rgba(15, 23, 42, 0.8)', fontSize: '0.85rem' }}>
                  {(() => {
                    const attemptsList = resultTrace.attempts && resultTrace.attempts.length > 0 ? resultTrace.attempts : [resultTrace];
                    const selectedIdx = activeAttemptIndices[tc.id] ?? 0;
                    const activeAttempt = attemptsList[selectedIdx] || resultTrace;

                    return (
                      <>
                        {/* Attempt selector tabs if multiple attempts */}
                        {attemptsList.length > 1 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Select Attempt ({attemptsList.length} total):</span>
                            {attemptsList.map((att, idx) => {
                              const isSelected = selectedIdx === idx;
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => setActiveAttemptIndices((prev) => ({ ...prev, [tc.id]: idx }))}
                                  style={{
                                    padding: '5px 12px',
                                    borderRadius: '6px',
                                    background: isSelected
                                      ? (att.passed ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)')
                                      : 'rgba(30, 41, 59, 0.5)',
                                    border: `1px solid ${isSelected ? (att.passed ? '#10b981' : '#ef4444') : 'var(--border-color)'}`,
                                    color: isSelected ? '#fff' : (att.passed ? '#34d399' : '#f87171'),
                                    fontSize: '0.78rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                  }}
                                >
                                  {att.passed ? <CheckCircle2 size={13} color="#10b981" /> : <XCircle size={13} color="#ef4444" />}
                                  <span>Attempt #{att.attemptNumber || idx + 1}</span>
                                  <span style={{ opacity: 0.8, fontSize: '0.72rem' }}>({formatMs(att.durationMs)})</span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        <div style={{ marginBottom: '12px', padding: '8px 12px', borderRadius: '6px', background: activeAttempt.passed ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: activeAttempt.passed ? '#34d399' : '#f87171' }}>
                          <strong>Verdict Reason ({attemptsList.length > 1 ? `Attempt #${activeAttempt.attemptNumber || selectedIdx + 1}` : 'Overall'}):</strong> {activeAttempt.reason}
                          <div style={{ marginTop: '4px', color: 'var(--text-muted)' }}>
                            Container: {activeAttempt.container.image} · workspace {activeAttempt.container.workspace} · isolated: {String(activeAttempt.container.isolated)}
                          </div>
                        </div>

                        <div className="benchmark-trace-grid" style={{ display: 'grid', gap: '16px' }}>
                          <div>
                            <strong style={{ color: '#38bdf8', display: 'block', marginBottom: '4px' }}>
                              Timing Breakdown {attemptsList.length > 1 ? `(Attempt #${activeAttempt.attemptNumber || selectedIdx + 1})` : `(${resultTrace.attemptCount} attempts total)`}:
                            </strong>
                            <HighlightedJson value={{
                              imageSetup: formatMs(activeAttempt.timing.imageSetupMs),
                              containerStartup: formatMs(activeAttempt.timing.containerStartupMs),
                              modelLoad: formatMs(activeAttempt.timing.modelLoadMs),
                              promptEvaluation: formatMs(activeAttempt.timing.promptEvaluationMs),
                              generation: formatMs(activeAttempt.timing.generationMs),
                              toolExecution: formatMs(activeAttempt.timing.toolExecutionMs),
                              verification: formatMs(activeAttempt.timing.verificationMs),
                              endToEndWall: formatMs(activeAttempt.timing.endToEndWallMs),
                              comparison: formatMs(activeAttempt.timing.comparisonMs),
                              promptTokens: activeAttempt.timing.promptTokens,
                              generatedTokens: activeAttempt.timing.generatedTokens,
                            }} />
                          </div>
                          <div>
                            <strong style={{ color: 'var(--accent-primary)', display: 'block', marginBottom: '4px' }}>Tools Invoked ({activeAttempt.actualToolsCalled.length}):</strong>
                            <HighlightedJson
                              value={activeAttempt.actualToolsCalled.length > 0 ? activeAttempt.actualToolsCalled : undefined}
                              emptyText="No tools invoked."
                            />
                          </div>

                          <div>
                            <strong style={{ color: 'var(--accent-teal)', display: 'block', marginBottom: '4px' }}>Model Response Content:</strong>
                            <pre style={{ fontSize: '0.775rem', whiteSpace: 'pre-wrap' }}>
                              {activeAttempt.responseContent || '(Empty response)'}
                            </pre>
                          </div>
                        </div>

                        <div style={{ marginTop: '16px' }}>
                          <strong style={{ color: 'var(--accent-amber)', display: 'block', marginBottom: '4px' }}>Outcome Verification:</strong>
                          <HighlightedJson value={activeAttempt.verificationDetails} emptyText="No verification details." style={{ whiteSpace: 'pre-wrap' }} />
                        </div>

                        <div style={{ marginTop: '16px' }}>
                          <strong style={{ color: 'var(--accent-primary)', display: 'block', marginBottom: '4px' }}>Effective Agent Configuration:</strong>
                          <HighlightedJson value={activeAttempt.agentConfig} style={{ whiteSpace: 'pre-wrap' }} />
                        </div>

                        <div style={{ marginTop: '16px' }}>
                          <strong style={{ color: '#c084fc', display: 'block', marginBottom: '4px' }}>Complete Execution Trace:</strong>
                          <HighlightedJson value={activeAttempt.executionTrace ?? resultTrace.attempts ?? [resultTrace]} style={{ whiteSpace: 'pre-wrap', maxHeight: '420px', overflow: 'auto' }} />
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Test Case Specification Modal */}
      {selectedInfoTest && (
        <div className="benchmark-spec-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="glass-panel animate-fade-in benchmark-spec-modal" style={{ width: '100%', maxWidth: '640px', borderRadius: '16px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Modal Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Info size={18} color="var(--accent-primary)" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  Test Specification: {'testName' in selectedInfoTest ? selectedInfoTest.testName : selectedInfoTest.name}
                </h3>
              </div>
              <button onClick={() => setSelectedInfoTest(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}>
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="benchmark-spec-content" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.875rem', lineHeight: 1.6 }}>
              {/* Objective */}
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-primary)', fontWeight: 600, marginBottom: '4px' }}>
                  <Target size={16} />
                  <span>What is this test case testing? (Objective)</span>
                </div>
                <p style={{ color: 'var(--text-main)', margin: 0 }}>{selectedInfoTest.objective}</p>
              </div>

              {/* Prompt */}
              <div>
                <strong style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Prompt Sent to Agent:</strong>
                <pre style={{ margin: 0, fontSize: '0.85rem', color: '#fcd34d', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>"{selectedInfoTest.prompt}"</pre>
              </div>

              {/* Required Output */}
              <div style={{ background: 'rgba(20, 184, 166, 0.08)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(20, 184, 166, 0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-teal)', fontWeight: 600, marginBottom: '4px' }}>
                  <FileCode2 size={16} />
                  <span>Requested User Outcome:</span>
                </div>
                <p style={{ color: '#e2e8f0', margin: 0 }}>{selectedInfoTest.requiredOutput}</p>
              </div>

              {/* Evaluation & Pass/Fail Criteria */}
              <div style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-amber)', fontWeight: 600, marginBottom: '4px' }}>
                  <CheckCheck size={16} />
                  <span>Evaluation & Pass/Fail Criteria:</span>
                </div>
                <p style={{ color: '#fef3c7', margin: 0 }}>{selectedInfoTest.evaluationCriteria}</p>
              </div>
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', background: 'rgba(15, 23, 42, 0.8)' }}>
              <button
                onClick={() => setSelectedInfoTest(null)}
                style={{ background: 'var(--accent-gradient)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
              >
                Close Specification
              </button>
            </div>
          </div>
        </div>
      )}
      </>}
    </div>
  );
};
