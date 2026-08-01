import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { AgentEngine } from './agent.js';

async function withAgent(
  responses: Array<{ content: string; tool_calls?: any[] }>,
  run: (agent: AgentEngine, workspace: string) => Promise<void>
) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'local-model-chat-agent-'));
  const agent = new AgentEngine({ workingDir: workspace });
  (agent as any).ollamaClient.chatStream = async () => {
    const response = responses.shift();
    if (!response) throw new Error('Mock Ollama response queue exhausted.');
    return response;
  };
  try {
    await run(agent, workspace);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

test('automatic grounding is traced before an ungrounded edit', async () => {
  await withAgent(
    [
      {
        content: '',
        tool_calls: [{
          id: 'bad-edit',
          name: 'edit_file',
          arguments: {
            relative_path: 'package.json',
            target_text: '"version": "1.0.0"',
            replacement_text: '"version": "2.0.1"',
          },
        }],
      },
      {
        content: '',
        tool_calls: [{
          id: 'good-edit',
          name: 'edit_file',
          arguments: {
            relative_path: 'package.json',
            target_text: '"version": "2.0.0"',
            replacement_text: '"version": "2.0.1"',
          },
        }],
      },
      { content: 'Updated.', tool_calls: [] },
    ],
    async (agent, workspace) => {
      await fs.writeFile(path.join(workspace, 'package.json'), '{"version": "2.0.0"}\n');
      const calls: string[] = [];
      await agent.sendMessage('Edit package.json and update its version to 2.0.1.', {
        onToolStart: (name) => calls.push(name),
      });

      assert.deepEqual(calls, ['read_file', 'edit_file', 'edit_file']);
      assert.match(await fs.readFile(path.join(workspace, 'package.json'), 'utf-8'), /2\.0\.1/);
    }
  );
});

test('ungrounded edit on non-existent file returns file not found error without read_required', async () => {
  await withAgent(
    [
      {
        content: '',
        tool_calls: [{
          id: 'missing-edit',
          name: 'edit_file',
          arguments: {
            relative_path: 'nonexistent.txt',
            target_text: 'foo',
            replacement_text: 'bar',
          },
        }],
      },
      { content: 'Done.', tool_calls: [] },
    ],
    async (agent, workspace) => {
      let toolEndResult: any = null;
      await agent.sendMessage('Edit nonexistent.txt', {
        onToolEnd: (name, result) => {
          if (name === 'edit_file') toolEndResult = result;
        },
      });
      assert.ok(toolEndResult);
      assert.match(toolEndResult.error, /File or directory not found/i);
      assert.equal(toolEndResult.read_required, false);
    }
  );
});

test('working directory info is only added to the model system prompt when enabled', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'local-model-chat-agent-context-'));
  try {
    await fs.mkdir(path.join(workspace, '.agent'));
    await fs.writeFile(path.join(workspace, 'project.txt'), 'project\n');
    await fs.writeFile(path.join(workspace, '.agent', 'AGENTS.md'), 'Always verify tests.\n');
    const agent = new AgentEngine({ workingDir: workspace, showWorkingDirInfo: false });
    const prompts: string[] = [];
    (agent as any).ollamaClient.chatStream = async (request: any) => {
      prompts.push(request.messages[0].content);
      return { content: 'Done.', tool_calls: [] };
    };

    await agent.sendMessage('Hello');
    agent.updateConfig({ showWorkingDirInfo: true });
    await agent.sendMessage('Hello again');

    assert.doesNotMatch(prompts[0], /CURRENT WORKING DIRECTORY CONTEXT/);
    assert.match(prompts[1], /CURRENT WORKING DIRECTORY CONTEXT/);
    assert.match(prompts[1], /- project\.txt/);
    assert.match(prompts[1], /Always verify tests\./);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('explicit numbered steps require repeated executions of the same tool', async () => {
  await withAgent(
    [
      {
        content: '',
        tool_calls: [{
          id: 'step-1',
          name: 'execute_command',
          arguments: { command: 'echo first' },
        }],
      },
      { content: 'The second step is done.', tool_calls: [] },
      {
        content: '',
        tool_calls: [{
          id: 'step-2',
          name: 'execute_command',
          arguments: { command: 'echo second' },
        }],
      },
      { content: 'Finished.', tool_calls: [] },
    ],
    async (agent) => {
      const calls: string[] = [];
      await agent.sendMessage(
        'Step 1: call execute_command with command "echo first". Step 2: call execute_command with command "echo second".',
        { onToolStart: (name) => calls.push(name) }
      );

      assert.deepEqual(calls, ['execute_command', 'execute_command']);
    }
  );
});

test('multi-field edits do not require a post-mutation re-read if already read', async () => {
  await withAgent(
    [
      {
        content: '',
        tool_calls: [{
          id: 'read-before',
          name: 'read_file',
          arguments: { relative_path: 'package.json' },
        }],
      },
      {
        content: '',
        tool_calls: [{
          id: 'partial-edit',
          name: 'edit_file',
          arguments: {
            relative_path: 'package.json',
            target_text: '"name": "old"',
            replacement_text: '"name": "new"',
          },
        }],
      },
      { content: 'Done.', tool_calls: [] },
    ],
    async (agent, workspace) => {
      await fs.writeFile(
        path.join(workspace, 'package.json'),
        '{"name": "old", "version": "1.0.0", "description": "old"}\n'
      );
      const calls: string[] = [];
      await agent.sendMessage(
        'Read package.json, then update its name to "new", its version to "2.0.0", and its description to "new".',
        { onToolStart: (name) => calls.push(name) }
      );

      assert.deepEqual(calls, ['read_file', 'edit_file']);
    }
  );
});

test('reading a web page never creates a local read_file obligation', async () => {
  await withAgent(
    [
      {
        content: '',
        tool_calls: [{
          id: 'read-page',
          name: 'read_web_page',
          arguments: { url: 'https://docs.ollama.com/index' },
        }],
      },
      { content: 'The page explains how to start building with open models.', tool_calls: [] },
    ],
    async (agent) => {
      const executor = agent.getToolExecutor();
      const originalExecuteTool = executor.executeTool.bind(executor);
      executor.executeTool = async (name, args) => {
        if (name === 'read_web_page') {
          return {
            title: 'Ollama documentation',
            url: args.url,
            markdown: 'Start building with open models.',
            truncated: false,
          };
        }
        return originalExecuteTool(name, args);
      };

      const calls: string[] = [];
      const response = await agent.sendMessage('read the web page', {
        onToolStart: (name) => calls.push(name),
      });

      assert.deepEqual(calls, ['read_web_page']);
      assert.match(response, /start building/i);
    }
  );
});

test('a direct URL content request is completed with read_web_page after an unhelpful search', async () => {
  await withAgent(
    [
      {
        content: '',
        tool_calls: [{
          id: 'unnecessary-search',
          name: 'web_search',
          arguments: { query: 'https://docs.ollama.com/index' },
        }],
      },
      { content: 'The search result points to the supplied URL.', tool_calls: [] },
      {
        content: '',
        tool_calls: [{
          id: 'required-page-read',
          name: 'read_web_page',
          arguments: { url: 'https://docs.ollama.com/index' },
        }],
      },
      { content: 'The page contains the Ollama quickstart and API links.', tool_calls: [] },
    ],
    async (agent) => {
      const executor = agent.getToolExecutor();
      const originalExecuteTool = executor.executeTool.bind(executor);
      executor.executeTool = async (name, args) => {
        if (name === 'web_search') {
          return {
            query: args.query,
            result_count: 1,
            results: [{ title: 'Ollama documentation', url: 'https://docs.ollama.com/index' }],
          };
        }
        if (name === 'read_web_page') {
          return {
            title: 'Ollama documentation',
            url: args.url,
            markdown: 'Use the quickstart, then build with the API.',
            truncated: false,
          };
        }
        return originalExecuteTool(name, args);
      };

      const calls: string[] = [];
      await agent.sendMessage('what is the content of the https://docs.ollama.com/index web page', {
        onToolStart: (name) => calls.push(name),
      });

      assert.deepEqual(calls, ['web_search', 'read_web_page']);
    }
  );
});

test('time-sensitive research cannot finish after search snippets without reading a source', async () => {
  await withAgent(
    [
      {
        content: '',
        tool_calls: [{
          id: 'research-search',
          name: 'web_search',
          arguments: { query: 'Node.js 22 security support end date' },
        }],
      },
      { content: 'The search snippet suggests a support date.', tool_calls: [] },
      {
        content: '',
        tool_calls: [{
          id: 'research-read',
          name: 'read_web_page',
          arguments: { url: 'https://benchmark.example/node-release-schedule' },
        }],
      },
      { content: 'Security support ends on 30 April 2027.', tool_calls: [] },
    ],
    async (agent) => {
      const executor = agent.getToolExecutor();
      const originalExecuteTool = executor.executeTool.bind(executor);
      executor.executeTool = async (name, args) => {
        if (name === 'web_search') {
          return {
            query: args.query,
            result_count: 1,
            results: [{
              title: 'Node.js releases',
              url: 'https://benchmark.example/node-release-schedule',
              snippet: 'Official release schedule.',
            }],
          };
        }
        if (name === 'read_web_page') {
          return {
            title: 'Node.js releases',
            url: args.url,
            markdown: 'Node.js 22 security support ends on 30 April 2027.',
            truncated: false,
          };
        }
        return originalExecuteTool(name, args);
      };

      const calls: string[] = [];
      await agent.sendMessage(
        "We're still running Node.js 22 in production. Can you look into how long we have before it stops receiving security updates?",
        { onToolStart: (name) => calls.push(name) }
      );

      assert.deepEqual(calls, ['web_search', 'read_web_page']);
    }
  );
});

test('simple navigational web search does not require opening a result page', async () => {
  await withAgent(
    [
      {
        content: '',
        tool_calls: [{
          id: 'navigation-search',
          name: 'web_search',
          arguments: { query: 'official Ollama website' },
        }],
      },
      { content: 'The official website is https://ollama.com/.', tool_calls: [] },
    ],
    async (agent) => {
      const executor = agent.getToolExecutor();
      const originalExecuteTool = executor.executeTool.bind(executor);
      executor.executeTool = async (name, args) => {
        if (name === 'web_search') {
          return {
            query: args.query,
            result_count: 1,
            results: [{ title: 'Ollama', url: 'https://ollama.com/' }],
          };
        }
        return originalExecuteTool(name, args);
      };

      const calls: string[] = [];
      await agent.sendMessage('Search the web for the official Ollama website and give me its URL.', {
        onToolStart: (name) => calls.push(name),
      });

      assert.deepEqual(calls, ['web_search']);
    }
  );
});

test('deep research prevents a redundant follow-up web-search loop', async () => {
  await withAgent(
    [
      {
        content: '',
        tool_calls: [{
          id: 'deep-research',
          name: 'deep_research',
          arguments: { query: 'funny programmer meme images' },
        }],
      },
      {
        content: '',
        tool_calls: [{
          id: 'redundant-search',
          name: 'web_search',
          arguments: { query: 'programmer memes' },
        }],
      },
      { content: '![Debugging meme](https://images.example/meme.png)\n\n[Source](https://example.com/memes)', tool_calls: [] },
    ],
    async (agent) => {
      const executor = agent.getToolExecutor();
      const originalExecuteTool = executor.executeTool.bind(executor);
      const executed: string[] = [];
      executor.executeTool = async (name, args) => {
        executed.push(name);
        if (name === 'deep_research') {
          return {
            query: args.query,
            status: 'complete',
            searches_completed: 4,
            pages_read: 1,
            linked_pages_read: 0,
            sources: [{ id: 'S1', title: 'Memes', url: 'https://example.com/memes' }],
            images: [{
              id: 'I1',
              url: 'https://images.example/meme.png',
              alt: 'Debugging meme',
              source_url: 'https://example.com/memes',
              source_title: 'Memes',
            }],
            errors: [],
          };
        }
        return originalExecuteTool(name, args);
      };

      const results: any[] = [];
      const response = await agent.sendMessage('Deep research funny programmer meme images.', {
        onToolEnd: (_name, result) => results.push(result),
      });

      assert.deepEqual(executed, ['deep_research']);
      assert.equal(results[1]?.repeated_web_research, true);
      assert.match(response, /!\[Debugging meme\]\(https:\/\/images\.example\/meme\.png\)/);
      assert.match(response, /https:\/\/example\.com\/memes/);
    },
  );
});

test('deep research continuation repeats the original request after a large tool result', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'local-model-chat-deep-reminder-'));
  try {
    const agent = new AgentEngine({ workingDir: workspace });
    const requests: any[] = [];
    let executedDeepResearchArgs: any = null;
    let callIndex = 0;
    (agent as any).ollamaClient.chatStream = async (request: any) => {
      requests.push(request);
      callIndex++;
      if (callIndex === 1) {
        return {
          content: '',
          tool_calls: [{
            id: 'deep-research',
            name: 'deep_research',
            arguments: { query: 'funny programmer meme images' },
          }],
        };
      }
      return { content: 'Here are the requested meme images.', tool_calls: [] };
    };

    const executor = agent.getToolExecutor();
    executor.executeTool = async (_name, args) => {
      executedDeepResearchArgs = args;
      return ({
      query: 'funny programmer meme images',
      status: 'complete',
      searches_completed: 4,
      pages_read: 7,
      linked_pages_read: 2,
      sources: [{ id: 'S1', title: 'Memes', url: 'https://example.com/memes', content: 'x'.repeat(20_000) }],
      images: [{ id: 'I1', url: 'https://images.example/meme.png', alt: 'Debugging meme' }],
      errors: [],
      });
    };

    const originalRequest = 'Make deep research and collect 55 funny programmer meme images.';
    await agent.sendMessage(originalRequest);

    assert.equal(executedDeepResearchArgs.image_count, 55);
    const continuation = requests[1].messages.at(-1)?.content || '';
    assert.match(continuation, /Do not ask the user to repeat the topic/);
    assert.match(continuation, new RegExp(originalRequest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test('maxLoops: 0 allows unlimited tool call iterations without loop exhaustion', async () => {
  const responses = Array.from({ length: 12 }, (_, i) => ({
    content: '',
    tool_calls: [{
      id: `call-${i}`,
      name: 'list_files',
      arguments: {},
    }],
  }));
  responses.push({ content: 'Finished 12 tool calls.', tool_calls: [] });

  await withAgent(responses, async (agent) => {
    agent.updateConfig({ maxLoops: 0 });
    const calls: string[] = [];
    const response = await agent.sendMessage('Perform list_files repeatedly.', {
      onToolStart: (name) => calls.push(name),
    });

    assert.equal(calls.length, 12);
    assert.equal(response, 'Finished 12 tool calls.');
  });
});

test('reaching maxLoops limit triggers warning text and onMaxLoopsReached callback', async () => {
  const responses = Array.from({ length: 5 }, (_, i) => ({
    content: '',
    tool_calls: [{
      id: `call-${i}`,
      name: 'list_files',
      arguments: {},
    }],
  }));

  await withAgent(responses, async (agent) => {
    agent.updateConfig({ maxLoops: 2 });
    let reportedLimit: number | null = null;
    const response = await agent.sendMessage('Perform list_files repeatedly.', {
      onMaxLoopsReached: (limit) => {
        reportedLimit = limit;
      },
    });

    assert.equal(reportedLimit, 2);
    assert.ok(response.includes('Max tool call iterations limit reached'));
  });
});

test('agent applies tool profile and pruning configuration', () => {
  const agent = new AgentEngine({
    complexityProfile: 'advanced',
    pruningConfig: {
      enabled: false,
      pruneSupersededReads: false,
      invalidateOnMutation: false,
      enableToolTTL: false,
      terminalOutputTTLTurns: 2,
      webOutputTTLTurns: 3,
    },
  });

  assert.equal(agent.getConfig().complexityProfile, 'advanced');
  assert.deepEqual(agent.getContextManager().getPruningConfig(), {
    enabled: false,
    pruneSupersededReads: false,
    invalidateOnMutation: false,
    enableToolTTL: false,
    terminalOutputTTLTurns: 2,
    webOutputTTLTurns: 3,
  });

  agent.updateConfig({
    complexityProfile: 'medium',
    pruningConfig: {
      enabled: true,
      pruneSupersededReads: true,
      invalidateOnMutation: true,
      enableToolTTL: true,
      terminalOutputTTLTurns: 7,
      webOutputTTLTurns: 9,
    },
  });
  assert.equal(agent.getConfig().complexityProfile, 'medium');
  assert.equal(agent.getContextManager().getPruningConfig().terminalOutputTTLTurns, 7);
});

test('agent omits disabled built-in tools from the model toolset', () => {
  const agent = new AgentEngine({ enabledTools: { deep_research: false } });
  assert.equal(agent.getActiveTools().some((tool) => tool.name === 'deep_research'), false);

  agent.updateConfig({ enabledTools: { deep_research: true, execute_command: false } });
  assert.equal(agent.getActiveTools().some((tool) => tool.name === 'deep_research'), true);
  assert.equal(agent.getActiveTools().some((tool) => tool.name === 'execute_command'), false);
});

test('agent defaults to 25 maximum tool-call iterations', () => {
  const agent = new AgentEngine();
  assert.equal(agent.getConfig().maxLoops, 25);
});
