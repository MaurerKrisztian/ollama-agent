import React, { useState, useEffect, useRef } from 'react';
import { X, Terminal as TerminalIcon, Play, Square, RefreshCw, Send, Copy, Check, Maximize2, History } from 'lucide-react';
import { TerminalSessionInfo, TerminalSessionOutput, TerminalInputHistoryItem } from '../types';

interface RightTerminalSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: TerminalSessionInfo[];
  onRefreshSessions: () => void;
  onTerminateSession: (sessionId: string) => Promise<void>;
  onOpenModal?: () => void;
  apiHost?: string;
}

export const RightTerminalSidebar: React.FC<RightTerminalSidebarProps> = ({
  isOpen,
  onClose,
  sessions,
  onRefreshSessions,
  onTerminateSession,
  onOpenModal,
  apiHost = '',
}) => {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [outputData, setOutputData] = useState<TerminalSessionOutput | null>(null);
  const [inputText, setInputText] = useState('');
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showInputHistory, setShowInputHistory] = useState(false);
  const [newCommandText, setNewCommandText] = useState('');
  const [startingSession, setStartingSession] = useState(false);
  const [showLaunchInput, setShowLaunchInput] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-select first running or active session
  useEffect(() => {
    if (sessions.length > 0 && (!selectedSessionId || !sessions.some((s) => s.sessionId === selectedSessionId))) {
      const running = sessions.find((s) => s.status === 'running');
      setSelectedSessionId(running ? running.sessionId : sessions[0].sessionId);
    } else if (sessions.length === 0) {
      setSelectedSessionId(null);
      setOutputData(null);
    }
  }, [sessions, selectedSessionId]);

  // Fetch log output for selected session
  const fetchOutput = async (sessionId: string) => {
    try {
      const res = await fetch(`${apiHost}/api/terminal/sessions/${encodeURIComponent(sessionId)}/output?tail_lines=150`);
      const data = await res.json();
      if (data.success) {
        setOutputData(data.output);
      }
    } catch (_) {}
  };

  useEffect(() => {
    if (!isOpen || !selectedSessionId) return;
    fetchOutput(selectedSessionId);

    const interval = setInterval(() => {
      fetchOutput(selectedSessionId);
    }, 2000);

    return () => clearInterval(interval);
  }, [isOpen, selectedSessionId, apiHost]);

  // Auto-scroll terminal container
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
        setShowLaunchInput(false);
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
  const currentSession = sessions.find((s) => s.sessionId === selectedSessionId);

  return (
    <aside
      className="glass-panel animate-fade-in"
      style={{
        width: '460px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid var(--border-color)',
        zIndex: 20,
        background: '#090d16',
        flexShrink: 0,
      }}
    >
      {/* Sidebar Header */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(15, 23, 42, 0.8)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <TerminalIcon size={18} color="#10b981" />
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
            Terminal Sessions
          </h2>
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 600,
              padding: '2px 7px',
              borderRadius: '10px',
              background: activeSessionCount > 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(148, 163, 184, 0.15)',
              color: activeSessionCount > 0 ? '#10b981' : 'var(--text-muted)',
              border: `1px solid ${activeSessionCount > 0 ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-color)'}`,
            }}
          >
            {activeSessionCount} Running
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={onRefreshSessions}
            title="Refresh Sessions"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
          >
            <RefreshCw size={15} />
          </button>
          {onOpenModal && (
            <button
              onClick={onOpenModal}
              title="Pop out in Full Modal"
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
            >
              <Maximize2 size={15} />
            </button>
          )}
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Sessions Tab Bar */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          overflowX: 'auto',
          background: 'rgba(15, 23, 42, 0.5)',
        }}
      >
        {sessions.map((sess) => {
          const isSelected = sess.sessionId === selectedSessionId;
          const isRunning = sess.status === 'running';

          return (
            <button
              key={sess.sessionId}
              onClick={() => setSelectedSessionId(sess.sessionId)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '0.775rem',
                fontFamily: 'var(--font-code)',
                fontWeight: 600,
                cursor: 'pointer',
                border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                background: isSelected ? 'rgba(99, 102, 241, 0.2)' : 'rgba(30, 41, 59, 0.4)',
                color: isSelected ? '#fff' : 'var(--text-muted)',
                whiteSpace: 'nowrap',
              }}
            >
              <div
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: isRunning ? '#10b981' : '#ef4444',
                }}
              />
              <span>{sess.sessionId}</span>
            </button>
          );
        })}

        <button
          onClick={() => setShowLaunchInput(!showLaunchInput)}
          title="Launch New Terminal Process"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '5px 8px',
            borderRadius: '6px',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
            border: '1px dashed var(--accent-teal)',
            background: 'rgba(20, 184, 166, 0.1)',
            color: 'var(--accent-teal)',
            whiteSpace: 'nowrap',
          }}
        >
          <Play size={12} />
          <span>+ New</span>
        </button>
      </div>

      {/* Inline Launch Input if toggled */}
      {showLaunchInput && (
        <form onSubmit={handleStartNewSession} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', background: '#0f172a', display: 'flex', gap: '6px' }}>
          <input
            type="text"
            placeholder="Command (e.g. npm run dev)"
            value={newCommandText}
            onChange={(e) => setNewCommandText(e.target.value)}
            autoFocus
            style={{
              flex: 1,
              background: '#1e293b',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '5px 8px',
              fontSize: '0.78rem',
              color: 'var(--text-main)',
              fontFamily: 'var(--font-code)',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={startingSession || !newCommandText.trim()}
            style={{
              background: 'var(--accent-teal)',
              border: 'none',
              borderRadius: '6px',
              color: '#000',
              fontWeight: 600,
              padding: '5px 10px',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            Run
          </button>
        </form>
      )}

      {/* Process Meta Header Bar */}
      {currentSession && (
        <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border-color)', background: 'rgba(15, 23, 42, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.725rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
            <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-code)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              $ {currentSession.command}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <span style={{ color: 'var(--text-muted)' }}>PID: {currentSession.pid ?? 'N/A'}</span>
            {currentSession.status === 'running' && (
              <button
                onClick={() => onTerminateSession(currentSession.sessionId)}
                title="Kill Process"
                style={{
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#ef4444',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontWeight: 600,
                }}
              >
                <Square size={10} fill="#ef4444" />
                <span>Kill</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Terminal Screen & Logs Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {selectedSessionId && outputData ? (
          <>
            {/* Log Controls Subheader */}
            <div
              style={{
                padding: '4px 12px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(10, 15, 28, 0.8)',
                fontSize: '0.725rem',
              }}
            >
              <span style={{ color: 'var(--text-dim)' }}>{outputData.lines.length} lines buffered</span>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                    style={{ accentColor: 'var(--accent-teal)' }}
                  />
                  <span>Auto-scroll</span>
                </label>

                <button
                  onClick={() => setShowInputHistory((prev) => !prev)}
                  title="Show or hide sent terminal input history"
                  style={{
                    background: showInputHistory ? 'rgba(99, 102, 241, 0.25)' : 'none',
                    border: showInputHistory ? '1px solid var(--accent-primary)' : 'none',
                    color: showInputHistory ? '#fff' : 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.725rem',
                    fontWeight: 600,
                  }}
                >
                  <History size={12} color={showInputHistory ? 'var(--accent-teal)' : 'var(--text-muted)'} />
                  <span>Inputs ({outputData.inputs?.length || 0})</span>
                </button>

                <button
                  onClick={handleCopyLogs}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: copied ? '#10b981' : 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                  }}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Collapsible Sent Input History Viewer */}
            {showInputHistory && (
              <div
                style={{
                  maxHeight: '140px',
                  overflowY: 'auto',
                  background: 'rgba(15, 23, 42, 0.95)',
                  borderBottom: '1px solid var(--border-color)',
                  padding: '8px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--accent-teal)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Terminal Input History
                </div>
                {(!outputData.inputs || outputData.inputs.length === 0) ? (
                  <div style={{ fontSize: '0.725rem', color: 'var(--text-dim)' }}>No inputs recorded yet.</div>
                ) : (
                  outputData.inputs.map((item: TerminalInputHistoryItem, i: number) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: '#0f172a',
                        padding: '4px 6px',
                        borderRadius: '4px',
                        border: '1px solid rgba(148, 163, 184, 0.15)',
                        fontSize: '0.725rem',
                        fontFamily: 'var(--font-code)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                        <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>#{i + 1}</span>
                        <span style={{ color: '#e2e8f0', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                          {item.input}
                        </span>
                      </div>
                      <button
                        onClick={() => setInputText(item.input)}
                        title="Use input text"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--accent-primary)',
                          cursor: 'pointer',
                          fontSize: '0.68rem',
                          padding: 0,
                          flexShrink: 0,
                        }}
                      >
                        Use
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Logs Pre Block */}
            <div
              ref={logContainerRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '12px',
                fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
                fontSize: '0.775rem',
                lineHeight: '1.4',
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

            {/* Stdin Controls Footer */}
            <div
              style={{
                padding: '8px 12px',
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                gap: '6px',
                background: 'rgba(15, 23, 42, 0.8)',
              }}
            >
              <input
                type="text"
                placeholder="Send input..."
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
                  padding: '5px 8px',
                  fontSize: '0.78rem',
                  color: 'var(--text-main)',
                  fontFamily: 'var(--font-code)',
                  outline: 'none',
                }}
              />
              <button
                onClick={() => handleSendInput(inputText)}
                disabled={outputData.status !== 'running' || !inputText}
                style={{
                  background: 'var(--accent-teal)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#000',
                  fontWeight: 600,
                  padding: '5px 10px',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  opacity: outputData.status !== 'running' || !inputText ? 0.5 : 1,
                }}
              >
                <Send size={12} />
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
                  padding: '5px 8px',
                  cursor: 'pointer',
                  fontSize: '0.725rem',
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
              gap: '10px',
              color: 'var(--text-dim)',
              fontSize: '0.825rem',
            }}
          >
            <TerminalIcon size={32} strokeWidth={1.5} />
            <span>No terminal session selected</span>
          </div>
        )}
      </div>
    </aside>
  );
};
