import assert from 'node:assert/strict';
import test from 'node:test';
import { ContextManager } from './context.js';

test('effective system prompt distinguishes command information from execution authorization', () => {
  const prompt = new ContextManager().getEffectiveSystemPrompt(true);

  assert.match(prompt, /Asking what a command is/);
  assert.match(prompt, /does NOT authorize execution/);
  assert.match(prompt, /explicitly asks to run\/execute/);
});
