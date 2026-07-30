import assert from 'node:assert/strict';
import test from 'node:test';
import { WebClient } from './web.js';

const publicLookup = async () => [{ address: '93.184.216.34' }];

test('web search returns concise structured DuckDuckGo results', async () => {
  const html = `
    <div class="result">
      <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Fguide">Example guide</a>
      <a class="result__snippet">A useful <b>example</b> result.</a>
    </div>
  `;
  const client = new WebClient(
    async () => new Response(html, { headers: { 'content-type': 'text/html' } }),
    publicLookup,
  );

  const results = await client.search('example guide');

  assert.deepEqual(results, [{
    title: 'Example guide',
    url: 'https://example.com/guide',
    snippet: 'A useful example result.',
  }]);
});

test('web page reader extracts article content as Markdown', async () => {
  const html = `
    <!doctype html>
    <html>
      <head><title>Fallback title</title></head>
      <body>
        <nav>Navigation noise</nav>
        <article>
          <h1>Small Model Guide</h1>
          <p>This is the useful article content for local models.</p>
          <h2>Details</h2>
          <ul><li>First item</li><li>Second item</li></ul>
        </article>
      </body>
    </html>
  `;
  const client = new WebClient(
    async () => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
    publicLookup,
  );

  const page = await client.readPage('https://example.com/guide');

  assert.equal(page.title, 'Fallback title');
  assert.match(page.markdown, /# Small Model Guide/);
  assert.match(page.markdown, /-\s+First item/);
  assert.doesNotMatch(page.markdown, /Navigation noise/);
});

test('web page reader rejects private network targets before fetching', async () => {
  let fetched = false;
  const client = new WebClient(
    async () => {
      fetched = true;
      return new Response('should not be fetched');
    },
    async () => [{ address: '127.0.0.1' }],
  );

  await assert.rejects(() => client.readPage('http://internal.example/status'), /private network/);
  assert.equal(fetched, false);
});
