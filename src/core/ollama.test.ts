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
