import { ContextManager } from './context.js';
import { OllamaClient } from './ollama.js';
import { TOOL_DEFINITIONS, ToolExecutor } from './tools.js';
import { AgentConfig, ChatMessage, OllamaModelInfo, OllamaRunningModelInfo } from './types.js';

export interface AgentSendMessageOptions {
  onChunk?: (chunk: string) => void;
  onToolStart?: (name: string, args: Record<string, any>) => void;
  onToolEnd?: (name: string, result: any) => void;
  onMessageAdded?: (message: ChatMessage) => void;
}

export type AgentConfigUpdate = Partial<AgentConfig> & { ollamaToken?: string };

function inferExplicitlyRequestedTools(prompt: string): string[] {
  const normalized = prompt.toLowerCase();

  // Explicit shell requests should not be reinterpreted as file-tool requests
  // merely because the command itself contains words such as "read" or "list".
  if (/\bexecute_command\b|\bterminal\b|\bshell command\b|\brun (?:a |the )?command\b/.test(normalized)) {
    return ['execute_command'];
  }

  const requested: string[] = [];
  const add = (toolName: string) => {
    if (!requested.includes(toolName)) requested.push(toolName);
  };

  if (/\b(?:list|show)\b.*\b(?:directory|folder|files)\b/.test(normalized)) add('list_directory');
  if (/\b(?:search|grep|find)\b.*\b(?:workspace|code|file|word|symbol|for)\b/.test(normalized)) add('grep_search');
  if (/\b(?:read|inspect|open)\b/.test(normalized)) add('read_file');
  if (/\b(?:create|write|make)\b.*\b(?:new )?(?:file|implementation)\b/.test(normalized)) add('create_file');
  if (/\b(?:edit|rewrite|refactor|update|change|delete|remove)\b/.test(normalized)) add('edit_file');

  return requested;
}

export class AgentEngine {
  private config: AgentConfig;
  private contextManager: ContextManager;
  private ollamaClient: OllamaClient;
  private toolExecutor: ToolExecutor;

  constructor(config?: AgentConfigUpdate) {
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
    this.ollamaClient = new OllamaClient(this.config.ollamaHost, config?.ollamaToken);
  }

  public updateConfig(newConfig: AgentConfigUpdate): void {
    this.config = { ...this.config, ...newConfig };
    if (newConfig.systemPrompt !== undefined) {
      this.contextManager.setSystemPrompt(newConfig.systemPrompt);
    }
    if (newConfig.ollamaHost !== undefined) {
      this.ollamaClient.setHost(newConfig.ollamaHost);
    }
    if (newConfig.ollamaToken !== undefined) {
      this.ollamaClient.setAuthToken(newConfig.ollamaToken);
    }
    if (newConfig.workingDir !== undefined) {
      this.toolExecutor.setWorkingDir(newConfig.workingDir);
    }
  }

  public getConfig(): AgentConfig {
    return { ...this.config, workingDir: this.toolExecutor.getWorkingDir() };
  }

  public hasOllamaToken(): boolean {
    return this.ollamaClient.hasAuthToken();
  }

  public getOllamaToken(): string | undefined {
    return this.ollamaClient.getAuthToken();
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
    const requestedTools = inferExplicitlyRequestedTools(userMessage);
    const executedToolNames = new Set<string>();
    let continuationReminder: string | null = null;

    while (maxLoops > 0) {
      maxLoops--;

      const messagesForOllama = [
        { role: 'system', content: this.contextManager.getEffectiveSystemPrompt(true) },
        ...this.contextManager.getMessages().map((m) => ({
          role: m.role,
          content: m.content,
          name: m.name,
          tool_calls: m.tool_calls,
        })),
      ];

      const isContinuationAttempt = continuationReminder !== null;
      if (continuationReminder) {
        messagesForOllama.push({
          role: 'user',
          content: continuationReminder,
          name: undefined,
          tool_calls: undefined,
        });
        continuationReminder = null;
      }

      const requestedWorkflowComplete =
        requestedTools.length > 0 && requestedTools.every((toolName) => executedToolNames.has(toolName));

      const res = await this.ollamaClient.chatStream({
        host: this.config.ollamaHost,
        model: this.config.model,
        temperature: isContinuationAttempt ? 0 : this.config.temperature,
        messages: messagesForOllama,
        tools: requestedWorkflowComplete ? undefined : TOOL_DEFINITIONS,
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
          executedToolNames.add(call.name);

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

        const workflowCompletedAfterThisCall =
          requestedTools.length > 0 && requestedTools.every((toolName) => executedToolNames.has(toolName));
        if (workflowCompletedAfterThisCall && maxLoops > 0) {
          continuationReminder = `All requested tool operations are complete. Now answer the user's original request directly using the tool results. Do not call another tool and do not merely summarize what you did.\n\nOriginal request: ${userMessage}`;
        }
      } else {
        const missingRequestedTools = requestedTools.filter((toolName) => !executedToolNames.has(toolName));

        if (missingRequestedTools.length > 0 && maxLoops > 0) {
          continuationReminder = `The requested workflow is unfinished. Your entire response must be a structured native tool call with no prose. Invoke the remaining required tool${
            missingRequestedTools.length === 1 ? '' : 's'
          } now: ${missingRequestedTools.join(', ')}. Use the information already returned by previous tools.`;
          continue;
        }

        // No tool calls requested, end conversation turn
        break;
      }
    }

    return finalAssistantResponse;
  }
}
