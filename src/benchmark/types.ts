import type { ContextPruningConfig } from '../core/types.js';

export type VerificationStrategy =
  | 'script'
  | 'file_state'
  | 'json_values'
  | 'response_content'
  | 'directory_entries'
  | 'tool_result';

export interface FileStateSpec {
  relativePath: string;
  mustExist?: boolean;
  containsSubstrings?: string[];
  excludesSubstrings?: string[];
  exactMatch?: string;
}

export interface DirectoryEntriesSpec {
  relativePath: string;
  entries: string[];
  exact?: boolean;
}

export interface ToolResultSpec {
  containsSubstrings: string[];
}

export interface BenchmarkAgentConfig {
  temperature?: number;
  systemPrompt?: string;
  showWorkingDirInfo?: boolean;
  contextWindow?: number;
  maxLoops?: number;
  enableThinking?: boolean;
  complexityProfile?: 'simple' | 'medium' | 'advanced';
  pruningConfig?: ContextPruningConfig;
}

export interface JsonValueSpec {
  relativePath: string;
  values: Record<string, string | number | boolean | null>;
}

export interface VerificationSpec {
  strategy?: VerificationStrategy;
  verificationScript?: string; // Bash script content or path to run in working dir
  fileStates?: FileStateSpec[];
  jsonValues?: JsonValueSpec;
}

export interface EvaluationResult {
  passed: boolean;
  reason: string;
  details?: Record<string, any>;
}

export interface TestResultTrace {
  testId: string;
  testName: string;
  category: string;
  prompt: string;
  expectedTool: string | null;
  expectedToolSequence?: string[];
  actualToolsCalled: Array<{ name: string; args: Record<string, any> }>;
  toolResults: Array<{ name: string; result: any }>;
  executionTrace: Array<{
    sequence: number;
    timestamp: number;
    type: 'assistant_message' | 'tool_start' | 'tool_end';
    name?: string;
    args?: Record<string, any>;
    result?: any;
    content?: string;
    thinking?: string;
  }>;
  passed: boolean;
  reason: string;
  durationMs: number;
  responseContent: string;
  objective: string;
  requiredOutput: string;
  evaluationCriteria: string;
  verificationDetails?: EvaluationResult;
  container: {
    image: string;
    isolated: boolean;
    workspace: string;
  };
  agentConfig: BenchmarkAgentConfig & {
    model: string;
    ollamaHost: string;
  };
}

export interface BenchmarkReport {
  timestamp: number;
  model: string;
  mockWorkingDir: string;
  totalTests: number;
  passCount: number;
  failCount: number;
  accuracyPercentage: number;
  totalDurationMs: number;
  results: TestResultTrace[];
}
