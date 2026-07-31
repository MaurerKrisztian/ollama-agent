export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  timestamp: number;
  displayContent?: string;
  attachments?: TextAttachment[];
}

export interface TextAttachment {
  name: string;
  content: string;
  size: number;
  type?: string;
}
export interface ToolParameter {
  type: string;
  description: string;
  enum?: string[];
  items?: {
    type: string;
    properties?: Record<string, ToolParameter>;
    required?: string[];
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

export interface ToolResult {
  tool_call_id: string;
  name: string;
  result: any;
  error?: string;
}

export interface LspSymbolInformation {
  name: string;
  kind: string;
  containerName?: string;
  line: number;
  character: number;
  endLine?: number;
  endCharacter?: number;
}

export interface LspLocation {
  filePath: string;
  line: number;
  character: number;
  preview?: string;
}

export interface LspDiagnosticItem {
  filePath: string;
  line: number;
  character: number;
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  code?: string | number;
}

export interface LspHoverInformation {
  contents: string;
  line: number;
  character: number;
}

export interface ContextPruningConfig {
  enabled: boolean;
  pruneSupersededReads: boolean;
  invalidateOnMutation: boolean;
  enableToolTTL: boolean;
  terminalOutputTTLTurns?: number;
  webOutputTTLTurns?: number;
}

export type ToolComplexityProfile = 'simple' | 'medium' | 'advanced';

export interface AgentConfig {
  ollamaHost: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  workingDir: string;
  showWorkingDirInfo: boolean;
  contextWindow?: number;
  maxLoops?: number;
  complexityProfile?: ToolComplexityProfile;
  pruningConfig?: ContextPruningConfig;
}

export interface ContextInfo {
  totalMessages: number;
  charCount: number;
  estimatedTokens: number;
  formattedText: string;
  rawJson: string;
}

export interface OllamaModelInfo {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    format?: string;
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
}

export interface OllamaRunningModelInfo {
  name: string;
  model: string;
  size: number;
  size_vram: number;
  expires_at: string;
  details?: {
    format?: string;
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
}

export interface TerminalSessionInfo {
  sessionId: string;
  command: string;
  pid: number | undefined;
  status: 'running' | 'exited';
  exitCode: number | null;
  startedAt: string;
  workingDir: string;
  lineCount: number;
}

export interface TerminalSessionOutput {
  sessionId: string;
  command: string;
  status: 'running' | 'exited';
  exitCode: number | null;
  lines: string[];
  lineCount: number;
}
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
  if (/web search failed|web page read failed|private network/i.test(text)) {
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
