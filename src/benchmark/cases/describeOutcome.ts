import type { FileStateSpec } from '../types.js';
import type { BenchmarkTestCaseDefinition } from './types.js';

function describeFileState(spec: FileStateSpec): string {
  if (spec.mustExist === false) return `"${spec.relativePath}" must not exist`;
  const requirements = [`"${spec.relativePath}" must exist`];
  if (spec.exactMatch !== undefined) requirements.push('its content must exactly match the expected text');
  if (spec.containsSubstrings?.length) {
    requirements.push(`it must contain ${spec.containsSubstrings.map((value) => JSON.stringify(value)).join(', ')}`);
  }
  if (spec.excludesSubstrings?.length) {
    requirements.push(`it must not contain ${spec.excludesSubstrings.map((value) => JSON.stringify(value)).join(', ')}`);
  }
  return requirements.join('; ');
}

export function describeBenchmarkOutcome(testCase: BenchmarkTestCaseDefinition): {
  requiredOutput: string;
  evaluationCriteria: string;
} {
  const requirements: string[] = [];
  for (const spec of testCase.expectedDirectoryEntries ?? []) {
    requirements.push(`The final answer must report every expected entry in "${spec.relativePath}": ${spec.entries.join(', ')}`);
  }
  if (testCase.expectedResponseSubstrings?.length) {
    requirements.push(`The final answer must contain: ${testCase.expectedResponseSubstrings.map((value) => JSON.stringify(value)).join(', ')}`);
  }
  if (testCase.expectedFileJson) {
    requirements.push(
      `The final "${testCase.expectedFileJson.relativePath}" JSON must contain: ${Object.entries(testCase.expectedFileJson.values)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(', ')}`
    );
  }
  for (const spec of testCase.expectedFileState ?? []) requirements.push(describeFileState(spec));
  for (const spec of testCase.expectedToolResults ?? []) {
    requirements.push(`The executed tool output must contain: ${spec.containsSubstrings.map((value) => JSON.stringify(value)).join(', ')}`);
  }
  if (testCase.verificationScript) requirements.push('The configured verification script must exit successfully');

  const requiredOutput = requirements.length > 0
    ? requirements.map((requirement, index) => `${index + 1}. ${requirement}.`).join(' ')
    : 'No outcome verifier is configured.';
  const evaluationCriteria = requirements.length > 0
    ? `PASSES only when ${requirements.length === 1 ? 'the configured outcome check succeeds' : `all ${requirements.length} configured outcome checks succeed`}. Tool calls and results remain available in the execution trace, but the chosen tool name does not determine the verdict.`
    : 'FAILS because this benchmark has no observable outcome verifier.';
  return { requiredOutput, evaluationCriteria };
}
