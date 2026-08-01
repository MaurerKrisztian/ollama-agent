import assert from 'node:assert/strict';
import test from 'node:test';
import { DeepResearchRunner, buildResearchQueries } from './deepResearch.js';

test('deep research uses several searches and follows relevant evidence links', async () => {
  const searched: string[] = [];
  const read: string[] = [];
  const client = {
    async search(query: string) {
      searched.push(query);
      return [
        { title: 'Solar evidence', url: 'https://energy.example/solar', snippet: 'Solar energy evidence and costs.' },
        { title: 'Grid analysis', url: 'https://grid.example/report', snippet: 'Independent grid analysis.' },
      ];
    },
    async readPage(url: string) {
      read.push(url);
      return {
        title: url.includes('grid') ? 'Grid analysis' : 'Solar evidence',
        url,
        byline: null,
        excerpt: 'Evidence summary',
        markdown: `Research content from ${url}`,
        truncated: false,
        images: url === 'https://energy.example/solar'
          ? [{ url: 'https://energy.example/images/solar-chart.png', alt: 'Solar cost chart' }]
          : [],
        links: url === 'https://energy.example/solar'
          ? [
              { title: 'Solar cost methodology', url: 'https://energy.example/solar/cost-methodology?utm_source=test' },
              { title: 'Privacy', url: 'https://energy.example/privacy' },
              { title: 'External', url: 'https://other.example/solar' },
            ]
          : [],
      };
    },
  };

  const result = await new DeepResearchRunner(client).run('solar energy costs', 1);

  assert.equal(searched.length, 6);
  assert.equal(result.searches_completed, 6);
  assert.equal(result.search_results_found, 12);
  assert.equal(result.pages_read, 4);
  assert.equal(result.linked_pages_read, 2);
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.images, [{
    id: 'I1',
    url: 'https://energy.example/images/solar-chart.png',
    alt: 'Solar cost chart',
    source_url: 'https://energy.example/solar',
    source_title: 'Solar evidence',
  }]);
  assert.ok(read.includes('https://energy.example/solar/cost-methodology'));
  assert.equal(result.sources.at(-1)?.discovery, 'website_link');
  assert.deepEqual(result.sources.map((source) => source.id), ['S1', 'S2', 'S3', 'S4']);
});

test('deep research query generation stays simple, dated, and bounded', () => {
  const queries = buildResearchQueries('  battery   recycling  ', 2030);
  assert.equal(queries[0], 'battery recycling');
  assert.equal(queries.length, 6);
  assert.ok(queries.every((query) => query.startsWith('battery recycling')));
  assert.ok(queries.includes('battery recycling latest developments 2030'));
});

test('deep research uses topic-neutral evidence and perspective searches', () => {
  const queries = buildResearchQueries('what should I eat to lose weight', 2030);
  assert.equal(queries.length, 6);
  assert.ok(queries.includes('what should I eat to lose weight primary sources'));
  assert.ok(queries.includes('what should I eat to lose weight criticism limitations'));
});

test('deep research uses image-oriented query variants for image requests', () => {
  const queries = buildResearchQueries('funny programmer meme images', 2030);
  assert.deepEqual(queries, [
    'funny programmer meme images',
    'funny programmer meme images gallery',
    'funny programmer meme images collection',
    'funny programmer meme images examples',
    'funny programmer meme images archive',
    'funny programmer meme images high resolution',
  ]);
});

test('deep research supports a caller-adjustable shared evidence budget', async () => {
  const client = {
    async search() {
      return [{ title: 'Long source', url: 'https://example.com/report', snippet: 'Long evidence' }];
    },
    async readPage(url: string) {
      return {
        title: 'Long source',
        url,
        byline: null,
        excerpt: null,
        markdown: 'x'.repeat(10_000),
        truncated: false,
        links: [],
        images: [],
      };
    },
  };

  const result = await new DeepResearchRunner(client).run('long report', 0, undefined, { evidenceCharBudget: 4_000 });
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].content.length, 4_000);
  assert.equal(result.sources[0].content_truncated, true);
  assert.equal(result.research_budget.evidence_characters, 4_000);
});

