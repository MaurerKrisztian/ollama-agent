import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import MonacoEditor, { DiffEditor, useMonaco } from '@monaco-editor/react';
import type { AgentConfig } from '../types';
import { FileTreeNode, type FileTreeEntry } from './FileTreeNode';
import { EditorTabBar, type EditorTab } from './EditorTabBar';
import { registerLspProviders, resetLspRegistration } from '../utils/monacoLspBridge';
import {
  RefreshCw,
  FilePlus,
  FolderPlus,
  Save,
  AlertTriangle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  FileText,
  GitCompare,
  Check,
  RotateCcw,
  Globe,
  ExternalLink,
  Brain,
  Trash2,
  Terminal,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export interface AiEditEvent {
  path: string;
  startLine?: number;
  endLine?: number;
  operationType?: 'read' | 'write';
  beforeContent?: string;
  afterContent?: string;
  timestamp: number;
}

interface EditorViewProps {
  config: AgentConfig;
  lastAiEditEvent?: AiEditEvent | null;
  onSaveFile?: (path: string) => void;
  onRevertFile?: (path: string) => void;
  onSendErrorToAi?: (errorText: string) => void;
}

const EXT_LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescriptreact',
  js: 'javascript', jsx: 'javascriptreact',
  json: 'json', jsonc: 'json',
  md: 'markdown', mdx: 'markdown',
  css: 'css', scss: 'scss', sass: 'scss', less: 'less',
  html: 'html', htm: 'html', xml: 'xml', svg: 'xml',
  yaml: 'yaml', yml: 'yaml',
  toml: 'toml',
  py: 'python',
  sh: 'shell', bash: 'shell',
  env: 'ini',
  txt: 'plaintext',
};

function getLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return EXT_LANG_MAP[ext] ?? 'plaintext';
}

/** Defines the custom Catppuccin Mocha-inspired Monaco theme. */
function defineEditorTheme(monaco: any) {
  monaco.editor.defineTheme('catppuccin-mocha', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'cba6f7' },
      { token: 'string', foreground: 'a6e3a1' },
      { token: 'comment', foreground: '585b70', fontStyle: 'italic' },
      { token: 'number', foreground: 'fab387' },
      { token: 'type', foreground: '89dceb' },
      { token: 'class', foreground: 'f9e2af' },
      { token: 'function', foreground: '89b4fa' },
      { token: 'variable', foreground: 'cdd6f4' },
      { token: 'constant', foreground: 'fab387' },
      { token: 'operator', foreground: '89dceb' },
      { token: 'delimiter', foreground: '6c7086' },
      { token: 'parameter', foreground: 'f38ba8' },
    ],
    colors: {
      'editor.background': '#11111b',
      'editor.foreground': '#cdd6f4',
      'editorCursor.foreground': '#89b4fa',
      'editor.lineHighlightBackground': '#1e1e2e',
      'editorLineNumber.foreground': '#45475a',
      'editorLineNumber.activeForeground': '#7f849c',
      'editor.selectionBackground': '#313244',
      'editor.inactiveSelectionBackground': '#252536',
      'editorWidget.background': '#181825',
      'editorWidget.border': '#313244',
      'editorSuggestWidget.background': '#181825',
      'editorSuggestWidget.border': '#313244',
      'editorSuggestWidget.selectedBackground': '#313244',
      'editorSuggestWidget.foreground': '#cdd6f4',
      'editorSuggestWidget.highlightForeground': '#89b4fa',
      'input.background': '#181825',
      'input.foreground': '#cdd6f4',
      'input.border': '#313244',
      'scrollbarSlider.background': '#31324466',
      'scrollbarSlider.hoverBackground': '#45475a99',
      'peekViewEditor.background': '#181825',
      'peekViewResult.background': '#1e1e2e',
      'peekViewResult.selectionBackground': '#313244',
      'peekView.border': '#89b4fa',
    },
  });
}

interface PreviewConsoleLog {
  id: string;
  level: 'error' | 'warn' | 'info';
  message: string;
  line?: number;
  col?: number;
  stack?: string;
  fileName?: string;
  timestamp: number;
}

