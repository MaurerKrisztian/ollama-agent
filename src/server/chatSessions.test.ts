import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ChatSessionStore } from './chatSessions.js';

test('chat sessions persist messages, titles, activation, and deletion', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-model-chat-sessions-'));
  const file = path.join(dir, 'sessions.json');
  const store = new ChatSessionStore(file);
  const firstId = store.getActiveId();

  store.saveActive([{ id: 'one', role: 'user', content: 'Build multi session chat', timestamp: 1 }]);
  assert.equal(store.getActive().title, 'Build multi session chat');

  const second = store.create('Second chat');
  store.saveActive([{ id: 'two', role: 'assistant', content: 'Hello', timestamp: 2 }]);
  assert.equal(store.list().length, 2);

  const reloaded = new ChatSessionStore(file);
  assert.equal(reloaded.getActiveId(), second.id);
  assert.equal(reloaded.getActive().messages.length, 1);
  assert.equal(reloaded.activate(firstId)?.messages[0].content, 'Build multi session chat');

  const detached = reloaded.create('Detached tab chat', false);
  assert.equal(reloaded.getActiveId(), firstId);
  reloaded.save(detached.id, [{ id: 'three', role: 'user', content: 'Other tab', timestamp: 3 }]);
  assert.equal(reloaded.getSession(detached.id)?.messages[0].content, 'Other tab');

  reloaded.delete(firstId);
  assert.equal(reloaded.list().length, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});
