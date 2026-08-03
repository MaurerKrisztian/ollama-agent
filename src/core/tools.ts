import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { ToolDefinition, ToolComplexityProfile } from './types.js';
import { WebClient } from './web.js';
import { DeepResearchRunner } from './deepResearch.js';
import type { DeepResearchNoteGenerator, DeepResearchSemanticClassifier, DeepResearchQueryGenerator } from './deepResearch.js';
import { McpClientManager } from './mcp.js';
import { TerminalSessionManager, stripAnsiCodes } from './terminalManager.js';
import { LspManager } from './lsp.js';
import { applyUnifiedDiff, buildPatchFileDiff } from './tools/fileTools.js';


type DiffLine = {
  type: 'context' | 'add' | 'remove' | 'meta';
  content: string;
  oldLine?: number;
  newLine?: number;
};

type FileDiff = {
  path: string;
  oldPath: string;
  newPath: string;
  lines: DiffLine[];
  truncated?: boolean;
};

const MAX_DIFF_LINES = 400;

function limitDiffLines(lines: DiffLine[]): Pick<FileDiff, 'lines' | 'truncated'> {
  if (lines.length <= MAX_DIFF_LINES) return { lines };

  const half = MAX_DIFF_LINES / 2;
  return {
    lines: [
      ...lines.slice(0, half),
      { type: 'meta', content: `… ${lines.length - MAX_DIFF_LINES} diff lines hidden …` },
      ...lines.slice(-half),
    ],
    truncated: true,
  };
}

function buildCreatedFileDiff(filePath: string, content: string): FileDiff {
  const addedLines = content.split('\n').map((line, index): DiffLine => ({
    type: 'add',
    content: line,
    newLine: index + 1,
  }));
  const limited = limitDiffLines(addedLines);

  return {
    path: filePath,
    oldPath: '/dev/null',
    newPath: filePath,
    ...limited,
  };
}

function buildEditedFileDiff(filePath: string, original: string, match: string, replacement: string): FileDiff {
  const matchStart = original.indexOf(match);
  const matchEnd = matchStart + match.length;
  const lineStart = original.lastIndexOf('\n', Math.max(0, matchStart - 1)) + 1;
  const nextNewline = original.indexOf('\n', matchEnd);
  const lineEnd = nextNewline === -1 ? original.length : nextNewline;

  const beforeLines = original.slice(0, lineStart).split('\n').slice(0, -1);
  const afterLines = original.slice(nextNewline === -1 ? original.length : nextNewline + 1).split('\n');
  const oldChangedLines = original.slice(lineStart, lineEnd).split('\n');
  const newChangedText =
    original.slice(lineStart, matchStart) + replacement + original.slice(matchEnd, lineEnd);
  const newChangedLines = newChangedText.split('\n');
  const contextBefore = beforeLines.slice(-3);
  const contextAfter = afterLines.slice(0, 3);
  const oldStartLine = beforeLines.length + 1;
  const newStartLine = oldStartLine;
  const lines: DiffLine[] = [];

  contextBefore.forEach((line, index) => {
    const lineNumber = oldStartLine - contextBefore.length + index;
    lines.push({ type: 'context', content: line, oldLine: lineNumber, newLine: lineNumber });
  });
  oldChangedLines.forEach((line, index) => {
    lines.push({ type: 'remove', content: line, oldLine: oldStartLine + index });
  });
  newChangedLines.forEach((line, index) => {
    lines.push({ type: 'add', content: line, newLine: newStartLine + index });
  });
  contextAfter.forEach((line, index) => {
    lines.push({
      type: 'context',
      content: line,
      oldLine: oldStartLine + oldChangedLines.length + index,
      newLine: newStartLine + newChangedLines.length + index,
    });
  });

  return {
    path: filePath,
    oldPath: filePath,
    newPath: filePath,
    ...limitDiffLines(lines),
  };
}

function stripCopiedLineNumbers(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const numberedLine = line.match(/^\s*\d+[\s|:]\s?(.*)$/);
      return numberedLine ? numberedLine[1] : line;
    })
    .join('\n');
}

function normalizeModelText(text: string): string {
  let cleaned = text;
  if (typeof cleaned === 'string' && !cleaned.includes('\n') && cleaned.includes('\\n')) {
    cleaned = cleaned.replace(/\\n/g, '\n');
  }
  return stripCopiedLineNumbers(cleaned);
}

function preserveFirstLineIndent(match: string, replacement: string): string {
  const firstMatchLine = match.split('\n')[0] ?? '';
  const indentation = firstMatchLine.match(/^\s*/)?.[0] ?? '';
  if (!indentation || !replacement || /^\s/.test(replacement)) return replacement;
  return indentation + replacement;
}

/** Single source of truth for UI grouping. Consumed by /api/tools/definitions. */
export const TOOL_GROUP_METADATA: Record<string, { group: string; groupColor: string; groupDescription: string }> = {
  list_directory:          { group: '📁 File System',       groupColor: 'var(--accent-primary)', groupDescription: 'Workspace file inspection, creation, text editing, complete rewrites, directory listing, and grep searching.' },
  read_file:               { group: '📁 File System',       groupColor: 'var(--accent-primary)', groupDescription: 'Workspace file inspection, creation, text editing, complete rewrites, directory listing, and grep searching.' },
  edit_file:               { group: '📁 File System',       groupColor: 'var(--accent-primary)', groupDescription: 'Workspace file inspection, creation, text editing, complete rewrites, directory listing, and grep searching.' },
  replace_file:            { group: '📁 File System',       groupColor: 'var(--accent-primary)', groupDescription: 'Workspace file inspection, creation, text editing, complete rewrites, directory listing, and grep searching.' },
  create_file:             { group: '📁 File System',       groupColor: 'var(--accent-primary)', groupDescription: 'Workspace file inspection, creation, text editing, complete rewrites, directory listing, and grep searching.' },
  grep_search:             { group: '📁 File System',       groupColor: 'var(--accent-primary)', groupDescription: 'Workspace file inspection, creation, text editing, complete rewrites, directory listing, and grep searching.' },
  apply_patch:             { group: '📁 File System',       groupColor: 'var(--accent-primary)', groupDescription: 'Workspace file inspection, creation, text editing, complete rewrites, directory listing, and grep searching.' },
  grep_replace:            { group: '📁 File System',       groupColor: 'var(--accent-primary)', groupDescription: 'Workspace file inspection, creation, text editing, complete rewrites, directory listing, and grep searching.' },
  web_search:              { group: '🌐 Web Research',      groupColor: '#38bdf8',               groupDescription: 'Public web search engine queries, automated HTML-to-Markdown extraction, and deep multi-source research.' },
  read_web_page:           { group: '🌐 Web Research',      groupColor: '#38bdf8',               groupDescription: 'Public web search engine queries, automated HTML-to-Markdown extraction, and deep multi-source research.' },
  deep_research:           { group: '🌐 Web Research',      groupColor: '#38bdf8',               groupDescription: 'Public web search engine queries, automated HTML-to-Markdown extraction, and deep multi-source research.' },
  execute_command:         { group: '🐚 Terminal & Shell',  groupColor: 'var(--accent-amber)',   groupDescription: 'Execute shell commands, manage interactive background terminal sessions, and control the working directory.' },
  get_working_directory:   { group: '🐚 Terminal & Shell',  groupColor: 'var(--accent-amber)',   groupDescription: 'Execute shell commands, manage interactive background terminal sessions, and control the working directory.' },
  set_working_directory:   { group: '🐚 Terminal & Shell',  groupColor: 'var(--accent-amber)',   groupDescription: 'Execute shell commands, manage interactive background terminal sessions, and control the working directory.' },
  start_terminal_session:  { group: '🐚 Terminal & Shell',  groupColor: 'var(--accent-amber)',   groupDescription: 'Execute shell commands, manage interactive background terminal sessions, and control the working directory.' },
  send_terminal_input:     { group: '🐚 Terminal & Shell',  groupColor: 'var(--accent-amber)',   groupDescription: 'Execute shell commands, manage interactive background terminal sessions, and control the working directory.' },
  read_terminal_output:    { group: '🐚 Terminal & Shell',  groupColor: 'var(--accent-amber)',   groupDescription: 'Execute shell commands, manage interactive background terminal sessions, and control the working directory.' },
  list_terminal_sessions:  { group: '🐚 Terminal & Shell',  groupColor: 'var(--accent-amber)',   groupDescription: 'Execute shell commands, manage interactive background terminal sessions, and control the working directory.' },
  terminate_terminal_session: { group: '🐚 Terminal & Shell', groupColor: 'var(--accent-amber)', groupDescription: 'Execute shell commands, manage interactive background terminal sessions, and control the working directory.' },
  get_document_symbols:    { group: '🛠️ Developer (LSP)',   groupColor: 'var(--accent-teal)',    groupDescription: 'Language-aware symbol navigation, definition jumps, reference finding, type hover, and diagnostics for TS/JS.' },
  go_to_definition:        { group: '🛠️ Developer (LSP)',   groupColor: 'var(--accent-teal)',    groupDescription: 'Language-aware symbol navigation, definition jumps, reference finding, type hover, and diagnostics for TS/JS.' },
  find_symbol_references:  { group: '🛠️ Developer (LSP)',   groupColor: 'var(--accent-teal)',    groupDescription: 'Language-aware symbol navigation, definition jumps, reference finding, type hover, and diagnostics for TS/JS.' },
  get_code_diagnostics:    { group: '🛠️ Developer (LSP)',   groupColor: 'var(--accent-teal)',    groupDescription: 'Language-aware symbol navigation, definition jumps, reference finding, type hover, and diagnostics for TS/JS.' },
  get_type_hover:          { group: '🛠️ Developer (LSP)',   groupColor: 'var(--accent-teal)',    groupDescription: 'Language-aware symbol navigation, definition jumps, reference finding, type hover, and diagnostics for TS/JS.' },
  map_module_dependencies: { group: '🛠️ Developer (LSP)',   groupColor: 'var(--accent-teal)',    groupDescription: 'Language-aware symbol navigation, definition jumps, reference finding, type hover, and diagnostics for TS/JS.' },
};

