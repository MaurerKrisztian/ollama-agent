export interface LinkPresentation {
  domain: string;
  faviconUrl: string;
  shortUrl: string;
}

export const getLinkPresentation = (href: string | undefined): LinkPresentation | null => {
  if (!href) return null;

  try {
    const url = new URL(href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

    const domain = url.hostname.replace(/^www\./i, '');
    const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
    const compactUrl = `${domain}${path}`;

    return {
      domain,
      faviconUrl: `${url.origin}/favicon.ico`,
      shortUrl: compactUrl.length > 52 ? `${compactUrl.slice(0, 49)}…` : compactUrl,
    };
  } catch {
    return null;
  }
};
