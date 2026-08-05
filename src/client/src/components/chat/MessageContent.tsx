import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, X, ExternalLink, Globe, Brain, ChevronDown, ChevronRight, Zap, ShieldAlert, Code2, Eye } from 'lucide-react';
import { FileDiffData, OllamaResponseMetrics } from '../../types';
import { getLinkPresentation } from '../../linkPresentation';

export const CopyableCodeBlock: React.FC<{ code: string; language?: string }> = ({ code, language }) => {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
  }, []);

  const copyCode = async () => {
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
        copied = true;
      }
    } catch (_) {}

    if (!copied) {
      const textarea = document.createElement('textarea');
      textarea.value = code;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        copied = document.execCommand('copy');
      } catch (_) {}
      textarea.remove();
    }

    setCopyState(copied ? 'copied' : 'error');
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setCopyState('idle'), 1800);
  };

  return (
    <div className="copyable-code-block">
      <div className="copyable-code-header">
        <span>{language || 'Code'}</span>
        <button type="button" onClick={() => void copyCode()} aria-label="Copy code to clipboard">
          {copyState === 'copied' ? <Check size={14} /> : <Copy size={14} />}
          <span aria-live="polite">
            {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy'}
          </span>
        </button>
      </div>
      <pre><code className={language ? `language-${language}` : undefined}>{code}</code></pre>
    </div>
  );
};

const remarkImageBundles = () => (tree: any) => {
  const bundledVisuals = (node: any): any[] | null => {
    if (node?.type !== 'paragraph' || !Array.isArray(node.children)) return null;
    const visuals: any[] = [];
    for (const child of node.children) {
      const isWhitespace = child?.type === 'text' && !String(child.value || '').trim();
      const isBreak = child?.type === 'break' || (child?.type === 'html' && /^<br\s*\/?\s*>$/i.test(String(child.value || '').trim()));
      const isLinkedImage = child?.type === 'link' && child.children?.length === 1 && child.children[0]?.type === 'image';
      if (child?.type === 'image' || isLinkedImage) visuals.push(child);
      else if (!isWhitespace && !isBreak) return null;
    }
    return visuals.length > 0 ? visuals : null;
  };

  const visit = (node: any) => {
    if (!Array.isArray(node?.children)) return;
    node.children.forEach(visit);
    const children: any[] = [];
    for (let index = 0; index < node.children.length;) {
      const firstVisuals = bundledVisuals(node.children[index]);
      if (!firstVisuals) {
        children.push(node.children[index++]);
        continue;
      }

      const originals: any[] = [];
      const visuals: any[] = [];
      while (index < node.children.length) {
        const nextVisuals = bundledVisuals(node.children[index]);
        if (!nextVisuals) break;
        originals.push(node.children[index]);
        visuals.push(...nextVisuals);
        index++;
      }

      if (visuals.length < 2) {
        children.push(...originals);
      } else {
        children.push({
          type: 'paragraph',
          data: {
            hName: 'div',
            hProperties: { className: ['markdown-image-bundle'] },
          },
          children: visuals,
        });
      }
    }
    node.children = children;
  };

  visit(tree);
};