export const BUILTIN_TOOLS: ToolDefinition[] = [

  {
    name: 'list_directory',
    description: 'List contents of a directory in the active working directory.',
    parameters: {
      type: 'object',
      properties: {
        relative_path: {
          type: 'string',
          description: 'Subdirectory path relative to current working directory. Leave empty or use "." for root of working directory.',
        },
      },
    },
  },
  {
    name: 'read_file',
    description: 'Read the contents of a text file with 1-indexed line numbers. Omit start_line and end_line to view the entire file.',
    parameters: {
      type: 'object',
      properties: {
        relative_path: {
          type: 'string',
          description: 'Relative path to the file from current working directory.',
        },
        start_line: {
          type: 'number',
          description: 'Optional 1-indexed start line number to view.',
        },
        end_line: {
          type: 'number',
          description: 'Optional 1-indexed end line number to view.',
        },
      },
      required: ['relative_path'],
    },
  },
  {
    name: 'edit_file',
    description: 'Partially edit a text or code file by replacing target_text, OR by specifying start_line and end_line to replace that line range directly without providing target_text. Target text must not include display line numbers.',
    parameters: {
      type: 'object',
      properties: {
        relative_path: {
          type: 'string',
          description: 'Relative path to the file from current working directory.',
        },
        start_line: {
          type: 'number',
          description: 'Optional 1-indexed start line number of the target block.',
        },
        end_line: {
          type: 'number',
          description: 'Optional 1-indexed end line number of the target block.',
        },
        target_text: {
          type: 'string',
          description: 'Optional literal text to replace. Omit target_text if start_line and end_line are provided to replace the entire line range.',
        },
        replacement_text: {
          type: 'string',
          description: 'The new text content to substitute in place of target_text or line range. Use empty string "" to delete lines.',
        },
      },
      required: ['relative_path', 'replacement_text'],
    },
  },
  {
    name: 'replace_file',
    description: 'Replace the complete contents of an existing text file. Read the file first. Prefer this over edit_file for broad rewrites, restyling, or many non-contiguous changes.',
    parameters: {
      type: 'object',
      properties: {
        relative_path: {
          type: 'string',
          description: 'Relative path to an existing file from the current working directory.',
        },
        content: {
          type: 'string',
          description: 'The complete new contents of the file.',
        },
      },
      required: ['relative_path', 'content'],
    },
  },
  {
    name: 'create_file',
    description: 'Create a new text or code file in the working directory.',
    parameters: {
      type: 'object',
      properties: {
        relative_path: {
          type: 'string',
          description: 'Relative path to the file to create.',
        },
        content: {
          type: 'string',
          description: 'Initial text/code content for the new file.',
        },
      },
      required: ['relative_path', 'content'],
    },
  },
  {
    name: 'apply_patch',
    description: 'Apply a standard unified diff patch to modify a text or code file. The patch string should include unified diff format lines (- for removal, + for addition, space for context).',
    parameters: {
      type: 'object',
      properties: {
        relative_path: {
          type: 'string',
          description: 'Relative path to the file from current working directory.',
        },
        patch: {
          type: 'string',
          description: 'The unified diff patch content to apply.',
        },
      },
      required: ['relative_path', 'patch'],
    },
  },
  {
    name: 'grep_search',
    description: 'Search for a text or regular expression query across files in the working directory with advanced options for regex, case sensitivity, file-type filtering, whole word matching, surrounding context lines, match highlighting, and result pagination.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The literal text string or regular expression pattern to search for.',
        },
        relative_path: {
          type: 'string',
          description: 'Subdirectory path to restrict search (leave empty for entire workspace).',
        },
        is_regex: {
          type: 'boolean',
          description: 'Set to true to evaluate query as a regular expression. Defaults to false.',
        },
        case_sensitive: {
          type: 'boolean',
          description: 'Set to true for case-sensitive matching. Defaults to false (case-insensitive).',
        },
        whole_word: {
          type: 'boolean',
          description: 'Set to true to match whole words only (enforces word boundaries \\b). Defaults to false.',
        },
        file_pattern: {
          type: 'string',
          description: 'Optional file extension or pattern filter (e.g. "*.ts", "ts", "*.feature", "*.json").',
        },
        context_lines: {
          type: 'number',
          description: 'Number of surrounding lines (0 to 5) to include above and below matching lines. Defaults to 0.',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of matches to return (default 50, max 200).',
        },
        highlight_match: {
          type: 'boolean',
          description: 'Demarcate matched query in line content preview with >>>match<<<. Defaults to true.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'grep_replace',
    description: 'Batch search and replace text or regex patterns across multiple workspace files (Grep + Sed combo). Supports dry run previews.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The text or regular expression pattern to search for.',
        },
        replacement: {
          type: 'string',
          description: 'The replacement string to substitute in place of query.',
        },
        relative_path: {
          type: 'string',
          description: 'Subdirectory path filter (leave empty for workspace).',
        },
        is_regex: {
          type: 'boolean',
          description: 'Set to true to evaluate query as regular expression. Defaults to false.',
        },
        case_sensitive: {
          type: 'boolean',
          description: 'Set to true for case-sensitive replacement. Defaults to false.',
        },
        whole_word: {
          type: 'boolean',
          description: 'Set to true to match whole words only. Defaults to false.',
        },
        file_pattern: {
          type: 'string',
          description: 'Optional file extension filter (e.g. "*.ts", "ts", "*.feature").',
        },
        dry_run: {
          type: 'boolean',
          description: 'If true, preview changes without saving edits to disk. Defaults to false.',
        },
      },
      required: ['query', 'replacement'],
    },
  },
  {
    name: 'get_working_directory',
    description: 'Get the current active working directory path.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'set_working_directory',
    description: 'Set a new working directory path.',
    parameters: {
      type: 'object',
      properties: {
        absolute_path: {
          type: 'string',
          description: 'Absolute system directory path to set as active working directory.',
        },
      },
      required: ['absolute_path'],
    },
  },
  {
    name: 'execute_command',
    description: 'Execute a single-shot synchronous bash shell command. Do NOT use execute_command for background, persistent, long-running, interactive, server, or watcher processes (e.g. commands with & or interactive test runners). Use start_terminal_session for long-running, background, or interactive processes.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The bash shell command string to execute.',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the public web. Returns a short list of result titles, URLs, and snippets. IMPORTANT: Search snippets are brief previews only. You MUST inspect relevant result URLs using read_web_page to get full page content before running additional searches. Do NOT call web_search repeatedly without reading pages.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Short web search query.',
        },
        num_results: {
          type: 'number',
          description: 'Number of results to return (5–25, default 5).',
          minimum: 5,
          maximum: 25,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_web_page',
    description: 'Read one public HTTP/HTTPS page and return its main content as clean, bounded Markdown instead of raw HTML.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Full URL copied from a web_search result.',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'deep_research',
    description: 'Research one topic thoroughly with adaptive or caller-specified search, page, follow-up, and evidence budgets plus up to 60 attributed images. Preserve explicit user quantities. Call this once instead of chaining web_search and read_web_page.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The complete topic or question to research.',
        },
        image_count: {
          type: 'number',
          description: 'Requested number of relevant images, from 0 to 60. Use 0 when the user did not ask for images, and preserve an explicit quantity from the user.',
          minimum: 0,
          maximum: 60,
        },
        search_queries: {
          type: 'array',
          description: 'Optional focused search queries supplied by the model or user. The original research question is always included.',
          items: { type: 'string' },
        },
        search_count: {
          type: 'number',
          description: 'Optional search budget from 1 to 12. Defaults adapt to the question complexity.',
          minimum: 1,
          maximum: 12,
        },
        page_count: {
          type: 'number',
          description: 'Optional primary page-reading budget from 1 to 30. Defaults adapt to the search budget.',
          minimum: 1,
          maximum: 30,
        },
        linked_page_count: {
          type: 'number',
          description: 'Optional relevant follow-up page budget from 0 to 20, including useful links to other public websites.',
          minimum: 0,
          maximum: 20,
        },
        link_depth: {
          type: 'number',
          description: 'Maximum relevant-link traversal depth from 0 to 3. Use 0 to inspect only search-result pages; defaults to 1.',
          minimum: 0,
          maximum: 3,
        },
        semantic_link_classification: {
          type: 'boolean',
          description: 'Use the active Ollama model to classify link meaning from anchor and surrounding context. Defaults to true and safely falls back to deterministic scoring.',
        },
        link_relevance_threshold: {
          type: 'number',
          description: 'Minimum semantic relevance score for prioritized links, from 40 to 100. Defaults to 70.',
          minimum: 40,
          maximum: 100,
        },
        evidence_char_budget: {
          type: 'number',
          description: 'Optional total extracted evidence budget from 4,000 to 120,000 characters, shared across inspected sources.',
          minimum: 4000,
          maximum: 120000,
        },
        preset: {
          type: 'string',
          enum: ['quick', 'balanced', 'deep'],
          description: 'Optional research intensity preset: quick (fast summary), balanced (standard investigation), or deep (thorough multi-level research).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'start_terminal_session',
    description: 'Start a long-running background or interactive terminal session (e.g. dev servers, interactive tests like test:interactive, log tailing, background builds with &). Prefer this over execute_command for any background or interactive processes.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command line to run in background.',
        },
        session_id: {
          type: 'string',
          description: 'Optional custom short ID/name for the session (e.g. "dev-server"). Auto-generated if omitted.',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'send_terminal_input',
    description: 'Send input text or control characters (e.g. CTRL+C) to a running background terminal session.',
    parameters: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Target session ID.',
        },
        input: {
          type: 'string',
          description: 'Input text to send. Include \\n for ENTER. Use "CTRL+C" to interrupt.',
        },
      },
      required: ['session_id', 'input'],
    },
  },
  {
    name: 'read_terminal_output',
    description: 'Read bounded recent output lines from a background terminal session. Designed to keep context small.',
    parameters: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Target session ID.',
        },
        tail_lines: {
          type: 'number',
          description: 'Number of recent lines to return (default 50, max 200).',
        },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'list_terminal_sessions',
    description: 'List all active and recent background terminal sessions.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'terminate_terminal_session',
    description: 'Kill and terminate a running background terminal session.',
    parameters: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Target session ID to kill.',
        },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'get_document_symbols',
    description: 'Developer Tool: Get structural AST outline (classes, functions, interfaces, methods, variables) of a TypeScript/JavaScript source file with line numbers.',
    parameters: {
      type: 'object',
      properties: {
        relative_path: {
          type: 'string',
          description: 'Relative path to the code file.',
        },
      },
      required: ['relative_path'],
    },
  },
  {
    name: 'go_to_definition',
    description: 'Developer Tool: Jump to where a symbol (function, class, type, variable) is declared from its usage location (line & character position).',
    parameters: {
      type: 'object',
      properties: {
        relative_path: {
          type: 'string',
          description: 'Relative path to the file containing the symbol usage.',
        },
        line: {
          type: 'number',
          description: '1-indexed line number of the symbol in the file.',
        },
        character: {
          type: 'number',
          description: '1-indexed column/character position of the symbol in the line.',
        },
      },
      required: ['relative_path', 'line', 'character'],
    },
  },
  {
    name: 'find_symbol_references',
    description: 'Developer Tool: Find all occurrences and usage locations of a symbol across the project workspace.',
    parameters: {
      type: 'object',
      properties: {
        relative_path: {
          type: 'string',
          description: 'Relative path to the file containing the target symbol.',
        },
        line: {
          type: 'number',
          description: '1-indexed line number of the symbol.',
        },
        character: {
          type: 'number',
          description: '1-indexed column/character position of the symbol.',
        },
      },
      required: ['relative_path', 'line', 'character'],
    },
  },
  {
    name: 'get_code_diagnostics',
    description: 'Developer Tool: Fetch compiler errors, warnings, and type diagnostics for a specific file or the entire workspace.',
    parameters: {
      type: 'object',
      properties: {
        relative_path: {
          type: 'string',
          description: 'Optional relative path to filter diagnostics for a single file. Omit for workspace diagnostics.',
        },
      },
    },
  },
  {
    name: 'get_type_hover',
    description: 'Developer Tool: Inspect type signature, return type, and documentation hover information for a code symbol.',
    parameters: {
      type: 'object',
      properties: {
        relative_path: {
          type: 'string',
          description: 'Relative path to the file.',
        },
        line: {
          type: 'number',
          description: '1-indexed line number.',
        },
        character: {
          type: 'number',
          description: '1-indexed character position.',
        },
      },
      required: ['relative_path', 'line', 'character'],
    },
  },
  {
    name: 'map_module_dependencies',
    description: 'Developer Tool: Map import/export module dependencies and caller files for a TypeScript/JavaScript source file without reading raw code text.',
    parameters: {
      type: 'object',
      properties: {
        relative_path: {
          type: 'string',
          description: 'Relative path to the code file.',
        },
      },
      required: ['relative_path'],
    },
  },
];

