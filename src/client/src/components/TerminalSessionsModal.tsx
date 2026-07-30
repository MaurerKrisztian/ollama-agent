import React, { useState, useEffect, useRef } from 'react';
import { X, Terminal as TerminalIcon, Play, Square, RefreshCw, Send, Copy, Check, Trash2 } from 'lucide-react';
import { TerminalSessionInfo, TerminalSessionOutput } from '../types';

interface TerminalSessionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: TerminalSessionInfo[];
  onRefreshSessions: () => void;
  onTerminateSession: (sessionId: string) => Promise<void>;
  apiHost?: string;
}

export const TerminalSessionsModal: React.FC<TerminalSessionsModalProps> = ({
  isOpen,
  onClose,
  sessions,
  onRefreshSessions,
  onTerminateSession,
  apiHost = '',
}) => {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [outputData, setOutputData] = useState<TerminalSessionOutput | null>(null);
  const [loadingOutput, setLoadingOutput] = useState(false);
  const [inputText, setInputText] = useState('');
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [newCommandText, setNewCommandText] = useState('');
  const [startingSession, setStartingSession] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-select first session if none selected
  useEffect(() => {
    if (sessions.length > 0 && !selectedSessionId) {
      setSelectedSessionId(sessions[0].sessionId);
    } else if (sessions.length === 0) {
      setSelectedSessionId(null);
      setOutputData(null);
    }
  }, [sessions, selectedSessionId]);

  // Fetch output when selectedSessionId changes or poll while open
  const fetchOutput = async (sessionId: string) => {
    try {
      setLoadingOutput(true);
      const res = await fetch(`${apiHost}/api/terminal/sessions/${encodeURIComponent(sessionId)}/output?tail_lines=150`);
      const data = await res.json();
      if (data.success) {
        setOutputData(data.output);
      }
    } catch (_) {
    } finally {
      setLoadingOutput(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !selectedSessionId) return;
    fetchOutput(selectedSessionId);

    const interval = setInterval(() => {
      fetchOutput(selectedSessionId);
    }, 2000);

    return () => clearInterval(interval);
  }, [isOpen, selectedSessionId, apiHost]);

  // Auto scroll terminal log to bottom
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [outputData, autoScroll]);

  if (!isOpen) return null;

  const handleSendInput = async (inputToSend: string) => {
    if (!selectedSessionId || !inputToSend) return;
    try {
      await fetch(`${apiHost}/api/terminal/sessions/${encodeURIComponent(selectedSessionId)}/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: inputToSend }),
      });
      setInputText('');
      fetchOutput(selectedSessionId);
    } catch (_) {}
  };

  const handleSendCtrlC = async () => {
    if (!selectedSessionId) return;
    try {
      await fetch(`${apiHost}/api/terminal/sessions/${encodeURIComponent(selectedSessionId)}/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'CTRL+C' }),
      });
      fetchOutput(selectedSessionId);
    } catch (_) {}
  };

  const handleStartNewSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommandText.trim()) return;
    try {
      setStartingSession(true);
      const res = await fetch(`${apiHost}/api/terminal/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: newCommandText.trim() }),
      });
      const data = await res.json();
      if (data.success && data.session) {
        setNewCommandText('');
        onRefreshSessions();
        setSelectedSessionId(data.session.sessionId);
      }
    } catch (_) {
    } finally {
      setStartingSession(false);
    }
  };

  const handleCopyLogs = () => {
    if (!outputData?.lines) return;
    navigator.clipboard.writeText(outputData.lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeSessionCount = sessions.filter((s) => s.status === 'running').length;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        className="glass-panel animate-fade-in"
        style={{
          width: '1000px',
          maxWidth: '95vw',
          height: '680px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '16px',
          overflow: 'hidden',
          border: '1px solid var(--border-color)',
          background: '#0f172a',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(15, 23, 42, 0.8)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#10b981',
              }}
            >
              <TerminalIcon size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                  Long-Running Terminal Sessions
                </h2>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: activeSessionCount > 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(148, 163, 184, 0.15)',
                    color: activeSessionCount > 0 ? '#10b981' : 'var(--text-muted)',
                    border: `1px solid ${activeSessionCount > 0 ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-color)'}`,
                  }}
                >
                  {activeSessionCount} Running
                </span>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                Background terminal processes spawned by AI agent or manual execution
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={onRefreshSessions}
              title="Refresh Session List"
              style={{
                background: 'rgba(30, 41, 59, 0.8)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-muted)',
                padding: '6px 10px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8rem',
              }}
            >
              <RefreshCw size={14} />
              <span>Refresh</span>
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px',
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Main Body */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* Left Panel: Sessions List */}
          <div
            style={{
              width: '320px',
              borderRight: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              background: 'rgba(15, 23, 42, 0.4)',
            }}
          >
            {/* Start New Manual Terminal Session */}
            <form onSubmit={handleStartNewSession} style={{ padding: '12px', borderBottom: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                Launch New Terminal
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  placeholder="e.g. npm run dev"
                  value={newCommandText}
                  onChange={(e) => setNewCommandText(e.target.value)}
                  disabled={startingSession}
                  style={{
                    flex: 1,
                    background: '#1e293b',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    fontSize: '0.8rem',
                    color: 'var(--text-main)',
                    fontFamily: 'var(--font-code)',
                    outline: 'none',
                  }}
                />
                <button
                  type="submit"
                  disabled={startingSession || !newCommandText.trim()}
                  style={{
                    background: 'var(--accent-primary)',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: startingSession || !newCommandText.trim() ? 0.5 : 1,
                  }}
                >
                  <Play size={14} />
                </button>
              </div>
            </form>

            {/* Sessions List Scroll Area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sessions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                  No active or background terminal sessions running.
                </div>
              ) : (
                sessions.map((sess) => {
                  const isSelected = sess.sessionId === selectedSessionId;
                  const isRunning = sess.status === 'running';

                  return (
                    <div
                      key={sess.sessionId}
                      onClick={() => setSelectedSessionId(sess.sessionId)}
                      style={{
                        padding: '12px',
                        borderRadius: '10px',
                        border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                        background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'rgba(30, 41, 59, 0.4)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: isSelected ? 'var(--accent-primary)' : 'var(--text-main)', fontFamily: 'var(--font-code)' }}>
                          {sess.sessionId}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: isRunning ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.15)',
                              color: isRunning ? '#10b981' : '#ef4444',
                            }}
                          >
                            {isRunning ? 'RUNNING' : `EXIT (${sess.exitCode ?? 0})`}
                          </span>
                          {isRunning && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onTerminateSession(sess.sessionId);
                              }}
                              title="Terminate Process"
                              style={{
                                background: 'rgba(239, 68, 68, 0.2)',
                                border: '1px solid rgba(239, 68, 68, 0.4)',
                                color: '#ef4444',
                                borderRadius: '4px',
                                padding: '3px 6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                              }}
                            >
                              <Square size={12} fill="#ef4444" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div
                        style={{
                          fontSize: '0.75rem',
                          fontFamily: 'var(--font-code)',
                          color: 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          marginBottom: '6px',
                          background: '#0f172a',
                          padding: '4px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        $ {sess.command}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                        <span>PID: {sess.pid ?? 'N/A'}</span>
                        <span>{sess.lineCount} output lines</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Panel: Live Terminal Logs Viewer & Stdin */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#090d16' }}>
            {selectedSessionId && outputData ? (
              <>
                {/* Terminal Toolbar */}
                <div
                  style={{
                    padding: '8px 16px',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(15, 23, 42, 0.6)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <TerminalIcon size={14} color="var(--accent-teal)" />
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-code)' }}>
                      {outputData.sessionId}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                      ({outputData.lines.length} lines shown)
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={autoScroll}
                        onChange={(e) => setAutoScroll(e.target.checked)}
                        style={{ accentColor: 'var(--accent-teal)' }}
                      />
                      <span>Auto-scroll</span>
                    </label>

                    <button
                      onClick={handleCopyLogs}
                      title="Copy Output Logs"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: copied ? '#10b981' : 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '0.75rem',
                      }}
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                {/* Terminal Output Screen */}
                <div
                  ref={logContainerRef}
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '16px',
                    fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
                    fontSize: '0.825rem',
                    lineHeight: '1.45',
                    color: '#e2e8f0',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    background: '#090d16',
                  }}
                >
                  {outputData.lines.length === 0 ? (
                    <span style={{ color: 'var(--text-dim)' }}>[Waiting for process output...]</span>
                  ) : (
                    outputData.lines.map((line: string, idx: number) => (
                      <div key={idx} style={{ color: line.includes('[Process Error') ? '#ef4444' : '#e2e8f0' }}>
                        {line}
                      </div>
                    ))
                  )}
                </div>

                {/* Stdin Controls Bar */}
                <div
                  style={{
                    padding: '10px 16px',
                    borderTop: '1px solid var(--border-color)',
                    display: 'flex',
                    gap: '8px',
                    background: 'rgba(15, 23, 42, 0.8)',
                  }}
                >
                  <input
                    type="text"
                    placeholder="Send stdin input to terminal..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSendInput(inputText);
                    }}
                    disabled={outputData.status !== 'running'}
                    style={{
                      flex: 1,
                      background: '#1e293b',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      fontSize: '0.8rem',
                      color: 'var(--text-main)',
                      fontFamily: 'var(--font-code)',
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={() => handleSendInput(inputText)}
                    disabled={outputData.status !== 'running' || !inputText}
                    title="Send Input (ENTER)"
                    style={{
                      background: 'var(--accent-teal)',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#000',
                      fontWeight: 600,
                      padding: '6px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '0.8rem',
                      opacity: outputData.status !== 'running' || !inputText ? 0.5 : 1,
                    }}
                  >
                    <Send size={14} />
                    <span>Send</span>
                  </button>

                  <button
                    onClick={handleSendCtrlC}
                    disabled={outputData.status !== 'running'}
                    title="Send Interrupt (CTRL+C)"
                    style={{
                      background: 'rgba(245, 158, 11, 0.2)',
                      border: '1px solid rgba(245, 158, 11, 0.4)',
                      color: 'var(--accent-amber)',
                      fontWeight: 600,
                      borderRadius: '6px',
                      padding: '6px 12px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      opacity: outputData.status !== 'running' ? 0.5 : 1,
                    }}
                  >
                    CTRL+C
                  </button>
                </div>
              </>
            ) : (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: '12px',
                  color: 'var(--text-dim)',
                }}
              >
                <TerminalIcon size={40} strokeWidth={1.5} />
                <span>Select a terminal session on the left to view logs</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
