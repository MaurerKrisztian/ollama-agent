import React from 'react';
import { X, ShieldAlert, Terminal, Edit3, Wrench, Check, RefreshCw, Cpu, RotateCcw, Info } from 'lucide-react';
import { ToolSettings, ToolComplexityProfile } from '../types';
import { JsonEditor } from './JsonEditor';

export const TOOL_DESCRIPTIONS: Record<string, { description: string; parameters?: Record<string, any> }> = {
  list_directory: {
    description: 'List files and subdirectories in a target directory within the workspace.',
    parameters: { relative_path: 'string (e.g. "." or "src")' },
  },
  read_file: {
    description: 'Read the raw contents of a text file within the working directory.',
    parameters: { relative_path: 'string' },
  },
  edit_file: {
    description: 'Partially edit a text or code file by literal text replacement. target_text must be exact text present in file.',
    parameters: { relative_path: 'string', target_text: 'string', replacement_text: 'string' },
  },
  replace_file: {
    description: 'Replace the complete contents of an existing text file. Read the file first.',
    parameters: { relative_path: 'string', content: 'string' },
  },
  create_file: {
    description: 'Create a new text or code file in the working directory.',
    parameters: { relative_path: 'string', content: 'string' },
  },
  grep_search: {
    description: 'Advanced workspace codebase search with regex, case-sensitivity, whole-word boundaries, file extension filtering, surrounding context lines, match highlighting (>>>match<<<), and result pagination limits.',
    parameters: {
      query: 'string (literal text or regex pattern)',
      relative_path: 'string (optional subdirectory)',
      is_regex: 'boolean (optional, default false)',
      case_sensitive: 'boolean (optional, default false)',
      whole_word: 'boolean (optional, default false)',
      file_pattern: 'string (optional, e.g. "*.ts", "*.feature")',
      context_lines: 'number (0-5, lines above/below match)',
      max_results: 'number (1-200, default 50)',
      highlight_match: 'boolean (default true)',
    },
  },
  grep_replace: {
    description: 'Batch search and replace text or regex patterns across multiple workspace files (Grep + Sed combo). Supports dry_run previews.',
    parameters: {
      query: 'string (search text or regex)',
      replacement: 'string (substitution text)',
      relative_path: 'string (optional subdirectory)',
      is_regex: 'boolean (optional, default false)',
      case_sensitive: 'boolean (optional, default false)',
      whole_word: 'boolean (optional, default false)',
      file_pattern: 'string (optional, e.g. "*.ts")',
      dry_run: 'boolean (default false)',
    },
  },
  execute_command: {
    description: 'Execute a single-shot synchronous bash shell command.',
    parameters: { command: 'string' },
  },
  web_search: {
    description: 'Search the public web. Returns result titles, URLs, and snippets.',
    parameters: { query: 'string' },
  },
  read_web_page: {
    description: 'Read one public HTTP/HTTPS page and return main content as Markdown.',
    parameters: { url: 'string' },
  },
  get_document_symbols: {
    description: 'Developer Tool: Get structural AST outline (classes, functions, interfaces, methods, variables) of a TypeScript/JavaScript file with line numbers.',
    parameters: { relative_path: 'string' },
  },
  go_to_definition: {
    description: 'Developer Tool: Jump to where a symbol is declared from its usage location (line & character position).',
    parameters: { relative_path: 'string', line: 'number', character: 'number' },
  },
  find_symbol_references: {
    description: 'Developer Tool: Find all occurrences and usage locations of a symbol across the project workspace.',
    parameters: { relative_path: 'string', line: 'number', character: 'number' },
  },
  get_code_diagnostics: {
    description: 'Developer Tool: Fetch compiler errors, warnings, and type diagnostics for a file or entire workspace.',
    parameters: { relative_path: 'string (optional)' },
  },
  get_type_hover: {
    description: 'Developer Tool: Get type hover information, function signature, and docstrings at a specific file & position.',
    parameters: { relative_path: 'string', line: 'number', character: 'number' },
  },
};

