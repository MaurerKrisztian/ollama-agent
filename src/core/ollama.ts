import { ChatMessage, OllamaModelInfo, OllamaRunningModelInfo, ToolDefinition } from './types.js';

export interface OllamaChatOptions {
  host: string;
  model: string;
  temperature?: number;
  messages: Array<{
    role: string;
    content: string;
    name?: string;
    images?: string[];
    tool_calls?: any[];
  }>;
  tools?: ToolDefinition[];
  onChunk?: (chunk: string) => void;
}

export class OllamaClient {
  private host: string;

  constructor(host: string = 'http://127.0.0.1:11434') {
    this.host = host.replace(/\/$/, '');
  }

  public setHost(host: string) {
    this.host = host.replace(/\/$/, '');
  }

  public getHost(): string {
    return this.host;
  }

  public async getModels(): Promise<OllamaModelInfo[]> {
    try {
      const res = await fetch(`${this.host}/api/tags`);
      if (!res.ok) {
        throw new Error(`Ollama server returned HTTP ${res.status}`);
      }
      const data: any = await res.json();
      return data.models || [];
    } catch (err: any) {
      throw new Error(`Failed to fetch models from Ollama (${this.host}): ${err.message}`);
    }
  }

  /**
   * Fetch currently loaded models in GPU VRAM / RAM via /api/ps
   */
  public async getRunningModels(): Promise<OllamaRunningModelInfo[]> {
    try {
      const res = await fetch(`${this.host}/api/ps`);
      if (!res.ok) {
        return [];
      }
      const data: any = await res.json();
      return data.models || [];
    } catch (_) {
      return [];
    }
  }

  /**
   * Helper method to parse tool calls from model output text
   * Supports XML tags, Markdown JSON codeblocks, and raw JSON objects
   */
  private extractToolCallsFromText(
    text: string
  ): { calls: Array<{ id: string; name: string; arguments: Record<string, any> }>; cleanedText: string } {
    if (!text.trim()) return { calls: [], cleanedText: text };

    const calls: Array<{ id: string; name: string; arguments: Record<string, any> }> = [];
    let cleanedText = text;

    // 1. Check XML tags: <tool_call>...</tool_call> or <tool>...</tool>
    const xmlRegex = /<(?:tool_call|tool)>([\s\S]*?)<\/(?:tool_call|tool)>/gi;
    let match: RegExpExecArray | null;
    while ((match = xmlRegex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (parsed.name) {
          calls.push({
            id: `call_${Date.now()}_${calls.length}`,
            name: parsed.name,
            arguments: parsed.arguments || parsed.parameters || {},
          });
        }
      } catch (_) {}
    }

    if (calls.length > 0) {
      cleanedText = text.replace(/<(?:tool_call|tool)>[\s\S]*?<\/(?:tool_call|tool)>/gi, '').trim();
      return { calls, cleanedText };
    }

    // 2. Check Markdown codeblock JSON: ```json { "name": "...", "arguments": {...} } ```
    const codeblockRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/gi;
    while ((match = codeblockRegex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (parsed.name && (parsed.arguments !== undefined || parsed.parameters !== undefined)) {
          calls.push({
            id: `call_${Date.now()}_${calls.length}`,
            name: parsed.name,
            arguments: parsed.arguments || parsed.parameters || {},
          });
        }
      } catch (_) {}
    }

    if (calls.length > 0) {
      cleanedText = text.replace(/```(?:json)?\s*\{[\s\S]*?\}\s*```/gi, '').trim();
      return { calls, cleanedText };
    }

    // 3. Check plain JSON objects starting with { "name": "...", "arguments": ... }
    const trimmed = text.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.name && (parsed.arguments !== undefined || parsed.parameters !== undefined)) {
          calls.push({
            id: `call_${Date.now()}_0`,
            name: parsed.name,
            arguments: parsed.arguments || parsed.parameters || {},
          });
          cleanedText = '';
          return { calls, cleanedText };
        }
      } catch (_) {}
    }

    return { calls, cleanedText };
  }

  public async chatStream(options: OllamaChatOptions): Promise<{
    content: string;
    tool_calls?: Array<{ id: string; name: string; arguments: Record<string, any> }>;
  }> {
    const endpoint = `${options.host || this.host}/api/chat`;

    // Map system prompt & tool messages to Ollama format
    const formattedMessages = options.messages.map((m) => {
      const msgObj: any = {
        role: m.role,
        content: m.content,
      };
      if (m.tool_calls) {
        msgObj.tool_calls = m.tool_calls.map((tc) => ({
          function: {
            name: tc.name,
            arguments: tc.arguments,
          },
        }));
      }
      return msgObj;
    });

    const requestBody: any = {
      model: options.model,
      messages: formattedMessages,
      stream: true,
    };

    if (options.temperature !== undefined) {
      requestBody.options = { temperature: options.temperature };
    }

    if (options.tools && options.tools.length > 0) {
      requestBody.tools = options.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama Chat Error (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Ollama response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullContent = '';
    let toolCallsResult: Array<{ id: string; name: string; arguments: Record<string, any> }> | undefined;
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.message) {
            if (parsed.message.content) {
              fullContent += parsed.message.content;
              if (options.onChunk) {
                options.onChunk(parsed.message.content);
              }
            }

            if (parsed.message.tool_calls && parsed.message.tool_calls.length > 0) {
              toolCallsResult = parsed.message.tool_calls.map((tc: any, index: number) => ({
                id: `call_${Date.now()}_${index}`,
                name: tc.function?.name || tc.name,
                arguments: tc.function?.arguments || tc.arguments || {},
              }));
            }
          }
        } catch (_) {
          // ignore malformed NDJSON lines
        }
      }
    }

    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer.trim());
        if (parsed.message?.content) {
          fullContent += parsed.message.content;
          if (options.onChunk) options.onChunk(parsed.message.content);
        }
      } catch (_) {}
    }

    // Fallback: If no native tool_calls array was returned by Ollama, extract tool calls from text
    if (!toolCallsResult && fullContent) {
      const { calls, cleanedText } = this.extractToolCallsFromText(fullContent);
      if (calls.length > 0) {
        toolCallsResult = calls;
        fullContent = cleanedText;
      }
    }

    return {
      content: fullContent,
      tool_calls: toolCallsResult,
    };
  }
}
