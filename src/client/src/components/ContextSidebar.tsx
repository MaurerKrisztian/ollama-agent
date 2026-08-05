import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { X, Copy, Check, FileJson, AlignLeft, Layers, FolderTree, RefreshCw, Cpu, Sparkles, Scissors, SlidersHorizontal, FolderOpen, Settings, BookOpen, Loader2 } from 'lucide-react';
import { AgentConfig, ContextInfo, ContextPruningConfig } from '../types';

interface ContextSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  contextInfo: ContextInfo | null;
  activeModel?: string;
  onCompactContext?: () => void;
  isCompacting?: boolean;
  onContextInfoChange?: (contextInfo: ContextInfo) => void;
  config?: AgentConfig;
  onOpenSystemPrompt?: () => void;
  onOpenWorkingDirPicker?: () => void;
  onToggleWorkingDirInfo?: (enabled: boolean) => void;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function colorizeJson(jsonStr: string): string {
  if (!jsonStr) return '';
  // Completely strip base64 image content before HTML escaping or tokenizing to guarantee zero V8 regex stack overflow
  let cleaned = jsonStr;
  if (cleaned.length > 50000) {
    cleaned = cleaned.replace(/"data:image\/[a-zA-Z0-9\/+;=]+;base64,[^"]+"/gi, '"[base64 image data truncated for preview]"');
    cleaned = cleaned.replace(/"[A-Za-z0-9+/=]{1000,}"/g, '"[raw base64 image data truncated for preview]"');
  }

  const escaped = escapeHtml(cleaned);
  // Safe simple regex without nested wildcard quantifiers
  return escaped.replace(
    /"([^"\\]|\\.)*"(?=\s*:)|"([^"\\]|\\.)*"|\b(true|false|null)\b|-?\d+(?:\.\d+)?/g,
    (match, p1) => {
      if (p1 !== undefined) {
        return `<span class="json-key">${match}</span>`;
      }
      if (/^"/.test(match)) {
        return `<span class="json-string">${match}</span>`;
      }
      if (/true|false/.test(match)) {
        return `<span class="json-boolean">${match}</span>`;
      }
      if (/null/.test(match)) {
        return `<span class="json-null">${match}</span>`;
      }
      return `<span class="json-number">${match}</span>`;
    }
  );
}

function colorizeConvertedText(text: string): string {
  if (!text) return '';
  const lines = text.split('\n');

  const highlightedLines = lines.map((line) => {
    const escaped = escapeHtml(line);

    // Section headers === [...] ===
    if (escaped.startsWith('===') && escaped.endsWith('===')) {
      return `<span class="ctx-header">${escaped}</span>`;
    }

    // Turn Badges [#1 | USER | 10:15:00]
    if (escaped.startsWith('[#') && escaped.includes('|')) {
      if (escaped.includes('USER')) {
        return `<span class="ctx-turn-user">${escaped}</span>`;
      }
      if (escaped.includes('ASSISTANT')) {
        return `<span class="ctx-turn-assistant">${escaped}</span>`;
      }
      if (escaped.includes('TOOL')) {
        return `<span class="ctx-turn-tool">${escaped}</span>`;
      }
      if (escaped.includes('SYSTEM')) {
        return `<span class="ctx-turn-system">${escaped}</span>`;
      }
    }

    // Tool labels
    if (escaped.startsWith('Requested Tool Calls:') || escaped.startsWith('Tool Name:') || escaped.startsWith('Tool Output:')) {
      return `<span class="ctx-tool-label">${escaped}</span>`;
    }

    if (escaped.startsWith('- Tool:')) {
      return `<span class="ctx-tool-name">${escaped}</span>`;
    }

    if (escaped === '---') {
      return `<span class="ctx-divider">${escaped}</span>`;
    }

    return escaped;
  });

  return highlightedLines.join('\n');
}

