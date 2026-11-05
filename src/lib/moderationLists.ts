import { nip19 } from 'nostr-tools';
import { extractEmojiHash } from './cryptoStats';

export type EmojiFilterMode = 'open_with_banlist' | 'safe_list_only';

/**
 * Built-in `moji-curator-blocklist/v1` NSFW emoji media URLs.
 * Their canonical 64-hex SHA-256 hashes are automatically derived via `extractEmojiHash`
 * and included in `BUILT_IN_NSFW_EMOJI_HASHES`.
 */
export const BUILT_IN_NSFW_EMOJI_URLS: readonly string[] = [
  'https://cdn.discordapp.com/emojis/526833864975319060.gif',
  'https://cdn.discordapp.com/emojis/1006279765629620244.gif',
  'https://blossom.ditto.pub/74bcdbdfafbf4656cf10f91c55b080e736ddb0813ff664ae032c5b19264346eb.gif',
  'https://cdn.discordapp.com/emojis/1011386162633527388.png',
];

/**
 * Canonical repository-level NSFW `npub` / hex pubkey Ban List (`moji-curator-blocklist/v1`).
 * Any `npub1...` or 64-char hex pubkey listed here has its NIP-30 emoji packs
 * filtered out across Arena discovery and the Codex by default.
 */
export const BUILT_IN_NSFW_BAN_NPUBS: readonly string[] = [
  '1a21da9d5ae3dffdac19adf5e400394401f67f8da4113a1b7bdece35b0d99fe2',
  '415778be61cfd789cd58eb06c902706b49dc7da16b0a22125670dff33d81dc42',
  'f4b55ea7491fb70849afa6f673fc58846b61ce7efb1d8051bbae35d1a13a48ab',
  '983d5dae1d2280926cf90c037394dbda4348503f4cc342464df7fde98cabecdf',
  '626b275b16dec6db7a27e807c2db690e71b4d42d482f1817ab370601eeabb735',
  '0b7943cce4a9c7fee87a7921b6201d4f847defc2064d6ba6ad3e3f6cdc43c1b3',
  '0a717f27d9ef6f45dafe49f14a49fa4bac8c51b7efc85ff1f318779d8c43707b',
  '4b56bbf41c92e586e88927acb78836eb49f2b184081ef852625cf78be7d56bd6',
  '025cf9571bc0c7172802bcb37c9de29fcc852f59a4f7c84231ef8eb6fcae30dc',
];

/**
 * Canonical repository-level NSFW Emoji SHA-256 Hash Ban List (`x` / Blossom 64-hex hashes).
 * Blocks matching emoji media across ALL packs and `npub`s even if re-shared in `kind: 10030` lists.
 */
export const BUILT_IN_NSFW_EMOJI_HASHES: readonly string[] = Array.from(
  new Set([
    '74bcdbdfafbf4656cf10f91c55b080e736ddb0813ff664ae032c5b19264346eb',
    ...BUILT_IN_NSFW_EMOJI_URLS.map((u) => extractEmojiHash(u)),
  ])
);

/**
 * Canonical repository-level Verified Safe List (`npub`s).
 * Used when a player opts into "Safe List Only" mode, and grows over time as
 * trusted Nostr custom emoji creators are curated.
 */
export const BUILT_IN_SAFE_NPUBS: readonly string[] = [
  // Add verified safe pack publisher npub1... strings here
];

/**
 * Normalizes an `npub1...`, `nprofile1...`, `nostr:npub1...`, or 64-char hex string
 * into a lowercase 64-character hex public key. Returns `null` if invalid.
 */
export function normalizePubkeyOrNpub(input: string | undefined | null): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim().replace(/^nostr:/i, '');
  if (!trimmed) return null;

  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  try {
    const decoded = nip19.decode(trimmed);
    if (decoded.type === 'npub') {
      return decoded.data.toLowerCase();
    }
    if (decoded.type === 'nprofile' && /^[0-9a-f]{64}$/i.test(decoded.data.pubkey)) {
      return decoded.data.pubkey.toLowerCase();
    }
  } catch {
    // Ignore invalid bech32 input
  }
  return null;
}

