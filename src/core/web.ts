import dns from 'node:dns/promises';
import net from 'node:net';
import { Readability } from '@mozilla/readability';
import { JSDOM, VirtualConsole } from 'jsdom';
import TurndownService from 'turndown';

const USER_AGENT = 'LocalModelChat/1.1 (+https://github.com/local-model-chat)';
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024;
const MAX_MARKDOWN_CHARS = 24_000;
const MAX_REDIRECTS = 4;

// Web pages frequently contain modern or malformed CSS that jsdom does not
// understand. jsdom reports those non-fatal stylesheet failures to the host
// console by default, sometimes dumping thousands of lines of CSS. Scripts are
// not executed here, so page console output and CSS parser diagnostics are not
// part of the reader's result and should remain isolated from CLI output.
const PAGE_VIRTUAL_CONSOLE = new VirtualConsole();

type FetchLike = typeof fetch;
type LookupLike = (hostname: string) => Promise<Array<{ address: string }>>;

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebPageLink {
  title: string;
  url: string;
  heading?: string | null;
  section?: string | null;
  surroundingText?: string;
  textBefore?: string;
  textAfter?: string;
}

export interface WebPageImage {
  url: string;
  alt: string;
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
  signal?: AbortSignal,
): Promise<{ response: Response; finalUrl: URL; text: string }> {
  let url = parseHttpUrl(rawUrl);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    signal?.throwIfAborted();
    if (validatePublicNetwork) await assertPublicUrl(url, lookup);
    const fetchSignal = signal
      ? AbortSignal.any([AbortSignal.timeout(REQUEST_TIMEOUT_MS), signal])
      : AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html, text/plain;q=0.9' },
      redirect: 'manual',
      signal: fetchSignal,
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

function nearestHeading(anchor: HTMLAnchorElement): string | null {
  let current: Element | null = anchor;
  while (current) {
    let sibling = current.previousElementSibling;
    while (sibling) {
      const heading = sibling.matches('h1, h2, h3, h4, h5, h6')
        ? sibling
        : sibling.querySelector('h1, h2, h3, h4, h5, h6');
      const text = cleanText(heading?.textContent);
      if (text) return text.slice(0, 240);
      sibling = sibling.previousElementSibling;
    }
    current = current.parentElement;
  }
  return null;
}

function linkTextContext(anchor: HTMLAnchorElement): Pick<WebPageLink, 'heading' | 'section' | 'surroundingText' | 'textBefore' | 'textAfter'> {
  const contextElement = anchor.closest('p, li, blockquote, td, dd') || anchor.parentElement;
  const context = cleanText(contextElement?.textContent).slice(0, 700);
  const anchorText = cleanText(anchor.textContent);
  const anchorOffset = anchorText ? context.toLowerCase().indexOf(anchorText.toLowerCase()) : -1;
  const heading = nearestHeading(anchor);
  const sectionElement = anchor.closest('section, article, main, aside');
  const labelledSection = cleanText(
    sectionElement?.getAttribute('aria-label') ||
    (sectionElement?.id ? sectionElement.id.replace(/[-_]+/g, ' ') : ''),
  );
  return {
    heading,
    section: (labelledSection || heading || null)?.slice(0, 240) || null,
    surroundingText: context,
    textBefore: anchorOffset >= 0 ? context.slice(Math.max(0, anchorOffset - 240), anchorOffset).trim() : context.slice(0, 240),
    textAfter: anchorOffset >= 0 ? context.slice(anchorOffset + anchorText.length, anchorOffset + anchorText.length + 240).trim() : '',
  };
}

function extractPageLinks(document: Document, baseUrl: URL): WebPageLink[] {
  const links: WebPageLink[] = [];
  const seen = new Set<string>();
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    try {
      const url = new URL(anchor.getAttribute('href') || '', baseUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
      if (url.username || url.password) continue;
      url.hash = '';
      const normalized = url.toString();
      if (seen.has(normalized)) continue;
      if (/\.(?:pdf|zip|gz|png|jpe?g|gif|webp|svg|mp[34]|avi|mov|woff2?)(?:$|\?)/i.test(url.pathname)) continue;
      seen.add(normalized);
      links.push({
        title: cleanText(anchor.textContent) || url.pathname,
        url: normalized,
        ...linkTextContext(anchor),
      });
      if (links.length >= 40) break;
    } catch (_) {}
  }
  return links;
}

function extractPageImages(document: Document, baseUrl: URL): WebPageImage[] {
  const images: Array<WebPageImage & { score: number; order: number }> = [];
  const seen = new Set<string>();
  const elements = document.querySelectorAll<HTMLImageElement>(
    'img[src], img[data-src], img[data-original], img[data-lazy-src], img[srcset]',
  );
  for (const [order, image] of [...elements].entries()) {
    try {
      const srcset = image.getAttribute('srcset') || '';
      const largestSrcsetUrl = srcset.split(',').at(-1)?.trim().split(/\s+/)[0] || '';
      const rawUrl =
        image.getAttribute('data-original') ||
        image.getAttribute('data-lazy-src') ||
        image.getAttribute('data-src') ||
        largestSrcsetUrl ||
        image.getAttribute('src') ||
        '';
      const url = new URL(rawUrl, baseUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
      if (url.username || url.password) continue;
      const width = Number(image.getAttribute('width') || 0);
      const height = Number(image.getAttribute('height') || 0);
      if ((width > 0 && width < 100) || (height > 0 && height < 100)) continue;
      const urlDimensions = url.pathname.match(/-(\d+)x(\d+)(?=\.[a-z0-9]+$)/i);
      if (urlDimensions && (Number(urlDimensions[1]) < 100 || Number(urlDimensions[2]) < 100)) continue;
      if (/\.(?:svg|ico)(?:$|\?)/i.test(url.pathname)) continue;
      const alt = cleanText(image.getAttribute('alt') || image.getAttribute('title'));
      const context = `${url.pathname} ${alt} ${image.className || ''}`.toLowerCase();
      if (image.closest('nav, header, footer') || /(?:logo|favicon|sprite|avatar|icon|nav[_-]|menu[_-]|tracking|pixel)/i.test(context)) continue;
      const normalizedUrl = url.toString();
      if (seen.has(normalizedUrl)) continue;
      seen.add(normalizedUrl);
      const score =
        (image.closest('article, main, [role="main"]') ? 8 : 0) +
        (alt ? 3 : 0) +
        (width >= 300 ? 2 : 0) +
        (height >= 200 ? 2 : 0) +
        (/meme|program|coding|developer|debug/i.test(context) ? 4 : 0);
      images.push({ url: normalizedUrl, alt, score, order });
    } catch (_) {}
  }
  return images
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, 20)
    .map(({ url, alt }) => ({ url, alt }));
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

function isSearchChallenge(status: number, html: string): boolean {
  return status !== 200 || /anomaly-modal|challenge-form|captcha/i.test(html);
}

function parseDuckDuckGoResults(html: string, searchUrl: string, limit: number): WebSearchResult[] {
  const document = new JSDOM(html, { url: searchUrl, virtualConsole: PAGE_VIRTUAL_CONSOLE }).window.document;
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

function parseBingResults(html: string, searchUrl: string, limit: number): WebSearchResult[] {
  const document = new JSDOM(html, { url: searchUrl, virtualConsole: PAGE_VIRTUAL_CONSOLE }).window.document;
  const results: WebSearchResult[] = [];
  for (const result of document.querySelectorAll('li.b_algo')) {
    const anchor = result.querySelector<HTMLAnchorElement>('h2 a[href]');
    if (!anchor) continue;
    let url: URL;
    try {
      url = new URL(anchor.href, searchUrl);
    } catch {
      continue;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
    results.push({
      title: cleanText(anchor.textContent),
      url: url.toString(),
      snippet: cleanText(result.querySelector('.b_caption p')?.textContent),
    });
    if (results.length >= limit) break;
  }
  return results;
}

function parseYahooResults(html: string, searchUrl: string, limit: number): WebSearchResult[] {
  const document = new JSDOM(html, { url: searchUrl, virtualConsole: PAGE_VIRTUAL_CONSOLE }).window.document;
  const results: WebSearchResult[] = [];
  for (const result of document.querySelectorAll('.dd.algo')) {
    const anchor = result.querySelector<HTMLAnchorElement>('.compTitle a[href]');
    if (!anchor) continue;
    let url: URL;
    try {
      url = new URL(anchor.href, searchUrl);
    } catch {
      continue;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
    results.push({
      title: cleanText(anchor.querySelector('h3')?.textContent || anchor.textContent),
      url: url.toString(),
      snippet: cleanText(result.querySelector('.compText p')?.textContent),
    });
    if (results.length >= limit) break;
  }
  return results;
}

function retainRelevantResults(results: WebSearchResult[], query: string): WebSearchResult[] {
  const tokens = [...new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g) || [])]
    .filter((token) => !['and', 'for', 'from', 'image', 'images', 'latest', 'the', 'with'].includes(token));
  if (tokens.length === 0) return results;
  const minimumMatches = Math.min(2, tokens.length);
  return results.filter((result) => {
    const haystack = `${result.title} ${result.snippet} ${result.url}`.toLowerCase();
    return tokens.filter((token) => haystack.includes(token)).length >= minimumMatches;
  });
}

export class WebClient {
  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    private readonly lookup: LookupLike = (hostname) => dns.lookup(hostname, { all: true }),
  ) {}

  public async search(query: string, maxResults = 5, signal?: AbortSignal): Promise<WebSearchResult[]> {
    signal?.throwIfAborted();
    const normalizedQuery = cleanText(query);
    if (!normalizedQuery) throw new Error('Parameter query is required.');
    const limit = Math.min(Math.max(Math.trunc(maxResults) || 5, 1), 8);
    const errors: string[] = [];
    const duckDuckGoUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(normalizedQuery)}`;
    try {
      const { response, text } = await fetchPublicPage(duckDuckGoUrl, this.fetchImpl, this.lookup, false, signal);
      if (isSearchChallenge(response.status, text)) {
        throw new Error(`challenge response (HTTP ${response.status})`);
      }
      const results = parseDuckDuckGoResults(text, duckDuckGoUrl, limit);
      if (results.length > 0 || /no results/i.test(text)) return results;
      throw new Error('unrecognized response with no result entries');
    } catch (error: any) {
      if (error?.name === 'AbortError' || signal?.aborted) throw error;
      errors.push(`DuckDuckGo: ${error.message}`);
    }

    signal?.throwIfAborted();
    const yahooUrl = `https://search.yahoo.com/search?p=${encodeURIComponent(normalizedQuery)}`;
    try {
      const { response, text } = await fetchPublicPage(yahooUrl, this.fetchImpl, this.lookup, false, signal);
      if (isSearchChallenge(response.status, text)) {
        throw new Error(`challenge response (HTTP ${response.status})`);
      }
      const results = retainRelevantResults(parseYahooResults(text, yahooUrl, limit), normalizedQuery);
      if (results.length > 0 || /no results/i.test(text)) return results;
      throw new Error('unrecognized or irrelevant response with no usable result entries');
    } catch (error: any) {
      if (error?.name === 'AbortError' || signal?.aborted) throw error;
      errors.push(`Yahoo: ${error.message}`);
    }

    signal?.throwIfAborted();
    const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(normalizedQuery)}&setlang=en-US`;
    try {
      const { response, text } = await fetchPublicPage(bingUrl, this.fetchImpl, this.lookup, false, signal);
      if (isSearchChallenge(response.status, text)) {
        throw new Error(`challenge response (HTTP ${response.status})`);
      }
      const results = retainRelevantResults(parseBingResults(text, bingUrl, limit), normalizedQuery);
      if (results.length > 0 || /no results/i.test(text)) return results;
      throw new Error('unrecognized or irrelevant response with no usable result entries');
    } catch (error: any) {
      if (error?.name === 'AbortError' || signal?.aborted) throw error;
      errors.push(`Bing: ${error.message}`);
    }

    throw new Error(`All search providers failed. ${errors.join('; ')}`);
  }

  public async readPage(rawUrl: string, signal?: AbortSignal): Promise<{
    title: string;
    url: string;
    byline: string | null;
    excerpt: string | null;
    markdown: string;
    truncated: boolean;
    links: WebPageLink[];
    images: WebPageImage[];
  }> {
    if (!rawUrl) throw new Error('Parameter url is required.');
    const { finalUrl, text, response } = await fetchPublicPage(
      rawUrl,
      this.fetchImpl,
      this.lookup,
      true,
      signal,
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
        links: [],
        images: [],
      };
    }

    const dom = new JSDOM(text, {
      url: finalUrl.toString(),
      virtualConsole: PAGE_VIRTUAL_CONSOLE,
    });
    const links = extractPageLinks(dom.window.document, finalUrl);
    const imageCandidates = extractPageImages(dom.window.document, finalUrl);
    const images = (await Promise.all(imageCandidates.map(async (image) => {
      try {
        await assertPublicUrl(new URL(image.url), this.lookup);
        return image;
      } catch {
        return null;
      }
    }))).filter((image): image is WebPageImage => image !== null);
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
      links,
      images,
    };
  }
}
