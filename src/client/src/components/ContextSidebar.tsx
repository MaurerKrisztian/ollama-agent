import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { X, Copy, Check, FileJson, AlignLeft, Layers, FolderTree, RefreshCw, Cpu, Sparkles } from 'lucide-react';
import { ContextInfo } from '../types';

interface ContextSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  contextInfo: ContextInfo | null;
  activeModel?: string;
  onCompactContext?: () => void;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function colorizeJson(jsonStr: string): string {
  if (!jsonStr) return '';
  const escaped = escapeHtml(jsonStr);
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
        } else {
          cls = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return `<span class="${cls}">${match}</span>`;
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
}) => {
  const [activeTab, setActiveTab] = useState<'formatted' | 'json' | 'workdir'>('formatted');
  const [copied, setCopied] = useState(false);
  const [workdirContext, setWorkdirContext] = useState('');
  const [workdirEnabled, setWorkdirEnabled] = useState(false);
  const [workdirLoading, setWorkdirLoading] = useState(false);
  const [workdirError, setWorkdirError] = useState('');
  const [maxContextTokens, setMaxContextTokens] = useState<number | null>(null);

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
      className="glass-panel animate-fade-in"
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
                      background: 'rgba(99, 102, 241, 0.15)',
                      color: 'var(--accent-primary)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Sparkles size={13} />
                    <span>Compact Context (`/compact`)</span>
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
      <div style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', background: 'rgba(15, 23, 42, 0.6)' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => setActiveTab('formatted')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: 'pointer',
              background: activeTab === 'formatted' ? 'var(--accent-primary)' : 'transparent',
              color: activeTab === 'formatted' ? '#fff' : 'var(--text-muted)',
            }}
          >
            <AlignLeft size={14} />
            <span>Converted Text</span>
          </button>
          <button
            onClick={() => setActiveTab('json')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: 'pointer',
              background: activeTab === 'json' ? 'var(--accent-primary)' : 'transparent',
              color: activeTab === 'json' ? '#fff' : 'var(--text-muted)',
            }}
          >
            <FileJson size={14} />
            <span>Raw JSON</span>
          </button>
          <button
            onClick={() => setActiveTab('workdir')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: 'pointer',
              background: activeTab === 'workdir' ? 'var(--accent-primary)' : 'transparent',
              color: activeTab === 'workdir' ? '#fff' : 'var(--text-muted)',
            }}
          >
            <FolderTree size={14} />
            <span>Workdir</span>
          </button>
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
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
        </div>
      </div>

      {/* Code / Text Inspector View */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', background: 'rgba(10, 15, 28, 0.95)' }}>
        {!contextInfo && activeTab !== 'workdir' ? (
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