export function getToolDefinitions(profile: ToolComplexityProfile = 'simple'): ToolDefinition[] {
  return BUILTIN_TOOLS.map((tool) => {
    if (tool.name === 'grep_search') {
      if (profile === 'simple') {
        return {
          name: 'grep_search',
          description: 'Search for a text string query across files in the working directory.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The text string to search for.',
              },
              relative_path: {
                type: 'string',
                description: 'Subdirectory path to restrict search (optional).',
              },
            },
            required: ['query'],
          },
        };
      }
      if (profile === 'medium') {
        return {
          name: 'grep_search',
          description: 'Search for text or regex patterns across workspace files with case-sensitivity and file extension filtering.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The literal text string or regular expression pattern to search for.',
              },
              relative_path: {
                type: 'string',
                description: 'Subdirectory path to restrict search (optional).',
              },
              is_regex: {
                type: 'boolean',
                description: 'Set to true to evaluate query as a regular expression. Defaults to false.',
              },
              case_sensitive: {
                type: 'boolean',
                description: 'Set to true for case-sensitive matching. Defaults to false.',
              },
              file_pattern: {
                type: 'string',
                description: 'Optional file extension or pattern filter (e.g. "*.ts", "ts", "*.json").',
              },
            },
            required: ['query'],
          },
        };
      }
    }

    if (tool.name === 'grep_replace') {
      if (profile === 'simple') {
        return {
          name: 'grep_replace',
          description: 'Batch search and replace text across files in the working directory.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Text string to search for.',
              },
              replacement: {
                type: 'string',
                description: 'Replacement text to substitute.',
              },
              relative_path: {
                type: 'string',
                description: 'Subdirectory path filter (optional).',
              },
            },
            required: ['query', 'replacement'],
          },
        };
      }
    }

    return tool;
  });
}

