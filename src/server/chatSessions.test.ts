import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ChatSessionStore } from './chatSessions.js';

test('chat sessions persist messages, titles, activation, and deletion in directory', () => {
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

test('chat sessions auto-migrate legacy monolithic JSON files to session directory', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-model-chat-migrate-'));
  const legacyFile = path.join(tmpDir, 'legacy-sessions.json');
  const sessionsDir = path.join(tmpDir, 'sessions-folder');

  fs.writeFileSync(legacyFile, JSON.stringify({
    activeSessionId: 'sess-1',
    sessions: [
      { id: 'sess-1', title: 'Legacy Session 1', createdAt: 100, updatedAt: 100, messages: [{ id: 'm1', role: 'user', content: 'Hi', timestamp: 100 }] },
      { id: 'sess-2', title: 'Legacy Session 2', createdAt: 200, updatedAt: 200, messages: [{ id: 'm2', role: 'user', content: 'Hello', timestamp: 200 }] },
    ],
  }), 'utf8');

  const store = new ChatSessionStore(sessionsDir, legacyFile);
  assert.equal(store.list().length, 2);
  assert.equal(store.getActiveId(), 'sess-1');
  assert.equal(fs.existsSync(path.join(sessionsDir, 'sess-1.json')), true);
  assert.equal(fs.existsSync(path.join(sessionsDir, 'sess-2.json')), true);
  assert.equal(fs.existsSync(path.join(sessionsDir, 'index.json')), true);
  assert.equal(fs.existsSync(`${legacyFile}.migrated`), true);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
