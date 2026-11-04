import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from 'nostr-tools/utils';

export type EmojiTier = 'Common' | 'Rare' | 'Epic' | 'Apex';
export type BehaviorArchetype = 0 | 1 | 2 | 3;

export interface EmojiCombatTrait {
  emojiKey: string;
  shortcode: string;
  url: string;
  hash: string;
  hp: number;
  speed: number;
  damage: number;
  behaviorType: BehaviorArchetype;
  behaviorName: 'Swarm Rusher' | 'Zigzag Stalker' | 'Shockwave Brute' | 'Orbiting Sniper';
  expValue: number;
  mojoValue: number;
  powerRating: number;
  tier: EmojiTier;
  source: 'nip30' | 'reserve';
  packTitle?: string;
  packAuthor?: string;
  packDTag?: string;
  eventId?: string;
}

export const BEHAVIOR_NAMES: readonly [
  'Swarm Rusher',
  'Zigzag Stalker',
  'Shockwave Brute',
  'Orbiting Sniper',
] = ['Swarm Rusher', 'Zigzag Stalker', 'Shockwave Brute', 'Orbiting Sniper'];

const utf8Encoder = new TextEncoder();

export function sha256Hex(input: string): string {
  return bytesToHex(sha256(utf8Encoder.encode(input)));
}

/**
 * Computes a collision-resistant, deterministic identity key for an emoji based on
 * its source, publisher pubkey, pack identifier, shortcode, and canonical media URL hash.
 * Prevents different publishers' `:fire:` or `:pepe:` emojis from overwriting one another.
 */
export function buildStableEmojiKey(
  shortcode: string,
  url: string,
  source: 'nip30' | 'reserve',
  meta?: { packAuthor?: string; packDTag?: string }
): string {
  const cleanCode = shortcode.trim().toLowerCase();
  if (source === 'reserve') {
    return `reserve:${cleanCode}`;
  }
  const authorPart =
    meta?.packAuthor && /^[0-9a-f]{64}$/i.test(meta.packAuthor)
      ? meta.packAuthor.toLowerCase().slice(0, 16)
      : 'global';
  const dPart = (meta?.packDTag ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 24);
  const urlDigest = sha256Hex(url.trim()).slice(0, 10);
  return dPart
    ? `nip30:${authorPart}:${dPart}:${cleanCode}:${urlDigest}`
    : `nip30:${authorPart}:${cleanCode}:${urlDigest}`;
}

/**
 * Deterministically computes enemy combat traits from `shortcode:imageUrl`
 * using real SHA-256 (`@noble/hashes/sha2.js`), matching NIP.md specification.
 */
export function deriveEmojiStats(
  shortcode: string,
  url: string,
  source: 'nip30' | 'reserve' = 'nip30',
  meta?: {
    packTitle?: string;
    packAuthor?: string;
    packDTag?: string;
    eventId?: string;
    emojiKeyOverride?: string;
  }
): EmojiCombatTrait {
  const hash = sha256Hex(`${shortcode}:${url}`);
  const byte0 = parseInt(hash.slice(0, 2), 16);
  const byte1 = parseInt(hash.slice(2, 4), 16);
  const byte2 = parseInt(hash.slice(4, 6), 16);
  const byte3 = parseInt(hash.slice(6, 8), 16);
  const byte4 = parseInt(hash.slice(8, 10), 16);

  const hp = 20 + Math.floor((byte0 / 255) * 80); // 20 - 100
  const speed = Number((1.0 + (byte1 / 255) * 2.2).toFixed(2)); // 1.00 - 3.20
  const damage = 5 + Math.floor((byte2 / 255) * 20); // 5 - 25
  const behaviorType = (byte3 % 4) as BehaviorArchetype;
  const expValue = 1 + Math.floor((byte4 / 255) * 4);
  const mojoValue = 1 + (byte4 > 205 ? 2 : byte4 > 110 ? 1 : 0);

  const powerRating = Math.floor(hp * 0.5 + speed * 15 + damage * 2);

  let tier: EmojiTier = 'Common';
  if (powerRating >= 112) tier = 'Apex';
  else if (powerRating >= 94) tier = 'Epic';
  else if (powerRating >= 76) tier = 'Rare';

  const emojiKey =
    meta?.emojiKeyOverride ||
    buildStableEmojiKey(shortcode, url, source, {
      packAuthor: meta?.packAuthor,
      packDTag: meta?.packDTag,
    });

  return {
    emojiKey,
    shortcode,
    url,
    hash,
    hp,
    speed,
    damage,
    behaviorType,
    behaviorName: BEHAVIOR_NAMES[behaviorType],
    expValue,
    mojoValue,
    powerRating,
    tier,
    source,
    packTitle: meta?.packTitle,
    packAuthor: meta?.packAuthor,
    packDTag: meta?.packDTag,
    eventId: meta?.eventId,
  };
}

