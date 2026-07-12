const INSTAGRAM_HOST_RE = /^(?:www\.)?instagram\.com$|^m\.instagram\.com$/;

export function normalizeInstagramUrl(url: string): string {
  return url.trim();
}

export function isValidInstagramUrl(url: string): boolean {
  try {
    const parsed = new URL(normalizeInstagramUrl(url));
    if (!["http:", "https:"].includes(parsed.protocol)) return false;

    const host = parsed.hostname.toLowerCase();
    if (!INSTAGRAM_HOST_RE.test(host)) return false;

    return /^\/(p|reel|tv)\/[A-Za-z0-9_-]+\/?$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function isReelUrl(url: string): boolean {
  return /\/reel\//.test(url);
}
