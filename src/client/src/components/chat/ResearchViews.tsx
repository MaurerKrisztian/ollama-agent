import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, Sparkles, Globe, ExternalLink, Eye, ChevronDown, ChevronRight, XCircle, CheckCircle2, Loader2, Square, FileText, Brain, Image as ImageIcon, CornerDownRight, X, Check, Copy, Info } from 'lucide-react';
import { getLinkPresentation } from '../../linkPresentation';
import { MarkdownContent } from './MessageContent';

export const WebsiteFavicon: React.FC<{ url: string; size?: number }> = ({ url, size = 16 }) => {
  const presentation = getLinkPresentation(url);

  return (
    <span aria-hidden="true" style={{ position: 'relative', display: 'grid', placeItems: 'center', width: `${size}px`, height: `${size}px`, flexShrink: 0, overflow: 'hidden', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.12)' }}>
      <Globe size={Math.max(10, size - 5)} color="#7dd3fc" />
      {presentation && (
        <img
          src={presentation.faviconUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
          style={{ position: 'absolute', inset: '2px', width: `${size - 4}px`, height: `${size - 4}px`, objectFit: 'contain' }}
        />
      )}
    </span>
  );
};

export const CompactWebsiteLink: React.FC<{ url: string; color?: string }> = ({ url, color = '#7dd3fc' }) => {
  const presentation = getLinkPresentation(url);
  if (!presentation) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={url}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', minWidth: 0, maxWidth: '100%', color, textDecoration: 'none', fontFamily: 'var(--font-code)', fontSize: '0.66rem' }}
    >
      <WebsiteFavicon url={url} size={15} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{presentation.shortUrl}</span>
      <ExternalLink size={9} style={{ flexShrink: 0 }} />
    </a>
  );
};

export const WebSearchResultsView: React.FC<{
  query: string;
  results: Array<{ title: string; url: string; snippet: string }>;
  mostRelevantPages?: Array<{ title?: string; url?: string; markdown?: string; character_count?: number }>;
}> = ({ query, results, mostRelevantPages = [] }) => {
  const [expandedPageIndex, setExpandedPageIndex] = useState<number | null>(null);

  return (
    <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Query Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          background: 'rgba(15, 23, 42, 0.6)',
          borderRadius: '6px',
          border: '1px solid rgba(20, 184, 166, 0.2)',
          fontSize: '0.775rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
          <Search size={13} color="var(--accent-teal)" />
          <span style={{ color: 'var(--text-muted)' }}>Query:</span>
          <span style={{ fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-code)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            "{query}"
          </span>
        </div>
        <span
          style={{
            fontSize: '0.7rem',
            padding: '2px 8px',
            borderRadius: '10px',
            background: 'rgba(20, 184, 166, 0.15)',
            color: 'var(--accent-teal)',
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {results.length} result{results.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Side Drift Auto-Fetch UI Badge & Content Drawer */}
      {mostRelevantPages.length > 0 ? (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            background: 'linear-gradient(135deg, rgba(14, 116, 144, 0.18), rgba(99, 102, 241, 0.12))',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <Sparkles size={14} color="#7dd3fc" />
            <span style={{ fontWeight: 700, color: '#7dd3fc', fontSize: '0.8rem' }}>
              ⚡ Side Drift Auto-Fetched {mostRelevantPages.length} Relevant Page{mostRelevantPages.length === 1 ? '' : 's'}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              (Full markdown page attached to model context)
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {mostRelevantPages.map((page, idx) => {
              const isExpanded = expandedPageIndex === idx;
              return (
                <div
                  key={idx}
                  style={{
                    borderRadius: '6px',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      gap: '8px',
                    }}
                  >
                    <a
                      href={page.url || '#'}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        color: '#38bdf8',
                        fontSize: '0.75rem',
                        textDecoration: 'none',
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <Globe size={12} color="#38bdf8" />
                      <span>{page.title || page.url || `Page ${idx + 1}`}</span>
                      <ExternalLink size={10} style={{ opacity: 0.8 }} />
                    </a>

                    {page.markdown && (
                      <button
                        type="button"
                        onClick={() => setExpandedPageIndex(isExpanded ? null : idx)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 7px',
                          borderRadius: '4px',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                          background: isExpanded ? 'rgba(56, 189, 248, 0.2)' : 'rgba(15, 23, 42, 0.4)',
                          color: '#7dd3fc',
                          fontSize: '0.68rem',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        <Eye size={10} />
                        <span>{isExpanded ? 'Hide Page' : 'Preview Page'}</span>
                        <ChevronDown size={10} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
                      </button>
                    )}
                  </div>

                  {isExpanded && page.markdown && (
                    <div
                      style={{
                        padding: '10px 12px',
                        borderTop: '1px solid rgba(56, 189, 248, 0.2)',
                        maxHeight: '260px',
                        overflowY: 'auto',
                        background: 'rgba(2, 6, 23, 0.7)',
                        fontSize: '0.75rem',
                      }}
                    >
                      <MarkdownContent content={page.markdown} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            background: 'rgba(15, 23, 42, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--text-dim)',
            fontSize: '0.73rem',
          }}
        >
          <Sparkles size={12} color="var(--text-dim)" />
          <span>Side Drift: 0 search results met relevance threshold for auto-page reading.</span>
        </div>
      )}

      {/* Results Cards List */}
      {results.length === 0 ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px' }}>
          No search results found.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {results.map((r, idx) => {
            let domain = '';
            try {
              domain = new URL(r.url).hostname.replace(/^www\./, '');
            } catch (_) {}

            return (
              <div
                key={idx}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: 'rgba(15, 23, 42, 0.5)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: '#38bdf8',
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      lineHeight: 1.3,
                    }}
                  >
                    <Globe size={13} style={{ flexShrink: 0, color: 'var(--accent-teal)' }} />
                    <span>{r.title}</span>
                    <ExternalLink size={11} style={{ flexShrink: 0, opacity: 0.7 }} />
                  </a>
                  {domain && (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontFamily: 'var(--font-code)',
                        color: 'var(--text-dim)',
                        background: 'rgba(30, 41, 59, 0.6)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        flexShrink: 0,
                      }}
                    >
                      {domain}
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.45 }}>
                  {r.snippet}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const WebPageReaderView: React.FC<{
  title?: string;
  url?: string;
  markdown?: string;
}> = ({ title, url, markdown }) => (
  <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
    {url && (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.775rem' }}>
        <Globe size={13} color="var(--accent-teal)" />
        <a href={url} target="_blank" rel="noreferrer" style={{ color: '#38bdf8', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>{title || url}</span>
          <ExternalLink size={11} />
        </a>
      </div>
    )}
    {markdown && (
      <div style={{ padding: '12px', background: 'rgba(15, 23, 42, 0.5)', borderRadius: '8px', border: '1px solid var(--border-color)', maxHeight: '360px', overflowY: 'auto' }}>
        <MarkdownContent content={markdown} />
      </div>
    )}
  </div>
);

export const ResearchTrail: React.FC<{
  steps?: Array<{ id?: number; phase?: string; kind?: string; status?: string; label?: string; url?: string; detail?: string }>;
  searchQueries?: string[];
  errors?: string[];
  live?: boolean;
}> = ({ steps = [], searchQueries = [], errors = [], live = false }) => (
  <details open={live ? true : undefined} style={{ marginTop: '10px', border: '1px solid rgba(125, 211, 252, 0.18)', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.35)', overflow: 'hidden' }}>
    <summary style={{ padding: '8px 10px', color: '#7dd3fc', cursor: 'pointer', fontSize: '0.74rem', fontWeight: 650 }}>
      {live ? 'Peek into live research steps' : 'Inspect research trail'}
      <span style={{ marginLeft: '6px', color: 'var(--text-muted)', fontWeight: 400 }}>
        ({steps.length || searchQueries.length} events{errors.length ? `, ${errors.length} errors` : ''})
      </span>
    </summary>
    <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '320px', overflowY: 'auto' }}>
      {steps.length > 0 ? steps.map((step, index) => (
        <div key={`${step.id || index}-${step.label}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', padding: '6px 8px', borderRadius: '6px', background: 'rgba(2, 6, 23, 0.32)', fontSize: '0.71rem' }}>
          {step.status === 'error'
            ? <XCircle size={12} color="#fb7185" style={{ marginTop: '2px', flexShrink: 0 }} />
            : step.status === 'success'
              ? <CheckCircle2 size={12} color="#2dd4bf" style={{ marginTop: '2px', flexShrink: 0 }} />
              : <Search size={12} color="#7dd3fc" style={{ marginTop: '2px', flexShrink: 0 }} />}
          <div style={{ minWidth: 0, flex: 1 }}>
            {step.url ? (
              <>
                <a href={step.url} target="_blank" rel="noreferrer" style={{ color: step.status === 'error' ? '#fda4af' : '#bae6fd', textDecoration: 'none', overflowWrap: 'anywhere' }}>{step.label || getLinkPresentation(step.url)?.shortUrl || step.url}</a>
                <span style={{ display: 'block', marginTop: '3px' }}>
                  <CompactWebsiteLink url={step.url} color={step.status === 'error' ? '#fda4af' : '#7dd3fc'} />
                </span>
              </>
            ) : (
              <span style={{ color: step.status === 'error' ? '#fda4af' : 'var(--text-main)', overflowWrap: 'anywhere' }}>{step.label}</span>
            )}
            {step.detail && <span style={{ display: 'block', marginTop: '2px', color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>{step.detail}</span>}
          </div>
          {step.phase && <span style={{ color: 'var(--text-dim)', fontSize: '0.64rem', flexShrink: 0 }}>{step.phase.replace('_', ' ')}</span>}
        </div>
      )) : searchQueries.map((searchQuery, index) => (
        <div key={`${index}-${searchQuery}`} style={{ color: 'var(--text-muted)', fontSize: '0.71rem', padding: '3px 8px' }}>
          {index + 1}. {searchQuery}
        </div>
      ))}
      {errors.length > 0 && steps.every((step) => step.status !== 'error') && errors.map((error, index) => (
        <div key={`${index}-${error}`} style={{ color: '#fda4af', fontSize: '0.71rem', padding: '5px 8px', borderRadius: '6px', background: 'rgba(244, 63, 94, 0.08)', overflowWrap: 'anywhere' }}>
          {error}
        </div>
      ))}
      {steps.length === 0 && searchQueries.length === 0 && <span style={{ color: 'var(--text-dim)', fontSize: '0.71rem' }}>Waiting for the first research event…</span>}
    </div>
  </details>
);

export const DeepResearchProgress: React.FC<{ args: Record<string, any>; progress?: any; onCancelGeneration?: () => void }> = ({ args, progress, onCancelGeneration }) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const query = String(args?.query || '').trim() || 'Researching the requested topic';
  const requestedImages = Number.isFinite(Number(args?.image_count))
    ? Math.max(0, Math.trunc(Number(args.image_count)))
    : null;
  const inspectedPages = Array.isArray(progress?.pages) ? progress.pages : [];
  const noteBatches = Array.isArray(progress?.note_batches) ? progress.note_batches : [];
  const linkAnalysis = progress?.link_analysis;
  const liveNoteCount = noteBatches.reduce((total: number, batch: any) => total + Number(batch.notes_completed || 0), 0);
  const liveNoteTokens = noteBatches.reduce((total: number, batch: any) =>
    total + Number(batch.estimated_tokens || Math.ceil(String(batch.content || '').length / 4)), 0);
  const phaseLabels: Record<string, string> = {
    searching: 'Searching the web',
    reading: 'Inspecting promising pages',
    classifying_links: linkAnalysis?.stage === 'confirming_pages' ? 'Confirming linked-page relevance with AI' : 'Ranking discovered links with AI',
    following_links: 'Following relevant website links',
    analyzing: 'Extracting request-relevant evidence',
    collecting_images: 'Collecting and attributing images',
    complete: 'Research collected',
  };
  const phaseLabel = phaseLabels[progress?.phase] || 'Preparing research';
  const workflow = [
    { icon: Search, label: 'Search the web', detail: 'Run several focused search queries' },
    { icon: FileText, label: 'Inspect sources', detail: 'Read the most relevant public pages' },
    {
      icon: ExternalLink,
      label: 'Follow evidence',
      detail: progress?.phase === 'classifying_links'
        ? linkAnalysis?.stage === 'confirming_pages'
          ? `Confirming ${linkAnalysis.items_completed || 0}/${linkAnalysis.candidates || 0} fetched pages`
          : `Ranking ${linkAnalysis.items_completed || 0}/${linkAnalysis.candidates || 0} discovered links`
        : 'Open useful links from those websites',
    },
    { icon: Brain, label: 'Create relevance notes', detail: 'Use the active model to extract information that directly answers the request' },
    {
      icon: ImageIcon,
      label: 'Collect images',
      detail: requestedImages === 0
        ? 'Skipped because no images were requested'
        : requestedImages
          ? `Find up to ${requestedImages} relevant, attributed images`
          : 'Find images only when the request calls for them',
    },
  ];

  return (
    <div
      className="glass-panel animate-fade-in"
      style={{
        marginLeft: '44px',
        padding: '16px 18px',
        borderRadius: '14px',
        border: '1px solid rgba(56, 189, 248, 0.42)',
        background: 'linear-gradient(135deg, rgba(14, 116, 144, 0.14), rgba(79, 70, 229, 0.1))',
        boxShadow: '0 6px 20px rgba(14, 116, 144, 0.12)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
          <Loader2 size={19} className="spin" style={{ flexShrink: 0, color: '#38bdf8' }} />
          <strong style={{ color: 'var(--text-main)', fontSize: '0.9rem' }}>Deep research in progress</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {args?.preset && (
            <span style={{ padding: '2px 8px', borderRadius: '999px', background: 'rgba(125, 211, 252, 0.15)', color: '#38bdf8', fontSize: '0.68rem', fontWeight: 700, border: '1px solid rgba(56, 189, 248, 0.3)', textTransform: 'uppercase' }}>
              {args.preset} Preset
            </span>
          )}
          <span style={{ flexShrink: 0, color: '#7dd3fc', fontFamily: 'var(--font-code)', fontSize: '0.75rem' }}>
            {elapsedSeconds}s
          </span>
          {onCancelGeneration && (
            <button
              type="button"
              onClick={onCancelGeneration}
              title="Stop Deep Research Generation"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 9px',
                borderRadius: '6px',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                background: 'rgba(239, 68, 68, 0.18)',
                color: '#fca5a5',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Square size={11} fill="currentColor" /> Stop
            </button>
          )}
        </div>
      </div>

      <div style={{ marginTop: '9px', color: '#bae6fd', fontSize: '0.8rem', lineHeight: 1.45, overflowWrap: 'anywhere' }}>
        “{query}”
      </div>

      <div style={{ marginTop: '7px', display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
        <span style={{ color: '#7dd3fc', fontWeight: 650 }}>{phaseLabel}</span>
        {progress && <span>· {progress.searches_completed || 0}/{progress.search_queries?.length || 0} searches</span>}
        {progress?.search_results_found > 0 && <span>· {progress.search_results_found} results found</span>}
        {progress?.images_found > 0 && <span>· {progress.images_found} images collected</span>}
      </div>

      {Array.isArray(progress?.search_queries) && progress.search_queries.length > 0 && (
        <div style={{ marginTop: '10px' }}>
          <span style={{ display: 'block', marginBottom: '6px', color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            2-Stage Search Queries ({progress.searches_completed || 0}/{progress.search_queries.length})
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            {progress.search_queries.map((q: string, idx: number) => (
              <span
                key={`sq-${idx}`}
                style={{
                  padding: '3px 8px',
                  borderRadius: '6px',
                  background: idx === 0 ? 'rgba(56, 189, 248, 0.16)' : 'rgba(99, 102, 241, 0.14)',
                  border: idx === 0 ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid rgba(99, 102, 241, 0.25)',
                  color: idx === 0 ? '#7dd3fc' : '#c4b5fd',
                  fontSize: '0.69rem',
                  fontFamily: 'var(--font-code)',
                }}
              >
                {idx === 0 ? '🎯 Stage 1 Grounding: ' : `🔎 Stage 2 Sub-query: `}{q}
              </span>
            ))}
          </div>
        </div>
      )}

      {progress?.grounding_context && (
        <div style={{ marginTop: '10px', padding: '9px 11px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.3)', background: 'rgba(15, 23, 42, 0.55)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px', color: '#7dd3fc', fontSize: '0.68rem', fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <FileText size={12} /> Stage 1 Verified Grounding Facts
          </div>
          <div style={{ color: '#bae6fd', fontSize: '0.71rem', fontFamily: 'var(--font-code)', whiteSpace: 'pre-wrap', maxHeight: '110px', overflowY: 'auto', lineHeight: 1.4 }}>
            {progress.grounding_context}
          </div>
        </div>
      )}

      <div style={{ marginTop: '10px' }}>
        <span style={{ display: 'block', marginBottom: '6px', color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Sources inspected
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {inspectedPages.length === 0 ? (
            <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>Domains will appear here as pages are read…</span>
          ) : inspectedPages.map((page: any, index: number) => {
            let domain = page.url || 'source';
            let favicon = '';
            try {
              const parsed = new URL(page.url);
              domain = parsed.hostname.replace(/^www\./, '');
              favicon = `${parsed.origin}/favicon.ico`;
            } catch (_) {}
            return (
              <a
                key={`${page.url}-${index}`}
                href={page.url}
                target="_blank"
                rel="noreferrer"
                title={`${page.title || domain}${page.discovery === 'website_link' ? ' · followed website link' : ''}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', maxWidth: '190px', padding: '4px 8px 4px 5px', borderRadius: '999px', border: '1px solid rgba(125, 211, 252, 0.2)', background: 'rgba(15, 23, 42, 0.52)', color: '#bae6fd', textDecoration: 'none', fontSize: '0.69rem' }}
              >
                <span style={{ position: 'relative', display: 'grid', placeItems: 'center', width: '17px', height: '17px', flexShrink: 0, overflow: 'hidden', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.12)' }}>
                  <Globe size={11} color="#7dd3fc" />
                  {favicon && <img src={favicon} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} style={{ position: 'absolute', inset: '2px', width: '13px', height: '13px', objectFit: 'contain' }} />}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{domain}</span>
                {page.discovery === 'website_link' && <ExternalLink size={9} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />}
              </a>
            );
          })}
        </div>
      </div>

      {progress?.phase === 'classifying_links' && linkAnalysis && (
        <div style={{ marginTop: '10px', padding: '10px 11px', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.3)', background: 'linear-gradient(135deg, rgba(30, 64, 175, 0.12), rgba(124, 58, 237, 0.09))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
            {linkAnalysis.status === 'complete' ? <CheckCircle2 size={13} color="#5eead4" /> : <Loader2 size={13} className="spin" color="#93c5fd" />}
            <strong style={{ color: '#bfdbfe', fontSize: '0.72rem' }}>
              {linkAnalysis.stage === 'confirming_pages' ? 'AI is checking fetched-page content' : 'AI is ranking discovered links'}
            </strong>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.67rem' }}>depth {linkAnalysis.depth}</span>
            <span style={{ marginLeft: 'auto', color: '#c4b5fd', fontFamily: 'var(--font-code)', fontSize: '0.66rem' }}>
              {linkAnalysis.batches_completed}/{linkAnalysis.batches_total} batches · {linkAnalysis.items_completed}/{linkAnalysis.candidates} {linkAnalysis.stage === 'confirming_pages' ? 'pages' : 'links'}
            </span>
          </div>
          <div style={{ height: '5px', marginTop: '8px', overflow: 'hidden', borderRadius: '999px', background: 'rgba(30, 41, 59, 0.8)' }}>
            <div style={{ width: `${linkAnalysis.batches_total > 0 ? Math.max(4, Math.min(100, (linkAnalysis.batches_completed / linkAnalysis.batches_total) * 100)) : 100}%`, height: '100%', borderRadius: 'inherit', background: linkAnalysis.status === 'complete' ? '#2dd4bf' : 'linear-gradient(90deg, #3b82f6, #8b5cf6)', transition: 'width 180ms ease' }} />
          </div>
          <div style={{ marginTop: '7px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', color: 'var(--text-muted)', fontSize: '0.65rem' }}>
            {Array.isArray(linkAnalysis.active_sites) && linkAnalysis.active_sites.length > 0 ? (
              <>
                <span>Active model batches:</span>
                {linkAnalysis.active_sites.map((site: string, index: number) => <span key={`${site}-${index}`} style={{ padding: '2px 6px', borderRadius: '999px', border: '1px solid rgba(147, 197, 253, 0.18)', color: '#bfdbfe', background: 'rgba(30, 58, 138, 0.14)' }}>{site}</span>)}
              </>
            ) : <span>{linkAnalysis.status === 'complete' ? 'Classification complete; selecting the next pages.' : 'Preparing bounded model batches…'}</span>}
          </div>
          {Array.isArray(linkAnalysis.recent_decisions) && linkAnalysis.recent_decisions.length > 0 && (
            <div style={{ marginTop: '9px', display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '140px', overflowY: 'auto' }}>
              {linkAnalysis.recent_decisions.map((dec: any, idx: number) => {
                let domain = dec.url;
                let favicon = '';
                try {
                  const parsed = new URL(dec.url);
                  domain = parsed.hostname.replace(/^www\./, '');
                  favicon = `${parsed.origin}/favicon.ico`;
                } catch (_) {}
                const isRel = dec.classification === 'relevant';
                const isUnc = dec.classification === 'uncertain';
                const badgeColor = isRel ? '#2dd4bf' : isUnc ? '#facc15' : '#fb7185';
                const badgeBg = isRel ? 'rgba(45, 212, 191, 0.12)' : isUnc ? 'rgba(250, 204, 21, 0.12)' : 'rgba(251, 113, 133, 0.12)';
                const badgeBorder = isRel ? 'rgba(45, 212, 191, 0.3)' : isUnc ? 'rgba(250, 204, 21, 0.3)' : 'rgba(251, 113, 133, 0.3)';
                return (
                  <div key={`${dec.url}-${idx}`} style={{ padding: '5px 8px', borderRadius: '6px', background: 'rgba(15, 23, 42, 0.45)', border: '1px solid rgba(147, 197, 253, 0.12)', fontSize: '0.67rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                      <a
                        href={dec.url}
                        target="_blank"
                        rel="noreferrer"
                        title={dec.url}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#bfdbfe', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none', minWidth: 0 }}
                        onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
                      >
                        <span style={{ position: 'relative', display: 'grid', placeItems: 'center', width: '15px', height: '15px', flexShrink: 0, overflow: 'hidden', borderRadius: '3px', background: 'rgba(56, 189, 248, 0.12)' }}>
                          <Globe size={10} color="#7dd3fc" />
                          {favicon && <img src={favicon} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} style={{ position: 'absolute', inset: '1px', width: '13px', height: '13px', objectFit: 'contain' }} />}
                        </span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {dec.title || domain}
                        </span>
                      </a>
                      <span style={{ padding: '1px 6px', borderRadius: '999px', background: badgeBg, border: `1px solid ${badgeBorder}`, color: badgeColor, fontSize: '0.62rem', fontWeight: 700, flexShrink: 0 }}>
                        {dec.classification} ({dec.relevance_score}/100)
                      </span>
                    </div>
                    {dec.reason && (
                      <span style={{ display: 'block', marginTop: '2px', color: 'var(--text-muted)', fontSize: '0.64rem', overflowWrap: 'anywhere' }}>
                        {dec.reason}
                      </span>
                    )}
                    {(dec.parent_title || dec.parent_url) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px', color: '#7dd3fc', fontSize: '0.63rem' }}>
                        <CornerDownRight size={10} style={{ flexShrink: 0, opacity: 0.7 }} />
                        <span style={{ color: 'var(--text-muted)' }}>Found on:</span>
                        <a
                          href={dec.parent_url || '#'}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#93c5fd', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
                        >
                          {dec.parent_title || dec.parent_url}
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <ResearchTrail
        live
        steps={Array.isArray(progress?.steps) ? progress.steps : []}
        searchQueries={Array.isArray(progress?.search_queries) ? progress.search_queries : []}
      />

      {(noteBatches.length > 0 || progress?.phase === 'analyzing') && (
        <div style={{ marginTop: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#c4b5fd', fontSize: '0.68rem', fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <Brain size={12} /> Live AI relevance notes
            </span>
            <span style={{ padding: '3px 8px', borderRadius: '999px', border: '1px solid rgba(167, 139, 250, 0.28)', background: 'rgba(124, 58, 237, 0.12)', color: '#ddd6fe', fontFamily: 'var(--font-code)', fontSize: '0.65rem' }}>
              AI note context: {liveNoteCount}/{inspectedPages.length} notes · ~{liveNoteTokens.toLocaleString()} tokens
            </span>
          </div>
          {noteBatches.length === 0 ? (
            <div style={{ padding: '8px 10px', borderRadius: '7px', border: '1px solid rgba(167, 139, 250, 0.2)', background: 'rgba(76, 29, 149, 0.08)', color: 'var(--text-muted)', fontSize: '0.71rem' }}>
              Preparing source batches for the active model…
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '7px' }}>
              {noteBatches.map((batch: any, index: number) => (
                <div key={`${batch.source_ids?.join('-') || index}`} style={{ minWidth: 0, padding: '8px', borderRadius: '7px', border: '1px solid rgba(167, 139, 250, 0.22)', background: 'rgba(76, 29, 149, 0.09)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', color: '#c4b5fd', fontSize: '0.68rem' }}>
                    {batch.status === 'generating' ? <Loader2 size={11} className="spin" /> : batch.status === 'error' ? <XCircle size={11} color="#fb7185" /> : <CheckCircle2 size={11} color="#5eead4" />}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0, flexWrap: 'wrap' }}>
                      {Array.isArray(batch.sources) && batch.sources.length > 0 ? batch.sources.map((source: any, sourceIndex: number) => (
                        <a
                          key={`${source.url || source.site_name}-${sourceIndex}`}
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          title={source.title || source.url}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', minWidth: 0, maxWidth: '145px', padding: '2px 5px', borderRadius: '999px', border: '1px solid rgba(167, 139, 250, 0.2)', color: '#ddd6fe', textDecoration: 'none', background: 'rgba(2, 6, 23, 0.3)' }}
                        >
                          <WebsiteFavicon url={source.url} size={14} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.site_name || source.title || 'Website'}</span>
                        </a>
                      )) : <strong>Web sources</strong>}
                    </div>
                    <span style={{ marginLeft: 'auto', color: batch.status === 'error' ? '#fb7185' : 'var(--text-dim)', fontSize: '0.62rem' }}>{batch.status}</span>
                  </div>
                  <pre style={{ minHeight: '48px', maxHeight: '150px', margin: 0, padding: '7px 8px', overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', border: '1px solid rgba(167, 139, 250, 0.13)', background: 'rgba(2, 6, 23, 0.42)', color: '#ddd6fe', fontSize: '0.65rem', lineHeight: 1.4 }}>
                    {batch.content || (batch.status === 'generating' ? 'Waiting for the first generated tokens…' : 'No note text was produced.')}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: '8px' }}>
        {workflow.map((step) => {
          const StepIcon = step.icon;
          return (
            <div key={step.label} style={{ display: 'flex', gap: '8px', padding: '9px 10px', borderRadius: '8px', border: '1px solid rgba(125, 211, 252, 0.15)', background: 'rgba(15, 23, 42, 0.38)' }}>
              <StepIcon size={15} style={{ flexShrink: 0, marginTop: '1px', color: '#38bdf8' }} />
              <div style={{ minWidth: 0 }}>
                <span style={{ display: 'block', color: 'var(--text-main)', fontSize: '0.76rem', fontWeight: 650 }}>{step.label}</span>
                <span style={{ display: 'block', marginTop: '2px', color: 'var(--text-muted)', fontSize: '0.7rem', lineHeight: 1.35 }}>{step.detail}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '10px', color: 'var(--text-muted)', fontSize: '0.7rem', lineHeight: 1.4 }}>
        Tasks can overlap. Exact search, page, link, and image counts will appear when the research completes.
      </div>
    </div>
  );
};

export const RankedLinkInspectorView: React.FC<{ links: any[] }> = ({ links }) => {
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'score' | 'domain' | 'provenance'>('score');
  const [statusFilter, setStatusFilter] = useState<'all' | 'relevant' | 'uncertain' | 'not_relevant'>('all');
  const [expandedContexts, setExpandedContexts] = useState<Set<string>>(new Set());

  const toggleContext = (url: string) => {
    setExpandedContexts((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const filteredLinks = useMemo(() => {
    let result = links.filter((link) => {
      const q = query.trim().toLowerCase();
      if (q) {
        const text = `${link.title} ${link.url} ${link.parent_title} ${link.reason} ${link.anchor_text || ''} ${link.surrounding_text || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      if (statusFilter === 'relevant' && link.classification !== 'relevant' && link.relevance_score < 70) return false;
      if (statusFilter === 'uncertain' && (link.classification !== 'uncertain' || link.relevance_score < 40 || link.relevance_score >= 70)) return false;
      if (statusFilter === 'not_relevant' && link.classification !== 'not_relevant' && link.relevance_score >= 40) return false;
      return true;
    });

    return result.sort((a, b) => {
      if (sortBy === 'score') return b.relevance_score - a.relevance_score;
      if (sortBy === 'domain') {
        let domainA = a.url;
        let domainB = b.url;
        try { domainA = new URL(a.url).hostname; } catch (_) {}
        try { domainB = new URL(b.url).hostname; } catch (_) {}
        return domainA.localeCompare(domainB);
      }
      if (sortBy === 'provenance') return (a.parent_title || '').localeCompare(b.parent_title || '');
      return 0;
    });
  }, [links, query, sortBy, statusFilter]);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#060b16' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(56, 189, 248, 0.16)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', background: 'rgba(15, 23, 42, 0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '200px', background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(147, 197, 253, 0.2)', borderRadius: '6px', padding: '4px 8px' }}>
          <Search size={13} color="#94a3b8" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search links, domains, page text, AI reasons..."
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#f8fafc', fontSize: '0.72rem' }}
          />
          {query && <X size={12} color="#94a3b8" style={{ cursor: 'pointer' }} onClick={() => setQuery('')} />}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.7rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            style={{ background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(147, 197, 253, 0.25)', color: '#bae6fd', padding: '4px 7px', borderRadius: '5px', fontSize: '0.69rem', outline: 'none' }}
          >
            <option value="score">Relevance Score (High → Low)</option>
            <option value="domain">Base Domain (A-Z)</option>
            <option value="provenance">Parent Source (A-Z)</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {(['all', 'relevant', 'uncertain', 'not_relevant'] as const).map((filter) => {
            const active = statusFilter === filter;
            const label = filter === 'all' ? `All (${links.length})` : filter === 'relevant' ? 'Relevant (≥70)' : filter === 'uncertain' ? 'Uncertain (40-69)' : 'Not Relevant (<40)';
            return (
              <button
                key={filter}
                type="button"
                onClick={() => setStatusFilter(filter)}
                style={{
                  padding: '3px 8px',
                  borderRadius: '999px',
                  border: `1px solid ${active ? '#38bdf8' : 'rgba(148, 163, 184, 0.2)'}`,
                  background: active ? 'rgba(56, 189, 248, 0.16)' : 'transparent',
                  color: active ? '#38bdf8' : 'var(--text-muted)',
                  fontSize: '0.65rem',
                  fontWeight: active ? 650 : 400,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, padding: '14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filteredLinks.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            No discovered links matched your search or status filter.
          </div>
        ) : (
          filteredLinks.map((item, index) => {
            const isRel = item.relevance_score >= 70 || item.classification === 'relevant';
            const isUnc = !isRel && (item.relevance_score >= 40 || item.classification === 'uncertain');
            const scoreColor = isRel ? '#2dd4bf' : isUnc ? '#facc15' : '#fb7185';
            const scoreBg = isRel ? 'rgba(45, 212, 191, 0.12)' : isUnc ? 'rgba(250, 204, 21, 0.12)' : 'rgba(251, 113, 133, 0.12)';
            const scoreBorder = isRel ? 'rgba(45, 212, 191, 0.3)' : isUnc ? 'rgba(250, 204, 21, 0.3)' : 'rgba(251, 113, 133, 0.3)';

            let confirmationLabel = isRel ? 'Skipped (Depth / Budget Cap)' : 'Skipped (Low Relevance)';
            let confirmationColor = 'var(--text-dim)';
            if (item.confirmation === 'confirmed_relevant') {
              confirmationLabel = 'Followed & Confirmed';
              confirmationColor = '#2dd4bf';
            } else if (item.status === 'checked') {
              confirmationLabel = 'Followed Link';
              confirmationColor = '#60a5fa';
            } else if (item.status === 'failed') {
              confirmationLabel = 'Fetch Failed';
              confirmationColor = '#f87171';
            } else if (item.confirmation === 'low_relevance') {
              confirmationLabel = 'Checked: Low Relevance';
              confirmationColor = '#fbbf24';
            }

            const hasContext = Boolean(item.surrounding_text || item.heading || item.section || item.anchor_text);
            const isExpanded = expandedContexts.has(item.url);

            return (
              <div
                key={`${item.url}-${index}`}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(147, 197, 253, 0.14)',
                  background: 'rgba(15, 23, 42, 0.6)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: '7px', color: '#7dd3fc', fontWeight: 650, fontSize: '0.76rem', textDecoration: 'none', minWidth: 0, overflow: 'hidden' }}
                    onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
                  >
                    <WebsiteFavicon url={item.url} size={15} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                  </a>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ padding: '2px 7px', borderRadius: '999px', background: scoreBg, border: `1px solid ${scoreBorder}`, color: scoreColor, fontSize: '0.64rem', fontWeight: 700 }}>
                      Score {item.relevance_score}/100 · {item.classification}
                    </span>
                    <span style={{ padding: '2px 7px', borderRadius: '999px', background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(148, 163, 184, 0.2)', color: confirmationColor, fontSize: '0.62rem' }}>
                      {confirmationLabel}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                  <span style={{ color: 'var(--text-dim)' }}>Discovered on:</span>
                  <a
                    href={item.parent_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#93c5fd', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '350px' }}
                    onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
                  >
                    {item.parent_title}
                  </a>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-dim)' }}>Depth {item.depth}</span>
                </div>

                {item.reason && (
                  <div style={{ padding: '6px 9px', borderRadius: '5px', background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(56, 189, 248, 0.1)', color: '#cbd5e1', fontSize: '0.68rem', lineHeight: 1.4 }}>
                    <strong style={{ color: '#38bdf8', fontSize: '0.64rem', display: 'block', marginBottom: '2px' }}>AI Decision Reason:</strong>
                    {item.reason}
                  </div>
                )}

                {hasContext && (
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleContext(item.url)}
                      style={{ background: 'transparent', border: 'none', color: '#93c5fd', fontSize: '0.66rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: 0, marginTop: '2px' }}
                    >
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      {isExpanded ? 'Hide Page Context' : 'View Link Context (Surrounding Page Text)'}
                    </button>

                    {isExpanded && (
                      <div style={{ marginTop: '5px', padding: '8px 10px', borderRadius: '6px', background: 'rgba(2, 6, 23, 0.7)', border: '1px solid rgba(147, 197, 253, 0.18)', fontSize: '0.67rem', color: '#cbd5e1', lineHeight: 1.45 }}>
                        {item.parent_excerpt && (
                          <div style={{ marginBottom: '6px', color: '#94a3b8' }}>
                            <strong style={{ color: '#93c5fd', display: 'block', marginBottom: '2px' }}>Parent Page Excerpt (Model Context):</strong>
                            <p style={{ margin: 0, color: '#cbd5e1', background: 'rgba(15, 23, 42, 0.6)', padding: '6px 8px', borderRadius: '4px', border: '1px solid rgba(147, 197, 253, 0.12)', fontSize: '0.66rem', maxHeight: '120px', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                              {item.parent_excerpt}
                            </p>
                          </div>
                        )}
                        {item.anchor_text && (
                          <div style={{ marginBottom: '4px' }}>
                            <strong style={{ color: '#93c5fd' }}>Anchor Text:</strong> <span style={{ color: '#f8fafc' }}>"{item.anchor_text}"</span>
                          </div>
                        )}
                        {(item.aria_label || item.title_attr) && (
                          <div style={{ marginBottom: '4px', color: '#94a3b8' }}>
                            {item.aria_label && <div><strong style={{ color: '#93c5fd' }}>Aria Label:</strong> "{item.aria_label}"</div>}
                            {item.title_attr && <div style={{ marginTop: '2px' }}><strong style={{ color: '#93c5fd' }}>Title Tooltip:</strong> "{item.title_attr}"</div>}
                          </div>
                        )}
                        {(item.heading || item.section) && (
                          <div style={{ marginBottom: '4px', color: '#94a3b8' }}>
                            <strong style={{ color: '#93c5fd' }}>Section / Heading:</strong> {item.heading || item.section}
                          </div>
                        )}
                        {Array.isArray(item.url_path_hints) && item.url_path_hints.length > 0 && (
                          <div style={{ marginBottom: '4px', color: '#94a3b8' }}>
                            <strong style={{ color: '#93c5fd' }}>URL Path Hints:</strong>{' '}
                            {item.url_path_hints.map((hint: string, hIdx: number) => (
                              <span key={`hint-${hIdx}`} style={{ display: 'inline-block', padding: '1px 5px', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.25)', color: '#38bdf8', fontSize: '0.62rem', marginRight: '4px' }}>
                                {hint}
                              </span>
                            ))}
                          </div>
                        )}
                        {item.surrounding_text && (
                          <div>
                            <strong style={{ color: '#93c5fd', display: 'block', marginBottom: '2px' }}>Surrounding Page Text:</strong>
                            <p style={{ margin: 0, fontStyle: 'italic', color: '#94a3b8', background: 'rgba(15, 23, 42, 0.5)', padding: '6px 8px', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.05)', whiteSpace: 'pre-wrap' }}>
                              "{item.surrounding_text}"
                            </p>
                          </div>
                        )}
                        {(item.text_before || item.text_after) && (
                          <div style={{ marginTop: '4px', color: '#94a3b8', fontSize: '0.65rem' }}>
                            {item.text_before && <div><strong style={{ color: '#93c5fd' }}>Text Before Link:</strong> "{item.text_before}"</div>}
                            {item.text_after && <div style={{ marginTop: '2px' }}><strong style={{ color: '#93c5fd' }}>Text After Link:</strong> "{item.text_after}"</div>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export const FinalAnswerContextPreview: React.FC<{
  modelContext: string;
  fullContext: string;
  sources: any[];
}> = ({ modelContext, fullContext, sources }) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [contextView, setContextView] = useState<'relevant' | 'ranked_links' | 'model' | 'raw'>('model');
  const notes = sources.map((source) => source.ai_note).filter(Boolean);
  const noteContext = JSON.stringify(notes);
  const noteTokens = Math.ceil(noteContext.length / 4);
  const modelTokens = Math.ceil(modelContext.length / 4);
  const fullTokens = Math.ceil(fullContext.length / 4);

  const allDiscoveredLinks = useMemo(() => {
    const list: Array<{
      url: string;
      title: string;
      site_name?: string;
      parent_title: string;
      parent_url: string;
      parent_excerpt?: string | null;
      depth: number;
      relevance_score: number;
      classification: 'relevant' | 'uncertain' | 'not_relevant';
      confidence?: number;
      reason: string;
      confirmation?: string;
      confirmation_reason?: string;
      status: string;
      anchor_text?: string;
      surrounding_text?: string | null;
      text_before?: string | null;
      text_after?: string | null;
      heading?: string | null;
      section?: string | null;
      title_attr?: string | null;
      aria_label?: string | null;
      url_path_hints?: string[];
    }> = [];

    for (const source of sources) {
      if (Array.isArray(source.discovered_links)) {
        const parentExcerpt = (source.content && source.content.trim().length > 0) ? source.content.slice(0, 3000) : source.excerpt;
        for (const link of source.discovered_links) {
          list.push({
            url: link.url,
            title: link.title || link.site_name || link.url,
            site_name: link.site_name,
            parent_title: source.title || source.url,
            parent_url: source.url,
            parent_excerpt: parentExcerpt,
            depth: link.depth ?? 1,
            relevance_score: link.relevance_score ?? 0,
            classification: link.classification || (link.relevance_score >= 70 ? 'relevant' : link.relevance_score >= 40 ? 'uncertain' : 'not_relevant'),
            confidence: link.confidence,
            reason: link.reason || '',
            confirmation: link.confirmation,
            confirmation_reason: link.confirmation_reason,
            status: link.status || 'not_checked',
            anchor_text: link.anchor_text || link.title,
            surrounding_text: link.surrounding_text || null,
            text_before: link.text_before || null,
            text_after: link.text_after || null,
            heading: link.heading || null,
            section: link.section || null,
            title_attr: link.title_attr || null,
            aria_label: link.aria_label || null,
            url_path_hints: link.url_path_hints || [],
          });
        }
      }
    }
    return list;
  }, [sources]);

  const relevantSources = sources.map((source) => {
    const relevantLinks = (Array.isArray(source.discovered_links) ? source.discovered_links : [])
      .filter((link: any) =>
        link.status !== 'failed' &&
        (link.confirmation === 'confirmed_relevant' || link.classification === 'relevant'),
      );
    return { source, relevantLinks };
  }).filter(({ source, relevantLinks }) => source.ai_note?.relevant || relevantLinks.length > 0);

  const relevantContext = JSON.stringify({
    relevant_sources: relevantSources.map(({ source, relevantLinks }) => ({
      source_id: source.id,
      title: source.title,
      url: source.url,
      ai_note: source.ai_note || null,
      relevant_links: relevantLinks.map((link: any) => ({
        title: link.title,
        url: link.url,
        status: link.status,
        confirmation: link.confirmation,
        relevance_score: link.relevance_score,
        confidence: link.confidence,
        reason: link.reason,
        confirmation_reason: link.confirmation_reason,
      })),
    })),
  }, null, 2);
  const activeContext = contextView === 'relevant'
    ? relevantContext
    : contextView === 'model' ? modelContext : fullContext;

  const copyContext = async () => {
    try {
      await navigator.clipboard.writeText(activeContext);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (_) {}
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginTop: '7px', flexWrap: 'wrap' }}>
        <span style={{ padding: '3px 8px', borderRadius: '999px', border: '1px solid rgba(167, 139, 250, 0.25)', background: 'rgba(124, 58, 237, 0.1)', color: '#ddd6fe', fontFamily: 'var(--font-code)', fontSize: '0.65rem' }}>
          Model synthesis payload: ~{modelTokens.toLocaleString()} tokens · {modelContext.length.toLocaleString()} chars
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 9px', borderRadius: '6px', border: '1px solid rgba(56, 189, 248, 0.3)', background: 'rgba(14, 116, 144, 0.12)', color: '#bae6fd', fontSize: '0.67rem', fontWeight: 650, cursor: 'pointer' }}
        >
          <Eye size={12} /> View AI final-answer context
        </button>
      </div>
      {open && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="AI final-answer context"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'grid', placeItems: 'center', padding: '24px', background: 'rgba(2, 6, 23, 0.82)', backdropFilter: 'blur(5px)' }}
        >
          <div style={{ width: 'min(1000px, 96vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', borderRadius: '12px', border: '1px solid rgba(56, 189, 248, 0.35)', background: '#0b1120', boxShadow: '0 24px 80px rgba(0, 0, 0, 0.55)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '12px 14px', borderBottom: '1px solid rgba(56, 189, 248, 0.2)' }}>
              <Brain size={16} color="#c4b5fd" />
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', color: 'var(--text-main)', fontSize: '0.82rem' }}>Deep-research context for the final answer</strong>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>model payload ~{modelTokens.toLocaleString()} tokens · full result ~{fullTokens.toLocaleString()} tokens · {notes.length} relevance notes (~{noteTokens.toLocaleString()} tokens)</span>
              </div>
              <button type="button" onClick={copyContext} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 8px', borderRadius: '5px', border: '1px solid var(--border-color)', background: 'rgba(30, 41, 59, 0.7)', color: copied ? '#5eead4' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.68rem' }}>
                {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close context preview" style={{ display: 'grid', placeItems: 'center', width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={15} /></button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderBottom: '1px solid rgba(167, 139, 250, 0.16)', background: 'rgba(124, 58, 237, 0.07)', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setContextView('relevant')} style={{ padding: '5px 9px', borderRadius: '6px', border: `1px solid ${contextView === 'relevant' ? 'rgba(167, 139, 250, 0.5)' : 'transparent'}`, background: contextView === 'relevant' ? 'rgba(124, 58, 237, 0.18)' : 'transparent', color: contextView === 'relevant' ? '#ddd6fe' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.69rem', fontWeight: 650 }}>
                Relevant notes &amp; links
              </button>
              <button type="button" onClick={() => setContextView('ranked_links')} style={{ padding: '5px 9px', borderRadius: '6px', border: `1px solid ${contextView === 'ranked_links' ? 'rgba(56, 189, 248, 0.5)' : 'transparent'}`, background: contextView === 'ranked_links' ? 'rgba(14, 116, 144, 0.22)' : 'transparent', color: contextView === 'ranked_links' ? '#7dd3fc' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.69rem', fontWeight: 650 }}>
                All Discovered Links ({allDiscoveredLinks.length})
              </button>
              <button type="button" onClick={() => setContextView('model')} style={{ padding: '5px 9px', borderRadius: '6px', border: `1px solid ${contextView === 'model' ? 'rgba(56, 189, 248, 0.5)' : 'transparent'}`, background: contextView === 'model' ? 'rgba(14, 116, 144, 0.22)' : 'transparent', color: contextView === 'model' ? '#38bdf8' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.69rem', fontWeight: 650 }}>
                Model Context Payload (~{modelTokens.toLocaleString()} tok)
              </button>
              <button type="button" onClick={() => setContextView('raw')} style={{ padding: '5px 9px', borderRadius: '6px', border: `1px solid ${contextView === 'raw' ? 'rgba(148, 163, 184, 0.4)' : 'transparent'}`, background: contextView === 'raw' ? 'rgba(30, 41, 59, 0.6)' : 'transparent', color: contextView === 'raw' ? '#f8fafc' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.69rem', fontWeight: 650 }}>
                Full JSON Result (~{fullTokens.toLocaleString()} tok)
              </button>
            </div>

            {contextView === 'ranked_links' ? (
              <RankedLinkInspectorView links={allDiscoveredLinks} />
            ) : (
              <pre style={{ flex: 1, minHeight: 0, margin: 0, padding: '14px 16px', overflowY: 'auto', fontFamily: 'var(--font-code)', fontSize: '0.76rem', color: '#bae6fd', whiteSpace: 'pre-wrap', lineHeight: 1.48, background: '#060b16' }}>
                {activeContext}
              </pre>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

export const DeepResearchResultsView: React.FC<{
  query: string;
  searchesCompleted: number;
  searchResultsFound?: number;
  linkedPagesRead: number;
  researchDate?: string;
  status?: string;
  sources: Array<{
    id: string;
    title: string;
    url: string;
    discovery: string;
    discovered_by?: string;
    excerpt?: string | null;
    content?: string;
    content_truncated?: boolean;
    depth?: number;
    relevant_links?: Array<{ title: string; url: string; site_name: string; depth: number; status: 'checked' | 'failed'; target_source_id: string | null; error: string | null }>;
    discovered_links?: Array<{
      title: string; url: string; site_name: string; depth: number;
      relevance: 'relevant' | 'not_relevant';
      classification: 'relevant' | 'uncertain' | 'not_relevant';
      relevance_score: number; confidence: number; reason: string;
      confirmation: 'not_checked' | 'confirmed_relevant' | 'low_relevance' | 'failed';
      confirmation_score: number | null; confirmation_reason: string | null;
      status: 'checked' | 'failed' | 'not_checked'; target_source_id: string | null; error: string | null;
    }>;
    link_summary?: { discovered: number; relevant_found: number; relevant_checked: number; relevant_failed: number; not_relevant: number; predicted_relevant?: number; uncertain?: number; confirmed_relevant?: number; low_relevance?: number };
    ai_note?: { source_id: string; relevant: boolean; note: string; key_points: string[]; quotes?: string[]; limitations: string | null };
  }>;
  images: Array<{ id: string; url: string; alt: string; source_url: string; source_title: string }>;
  searchQueries?: string[];
  steps?: Array<{ id?: number; phase?: string; kind?: string; status?: string; label?: string; url?: string; detail?: string }>;
  errors?: string[];
  noteErrors?: string[];
  researchBudget?: { searches?: number; primary_pages?: number; follow_up_pages?: number; link_depth?: number; semantic_link_classification?: boolean; link_relevance_threshold?: number; evidence_characters?: number };
  modelContext: string;
  fullContext: string;
}> = ({ query, searchesCompleted, searchResultsFound, linkedPagesRead, researchDate, status, sources, images, searchQueries = [], steps = [], errors = [], noteErrors = [], researchBudget, modelContext, fullContext }) => (
  <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
    <div style={{ padding: '8px 10px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '6px', border: '1px solid rgba(56, 189, 248, 0.25)', fontSize: '0.775rem' }}>
      <strong style={{ color: '#38bdf8' }}>Deep research:</strong>{' '}
      <span style={{ color: 'var(--text-main)' }}>{query}</span>
      <span style={{ display: 'block', marginTop: '4px', color: 'var(--text-muted)' }}>
        {status || 'complete'} · {searchesCompleted} searches{searchResultsFound !== undefined ? ` · ${searchResultsFound} results` : ''} · {sources.length} pages inspected · {images.length} images · {linkedPagesRead} followed website links{researchDate ? ` · ${researchDate}` : ''}
      </span>
      {researchBudget && (
        <span style={{ display: 'block', marginTop: '3px', color: 'var(--text-dim)', fontSize: '0.68rem' }}>
          Budget: {researchBudget.searches ?? searchesCompleted} searches · {researchBudget.primary_pages ?? 'adaptive'} primary pages · {researchBudget.follow_up_pages ?? 'adaptive'} follow-ups · link depth {researchBudget.link_depth ?? 1} · semantic ranking {researchBudget.semantic_link_classification === false ? 'off' : `on (≥${researchBudget.link_relevance_threshold ?? 70})`} · {Number(researchBudget.evidence_characters || 0).toLocaleString()} evidence characters
        </span>
      )}
      <FinalAnswerContextPreview modelContext={modelContext} fullContext={fullContext} sources={sources} />
    </div>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', padding: '8px 10px', borderRadius: '6px', border: '1px solid rgba(99, 102, 241, 0.24)', background: 'rgba(99, 102, 241, 0.08)', color: 'var(--text-muted)', fontSize: '0.71rem', lineHeight: 1.45 }}>
      <Info size={13} style={{ marginTop: '2px', flexShrink: 0, color: '#a5b4fc' }} />
      <span>
        <strong style={{ color: '#c7d2fe' }}>Website evidence and AI relevance notes are kept distinct.</strong>{' '}
        Excerpts and page content come from the linked websites. Boxes labeled “AI relevance note” are generated by the active model to extract information that directly addresses your request; the final answer is still a separate response.
      </span>
    </div>
    <ResearchTrail steps={steps} searchQueries={searchQueries} errors={errors} />
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '320px', overflowY: 'auto' }}>
      {sources.map((source) => {
        const presentation = getLinkPresentation(source.url);
        return (
          <details
            key={`${source.id}-${source.url}`}
            style={{ padding: '8px 10px', borderRadius: '7px', background: 'rgba(15, 23, 42, 0.5)', border: '1px solid var(--border-color)', color: '#38bdf8' }}
          >
            <summary style={{ cursor: 'pointer', fontSize: '0.78rem' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', maxWidth: '100%', verticalAlign: 'middle' }}>
                <WebsiteFavicon url={source.url} />
                <span style={{ color: 'var(--accent-teal)', fontFamily: 'var(--font-code)', fontSize: '0.72rem' }}>{source.id}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.title || presentation?.shortUrl || source.url}</span>
              </span>
              {source.discovery === 'website_link' && <span style={{ marginLeft: '7px', color: 'var(--text-muted)', fontSize: '0.68rem' }}>followed link</span>}
              {source.link_summary && source.link_summary.discovered > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', marginLeft: '8px', verticalAlign: 'middle', fontSize: '0.64rem' }}>
                  <span style={{ padding: '1px 6px', borderRadius: '999px', background: 'rgba(59, 130, 246, 0.12)', color: '#93c5fd' }}>{source.link_summary.predicted_relevant ?? source.link_summary.relevant_found} predicted</span>
                  <span style={{ padding: '1px 6px', borderRadius: '999px', background: 'rgba(56, 189, 248, 0.1)', color: '#7dd3fc' }}>{source.link_summary.relevant_checked} checked</span>
                  {(source.link_summary.confirmed_relevant ?? 0) > 0 && <span style={{ padding: '1px 6px', borderRadius: '999px', background: 'rgba(20, 184, 166, 0.12)', color: '#5eead4' }}>{source.link_summary.confirmed_relevant} confirmed</span>}
                </span>
              )}
            </summary>
            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.72rem', lineHeight: 1.45 }}>
              {source.ai_note && (
                <div style={{ marginBottom: '9px', padding: '9px 10px', borderRadius: '6px', border: '1px solid rgba(167, 139, 250, 0.3)', background: 'rgba(124, 58, 237, 0.1)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
                    <Brain size={13} color="#c4b5fd" />
                    <strong style={{ color: '#c4b5fd', fontSize: '0.7rem' }}>AI relevance note</strong>
                    <span style={{ marginLeft: 'auto', padding: '1px 6px', borderRadius: '999px', background: source.ai_note.relevant ? 'rgba(45, 212, 191, 0.12)' : 'rgba(148, 163, 184, 0.12)', color: source.ai_note.relevant ? '#5eead4' : 'var(--text-muted)', fontSize: '0.62rem', fontWeight: 700 }}>
                      {source.ai_note.relevant ? 'Relevant' : 'Low relevance'}
                    </span>
                  </div>
                  {source.ai_note.note && <p style={{ margin: 0, color: '#ddd6fe' }}>{source.ai_note.note}</p>}
                  {source.ai_note.key_points.length > 0 && (
                    <ul style={{ margin: '6px 0 0 17px', color: '#cbd5e1' }}>
                      {source.ai_note.key_points.map((point, index) => <li key={`${source.id}-note-${index}`}>{point}</li>)}
                    </ul>
                  )}
                  {Array.isArray(source.ai_note.quotes) && source.ai_note.quotes.length > 0 && (
                    <div style={{ marginTop: '7px', padding: '6px 8px', borderRadius: '5px', background: 'rgba(99, 102, 241, 0.14)', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
                      <strong style={{ color: '#a5b4fc', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Extracted Quotes:</strong>
                      <ul style={{ margin: '4px 0 0 16px', padding: 0, color: '#e2e8f0', fontSize: '0.72rem', fontStyle: 'italic' }}>
                        {source.ai_note.quotes.map((quote, qIdx) => (
                          <li key={`${source.id}-quote-${qIdx}`}>“{quote}”</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {source.ai_note.limitations && <p style={{ margin: '6px 0 0', color: '#a5b4fc' }}><strong>Limitation:</strong> {source.ai_note.limitations}</p>}
                </div>
              )}
              {Array.isArray(source.discovered_links) && source.discovered_links.length > 0 && (
                <div style={{ marginBottom: '9px', padding: '8px 9px', borderRadius: '6px', border: '1px solid rgba(56, 189, 248, 0.2)', background: 'rgba(14, 116, 144, 0.07)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                    <strong style={{ color: '#7dd3fc', fontSize: '0.68rem' }}>Links discovered on this page</strong>
                    {source.link_summary && <span style={{ color: 'var(--text-dim)', fontSize: '0.61rem' }}>{source.link_summary.discovered} found · {source.link_summary.predicted_relevant ?? source.link_summary.relevant_found} predicted relevant · {source.link_summary.relevant_checked} checked · {source.link_summary.confirmed_relevant ?? 0} confirmed relevant</span>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {source.discovered_links.map((link, index) => {
                      const linkColor = link.status === 'failed' || link.confirmation === 'failed'
                        ? '#fb7185'
                        : link.confirmation === 'confirmed_relevant'
                          ? '#5eead4'
                          : link.confirmation === 'low_relevance' || link.classification === 'uncertain'
                            ? '#fbbf24'
                            : link.classification === 'relevant'
                              ? '#60a5fa'
                              : 'var(--text-dim)';
                      const statusLabel = link.status === 'failed' || link.confirmation === 'failed'
                        ? 'failed'
                        : link.confirmation === 'confirmed_relevant'
                          ? 'confirmed relevant'
                          : link.confirmation === 'low_relevance'
                            ? 'low relevance after check'
                            : link.classification === 'relevant'
                              ? 'predicted relevant'
                              : link.classification === 'uncertain' ? 'uncertain' : 'not relevant';
                      return (
                        <div key={`${link.url}-${index}`} style={{ padding: '4px 5px', borderRadius: '5px', borderLeft: `2px solid ${linkColor}`, background: link.classification === 'not_relevant' ? 'rgba(100, 116, 139, 0.04)' : 'rgba(30, 41, 59, 0.35)', opacity: link.classification === 'not_relevant' ? 0.75 : 1 }}>
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noreferrer"
                            title={link.title || link.url}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, color: linkColor, textDecoration: 'none', fontSize: '0.68rem' }}
                          >
                            <WebsiteFavicon url={link.url} size={15} />
                            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link.site_name || link.title || link.url}</span>
                            <span style={{ flexShrink: 0, color: 'var(--text-dim)', fontSize: '0.61rem' }}>depth {link.depth}</span>
                            <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: '0.6rem', color: linkColor }}>{statusLabel}</span>
                          </a>
                          <div style={{ margin: '3px 0 0 21px', color: 'var(--text-muted)', fontSize: '0.61rem', lineHeight: 1.35 }}>
                            AI: {link.reason || 'No reason supplied'} · score {link.relevance_score}/100 · confidence {link.confidence}%
                            {link.confirmation_reason && <span style={{ display: 'block', color: link.confirmation === 'confirmed_relevant' ? '#99f6e4' : '#fde68a' }}>After opening: {link.confirmation_reason}{link.confirmation_score !== null ? ` · score ${link.confirmation_score}/100` : ''}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <CompactWebsiteLink url={source.url} color="#38bdf8" />
            {source.discovered_by && <span style={{ display: 'block', marginTop: '5px' }}>Discovered by: {source.discovered_by}</span>}
            {source.excerpt && <span style={{ display: 'block', marginTop: '6px', color: '#cbd5e1' }}>{source.excerpt}</span>}
            {source.content && (
              <div style={{ marginTop: '7px', padding: '8px', borderRadius: '5px', background: 'rgba(2, 6, 23, 0.45)', color: '#cbd5e1', whiteSpace: 'pre-wrap', maxHeight: '180px', overflowY: 'auto' }}>
                {source.content}{source.content_truncated ? '\n\n[content truncated]' : ''}
              </div>
            )}
            </div>
          </details>
        );
      })}
    </div>
    {noteErrors.length > 0 && (
      <div style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.3)', background: 'rgba(245, 158, 11, 0.08)', color: '#fbbf24', fontSize: '0.7rem' }}>
        AI relevance notes were unavailable for {noteErrors.length} source batch{noteErrors.length === 1 ? '' : 'es'}. Retrieved website evidence remains available.
      </div>
    )}
    {images.length > 0 && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px', maxHeight: '360px', overflowY: 'auto' }}>
        {images.map((researchImage) => (
          <a
            key={`${researchImage.id}-${researchImage.url}`}
            href={researchImage.url}
            target="_blank"
            rel="noreferrer"
            title="Open full-size image"
            style={{ display: 'flex', flexDirection: 'column', gap: '5px', padding: '6px', borderRadius: '7px', background: 'rgba(15, 23, 42, 0.5)', border: '1px solid var(--border-color)', color: '#38bdf8', textDecoration: 'none' }}
          >
            <img
              src={researchImage.url}
              alt={researchImage.alt || researchImage.source_title || 'Research image'}
              loading="lazy"
              referrerPolicy="no-referrer"
              style={{ width: '100%', height: '110px', objectFit: 'contain', borderRadius: '4px', background: 'rgba(2, 6, 23, 0.55)' }}
            />
            <span style={{ fontSize: '0.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {researchImage.id} · {researchImage.alt || researchImage.source_title || 'Image source'}
            </span>
          </a>
        ))}
      </div>
    )}
  </div>
);