/**
 * Normalizes a 64-character SHA-256 emoji hash (accepting optional `sha256:` or `#` prefix,
 * or deriving the canonical SHA-256 hash if a full `https://` emoji URL is pasted).
 */
export function normalizeEmojiHash(input: string | undefined | null): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return extractEmojiHash(trimmed);
  }
  const cleaned = trimmed
    .replace(/^sha256:/i, '')
    .replace(/^#/, '')
    .toLowerCase();
  return /^[0-9a-f]{64}$/.test(cleaned) ? cleaned : null;
}

/**
 * Encodes a 64-character hex public key as an `npub1...` string.
 */
export function pubkeyHexToNpub(pubkeyHex: string): string {
  const norm = normalizePubkeyOrNpub(pubkeyHex);
  if (!norm) return pubkeyHex;
  try {
    return nip19.npubEncode(norm);
  } catch {
    return norm;
  }
}

export function normalizePubkeyList(inputs: readonly string[] | undefined | null): string[] {
  if (!Array.isArray(inputs)) return [];
  const out = new Set<string>();
  for (const item of inputs) {
    const hex = normalizePubkeyOrNpub(item);
    if (hex) out.add(hex);
  }
  return Array.from(out);
}

export function normalizeEmojiHashList(inputs: readonly string[] | undefined | null): string[] {
  if (!Array.isArray(inputs)) return [];
  const out = new Set<string>();
  for (const item of inputs) {
    const hash = normalizeEmojiHash(item);
    if (hash) out.add(hash);
  }
  return Array.from(out);
}

export function getBuiltInBannedHexSet(): Set<string> {
  return new Set(normalizePubkeyList(BUILT_IN_NSFW_BAN_NPUBS));
}

export function getBuiltInBannedHashesSet(): Set<string> {
  return new Set(normalizeEmojiHashList(BUILT_IN_NSFW_EMOJI_HASHES));
}

export function getBuiltInSafeHexSet(): Set<string> {
  return new Set(normalizePubkeyList(BUILT_IN_SAFE_NPUBS));
}

export interface CuratorBlocklistImportResult {
  ok: boolean;
  pubkeys: string[];
  emojiHashes: string[];
  error?: string;
}

/**
 * Parses a `moji-curator-blocklist/v1` JSON payload (or a plain JSON array of npubs/hex/hashes/URLs)
 * into deduplicated 64-hex publisher pubkeys and 64-hex SHA-256 emoji media hashes.
 */
