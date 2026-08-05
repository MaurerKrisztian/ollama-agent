import React, { useState, useEffect } from 'react';
import { Sparkles, ChevronDown, FileText, Search, Wrench, CheckCircle2, XCircle, Loader2, Scissors, Code2, Check, Copy, Square, RotateCcw, Eye } from 'lucide-react';
import { ChatMessage, FileDiffData, TextAttachment } from '../../types';
import { getToolResultSummary } from './chatUtils';
import { MarkdownContent, FileDiff } from './MessageContent';
import { WebSearchResultsView, WebPageReaderView, DeepResearchResultsView, DeepResearchProgress } from './ResearchViews';

export const CompactedContextCard: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const [expanded, setExpanded] = useState(true);
  const cleanSummary = message.content.replace(/^\[COMPACTED CONVERSATION SUMMARY\]\s*/i, '');

  return (
    <div className="animate-fade-in" style={{ margin: '12px auto', maxWidth: '90%', width: '100%' }}>
      <div
        style={{
          background: 'rgba(99, 102, 241, 0.08)',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 4px 15px rgba(99, 102, 241, 0.12)',
        }}
      >
        <button
          type="button"
          onClick={() => setExpanded((curr) => !curr)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            background: 'rgba(99, 102, 241, 0.15)',
            border: 0,
            color: 'var(--accent-primary)',
            cursor: 'pointer',
            textAlign: 'left',
            font: 'inherit',
          }}
        >
          <Sparkles size={16} style={{ flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>Context Compacted & Summarized</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px' }}>
            (Prior conversation history compressed to save tokens)
          </span>
          <ChevronDown
            size={16}
            style={{
              marginLeft: 'auto',
              flexShrink: 0,
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.15s ease',
            }}
          />
        </button>

        {expanded && (
          <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(99, 102, 241, 0.2)', fontSize: '0.85rem', lineHeight: 1.55 }}>
            <MarkdownContent content={cleanSummary} />
          </div>
        )}
      </div>
    </div>
  );
};