export const MarkdownContent: React.FC<{ content: string; streaming?: boolean }> = ({
  content,
  streaming = false,
}) => {
  const [viewedImage, setViewedImage] = useState<{ src: string; alt: string } | null>(null);

  useEffect(() => {
    if (!viewedImage) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setViewedImage(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [viewedImage]);

  return (
    <>
      <div className={`markdown-body${streaming ? ' markdown-body-streaming' : ''}`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkImageBundles]}
          components={{
            a: ({ children, href, node, className, title, ...props }) => {
              const containsImage = node?.children?.some((child) => child.type === 'element' && child.tagName === 'img');
              const presentation = getLinkPresentation(href);
              if (containsImage) {
                return <a {...props} href={href} className={className} title={title} target="_blank" rel="noreferrer">{children}</a>;
              }
              return (
                <a
                  {...props}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className={[className, presentation ? 'markdown-pretty-link' : ''].filter(Boolean).join(' ') || undefined}
                  title={title || presentation?.domain}
                >
                  {presentation && (
                    <span className="markdown-link-icon" aria-hidden="true">
                      <Globe className="markdown-link-icon-fallback" size={12} />
                      <img
                        src={presentation.faviconUrl}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(event) => { event.currentTarget.style.display = 'none'; }}
                      />
                    </span>
                  )}
                  <span>{children}</span>
                </a>
              );
            },
            img: ({ src, alt, title }) => {
              const imageUrl = typeof src === 'string' ? src : '';
              const imageAlt = alt || 'Chat response image';
              return (
                <img
                  className="markdown-chat-image"
                  src={imageUrl}
                  alt={imageAlt}
                  title={title || 'View larger image'}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (imageUrl) setViewedImage({ src: imageUrl, alt: imageAlt });
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    event.stopPropagation();
                    if (imageUrl) setViewedImage({ src: imageUrl, alt: imageAlt });
                  }}
                />
              );
            },
            pre: ({ children }) => {
              const child = React.Children.toArray(children).find(React.isValidElement);
              if (!React.isValidElement(child)) return <pre>{children}</pre>;
              const props = child.props as { children?: React.ReactNode; className?: string };
              const code = String(props.children ?? '').replace(/\n$/, '');
              const language = props.className?.match(/(?:^|\s)language-([^\s]+)/)?.[1];
              return <CopyableCodeBlock code={code} language={language} />;
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
      {viewedImage && createPortal(
        <div
          className="markdown-image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Larger image preview"
          onClick={() => setViewedImage(null)}
        >
          <div className="markdown-image-lightbox-content" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="markdown-image-lightbox-close"
              onClick={() => setViewedImage(null)}
              aria-label="Close image preview"
              title="Close"
            >
              <X size={20} />
            </button>
            <img src={viewedImage.src} alt={viewedImage.alt} referrerPolicy="no-referrer" />
            <div className="markdown-image-lightbox-footer">
              <span>{viewedImage.alt}</span>
              <a href={viewedImage.src} target="_blank" rel="noreferrer">
                Open original <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

export const ThinkingBlock: React.FC<{ thinking: string; thinkingTokens?: number; isStreaming?: boolean }> = ({
  thinking,
  thinkingTokens,
  isStreaming = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(isStreaming);
  const estimatedTokens = thinkingTokens || Math.ceil(thinking.length / 4);

  return (
    <div
      style={{
        marginBottom: '10px',
        borderRadius: '10px',
        border: '1px solid rgba(168, 85, 247, 0.25)',
        background: 'rgba(147, 51, 234, 0.06)',
        overflow: 'hidden',
        transition: 'all 0.2s ease',
      }}
    >
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: 'rgba(147, 51, 234, 0.1)',
          border: 'none',
          color: '#c084fc',
          fontSize: '0.8rem',
          fontWeight: 600,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Brain size={15} color="#c084fc" />
          <span>{isStreaming ? 'Thinking...' : 'Thinking'}</span>
          <span
            style={{
              fontSize: '0.725rem',
              fontWeight: 500,
              color: 'rgba(216, 180, 254, 0.85)',
              background: 'rgba(168, 85, 247, 0.2)',
              padding: '1px 6px',
              borderRadius: '6px',
              fontFamily: 'var(--font-code)',
            }}
          >
            {estimatedTokens} thinking tokens
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-dim)', fontSize: '0.75rem' }}>
          <span>{isExpanded ? 'Hide' : 'Show'}</span>
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </button>

      {isExpanded && (
        <div
          style={{
            padding: '10px 14px',
            borderTop: '1px solid rgba(168, 85, 247, 0.15)',
            fontSize: '0.825rem',
            lineHeight: 1.55,
            color: '#cbd5e1',
            fontFamily: 'var(--font-code)',
            whiteSpace: 'pre-wrap',
            maxHeight: '350px',
            overflowY: 'auto',
          }}
        >
          {thinking}
        </div>
      )}
    </div>
  );
};

export const MetricBadge: React.FC<{ metrics?: OllamaResponseMetrics }> = ({ metrics }) => {
  if (!metrics || (!metrics.evalCount && !metrics.promptEvalCount)) return null;

  const evalTokPerSec = metrics.evalCount && metrics.evalDurationNs && metrics.evalDurationNs > 0
    ? (metrics.evalCount / (metrics.evalDurationNs / 1e9)).toFixed(1)
    : null;

  const promptTokPerSec = metrics.promptEvalCount && metrics.promptEvalDurationNs && metrics.promptEvalDurationNs > 0
    ? (metrics.promptEvalCount / (metrics.promptEvalDurationNs / 1e9)).toFixed(1)
    : null;

  const totalDurationSec = metrics.totalDurationNs
    ? (metrics.totalDurationNs / 1e9).toFixed(1)
    : null;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        marginTop: '10px',
        padding: '3px 8px',
        borderRadius: '6px',
        background: 'rgba(15, 23, 42, 0.45)',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        fontSize: '0.72rem',
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-code, monospace)',
      }}
      title={
        [
          evalTokPerSec ? `Generation Speed: ${evalTokPerSec} tok/s` : null,
          metrics.evalCount !== undefined ? `Generated: ${metrics.evalCount} tokens` : null,
          metrics.promptEvalCount !== undefined ? `Prompt: ${metrics.promptEvalCount} tokens${promptTokPerSec ? ` (${promptTokPerSec} tok/s)` : ''}` : null,
          totalDurationSec ? `Total Duration: ${totalDurationSec}s` : null,
        ]
          .filter(Boolean)
          .join('\n')
      }
    >
      <Zap size={12} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
      {evalTokPerSec && (
        <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
          ⚡ {evalTokPerSec} tok/s
        </span>
      )}
      {metrics.evalCount !== undefined && (
        <span>· {metrics.evalCount} gen tokens</span>
      )}
      {metrics.promptEvalCount !== undefined && (
        <span>· {metrics.promptEvalCount} prompt tokens</span>
      )}
      {totalDurationSec && (
        <span>· {totalDurationSec}s</span>
      )}
    </div>
  );
};

export const AssistantResponse: React.FC<{ content: string; thinking?: string; thinkingTokens?: number; metrics?: OllamaResponseMetrics }> = ({
  content,
  thinking,
  thinkingTokens,
  metrics,
}) => {
  const [showRaw, setShowRaw] = useState(false);
  const isMaxLoops = content?.includes('Max tool call iterations limit reached');

  return (
    <div className="glass-panel assistant-response" style={{ padding: '12px 18px 16px', borderRadius: '16px 16px 16px 4px', fontSize: '0.925rem', lineHeight: 1.6 }}>
      {thinking && (
        <ThinkingBlock thinking={thinking} thinkingTokens={thinkingTokens} />
      )}
      {isMaxLoops && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', color: 'var(--accent-amber)', fontSize: '0.825rem', fontWeight: 600, marginBottom: '10px' }}>
          <ShieldAlert size={16} style={{ flexShrink: 0 }} />
          <span>Max Tool Call Iterations Limit Reached</span>
        </div>
      )}
      {content && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '6px' }}>
            <button
              type="button"
              onClick={() => setShowRaw((current) => !current)}
              title={showRaw ? 'Show rendered Markdown' : 'Show raw response'}
              aria-label={showRaw ? 'Show rendered Markdown' : 'Show raw response'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: 'rgba(15, 23, 42, 0.45)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.72rem',
              }}
            >
              {showRaw ? <Eye size={13} /> : <Code2 size={13} />}
              {showRaw ? 'Rendered' : 'Raw'}
            </button>
          </div>
          {showRaw ? (
            <pre className="assistant-response-raw">{content}</pre>
          ) : (
            <MarkdownContent content={content} />
          )}
        </>
      )}
      <MetricBadge metrics={metrics} />
    </div>
  );
};

