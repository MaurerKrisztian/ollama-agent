import { ChatMessage, OllamaModelInfo, OllamaResponseMetrics, OllamaRunningModelInfo, ToolDefinition, ollamaModelNamesMatch } from './types.js';
export type { OllamaResponseMetrics };

export interface OllamaChatOptions {
  host: string;
  model: string;
  temperature?: number;
  contextWindow?: number;
  enableThinking?: boolean;
  topP?: number;
  topK?: number;
  minP?: number;
  repeatPenalty?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  seed?: number;
  numPredict?: number;
  stop?: string[];
  keepAlive?: string | number;
  numGpu?: number;
  numThread?: number;
  format?: string | object;
  lowVram?: boolean;
  f16Kv?: boolean;
  mirostat?: number;
  mirostatEta?: number;
  mirostatTau?: number;
  messages: Array<{
    role: string;
    content: string;
    name?: string;
    images?: string[];
    tool_calls?: any[];
    tool_call_id?: string;
  }>;
  tools?: ToolDefinition[];
  onChunk?: (chunk: string) => void;
  onThinkingChunk?: (thinkingChunk: string) => void;
  onToolCallChunk?: (toolCalls: Array<{ id: string; name: string; arguments: Record<string, any> }>) => void;
  onToolStreamDelta?: (toolName: string, deltaText: string) => void;
  signal?: AbortSignal;
}



export interface OllamaPullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
  error?: string;
}

export class OllamaClient {
  private host: string;
  private authToken?: string;
  private thinkingSupportCache: Map<string, boolean> = new Map();
  private toolSupportCache: Map<string, boolean> = new Map();

  constructor(host: string = 'http://127.0.0.1:11434', authToken?: string) {
    this.host = host.replace(/\/$/, '');
    this.authToken = authToken?.trim() || undefined;
  }

  public setHost(host: string) {
    this.host = host.replace(/\/$/, '');
    this.thinkingSupportCache.clear();
    this.toolSupportCache.clear();
  }

  public getHost(): string {
    return this.host;
  }

  public setAuthToken(token?: string): void {
    this.authToken = token?.trim() || undefined;
  }

  public hasAuthToken(): boolean {
    return Boolean(this.authToken);
  }

  public getAuthToken(): string | undefined {
    return this.authToken;
  }

  private getHeaders(): Record<string, string> {
    return this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {};
  }

