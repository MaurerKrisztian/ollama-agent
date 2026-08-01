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

export interface BenchmarkReport {
  timestamp: number;
  runDate: string;
  model: string;
  mockWorkingDir: string;
  totalTests: number;
  passCount: number;
  failCount: number;
  accuracyPercentage: number;
  totalDurationMs: number;
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
  totalTests: number;
  passCount: number;
  failCount: number;
  accuracyPercentage: number;
  totalDurationMs: number;
  results: Array<Pick<TestResultTrace, 'testId' | 'testName' | 'category' | 'passed' | 'reason' | 'durationMs'>>;
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
}

const getBenchmarkDefaults = (config: AgentConfig, toolSettings: ToolSettings): BenchmarkFormConfig => ({
  model: config.model,
  ollamaHost: config.ollamaHost,
  temperature: config.temperature,
  contextWindow: config.contextWindow ?? 16384,
  maxLoops: toolSettings.maxLoops ?? config.maxLoops ?? 10,
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
});

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
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [liveResults, setLiveResults] = useState<TestResultTrace[]>([]);
  const [testCasesInfo, setTestCasesInfo] = useState<BenchmarkTestCaseInfo[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [wasStopped, setWasStopped] = useState(false);
  const benchmarkAbortController = useRef<AbortController | null>(null);
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
  const [outputDirectory, setOutputDirectory] = useState('');
  const [defaultOutputDirectory, setDefaultOutputDirectory] = useState('');
  const [projectRoot, setProjectRoot] = useState('');
  const [outputLocationMode, setOutputLocationMode] = useState<'project' | 'custom'>('project');
  const [savedRuns, setSavedRuns] = useState<SavedBenchmarkRun[]>([]);
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [savedRun, setSavedRun] = useState<SavedBenchmarkRun | null>(null);
  const [showMatchingConfigs, setShowMatchingConfigs] = useState(false);
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);
  const [runSort, setRunSort] = useState<{ key: 'rank' | 'model' | 'duration'; direction: 'asc' | 'desc' }>({ key: 'rank', direction: 'asc' });

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
        return retained.length ? retained : (data.runs || []).slice(0, 2).map((run: SavedBenchmarkRun) => run.runId);
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
    agentConfig: {
      temperature: benchmarkConfig.temperature,
      contextWindow: benchmarkConfig.contextWindow,
      maxLoops: benchmarkConfig.maxLoops,
      enableThinking: benchmarkConfig.enableThinking,
      showWorkingDirInfo: benchmarkConfig.showWorkingDirInfo,
      complexityProfile: benchmarkConfig.complexityProfile,
      systemPrompt: benchmarkConfig.systemPrompt,
      pruningConfig: benchmarkConfig.pruningConfig,
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
    const controller = new AbortController();
    benchmarkAbortController.current = controller;
    setIsRunning(true);
    setIsStopping(false);
    setWasStopped(false);
    setReport(null);
    setLiveResults([]);
    const filteredCount = selectedCategory === 'all'
      ? testCasesInfo.length
      : testCasesInfo.filter((t) => t.category === selectedCategory).length;
    setProgress({ current: 0, completed: 0, total: filteredCount || 1 });

    try {
      const response = await fetch('/api/benchmark/run-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...benchmarkRequestConfig(),
          saveResults,
          runName,
          ...(outputLocationMode === 'custom' && outputDirectory.trim() ? { outputDirectory: outputDirectory.trim() } : {}),
          ...(selectedCategory !== 'all' ? { category: selectedCategory } : {}),
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
            } else if (eventType === 'test_complete') {
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
    setRunningSingleId(testId);
    try {
      const res = await fetch('/api/benchmark/run-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testId, ...benchmarkRequestConfig() }),
      });
      const data = await res.json();
      if (data.success && data.trace) {
        setLiveResults((prev) => {
          const filtered = prev.filter((r) => r.testId !== testId);
          return [...filtered, data.trace];
        });
      } else {
        alert(`Test execution failed: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error running single test: ${err.message}`);
    } finally {
      setRunningSingleId(null);
    }
  };

  const toggleExpand = (testId: string) => {
    setExpandedTestId((prev) => (prev === testId ? null : testId));
  };

  const passCount = liveResults.filter((r) => r.passed).length;
  const failCount = liveResults.filter((r) => !r.passed).length;
  const accuracyPercentage = liveResults.length > 0 ? Math.round((passCount / liveResults.length) * 100) : 0;
  const totalDurationMs = liveResults.reduce((sum, r) => sum + r.durationMs, 0);
  const configLocked = isRunning || runningSingleId !== null;
  const performanceRankById = new Map([...savedRuns]
    .sort((a, b) => b.accuracyPercentage - a.accuracyPercentage || a.totalDurationMs - b.totalDurationMs || b.runDate.localeCompare(a.runDate))
    .map((run, index) => [run.runId, index + 1]));
  const rankedRuns = [...savedRuns].sort((a, b) => {
    if (runSort.key === 'model') {
      const comparison = a.model.localeCompare(b.model, undefined, { numeric: true, sensitivity: 'base' });
      return runSort.direction === 'asc' ? comparison : -comparison;
    }
    if (runSort.key === 'duration') {
      const comparison = a.totalDurationMs - b.totalDurationMs;
      return runSort.direction === 'asc' ? comparison : -comparison;
    }
    return b.accuracyPercentage - a.accuracyPercentage || a.totalDurationMs - b.totalDurationMs || b.runDate.localeCompare(a.runDate);
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
    setSelectedRunIds((previous) => previous.includes(runId)
      ? previous.filter((id) => id !== runId)
      : [...previous, runId]);
  };

  const toggleRunSort = (key: 'model' | 'duration') => {
    setRunSort((previous) => previous.key === key
      ? { key, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'asc' });
  };

  const sortIndicator = (key: 'model' | 'duration') =>
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
                <div className="benchmark-ranking-header"><Trophy size={19} color="var(--accent-amber)" /><h3>Leaderboard</h3><span>{runSort.key === 'rank' ? 'Accuracy first, then fastest duration' : `Sorted by ${runSort.key} (${runSort.direction === 'asc' ? 'ascending' : 'descending'})`}</span></div>
                <div className="benchmark-table-scroll"><table><thead><tr><th>Compare</th><th>Rank</th><th>Name</th><th><button className={runSort.key === 'model' ? 'benchmark-sort-active' : ''} onClick={() => toggleRunSort('model')}>Model <span>{sortIndicator('model')}</span></button></th><th>Run date</th><th>Score</th><th>Passed</th><th><button className={runSort.key === 'duration' ? 'benchmark-sort-active' : ''} onClick={() => toggleRunSort('duration')}>Duration <span>{sortIndicator('duration')}</span></button></th><th>Actions</th></tr></thead>
                  <tbody>{rankedRuns.map((run) => <tr key={run.runId}>
                    <td><input type="checkbox" checked={selectedRunIds.includes(run.runId)} onChange={() => toggleComparedRun(run.runId)} /></td>
                    <td className="benchmark-rank">#{performanceRankById.get(run.runId)}</td><td><strong>{run.runName || 'Unnamed'}</strong></td><td><strong>{run.model}</strong><small>{run.runId}</small></td>
                    <td>{new Date(run.runDate).toLocaleString()}</td><td><strong className={run.accuracyPercentage === 100 ? 'benchmark-pass' : ''}>{run.accuracyPercentage}%</strong></td>
                    <td>{run.passCount}/{run.totalTests}</td><td>{(run.totalDurationMs / 1000).toFixed(2)}s</td>
                    <td><div className="benchmark-run-actions"><a href={`/api/benchmark/report?directory=${encodeURIComponent(run.outputDirectory)}&runId=${encodeURIComponent(run.runId)}`} target="_blank" rel="noreferrer">Open HTML</a><button onClick={() => void handleDeleteRun(run)} disabled={deletingRunId === run.runId} title="Delete this saved benchmark">{deletingRunId === run.runId ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />} Delete</button></div></td>
                  </tr>)}</tbody></table></div>
              </div>

              {comparedRuns.length > 0 && <div className="glass-panel benchmark-matrix">
                <div className="benchmark-ranking-header"><BarChart3 size={19} color="var(--accent-primary)" /><h3>Per-test comparison</h3><span>{comparedRuns.length} selected run{comparedRuns.length === 1 ? '' : 's'}</span></div>
                <div className="benchmark-table-scroll"><table><thead><tr><th>Test</th>{comparedRuns.map((run) => <th key={run.runId}>{run.runName || run.model}<small>{run.runName ? run.model : 'Unnamed run'}</small><small>{run.accuracyPercentage}% passed · {(run.totalDurationMs / 1000).toFixed(2)}s total</small><small>{new Date(run.runDate).toLocaleDateString()}</small></th>)}</tr></thead>
                  <tbody>{comparedTestIds.map((testId) => {
                    const label = comparedRuns.flatMap((run) => run.results).find((result) => result.testId === testId)?.testName || testId;
                    return <tr key={testId}><td><strong>{label}</strong><small>{testId}</small></td>{comparedRuns.map((run) => {
                      const result = run.results.find((item) => item.testId === testId);
                      return <td key={run.runId}>{result ? <><span className={result.passed ? 'benchmark-pass' : 'benchmark-fail'}>{result.passed ? 'PASS' : 'FAIL'}</span><small>{result.durationMs}ms</small></> : <span className="muted">—</span>}</td>;
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
                <div className="benchmark-table-scroll"><table className="benchmark-config-table"><thead><tr><th>Setting</th>{comparedRuns.map((run) => <th key={run.runId}>{run.runName || run.model}<small>{run.runName ? run.model : 'Unnamed run'} · {new Date(run.runDate).toLocaleDateString()}</small></th>)}</tr></thead>
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
            Run each task in a fresh container, score the observable outcome, and inspect the complete model and tool trace.
          </p>
        </div>

        {/* Model Picker & Trigger Button */}
        <div className="benchmark-actions" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div className="benchmark-model-picker" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(15, 23, 42, 0.8)', padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <Cpu size={16} color="var(--accent-primary)" />
            <select
              value={benchmarkConfig.model}
              onChange={(e) => updateBenchmarkConfig('model', e.target.value)}
              disabled={configLocked}
              style={{
                background: 'transparent',
                color: 'var(--text-main)',
                border: 'none',
                fontSize: '0.9rem',
                fontWeight: 500,
                outline: 'none',
                cursor: configLocked ? 'not-allowed' : 'pointer',
              }}
            >
              {models.map((m) => (
                <option key={m.name} value={m.name} style={{ background: '#1e293b' }}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={isRunning ? handleStopBenchmarks : handleRunAllBenchmarks}
            disabled={isStopping || (!isRunning && runningSingleId !== null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: isRunning ? 'rgba(239, 68, 68, 0.16)' : 'var(--accent-gradient)',
              border: isRunning ? '1px solid rgba(239, 68, 68, 0.55)' : 'none',
              color: '#fff',
              padding: '10px 20px',
              borderRadius: '8px',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: isStopping || (!isRunning && runningSingleId !== null) ? 'not-allowed' : 'pointer',
              boxShadow: isRunning ? '0 4px 14px rgba(239, 68, 68, 0.2)' : '0 4px 14px rgba(99, 102, 241, 0.35)',
              transition: 'all 0.2s',
            }}
          >
            {isStopping ? <Loader2 size={18} className="spin" /> : isRunning ? <Square size={17} /> : <Play size={18} />}
            <span>
              {isRunning
                ? isStopping
                  ? 'Stopping…'
                  : `Stop Benchmark (${progress ? `${progress.current}/${progress.total}` : ''})`
                : selectedCategory === 'all'
                  ? `Run All Benchmarks (${testCasesInfo.length})`
                  : `Run Category (${testCasesInfo.filter((t) => t.category === selectedCategory).length})`}
            </span>
          </button>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '20px', borderRadius: '14px', border: '1px solid rgba(99, 102, 241, 0.28)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1rem' }}>Benchmark Agent Configuration</h3>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              Initialized from the current agent. Changes here apply only to benchmark runs.
            </p>
          </div>
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
            Model
            <select value={benchmarkConfig.model} disabled={configLocked} onChange={(event) => updateBenchmarkConfig('model', event.target.value)} style={{ padding: '9px 10px', borderRadius: '7px', border: '1px solid var(--border-color)', background: '#111827', color: 'var(--text-main)' }}>
              {models.map((model) => <option key={model.name} value={model.name}>{model.name}</option>)}
            </select>
          </label>

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
        </div>
      </div>

      <div className="glass-panel benchmark-output-panel" style={{ padding: '18px 20px', borderRadius: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '12px' }}>
          <Save size={18} color="var(--accent-teal)" />
          <div><h3 style={{ margin: 0, fontSize: '0.95rem' }}>Portable result bundle</h3><span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Each suite run gets a unique folder containing report.json and a standalone index.html.</span></div>
        </div>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)', fontSize: '0.82rem', paddingBottom: '9px' }}>
            <input type="checkbox" checked={saveResults} disabled={configLocked} onChange={(event) => setSaveResults(event.target.checked)} /> Save completed suite runs
          </label>
          <label style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            Benchmark name (optional)
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

      {/* Live Stream Progress Bar */}
      {isRunning && progress && (
        <div className="glass-panel animate-fade-in" style={{ padding: '16px 20px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div className="benchmark-progress-labels" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <span style={{ fontWeight: 600, color: 'var(--accent-amber)' }}>
              ⚡ Running {progress.current} of {progress.total}
              {progress.testName ? `: ${progress.testName}` : '...'}
            </span>
            <span>{Math.round((progress.completed / progress.total) * 100)}% Complete</span>
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

      {/* Live Scorecards */}
      {liveResults.length > 0 && (
        <div className="animate-fade-in benchmark-scorecards" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          <div className="glass-panel" style={{ padding: '20px', borderRadius: '14px', borderLeft: `4px solid ${accuracyPercentage === 100 ? '#10b981' : accuracyPercentage >= 75 ? '#f59e0b' : '#ef4444'}` }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Accuracy Score</span>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: accuracyPercentage === 100 ? '#10b981' : accuracyPercentage >= 75 ? '#f59e0b' : '#ef4444', marginTop: '4px' }}>
              {accuracyPercentage}%
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              {passCount} of {liveResults.length} tasks passed
            </span>
          </div>

          <div className="glass-panel" style={{ padding: '20px', borderRadius: '14px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Passed Tests</span>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
              {passCount}
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Required outcomes verified</span>
          </div>

          <div className="glass-panel" style={{ padding: '20px', borderRadius: '14px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Failed Tests</span>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: failCount > 0 ? '#ef4444' : 'var(--text-dim)', marginTop: '4px' }}>
              {failCount}
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Outcome verification failures</span>
          </div>

          <div className="glass-panel" style={{ padding: '20px', borderRadius: '14px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Duration</span>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#38bdf8', marginTop: '4px' }}>
              {(totalDurationMs / 1000).toFixed(2)}s
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              Avg ~{Math.round(totalDurationMs / liveResults.length)}ms / task
            </span>
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
            ].map((cat) => {
              const catTotal = cat.id === 'all' ? testCasesInfo.length : testCasesInfo.filter((t) => t.category === cat.id).length;
              const catPassed = cat.id === 'all'
                ? liveResults.filter((r) => r.passed).length
                : liveResults.filter((r) => r.category === cat.id && r.passed).length;
              const catRan = cat.id === 'all'
                ? liveResults.length
                : liveResults.filter((r) => r.category === cat.id).length;
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
                    <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                      Prompt: "{tc.prompt}"
                    </span>
                  </div>
                </div>

                <div className="benchmark-test-actions" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {resultTrace && (
                    <div style={{ textAlign: 'right', fontSize: '0.8rem' }}>
                      <div style={{ color: 'var(--text-muted)' }}>
                        Outcome: <strong style={{ color: '#fff' }}>{resultTrace.passed ? 'verified' : 'not met'}</strong>
                      </div>
                      <div style={{ color: resultTrace.passed ? '#10b981' : '#ef4444' }}>
                        Called: <strong>{resultTrace.actualToolsCalled.map((t) => t.name).join(' -> ') || 'None'}</strong>
                      </div>
                    </div>
                  )}

                  {resultTrace && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                      <Clock size={14} />
                      <span>{resultTrace.durationMs}ms</span>
                    </div>
                  )}

                  {/* 1-by-1 Run / Rerun Button */}
                  <button
                    onClick={() => handleRunSingleTest(tc.id)}
                    disabled={isRunning || isSingleRunning}
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
                      cursor: isRunning || isSingleRunning ? 'not-allowed' : 'pointer',
                      opacity: isRunning || isSingleRunning ? 0.6 : 1,
                      transition: 'all 0.2s',
                    }}
                  >
                    {isSingleRunning ? (
                      <Loader2 size={14} className="spin" />
                    ) : resultTrace ? (
                      <RotateCw size={14} color="var(--accent-teal)" />
                    ) : (
                      <Play size={14} />
                    )}
                    <span>{isSingleRunning ? 'Testing...' : resultTrace ? 'Rerun' : 'Run Test'}</span>
                  </button>

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
                  <div style={{ marginBottom: '12px', padding: '8px 12px', borderRadius: '6px', background: resultTrace.passed ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: resultTrace.passed ? '#34d399' : '#f87171' }}>
                    <strong>Verdict Reason:</strong> {resultTrace.reason}
                    <div style={{ marginTop: '4px', color: 'var(--text-muted)' }}>
                      Container: {resultTrace.container.image} · workspace {resultTrace.container.workspace} · isolated: {String(resultTrace.container.isolated)}
                    </div>
                  </div>

                  <div className="benchmark-trace-grid" style={{ display: 'grid', gap: '16px' }}>
                    <div>
                      <strong style={{ color: 'var(--accent-primary)', display: 'block', marginBottom: '4px' }}>Tools Invoked ({resultTrace.actualToolsCalled.length}):</strong>
                      <HighlightedJson
                        value={resultTrace.actualToolsCalled.length > 0 ? resultTrace.actualToolsCalled : undefined}
                        emptyText="No tools invoked."
                      />
                    </div>

                    <div>
                      <strong style={{ color: 'var(--accent-teal)', display: 'block', marginBottom: '4px' }}>Model Response Content:</strong>
                      <pre style={{ fontSize: '0.775rem', whiteSpace: 'pre-wrap' }}>
                        {resultTrace.responseContent || '(Empty response)'}
                      </pre>
                    </div>
                  </div>

                  <div style={{ marginTop: '16px' }}>
                    <strong style={{ color: 'var(--accent-amber)', display: 'block', marginBottom: '4px' }}>Outcome Verification:</strong>
                    <HighlightedJson value={resultTrace.verificationDetails} emptyText="No verification details." style={{ whiteSpace: 'pre-wrap' }} />
                  </div>

                  <div style={{ marginTop: '16px' }}>
                    <strong style={{ color: 'var(--accent-primary)', display: 'block', marginBottom: '4px' }}>Effective Agent Configuration:</strong>
                    <HighlightedJson value={resultTrace.agentConfig} style={{ whiteSpace: 'pre-wrap' }} />
                  </div>

                  <div style={{ marginTop: '16px' }}>
                    <strong style={{ color: '#c084fc', display: 'block', marginBottom: '4px' }}>Complete Execution Trace:</strong>
                    <HighlightedJson value={resultTrace.executionTrace} style={{ whiteSpace: 'pre-wrap', maxHeight: '420px', overflow: 'auto' }} />
                  </div>
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
