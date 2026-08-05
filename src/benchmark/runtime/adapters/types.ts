import type { BenchmarkTestCase } from '../../cases/types.js';
import type { BenchmarkAgentConfig, BenchmarkTiming } from '../../types.js';

export interface FrameworkExecuteParams {
  testCase: BenchmarkTestCase;
  modelName: string;
  ollamaHost: string;
  ollamaToken?: string;
  agentConfig?: BenchmarkAgentConfig;
  workspaceDir: string;
}

export interface FrameworkExecuteResult {
  responseContent: string;
  actualToolsCalled: Array<{ name: string; args: Record<string, any> }>;
  toolResults: Array<{ name: string; result: any }>;
  executionTrace: Array<{
    sequence: number;
    timestamp: number;
    type: 'assistant_message' | 'tool_start' | 'tool_end';
    name?: string;
    args?: Record<string, any>;
    result?: any;
    content?: string;
    thinking?: string;
  }>;
  timing: Partial<BenchmarkTiming>;
}

export interface BenchmarkFrameworkAdapter {
  id: string;
  name: string;
  execute(params: FrameworkExecuteParams): Promise<FrameworkExecuteResult>;
}
