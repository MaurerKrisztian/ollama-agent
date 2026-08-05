import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import type { BenchmarkTestCase } from '../cases/index.js';
import type { DirectoryEntriesSpec, EvaluationResult, FileStateSpec, JsonValueSpec, ResponseSpec } from '../types.js';

const execAsync = promisify(exec);

export function evaluateResponseSpec(
  responseContent: string,
  spec: ResponseSpec
): EvaluationResult {
  const contentLower = responseContent.toLowerCase();

  if (spec.exactMatch !== undefined && responseContent.trim() !== spec.exactMatch.trim()) {
    return { passed: false, reason: `Final answer did not match exact expected text.` };
  }

  if (spec.regex) {
    try {
      const re = new RegExp(spec.regex, 'i');
      if (!re.test(responseContent)) {
        return { passed: false, reason: `Final answer did not match expected regex pattern: /${spec.regex}/i.` };
      }
    } catch (err: any) {
      return { passed: false, reason: `Invalid regex pattern in benchmark specification: ${err.message}` };
    }
  }

  for (const sub of spec.containsSubstrings ?? []) {
    if (!contentLower.includes(sub.toLowerCase())) {
      return { passed: false, reason: `Final answer was missing expected content: "${sub}".` };
    }
  }

  for (const sub of spec.excludesSubstrings ?? []) {
    if (contentLower.includes(sub.toLowerCase())) {
      return { passed: false, reason: `Final answer contained forbidden content: "${sub}".` };
    }
  }

  return { passed: true, reason: 'Final answer satisfied all response criteria.' };
}

export async function evaluateScriptVerification(
  workingDir: string,
  script: string
): Promise<EvaluationResult> {
  try {
    const { stdout, stderr } = await execAsync(script, { cwd: workingDir, timeout: 15000 });
    return {
      passed: true,
      reason: 'Verification script exited successfully.',
      details: { stdout: stdout.trim(), stderr: stderr.trim() },
    };
  } catch (err: any) {
    return {
      passed: false,
      reason: `Verification script failed: ${err.message || 'exit code was non-zero'}`,
      details: { stdout: err.stdout?.trim(), stderr: err.stderr?.trim() },
    };
  }
}

export async function evaluateFileState(
  workingDir: string,
  specs: FileStateSpec[]
): Promise<EvaluationResult> {
  for (const spec of specs) {
    const filePath = path.join(workingDir, spec.relativePath);
    try {
      const stats = await fs.stat(filePath);
      if (spec.mustExist === false) {
        return { passed: false, reason: `"${spec.relativePath}" should not exist, but it does.` };
      }
      if (!stats.isFile()) {
        return { passed: false, reason: `"${spec.relativePath}" exists but is not a file.` };
      }

      if (spec.containsSubstrings || spec.excludesSubstrings || spec.exactMatch !== undefined) {
        const content = await fs.readFile(filePath, 'utf8');
        if (spec.exactMatch !== undefined && content !== spec.exactMatch) {
          return { passed: false, reason: `"${spec.relativePath}" did not exactly match the expected content.` };
        }
        for (const sub of spec.containsSubstrings ?? []) {
          if (!content.includes(sub)) {
            return { passed: false, reason: `"${spec.relativePath}" is missing expected content: "${sub}".` };
          }
        }
        for (const sub of spec.excludesSubstrings ?? []) {
          if (content.includes(sub)) {
            return { passed: false, reason: `"${spec.relativePath}" still contains forbidden content: "${sub}".` };
          }
        }
      }
    } catch (_) {
      if (spec.mustExist !== false) {
        return { passed: false, reason: `"${spec.relativePath}" was not found in the final workspace.` };
      }
    }
  }
  return { passed: true, reason: 'Final file state matched the expected outcome.' };
}

export async function evaluateJsonValues(
  workingDir: string,
  spec: JsonValueSpec
): Promise<EvaluationResult> {
  try {
    const parsed = JSON.parse(await fs.readFile(path.join(workingDir, spec.relativePath), 'utf8'));
    for (const [key, expected] of Object.entries(spec.values)) {
      if (parsed[key] !== expected) {
        return {
          passed: false,
          reason: `JSON outcome mismatch in "${spec.relativePath}": ${key} expected ${JSON.stringify(expected)}, got ${JSON.stringify(parsed[key])}.`,
        };
      }
    }
    return { passed: true, reason: `Final JSON values in "${spec.relativePath}" matched.` };
  } catch (err: any) {
    return { passed: false, reason: `Could not verify JSON outcome for "${spec.relativePath}": ${err.message}` };
  }
}

