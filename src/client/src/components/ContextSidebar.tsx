import React, { useState, useMemo } from 'react';
import { X, Copy, Check, FileJson, AlignLeft, Layers } from 'lucide-react';
import { ContextInfo } from '../types';

interface ContextSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  contextInfo: ContextInfo | null;
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
}) => {
  const [activeTab, setActiveTab] = useState<'formatted' | 'json'>('formatted');
  const [copied, setCopied] = useState(false);

  const highlightedFormattedText = useMemo(() => {
    return contextInfo ? colorizeConvertedText(contextInfo.formattedText) : '';
  }, [contextInfo?.formattedText]);

  const highlightedRawJson = useMemo(() => {
    return contextInfo ? colorizeJson(contextInfo.rawJson) : '';
  }, [contextInfo?.rawJson]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!contextInfo) return;
    const textToCopy = activeTab === 'formatted' ? contextInfo.formattedText : contextInfo.rawJson;
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

      {/* Live Stats Overview Badges */}
      {contextInfo && (
        <div style={{ padding: '12px 20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', background: 'rgba(15, 23, 42, 0.4)', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>Tokens</span>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>~{contextInfo.estimatedTokens.toLocaleString()}</span>
          </div>
          <div style={{ background: 'rgba(20, 184, 166, 0.1)', border: '1px solid rgba(20, 184, 166, 0.2)', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--accent-teal)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>Chars</span>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>{contextInfo.charCount.toLocaleString()}</span>
          </div>
          <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--accent-amber)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>Messages</span>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>{contextInfo.totalMessages}</span>
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
        </div>

        <button
          onClick={handleCopy}
          title="Copy to clipboard"
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

      {/* Code / Text Inspector View */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', background: 'rgba(10, 15, 28, 0.95)' }}>
        {!contextInfo ? (
          <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>No context loaded.</div>
        ) : activeTab === 'formatted' ? (
          <pre
            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.5, background: 'transparent', border: 'none', padding: 0 }}
            dangerouslySetInnerHTML={{ __html: highlightedFormattedText }}
          />
        ) : (
          <pre
            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.5, background: 'transparent', border: 'none', padding: 0 }}
            dangerouslySetInnerHTML={{ __html: highlightedRawJson }}
          />
        )}
      </div>
    </aside>
  );
};