const CONSOLE_BRIDGE_SCRIPT = `<script>
(function() {
  function emitLog(level, message, line, col, stack, filename) {
    try {
      window.parent.postMessage({
        type: 'html_preview_console_log',
        level: level,
        message: String(message),
        line: line,
        col: col,
        stack: stack,
        filename: filename || '',
        timestamp: Date.now()
      }, '*');
    } catch(e) {}
  }

  var _error = console.error;
  var _warn = console.warn;
  var _log = console.log;

  console.error = function() {
    var msg = Array.prototype.slice.call(arguments).map(function(a){ return typeof a === 'object' ? JSON.stringify(a) : String(a); }).join(' ');
    emitLog('error', msg);
    if (_error) _error.apply(console, arguments);
  };

  console.warn = function() {
    var msg = Array.prototype.slice.call(arguments).map(function(a){ return typeof a === 'object' ? JSON.stringify(a) : String(a); }).join(' ');
    emitLog('warn', msg);
    if (_warn) _warn.apply(console, arguments);
  };

  console.log = function() {
    var msg = Array.prototype.slice.call(arguments).map(function(a){ return typeof a === 'object' ? JSON.stringify(a) : String(a); }).join(' ');
    emitLog('info', msg);
    if (_log) _log.apply(console, arguments);
  };

  window.addEventListener('error', function(e) {
    var fn = (e.filename ? e.filename.split('/').pop() : '') || '';
    emitLog('error', e.message || 'Script error', e.lineno, e.colno, e.error ? e.error.stack : '', fn);
  });

  window.addEventListener('unhandledrejection', function(e) {
    emitLog('error', 'Unhandled Promise Rejection: ' + (e.reason ? (e.reason.message || String(e.reason)) : 'Unknown reason'));
  });

  // Automatically request keyboard focus for Canvas games (WASD / Arrow controls)
  function claimFocus() {
    try {
      window.focus();
      var canvas = document.querySelector('canvas');
      if (canvas) {
        if (!canvas.hasAttribute('tabindex')) canvas.setAttribute('tabindex', '0');
        canvas.focus();
      }
    } catch(e) {}
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', claimFocus);
  } else {
    claimFocus();
  }
  window.addEventListener('load', claimFocus);
  window.addEventListener('click', claimFocus);
  window.addEventListener('pointerdown', claimFocus);
})();
</script>`;

