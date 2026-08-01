import assert from 'node:assert/strict';
import test from 'node:test';
import { getLinkPresentation } from './linkPresentation.js';

test('builds a domain-specific favicon for web links', () => {
  assert.deepEqual(getLinkPresentation('https://www.youtube.com/watch?v=123'), {
    domain: 'youtube.com',
    faviconUrl: 'https://www.youtube.com/favicon.ico',
    shortUrl: 'youtube.com/watch',
  });
});

test('shortens long web addresses without exposing query strings', () => {
  assert.deepEqual(getLinkPresentation('https://docs.example.com/a/very/long/path/that/keeps/going/past/the/link/limit?token=secret'), {
    domain: 'docs.example.com',
    faviconUrl: 'https://docs.example.com/favicon.ico',
    shortUrl: 'docs.example.com/a/very/long/path/that/keeps/goin…',
  });
});

test('does not request favicons for non-web or invalid links', () => {
  assert.equal(getLinkPresentation('mailto:hello@example.com'), null);
  assert.equal(getLinkPresentation('/local/path'), null);
  assert.equal(getLinkPresentation(undefined), null);
});