export const TOOL_DEFINITIONS = getToolDefinitions('simple');

export class ToolExecutor {
  private workingDir: string;
  private webClient: WebClient;
  private deepResearchRunner: DeepResearchRunner;
  private mcpManager: McpClientManager;
  private terminalManager: TerminalSessionManager;
  private lspManager: LspManager;

  constructor(
    initialWorkingDir: string = process.cwd(),
    webClient: WebClient = new WebClient(),
    mcpManager: McpClientManager = new McpClientManager(initialWorkingDir),
    terminalManager: TerminalSessionManager = new TerminalSessionManager(initialWorkingDir),
    lspManager: LspManager = new LspManager(initialWorkingDir)
  ) {
    this.workingDir = path.resolve(initialWorkingDir);
    this.webClient = webClient;
    this.deepResearchRunner = new DeepResearchRunner(webClient);
    this.mcpManager = mcpManager;
    this.terminalManager = terminalManager;
    this.lspManager = lspManager;
  }

  public getTerminalManager(): TerminalSessionManager {
    return this.terminalManager;
  }

  public getMcpManager(): McpClientManager {
    return this.mcpManager;
  }

  public getLspManager(): LspManager {
    return this.lspManager;
  }

  public getWorkingDir(): string {
    return this.workingDir;
  }

  public setDeepResearchNoteGenerator(noteGenerator?: DeepResearchNoteGenerator): void {
    this.deepResearchRunner.setNoteGenerator(noteGenerator);
  }

  public setDeepResearchSemanticClassifier(classifier?: DeepResearchSemanticClassifier): void {
    this.deepResearchRunner.setSemanticClassifier(classifier);
  }

  public setDeepResearchQueryGenerator(generator?: DeepResearchQueryGenerator): void {
    this.deepResearchRunner.setQueryGenerator(generator);
  }

  public setWorkingDir(newDir: string): { success: boolean; path: string; error?: string } {
    try {
      const resolved = path.resolve(newDir);
      this.workingDir = resolved;
      this.mcpManager.setWorkingDir(resolved);
      this.terminalManager.setDefaultWorkingDir(resolved);
      this.lspManager.updateWorkingDir(resolved);
      return { success: true, path: this.workingDir };
    } catch (err: any) {
      return { success: false, path: this.workingDir, error: err.message };
    }
  }

  public async previewFileDiff(name: string, args: Record<string, any>): Promise<FileDiff | undefined> {
    if (name === 'create_file' && args.relative_path && args.content !== undefined) {
      return buildCreatedFileDiff(args.relative_path, args.content);
    }

    if (
      name !== 'edit_file' &&
      name !== 'replace_file' &&
      name !== 'apply_patch'
    ) {
      return undefined;
    }
    if (
      !args.relative_path ||
      (name === 'edit_file' && args.replacement_text === undefined) ||
      (name === 'replace_file' && args.content === undefined) ||
      (name === 'apply_patch' && !args.patch)
    ) {
      return undefined;
    }

    let filePath = path.resolve(this.workingDir, args.relative_path);
    let actualRelativePath = args.relative_path;

    try {
      await fs.stat(filePath);
    } catch (_) {
      const foundPath = await this.findFileRecursive(this.workingDir, path.basename(args.relative_path));
      if (!foundPath) return undefined;
      filePath = foundPath;
      actualRelativePath = path.relative(this.workingDir, foundPath);
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      if (name === 'replace_file') {
        if (content === args.content) return undefined;
        return buildEditedFileDiff(actualRelativePath, content, content, args.content);
      }
      if (name === 'apply_patch') {
        const patchResult = applyUnifiedDiff(content, args.patch);
        if (!patchResult.success || !patchResult.updatedContent || patchResult.updatedContent === content) {
          return undefined;
        }
        return buildPatchFileDiff(actualRelativePath, content, args.patch);
      }
      if (name !== 'edit_file') return undefined;
      if (args.replacement_text === undefined) return undefined;
      let match: string | null = null;
      const replacementText = stripCopiedLineNumbers(args.replacement_text || '');
      const numStart = args.start_line !== undefined && args.start_line !== null ? Number(args.start_line) : undefined;
      const numEnd = args.end_line !== undefined && args.end_line !== null ? Number(args.end_line) : undefined;
      const hasRange = typeof numStart === 'number' && !isNaN(numStart) && numStart > 0 &&
                       typeof numEnd === 'number' && !isNaN(numEnd) && numEnd >= numStart;

      if ((args.target_text === undefined || args.target_text === '') && hasRange) {
        const lines = content.replace(/\r\n/g, '\n').split('\n');
        const sIdx = Math.max(0, Math.floor(numStart!) - 1);
        const eIdx = Math.min(lines.length, Math.floor(numEnd!));
        if (sIdx < eIdx) {
          match = lines.slice(sIdx, eIdx).join('\n');
        }
      }
      if (!match && args.target_text !== undefined) {
        const targetText = stripCopiedLineNumbers(args.target_text);
        match = this.findMatchingTargetCode(content, targetText, args.start_line, args.end_line);
      }
      if (!match) return undefined;
      return buildEditedFileDiff(
        actualRelativePath,
        content,
        match,
        preserveFirstLineIndent(match, replacementText)
      );
    } catch (_) {
      return undefined;
    }
  }

