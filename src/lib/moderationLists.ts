import { nip19 } from 'nostr-tools';

export type EmojiFilterMode = 'open_with_banlist' | 'safe_list_only';

/**
 * Canonical repository-level NSFW `npub` Ban List.
 * Any `npub1...` or 64-char hex pubkey listed here has its NIP-30 emoji packs
 * filtered out across Arena discovery and the Codex by default.
 */
export const BUILT_IN_NSFW_BAN_NPUBS: readonly string[] = [
  // Add confirmed NSFW pack publisher npub1... strings here
];

/**
 * Canonical repository-level NSFW Emoji SHA-256 Hash Ban List (`x` / Blossom 64-hex hashes).
 * Blocks matching emoji media across ALL packs and `npub`s even if re-shared in `kind: 10030` lists.
 */
export const BUILT_IN_NSFW_EMOJI_HASHES: readonly string[] = [
  // Add confirmed NSFW 64-char SHA-256 emoji hashes here
];

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
 * Normalizes a 64-character SHA-256 emoji hash (accepting optional `sha256:` or `#` prefix).
 */
export function normalizeEmojiHash(input: string | undefined | null): string | null {
  if (!input || typeof input !== 'string') return null;
  const cleaned = input
    .trim()
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
