import { ContextManager } from './context.js';
import { OllamaClient } from './ollama.js';
import type { OllamaResponseMetrics } from './ollama.js';
import { getToolDefinitions, ToolExecutor } from './tools.js';
import { AgentConfig, ChatMessage, OllamaModelInfo, OllamaRunningModelInfo } from './types.js';
import { buildWorkingDirectoryContext } from './workdir-context.js';

export interface AgentSendMessageOptions {
  onChunk?: (chunk: string) => void;
  onThinkingChunk?: (chunk: string) => void;
  onToolStart?: (name: string, args: Record<string, any>) => void;
  onToolEnd?: (name: string, result: any) => void;
  onMessageAdded?: (message: ChatMessage) => void;
  onModelResponse?: (metrics: OllamaResponseMetrics) => void;
  onMaxLoopsReached?: (limit: number) => void;
  signal?: AbortSignal;
  userDisplayContent?: string;
  userAttachments?: ChatMessage['attachments'];
  userImages?: string[];
  userImageAttachments?: ChatMessage['imageAttachments'];
}

export type AgentConfigUpdate = Partial<AgentConfig> & { ollamaToken?: string };

function inferExplicitlyRequestedTools(prompt: string): string[] {
  const normalized = prompt.toLowerCase();

  if (/\bstart_terminal_session\b|\bbackground\b|\binteractive\b|\blong[- ]running\b|\bterminal session\b/.test(normalized)) {
    return ['start_terminal_session'];
  }

  // Explicit shell requests should not be reinterpreted as file-tool requests
  // merely because the command itself contains words such as "read" or "list".
  if (/\bexecute_command\b|\bterminal\b|\bshell command\b|\brun (?:a |the )?command\b/.test(normalized)) {
    return ['execute_command'];
  }

  const requested: string[] = [];
  const add = (toolName: string) => {
    if (!requested.includes(toolName)) requested.push(toolName);
  };

  const hasUrl = /https?:\/\/[^\s)>\]}]+/.test(prompt);
  const hasWebNoun = /\b(?:web\s?page|webpage|website|url|internet|online)\b/.test(normalized);
  const hasWorkspaceNoun = /\b(?:workspace|codebase|repository|repo|local file|directory|folder)\b/.test(normalized);
  const hasResearchCue =
    /\b(?:look into|find out|research|investigate|verify|fact[- ]?check)\b/.test(normalized);
  const hasExternalFactCue =
    /\b(?:latest|current|today|news|price|release|support|security updates?|end of life|eol|schedule|version|documentation)\b/.test(normalized);
  const webSearchIntent =
    /\b(?:web|internet|online)\b.*\b(?:search|find|look up|research)\b/.test(normalized) ||
    /\b(?:search|find|look up|research)\b.*\b(?:web|internet|online)\b/.test(normalized) ||
    /\bweb_search\b/.test(normalized);
  const webPageReadIntent =
    /\bread_web_page\b/.test(normalized) ||
    /\b(?:read|open|inspect|check|summari[sz]e|content of)\b.*\b(?:web\s?page|webpage|website|url)\b/.test(normalized) ||
    /\b(?:web\s?page|webpage|website|url)\b.*\b(?:read|open|inspect|check|summari[sz]e|content)\b/.test(normalized) ||
    (hasUrl && /\b(?:read|open|inspect|check|summari[sz]e|content|what is)\b/.test(normalized));
  const requiresVerifiedWebResearch =
    !hasWorkspaceNoun &&
    ((hasResearchCue && hasExternalFactCue) ||
      (webSearchIntent && /\b(?:research|verify|compare|when|how long|why|how)\b/.test(normalized)));
  const hasWebIntent =
    webSearchIntent || webPageReadIntent || requiresVerifiedWebResearch || (hasUrl && hasWebNoun);

  if (webSearchIntent || requiresVerifiedWebResearch) {
    add('web_search');
  }
  if (webPageReadIntent || requiresVerifiedWebResearch) {
    add('read_web_page');
  }

  // Broad project/codebase research requests require discovery before reading
  // project metadata. Without this classification, a malformed first tool call
  // is treated as a completed prose response and the agent waits for another
  // user message.
  const isProjectResearchRequest =
    /\b(?:research|understand|inspect|check|summari[sz]e)\b.*\b(?:project|codebase|workspace)\b/.test(normalized) ||
    /\b(?:project|codebase|workspace)\b.*\b(?:research|understand|inspect|check|summari[sz]e)\b/.test(normalized);
  if (isProjectResearchRequest) {
    add('list_directory');
    add('read_file');
  }
  if (/\bexisting\b.*\b(?:app|project|directory|folder)\b/.test(normalized)) {
    add('list_directory');
  }

  if (/\b(?:list|show)\b.*\b(?:directory|folder|files)\b/.test(normalized)) add('list_directory');
  if (!hasWebIntent && /\b(?:search|grep|find)\b.*\b(?:workspace|code|file|word|symbol|for)\b/.test(normalized)) {
    add('grep_search');
  }
  // "read the web page" must never create a local read_file obligation. That
  // obligation previously caused a successful web answer to cascade into
  // guessed local filenames and directory exploration.
  if (!hasWebIntent && /\b(?:read|inspect|open)\b/.test(normalized)) add('read_file');
  if (/\b(?:create|write|make)\b.*\b(?:new )?(?:file|implementation)\b/.test(normalized)) add('create_file');
  if (/\b(?:edit|rewrite|refactor|update|change|delete|remove)\b/.test(normalized)) {
    // Existing content must be inspected before constructing an exact
    // target_text replacement. This also lets the model recover when the user
    // refers to a stale value.
    add('read_file');
    add('edit_file');
  }

  return requested;
}

