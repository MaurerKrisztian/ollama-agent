export interface AgentConfig {
  ollamaHost: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  workingDir: string;
  showWorkingDirInfo: boolean;
  maxLoops?: number;
  ollamaTokenConfigured?: boolean;
}

export interface ToolSettings {
  terminalMode: 'confirm' | 'auto';
  fileEditMode: 'confirm' | 'auto';
  maxLoops?: number;
  enabledTools: {
    list_directory: boolean;
    read_file: boolean;
    edit_file: boolean;
    replace_file: boolean;
    create_file: boolean;
    grep_search: boolean;
    execute_command: boolean;
    web_search: boolean;
    read_web_page: boolean;
  };
}

export interface SystemMetrics {
  cpu: {
    utilization: number;
    cores: number;
  };
  memory: {
    usedGb: number;
    totalGb: number;
    utilization: number;
  };
  gpu?: {
    name: string;
    gpuUtil: number;
    memUtil: number;
    memUsedMb: number;
    memTotalMb: number;
  } | null;
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

export interface ChatMessage {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
  }>;
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
export interface FileDiffData {
  path: string;
  oldPath: string;
  newPath: string;
  lines: Array<{
    type: 'context' | 'add' | 'remove' | 'meta';
    content: string;
    oldLine?: number;
    newLine?: number;
  }>;
  truncated?: boolean;
}

export interface PendingApprovalCall {
  name: string;
  args: Record<string, any>;
  diff?: FileDiffData;
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
