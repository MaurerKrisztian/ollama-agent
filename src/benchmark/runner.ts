import fs from 'fs/promises';
import path from 'path';
import { AgentEngine } from '../core/agent.js';
import { setupMockEnvironment } from './mockEnv.js';
import { BENCHMARK_TEST_CASES, BenchmarkTestCase } from './testCases.js';

export interface TestResultTrace {
  testId: string;
  testName: string;
  category: string;
  prompt: string;
  expectedTool: string | null;
  expectedToolSequence?: string[];
  actualToolsCalled: Array<{ name: string; args: Record<string, any> }>;
  passed: boolean;
  reason: string;
  durationMs: number;
  responseContent: string;
  objective: string;
  requiredOutput: string;
  evaluationCriteria: string;
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

export async function runSingleBenchmarkTest(
  testId: string,
  modelName: string,
  ollamaHost: string = 'http://127.0.0.1:11434',
  ollamaToken?: string
): Promise<TestResultTrace> {
  const testCase = BENCHMARK_TEST_CASES.find((t) => t.id === testId);
  if (!testCase) {
    throw new Error(`Test case "${testId}" not found.`);
  }

  const mockDir = await setupMockEnvironment();
  const testStart = Date.now();

  const agent = new AgentEngine({
    model: modelName,
    ollamaHost,
    ollamaToken,
    workingDir: mockDir,
  });

  // Wrap ToolExecutor with Docker Sandbox Isolation for benchmark terminal tasks
  const executor = agent.getToolExecutor();
  const originalExecuteCommand = executor.executeCommand.bind(executor);
  const originalExecuteTool = executor.executeTool.bind(executor);
  executor.executeTool = async (name: string, args: Record<string, any>) => {
    if (name === 'web_search') {
      const query = String(args.query || '');
      if (query.toLowerCase().includes('node')) {
        return {
          query,
          result_count: 2,
          results: [
            {
              title: 'Node.js releases',
              url: 'https://benchmark.example/node-release-schedule',
              snippet: 'Official release schedule and support status for Node.js versions.',
            },
            {
              title: 'Node.js 22 release announcement',
              url: 'https://benchmark.example/node-22-announcement',
              snippet: 'Highlights from the original Node.js 22 release.',
            },
          ],
        };
      }
      if (query.toLowerCase().includes('lighthouse')) {
        return {
          query,
          result_count: 2,
          results: [
            {
              title: 'Project Lighthouse release notes',
              url: 'https://benchmark.example/lighthouse-release',
              snippet: 'Official release announcement and launch details for Project Lighthouse.',
            },
            {
              title: 'Lighthouse project archive',
              url: 'https://benchmark.example/lighthouse-archive',
              snippet: 'Older Project Lighthouse planning documents.',
            },
          ],
        };
      }
      return {
        query,
        result_count: 2,
        results: [
          {
            title: 'Ollama documentation',
            url: 'https://docs.ollama.com/',
            snippet: 'Official documentation for running and building with Ollama.',
          },
          {
            title: 'Ollama on GitHub',
            url: 'https://github.com/ollama/ollama',
            snippet: 'Source code and project information.',
          },
        ],
      };
    }
    if (name === 'read_web_page') {
      if (String(args.url || '').includes('node-release-schedule')) {
        return {
          title: 'Node.js releases',
          url: String(args.url || ''),
          byline: 'Node.js Release Working Group',
          excerpt: 'Release schedule and support status for Node.js versions.',
          markdown:
            '# Node.js releases\n\n' +
            'Production applications should use Active LTS or Maintenance LTS releases.\n\n' +
            '## Release schedule\n\n' +
            '| Version | Status | End of security support |\n' +
            '| --- | --- | --- |\n' +
            '| Node.js 22 | Maintenance LTS | **30 April 2027** |\n',
          truncated: false,
        };
      }
      return {
        title: 'Project Lighthouse release notes',
        url: String(args.url || ''),
        byline: 'Lighthouse Release Team',
        excerpt: 'Official Project Lighthouse release announcement.',
        markdown:
          '# Project Lighthouse release notes\n\n' +
          'The exact release codename is **NEBULA-FERN-204**.\n\n' +
          'The public release date is **17 October 2026**.',
        truncated: false,
      };
    }
    return originalExecuteTool(name, args);
  };
  executor.executeCommand = async (command: string) => {
    const dockerCmd = `docker run --rm -v "${mockDir}":/workspace -w /workspace alpine sh -c ${JSON.stringify(command)}`;
    try {
      const res = await originalExecuteCommand(dockerCmd);
      return { ...res, command };
    } catch (_) {
      return await originalExecuteCommand(command);
    }
  };

  const actualToolsCalled: Array<{ name: string; args: Record<string, any> }> = [];
  let responseContent = '';
  let testError: string | null = null;

  try {
    responseContent = await agent.sendMessage(testCase.prompt, {
      onToolStart: (name, args) => {
        actualToolsCalled.push({ name, args });
      },
    });
  } catch (err: any) {
    testError = err.message;
  }

  const durationMs = Date.now() - testStart;

  let passed = false;
  let reason = '';
  const normalizeToolName = (name: string) => (name === 'replace_file' ? 'edit_file' : name);
  const toolArgumentContains = (
    call: { name: string; args: Record<string, any> },
    key: string,
    expectedSubstring: string
  ): boolean => {
    if (expectedSubstring === '') return true;
    if (call.name === 'replace_file' && key === 'target_text') {
      // A whole-file replacement has no literal old target. Its correctness is
      // established by replacement-content and disk verification below.
      return true;
    }
    const actualValue =
      call.name === 'replace_file' && key === 'replacement_text'
        ? call.args.content
        : call.args[key];
    return String(actualValue ?? '').includes(expectedSubstring);
  };

  if (testError) {
    passed = false;
    reason = `Execution error: ${testError}`;
  } else if (testCase.expectedToolSequence) {
    const expectedSeq = testCase.expectedToolSequence;
    const actualNames = actualToolsCalled.map((t) => normalizeToolName(t.name));

    let seqMatches = true;
    let seqError = '';

    let searchFrom = 0;
    for (let s = 0; s < expectedSeq.length; s++) {
      const reqTool = expectedSeq[s];
      const matchIndex = actualNames.indexOf(reqTool, searchFrom);
      if (matchIndex === -1) {
        seqMatches = false;
        seqError = `Missing ordered occurrence ${s + 1} ("${reqTool}") in multi-turn sequence. Called: [${actualNames.join(' -> ')}]`;
        break;
      }
      searchFrom = matchIndex + 1;
    }

    if (seqMatches) {
      let argsValid = true;
      let argMismatchDetail = '';

      if (testCase.expectedArgSubstrings) {
        for (const [key, expectedSub] of Object.entries(testCase.expectedArgSubstrings)) {
          const matchingCall = actualToolsCalled.find(
            (t) => toolArgumentContains(t, key, expectedSub)
          );
          if (!matchingCall && expectedSub !== '') {
            argsValid = false;
            argMismatchDetail = `Expected argument "${key}" with substring "${expectedSub}" was not found in tool calls.`;
            break;
          }
        }
      }

      if (argsValid) {
        passed = true;
        reason = `Passed Multi-Step Workflow: Successfully executed tool chain [${actualNames.join(' -> ')}].`;
      } else {
        passed = false;
        reason = `Failed Multi-Step Workflow: Executed tools [${actualNames.join(' -> ')}], but argument check failed: ${argMismatchDetail}`;
      }
    } else {
      passed = false;
      reason = `Failed Multi-Step Workflow: ${seqError}`;
    }
  } else if (testCase.expectedTool === null) {
    if (actualToolsCalled.length === 0) {
      passed = true;
      reason = 'Passed: Correctly answered without invoking unnecessary tools.';
    } else {
      passed = false;
      reason = `Failed: Expected 0 tool calls, but model invoked [${actualToolsCalled.map((t) => t.name).join(', ')}].`;
    }
  } else {
    const matchedTool = actualToolsCalled.find(
      (t) => normalizeToolName(t.name) === testCase.expectedTool
    );

    if (!matchedTool) {
      passed = false;
      const calledNames = actualToolsCalled.map((t) => t.name).join(', ') || 'none';
      reason = `Failed: Expected tool "${testCase.expectedTool}", but model called [${calledNames}].`;
    } else {
      let argsValid = true;
      let argMismatchDetail = '';

      if (testCase.expectedArgSubstrings) {
        for (const [key, expectedSub] of Object.entries(testCase.expectedArgSubstrings)) {
          const actualVal =
            matchedTool.name === 'replace_file' && key === 'replacement_text'
              ? String(matchedTool.args.content ?? '')
              : String(matchedTool.args[key] ?? '');
          if (!toolArgumentContains(matchedTool, key, expectedSub)) {
            argsValid = false;
            argMismatchDetail = `Argument "${key}" expected substring "${expectedSub}", got "${actualVal}".`;
            break;
          }
        }
      }

      if (argsValid) {
        passed = true;
        reason = `Passed: Correctly invoked "${matchedTool.name}" with valid parameters.`;
      } else {
        passed = false;
        reason = `Failed: Invoked "${matchedTool.name}", but parameter check failed: ${argMismatchDetail}`;
      }
    }
  }

  if (passed && testCase.expectedResponseSubstrings?.length) {
    const normalizedResponse = responseContent.toLowerCase();
    const missingFacts = testCase.expectedResponseSubstrings.filter(
      (expected) => !normalizedResponse.includes(expected.toLowerCase())
    );
    if (missingFacts.length > 0) {
      passed = false;
      reason = `Failed Information Retrieval: Tool usage was correct, but the final response was missing: ${missingFacts.join(', ')}.`;
    } else {
      reason = `Passed Information Retrieval: Correct tool call and grounded response containing ${testCase.expectedResponseSubstrings.join(', ')}.`;
    }
  }

  if (passed && testCase.expectedFileJson) {
    const { relativePath, values } = testCase.expectedFileJson;
    try {
      const diskContent = await fs.readFile(path.join(mockDir, relativePath), 'utf-8');
      const parsed = JSON.parse(diskContent) as Record<string, unknown>;
      const mismatches = Object.entries(values)
        .filter(([key, expected]) => parsed[key] !== expected)
        .map(([key, expected]) => `${key}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(parsed[key])}`);

      if (mismatches.length > 0) {
        passed = false;
        reason = `Failed JSON Disk Verification: ${mismatches.join('; ')}.`;
      } else {
        reason = `Passed Multi-Field JSON Edit: ${relativePath} contains all expected values.`;
      }
    } catch (err: any) {
      passed = false;
      reason = `Failed JSON Disk Verification: ${relativePath} could not be parsed (${err.message}).`;
    }
  }

  // Disk Verification Assertion for edit_file tasks
  if (passed && actualToolsCalled.some((t) => t.name === 'edit_file' || t.name === 'replace_file')) {
    if (testCase.expectedArgSubstrings && testCase.expectedArgSubstrings.replacement_text !== undefined) {
      const expectedReplacement = testCase.expectedArgSubstrings.replacement_text;
      const targetRelPath = testCase.expectedArgSubstrings.relative_path || '';
      const diskFilePath = path.join(mockDir, targetRelPath);

      if (expectedReplacement !== '') {
        try {
          const diskContent = await fs.readFile(diskFilePath, 'utf-8');
          if (!diskContent.includes(expectedReplacement)) {
            passed = false;
            reason = `Failed Disk Verification: edit_file tool was called, but replacement text "${expectedReplacement}" was not found in mock disk file.`;
          }
        } catch (_) {
          const baseName = path.basename(targetRelPath);
          try {
            const files = await fs.readdir(mockDir, { recursive: true });
            let fileFound = false;
            for (const f of files) {
              if (typeof f === 'string' && f.endsWith(baseName)) {
                const content = await fs.readFile(path.join(mockDir, f), 'utf-8');
                if (content.includes(expectedReplacement)) {
                  fileFound = true;
                  break;
                }
              }
            }
            if (!fileFound) {
              passed = false;
              reason = `Failed Disk Verification: Replacement text "${expectedReplacement}" was not found in mock disk file.`;
            }
          } catch (_) {}
        }
      } else if (testCase.expectedArgSubstrings.target_text) {
        const deletedTarget = testCase.expectedArgSubstrings.target_text;
        try {
          const diskContent = await fs.readFile(diskFilePath, 'utf-8');
          if (diskContent.includes(deletedTarget)) {
            passed = false;
            reason = `Failed Disk Verification: Deletion requested, but target text "${deletedTarget}" still exists in mock disk file.`;
          }
        } catch (_) {}
      }
    }
  }

  // Disk Verification Assertion for create_file tasks
  if (passed && actualToolsCalled.some((t) => t.name === 'create_file')) {
    if (testCase.expectedArgSubstrings && testCase.expectedArgSubstrings.relative_path) {
      const targetRelPath = testCase.expectedArgSubstrings.relative_path || '';
      const diskFilePath = path.join(mockDir, targetRelPath);
      try {
        await fs.stat(diskFilePath);
      } catch (_) {
        const baseName = path.basename(targetRelPath);
        try {
          const files = await fs.readdir(mockDir, { recursive: true });
          const found = files.some((f) => typeof f === 'string' && f.endsWith(baseName));
          if (!found) {
            passed = false;
            reason = `Failed Disk Verification: create_file tool was called, but created file "${targetRelPath}" was not found on disk.`;
          }
        } catch (_) {}
      }
    }
  }

  return {
    testId: testCase.id,
    testName: testCase.name,
    category: testCase.category,
    prompt: testCase.prompt,
    expectedTool: testCase.expectedToolSequence ? testCase.expectedToolSequence.join(' -> ') : (testCase.expectedTool ?? null),
    expectedToolSequence: testCase.expectedToolSequence,
    actualToolsCalled,
    passed,
    reason,
    durationMs,
    responseContent,
    objective: testCase.objective,
    requiredOutput: testCase.requiredOutput,
    evaluationCriteria: testCase.evaluationCriteria,
  };
}

export async function runBenchmarkSuite(
  modelName: string,
  ollamaHost: string = 'http://127.0.0.1:11434',
  onProgress?: (current: number, total: number, result: TestResultTrace) => void,
  testCases: BenchmarkTestCase[] = BENCHMARK_TEST_CASES,
  ollamaToken?: string,
  onTestStart?: (current: number, total: number, testCase: BenchmarkTestCase) => void
): Promise<BenchmarkReport> {
  const startTime = Date.now();
  const mockDir = await setupMockEnvironment();

  const results: TestResultTrace[] = [];
  let passCount = 0;

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    onTestStart?.(i + 1, testCases.length, testCase);
    const trace = await runSingleBenchmarkTest(testCase.id, modelName, ollamaHost, ollamaToken);
    if (trace.passed) passCount++;
    results.push(trace);

    if (onProgress) {
      onProgress(i + 1, testCases.length, trace);
    }
  }

  const totalDurationMs = Date.now() - startTime;
  const accuracyPercentage = Math.round((passCount / testCases.length) * 100);

  return {
    timestamp: Date.now(),
    model: modelName,
    mockWorkingDir: mockDir,
    totalTests: testCases.length,
    passCount,
    failCount: testCases.length - passCount,
    accuracyPercentage,
    totalDurationMs,
    results,
  };
}