function inferRequiredToolCounts(prompt: string, requestedTools: string[]): Map<string, number> {
  const counts = new Map(requestedTools.map((toolName) => [toolName, 1]));
  const stepCounts = new Map<string, number>();
  const stepCallPattern = /\bstep\s+\d+\s*:\s*call\s+([a-z_][a-z0-9_]*)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = stepCallPattern.exec(prompt)) !== null) {
    const toolName = match[1];
    stepCounts.set(toolName, (stepCounts.get(toolName) || 0) + 1);
  }
  for (const [toolName, count] of stepCounts) {
    counts.set(toolName, Math.max(counts.get(toolName) || 0, count));
  }
  return counts;
}

export class AgentEngine {
  private config: AgentConfig;
  private contextManager: ContextManager;
  private ollamaClient: OllamaClient;
  private toolExecutor: ToolExecutor;

  constructor(config?: AgentConfigUpdate) {
    this.config = {
      ollamaHost: config?.ollamaHost || 'http://127.0.0.1:11434',
      model: config?.model || 'qwen3.5:9b',
      temperature: config?.temperature !== undefined ? config.temperature : 0.2,
      systemPrompt:
        config?.systemPrompt ||
        'You are an intelligent AI assistant with tools for workspace files, terminal commands, web search, and reading public web pages. Use web tools for current online information and workspace tools only for local files. For stable general knowledge or math, answer directly without tools.',
      workingDir: config?.workingDir || process.cwd(),
      showWorkingDirInfo: config?.showWorkingDirInfo ?? true,
      contextWindow: config?.contextWindow !== undefined ? config.contextWindow : 16384,
      maxLoops: config?.maxLoops !== undefined ? config.maxLoops : 10,
      complexityProfile: config?.complexityProfile || 'simple',
      enableThinking: config?.enableThinking ?? true,
    };

    this.toolExecutor = new ToolExecutor(this.config.workingDir);
    this.contextManager = new ContextManager(this.config.systemPrompt, undefined, config?.pruningConfig);
    this.config.pruningConfig = this.contextManager.getPruningConfig();
    this.ollamaClient = new OllamaClient(this.config.ollamaHost, config?.ollamaToken);
  }

