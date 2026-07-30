import { ChatMessage, ContextInfo, Role, ToolDefinition } from './types.js';
import { TOOL_DEFINITIONS } from './tools.js';

export class ContextManager {
  private systemPrompt: string;
  private messages: ChatMessage[] = [];
  private tools: ToolDefinition[];

  constructor(
    initialSystemPrompt: string = 'You are an intelligent AI assistant with tools for workspace files, terminal commands, web search, and reading public web pages. Use web tools for current online information and workspace tools only for local files. For stable general knowledge or math, answer directly without tools.',
    tools: ToolDefinition[] = TOOL_DEFINITIONS
  ) {
    this.systemPrompt = initialSystemPrompt;
    this.tools = tools;
  }

  public setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  public setTools(tools: ToolDefinition[]): void {
    this.tools = tools;
  }

  public getTools(): ToolDefinition[] {
    return this.tools;
  }

  public getSystemPrompt(): string {
    return this.systemPrompt;
  }

  /**
   * Rewind conversation context to a specific message ID, deleting all messages after it.
   */
  public rewindToMessage(messageId: string): { success: boolean; rewoundMessage?: ChatMessage } {
    const targetIndex = this.messages.findIndex((m) => m.id === messageId);
    if (targetIndex === -1) {
      return { success: false };
    }
    const targetMsg = this.messages[targetIndex];
    this.messages = this.messages.slice(0, targetIndex);
    return { success: true, rewoundMessage: targetMsg };
  }

  /**
   * Compact existing message context into a single summary message.
   */
  public compactWithSummary(summary: string): ChatMessage {
    const compactMessage: ChatMessage = {
      id: `msg_compact_${Date.now()}`,
      role: 'system',
      content: `[COMPACTED CONVERSATION SUMMARY]\n${summary.trim()}`,
      displayContent: `⚡ **Context Compacted**: All previous conversation history and tool outputs have been summarized to save context space.\n\n**Summary of Prior Context:**\n${summary.trim()}`,
      timestamp: Date.now(),
    };

    this.messages = [compactMessage];
    return compactMessage;
  }