export function getDynamicToolInfo(toolName: string, profile: ToolComplexityProfile = 'simple') {
  if (toolName === 'grep_search') {
    if (profile === 'simple') {
      return {
        description: 'Search for a text string query across files in the working directory.',
        parameters: {
          query: 'string (The text string to search for.)',
          relative_path: 'string (Subdirectory path to restrict search, optional)',
        },
      };
    }
    if (profile === 'medium') {
      return {
        description: 'Search for text or regex patterns across workspace files with case-sensitivity and file extension filtering.',
        parameters: {
          query: 'string (The literal text string or regular expression pattern to search for.)',
          relative_path: 'string (Subdirectory path to restrict search, optional)',
          is_regex: 'boolean (Evaluate query as regular expression, default false)',
          case_sensitive: 'boolean (Case-sensitive matching, default false)',
          file_pattern: 'string (File extension filter, e.g. "*.ts", "*.json")',
        },
      };
    }
    return {
      description: 'Search workspace codebase with advanced regex, case sensitivity, whole-word boundaries, file extension filtering, surrounding context lines, match highlighting (>>>match<<<), and result pagination.',
      parameters: {
        query: 'string (literal text or regex pattern)',
        relative_path: 'string (optional subdirectory)',
        is_regex: 'boolean (default false)',
        case_sensitive: 'boolean (default false)',
        whole_word: 'boolean (default false)',
        file_pattern: 'string (e.g. "*.ts", "*.feature")',
        context_lines: 'number (0-5, lines above/below match)',
        max_results: 'number (1-200, default 50)',
        highlight_match: 'boolean (default true)',
      },
    };
  }

  if (toolName === 'grep_replace') {
    if (profile === 'simple') {
      return {
        description: 'Batch search and replace text across files in the working directory.',
        parameters: {
          query: 'string (Text string to search for)',
          replacement: 'string (Replacement text to substitute)',
          relative_path: 'string (Subdirectory path filter, optional)',
        },
      };
    }
    if (profile === 'medium') {
      return {
        description: 'Batch search and replace text or regex patterns with case sensitivity and file pattern filters.',
        parameters: {
          query: 'string (Text or regex pattern)',
          replacement: 'string (Replacement text)',
          relative_path: 'string (Subdirectory path filter, optional)',
          is_regex: 'boolean (default false)',
          case_sensitive: 'boolean (default false)',
          file_pattern: 'string (e.g. "*.ts")',
        },
      };
    }
    return {
      description: 'Batch search and replace text or regex patterns across workspace files with whole-word boundaries and dry_run previews.',
      parameters: {
        query: 'string (search text or regex)',
        replacement: 'string (substitution text)',
        relative_path: 'string (optional subdirectory)',
        is_regex: 'boolean (default false)',
        case_sensitive: 'boolean (default false)',
        whole_word: 'boolean (default false)',
        file_pattern: 'string (optional, e.g. "*.ts")',
        dry_run: 'boolean (default false)',
      },
    };
  }

  return TOOL_DESCRIPTIONS[toolName] || {
    description: 'Workspace execution tool.',
    parameters: {},
  };
}

export function renderColorCodedJson(obj: any): React.ReactNode {
  if (!obj || typeof obj !== 'object') return String(obj);
  const jsonStr = JSON.stringify(obj, null, 2);
  const lines = jsonStr.split('\n');

  return lines.map((line, lineIdx) => {
    const keyMatch = line.match(/^(\s*)("([^"]+)")(\s*:\s*)(.*)$/);
    if (keyMatch) {
      const [, indent, keyWithQuotes, keyName, colon, rawVal] = keyMatch;
      let valNode: React.ReactNode = rawVal;

      if (/^".*"$/.test(rawVal) || /^".*",$/.test(rawVal)) {
        const hasComma = rawVal.endsWith(',');
        const valText = hasComma ? rawVal.slice(0, -1) : rawVal;
        valNode = (
          <>
            <span style={{ color: '#86efac' }}>{valText}</span>
            {hasComma && <span style={{ color: 'rgba(255,255,255,0.4)' }}>,</span>}
          </>
        );
      } else if (/^(true|false),?$/.test(rawVal)) {
        const hasComma = rawVal.endsWith(',');
        const valText = hasComma ? rawVal.slice(0, -1) : rawVal;
        valNode = (
          <>
            <span style={{ color: '#fcd34d', fontWeight: 600 }}>{valText}</span>
            {hasComma && <span style={{ color: 'rgba(255,255,255,0.4)' }}>,</span>}
          </>
        );
      } else if (/^-?\d+(\.\d+)?,?$/.test(rawVal)) {
        const hasComma = rawVal.endsWith(',');
        const valText = hasComma ? rawVal.slice(0, -1) : rawVal;
        valNode = (
          <>
            <span style={{ color: '#f472b6' }}>{valText}</span>
            {hasComma && <span style={{ color: 'rgba(255,255,255,0.4)' }}>,</span>}
          </>
        );
      } else if (/^(null),?$/.test(rawVal)) {
        const hasComma = rawVal.endsWith(',');
        const valText = hasComma ? rawVal.slice(0, -1) : rawVal;
        valNode = (
          <>
            <span style={{ color: '#f87171', fontWeight: 600 }}>{valText}</span>
            {hasComma && <span style={{ color: 'rgba(255,255,255,0.4)' }}>,</span>}
          </>
        );
      }

      return (
        <React.Fragment key={lineIdx}>
          {indent}
          <span style={{ color: '#a5b4fc', fontWeight: 600 }}>"{keyName}"</span>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>: </span>
          {valNode}
          {'\n'}
        </React.Fragment>
      );
    }

    return (
      <React.Fragment key={lineIdx}>
        <span style={{ color: 'rgba(255,255,255,0.6)' }}>{line}</span>
        {'\n'}
      </React.Fragment>
    );
  });
}

interface ToolSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ToolSettings;
  onUpdateSettings: (newSettings: ToolSettings) => void;
}