  public updateConfig(newConfig: AgentConfigUpdate): void {
    const definedConfig = Object.fromEntries(
      Object.entries(newConfig).filter(([, value]) => value !== undefined)
    ) as AgentConfigUpdate;
    this.config = { ...this.config, ...definedConfig };
    if (newConfig.systemPrompt !== undefined) {
      this.contextManager.setSystemPrompt(newConfig.systemPrompt);
    }
    if (newConfig.pruningConfig !== undefined) {
      this.contextManager.setPruningConfig(newConfig.pruningConfig);
      this.config.pruningConfig = this.contextManager.getPruningConfig();
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
    return {
      ...this.config,
      workingDir: this.toolExecutor.getWorkingDir(),
      pruningConfig: this.contextManager.getPruningConfig(),
    };
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

  public getActiveTools() {
    const builtin = getToolDefinitions(this.config.complexityProfile || 'simple');
    return [...builtin, ...this.toolExecutor.getMcpManager().getToolDefinitions()];
  }

  public async loadMcpConfig(customPath?: string) {
    return await this.toolExecutor.getMcpManager().loadConfig(customPath);
  }

  public async getWorkingDirectoryPromptContext(): Promise<string> {
    if (!this.config.showWorkingDirInfo) return '';
    try {
      return await buildWorkingDirectoryContext(this.toolExecutor.getWorkingDir());
    } catch (error: any) {
      return `# CURRENT WORKING DIRECTORY CONTEXT\nWorking directory context could not be read: ${error.message}`;
    }
  }

  public async getAvailableModels(): Promise<OllamaModelInfo[]> {
    return this.ollamaClient.getModels();
  }

  public async getRunningModels(): Promise<OllamaRunningModelInfo[]> {
    return this.ollamaClient.getRunningModels();
  }

  public async getModelDetails(name?: string): Promise<any> {
    const targetModel = name || this.config.model;
    return this.ollamaClient.getModelDetails(targetModel);
  }

  public resetChat(): void {
    this.contextManager.clear();
  }

  public rewindToMessage(messageId: string) {
    return this.contextManager.rewindToMessage(messageId);
  }

  public async compactContext(): Promise<{ success: boolean; summary?: string; reason?: string; context?: any; message?: ChatMessage }> {
    const messages = this.contextManager.getMessages();
    if (messages.length <= 1) {
      return { success: false, reason: 'Context is already minimal (1 or fewer messages).' };
    }

    const conversationText = this.contextManager.getConvertedContext();
    const prompt = `You are a context summarization assistant. Summarize the conversation history below concisely.
Structure your output into these bullet points:
- **User Goal**: What the user requested.
- **Actions Taken**: Files read/edited, tools run, or web searches performed.
- **Key Technical Findings & State**: Current code state, error tracebacks, or conclusions.

Keep the summary dense and factual under 300 words. Do not use tool calls.

Conversation History:
${conversationText}`;

    let summaryText = '';
    try {
      const summaryResult = await this.ollamaClient.chatStream({
        host: this.config.ollamaHost,
        model: this.config.model,
        temperature: 0.1,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });
      summaryText = summaryResult.content || '';
    } catch (err: any) {
      summaryText = `Compacted ${messages.length} messages. User requested assistance with: ${messages.find((m) => m.role === 'user')?.content.slice(0, 100) || 'workspace tasks'}.`;
    }

    const compactMsg = this.contextManager.compactWithSummary(summaryText);
    return {
      success: true,
      summary: summaryText,
      message: compactMsg,
      context: this.contextManager.getContextInfo(),
    };
  }

  public async sendMessage(userMessage: string, callbacks?: AgentSendMessageOptions): Promise<string> {
    // Add User Message to Context
    const userMsg = this.contextManager.addMessage({
      role: 'user',
      content: userMessage,
      displayContent: callbacks?.userDisplayContent,
      attachments: callbacks?.userAttachments,
      images: callbacks?.userImages,
      imageAttachments: callbacks?.userImageAttachments,
    });
    if (callbacks?.onMessageAdded) callbacks.onMessageAdded(userMsg);

    const maxLoopsConfig = this.config.maxLoops ?? 10;
    const isUnlimited = maxLoopsConfig === 0;
    let maxLoops = maxLoopsConfig;
    let maxLoopsReached = false;
    let normalTurnEnd = false;
    let finalAssistantResponse = '';
    const requestedTools = inferExplicitlyRequestedTools(userMessage);
    const requiredToolCounts = inferRequiredToolCounts(userMessage, requestedTools);
    const executedToolCounts = new Map<string, number>();
    let successfulActionIndex = 0;
    let lastMutationAction = -1;
    let lastReadAction = -1;
    const failedToolCalls = new Set<string>();
    const filesReadThisTurn = new Set<string>();
    for (const msg of this.contextManager.getMessages()) {
      if (msg.role === 'assistant' && msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          if ((tc.name === 'read_file' || tc.name === 'create_file') && tc.arguments?.relative_path) {
            const norm = String(tc.arguments.relative_path).replaceAll('\\', '/').replace(/^\.\//, '');
            if (norm) filesReadThisTurn.add(norm);
          }
        }
      }
      if (msg.role === 'tool' && (msg.name === 'read_file' || msg.name === 'create_file')) {
        try {
          const parsed = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
          if (parsed?.file_path) {
            const norm = String(parsed.file_path).replaceAll('\\', '/').replace(/^\.\//, '');
            if (norm) filesReadThisTurn.add(norm);
          }
        } catch (_) {}
      }
    }
    let continuationReminder: string | null = null;

    while (isUnlimited || maxLoops > 0) {
      callbacks?.signal?.throwIfAborted();
      if (!isUnlimited) maxLoops--;

      const activeTools = this.getActiveTools();
      this.contextManager.setTools(activeTools);

      let effectiveSystemPrompt = this.contextManager.getEffectiveSystemPrompt(true);
      if (this.config.showWorkingDirInfo) {
        effectiveSystemPrompt += `\n\n${await this.getWorkingDirectoryPromptContext()}`;
      }

      const messagesForOllama = [
        { role: 'system', content: effectiveSystemPrompt },
        ...this.contextManager.getMessages().map((m) => ({
          role: m.role,
          content: m.content,
          name: m.name,
          tool_calls: m.tool_calls,
          images: m.images,
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

      const res = await this.ollamaClient.chatStream({
        host: this.config.ollamaHost,
        model: this.config.model,
        temperature: isContinuationAttempt ? 0 : this.config.temperature,
        contextWindow: this.config.contextWindow,
        enableThinking: this.config.enableThinking,
        messages: messagesForOllama,
        tools: activeTools,
        onChunk: callbacks?.onChunk,
        onThinkingChunk: callbacks?.onThinkingChunk,
        signal: callbacks?.signal,
      });
      if (res.metrics) callbacks?.onModelResponse?.(res.metrics);

      // Add Assistant response message to Context if it has content, thinking, or tool calls
      const hasContentOrTools = !!(res.content?.trim() || res.thinking?.trim() || (res.tool_calls && res.tool_calls.length > 0));
      if (hasContentOrTools) {
        const assistantMsg = this.contextManager.addMessage({
          role: 'assistant',
          content: res.content,
          thinking: res.thinking,
          thinkingTokens: res.thinkingTokens,
          tool_calls: res.tool_calls,
        });
        if (callbacks?.onMessageAdded) callbacks.onMessageAdded(assistantMsg);
      }

      if (res.content) {
        finalAssistantResponse += res.content;
      }

      // If Assistant requested tool calls, execute them sequentially
      if (res.tool_calls && res.tool_calls.length > 0) {
        let anyToolFailedThisRound = false;
        for (const call of res.tool_calls) {
          callbacks?.signal?.throwIfAborted();

          const callFingerprint = JSON.stringify([call.name, call.arguments]);
          const mutationPath =
            call.name === 'edit_file' || call.name === 'replace_file'
              ? String(call.arguments.relative_path || '')
              : '';
          const normalizedMutationPath = mutationPath.replaceAll('\\', '/').replace(/^\.\//, '');
          const hasReadMutationTarget =
            normalizedMutationPath !== '' &&
            (filesReadThisTurn.has(normalizedMutationPath) ||
              [...filesReadThisTurn].some(
                (readPath) =>
                  readPath.endsWith(`/${normalizedMutationPath}`) ||
                  normalizedMutationPath.endsWith(`/${readPath}`)
              ));
          let automaticallyReadPath: string | null = null;
          let automaticReadResult: any = null;
          if (mutationPath && !hasReadMutationTarget) {
            const automaticReadArgs = { relative_path: mutationPath };
            callbacks?.onToolStart?.('read_file', automaticReadArgs);
            automaticReadResult = await this.toolExecutor.executeTool('read_file', automaticReadArgs);
            callbacks?.onToolEnd?.('read_file', automaticReadResult);
            const automaticReadFailed =
              automaticReadResult !== null &&
              typeof automaticReadResult === 'object' &&
              typeof automaticReadResult.error === 'string';
            if (!automaticReadFailed) {
              successfulActionIndex++;
              lastReadAction = successfulActionIndex;
              executedToolCounts.set('read_file', (executedToolCounts.get('read_file') || 0) + 1);
            }
          }
          if (automaticReadResult && typeof automaticReadResult.file_path === 'string') {
            const normalizedReadPath = automaticReadResult.file_path
              .replaceAll('\\', '/')
              .replace(/^\.\//, '');
            automaticallyReadPath = normalizedReadPath;
            filesReadThisTurn.add(normalizedReadPath);
          }
          callbacks?.onToolStart?.(call.name, call.arguments);
          const isFileNotFound =
            automaticReadResult?.error &&
            /ENOENT|no such file or directory|File not found/i.test(automaticReadResult.error);

          const toolResult =
            mutationPath && !hasReadMutationTarget
              ? automaticReadResult?.error
                ? {
                    error: isFileNotFound
                      ? `Cannot ${call.name} "${mutationPath}": File or directory not found (${automaticReadResult.error})`
                      : `Refusing to ${call.name} "${mutationPath}" because the required automatic read failed: ${automaticReadResult.error}`,
                    file_path: mutationPath,
                    changed: false,
                    read_required: !isFileNotFound,
                  }
                : {
                    error:
                      `The runtime read "${automaticallyReadPath}" instead of executing this ungrounded ${call.name} call. ` +
                      'Construct the next edit from current_content below. Do not use content invented in an earlier response.',
                    file_path: automaticallyReadPath,
                    current_content: automaticReadResult.content,
                    line_count: automaticReadResult.line_count,
                    size_bytes: automaticReadResult.size_bytes,
                    changed: false,
                    read_required: true,
                  }
              : failedToolCalls.has(callFingerprint)
            ? {
                error:
                  `Refusing to repeat an identical failed ${call.name} call. ` +
                  'Use the latest tool result to change strategy. For file edits, reread the file, use a smaller exact target, or use replace_file.',
                repeated_call: true,
              }
            : await this.toolExecutor.executeTool(call.name, call.arguments);
          const toolFailed =
            toolResult !== null &&
            typeof toolResult === 'object' &&
            typeof toolResult.error === 'string' &&
            toolResult.cancelled !== true;
          if (toolFailed) anyToolFailedThisRound = true;
          if (!toolFailed) {
            successfulActionIndex++;
            executedToolCounts.set(call.name, (executedToolCounts.get(call.name) || 0) + 1);
            if (call.name === 'read_file' && typeof toolResult?.file_path === 'string') {
              lastReadAction = successfulActionIndex;
              filesReadThisTurn.add(toolResult.file_path.replaceAll('\\', '/').replace(/^\.\//, ''));
            }
            if (call.name === 'edit_file' || call.name === 'replace_file') {
              lastMutationAction = successfulActionIndex;
            }
            // A successful whole-file replacement satisfies an inferred edit
            // requirement just as a partial edit does.
            if (call.name === 'replace_file') {
              executedToolCounts.set('edit_file', (executedToolCounts.get('edit_file') || 0) + 1);
            }
          } else if (call.name === 'edit_file' || call.name === 'replace_file') {
            failedToolCalls.add(callFingerprint);
            continuationReminder =
              `The ${call.name} call failed and made no changes: ${toolResult.error}\n` +
              'Do not repeat the same call. Reread the file and retry with a smaller exact literal target_text, or use replace_file with the complete new content for broad/non-contiguous changes. ' +
              'Do not ask the user to provide content that is already in the tool results.';
          } else if (call.name === 'read_file') {
            failedToolCalls.add(callFingerprint);
            const requestedPath = String(call.arguments.relative_path || '');
            const parentPath = requestedPath.includes('/')
              ? requestedPath.slice(0, requestedPath.lastIndexOf('/')) || '.'
              : '.';
            continuationReminder =
              `The read_file call failed: ${toolResult.error}\n` +
              `Do not retry that path. Your entire next response must be one native list_directory call for "${parentPath}". ` +
              'Use the returned entries to select the real file path, then read it.';
          } else {
            failedToolCalls.add(callFingerprint);
          }

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
          requestedTools.length > 0 &&
          [...requiredToolCounts].every(
            ([toolName, requiredCount]) => (executedToolCounts.get(toolName) || 0) >= requiredCount
          );
        if (workflowCompletedAfterThisCall && !anyToolFailedThisRound && (isUnlimited || maxLoops > 0)) {
          continuationReminder =
            'Review the original request against the successful tool results. A tool type succeeding once does not mean every requested operation is complete. ' +
            'If any requested change or action is not yet reflected in the tool results, invoke the required tool now using the available schemas. ' +
            'Do not ask the user for instructions already present in the original request. Only provide the final answer once every requested operation has succeeded.' +
            `\n\nOriginal request: ${userMessage}`;
        }
        if (!isUnlimited && maxLoops === 0) {
          maxLoopsReached = true;
        }
      } else {
        const missingRequestedTools = [...requiredToolCounts].flatMap(([toolName, requiredCount]) =>
          Array.from(
            { length: Math.max(0, requiredCount - (executedToolCounts.get(toolName) || 0)) },
            () => toolName
          )
        );

        if (missingRequestedTools.length > 0 && (isUnlimited || maxLoops > 0) && !isContinuationAttempt) {
          const webVerificationInstruction = missingRequestedTools.includes('read_web_page')
            ? ' Copy the full URL of the most relevant source from the latest web_search results into read_web_page. Do not answer from a search snippet or memory.'
            : '';
          continuationReminder = `The requested workflow is unfinished. Your entire response must be a structured native tool call with no prose. Invoke the remaining required tool${
            missingRequestedTools.length === 1 ? '' : 's'
          } now: ${missingRequestedTools.join(', ')}.${webVerificationInstruction} For a multi-change edit, reread the modified file and compare every requested value with the original request before claiming completion. Use the information already returned by previous tools. ` +
            'Text that merely claims a <tool_response> is not execution; invoke the real runtime tool.';
          continue;
        }

        // No tool calls requested, end conversation turn
        normalTurnEnd = true;
        break;
      }
    }

    if (!isUnlimited && !normalTurnEnd && maxLoopsReached) {
      const warningText = `\n\n⚠️ **Max tool call iterations limit reached (${maxLoopsConfig} iterations).** You can increase \`maxLoops\` or disable the limit in Tool Settings.`;
      if (!finalAssistantResponse.includes('Max tool call iterations limit reached')) {
        finalAssistantResponse += warningText;
      }
      callbacks?.onChunk?.(warningText);
      callbacks?.onMaxLoopsReached?.(maxLoopsConfig);

      const messages = this.contextManager.getMessages();
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        if (!lastMsg.content.includes('Max tool call iterations limit reached')) {
          lastMsg.content = (lastMsg.content + warningText).trim();
        }
      } else {
        const warningMsg = this.contextManager.addMessage({
          role: 'assistant',
          content: warningText.trim(),
        });
        if (callbacks?.onMessageAdded) callbacks.onMessageAdded(warningMsg);
      }
    }

    return finalAssistantResponse;
  }
}
