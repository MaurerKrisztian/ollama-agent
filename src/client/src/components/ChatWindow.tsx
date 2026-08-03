import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Square, Wrench, CheckCircle2, XCircle, ShieldAlert, User, Bot, Loader2, FileText, Folder, Terminal, Edit3, Search, PlusCircle, Sparkles, Code2, Eye, ChevronDown, ChevronRight, Brain, X, Globe, ExternalLink, Layers, RotateCcw, Copy, Check, Scissors, Info, Image as ImageIcon, CornerDownRight } from 'lucide-react';
import { ChatMessage, FileDiffData, ImageAttachment, BatchReviewFile, PendingApprovalCall, TextAttachment } from '../types';
import { BatchReviewCard } from './chat/BatchReviewCard';
import { getLinkPresentation } from '../linkPresentation';
import { findActiveSkillMention } from '../skillMention';

const compactValue = (value: unknown, maxLength = 64): string => {
  if (value === undefined || value === null || value === '') return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const singleLine = text.replace(/\s+/g, ' ').trim();
  return `"${singleLine.length > maxLength ? `${singleLine.slice(0, maxLength - 1)}…` : singleLine}"`;
};

const EXTENSION_LANGUAGES: Record<string, { label: string; color: string; keywords: string[] }> = {
  js: { label: 'JavaScript', color: '#f7df1e', keywords: ['const', 'let', 'var', 'function', 'return', 'async', 'await', 'if', 'else', 'for', 'while', 'class', 'new', 'import', 'export', 'from', 'default', 'throw', 'try', 'catch', 'true', 'false', 'null', 'undefined'] },
  jsx: { label: 'JSX', color: '#61dafb', keywords: ['const', 'let', 'function', 'return', 'async', 'await', 'if', 'else', 'class', 'new', 'import', 'export', 'from', 'default', 'true', 'false', 'null'] },
  ts: { label: 'TypeScript', color: '#3178c6', keywords: ['const', 'let', 'function', 'return', 'async', 'await', 'if', 'else', 'for', 'while', 'class', 'interface', 'type', 'extends', 'implements', 'new', 'import', 'export', 'from', 'default', 'public', 'private', 'readonly', 'string', 'number', 'boolean', 'unknown', 'any', 'true', 'false', 'null', 'undefined'] },
  tsx: { label: 'TSX', color: '#3178c6', keywords: ['const', 'let', 'function', 'return', 'async', 'await', 'if', 'else', 'class', 'interface', 'type', 'extends', 'import', 'export', 'from', 'default', 'string', 'number', 'boolean', 'true', 'false', 'null'] },
  py: { label: 'Python', color: '#3776ab', keywords: ['def', 'return', 'async', 'await', 'if', 'elif', 'else', 'for', 'while', 'class', 'from', 'import', 'as', 'try', 'except', 'finally', 'raise', 'with', 'lambda', 'yield', 'in', 'is', 'and', 'or', 'not', 'True', 'False', 'None'] },
  json: { label: 'JSON', color: '#facc15', keywords: ['true', 'false', 'null'] },
  css: { label: 'CSS', color: '#663399', keywords: ['var', 'calc', 'inherit', 'initial', 'unset', 'transparent', 'important'] },
  html: { label: 'HTML', color: '#e34f26', keywords: ['doctype', 'html', 'head', 'body', 'script', 'style', 'div', 'span', 'class', 'id'] },
  htm: { label: 'HTML', color: '#e34f26', keywords: ['doctype', 'html', 'head', 'body', 'script', 'style', 'div', 'span', 'class', 'id'] },
  md: { label: 'Markdown', color: '#60a5fa', keywords: [] },
  sql: { label: 'SQL', color: '#e38c00', keywords: ['SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'UPDATE', 'DELETE', 'CREATE', 'TABLE', 'JOIN', 'ON', 'AS', 'AND', 'OR', 'NULL', 'VALUES', 'GROUP', 'ORDER', 'BY', 'LIMIT'] },
  sh: { label: 'Shell', color: '#4eaa25', keywords: ['if', 'then', 'else', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac', 'function', 'in', 'export'] },
  bash: { label: 'Bash', color: '#4eaa25', keywords: ['if', 'then', 'else', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac', 'function', 'in', 'export'] },
  yaml: { label: 'YAML', color: '#cb171e', keywords: ['true', 'false', 'null'] },
  yml: { label: 'YAML', color: '#cb171e', keywords: ['true', 'false', 'null'] },
  xml: { label: 'XML', color: '#f97316', keywords: [] },
};

const getAttachmentLanguage = (name: string) => {
  const extension = name.toLowerCase().split('.').pop() || '';
  return EXTENSION_LANGUAGES[extension] || { label: extension ? extension.toUpperCase() : 'Text', color: '#94a3b8', keywords: [] };
};

const HighlightedAttachment: React.FC<{ file: TextAttachment }> = ({ file }) => {
  const language = getAttachmentLanguage(file.name);
  const keywords = new Set(language.keywords.map((keyword) => keyword.toLowerCase()));
  const tokenPattern = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|<!--[\s\S]*?-->|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of file.content.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) nodes.push(file.content.slice(lastIndex, index));
    const token = match[0];
    let color: string | undefined;
    if (/^(?:\/[/*]|#|<!--)/.test(token)) color = '#64748b';
    else if (/^["'`]/.test(token)) color = '#86efac';
    else if (/^\d/.test(token)) color = '#fbbf24';
    else if (keywords.has(token.toLowerCase())) color = '#c084fc';
    nodes.push(color ? <span key={`${index}-${token.length}`} style={{ color }}>{token}</span> : token);
    lastIndex = index + token.length;
  }
  if (lastIndex < file.content.length) nodes.push(file.content.slice(lastIndex));
  return <>{nodes}</>;
};

export interface CategorizedError {
  code: string;
  reason: string;
}

export const categorizeError = (error: unknown, result?: any): CategorizedError => {
  const msg = typeof error === 'string' 
    ? error 
    : (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string'
      ? (error as any).message 
      : '');

  const text = (msg + ' ' + (result?.error || '') + ' ' + (result?.reason || '')).trim();

  if (/ENOENT|no such file or directory|File not found/i.test(text)) {
    return { code: 'FILE_NOT_FOUND', reason: 'File or directory not found' };
  }
  if (/ungrounded|The runtime read|required automatic read failed/i.test(text) || result?.read_required) {
    return { code: 'READ_REQUIRED', reason: 'Must read file before editing' };
  }
  if (/repeating an identical failed|repeated_call/i.test(text) || result?.repeated_call) {
    return { code: 'REPEATED_CALL', reason: 'Identical failed call blocked' };
  }
  if (/was not found in file|not found in/i.test(text)) {
    return { code: 'TARGET_NOT_FOUND', reason: 'Target text not found in file' };
  }
  if (/produced no change|no changes were made/i.test(text)) {
    return { code: 'NO_CHANGES', reason: 'Edit produced no changes' };
  }
  if (/is a directory, not a file|is not a directory/i.test(text)) {
    return { code: 'PATH_TYPE_MISMATCH', reason: 'Path type mismatch (dir vs file)' };
  }
  if (/exceeds .* limit|too large/i.test(text)) {
    return { code: 'FILE_TOO_LARGE', reason: 'File exceeds size limit' };
  }
  if (/is required|Parameters .* required|missing argument/i.test(text)) {
    return { code: 'MISSING_ARGS', reason: 'Missing required parameters' };
  }
  if (/rejected by user|EACCES|permission denied/i.test(text)) {
    return { code: 'PERMISSION_DENIED', reason: 'Operation rejected or permission denied' };
  }
  if (/MCP tool .* is disabled|MCP execution error/i.test(text)) {
    return { code: 'MCP_ERROR', reason: 'MCP tool execution failed' };
  }
  if (/web search failed|web page read failed|deep research failed|private network/i.test(text)) {
    return { code: 'WEB_ERROR', reason: 'Web request failed' };
  }
  if (result?.exitCode !== undefined && result.exitCode !== 0) {
    return { code: 'COMMAND_FAILED', reason: `Command exited with code ${result.exitCode}` };
  }

  if (msg) {
    const clean = msg.replace(/[\r\n]+/g, ' ').trim();
    const match = clean.match(/^([^.!?]+[.!?]?)/);
    let shortText = match ? match[1].trim() : clean;
    if (shortText.length > 60) {
      const truncated = shortText.slice(0, 57);
      const lastSpace = truncated.lastIndexOf(' ');
      shortText = (lastSpace > 30 ? truncated.slice(0, lastSpace) : truncated) + '…';
    }
    return { code: 'ERROR', reason: shortText };
  }

  return { code: 'FAILED', reason: 'Operation failed' };
};

const getToolResultSummary = (
  name: string | undefined,
  args: Record<string, any>,
  result: any,
): string => {
  const target = compactValue(
    args.relative_path || args.absolute_path || args.query || args.command || args.url ||
    result?.file_path || result?.relative_path || result?.working_directory,
  );

  const isFailed = !!(
    result?.error ||
    result?.failed ||
    result?.success === false ||
    (result?.exitCode !== undefined && result.exitCode !== 0)
  );

  if (isFailed) {
    const { code, reason } = categorizeError(result?.error || result?.reason, result);
    return `${target} ([${code}] ${reason})`.trim();
  }

  switch (name) {
    case 'list_directory': {
      const entries = Array.isArray(result?.entries) ? result.entries : [];
      const directories = entries.filter((entry: any) => entry?.type === 'directory').length;
      const files = entries.filter((entry: any) => entry?.type === 'file').length;
      const other = Math.max(0, entries.length - directories - files);
      const counts = [
        `${directories} ${directories === 1 ? 'dir' : 'dirs'}`,
        `${files} ${files === 1 ? 'file' : 'files'}`,
        ...(other ? [`${other} other`] : []),
      ].join(', ');
      return `${target || '"."'} (${counts})`;
    }
    case 'read_file': {
      const lineCount = typeof result?.content === 'string'
        ? (result.content ? result.content.split('\n').length : 0)
        : 0;
      return `${target} (${lineCount} ${lineCount === 1 ? 'line' : 'lines'}, ${result?.size_bytes ?? 0} bytes)`.trim();
    }
    case 'edit_file':
    case 'replace_file':
      return `${target} (${result?.changed === false ? 'unchanged' : 'updated'}, ${result?.size_bytes ?? 0} bytes)`.trim();
    case 'create_file':
      return `${target} (created, ${result?.size_bytes ?? 0} bytes)`.trim();
    case 'grep_search': {
      const count = result?.total_matches ?? (Array.isArray(result?.matches) ? result.matches.length : 0);
      return `${target} (${count} ${count === 1 ? 'match' : 'matches'})`.trim();
    }
    case 'execute_command':
      return `${target} (exit ${result?.exitCode ?? '?'})`.trim();
    case 'web_search':
      return `${target} (${result?.result_count ?? 0} results)`.trim();
    case 'read_web_page':
      return `${compactValue(result?.title) || target} (${result?.markdown?.length ?? 0} chars)`.trim();
    case 'deep_research':
      return `${target} (${result?.searches_completed ?? 0} searches, ${result?.pages_read ?? 0} pages, ${result?.images?.length ?? 0} images)`.trim();
    case 'get_working_directory':
      return `${target}`.trim();
    case 'set_working_directory':
      return `${target} (${result?.success ? 'changed' : 'failed'})`.trim();
    default: {
      if (Array.isArray(result)) return `${target} (${result.length} items)`.trim();
      const keyCount = result && typeof result === 'object' ? Object.keys(result).length : 0;
      return `${target}${keyCount ? ` (${keyCount} fields)` : ''}`.trim();
    }
  }
};

const WebSearchResultsView: React.FC<{
  query: string;
  results: Array<{ title: string; url: string; snippet: string }>;
  mostRelevantPages?: Array<{ title?: string; url?: string; markdown?: string; character_count?: number }>;
}> = ({ query, results, mostRelevantPages = [] }) => {
  const [expandedPageIndex, setExpandedPageIndex] = useState<number | null>(null);

  return (
    <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Query Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          background: 'rgba(15, 23, 42, 0.6)',
          borderRadius: '6px',
          border: '1px solid rgba(20, 184, 166, 0.2)',
          fontSize: '0.775rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
          <Search size={13} color="var(--accent-teal)" />
          <span style={{ color: 'var(--text-muted)' }}>Query:</span>
          <span style={{ fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-code)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            "{query}"
          </span>
        </div>
        <span
          style={{
            fontSize: '0.7rem',
            padding: '2px 8px',
            borderRadius: '10px',
            background: 'rgba(20, 184, 166, 0.15)',
            color: 'var(--accent-teal)',
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {results.length} result{results.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Side Drift Auto-Fetch UI Badge & Content Drawer */}
      {mostRelevantPages.length > 0 ? (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            background: 'linear-gradient(135deg, rgba(14, 116, 144, 0.18), rgba(99, 102, 241, 0.12))',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <Sparkles size={14} color="#7dd3fc" />
            <span style={{ fontWeight: 700, color: '#7dd3fc', fontSize: '0.8rem' }}>
              ⚡ Side Drift Auto-Fetched {mostRelevantPages.length} Relevant Page{mostRelevantPages.length === 1 ? '' : 's'}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              (Full markdown page attached to model context)
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {mostRelevantPages.map((page, idx) => {
              const isExpanded = expandedPageIndex === idx;
              return (
                <div
                  key={idx}
                  style={{
                    borderRadius: '6px',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      gap: '8px',
                    }}
                  >
                    <a
                      href={page.url || '#'}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        color: '#38bdf8',
                        fontSize: '0.75rem',
                        textDecoration: 'none',
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <Globe size={12} color="#38bdf8" />
                      <span>{page.title || page.url || `Page ${idx + 1}`}</span>
                      <ExternalLink size={10} style={{ opacity: 0.8 }} />
                    </a>

                    {page.markdown && (
                      <button
                        type="button"
                        onClick={() => setExpandedPageIndex(isExpanded ? null : idx)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 7px',
                          borderRadius: '4px',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                          background: isExpanded ? 'rgba(56, 189, 248, 0.2)' : 'rgba(15, 23, 42, 0.4)',
                          color: '#7dd3fc',
                          fontSize: '0.68rem',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        <Eye size={10} />
                        <span>{isExpanded ? 'Hide Page' : 'Preview Page'}</span>
                        <ChevronDown size={10} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
                      </button>
                    )}
                  </div>

                  {isExpanded && page.markdown && (
                    <div
                      style={{
                        padding: '10px 12px',
                        borderTop: '1px solid rgba(56, 189, 248, 0.2)',
                        maxHeight: '260px',
                        overflowY: 'auto',
                        background: 'rgba(2, 6, 23, 0.7)',
                        fontSize: '0.75rem',
                      }}
                    >
                      <MarkdownContent content={page.markdown} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            background: 'rgba(15, 23, 42, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--text-dim)',
            fontSize: '0.73rem',
          }}
        >
          <Sparkles size={12} color="var(--text-dim)" />
          <span>Side Drift: 0 search results met relevance threshold for auto-page reading.</span>
        </div>
      )}

      {/* Results Cards List */}
      {results.length === 0 ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px' }}>
          No search results found.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {results.map((r, idx) => {
            let domain = '';
            try {
              domain = new URL(r.url).hostname.replace(/^www\./, '');
            } catch (_) {}

            return (
              <div
                key={idx}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: 'rgba(15, 23, 42, 0.5)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: '#38bdf8',
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      lineHeight: 1.3,
                    }}
                  >
                    <Globe size={13} style={{ flexShrink: 0, color: 'var(--accent-teal)' }} />
                    <span>{r.title}</span>
                    <ExternalLink size={11} style={{ flexShrink: 0, opacity: 0.7 }} />
                  </a>
                  {domain && (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontFamily: 'var(--font-code)',
                        color: 'var(--text-dim)',
                        background: 'rgba(30, 41, 59, 0.6)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        flexShrink: 0,
                      }}
                    >
                      {domain}
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.45 }}>
                  {r.snippet}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const WebPageReaderView: React.FC<{
  title?: string;
  url?: string;
  markdown?: string;
}> = ({ title, url, markdown }) => (
  <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
    {url && (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.775rem' }}>
        <Globe size={13} color="var(--accent-teal)" />
        <a href={url} target="_blank" rel="noreferrer" style={{ color: '#38bdf8', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>{title || url}</span>
          <ExternalLink size={11} />
        </a>
      </div>
    )}
    {markdown && (
      <div style={{ padding: '12px', background: 'rgba(15, 23, 42, 0.5)', borderRadius: '8px', border: '1px solid var(--border-color)', maxHeight: '360px', overflowY: 'auto' }}>
        <MarkdownContent content={markdown} />
      </div>
    )}
  </div>
);

const WebsiteFavicon: React.FC<{ url: string; size?: number }> = ({ url, size = 16 }) => {
  const presentation = getLinkPresentation(url);

  return (
    <span aria-hidden="true" style={{ position: 'relative', display: 'grid', placeItems: 'center', width: `${size}px`, height: `${size}px`, flexShrink: 0, overflow: 'hidden', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.12)' }}>
      <Globe size={Math.max(10, size - 5)} color="#7dd3fc" />
      {presentation && (
        <img
          src={presentation.faviconUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
          style={{ position: 'absolute', inset: '2px', width: `${size - 4}px`, height: `${size - 4}px`, objectFit: 'contain' }}
        />
      )}
    </span>
  );
};

const CompactWebsiteLink: React.FC<{ url: string; color?: string }> = ({ url, color = '#7dd3fc' }) => {
  const presentation = getLinkPresentation(url);
  if (!presentation) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={url}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', minWidth: 0, maxWidth: '100%', color, textDecoration: 'none', fontFamily: 'var(--font-code)', fontSize: '0.66rem' }}
    >
      <WebsiteFavicon url={url} size={15} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{presentation.shortUrl}</span>
      <ExternalLink size={9} style={{ flexShrink: 0 }} />
    </a>
  );
};

const ResearchTrail: React.FC<{
  steps?: Array<{ id?: number; phase?: string; kind?: string; status?: string; label?: string; url?: string; detail?: string }>;
  searchQueries?: string[];
  errors?: string[];
  live?: boolean;
}> = ({ steps = [], searchQueries = [], errors = [], live = false }) => (
  <details open={live ? true : undefined} style={{ marginTop: '10px', border: '1px solid rgba(125, 211, 252, 0.18)', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.35)', overflow: 'hidden' }}>
    <summary style={{ padding: '8px 10px', color: '#7dd3fc', cursor: 'pointer', fontSize: '0.74rem', fontWeight: 650 }}>
      {live ? 'Peek into live research steps' : 'Inspect research trail'}
      <span style={{ marginLeft: '6px', color: 'var(--text-muted)', fontWeight: 400 }}>
        ({steps.length || searchQueries.length} events{errors.length ? `, ${errors.length} errors` : ''})
      </span>
    </summary>
    <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '320px', overflowY: 'auto' }}>
      {steps.length > 0 ? steps.map((step, index) => (
        <div key={`${step.id || index}-${step.label}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', padding: '6px 8px', borderRadius: '6px', background: 'rgba(2, 6, 23, 0.32)', fontSize: '0.71rem' }}>
          {step.status === 'error'
            ? <XCircle size={12} color="#fb7185" style={{ marginTop: '2px', flexShrink: 0 }} />
            : step.status === 'success'
              ? <CheckCircle2 size={12} color="#2dd4bf" style={{ marginTop: '2px', flexShrink: 0 }} />
              : <Search size={12} color="#7dd3fc" style={{ marginTop: '2px', flexShrink: 0 }} />}
          <div style={{ minWidth: 0, flex: 1 }}>
            {step.url ? (
              <>
                <a href={step.url} target="_blank" rel="noreferrer" style={{ color: step.status === 'error' ? '#fda4af' : '#bae6fd', textDecoration: 'none', overflowWrap: 'anywhere' }}>{step.label || getLinkPresentation(step.url)?.shortUrl || step.url}</a>
                <span style={{ display: 'block', marginTop: '3px' }}>
                  <CompactWebsiteLink url={step.url} color={step.status === 'error' ? '#fda4af' : '#7dd3fc'} />
                </span>
              </>
            ) : (
              <span style={{ color: step.status === 'error' ? '#fda4af' : 'var(--text-main)', overflowWrap: 'anywhere' }}>{step.label}</span>
            )}
            {step.detail && <span style={{ display: 'block', marginTop: '2px', color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>{step.detail}</span>}
          </div>
          {step.phase && <span style={{ color: 'var(--text-dim)', fontSize: '0.64rem', flexShrink: 0 }}>{step.phase.replace('_', ' ')}</span>}
        </div>
      )) : searchQueries.map((searchQuery, index) => (
        <div key={`${index}-${searchQuery}`} style={{ color: 'var(--text-muted)', fontSize: '0.71rem', padding: '3px 8px' }}>
          {index + 1}. {searchQuery}
        </div>
      ))}
      {errors.length > 0 && steps.every((step) => step.status !== 'error') && errors.map((error, index) => (
        <div key={`${index}-${error}`} style={{ color: '#fda4af', fontSize: '0.71rem', padding: '5px 8px', borderRadius: '6px', background: 'rgba(244, 63, 94, 0.08)', overflowWrap: 'anywhere' }}>
          {error}
        </div>
      ))}
      {steps.length === 0 && searchQueries.length === 0 && <span style={{ color: 'var(--text-dim)', fontSize: '0.71rem' }}>Waiting for the first research event…</span>}
    </div>
  </details>
);

const DeepResearchProgress: React.FC<{ args: Record<string, any>; progress?: any; onCancelGeneration?: () => void }> = ({ args, progress, onCancelGeneration }) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const query = String(args?.query || '').trim() || 'Researching the requested topic';
  const requestedImages = Number.isFinite(Number(args?.image_count))
    ? Math.max(0, Math.trunc(Number(args.image_count)))
    : null;
  const inspectedPages = Array.isArray(progress?.pages) ? progress.pages : [];
  const noteBatches = Array.isArray(progress?.note_batches) ? progress.note_batches : [];
  const linkAnalysis = progress?.link_analysis;
  const liveNoteCount = noteBatches.reduce((total: number, batch: any) => total + Number(batch.notes_completed || 0), 0);
  const liveNoteTokens = noteBatches.reduce((total: number, batch: any) =>
    total + Number(batch.estimated_tokens || Math.ceil(String(batch.content || '').length / 4)), 0);
  const phaseLabels: Record<string, string> = {
    searching: 'Searching the web',
    reading: 'Inspecting promising pages',
    classifying_links: linkAnalysis?.stage === 'confirming_pages' ? 'Confirming linked-page relevance with AI' : 'Ranking discovered links with AI',
    following_links: 'Following relevant website links',
    analyzing: 'Extracting request-relevant evidence',
    collecting_images: 'Collecting and attributing images',
    complete: 'Research collected',
  };
  const phaseLabel = phaseLabels[progress?.phase] || 'Preparing research';
  const workflow = [
    { icon: Search, label: 'Search the web', detail: 'Run several focused search queries' },
    { icon: FileText, label: 'Inspect sources', detail: 'Read the most relevant public pages' },
    {
      icon: ExternalLink,
      label: 'Follow evidence',
      detail: progress?.phase === 'classifying_links'
        ? linkAnalysis?.stage === 'confirming_pages'
          ? `Confirming ${linkAnalysis.items_completed || 0}/${linkAnalysis.candidates || 0} fetched pages`
          : `Ranking ${linkAnalysis.items_completed || 0}/${linkAnalysis.candidates || 0} discovered links`
        : 'Open useful links from those websites',
    },
    { icon: Brain, label: 'Create relevance notes', detail: 'Use the active model to extract information that directly answers the request' },
    {
      icon: ImageIcon,
      label: 'Collect images',
      detail: requestedImages === 0
        ? 'Skipped because no images were requested'
        : requestedImages
          ? `Find up to ${requestedImages} relevant, attributed images`
          : 'Find images only when the request calls for them',
    },
  ];

  return (
    <div
      className="glass-panel animate-fade-in"
      style={{
        marginLeft: '44px',
        padding: '16px 18px',
        borderRadius: '14px',
        border: '1px solid rgba(56, 189, 248, 0.42)',
        background: 'linear-gradient(135deg, rgba(14, 116, 144, 0.14), rgba(79, 70, 229, 0.1))',
        boxShadow: '0 6px 20px rgba(14, 116, 144, 0.12)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
          <Loader2 size={19} className="spin" style={{ flexShrink: 0, color: '#38bdf8' }} />
          <strong style={{ color: 'var(--text-main)', fontSize: '0.9rem' }}>Deep research in progress</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {args?.preset && (
            <span style={{ padding: '2px 8px', borderRadius: '999px', background: 'rgba(125, 211, 252, 0.15)', color: '#38bdf8', fontSize: '0.68rem', fontWeight: 700, border: '1px solid rgba(56, 189, 248, 0.3)', textTransform: 'uppercase' }}>
              {args.preset} Preset
            </span>
          )}
          <span style={{ flexShrink: 0, color: '#7dd3fc', fontFamily: 'var(--font-code)', fontSize: '0.75rem' }}>
            {elapsedSeconds}s
          </span>
          {onCancelGeneration && (
            <button
              type="button"
              onClick={onCancelGeneration}
              title="Stop Deep Research Generation"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 9px',
                borderRadius: '6px',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                background: 'rgba(239, 68, 68, 0.18)',
                color: '#fca5a5',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Square size={11} fill="currentColor" /> Stop
            </button>
          )}
        </div>
      </div>

      <div style={{ marginTop: '9px', color: '#bae6fd', fontSize: '0.8rem', lineHeight: 1.45, overflowWrap: 'anywhere' }}>
        “{query}”
      </div>

      <div style={{ marginTop: '7px', display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
        <span style={{ color: '#7dd3fc', fontWeight: 650 }}>{phaseLabel}</span>
        {progress && <span>· {progress.searches_completed || 0}/{progress.search_queries?.length || 0} searches</span>}
        {progress?.search_results_found > 0 && <span>· {progress.search_results_found} results found</span>}
        {progress?.images_found > 0 && <span>· {progress.images_found} images collected</span>}
      </div>

      {Array.isArray(progress?.search_queries) && progress.search_queries.length > 0 && (
        <div style={{ marginTop: '10px' }}>
          <span style={{ display: 'block', marginBottom: '6px', color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            2-Stage Search Queries ({progress.searches_completed || 0}/{progress.search_queries.length})
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            {progress.search_queries.map((q: string, idx: number) => (
              <span
                key={`sq-${idx}`}
                style={{
                  padding: '3px 8px',
                  borderRadius: '6px',
                  background: idx === 0 ? 'rgba(56, 189, 248, 0.16)' : 'rgba(99, 102, 241, 0.14)',
                  border: idx === 0 ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid rgba(99, 102, 241, 0.25)',
                  color: idx === 0 ? '#7dd3fc' : '#c4b5fd',
                  fontSize: '0.69rem',
                  fontFamily: 'var(--font-code)',
                }}
              >
                {idx === 0 ? '🎯 Stage 1 Grounding: ' : `🔎 Stage 2 Sub-query: `}{q}
              </span>
            ))}
          </div>
        </div>
      )}

      {progress?.grounding_context && (
        <div style={{ marginTop: '10px', padding: '9px 11px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.3)', background: 'rgba(15, 23, 42, 0.55)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px', color: '#7dd3fc', fontSize: '0.68rem', fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <FileText size={12} /> Stage 1 Verified Grounding Facts
          </div>
          <div style={{ color: '#bae6fd', fontSize: '0.71rem', fontFamily: 'var(--font-code)', whiteSpace: 'pre-wrap', maxHeight: '110px', overflowY: 'auto', lineHeight: 1.4 }}>
            {progress.grounding_context}
          </div>
        </div>
      )}

      <div style={{ marginTop: '10px' }}>
        <span style={{ display: 'block', marginBottom: '6px', color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Sources inspected
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {inspectedPages.length === 0 ? (
            <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>Domains will appear here as pages are read…</span>
          ) : inspectedPages.map((page: any, index: number) => {
            let domain = page.url || 'source';
            let favicon = '';
            try {
              const parsed = new URL(page.url);
              domain = parsed.hostname.replace(/^www\./, '');
              favicon = `${parsed.origin}/favicon.ico`;
            } catch (_) {}
            return (
              <a
                key={`${page.url}-${index}`}
                href={page.url}
                target="_blank"
                rel="noreferrer"
                title={`${page.title || domain}${page.discovery === 'website_link' ? ' · followed website link' : ''}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', maxWidth: '190px', padding: '4px 8px 4px 5px', borderRadius: '999px', border: '1px solid rgba(125, 211, 252, 0.2)', background: 'rgba(15, 23, 42, 0.52)', color: '#bae6fd', textDecoration: 'none', fontSize: '0.69rem' }}
              >
                <span style={{ position: 'relative', display: 'grid', placeItems: 'center', width: '17px', height: '17px', flexShrink: 0, overflow: 'hidden', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.12)' }}>
                  <Globe size={11} color="#7dd3fc" />
                  {favicon && <img src={favicon} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} style={{ position: 'absolute', inset: '2px', width: '13px', height: '13px', objectFit: 'contain' }} />}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{domain}</span>
                {page.discovery === 'website_link' && <ExternalLink size={9} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />}
              </a>
            );
          })}
        </div>
      </div>

      {progress?.phase === 'classifying_links' && linkAnalysis && (
        <div style={{ marginTop: '10px', padding: '10px 11px', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.3)', background: 'linear-gradient(135deg, rgba(30, 64, 175, 0.12), rgba(124, 58, 237, 0.09))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
            {linkAnalysis.status === 'complete' ? <CheckCircle2 size={13} color="#5eead4" /> : <Loader2 size={13} className="spin" color="#93c5fd" />}
            <strong style={{ color: '#bfdbfe', fontSize: '0.72rem' }}>
              {linkAnalysis.stage === 'confirming_pages' ? 'AI is checking fetched-page content' : 'AI is ranking discovered links'}
            </strong>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.67rem' }}>depth {linkAnalysis.depth}</span>
            <span style={{ marginLeft: 'auto', color: '#c4b5fd', fontFamily: 'var(--font-code)', fontSize: '0.66rem' }}>
              {linkAnalysis.batches_completed}/{linkAnalysis.batches_total} batches · {linkAnalysis.items_completed}/{linkAnalysis.candidates} {linkAnalysis.stage === 'confirming_pages' ? 'pages' : 'links'}
            </span>
          </div>
          <div style={{ height: '5px', marginTop: '8px', overflow: 'hidden', borderRadius: '999px', background: 'rgba(30, 41, 59, 0.8)' }}>
            <div style={{ width: `${linkAnalysis.batches_total > 0 ? Math.max(4, Math.min(100, (linkAnalysis.batches_completed / linkAnalysis.batches_total) * 100)) : 100}%`, height: '100%', borderRadius: 'inherit', background: linkAnalysis.status === 'complete' ? '#2dd4bf' : 'linear-gradient(90deg, #3b82f6, #8b5cf6)', transition: 'width 180ms ease' }} />
          </div>
          <div style={{ marginTop: '7px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', color: 'var(--text-muted)', fontSize: '0.65rem' }}>
            {Array.isArray(linkAnalysis.active_sites) && linkAnalysis.active_sites.length > 0 ? (
              <>
                <span>Active model batches:</span>
                {linkAnalysis.active_sites.map((site: string, index: number) => <span key={`${site}-${index}`} style={{ padding: '2px 6px', borderRadius: '999px', border: '1px solid rgba(147, 197, 253, 0.18)', color: '#bfdbfe', background: 'rgba(30, 58, 138, 0.14)' }}>{site}</span>)}
              </>
            ) : <span>{linkAnalysis.status === 'complete' ? 'Classification complete; selecting the next pages.' : 'Preparing bounded model batches…'}</span>}
          </div>
          {Array.isArray(linkAnalysis.recent_decisions) && linkAnalysis.recent_decisions.length > 0 && (
            <div style={{ marginTop: '9px', display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '140px', overflowY: 'auto' }}>
              {linkAnalysis.recent_decisions.map((dec: any, idx: number) => {
                let domain = dec.url;
                let favicon = '';
                try {
                  const parsed = new URL(dec.url);
                  domain = parsed.hostname.replace(/^www\./, '');
                  favicon = `${parsed.origin}/favicon.ico`;
                } catch (_) {}
                const isRel = dec.classification === 'relevant';
                const isUnc = dec.classification === 'uncertain';
                const badgeColor = isRel ? '#2dd4bf' : isUnc ? '#facc15' : '#fb7185';
                const badgeBg = isRel ? 'rgba(45, 212, 191, 0.12)' : isUnc ? 'rgba(250, 204, 21, 0.12)' : 'rgba(251, 113, 133, 0.12)';
                const badgeBorder = isRel ? 'rgba(45, 212, 191, 0.3)' : isUnc ? 'rgba(250, 204, 21, 0.3)' : 'rgba(251, 113, 133, 0.3)';
                return (
                  <div key={`${dec.url}-${idx}`} style={{ padding: '5px 8px', borderRadius: '6px', background: 'rgba(15, 23, 42, 0.45)', border: '1px solid rgba(147, 197, 253, 0.12)', fontSize: '0.67rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                      <a
                        href={dec.url}
                        target="_blank"
                        rel="noreferrer"
                        title={dec.url}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#bfdbfe', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none', minWidth: 0 }}
                        onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
                      >
                        <span style={{ position: 'relative', display: 'grid', placeItems: 'center', width: '15px', height: '15px', flexShrink: 0, overflow: 'hidden', borderRadius: '3px', background: 'rgba(56, 189, 248, 0.12)' }}>
                          <Globe size={10} color="#7dd3fc" />
                          {favicon && <img src={favicon} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} style={{ position: 'absolute', inset: '1px', width: '13px', height: '13px', objectFit: 'contain' }} />}
                        </span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {dec.title || domain}
                        </span>
                      </a>
                      <span style={{ padding: '1px 6px', borderRadius: '999px', background: badgeBg, border: `1px solid ${badgeBorder}`, color: badgeColor, fontSize: '0.62rem', fontWeight: 700, flexShrink: 0 }}>
                        {dec.classification} ({dec.relevance_score}/100)
                      </span>
                    </div>
                    {dec.reason && (
                      <span style={{ display: 'block', marginTop: '2px', color: 'var(--text-muted)', fontSize: '0.64rem', overflowWrap: 'anywhere' }}>
                        {dec.reason}
                      </span>
                    )}
                    {(dec.parent_title || dec.parent_url) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px', color: '#7dd3fc', fontSize: '0.63rem' }}>
                        <CornerDownRight size={10} style={{ flexShrink: 0, opacity: 0.7 }} />
                        <span style={{ color: 'var(--text-muted)' }}>Found on:</span>
                        <a
                          href={dec.parent_url || '#'}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#93c5fd', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
                        >
                          {dec.parent_title || dec.parent_url}
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <ResearchTrail
        live
        steps={Array.isArray(progress?.steps) ? progress.steps : []}
        searchQueries={Array.isArray(progress?.search_queries) ? progress.search_queries : []}
      />

      {(noteBatches.length > 0 || progress?.phase === 'analyzing') && (
        <div style={{ marginTop: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#c4b5fd', fontSize: '0.68rem', fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <Brain size={12} /> Live AI relevance notes
            </span>
            <span style={{ padding: '3px 8px', borderRadius: '999px', border: '1px solid rgba(167, 139, 250, 0.28)', background: 'rgba(124, 58, 237, 0.12)', color: '#ddd6fe', fontFamily: 'var(--font-code)', fontSize: '0.65rem' }}>
              AI note context: {liveNoteCount}/{inspectedPages.length} notes · ~{liveNoteTokens.toLocaleString()} tokens
            </span>
          </div>
          {noteBatches.length === 0 ? (
            <div style={{ padding: '8px 10px', borderRadius: '7px', border: '1px solid rgba(167, 139, 250, 0.2)', background: 'rgba(76, 29, 149, 0.08)', color: 'var(--text-muted)', fontSize: '0.71rem' }}>
              Preparing source batches for the active model…
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '7px' }}>
              {noteBatches.map((batch: any, index: number) => (
                <div key={`${batch.source_ids?.join('-') || index}`} style={{ minWidth: 0, padding: '8px', borderRadius: '7px', border: '1px solid rgba(167, 139, 250, 0.22)', background: 'rgba(76, 29, 149, 0.09)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', color: '#c4b5fd', fontSize: '0.68rem' }}>
                    {batch.status === 'generating' ? <Loader2 size={11} className="spin" /> : batch.status === 'error' ? <XCircle size={11} color="#fb7185" /> : <CheckCircle2 size={11} color="#5eead4" />}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0, flexWrap: 'wrap' }}>
                      {Array.isArray(batch.sources) && batch.sources.length > 0 ? batch.sources.map((source: any, sourceIndex: number) => (
                        <a
                          key={`${source.url || source.site_name}-${sourceIndex}`}
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          title={source.title || source.url}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', minWidth: 0, maxWidth: '145px', padding: '2px 5px', borderRadius: '999px', border: '1px solid rgba(167, 139, 250, 0.2)', color: '#ddd6fe', textDecoration: 'none', background: 'rgba(2, 6, 23, 0.3)' }}
                        >
                          <WebsiteFavicon url={source.url} size={14} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.site_name || source.title || 'Website'}</span>
                        </a>
                      )) : <strong>Web sources</strong>}
                    </div>
                    <span style={{ marginLeft: 'auto', color: batch.status === 'error' ? '#fb7185' : 'var(--text-dim)', fontSize: '0.62rem' }}>{batch.status}</span>
                  </div>
                  <pre style={{ minHeight: '48px', maxHeight: '150px', margin: 0, padding: '7px 8px', overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', border: '1px solid rgba(167, 139, 250, 0.13)', background: 'rgba(2, 6, 23, 0.42)', color: '#ddd6fe', fontSize: '0.65rem', lineHeight: 1.4 }}>
                    {batch.content || (batch.status === 'generating' ? 'Waiting for the first generated tokens…' : 'No note text was produced.')}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: '8px' }}>
        {workflow.map((step) => {
          const StepIcon = step.icon;
          return (
            <div key={step.label} style={{ display: 'flex', gap: '8px', padding: '9px 10px', borderRadius: '8px', border: '1px solid rgba(125, 211, 252, 0.15)', background: 'rgba(15, 23, 42, 0.38)' }}>
              <StepIcon size={15} style={{ flexShrink: 0, marginTop: '1px', color: '#38bdf8' }} />
              <div style={{ minWidth: 0 }}>
                <span style={{ display: 'block', color: 'var(--text-main)', fontSize: '0.76rem', fontWeight: 650 }}>{step.label}</span>
                <span style={{ display: 'block', marginTop: '2px', color: 'var(--text-muted)', fontSize: '0.7rem', lineHeight: 1.35 }}>{step.detail}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '10px', color: 'var(--text-muted)', fontSize: '0.7rem', lineHeight: 1.4 }}>
        Tasks can overlap. Exact search, page, link, and image counts will appear when the research completes.
      </div>
    </div>
  );
};

const RankedLinkInspectorView: React.FC<{ links: any[] }> = ({ links }) => {
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'score' | 'domain' | 'provenance'>('score');
  const [statusFilter, setStatusFilter] = useState<'all' | 'relevant' | 'uncertain' | 'not_relevant'>('all');
  const [expandedContexts, setExpandedContexts] = useState<Set<string>>(new Set());

  const toggleContext = (url: string) => {
    setExpandedContexts((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const filteredLinks = useMemo(() => {
    let result = links.filter((link) => {
      const q = query.trim().toLowerCase();
      if (q) {
        const text = `${link.title} ${link.url} ${link.parent_title} ${link.reason} ${link.anchor_text || ''} ${link.surrounding_text || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      if (statusFilter === 'relevant' && link.classification !== 'relevant' && link.relevance_score < 70) return false;
      if (statusFilter === 'uncertain' && (link.classification !== 'uncertain' || link.relevance_score < 40 || link.relevance_score >= 70)) return false;
      if (statusFilter === 'not_relevant' && link.classification !== 'not_relevant' && link.relevance_score >= 40) return false;
      return true;
    });

    return result.sort((a, b) => {
      if (sortBy === 'score') return b.relevance_score - a.relevance_score;
      if (sortBy === 'domain') {
        let domainA = a.url;
        let domainB = b.url;
        try { domainA = new URL(a.url).hostname; } catch (_) {}
        try { domainB = new URL(b.url).hostname; } catch (_) {}
        return domainA.localeCompare(domainB);
      }
      if (sortBy === 'provenance') return (a.parent_title || '').localeCompare(b.parent_title || '');
      return 0;
    });
  }, [links, query, sortBy, statusFilter]);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#060b16' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(56, 189, 248, 0.16)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', background: 'rgba(15, 23, 42, 0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '200px', background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(147, 197, 253, 0.2)', borderRadius: '6px', padding: '4px 8px' }}>
          <Search size={13} color="#94a3b8" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search links, domains, page text, AI reasons..."
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#f8fafc', fontSize: '0.72rem' }}
          />
          {query && <X size={12} color="#94a3b8" style={{ cursor: 'pointer' }} onClick={() => setQuery('')} />}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.7rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            style={{ background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(147, 197, 253, 0.25)', color: '#bae6fd', padding: '4px 7px', borderRadius: '5px', fontSize: '0.69rem', outline: 'none' }}
          >
            <option value="score">Relevance Score (High → Low)</option>
            <option value="domain">Base Domain (A-Z)</option>
            <option value="provenance">Parent Source (A-Z)</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {(['all', 'relevant', 'uncertain', 'not_relevant'] as const).map((filter) => {
            const active = statusFilter === filter;
            const label = filter === 'all' ? `All (${links.length})` : filter === 'relevant' ? 'Relevant (≥70)' : filter === 'uncertain' ? 'Uncertain (40-69)' : 'Not Relevant (<40)';
            return (
              <button
                key={filter}
                type="button"
                onClick={() => setStatusFilter(filter)}
                style={{
                  padding: '3px 8px',
                  borderRadius: '999px',
                  border: `1px solid ${active ? '#38bdf8' : 'rgba(148, 163, 184, 0.2)'}`,
                  background: active ? 'rgba(56, 189, 248, 0.16)' : 'transparent',
                  color: active ? '#38bdf8' : 'var(--text-muted)',
                  fontSize: '0.65rem',
                  fontWeight: active ? 650 : 400,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, padding: '14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filteredLinks.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            No discovered links matched your search or status filter.
          </div>
        ) : (
          filteredLinks.map((item, index) => {
            const isRel = item.relevance_score >= 70 || item.classification === 'relevant';
            const isUnc = !isRel && (item.relevance_score >= 40 || item.classification === 'uncertain');
            const scoreColor = isRel ? '#2dd4bf' : isUnc ? '#facc15' : '#fb7185';
            const scoreBg = isRel ? 'rgba(45, 212, 191, 0.12)' : isUnc ? 'rgba(250, 204, 21, 0.12)' : 'rgba(251, 113, 133, 0.12)';
            const scoreBorder = isRel ? 'rgba(45, 212, 191, 0.3)' : isUnc ? 'rgba(250, 204, 21, 0.3)' : 'rgba(251, 113, 133, 0.3)';

            let confirmationLabel = isRel ? 'Skipped (Depth / Budget Cap)' : 'Skipped (Low Relevance)';
            let confirmationColor = 'var(--text-dim)';
            if (item.confirmation === 'confirmed_relevant') {
              confirmationLabel = 'Followed & Confirmed';
              confirmationColor = '#2dd4bf';
            } else if (item.status === 'checked') {
              confirmationLabel = 'Followed Link';
              confirmationColor = '#60a5fa';
            } else if (item.status === 'failed') {
              confirmationLabel = 'Fetch Failed';
              confirmationColor = '#f87171';
            } else if (item.confirmation === 'low_relevance') {
              confirmationLabel = 'Checked: Low Relevance';
              confirmationColor = '#fbbf24';
            }

            const hasContext = Boolean(item.surrounding_text || item.heading || item.section || item.anchor_text);
            const isExpanded = expandedContexts.has(item.url);

            return (
              <div
                key={`${item.url}-${index}`}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(147, 197, 253, 0.14)',
                  background: 'rgba(15, 23, 42, 0.6)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: '7px', color: '#7dd3fc', fontWeight: 650, fontSize: '0.76rem', textDecoration: 'none', minWidth: 0, overflow: 'hidden' }}
                    onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
                  >
                    <WebsiteFavicon url={item.url} size={15} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                  </a>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ padding: '2px 7px', borderRadius: '999px', background: scoreBg, border: `1px solid ${scoreBorder}`, color: scoreColor, fontSize: '0.64rem', fontWeight: 700 }}>
                      Score {item.relevance_score}/100 · {item.classification}
                    </span>
                    <span style={{ padding: '2px 7px', borderRadius: '999px', background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(148, 163, 184, 0.2)', color: confirmationColor, fontSize: '0.62rem' }}>
                      {confirmationLabel}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                  <span style={{ color: 'var(--text-dim)' }}>Discovered on:</span>
                  <a
                    href={item.parent_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#93c5fd', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '350px' }}
                    onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
                  >
                    {item.parent_title}
                  </a>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-dim)' }}>Depth {item.depth}</span>
                </div>

                {item.reason && (
                  <div style={{ padding: '6px 9px', borderRadius: '5px', background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(56, 189, 248, 0.1)', color: '#cbd5e1', fontSize: '0.68rem', lineHeight: 1.4 }}>
                    <strong style={{ color: '#38bdf8', fontSize: '0.64rem', display: 'block', marginBottom: '2px' }}>AI Decision Reason:</strong>
                    {item.reason}
                  </div>
                )}

                {hasContext && (
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleContext(item.url)}
                      style={{ background: 'transparent', border: 'none', color: '#93c5fd', fontSize: '0.66rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: 0, marginTop: '2px' }}
                    >
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      {isExpanded ? 'Hide Page Context' : 'View Link Context (Surrounding Page Text)'}
                    </button>

                    {isExpanded && (
                      <div style={{ marginTop: '5px', padding: '8px 10px', borderRadius: '6px', background: 'rgba(2, 6, 23, 0.7)', border: '1px solid rgba(147, 197, 253, 0.18)', fontSize: '0.67rem', color: '#cbd5e1', lineHeight: 1.45 }}>
                        {item.parent_excerpt && (
                          <div style={{ marginBottom: '6px', color: '#94a3b8' }}>
                            <strong style={{ color: '#93c5fd', display: 'block', marginBottom: '2px' }}>Parent Page Excerpt (Model Context):</strong>
                            <p style={{ margin: 0, color: '#cbd5e1', background: 'rgba(15, 23, 42, 0.6)', padding: '6px 8px', borderRadius: '4px', border: '1px solid rgba(147, 197, 253, 0.12)', fontSize: '0.66rem', maxHeight: '120px', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                              {item.parent_excerpt}
                            </p>
                          </div>
                        )}
                        {item.anchor_text && (
                          <div style={{ marginBottom: '4px' }}>
                            <strong style={{ color: '#93c5fd' }}>Anchor Text:</strong> <span style={{ color: '#f8fafc' }}>"{item.anchor_text}"</span>
                          </div>
                        )}
                        {(item.aria_label || item.title_attr) && (
                          <div style={{ marginBottom: '4px', color: '#94a3b8' }}>
                            {item.aria_label && <div><strong style={{ color: '#93c5fd' }}>Aria Label:</strong> "{item.aria_label}"</div>}
                            {item.title_attr && <div style={{ marginTop: '2px' }}><strong style={{ color: '#93c5fd' }}>Title Tooltip:</strong> "{item.title_attr}"</div>}
                          </div>
                        )}
                        {(item.heading || item.section) && (
                          <div style={{ marginBottom: '4px', color: '#94a3b8' }}>
                            <strong style={{ color: '#93c5fd' }}>Section / Heading:</strong> {item.heading || item.section}
                          </div>
                        )}
                        {Array.isArray(item.url_path_hints) && item.url_path_hints.length > 0 && (
                          <div style={{ marginBottom: '4px', color: '#94a3b8' }}>
                            <strong style={{ color: '#93c5fd' }}>URL Path Hints:</strong>{' '}
                            {item.url_path_hints.map((hint: string, hIdx: number) => (
                              <span key={`hint-${hIdx}`} style={{ display: 'inline-block', padding: '1px 5px', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.25)', color: '#38bdf8', fontSize: '0.62rem', marginRight: '4px' }}>
                                {hint}
                              </span>
                            ))}
                          </div>
                        )}
                        {item.surrounding_text && (
                          <div>
                            <strong style={{ color: '#93c5fd', display: 'block', marginBottom: '2px' }}>Surrounding Page Text:</strong>
                            <p style={{ margin: 0, fontStyle: 'italic', color: '#94a3b8', background: 'rgba(15, 23, 42, 0.5)', padding: '6px 8px', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.05)', whiteSpace: 'pre-wrap' }}>
                              "{item.surrounding_text}"
                            </p>
                          </div>
                        )}
                        {(item.text_before || item.text_after) && (
                          <div style={{ marginTop: '4px', color: '#94a3b8', fontSize: '0.65rem' }}>
                            {item.text_before && <div><strong style={{ color: '#93c5fd' }}>Text Before Link:</strong> "{item.text_before}"</div>}
                            {item.text_after && <div style={{ marginTop: '2px' }}><strong style={{ color: '#93c5fd' }}>Text After Link:</strong> "{item.text_after}"</div>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

const FinalAnswerContextPreview: React.FC<{
  modelContext: string;
  fullContext: string;
  sources: any[];
}> = ({ modelContext, fullContext, sources }) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [contextView, setContextView] = useState<'relevant' | 'ranked_links' | 'model' | 'raw'>('model');
  const notes = sources.map((source) => source.ai_note).filter(Boolean);
  const noteContext = JSON.stringify(notes);
  const noteTokens = Math.ceil(noteContext.length / 4);
  const modelTokens = Math.ceil(modelContext.length / 4);
  const fullTokens = Math.ceil(fullContext.length / 4);

  const allDiscoveredLinks = useMemo(() => {
    const list: Array<{
      url: string;
      title: string;
      site_name?: string;
      parent_title: string;
      parent_url: string;
      parent_excerpt?: string | null;
      depth: number;
      relevance_score: number;
      classification: 'relevant' | 'uncertain' | 'not_relevant';
      confidence?: number;
      reason: string;
      confirmation?: string;
      confirmation_reason?: string;
      status: string;
      anchor_text?: string;
      surrounding_text?: string | null;
      text_before?: string | null;
      text_after?: string | null;
      heading?: string | null;
      section?: string | null;
      title_attr?: string | null;
      aria_label?: string | null;
      url_path_hints?: string[];
    }> = [];

    for (const source of sources) {
      if (Array.isArray(source.discovered_links)) {
        const parentExcerpt = (source.content && source.content.trim().length > 0) ? source.content.slice(0, 3000) : source.excerpt;
        for (const link of source.discovered_links) {
          list.push({
            url: link.url,
            title: link.title || link.site_name || link.url,
            site_name: link.site_name,
            parent_title: source.title || source.url,
            parent_url: source.url,
            parent_excerpt: parentExcerpt,
            depth: link.depth ?? 1,
            relevance_score: link.relevance_score ?? 0,
            classification: link.classification || (link.relevance_score >= 70 ? 'relevant' : link.relevance_score >= 40 ? 'uncertain' : 'not_relevant'),
            confidence: link.confidence,
            reason: link.reason || '',
            confirmation: link.confirmation,
            confirmation_reason: link.confirmation_reason,
            status: link.status || 'not_checked',
            anchor_text: link.anchor_text || link.title,
            surrounding_text: link.surrounding_text || null,
            text_before: link.text_before || null,
            text_after: link.text_after || null,
            heading: link.heading || null,
            section: link.section || null,
            title_attr: link.title_attr || null,
            aria_label: link.aria_label || null,
            url_path_hints: link.url_path_hints || [],
          });
        }
      }
    }
    return list;
  }, [sources]);

  const relevantSources = sources.map((source) => {
    const relevantLinks = (Array.isArray(source.discovered_links) ? source.discovered_links : [])
      .filter((link: any) =>
        link.status !== 'failed' &&
        (link.confirmation === 'confirmed_relevant' || link.classification === 'relevant'),
      );
    return { source, relevantLinks };
  }).filter(({ source, relevantLinks }) => source.ai_note?.relevant || relevantLinks.length > 0);

  const relevantContext = JSON.stringify({
    relevant_sources: relevantSources.map(({ source, relevantLinks }) => ({
      source_id: source.id,
      title: source.title,
      url: source.url,
      ai_note: source.ai_note || null,
      relevant_links: relevantLinks.map((link: any) => ({
        title: link.title,
        url: link.url,
        status: link.status,
        confirmation: link.confirmation,
        relevance_score: link.relevance_score,
        confidence: link.confidence,
        reason: link.reason,
        confirmation_reason: link.confirmation_reason,
      })),
    })),
  }, null, 2);
  const activeContext = contextView === 'relevant'
    ? relevantContext
    : contextView === 'model' ? modelContext : fullContext;

  const copyContext = async () => {
    try {
      await navigator.clipboard.writeText(activeContext);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (_) {}
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginTop: '7px', flexWrap: 'wrap' }}>
        <span style={{ padding: '3px 8px', borderRadius: '999px', border: '1px solid rgba(167, 139, 250, 0.25)', background: 'rgba(124, 58, 237, 0.1)', color: '#ddd6fe', fontFamily: 'var(--font-code)', fontSize: '0.65rem' }}>
          Model synthesis payload: ~{modelTokens.toLocaleString()} tokens · {modelContext.length.toLocaleString()} chars
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 9px', borderRadius: '6px', border: '1px solid rgba(56, 189, 248, 0.3)', background: 'rgba(14, 116, 144, 0.12)', color: '#bae6fd', fontSize: '0.67rem', fontWeight: 650, cursor: 'pointer' }}
        >
          <Eye size={12} /> View AI final-answer context
        </button>
      </div>
      {open && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="AI final-answer context"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'grid', placeItems: 'center', padding: '24px', background: 'rgba(2, 6, 23, 0.82)', backdropFilter: 'blur(5px)' }}
        >
          <div style={{ width: 'min(1000px, 96vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', borderRadius: '12px', border: '1px solid rgba(56, 189, 248, 0.35)', background: '#0b1120', boxShadow: '0 24px 80px rgba(0, 0, 0, 0.55)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '12px 14px', borderBottom: '1px solid rgba(56, 189, 248, 0.2)' }}>
              <Brain size={16} color="#c4b5fd" />
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', color: 'var(--text-main)', fontSize: '0.82rem' }}>Deep-research context for the final answer</strong>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>model payload ~{modelTokens.toLocaleString()} tokens · full result ~{fullTokens.toLocaleString()} tokens · {notes.length} relevance notes (~{noteTokens.toLocaleString()} tokens)</span>
              </div>
              <button type="button" onClick={copyContext} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 8px', borderRadius: '5px', border: '1px solid var(--border-color)', background: 'rgba(30, 41, 59, 0.7)', color: copied ? '#5eead4' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.68rem' }}>
                {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close context preview" style={{ display: 'grid', placeItems: 'center', width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={15} /></button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderBottom: '1px solid rgba(167, 139, 250, 0.16)', background: 'rgba(124, 58, 237, 0.07)', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setContextView('relevant')} style={{ padding: '5px 9px', borderRadius: '6px', border: `1px solid ${contextView === 'relevant' ? 'rgba(167, 139, 250, 0.5)' : 'transparent'}`, background: contextView === 'relevant' ? 'rgba(124, 58, 237, 0.18)' : 'transparent', color: contextView === 'relevant' ? '#ddd6fe' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.69rem', fontWeight: 650 }}>
                Relevant notes &amp; links
              </button>
              <button type="button" onClick={() => setContextView('ranked_links')} style={{ padding: '5px 9px', borderRadius: '6px', border: `1px solid ${contextView === 'ranked_links' ? 'rgba(56, 189, 248, 0.5)' : 'transparent'}`, background: contextView === 'ranked_links' ? 'rgba(14, 116, 144, 0.2)' : 'transparent', color: contextView === 'ranked_links' ? '#bae6fd' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.69rem', fontWeight: 650 }}>
                Ranked Links &amp; AI Decisions ({allDiscoveredLinks.length})
              </button>
              <button type="button" onClick={() => setContextView('model')} style={{ padding: '5px 9px', borderRadius: '6px', border: `1px solid ${contextView === 'model' ? 'rgba(45, 212, 191, 0.5)' : 'transparent'}`, background: contextView === 'model' ? 'rgba(20, 184, 166, 0.16)' : 'transparent', color: contextView === 'model' ? '#99f6e4' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.69rem', fontWeight: 650 }}>
                Exact model payload
              </button>
              <button type="button" onClick={() => setContextView('raw')} style={{ padding: '5px 9px', borderRadius: '6px', border: `1px solid ${contextView === 'raw' ? 'rgba(56, 189, 248, 0.5)' : 'transparent'}`, background: contextView === 'raw' ? 'rgba(14, 116, 144, 0.18)' : 'transparent', color: contextView === 'raw' ? '#bae6fd' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.69rem', fontWeight: 650 }}>
                Full tool result
              </button>
              <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', fontSize: '0.65rem' }}>
                {contextView === 'relevant' ? `${relevantSources.length} relevant sources` : contextView === 'ranked_links' ? `${allDiscoveredLinks.length} discovered links` : `${activeContext.length.toLocaleString()} characters · ~${Math.ceil(activeContext.length / 4).toLocaleString()} tokens`}
              </span>
            </div>
            {contextView === 'ranked_links' ? (
              <RankedLinkInspectorView links={allDiscoveredLinks} />
            ) : contextView === 'relevant' ? (
              <div style={{ flex: 1, minHeight: 0, padding: '14px', overflow: 'auto', background: '#060b16', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ color: '#cbd5e1', fontSize: '0.7rem', lineHeight: 1.45 }}>
                  This filtered view shows relevant AI notes and relevant links for readability. Use “Exact raw context” to see the complete serialized payload actually placed in the model conversation.
                </div>
                {relevantSources.length === 0 ? (
                  <div style={{ padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.74rem' }}>No sources were classified as relevant.</div>
                ) : relevantSources.map(({ source, relevantLinks }) => (
                  <div key={`${source.id}-${source.url}`} style={{ padding: '11px 12px', borderRadius: '8px', border: '1px solid rgba(167, 139, 250, 0.24)', background: 'rgba(30, 41, 59, 0.45)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                      <WebsiteFavicon url={source.url} size={16} />
                      <a href={source.url} target="_blank" rel="noreferrer" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#7dd3fc', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 650 }}>{source.title || source.url}</a>
                      <span style={{ marginLeft: 'auto', flexShrink: 0, color: '#c4b5fd', fontFamily: 'var(--font-code)', fontSize: '0.64rem' }}>{source.id}</span>
                    </div>
                    {source.ai_note && (
                      <div style={{ marginTop: '8px', padding: '9px 10px', borderRadius: '7px', border: '1px solid rgba(167, 139, 250, 0.2)', background: 'rgba(124, 58, 237, 0.08)', color: '#ddd6fe', fontSize: '0.7rem', lineHeight: 1.48 }}>
                        <strong style={{ display: 'block', marginBottom: '5px', color: '#c4b5fd' }}>AI relevance note</strong>
                        {source.ai_note.note && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{source.ai_note.note}</p>}
                        {Array.isArray(source.ai_note.key_points) && source.ai_note.key_points.length > 0 && <ul style={{ margin: '7px 0 0 18px', padding: 0, color: '#cbd5e1' }}>{source.ai_note.key_points.map((point: string, index: number) => <li key={`${source.id}-context-point-${index}`}>{point}</li>)}</ul>}
                        {source.ai_note.limitations && <p style={{ margin: '7px 0 0', color: '#a5b4fc' }}><strong>Limitation:</strong> {source.ai_note.limitations}</p>}
                      </div>
                    )}
                    {relevantLinks.length > 0 && (
                      <div style={{ marginTop: '8px' }}>
                        <strong style={{ display: 'block', marginBottom: '5px', color: '#99f6e4', fontSize: '0.67rem' }}>Relevant links</strong>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          {relevantLinks.map((link: any, index: number) => (
                            <a key={`${link.url}-${index}`} href={link.url} target="_blank" rel="noreferrer" title={link.reason || link.title} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 7px', borderRadius: '6px', border: '1px solid rgba(45, 212, 191, 0.16)', background: 'rgba(20, 184, 166, 0.06)', color: link.confirmation === 'confirmed_relevant' ? '#5eead4' : '#93c5fd', textDecoration: 'none', fontSize: '0.68rem' }}>
                              <WebsiteFavicon url={link.url} size={14} />
                              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link.title || link.site_name || link.url}</span>
                              <span style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--text-dim)', fontSize: '0.61rem' }}>{link.confirmation === 'confirmed_relevant' ? 'confirmed' : `score ${link.relevance_score}`}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '9px 14px', borderBottom: '1px solid rgba(56, 189, 248, 0.12)', color: '#cbd5e1', fontSize: '0.68rem', lineHeight: 1.4 }}>
                  {contextView === 'model'
                    ? <>This compact evidence packet is placed in the model conversation for final synthesis. The model also sees system instructions, earlier messages, and the final-answer reminder.</>
                    : <>This is the complete serialized <code>deep_research</code> result retained for debugging and UI inspection. It is not all sent to final synthesis.</>}
                </div>
                <pre style={{ flex: 1, minHeight: 0, margin: 0, padding: '14px', overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: '#dbeafe', background: '#060b16', fontFamily: 'var(--font-code)', fontSize: '0.7rem', lineHeight: 1.45 }}>{activeContext}</pre>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

const DeepResearchResultsView: React.FC<{
  query: string;
  searchesCompleted: number;
  searchResultsFound?: number;
  linkedPagesRead: number;
  researchDate?: string;
  status?: string;
  sources: Array<{
    id: string;
    title: string;
    url: string;
    discovery: string;
    discovered_by?: string;
    excerpt?: string | null;
    content?: string;
    content_truncated?: boolean;
    depth?: number;
    relevant_links?: Array<{ title: string; url: string; site_name: string; depth: number; status: 'checked' | 'failed'; target_source_id: string | null; error: string | null }>;
    discovered_links?: Array<{
      title: string; url: string; site_name: string; depth: number;
      relevance: 'relevant' | 'not_relevant';
      classification: 'relevant' | 'uncertain' | 'not_relevant';
      relevance_score: number; confidence: number; reason: string;
      confirmation: 'not_checked' | 'confirmed_relevant' | 'low_relevance' | 'failed';
      confirmation_score: number | null; confirmation_reason: string | null;
      status: 'checked' | 'failed' | 'not_checked'; target_source_id: string | null; error: string | null;
    }>;
    link_summary?: { discovered: number; relevant_found: number; relevant_checked: number; relevant_failed: number; not_relevant: number; predicted_relevant?: number; uncertain?: number; confirmed_relevant?: number; low_relevance?: number };
    ai_note?: { source_id: string; relevant: boolean; note: string; key_points: string[]; quotes?: string[]; limitations: string | null };
  }>;
  images: Array<{ id: string; url: string; alt: string; source_url: string; source_title: string }>;
  searchQueries?: string[];
  steps?: Array<{ id?: number; phase?: string; kind?: string; status?: string; label?: string; url?: string; detail?: string }>;
  errors?: string[];
  noteErrors?: string[];
  researchBudget?: { searches?: number; primary_pages?: number; follow_up_pages?: number; link_depth?: number; semantic_link_classification?: boolean; link_relevance_threshold?: number; evidence_characters?: number };
  modelContext: string;
  fullContext: string;
}> = ({ query, searchesCompleted, searchResultsFound, linkedPagesRead, researchDate, status, sources, images, searchQueries = [], steps = [], errors = [], noteErrors = [], researchBudget, modelContext, fullContext }) => (
  <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
    <div style={{ padding: '8px 10px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '6px', border: '1px solid rgba(56, 189, 248, 0.25)', fontSize: '0.775rem' }}>
      <strong style={{ color: '#38bdf8' }}>Deep research:</strong>{' '}
      <span style={{ color: 'var(--text-main)' }}>{query}</span>
      <span style={{ display: 'block', marginTop: '4px', color: 'var(--text-muted)' }}>
        {status || 'complete'} · {searchesCompleted} searches{searchResultsFound !== undefined ? ` · ${searchResultsFound} results` : ''} · {sources.length} pages inspected · {images.length} images · {linkedPagesRead} followed website links{researchDate ? ` · ${researchDate}` : ''}
      </span>
      {researchBudget && (
        <span style={{ display: 'block', marginTop: '3px', color: 'var(--text-dim)', fontSize: '0.68rem' }}>
          Budget: {researchBudget.searches ?? searchesCompleted} searches · {researchBudget.primary_pages ?? 'adaptive'} primary pages · {researchBudget.follow_up_pages ?? 'adaptive'} follow-ups · link depth {researchBudget.link_depth ?? 1} · semantic ranking {researchBudget.semantic_link_classification === false ? 'off' : `on (≥${researchBudget.link_relevance_threshold ?? 70})`} · {Number(researchBudget.evidence_characters || 0).toLocaleString()} evidence characters
        </span>
      )}
      <FinalAnswerContextPreview modelContext={modelContext} fullContext={fullContext} sources={sources} />
    </div>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', padding: '8px 10px', borderRadius: '6px', border: '1px solid rgba(99, 102, 241, 0.24)', background: 'rgba(99, 102, 241, 0.08)', color: 'var(--text-muted)', fontSize: '0.71rem', lineHeight: 1.45 }}>
      <Info size={13} style={{ marginTop: '2px', flexShrink: 0, color: '#a5b4fc' }} />
      <span>
        <strong style={{ color: '#c7d2fe' }}>Website evidence and AI relevance notes are kept distinct.</strong>{' '}
        Excerpts and page content come from the linked websites. Boxes labeled “AI relevance note” are generated by the active model to extract information that directly addresses your request; the final answer is still a separate response.
      </span>
    </div>
    <ResearchTrail steps={steps} searchQueries={searchQueries} errors={errors} />
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '320px', overflowY: 'auto' }}>
      {sources.map((source) => {
        const presentation = getLinkPresentation(source.url);
        return (
          <details
            key={`${source.id}-${source.url}`}
            style={{ padding: '8px 10px', borderRadius: '7px', background: 'rgba(15, 23, 42, 0.5)', border: '1px solid var(--border-color)', color: '#38bdf8' }}
          >
            <summary style={{ cursor: 'pointer', fontSize: '0.78rem' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', maxWidth: '100%', verticalAlign: 'middle' }}>
                <WebsiteFavicon url={source.url} />
                <span style={{ color: 'var(--accent-teal)', fontFamily: 'var(--font-code)', fontSize: '0.72rem' }}>{source.id}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.title || presentation?.shortUrl || source.url}</span>
              </span>
              {source.discovery === 'website_link' && <span style={{ marginLeft: '7px', color: 'var(--text-muted)', fontSize: '0.68rem' }}>followed link</span>}
              {source.link_summary && source.link_summary.discovered > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', marginLeft: '8px', verticalAlign: 'middle', fontSize: '0.64rem' }}>
                  <span style={{ padding: '1px 6px', borderRadius: '999px', background: 'rgba(59, 130, 246, 0.12)', color: '#93c5fd' }}>{source.link_summary.predicted_relevant ?? source.link_summary.relevant_found} predicted</span>
                  <span style={{ padding: '1px 6px', borderRadius: '999px', background: 'rgba(56, 189, 248, 0.1)', color: '#7dd3fc' }}>{source.link_summary.relevant_checked} checked</span>
                  {(source.link_summary.confirmed_relevant ?? 0) > 0 && <span style={{ padding: '1px 6px', borderRadius: '999px', background: 'rgba(20, 184, 166, 0.12)', color: '#5eead4' }}>{source.link_summary.confirmed_relevant} confirmed</span>}
                </span>
              )}
            </summary>
            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.72rem', lineHeight: 1.45 }}>
              {source.ai_note && (
                <div style={{ marginBottom: '9px', padding: '9px 10px', borderRadius: '6px', border: '1px solid rgba(167, 139, 250, 0.3)', background: 'rgba(124, 58, 237, 0.1)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
                    <Brain size={13} color="#c4b5fd" />
                    <strong style={{ color: '#c4b5fd', fontSize: '0.7rem' }}>AI relevance note</strong>
                    <span style={{ marginLeft: 'auto', padding: '1px 6px', borderRadius: '999px', background: source.ai_note.relevant ? 'rgba(45, 212, 191, 0.12)' : 'rgba(148, 163, 184, 0.12)', color: source.ai_note.relevant ? '#5eead4' : 'var(--text-muted)', fontSize: '0.62rem', fontWeight: 700 }}>
                      {source.ai_note.relevant ? 'Relevant' : 'Low relevance'}
                    </span>
                  </div>
                  {source.ai_note.note && <p style={{ margin: 0, color: '#ddd6fe' }}>{source.ai_note.note}</p>}
                  {source.ai_note.key_points.length > 0 && (
                    <ul style={{ margin: '6px 0 0 17px', color: '#cbd5e1' }}>
                      {source.ai_note.key_points.map((point, index) => <li key={`${source.id}-note-${index}`}>{point}</li>)}
                    </ul>
                  )}
                  {Array.isArray(source.ai_note.quotes) && source.ai_note.quotes.length > 0 && (
                    <div style={{ marginTop: '7px', padding: '6px 8px', borderRadius: '5px', background: 'rgba(99, 102, 241, 0.14)', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
                      <strong style={{ color: '#a5b4fc', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Extracted Quotes:</strong>
                      <ul style={{ margin: '4px 0 0 16px', padding: 0, color: '#e2e8f0', fontSize: '0.72rem', fontStyle: 'italic' }}>
                        {source.ai_note.quotes.map((quote, qIdx) => (
                          <li key={`${source.id}-quote-${qIdx}`}>“{quote}”</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {source.ai_note.limitations && <p style={{ margin: '6px 0 0', color: '#a5b4fc' }}><strong>Limitation:</strong> {source.ai_note.limitations}</p>}
                </div>
              )}
              {Array.isArray(source.discovered_links) && source.discovered_links.length > 0 && (
                <div style={{ marginBottom: '9px', padding: '8px 9px', borderRadius: '6px', border: '1px solid rgba(56, 189, 248, 0.2)', background: 'rgba(14, 116, 144, 0.07)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                    <strong style={{ color: '#7dd3fc', fontSize: '0.68rem' }}>Links discovered on this page</strong>
                    {source.link_summary && <span style={{ color: 'var(--text-dim)', fontSize: '0.61rem' }}>{source.link_summary.discovered} found · {source.link_summary.predicted_relevant ?? source.link_summary.relevant_found} predicted relevant · {source.link_summary.relevant_checked} checked · {source.link_summary.confirmed_relevant ?? 0} confirmed relevant</span>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {source.discovered_links.map((link, index) => {
                      const linkColor = link.status === 'failed' || link.confirmation === 'failed'
                        ? '#fb7185'
                        : link.confirmation === 'confirmed_relevant'
                          ? '#5eead4'
                          : link.confirmation === 'low_relevance' || link.classification === 'uncertain'
                            ? '#fbbf24'
                            : link.classification === 'relevant'
                              ? '#60a5fa'
                              : 'var(--text-dim)';
                      const statusLabel = link.status === 'failed' || link.confirmation === 'failed'
                        ? 'failed'
                        : link.confirmation === 'confirmed_relevant'
                          ? 'confirmed relevant'
                          : link.confirmation === 'low_relevance'
                            ? 'low relevance after check'
                            : link.classification === 'relevant'
                              ? 'predicted relevant'
                              : link.classification === 'uncertain' ? 'uncertain' : 'not relevant';
                      return (
                        <div key={`${link.url}-${index}`} style={{ padding: '4px 5px', borderRadius: '5px', borderLeft: `2px solid ${linkColor}`, background: link.classification === 'not_relevant' ? 'rgba(100, 116, 139, 0.04)' : 'rgba(30, 41, 59, 0.35)', opacity: link.classification === 'not_relevant' ? 0.75 : 1 }}>
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noreferrer"
                            title={link.title || link.url}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, color: linkColor, textDecoration: 'none', fontSize: '0.68rem' }}
                          >
                            <WebsiteFavicon url={link.url} size={15} />
                            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link.site_name || link.title || link.url}</span>
                            <span style={{ flexShrink: 0, color: 'var(--text-dim)', fontSize: '0.61rem' }}>depth {link.depth}</span>
                            <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: '0.6rem', color: linkColor }}>{statusLabel}</span>
                          </a>
                          <div style={{ margin: '3px 0 0 21px', color: 'var(--text-muted)', fontSize: '0.61rem', lineHeight: 1.35 }}>
                            AI: {link.reason || 'No reason supplied'} · score {link.relevance_score}/100 · confidence {link.confidence}%
                            {link.confirmation_reason && <span style={{ display: 'block', color: link.confirmation === 'confirmed_relevant' ? '#99f6e4' : '#fde68a' }}>After opening: {link.confirmation_reason}{link.confirmation_score !== null ? ` · score ${link.confirmation_score}/100` : ''}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <CompactWebsiteLink url={source.url} color="#38bdf8" />
            {source.discovered_by && <span style={{ display: 'block', marginTop: '5px' }}>Discovered by: {source.discovered_by}</span>}
            {source.excerpt && <span style={{ display: 'block', marginTop: '6px', color: '#cbd5e1' }}>{source.excerpt}</span>}
            {source.content && (
              <div style={{ marginTop: '7px', padding: '8px', borderRadius: '5px', background: 'rgba(2, 6, 23, 0.45)', color: '#cbd5e1', whiteSpace: 'pre-wrap', maxHeight: '180px', overflowY: 'auto' }}>
                {source.content}{source.content_truncated ? '\n\n[content truncated]' : ''}
              </div>
            )}
            </div>
          </details>
        );
      })}
    </div>
    {noteErrors.length > 0 && (
      <div style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.3)', background: 'rgba(245, 158, 11, 0.08)', color: '#fbbf24', fontSize: '0.7rem' }}>
        AI relevance notes were unavailable for {noteErrors.length} source batch{noteErrors.length === 1 ? '' : 'es'}. Retrieved website evidence remains available.
      </div>
    )}
    {images.length > 0 && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px', maxHeight: '360px', overflowY: 'auto' }}>
        {images.map((researchImage) => (
          <a
            key={`${researchImage.id}-${researchImage.url}`}
            href={researchImage.url}
            target="_blank"
            rel="noreferrer"
            title="Open full-size image"
            style={{ display: 'flex', flexDirection: 'column', gap: '5px', padding: '6px', borderRadius: '7px', background: 'rgba(15, 23, 42, 0.5)', border: '1px solid var(--border-color)', color: '#38bdf8', textDecoration: 'none' }}
          >
            <img
              src={researchImage.url}
              alt={researchImage.alt || researchImage.source_title || 'Research image'}
              loading="lazy"
              referrerPolicy="no-referrer"
              style={{ width: '100%', height: '110px', objectFit: 'contain', borderRadius: '4px', background: 'rgba(2, 6, 23, 0.55)' }}
            />
            <span style={{ fontSize: '0.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {researchImage.id} · {researchImage.alt || researchImage.source_title || 'Image source'}
            </span>
          </a>
        ))}
      </div>
    )}
  </div>
);

const CompactedContextCard: React.FC<{ message: ChatMessage }> = ({ message }) => {
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

const PrettierInvocationView: React.FC<{ name: string; args: Record<string, any> }> = ({ name, args }) => {
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

const ToolInvocationCard: React.FC<{
  name: string;
  args: Record<string, any>;
  defaultExpanded?: boolean;
}> = ({ name, args, defaultExpanded = true }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [viewMode, setViewMode] = useState<'prettier' | 'raw'>('prettier');
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(JSON.stringify(args, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getToolSummary = () => {
    if (args.command) return `$ ${args.command}`;
    if (args.relative_path) return args.relative_path;
    if (args.query) return `"${args.query}"`;
    if (args.url) return args.url;
    if (args.session_id) return `session: ${args.session_id}`;
    return null;
  };

  const summary = getToolSummary();

  return (
    <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '10px', fontSize: '0.85rem', overflow: 'hidden' }}>
      {/* Header Bar */}
      <div
        onClick={() => setExpanded((curr) => !curr)}
        style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: 'rgba(245, 158, 11, 0.05)', userSelect: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-amber)', fontWeight: 600, minWidth: 0, flex: 1 }}>
          <Wrench size={15} style={{ flexShrink: 0 }} />
          <span style={{ whiteSpace: 'nowrap' }}>Tool Invocation:</span>
          <span style={{ fontFamily: 'var(--font-code)', background: 'rgba(245, 158, 11, 0.18)', padding: '2px 8px', borderRadius: '6px', color: '#fcd34d', fontSize: '0.8rem', flexShrink: 0 }}>
            {name}
          </span>
          {summary && (
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-code)', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
              {summary}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '8px' }}>
          {/* Prettier / Raw JSON View Mode Tabs */}
          <div style={{ display: 'flex', gap: '2px', background: 'rgba(15, 23, 42, 0.7)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setViewMode('prettier');
              }}
              title="Formatted Prettier View"
              style={{
                padding: '3px 8px',
                borderRadius: '4px',
                border: 'none',
                background: viewMode === 'prettier' ? 'rgba(245, 158, 11, 0.25)' : 'transparent',
                color: viewMode === 'prettier' ? '#fcd34d' : 'var(--text-muted)',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Eye size={12} />
              <span>Prettier</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setViewMode('raw');
              }}
              title="Raw JSON View"
              style={{
                padding: '3px 8px',
                borderRadius: '4px',
                border: 'none',
                background: viewMode === 'raw' ? 'rgba(245, 158, 11, 0.25)' : 'transparent',
                color: viewMode === 'raw' ? '#fcd34d' : 'var(--text-muted)',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Code2 size={12} />
              <span>Raw JSON</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            title="Copy Raw JSON"
            style={{ background: 'none', border: 'none', color: copied ? '#10b981' : 'var(--text-muted)', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.72rem' }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>

          <ChevronDown size={16} color="var(--accent-amber)" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div style={{ padding: '12px', borderTop: '1px solid rgba(245, 158, 11, 0.2)', background: 'rgba(10, 15, 28, 0.6)' }}>
          {viewMode === 'prettier' ? (
            <PrettierInvocationView name={name} args={args} />
          ) : (
            <pre style={{ margin: 0, padding: '10px 12px', background: '#090d16', borderRadius: '8px', border: '1px solid var(--border-color)', fontFamily: 'var(--font-code)', fontSize: '0.8rem', color: '#fcd34d', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '350px', overflowY: 'auto' }}>
              {JSON.stringify(args, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

const ToolResultCard: React.FC<{
  message: ChatMessage;
  args: Record<string, any>;
  onOpenFile?: (file: TextAttachment) => void;
  isGenerating?: boolean;
  onRegenerateDeepResearch?: (toolMessageId: string) => void;
}> = ({ message, args, onOpenFile, isGenerating = false, onRegenerateDeepResearch }) => {
  const [expanded, setExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<'formatted' | 'raw'>('formatted');

  const fullResultContent = message.displayContent || message.content;
  const isPruned = typeof message.content === 'string' && message.content.startsWith('[Context Pruned:');

  let parsedContent: any = null;
  if (!isPruned) {
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

  const fileDiff = parsedContent?.diff as FileDiffData | undefined;
  const resultWithoutDiff = parsedContent && fileDiff
    ? Object.fromEntries(Object.entries(parsedContent).filter(([key]) => key !== 'diff'))
    : parsedContent;
  const summary = isPruned
    ? message.content.replace(/^\[Context Pruned:\s*/, '').replace(/\]$/, '')
    : getToolResultSummary(message.name, args, parsedContent);

  const readFilePath = message.name === 'read_file' && !isFailed && typeof parsedContent?.content === 'string'
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

  const isWebSearch = message.name === 'web_search' && parsedContent?.results;
  const isWebPageRead = message.name === 'read_web_page' && parsedContent?.markdown;
  const isDeepResearch = message.name === 'deep_research' && parsedContent?.sources;
  const synthesisTokenEstimate = Math.ceil(message.content.length / 4);
  const fullTokenEstimate = Math.ceil(fullResultContent.length / 4);
  const hasFormattedView = isWebSearch || isWebPageRead || isDeepResearch || fileDiff;

  const sideDriftPages: any[] = isWebSearch
    ? Array.isArray(parsedContent?.most_relevant_pages)
      ? parsedContent.most_relevant_pages
      : parsedContent?.most_relevant_page
        ? [parsedContent.most_relevant_page]
        : []
    : [];

  const mainColor = isPruned ? '#c084fc' : isFailed ? '#f43f5e' : 'var(--accent-teal)';
  const bgColor = isPruned ? 'rgba(168, 85, 247, 0.08)' : isFailed ? 'rgba(244, 63, 94, 0.08)' : 'rgba(20, 184, 166, 0.08)';
  const borderColor = isPruned ? 'rgba(168, 85, 247, 0.3)' : isFailed ? 'rgba(244, 63, 94, 0.25)' : 'rgba(20, 184, 166, 0.25)';
  const borderTopColor = isPruned ? 'rgba(168, 85, 247, 0.2)' : isFailed ? 'rgba(244, 63, 94, 0.18)' : 'rgba(20, 184, 166, 0.18)';
  const activeBtnBg = isPruned ? 'rgba(168, 85, 247, 0.2)' : isFailed ? 'rgba(244, 63, 94, 0.2)' : 'rgba(20, 184, 166, 0.2)';

  return (
    <div className="animate-fade-in" style={{ marginLeft: '44px', maxWidth: '80%' }}>
      <div style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: '8px', fontSize: '0.825rem', overflow: 'hidden' }}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpanded((current) => !current)}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setExpanded((current) => !current);
            }
          }}
          aria-expanded={expanded}
          title={expanded ? 'Hide tool result' : 'Show tool result'}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 10px', border: 0, background: 'transparent', color: mainColor, cursor: 'pointer', textAlign: 'left', font: 'inherit' }}
        >
          {isPruned ? (
            <Scissors size={14} style={{ flexShrink: 0, color: '#c084fc' }} />
          ) : isFailed ? (
            <XCircle size={14} style={{ flexShrink: 0, color: '#f43f5e' }} />
          ) : (
            <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
          )}
          <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Tool Result: {message.name}</span>
          {isPruned && (
            <span style={{ background: 'rgba(168, 85, 247, 0.2)', border: '1px solid rgba(168, 85, 247, 0.4)', color: '#e9d5ff', padding: '1px 6px', borderRadius: '4px', fontSize: '0.675rem', fontWeight: 700, textTransform: 'uppercase', flexShrink: 0 }}>
              Pruned
            </span>
          )}
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
          ) : summary && (
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isPruned ? '#d8b4fe' : isFailed ? '#f87171' : 'var(--text-muted)', fontFamily: 'var(--font-code)', fontSize: '0.75rem' }}>
              {summary}
            </span>
          )}
          {isWebSearch && sideDriftPages.length > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              flexShrink: 0, padding: '2px 7px', borderRadius: '999px',
              border: '1px solid rgba(56, 189, 248, 0.45)',
              background: 'rgba(14, 116, 144, 0.2)',
              color: '#7dd3fc', fontFamily: 'var(--font-code)', fontSize: '0.66rem', fontWeight: 700,
            }}>
              <Sparkles size={10} />
              Side Drift ⚡ {sideDriftPages.length} page{sideDriftPages.length === 1 ? '' : 's'} read
            </span>
          )}
          {isWebSearch && sideDriftPages.length === 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              flexShrink: 0, padding: '2px 7px', borderRadius: '999px',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              background: 'rgba(15, 23, 42, 0.3)',
              color: 'var(--text-dim)', fontSize: '0.66rem',
            }}>
              <Sparkles size={10} />
              Side Drift: no match
            </span>
          )}
          {isDeepResearch && (
            <>
              <span
                title={`${message.content.length.toLocaleString()} model-payload characters; full result ${fullResultContent.length.toLocaleString()} characters (~${fullTokenEstimate.toLocaleString()} tokens)`}
                style={{ flexShrink: 0, padding: '2px 6px', borderRadius: '5px', border: '1px solid rgba(45, 212, 191, 0.28)', background: 'rgba(20, 184, 166, 0.1)', color: '#99f6e4', fontFamily: 'var(--font-code)', fontSize: '0.65rem' }}
              >
                synthesis ~{synthesisTokenEstimate.toLocaleString()} tokens
              </span>
              {onRegenerateDeepResearch && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRegenerateDeepResearch(message.id);
                  }}
                  disabled={isGenerating}
                  title="Delete only messages after this research result and regenerate the final answer without rerunning research"
                  style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 7px', borderRadius: '5px', border: '1px solid rgba(99, 102, 241, 0.35)', background: 'rgba(99, 102, 241, 0.12)', color: '#c7d2fe', cursor: isGenerating ? 'not-allowed' : 'pointer', opacity: isGenerating ? 0.45 : 1, fontSize: '0.66rem', fontWeight: 650 }}
                >
                  <RotateCcw size={11} /> Regenerate answer
                </button>
              )}
            </>
          )}
          <ChevronDown size={15} style={{ marginLeft: 'auto', flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
        </div>

        {expanded && (
          <div style={{ padding: '0 12px 12px', borderTop: `1px solid ${borderTopColor}` }}>
            {isPruned ? (
              <div style={{ margin: '10px 0 0', padding: '10px 14px', background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: '6px', color: '#e9d5ff', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Scissors size={16} color="#c084fc" style={{ flexShrink: 0 }} />
                <span>{message.content}</span>
              </div>
            ) : (
              <>
                {/* View Mode Toggle Header Bar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setViewMode('formatted')}
                      style={{
                        padding: '3px 9px',
                        borderRadius: '4px',
                        border: '1px solid',
                        borderColor: viewMode === 'formatted' ? mainColor : 'transparent',
                        background: viewMode === 'formatted' ? activeBtnBg : 'transparent',
                        color: viewMode === 'formatted' ? mainColor : 'var(--text-muted)',
                        fontSize: '0.725rem',
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
                      onClick={() => setViewMode('raw')}
                      style={{
                        padding: '3px 9px',
                        borderRadius: '4px',
                        border: '1px solid',
                        borderColor: viewMode === 'raw' ? mainColor : 'transparent',
                        background: viewMode === 'raw' ? activeBtnBg : 'transparent',
                        color: viewMode === 'raw' ? mainColor : 'var(--text-muted)',
                        fontSize: '0.725rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Code2 size={12} />
                      <span>Raw JSON</span>
                    </button>
                  </div>
                </div>

                {/* Formatted View Content */}
                {viewMode === 'formatted' ? (
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
                    {isDeepResearch && (
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
                        modelContext={message.content}
                        fullContext={fullResultContent}
                      />
                    )}
                    {!isWebSearch && !isWebPageRead && !isDeepResearch && fileDiff && (
                      <FileDiff diff={fileDiff} />
                    )}
                    {!isWebSearch && !isWebPageRead && !isDeepResearch && !fileDiff && (
                      <pre style={{ margin: '10px 0 0', maxHeight: '320px', overflow: 'auto', fontSize: '0.775rem' }}>
                        {resultWithoutDiff ? JSON.stringify(resultWithoutDiff, null, 2) : message.content}
                      </pre>
                    )}
                  </>
                ) : (
                  /* Raw View Content */
                  <pre style={{ margin: '10px 0 0', maxHeight: '320px', overflow: 'auto', fontSize: '0.775rem' }}>
                    {JSON.stringify(parsedContent || message.content, null, 2)}
                  </pre>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const CopyableCodeBlock: React.FC<{ code: string; language?: string }> = ({ code, language }) => {
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

const MarkdownContent: React.FC<{ content: string; streaming?: boolean }> = ({
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

const ThinkingBlock: React.FC<{ thinking: string; thinkingTokens?: number; isStreaming?: boolean }> = ({
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

const AssistantResponse: React.FC<{ content: string; thinking?: string; thinkingTokens?: number }> = ({
  content,
  thinking,
  thinkingTokens,
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
    </div>
  );
};

const FileDiff: React.FC<{ diff: FileDiffData }> = ({ diff }) => (
  <div style={{ marginTop: '10px', border: '1px solid rgba(148, 163, 184, 0.25)', borderRadius: '8px', overflow: 'hidden', background: '#0b1220' }}>
    <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(148, 163, 184, 0.2)', color: '#cbd5e1', fontFamily: 'var(--font-code)', fontSize: '0.775rem' }}>
      <div style={{ color: '#f87171' }}>--- {diff.oldPath}</div>
      <div style={{ color: '#4ade80' }}>+++ {diff.newPath}</div>
    </div>
    <div style={{ maxHeight: '360px', overflow: 'auto', fontFamily: 'var(--font-code)', fontSize: '0.775rem', lineHeight: 1.55 }}>
      {diff.lines.map((line, index) => {
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

interface ChatWindowProps {
  messages: ChatMessage[];
  streamingText: string;
  streamingThinking?: string;
  isGenerating: boolean;
  isModelLoaded: boolean;
  modelLoadElapsed: number;
  activeGenerationsCount?: number;
  generationStatus: 'idle' | 'generating' | 'completed' | 'cancelled' | 'error';
  pendingApprovalCall?: PendingApprovalCall | null;
  isSubmittingToolApproval?: boolean;
  activeToolCall?: { name: string; args?: any; progress?: any } | null;
  pendingBatchEdits?: BatchReviewFile[] | null;
  isSubmittingBatchApproval?: boolean;
  supportsVision?: boolean;
  onSendMessage: (msg: string, attachments?: TextAttachment[], imageAttachments?: import('../types').ImageAttachment[]) => void;
  onCancelGeneration: () => void;
  onApproveToolCall?: () => void;
  onRejectToolCall?: (reason?: string) => void;
  onBatchApprove?: (approvedIds: string[]) => void;
  onBatchRejectAll?: () => void;
  onBatchToggle?: (editId: string) => void;
  onRewindToMessage?: (messageId: string, promptContent: string) => void;
  onRegenerateDeepResearch?: (toolMessageId: string) => void;
  onClearChat?: () => void;
  onOpenToolSettings?: () => void;
  onOpenModelDetails?: () => void;
  onCompactContext?: () => void;
}

const QUICK_HELPER_PROMPTS = [
  {
    icon: Folder,
    label: 'Explore Codebase',
    prompt: 'Examine the project structure and summarize the main modules and entry points.',
    category: 'directory',
  },
  {
    icon: Terminal,
    label: 'Run Tests & Lint',
    prompt: 'Run the test suite and type checking to report any failing tests or TypeScript errors.',
    category: 'terminal',
  },
  {
    icon: Search,
    label: 'Find API Routes',
    prompt: 'Grep the codebase for all REST API endpoints and list their parameters.',
    category: 'search',
  },
  {
    icon: Globe,
    label: 'Deep Research',
    prompt: 'Make deep research about ',
    category: 'web',
  },
  {
    icon: FileText,
    label: 'Package & Setup',
    prompt: 'Read package.json and summarize the project dependencies, scripts, and build setup.',
    category: 'file',
  },
  {
    icon: Wrench,
    label: 'Inspect MCP Tools',
    prompt: 'Check active MCP servers and list available external tools and schemas.',
    category: 'mcp',
  },
];

interface SlashCommandItem {
  cmd: string;
  label: string;
  description: string;
  icon: React.ElementType;
}

interface SkillListItem {
  name: string;
  description: string;
}

const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    cmd: '/compact',
    label: '/compact',
    description: 'Summarize & compress conversation context to save tokens',
    icon: Sparkles,
  },
  {
    cmd: '/clear',
    label: '/clear',
    description: 'Reset conversation history and start fresh context',
    icon: RotateCcw,
  },
  {
    cmd: '/skills',
    label: '/skills',
    description: 'List reusable workspace and bundled skills',
    icon: Layers,
  },
  {
    cmd: '/settings',
    label: '/settings',
    description: 'Open Tool Approval & Safety Settings modal',
    icon: Wrench,
  },
  {
    cmd: '/inspect',
    label: '/inspect',
    description: 'Open Ollama Model Inspector modal for detailed specs',
    icon: Eye,
  },
];

export const ChatWindow: React.FC<ChatWindowProps> = ({
  messages,
  streamingText,
  streamingThinking = '',
  isGenerating,
  isModelLoaded,
  modelLoadElapsed,
  activeGenerationsCount,
  generationStatus,
  pendingApprovalCall,
  isSubmittingToolApproval = false,
  activeToolCall,
  pendingBatchEdits,
  isSubmittingBatchApproval = false,
  supportsVision,
  onSendMessage,
  onCancelGeneration,
  onApproveToolCall,
  onRejectToolCall,
  onBatchApprove,
  onBatchRejectAll,
  onBatchToggle,
  onRewindToMessage,
  onRegenerateDeepResearch,
  onClearChat,
  onOpenToolSettings,
  onOpenModelDetails,
  onCompactContext,
}) => {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<TextAttachment[]>([]);
  const [imageAttachments, setImageAttachments] = useState<ImageAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState('');
  const [viewedAttachment, setViewedAttachment] = useState<TextAttachment | null>(null);
  const [attachmentViewMode, setAttachmentViewMode] = useState<'source' | 'rendered'>('source');
  const [attachmentViewerWidth, setAttachmentViewerWidth] = useState(420);
  const [isResizingAttachmentViewer, setIsResizingAttachmentViewer] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
  const [availableSkills, setAvailableSkills] = useState<SkillListItem[]>([]);
  const [inputCursor, setInputCursor] = useState(0);
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(0);
  const [skillMenuDismissed, setSkillMenuDismissed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatMainRef = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [previewImage, setPreviewImage] = useState<{ src: string; alt?: string } | null>(null);

  const openAttachmentViewer = (file: TextAttachment) => {
    setAttachmentViewMode('source');
    setViewedAttachment(file);
  };

  const clampAttachmentViewerWidth = (width: number) => {
    const availableWidth = chatMainRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    const maximumWidth = Math.max(300, Math.min(900, availableWidth - 280));
    return Math.min(maximumWidth, Math.max(300, width));
  };

  useEffect(() => {
    if (!isResizingAttachmentViewer) return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (event: PointerEvent) => {
      const mainBounds = chatMainRef.current?.getBoundingClientRect();
      if (!mainBounds) return;
      setAttachmentViewerWidth(clampAttachmentViewerWidth(mainBounds.right - event.clientX));
    };
    const handlePointerUp = () => setIsResizingAttachmentViewer(false);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [isResizingAttachmentViewer]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) files.push(file);
        }
      }

      if (files.length > 0) {
        e.preventDefault();
        void addImageFiles(files);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [supportsVision, imageAttachments.length]);

  const filteredCommands = useMemo(() => {
    if (!input.startsWith('/')) return [];
    const query = input.toLowerCase();
    return SLASH_COMMANDS.filter((cmd) => cmd.cmd.toLowerCase().startsWith(query));
  }, [input]);

  const activeSkillMention = useMemo(
    () => findActiveSkillMention(input, inputCursor),
    [input, inputCursor]
  );
  const skillMentionActive = activeSkillMention !== null;
  const filteredSkills = useMemo(() => {
    if (!activeSkillMention) return [];
    return availableSkills.filter((skill) => skill.name.toLowerCase().startsWith(activeSkillMention.query));
  }, [activeSkillMention, availableSkills]);
  const skillMenuOpen = skillMentionActive && !skillMenuDismissed && filteredSkills.length > 0;

  useEffect(() => {
    if (!skillMentionActive) return;
    let cancelled = false;
    void fetch('/api/skills')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Could not load skills.')))
      .then((data) => {
        if (!cancelled) setAvailableSkills(Array.isArray(data.skills) ? data.skills : []);
      })
      .catch(() => {
        if (!cancelled) setAvailableSkills([]);
      });
    return () => { cancelled = true; };
  }, [skillMentionActive]);

  useEffect(() => {
    setSelectedSkillIndex(0);
  }, [activeSkillMention?.query, filteredSkills.length]);

  useEffect(() => {
    if (input.startsWith('/') && filteredCommands.length > 0) {
      setSlashMenuOpen(true);
      setSelectedSlashIndex(0);
    } else {
      setSlashMenuOpen(false);
    }
  }, [input, filteredCommands.length]);

  const handleSelectSlashCommand = (cmd: SlashCommandItem) => {
    setSlashMenuOpen(false);
    if (cmd.cmd === '/compact') {
      setInput('');
      if (onCompactContext) {
        onCompactContext();
      } else {
        onSendMessage('/compact');
      }
    } else if (cmd.cmd === '/clear') {
      setInput('');
      if (onClearChat) onClearChat();
    } else if (cmd.cmd === '/skills') {
      setInput('');
      onSendMessage('/skills');
    } else if (cmd.cmd === '/settings') {
      setInput('');
      if (onOpenToolSettings) onOpenToolSettings();
    } else if (cmd.cmd === '/inspect') {
      setInput('');
      if (onOpenModelDetails) onOpenModelDetails();
    } else {
      setInput(`${cmd.cmd} `);
    }
  };

  const handleSelectSkill = (skill: SkillListItem) => {
    if (!activeSkillMention) return;
    const before = input.slice(0, activeSkillMention.start);
    const after = input.slice(activeSkillMention.end);
    const suffix = after.length === 0 || !/^\s/.test(after) ? ` ${after}` : after;
    const reference = `@skill:${skill.name}`;
    const nextInput = `${before}${reference}${suffix}`;
    const nextCursor = before.length + reference.length + (suffix.startsWith(' ') ? 1 : 0);
    setInput(nextInput);
    setInputCursor(nextCursor);
    setSkillMenuDismissed(false);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleRewind = (messageId: string, content: string) => {
    if (onRewindToMessage) {
      onRewindToMessage(messageId, content);
      setInput(content);
    }
  };

  const resizeImageIfNeeded = (file: File, maxDimension = 1560, quality = 0.85): Promise<{ base64: string; size: number }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve({ base64: e.target?.result as string, size: file.size });
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          // Use JPEG for large photos or PNG if original was transparent
          const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          const dataUrl = canvas.toDataURL(mimeType, quality);
          const base64Clean = dataUrl.split(',')[1] || '';
          const sizeInBytes = Math.round((base64Clean.length * 3) / 4);

          resolve({ base64: dataUrl, size: sizeInBytes });
        };
        img.onerror = () => reject(new Error(`Failed to load image ${file.name}`));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error(`Failed to read file ${file.name}`));
      reader.readAsDataURL(file);
    });
  };

  const addImageFiles = async (files: File[]) => {
    setAttachmentError('');
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    if (!supportsVision) {
      setAttachmentError('The currently selected model does not support image input.');
      return;
    }

    const remainingSlots = 5 - imageAttachments.length;
    const selected = imageFiles.slice(0, remainingSlots);
    if (imageFiles.length > remainingSlots) {
      setAttachmentError('You can attach at most 5 images.');
    }

    const accepted: ImageAttachment[] = [];
    for (const file of selected) {
      try {
        const { base64, size } = await resizeImageIfNeeded(file, 1560, 0.85);
        accepted.push({ name: file.name, type: file.type, base64, size });
      } catch (_) {
        setAttachmentError(`Failed to process ${file.name}`);
      }
    }
    setImageAttachments((current) => [...current, ...accepted]);
  };

  const addFiles = async (files: File[]) => {
    setAttachmentError('');
    const textFiles = files.filter((f) => !f.type.startsWith('image/'));
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));

    if (imageFiles.length > 0) {
      await addImageFiles(imageFiles);
    }

    if (textFiles.length === 0) return;

    const remainingSlots = 10 - attachments.length;
    const selected = textFiles.slice(0, remainingSlots);
    if (textFiles.length > remainingSlots) setAttachmentError('You can attach at most 10 text files.');

    const accepted: TextAttachment[] = [];
    for (const file of selected) {
      if (file.size > 512 * 1024) {
        setAttachmentError(`${file.name} is larger than 512 KB.`);
        continue;
      }
      const content = await file.text();
      if (content.includes('\u0000')) {
        setAttachmentError(`${file.name} does not appear to be a text file.`);
        continue;
      }
      accepted.push({ name: file.name, content, size: file.size, type: file.type });
    }
    const currentSize = attachments.reduce((sum, file) => sum + file.size, 0);
    let addedSize = 0;
    const withinTotalLimit = accepted.filter((file) => {
      if (currentSize + addedSize + file.size > 1024 * 1024) {
        setAttachmentError('Attachments cannot exceed 1 MB in total.');
        return false;
      }
      addedSize += file.size;
      return true;
    });
    setAttachments((current) => [...current, ...withinTotalLimit]);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText, isGenerating]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isGenerating) return;
    onSendMessage(input.trim(), attachments, imageAttachments);
    setInput('');
    setAttachments([]);
    setImageAttachments([]);
    setAttachmentError('');
  };

  const handleSelectHelperPrompt = (promptText: string) => {
    setInput(promptText);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepth.current += 1;
        if (event.dataTransfer.types.includes('Files')) setIsDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setIsDragging(false);
        if (!isGenerating) void addFiles(Array.from(event.dataTransfer.files));
      }}
      className="chat-window"
      style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}
    >
      {isDragging && (
        <div style={{ position: 'absolute', inset: '12px', zIndex: 20, border: '2px dashed var(--accent-primary)', borderRadius: '16px', background: 'rgba(15, 23, 42, 0.94)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--accent-primary)', fontWeight: 700 }}>
            <FileText size={26} />
            Drop text files to attach
          </div>
        </div>
      )}
      <div ref={chatMainRef} className="chat-main" style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      {/* Messages Scrollable Container */}
      <div className="messages-container" style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {messages.length === 0 && !streamingText && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80%', color: 'var(--text-dim)', textAlign: 'center', gap: '20px' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bot size={36} color="var(--accent-primary)" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                Ollama Agent Studio Ready
              </h2>
              <p style={{ maxWidth: '520px', fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--text-muted)' }}>
                Select a quick prompt template below or type custom instructions to inspect files, edit code, run terminal commands, and perform workspace search.
              </p>
            </div>

            {/* Starter Template Grid */}
            <div className="quick-prompts-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', maxWidth: '780px', width: '100%', marginTop: '10px' }}>
              {QUICK_HELPER_PROMPTS.map((item, idx) => {
                const IconComponent = item.icon;
                return (
                  <button
                    key={idx}
                    onClick={() => handleSelectHelperPrompt(item.prompt)}
                    className="glass-panel animate-fade-in"
                    style={{
                      padding: '16px',
                      borderRadius: '12px',
                      border: '1px solid var(--border-color)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      transition: 'all 0.2s ease',
                      background: 'rgba(30, 41, 59, 0.4)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-primary)', fontWeight: 600, fontSize: '0.875rem' }}>
                      <IconComponent size={16} color="var(--accent-primary)" />
                      <span>{item.label}</span>
                    </div>
                    <span style={{ fontSize: '0.775rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      "{item.prompt}"
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.role === 'system' || msg.content.startsWith('[COMPACTED CONVERSATION SUMMARY]')) {
            return <CompactedContextCard key={msg.id} message={msg} />;
          }

          if (msg.role === 'user') {
            return (
              <div key={msg.id} className="animate-fade-in chat-message chat-message-user" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <div className="message-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', maxWidth: '75%' }}>
                  <div style={{ background: 'var(--accent-gradient)', color: '#fff', padding: '12px 16px', borderRadius: '16px 16px 4px 16px', fontSize: '0.925rem', lineHeight: 1.5, boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)', width: '100%' }}>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{msg.displayContent ?? msg.content}</div>
                    {msg.imageAttachments && msg.imageAttachments.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                        {msg.imageAttachments.map((img, idx) => (
                          <div key={idx} onClick={() => setPreviewImage({ src: img.base64, alt: img.name })} style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.2)', maxHeight: '160px', cursor: 'zoom-in' }} title="Click to enlarge">
                            <img src={img.base64} alt={img.name} style={{ maxHeight: '160px', maxWidth: '240px', objectFit: 'cover', display: 'block' }} />
                          </div>
                        ))}
                      </div>
                    )}
                    {!msg.imageAttachments && msg.images && msg.images.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                        {msg.images.map((imgBase64, idx) => {
                          const src = imgBase64.startsWith('data:') ? imgBase64 : `data:image/png;base64,${imgBase64}`;
                          return (
                            <div key={idx} onClick={() => setPreviewImage({ src, alt: `Attached Image ${idx + 1}` })} style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.2)', maxHeight: '160px', cursor: 'zoom-in' }} title="Click to enlarge">
                              <img src={src} alt={`Attached Image ${idx + 1}`} style={{ maxHeight: '160px', maxWidth: '240px', objectFit: 'cover', display: 'block' }} />
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '9px' }}>
                        {msg.attachments.map((file, index) => (
                          <button
                            type="button"
                            key={`${file.name}-${index}`}
                            onClick={() => openAttachmentViewer(file)}
                            title={`Open ${file.name}`}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 8px', border: '1px solid rgba(255, 255, 255, 0.18)', borderRadius: '7px', background: 'rgba(15, 23, 42, 0.28)', color: 'inherit', font: 'inherit', fontSize: '0.74rem', cursor: 'pointer' }}
                          >
                            <FileText size={13} /> {file.name} · {(file.size / 1024).toFixed(1)} KB
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRewind(msg.id, msg.content)}
                    disabled={isGenerating}
                    title="Rewind context to this prompt (deletes all subsequent context)"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'rgba(30, 41, 59, 0.4)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      padding: '2px 7px',
                      color: 'var(--text-muted)',
                      fontSize: '0.7rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <RotateCcw size={11} />
                    <span>Rewind to this prompt</span>
                  </button>
                </div>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <User size={18} color="#fff" />
                </div>
              </div>
            );
          }

          if (msg.role === 'assistant') {
            return (
              <div key={msg.id} className="animate-fade-in chat-message" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-start' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Bot size={18} color="#fff" />
                </div>
                <div className="message-content" style={{ maxWidth: '80%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {msg.tool_calls && msg.tool_calls.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {msg.tool_calls.map((tc, idx) => (
                        <ToolInvocationCard key={tc.id || idx} name={tc.name} args={tc.arguments || {}} />
                      ))}
                    </div>
                  )}

                  {(msg.content || msg.thinking) && (
                    <AssistantResponse content={msg.content} thinking={msg.thinking} thinkingTokens={msg.thinkingTokens} />
                  )}
                </div>
              </div>
            );
          }

          if (msg.role === 'tool') {
            const matchingCall = messages
              .flatMap((message) => message.tool_calls || [])
              .find((call) => call.id === msg.tool_call_id);
            return (
              <ToolResultCard
                key={msg.id}
                message={msg}
                args={matchingCall?.arguments || {}}
                onOpenFile={openAttachmentViewer}
                isGenerating={isGenerating}
                onRegenerateDeepResearch={onRegenerateDeepResearch}
              />
            );
          }

          return null;
        })}

        {/* Streaming Assistant Card */}
        {(streamingText || streamingThinking) && (
          <div className="animate-fade-in" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-start' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Bot size={18} color="#fff" />
            </div>
            <div className="glass-panel" style={{ maxWidth: '80%', padding: '14px 18px', borderRadius: '16px 16px 16px 4px', fontSize: '0.925rem', lineHeight: 1.6 }}>
              {streamingThinking && (
                <ThinkingBlock thinking={streamingThinking} isStreaming={!streamingText} />
              )}
              {streamingText && (
                <MarkdownContent content={streamingText} streaming />
              )}
            </div>
          </div>
        )}

        {/* Active Tool Execution Indicator */}
        {isGenerating && activeToolCall && (
          activeToolCall.name === 'deep_research' ? (
            <DeepResearchProgress args={activeToolCall.args || {}} progress={activeToolCall.progress} onCancelGeneration={onCancelGeneration} />
          ) : (
          <div
            className="glass-panel animate-fade-in"
            style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              marginLeft: '44px',
              padding: '12px 18px',
              borderRadius: '12px',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              background: 'rgba(99, 102, 241, 0.1)',
              color: 'var(--accent-primary)',
              fontSize: '0.875rem',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.15)',
            }}
          >
            <Loader2 size={18} className="spin" style={{ flexShrink: 0, color: 'var(--accent-primary)' }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>⚙️ Executing Tool:</span>
                <span
                  style={{
                    fontFamily: 'var(--font-code)',
                    background: 'rgba(99, 102, 241, 0.25)',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    color: '#a5b4fc',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                  }}
                >
                  {activeToolCall.name}
                </span>
              </div>
              {activeToolCall.args && Object.keys(activeToolCall.args).length > 0 && (
                <div
                  style={{
                    fontSize: '0.775rem',
                    color: 'var(--text-muted)',
                    marginTop: '4px',
                    fontFamily: 'var(--font-code)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {activeToolCall.args.command
                    ? `$ ${activeToolCall.args.command}`
                    : activeToolCall.args.relative_path || activeToolCall.args.path || activeToolCall.args.query || activeToolCall.args.url || JSON.stringify(activeToolCall.args)}
                </div>
              )}
            </div>
            {onCancelGeneration && (
              <button
                type="button"
                onClick={onCancelGeneration}
                title="Stop execution"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 9px',
                  borderRadius: '6px',
                  border: '1px solid rgba(239, 68, 68, 0.5)',
                  background: 'rgba(239, 68, 68, 0.18)',
                  color: '#fca5a5',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <Square size={11} fill="currentColor" /> Stop
              </button>
            )}
          </div>
          )
        )}

        {isGenerating && !activeToolCall && !streamingText && !pendingApprovalCall && (
          <div className="glass-panel animate-fade-in" style={{ display: 'flex', gap: '12px', alignItems: 'center', marginLeft: '44px', padding: '12px 18px', borderRadius: '12px', border: `1px solid ${isModelLoaded ? 'rgba(99, 102, 241, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`, color: isModelLoaded ? 'var(--accent-primary)' : 'var(--accent-amber)', fontSize: '0.875rem' }}>
            <Loader2 size={18} className="spin" style={{ flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <span style={{ fontWeight: 600, display: 'block' }}>
                {!isModelLoaded
                  ? `⚡ Loading Model Weights into GPU VRAM… ${modelLoadElapsed}s`
                  : (activeGenerationsCount && activeGenerationsCount > 1)
                  ? `⏳ Request Queued (${activeGenerationsCount} Active Server Tasks)`
                  : 'Agent is thinking…'}
              </span>
              <span style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                {!isModelLoaded
                  ? 'Ollama is initializing model weights. Progress is indeterminate because Ollama does not report bytes loaded.'
                  : (activeGenerationsCount && activeGenerationsCount > 1)
                  ? `Server has ${activeGenerationsCount} active generation tasks. Your request is queued & waiting for GPU turn…`
                  : 'Preparing the response. Token streaming will start shortly.'}
              </span>
              {!isModelLoaded && (
                <div
                  className="model-load-track"
                  role="progressbar"
                  aria-label="Loading model weights into GPU VRAM"
                  aria-valuetext={`Loading for ${modelLoadElapsed} seconds`}
                >
                  <div className="model-load-bar" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pending Tool Execution Approval Card */}
        {pendingApprovalCall && (
          <div className="glass-panel animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginLeft: '44px', padding: '16px 20px', borderRadius: '14px', border: '2px solid var(--accent-amber)', background: 'rgba(245, 158, 11, 0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-amber)', fontWeight: 700, fontSize: '0.95rem' }}>
              <ShieldAlert size={20} />
              <span>⚠️ Pending Execution Approval</span>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
              The agent is requesting to execute:
              <div style={{ marginTop: '8px' }}>
                <ToolInvocationCard name={pendingApprovalCall.name} args={pendingApprovalCall.args || {}} defaultExpanded={true} />
              </div>
              {pendingApprovalCall.diff && (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.775rem', marginBottom: '4px' }}>Proposed changes</div>
                  <FileDiff diff={pendingApprovalCall.diff} />
                </div>
              )}

              <div style={{ marginTop: '10px' }}>
                <input
                  type="text"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Optional rejection reason / instructions for model (e.g. 'Use git status instead')..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onRejectToolCall?.(rejectionReason.trim() || undefined);
                      setRejectionReason('');
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    background: 'rgba(15, 23, 42, 0.8)',
                    color: 'var(--text-main)',
                    fontSize: '0.825rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
              <button
                onClick={onApproveToolCall}
                disabled={isSubmittingToolApproval}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: '#10b981',
                  border: 'none',
                  color: '#fff',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: isSubmittingToolApproval ? 'wait' : 'pointer',
                  opacity: isSubmittingToolApproval ? 0.65 : 1,
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                }}
              >
                {isSubmittingToolApproval ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />}
                <span>{isSubmittingToolApproval ? 'Approving…' : 'Approve & Execute'}</span>
              </button>

              <button
                onClick={() => {
                  onRejectToolCall?.(rejectionReason.trim() || undefined);
                  setRejectionReason('');
                }}
                disabled={isSubmittingToolApproval}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#ef4444',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <XCircle size={16} />
                <span>Reject Execution</span>
              </button>
            </div>
          </div>
        )}

        {/* Batch File Edit Review Card */}
        {pendingBatchEdits && pendingBatchEdits.length > 0 && onBatchApprove && onBatchToggle && (
          <BatchReviewCard
            files={pendingBatchEdits}
            isSubmitting={isSubmittingBatchApproval}
            onConfirm={onBatchApprove}
            onToggleRevert={onBatchToggle}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      {viewedAttachment && (
        <aside className="attachment-viewer" style={{ position: 'relative', width: `${attachmentViewerWidth}px`, flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border-color)', background: 'rgba(15, 23, 42, 0.96)', minHeight: 0 }}>
          <div
            className="attachment-resize-handle"
            role="separator"
            aria-label="Resize file viewer"
            aria-orientation="vertical"
            aria-valuenow={attachmentViewerWidth}
            tabIndex={0}
            title="Drag to resize file viewer"
            onPointerDown={(event) => {
              event.preventDefault();
              setIsResizingAttachmentViewer(true);
            }}
            onDoubleClick={() => setAttachmentViewerWidth(clampAttachmentViewerWidth(420))}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              const change = event.key === 'ArrowLeft' ? 24 : -24;
              setAttachmentViewerWidth((current) => clampAttachmentViewerWidth(current + change));
            }}
            style={{ position: 'absolute', zIndex: 2, insetBlock: 0, left: '-6px', width: '12px', display: 'flex', justifyContent: 'center', cursor: 'col-resize', touchAction: 'none', outline: 'none' }}
          >
            <span style={{ width: '2px', height: '100%', background: isResizingAttachmentViewer ? 'var(--accent-primary)' : 'var(--border-color)', transition: 'background 0.15s' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '14px 16px', borderBottom: '1px solid var(--border-color)' }}>
            <FileText size={18} color="var(--accent-primary)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div title={viewedAttachment.name} style={{ color: 'var(--text-main)', fontWeight: 650, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {viewedAttachment.name}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '2px' }}>
                {(viewedAttachment.size / 1024).toFixed(1)} KB
                <span style={{ marginLeft: '7px', color: getAttachmentLanguage(viewedAttachment.name).color }}>
                  • {getAttachmentLanguage(viewedAttachment.name).label}
                </span>
              </div>
            </div>
            {/\.(?:md|markdown)$/i.test(viewedAttachment.name) && (
              <div style={{ display: 'flex', gap: '2px', padding: '2px', border: '1px solid var(--border-color)', borderRadius: '7px', background: 'rgba(30, 41, 59, 0.7)' }}>
                <button
                  type="button"
                  onClick={() => setAttachmentViewMode('source')}
                  aria-pressed={attachmentViewMode === 'source'}
                  title="Show Markdown source"
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 7px', border: 0, borderRadius: '5px', background: attachmentViewMode === 'source' ? 'rgba(99, 102, 241, 0.25)' : 'transparent', color: attachmentViewMode === 'source' ? '#c7d2fe' : 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  <Code2 size={12} /> Source
                </button>
                <button
                  type="button"
                  onClick={() => setAttachmentViewMode('rendered')}
                  aria-pressed={attachmentViewMode === 'rendered'}
                  title="Render Markdown"
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 7px', border: 0, borderRadius: '5px', background: attachmentViewMode === 'rendered' ? 'rgba(99, 102, 241, 0.25)' : 'transparent', color: attachmentViewMode === 'rendered' ? '#c7d2fe' : 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  <Eye size={12} /> Preview
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => setViewedAttachment(null)}
              aria-label="Close attachment viewer"
              title="Close"
              style={{ display: 'flex', padding: '6px', border: '1px solid var(--border-color)', borderRadius: '7px', background: 'rgba(30, 41, 59, 0.7)', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <X size={16} />
            </button>
          </div>
          {/\.(?:md|markdown)$/i.test(viewedAttachment.name) && attachmentViewMode === 'rendered' ? (
            <div style={{ flex: 1, minHeight: 0, padding: '18px', overflow: 'auto', color: 'var(--text-main)', fontSize: '0.875rem', lineHeight: 1.6 }}>
              <MarkdownContent content={viewedAttachment.content} />
            </div>
          ) : (
            <pre style={{ flex: 1, minHeight: 0, margin: 0, padding: '16px', overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'var(--text-main)', background: 'transparent', fontFamily: 'var(--font-code)', fontSize: '0.8rem', lineHeight: 1.55 }}>
              <HighlightedAttachment file={viewedAttachment} />
            </pre>
          )}
        </aside>
      )}
      </div>

      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="animate-fade-in"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            cursor: 'zoom-out',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              cursor: 'default',
            }}
          >
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              style={{
                position: 'absolute',
                top: '-40px',
                right: '0',
                background: 'rgba(30, 41, 59, 0.8)',
                border: '1px solid var(--border-color)',
                borderRadius: '50%',
                color: '#fff',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>
            <img
              src={previewImage.src}
              alt={previewImage.alt || 'Enlarged Image'}
              style={{
                maxWidth: '90vw',
                maxHeight: '85vh',
                objectFit: 'contain',
                borderRadius: '12px',
                boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            />
          </div>
        </div>
      )}

      {/* Input Prompt Box */}
      <div className="chat-composer" style={{ padding: '14px 24px', background: 'rgba(15, 23, 42, 0.8)', borderTop: '1px solid var(--border-color)', zIndex: 5, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Quick Helper Chips Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.725rem', fontWeight: 600, color: 'var(--accent-primary)', paddingRight: '6px', whiteSpace: 'nowrap' }}>
            <Sparkles size={13} />
            <span>Quick Prompts:</span>
          </div>
          {QUICK_HELPER_PROMPTS.map((item, idx) => {
            const IconComponent = item.icon;
            return (
              <button
                key={idx}
                onClick={() => handleSelectHelperPrompt(item.prompt)}
                disabled={isGenerating}
                title={item.prompt}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: 'rgba(30, 41, 59, 0.6)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-muted)',
                  padding: '4px 10px',
                  borderRadius: '14px',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  cursor: isGenerating ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <IconComponent size={13} color="var(--accent-primary)" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {generationStatus !== 'idle' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.78rem',
              color:
                generationStatus === 'completed'
                  ? 'var(--accent-teal)'
                  : generationStatus === 'cancelled' || generationStatus === 'error'
                    ? 'var(--accent-amber)'
                    : 'var(--text-muted)',
            }}
          >
            {generationStatus === 'generating' && <Loader2 size={14} className="spin" />}
            {generationStatus === 'completed' && <CheckCircle2 size={14} />}
            {generationStatus === 'cancelled' && <Square size={12} />}
            {generationStatus === 'error' && <XCircle size={14} />}
            <span>
              {generationStatus === 'generating'
                ? 'Generating…'
                : generationStatus === 'completed'
                  ? 'Generation complete'
                  : generationStatus === 'cancelled'
                    ? 'Generation cancelled'
                    : 'Generation failed'}
            </span>
          </div>
        )}

        {(attachments.length > 0 || imageAttachments.length > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
            {imageAttachments.map((img, index) => (
              <span key={`${img.name}-${index}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 5px 3px 8px', border: '1px solid var(--accent-primary)', borderRadius: '8px', color: 'var(--text-main)', background: 'rgba(99, 102, 241, 0.15)', fontSize: '0.76rem' }}>
                <button type="button" onClick={() => setPreviewImage({ src: img.base64, alt: img.name })} title={`View ${img.name} in full size`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 0', border: 0, background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer' }}>
                  <ImageIcon size={13} color="var(--accent-primary)" />
                  <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.name}</span>
                </button>
                <button type="button" aria-label={`Remove ${img.name}`} onClick={() => setImageAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} style={{ display: 'flex', padding: 0, border: 0, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <X size={13} />
                </button>
              </span>
            ))}
            {attachments.map((file, index) => (
              <span key={`${file.name}-${index}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 5px 3px 8px', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-muted)', background: 'rgba(30, 41, 59, 0.7)', fontSize: '0.76rem' }}>
                <button type="button" onClick={() => setViewedAttachment(file)} title={`Open ${file.name}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 0', border: 0, background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer' }}>
                  <FileText size={13} color="var(--accent-primary)" />
                  {file.name} · {(file.size / 1024).toFixed(1)} KB
                </button>
                <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} style={{ display: 'flex', padding: 0, border: 0, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        )}
        {attachmentError && <div style={{ color: 'var(--accent-amber)', fontSize: '0.76rem' }}>{attachmentError}</div>}

        {/* Skill reference autocomplete. It only opens for a standalone @ token. */}
        {skillMenuOpen && (
          <div
            className="animate-fade-in"
            style={{
              background: 'rgba(15, 23, 42, 0.95)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--accent-primary)',
              borderRadius: '10px',
              padding: '6px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              marginBottom: '4px',
            }}
          >
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-primary)', padding: '4px 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Skills (Use ↑↓ Arrow Keys & Enter)
            </div>
            {filteredSkills.map((skill, idx) => {
              const isSelected = idx === selectedSkillIndex;
              return (
                <button
                  key={skill.name}
                  type="button"
                  onClick={() => handleSelectSkill(skill)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: isSelected ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
                    color: isSelected ? '#fff' : 'var(--text-muted)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <Sparkles size={14} color={isSelected ? 'var(--accent-primary)' : 'var(--text-muted)'} />
                    <span style={{ fontWeight: 700, fontFamily: 'var(--font-code)', fontSize: '0.85rem', color: isSelected ? '#fff' : 'var(--text-main)' }}>
                      @skill:{skill.name}
                    </span>
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {skill.description}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Slash Command Autocomplete Popup Menu */}
        {slashMenuOpen && filteredCommands.length > 0 && (
          <div
            className="animate-fade-in"
            style={{
              background: 'rgba(15, 23, 42, 0.95)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--accent-primary)',
              borderRadius: '10px',
              padding: '6px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              marginBottom: '4px',
            }}
          >
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-primary)', padding: '4px 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Slash Commands (Use ↑↓ Arrow Keys & Enter)
            </div>
            {filteredCommands.map((cmdItem: SlashCommandItem, idx: number) => {
              const IconComp = cmdItem.icon;
              const isSelected = idx === selectedSlashIndex;
              return (
                <button
                  key={cmdItem.cmd}
                  type="button"
                  onClick={() => handleSelectSlashCommand(cmdItem)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: isSelected ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
                    color: isSelected ? '#fff' : 'var(--text-muted)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <IconComp size={14} color={isSelected ? 'var(--accent-primary)' : 'var(--text-muted)'} />
                    <span style={{ fontWeight: 700, fontFamily: 'var(--font-code)', fontSize: '0.85rem', color: isSelected ? '#fff' : 'var(--text-main)' }}>
                      {cmdItem.cmd}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {cmdItem.description}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', background: 'rgba(30, 41, 59, 0.8)', padding: '8px 14px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          {supportsVision && (
            <label
              title="Upload image for vision model"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-color)',
                color: 'var(--accent-primary)',
                cursor: isGenerating ? 'not-allowed' : 'pointer',
                marginBottom: '2px',
                transition: 'all 0.15s ease',
              }}
            >
              <ImageIcon size={18} />
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={isGenerating}
                onChange={(e) => {
                  if (e.target.files) {
                    void addImageFiles(Array.from(e.target.files));
                    e.target.value = '';
                  }
                }}
                style={{ display: 'none' }}
              />
            </label>
          )}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setInputCursor(e.target.selectionStart);
              setSkillMenuDismissed(false);
            }}
            onClick={(e) => setInputCursor(e.currentTarget.selectionStart)}
            onKeyUp={(e) => setInputCursor(e.currentTarget.selectionStart)}
            onKeyDown={(e) => {
              if (skillMenuOpen) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setSelectedSkillIndex((prev) => (prev + 1) % filteredSkills.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setSelectedSkillIndex((prev) => (prev - 1 + filteredSkills.length) % filteredSkills.length);
                  return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  handleSelectSkill(filteredSkills[selectedSkillIndex]);
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setSkillMenuDismissed(true);
                  return;
                }
              }
              if (slashMenuOpen && filteredCommands.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setSelectedSlashIndex((prev) => (prev + 1) % filteredCommands.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setSelectedSlashIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
                  return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  handleSelectSlashCommand(filteredCommands[selectedSlashIndex]);
                  return;
                }
                if (e.key === 'Escape') {
                  setSlashMenuOpen(false);
                  return;
                }
              }
              handleKeyDown(e);
            }}
            placeholder={supportsVision ? "Type a message, @ for skills, or attach images..." : "Type a message, @ for skills, or / for commands..."}
            rows={2}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-main)',
              fontSize: '0.925rem',
              lineHeight: '1.4',
              resize: 'none',
              outline: 'none',
              fontFamily: 'var(--font-main)',
              maxHeight: '200px',
              overflowY: 'auto',
            }}
          />
          <button
            type={isGenerating ? 'button' : 'submit'}
            onClick={isGenerating ? onCancelGeneration : undefined}
            disabled={!isGenerating && !input.trim() && imageAttachments.length === 0}
            title={isGenerating ? 'Cancel generation' : 'Send message'}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: isGenerating
                ? 'rgba(239, 68, 68, 0.85)'
                : (input.trim() || imageAttachments.length > 0)
                  ? 'var(--accent-gradient)'
                  : 'rgba(255, 255, 255, 0.05)',
              border: 'none',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isGenerating || input.trim() || imageAttachments.length > 0 ? 'pointer' : 'not-allowed',
              opacity: isGenerating || input.trim() || imageAttachments.length > 0 ? 1 : 0.4,
              transition: 'all 0.2s',
            }}
          >
            {isGenerating ? <Square size={16} fill="currentColor" /> : <Send size={18} />}
          </button>
        </form>
      </div>
    </div>
  );
};