  public async getModels(): Promise<OllamaModelInfo[]> {
    try {
      const res = await fetch(`${this.host}/api/tags`, { headers: this.getHeaders() });
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
      const res = await fetch(`${this.host}/api/ps`, { headers: this.getHeaders() });
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
   * Fetch full model details (Modelfile, parameters, template, model_info) via POST /api/show
   */
  public async getModelDetails(modelName: string): Promise<any> {
    try {
      const res = await fetch(`${this.host}/api/show`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getHeaders(),
        },
        body: JSON.stringify({ name: modelName }),
      });
      if (!res.ok) {
        throw new Error(`Ollama server returned HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err: any) {
      throw new Error(`Failed to fetch model details for "${modelName}": ${err.message}`);
    }
  }

  /**
   * Check if a model supports thinking/reasoning dynamically directly via Ollama API responses.
   * Queries Ollama /api/tags and /api/show for capabilities, template, parameters, and modelfile.
   */
  public async checkModelThinkingSupport(modelName: string): Promise<boolean> {
    if (!modelName) return false;
    const cacheKey = `${this.host}::${modelName}`;
    if (this.thinkingSupportCache.has(cacheKey)) {
      return this.thinkingSupportCache.get(cacheKey)!;
    }

    let isSupported = false;

    try {
      // 1. Inspect model capabilities dynamically returned from Ollama /api/tags
      const models = await this.getModels();
      const targetModel = models.find(
        (m) => ollamaModelNamesMatch(m.name, modelName) || ollamaModelNamesMatch(m.digest, modelName)
      );

      if (targetModel && Array.isArray(targetModel.capabilities)) {
        const caps = targetModel.capabilities.map((c) => (c || '').toLowerCase());
        if (caps.includes('thinking') || caps.includes('reasoning')) {
          isSupported = true;
        }
      }

      // 2. Query Ollama POST /api/show for model capabilities, template, parameters, and modelfile
      if (!isSupported) {
        const details = await this.getModelDetails(modelName);
        if (details) {
          const caps: string[] = Array.isArray(details.capabilities)
            ? details.capabilities.map((c: string) => (c || '').toLowerCase())
            : [];

          if (caps.includes('thinking') || caps.includes('reasoning')) {
            isSupported = true;
          } else {
            const template = (details.template || '').toLowerCase();
            const modelfile = (details.modelfile || '').toLowerCase();
            const parameters = (details.parameters || '').toLowerCase();

            if (
              template.includes('<think>') ||
              template.includes('</think>') ||
              template.includes('.think') ||
              template.includes('.thinking') ||
              template.includes('reasoning_content') ||
              template.includes('<|thought|>') ||
              template.includes('<thought>') ||
              template.includes('<reasoning>') ||
              template.includes('[think]') ||
              modelfile.includes('think') ||
              parameters.includes('think')
            ) {
              isSupported = true;
            }
          }
        }
      }
    } catch (_) {
      // If API query fails, default to false
    }

    this.thinkingSupportCache.set(cacheKey, isSupported);
    return isSupported;
  }

  public markModelToolSupport(modelName: string, supported: boolean): void {
    if (!modelName) return;
    const cacheKey = `${this.host}::${modelName}`;
    this.toolSupportCache.set(cacheKey, supported);
  }

  /**
   * Check if a model natively supports Ollama function tool calling.
   */
  public async checkModelToolSupport(modelName: string): Promise<boolean> {
    if (!modelName) return true;
    const cacheKey = `${this.host}::${modelName}`;
    if (this.toolSupportCache.has(cacheKey)) {
      return this.toolSupportCache.get(cacheKey)!;
    }

    let isSupported = true;

    try {
      const models = await this.getModels();
      const targetModel = models.find(
        (m) => ollamaModelNamesMatch(m.name, modelName) || ollamaModelNamesMatch(m.digest, modelName)
      );

      if (targetModel && Array.isArray(targetModel.capabilities) && targetModel.capabilities.length > 0) {
        const caps = targetModel.capabilities.map((c) => (c || '').toLowerCase());
        isSupported = caps.includes('tools');
      } else {
        const details = await this.getModelDetails(modelName);
        if (details) {
          if (Array.isArray(details.capabilities) && details.capabilities.length > 0) {
            const caps: string[] = details.capabilities.map((c: string) => (c || '').toLowerCase());
            isSupported = caps.includes('tools');
          } else if (details.template || details.modelfile) {
            const template = (details.template || '').toLowerCase();
            const modelfile = (details.modelfile || '').toLowerCase();
            if (
              template.includes('.tools') ||
              template.includes('<tools>') ||
              template.includes('[tools]') ||
              modelfile.includes('tools')
            ) {
              isSupported = true;
            }
          }
        }
      }
    } catch (_) {
      isSupported = true;
    }

    this.toolSupportCache.set(cacheKey, isSupported);
    return isSupported;
  }

  /** Download a model and report Ollama's streamed progress events. */
  public async pullModel(
    modelName: string,
    onProgress?: (progress: OllamaPullProgress) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const res = await fetch(`${this.host}/api/pull`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getHeaders(),
      },
      body: JSON.stringify({ model: modelName, stream: true }),
      signal,
    });

    if (!res.ok) {
      const message = await res.text();
      throw new Error(`Ollama server returned HTTP ${res.status}${message ? `: ${message}` : ''}`);
    }
    if (!res.body) throw new Error('Ollama returned an empty download response.');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const consumeLine = (line: string) => {
      if (!line.trim()) return;
      const progress = JSON.parse(line) as OllamaPullProgress;
      onProgress?.(progress);
      if (progress.error) throw new Error(progress.error);
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) consumeLine(line);
        if (done) break;
      }
      consumeLine(buffer);
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      throw new Error(`Failed to pull model "${modelName}": ${err.message}`);
    } finally {
      reader.releaseLock();
    }
  }

  /** Immediately unload a model from Ollama's RAM/VRAM. */
  public async unloadModel(modelName: string): Promise<void> {
    try {
      const res = await fetch(`${this.host}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getHeaders(),
        },
        body: JSON.stringify({ model: modelName, keep_alive: 0, stream: false }),
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(`Ollama server returned HTTP ${res.status}${message ? `: ${message}` : ''}`);
      }
    } catch (err: any) {
      throw new Error(`Failed to unload model "${modelName}": ${err.message}`);
    }
  }

