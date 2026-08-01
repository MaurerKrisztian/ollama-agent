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

test('web search falls back to Yahoo when DuckDuckGo returns a challenge page', async () => {
  const requests: string[] = [];
  const client = new WebClient(
    async (input) => {
      const url = String(input);
      requests.push(url);
      if (url.includes('duckduckgo.com')) {
        return new Response('<div class="anomaly-modal">challenge</div>', {
          status: 202,
          headers: { 'content-type': 'text/html' },
        });
      }
      return new Response(`
        <div class="dd algo">
          <div class="compTitle"><a href="https://example.com/memes"><h3>Programmer memes</h3></a></div>
          <div class="compText"><p>A collection of funny programmer memes.</p></div>
        </div>
      `, { headers: { 'content-type': 'text/html' } });
    },
    publicLookup,
  );

  const results = await client.search('programmer memes');

  assert.equal(requests.length, 2);
  assert.match(requests[1], /yahoo\.com/);
  assert.deepEqual(results, [{
    title: 'Programmer memes',
    url: 'https://example.com/memes',
    snippet: 'A collection of funny programmer memes.',
  }]);
});

test('web search reports provider failures instead of treating challenge pages as empty results', async () => {
  const client = new WebClient(
    async () => new Response('<form class="challenge-form">captcha</form>', {
      status: 202,
      headers: { 'content-type': 'text/html' },
    }),
    publicLookup,
  );

  await assert.rejects(() => client.search('programmer memes'), /All search providers failed.*challenge response/);
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

test('web page reader returns bounded navigable page links', async () => {
  const html = `
    <html><body><article>
      <h2>Battery recycling costs</h2>
      <p>The complete methodology and dataset are in the <a href="/guide/details#section">Detailed guide</a> for this study.</p>
      <a href="mailto:test@example.com">Email</a>
      <a href="/asset.pdf">PDF</a>
    </article></body></html>
  `;
  const client = new WebClient(
    async () => new Response(html, { headers: { 'content-type': 'text/html' } }),
    publicLookup,
  );

  const page = await client.readPage('https://example.com/guide');
  assert.deepEqual(page.links, [{
    title: 'Detailed guide',
    url: 'https://example.com/guide/details',
    heading: 'Battery recycling costs',
    section: 'Battery recycling costs',
    surroundingText: 'The complete methodology and dataset are in the Detailed guide for this study.',
    textBefore: 'The complete methodology and dataset are in the',
    textAfter: 'for this study.',
  }]);
});

test('web page reader returns useful absolute image URLs', async () => {
  const html = `
    <html><body><article>
      <img src="/images/programmer-meme.png" alt="Programmer debugging meme" width="640" height="480">
      <img src="/tiny-icon.png" alt="Icon" width="32" height="32">
      <img src="data:image/png;base64,abc" alt="Inline image">
    </article></body></html>
  `;
  const client = new WebClient(
    async () => new Response(html, { headers: { 'content-type': 'text/html' } }),
    publicLookup,
  );

  const page = await client.readPage('https://example.com/memes');

  assert.deepEqual(page.images, [{
    url: 'https://example.com/images/programmer-meme.png',
    alt: 'Programmer debugging meme',
  }]);
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
