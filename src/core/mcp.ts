import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawn, ChildProcess } from 'child_process';
import { ToolDefinition } from './types.js';

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  disabled?: boolean;
}

export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

export interface McpServerStatus {
  name: string;
  status: 'connected' | 'error' | 'disabled';
  error?: string;
  toolsCount: number;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, any>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number;
  result?: any;
  error?: { code: number; message: string; data?: any };
  method?: string;
  params?: any;
}

class McpServerClient {
  public readonly name: string;
  public readonly config: McpServerConfig;
  private process: ChildProcess | null = null;
  private requestId = 1;
  private pendingRequests = new Map<
    number,
    { resolve: (val: any) => void; reject: (err: any) => void; timer: NodeJS.Timeout }
  >();
  private buffer = '';
  private toolsMap = new Map<string, { originalName: string; definition: ToolDefinition }>();
  public status: 'connected' | 'error' | 'disabled' = 'disabled';
  public lastError?: string;

  constructor(name: string, config: McpServerConfig) {
    this.name = name;
    this.config = config;
  }

  public async start(workingDir: string): Promise<ToolDefinition[]> {
    if (this.config.disabled) {
      this.status = 'disabled';
      return [];
    }

    try {
      const env = { ...process.env, ...(this.config.env || {}) };
      this.process = spawn(this.config.command, this.config.args || [], {
        cwd: workingDir,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.process.on('error', (err) => {
        this.status = 'error';
        this.lastError = `Failed to spawn process: ${err.message}`;
      });

      this.process.on('exit', (code) => {
        if (this.status === 'connected') {
          this.status = 'error';
          this.lastError = `MCP server exited with code ${code}`;
        }
      });

      if (this.process.stdout) {
        this.process.stdout.on('data', (data: Buffer) => {
          this.handleStdoutData(data.toString('utf-8'));
        });
      }

      // Initialize handshake
      await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'local-model-chat', version: '1.1.2' },
      });

      this.sendNotification('notifications/initialized');

      // Fetch tools list
      const toolsResponse = await this.sendRequest('tools/list', {});
      const mcpTools: Array<{ name: string; description?: string; inputSchema?: any }> =
        toolsResponse?.tools || [];

      this.toolsMap.clear();
      const definitions: ToolDefinition[] = [];

      for (const t of mcpTools) {
        const namespacedName = `mcp_${this.name.replace(/[^a-zA-Z0-9_]/g, '_')}_${t.name}`;
        const definition: ToolDefinition = {
          name: namespacedName,
          description: `[MCP: ${this.name}] ${t.description || t.name}`,
          parameters: t.inputSchema || { type: 'object', properties: {} },
        };
        this.toolsMap.set(namespacedName, { originalName: t.name, definition });
        definitions.push(definition);
      }

      this.status = 'connected';
      this.lastError = undefined;
      return definitions;
    } catch (err: any) {
      this.status = 'error';
      this.lastError = err.message || String(err);
      this.stop();
      return [];
    }
  }

  public stop(): void {
    for (const [_, req] of this.pendingRequests) {
      clearTimeout(req.timer);
      req.reject(new Error(`MCP server "${this.name}" stopped.`));
    }
    this.pendingRequests.clear();

    if (this.process) {
      try {
        this.process.kill();
      } catch (_) {}
      this.process = null;
    }
  }

  public hasTool(name: string): boolean {
    return this.toolsMap.has(name);
  }

  public async callTool(namespacedName: string, args: Record<string, any>): Promise<any> {
    const toolInfo = this.toolsMap.get(namespacedName);
    if (!toolInfo) {
      throw new Error(`MCP tool "${namespacedName}" not found on server "${this.name}".`);
    }

    const result = await this.sendRequest('tools/call', {
      name: toolInfo.originalName,
      arguments: args,
    });

    if (result?.isError) {
      const errorContent = (result.content || [])
        .map((c: any) => c.text || JSON.stringify(c))
        .join('\n');
      return { error: errorContent || 'MCP tool execution failed.' };
    }

    if (Array.isArray(result?.content)) {
      const textContents = result.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n');
      if (textContents) return { result: textContents };
      return { result: result.content };
    }

    return result || { result: 'Success' };
  }

  private sendNotification(method: string, params?: Record<string, any>): void {
    if (!this.process || !this.process.stdin) return;
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
    this.process.stdin.write(msg);
  }

  private sendRequest(method: string, params?: Record<string, any>, timeoutMs = 15000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin) {
        return reject(new Error(`MCP server process "${this.name}" is not running.`));
      }

      const id = this.requestId++;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`MCP request "${method}" timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });

      const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
      this.process.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  private handleStdoutData(dataStr: string): void {
    this.buffer += dataStr;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const response: JsonRpcResponse = JSON.parse(trimmed);
        if (response.id !== undefined && this.pendingRequests.has(response.id)) {
          const req = this.pendingRequests.get(response.id)!;
          this.pendingRequests.delete(response.id);
          clearTimeout(req.timer);

          if (response.error) {
            req.reject(new Error(response.error.message || `JSON-RPC error ${response.error.code}`));
          } else {
            req.resolve(response.result);
          }
        }
      } catch (_) {
        // Ignore non-JSON output (stdout logs)
      }
    }
  }
}

export class McpClientManager {
  private clients = new Map<string, McpServerClient>();
  private tools = new Map<string, { client: McpServerClient; definition: ToolDefinition }>();
  private disabledTools = new Set<string>();
  private globalEnabled = true;
  private configPath: string | null = null;
  private workingDir: string;

  constructor(workingDir: string = process.cwd()) {
    this.workingDir = workingDir;
  }

  public setWorkingDir(dir: string): void {
    this.workingDir = dir;
  }

  public setGlobalEnabled(enabled: boolean): void {
    this.globalEnabled = enabled;
  }

  public isGlobalEnabled(): boolean {
    return this.globalEnabled;
  }

  /**
   * Discovers and loads MCP config from:
   * 1. Explicit path if provided
   * 2. Working directory .mcp.json
   * 3. User home ~/.gemini/antigravity/mcp_config.json
   * 4. User home ~/.config/local-model-chat/mcp_config.json
   */
  public async loadConfig(customPath?: string): Promise<{ success: boolean; configPath?: string; count: number; error?: string }> {
    this.stopAll();

    const candidatePaths: string[] = [];
    if (customPath) candidatePaths.push(path.resolve(customPath));
    candidatePaths.push(path.resolve(this.workingDir, '.mcp.json'));
    candidatePaths.push(path.resolve(os.homedir(), '.gemini', 'antigravity', 'mcp_config.json'));
    candidatePaths.push(path.resolve(os.homedir(), '.config', 'local-model-chat', 'mcp_config.json'));

    let chosenPath: string | null = null;
    let configData: McpConfig | null = null;

    for (const p of candidatePaths) {
      try {
        const content = await fs.readFile(p, 'utf-8');
        configData = JSON.parse(content);
        if (configData && typeof configData.mcpServers === 'object') {
          chosenPath = p;
          break;
        }
      } catch (_) {}
    }

    if (!chosenPath || !configData || !configData.mcpServers) {
      return { success: false, error: 'No valid mcpServers configuration file found.', count: 0 };
    }

    this.configPath = chosenPath;
    let totalTools = 0;

    for (const [serverName, serverConfig] of Object.entries(configData.mcpServers)) {
      const client = new McpServerClient(serverName, serverConfig);
      this.clients.set(serverName, client);

      if (!serverConfig.disabled) {
        const definitions = await client.start(this.workingDir);
        for (const def of definitions) {
          this.tools.set(def.name, { client, definition: def });
          totalTools++;
        }
      }
    }

    return { success: true, configPath: this.configPath, count: this.clients.size };
  }

  public getToolDefinitions(): ToolDefinition[] {
    if (!this.globalEnabled) return [];
    return Array.from(this.tools.values())
      .filter((t) => !this.disabledTools.has(t.definition.name))
      .map((t) => t.definition);
  }

  public getAllToolDetails(): Array<{
    name: string;
    serverName: string;
    description: string;
    parameters: any;
    enabled: boolean;
  }> {
    return Array.from(this.tools.entries()).map(([name, entry]) => ({
      name,
      serverName: entry.client.name,
      description: entry.definition.description,
      parameters: entry.definition.parameters,
      enabled: this.globalEnabled && !this.disabledTools.has(name),
    }));
  }

  public toggleTool(name: string, enabled: boolean): void {
    if (enabled) {
      this.disabledTools.delete(name);
    } else {
      this.disabledTools.add(name);
    }
  }

  public hasTool(name: string): boolean {
    return this.globalEnabled && this.tools.has(name) && !this.disabledTools.has(name);
  }

  public async executeTool(name: string, args: Record<string, any>): Promise<any> {
    const entry = this.tools.get(name);
    if (!entry || this.disabledTools.has(name)) {
      return { error: `MCP tool "${name}" is disabled, not registered, or its server is disconnected.` };
    }

    try {
      return await entry.client.callTool(name, args);
    } catch (err: any) {
      return { error: `MCP execution error: ${err.message}` };
    }
  }

  public getServersStatus(): McpServerStatus[] {
    const statusList: McpServerStatus[] = [];
    for (const [name, client] of this.clients.entries()) {
      let toolsCount = 0;
      for (const entry of this.tools.values()) {
        if (entry.client === client && !this.disabledTools.has(entry.definition.name)) toolsCount++;
      }
      statusList.push({
        name,
        status: client.status,
        error: client.lastError,
        toolsCount,
      });
    }
    return statusList;
  }

  public getConfigPath(): string | null {
    return this.configPath;
  }

  public async getRawConfigContent(): Promise<string> {
    if (!this.configPath) return JSON.stringify({ mcpServers: {} }, null, 2);
    try {
      return await fs.readFile(this.configPath, 'utf-8');
    } catch (err: any) {
      return JSON.stringify({ mcpServers: {} }, null, 2);
    }
  }

  public async saveRawConfig(jsonText: string): Promise<{ success: boolean; error?: string }> {
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed || typeof parsed.mcpServers !== 'object') {
        return { success: false, error: 'Invalid JSON: object must contain an "mcpServers" key.' };
      }

      const targetPath = this.configPath || path.resolve(this.workingDir, '.mcp.json');
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, JSON.stringify(parsed, null, 2), 'utf-8');
      
      const loadRes = await this.loadConfig(targetPath);
      return { success: loadRes.success, error: loadRes.error };
    } catch (err: any) {
      return { success: false, error: `Failed to save MCP config: ${err.message}` };
    }
  }

  public stopAll(): void {
    for (const client of this.clients.values()) {
      client.stop();
    }
    this.clients.clear();
    this.tools.clear();
  }
}
