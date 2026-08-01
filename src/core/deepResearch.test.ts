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

test('deep research attaches request-focused AI notes in bounded source batches', async () => {
  const noteBatches: string[][] = [];
  const liveNoteDrafts: string[] = [];
  const liveNoteStats: Array<{ notes: number; tokens: number }> = [];
  const client = {
    async search() {
      return Array.from({ length: 4 }, (_, index) => ({
        title: `Source ${index + 1}`,
        url: `https://source${index + 1}.example/report`,
        snippet: `Evidence ${index + 1}`,
      }));
    },
    async readPage(url: string) {
      return { title: url, url, byline: null, excerpt: 'Relevant excerpt', markdown: `Detailed evidence from ${url}`, truncated: false, links: [], images: [] };
    },
  };
  const runner = new DeepResearchRunner(client, async ({ query, sources }, onChunk) => {
    assert.equal(query, 'compare source evidence');
    noteBatches.push(sources.map((source) => source.id));
    onChunk?.('{"notes":[');
    onChunk?.(`{"source_id":"${sources[0].id}"}`);
    return sources.map((source) => ({
      source_id: source.id,
      relevant: true,
      note: `Relevant to the request: ${source.title}`,
      key_points: [`Evidence from ${source.id}`],
      limitations: null,
    }));
  });

  const result = await runner.run('compare source evidence', 0, (progress) => {
    liveNoteDrafts.push(...progress.note_batches.map((batch) => batch.content));
    liveNoteStats.push({
      notes: progress.note_batches.reduce((total, batch) => total + batch.notes_completed, 0),
      tokens: progress.note_batches.reduce((total, batch) => total + batch.estimated_tokens, 0),
    });
  }, {
    searchCount: 1,
    pageCount: 4,
    linkedPageCount: 0,
  });

  assert.deepEqual(noteBatches.map((batch) => batch.length).sort(), [1, 3]);
  assert.equal(result.note_errors.length, 0);
  assert.ok(liveNoteDrafts.some((draft) => draft.includes('"source_id"')));
  assert.ok(liveNoteStats.some(({ notes }) => notes > 0));
  assert.ok(liveNoteStats.some(({ tokens }) => tokens > 0));
  assert.equal(liveNoteStats.at(-1)?.notes, 4);
  assert.ok(result.sources.every((source) => source.ai_note?.relevant));
  assert.deepEqual(result.sources.map((source) => source.ai_note?.source_id), ['S1', 'S2', 'S3', 'S4']);
});

test('deep research preserves retrieved evidence when AI note extraction fails', async () => {
  const client = {
    async search() {
      return [{ title: 'Source', url: 'https://source.example/report', snippet: 'Evidence' }];
    },
    async readPage(url: string) {
      return { title: 'Source', url, byline: null, excerpt: null, markdown: 'Retrieved evidence', truncated: false, links: [], images: [] };
    },
  };
  const runner = new DeepResearchRunner(client, async () => {
    throw new Error('model unavailable');
  });

  const result = await runner.run('source evidence', 0, undefined, { searchCount: 1, pageCount: 1, linkedPageCount: 0 });

  assert.equal(result.status, 'complete');
  assert.equal(result.sources[0].content, 'Retrieved evidence');
  assert.equal(result.sources[0].ai_note, undefined);
  assert.match(result.note_errors[0], /model unavailable/);
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
    link_depth: 1,
    semantic_link_classification: true,
    link_relevance_threshold: 70,
    evidence_characters: 12_000,
  });
});

