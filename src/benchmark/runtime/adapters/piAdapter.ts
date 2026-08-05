import { execFile } from 'child_process';
import { promisify } from 'util';
import type { BenchmarkFrameworkAdapter, FrameworkExecuteParams, FrameworkExecuteResult } from './types.js';

const execFileAsync = promisify(execFile);

export class PiFrameworkAdapter implements BenchmarkFrameworkAdapter {
  id = 'pi';
  name = 'Pi Agent';

  async execute(params: FrameworkExecuteParams): Promise<FrameworkExecuteResult> {
    const { testCase, modelName, agentConfig, workspaceDir } = params;
    const startMs = performance.now();

    const args: string[] = ['--no-interactive', '--prompt', testCase.prompt];

    if (modelName) {
      args.push('--model', modelName);
    }
    if (agentConfig?.frameworkConfigPath) {
      args.push('--config', agentConfig.frameworkConfigPath);
    }

    let responseContent = '';
    const executionTrace: FrameworkExecuteResult['executionTrace'] = [];

    try {
      const { stdout, stderr } = await execFileAsync('pi', args, {
        cwd: workspaceDir,
        env: process.env,
        timeout: 5 * 60_000,
        maxBuffer: 10 * 1024 * 1024,
      });

      responseContent = stdout || stderr || '';
      executionTrace.push({
        sequence: 0,
        timestamp: Date.now(),
        type: 'assistant_message',
        content: responseContent,
      });
    } catch (error: any) {
      responseContent = error.stdout || error.stderr || error.message || 'Execution failed';
      executionTrace.push({
        sequence: 0,
        timestamp: Date.now(),
        type: 'assistant_message',
        content: responseContent,
      });
    }

    const elapsedMs = performance.now() - startMs;

    return {
      responseContent,
      actualToolsCalled: [],
      toolResults: [],
      executionTrace,
      timing: {
        generationMs: elapsedMs,
      },
    };
  }
}
