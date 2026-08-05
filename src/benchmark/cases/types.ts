import type { DirectoryEntriesSpec, FileStateSpec, ResponseSpec, ToolResultSpec } from '../types.js';

export type BenchmarkCategory =
  | 'directory_reading'
  | 'file_reading'
  | 'file_creation'
  | 'file_editing'
  | 'code_editing'
  | 'code_search'
  | 'discrimination'
  | 'multi_step_workflow'
  | 'terminal_execution'
  | 'information_retrieval'
  | 'project_context'
  | 'web_search'
  | 'real_web_search'
  | 'ast_lsp_navigation'
  | 'examples';

export interface MultiStepPrompt {
  stepId?: string;
  prompt: string;
  description?: string;
  objective?: string;
  expectedFileState?: FileStateSpec[];
  expectedFileJson?: {
    relativePath: string;
    values: Record<string, string | number | boolean | null>;
  };
  expectedDirectoryEntries?: DirectoryEntriesSpec[];
  expectedResponseSubstrings?: string[];
  expectedResponseSpec?: ResponseSpec;
  expectedToolResults?: ToolResultSpec[];
  verificationScript?: string;
}

export interface BenchmarkRepositorySpec {
  url: string;
  commit?: string;
  tag?: string;
  branch?: string;
  installCommand?: string;
}

export interface BenchmarkTestCaseDefinition {
  id: string;
  name: string;
  category: BenchmarkCategory;
  prompt: string;
  prompts?: Array<string | MultiStepPrompt>;
  difficulty?: 'easy' | 'medium' | 'hard';
  multiStepPrompts?: MultiStepPrompt[];
  repository?: BenchmarkRepositorySpec;
  expectedTool?: string | null;
  expectedToolSequence?: string[];
  expectedArgSubstrings?: Record<string, string>;
  expectedResponseSubstrings?: string[];
  expectedResponseSpec?: ResponseSpec;
  enableProjectContext?: boolean;
  forbiddenToolCalls?: Array<{
    name: string;
    argument: string;
    substring: string;
  }>;
  expectedFileJson?: {
    relativePath: string;
    values: Record<string, string | number | boolean | null>;
  };
  expectedFileState?: FileStateSpec[];
  expectedDirectoryEntries?: DirectoryEntriesSpec[];
  expectedToolResults?: ToolResultSpec[];
  verificationScript?: string;
  fixture?: string;
  verifierScriptPath?: string;
  description: string;
  objective: string;
  requiredOutput?: string;
  evaluationCriteria?: string;
}

export interface BenchmarkTestCase extends BenchmarkTestCaseDefinition {
  requiredOutput: string;
  evaluationCriteria: string;
}

export type BenchmarkDefinitionType = 'preset' | 'custom';

export interface BenchmarkDefinition {
  id: string;
  name: string;
  description: string;
  type: BenchmarkDefinitionType;
  version: number;
  testIds: string[];
  createdAt?: string;
  updatedAt?: string;
}

export function defineBenchmarkCases(
  definitions: readonly BenchmarkTestCaseDefinition[],
): readonly BenchmarkTestCaseDefinition[] {
  return definitions;
}
