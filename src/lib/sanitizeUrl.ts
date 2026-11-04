/**
 * Strict URL and identifier sanitization following Soapbox MKStack `nostr-security` guidelines.
 * Every URL extracted from Nostr events (NIP-30 emoji sets, kind 0 profiles, relay hints)
 * MUST pass through these helpers at the parse boundary.
 */

/** Returns canonical href for valid https:// URLs, undefined otherwise. */
export function sanitizeUrl(value: string | undefined | null): string | undefined {
  if (!value || typeof value !== 'string') return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Returns canonical wss:// URL for valid Nostr relay endpoints, undefined otherwise. */
export function sanitizeRelayUrl(value: string | undefined | null): string | undefined {
  if (!value || typeof value !== 'string') return undefined;
  try {
    const raw = value.trim();
    const withProto = raw.startsWith('wss://') || raw.startsWith('ws://') ? raw : `wss://${raw}`;
    const url = new URL(withProto);
    if (url.protocol !== 'wss:') return undefined;
    url.hash = '';
    url.search = '';
    return url.href.endsWith('/') && url.pathname === '/' ? url.href.slice(0, -1) : url.href;
  } catch {
    return undefined;
  }
}

/** Sanitizes NIP-30 emoji shortcode to lowercase alphanumeric + underscore/hyphen. */
export function sanitizeShortcode(value: string | undefined | null): string | undefined {
  if (!value || typeof value !== 'string') return undefined;
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/^:|:$/g, '')
    .replace(/[^a-z0-9_-]/g, '');
  if (cleaned.length < 1 || cleaned.length > 48) return undefined;
  return cleaned;
}

/** Sanitizes plain display names from kind 0 profiles without permitting control chars. */
export function sanitizeDisplayText(value: string | undefined | null, maxLen = 40): string | undefined {
  if (!value || typeof value !== 'string') return undefined;
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!cleaned) return undefined;
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen)}…` : cleaned;
}
