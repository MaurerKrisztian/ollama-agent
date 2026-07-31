import assert from 'node:assert/strict';
import test from 'node:test';
import { ContextManager } from './context.js';

test('effective system prompt distinguishes command information from execution authorization', () => {
  const prompt = new ContextManager().getEffectiveSystemPrompt(true);

  assert.match(prompt, /Asking what a command is/);
  assert.match(prompt, /does NOT authorize execution/);
  assert.match(prompt, /explicitly asks to run\/execute/);
});

test('ContextManager initializes default pruning config and allows configuration changes', () => {
  const cm = new ContextManager();
  const config = cm.getPruningConfig();

  assert.strictEqual(config.enabled, true);
  assert.strictEqual(config.pruneSupersededReads, true);
  assert.strictEqual(config.invalidateOnMutation, true);
  assert.strictEqual(config.enableToolTTL, true);

  cm.setPruningConfig({ enabled: false });
  assert.strictEqual(cm.getPruningConfig().enabled, false);
});

test('Strategy 1: Superseded File Read Pruning (Latest-Only)', () => {
  const cm = new ContextManager();

  // Assistant requests first read
  cm.addMessage({
    role: 'assistant',
    content: '',
    tool_calls: [{ id: 'call_1', name: 'read_file', arguments: { relative_path: 'src/main.ts' } }],
  });
  const firstRead = cm.addMessage({
    role: 'tool',
    name: 'read_file',
    tool_call_id: 'call_1',
    content: 'console.log("v1");',
  });

  assert.strictEqual(firstRead.content, 'console.log("v1");');

  // Assistant requests second read for the same file
  cm.addMessage({
    role: 'assistant',
    content: '',
    tool_calls: [{ id: 'call_2', name: 'read_file', arguments: { relative_path: 'src/main.ts' } }],
  });
  const secondRead = cm.addMessage({
    role: 'tool',
    name: 'read_file',
    tool_call_id: 'call_2',
    content: 'console.log("v2");',
  });

  // Verify first read was pruned and second read remains active
  const messages = cm.getMessages();
  const prunedMsg = messages.find((m) => m.id === firstRead.id);
  const activeMsg = messages.find((m) => m.id === secondRead.id);

  assert.match(prunedMsg!.content, /\[Context Pruned: Content of 'src\/main\.ts' superseded by a newer read_file tool response\.\]/);
  assert.strictEqual(activeMsg!.content, 'console.log("v2");');
});

test('Strategy 2: Post-Mutation Invalidation (Prune on File Edit)', () => {
  const cm = new ContextManager();

  // Read file
  cm.addMessage({
    role: 'assistant',
    content: '',
    tool_calls: [{ id: 'call_read', name: 'read_file', arguments: { relative_path: 'src/config.ts' } }],
  });
  const readMsg = cm.addMessage({
    role: 'tool',
    name: 'read_file',
    tool_call_id: 'call_read',
    content: 'const port = 8080;',
  });

  // Edit file
  cm.addMessage({
    role: 'assistant',
    content: '',
    tool_calls: [{ id: 'call_edit', name: 'edit_file', arguments: { relative_path: 'src/config.ts', target_text: '8080', replacement_text: '3000' } }],
  });
  cm.addMessage({
    role: 'tool',
    name: 'edit_file',
    tool_call_id: 'call_edit',
    content: 'Successfully edited src/config.ts',
  });

  const messages = cm.getMessages();
  const updatedReadMsg = messages.find((m) => m.id === readMsg.id);

  assert.match(updatedReadMsg!.content, /\[Context Pruned: Pre-edit content of 'src\/config\.ts' \(modified by edit_file\)\.\]/);
});

test('Strategy 3: Tool Output TTL & Category-Based Pruning', () => {
  const cm = new ContextManager(undefined, undefined, { terminalOutputTTLTurns: 2 });

  cm.addMessage({
    role: 'assistant',
    content: '',
    tool_calls: [{ id: 'call_cmd', name: 'execute_command', arguments: { command: 'ls -la' } }],
  });
  const cmdMsg = cm.addMessage({
    role: 'tool',
    name: 'execute_command',
    tool_call_id: 'call_cmd',
    content: 'file1.txt\nfile2.txt',
  });

  // Turn 1
  cm.addMessage({ role: 'user', content: 'What files are there?' });
  cm.addMessage({ role: 'assistant', content: 'There are two files.' });
  assert.strictEqual(cm.getMessages().find((m) => m.id === cmdMsg.id)!.content, 'file1.txt\nfile2.txt');

  // Turn 2 (reaches TTL = 2)
  cm.addMessage({ role: 'user', content: 'Can you edit file1?' });
  assert.match(
    cm.getMessages().find((m) => m.id === cmdMsg.id)!.content,
    /\[Context Pruned: Output of 'execute_command' expired after 2 user turns/
  );
});

test('Disabling pruning preserves all tool outputs intact', () => {
  const cm = new ContextManager(undefined, undefined, { enabled: false });

  cm.addMessage({
    role: 'assistant',
    content: '',
    tool_calls: [{ id: 'c1', name: 'read_file', arguments: { relative_path: 'app.ts' } }],
  });
  const read1 = cm.addMessage({ role: 'tool', name: 'read_file', tool_call_id: 'c1', content: 'v1' });

  cm.addMessage({
    role: 'assistant',
    content: '',
    tool_calls: [{ id: 'c2', name: 'read_file', arguments: { relative_path: 'app.ts' } }],
  });
  const read2 = cm.addMessage({ role: 'tool', name: 'read_file', tool_call_id: 'c2', content: 'v2' });

  assert.strictEqual(cm.getMessages().find((m) => m.id === read1.id)!.content, 'v1');
  assert.strictEqual(cm.getMessages().find((m) => m.id === read2.id)!.content, 'v2');
});
