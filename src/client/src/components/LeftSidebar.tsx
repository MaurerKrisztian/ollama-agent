import React, { useState } from 'react';
import {
  X,
  PlusCircle,
  MessageSquare,
  Zap,
  FolderOpen,
  Wrench,
  Server,
  SlidersHorizontal,
  Info,
  Bot,
  Cpu,
  Layers,
  Terminal,
  Brain,
  Pencil,
  Trash2,
  Link,
  Check,
  RotateCcw,
  Clock,
  Download,
  Upload,
} from 'lucide-react';
import { AgentConfig, ChatSessionSummary, CheckpointEntry, SystemMetrics } from '../types';

interface LeftSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  config: AgentConfig;
  activeView: 'chat' | 'benchmark';
  onSelectView: (view: 'chat' | 'benchmark') => void;
  onNewChat: () => void;
  chatSessions: ChatSessionSummary[];
  activeSessionId: string;
  isGenerating: boolean;
  onSelectChatSession: (sessionId: string) => void;
  onRenameChatSession: (sessionId: string, title: string) => void;
  onDeleteChatSession: (sessionId: string) => void;
  onOpenSystemPrompt: () => void;
  onOpenToolSettings: () => void;
  onOpenConnectionSettings: () => void;
  onOpenWorkingDirPicker: () => void;
  onToggleWorkingDirInfo: (enabled: boolean) => void;
  onChangeTemperature: (temp: number) => void;
  onToggleThinking?: (enabled: boolean) => void;
  onTogglePlanMode?: (enabled: boolean) => void;
  onOpenModelDetails: () => void;
  systemMetrics?: SystemMetrics | null;
  activeTerminalCount?: number;
  onOpenTerminalSessions?: () => void;
  checkpoints?: CheckpointEntry[];
  isReverting?: boolean;
  onRevertToCheckpoint?: (promptId: string) => void;
  onImportConfig?: (config: AgentConfig) => void;
  onChangeWorkingDir?: (path: string) => Promise<boolean>;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  isOpen,
  onClose,
  config,
  activeView,
  onSelectView,
  onNewChat,
  chatSessions,
  activeSessionId,
  isGenerating,
  onSelectChatSession,
  onRenameChatSession,
  onDeleteChatSession,
  onOpenSystemPrompt,
  onOpenToolSettings,
  onOpenConnectionSettings,
  onOpenWorkingDirPicker,
  onToggleWorkingDirInfo,
  onChangeTemperature,
  onToggleThinking,
  onTogglePlanMode,
  onOpenModelDetails,
  systemMetrics,
  activeTerminalCount = 0,
  onOpenTerminalSessions,
  checkpoints = [],
  isReverting = false,
  onRevertToCheckpoint,
  onImportConfig,
  onChangeWorkingDir,
}) => {
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');
  const [workdirInput, setWorkdirInput] = useState<string>(config.workingDir || '');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setWorkdirInput(config.workingDir || '');
  }, [config.workingDir]);

  const handleExportUserConfig = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      const exportObject = {
        version: '1.1',
        exportedAt: new Date().toISOString(),
        config: data.config || config,
      };
      const blob = new Blob([JSON.stringify(exportObject, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `user-config-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Failed to export user configuration: ${err.message}`);
    }
  };

  const handleConfigFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const importedConfig = parsed.config || parsed;
      if (typeof importedConfig !== 'object' || !importedConfig) {
        throw new Error('Invalid JSON format in user configuration file.');
      }
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(importedConfig),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.success && data.config) {
        onImportConfig?.(data.config);
        alert('User configuration loaded and applied successfully!');
      }
    } catch (err: any) {
      alert(`Failed to load configuration file: ${err.message}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  const copySessionLink = async (sessionId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('session', sessionId);
    const sessionUrl = url.toString();

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(sessionUrl);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = sessionUrl;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        if (!copied) throw new Error('Clipboard copy was rejected.');
      }
      setCopiedSessionId(sessionId);
      window.setTimeout(() => {
        setCopiedSessionId((current) => current === sessionId ? null : current);
      }, 1800);
    } catch (_) {
      window.prompt('Copy this session URL', sessionUrl);
    }
  };

  const vramUsage = systemMetrics?.gpu && systemMetrics.gpu.memTotalMb > 0
    ? (systemMetrics.gpu.memUsedMb / systemMetrics.gpu.memTotalMb) * 100
    : 0;

  return (
    <aside
      className="glass-panel animate-fade-in left-sidebar"
      style={{
        width: '280px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid var(--border-color)',
        zIndex: 25,
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Sidebar Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'var(--accent-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 12px rgba(99, 102, 241, 0.4)',
            }}
          >
            <Bot size={18} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>
              Agent Workspace
            </h2>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Navigation & Controls</span>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Main Navigation Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* New Chat Primary Button */}
        <button
          onClick={() => {
            onNewChat();
            onClose();
          }}
          disabled={isGenerating}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            background: 'var(--accent-gradient)',
            border: 'none',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: '10px',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: isGenerating ? 'not-allowed' : 'pointer',
            opacity: isGenerating ? 0.55 : 1,
            boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
            transition: 'transform 0.15s ease',
          }}
        >
          <PlusCircle size={17} />
          <span>New Chat Session</span>
        </button>

        <div>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>
            Chat Sessions
          </span>
          <div className="chat-session-list" style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {chatSessions.map((session) => (
              <div
                key={session.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px',
                  borderRadius: '8px',
                  background: session.id === activeSessionId ? 'rgba(99, 102, 241, 0.2)' : 'rgba(30, 41, 59, 0.45)',
                  border: session.id === activeSessionId ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent',
                }}
              >
                <button
                  onClick={() => {
                    onSelectChatSession(session.id);
                    if (session.id !== activeSessionId) onClose();
                  }}
                  disabled={isGenerating}
                  title={`${session.messageCount} messages`}
                  style={{ flex: 1, minWidth: 0, border: 0, background: 'none', color: session.id === activeSessionId ? 'var(--text-main)' : 'var(--text-muted)', textAlign: 'left', padding: '6px', cursor: isGenerating ? 'not-allowed' : 'pointer' }}
                >
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem', fontWeight: session.id === activeSessionId ? 650 : 500 }}>
                    {session.title}
                  </span>
                  <span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                    {new Date(session.updatedAt).toLocaleDateString()} · {session.messageCount} messages
                  </span>
                </button>
                <button
                  onClick={() => void copySessionLink(session.id)}
                  title={copiedSessionId === session.id ? 'Session link copied' : 'Copy session link'}
                  aria-label={copiedSessionId === session.id ? `Session link copied for ${session.title}` : `Copy link for ${session.title}`}
                  style={{ border: 0, background: 'none', color: copiedSessionId === session.id ? 'var(--accent-teal)' : 'var(--text-dim)', padding: '5px', cursor: 'pointer' }}
                >
                  {copiedSessionId === session.id ? <Check size={13} /> : <Link size={13} />}
                </button>
                <button
                  onClick={() => {
                    const title = window.prompt('Rename chat session', session.title);
                    if (title?.trim()) onRenameChatSession(session.id, title);
                  }}
                  title="Rename chat"
                  style={{ border: 0, background: 'none', color: 'var(--text-dim)', padding: '5px', cursor: 'pointer' }}
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Delete “${session.title}”?`)) onDeleteChatSession(session.id);
                  }}
                  disabled={isGenerating}
                  title="Delete chat"
                  style={{ border: 0, background: 'none', color: '#f87171', padding: '5px', cursor: isGenerating ? 'not-allowed' : 'pointer', opacity: isGenerating ? 0.4 : 0.8 }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Checkpoint Timeline */}
        {checkpoints.length > 0 && onRevertToCheckpoint && (
          <div>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>
              File Checkpoints
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {checkpoints.map((cp, idx) => (
                <div
                  key={cp.promptId}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: 'rgba(20, 184, 166, 0.07)',
                    border: '1px solid rgba(20, 184, 166, 0.2)',
                  }}
                >
                  <Clock size={12} color="var(--accent-teal)" style={{ flexShrink: 0, marginTop: '3px' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem', color: 'var(--text-main)', fontWeight: 500 }}>
                      {cp.promptText || `Prompt ${idx + 1}`}
                    </span>
                    <span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                      {new Date(cp.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <button
                    onClick={() => onRevertToCheckpoint(cp.promptId)}
                    disabled={isReverting}
                    title="Revert all file changes made after this prompt"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'rgba(20, 184, 166, 0.15)',
                      border: '1px solid rgba(20, 184, 166, 0.4)',
                      color: 'var(--accent-teal)',
                      borderRadius: '5px',
                      padding: '3px 7px',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      cursor: isReverting ? 'not-allowed' : 'pointer',
                      opacity: isReverting ? 0.5 : 1,
                      flexShrink: 0,
                    }}
                  >
                    <RotateCcw size={11} />
                    <span>Revert</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Views Switcher */}
        <div>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>
            Navigation Views
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <button
              onClick={() => onSelectView('chat')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '9px 12px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                background: activeView === 'chat' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                color: activeView === 'chat' ? 'var(--accent-primary)' : 'var(--text-muted)',
                textAlign: 'left',
              }}
            >
              <MessageSquare size={16} />
              <span>Chat Agent Studio</span>
            </button>
            <button
              onClick={() => onSelectView('benchmark')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '9px 12px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                background: activeView === 'benchmark' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                color: activeView === 'benchmark' ? 'var(--accent-amber)' : 'var(--text-muted)',
                textAlign: 'left',
              }}
            >
              <Zap size={16} />
              <span>Benchmark Runner</span>
            </button>
          </div>
        </div>

        {/* Active Working Directory Card */}
        <div style={{ background: 'rgba(30, 41, 59, 0.45)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FolderOpen size={16} color="var(--accent-teal)" />
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Active Working Directory
              </span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.72rem', color: 'var(--text-muted)' }} title="Include working directory context in model requests">
              <input
                type="checkbox"
                checked={config.showWorkingDirInfo}
                onChange={(e) => onToggleWorkingDirInfo(e.target.checked)}
                style={{ accentColor: 'var(--accent-teal)', cursor: 'pointer' }}
              />
              <span>Context</span>
            </label>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (workdirInput.trim() && onChangeWorkingDir) {
                void onChangeWorkingDir(workdirInput.trim());
              }
            }}
            style={{ display: 'flex', gap: '6px' }}
          >
            <input
              type="text"
              value={workdirInput}
              onChange={(e) => setWorkdirInput(e.target.value)}
              placeholder="/path/to/working/dir"
              title="Active working directory absolute path"
              style={{
                flex: 1,
                minWidth: 0,
                padding: '6px 9px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: 'rgba(15, 23, 42, 0.8)',
                color: 'var(--text-main)',
                fontSize: '0.78rem',
                fontFamily: 'var(--font-code, monospace)',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              title="Apply working directory path"
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid rgba(20, 184, 166, 0.4)',
                background: 'rgba(20, 184, 166, 0.15)',
                color: 'var(--accent-teal)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Apply
            </button>
          </form>

          <button
            type="button"
            onClick={onOpenWorkingDirPicker}
            title="Browse server filesystem directories"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              width: '100%',
              padding: '8px 10px',
              borderRadius: '6px',
              border: '1px solid rgba(20, 184, 166, 0.35)',
              background: 'rgba(20, 184, 166, 0.1)',
              color: 'var(--accent-teal)',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <FolderOpen size={14} color="var(--accent-teal)" />
            <span>Browse & Change Folder</span>
          </button>
        </div>

        {/* Model & Agent Settings */}
        <div>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>
            Agent Settings & Inspection
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <button
              onClick={onOpenToolSettings}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'rgba(30, 41, 59, 0.4)',
                color: 'var(--text-main)',
                fontSize: '0.825rem',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <Wrench size={15} color="var(--accent-primary)" />
              <span>Tool Approval & Safety Settings</span>
            </button>

            {onTogglePlanMode && (
              <button
                onClick={() => onTogglePlanMode(!config.planMode)}
                title={config.planMode ? 'Plan Mode is ACTIVE: Research & generate plan before editing code' : 'Enable Plan Mode: Read-only research & plan review before edits'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: config.planMode ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid var(--border-color)',
                  background: config.planMode ? 'rgba(59, 130, 246, 0.15)' : 'rgba(30, 41, 59, 0.4)',
                  color: config.planMode ? '#60a5fa' : 'var(--text-main)',
                  fontSize: '0.825rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontWeight: 600,
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '14px' }}>📋</span>
                  <span>Plan Mode</span>
                </div>
                <span
                  style={{
                    fontSize: '0.7rem',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: config.planMode ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                    color: config.planMode ? '#93c5fd' : 'var(--text-muted)',
                    fontWeight: 700,
                  }}
                >
                  {config.planMode ? 'ON' : 'OFF'}
                </span>
              </button>
            )}

            {onOpenTerminalSessions && (
              <button
                onClick={() => {
                  onOpenTerminalSessions();
                  onClose();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'rgba(30, 41, 59, 0.4)',
                  color: 'var(--text-main)',
                  fontSize: '0.825rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Terminal size={15} color="#10b981" />
                <span>Active Terminal Sessions ({activeTerminalCount})</span>
              </button>
            )}

            <button
              onClick={onOpenConnectionSettings}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'rgba(30, 41, 59, 0.4)',
                color: 'var(--text-main)',
                fontSize: '0.825rem',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <Server size={15} color="var(--accent-teal)" />
              <span>Ollama Host & API Connection</span>
            </button>
          </div>
        </div>



        {/* User Config Export / Load */}
        <div>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>
            User Config File
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              type="button"
              onClick={handleExportUserConfig}
              title="Export and download all current user configuration settings as a JSON file"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '8px 10px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'rgba(30, 41, 59, 0.4)',
                color: 'var(--text-main)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Download size={14} color="var(--accent-teal)" />
              <span>Export Config</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Upload and load a saved user configuration JSON file"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '8px 10px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'rgba(30, 41, 59, 0.4)',
                color: 'var(--text-main)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Upload size={14} color="var(--accent-primary)" />
              <span>Load Config</span>
            </button>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleConfigFileChange}
            accept=".json"
            style={{ display: 'none' }}
          />
        </div>

        {/* System Hardware Status */}
        {systemMetrics && (
          <div style={{ marginTop: 'auto', background: 'rgba(30, 41, 59, 0.6)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              System Hardware Load
            </span>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>CPU Utilization:</span>
              <strong style={{ color: systemMetrics.cpu.utilization > 80 ? '#ef4444' : '#fff' }}>{systemMetrics.cpu.utilization}%</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>RAM Usage:</span>
              <strong style={{ color: systemMetrics.memory.utilization > 85 ? '#ef4444' : '#fff' }}>{systemMetrics.memory.usedGb} / {systemMetrics.memory.totalGb} GB</strong>
            </div>
            {systemMetrics.gpu && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', fontSize: '0.78rem' }}>
                  <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>GPU Model:</span>
                  <strong style={{ color: '#fff', textAlign: 'right', overflowWrap: 'anywhere' }} title={systemMetrics.gpu.name}>
                    {systemMetrics.gpu.name}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>GPU Load:</span>
                  <strong style={{ color: '#4ade80' }}>{systemMetrics.gpu.gpuUtil}%</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>VRAM Usage:</span>
                  <strong style={{ color: vramUsage > 85 ? '#ef4444' : '#fff' }}>
                    {systemMetrics.gpu.memTotalMb > 0
                      ? `${(systemMetrics.gpu.memUsedMb / 1024).toFixed(1)} / ${(systemMetrics.gpu.memTotalMb / 1024).toFixed(1)} GB`
                      : 'Unavailable'}
                  </strong>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
