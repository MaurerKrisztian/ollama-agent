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
} from 'lucide-react';
import { AgentConfig, ChatSessionSummary, SystemMetrics } from '../types';

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
  onOpenModelDetails: () => void;
  systemMetrics?: SystemMetrics | null;
  activeTerminalCount?: number;
  onOpenTerminalSessions?: () => void;
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
  onOpenModelDetails,
  systemMetrics,
  activeTerminalCount = 0,
  onOpenTerminalSessions,
}) => {
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);

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

        {/* Workspace Working Directory Section */}
        <div>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>
            Active Working Directory
          </span>
          <div style={{ background: 'rgba(30, 41, 59, 0.6)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              onClick={onOpenWorkingDirPicker}
              title="Click to change working directory"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'none',
                border: 0,
                color: 'var(--text-main)',
                fontSize: '0.8rem',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <FolderOpen size={16} color="var(--accent-teal)" style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontFamily: 'var(--font-code)' }}>
                {config.workingDir}
              </span>
            </button>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.76rem', color: 'var(--text-muted)', cursor: 'pointer', paddingTop: '4px', borderTop: '1px dashed var(--border-color)' }}>
              <input
                type="checkbox"
                checked={config.showWorkingDirInfo}
                onChange={(e) => onToggleWorkingDirInfo(e.target.checked)}
                style={{ accentColor: 'var(--accent-teal)' }}
              />
              <span>Include workspace & skills context</span>
            </label>
          </div>
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
              onClick={onOpenSystemPrompt}
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
              <SlidersHorizontal size={15} color="var(--accent-amber)" />
              <span>System Prompt & Core Rules</span>
            </button>

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

            <button
              onClick={onOpenModelDetails}
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
              <Info size={15} color="#38bdf8" />
              <span>Inspect Model Specs & GGUF</span>
            </button>
          </div>
        </div>

        {/* Temperature Control */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Temperature
            </span>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-amber)', fontFamily: 'var(--font-code)' }}>
              {config.temperature !== undefined ? config.temperature.toFixed(1) : '0.2'}
            </span>
          </div>
          <input
            type="range"
            min="0.0"
            max="1.0"
            step="0.1"
            value={config.temperature !== undefined ? config.temperature : 0.2}
            onChange={(e) => onChangeTemperature(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent-amber)', cursor: 'pointer' }}
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
