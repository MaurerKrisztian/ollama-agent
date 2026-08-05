import { execFile } from 'child_process';
import { promisify } from 'util';
import type { BenchmarkFrameworkAdapter, FrameworkExecuteParams, FrameworkExecuteResult } from './types.js';

const execFileAsync = promisify(execFile);

export class ClaudeCodeFrameworkAdapter implements BenchmarkFrameworkAdapter {
  id = 'claude-code';
  name = 'Claude Code CLI';

  async execute(params: FrameworkExecuteParams): Promise<FrameworkExecuteResult> {
    const { testCase, modelName, workspaceDir } = params;
    const startMs = performance.now();

    const args: string[] = ['--print', '-p', testCase.prompt];
    if (modelName) {
      args.push('--model', modelName);
    }

    let responseContent = '';
    const executionTrace: FrameworkExecuteResult['executionTrace'] = [];

    try {
      const { stdout, stderr } = await execFileAsync('claude', args, {
        cwd: workspaceDir,
        env: process.env,
        timeout: 5 * 60_000,
        maxBuffer: 10 * 1024 * 1024,
      });

      responseContent = stdout || stderr || '';
      executionTrace.push({ sequence: 0, timestamp: Date.now(), type: 'assistant_message', content: responseContent });
    } catch (error: any) {
      responseContent = error.stdout || error.stderr || error.message || 'Execution failed';
      executionTrace.push({ sequence: 0, timestamp: Date.now(), type: 'assistant_message', content: responseContent });
    }

    return {
      responseContent,
      actualToolsCalled: [],
      toolResults: [],
      executionTrace,
      timing: { generationMs: performance.now() - startMs },
    };
  }
}