export const PrettierInvocationView: React.FC<{ name: string; args: Record<string, any> }> = ({ name, args }) => {
  const keys = Object.keys(args);
  if (keys.length === 0) {
    return <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>No arguments passed.</div>;
  }

  // Specialized Prettier Views for common tools
  if ((name === 'execute_command' || name === 'start_terminal_session') && args.command) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {args.session_id && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.775rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Session ID:</span>
            <span style={{ fontFamily: 'var(--font-code)', color: 'var(--accent-teal)', fontWeight: 600 }}>{args.session_id}</span>
          </div>
        )}
        <div style={{ background: '#090d16', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px', fontFamily: 'var(--font-code)', fontSize: '0.825rem', color: '#4ade80', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          <span style={{ color: 'var(--text-muted)', marginRight: '8px' }}>$</span>
          {args.command}
        </div>
      </div>
    );
  }

  if (name === 'edit_file') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {args.relative_path && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-code)' }}>
            <FileText size={14} color="var(--accent-teal)" />
            <span>{args.relative_path}</span>
            {args.start_line != null && (
              <span style={{ color: 'var(--accent-amber)', fontSize: '0.75rem', fontWeight: 600 }}>
                (Lines {String(args.start_line)}{args.end_line != null && String(args.end_line) !== String(args.start_line) ? `–${args.end_line}` : ''})
              </span>
            )}
          </div>
        )}
        {args.target_text !== undefined ? (
          <div>
            <div style={{ fontSize: '0.725rem', fontWeight: 600, color: '#f87171', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Target Text (To Replace):</div>
            <pre style={{ margin: 0, padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', fontFamily: 'var(--font-code)', fontSize: '0.775rem', color: '#fca5a5', whiteSpace: 'pre-wrap', maxHeight: '180px', overflowY: 'auto' }}>
              {args.target_text}
            </pre>
          </div>
        ) : (args.start_line != null ? (
          <div>
            <div style={{ fontSize: '0.725rem', fontWeight: 600, color: '#f87171', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Target Lines (To Replace):</div>
            <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', fontFamily: 'var(--font-code)', fontSize: '0.775rem', color: '#fca5a5', fontWeight: 600 }}>
              Lines {String(args.start_line)}{args.end_line != null && String(args.end_line) !== String(args.start_line) ? ` to ${args.end_line}` : ''}
            </div>
          </div>
        ) : null)}
        {args.replacement_text !== undefined && (
          <div>
            <div style={{ fontSize: '0.725rem', fontWeight: 600, color: '#4ade80', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Replacement Text:</div>
            <pre style={{ margin: 0, padding: '8px 12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '6px', fontFamily: 'var(--font-code)', fontSize: '0.775rem', color: '#86efac', whiteSpace: 'pre-wrap', maxHeight: '180px', overflowY: 'auto' }}>
              {args.replacement_text || '(Empty string — delete target text)'}
            </pre>
          </div>
        )}
      </div>
    );
  }

  if (name === 'create_file' || name === 'replace_file') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {args.relative_path && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-code)' }}>
            <FileText size={14} color="var(--accent-teal)" />
            <span>{args.relative_path}</span>
          </div>
        )}
        {args.content !== undefined && (
          <div>
            <div style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>File Content ({args.content.length} characters):</div>
            <pre style={{ margin: 0, padding: '10px 12px', background: '#090d16', border: '1px solid var(--border-color)', borderRadius: '6px', fontFamily: 'var(--font-code)', fontSize: '0.775rem', color: '#e2e8f0', whiteSpace: 'pre-wrap', maxHeight: '220px', overflowY: 'auto' }}>
              {args.content}
            </pre>
          </div>
        )}
      </div>
    );
  }

  if (name === 'grep_search') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
          <Search size={14} color="var(--accent-amber)" />
          <span style={{ color: 'var(--text-muted)' }}>Query:</span>
          <span style={{ fontFamily: 'var(--font-code)', color: '#fcd34d', fontWeight: 600, background: 'rgba(245, 158, 11, 0.15)', padding: '2px 8px', borderRadius: '4px' }}>
            "{args.query}"
          </span>
        </div>
        {args.relative_path && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.775rem', color: 'var(--text-muted)', fontFamily: 'var(--font-code)' }}>
            <span>Subdirectory: {args.relative_path}</span>
          </div>
        )}
      </div>
    );
  }

  // Generic key-value prettier grid for all other tools
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {Object.entries(args).map(([key, val]) => {
        const isMultiLine = typeof val === 'string' && val.includes('\n');
        return (
          <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.775rem' }}>
              <span style={{ fontWeight: 600, color: 'var(--accent-amber)', fontFamily: 'var(--font-code)' }}>{key}:</span>
              {!isMultiLine && typeof val !== 'object' && (
                <span style={{ fontFamily: 'var(--font-code)', color: '#fcd34d', background: 'rgba(30, 41, 59, 0.6)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.775rem', wordBreak: 'break-all' }}>
                  {String(val)}
                </span>
              )}
            </div>
            {(isMultiLine || typeof val === 'object') && (
              <pre style={{ margin: 0, padding: '8px 12px', background: '#090d16', border: '1px solid var(--border-color)', borderRadius: '6px', fontFamily: 'var(--font-code)', fontSize: '0.775rem', color: '#e2e8f0', whiteSpace: 'pre-wrap', maxHeight: '180px', overflowY: 'auto' }}>
                {typeof val === 'object' ? JSON.stringify(val, null, 2) : val}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const ToolExecutionCard: React.FC<{
  toolName: string;
  args: Record<string, any>;
  resultMessage?: ChatMessage;
  isWorking?: boolean;
  progress?: any;
  onOpenFile?: (file: TextAttachment) => void;
  isGenerating?: boolean;
  onRegenerateDeepResearch?: (toolMessageId: string) => void;
  onCancelGeneration?: () => void;
  defaultExpanded?: boolean;
  streamingMetrics?: { liveTokPerSec: number; tokenCount: number } | null;
}> = ({
  toolName,
  args,
  resultMessage,
  isWorking = false,
  progress,
  onOpenFile,
  isGenerating = false,
  onRegenerateDeepResearch,
  onCancelGeneration,
  defaultExpanded,
  streamingMetrics,
}) => {
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded ?? Boolean(args?._streaming));
  const [viewMode, setViewMode] = useState<'formatted' | 'raw_input' | 'raw_result'>('formatted');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (args?._streaming) {
      setExpanded(true);
    }
  }, [args?._streaming]);

  const fullResultContent = resultMessage?.displayContent || resultMessage?.content || '';
  const isPruned = typeof resultMessage?.content === 'string' && resultMessage.content.startsWith('[Context Pruned:');

  let parsedContent: any = null;
  if (resultMessage && !isPruned) {
    try {
      parsedContent = JSON.parse(fullResultContent);
    } catch (_) {}
  }

  const isFailed = !isPruned && !!(
    parsedContent?.error ||
    parsedContent?.failed ||
    parsedContent?.success === false ||
    (parsedContent?.exitCode !== undefined && parsedContent.exitCode !== 0)
  );

  const getToolSummary = () => {
    if (args.command) return `$ ${args.command}`;
    if (args.relative_path) return args.relative_path;
    if (args.query) return `"${args.query}"`;
    if (args.url) return args.url;
    if (args.session_id) return `session: ${args.session_id}`;
    return null;
  };

  const inputSummary = getToolSummary();
  const resultSummary = isPruned
    ? resultMessage?.content.replace(/^\[Context Pruned:\s*/, '').replace(/\]$/, '')
    : resultMessage
    ? getToolResultSummary(toolName, args, parsedContent)
    : null;

  const displaySummary = resultSummary || inputSummary;

  const readFilePath = toolName === 'read_file' && !isFailed && typeof parsedContent?.content === 'string'
    ? String(parsedContent.file_path || args.relative_path || '')
    : '';
  const readFileLineCount = readFilePath
    ? (parsedContent.content ? parsedContent.content.split('\n').length : 0)
    : 0;
  const readFileSize = typeof parsedContent?.size_bytes === 'number'
    ? parsedContent.size_bytes
    : new Blob([parsedContent?.content || '']).size;

  const openReadFile = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!readFilePath || !onOpenFile) return;
    onOpenFile({
      name: readFilePath,
      content: parsedContent.content,
      size: readFileSize,
      type: 'text/plain',
    });
  };

  const fileDiff = parsedContent?.diff as FileDiffData | undefined;
  const resultWithoutDiff = parsedContent && fileDiff
    ? Object.fromEntries(Object.entries(parsedContent).filter(([key]) => key !== 'diff'))
    : parsedContent;

  const isWebSearch = toolName === 'web_search' && parsedContent?.results;
  const isWebPageRead = toolName === 'read_web_page' && parsedContent?.markdown;
  const isDeepResearch = toolName === 'deep_research' && (parsedContent?.sources || isWorking);
  const synthesisTokenEstimate = resultMessage ? Math.ceil(resultMessage.content.length / 4) : 0;

  const sideDriftPages: any[] = isWebSearch
    ? Array.isArray(parsedContent?.most_relevant_pages)
      ? parsedContent.most_relevant_pages
      : parsedContent?.most_relevant_page
        ? [parsedContent.most_relevant_page]
        : []
    : [];

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const dataToCopy = viewMode === 'raw_result' && resultMessage
      ? fullResultContent
      : JSON.stringify(args, null, 2);
    navigator.clipboard.writeText(dataToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const mainColor = isWorking
    ? 'var(--accent-primary)'
    : isPruned
    ? '#c084fc'
    : isFailed
    ? '#f43f5e'
    : resultMessage
    ? 'var(--accent-teal)'
    : 'var(--accent-amber)';

  const bgColor = isWorking
    ? 'rgba(99, 102, 241, 0.08)'
    : isPruned
    ? 'rgba(168, 85, 247, 0.08)'
    : isFailed
    ? 'rgba(244, 63, 94, 0.08)'
    : resultMessage
    ? 'rgba(20, 184, 166, 0.08)'
    : 'rgba(245, 158, 11, 0.08)';

  const borderColor = isWorking
    ? 'rgba(99, 102, 241, 0.4)'
    : isPruned
    ? 'rgba(168, 85, 247, 0.3)'
    : isFailed
    ? 'rgba(244, 63, 94, 0.25)'
    : resultMessage
    ? 'rgba(20, 184, 166, 0.25)'
    : 'rgba(245, 158, 11, 0.3)';

  const borderTopColor = isWorking
    ? 'rgba(99, 102, 241, 0.2)'
    : isPruned
    ? 'rgba(168, 85, 247, 0.2)'
    : isFailed
    ? 'rgba(244, 63, 94, 0.18)'
    : resultMessage
    ? 'rgba(20, 184, 166, 0.18)'
    : 'rgba(245, 158, 11, 0.2)';

  return (
    <div
      className="animate-fade-in"
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: '10px',
        fontSize: '0.85rem',
        overflow: 'hidden',
        boxShadow: isWorking ? '0 4px 12px rgba(99, 102, 241, 0.15)' : 'none',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Header Bar */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((curr) => !curr)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((curr) => !curr);
          }
        }}
        aria-expanded={expanded}
        style={{
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          background: 'rgba(15, 23, 42, 0.2)',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: mainColor, fontWeight: 600, minWidth: 0, flex: 1 }}>
          {isWorking ? (
            <Loader2 size={16} className="spin" style={{ flexShrink: 0, color: 'var(--accent-primary)' }} />
          ) : isPruned ? (
            <Scissors size={15} style={{ flexShrink: 0, color: '#c084fc' }} />
          ) : isFailed ? (
            <XCircle size={15} style={{ flexShrink: 0, color: '#f43f5e' }} />
          ) : resultMessage ? (
            <CheckCircle2 size={15} style={{ flexShrink: 0, color: 'var(--accent-teal)' }} />
          ) : (
            <Wrench size={15} style={{ flexShrink: 0, color: 'var(--accent-amber)' }} />
          )}

          <span style={{ whiteSpace: 'nowrap' }}>Tool Execution:</span>
          <span
            style={{
              fontFamily: 'var(--font-code)',
              background: 'rgba(15, 23, 42, 0.4)',
              padding: '2px 8px',
              borderRadius: '6px',
              color: mainColor,
              fontSize: '0.8rem',
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {toolName}
          </span>

          {/* Status Badge */}
          {args?._streaming ? (
            <span style={{ background: 'rgba(56, 189, 248, 0.25)', color: '#7dd3fc', border: '1px solid rgba(56, 189, 248, 0.4)', padding: '1px 7px', borderRadius: '4px', fontSize: '0.675rem', fontWeight: 700, textTransform: 'uppercase', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Loader2 size={10} className="spin" /> Writing Tool Call… {streamingMetrics && (streamingMetrics.liveTokPerSec > 0 || streamingMetrics.tokenCount > 0) ? `⚡ ${streamingMetrics.liveTokPerSec > 0 ? `${streamingMetrics.liveTokPerSec} tok/s` : 'streaming'} (${streamingMetrics.tokenCount} tok)` : ''}
            </span>
          ) : isWorking ? (
            <span style={{ background: 'rgba(99, 102, 241, 0.25)', color: '#a5b4fc', border: '1px solid rgba(99, 102, 241, 0.4)', padding: '1px 7px', borderRadius: '4px', fontSize: '0.675rem', fontWeight: 700, textTransform: 'uppercase', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Loader2 size={10} className="spin" /> Executing… {streamingMetrics && streamingMetrics.liveTokPerSec > 0 ? `⚡ ${streamingMetrics.liveTokPerSec} tok/s` : ''}
            </span>
          ) : isPruned ? (
            <span style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#e9d5ff', border: '1px solid rgba(168, 85, 247, 0.4)', padding: '1px 7px', borderRadius: '4px', fontSize: '0.675rem', fontWeight: 700, textTransform: 'uppercase', flexShrink: 0 }}>
              Pruned
            </span>
          ) : isFailed ? (
            <span style={{ background: 'rgba(244, 63, 94, 0.2)', color: '#fca5a5', border: '1px solid rgba(244, 63, 94, 0.4)', padding: '1px 7px', borderRadius: '4px', fontSize: '0.675rem', fontWeight: 700, textTransform: 'uppercase', flexShrink: 0 }}>
              Failed
            </span>
          ) : resultMessage ? (
            <span style={{ background: 'rgba(20, 184, 166, 0.2)', color: '#99f6e4', border: '1px solid rgba(20, 184, 166, 0.4)', padding: '1px 7px', borderRadius: '4px', fontSize: '0.675rem', fontWeight: 700, textTransform: 'uppercase', flexShrink: 0 }}>
              Completed
            </span>
          ) : null}

          {readFilePath ? (
            <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden', color: 'var(--text-muted)', fontFamily: 'var(--font-code)', fontSize: '0.75rem' }}>
              <button
                type="button"
                onClick={openReadFile}
                title={`Open ${readFilePath} in file viewer`}
                style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: 0, border: 0, background: 'transparent', color: '#38bdf8', font: 'inherit', fontFamily: 'inherit', textDecoration: 'underline', textUnderlineOffset: '2px', cursor: 'pointer' }}
              >
                {readFilePath}
              </button>
              <span style={{ whiteSpace: 'nowrap' }}>
                ({readFileLineCount} {readFileLineCount === 1 ? 'line' : 'lines'}, {readFileSize} bytes)
              </span>
            </span>
          ) : displaySummary && (
            <span
              style={{
                color: isPruned ? '#d8b4fe' : isFailed ? '#f87171' : 'var(--text-muted)',
                fontFamily: 'var(--font-code)',
                fontSize: '0.75rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
                minWidth: 0,
              }}
            >
              {displaySummary}
            </span>
          )}

          {isWebSearch && sideDriftPages.length > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0, padding: '2px 7px', borderRadius: '999px', border: '1px solid rgba(56, 189, 248, 0.45)', background: 'rgba(14, 116, 144, 0.2)', color: '#7dd3fc', fontFamily: 'var(--font-code)', fontSize: '0.66rem', fontWeight: 700 }}>
              <Sparkles size={10} /> Side Drift ⚡ {sideDriftPages.length} page{sideDriftPages.length === 1 ? '' : 's'} read
            </span>
          )}

          {isDeepResearch && resultMessage && (
            <span title={`${resultMessage.content.length.toLocaleString()} chars (~${synthesisTokenEstimate.toLocaleString()} tokens)`} style={{ flexShrink: 0, padding: '2px 6px', borderRadius: '5px', border: '1px solid rgba(45, 212, 191, 0.28)', background: 'rgba(20, 184, 166, 0.1)', color: '#99f6e4', fontFamily: 'var(--font-code)', fontSize: '0.65rem' }}>
              synthesis ~{synthesisTokenEstimate.toLocaleString()} tokens
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '8px' }}>
          {/* View Mode Tabs */}
          <div style={{ display: 'flex', gap: '2px', background: 'rgba(15, 23, 42, 0.7)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setViewMode('formatted');
              }}
              title="Formatted View"
              style={{
                padding: '3px 8px',
                borderRadius: '4px',
                border: 'none',
                background: viewMode === 'formatted' ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                color: viewMode === 'formatted' ? '#fff' : 'var(--text-muted)',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Eye size={12} />
              <span>Formatted</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setViewMode('raw_input');
              }}
              title="Raw Inputs JSON"
              style={{
                padding: '3px 8px',
                borderRadius: '4px',
                border: 'none',
                background: viewMode === 'raw_input' ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                color: viewMode === 'raw_input' ? '#fff' : 'var(--text-muted)',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Code2 size={12} />
              <span>Input</span>
            </button>
            {resultMessage && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewMode('raw_result');
                }}
                title="Raw Result JSON"
                style={{
                  padding: '3px 8px',
                  borderRadius: '4px',
                  border: 'none',
                  background: viewMode === 'raw_result' ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                  color: viewMode === 'raw_result' ? '#fff' : 'var(--text-muted)',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Code2 size={12} />
                <span>Result</span>
              </button>
            )}
          </div>

          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopy}
            title={viewMode === 'raw_result' ? 'Copy Raw Result' : 'Copy Raw Input Args'}
            style={{ background: 'none', border: 'none', color: copied ? '#10b981' : 'var(--text-muted)', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.72rem' }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>

          {/* Stop Button if Working */}
          {isWorking && onCancelGeneration && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCancelGeneration();
              }}
              title="Stop Execution"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 7px', borderRadius: '5px', border: '1px solid rgba(239, 68, 68, 0.5)', background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}
            >
              <Square size={10} fill="currentColor" /> Stop
            </button>
          )}

          <ChevronDown size={16} color={mainColor} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
        </div>
      </div>

      {/* Expanded Content Body */}
      {expanded && (
        <div style={{ padding: '12px', borderTop: `1px solid ${borderTopColor}`, background: 'rgba(10, 15, 28, 0.65)' }}>
          {viewMode === 'raw_input' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Invocation Parameters:</span>
              <pre style={{ margin: 0, padding: '10px 12px', background: '#090d16', borderRadius: '8px', border: '1px solid var(--border-color)', fontFamily: 'var(--font-code)', fontSize: '0.8rem', color: '#fcd34d', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '350px', overflowY: 'auto' }}>
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}

          {viewMode === 'raw_result' && resultMessage && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Raw Output Payload:</span>
              <pre style={{ margin: 0, padding: '10px 12px', background: '#090d16', borderRadius: '8px', border: '1px solid var(--border-color)', fontFamily: 'var(--font-code)', fontSize: '0.8rem', color: '#a7f3d0', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '400px', overflowY: 'auto' }}>
                {fullResultContent}
              </pre>
            </div>
          )}

          {viewMode === 'formatted' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Tool Streaming Live Preview */}
              {args?._streaming ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(56, 189, 248, 0.08)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, color: '#38bdf8' }}>
                    <Loader2 size={14} className="spin" />
                    <span>Streaming model tool input generation...</span>
                  </div>
                  <pre style={{ margin: 0, padding: '10px 12px', background: '#090d16', borderRadius: '8px', border: '1px solid var(--border-color)', fontFamily: 'var(--font-code)', fontSize: '0.8rem', color: '#7dd3fc', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '350px', overflowY: 'auto' }}>
                    {args._rawText || 'Writing tool parameters...'}
                  </pre>
                </div>
              ) : args && Object.keys(args).length > 0 && (
                <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <PrettierInvocationView name={toolName} args={args} />
                </div>
              )}

              {/* Working Progress Block */}
              {isWorking && (
                toolName === 'deep_research' ? (
                  <DeepResearchProgress args={args} progress={progress} onCancelGeneration={onCancelGeneration} />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'rgba(99, 102, 241, 0.12)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '8px', color: '#c7d2fe', fontSize: '0.825rem' }}>
                    <Loader2 size={16} className="spin" style={{ flexShrink: 0, color: 'var(--accent-primary)' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontWeight: 600, color: '#e0e7ff' }}>Tool execution in progress...</span>
                      <span style={{ fontFamily: 'var(--font-code)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Running {toolName} {inputSummary ? `(${inputSummary})` : ''}
                      </span>
                    </div>
                  </div>
                )
              )}

              {/* Result Output Block */}
              {resultMessage && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: mainColor, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      Execution Result Output:
                    </span>

                    {isDeepResearch && onRegenerateDeepResearch && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRegenerateDeepResearch(resultMessage.id);
                        }}
                        disabled={isGenerating}
                        title="Delete messages after this research result and regenerate the answer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 7px', borderRadius: '5px', border: '1px solid rgba(99, 102, 241, 0.35)', background: 'rgba(99, 102, 241, 0.12)', color: '#c7d2fe', cursor: isGenerating ? 'not-allowed' : 'pointer', opacity: isGenerating ? 0.45 : 1, fontSize: '0.66rem', fontWeight: 650 }}
                      >
                        <RotateCcw size={11} /> Regenerate answer
                      </button>
                    )}
                  </div>

                  {isPruned ? (
                    <div style={{ padding: '10px 14px', background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: '6px', color: '#e9d5ff', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Scissors size={16} color="#c084fc" style={{ flexShrink: 0 }} />
                      <span>{resultMessage.content}</span>
                    </div>
                  ) : (
                    <>
                      {isWebSearch && (
                        <WebSearchResultsView
                          query={parsedContent?.query || args?.query || ''}
                          results={parsedContent?.results || []}
                          mostRelevantPages={sideDriftPages}
                        />
                      )}
                      {isWebPageRead && (
                        <WebPageReaderView
                          title={parsedContent?.title}
                          url={parsedContent?.url || args?.url}
                          markdown={parsedContent?.markdown}
                        />
                      )}
                      {isDeepResearch && parsedContent?.sources && (
                        <DeepResearchResultsView
                          query={parsedContent?.query || args?.query || ''}
                          searchesCompleted={parsedContent?.searches_completed || 0}
                          searchResultsFound={parsedContent?.search_results_found}
                          linkedPagesRead={parsedContent?.linked_pages_read || 0}
                          researchDate={parsedContent?.research_date}
                          status={parsedContent?.status}
                          sources={parsedContent?.sources || []}
                          images={parsedContent?.images || []}
                          searchQueries={parsedContent?.search_queries || []}
                          steps={parsedContent?.steps || []}
                          errors={parsedContent?.errors || []}
                          noteErrors={parsedContent?.note_errors || []}
                          researchBudget={parsedContent?.research_budget}
                          modelContext={resultMessage.content}
                          fullContext={fullResultContent}
                        />
                      )}
                      {fileDiff && <FileDiff diff={fileDiff} />}

                      {!isWebSearch && !isWebPageRead && !(isDeepResearch && parsedContent?.sources) && !fileDiff && (
                        <pre style={{ margin: 0, padding: '10px 12px', background: '#090d16', borderRadius: '8px', border: '1px solid var(--border-color)', fontFamily: 'var(--font-code)', fontSize: '0.8rem', color: isFailed ? '#fca5a5' : '#e2e8f0', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '350px', overflowY: 'auto' }}>
                          {resultWithoutDiff ? JSON.stringify(resultWithoutDiff, null, 2) : fullResultContent}
                        </pre>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const ToolInvocationCard: React.FC<{
  name: string;
  args: Record<string, any>;
  defaultExpanded?: boolean;
}> = ({ name, args, defaultExpanded = true }) => (
  <ToolExecutionCard toolName={name} args={args} defaultExpanded={defaultExpanded} />
);