export const EditorView: React.FC<EditorViewProps> = ({ config, lastAiEditEvent, onSaveFile, onRevertFile, onSendErrorToAi }) => {
  const monaco = useMonaco();
  const editorRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);
  const [tree, setTree] = useState<FileTreeEntry[]>([]);
  const [workingDir, setWorkingDir] = useState('');
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);

  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  // fileContents: path -> {original, current}
  const [fileContents, setFileContents] = useState<Record<string, { original: string; current: string }>>({});
  const [diffMode, setDiffMode] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewLogs, setPreviewLogs] = useState<PreviewConsoleLog[]>([]);
  const [consoleDrawerOpen, setConsoleDrawerOpen] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'html_preview_console_log') {
        const newLog: PreviewConsoleLog = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          level: e.data.level || 'info',
          message: e.data.message || '',
          line: e.data.line,
          col: e.data.col,
          stack: e.data.stack,
          fileName: e.data.filename ? e.data.filename.split('/').pop() : undefined,
          timestamp: e.data.timestamp || Date.now(),
        };
        setPreviewLogs((prev) => [...prev.slice(-49), newLog]);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const errorLogsCount = useMemo(() => previewLogs.filter((l) => l.level === 'error').length, [previewLogs]);
  const warnLogsCount = useMemo(() => previewLogs.filter((l) => l.level === 'warn').length, [previewLogs]);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; entry: FileTreeEntry } | null>(null);

  // New file/folder dialog
  const [newItemDialog, setNewItemDialog] = useState<{ type: 'file' | 'dir'; parentPath: string } | null>(null);
  const [newItemName, setNewItemName] = useState('');

  // Sidebar collapsed state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Diagnostics polling
  const diagnosticsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const lspRegisteredRef = useRef(false);

  // ── LSP providers ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!monaco || lspRegisteredRef.current) return;
    defineEditorTheme(monaco);
    registerLspProviders(monaco, workingDir);
    lspRegisteredRef.current = true;
    return () => {
      resetLspRegistration();
      lspRegisteredRef.current = false;
    };
  }, [monaco, workingDir]);

  // Re-register when workingDir changes
  useEffect(() => {
    if (!monaco) return;
    resetLspRegistration();
    lspRegisteredRef.current = false;
    registerLspProviders(monaco, workingDir);
    lspRegisteredRef.current = true;
  }, [workingDir, monaco]);

  // ── Load file tree ─────────────────────────────────────────────────────────
  const loadTree = useCallback(async () => {
    setTreeLoading(true);
    setTreeError(null);
    try {
      const res = await fetch('/api/editor/tree');
      const data = await res.json();
      if (data.success) {
        setTree(data.tree);
        setWorkingDir(data.workingDir || '');
      } else {
        setTreeError(data.error || 'Failed to load tree');
      }
    } catch (e: any) {
      setTreeError(e.message);
    } finally {
      setTreeLoading(false);
    }
  }, []);

  useEffect(() => { loadTree(); }, [config.workingDir, loadTree]);

  // ── Open file ──────────────────────────────────────────────────────────────
  const openFile = useCallback(async (relPath: string) => {
    // Quick check using current snapshot — avoids unnecessary fetch
    if (tabs.some((t) => t.path === relPath)) {
      setActiveTabPath(relPath);
      return;
    }
    try {
      const res = await fetch(`/api/editor/file?path=${encodeURIComponent(relPath)}`);
      const data = await res.json();
      if (!data.success) {
        if (data.error && (data.error.includes('EISDIR') || data.error.includes('illegal operation on a directory'))) {
          return;
        }
        alert(`Could not open file: ${data.error}`);
        return;
      }
      const content: string = data.content ?? '';
      setFileContents((prev) => ({ ...prev, [relPath]: { original: content, current: content } }));
      const name = relPath.split('/').pop() ?? relPath;
      // Guard inside updater to handle concurrent calls with stale closure
      setTabs((prev) => {
        if (prev.some((t) => t.path === relPath)) return prev;
        return [...prev, { path: relPath, name, dirty: false }];
      });
      setActiveTabPath(relPath);
    } catch (e: any) {
      if (e.message && (e.message.includes('EISDIR') || e.message.includes('illegal operation on a directory'))) {
        return;
      }
      alert(`Error opening file: ${e.message}`);
    }
  }, [tabs]);

  const processedEventTimestampRef = useRef<number | null>(null);

  // ── Handle AI Live Edit Events (Auto-open tab + scroll & highlight) ────────
  useEffect(() => {
    if (!lastAiEditEvent || !lastAiEditEvent.path || !lastAiEditEvent.timestamp) return;
    if (processedEventTimestampRef.current === lastAiEditEvent.timestamp) return;
    processedEventTimestampRef.current = lastAiEditEvent.timestamp;

    let targetPath = lastAiEditEvent.path.trim();
    if (workingDir && targetPath.startsWith(workingDir)) {
      targetPath = targetPath.slice(workingDir.length);
    } else if (workingDir && targetPath.startsWith(workingDir.replace(/^[\/\\]+/, ''))) {
      targetPath = targetPath.slice(workingDir.replace(/^[\/\\]+/, '').length);
    }
    targetPath = targetPath.replace(/^(\.\/|\/|\\)+/, '');

    void openFile(targetPath);

    if (lastAiEditEvent.beforeContent !== undefined) {
      setFileContents((prev) => ({
        ...prev,
        [targetPath]: {
          original: lastAiEditEvent.beforeContent ?? prev[targetPath]?.original ?? '',
          current: lastAiEditEvent.afterContent ?? prev[targetPath]?.current ?? '',
        },
      }));
    }

    if (lastAiEditEvent.operationType === 'write') {
      setDiffMode(true);
    }

    // Refresh content from disk in case AI modified it directly
    fetch(`/api/editor/file?path=${encodeURIComponent(targetPath)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.success && typeof data.content === 'string') {
          setFileContents((prev) => {
            const existing = prev[targetPath];
            const originalContent = lastAiEditEvent.beforeContent ?? existing?.original ?? data.content;
            return {
              ...prev,
              [targetPath]: { original: originalContent, current: data.content },
            };
          });
        }
      })
      .catch(() => {});

    const timer = setTimeout(() => {
      if (editorRef.current && monaco) {
        try {
          const modelLineCount = editorRef.current.getModel()?.getLineCount() ?? 1;
          const startLine = Math.max(1, lastAiEditEvent.startLine ?? 1);
          const endLine = Math.min(
            modelLineCount,
            Math.max(
              startLine,
              lastAiEditEvent.endLine ?? (lastAiEditEvent.startLine !== undefined ? startLine + 8 : modelLineCount)
            )
          );

          editorRef.current.revealLineInCenter(startLine);
          const newDecorations = editorRef.current.deltaDecorations(
            decorationsRef.current,
            [
              {
                range: new monaco.Range(startLine, 1, endLine, 1),
                options: {
                  isWholeLine: true,
                  className: lastAiEditEvent.operationType === 'read' ? 'ai-read-highlight-line' : 'ai-write-highlight-line',
                },
              },
            ]
          );
          decorationsRef.current = newDecorations;

          setTimeout(() => {
            if (editorRef.current) {
              decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, []);
            }
          }, 3500);
        } catch (_) {}
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [lastAiEditEvent, openFile, workingDir, monaco]);

  // ── Close tab ──────────────────────────────────────────────────────────────
  const closeTab = useCallback((path: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.path === path);
      const next = prev.filter((t) => t.path !== path);
      if (activeTabPath === path) {
        const newActive = next[Math.min(idx, next.length - 1)]?.path ?? null;
        setActiveTabPath(newActive);
      }
      return next;
    });
    setFileContents((prev) => {
      const copy = { ...prev };
      delete copy[path];
      return copy;
    });
  }, [activeTabPath]);

  // ── Content change ─────────────────────────────────────────────────────────
  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!activeTabPath) return;
    const val = value ?? '';
    setFileContents((prev) => ({
      ...prev,
      [activeTabPath]: { ...prev[activeTabPath], current: val },
    }));
    setTabs((prev) => prev.map((t) =>
      t.path === activeTabPath
        ? { ...t, dirty: val !== (fileContents[activeTabPath]?.original ?? '') }
        : t,
    ));
  }, [activeTabPath, fileContents]);

  // ── Save file ──────────────────────────────────────────────────────────────
  const saveFile = useCallback(async (path?: string) => {
    const targetPath = path ?? activeTabPath;
    if (!targetPath) return;
    const content = fileContents[targetPath]?.current;
    if (content === undefined) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/editor/file', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath, content }),
      });
      const data = await res.json();
      if (data.success) {
        setFileContents((prev) => ({ ...prev, [targetPath]: { original: content, current: content } }));
        setTabs((prev) => prev.map((t) => t.path === targetPath ? { ...t, dirty: false } : t));
        onSaveFile?.(targetPath);
      } else {
        setSaveError(data.error || 'Save failed');
      }
    } catch (e: any) {
      setSaveError(e.message);
    } finally {
      setIsSaving(false);
    }
  }, [activeTabPath, fileContents, onSaveFile]);

  // ── Revert file ────────────────────────────────────────────────────────────
  const revertFile = useCallback((path?: string) => {
    const targetPath = path ?? activeTabPath;
    if (!targetPath || !fileContents[targetPath]) return;
    const orig = fileContents[targetPath].original;
    setFileContents((prev) => ({
      ...prev,
      [targetPath]: { original: orig, current: orig },
    }));
    setTabs((prev) => prev.map((t) => (t.path === targetPath ? { ...t, dirty: false } : t)));
    onRevertFile?.(targetPath);
  }, [activeTabPath, fileContents, onRevertFile]);

  // Ctrl+S keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [saveFile]);

  // ── Diagnostics polling ────────────────────────────────────────────────────
  useEffect(() => {
    if (!monaco || !activeTabPath) {
      if (diagnosticsIntervalRef.current) {
        clearInterval(diagnosticsIntervalRef.current);
        diagnosticsIntervalRef.current = null;
      }
      return;
    }
    const lang = getLanguage(activeTabPath);
    if (!['typescript', 'typescriptreact', 'javascript', 'javascriptreact'].includes(lang)) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/editor/lsp/diagnostics?path=${encodeURIComponent(activeTabPath)}`);
        const data = await res.json();
        if (!data.success || !data.diagnostics) return;
        const model = monaco.editor.getModels().find((m) => m.uri.toString().includes(activeTabPath));
        if (!model) return;
        const markers = data.diagnostics.map((d: any) => ({
          severity: d.severity === 'error' ? monaco.MarkerSeverity.Error
            : d.severity === 'warning' ? monaco.MarkerSeverity.Warning
              : d.severity === 'info' ? monaco.MarkerSeverity.Info
                : monaco.MarkerSeverity.Hint,
          message: d.message,
          startLineNumber: d.line,
          startColumn: d.character,
          endLineNumber: d.line,
          endColumn: d.character + 1,
        }));
        monaco.editor.setModelMarkers(model, 'lsp', markers);
      } catch { /* ignore */ }
    };

    poll();
    diagnosticsIntervalRef.current = setInterval(poll, 3000);
    return () => {
      if (diagnosticsIntervalRef.current) clearInterval(diagnosticsIntervalRef.current);
    };
  }, [monaco, activeTabPath]);

  // ── Context menu ───────────────────────────────────────────────────────────
  const handleContextMenu = useCallback((e: React.MouseEvent, entry: FileTreeEntry) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, entry });
  }, []);

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  const handleDeleteFile = useCallback(async (entry: FileTreeEntry) => {
    const isDir = entry.type === 'dir';
    if (!window.confirm(`Delete ${isDir ? 'folder and its contents' : 'file'} "${entry.name}"?`)) return;
    try {
      const res = await fetch('/api/editor/file', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: entry.path }),
      });
      const data = await res.json();
      if (data.success) {
        closeTab(entry.path);
        loadTree();
      } else {
        alert(`Failed to delete: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Delete error: ${err.message}`);
    } finally {
      closeCtxMenu();
    }
  }, [closeTab, loadTree, closeCtxMenu]);

  // ── New file/dir ───────────────────────────────────────────────────────────
  const openNewItemDialog = useCallback((type: 'file' | 'dir', entry?: FileTreeEntry) => {
    const parentPath = entry?.type === 'dir' ? entry.path : (entry ? entry.path.replace(/\/[^/]+$/, '') : '');
    setNewItemDialog({ type, parentPath });
    setNewItemName('');
    closeCtxMenu();
  }, [closeCtxMenu]);

  const confirmNewItem = useCallback(async () => {
    if (!newItemDialog || !newItemName.trim()) return;
    const fullPath = newItemDialog.parentPath
      ? `${newItemDialog.parentPath}/${newItemName.trim()}`
      : newItemName.trim();
    if (newItemDialog.type === 'dir') {
      await fetch('/api/editor/mkdir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: fullPath }) });
    } else {
      await fetch('/api/editor/file', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: fullPath, content: '' }) });
      openFile(fullPath);
    }
    loadTree();
    setNewItemDialog(null);
    setNewItemName('');
  }, [newItemDialog, newItemName, loadTree, openFile]);

  // ── Current file state ─────────────────────────────────────────────────────
  const activeFile = activeTabPath ? fileContents[activeTabPath] : null;
  const activeTab = tabs.find((t) => t.path === activeTabPath) ?? null;
  const editorLang = activeTabPath ? getLanguage(activeTabPath) : 'plaintext';
  const editorModelUri = useMemo(() => {
    if (!activeTabPath || !workingDir) return undefined;
    return `file://${workingDir}/${activeTabPath}`;
  }, [activeTabPath, workingDir]);

  return (
    <div
      style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
        background: 'var(--bg-primary, #11111b)',
        position: 'relative',
      }}
      onClick={closeCtxMenu}
    >
      {/* ─── Sidebar ─────────────────────────────────────────────────────── */}
      <div
        style={{
          width: sidebarCollapsed ? 0 : '240px',
          minWidth: sidebarCollapsed ? 0 : '200px',
          maxWidth: sidebarCollapsed ? 0 : '340px',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--border, #313244)',
          background: 'var(--bg-secondary, #1e1e2e)',
          overflow: 'hidden',
          flexShrink: 0,
          transition: 'width 0.2s ease, min-width 0.2s ease',
        }}
      >
        {/* Sidebar header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px',
          borderBottom: '1px solid var(--border, #313244)',
          gap: '6px',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', color: 'var(--text-secondary, #a6adc8)', textTransform: 'uppercase' }}>
            Explorer
          </span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={() => openNewItemDialog('file')} title="New File" style={iconBtnStyle}>
              <FilePlus size={14} />
            </button>
            <button onClick={() => openNewItemDialog('dir')} title="New Folder" style={iconBtnStyle}>
              <FolderPlus size={14} />
            </button>
            <button onClick={loadTree} title="Refresh" style={iconBtnStyle} disabled={treeLoading}>
              {treeLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />}
            </button>
          </div>
        </div>

        {/* Working dir label */}
        <div style={{
          padding: '4px 10px 6px',
          fontSize: '11px',
          color: 'var(--text-muted, #585b70)',
          fontFamily: 'monospace',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          borderBottom: '1px solid var(--border, #313244)',
        }} title={workingDir}>
          {workingDir || '—'}
        </div>

        {/* Tree */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '4px 0' }}>
          {treeError && (
            <div style={{ padding: '12px', color: 'var(--accent-warn, #f38ba8)', fontSize: '12px', display: 'flex', gap: '6px', alignItems: 'center' }}>
              <AlertTriangle size={14} /> {treeError}
            </div>
          )}
          {!treeError && tree.map((entry) => (
            <FileTreeNode
              key={entry.path}
              entry={entry}
              selectedPath={activeTabPath}
              onSelectFile={openFile}
              depth={0}
              onContextMenu={handleContextMenu}
            />
          ))}
        </div>
      </div>

      {/* Sidebar collapse/expand toggle */}
      <button
        onClick={() => setSidebarCollapsed((v) => !v)}
        title={sidebarCollapsed ? 'Show explorer' : 'Hide explorer'}
        style={{
          position: 'absolute',
          top: '50%',
          left: sidebarCollapsed ? 0 : '240px',
          transform: 'translateY(-50%)',
          zIndex: 20,
          background: 'var(--bg-secondary, #1e1e2e)',
          border: '1px solid var(--border, #313244)',
          borderLeft: sidebarCollapsed ? '1px solid var(--border, #313244)' : 'none',
          borderRadius: sidebarCollapsed ? '0 6px 6px 0' : '0 6px 6px 0',
          cursor: 'pointer',
          padding: '6px 3px',
          color: 'var(--text-muted, #585b70)',
          transition: 'left 0.2s ease',
          lineHeight: 0,
        }}
      >
        {sidebarCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* ─── Editor pane ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        {/* Tab bar */}
        <EditorTabBar
          tabs={tabs}
          activeTab={activeTabPath}
          onSelectTab={setActiveTabPath}
          onCloseTab={closeTab}
        />

        {/* Save bar */}
        {activeTab && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '4px 12px',
            borderBottom: '1px solid var(--border, #313244)',
            background: 'var(--bg-secondary, #1e1e2e)',
            flexShrink: 0,
            minHeight: '34px',
          }}>
            <span style={{
              fontSize: '12px',
              fontFamily: 'monospace',
              color: 'var(--text-secondary, #a6adc8)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}>
              {activeTab.path}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted, #585b70)', flexShrink: 0 }}>
              {editorLang}
            </span>

            {/* View Mode Switcher: Code vs AI Diff */}
            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', padding: '2px', borderRadius: '6px', gap: '2px', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setDiffMode(false)}
                title="Switch to Code Editor view"
                style={{
                  padding: '3px 8px', borderRadius: '4px', border: 'none',
                  background: !diffMode ? 'var(--accent, #89b4fa)' : 'transparent',
                  color: !diffMode ? '#11111b' : 'var(--text-muted, #585b70)',
                  fontSize: '11px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                }}
              >
                <FileText size={12} /> Code
              </button>
              <button
                type="button"
                onClick={() => setDiffMode(true)}
                title="Switch to AI Diff view (Original vs Modified)"
                style={{
                  padding: '3px 8px', borderRadius: '4px', border: 'none',
                  background: diffMode ? 'var(--accent, #89b4fa)' : 'transparent',
                  color: diffMode ? '#11111b' : 'var(--text-muted, #585b70)',
                  fontSize: '11px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                }}
              >
                <GitCompare size={12} /> AI Diff
              </button>
            </div>

            {/* HTML Live Preview Toggle (visible for .html files) */}
            {editorLang === 'html' && (
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                title="Toggle real-time HTML Preview renderer"
                style={{
                  padding: '3px 8px', borderRadius: '6px', border: 'none',
                  background: showPreview ? 'var(--accent, #89b4fa)' : 'transparent',
                  color: showPreview ? '#11111b' : 'var(--text-muted, #585b70)',
                  fontSize: '11px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                  flexShrink: 0,
                }}
              >
                <Globe size={12} /> {showPreview ? 'Hide Preview' : 'Live Preview'}
              </button>
            )}

            {/* Accept & Revert buttons when file has unsaved/dirty AI edits */}
            {(activeTab.dirty || activeFile?.original !== activeFile?.current) && (
              <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => revertFile()}
                  title="Revert changes to original file content"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '3px 8px', borderRadius: '6px', border: '1px solid var(--border, #313244)',
                    background: 'transparent', color: 'var(--accent-warn, #f38ba8)',
                    fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <RotateCcw size={12} /> Revert
                </button>
                <button
                  type="button"
                  onClick={() => saveFile()}
                  disabled={isSaving}
                  title="Accept & Save changes to file"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '3px 10px', borderRadius: '6px', border: 'none',
                    background: 'var(--accent, #89b4fa)', color: '#11111b',
                    fontSize: '11px', fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer',
                    opacity: isSaving ? 0.6 : 1,
                  }}
                >
                  {isSaving ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />}
                  {isSaving ? 'Saving…' : 'Accept & Save'}
                </button>
              </div>
            )}
            {saveError && (
              <span style={{ fontSize: '11px', color: 'var(--accent-warn, #f38ba8)', flexShrink: 0 }}>
                {saveError}
              </span>
            )}
          </div>
        )}

        {/* Monaco Editor or Diff Editor + HTML Preview Split Pane */}
        {activeTabPath && activeFile ? (
          <div style={{ display: 'flex', flex: 1, height: '100%', overflow: 'hidden' }}>
            <div style={{ flex: 1, height: '100%', minWidth: 0, overflow: 'hidden' }}>
              {diffMode ? (
                <DiffEditor
                  key={`diff-${activeTabPath}`}
                  height="100%"
                  language={editorLang}
                  theme="catppuccin-mocha"
                  original={activeFile.original}
                  modified={activeFile.current}
                  options={{
                    fontSize: 14,
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
                    lineHeight: 22,
                    renderSideBySide: true,
                    originalEditable: false,
                    readOnly: false,
                    smoothScrolling: true,
                    automaticLayout: true,
                    scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
                  }}
                  beforeMount={(monaco) => {
                    defineEditorTheme(monaco);
                  }}
                />
              ) : (
                <MonacoEditor
                  key={`edit-${activeTabPath}`}
                  height="100%"
                  language={editorLang}
                  theme="catppuccin-mocha"
                  value={activeFile.current}
                  path={editorModelUri}
                  onChange={handleEditorChange}
                  options={{
                    fontSize: 14,
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
                    fontLigatures: true,
                    lineHeight: 22,
                    minimap: { enabled: true, scale: 1 },
                    scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
                    smoothScrolling: true,
                    cursorSmoothCaretAnimation: 'on',
                    cursorBlinking: 'smooth',
                    renderLineHighlight: 'line',
                    padding: { top: 12, bottom: 12 },
                    tabSize: 2,
                    bracketPairColorization: { enabled: true },
                    guides: { bracketPairs: true, indentation: true },
                    wordWrap: 'off',
                    scrollBeyondLastLine: false,
                    suggest: { preview: true, showStatusBar: true },
                    quickSuggestions: { other: true, comments: false, strings: false },
                    parameterHints: { enabled: true },
                    formatOnType: false,
                    formatOnPaste: false,
                    automaticLayout: true,
                  }}
                  beforeMount={(monaco) => {
                    defineEditorTheme(monaco);
                  }}
                  onMount={(editor) => {
                    editorRef.current = editor;
                  }}
                />
              )}
            </div>

            {/* Sandboxed Live HTML Render Pane */}
            {showPreview && editorLang === 'html' && (
              <div style={{
                width: '50%',
                borderLeft: '1px solid var(--border, #313244)',
                display: 'flex',
                flexDirection: 'column',
                background: '#ffffff',
                position: 'relative',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 12px',
                  background: 'var(--bg-secondary, #1e1e2e)',
                  borderBottom: '1px solid var(--border, #313244)',
                  color: 'var(--text-secondary, #a6adc8)',
                  fontSize: '11px',
                  fontWeight: 600,
                  flexShrink: 0,
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Globe size={13} color="var(--accent, #89b4fa)" /> Live HTML Preview
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const blob = new Blob([activeFile.current], { type: 'text/html' });
                      const url = URL.createObjectURL(blob);
                      window.open(url, '_blank');
                    }}
                    title="Open rendered page in a new browser window"
                    style={{
                      background: 'transparent', border: 'none', color: 'var(--text-secondary, #a6adc8)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px',
                      fontWeight: 600,
                    }}
                  >
                    <ExternalLink size={12} /> Pop out
                  </button>
                </div>
                <iframe
                  key={activeTabPath}
                  srcDoc={CONSOLE_BRIDGE_SCRIPT + (activeFile.current || '')}
                  title="HTML Live Preview"
                  tabIndex={0}
                  sandbox="allow-scripts allow-modals allow-forms allow-same-origin allow-pointer-lock"
                  style={{
                    width: '100%',
                    flex: 1,
                    border: 'none',
                    background: '#ffffff',
                    outline: 'none',
                  }}
                />

                {/* Console Logs Drawer */}
                <div style={{
                  borderTop: '1px solid var(--border, #313244)',
                  background: '#11111b',
                  display: 'flex',
                  flexDirection: 'column',
                  maxHeight: consoleDrawerOpen ? '180px' : '32px',
                  transition: 'max-height 0.2s ease',
                  flexShrink: 0,
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 10px',
                    background: '#181825',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                  onClick={() => setConsoleDrawerOpen((v) => !v)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Terminal size={12} color="var(--accent, #89b4fa)" />
                      <span>Console Logs ({previewLogs.length})</span>
                      {errorLogsCount > 0 && (
                        <span style={{ color: '#f38ba8', background: 'rgba(243,139,168,0.15)', padding: '1px 6px', borderRadius: '4px' }}>
                          🔴 {errorLogsCount} error{errorLogsCount === 1 ? '' : 's'}
                        </span>
                      )}
                      {warnLogsCount > 0 && (
                        <span style={{ color: '#fab387', background: 'rgba(250,179,135,0.15)', padding: '1px 6px', borderRadius: '4px' }}>
                          ⚠️ {warnLogsCount}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                      {errorLogsCount > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const errMsgs = previewLogs
                              .filter((l) => l.level === 'error')
                              .map((l) => `🔴 [${l.fileName || (activeTabPath ? activeTabPath.split('/').pop() : '')}${l.line ? `:${l.line}` : ''}${l.col ? `:${l.col}` : ''}] ${l.message}`)
                              .join('\n');
                            const promptText = `Please fix the following JavaScript console errors in ${activeTabPath}:\n\n${errMsgs}`;
                            onSendErrorToAi?.(promptText);
                          }}
                          title="Send console errors to AI to fix code"
                          style={{
                            background: 'var(--accent, #89b4fa)', color: '#11111b',
                            border: 'none', padding: '2px 8px', borderRadius: '4px',
                            fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '4px',
                          }}
                        >
                          <Brain size={12} /> Send Errors to AI
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setPreviewLogs([])}
                        title="Clear console logs"
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted, #585b70)', cursor: 'pointer', padding: '2px 4px' }}
                      >
                        <Trash2 size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConsoleDrawerOpen((v) => !v)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted, #585b70)', cursor: 'pointer', padding: '2px 4px' }}
                      >
                        {consoleDrawerOpen ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                      </button>
                    </div>
                  </div>

                  {consoleDrawerOpen && (
                    <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px', fontFamily: 'monospace', fontSize: '11px' }}>
                      {previewLogs.length === 0 ? (
                        <div style={{ color: 'var(--text-muted, #585b70)', fontStyle: 'italic', padding: '4px 0' }}>
                          No console logs captured yet.
                        </div>
                      ) : (
                        previewLogs.map((log) => (
                          <div
                            key={log.id}
                            style={{
                              padding: '3px 6px',
                              borderRadius: '4px',
                              marginBottom: '2px',
                              background:
                                log.level === 'error' ? 'rgba(243,139,168,0.12)' :
                                log.level === 'warn' ? 'rgba(250,179,135,0.12)' :
                                'transparent',
                              color:
                                log.level === 'error' ? '#f38ba8' :
                                log.level === 'warn' ? '#fab387' :
                                '#cdd6f4',
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: '8px',
                              wordBreak: 'break-all',
                            }}
                          >
                            <span>
                              {log.level === 'error' ? '🔴 ' : log.level === 'warn' ? '⚠️ ' : 'ℹ️ '}
                              {log.message}
                            </span>
                            <span style={{ opacity: 0.6, flexShrink: 0, fontSize: '10px' }}>
                              {log.fileName || (activeTabPath ? activeTabPath.split('/').pop() : '')}{log.line ? `:${log.line}` : ''}{log.col ? `:${log.col}` : ''}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted, #585b70)',
            gap: '16px',
            userSelect: 'none',
          }}>
            <div style={{ fontSize: '48px', opacity: 0.3 }}>⌨️</div>
            <div style={{ fontSize: '14px', fontWeight: 500 }}>No file open</div>
            <div style={{ fontSize: '12px', opacity: 0.6 }}>Select a file from the explorer to start editing</div>
          </div>
        )}
      </div>

      {/* ─── Context menu ────────────────────────────────────────────────── */}
      {ctxMenu && (
        <div
          style={{
            position: 'fixed',
            top: ctxMenu.y,
            left: ctxMenu.x,
            background: 'var(--bg-secondary, #1e1e2e)',
            border: '1px solid var(--border, #313244)',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            zIndex: 9999,
            minWidth: '160px',
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {ctxMenu.entry.type === 'dir' && (
            <>
              <CtxMenuItem label="New File Here" onClick={() => openNewItemDialog('file', ctxMenu.entry)} />
              <CtxMenuItem label="New Folder Here" onClick={() => openNewItemDialog('dir', ctxMenu.entry)} />
              <div style={{ height: '1px', background: 'var(--border, #313244)', margin: '4px 0' }} />
            </>
          )}
          {ctxMenu.entry.type === 'file' && (
            <CtxMenuItem label="Open" onClick={() => { openFile(ctxMenu.entry.path); closeCtxMenu(); }} />
          )}
          <CtxMenuItem
            label="Delete"
            danger
            onClick={() => handleDeleteFile(ctxMenu.entry)}
          />
        </div>
      )}

      {/* ─── New item dialog ──────────────────────────────────────────────── */}
      {newItemDialog && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9998,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setNewItemDialog(null)}
        >
          <div
            style={{
              background: 'var(--bg-secondary, #1e1e2e)',
              border: '1px solid var(--border, #313244)',
              borderRadius: '12px',
              padding: '24px',
              minWidth: '320px',
              boxShadow: '0 24px 48px rgba(0,0,0,0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 600, color: 'var(--text-primary, #cdd6f4)' }}>
              {newItemDialog.type === 'file' ? 'New File' : 'New Folder'}
            </h3>
            <div style={{ fontSize: '12px', color: 'var(--text-muted, #585b70)', marginBottom: '8px', fontFamily: 'monospace' }}>
              {newItemDialog.parentPath || workingDir}
            </div>
            <input
              autoFocus
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmNewItem(); if (e.key === 'Escape') setNewItemDialog(null); }}
              placeholder={newItemDialog.type === 'file' ? 'filename.ts' : 'directory-name'}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'var(--bg-primary, #11111b)', border: '1px solid var(--border, #313244)',
                borderRadius: '8px', padding: '8px 12px',
                color: 'var(--text-primary, #cdd6f4)', fontSize: '14px',
                outline: 'none', marginBottom: '16px',
              }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setNewItemDialog(null)} style={cancelBtnStyle}>Cancel</button>
              <button onClick={confirmNewItem} disabled={!newItemName.trim()} style={primaryBtnStyle}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Tiny shared style helpers ──────────────────────────────────────────────────

const iconBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: 'var(--text-secondary, #a6adc8)', padding: '4px',
  borderRadius: '4px', transition: 'color 0.15s, background 0.15s',
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '7px 16px', borderRadius: '8px',
  border: '1px solid var(--border, #313244)',
  background: 'transparent', color: 'var(--text-secondary, #a6adc8)',
  fontSize: '13px', cursor: 'pointer',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '7px 16px', borderRadius: '8px',
  border: 'none', background: 'var(--accent, #89b4fa)',
  color: '#11111b', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
};

const CtxMenuItem: React.FC<{ label: string; onClick: () => void; danger?: boolean }> = ({ label, onClick, danger }) => (
  <button
    onClick={onClick}
    style={{
      display: 'block', width: '100%', textAlign: 'left',
      padding: '8px 14px', background: 'transparent', border: 'none',
      color: danger ? 'var(--accent-warn, #f38ba8)' : 'var(--text-primary, #cdd6f4)',
      fontSize: '13px', cursor: 'pointer',
      transition: 'background 0.1s',
    }}
    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(137,180,250,0.08)')}
    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
  >
    {label}
  </button>
);

export default EditorView;
