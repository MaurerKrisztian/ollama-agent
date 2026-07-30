import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { OllamaModelInfo } from '../types';

export interface TestResultTrace {
  testId: string;
  testName: string;
  category: string;
  prompt: string;
  expectedTool: string | null;
  expectedToolSequence?: string[];
  actualToolsCalled: Array<{ name: string; args: Record<string, any> }>;
  passed: boolean;
  reason: string;
  durationMs: number;
  responseContent: string;
  objective: string;
  requiredOutput: string;
  evaluationCriteria: string;
}

export interface BenchmarkTestCaseInfo {
  id: string;
  name: string;
  category: string;
  prompt: string;
  expectedTool?: string | null;
  expectedToolSequence?: string[];
  description: string;
  objective: string;
  requiredOutput: string;
  evaluationCriteria: string;
}

export interface BenchmarkReport {
  timestamp: number;
  model: string;
  mockWorkingDir: string;
  totalTests: number;
  passCount: number;
  failCount: number;
  accuracyPercentage: number;
  totalDurationMs: number;
  results: TestResultTrace[];
}

interface BenchmarkViewProps {
  models: OllamaModelInfo[];
  activeModel: string;
  onSelectModel: (model: string) => void;
}

export const BenchmarkView: React.FC<BenchmarkViewProps> = ({
  models,
  activeModel,
  onSelectModel,
}) => {
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [liveResults, setLiveResults] = useState<TestResultTrace[]>([]);
  const [testCasesInfo, setTestCasesInfo] = useState<BenchmarkTestCaseInfo[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [runningSingleId, setRunningSingleId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    current: number;
    completed: number;
    total: number;
    testName?: string;
  } | null>(null);
  const [expandedTestId, setExpandedTestId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Modal State for Test Info
  const [selectedInfoTest, setSelectedInfoTest] = useState<BenchmarkTestCaseInfo | TestResultTrace | null>(null);

  useEffect(() => {
    fetch('/api/benchmark/testcases')
      .then((res) => res.json())
      .then((data) => {
        if (data.testCases) setTestCasesInfo(data.testCases);
      })
      .catch((err) => console.error('Error fetching benchmark test cases:', err));
  }, []);

  const handleRunAllBenchmarks = async () => {
    setIsRunning(true);
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
          model: activeModel,
          ...(selectedCategory !== 'all' ? { category: selectedCategory } : {}),
        }),
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
            } else if (eventType === 'error') {
              alert(`Benchmark Stream Error: ${eventData.error}`);
            }
          }
        }
      }
    } catch (err: any) {
      alert(`Benchmark execution failed: ${err.message}`);
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  };

  const handleRunSingleTest = async (testId: string) => {
    setRunningSingleId(testId);
    try {
      const res = await fetch('/api/benchmark/run-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testId, model: activeModel }),
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

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner & Control Panel */}
      <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <Zap size={22} color="var(--accent-amber)" />
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-main)' }}>
              Real-Time Tool Calling Benchmark Suite
            </h2>
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', maxWidth: '560px', lineHeight: 1.5 }}>
            Run benchmarks 1-by-1 or execute the full suite against your local model in an isolated mock environment.
          </p>
        </div>

        {/* Model Picker & Trigger Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(15, 23, 42, 0.8)', padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <Cpu size={16} color="var(--accent-primary)" />
            <select
              value={activeModel}
              onChange={(e) => onSelectModel(e.target.value)}
              disabled={isRunning || runningSingleId !== null}
              style={{
                background: 'transparent',
                color: 'var(--text-main)',
                border: 'none',
                fontSize: '0.9rem',
                fontWeight: 500,
                outline: 'none',
                cursor: isRunning || runningSingleId !== null ? 'not-allowed' : 'pointer',
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
            onClick={handleRunAllBenchmarks}
            disabled={isRunning || runningSingleId !== null}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: isRunning ? 'rgba(99, 102, 241, 0.4)' : 'var(--accent-gradient)',
              border: 'none',
              color: '#fff',
              padding: '10px 20px',
              borderRadius: '8px',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: isRunning || runningSingleId !== null ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
              transition: 'all 0.2s',
            }}
          >
            {isRunning ? <Loader2 size={18} className="spin" /> : <Play size={18} />}
            <span>
              {isRunning
                ? `Testing... (${progress ? `${progress.current}/${progress.total}` : ''})`
                : selectedCategory === 'all'
                  ? `Run All Benchmarks (${testCasesInfo.length})`
                  : `Run Category (${testCasesInfo.filter((t) => t.category === selectedCategory).length})`}
            </span>
          </button>
        </div>
      </div>

      {/* Live Stream Progress Bar */}
      {isRunning && progress && (
        <div className="glass-panel animate-fade-in" style={{ padding: '16px 20px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
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
        <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
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
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Zero tool call hallucinations</span>
          </div>

          <div className="glass-panel" style={{ padding: '20px', borderRadius: '14px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Failed Tests</span>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: failCount > 0 ? '#ef4444' : 'var(--text-dim)', marginTop: '4px' }}>
              {failCount}
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Incorrect or missing tool calls</span>
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)' }}>
            Benchmark Tasks ({testCasesInfo.length}) - Run Individual Tests 1-by-1 or Rerun
          </h3>

          {/* Category Filter Pills */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
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
              className="glass-panel animate-fade-in"
              style={{
                borderRadius: '12px',
                overflow: 'hidden',
                borderLeft: `4px solid ${resultTrace ? (resultTrace.passed ? '#10b981' : '#ef4444') : 'var(--border-color)'}`,
              }}
            >
              {/* Card Header */}
              <div
                style={{
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(30, 41, 59, 0.4)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  {resultTrace ? (
                    resultTrace.passed ? <CheckCircle2 size={22} color="#10b981" /> : <XCircle size={22} color="#ef4444" />
                  ) : (
                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', border: '2px solid var(--text-dim)' }} />
                  )}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {resultTrace && (
                    <div style={{ textAlign: 'right', fontSize: '0.8rem' }}>
                      <div style={{ color: 'var(--text-muted)' }}>
                        Expected: <strong style={{ color: '#fff' }}>{resultTrace.expectedTool || 'None'}</strong>
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
                <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-color)', background: 'rgba(15, 23, 42, 0.8)', fontSize: '0.85rem' }}>
                  <div style={{ marginBottom: '12px', padding: '8px 12px', borderRadius: '6px', background: resultTrace.passed ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: resultTrace.passed ? '#34d399' : '#f87171' }}>
                    <strong>Verdict Reason:</strong> {resultTrace.reason}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <strong style={{ color: 'var(--accent-primary)', display: 'block', marginBottom: '4px' }}>Tools Invoked ({resultTrace.actualToolsCalled.length}):</strong>
                      <pre style={{ fontSize: '0.775rem' }}>
                        {resultTrace.actualToolsCalled.length > 0 ? JSON.stringify(resultTrace.actualToolsCalled, null, 2) : 'No tools invoked.'}
                      </pre>
                    </div>

                    <div>
                      <strong style={{ color: 'var(--accent-teal)', display: 'block', marginBottom: '4px' }}>Model Response Content:</strong>
                      <pre style={{ fontSize: '0.775rem', whiteSpace: 'pre-wrap' }}>
                        {resultTrace.responseContent || '(Empty response)'}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Test Case Specification Modal */}
      {selectedInfoTest && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '640px', borderRadius: '16px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.875rem', lineHeight: 1.6 }}>
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
                <pre style={{ margin: 0, fontSize: '0.85rem', color: '#fcd34d' }}>"{selectedInfoTest.prompt}"</pre>
              </div>

              {/* Required Output */}
              <div style={{ background: 'rgba(20, 184, 166, 0.08)', padding: '14px', borderRadius: '8px', border: '1px solid rgba(20, 184, 166, 0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-teal)', fontWeight: 600, marginBottom: '4px' }}>
                  <FileCode2 size={16} />
                  <span>Required Output & Tool Behavior:</span>
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
    </div>
  );
};
