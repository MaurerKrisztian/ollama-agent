import type { DirectoryEntriesSpec, FileStateSpec, ToolResultSpec } from '../types.js';

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
  | 'ast_lsp_navigation';

export interface BenchmarkTestCaseDefinition {
  id: string;
  name: string;
  category: BenchmarkCategory;
  prompt: string;
  expectedTool?: string | null;
  expectedToolSequence?: string[];
  expectedArgSubstrings?: Record<string, string>;
  expectedResponseSubstrings?: string[];
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