export const FileDiff: React.FC<{ diff: FileDiffData }> = ({ diff }) => (
  <div style={{ marginTop: '10px', border: '1px solid rgba(148, 163, 184, 0.25)', borderRadius: '8px', overflow: 'hidden', background: '#0b1220' }}>
    <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(148, 163, 184, 0.2)', color: '#cbd5e1', fontFamily: 'var(--font-code)', fontSize: '0.775rem' }}>
      <div style={{ color: '#f87171' }}>--- {diff.oldPath}</div>
      <div style={{ color: '#4ade80' }}>+++ {diff.newPath}</div>
    </div>
    <div style={{ maxHeight: '360px', overflow: 'auto', fontFamily: 'var(--font-code)', fontSize: '0.775rem', lineHeight: 1.55 }}>
      {diff.lines.map((line: any, index: number) => {
        const isAdd = line.type === 'add';
        const isRemove = line.type === 'remove';
        const isMeta = line.type === 'meta';
        const background = isAdd
          ? 'rgba(34, 197, 94, 0.16)'
          : isRemove
            ? 'rgba(239, 68, 68, 0.16)'
            : isMeta
              ? 'rgba(59, 130, 246, 0.12)'
              : 'transparent';
        const color = isAdd ? '#bbf7d0' : isRemove ? '#fecaca' : isMeta ? '#93c5fd' : '#cbd5e1';
        const marker = isAdd ? '+' : isRemove ? '-' : isMeta ? '…' : ' ';

        return (
          <div key={index} style={{ display: 'grid', gridTemplateColumns: '48px 48px 20px minmax(max-content, 1fr)', minWidth: '100%', width: 'max-content', background, color }}>
            <span style={{ padding: '0 8px', textAlign: 'right', color: '#64748b', userSelect: 'none' }}>{line.oldLine ?? ''}</span>
            <span style={{ padding: '0 8px', textAlign: 'right', color: '#64748b', userSelect: 'none' }}>{line.newLine ?? ''}</span>
            <span style={{ textAlign: 'center', userSelect: 'none' }}>{marker}</span>
            <span style={{ paddingRight: '12px', whiteSpace: 'pre' }}>{line.content || ' '}</span>
          </div>
        );
      })}
    </div>
  </div>
);
