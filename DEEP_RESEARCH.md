# Deep Research

Deep Research is a single agent tool that performs a multi-stage public-web investigation. The model submits one structured request; the runtime plans searches, reads promising pages, follows relevant evidence links, collects requested images, and returns an inspectable evidence bundle for the model to synthesize.

```text
deep_research({ "query": "the complete research question", "image_count": 0 })
```

Use `image_count: 0` when the user did not request images. This is a valid value and does not get converted to one. Explicit positive image quantities are preserved up to the safety ceiling of 60.

## End-to-end overview

```text
User request
    ↓
Agent selects deep_research and creates one tool call
    ↓
Runtime normalizes the request and chooses adaptive budgets
    ↓
Focused searches run concurrently
    ↓
Results are normalized, deduplicated, relevance-ranked, and diversified
    ↓
Selected primary pages are downloaded and converted to readable Markdown
    ↓
Relevant links from those pages are ranked and inspected
    ↓
Evidence and optional attributed images are packaged
    ↓
The UI preserves the complete research trail
    ↓
The model writes an answer using only the inspected evidence
```

The model does not need to coordinate many individual `web_search` and `read_web_page` calls. It calls `deep_research` once, and the tool performs the internal workflow.

## Tool parameters

Only `query` is required. All budgets have adaptive defaults and can be overridden for narrower or broader investigations.

| Parameter | Range | Purpose |
| --- | ---: | --- |
| `query` | required string | The complete research question. |
| `image_count` | 0–60 | Number of relevant, attributed images to collect. Use zero for text-only research. |
| `search_queries` | string array | Optional focused queries inserted after the original question and before generated variants. |
| `search_count` | 1–12 | Maximum number of searches. |
| `page_count` | 1–30 | Maximum number of primary search-result pages selected for inspection. |
| `linked_page_count` | 0–20 | Maximum number of relevant follow-up links inspected from primary pages. |
| `evidence_char_budget` | 4,000–120,000 | Approximate extracted-text budget shared across inspected sources. |

The ranges are safety ceilings for local inference and web crawling. They are not fixed crawl sizes. Search and page budgets are upper bounds: fewer operations may complete when searches return fewer unique relevant results or pages fail to load. The evidence-character budget is approximate because every successful source receives at least 800 characters, as explained below.

## Step-by-step behavior

### 1. Recognize a deep-research request

Requests that explicitly ask for deep, thorough, extensive, or comprehensive research are routed to `deep_research` when the tool is enabled.

Example user request:

```text
Research home battery recycling comprehensively. Compare current methods,
costs, environmental tradeoffs, and unresolved technical problems.
```

The agent should make one call containing the entire question:

```json
{
  "query": "Compare current home battery recycling methods, costs, environmental tradeoffs, and unresolved technical problems.",
  "image_count": 0
}
```

After the tool finishes, the agent is prevented from starting a redundant `deep_research`, `web_search`, or `read_web_page` loop in the same turn. It must synthesize the supplied evidence.

### 2. Normalize the request

Repeated whitespace is collapsed and leading or trailing whitespace is removed. An empty normalized query is rejected.

The runtime also determines image behavior:

- An explicit `image_count` is truncated to an integer and constrained to 0–60.
- If `image_count` is omitted and the query explicitly asks for images, the default is 12.
- If images are not requested, the intended call uses `image_count: 0` and image collection is skipped.

Example:

```json
{
  "query": "  compare   sodium-ion and LFP batteries  ",
  "image_count": 0
}
```

Normalized query:

```text
compare sodium-ion and LFP batteries
```

### 3. Choose adaptive research budgets

When no overrides are supplied, the runtime estimates breadth from the number of question facets. Separators such as `and`, `versus`, `compare`, `including`, commas, semicolons, and question marks indicate additional facets.

The current defaults are calculated as follows:

```text
searches        = clamp(5 + facet count, 1, 10)
primary pages   = clamp(searches × 2, 10, 24)
follow-up pages = clamp(ceil(primary pages ÷ 2), 4, 12)
evidence text   = 48,000 characters shared across inspected sources
```

A simple one-facet question normally produces this plan:

```json
{
  "searches": 6,
  "primary_pages": 12,
  "follow_up_pages": 6,
  "evidence_characters": 48000
}
```

A caller can override any budget without changing the others:

```json
{
  "query": "Compare sodium-ion and LFP grid storage across cost, safety, supply chains, and recycling.",
  "image_count": 0,
  "search_count": 10,
  "page_count": 24,
  "linked_page_count": 12,
  "evidence_char_budget": 90000
}
```

The selected values are returned as `research_budget` and shown in the formatted UI, so the user can verify the actual scope.