test('deep research accepts custom search and crawl budgets', async () => {
  const searched: string[] = [];
  const client = {
    async search(query: string) {
      searched.push(query);
      return [{ title: query, url: `https://example.com/${searched.length}`, snippet: query }];
    },
    async readPage(url: string) {
      return { title: url, url, byline: null, excerpt: null, markdown: 'evidence', truncated: false, links: [], images: [] };
    },
  };

  const result = await new DeepResearchRunner(client).run('complex topic', 0, undefined, {
    searchQueries: ['custom facet one', 'custom facet two'],
    searchCount: 3,
    pageCount: 2,
    linkedPageCount: 0,
    evidenceCharBudget: 12_000,
  });

  assert.deepEqual(searched, ['complex topic', 'custom facet one', 'custom facet two']);
  assert.equal(result.pages_read, 2);
  assert.deepEqual(result.research_budget, {
    searches: 3,
    primary_pages: 2,
    follow_up_pages: 0,
    evidence_characters: 12_000,
  });
});

test('deep research marks an empty run as insufficient evidence', async () => {
  const client = {
    async search() {
      throw new Error('provider challenge');
    },
    async readPage() {
      throw new Error('should not be called');
    },
  };

  const result = await new DeepResearchRunner(client).run('unavailable topic');

  assert.equal(result.status, 'insufficient_evidence');
  assert.equal(result.sources.length, 0);
  assert.equal(result.images.length, 0);
  assert.match(result.guidance, /Do not claim that research succeeded/);
  assert.ok(result.errors.length > 0);
});

test('deep research excludes unrelated images discovered on linked pages', async () => {
  const client = {
    async search() {
      return [{ title: 'Programming memes', url: 'https://example.com/memes', snippet: 'Coding and developer memes' }];
    },
    async readPage(url: string) {
      if (url.endsWith('/geography')) {
        return {
          title: 'Geography quiz',
          url,
          byline: null,
          excerpt: null,
          markdown: 'Geography questions',
          truncated: false,
          links: [],
          images: [{ url: 'https://example.com/geography.jpg', alt: 'World geography quiz' }],
        };
      }
      return {
        title: 'Programming memes',
        url,
        byline: null,
        excerpt: null,
        markdown: 'Funny coding memes',
        truncated: false,
        links: [
          { title: 'Developer debugging memes', url: 'https://example.com/debugging' },
          { title: 'Geography quiz', url: 'https://example.com/geography' },
        ],
        images: [{ url: 'https://example.com/debugging-meme.jpg', alt: 'Developer debugging meme' }],
      };
    },
  };

  const result = await new DeepResearchRunner(client).run('funny programmer meme images');

  assert.ok(result.images.some((image) => image.url.endsWith('/debugging-meme.jpg')));
  assert.ok(result.images.every((image) => !image.url.endsWith('/geography.jpg')));
});

test('deep research honors requested image counts up to the maximum of 60', async () => {
  const client = {
    async search() {
      return [{ title: 'Programming meme gallery', url: 'https://example.com/memes', snippet: 'Developer coding memes' }];
    },
    async readPage(url: string) {
      return {
        title: 'Programming meme gallery',
        url,
        byline: null,
        excerpt: null,
        markdown: 'Programming memes',
        truncated: false,
        links: [],
        images: Array.from({ length: 60 }, (_, index) => ({
          url: `https://example.com/programmer-meme-${index + 1}.jpg`,
          alt: `Developer coding meme ${index + 1}`,
        })),
      };
    },
  };

  const requested = await new DeepResearchRunner(client).run('funny programmer meme images', 55);
  const capped = await new DeepResearchRunner(client).run('funny programmer meme images', 100);

  assert.equal(requested.images.length, 55);
  assert.equal(requested.requested_image_count, 55);
  assert.equal(capped.images.length, 60);
  assert.equal(capped.image_limit, 60);
});

test('deep research accepts zero images without silently changing it to one', async () => {
  const client = {
    async search() {
      return [{ title: 'Nutrition guidance', url: 'https://example.com/guide', snippet: 'Evidence-based guidance' }];
    },
    async readPage(url: string) {
      return {
        title: 'Nutrition guidance',
        url,
        byline: null,
        excerpt: null,
        markdown: 'Nutrition evidence',
        truncated: false,
        links: [],
        images: [{ url: 'https://example.com/food.jpg', alt: 'Healthy food' }],
      };
    },
  };

  const result = await new DeepResearchRunner(client).run('what should I eat to lose weight', 0);

  assert.equal(result.requested_image_count, 0);
  assert.equal(result.image_limit, 0);
  assert.deepEqual(result.images, []);
  assert.match(result.guidance, /did not request images/);
  assert.ok(result.steps.some((step) => step.kind === 'search'));
});
