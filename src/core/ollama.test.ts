import assert from 'node:assert/strict';
import test from 'node:test';
import { OllamaClient } from './ollama.js';

test('fallback parser extracts every bare JSON tool call in one response', () => {
  const client = new OllamaClient();
  const text = [
    'I will make both changes.',
    '{"name":"edit_file","arguments":{"relative_path":"package.json","target_text":"old","replacement_text":"new"}}',
    '{"name":"edit_file","arguments":{"relative_path":"package.json","target_text":"before","replacement_text":"after"}}',
  ].join('\n');

  const parsed = (client as any).extractToolCallsFromText(text);

  assert.equal(parsed.calls.length, 2);
  assert.deepEqual(
    parsed.calls.map((call: any) => call.arguments.target_text),
    ['old', 'before']
  );
  assert.equal(parsed.cleanedText, 'I will make both changes.');
});

test('fallback parser does not treat ordinary named JSON data as a tool call', () => {
  const client = new OllamaClient();
  const text = '{"name":"ai-chat","version":"1.1.1","description":"an app"}';

  const parsed = (client as any).extractToolCallsFromText(text);

  assert.equal(parsed.calls.length, 0);
  assert.equal(parsed.cleanedText, text);
});

test('chatStream retains native Ollama timing and token metrics', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response([
    JSON.stringify({ message: { role: 'assistant', content: 'done' }, done: false }),
    JSON.stringify({
      message: { role: 'assistant', content: '' },
      done: true,
      total_duration: 500_000_000,
      load_duration: 100_000_000,
      prompt_eval_count: 42,
      prompt_eval_duration: 150_000_000,
      eval_count: 12,
      eval_duration: 250_000_000,
    }),
    '',
  ].join('\n'), { status: 200 });

  try {
    const result = await new OllamaClient().chatStream({
      host: 'http://benchmark.invalid',
      model: 'fixture',
      messages: [{ role: 'user', content: 'hello' }],
    });
    assert.equal(result.content, 'done');
    assert.deepEqual(result.metrics, {
      totalDurationNs: 500_000_000,
      loadDurationNs: 100_000_000,
      promptEvalCount: 42,
      promptEvalDurationNs: 150_000_000,
      evalCount: 12,
      evalDurationNs: 250_000_000,
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('pullModel parses streamed progress split across response chunks', async () => {
  const originalFetch = global.fetch;
  const encoder = new TextEncoder();
  global.fetch = async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('{"status":"pulling manifest"}\n{"status":"downloading","total":100,'));
      controller.enqueue(encoder.encode('"completed":45}\n{"status":"success"}\n'));
      controller.close();
    },
  }), { status: 200 });

  try {
    const progress: any[] = [];
    await new OllamaClient().pullModel('fixture:latest', (event) => progress.push(event));
    assert.deepEqual(progress, [
      { status: 'pulling manifest' },
      { status: 'downloading', total: 100, completed: 45 },
      { status: 'success' },
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('pullModel surfaces errors returned inside a progress stream', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response('{"error":"model not found"}\n', { status: 200 });

  try {
    await assert.rejects(
      () => new OllamaClient().pullModel('missing:model'),
      /model not found/
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('unloadModel requests an immediate keep-alive expiry', async () => {
  const originalFetch = global.fetch;
  let requestUrl = '';
  let requestInit: RequestInit | undefined;
  global.fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response('{}', { status: 200 });
  };

  try {
    await new OllamaClient('http://ollama.test').unloadModel('phi4-mini:latest');
    assert.equal(requestUrl, 'http://ollama.test/api/generate');
    assert.equal(requestInit?.method, 'POST');
    assert.deepEqual(JSON.parse(String(requestInit?.body)), {
      model: 'phi4-mini:latest',
      keep_alive: 0,
      stream: false,
    });
  } finally {
    global.fetch = originalFetch;
  }
});
