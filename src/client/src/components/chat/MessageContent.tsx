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
  const thinkingContainerRef = useRef<HTMLDivElement>(null);
  const isAutoScrollRef = useRef(true);
  const lastScrollTopRef = useRef(0);
  const estimatedTokens = thinkingTokens || Math.ceil(thinking.length / 4);

  useEffect(() => {
    if (isStreaming) {
      setIsExpanded(true);
    }
  }, [isStreaming]);

  const handleScroll = () => {
    const el = thinkingContainerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    const isScrollingUp = scrollTop < lastScrollTopRef.current - 2;
    lastScrollTopRef.current = scrollTop;

    if (isScrollingUp) {
      isAutoScrollRef.current = false;
    } else if (distanceToBottom <= 20) {
      isAutoScrollRef.current = true;
    }
  };

  useEffect(() => {
    if (isStreaming && isExpanded && isAutoScrollRef.current && thinkingContainerRef.current) {
      thinkingContainerRef.current.scrollTop = thinkingContainerRef.current.scrollHeight;
    }
  }, [thinking, isStreaming, isExpanded]);

  return (
    <div
      className="thinking-block"
      style={{
        borderRadius: '6px',
        border: '1px solid rgba(168, 85, 247, 0.2)',
        background: 'rgba(147, 51, 234, 0.05)',
        overflow: 'hidden',
        transition: 'all 0.15s ease',
      }}
    >
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="thinking-block-header"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'nowrap',
          gap: '6px',
          padding: '3px 8px',
          height: '24px',
          background: 'rgba(147, 51, 234, 0.08)',
          border: 'none',
          color: '#c084fc',
          fontSize: '0.72rem',
          fontWeight: 600,
          cursor: 'pointer',
          textAlign: 'left',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          <Brain size={13} color="#c084fc" style={{ flexShrink: 0 }} />
          <span style={{ whiteSpace: 'nowrap' }}>{isStreaming ? 'Thinking...' : 'Thinking'}</span>
          <span
            className="thinking-tokens-label"
            style={{
              fontSize: '0.675rem',
              fontWeight: 500,
              color: 'rgba(216, 180, 254, 0.8)',
              background: 'rgba(168, 85, 247, 0.15)',
              padding: '1px 5px',
              borderRadius: '4px',
              fontFamily: 'var(--font-code)',
              whiteSpace: 'nowrap',
            }}
          >
            {estimatedTokens} tok
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', color: 'rgba(192, 132, 252, 0.7)', fontSize: '0.7rem', marginLeft: 'auto', flexShrink: 0 }}>
          {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </div>
      </button>

      {isExpanded && (
        <div
          ref={thinkingContainerRef}
          onScroll={handleScroll}
          style={{
            padding: '10px 14px',
            borderTop: '1px solid rgba(168, 85, 247, 0.25)',
            fontSize: '0.825rem',
            lineHeight: 1.55,
            color: '#f1f5f9',
            background: 'rgba(15, 10, 25, 0.4)',
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
  const [isExpanded, setIsExpanded] = useState(false);
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
    <button
      type="button"
      onClick={() => setIsExpanded((prev) => !prev)}
      title={
        [
          evalTokPerSec ? `Generation Speed: ${evalTokPerSec} tok/s` : null,
          metrics.evalCount !== undefined ? `Generated: ${metrics.evalCount} tokens` : null,
          metrics.promptEvalCount !== undefined ? `Prompt Context: ${metrics.promptEvalCount} tokens${promptTokPerSec ? ` (${promptTokPerSec} tok/s)` : ''}` : null,
          totalDurationSec ? `Total Duration: ${totalDurationSec}s` : null,
          "Click to toggle detailed breakdown",
        ]
          .filter(Boolean)
          .join('\n')
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        height: '24px',
        padding: '3px 8px',
        borderRadius: '6px',
        background: isExpanded ? 'rgba(56, 189, 248, 0.15)' : 'rgba(22, 27, 34, 0.7)',
        border: `1px solid ${isExpanded ? 'rgba(56, 189, 248, 0.4)' : 'var(--border-color, #30363d)'}`,
        fontSize: '0.7rem',
        color: isExpanded ? '#38bdf8' : 'var(--text-muted)',
        fontFamily: 'var(--font-code, monospace)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        transition: 'all 0.15s ease',
      }}
    >
      <Zap size={11} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
      {!isExpanded ? (
        <span style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>
          ⚡ {evalTokPerSec ? `${evalTokPerSec} tok/s` : (totalDurationSec ? `${totalDurationSec}s` : 'Metrics')}
        </span>
      ) : (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          {evalTokPerSec && (
            <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>⚡ {evalTokPerSec} tok/s</span>
          )}
          {metrics.evalCount !== undefined && <span>· {metrics.evalCount} gen</span>}
          {metrics.promptEvalCount !== undefined && (
            <span>· {metrics.promptEvalCount} prompt</span>
          )}
          {totalDurationSec && <span>· {totalDurationSec}s</span>}
        </span>
      )}
    </button>
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
  const hasControls = Boolean(metrics || content);

  return (
    <div className="glass-panel assistant-response" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px 12px', borderRadius: '14px 14px 14px 4px', fontSize: '0.965rem', lineHeight: 1.6, position: 'relative' }}>
      {/* Header controls: Metrics & Raw button floated right */}
      {hasControls && (
        <div
          style={{
            float: 'right',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginLeft: '12px',
            marginBottom: '4px',
            zIndex: 2,
            position: 'relative',
          }}
        >
          {metrics && <MetricBadge metrics={metrics} />}
          {content && (
            <button
              type="button"
              onClick={() => setShowRaw((current) => !current)}
              title={showRaw ? 'Show rendered Markdown' : 'Show raw response'}
              aria-label={showRaw ? 'Show rendered Markdown' : 'Show raw response'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                height: '24px',
                borderRadius: '6px',
                border: '1px solid var(--border-color, #30363d)',
                background: 'rgba(22, 27, 34, 0.7)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.7rem',
                fontFamily: 'var(--font-code, monospace)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {showRaw ? <Eye size={12} /> : <Code2 size={12} />}
              <span>{showRaw ? 'Rendered' : 'Raw'}</span>
            </button>
          )}
        </div>
      )}

      {thinking && (
        <div style={{ marginBottom: content ? '8px' : '0px', overflow: 'hidden' }}>
          <ThinkingBlock thinking={thinking} thinkingTokens={thinkingTokens} />
        </div>
      )}

      {isMaxLoops && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', color: 'var(--accent-amber)', fontSize: '0.825rem', fontWeight: 600, marginBottom: '10px', clear: 'both' }}>
          <ShieldAlert size={16} style={{ flexShrink: 0 }} />
          <span>Max Tool Call Iterations Limit Reached</span>
        </div>
      )}

      {content && (
        <div style={{ minWidth: 0 }}>
          {showRaw ? (
            <pre className="assistant-response-raw">{content}</pre>
          ) : (
            <MarkdownContent content={content} />
          )}
        </div>
      )}
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