export const ContextSidebar: React.FC<ContextSidebarProps> = ({
  isOpen,
  onClose,
  contextInfo,
  activeModel,
  onCompactContext,
  isCompacting,
  onContextInfoChange,
  config,
  onOpenSystemPrompt,
  onOpenWorkingDirPicker,
  onToggleWorkingDirInfo,
}) => {
  const [activeTab, setActiveTab] = useState<'formatted' | 'json' | 'workdir' | 'pruning' | 'settings' | 'skills'>('formatted');
  const [copied, setCopied] = useState(false);
  const [workdirContext, setWorkdirContext] = useState('');
  const [workdirEnabled, setWorkdirEnabled] = useState(false);
  const [workdirLoading, setWorkdirLoading] = useState(false);
  const [workdirError, setWorkdirError] = useState('');
  const [maxContextTokens, setMaxContextTokens] = useState<number | null>(null);

  const [pruningConfig, setPruningConfig] = useState<ContextPruningConfig | null>(null);
  const [pruningLoading, setPruningLoading] = useState(false);

  interface SkillItem {
    name: string;
    description: string;
    path: string;
  }
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState('');
  const [expandedSkillName, setExpandedSkillName] = useState<string | null>(null);
  const [expandedSkillContent, setExpandedSkillContent] = useState<string>('');
  const [expandedSkillLoading, setExpandedSkillLoading] = useState(false);

  const fetchSkills = useCallback(async () => {
    setSkillsLoading(true);
    setSkillsError('');
    try {
      const res = await fetch('/api/skills');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load skills.');
      setSkills(Array.isArray(data.skills) ? data.skills : []);
    } catch (err: any) {
      setSkillsError(err.message);
    } finally {
      setSkillsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && activeTab === 'skills') void fetchSkills();
  }, [isOpen, activeTab, fetchSkills]);

  const handleExpandSkill = useCallback(async (name: string) => {
    if (expandedSkillName === name) {
      setExpandedSkillName(null);
      setExpandedSkillContent('');
      return;
    }
    setExpandedSkillLoading(true);
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(name)}/raw`);
      if (!res.ok) throw new Error('Could not load skill content.');
      const data = await res.json();
      setExpandedSkillContent(data.content || '');
      setExpandedSkillName(name);
    } catch {
      setExpandedSkillContent('Failed to load skill instructions.');
      setExpandedSkillName(name);
    } finally {
      setExpandedSkillLoading(false);
    }
  }, [expandedSkillName]);

  const fetchPruningConfig = useCallback(async () => {
    setPruningLoading(true);
    try {
      const res = await fetch('/api/context/pruning');
      const data = await res.json();
      if (data.success && data.pruningConfig) {
        setPruningConfig(data.pruningConfig);
      }
    } catch (_) {
    } finally {
      setPruningLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) void fetchPruningConfig();
  }, [isOpen, fetchPruningConfig]);

  const handleUpdatePruning = async (updates: Partial<ContextPruningConfig>) => {
    if (!pruningConfig) return;
    const newConfig = { ...pruningConfig, ...updates };
    setPruningConfig(newConfig);

    try {
      const res = await fetch('/api/context/pruning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.success) {
        if (data.pruningConfig) setPruningConfig(data.pruningConfig);
        if (data.context && onContextInfoChange) {
          onContextInfoChange(data.context);
        }
      }
    } catch (_) {}
  };

  useEffect(() => {
    if (!activeModel) return;

    const fetchModelContext = async () => {
      try {
        const res = await fetch(`/api/models/show?name=${encodeURIComponent(activeModel)}`);
        const data = await res.json();
        if (data.success && data.details) {
          let foundMax: number | null = null;
          if (data.details.model_info && typeof data.details.model_info === 'object') {
            for (const [key, value] of Object.entries(data.details.model_info)) {
              if (key.endsWith('.context_length') && typeof value === 'number') {
                foundMax = value;
                break;
              }
            }
          }
          if (!foundMax && typeof data.details.parameters === 'string') {
            const match = data.details.parameters.match(/num_ctx\s+(\d+)/i);
            if (match) {
              foundMax = parseInt(match[1], 10);
            }
          }
          setMaxContextTokens(foundMax);
        }
      } catch (_) {}
    };

    fetchModelContext();
  }, [activeModel]);

  const loadWorkdirContext = useCallback(async () => {
    setWorkdirLoading(true);
    setWorkdirError('');
    try {
      const response = await fetch('/api/context/workdir');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load working directory context.');
      setWorkdirEnabled(Boolean(data.enabled));
      setWorkdirContext(typeof data.content === 'string' ? data.content : '');
    } catch (error: any) {
      setWorkdirError(error.message);
    } finally {
      setWorkdirLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && activeTab === 'workdir') void loadWorkdirContext();
  }, [isOpen, activeTab, loadWorkdirContext]);

  const highlightedFormattedText = useMemo(() => {
    return contextInfo ? colorizeConvertedText(contextInfo.formattedText) : '';
  }, [contextInfo?.formattedText]);

  const highlightedRawJson = useMemo(() => {
    return contextInfo ? colorizeJson(contextInfo.rawJson) : '';
  }, [contextInfo?.rawJson]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!contextInfo && activeTab !== 'workdir') return;
    const textToCopy =
      activeTab === 'formatted'
        ? contextInfo!.formattedText
        : activeTab === 'json'
          ? contextInfo!.rawJson
          : workdirContext;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <aside
      className="glass-panel animate-fade-in context-sidebar"
      style={{
        width: 'var(--sidebar-width)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid var(--border-color)',
        zIndex: 20,
      }}
    >
      {/* Sidebar Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={18} color="var(--accent-primary)" />
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)' }}>Context Inspector</h2>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Context & Token Progress Bar */}
      {contextInfo && (
        <div style={{ padding: '12px 20px', background: 'rgba(15, 23, 42, 0.5)', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {(() => {
            const tokensUsed = contextInfo.estimatedTokens;
            const tokensLeft = maxContextTokens ? Math.max(0, maxContextTokens - tokensUsed) : 0;
            const pctUsed = maxContextTokens ? Math.min(100, Number(((tokensUsed / maxContextTokens) * 100).toFixed(1))) : 0;
            const pctRemaining = maxContextTokens ? Math.max(0, Number((100 - pctUsed).toFixed(1))) : 0;

            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Cpu size={14} color="var(--accent-primary)" />
                    <span>Token Context Usage</span>
                  </span>
                  <span style={{ fontFamily: 'var(--font-code)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {maxContextTokens
                      ? `${tokensUsed.toLocaleString()} / ${maxContextTokens.toLocaleString()} tokens`
                      : `~${tokensUsed.toLocaleString()} tokens`}
                  </span>
                </div>

                {maxContextTokens && (
                  <div style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'rgba(30, 41, 59, 0.8)', overflow: 'hidden', border: '1px solid var(--border-color)', position: 'relative' }}>
                    <div
                      style={{
                        width: `${pctUsed}%`,
                        height: '100%',
                        background: pctUsed > 85 ? '#ef4444' : pctUsed > 65 ? '#f59e0b' : 'var(--accent-gradient)',
                        transition: 'width 0.3s ease',
                        borderRadius: '4px',
                      }}
                    />
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                  <span>Used: <strong style={{ color: '#fff' }}>~{tokensUsed.toLocaleString()}</strong> {maxContextTokens ? `(${pctUsed}%)` : ''}</span>
                  {maxContextTokens ? (
                    <span>Remaining: <strong style={{ color: pctRemaining < 15 ? '#ef4444' : '#4ade80' }}>{tokensLeft.toLocaleString()}</strong> ({pctRemaining}%)</span>
                  ) : (
                    <span>Messages: <strong style={{ color: '#fff' }}>{contextInfo.totalMessages}</strong></span>
                  )}
                </div>

                {onCompactContext && (
                  <button
                    onClick={onCompactContext}
                    disabled={isCompacting}
                    title="Summarize and compact conversation history to save context space (/compact)"
                    style={{
                      marginTop: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '5px 10px',
                      borderRadius: '6px',
                      border: '1px solid rgba(99, 102, 241, 0.4)',
                      background: isCompacting ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.15)',
                      color: 'var(--accent-primary)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: isCompacting ? 'wait' : 'pointer',
                      opacity: isCompacting ? 0.8 : 1,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isCompacting ? (
                      <>
                        <Loader2 size={13} className="spin" />
                        <span>Compacting Context with Ollama...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={13} />
                        <span>Compact Context (`/compact`)</span>
                      </>
                    )}
                  </button>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Live Stats Overview Badges */}
      {contextInfo && (
        <div style={{ padding: '10px 20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', background: 'rgba(15, 23, 42, 0.4)', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)', padding: '6px 8px', borderRadius: '6px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.675rem', color: 'var(--accent-primary)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>Tokens</span>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>~{contextInfo.estimatedTokens.toLocaleString()}</span>
          </div>
          <div style={{ background: 'rgba(20, 184, 166, 0.1)', border: '1px solid rgba(20, 184, 166, 0.2)', padding: '6px 8px', borderRadius: '6px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.675rem', color: 'var(--accent-teal)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>Chars</span>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>{contextInfo.charCount.toLocaleString()}</span>
          </div>
          <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '6px 8px', borderRadius: '6px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.675rem', color: 'var(--accent-amber)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>Messages</span>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>{contextInfo.totalMessages}</span>
          </div>
        </div>
      )}

      {/* Tabs & Action Bar */}
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', background: 'rgba(15, 23, 42, 0.6)' }}>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveTab('formatted')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 8px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.75rem',
              fontWeight: 500,
              cursor: 'pointer',
              background: activeTab === 'formatted' ? 'var(--accent-primary)' : 'transparent',
              color: activeTab === 'formatted' ? '#fff' : 'var(--text-muted)',
            }}
          >
            <AlignLeft size={13} />
            <span>Text</span>
          </button>
          <button
            onClick={() => setActiveTab('json')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 8px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.75rem',
              fontWeight: 500,
              cursor: 'pointer',
              background: activeTab === 'json' ? 'var(--accent-primary)' : 'transparent',
              color: activeTab === 'json' ? '#fff' : 'var(--text-muted)',
            }}
          >
            <FileJson size={13} />
            <span>JSON</span>
          </button>
          <button
            onClick={() => setActiveTab('workdir')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 8px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.75rem',
              fontWeight: 500,
              cursor: 'pointer',
              background: activeTab === 'workdir' ? 'var(--accent-primary)' : 'transparent',
              color: activeTab === 'workdir' ? '#fff' : 'var(--text-muted)',
            }}
          >
            <FolderTree size={13} />
            <span>Workdir</span>
          </button>
          <button
            onClick={() => setActiveTab('pruning')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 8px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.75rem',
              fontWeight: 500,
              cursor: 'pointer',
              background: activeTab === 'pruning' ? 'var(--accent-primary)' : 'transparent',
              color: activeTab === 'pruning' ? '#fff' : 'var(--text-muted)',
            }}
          >
            <Scissors size={13} />
            <span>Pruning</span>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 8px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.75rem',
              fontWeight: 500,
              cursor: 'pointer',
              background: activeTab === 'settings' ? 'var(--accent-primary)' : 'transparent',
              color: activeTab === 'settings' ? '#fff' : 'var(--text-muted)',
            }}
          >
            <Settings size={13} />
            <span>Settings</span>
          </button>
          <button
            onClick={() => setActiveTab('skills')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 8px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.75rem',
              fontWeight: 500,
              cursor: 'pointer',
              background: activeTab === 'skills' ? 'var(--accent-primary)' : 'transparent',
              color: activeTab === 'skills' ? '#fff' : 'var(--text-muted)',
            }}
          >
            <BookOpen size={13} />
            <span>Skills</span>
          </button>
        </div>

        <div style={{ display: 'flex', gap: '4px' }}>
          {activeTab === 'workdir' && (
            <button
              onClick={loadWorkdirContext}
              disabled={workdirLoading}
              title="Refresh working directory snapshot"
              style={{ display: 'flex', alignItems: 'center', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer' }}
            >
              <RefreshCw size={14} className={workdirLoading ? 'spin' : undefined} />
            </button>
          )}
          {activeTab !== 'pruning' && activeTab !== 'settings' && (
            <button
              onClick={handleCopy}
              title="Copy to clipboard"
              disabled={activeTab === 'workdir' && !workdirContext}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-muted)',
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              {copied ? <Check size={14} color="var(--accent-teal)" /> : <Copy size={14} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Code / Text Inspector / Pruning Config / Settings View */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', background: 'rgba(10, 15, 28, 0.95)' }}>
        {activeTab === 'settings' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* System Prompt */}
            <div style={{ padding: '14px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid var(--border-color)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <SlidersHorizontal size={15} color="var(--accent-amber)" />
                <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.85rem' }}>System Prompt &amp; Core Rules</span>
              </div>
              <p style={{ fontSize: '0.725rem', color: 'var(--text-muted)', margin: 0 }}>Define the agent's base behaviour, personality, and constraints.</p>
              <button
                onClick={onOpenSystemPrompt}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '7px 12px',
                  borderRadius: '6px',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  background: 'rgba(245, 158, 11, 0.12)',
                  color: 'var(--accent-amber)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <SlidersHorizontal size={14} />
                <span>Edit System Prompt</span>
              </button>
            </div>

            {/* Working Directory */}
            <div style={{ padding: '14px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid var(--border-color)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FolderOpen size={15} color="var(--accent-teal)" />
                <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.85rem' }}>Active Working Directory</span>
              </div>
              <button
                onClick={onOpenWorkingDirPicker}
                title="Click to change working directory"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  fontFamily: 'var(--font-code)',
                }}
              >
                <FolderOpen size={14} color="var(--accent-teal)" style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {config?.workingDir || 'Not set'}
                </span>
              </button>
              {onToggleWorkingDirInfo && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.76rem', color: 'var(--text-muted)', cursor: 'pointer', paddingTop: '4px', borderTop: '1px dashed var(--border-color)' }}>
                  <input
                    type="checkbox"
                    checked={config?.showWorkingDirInfo ?? false}
                    onChange={(e) => onToggleWorkingDirInfo(e.target.checked)}
                    style={{ accentColor: 'var(--accent-teal)' }}
                  />
                  <span>Include workspace &amp; skills context</span>
                </label>
              )}
            </div>
          </div>
        ) : activeTab === 'pruning' ? (
          pruningLoading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading pruning settings…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: '8px' }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.85rem' }}>Enable Context Pruning</div>
                  <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>Master switch for context management & stale output removal</div>
                </div>
                <input
                  type="checkbox"
                  checked={pruningConfig?.enabled ?? true}
                  onChange={(e) => handleUpdatePruning({ enabled: e.target.checked })}
                  style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                />
              </div>

              <div style={{ opacity: pruningConfig?.enabled ? 1 : 0.5, pointerEvents: pruningConfig?.enabled ? 'auto' : 'none', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Strategy 1 */}
                <div style={{ padding: '12px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.825rem' }}>Superseded File Read Pruning</span>
                    <input
                      type="checkbox"
                      checked={pruningConfig?.pruneSupersededReads ?? true}
                      onChange={(e) => handleUpdatePruning({ pruneSupersededReads: e.target.checked })}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                  </div>
                  <p style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '4px', margin: 0 }}>
                    Replaces older read_file tool outputs for a path when a newer read for the same file occurs.
                  </p>
                </div>

                {/* Strategy 2 */}
                <div style={{ padding: '12px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.825rem' }}>Post-Mutation Invalidation</span>
                    <input
                      type="checkbox"
                      checked={pruningConfig?.invalidateOnMutation ?? true}
                      onChange={(e) => handleUpdatePruning({ invalidateOnMutation: e.target.checked })}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                  </div>
                  <p style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '4px', margin: 0 }}>
                    Invalidates prior read_file outputs when a file is edited, replaced, or created.
                  </p>
                </div>

                {/* Strategy 3 */}
                <div style={{ padding: '12px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid var(--border-color)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.825rem' }}>Tool Output TTL Expiration</span>
                    <input
                      type="checkbox"
                      checked={pruningConfig?.enableToolTTL ?? false}
                      onChange={(e) => handleUpdatePruning({ enableToolTTL: e.target.checked })}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                  </div>
                  <p style={{ fontSize: '0.725rem', color: 'var(--text-muted)', margin: 0 }}>
                    Expires raw execution logs and search results after a set number of user turns.
                  </p>

                  {pruningConfig?.enableToolTTL && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '6px' }}>
                      <div>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Terminal Log TTL (turns)</label>
                        <input
                          type="number"
                          min="1"
                          max="50"
                          value={pruningConfig.terminalOutputTTLTurns ?? 5}
                          onChange={(e) => handleUpdatePruning({ terminalOutputTTLTurns: parseInt(e.target.value, 10) || 5 })}
                          style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#fff', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Web Search TTL (turns)</label>
                        <input
                          type="number"
                          min="1"
                          max="50"
                          value={pruningConfig.webOutputTTLTurns ?? 5}
                          onChange={(e) => {
                            const value = Number.parseInt(e.target.value, 10);
                            handleUpdatePruning({ webOutputTTLTurns: Number.isNaN(value) ? 5 : Math.max(0, value) });
                          }}
                          style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#fff', fontSize: '0.8rem' }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Strategy 4 */}
                <div style={{ padding: '12px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid var(--border-color)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.825rem' }}>Auto-Compaction & State Summarization</span>
                    <input
                      type="checkbox"
                      checked={pruningConfig?.enableAutoCompaction ?? true}
                      onChange={(e) => handleUpdatePruning({ enableAutoCompaction: e.target.checked })}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                  </div>
                  <p style={{ fontSize: '0.725rem', color: 'var(--text-muted)', margin: 0 }}>
                    Automatically distills conversation history into a structured state package before context overflows while preserving recent turns.
                  </p>

                  {(pruningConfig?.enableAutoCompaction ?? true) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '6px' }}>
                      <div>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Auto-Compact Threshold</label>
                        <select
                          value={pruningConfig?.autoCompactThresholdRatio ?? 0.85}
                          onChange={(e) => handleUpdatePruning({ autoCompactThresholdRatio: parseFloat(e.target.value) })}
                          style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#fff', fontSize: '0.8rem' }}
                        >
                          <option value={0.75}>75% of context</option>
                          <option value={0.80}>80% of context</option>
                          <option value={0.85}>85% of context</option>
                          <option value={0.90}>90% of context</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Retain Recent Turns</label>
                        <input
                          type="number"
                          min="0"
                          max="10"
                          value={pruningConfig?.keepRecentTurnsOnCompact ?? 2}
                          onChange={(e) => handleUpdatePruning({ keepRecentTurnsOnCompact: parseInt(e.target.value, 10) || 0 })}
                          style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)', color: '#fff', fontSize: '0.8rem' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        ) : activeTab === 'skills' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <BookOpen size={16} color="var(--accent-primary)" />
                  Active Skills
                </div>
                <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '2px' }}>Skills loaded from workspace and bundled sources</div>
              </div>
              {skillsLoading && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Loading…</span>
              )}
            </div>
            {skillsError ? (
              <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.8rem' }}>
                {skillsError}
              </div>
            ) : skills.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                No workspace or bundled skills found.<br />
                <span style={{ fontSize: '0.75rem' }}>Create a <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 5px', borderRadius: '4px' }}>.agent/skills/&lt;name&gt;/SKILL.md</code> to add one.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {skills.map((skill, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleExpandSkill(skill.name)}
                    style={{
                      padding: '12px 14px',
                      background: expandedSkillName === skill.name ? 'rgba(99, 102, 241, 0.15)' : 'rgba(30, 41, 59, 0.5)',
                      border: `1px solid ${expandedSkillName === skill.name ? 'rgba(99, 102, 241, 0.5)' : 'var(--border-color)'}`,
                      borderRadius: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600, color: '#fff', fontSize: '0.825rem' }}>@skill:{skill.name}</span>
                      <span style={{
                        fontSize: '0.65rem',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: skill.path.startsWith('bundled:') ? 'rgba(139, 92, 246, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                        color: skill.path.startsWith('bundled:') ? '#a78bfa' : '#4ade80',
                        border: `1px solid ${skill.path.startsWith('bundled:') ? 'rgba(139, 92, 246, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
                      }}>
                        {skill.path.startsWith('bundled:') ? 'Bundled' : 'Workspace'}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                      {skill.description}
                    </p>
                    <div style={{ fontSize: '0.675rem', color: 'var(--text-dim)', fontFamily: 'monospace' }}>
                      Source: {skill.path}
                    </div>
                    {expandedSkillName === skill.name && (
                      <div style={{ marginTop: '4px', borderTop: '1px solid rgba(99, 102, 241, 0.3)', paddingTop: '8px' }}>
                        {expandedSkillLoading ? (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Loading instructions…</div>
                        ) : expandedSkillContent ? (
                          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.725rem', color: '#cbd5e1', lineHeight: 1.5, background: 'rgba(15, 23, 42, 0.6)', padding: '8px 10px', borderRadius: '6px', margin: 0, maxHeight: '300px', overflow: 'auto' }}>
                            {expandedSkillContent}
                          </pre>
                        ) : (
                          <div style={{ fontSize: '0.75rem', color: '#fca5a5' }}>Failed to load instructions.</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : !contextInfo && activeTab !== 'workdir' ? (
          <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>No context loaded.</div>
        ) : activeTab === 'formatted' ? (
          <pre
            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.5, background: 'transparent', border: 'none', padding: 0 }}
            dangerouslySetInnerHTML={{ __html: highlightedFormattedText }}
          />
        ) : activeTab === 'json' ? (
          <pre
            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.5, background: 'transparent', border: 'none', padding: 0 }}
            dangerouslySetInnerHTML={{ __html: highlightedRawJson }}
          />
        ) : workdirLoading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Building current workdir snapshot…</div>
        ) : workdirError ? (
          <div style={{ color: '#f87171', fontSize: '0.85rem' }}>{workdirError}</div>
        ) : !workdirEnabled ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.5 }}>
            Working-directory context is disabled. Enable the <strong>Context</strong> checkbox beside the working directory to append it to model requests.
          </div>
        ) : (
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.5, background: 'transparent', border: 'none', padding: 0 }}>
            {workdirContext}
          </pre>
        )}
      </div>
    </aside>
  );
};