### 4. Build focused search queries

The original research question is always the first search. Caller-supplied `search_queries` come next. The runtime then fills the remaining budget with topic-neutral variants such as:

- overview and evidence;
- primary sources;
- independent analysis;
- criticism and limitations;
- latest developments using the current UTC year;
- data and statistics;
- competing perspectives;
- systematic reviews;
- case studies;
- unanswered questions;
- expert analysis.

Image requests instead use image-oriented variants such as galleries, collections, examples, archives, high-resolution results, and source attribution.

Queries are whitespace-normalized, deduplicated, and cut to `search_count`.

Example generated plan for a six-search text investigation:

```text
1. home battery recycling
2. home battery recycling overview evidence
3. home battery recycling primary sources
4. home battery recycling independent analysis
5. home battery recycling criticism limitations
6. home battery recycling latest developments 2026
```

Example with targeted caller-supplied queries:

```json
{
  "query": "Home battery recycling",
  "search_queries": [
    "EU Battery Regulation recycling efficiency primary text",
    "lithium iron phosphate recycling peer reviewed lifecycle assessment",
    "residential battery recycling cost study"
  ],
  "search_count": 6,
  "page_count": 16,
  "linked_page_count": 8,
  "image_count": 0
}
```

The original query remains first, the three supplied queries follow it, and generated variants fill any remaining slots.

### 5. Execute searches and record progress

Searches run with limited concurrency so research is faster without starting an uncontrolled number of requests. Each completion adds a structured event to the research trail:

```json
{
  "phase": "searching",
  "kind": "search",
  "status": "success",
  "label": "home battery recycling primary sources",
  "detail": "8 results"
}
```

A failed search is retained as an error event instead of aborting all other searches:

```json
{
  "phase": "searching",
  "kind": "search",
  "status": "error",
  "label": "home battery recycling cost study",
  "detail": "search provider challenge"
}
```

The progress stream reports the current phase, completed search count, planned queries, result count, inspected pages, image count, and accumulated step events.

### 6. Normalize and deduplicate result URLs

Before ranking, each search-result URL is canonicalized:

- only `http` and `https` URLs are accepted;
- URL fragments are removed;
- common tracking parameters such as `utm_*`, `fbclid`, `gclid`, `ref`, and `source` are removed;
- trailing path slashes are normalized;
- duplicate canonical URLs are collapsed.

For example, these are treated as the same result:

```text
https://example.org/report/?utm_source=newsletter#methods
https://example.org/report
```

The first discovery record is retained, including the search query that found it.

### 7. Rank and diversify primary pages

The original question is tokenized, common low-information words are removed, and simple plural normalization is applied. Candidate titles, snippets, and URLs receive relevance points when they contain query tokens.

Domain diversity is a soft preference rather than an exclusion rule. After a page from one host is selected, other pages from that host receive a temporary ranking penalty. A highly relevant second or third page from the same source can still be selected.

This avoids two undesirable extremes:

- filling the evidence bundle with near-duplicate pages from one website;
- discarding useful pages merely because that website already contributed a source.

Selection continues until `page_count` is reached or no unique candidates remain.

### 8. Read and extract primary pages

Selected pages are read concurrently. The web reader extracts the main human-readable content into bounded Markdown and returns:

- title and final URL;
- author/byline when available;
- excerpt;
- readable Markdown;
- whether the page was truncated;
- discovered links;
- discovered page images.

Successful reads become primary sources with `discovery: "search"`. Failed reads are recorded in `errors` and in the step trail, while other pages continue processing.

Example source metadata:

```json
{
  "id": "S1",
  "title": "Battery recycling lifecycle assessment",
  "url": "https://example.org/research/battery-recycling",
  "byline": "Research Group",
  "discovery": "search",
  "discovered_by": "home battery recycling primary sources"
}
```

### 9. Discover and follow evidence links

The runtime examines links extracted from successful primary pages. It can follow relevant links on the same site or another public website, allowing it to inspect citations and supporting material rather than remaining trapped on the first domain.

Links are skipped when they:

- have already been visited;
- are not public HTTP/HTTPS URLs;
- point to common login, account, privacy, terms, contact, search, tag, category, or author paths;
- have no token overlap with the research question.

Remaining links are scored by relevance. A soft per-parent penalty encourages the crawler to follow evidence from several primary pages instead of taking every follow-up from the same article.

Follow-up pages are one evidence-expansion stage from the primary pages. Successful reads use `discovery: "website_link"` and record the parent page in `discovered_by`.

Example trail event:

```json
{
  "phase": "following_links",
  "kind": "link",
  "status": "success",
  "label": "Recycling methodology appendix",
  "url": "https://research.example/methodology",
  "detail": "Followed from https://example.org/research/battery-recycling"
}
```

### 10. Allocate the evidence-text budget

After successful primary and follow-up reads are known, `evidence_char_budget` is divided across the inspected sources. Each source contributes the beginning of its extracted Markdown up to its allocation, with a minimum allocation of 800 characters per source.

For example, an evidence budget of 48,000 characters across 12 inspected sources gives each source approximately 4,000 characters:

```text
48,000 ÷ 12 = 4,000 characters per source
```

The result marks `content_truncated: true` when either the web reader truncated the original page or the evidence allocation shortened the extracted Markdown.

This budget controls the evidence passed into the local model. Raising it can preserve more source detail but consumes more of the model's context window. Increasing page counts without increasing the evidence budget spreads the same text allowance across more sources.

Because of the 800-character minimum, a very low evidence budget combined with many successfully inspected sources can produce more text than the nominal shared budget. For example, 20 sources receive at least 16,000 characters in total even if `evidence_char_budget` is 4,000. The minimum prevents each source from becoming too short to interpret.

### 11. Collect images only when requested

When `image_count` is greater than zero, the tool examines images from all successfully inspected pages. Image URLs are canonicalized and deduplicated. An image must have at least one relevant query-token match across its alt text, page title, page URL, or image URL.

Collection rotates across pages instead of exhausting one page first. This increases source diversity in the image gallery.

Every returned image remains tied to its source page:

```json
{
  "id": "I1",
  "url": "https://example.org/images/recycling-process.png",
  "alt": "Lithium battery recycling process diagram",
  "source_url": "https://example.org/research/battery-recycling",
  "source_title": "Battery recycling lifecycle assessment"
}
```

Example image request:

```json
{
  "query": "modern sodium-ion grid batteries and recycling facilities",
  "image_count": 8,
  "search_count": 8,
  "page_count": 18,
  "linked_page_count": 8
}
```

If fewer than eight relevant attributed images are available, the result contains the exact number found. The model must not invent missing image or source URLs.

### 12. Determine completion status

The tool returns one of three statuses:

| Status | Meaning |
| --- | --- |
| `complete` | At least one source was inspected and no search/page retrieval errors occurred. |
| `partial` | At least one source was inspected, but one or more searches or page reads failed. |
| `insufficient_evidence` | No source could be successfully inspected. |

A `partial` result can still contain strong usable evidence. The final answer must briefly disclose that some retrieval operations failed. An `insufficient_evidence` result must not be supplemented from model memory or fabricated citations.

### 13. Package the result

The final tool result contains:

```json
{
  "query": "normalized research question",
  "research_date": "2026-08-01",
  "search_queries": ["..."],
  "searches_completed": 6,
  "search_results_found": 42,
  "pages_read": 12,
  "linked_pages_read": 6,
  "research_budget": {
    "searches": 6,
    "primary_pages": 12,
    "follow_up_pages": 6,
    "evidence_characters": 48000
  },
  "sources": ["...source objects..."],
  "images": [],
  "requested_image_count": 0,
  "image_limit": 0,
  "status": "complete",
  "errors": [],
  "steps": ["...ordered research events..."],
  "guidance": "...instructions for evidence-grounded synthesis..."
}
```

`pages_read` includes both primary and successfully followed pages. `linked_pages_read` counts only successful follow-up reads.

### 14. Synthesize the answer

After the tool result is stored in the conversation, the agent receives a continuation instruction to answer the original request. The answer must:

- use only the inspected evidence;
- lead with the central conclusion;
- prefer authoritative or primary evidence when available;
- distinguish source claims from stronger causal conclusions;
- state important limitations and disagreements;
- cite factual claims near the sentences they support;
- disclose partial retrieval when `status` is `partial`;
- avoid a generic source list as a replacement for claim-level citations.

When images were requested, supplied image embeds must be consecutive so the UI can form a gallery, followed by their source-page links.

## Inspecting research in the UI

### While research is running

Expand **Peek into live research steps** in the active Deep Research card. It shows:

- the selected budget and planned search count;
- every completed or failed search;
- each successfully inspected or failed page;
- each followed evidence link;
- each collected image;
- the current phase and aggregate counters.

Tasks can complete out of order because searches and page reads run concurrently. The trail represents actual completion order.

### After research finishes

1. Expand the `deep_research` tool result.
2. Select **Formatted**.
3. Expand **Inspect research trail**.
4. Expand any individual source to see its URL, discovery path, excerpt, extracted evidence, and truncation marker.
5. Select **Raw JSON** to inspect the complete machine-readable payload.