test('deep research recursively checks relevant links up to the configured depth and exposes them to notes', async () => {
  const read: string[] = [];
  const noteInputs: any[] = [];
  const client = {
    async search() {
      return [{ title: 'Battery recycling overview', url: 'https://research.example/battery', snippet: 'Battery recycling evidence' }];
    },
    async readPage(url: string) {
      read.push(url);
      if (url.endsWith('/battery')) {
        return {
          title: 'Battery recycling overview', url, byline: null, excerpt: 'Overview', markdown: 'Overview evidence', truncated: false, images: [],
          links: [
            { title: 'Battery recycling methodology', url: 'https://research.example/battery/methodology' },
            { title: 'Privacy policy', url: 'https://research.example/privacy' },
          ],
        };
      }
      if (url.endsWith('/methodology')) {
        return {
          title: 'Battery recycling methodology', url, byline: null, excerpt: 'Method', markdown: 'Method evidence', truncated: false, images: [],
          links: [{ title: 'Battery recycling dataset', url: 'https://data.example/battery-dataset' }],
        };
      }
      return { title: 'Battery recycling dataset', url, byline: null, excerpt: 'Dataset', markdown: 'Dataset evidence', truncated: false, images: [], links: [] };
    },
  };
  const runner = new DeepResearchRunner(client, async (request) => {
    noteInputs.push(...request.sources);
    return request.sources.map((source) => ({ source_id: source.id, relevant: true, note: source.title, key_points: [], limitations: null }));
  });

  const result = await runner.run('battery recycling evidence', 0, undefined, {
    searchCount: 1,
    pageCount: 1,
    linkedPageCount: 4,
    linkDepth: 2,
  });

  assert.deepEqual(read, [
    'https://research.example/battery',
    'https://research.example/battery/methodology',
    'https://data.example/battery-dataset',
  ]);
  assert.equal(result.linked_pages_read, 2);
  assert.equal(result.research_budget.link_depth, 2);
  assert.deepEqual(result.sources.map((source) => source.depth), [0, 1, 2]);
  assert.equal(result.sources[0].relevant_links[0].target_source_id, 'S2');
  assert.equal(result.sources[1].relevant_links[0].target_source_id, 'S3');
  assert.deepEqual(result.sources[0].link_summary, {
    discovered: 2,
    relevant_found: 1,
    relevant_checked: 1,
    relevant_failed: 0,
    not_relevant: 1,
    predicted_relevant: 1,
    uncertain: 0,
    confirmed_relevant: 1,
    low_relevance: 0,
  });
  assert.equal(result.sources[0].discovered_links.find((link) => link.url.endsWith('/privacy'))?.relevance, 'not_relevant');
  assert.equal(noteInputs.find((source) => source.id === 'S1').relevant_links[0].status, 'checked');
});

test('semantic classification uses surrounding context and rejects invented URLs', async () => {
  const read: string[] = [];
  const semanticRequests: any[] = [];
  const classificationProgress: any[] = [];
  const client = {
    async search() {
      return [{ title: 'Battery report', url: 'https://research.example/report', snippet: 'Battery recycling costs' }];
    },
    async readPage(url: string) {
      read.push(url);
      if (url.endsWith('/report')) {
        return {
          title: 'Battery report', url, byline: null, excerpt: 'Cost evidence', markdown: 'Battery recycling cost evidence', truncated: false, images: [],
          links: [{
            title: 'Read more',
            url: 'https://research.example/methodology',
            heading: 'Battery recycling costs',
            section: 'Methods',
            surroundingText: 'The complete methodology and dataset are available here.',
            textBefore: 'The complete methodology',
            textAfter: 'and dataset',
          }],
        };
      }
      return { title: 'Methodology', url, byline: null, excerpt: 'Battery methods', markdown: 'Battery recycling cost methodology and dataset', truncated: false, images: [], links: [] };
    },
  };
  const runner = new DeepResearchRunner(client, undefined, async (request) => {
    semanticRequests.push(request);
    if (request.phase === 'candidate_links') {
      assert.equal(request.links[0].heading, 'Battery recycling costs');
      assert.match(request.links[0].surrounding_text, /complete methodology/);
      return [
        { url: request.links[0].url, classification: 'relevant', relevance_score: 94, confidence: 89, reason: 'The surrounding section identifies the requested methodology.' },
        { url: 'https://invented.example/hallucination', classification: 'relevant', relevance_score: 100, confidence: 100, reason: 'Invented.' },
      ];
    }
    return request.pages.map((page) => ({ url: page.url, classification: 'relevant', relevance_score: 92, confidence: 90, reason: 'Actual content confirms the methodology.' }));
  });

  const result = await runner.run('battery recycling costs', 0, (progress) => {
    if (progress.phase === 'classifying_links') classificationProgress.push(progress.link_analysis);
  }, { searchCount: 1, pageCount: 1, linkedPageCount: 2 });

  assert.deepEqual(read, ['https://research.example/report', 'https://research.example/methodology']);
  assert.equal(semanticRequests.length, 2);
  assert.equal(result.sources[0].discovered_links[0].classification, 'relevant');
  assert.equal(result.sources[0].discovered_links[0].confirmation, 'confirmed_relevant');
  assert.match(result.sources[0].discovered_links[0].reason, /surrounding section/);
  assert.ok(result.sources.every((source) => !source.url.includes('invented.example')));
  assert.ok(classificationProgress.some((progress) => progress?.stage === 'ranking_candidates' && progress.status === 'running'));
  assert.ok(classificationProgress.some((progress) => progress?.stage === 'ranking_candidates' && progress.batches_completed === progress.batches_total));
  assert.ok(classificationProgress.some((progress) => progress?.stage === 'confirming_pages' && progress.items_completed === 1));
});

