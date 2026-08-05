import { AgentEngine } from '../../../core/agent.js';
import type { BenchmarkFrameworkAdapter, FrameworkExecuteParams, FrameworkExecuteResult } from './types.js';

export class NativeFrameworkAdapter implements BenchmarkFrameworkAdapter {
  id = 'native';
  name = 'Local Model Chat (Native)';

  async execute(params: FrameworkExecuteParams): Promise<FrameworkExecuteResult> {
    const { testCase, modelName, ollamaHost, ollamaToken, agentConfig, workspaceDir } = params;

    const agent = new AgentEngine({
      model: modelName,
      ollamaHost,
      ollamaToken,
      workingDir: workspaceDir,
      temperature: agentConfig?.temperature,
      systemPrompt: agentConfig?.systemPrompt,
      showWorkingDirInfo: agentConfig?.showWorkingDirInfo ?? testCase.enableProjectContext ?? false,
      contextWindow: agentConfig?.contextWindow,
      maxLoops: agentConfig?.maxLoops,
      enableThinking: agentConfig?.enableThinking,
      complexityProfile: agentConfig?.complexityProfile,
      pruningConfig: agentConfig?.pruningConfig,
      enabledTools: agentConfig?.enabledTools,
    });

    const executor = agent.getToolExecutor();
    const originalExecuteTool = executor.executeTool.bind(executor);

    const actualToolsCalled: Array<{ name: string; args: Record<string, any> }> = [];
    const toolResults: Array<{ name: string; result: any }> = [];
    const executionTrace: FrameworkExecuteResult['executionTrace'] = [];
    let sequence = 0;

    let modelLoadMs = 0;
    let promptEvaluationMs = 0;
    let generationMs = 0;
    let toolExecutionMs = 0;
    let promptTokens = 0;
    let generatedTokens = 0;

    executor.executeTool = async (name: string, args: Record<string, any>) => {
      const toolStartedAt = performance.now();
      actualToolsCalled.push({ name, args });
      executionTrace.push({
        sequence: sequence++,
        timestamp: Date.now(),
        type: 'tool_start',
        name,
        args,
      });

      let result: any;
      if (name === 'web_search') {
        const query = String(args.query || '');
        if (query.toLowerCase().includes('node')) {
          result = { query, result_count: 2, results: [
            { title: 'Node.js releases', url: 'https://benchmark.example/node-release-schedule', snippet: 'Official release schedule and support status for Node.js versions.' },
            { title: 'Node.js 22 release announcement', url: 'https://benchmark.example/node-22-announcement', snippet: 'Highlights from the original Node.js 22 release.' },
          ] };
        } else if (query.toLowerCase().includes('lighthouse')) {
          result = { query, result_count: 2, results: [
            { title: 'Project Lighthouse release notes', url: 'https://benchmark.example/lighthouse-release', snippet: 'Official release announcement and launch details for Project Lighthouse.' },
            { title: 'Lighthouse project archive', url: 'https://benchmark.example/lighthouse-archive', snippet: 'Older Project Lighthouse planning documents.' },
          ] };
        } else {
          result = { query, result_count: 2, results: [
            { title: 'Ollama documentation', url: 'https://docs.ollama.com/', snippet: 'Official documentation for running and building with Ollama.' },
            { title: 'Ollama on GitHub', url: 'https://github.com/ollama/ollama', snippet: 'Source code and project information.' },
          ] };
        }
      } else if (name === 'read_web_page') {
        const url = String(args.url || '');
        if (url.includes('node-22-announcement')) {
          result = { url, title: 'Node.js 22 release announcement', content: 'Node.js 22 was released on April 24, 2024. It features V8 engine updates and improved WebSocket support.' };
        } else if (url.includes('node-release-schedule')) {
          result = { url, title: 'Node.js releases', content: 'Node.js 20 reached Active LTS on October 24, 2023 and Maintenance on October 22, 2024. Node.js 22 reached Active LTS on October 29, 2024.' };
        } else if (url.includes('lighthouse-release')) {
          result = { url, title: 'Project Lighthouse release notes', content: 'Project Lighthouse launched on March 15, 2025. It reached version 1.0 on June 1, 2025.' };
        } else if (url.includes('lighthouse-archive')) {
          result = { url, title: 'Lighthouse project archive', content: 'Internal planning draft from 2023.' };
        } else {
          result = { url, title: 'Page content', content: 'Sample page content for benchmarking.' };
        }
      } else {
        result = await originalExecuteTool(name, args);
      }

      toolExecutionMs += performance.now() - toolStartedAt;
      toolResults.push({ name, result });
      executionTrace.push({
        sequence: sequence++,
        timestamp: Date.now(),
        type: 'tool_end',
        name,
        result,
      });
      return result;
    };

    let responseContent = '';
    const agentResult = await agent.sendMessage(testCase.prompt, {
      onMessageAdded: (message) => {
        if (message.role === 'assistant') {
          if (message.content.trim()) responseContent = message.content;
          executionTrace.push({
            sequence: sequence++,
            timestamp: Date.now(),
            type: 'assistant_message',
            content: message.content,
            thinking: message.thinking,
          });
        }
      },
      onModelResponse: (metrics) => {
        modelLoadMs += metrics.loadDurationNs ? metrics.loadDurationNs / 1_000_000 : 0;
        promptEvaluationMs += metrics.promptEvalDurationNs ? metrics.promptEvalDurationNs / 1_000_000 : 0;
        generationMs += metrics.evalDurationNs ? metrics.evalDurationNs / 1_000_000 : 0;
        promptTokens += metrics.promptEvalCount || 0;
        generatedTokens += metrics.evalCount || 0;
      },
    });

    if (!responseContent && typeof agentResult === 'string') {
      responseContent = agentResult;
    }

    return {
      responseContent: responseContent || (typeof agentResult === 'string' ? agentResult : ''),
      actualToolsCalled,
      toolResults,
      executionTrace,
      timing: {
        modelLoadMs,
        promptEvaluationMs,
        generationMs,
        toolExecutionMs,
        promptTokens,
        generatedTokens,
      },
    };
  }
}