  /**
   * Generates effective system prompt with 5-tool core rules & generic syntax examples
   */
  public getEffectiveSystemPrompt(useNativeTools: boolean = false): string {
    if (!this.tools || this.tools.length === 0) {
      return this.systemPrompt;
    }

    const lines: string[] = [
      this.systemPrompt.trim(),
      '',
      '# TOOL CALLING PROTOCOL INSTRUCTIONS',
      'You have access to tools for workspace files, terminal commands, web search, and reading public web pages as clean Markdown.',
      'RULE 1: Use tools when the user prompt requires workspace inspection or changes, terminal commands, or current/public web information. For stable general knowledge or math, respond directly without tools.',
      'RULE 1b (Terminal Authorization): Use execute_command immediately when the user explicitly asks to run/execute a terminal command or inspect the local system (e.g. GPU info, disk usage, processes). Asking what a command is, which command is configured, or requesting command text to copy is informational and does NOT authorize execution; answer from available context without running it.',
      'RULE 1c (Web): Use web_search with a short query to find sources. To inspect a result, copy its URL exactly into read_web_page. Never use execute_command for web access. Web page results are Markdown, not HTML.',
      'RULE 1d (Direct URL): If the user provides a URL and asks to read, inspect, summarize, or retrieve its content, call read_web_page directly. Do not search for a URL that is already provided.',
      'RULE 1e (Tool Separation): read_file is only for local workspace files. Never use read_file, list_directory, or grep_search to read a website or recover from a completed read_web_page call.',
      useNativeTools
        ? 'RULE 2: When you need to inspect or modify code, ALWAYS issue a runtime-native structured tool call immediately.'
        : 'RULE 2: When you need to inspect or modify code, ALWAYS output the `<tool_call>` block immediately.',
      'RULE 3 (Line Deletion): To remove/delete lines of code or text from a file, set `replacement_text` to an empty string `""`.',
      'RULE 3b (Literal Edits): edit_file target_text is always exact literal text, never a regex. Do not use patterns such as [0-9]+, .*, ^, or $. Use separate edit_file calls for changes that are not contiguous in the file.',
      'RULE 3c (Broad Rewrites): For restyling, full rewrites, or many non-contiguous changes, read the existing file and then use replace_file with the complete new content instead of forcing a large edit_file match.',
      'RULE 4 (Clean Function Rewriting): When rewriting a function, class, or code block, include the COMPLETE existing code block in `target_text` (from header to closing brace `}`) so the entire block is replaced cleanly without leaving orphaned lines.',
      useNativeTools
        ? 'RULE 5 (Multi-Step Workflows): Complete multi-step tool workflows fully. Immediately issue the next runtime-native structured tool call without asking for confirmation.'
        : 'RULE 5 (Multi-Step Workflows): Complete multi-step tool workflows fully. When asked to inspect/read then edit/create, immediately issue the `<tool_call>` tag for the next action without asking for confirmation.',
      'RULE 6 (No Deferred Actions): Never announce a future tool action without invoking it in the same response. Do not end a response between requested workflow steps.',
      'RULE 7 (No Fabricated Results): Never write or imitate a `<tool_response>` block. Only the runtime can produce tool results. To perform another action, issue another real structured tool call.',
    ];

    if (useNativeTools) {
      lines.push(
        '',
        'Tool definitions and their parameter schemas are supplied separately by the runtime.',
        'Use the runtime-native structured tool-call format. Do not wrap tool calls in Markdown or describe a future tool call without making it.',
        'Before calling edit_file, first call read_file for the target file in the same workflow. Never guess target_text from memory or from the user prompt.',
        'read_file returns raw file content without display line numbers.',
        'After any failed edit_file result, do not repeat the same arguments. Reread the file, use a smaller exact target, or switch to replace_file. Never ask the user to provide content that read_file already returned.'
      );
      return lines.join('\n');
    }

    lines.push('', '## Available Tools & Schemas:');

    this.tools.forEach((t) => {
      lines.push(`- Tool Name: "${t.name}"`);
      lines.push(`  Description: ${t.description}`);
      lines.push(`  Parameters JSON Schema: ${JSON.stringify(t.parameters)}`);
    });

    lines.push('');
    lines.push('## Tool Calling Syntax Protocol:');
    lines.push('When you need to invoke a tool, output a tool call using the `<tool_call>` XML tag containing a JSON object:');
    lines.push('');
    lines.push('<tool_call>');
    lines.push('{');
    lines.push('  "name": "tool_name",');
    lines.push('  "arguments": {');
    lines.push('    "parameter_name": "value"');
    lines.push('  }');
    lines.push('}');
    lines.push('</tool_call>');
    lines.push('');
    lines.push('Generic Syntax Examples (for reference only):');
    lines.push('Example 1 (Directory inspection):');
    lines.push('<tool_call>');
    lines.push('{"name": "list_directory", "arguments": {"relative_path": "dummy_folder"}}');
    lines.push('</tool_call>');
    lines.push('');
    lines.push('Example 2 (File reading):');
    lines.push('<tool_call>');
    lines.push('{"name": "read_file", "arguments": {"relative_path": "path/to/demo_script.py"}}');
    lines.push('</tool_call>');
    lines.push('');
    lines.push('Example 3 (Partial file edit / Line rewrite):');
    lines.push('<tool_call>');
    lines.push('{"name": "edit_file", "arguments": {"relative_path": "path/to/demo_script.py", "target_text": "old_val", "replacement_text": "new_val"}}');
    lines.push('</tool_call>');
    lines.push('');
    lines.push('Example 4 (Create file):');
    lines.push('<tool_call>');
    lines.push('{"name": "create_file", "arguments": {"relative_path": "path/to/new_file.py", "content": "print(\\"Hello\\")"}}');
    lines.push('</tool_call>');
    lines.push('');
    lines.push('Example 5 (Grep search):');
    lines.push('<tool_call>');
    lines.push('{"name": "grep_search", "arguments": {"query": "search_term"}}');
    lines.push('</tool_call>');
    lines.push('');
    lines.push('Example 6 (Terminal command execution):');
    lines.push('<tool_call>');
    lines.push('{"name": "execute_command", "arguments": {"command": "echo \\"test\\""}}');
    lines.push('</tool_call>');
    lines.push('');
    lines.push('Example 7 (Web search):');
    lines.push('<tool_call>');
    lines.push('{"name": "web_search", "arguments": {"query": "latest Node.js LTS"}}');
    lines.push('</tool_call>');
    lines.push('');
    lines.push('Example 8 (Read a web result):');
    lines.push('<tool_call>');
    lines.push('{"name": "read_web_page", "arguments": {"url": "https://example.com/article"}}');
    lines.push('</tool_call>');
    lines.push('');
    lines.push('Do not guess file content; always run read_file or grep_search first if you need to inspect existing code before editing.');

    return lines.join('\n');
  }