test('actual-content confirmation prevents low-relevance pages from expanding', async () => {
  const read: string[] = [];
  const client = {
    async search() {
      return [{ title: 'Battery report', url: 'https://example.com/report', snippet: 'Battery research' }];
    },
    async readPage(url: string) {
      read.push(url);
      if (url.endsWith('/report')) return { title: 'Battery report', url, byline: null, excerpt: null, markdown: 'Battery research', truncated: false, images: [], links: [{ title: 'Battery study', url: 'https://example.com/misleading' }] };
      if (url.endsWith('/misleading')) return { title: 'Unrelated sports page', url, byline: null, excerpt: null, markdown: 'Football scores and match reports', truncated: false, images: [], links: [{ title: 'Battery dataset', url: 'https://example.com/should-not-open' }] };
      return { title: 'Should not open', url, byline: null, excerpt: null, markdown: 'Battery dataset', truncated: false, images: [], links: [] };
    },
  };
  const runner = new DeepResearchRunner(client, undefined, async (request) => {
    if (request.phase === 'candidate_links') {
      return request.links.map((link) => ({ url: link.url, classification: 'relevant', relevance_score: 90, confidence: 85, reason: 'Anchor predicts relevance.' }));
    }
    return request.pages.map((page) => ({ url: page.url, classification: 'not_relevant', relevance_score: 8, confidence: 96, reason: 'The fetched page is about sports.' }));
  });

  const result = await runner.run('battery research', 0, undefined, { searchCount: 1, pageCount: 1, linkedPageCount: 4, linkDepth: 2 });

  assert.deepEqual(read, ['https://example.com/report', 'https://example.com/misleading']);
  assert.equal(result.linked_pages_read, 1);
  assert.equal(result.sources[0].discovered_links[0].confirmation, 'low_relevance');
  assert.match(result.sources[0].discovered_links[0].confirmation_reason || '', /sports/);
});

test('semantic classifier failures fall back safely and candidate batches have bounded parallelism', async () => {
  let activeCandidateCalls = 0;
  let maximumCandidateCalls = 0;
  let candidateBatchCount = 0;
  const client = {
    async search() {
      return [{ title: 'Battery index', url: 'https://example.com/index', snippet: 'Battery evidence' }];
    },
    async readPage(url: string) {
      if (url.endsWith('/index')) return {
        title: 'Battery index', url, byline: null, excerpt: null, markdown: 'Battery evidence', truncated: false, images: [],
        links: Array.from({ length: 25 }, (_, index) => ({ title: `Battery evidence ${index}`, url: `https://example.com/battery-${index === 24 ? 0 : index}` })),
      };
      return { title: 'Battery evidence', url, byline: null, excerpt: null, markdown: 'Battery evidence', truncated: false, images: [], links: [] };
    },
  };
  const runner = new DeepResearchRunner(client, undefined, async (request) => {
    if (request.phase === 'candidate_links') {
      candidateBatchCount++;
      activeCandidateCalls++;
      maximumCandidateCalls = Math.max(maximumCandidateCalls, activeCandidateCalls);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeCandidateCalls--;
      throw new Error('malformed model output');
    }
    return [];
  });

  const result = await runner.run('battery evidence', 0, undefined, { searchCount: 1, pageCount: 1, linkedPageCount: 1 });

  assert.equal(candidateBatchCount, 2);
  assert.equal(maximumCandidateCalls, 2);
  assert.equal(result.linked_pages_read, 1);
  assert.match(result.sources[0].discovered_links[0].reason, /Deterministic fallback/);
});

test('semantic classification can be disabled and its relevance threshold is configurable', async () => {
  let classifierCalls = 0;
  const client = {
    async search() {
      return [{ title: 'Research index', url: 'https://example.com/index', snippet: 'Research index' }];
    },
    async readPage(url: string) {
      if (url.endsWith('/index')) return { title: 'Research index', url, byline: null, excerpt: null, markdown: 'Research index', truncated: false, images: [], links: [{ title: 'Open document', url: 'https://example.com/document' }] };
      return { title: 'Battery document', url, byline: null, excerpt: null, markdown: 'Battery evidence', truncated: false, images: [], links: [] };
    },
  };
  const classifier = async (request: any) => {
    classifierCalls++;
    const items = request.phase === 'candidate_links' ? request.links : request.pages;
    return items.map((item: any) => ({ url: item.url, classification: 'relevant' as const, relevance_score: 65, confidence: 80, reason: 'Semantically useful.' }));
  };

  const disabled = await new DeepResearchRunner(client, undefined, classifier).run('battery evidence', 0, undefined, {
    searchCount: 1, pageCount: 1, linkedPageCount: 1, semanticLinkClassification: false,
  });
  assert.equal(classifierCalls, 0);
  assert.equal(disabled.linked_pages_read, 0);

  const enabled = await new DeepResearchRunner(client, undefined, classifier).run('battery evidence', 0, undefined, {
    searchCount: 1, pageCount: 1, linkedPageCount: 1, linkRelevanceThreshold: 60,
  });
  assert.equal(enabled.linked_pages_read, 1);
  assert.equal(enabled.research_budget.link_relevance_threshold, 60);
  assert.equal(enabled.sources[0].discovered_links[0].confirmation, 'confirmed_relevant');
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
