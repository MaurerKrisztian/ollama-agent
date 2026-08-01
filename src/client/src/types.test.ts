import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeOllamaModelName, ollamaModelNamesMatch } from './types.js';

test('Ollama model matching treats an implicit latest tag as equivalent', () => {
  assert.equal(normalizeOllamaModelName(' Phi4-Mini:latest '), 'phi4-mini');
  assert.equal(ollamaModelNamesMatch('phi4-mini', 'phi4-mini:latest'), true);
  assert.equal(ollamaModelNamesMatch('qwen3.5:9b', 'qwen3.5:27b'), false);
  assert.equal(ollamaModelNamesMatch(undefined, 'phi4-mini'), false);
});
