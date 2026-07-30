import { ContextManager } from './context.js';
import { OllamaClient } from './ollama.js';
import { TOOL_DEFINITIONS, ToolExecutor } from './tools.js';
import { AgentConfig, ChatMessage, OllamaModelInfo, OllamaRunningModelInfo } from './types.js';

export interface AgentSendMessageOptions {
  onChunk?: (chunk: string) => void;
  onToolStart?: (name: string, args: Record<string, any>) => void;
  onToolEnd?: (name: string, result: any) => void;
  onMessageAdded?: (message: ChatMessage) => void;
  signal?: AbortSignal;
  userDisplayContent?: string;
  userAttachments?: ChatMessage['attachments'];
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
      model: config?.model || 'qwen2.5-coder:7b',
      temperature: config?.temperature !== undefined ? config.temperature : 0.2,
      systemPrompt:
        config?.systemPrompt ||
        'You are an intelligent AI assistant with tools for workspace files, terminal commands, web search, and reading public web pages. Use web tools for current online information and workspace tools only for local files. For stable general knowledge or math, answer directly without tools.',
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
      displayContent: callbacks?.userDisplayContent,
      attachments: callbacks?.userAttachments,
    });
    if (callbacks?.onMessageAdded) callbacks.onMessageAdded(userMsg);

    let maxLoops = 8;
    let finalAssistantResponse = '';
    const requestedTools = inferExplicitlyRequestedTools(userMessage);
    const requiredToolCounts = inferRequiredToolCounts(userMessage, requestedTools);
    const requiresMutationVerification =
      requiredToolCounts.has('edit_file') &&
      ((userMessage.match(/\bits\s+[a-z_][a-z0-9_-]*/gi) || []).length >= 2 ||
        /\b(?:multiple|multi-field|several)\b/i.test(userMessage));
    const executedToolCounts = new Map<string, number>();
    let successfulActionIndex = 0;
    let lastMutationAction = -1;
    let lastReadAction = -1;
    const failedToolCalls = new Set<string>();
    const filesReadThisTurn = new Set<string>();
    let continuationReminder: string | null = null;

    while (maxLoops > 0) {
      callbacks?.signal?.throwIfAborted();
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

      const res = await this.ollamaClient.chatStream({
        host: this.config.ollamaHost,
        model: this.config.model,
        temperature: isContinuationAttempt ? 0 : this.config.temperature,
        messages: messagesForOllama,
        tools: TOOL_DEFINITIONS,
        onChunk: callbacks?.onChunk,
        signal: callbacks?.signal,
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
          const toolResult =
            mutationPath && !hasReadMutationTarget
              ? automaticReadResult?.error
                ? {
                    error:
                      `Refusing to ${call.name} "${mutationPath}" because the required automatic read failed: ${automaticReadResult.error}`,
                    file_path: mutationPath,
                    changed: false,
                    read_required: true,
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
          ) &&
          (!requiresMutationVerification || lastReadAction > lastMutationAction);
        if (workflowCompletedAfterThisCall && !anyToolFailedThisRound && maxLoops > 0) {
          continuationReminder =
            'Review the original request against the successful tool results. A tool type succeeding once does not mean every requested operation is complete. ' +
            'If any requested change or action is not yet reflected in the tool results, invoke the required tool now using the available schemas. ' +
            'Do not ask the user for instructions already present in the original request. Only provide the final answer once every requested operation has succeeded.' +
            `\n\nOriginal request: ${userMessage}`;
        }
      } else {
        const missingRequestedTools = [...requiredToolCounts].flatMap(([toolName, requiredCount]) =>
          Array.from(
            { length: Math.max(0, requiredCount - (executedToolCounts.get(toolName) || 0)) },
            () => toolName
          )
        );
        if (
          requiresMutationVerification &&
          lastMutationAction >= 0 &&
          lastReadAction <= lastMutationAction &&
          !missingRequestedTools.includes('read_file')
        ) {
          missingRequestedTools.push('read_file');
        }

        if (missingRequestedTools.length > 0 && maxLoops > 0) {
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
        break;
      }
    }

    return finalAssistantResponse;
  }
}