async function evaluateDirectoryEntries(
  workingDir: string,
  specs: DirectoryEntriesSpec[],
  responseContent: string
): Promise<EvaluationResult> {
  const normalizedResponse = responseContent.replaceAll('\\', '/').toLowerCase();
  for (const spec of specs) {
    const actualEntries = (await fs.readdir(path.join(workingDir, spec.relativePath))).sort();
    const expectedEntries = [...spec.entries].sort();
    if (spec.exact !== false && JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)) {
      return {
        passed: false,
        reason: `Benchmark fixture mismatch for "${spec.relativePath}": expected [${expectedEntries.join(', ')}], found [${actualEntries.join(', ')}].`,
      };
    }
    const missing = expectedEntries.filter((entry) => !normalizedResponse.includes(entry.toLowerCase()));
    if (missing.length > 0) {
      return { passed: false, reason: `Final answer omitted directory entries: ${missing.join(', ')}.` };
    }
  }
  return { passed: true, reason: 'Final answer reported the expected directory entries.' };
}

export async function evaluateBenchmarkTask(
  testCase: BenchmarkTestCase,
  workingDir: string,
  actualToolsCalled: Array<{ name: string; args: Record<string, any> }>,
  responseContent: string,
  toolResults: Array<{ name: string; result: any }> = []
): Promise<EvaluationResult> {
  const checks: Array<{ name: string; result: EvaluationResult }> = [];

  if (testCase.expectedToolSequence?.length) {
    const actualNames = actualToolsCalled.map((t) => t.name);
    const expectedSeq = testCase.expectedToolSequence;
    let seqIdx = 0;
    for (const tool of actualNames) {
      if (seqIdx < expectedSeq.length && tool === expectedSeq[seqIdx]) {
        seqIdx++;
      }
    }
    checks.push({
      name: 'tool_sequence',
      result: seqIdx === expectedSeq.length
        ? { passed: true, reason: `Tool sequence matched: ${expectedSeq.join(' -> ')}.` }
        : { passed: false, reason: `Tool sequence mismatch. Expected [${expectedSeq.join(', ')}], but only found [${actualNames.join(', ')}].` },
    });
  }

  if (testCase.verifierScriptPath) {
    const verifierCmd = testCase.verifierScriptPath.endsWith('.js')
      ? `node /benchmark-verifiers/${testCase.verifierScriptPath} "${workingDir}"`
      : `bash /benchmark-verifiers/${testCase.verifierScriptPath} "${workingDir}"`;
    checks.push({ name: 'verifier_script_path', result: await evaluateScriptVerification(workingDir, verifierCmd) });
  }

  if (testCase.verificationScript) {
    checks.push({ name: 'verification_script', result: await evaluateScriptVerification(workingDir, testCase.verificationScript) });
  }
  if (testCase.expectedFileJson) {
    checks.push({ name: 'json_values', result: await evaluateJsonValues(workingDir, testCase.expectedFileJson) });
  }
  if (testCase.expectedFileState) {
    checks.push({ name: 'file_state', result: await evaluateFileState(workingDir, testCase.expectedFileState) });
  }
  if (testCase.expectedDirectoryEntries) {
    checks.push({
      name: 'directory_entries',
      result: await evaluateDirectoryEntries(workingDir, testCase.expectedDirectoryEntries, responseContent),
    });
  }
  if (testCase.expectedResponseSpec) {
    checks.push({
      name: 'response_content',
      result: evaluateResponseSpec(responseContent, testCase.expectedResponseSpec),
    });
  } else if (testCase.expectedResponseSubstrings?.length) {
    checks.push({
      name: 'response_content',
      result: evaluateResponseSpec(responseContent, { containsSubstrings: testCase.expectedResponseSubstrings }),
    });
  }
  if (testCase.expectedToolResults?.length) {
    const serializedResults = toolResults.map(({ result }) =>
      typeof result === 'string' ? result : JSON.stringify(result)
    ).join('\n').toLowerCase();
    for (const spec of testCase.expectedToolResults) {
      const missing = spec.containsSubstrings.filter((sub) => !serializedResults.includes(sub.toLowerCase()));
      checks.push({
        name: 'tool_result',
        result: missing.length === 0
          ? { passed: true, reason: 'Executed tool results contained the required observable output.' }
          : { passed: false, reason: `Executed tool results were missing: ${missing.join(', ')}.` },
      });
    }
  }

  if (checks.length === 0) {
    return {
      passed: false,
      reason: 'Invalid benchmark definition: no outcome verifier is configured.',
      details: { checks: [] },
    };
  }

  const failed = checks.find((check) => !check.result.passed);
  return {
    passed: !failed,
    reason: failed?.result.reason ?? `Outcome verified by: ${checks.map((check) => check.name).join(', ')}.`,
    details: {
      checks: checks.map(({ name, result }) => ({ name, passed: result.passed, reason: result.reason })),
      toolTraceUsedForScoring: false,
    },
  };
}
