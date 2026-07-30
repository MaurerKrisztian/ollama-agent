import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Square, Wrench, CheckCircle2, XCircle, ShieldAlert, User, Bot, Loader2, FileText, Folder, Terminal, Edit3, Search, PlusCircle, Sparkles, Code2, Eye, ChevronDown, X } from 'lucide-react';
import { ChatMessage, FileDiffData, PendingApprovalCall, TextAttachment } from '../types';

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

const getToolResultSummary = (
  name: string | undefined,
  args: Record<string, any>,
  result: any,
): string => {
  const target = compactValue(
    args.relative_path || args.absolute_path || args.query || args.command || args.url ||
    result?.file_path || result?.relative_path || result?.working_directory,
  );

  if (result?.error) return `${target} (failed)`.trim();

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

const ToolResultCard: React.FC<{
  message: ChatMessage;
  args: Record<string, any>;
}> = ({ message, args }) => {
  const [expanded, setExpanded] = useState(false);
  let parsedContent: any = null;
  try {
    parsedContent = JSON.parse(message.content);
  } catch (_) {}

  const fileDiff = parsedContent?.diff as FileDiffData | undefined;
  const resultWithoutDiff = parsedContent && fileDiff
    ? Object.fromEntries(Object.entries(parsedContent).filter(([key]) => key !== 'diff'))
    : parsedContent;
  const summary = getToolResultSummary(message.name, args, parsedContent);

  return (
    <div className="animate-fade-in" style={{ marginLeft: '44px', maxWidth: '80%' }}>
      <div style={{ background: 'rgba(20, 184, 166, 0.08)', border: '1px solid rgba(20, 184, 166, 0.25)', borderRadius: '8px', fontSize: '0.825rem', overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          title={expanded ? 'Hide raw tool result' : 'Show raw tool result'}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 10px', border: 0, background: 'transparent', color: 'var(--accent-teal)', cursor: 'pointer', textAlign: 'left', font: 'inherit' }}
        >
          <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
          <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Tool Result: {message.name}</span>
          {summary && (
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontFamily: 'var(--font-code)', fontSize: '0.75rem' }}>
              {summary}
            </span>
          )}
          <ChevronDown size={15} style={{ marginLeft: 'auto', flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
        </button>
        {expanded && (
          <div style={{ padding: '0 12px 12px', borderTop: '1px solid rgba(20, 184, 166, 0.18)' }}>
            <pre style={{ margin: '10px 0 0', maxHeight: '320px', overflow: 'auto', fontSize: '0.775rem' }}>
              {resultWithoutDiff ? JSON.stringify(resultWithoutDiff, null, 2) : message.content}
            </pre>
            {fileDiff && <FileDiff diff={fileDiff} />}
          </div>
        )}
      </div>
    </div>
  );
};

const MarkdownContent: React.FC<{ content: string; streaming?: boolean }> = ({
  content,
  streaming = false,
}) => (
  <div className={`markdown-body${streaming ? ' markdown-body-streaming' : ''}`}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a>,
      }}
    >
      {content}
    </ReactMarkdown>
  </div>
);

const AssistantResponse: React.FC<{ content: string }> = ({ content }) => {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="glass-panel assistant-response" style={{ padding: '12px 18px 16px', borderRadius: '16px 16px 16px 4px', fontSize: '0.925rem', lineHeight: 1.6 }}>
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
  isGenerating: boolean;
  isModelLoaded: boolean;
  generationStatus: 'idle' | 'generating' | 'completed' | 'cancelled' | 'error';
  pendingApprovalCall?: PendingApprovalCall | null;
  onSendMessage: (msg: string, attachments?: TextAttachment[]) => void;
  onCancelGeneration: () => void;
  onApproveToolCall?: () => void;
  onRejectToolCall?: () => void;
}

const QUICK_HELPER_PROMPTS = [
  {
    icon: Folder,
    label: 'List Directory',
    prompt: 'List all files in the root working directory.',
    category: 'directory',
  },
  {
    icon: FileText,
    label: 'Read File',
    prompt: 'Read user_profile.json and tell me what the userId is.',
    category: 'file',
  },
  {
    icon: Terminal,
    label: 'Run Terminal Cmd',
    prompt: 'Run a terminal command using execute_command to list directory files in long format.',
    category: 'terminal',
  },
  {
    icon: Edit3,
    label: 'Edit File',
    prompt: 'Edit config/app_settings.env to change PORT=9090 to PORT=8080.',
    category: 'edit',
  },
  {
    icon: Search,
    label: 'Search Code',
    prompt: 'Search the workspace for the word computeHash.',
    category: 'search',
  },
  {
    icon: PlusCircle,
    label: 'Create File',
    prompt: 'Create a new file named services/logger.ts containing "export const log = (msg) => console.log(msg);".',
    category: 'create',
  },
];

export const ChatWindow: React.FC<ChatWindowProps> = ({
  messages,
  streamingText,
  isGenerating,
  isModelLoaded,
  generationStatus,
  pendingApprovalCall,
  onSendMessage,
  onCancelGeneration,
  onApproveToolCall,
  onRejectToolCall,
}) => {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<TextAttachment[]>([]);
  const [viewedAttachment, setViewedAttachment] = useState<TextAttachment | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);

  const addFiles = async (files: File[]) => {
    setAttachmentError('');
    const remainingSlots = 10 - attachments.length;
    const selected = files.slice(0, remainingSlots);
    if (files.length > remainingSlots) setAttachmentError('You can attach at most 10 files.');

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
    onSendMessage(input.trim(), attachments);
    setInput('');
    setAttachments([]);
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
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      {/* Messages Scrollable Container */}
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', maxWidth: '780px', width: '100%', marginTop: '10px' }}>
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
          if (msg.role === 'user') {
            return (
              <div key={msg.id} className="animate-fade-in" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <div style={{ maxWidth: '75%', background: 'var(--accent-gradient)', color: '#fff', padding: '12px 16px', borderRadius: '16px 16px 4px 16px', fontSize: '0.925rem', lineHeight: 1.5, boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)' }}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{msg.displayContent ?? msg.content}</div>
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '9px' }}>
                      {msg.attachments.map((file, index) => (
                        <button
                          type="button"
                          key={`${file.name}-${index}`}
                          onClick={() => setViewedAttachment(file)}
                          title={`Open ${file.name}`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 8px', border: '1px solid rgba(255, 255, 255, 0.18)', borderRadius: '7px', background: 'rgba(15, 23, 42, 0.28)', color: 'inherit', font: 'inherit', fontSize: '0.74rem', cursor: 'pointer' }}
                        >
                          <FileText size={13} /> {file.name} · {(file.size / 1024).toFixed(1)} KB
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <User size={18} color="#fff" />
                </div>
              </div>
            );
          }

          if (msg.role === 'assistant') {
            return (
              <div key={msg.id} className="animate-fade-in" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-start' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Bot size={18} color="#fff" />
                </div>
                <div style={{ maxWidth: '80%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {msg.tool_calls && msg.tool_calls.length > 0 && (
                    <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', padding: '10px 14px', fontSize: '0.85rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-amber)', fontWeight: 600, marginBottom: '4px' }}>
                        <Wrench size={14} />
                        <span>Tool Invocation Request</span>
                      </div>
                      {msg.tool_calls.map((tc, idx) => (
                        <div key={idx} style={{ fontFamily: 'var(--font-code)', color: '#fcd34d', fontSize: '0.8rem' }}>
                          {tc.name}({JSON.stringify(tc.arguments)})
                        </div>
                      ))}
                    </div>
                  )}

                  {msg.content && (
                    <AssistantResponse content={msg.content} />
                  )}
                </div>
              </div>
            );
          }

          if (msg.role === 'tool') {
            const matchingCall = messages
              .flatMap((message) => message.tool_calls || [])
              .find((call) => call.id === msg.tool_call_id);
            return <ToolResultCard key={msg.id} message={msg} args={matchingCall?.arguments || {}} />;
          }

          return null;
        })}

        {/* Streaming Assistant Card */}
        {streamingText && (
          <div className="animate-fade-in" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-start' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Bot size={18} color="#fff" />
            </div>
            <div className="glass-panel" style={{ maxWidth: '80%', padding: '14px 18px', borderRadius: '16px 16px 16px 4px', fontSize: '0.925rem', lineHeight: 1.6 }}>
              <MarkdownContent content={streamingText} streaming />
            </div>
          </div>
        )}

        {isGenerating && !streamingText && !pendingApprovalCall && (
          <div className="glass-panel animate-fade-in" style={{ display: 'flex', gap: '12px', alignItems: 'center', marginLeft: '44px', padding: '12px 18px', borderRadius: '12px', border: `1px solid ${isModelLoaded ? 'rgba(99, 102, 241, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`, color: isModelLoaded ? 'var(--accent-primary)' : 'var(--accent-amber)', fontSize: '0.875rem' }}>
            <Loader2 size={18} className="spin" />
            <div>
              <span style={{ fontWeight: 600, display: 'block' }}>
                {isModelLoaded ? 'Agent is thinking…' : '⚡ Loading Model Weights into GPU VRAM…'}
              </span>
              <span style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                {isModelLoaded
                  ? 'Preparing the response. Token streaming will start shortly.'
                  : 'Ollama is initializing model weights. Token streaming will start shortly.'}
              </span>
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
              The agent is requesting to execute tool call:
              <div style={{ fontFamily: 'var(--font-code)', background: 'rgba(15, 23, 42, 0.8)', padding: '10px 14px', borderRadius: '8px', marginTop: '6px', color: '#fcd34d', fontSize: '0.825rem' }}>
                {pendingApprovalCall.name}({JSON.stringify(pendingApprovalCall.args, null, 2)})
              </div>
              {pendingApprovalCall.diff && (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.775rem', marginBottom: '4px' }}>Proposed changes</div>
                  <FileDiff diff={pendingApprovalCall.diff} />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
              <button
                onClick={onApproveToolCall}
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
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                }}
              >
                <CheckCircle2 size={16} />
                <span>Approve & Execute</span>
              </button>

              <button
                onClick={onRejectToolCall}
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

        <div ref={messagesEndRef} />
      </div>

      {viewedAttachment && (
        <aside style={{ width: 'min(420px, 42vw)', flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border-color)', background: 'rgba(15, 23, 42, 0.96)', minHeight: 0 }}>
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
          <pre style={{ flex: 1, minHeight: 0, margin: 0, padding: '16px', overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'var(--text-main)', background: 'transparent', fontFamily: 'var(--font-code)', fontSize: '0.8rem', lineHeight: 1.55 }}>
            <HighlightedAttachment file={viewedAttachment} />
          </pre>
        </aside>
      )}
      </div>

      {/* Input Prompt Box */}
      <div style={{ padding: '14px 24px', background: 'rgba(15, 23, 42, 0.8)', borderTop: '1px solid var(--border-color)', zIndex: 5, display: 'flex', flexDirection: 'column', gap: '10px' }}>
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

        {attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
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

        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', background: 'rgba(30, 41, 59, 0.8)', padding: '8px 14px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message, or drag and drop text files here..."
            rows={2}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-main)',
              fontSize: '0.925rem',
              resize: 'none',
              outline: 'none',
              fontFamily: 'var(--font-main)',
            }}
          />
          <button
            type={isGenerating ? 'button' : 'submit'}
            onClick={isGenerating ? onCancelGeneration : undefined}
            disabled={!isGenerating && !input.trim()}
            title={isGenerating ? 'Cancel generation' : 'Send message'}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: isGenerating
                ? 'rgba(239, 68, 68, 0.85)'
                : input.trim()
                  ? 'var(--accent-gradient)'
                  : 'rgba(255, 255, 255, 0.05)',
              border: 'none',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isGenerating || input.trim() ? 'pointer' : 'not-allowed',
              opacity: isGenerating || input.trim() ? 1 : 0.4,
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
