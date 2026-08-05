import { execFile } from 'child_process';
import { promisify } from 'util';
import type { BenchmarkFrameworkAdapter, FrameworkExecuteParams, FrameworkExecuteResult } from './types.js';

const execFileAsync = promisify(execFile);

export class GenericFrameworkAdapter implements BenchmarkFrameworkAdapter {
  id: string;
  name: string;
  private command: string;

  constructor(id: string, name: string, command: string) {
    this.id = id;
    this.name = name;
    this.command = command;
  }

  async execute(params: FrameworkExecuteParams): Promise<FrameworkExecuteResult> {
    const { testCase, workspaceDir } = params;
    const startMs = performance.now();

    let responseContent = '';
    try {
      const { stdout, stderr } = await execFileAsync(this.command, ['--prompt', testCase.prompt], {
        cwd: workspaceDir,
        env: process.env,
        timeout: 5 * 60_000,
      });
      responseContent = stdout || stderr || '';
    } catch (error: any) {
      responseContent = error.stdout || error.stderr || error.message || 'Execution failed';
    }

    return {
      responseContent,
      actualToolsCalled: [],
      toolResults: [],
      executionTrace: [{ sequence: 0, timestamp: Date.now(), type: 'assistant_message', content: responseContent }],
      timing: { generationMs: performance.now() - startMs },
    };
  }
}