function makeReserveSvgDataUri(bg: string, stroke: string, glyphPath: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="4" y="4" width="56" height="56" rx="16" fill="${bg}" stroke="${stroke}" stroke-width="3"/>${glyphPath}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Offline-resilient Nostr community reserve pool (used immediately on cold boot or offline,
 * seamlessly augmented as live NIP-30 kind 30030 & 10030 events stream from relays).
 */
export const RESERVE_EMOJI_DEFS: ReadonlyArray<{ shortcode: string; url: string; packTitle: string }> = [
  {
    shortcode: 'nostrich_runner',
    packTitle: 'Nostr Core Reserve',
    url: makeReserveSvgDataUri(
      '#1A0514',
      '#FF1493',
      '<circle cx="38" cy="22" r="8" fill="#FF1493"/><path d="M44 22l9 3-9 2z" fill="#FFB6D9"/><path d="M36 30v10c-10 0-16 4-18 10h24l4-10" stroke="#FFFFFF" stroke-width="3.5" fill="none" stroke-linecap="round"/>'
    ),
  },
  {
    shortcode: 'zap_bolt',
    packTitle: 'Nostr Core Reserve',
    url: makeReserveSvgDataUri(
      '#1F1400',
      '#FF9900',
      '<path d="M36 12L18 35h13l-3 17 18-23H33l3-17z" fill="#FF9900" stroke="#FFFFFF" stroke-width="1.5"/>'
    ),
  },
  {
    shortcode: 'schnorr_key',
    packTitle: 'Nostr Core Reserve',
    url: makeReserveSvgDataUri(
      '#14081E',
      '#00F0FF',
      '<circle cx="24" cy="32" r="9" fill="none" stroke="#00F0FF" stroke-width="4"/><path d="M33 32h17v7m-6-7v5" stroke="#00F0FF" stroke-width="4" stroke-linecap="round"/>'
    ),
  },
  {
    shortcode: 'blossom_petal',
    packTitle: 'Blossom BUD Reserve',
    url: makeReserveSvgDataUri(
      '#1E0614',
      '#FFB6D9',
      '<circle cx="32" cy="20" r="7" fill="#FF1493"/><circle cx="44" cy="30" r="7" fill="#FFB6D9"/><circle cx="39" cy="43" r="7" fill="#FF1493"/><circle cx="25" cy="43" r="7" fill="#FFB6D9"/><circle cx="20" cy="30" r="7" fill="#FF1493"/><circle cx="32" cy="32" r="5" fill="#FFFFFF"/>'
    ),
  },
  {
    shortcode: 'relay_beacon',
    packTitle: 'Nostr Core Reserve',
    url: makeReserveSvgDataUri(
      '#06171C',
      '#00F0FF',
      '<circle cx="32" cy="32" r="5" fill="#00F0FF"/><circle cx="32" cy="32" r="12" fill="none" stroke="#00F0FF" stroke-width="2.5" stroke-dasharray="6 4"/><circle cx="32" cy="32" r="20" fill="none" stroke="#FF1493" stroke-width="2" stroke-dasharray="8 5"/>'
    ),
  },
  {
    shortcode: 'amber_signer',
    packTitle: 'NIP-55 Reserve',
    url: makeReserveSvgDataUri(
      '#211100',
      '#FF9900',
      '<polygon points="32,12 48,26 42,50 22,50 16,26" fill="#FF9900" fill-opacity="0.3" stroke="#FF9900" stroke-width="3"/><polygon points="32,19 41,28 37,43 27,43 23,28" fill="#FF9900"/>'
    ),
  },
  {
    shortcode: 'bunker_vault',
    packTitle: 'NIP-46 Reserve',
    url: makeReserveSvgDataUri(
      '#111111',
      '#FFFFFF',
      '<rect x="16" y="18" width="32" height="28" rx="5" fill="#1A1A1A" stroke="#FFFFFF" stroke-width="3"/><circle cx="32" cy="32" r="6" fill="none" stroke="#FF1493" stroke-width="3"/>'
    ),
  },
  {
    shortcode: 'merkle_tree',
    packTitle: 'Hashtree Reserve',
    url: makeReserveSvgDataUri(
      '#081A10',
      '#00F0FF',
      '<circle cx="32" cy="16" r="4" fill="#FFFFFF"/><circle cx="20" cy="32" r="4" fill="#00F0FF"/><circle cx="44" cy="32" r="4" fill="#00F0FF"/><circle cx="14" cy="48" r="4" fill="#FF1493"/><circle cx="26" cy="48" r="4" fill="#FF1493"/><circle cx="38" cy="48" r="4" fill="#FF1493"/><circle cx="50" cy="48" r="4" fill="#FF1493"/><path d="M32 20L20 28M32 20l12 8M20 36l-6 8M20 36l6 8M44 36l-6 8M44 36l6 8" stroke="#B8B8B8" stroke-width="2"/>'
    ),
  },
  {
    shortcode: 'event_phantom',
    packTitle: 'Nostr Core Reserve',
    url: makeReserveSvgDataUri(
      '#190619',
      '#FF1493',
      '<path d="M20 48V28a12 12 0 0124 0v20l-6-5-6 5-6-5-6 5z" fill="#FF1493" fill-opacity="0.28" stroke="#FF1493" stroke-width="3"/><circle cx="27" cy="28" r="2.5" fill="#FFFFFF"/><circle cx="37" cy="28" r="2.5" fill="#FFFFFF"/>'
    ),
  },
  {
    shortcode: 'outbox_gossip',
    packTitle: 'NIP-65 Reserve',
    url: makeReserveSvgDataUri(
      '#141414',
      '#FFB6D9',
      '<path d="M16 36l16-20 16 20H38v12H26V36z" fill="#FFB6D9" fill-opacity="0.25" stroke="#FFB6D9" stroke-width="3"/>'
    ),
  },
  {
    shortcode: 'crimson_warden',
    packTitle: 'Apex Reserve',
    url: makeReserveSvgDataUri(
      '#240012',
      '#FF1493',
      '<polygon points="32,10 52,32 32,54 12,32" fill="#FF1493" fill-opacity="0.35" stroke="#FF1493" stroke-width="3"/><circle cx="32" cy="32" r="6" fill="#FFFFFF"/>'
    ),
  },
  {
    shortcode: 'satoshi_crown',
    packTitle: 'Apex Reserve',
    url: makeReserveSvgDataUri(
      '#1F1600',
      '#FF9900',
      '<path d="M14 44l4-22 14 11 14-11 4 22z" fill="#FF9900" fill-opacity="0.35" stroke="#FF9900" stroke-width="3" stroke-linejoin="round"/>'
    ),
  },
];