  /** Create a new model alias from a Modelfile string or base model via POST /api/create */
  public async createModel(name: string, modelfile: string): Promise<void> {
    try {
      const res = await fetch(`${this.host}/api/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getHeaders(),
        },
        body: JSON.stringify({ name, modelfile, stream: false }),
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(`Ollama server returned HTTP ${res.status}${message ? `: ${message}` : ''}`);
      }
      this.thinkingSupportCache.clear();
      this.toolSupportCache.clear();
    } catch (err: any) {
      throw new Error(`Failed to create model "${name}": ${err.message}`);
    }
  }

  /** Copy / clone an existing model tag to a new tag via POST /api/copy */
  public async copyModel(source: string, destination: string): Promise<void> {
    try {
      const res = await fetch(`${this.host}/api/copy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getHeaders(),
        },
        body: JSON.stringify({ source, destination }),
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(`Ollama server returned HTTP ${res.status}${message ? `: ${message}` : ''}`);
      }
    } catch (err: any) {
      throw new Error(`Failed to copy model "${source}" to "${destination}": ${err.message}`);
    }
  }

  /** Delete a local model tag via DELETE /api/delete */
  public async deleteModel(modelName: string): Promise<void> {
    try {
      const res = await fetch(`${this.host}/api/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...this.getHeaders(),
        },
        body: JSON.stringify({ name: modelName }),
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(`Ollama server returned HTTP ${res.status}${message ? `: ${message}` : ''}`);
      }
      this.thinkingSupportCache.clear();
      this.toolSupportCache.clear();
    } catch (err: any) {
      throw new Error(`Failed to delete model "${modelName}": ${err.message}`);
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
    let match: RegExpExecArray | null;

    // 0. Check DeepSeek special token tags: <|tool_call_begin|>function<|tool_sep|>name ... <|tool_call_end|>
    const deepseekRegex = /<\|tool_call_begin\|>(?:function)?<\|tool_sep\|>([a-zA-Z0-9_-]+)[\s\r\n]*(?:```(?:json)?\s*)?(\{[\s\S]*?\})\s*(?:```)?[\s\r\n]*<\|tool_call_end\|>/gi;
    while ((match = deepseekRegex.exec(text)) !== null) {
      try {
        const name = match[1].trim();
        const rawArgs = match[2].trim();
        const parsedArgs = JSON.parse(rawArgs);
        calls.push({
          id: `call_${Date.now()}_${calls.length}`,
          name,
          arguments: parsedArgs.arguments || parsedArgs.parameters || parsedArgs,
        });
      } catch (_) {}
    }

    if (calls.length > 0) {
      cleanedText = text
        .replace(/<\|tool_calls_begin\|>/gi, '')
        .replace(/<\|tool_calls_end\|>/gi, '')
        .replace(/<\|tool_call_begin\|>[\s\S]*?<\|tool_call_end\|>/gi, '')
        .replace(/<\|tool_outputs_begin\|>[\s\S]*/gi, '')
        .trim();
      return { calls, cleanedText };
    }

    // 1. Check XML tags: <tool_call>...</tool_call> or <tool>...</tool>
    const xmlRegex = /<(?:tool_call|tool)>([\s\S]*?)<\/(?:tool_call|tool)>/gi;
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

    // 4. Some smaller models announce an action and then emit a bare tool JSON
    // object without the requested XML wrapper. Scan balanced JSON objects so
    // prose followed by a valid tool call still executes.
    const balancedCallRanges: Array<{ start: number; end: number }> = [];
    for (let start = 0; start < text.length; start++) {
      if (text[start] !== '{') continue;

      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let end = start; end < text.length; end++) {
        const char = text[end];
        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (char === '\\') {
            escaped = true;
          } else if (char === '"') {
            inString = false;
          }
          continue;
        }

        if (char === '"') {
          inString = true;
        } else if (char === '{') {
          depth++;
        } else if (char === '}') {
          depth--;
          if (depth === 0) {
            const candidate = text.slice(start, end + 1);
            try {
              const parsed = JSON.parse(candidate);
              if (
                typeof parsed.name === 'string' &&
                (parsed.arguments !== undefined || parsed.parameters !== undefined) &&
                ((parsed.arguments !== null &&
                  typeof parsed.arguments === 'object' &&
                  !Array.isArray(parsed.arguments)) ||
                  (parsed.parameters !== null &&
                    typeof parsed.parameters === 'object' &&
                    !Array.isArray(parsed.parameters)))
              ) {
                calls.push({
                  id: `call_${Date.now()}_${calls.length}`,
                  name: parsed.name,
                  arguments: parsed.arguments || parsed.parameters || {},
                });
                balancedCallRanges.push({ start, end: end + 1 });
                start = end;
              }
            } catch (_) {}
            break;
          }
        }
      }
    }

    if (calls.length > 0) {
      let cursor = 0;
      const retainedParts: string[] = [];
      for (const range of balancedCallRanges) {
        retainedParts.push(text.slice(cursor, range.start));
        cursor = range.end;
      }
      retainedParts.push(text.slice(cursor));
      cleanedText = retainedParts.join('').trim();
    }

    return { calls, cleanedText };
  }

  public async chatStream(options: OllamaChatOptions): Promise<{
    content: string;
    thinking?: string;
    thinkingTokens?: number;
    tool_calls?: Array<{ id: string; name: string; arguments: Record<string, any> }>;
    metrics?: OllamaResponseMetrics;
  }> {
    const endpoint = `${options.host || this.host}/api/chat`;

    // Map system prompt & tool messages to Ollama format
    const formattedMessages = options.messages.map((m) => {
      const hasToolCalls = Boolean(m.tool_calls && m.tool_calls.length > 0);
      const msgObj: any = {
        role: m.role,
        // Qwen's Ollama template renders assistant content OR tool calls.
        // If both are present, content wins and the tool-call history is lost,
        // leaving subsequent tool results disconnected from their requests.
        content: m.role === 'assistant' && hasToolCalls ? '' : m.content,
      };
      if (m.images && Array.isArray(m.images) && m.images.length > 0) {
        msgObj.images = m.images;
      }
      if (m.role === 'tool' && m.name) {
        msgObj.tool_name = m.name;
      }
      if (hasToolCalls) {
        msgObj.tool_calls = m.tool_calls!.map((tc) => ({
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

    if (options.enableThinking !== undefined) {
      requestBody.think = options.enableThinking;
    }
    if (options.keepAlive !== undefined) {
      requestBody.keep_alive = options.keepAlive;
    }
    if (options.format !== undefined) {
      requestBody.format = options.format;
    }

    requestBody.options = {
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      num_ctx: options.contextWindow ?? 16384,
      ...(options.topP !== undefined ? { top_p: options.topP } : {}),
      ...(options.topK !== undefined ? { top_k: options.topK } : {}),
      ...(options.minP !== undefined ? { min_p: options.minP } : {}),
      ...(options.repeatPenalty !== undefined ? { repeat_penalty: options.repeatPenalty } : {}),
      ...(options.presencePenalty !== undefined ? { presence_penalty: options.presencePenalty } : {}),
      ...(options.frequencyPenalty !== undefined ? { frequency_penalty: options.frequencyPenalty } : {}),
      ...(options.seed !== undefined ? { seed: options.seed } : {}),
      ...(options.numPredict !== undefined ? { num_predict: options.numPredict } : {}),
      ...(options.stop !== undefined && options.stop.length > 0 ? { stop: options.stop } : {}),
      ...(options.numGpu !== undefined ? { num_gpu: options.numGpu } : {}),
      ...(options.numThread !== undefined ? { num_thread: options.numThread } : {}),
      ...(options.lowVram !== undefined ? { low_vram: options.lowVram } : {}),
      ...(options.f16Kv !== undefined ? { f16_kv: options.f16Kv } : {}),
      ...(options.mirostat !== undefined ? { mirostat: options.mirostat } : {}),
      ...(options.mirostatEta !== undefined ? { mirostat_eta: options.mirostatEta } : {}),
      ...(options.mirostatTau !== undefined ? { mirostat_tau: options.mirostatTau } : {}),
    };
    if (options.enableThinking !== undefined) {
      requestBody.options.think = options.enableThinking;
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
      headers: { 'Content-Type': 'application/json', ...this.getHeaders() },
      body: JSON.stringify(requestBody),
      signal: options.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (
        response.status === 400 &&
        requestBody.tools &&
        (errorText.includes('does not support tools') || errorText.includes('do not support tools'))
      ) {
        this.markModelToolSupport(options.model, false);
        return this.chatStream({
          ...options,
          tools: undefined,
        });
      }
      throw new Error(`Ollama Chat Error (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Ollama response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullContent = '';
    let fullThinking = '';
    let toolCallsResult: Array<{ id: string; name: string; arguments: Record<string, any> }> | undefined;
    let metrics: OllamaResponseMetrics | undefined;
    let buffer = '';

    const captureMetrics = (parsed: any) => {
      if (!parsed?.done) return;
      metrics = {
        totalDurationNs: parsed.total_duration,
        loadDurationNs: parsed.load_duration,
        promptEvalCount: parsed.prompt_eval_count,
        promptEvalDurationNs: parsed.prompt_eval_duration,
        evalCount: parsed.eval_count,
        evalDurationNs: parsed.eval_duration,
      };
    };

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
          captureMetrics(parsed);
          if (parsed.message) {
            const thinkingChunk = parsed.message.thinking || parsed.message.reasoning_content || parsed.message.reasoning;
            if (thinkingChunk) {
              fullThinking += thinkingChunk;
              if (options.onThinkingChunk) {
                options.onThinkingChunk(thinkingChunk);
              }
            }

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
              if (options.onToolCallChunk && toolCallsResult) {
                options.onToolCallChunk(toolCallsResult);
              }
              if (options.onToolStreamDelta && toolCallsResult && toolCallsResult[0]) {
                const firstCall = toolCallsResult[0];
                const rawArgsStr = typeof firstCall.arguments === 'string' ? firstCall.arguments : JSON.stringify(firstCall.arguments, null, 2);
                options.onToolStreamDelta(firstCall.name, rawArgsStr);
              }
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
        captureMetrics(parsed);
        const thinkingChunk = parsed.message?.thinking || parsed.message?.reasoning_content || parsed.message?.reasoning;
        if (thinkingChunk) {
          fullThinking += thinkingChunk;
          if (options.onThinkingChunk) options.onThinkingChunk(thinkingChunk);
        }
        if (parsed.message?.content) {
          fullContent += parsed.message.content;
          if (options.onChunk) options.onChunk(parsed.message.content);
        }
      } catch (_) {}
    }

    // Extract inline <think>...</think> if present in fullContent
    if (!fullThinking && fullContent.includes('<think>')) {
      const thinkMatch = fullContent.match(/<think>([\s\S]*?)<\/think>/i);
      if (thinkMatch) {
        fullThinking = thinkMatch[1].trim();
        fullContent = fullContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      }
    }

    // Fallback: If no native tool_calls array was returned by Ollama, extract tool calls from text
    if (!toolCallsResult && fullContent) {
      const { calls, cleanedText } = this.extractToolCallsFromText(fullContent);
      if (calls.length > 0) {
        toolCallsResult = calls;
        fullContent = cleanedText;
      }
    }

    const thinkingTokens = fullThinking ? Math.ceil(fullThinking.length / 4) : 0;

    return {
      content: fullContent,
      thinking: fullThinking || undefined,
      thinkingTokens: thinkingTokens || undefined,
      tool_calls: toolCallsResult,
      metrics,
    };
  }
}
