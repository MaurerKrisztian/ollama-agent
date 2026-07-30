import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { buildWorkingDirectoryContext } from '../core/workdir-context.js';
import { setupMockEnvironment } from './mockEnv.js';
import { BENCHMARK_TEST_CASES } from './testCases.js';

test('project-context benchmark fixtures advertise skill metadata without full instructions', async () => {
  const mockDir = await setupMockEnvironment();
  const context = await buildWorkingDirectoryContext(mockDir);

  assert.match(context, /required verification command is `npm run fixture-check`/);
  assert.match(context, /release-helper: Use when preparing a version release or release checklist\./);
  assert.match(context, /\.agent\/skills\/release-helper\/SKILL\.md/);
  assert.match(context, /theme-stylist: Use only for UI theme, color palette, and visual styling work\./);
  assert.doesNotMatch(context, /SAPPHIRE-CHECK-42/);

  const skill = await fs.readFile(
    path.join(mockDir, '.agent', 'skills', 'release-helper', 'SKILL.md'),
    'utf8'
  );
  assert.match(skill, /SAPPHIRE-CHECK-42/);
});

test('project-context benchmarks cover relevant and irrelevant skill selection', () => {
  const cases = BENCHMARK_TEST_CASES.filter((testCase) => testCase.category === 'project_context');
  assert.equal(cases.length, 3);
  assert.ok(cases.every((testCase) => testCase.enableProjectContext));

  const relevant = cases.find((testCase) => testCase.id === 'test_project_context_reads_relevant_skill');
  assert.equal(relevant?.expectedTool, 'read_file');
  assert.match(relevant?.expectedArgSubstrings?.relative_path || '', /release-helper\/SKILL\.md/);
  assert.ok(relevant?.forbiddenToolCalls?.some((call) => call.substring.includes('theme-stylist')));

  const irrelevant = cases.find((testCase) => testCase.id === 'test_project_context_skips_irrelevant_skills');
  assert.equal(irrelevant?.expectedTool, null);

  const instructions = cases.find((testCase) => testCase.id === 'test_project_context_agents_instructions');
  assert.equal(instructions?.expectedTool, null);
  assert.match(instructions?.prompt || '', /information question/i);
  assert.match(instructions?.prompt || '', /not a request to execute/i);
});
