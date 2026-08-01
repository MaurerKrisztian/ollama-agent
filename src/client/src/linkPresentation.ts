export interface LinkPresentation {
  domain: string;
  faviconUrl: string;
}

export const getLinkPresentation = (href: string | undefined): LinkPresentation | null => {
  if (!href) return null;

  try {
    const url = new URL(href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

    return {
      domain: url.hostname.replace(/^www\./i, ''),
      faviconUrl: `${url.origin}/favicon.ico`,
    };
  } catch {
    return null;
  }
};
