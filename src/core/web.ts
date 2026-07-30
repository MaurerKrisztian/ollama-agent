import dns from 'node:dns/promises';
import net from 'node:net';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';

const USER_AGENT = 'LocalModelChat/1.1 (+https://github.com/local-model-chat)';
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024;
const MAX_MARKDOWN_CHARS = 24_000;
const MAX_REDIRECTS = 4;

type FetchLike = typeof fetch;
type LookupLike = (hostname: string) => Promise<Array<{ address: string }>>;

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }

  const normalized = address.toLowerCase().split('%')[0];
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('::ffff:127.') ||
    normalized.startsWith('::ffff:10.') ||
    normalized.startsWith('::ffff:192.168.')
  );
}

function parseHttpUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('URL must be a valid absolute HTTP or HTTPS URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS URLs are supported.');
  }
  if (url.username || url.password) throw new Error('URLs containing credentials are not supported.');
  return url;
}

async function assertPublicUrl(url: URL, lookup: LookupLike): Promise<void> {
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('Local and private network URLs are not allowed.');
  }
  const addresses = net.isIP(hostname) ? [{ address: hostname }] : await lookup(hostname);
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('Local and private network URLs are not allowed.');
  }
}

async function readLimitedText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > MAX_DOWNLOAD_BYTES) {
    throw new Error(`Page is larger than the ${MAX_DOWNLOAD_BYTES / 1024 / 1024}MB download limit.`);
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > MAX_DOWNLOAD_BYTES) {
      await reader.cancel();
      throw new Error(`Page is larger than the ${MAX_DOWNLOAD_BYTES / 1024 / 1024}MB download limit.`);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

async function fetchPublicPage(
  rawUrl: string,
  fetchImpl: FetchLike,
  lookup: LookupLike,
  validatePublicNetwork: boolean,
): Promise<{ response: Response; finalUrl: URL; text: string }> {
  let url = parseHttpUrl(rawUrl);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    if (validatePublicNetwork) await assertPublicUrl(url, lookup);
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html, text/plain;q=0.9' },
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`Redirect response ${response.status} has no Location header.`);
      if (redirect === MAX_REDIRECTS) throw new Error('Too many redirects.');
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) throw new Error(`Request failed with HTTP ${response.status}.`);
    const contentType = response.headers.get('content-type')?.toLowerCase() || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      throw new Error(`Unsupported content type: ${contentType || 'unknown'}.`);
    }
    return { response, finalUrl: url, text: await readLimitedText(response) };
  }
  throw new Error('Too many redirects.');
}

function cleanText(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function unwrapDuckDuckGoUrl(href: string, baseUrl: string): string | null {
  try {
    const url = new URL(href, baseUrl);
    const wrapped = url.searchParams.get('uddg');
    const candidate = wrapped ? new URL(wrapped) : url;
    return candidate.protocol === 'http:' || candidate.protocol === 'https:' ? candidate.toString() : null;
  } catch {
    return null;
  }
}

export class WebClient {
  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    private readonly lookup: LookupLike = (hostname) => dns.lookup(hostname, { all: true }),
  ) {}

  public async search(query: string, maxResults = 5): Promise<WebSearchResult[]> {
    const normalizedQuery = cleanText(query);
    if (!normalizedQuery) throw new Error('Parameter query is required.');
    const limit = Math.min(Math.max(Math.trunc(maxResults) || 5, 1), 8);
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(normalizedQuery)}`;
    const { text } = await fetchPublicPage(searchUrl, this.fetchImpl, this.lookup, false);
    const document = new JSDOM(text, { url: searchUrl }).window.document;
    const results: WebSearchResult[] = [];

    for (const result of document.querySelectorAll('.result')) {
      const anchor = result.querySelector<HTMLAnchorElement>('.result__a');
      const url = anchor ? unwrapDuckDuckGoUrl(anchor.href, searchUrl) : null;
      if (!anchor || !url) continue;
      results.push({
        title: cleanText(anchor.textContent),
        url,
        snippet: cleanText(result.querySelector('.result__snippet')?.textContent),
      });
      if (results.length >= limit) break;
    }
    return results;
  }

  public async readPage(rawUrl: string): Promise<{
    title: string;
    url: string;
    byline: string | null;
    excerpt: string | null;
    markdown: string;
    truncated: boolean;
  }> {
    if (!rawUrl) throw new Error('Parameter url is required.');
    const { finalUrl, text, response } = await fetchPublicPage(
      rawUrl,
      this.fetchImpl,
      this.lookup,
      true,
    );
    const contentType = response.headers.get('content-type')?.toLowerCase() || '';
    if (contentType.includes('text/plain')) {
      const markdown = text.trim().slice(0, MAX_MARKDOWN_CHARS);
      return {
        title: finalUrl.hostname,
        url: finalUrl.toString(),
        byline: null,
        excerpt: null,
        markdown,
        truncated: text.trim().length > markdown.length,
      };
    }

    const dom = new JSDOM(text, { url: finalUrl.toString() });
    const fallbackTitle = cleanText(dom.window.document.title) || finalUrl.hostname;
    const article = new Readability(dom.window.document).parse();
    const sourceHtml = article?.content || dom.window.document.body?.innerHTML || '';
    const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
    turndown.remove(['script', 'style', 'noscript', 'form', 'nav', 'footer']);
    const fullMarkdown = turndown.turndown(sourceHtml).replace(/\n{3,}/g, '\n\n').trim();
    const markdown = fullMarkdown.slice(0, MAX_MARKDOWN_CHARS);

    return {
      title: cleanText(article?.title) || fallbackTitle,
      url: finalUrl.toString(),
      byline: cleanText(article?.byline) || null,
      excerpt: cleanText(article?.excerpt) || null,
      markdown,
      truncated: fullMarkdown.length > markdown.length,
    };
  }
}