export function parseCuratorBlocklistJson(rawJson: string): CuratorBlocklistImportResult {
  const trimmed = rawJson.trim();
  if (!trimmed) {
    return { ok: false, pubkeys: [], emojiHashes: [], error: 'Paste a blocklist JSON payload first.' };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const pubkeySet = new Set<string>();
    const hashSet = new Set<string>();

    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (typeof item === 'string') {
          const pk = normalizePubkeyOrNpub(item);
          if (pk) {
            pubkeySet.add(pk);
            continue;
          }
          const h = normalizeEmojiHash(item);
          if (h) hashSet.add(h);
        } else if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          const author = normalizePubkeyOrNpub(
            typeof obj.author === 'string' ? obj.author : typeof obj.pubkey === 'string' ? obj.pubkey : null
          );
          if (author) pubkeySet.add(author);
          if (typeof obj.url === 'string' && obj.url.trim()) {
            hashSet.add(extractEmojiHash(obj.url.trim()));
          }
          if (typeof obj.hash === 'string') {
            const h = normalizeEmojiHash(obj.hash);
            if (h) hashSet.add(h);
          }
        }
      }
    } else if (parsed && typeof parsed === 'object') {
      const doc = parsed as Record<string, unknown>;
      if (Array.isArray(doc.blockedPublishers)) {
        for (const pub of doc.blockedPublishers) {
          if (typeof pub === 'string') {
            const pk = normalizePubkeyOrNpub(pub);
            if (pk) pubkeySet.add(pk);
          }
        }
      }
      if (Array.isArray(doc.nsfwBanPubkeys)) {
        for (const pub of doc.nsfwBanPubkeys) {
          if (typeof pub === 'string') {
            const pk = normalizePubkeyOrNpub(pub);
            if (pk) pubkeySet.add(pk);
          }
        }
      }
      if (Array.isArray(doc.nsfwBanEmojiHashes)) {
        for (const rawH of doc.nsfwBanEmojiHashes) {
          if (typeof rawH === 'string') {
            const h = normalizeEmojiHash(rawH);
            if (h) hashSet.add(h);
          }
        }
      }
      if (Array.isArray(doc.blocked)) {
        for (const entry of doc.blocked) {
          if (!entry || typeof entry !== 'object') continue;
          const item = entry as Record<string, unknown>;
          if (typeof item.author === 'string') {
            const pk = normalizePubkeyOrNpub(item.author);
            if (pk) pubkeySet.add(pk);
          }
          if (typeof item.sourceAddress === 'string') {
            const parts = item.sourceAddress.split(':');
            if (parts.length >= 2) {
              const pk = normalizePubkeyOrNpub(parts[1]);
              if (pk) pubkeySet.add(pk);
            }
          }
          if (typeof item.url === 'string' && item.url.trim()) {
            hashSet.add(extractEmojiHash(item.url.trim()));
          }
          if (typeof item.hash === 'string') {
            const h = normalizeEmojiHash(item.hash);
            if (h) hashSet.add(h);
          }
        }
      }
    } else {
      return {
        ok: false,
        pubkeys: [],
        emojiHashes: [],
        error: 'Unrecognized JSON structure. Expected moji-curator-blocklist/v1 object or array.',
      };
    }

    const pubkeys = Array.from(pubkeySet);
    const emojiHashes = Array.from(hashSet);
    if (pubkeys.length === 0 && emojiHashes.length === 0) {
      return {
        ok: false,
        pubkeys: [],
        emojiHashes: [],
        error: 'No valid publisher pubkeys or emoji hashes found in JSON.',
      };
    }

    return { ok: true, pubkeys, emojiHashes };
  } catch (err) {
    return {
      ok: false,
      pubkeys: [],
      emojiHashes: [],
      error: err instanceof Error ? `Invalid JSON: ${err.message}` : 'Failed to parse JSON.',
    };
  }
}

export interface ModerationCandidate {
  emojiKey: string;
  hash: string;
  source: 'nip30' | 'reserve';
  packAuthor?: string;
}

export interface EmojiModerationPolicy {
  filterMode: EmojiFilterMode;
  bannedPubkeys: ReadonlySet<string>;
  bannedEmojiHashes: ReadonlySet<string>;
  safePubkeys: ReadonlySet<string>;
  blockedEmojiKeys: ReadonlySet<string>;
  activeUserPubkey?: string;
  isSignedIn?: boolean;
}

/**
 * Evaluates whether an emoji is allowed under the player's active `npub` + SHA-256 Hash Ban List / Safe List policy.
 * - Zero keyword or shortcode censorship: in default `'open_with_banlist'` mode, all live Nostr packs are allowed
 *   except those matching banned `npub`s or banned 64-hex SHA-256 emoji hashes.
 * - In `'safe_list_only'` mode, only packs authored by safe-listed `npub`s (or the signed-in player's own `npub`)
 *   plus built-in Reserve sprites are shown.
 */
export function isEmojiAllowedByModeration(
  candidate: ModerationCandidate,
  policy: EmojiModerationPolicy
): boolean {
  if (candidate.source === 'reserve') {
    return true;
  }

  if (policy.blockedEmojiKeys.has(candidate.emojiKey)) {
    return false;
  }

  if (candidate.hash && policy.bannedEmojiHashes.has(candidate.hash.toLowerCase())) {
    return false;
  }

  const authorLower = candidate.packAuthor?.toLowerCase();
  if (authorLower && policy.bannedPubkeys.has(authorLower)) {
    return false;
  }

  if (policy.filterMode === 'safe_list_only') {
    if (!authorLower) return false;
    if (policy.safePubkeys.has(authorLower)) return true;
    if (
      policy.isSignedIn &&
      policy.activeUserPubkey &&
      authorLower === policy.activeUserPubkey.toLowerCase()
    ) {
      return true;
    }
    return false;
  }

  return true;
}