  private async findFileRecursive(dir: string, targetName: string, depth: number = 0): Promise<string | null> {
    if (depth > 3) return null;
    try {
      const items = await fs.readdir(dir, { withFileTypes: true });
      for (const item of items) {
        const full = path.join(dir, item.name);
        if (item.isFile() && item.name.toLowerCase() === targetName.toLowerCase()) {
          return full;
        }
        if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') {
          const res = await this.findFileRecursive(full, targetName, depth + 1);
          if (res) return res;
        }
      }
    } catch (_) {}
    return null;
  }

  /**
   * Smart code target resolution logic: matches exact string first, then falls back to tab/space/line-ending insensitive matching
   */
  private findMatchingTargetCode(
    content: string,
    targetText: string,
    startLine?: number | string,
    endLine?: number | string,
    isFallback: boolean = false,
  ): string | null {
    let searchContent = content;

    const numStart = startLine !== undefined && startLine !== null ? Number(startLine) : undefined;
    const numEnd = endLine !== undefined && endLine !== null ? Number(endLine) : undefined;

    if (typeof numStart === 'number' && !isNaN(numStart) && numStart > 0) {
      const lines = content.replace(/\r\n/g, '\n').split('\n');
      const startIdx = Math.max(0, Math.floor(numStart) - 1);
      const endIdx = typeof numEnd === 'number' && !isNaN(numEnd) && numEnd >= numStart
        ? Math.min(lines.length, Math.floor(numEnd))
        : lines.length;
      
      const boundedLines = lines.slice(startIdx, endIdx);
      if (boundedLines.length > 0) {
        searchContent = boundedLines.join('\n');
      }
    }

    if (searchContent.includes(targetText)) return targetText;

    const normContent = content.replace(/\r\n/g, '\n');
    const normTarget = targetText.replace(/\r\n/g, '\n');
    if (normContent.includes(normTarget)) return normTarget;

    const trimmedTarget = normTarget.trim();
    if (!trimmedTarget) return null;

    const normalizeLine = (line: string) => line.replace(/[\t ]+/g, ' ').trim();

    const lines = normContent.split('\n');
    const targetLines = trimmedTarget.split('\n');

    // 1. Multi-line block match that tolerates tabs vs spaces, line numbers, and indentation differences.
    if (targetLines.length > 1) {
      const normalizedTargetLines = targetLines.map(normalizeLine);
      for (let start = 0; start <= lines.length - targetLines.length; start++) {
        const candidateLines = lines.slice(start, start + targetLines.length);
        if (candidateLines.every((line, index) => normalizeLine(line) === normalizedTargetLines[index])) {
          return candidateLines.join('\n');
        }
      }
    }

    // 2. Single line match with tab and space normalization
    const normalizedSingleTarget = normalizeLine(trimmedTarget);
    for (const line of lines) {
      if (normalizeLine(line) === normalizedSingleTarget) return line;
    }

    // 3. Match text whose newlines/indentation/tabs/operator-spacing were altered by a model.
    // Build a normalized string while retaining offsets into the original file content.
    const nonWsChars: string[] = [];
    const originalOffsets: number[] = [];
    for (let index = 0; index < normContent.length; index++) {
      const char = normContent[index];
      if (!/\s/.test(char)) {
        nonWsChars.push(char);
        originalOffsets.push(index);
      }
    }
    const nonWsContent = nonWsChars.join('');
    const nonWsTarget = trimmedTarget.replace(/\s+/g, '');
    const nonWsStart = nonWsContent.indexOf(nonWsTarget);
    if (nonWsStart !== -1) {
      const nonWsEnd = nonWsStart + nonWsTarget.length - 1;
      const originalStart = originalOffsets[nonWsStart];
      const originalEnd = originalOffsets[nonWsEnd] + 1;
      return normContent.slice(originalStart, originalEnd);
    }

    // 4. Substring statement matching fallback (e.g. return statement or function signature)
    if (trimmedTarget.includes('return ') || trimmedTarget.includes('function ') || trimmedTarget.includes('export ')) {
      for (const line of lines) {
        if (
          (trimmedTarget.includes('return') && line.includes('return')) ||
          (trimmedTarget.includes('function') && line.includes('function')) ||
          (trimmedTarget.includes('computeHash') && line.includes('computeHash'))
        ) {
          return line;
        }
      }
    }

    // 5. Fallback Normalization: ONLY run if primary search fails (returns null)
    if (!isFallback) {
      // Fallback 5a: Try unescaping literal '\\n' sequences in targetText
      if (targetText.includes('\\n')) {
        const unescaped = targetText.replace(/\\n/g, '\n');
        const match = this.findMatchingTargetCode(content, unescaped, startLine, endLine, true);
        if (match) return match;
      }

      // Fallback 5b: If startLine/endLine bounds were specified, try searching full file without bounds
      if (startLine !== undefined || endLine !== undefined) {
        const unboundedMatch = this.findMatchingTargetCode(content, targetText, undefined, undefined, true);
        if (unboundedMatch) return unboundedMatch;

        // Fallback 5c: Try both unescaping '\\n' AND searching without line bounds
        if (targetText.includes('\\n')) {
          const unescaped = targetText.replace(/\\n/g, '\n');
          const combinedMatch = this.findMatchingTargetCode(content, unescaped, undefined, undefined, true);
          if (combinedMatch) return combinedMatch;
        }
      }
    }

    return null;
  }

  private async grepDirectory(
    dir: string,
    query: string,
    results: Array<{ file: string; line: number; content: string; context?: string[] }>,
    depth: number = 0,
    options: {
      is_regex?: boolean;
      case_sensitive?: boolean;
      whole_word?: boolean;
      file_pattern?: string;
      context_lines?: number;
      max_results?: number;
      highlight_match?: boolean;
    } = {}
  ): Promise<void> {
    const maxResults = Math.min(200, Math.max(1, options.max_results || 50));
    if (depth > 6 || results.length >= maxResults) return;

    try {
      const items = await fs.readdir(dir, { withFileTypes: true });

      const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      let pattern = options.is_regex ? query : escapeRegExp(query);
      if (options.whole_word) {
        pattern = `\\b(?:${pattern})\\b`;
      }
      const flags = (options.case_sensitive ? '' : 'i') + 'g';
      const matcher = new RegExp(pattern, flags);

      let patternMatcher: ((fileName: string) => boolean) | null = null;
      if (options.file_pattern && options.file_pattern.trim()) {
        const pat = options.file_pattern.trim();
        if (pat.startsWith('*.')) {
          const ext = pat.slice(1).toLowerCase();
          patternMatcher = (fn) => fn.toLowerCase().endsWith(ext);
        } else if (pat.startsWith('.')) {
          const ext = pat.toLowerCase();
          patternMatcher = (fn) => fn.toLowerCase().endsWith(ext);
        } else if (pat.includes('*')) {
          const regexStr = '^' + pat.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
          const r = new RegExp(regexStr, 'i');
          patternMatcher = (fn) => r.test(fn);
        } else {
          const ext = '.' + pat.toLowerCase();
          patternMatcher = (fn) => fn.toLowerCase().endsWith(ext) || fn.toLowerCase().includes(pat.toLowerCase());
        }
      }

      const ctxLines = Math.min(5, Math.max(0, options.context_lines || 0));
      const doHighlight = options.highlight_match !== false;

      for (const item of items) {
        if (results.length >= maxResults) break;
        const fullPath = path.join(dir, item.name);
        if (item.isFile() && !item.name.startsWith('.')) {
          if (patternMatcher && !patternMatcher(item.name)) {
            continue;
          }

          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const lines = content.split('\n');
            lines.forEach((lineText, idx) => {
              if (results.length >= maxResults) return;

              matcher.lastIndex = 0;
              if (matcher.test(lineText)) {
                matcher.lastIndex = 0;
                const formattedContent = doHighlight
                  ? lineText.replace(matcher, (m) => `>>>${m}<<<`).trim()
                  : lineText.trim();

                let contextSnippet: string[] | undefined = undefined;
                if (ctxLines > 0) {
                  const startLine = Math.max(0, idx - ctxLines);
                  const endLine = Math.min(lines.length, idx + ctxLines + 1);
                  contextSnippet = lines.slice(startLine, endLine).map((l, offset) => {
                    const lineNum = startLine + offset + 1;
                    const isMatchLine = lineNum === idx + 1;
                    const prefix = isMatchLine ? `> ${lineNum}: ` : `  ${lineNum}: `;
                    matcher.lastIndex = 0;
                    const lineVal = isMatchLine && doHighlight
                      ? l.replace(matcher, (m) => `>>>${m}<<<`)
                      : l;
                    return `${prefix}${lineVal}`;
                  });
                }

                results.push({
                  file: path.relative(this.workingDir, fullPath),
                  line: idx + 1,
                  content: formattedContent,
                  context: contextSnippet,
                });
              }
            });
          } catch (_) {}
        } else if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules' && item.name !== 'dist') {
          await this.grepDirectory(fullPath, query, results, depth + 1, options);
        }
      }
    } catch (_) {}
  }

  private async grepReplace(
    dir: string,
    query: string,
    replacement: string,
    options: {
      is_regex?: boolean;
      case_sensitive?: boolean;
      whole_word?: boolean;
      file_pattern?: string;
      dry_run?: boolean;
    } = {}
  ): Promise<{
    dry_run: boolean;
    files_modified: number;
    total_replacements: number;
    details: Array<{ file: string; replacements: number; diff_preview?: string }>;
  }> {
    const results: Array<{ file: string; replacements: number; diff_preview?: string }> = [];
    let totalReplacements = 0;

    const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let pattern = options.is_regex ? query : escapeRegExp(query);
    if (options.whole_word) {
      pattern = `\\b(?:${pattern})\\b`;
    }
    const flags = (options.case_sensitive ? '' : 'i') + 'g';
    const matcher = new RegExp(pattern, flags);

    let patternMatcher: ((fileName: string) => boolean) | null = null;
    if (options.file_pattern && options.file_pattern.trim()) {
      const pat = options.file_pattern.trim();
      if (pat.startsWith('*.')) {
        const ext = pat.slice(1).toLowerCase();
        patternMatcher = (fn) => fn.toLowerCase().endsWith(ext);
      } else if (pat.startsWith('.')) {
        const ext = pat.toLowerCase();
        patternMatcher = (fn) => fn.toLowerCase().endsWith(ext);
      } else if (pat.includes('*')) {
        const regexStr = '^' + pat.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
        const r = new RegExp(regexStr, 'i');
        patternMatcher = (fn) => r.test(fn);
      } else {
        const ext = '.' + pat.toLowerCase();
        patternMatcher = (fn) => fn.toLowerCase().endsWith(ext) || fn.toLowerCase().includes(pat.toLowerCase());
      }
    }

    const walk = async (currentDir: string, depth = 0) => {
      if (depth > 6) return;
      let items: any[] = [];
      try {
        items = await fs.readdir(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const item of items) {
        const fullPath = path.join(currentDir, item.name);
        if (item.isFile() && !item.name.startsWith('.')) {
          if (patternMatcher && !patternMatcher(item.name)) continue;

          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            matcher.lastIndex = 0;
            const matches = content.match(matcher);
            if (matches && matches.length > 0) {
              const replacementCount = matches.length;
              matcher.lastIndex = 0;
              const newContent = content.replace(matcher, replacement);
              const relPath = path.relative(this.workingDir, fullPath);

              if (!options.dry_run) {
                await fs.writeFile(fullPath, newContent, 'utf-8');
              }

              totalReplacements += replacementCount;
              results.push({
                file: relPath,
                replacements: replacementCount,
                diff_preview: `${matches[0]} → ${replacement}`,
              });
            }
          } catch (_) {}
        } else if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules' && item.name !== 'dist') {
          await walk(fullPath, depth + 1);
        }
      }
    };

    await walk(dir);

    return {
      dry_run: !!options.dry_run,
      files_modified: results.length,
      total_replacements: totalReplacements,
      details: results,
    };
  }

  public async executeTool(name: string, args: Record<string, any>, onProgress?: (progress: any) => void, signal?: AbortSignal): Promise<any> {
    if (this.mcpManager.hasTool(name)) {
      return await this.mcpManager.executeTool(name, args);
    }

    switch (name) {
      case 'list_directory': {
        const subPath = args.relative_path || '.';
        const targetDir = path.resolve(this.workingDir, subPath);
        
        try {
          const stats = await fs.stat(targetDir);
          if (!stats.isDirectory()) {
            return { error: `Path "${subPath}" is not a directory.` };
          }
          const items = await fs.readdir(targetDir, { withFileTypes: true });
          const entries = await Promise.all(
            items.map(async (item) => {
              const itemPath = path.join(targetDir, item.name);
              let size = 0;
              try {
                if (item.isFile()) {
                  const s = await fs.stat(itemPath);
                  size = s.size;
                }
              } catch (_) {}

              return {
                name: item.name,
                type: item.isDirectory() ? 'directory' : item.isFile() ? 'file' : 'other',
                size: item.isFile() ? `${size} bytes` : undefined,
              };
            })
          );
          return { working_directory: this.workingDir, relative_path: subPath, entries };
        } catch (err: any) {
          return { error: `Failed to list directory: ${err.message}` };
        }
      }

      case 'read_file': {
        if (!args.relative_path) {
          return { error: 'Parameter relative_path is required.' };
        }
        let filePath = path.resolve(this.workingDir, args.relative_path);
        let actualRelativePath = args.relative_path;

        try {
          await fs.stat(filePath);
        } catch (_) {
          const baseName = path.basename(args.relative_path);
          const foundPath = await this.findFileRecursive(this.workingDir, baseName);
          if (foundPath) {
            filePath = foundPath;
            actualRelativePath = path.relative(this.workingDir, foundPath);
          }
        }

        try {
          const stats = await fs.stat(filePath);
          if (stats.isDirectory()) {
            return { error: `Path "${actualRelativePath}" is a directory, not a file.` };
          }
          if (stats.size > 500 * 1024) {
            return { error: `File "${actualRelativePath}" exceeds 500KB limit.` };
          }
          const rawContent = await fs.readFile(filePath, 'utf-8');
          const lines = rawContent.split('\n');
          const totalLines = lines.length;

          let startLine = typeof args.start_line === 'number' && args.start_line > 0 ? Math.floor(args.start_line) : 1;
          let endLine = typeof args.end_line === 'number' && args.end_line >= startLine ? Math.floor(args.end_line) : totalLines;
          startLine = Math.min(startLine, totalLines);
          endLine = Math.min(endLine, totalLines);

          const selectedLines = lines.slice(startLine - 1, endLine);
          const numberedContent = selectedLines
            .map((line, idx) => `${startLine + idx}: ${line}`)
            .join('\n');

          const headerNote = `Showing lines ${startLine} to ${endLine} of ${totalLines} in ${actualRelativePath}. Please note that any changes targeting original code should remove the line number, colon, and leading space.`;

          return {
            file_path: actualRelativePath,
            content: `${headerNote}\n\n${numberedContent}`,
            raw_content: rawContent,
            start_line: startLine,
            end_line: endLine,
            line_count: totalLines,
            size_bytes: stats.size,
          };
        } catch (err: any) {
          return { error: `Failed to read file: ${err.message}` };
        }
      }

      case 'edit_file': {
        const { relative_path, target_text, replacement_text, start_line, end_line } = args;
        if (!relative_path || replacement_text === undefined) {
          return { error: 'Parameters relative_path and replacement_text are required.' };
        }
        const numStart = start_line !== undefined && start_line !== null ? Number(start_line) : undefined;
        const numEnd = end_line !== undefined && end_line !== null ? Number(end_line) : undefined;
        const hasRange = typeof numStart === 'number' && !isNaN(numStart) && numStart > 0 &&
                         typeof numEnd === 'number' && !isNaN(numEnd) && numEnd >= numStart;

        if (target_text === undefined && !hasRange) {
          return { error: 'Either target_text or start_line and end_line range must be provided.' };
        }
        let filePath = path.resolve(this.workingDir, relative_path);
        let actualRelativePath = relative_path;

        try {
          await fs.stat(filePath);
        } catch (_) {
          const baseName = path.basename(relative_path);
          const foundPath = await this.findFileRecursive(this.workingDir, baseName);
          if (foundPath) {
            filePath = foundPath;
            actualRelativePath = path.relative(this.workingDir, foundPath);
          }
        }

        try {
          const stats = await fs.stat(filePath);
          if (stats.isDirectory()) {
            return { error: `Path "${actualRelativePath}" is a directory, not a file.` };
          }
          const content = await fs.readFile(filePath, 'utf-8');
          const cleanReplacementText = normalizeModelText(replacement_text);
          let matchToReplace: string | null = null;

          if ((target_text === undefined || target_text === '') && hasRange) {
            const lines = content.replace(/\r\n/g, '\n').split('\n');
            const sIdx = Math.max(0, Math.floor(numStart!) - 1);
            const eIdx = Math.min(lines.length, Math.floor(numEnd!));
            if (sIdx < eIdx) {
              matchToReplace = lines.slice(sIdx, eIdx).join('\n');
            }
          }

          if (!matchToReplace && target_text !== undefined) {
            const cleanTargetText = normalizeModelText(target_text);
            matchToReplace = this.findMatchingTargetCode(content, cleanTargetText, start_line, end_line);
          }

          if (!matchToReplace) {
            return {
              error: `Could not find target content to edit in "${actualRelativePath}". Specify valid target_text or valid start_line and end_line bounds.`,
              file_path: actualRelativePath,
              changed: false,
            };
          }

          const replacementToWrite = preserveFirstLineIndent(matchToReplace, cleanReplacementText);
          const updatedContent = content.replace(matchToReplace, replacementToWrite);
          if (updatedContent === content) {
            return {
              error: `The edit matched "${actualRelativePath}" but produced no change. Use different replacement_text, or use replace_file for a broad rewrite.`,
              file_path: actualRelativePath,
              changed: false,
            };
          }
          await fs.writeFile(filePath, updatedContent, 'utf-8');

          return {
            success: true,
            file_path: actualRelativePath,
            message: `Successfully updated ${actualRelativePath}.`,
            size_bytes: updatedContent.length,
            diff: buildEditedFileDiff(actualRelativePath, content, matchToReplace, replacementToWrite),
          };
        } catch (err: any) {
          return { error: `Failed to edit file: ${err.message}` };
        }
      }

      case 'replace_file': {
        const { relative_path, content: replacementContent } = args;
        if (!relative_path || replacementContent === undefined) {
          return { error: 'Parameters relative_path and content are required.' };
        }
        let filePath = path.resolve(this.workingDir, relative_path);
        let actualRelativePath = relative_path;

        try {
          await fs.stat(filePath);
        } catch (_) {
          const foundPath = await this.findFileRecursive(this.workingDir, path.basename(relative_path));
          if (foundPath) {
            filePath = foundPath;
            actualRelativePath = path.relative(this.workingDir, foundPath);
          }
        }

        try {
          const stats = await fs.stat(filePath);
          if (stats.isDirectory()) {
            return { error: `Path "${actualRelativePath}" is a directory, not a file.` };
          }
          const originalContent = await fs.readFile(filePath, 'utf-8');
          if (originalContent === replacementContent) {
            return {
              error: `replace_file produced no change in "${actualRelativePath}".`,
              file_path: actualRelativePath,
              changed: false,
            };
          }
          await fs.writeFile(filePath, replacementContent, 'utf-8');
          return {
            success: true,
            file_path: actualRelativePath,
            message: `Successfully replaced ${actualRelativePath}.`,
            size_bytes: Buffer.byteLength(replacementContent, 'utf-8'),
            diff: buildEditedFileDiff(actualRelativePath, originalContent, originalContent, replacementContent),
          };
        } catch (err: any) {
          return { error: `Failed to replace file: ${err.message}` };
        }
      }

      case 'create_file': {
        const { relative_path, content } = args;
        if (!relative_path || content === undefined) {
          return { error: 'Parameters relative_path and content are required.' };
        }
        const filePath = path.resolve(this.workingDir, relative_path);
        try {
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, content, 'utf-8');
          return {
            success: true,
            file_path: relative_path,
            message: `Successfully created file ${relative_path}.`,
            size_bytes: Buffer.byteLength(content, 'utf-8'),
            diff: buildCreatedFileDiff(relative_path, content),
          };
        } catch (err: any) {
          return { error: `Failed to create file: ${err.message}` };
        }
      }

      case 'apply_patch': {
        const { relative_path, patch } = args;
        if (!relative_path || !patch) {
          return { error: 'Parameters relative_path and patch are required.' };
        }
        let filePath = path.resolve(this.workingDir, relative_path);
        let actualRelativePath = relative_path;

        try {
          await fs.stat(filePath);
        } catch (_) {
          const foundPath = await this.findFileRecursive(this.workingDir, path.basename(relative_path));
          if (foundPath) {
            filePath = foundPath;
            actualRelativePath = path.relative(this.workingDir, foundPath);
          }
        }

        try {
          const stats = await fs.stat(filePath);
          if (stats.isDirectory()) {
            return { error: `Path "${actualRelativePath}" is a directory, not a file.` };
          }
          const originalContent = await fs.readFile(filePath, 'utf-8');
          const patchResult = applyUnifiedDiff(originalContent, patch);

          if (!patchResult.success) {
            return {
              error: patchResult.error || `Failed to apply patch to file "${actualRelativePath}".`,
              file_path: actualRelativePath,
              changed: false,
            };
          }

          const updatedContent = patchResult.updatedContent!;
          if (updatedContent === originalContent) {
            return {
              error: `Patch produced no change to "${actualRelativePath}".`,
              file_path: actualRelativePath,
              changed: false,
            };
          }

          await fs.writeFile(filePath, updatedContent, 'utf-8');

          return {
            success: true,
            file_path: actualRelativePath,
            message: `Successfully applied patch to ${actualRelativePath}.`,
            size_bytes: Buffer.byteLength(updatedContent, 'utf-8'),
            diff: buildPatchFileDiff(actualRelativePath, originalContent, patch),
          };
        } catch (err: any) {
          return { error: `Failed to apply patch to file: ${err.message}` };
        }
      }

      case 'grep_search': {
        const { query, relative_path, is_regex, case_sensitive, whole_word, file_pattern, context_lines, max_results, highlight_match } = args;
        if (!query) return { error: 'Parameter query is required.' };
        const searchDir = relative_path ? path.resolve(this.workingDir, relative_path) : this.workingDir;
        
        try {
          if (is_regex) {
            try {
              new RegExp(query, case_sensitive ? '' : 'i');
            } catch (err: any) {
              return { error: `Invalid regular expression pattern "${query}": ${err.message}` };
            }
          }

          const maxLimit = Math.min(200, Math.max(1, Number(max_results) || 50));
          const results: Array<{ file: string; line: number; content: string; context?: string[] }> = [];

          await this.grepDirectory(searchDir, query, results, 0, {
            is_regex,
            case_sensitive,
            whole_word,
            file_pattern,
            context_lines: Number(context_lines) || 0,
            max_results: maxLimit,
            highlight_match,
          });

          return {
            query,
            is_regex: !!is_regex,
            case_sensitive: !!case_sensitive,
            whole_word: !!whole_word,
            file_pattern: file_pattern || null,
            context_lines: Number(context_lines) || 0,
            max_results: maxLimit,
            total_matches: results.length,
            returned_matches: results.length,
            matches: results,
          };
        } catch (err: any) {
          return { error: `Search failed: ${err.message}` };
        }
      }

      case 'grep_replace': {
        const { query, replacement, relative_path, is_regex, case_sensitive, whole_word, file_pattern, dry_run } = args;
        if (!query || replacement === undefined) {
          return { error: 'Parameters query and replacement are required.' };
        }
        const searchDir = relative_path ? path.resolve(this.workingDir, relative_path) : this.workingDir;

        try {
          if (is_regex) {
            try {
              new RegExp(query, case_sensitive ? '' : 'i');
            } catch (err: any) {
              return { error: `Invalid regular expression pattern "${query}": ${err.message}` };
            }
          }

          return await this.grepReplace(searchDir, query, replacement, {
            is_regex,
            case_sensitive,
            whole_word,
            file_pattern,
            dry_run,
          });
        } catch (err: any) {
          return { error: `Grep replace failed: ${err.message}` };
        }
      }

      case 'get_working_directory': {
        return { working_directory: this.workingDir };
      }

      case 'set_working_directory': {
        const targetPath = args.absolute_path;
        if (!targetPath) return { error: 'absolute_path argument is required.' };
        try {
          const stats = await fs.stat(targetPath);
          if (!stats.isDirectory()) {
            return { error: `Path "${targetPath}" is not a directory.` };
          }
          this.workingDir = path.resolve(targetPath);
          return { success: true, working_directory: this.workingDir };
        } catch (err: any) {
          return { error: `Directory change failed: ${err.message}` };
        }
      }

      case 'execute_command': {
        const cmdStr = args.command;
        if (!cmdStr) return { error: 'Parameter command is required.' };
        const trimmed = cmdStr.trim();
        if (trimmed.endsWith('&') || trimmed.includes('test:interactive') || trimmed.includes('--profile')) {
          const cleanCmd = trimmed.replace(/\s*&\s*$/, '');
          return this.terminalManager.startSession(cleanCmd, undefined, this.workingDir);
        }
        return await this.executeCommand(cmdStr);
      }

      case 'web_search': {
        if (!args.query) return { error: 'Parameter query is required.' };
        try {
          const numResults = typeof args.num_results === 'number' ? args.num_results : undefined;
          const results = await this.webClient.search(args.query, numResults, signal);
          return {
            query: args.query,
            result_count: results.length,
            results,
            instruction: 'Search snippets above are brief previews. Next, you MUST call read_web_page using one of the returned URLs above to read full page content before running another search or answering.',
          };
        } catch (err: any) {
          return { error: `Web search failed: ${err.message}` };
        }
      }

      case 'read_web_page': {
        if (!args.url) return { error: 'Parameter url is required.' };
        try {
          return await this.webClient.readPage(args.url, signal);
        } catch (err: any) {
          return { error: `Web page read failed: ${err.message}`, url: args.url };
        }
      }

      case 'deep_research': {
        if (!args.query) return { error: 'Parameter query is required.' };
        try {
          return await this.deepResearchRunner.run(String(args.query), args.image_count, onProgress, {
            preset: typeof args.preset === 'string' && ['quick', 'balanced', 'deep'].includes(args.preset) ? args.preset as any : undefined,
            searchQueries: Array.isArray(args.search_queries) ? args.search_queries.map(String) : undefined,
            searchCount: args.search_count,
            pageCount: args.page_count,
            linkedPageCount: args.linked_page_count,
            linkDepth: args.link_depth,
            semanticLinkClassification: args.semantic_link_classification,
            linkRelevanceThreshold: args.link_relevance_threshold,
            evidenceCharBudget: args.evidence_char_budget,
            signal,
          });
        } catch (err: any) {
          return { error: `Deep research failed: ${err.message}` };
        }
      }

      case 'start_terminal_session': {
        const { command, session_id } = args;
        if (!command) return { error: 'Parameter command is required.' };
        return this.terminalManager.startSession(command, session_id, this.workingDir);
      }

      case 'send_terminal_input': {
        const { session_id, input } = args;
        if (!session_id || input === undefined) return { error: 'Parameters session_id and input are required.' };
        return this.terminalManager.sendInput(session_id, input);
      }

      case 'read_terminal_output': {
        const { session_id, tail_lines } = args;
        if (!session_id) return { error: 'Parameter session_id is required.' };
        return this.terminalManager.readOutput(session_id, tail_lines || 50);
      }

      case 'list_terminal_sessions': {
        return { sessions: this.terminalManager.listSessions() };
      }

      case 'terminate_terminal_session': {
        const { session_id } = args;
        if (!session_id) return { error: 'Parameter session_id is required.' };
        return this.terminalManager.terminateSession(session_id);
      }

      case 'get_document_symbols': {
        if (!args.relative_path) return { error: 'Parameter relative_path is required.' };
        return this.lspManager.getDocumentSymbols(args.relative_path);
      }

      case 'go_to_definition': {
        const { relative_path, line, character } = args;
        if (!relative_path || line === undefined || character === undefined) {
          return { error: 'Parameters relative_path, line, and character are required.' };
        }
        return this.lspManager.getDefinition(relative_path, line, character);
      }

      case 'find_symbol_references': {
        const { relative_path, line, character } = args;
        if (!relative_path || line === undefined || character === undefined) {
          return { error: 'Parameters relative_path, line, and character are required.' };
        }
        return this.lspManager.findReferences(relative_path, line, character);
      }

      case 'get_code_diagnostics': {
        return this.lspManager.getDiagnostics(args.relative_path);
      }

      case 'get_type_hover': {
        const { relative_path, line, character } = args;
        if (!relative_path || line === undefined || character === undefined) {
          return { error: 'Parameters relative_path, line, and character are required.' };
        }
        return this.lspManager.getHover(relative_path, line, character);
      }

      case 'map_module_dependencies': {
        if (!args.relative_path) return { error: 'Parameter relative_path is required.' };
        return this.lspManager.getModuleDependencies(args.relative_path);
      }

      default:
        return { error: `Unknown tool "${name}".` };
    }
  }

  public async executeCommand(command: string): Promise<{ command: string; stdout: string; stderr: string; exitCode: number; error?: string }> {
    return new Promise((resolve) => {
      exec(command, { cwd: this.workingDir, timeout: 15000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        const cleanStdout = stripAnsiCodes(stdout || '').trim();
        const cleanStderr = stripAnsiCodes(stderr || '').trim();
        if (err) {
          resolve({
            command,
            stdout: cleanStdout,
            stderr: cleanStderr,
            exitCode: err.code ?? 1,
            error: err.message,
          });
        } else {
          resolve({
            command,
            stdout: cleanStdout,
            stderr: cleanStderr,
            exitCode: 0,
          });
        }
      });
    });
  }
}
