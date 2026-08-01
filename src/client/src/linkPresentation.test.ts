import assert from 'node:assert/strict';
import test from 'node:test';
import { getLinkPresentation } from './linkPresentation.js';

test('builds a domain-specific favicon for web links', () => {
  assert.deepEqual(getLinkPresentation('https://www.youtube.com/watch?v=123'), {
    domain: 'youtube.com',
    faviconUrl: 'https://www.youtube.com/favicon.ico',
  });
});

test('does not request favicons for non-web or invalid links', () => {
  assert.equal(getLinkPresentation('mailto:hello@example.com'), null);
  assert.equal(getLinkPresentation('/local/path'), null);
  assert.equal(getLinkPresentation(undefined), null);
});