  public getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  public addMessage(msg: {
    role: Role;
    content: string;
    name?: string;
    tool_calls?: any[];
    tool_call_id?: string;
    displayContent?: string;
    attachments?: ChatMessage['attachments'];
  }): ChatMessage {
    const newMessage: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      role: msg.role,
      content: msg.content,
      name: msg.name,
      tool_calls: msg.tool_calls,
      tool_call_id: msg.tool_call_id,
      timestamp: Date.now(),
      displayContent: msg.displayContent,
      attachments: msg.attachments,
    };
    this.messages.push(newMessage);
    return newMessage;
  }

  public clear(): void {
    this.messages = [];
  }

  public setMessages(messages: ChatMessage[]): void {
    this.messages = messages;
  }

  public getRawJson(): string {
    const contextObject = {
      baseSystemPrompt: this.systemPrompt,
      effectiveSystemPrompt: this.getEffectiveSystemPrompt(true),
      tools: this.tools,
      messageCount: this.messages.length,
      messages: this.messages,
    };
    return JSON.stringify(contextObject, null, 2);
  }

  public getConvertedContext(): string {
    const lines: string[] = [];

    lines.push(`=== [BASE SYSTEM PROMPT] ===`);
    lines.push(this.systemPrompt.trim());
    lines.push('');

    if (this.tools.length > 0) {
      lines.push(`=== [TOOL CALLING PROTOCOL & SCHEMAS] ===`);
      lines.push('Available Tools:');
      this.tools.forEach((t) => {
        lines.push(`- Tool: ${t.name}`);
        lines.push(`  Description: ${t.description}`);
        lines.push(`  Parameters JSON Schema: ${JSON.stringify(t.parameters)}`);
      });
      lines.push('');
      lines.push('Runtime Protocol: Native structured tool calls (schemas are supplied separately to Ollama).');
      lines.push('Editing rule: read_file must inspect the target before edit_file constructs target_text.');
      lines.push('');
    }

    lines.push(`=== [CONVERSATION HISTORY (${this.messages.length} messages)] ===`);

    this.messages.forEach((msg, idx) => {
      const timeStr = new Date(msg.timestamp).toLocaleTimeString();
      lines.push(`[#${idx + 1} | ${msg.role.toUpperCase()} | ${timeStr}]`);

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        lines.push(`Requested Tool Calls: ${JSON.stringify(msg.tool_calls, null, 2)}`);
      }

      if (msg.role === 'tool') {
        lines.push(`Tool Name: ${msg.name || 'unknown'}`);
        lines.push(`Tool Output: ${msg.content}`);
      } else if (msg.content) {
        lines.push(msg.content);
      }
      lines.push('---');
    });

    return lines.join('\n');
  }

  public getContextInfo(): ContextInfo {
    const converted = this.getConvertedContext();
    const rawJson = this.getRawJson();
    const charCount = converted.length;
    const estimatedTokens = Math.ceil(charCount / 4);

    return {
      totalMessages: this.messages.length,
      charCount,
      estimatedTokens,
      formattedText: converted,
      rawJson,
    };
  }
}
