import { ChatMessage, ContextInfo, Role, ToolDefinition } from './types.js';
import { TOOL_DEFINITIONS } from './tools.js';

export class ContextManager {
  private systemPrompt: string;
  private messages: ChatMessage[] = [];
  private tools: ToolDefinition[];

  constructor(
    initialSystemPrompt: string = 'You are an intelligent AI assistant equipped with workspace tools for inspecting directories, reading files, searching code, creating files, editing code, and executing terminal shell commands. Only invoke tools when the user asks about workspace files, directories, code, or wants to run a terminal command. For general knowledge or math, answer directly without tools.',
    tools: ToolDefinition[] = TOOL_DEFINITIONS
  ) {
    this.systemPrompt = initialSystemPrompt;
    this.tools = tools;
  }

  public setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  public getSystemPrompt(): string {
    return this.systemPrompt;
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
      'You have access to tools to read files, inspect workspace directories, search code, create files, edit code, and execute terminal shell commands directly on the system.',
      'RULE 1: Use tools when the user prompt requires: inspecting/listing/reading/searching/creating/editing workspace files or directories, OR running a terminal/shell/bash command. For general knowledge, math, or general questions, respond directly in plain text without invoking tools.',
      'RULE 1b: When the user says "run", "execute", "check", or asks a terminal/shell/system question (e.g. GPU info, disk usage, list processes), ALWAYS use the execute_command tool immediately.',
      'RULE 2: When you need to inspect or modify code, ALWAYS output the `<tool_call>` block immediately.',
      'RULE 3 (Line Deletion): To remove/delete lines of code or text from a file, set `replacement_text` to an empty string `""`.',
      'RULE 4 (Clean Function Rewriting): When rewriting a function, class, or code block, include the COMPLETE existing code block in `target_text` (from header to closing brace `}`) so the entire block is replaced cleanly without leaving orphaned lines.',
      'RULE 5 (Multi-Step Workflows): Complete multi-step tool workflows fully. When asked to inspect/read then edit/create, immediately issue the `<tool_call>` tag for the next action without asking for confirmation.',
      'RULE 6 (No Deferred Actions): Never announce a future tool action without invoking it in the same response. Do not end a response between requested workflow steps.',
    ];

    if (useNativeTools) {
      lines.push(
        '',
        'Tool definitions and their parameter schemas are supplied separately by the runtime.',
        'Use the runtime-native structured tool-call format. Do not wrap tool calls in Markdown or describe a future tool call without making it.'
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
  }): ChatMessage {
    const newMessage: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      role: msg.role,
      content: msg.content,
      name: msg.name,
      tool_calls: msg.tool_calls,
      tool_call_id: msg.tool_call_id,
      timestamp: Date.now(),
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
      effectiveSystemPrompt: this.getEffectiveSystemPrompt(),
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
      lines.push('Generic Syntax Example:');
      lines.push('<tool_call>');
      lines.push('{"name": "edit_file", "arguments": {"relative_path": "path/to/demo_script.py", "target_text": "old_val", "replacement_text": "new_val"}}');
      lines.push('</tool_call>');
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
