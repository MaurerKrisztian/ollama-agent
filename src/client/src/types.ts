export interface AgentConfig {
  ollamaHost: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  workingDir: string;
  ollamaTokenConfigured?: boolean;
}

export interface ToolSettings {
  terminalMode: 'confirm' | 'auto';
  fileEditMode: 'confirm' | 'auto';
  enabledTools: {
    list_directory: boolean;
    read_file: boolean;
    edit_file: boolean;
    create_file: boolean;
    grep_search: boolean;
    execute_command: boolean;
  };
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
}
