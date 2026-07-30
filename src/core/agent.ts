import { ContextManager } from './context.js';
import { OllamaClient } from './ollama.js';
import { ToolExecutor } from './tools.js';
import { AgentConfig, ChatMessage, OllamaModelInfo, OllamaRunningModelInfo } from './types.js';

export interface AgentSendMessageOptions {
  onChunk?: (chunk: string) => void;
  onToolStart?: (name: string, args: Record<string, any>) => void;
  onToolEnd?: (name: string, result: any) => void;
  onMessageAdded?: (message: ChatMessage) => void;
}

export class AgentEngine {
  private config: AgentConfig;
  private contextManager: ContextManager;
  private ollamaClient: OllamaClient;
  private toolExecutor: ToolExecutor;

  constructor(config?: Partial<AgentConfig>) {
    this.config = {
      ollamaHost: config?.ollamaHost || 'http://127.0.0.1:11434',
      model: config?.model || 'qwen2.5-coder:7b',
      temperature: config?.temperature !== undefined ? config.temperature : 0.2,
      systemPrompt:
        config?.systemPrompt ||
        'You are an intelligent AI assistant equipped with workspace tools for inspecting directories, reading files, searching code, creating files, and editing code. Only invoke tools when asked about workspace files or directories. For general knowledge or math, answer directly without tools.',
      workingDir: config?.workingDir || process.cwd(),
    };

    this.toolExecutor = new ToolExecutor(this.config.workingDir);
    this.contextManager = new ContextManager(this.config.systemPrompt);
    this.ollamaClient = new OllamaClient(this.config.ollamaHost);
  }

  public updateConfig(newConfig: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...newConfig };
    if (newConfig.systemPrompt !== undefined) {
      this.contextManager.setSystemPrompt(newConfig.systemPrompt);
    }
    if (newConfig.ollamaHost !== undefined) {
      this.ollamaClient.setHost(newConfig.ollamaHost);
    }
    if (newConfig.workingDir !== undefined) {
      this.toolExecutor.setWorkingDir(newConfig.workingDir);
    }
  }

  public getConfig(): AgentConfig {
    return { ...this.config, workingDir: this.toolExecutor.getWorkingDir() };
  }

  public getContextManager(): ContextManager {
    return this.contextManager;
  }

  public getToolExecutor(): ToolExecutor {
    return this.toolExecutor;
  }

  public async getAvailableModels(): Promise<OllamaModelInfo[]> {
    return this.ollamaClient.getModels();
  }

  public async getRunningModels(): Promise<OllamaRunningModelInfo[]> {
    return this.ollamaClient.getRunningModels();
  }

  public resetChat(): void {
    this.contextManager.clear();
  }

  public async sendMessage(userMessage: string, callbacks?: AgentSendMessageOptions): Promise<string> {
    // Add User Message to Context
    const userMsg = this.contextManager.addMessage({
      role: 'user',
      content: userMessage,
    });
    if (callbacks?.onMessageAdded) callbacks.onMessageAdded(userMsg);

    let maxLoops = 6;
    let finalAssistantResponse = '';

    while (maxLoops > 0) {
      maxLoops--;

      const messagesForOllama = [
        { role: 'system', content: this.contextManager.getEffectiveSystemPrompt() },
        ...this.contextManager.getMessages().map((m) => ({
          role: m.role,
          content: m.content,
          name: m.name,
          tool_calls: m.tool_calls,
        })),
      ];

      const res = await this.ollamaClient.chatStream({
        host: this.config.ollamaHost,
        model: this.config.model,
        temperature: this.config.temperature,
        messages: messagesForOllama,
        onChunk: callbacks?.onChunk,
      });

      // Add Assistant response message to Context
      const assistantMsg = this.contextManager.addMessage({
        role: 'assistant',
        content: res.content,
        tool_calls: res.tool_calls,
      });
      if (callbacks?.onMessageAdded) callbacks.onMessageAdded(assistantMsg);

      if (res.content) {
        finalAssistantResponse += res.content;
      }

      // If Assistant requested tool calls, execute them sequentially
      if (res.tool_calls && res.tool_calls.length > 0) {
        for (const call of res.tool_calls) {
          if (callbacks?.onToolStart) {
            callbacks.onToolStart(call.name, call.arguments);
          }

          const toolResult = await this.toolExecutor.executeTool(call.name, call.arguments);

          if (callbacks?.onToolEnd) {
            callbacks.onToolEnd(call.name, toolResult);
          }

          const resultStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2);

          // Add Tool Result message to Context cleanly
          const toolMsg = this.contextManager.addMessage({
            role: 'tool',
            name: call.name,
            tool_call_id: call.id,
            content: resultStr,
          });
          if (callbacks?.onMessageAdded) callbacks.onMessageAdded(toolMsg);
        }
      } else {
        // No tool calls requested, end conversation turn
        break;
      }
    }

    return finalAssistantResponse;
  }
}
