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
  assert.strictEqual(config.enableToolTTL, false);

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

test('Strategy 1: Range-Aware Read Pruning (Non-overlapping slice reads are retained)', () => {
  const cm = new ContextManager();

  // Read lines 1-100
  cm.addMessage({
    role: 'assistant',
    content: '',
    tool_calls: [{ id: 'call_1', name: 'read_file', arguments: { relative_path: 'bigfile.ts', start_line: 1, end_line: 100 } }],
  });
  const firstRead = cm.addMessage({
    role: 'tool',
    name: 'read_file',
    tool_call_id: 'call_1',
    content: 'lines 1 to 100 content',
  });

  // Read lines 101-200 (disjoint range)
  cm.addMessage({
    role: 'assistant',
    content: '',
    tool_calls: [{ id: 'call_2', name: 'read_file', arguments: { relative_path: 'bigfile.ts', start_line: 101, end_line: 200 } }],
  });
  const secondRead = cm.addMessage({
    role: 'tool',
    name: 'read_file',
    tool_call_id: 'call_2',
    content: 'lines 101 to 200 content',
  });

  const messages = cm.getMessages();
  const msg1 = messages.find((m) => m.id === firstRead.id);
  const msg2 = messages.find((m) => m.id === secondRead.id);

  // Both non-overlapping range reads must be retained intact
  assert.strictEqual(msg1!.content, 'lines 1 to 100 content');
  assert.strictEqual(msg2!.content, 'lines 101 to 200 content');
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
  const cm = new ContextManager(undefined, undefined, { enableToolTTL: true, terminalOutputTTLTurns: 2 });

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

test('zero web output TTL disables expiry', () => {
  const cm = new ContextManager(undefined, undefined, { webOutputTTLTurns: 0 });
  cm.addMessage({
    role: 'assistant',
    content: '',
    tool_calls: [{ id: 'call_web', name: 'web_search', arguments: { query: 'evidence' } }],
  });
  const result = cm.addMessage({
    role: 'tool',
    name: 'web_search',
    tool_call_id: 'call_web',
    content: 'persistent evidence',
  });
  for (let turn = 0; turn < 20; turn++) {
    cm.addMessage({ role: 'user', content: `Follow-up ${turn}` });
    cm.addMessage({ role: 'assistant', content: 'Continue.' });
  }
  assert.equal(cm.getMessages().find((message) => message.id === result.id)?.content, 'persistent evidence');
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

test('compactWithSummary retains recent turns and builds structured state message', () => {
  const cm = new ContextManager();
  cm.addMessage({ role: 'user', content: 'Turn 1 User' });
  cm.addMessage({ role: 'assistant', content: 'Turn 1 Assistant' });
  cm.addMessage({ role: 'user', content: 'Turn 2 User' });
  cm.addMessage({ role: 'assistant', content: 'Turn 2 Assistant' });

  const compactMsg = cm.compactWithSummary('Test State Summary', 2);
  const messages = cm.getMessages();

  assert.equal(messages.length, 3);
  assert.equal(messages[0].id, compactMsg.id);
  assert.match(messages[0].content, /COMPACTED CONVERSATION/);
  assert.equal(messages[1].content, 'Turn 2 User');
  assert.equal(messages[2].content, 'Turn 2 Assistant');
});
