export interface ContextPruningConfig {
  enabled: boolean;
  pruneSupersededReads: boolean;
  invalidateOnMutation: boolean;
  enableToolTTL: boolean;
  terminalOutputTTLTurns?: number;
  webOutputTTLTurns?: number;
}

export interface AgentConfig {
  ollamaHost: string;
  model: string;
  classifierModel?: string;
  temperature: number;
  systemPrompt: string;
  workingDir: string;
  showWorkingDirInfo: boolean;
  contextWindow?: number;
  maxLoops?: number;
  terminalMode?: 'confirm' | 'auto';
  fileEditMode?: 'confirm' | 'auto' | 'batch';
  allowedCommands?: string[];
  preventRepeatedCalls?: boolean;
  ollamaTokenConfigured?: boolean;
  pruningConfig?: ContextPruningConfig;
  enableThinking?: boolean;
  supportsThinking?: boolean;
  effectiveThinking?: boolean;
  supportsNativeTools?: boolean;
  toolMode?: 'native' | 'prompt_fallback';
  complexityProfile?: ToolComplexityProfile;
  enabledTools?: Record<string, boolean>;
  terminalGuiMode?: boolean;
  customTerminalCmd?: string;
  topP?: number;
  topK?: number;
  minP?: number;
  repeatPenalty?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  seed?: number;
  numPredict?: number;
  stop?: string[];
  keepAlive?: string | number;
  numGpu?: number;
  numThread?: number;
  ollamaNumParallel?: number;
  ollamaFlashAttention?: boolean;
  ollamaMaxLoadedModels?: number;
  ollamaModelsPath?: string;
  lowVram?: boolean;
  f16Kv?: boolean;
  mirostat?: number;
  mirostatEta?: number;
  mirostatTau?: number;
  ollamaOrigins?: string;
  ollamaLoadTimeout?: string;
}

export type ToolComplexityProfile = 'simple' | 'medium' | 'advanced';

export interface ToolSettings {
  terminalMode: 'confirm' | 'auto';
  fileEditMode: 'confirm' | 'auto' | 'batch';
  allowedCommands?: string[];
  maxLoops?: number;
  complexityProfile?: ToolComplexityProfile;
  enableThinking?: boolean;
  supportsThinking?: boolean;
  effectiveThinking?: boolean;
  preventRepeatedCalls?: boolean;
  terminalGuiMode?: boolean;
  customTerminalCmd?: string;
  enabledTools: {
    list_directory: boolean;
    read_file: boolean;
    edit_file: boolean;
    replace_file: boolean;
    create_file: boolean;
    grep_search: boolean;
    grep_replace?: boolean;
    apply_patch?: boolean;
    execute_command: boolean;
    web_search: boolean;
    read_web_page: boolean;
    deep_research: boolean;
    get_working_directory?: boolean;
    set_working_directory?: boolean;
    start_terminal_session?: boolean;
    send_terminal_input?: boolean;
    read_terminal_output?: boolean;
    list_terminal_sessions?: boolean;
    terminate_terminal_session?: boolean;
    get_document_symbols?: boolean;
    go_to_definition?: boolean;
    find_symbol_references?: boolean;
    get_code_diagnostics?: boolean;
    get_type_hover?: boolean;
    map_module_dependencies?: boolean;
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

/** Ollama may report an implicit default tag as `:latest` in /api/ps. */
export const normalizeOllamaModelName = (name: string): string =>
  name.trim().toLowerCase().replace(/:latest$/i, '');

export const ollamaModelNamesMatch = (left: string | undefined, right: string | undefined): boolean =>
  Boolean(left && right && normalizeOllamaModelName(left) === normalizeOllamaModelName(right));

export interface ImageAttachment {
  name: string;
  type: string;
  base64: string;
  size: number;
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
  images?: string[];
  imageAttachments?: ImageAttachment[];
  thinking?: string;
  thinkingTokens?: number;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
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

export interface BatchReviewFile {
  path: string;
  before: string | null;
  after: string | null;
  revert: boolean;
}

export interface CheckpointFileSnapshot {
  path: string;
  before: string | null; // null = file did not exist before this prompt
}

export interface CheckpointEntry {
  promptId: string;
  promptText: string;
  timestamp: number;
  sessionId: string;
  snapshots: CheckpointFileSnapshot[];
  snapshotPaths?: string[];
}

export interface TerminalInputHistoryItem {
  input: string;
  timestamp: string;
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
  inputs?: TerminalInputHistoryItem[];
  guiMode?: boolean;
}

export interface TerminalSessionOutput {
  sessionId: string;
  command: string;
  status: 'running' | 'exited';
  exitCode: number | null;
  lines: string[];
  lineCount: number;
  inputs?: TerminalInputHistoryItem[];
  guiMode?: boolean;
}

export interface BenchmarkSnapshot {
  id?: string;
  timestamp: string | number;
  agentConfig?: Partial<AgentConfig>;
  summary?: {
    total: number;
    passed: number;
    failed: number;
    durationMs: number;
  };
  results?: Array<{
    caseId: string;
    passed: boolean;
    error?: string;
    durationMs?: number;
  }>;
}