export const ToolSettingsModal: React.FC<ToolSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  const [newCmdInput, setNewCmdInput] = React.useState('');
  const [infoTool, setInfoTool] = React.useState<string | null>(null);

  if (!isOpen) return null;

  const handleToggleTool = (toolName: keyof ToolSettings['enabledTools']) => {
    onUpdateSettings({
      ...settings,
      enabledTools: {
        ...settings.enabledTools,
        [toolName]: !settings.enabledTools[toolName],
      },
    });
  };

  const handleTerminalModeChange = (mode: 'confirm' | 'auto') => {
    onUpdateSettings({ ...settings, terminalMode: mode });
  };

  const handleFileEditModeChange = (mode: 'confirm' | 'auto') => {
    onUpdateSettings({ ...settings, fileEditMode: mode });
  };

  const handleAddAllowedCommand = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCmdInput.trim();
    if (!trimmed) return;
    const current = settings.allowedCommands || ['ls', 'pwd'];
    if (!current.includes(trimmed)) {
      onUpdateSettings({
        ...settings,
        allowedCommands: [...current, trimmed],
      });
    }
    setNewCmdInput('');
  };

  const handleRemoveAllowedCommand = (cmdToRemove: string) => {
    const current = settings.allowedCommands || ['ls', 'pwd'];
    onUpdateSettings({
      ...settings,
      allowedCommands: current.filter((c) => c !== cmdToRemove),
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        className="glass-panel animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '560px',
          borderRadius: '16px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
          border: '1px solid var(--border-color)',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '18px 24px',
            background: 'rgba(30, 41, 59, 0.8)',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Wrench size={20} color="var(--accent-primary)" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
              Tool Approval & Safety Settings
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '75vh', overflowY: 'auto' }}>
          {/* Section 0: Tool Complexity Profile Selector */}
          <div style={{ background: 'rgba(15, 23, 42, 0.7)', padding: '16px', borderRadius: '12px', border: '1px solid var(--accent-primary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Cpu size={18} color="var(--accent-primary)" />
                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  🎯 Model Tool Complexity Profile
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background:
                    (settings.complexityProfile || 'simple') === 'simple'
                      ? 'rgba(34, 197, 94, 0.2)'
                      : (settings.complexityProfile || 'simple') === 'medium'
                      ? 'rgba(245, 158, 11, 0.2)'
                      : 'rgba(168, 85, 247, 0.2)',
                  color:
                    (settings.complexityProfile || 'simple') === 'simple'
                      ? '#86efac'
                      : (settings.complexityProfile || 'simple') === 'medium'
                      ? '#fcd34d'
                      : '#c084fc',
                  border: '1px solid currentColor',
                }}
              >
                {(settings.complexityProfile || 'simple').toUpperCase()} PROFILE
              </span>
            </div>

            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.45, marginBottom: '12px' }}>
              Select the tool schema complexity sent to the model context. Match your active Ollama model size to ensure reliable tool calls. Only one schema profile is active at a time.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {[
                {
                  id: 'simple',
                  label: '🟢 Simple',
                  desc: 'Small Models (3B–8B)\nShort 2-param schema',
                  color: '#22c55e',
                },
                {
                  id: 'medium',
                  label: '🟡 Medium',
                  desc: 'Mid Models (14B–32B)\nRegex + file filter',
                  color: '#f59e0b',
                },
                {
                  id: 'advanced',
                  label: '🟣 Advanced',
                  desc: 'Large / Cloud Models\nFull schema + context',
                  color: '#a855f7',
                },
              ].map((prof) => {
                const isSelected = (settings.complexityProfile || 'simple') === prof.id;
                return (
                  <button
                    key={prof.id}
                    type="button"
                    onClick={() =>
                      onUpdateSettings({
                        ...settings,
                        complexityProfile: prof.id as 'simple' | 'medium' | 'advanced',
                      })
                    }
                    style={{
                      padding: '10px 8px',
                      borderRadius: '8px',
                      border: `1px solid ${isSelected ? prof.color : 'var(--border-color)'}`,
                      background: isSelected ? `${prof.color}20` : 'rgba(30, 41, 59, 0.4)',
                      color: isSelected ? '#fff' : 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      textAlign: 'center',
                    }}
                  >
                    <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{prof.label}</span>
                    <span style={{ fontSize: '0.7rem', color: isSelected ? 'rgba(255,255,255,0.85)' : 'var(--text-dim)', whiteSpace: 'pre-line', lineHeight: 1.25 }}>
                      {prof.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 1: Terminal Execution Preferences */}
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Terminal size={18} color="var(--accent-amber)" />
              <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>
                Terminal Command Execution (`execute_command`)
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '12px' }}>
              Choose whether the agent must ask for your confirmation before running shell commands.
            </p>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => handleTerminalModeChange('confirm')}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: `1px solid ${settings.terminalMode === 'confirm' ? 'var(--accent-amber)' : 'var(--border-color)'}`,
                  background: settings.terminalMode === 'confirm' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(30, 41, 59, 0.4)',
                  color: settings.terminalMode === 'confirm' ? 'var(--accent-amber)' : 'var(--text-muted)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <ShieldAlert size={16} />
                <span>Require Confirmation (Default)</span>
              </button>

              <button
                onClick={() => handleTerminalModeChange('auto')}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: `1px solid ${settings.terminalMode === 'auto' ? 'var(--accent-teal)' : 'var(--border-color)'}`,
                  background: settings.terminalMode === 'auto' ? 'rgba(20, 184, 166, 0.15)' : 'rgba(30, 41, 59, 0.4)',
                  color: settings.terminalMode === 'auto' ? 'var(--accent-teal)' : 'var(--text-muted)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <span>⚡ Auto-Approve</span>
              </button>
            </div>

            {/* Whitelisted Commands Sub-Section */}
            <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                Command Execution Whitelist (Auto-Bypass in Confirmation Mode)
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: '10px' }}>
                Whitelisted commands (and multi-part executions where all sub-commands are whitelisted) will run automatically without asking for confirmation.
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                {(settings.allowedCommands || ['ls', 'pwd']).map((cmd) => (
                  <span
                    key={cmd}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: 'rgba(245, 158, 11, 0.2)',
                      border: '1px solid rgba(245, 158, 11, 0.4)',
                      color: '#fbbf24',
                      fontSize: '0.8rem',
                      fontFamily: 'monospace',
                      fontWeight: 600,
                    }}
                  >
                    {cmd}
                    <button
                      type="button"
                      onClick={() => handleRemoveAllowedCommand(cmd)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'rgba(255, 255, 255, 0.6)',
                        cursor: 'pointer',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      title="Remove command"
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>

              <form onSubmit={handleAddAllowedCommand} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={newCmdInput}
                  onChange={(e) => setNewCmdInput(e.target.value)}
                  placeholder="e.g. tail"
                  style={{
                    flex: 1,
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    background: 'rgba(15, 23, 42, 0.8)',
                    color: 'var(--text-main)',
                    fontSize: '0.8rem',
                    fontFamily: 'monospace',
                  }}
                />
                <button
                  type="submit"
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'var(--accent-amber)',
                    color: '#000',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                  }}
                >
                  Add Command
                </button>
              </form>
            </div>
          </div>

          {/* Section 2: File Modification Preferences */}
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Edit3 size={18} color="var(--accent-primary)" />
              <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>
                File Edit Mode (`edit_file` / `replace_file`)
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '12px' }}>
              Configure approval requirements for editing existing workspace files.
            </p>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => handleFileEditModeChange('auto')}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: `1px solid ${settings.fileEditMode === 'auto' ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                  background: settings.fileEditMode === 'auto' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(30, 41, 59, 0.4)',
                  color: settings.fileEditMode === 'auto' ? '#fff' : 'var(--text-muted)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <span>⚡ Auto-Approve</span>
              </button>

              <button
                onClick={() => handleFileEditModeChange('confirm')}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: `1px solid ${settings.fileEditMode === 'confirm' ? 'var(--accent-amber)' : 'var(--border-color)'}`,
                  background: settings.fileEditMode === 'confirm' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(30, 41, 59, 0.4)',
                  color: settings.fileEditMode === 'confirm' ? 'var(--accent-amber)' : 'var(--text-muted)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <ShieldAlert size={16} />
                <span>Require Confirmation (Default)</span>
              </button>
            </div>
          </div>

          {/* Section 3: Max Tool Call Iterations */}
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RotateCcw size={18} color="var(--accent-primary)" />
                <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  Max Tool Call Iterations (`maxLoops`)
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  fontFamily: 'var(--font-code)',
                  color: settings.maxLoops === 0 ? '#86efac' : 'var(--accent-primary)',
                  background: settings.maxLoops === 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  border: `1px solid ${settings.maxLoops === 0 ? 'rgba(34, 197, 94, 0.3)' : 'rgba(99, 102, 241, 0.3)'}`,
                }}
              >
                {settings.maxLoops === 0 ? 'Disabled (Unlimited)' : `${settings.maxLoops ?? 10} iterations`}
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '12px' }}>
              Limits the maximum number of sequential tool calls the agent can perform in a single user turn. Disable the limit to allow as many tool calls as the model wants.
            </p>
            <input
              type="range"
              min="0"
              max="30"
              step="1"
              value={settings.maxLoops ?? 10}
              onChange={(e) => onUpdateSettings({ ...settings, maxLoops: Number(e.target.value) })}
              style={{
                width: '100%',
                accentColor: 'var(--accent-primary)',
                cursor: 'pointer',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.825rem', color: 'var(--text-main)', fontWeight: 500 }}>
                <input
                  type="checkbox"
                  checked={settings.maxLoops === 0}
                  onChange={(e) => {
                    onUpdateSettings({ ...settings, maxLoops: e.target.checked ? 0 : 10 });
                  }}
                  style={{ accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                />
                <span>Disable limit (Unlimited tool calls)</span>
              </label>
            </div>
          </div>

          {/* Section 4: Categorized Toolset Controls */}
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', display: 'block' }}>
                🧰 Active Toolset Controls & Categories
              </span>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                Toggle entire tool categories at once using group master buttons, or configure individual tools one by one.
              </p>
            </div>

            {/* Helper renderer for tool groups */}
            {[
              {
                title: '🛠️ Developer Tools (AST & LSP Integration)',
                description: 'Language-aware symbol navigation, definition jumps, reference finding, type hover, and diagnostics for TS/JS.',
                color: 'var(--accent-teal)',
                tools: [
                  'get_document_symbols',
                  'go_to_definition',
                  'find_symbol_references',
                  'get_code_diagnostics',
                  'get_type_hover',
                ] as Array<keyof ToolSettings['enabledTools']>,
              },
              {
                title: '📁 File System Tools',
                description: 'Workspace file inspection, creation, text editing, complete rewrites, directory listing, and grep searching.',
                color: 'var(--accent-primary)',
                tools: [
                  'list_directory',
                  'read_file',
                  'edit_file',
                  'replace_file',
                  'create_file',
                  'grep_search',
                  'grep_replace',
                ] as Array<keyof ToolSettings['enabledTools']>,
              },
              {
                title: '🌐 Web Research Tools',
                description: 'Public web search engine queries and automated HTML page to Markdown extraction.',
                color: '#38bdf8',
                tools: [
                  'web_search',
                  'read_web_page',
                ] as Array<keyof ToolSettings['enabledTools']>,
              },
              {
                title: '🐚 Terminal & Shell Execution Tools',
                description: 'Execute shell commands and start interactive background terminal sessions.',
                color: 'var(--accent-amber)',
                tools: [
                  'execute_command',
                ] as Array<keyof ToolSettings['enabledTools']>,
              },
            ].map((group) => {
              const allEnabled = group.tools.every((t) => settings.enabledTools[t] !== false);
              return (
                <div
                  key={group.title}
                  style={{
                    padding: '12px',
                    borderRadius: '10px',
                    background: 'rgba(30, 41, 59, 0.4)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      {group.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = { ...settings.enabledTools };
                        group.tools.forEach((t) => {
                          updated[t] = !allEnabled;
                        });
                        onUpdateSettings({ ...settings, enabledTools: updated });
                      }}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: `1px solid ${group.color}`,
                        background: 'rgba(15, 23, 42, 0.6)',
                        color: group.color,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {allEnabled ? 'Disable Group' : 'Enable Group'}
                    </button>
                  </div>
                  <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.35 }}>
                    {group.description}
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                    {group.tools.map((toolKey) => {
                      const isChecked = settings.enabledTools[toolKey] !== false;
                      return (
                        <label
                          key={toolKey}
                          onClick={() => handleToggleTool(toolKey)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            background: isChecked ? 'rgba(15, 23, 42, 0.8)' : 'rgba(15, 23, 42, 0.3)',
                            border: `1px solid ${isChecked ? group.color : 'var(--border-color)'}`,
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            color: isChecked ? 'var(--text-main)' : 'var(--text-dim)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                            <div
                              style={{
                                width: '15px',
                                height: '15px',
                                flexShrink: 0,
                                borderRadius: '4px',
                                border: `1px solid ${isChecked ? group.color : 'var(--text-dim)'}`,
                                background: isChecked ? group.color : 'transparent',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {isChecked && <Check size={11} color="#000" />}
                            </div>
                            <span style={{ fontFamily: 'var(--font-code)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                              {toolKey}
                            </span>
                            {(toolKey === 'grep_search' || toolKey === 'grep_replace') && (
                              <span
                                style={{
                                  fontSize: '0.65rem',
                                  padding: '1px 4px',
                                  borderRadius: '4px',
                                  background: 'rgba(255,255,255,0.1)',
                                  color: 'var(--accent-teal)',
                                  fontFamily: 'sans-serif',
                                  fontWeight: 600,
                                  flexShrink: 0,
                                }}
                              >
                                {Object.keys(getDynamicToolInfo(toolKey, settings.complexityProfile || 'simple').parameters || {}).length} params
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setInfoTool(toolKey);
                            }}
                            title={`Inspect description for ${toolKey}`}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--accent-teal)',
                              cursor: 'pointer',
                              padding: '2px',
                              display: 'flex',
                              alignItems: 'center',
                              borderRadius: '4px',
                              opacity: 0.85,
                            }}
                          >
                            <Info size={14} color="var(--accent-teal)" />
                          </button>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Section 4: MCP (Model Context Protocol) Servers */}
          <McpServersSection />
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '16px 24px',
            background: 'rgba(30, 41, 59, 0.8)',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: 'var(--accent-gradient)',
              border: 'none',
              color: '#fff',
              padding: '8px 20px',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>

      {/* Tool Info Inspector Modal Popup */}
      {infoTool && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.82)',
            backdropFilter: 'blur(6px)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setInfoTool(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '500px',
              background: '#1e293b',
              border: '1px solid var(--accent-teal)',
              borderRadius: '14px',
              padding: '20px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.7)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Info size={20} color="var(--accent-teal)" />
                <span style={{ fontSize: '1.05rem', fontWeight: 700, fontFamily: 'var(--font-code)', color: 'var(--accent-teal)' }}>
                  {infoTool}
                </span>
              </div>
              <button
                onClick={() => setInfoTool(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}
              >
                <X size={18} />
              </button>
            </div>

            {infoTool && (() => {
              const dynInfo = getDynamicToolInfo(infoTool, settings.complexityProfile || 'simple');
              const activeProfile = settings.complexityProfile || 'simple';
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Description Prompt Seen by LLM Agent:
                    </span>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background:
                          activeProfile === 'simple'
                            ? 'rgba(34, 197, 94, 0.2)'
                            : activeProfile === 'medium'
                            ? 'rgba(245, 158, 11, 0.2)'
                            : 'rgba(168, 85, 247, 0.2)',
                        color:
                          activeProfile === 'simple'
                            ? '#86efac'
                            : activeProfile === 'medium'
                            ? '#fcd34d'
                            : '#c084fc',
                        border: '1px solid currentColor',
                      }}
                    >
                      {activeProfile.toUpperCase()} SCHEMA
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: '0.85rem',
                      color: 'var(--text-main)',
                      marginTop: '6px',
                      lineHeight: 1.45,
                      background: 'rgba(15, 23, 42, 0.7)',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    {dynInfo.description}
                  </p>

                  {dynInfo.parameters && (
                    <div style={{ marginTop: '12px' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Expected Parameter Schema ({Object.keys(dynInfo.parameters).length} parameters):
                      </span>
                      <pre
                        style={{
                          fontSize: '0.8rem',
                          fontFamily: 'var(--font-code)',
                          background: 'rgba(15, 23, 42, 0.8)',
                          padding: '12px',
                          borderRadius: '8px',
                          marginTop: '6px',
                          overflowX: 'auto',
                          border: '1px solid var(--border-color)',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {renderColorCodedJson(dynInfo.parameters)}
                      </pre>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

const McpServersSection: React.FC = () => {
  const [mcpEnabled, setMcpEnabled] = React.useState<boolean>(true);
  const [servers, setServers] = React.useState<Array<{ name: string; status: string; error?: string; toolsCount: number; disabled?: boolean }>>([]);
  const [allToolDetails, setAllToolDetails] = React.useState<Array<{ name: string; serverName: string; description: string; parameters: any; enabled: boolean }>>([]);
  const [configPath, setConfigPath] = React.useState<string | null>(null);
  const [rawConfig, setRawConfig] = React.useState<string>('{\n  "mcpServers": {}\n}');
  const [isEditingConfig, setIsEditingConfig] = React.useState<boolean>(false);
  const [isJsonValid, setIsJsonValid] = React.useState<boolean>(true);
  const [expandedTool, setExpandedTool] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [saveStatus, setSaveStatus] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchMcpStatus = async () => {
    try {
      const res = await fetch('/api/mcp/servers');
      const data = await res.json();
      if (data.success) {
        if (data.mcpEnabled !== undefined) setMcpEnabled(data.mcpEnabled);
        setServers(data.servers || []);
        setConfigPath(data.configPath || null);
        if (data.rawConfig) setRawConfig(data.rawConfig);
        setAllToolDetails(data.allToolDetails || []);
      }
    } catch (_) {}
  };

  const handleReload = async () => {
    setLoading(true);
    setSaveStatus(null);
    try {
      const res = await fetch('/api/mcp/reload', { method: 'POST' });
      const data = await res.json();
      if (data.servers) {
        setServers(data.servers);
        setConfigPath(data.configPath);
        if (data.rawConfig) setRawConfig(data.rawConfig);
        setAllToolDetails(data.allToolDetails || []);
      }
    } catch (_) {}
    setLoading(false);
  };

  const handleSaveConfig = async () => {
    setLoading(true);
    setSaveStatus(null);
    try {
      const res = await fetch('/api/mcp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawConfig }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus({ type: 'success', message: 'MCP configuration saved & reloaded!' });
        setServers(data.servers || []);
        setConfigPath(data.configPath || null);
        setAllToolDetails(data.allToolDetails || []);
      } else {
        setSaveStatus({ type: 'error', message: data.error || 'Failed to save configuration.' });
      }
    } catch (err: any) {
      setSaveStatus({ type: 'error', message: err.message });
    }
    setLoading(false);
  };

  const handleToggleMcpTool = async (toolName: string, currentEnabled: boolean) => {
    try {
      const res = await fetch('/api/mcp/toggle-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: toolName, enabled: !currentEnabled }),
      });
      const data = await res.json();
      if (data.success) {
        setAllToolDetails(data.allToolDetails || []);
        setServers(data.servers || []);
      }
    } catch (_) {}
  };

  const handleToggleServer = async (serverName: string, currentDisabled: boolean) => {
    try {
      const res = await fetch('/api/mcp/toggle-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: serverName, enabled: currentDisabled }),
      });
      const data = await res.json();
      if (data.success) {
        setServers(data.servers || []);
        if (data.rawConfig) setRawConfig(data.rawConfig);
        setAllToolDetails(data.allToolDetails || []);
      }
    } catch (_) {}
  };

  const handleToggleGlobal = async () => {
    const nextState = !mcpEnabled;
    setMcpEnabled(nextState);
    try {
      const res = await fetch('/api/mcp/toggle-global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.mcpEnabled !== undefined) setMcpEnabled(data.mcpEnabled);
        setAllToolDetails(data.allToolDetails || []);
        setServers(data.servers || []);
      }
    } catch (_) {}
  };

  React.useEffect(() => {
    fetchMcpStatus();
  }, []);

  return (
    <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
      {/* Header & Master Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Cpu size={18} color={mcpEnabled ? 'var(--accent-primary)' : 'var(--text-dim)'} />
          <div>
            <span style={{ fontSize: '0.95rem', fontWeight: 600, color: mcpEnabled ? 'var(--text-main)' : 'var(--text-dim)', display: 'block' }}>
              MCP (Model Context Protocol)
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Master Enable/Disable Toggle */}
          <button
            type="button"
            onClick={handleToggleGlobal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '20px',
              background: mcpEnabled ? 'rgba(34, 197, 94, 0.2)' : 'rgba(100, 116, 139, 0.2)',
              border: `1px solid ${mcpEnabled ? 'rgba(34, 197, 94, 0.4)' : 'var(--border-color)'}`,
              color: mcpEnabled ? '#4ade80' : 'var(--text-dim)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: mcpEnabled ? '#4ade80' : 'var(--text-dim)',
              }}
            />
            <span>{mcpEnabled ? 'MCP Enabled' : 'MCP Disabled'}</span>
          </button>

          <button
            onClick={() => setIsEditingConfig(!isEditingConfig)}
            style={{
              background: isEditingConfig ? 'rgba(99, 102, 241, 0.2)' : 'rgba(30, 41, 59, 0.8)',
              border: `1px solid ${isEditingConfig ? 'var(--accent-primary)' : 'var(--border-color)'}`,
              color: 'var(--text-main)',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            {isEditingConfig ? 'Hide Config' : 'Edit JSON Config'}
          </button>
          <button
            onClick={handleReload}
            disabled={loading}
            style={{
              background: 'rgba(30, 41, 59, 0.8)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-main)',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            <RefreshCw size={12} className={loading ? 'spin' : ''} />
            <span>Reload</span>
          </button>
        </div>
      </div>

      {!mcpEnabled && (
        <div
          style={{
            marginBottom: '10px',
            padding: '8px 12px',
            borderRadius: '6px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#f87171',
            fontSize: '0.775rem',
          }}
        >
          Model Context Protocol (MCP) is currently <strong>disabled</strong>. The agent will not invoke any external MCP tools until toggled back ON.
        </div>
      )}

      {configPath ? (
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 10px 0' }}>
          Config loaded: <code style={{ fontFamily: 'var(--font-code)', color: 'var(--accent-primary)' }}>{configPath}</code>
        </p>
      ) : (
        <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: '0 0 10px 0' }}>
          No active <code style={{ fontFamily: 'var(--font-code)' }}>mcp_config.json</code> or <code style={{ fontFamily: 'var(--font-code)' }}>.mcp.json</code> found.
        </p>
      )}

      {/* JSON Config Editor Panel */}
      {isEditingConfig && (
        <div style={{ marginBottom: '14px', padding: '12px', background: 'rgba(15, 23, 42, 0.8)', borderRadius: '8px', border: '1px solid var(--accent-primary)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>
            MCP Config JSON Editor (`mcp_config.json`)
          </div>
          
          <JsonEditor
            value={rawConfig}
            onChange={(val) => setRawConfig(val)}
            onValidationChange={(isValid) => setIsJsonValid(isValid)}
            rows={9}
          />

          {saveStatus && (
            <div
              style={{
                fontSize: '0.75rem',
                marginTop: '8px',
                color: saveStatus.type === 'success' ? '#4ade80' : '#f87171',
              }}
            >
              {saveStatus.message}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
            <button
              onClick={handleSaveConfig}
              disabled={loading || !isJsonValid}
              style={{
                background: isJsonValid ? 'var(--accent-gradient)' : 'rgba(100, 116, 139, 0.4)',
                border: 'none',
                color: isJsonValid ? '#fff' : 'var(--text-dim)',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: loading || !isJsonValid ? 'not-allowed' : 'pointer',
              }}
            >
              Save Configuration
            </button>
          </div>
        </div>
      )}

      {/* Active Servers Summary */}
      {servers.length === 0 ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
          No MCP servers currently loaded. Click <strong>Edit JSON Config</strong> above to add servers.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
          {servers.map((s) => {
            const isDisabled = s.status === 'disabled' || Boolean(s.disabled);
            return (
              <div
                key={s.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: isDisabled ? 'rgba(30, 41, 59, 0.25)' : 'rgba(30, 41, 59, 0.5)',
                  border: `1px solid ${isDisabled ? 'rgba(239, 68, 68, 0.2)' : 'var(--border-color)'}`,
                  opacity: isDisabled ? 0.75 : 1,
                  transition: 'all 0.2s ease',
                }}
              >
                <div>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: isDisabled ? 'var(--text-muted)' : 'var(--text-main)' }}>
                    {s.name}
                  </span>
                  {s.error && !isDisabled && (
                    <div style={{ fontSize: '0.725rem', color: '#f87171', marginTop: '2px' }}>{s.error}</div>
                  )}
                  {isDisabled && (
                    <div style={{ fontSize: '0.725rem', color: 'var(--text-dim)', marginTop: '2px' }}>Server is disabled</div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.toolsCount} tools</span>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontWeight: 600,
                      background: s.status === 'connected' ? 'rgba(34, 197, 94, 0.15)' : isDisabled ? 'rgba(100, 116, 139, 0.2)' : 'rgba(239, 68, 68, 0.15)',
                      color: s.status === 'connected' ? '#4ade80' : isDisabled ? 'var(--text-dim)' : '#f87171',
                      border: `1px solid ${s.status === 'connected' ? 'rgba(34, 197, 94, 0.3)' : isDisabled ? 'var(--border-color)' : 'rgba(239, 68, 68, 0.3)'}`,
                    }}
                  >
                    {s.status}
                  </span>

                  {/* Enable / Disable Server Toggle Switch */}
                  <button
                    onClick={() => handleToggleServer(s.name, isDisabled)}
                    title={isDisabled ? `Enable ${s.name} server` : `Disable ${s.name} server`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      border: `1px solid ${isDisabled ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                      background: isDisabled ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: isDisabled ? '#4ade80' : '#ef4444',
                      fontSize: '0.725rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isDisabled ? 'Enable' : 'Disable'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Discovered MCP Tools Grouped by MCP Server */}
      {allToolDetails.length > 0 && (
        <div style={{ marginTop: '14px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', display: 'block', marginBottom: '10px' }}>
            Discovered MCP Tools ({allToolDetails.length})
          </span>

          {Object.entries(
            allToolDetails.reduce((acc, t) => {
              if (!acc[t.serverName]) acc[t.serverName] = [];
              acc[t.serverName].push(t);
              return acc;
            }, {} as Record<string, typeof allToolDetails>)
          ).map(([serverName, serverTools]) => (
            <div
              key={serverName}
              style={{
                marginBottom: '12px',
                background: 'rgba(15, 23, 42, 0.4)',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                padding: '10px 12px',
              }}
            >
              {/* Group Server Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                  paddingBottom: '6px',
                  borderBottom: '1px dashed var(--border-color)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Cpu size={14} color="var(--accent-primary)" />
                  <span style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--text-main)' }}>
                    Server: <code style={{ fontFamily: 'var(--font-code)', color: 'var(--accent-primary)' }}>{serverName}</code>
                  </span>
                </div>
                <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                  {serverTools.length} tool{serverTools.length === 1 ? '' : 's'}
                </span>
              </div>

              {/* Group Tools List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {serverTools.map((t) => {
                  const isExpanded = expandedTool === t.name;
                  return (
                    <div
                      key={t.name}
                      style={{
                        borderRadius: '6px',
                        background: t.enabled ? 'rgba(30, 41, 59, 0.6)' : 'rgba(15, 23, 42, 0.3)',
                        border: `1px solid ${t.enabled ? 'rgba(99, 102, 241, 0.3)' : 'var(--border-color)'}`,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                        }}
                      >
                        <label
                          onClick={() => handleToggleMcpTool(t.name, t.enabled)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            cursor: 'pointer',
                            flex: 1,
                          }}
                        >
                          <div
                            style={{
                              width: '14px',
                              height: '14px',
                              borderRadius: '3px',
                              border: `1px solid ${t.enabled ? 'var(--accent-primary)' : 'var(--text-dim)'}`,
                              background: t.enabled ? 'var(--accent-primary)' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {t.enabled && <Check size={10} color="#fff" />}
                          </div>
                          <span style={{ fontFamily: 'var(--font-code)', fontSize: '0.8rem', color: t.enabled ? 'var(--text-main)' : 'var(--text-dim)' }}>
                            {t.name}
                          </span>
                        </label>
                        <button
                          onClick={() => setExpandedTool(isExpanded ? null : t.name)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent-primary)',
                            fontSize: '0.725rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <span>{isExpanded ? 'Hide Info' : 'Inspect'}</span>
                        </button>
                      </div>

                      {/* Tool Schema & Description Inspector */}
                      {isExpanded && (
                        <div
                          style={{
                            padding: '10px 12px',
                            background: 'rgba(15, 23, 42, 0.9)',
                            borderTop: '1px solid var(--border-color)',
                            fontSize: '0.75rem',
                          }}
                        >
                          <div style={{ color: 'var(--text-main)', marginBottom: '4px', fontWeight: 500 }}>
                            {t.description}
                          </div>
                          <div style={{ color: 'var(--text-muted)', marginBottom: '6px' }}>
                            Server Origin: <code style={{ fontFamily: 'var(--font-code)', color: 'var(--accent-primary)' }}>{t.serverName}</code>
                          </div>
                          <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                            Parameters Schema:
                          </div>
                          <pre
                            style={{
                              fontFamily: 'var(--font-code)',
                              fontSize: '0.7rem',
                              background: 'rgba(0, 0, 0, 0.5)',
                              padding: '8px',
                              borderRadius: '4px',
                              margin: 0,
                              overflowX: 'auto',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                            }}
                          >
                            {renderColorCodedJson(t.parameters)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