The completed trail is stored with the conversation, so it remains inspectable after the live progress card disappears.

## Practical configuration examples

### Fast, narrow investigation

Use this for a tightly scoped fact where broad crawling adds little value:

```json
{
  "query": "What license does project X currently use?",
  "image_count": 0,
  "search_count": 3,
  "page_count": 5,
  "linked_page_count": 2,
  "evidence_char_budget": 12000
}
```

### Balanced default investigation

Let the runtime choose all research budgets:

```json
{
  "query": "What are the main advantages and limitations of sodium-ion batteries for grid storage?",
  "image_count": 0
}
```

### Broad multi-perspective investigation

Use higher budgets when the question spans technical, economic, regulatory, and environmental dimensions:

```json
{
  "query": "Compare sodium-ion, LFP, and flow batteries for grid storage across cost, safety, supply chains, regulation, recycling, and commercial deployment.",
  "image_count": 0,
  "search_count": 12,
  "page_count": 30,
  "linked_page_count": 20,
  "evidence_char_budget": 120000
}
```

### Research with explicit source angles

Use custom search queries when particular jurisdictions, evidence types, or controversies must be covered:

```json
{
  "query": "Assess the evidence for four-day workweeks.",
  "search_queries": [
    "four day workweek randomized trial productivity",
    "four day week employee wellbeing longitudinal study",
    "four day workweek employer criticism operational limitations",
    "four day week government pilot primary report"
  ],
  "search_count": 9,
  "page_count": 22,
  "linked_page_count": 10,
  "evidence_char_budget": 80000,
  "image_count": 0
}
```

### Image-focused research

```json
{
  "query": "historic Budapest tram designs with archival photographs",
  "image_count": 20,
  "search_count": 10,
  "page_count": 24,
  "linked_page_count": 12,
  "evidence_char_budget": 40000
}
```

## Choosing good budgets

- Increase `search_count` when the topic has several distinct subquestions or terminology varies across sources.
- Increase `page_count` when source diversity matters or search results contain many primary documents.
- Increase `linked_page_count` when useful evidence is likely to be found in citations, appendices, regulations, or methodology pages.
- Increase `evidence_char_budget` when sources are technical and the final answer needs methodological detail.
- Increase `image_count` only when images are part of the requested deliverable.
- Supply `search_queries` when required perspectives might not be discovered reliably from generic variants.

More is not always better. A 120,000-character evidence bundle can exceed the practical context capacity of a small local model once conversation history and the final answer are included. Match the evidence budget to the configured context window.

## Failure behavior

Failures are isolated whenever possible:

- one failed search does not cancel other searches;
- one unreadable page does not discard successful sources;
- duplicate and tracking-decorated URLs do not consume extra page slots;
- unavailable images do not invalidate text research;
- callback/UI errors do not stop the research operation;
- an empty evidence set becomes `insufficient_evidence` rather than a fabricated answer.

Search-provider challenge pages are treated as failures, and the web-search layer may try its configured fallback provider.

## Current information

The agent receives the current UTC date in its system context. Deep Research includes the research date in its result and uses the current year for generated latest-development searches. Words such as “current,” “latest,” and “today” are interpreted relative to that date.

## Web safety

Deep Research inherits the public-web reader's protections:

- only public HTTP/HTTPS targets are accepted;
- private-network targets are blocked;
- redirects are checked;
- page downloads have size and timeout limits;
- common account and navigation links are ignored during evidence expansion;
- web-page text is treated as untrusted evidence, never as instructions for the agent.

These protections should not be removed when increasing research budgets.

## Enabling or disabling Deep Research

Open **Tool Settings → Web Research Tools** and toggle `deep_research`. The setting is persisted by the server. When disabled, the tool is removed from the model's available tool definitions and deep-research prompts do not create a mandatory tool call.

## Reusable research skill

The repository includes `.agent/skills/research-official-sources/SKILL.md`. It guides current-information research toward first-party sources, requires inspection of the underlying pages, and separates verified facts from inference. The skill chooses `deep_research` for broad investigations and the narrower `web_search` plus `read_web_page` workflow for focused checks.

List available skills with `/skills`, or invoke this bundled workflow explicitly from any working directory:

```text
@skill:research-official-sources Fact-check these provider prices and cite the official rate cards.
```

## Example user prompts

- `Deep research the current state of local coding models.`
- `Research battery recycling comprehensively and cite each factual claim.`
- `Investigate this topic thoroughly and include disagreements between sources.`
- `Deep research this subject using at least four distinct evidence angles.`
- `Find 20 attributed archival images and explain the historical context.`
