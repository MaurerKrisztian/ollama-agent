import { test } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { McpClientManager } from './mcp.js';

test('McpClientManager handles missing config gracefully', async () => {
  const manager = new McpClientManager(os.tmpdir());
  const res = await manager.loadConfig('/non/existent/mcp_config.json');
  assert.strictEqual(res.success, false);
  assert.strictEqual(manager.getToolDefinitions().length, 0);
});

test('McpClientManager initializes and executes MCP tool over stdio JSON-RPC', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'));
  const serverScript = path.join(tmpDir, 'mock_server.js');
  
  // Mock Stdio MCP server script
  const scriptContent = `
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    const req = JSON.parse(line);
    if (req.method === 'initialize') {
      console.log(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'mock' } } }));
    } else if (req.method === 'tools/list') {
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        id: req.id,
        result: {
          tools: [
            { name: 'echo_test', description: 'Echoes input', inputSchema: { type: 'object', properties: { msg: { type: 'string' } } } }
          ]
        }
      }));
    } else if (req.method === 'tools/call') {
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        id: req.id,
        result: { content: [{ type: 'text', text: 'Hello ' + (req.params.arguments.msg || '') }] }
      }));
    }
  } catch (err) {}
});
`;
  await fs.writeFile(serverScript, scriptContent, 'utf-8');

  const configPath = path.join(tmpDir, 'mcp_config.json');
  await fs.writeFile(
    configPath,
    JSON.stringify({
      mcpServers: {
        mockServer: {
          command: 'node',
          args: [serverScript],
        },
      },
    }),
    'utf-8'
  );

  const manager = new McpClientManager(tmpDir);
  const loadRes = await manager.loadConfig(configPath);
  assert.strictEqual(loadRes.success, true);

  const tools = manager.getToolDefinitions();
  assert.strictEqual(tools.length, 1);
  assert.strictEqual(tools[0].name, 'mcp_mockServer_echo_test');

  const callRes = await manager.executeTool('mcp_mockServer_echo_test', { msg: 'World' });
  assert.deepStrictEqual(callRes, { result: 'Hello World' });

  manager.stopAll();
  await fs.rm(tmpDir, { recursive: true, force: true });
});
