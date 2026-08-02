import type { BenchmarkDefinition, BenchmarkTestCase } from './types.js';

export const QUICK_BENCHMARK_TEST_IDS = [
  'test_list_root_directory',
  'test_read_profile_file',
  'test_create_file',
  'test_edit_package_version_after_read',
  'test_edit_multiline_function_body',
  'test_grep_symbol_search',
  'test_no_tool_discrimination',
  'test_workflow_search_read_refactor',
  'test_terminal_multi_step',
  'test_retrieval_long_file',
  'test_project_context_reads_relevant_skill',
  'test_web_search_then_read_page',
  'test_dragonball_easy_goku_saiyan_name',
  'test_ast_document_symbols',
] as const;

export function createPresetBenchmarkDefinitions(
  testCases: readonly BenchmarkTestCase[],
): BenchmarkDefinition[] {
  const availableIds = new Set(testCases.map((testCase) => testCase.id));
  const missingQuickIds = QUICK_BENCHMARK_TEST_IDS.filter((id) => !availableIds.has(id));
  if (missingQuickIds.length) {
    throw new Error(`Quick benchmark references missing tests: ${missingQuickIds.join(', ')}`);
  }

  return [
    {
      id: 'quick',
      name: 'Quick Benchmark',
      description: 'A representative smoke benchmark covering every major agent capability.',
      type: 'preset',
      version: 1,
      testIds: [...QUICK_BENCHMARK_TEST_IDS],
    },
    {
      id: 'comprehensive',
      name: 'Comprehensive Benchmark',
      description: 'The complete benchmark catalog for thorough model evaluation.',
      type: 'preset',
      version: 1,
      testIds: testCases.map((testCase) => testCase.id),
    },
  ];
}

export function createBenchmarkSuiteHash(testIds: readonly string[]): string {
  let hash = 0x811c9dc5;
  for (const character of testIds.join('\u001f')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
