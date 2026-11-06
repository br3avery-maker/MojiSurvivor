import type { NostrEvent } from '@nostrify/nostrify';
import {
  deriveEmojiStats,
  isGenuineReserveSvgUrl,
  RESERVE_EMOJI_DEFS,
  type BehaviorArchetype,
  type EmojiCombatTrait,
  type EmojiTier,
} from './cryptoStats';
import {
  getBuiltInBannedHashesSet,
  getBuiltInBannedHexSet,
  normalizeEmojiHashList,
  normalizePubkeyList,
  type EmojiFilterMode,
} from './moderationLists';
import { sanitizeDisplayText, sanitizeRelayUrl, sanitizeShortcode, sanitizeUrl } from './sanitizeUrl';

export interface UpgradeLevels {
  attack: number;
  defense: number;
  speed: number;
  regen: number;
  magnet: number;
}

/**
 * Self-contained Codex entry persisted locally and across Nostr progression snapshots.
 * Stores full emoji metadata and deterministic traits so previously defeated emojis
 * never disappear or lock when offline or before relay NIP-30 packs finish syncing.
 */
export interface CodexKillRecord {
  emojiKey: string;
  shortcode: string;
  url: string;
  kills: number;
  firstDefeatedAt: number;
  lastDefeatedAt: number;
  powerRating: number;
  tier: EmojiTier;
  hp: number;
  speed: number;
  damage: number;
  behaviorType: BehaviorArchetype;
  behaviorName: 'Swarm Rusher' | 'Zigzag Stalker' | 'Shockwave Brute' | 'Orbiting Sniper';
  expValue: number;
  mojoValue: number;
  hash: string;
  source: 'nip30' | 'reserve';
  packTitle?: string;
  packAuthor?: string;
  packDTag?: string;
  eventId?: string;
}

export type ReceiptPublishStatus =
  | 'unsigned_local'
  | 'signing'
  | 'signed_local'
  | 'queued_offline'
  | 'publishing'
  | 'confirmed'
  | 'rejected'
  | 'failed';

export interface FeaturedEmojiSummary {
  emojiKey: string;
  hash?: string;
  shortcode: string;
  url: string;
  tier: EmojiTier;
  powerRating: number;
  packTitle?: string;
}

export interface RunReceiptRecord {
  localId: string;
  runSessionId?: string;
  runHash: string;
  dTag: string;
  pubkey: string;
  score: number;
  wave: number;
  defeated: number;
  bossesDefeated: number;
  durationSec: number;
  mojoEarned: number;
  careerXpEarned?: number;
  weaponsSummary: string;
  strongestSpellName?: string;
  featuredEmoji?: FeaturedEmojiSummary;
  createdAt: number;
  status: ReceiptPublishStatus;
  signedEvent?: NostrEvent;
  acceptedRelays: string[];
  rejectedRelays: Record<string, string>;
  lastError?: string;
}

export type CodexViewMode = 'gallery' | 'stats';

export type ArenaBgStyleSetting =
  | 'auto'
  | 'dungeon_circuit'
  | 'citadel_plates'
  | 'starlight_grid';

export interface GameSettings {
  sfx: boolean;
  haptics: boolean;
  crtScanlines: boolean;
  screenShake: boolean;
  flashingEffects: boolean;
  denseParticles: boolean;
  reducedMotion: boolean;
  codexViewMode: CodexViewMode;
  emojiFilterMode: EmojiFilterMode;
  arenaBgStyle?: ArenaBgStyleSetting;
  opaqueAssetBacking?: boolean;
  autoManageRelays?: boolean;
}

/**
 * Idempotent per-run reward ledger entry.
 * Prevents duplicate Mojo, XP, or kill credits when checkpointing mid-run,
 * resuming a paused run, retrying relay broadcast, or reconciling cross-device saves.
 */
export interface CreditedRunLedgerEntry {
  runSessionId: string;
  mojo: number;
  careerXp: number;
  kills: number;
  bosses?: number;
  wave: number;
  score: number;
  completed: boolean;
  updatedAt: number;
}

export type ProgressSyncStatus =
  | 'idle'
  | 'signing'
  | 'queued_offline'
  | 'publishing'
  | 'confirmed'
  | 'rejected'
  | 'failed';

export interface NostrProgressSyncState {
  enabled: boolean;
  status: ProgressSyncStatus;
  dirty: boolean;
  lastSyncedAt?: number;
  lastSyncedPubkey?: string;
  lastEventId?: string;
  pendingSignedEvent?: NostrEvent;
  acceptedRelays: string[];
  rejectedRelays: Record<string, string>;
  lastError?: string;
}

export interface PersistedGameState {
  schemaVersion: number;
  revision: number;
  updatedAt: number;
  ownerPubkey?: string;

  // Permanent currency & career progression (distinct from per-run spell level)
  mojoBalance: number;
  lifetimeMojoEarned: number;
  lifetimeXpEarned: number;
  playerLevel: number;
  playerXp: number;
  playerXpNext: number;
  rebirthCount?: number;
  mojoSpentOnRebirths?: number;
  xpSpentOnRebirths?: number;

  // High-water marks & totals
  highScore: number;
  lifetimeScore?: number;
  bestWave: number;
  totalKills: number;
  totalBossKills?: number;
  totalRuns: number;

  // First-time Nostr relay content warning acknowledgment timestamp (`null` until accepted)
  contentWarningAcceptedAt: number | null;

  // Permanent upgrades, hash-addressed Codex, private NSFW npub & hash ban lists, Safe List, receipts, sync
  upgrades: UpgradeLevels;
  codex: Record<string, CodexKillRecord>;
  blockedEmojiKeys: string[];
  nsfwBanPubkeys: string[];
  nsfwBanEmojiHashes: string[];
  safePackAuthors: string[];
  creditedRuns: Record<string, CreditedRunLedgerEntry>;
  localReceipts: RunReceiptRecord[];
  progressSync: NostrProgressSyncState;
  relays: string[];
  settings: GameSettings;
}

/**
 * Mid-run checkpoint saved on pause / app backgrounding so switching to Amber or
 * another Android app in Web2App does not lose an in-progress Arena session.
 */
export interface ActiveRunCheckpoint {
  runSessionId: string;
  savedAt: number;
  wave: number;
  waveTimer: number;
  score: number;
  mojoEarned: number;
  careerXpEarned: number;
  defeated: number;
  bossesDefeated: number;
  elapsedSec: number;
  playerHp: number;
  playerMaxHp: number;
  spellLevel: number;
  spellExp: number;
  spellExpNext: number;
  weapons: Array<{
    id: 'lightning_zap' | 'garlic_aura' | 'orbiting_blades' | 'plasma_lance' | 'nova_pulse';
    level: number;
    cooldown: number;
    damage: number;
    range: number;
  }>;
  featuredEmoji?: FeaturedEmojiSummary;
}

/**
 * Post-run UI recovery checkpoint so launching external Android signers (`nostrsigner:`)
 * from the Game Over screen restores the exact Run Complete modal upon return.
 */
export interface PendingPostRunSession {
  savedAt: number;
  receiptLocalId: string;
}

export const DEFAULT_RELAYS: string[] = [
  'wss://relay.primal.net',
  'wss://relay.nostr.band',
  'wss://offchain.pub',
  'wss://nostr.mom',
];

export const DEPRECATED_OR_PAID_RELAYS = new Set<string>([
  'wss://relay.damus.io',
  'wss://nostr.wine',
  'wss://nos.lol',
]);

export const CURRENT_SCHEMA_VERSION = 3;
const STORAGE_KEY_V3 = 'mojisurvivor_v3_state';
const STORAGE_KEY_V2_LEGACY = 'mojisurvivor_v2_state';
const STORAGE_KEY_BACKUP = 'mojisurvivor_v3_state_backup';
const ACTIVE_RUN_STORAGE_KEY = 'mojisurvivor_v3_active_run';
const PENDING_POST_RUN_KEY = 'mojisurvivor_v3_post_run';

export interface UpgradeSpec {
  key: keyof UpgradeLevels;
  label: string;
  summary: string;
  maxLevel: number;
  baseCost: number;
  costMultiplier: number;
  formatEffect: (level: number) => string;
}

export const UPGRADE_SPECS: readonly UpgradeSpec[] = [
  {
    key: 'attack',
    label: 'Spell Output',
    summary: 'Increases base weapon and evolved spell damage across all slots.',
    maxLevel: 10,
    baseCost: 25,
    costMultiplier: 1.55,
    formatEffect: (lvl) => `+${lvl * 12}% damage`,
  },
  {
    key: 'defense',
    label: 'Hull Plating',
    summary: 'Raises maximum health and reduces incoming contact and sniper damage.',
    maxLevel: 10,
    baseCost: 25,
    costMultiplier: 1.5,
    formatEffect: (lvl) => `+${lvl * 18} max HP · -${Math.min(45, lvl * 4)}% dmg taken`,
  },
  {
    key: 'speed',
    label: 'Vector Thrusters',
    summary: 'Boosts base arena movement velocity for dodging swarmers and boss slams.',
    maxLevel: 8,
    baseCost: 30,
    costMultiplier: 1.6,
    formatEffect: (lvl) => `+${lvl * 7}% move speed`,
  },
  {
    key: 'regen',
    label: 'Nano Repair',
    summary: 'Continuously restores hull integrity every second during active waves.',
    maxLevel: 8,
    baseCost: 35,
    costMultiplier: 1.65,
    formatEffect: (lvl) => `${(lvl * 0.6).toFixed(1)} HP / sec`,
  },
  {
    key: 'magnet',
    label: 'Attractor Field',
    summary: 'Expands automatic pickup radius for EXP shards and Mojo coins.',
    maxLevel: 8,
    baseCost: 20,
    costMultiplier: 1.5,
    formatEffect: (lvl) => `${75 + lvl * 22}px pickup radius`,
  },
];

export function getUpgradeCost(spec: UpgradeSpec, currentLevel: number): number {
  return Math.floor(spec.baseCost * Math.pow(spec.costMultiplier, currentLevel));
}

export function computeTotalMojoSpentOnUpgrades(upgrades: UpgradeLevels): number {
  let spent = 0;
  for (const spec of UPGRADE_SPECS) {
    const clampedLevel = Math.max(0, Math.min(spec.maxLevel, Math.floor(upgrades[spec.key] || 0)));
    for (let lvl = 0; lvl < clampedLevel; lvl++) {
      spent += getUpgradeCost(spec, lvl);
    }
  }
  return spent;
}

export const MAX_TOTAL_UPGRADE_LEVELS = UPGRADE_SPECS.reduce(
  (sum, spec) => sum + spec.maxLevel,
  0
);

/**
 * Deterministic career progression curve: computes active cycle Player Level,
 * current level XP, and next-level threshold from `cycleXp = lifetimeXpEarned - xpSpentOnRebirths`.
 * All-time `lifetimeXpEarned` remains preserved for profile trading cards and badge math.
 */
export function derivePlayerCareerProgress(
  lifetimeXpEarned: number,
  xpSpentOnRebirths = 0
): {
  playerLevel: number;
  playerXp: number;
  playerXpNext: number;
} {
  const cleanLifetime = Math.max(0, Math.floor(lifetimeXpEarned));
  const cleanSpent = Math.max(0, Math.min(cleanLifetime, Math.floor(xpSpentOnRebirths)));
  let remaining = Math.max(0, cleanLifetime - cleanSpent);
  let level = 1;
  let threshold = 100;

  while (remaining >= threshold && level < 999) {
    remaining -= threshold;
    level += 1;
    threshold = Math.floor(100 * Math.pow(1.22, level - 1) + (level - 1) * 25);
  }

  return {
    playerLevel: level,
    playerXp: remaining,
    playerXpNext: threshold,
  };
}

export function traitToCodexRecord(
  trait: EmojiCombatTrait,
  kills: number,
  firstDefeatedAt: number,
  lastDefeatedAt = firstDefeatedAt
): CodexKillRecord {
  return {
    emojiKey: trait.emojiKey,
    shortcode: trait.shortcode,
    url: trait.url,
    kills: Math.max(1, Math.floor(kills)),
    firstDefeatedAt,
    lastDefeatedAt,
    powerRating: trait.powerRating,
    tier: trait.tier,
    hp: trait.hp,
    speed: trait.speed,
    damage: trait.damage,
    behaviorType: trait.behaviorType,
    behaviorName: trait.behaviorName,
    expValue: trait.expValue,
    mojoValue: trait.mojoValue,
    hash: trait.hash,
    source: trait.source,
    packTitle: trait.packTitle,
    packAuthor: trait.packAuthor,
    packDTag: trait.packDTag,
    eventId: trait.eventId,
  };
}

export function codexRecordToTrait(rec: CodexKillRecord): EmojiCombatTrait {
  return deriveEmojiStats(rec.shortcode, rec.url, rec.source, {
    packTitle: rec.packTitle,
    packAuthor: rec.packAuthor,
    packDTag: rec.packDTag,
    eventId: rec.eventId,
    hashOverride: rec.hash,
  });
}

function prefersReducedMotionDefault(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

export function createDefaultState(): PersistedGameState {
  const reduced = prefersReducedMotionDefault();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    revision: 0,
    updatedAt: 0,
    mojoBalance: 0,
    lifetimeMojoEarned: 0,
    lifetimeXpEarned: 0,
    playerLevel: 1,
    playerXp: 0,
    playerXpNext: 100,
    rebirthCount: 0,
    mojoSpentOnRebirths: 0,
    xpSpentOnRebirths: 0,
    highScore: 0,
    lifetimeScore: 0,
    bestWave: 1,
    totalKills: 0,
    totalBossKills: 0,
    totalRuns: 0,
    contentWarningAcceptedAt: null,
    upgrades: {
      attack: 0,
      defense: 0,
      speed: 0,
      regen: 0,
      magnet: 0,
    },
    codex: {},
    blockedEmojiKeys: [],
    nsfwBanPubkeys: [],
    nsfwBanEmojiHashes: [],
    safePackAuthors: [],
    creditedRuns: {},
    localReceipts: [],
    progressSync: {
      enabled: false,
      status: 'idle',
      dirty: false,
      acceptedRelays: [],
      rejectedRelays: {},
    },
    relays: [...DEFAULT_RELAYS],
    settings: {
      sfx: true,
      haptics: true,
      crtScanlines: false,
      screenShake: !reduced,
      flashingEffects: !reduced,
      denseParticles: !reduced,
      reducedMotion: reduced,
      codexViewMode: 'gallery',
      emojiFilterMode: 'open_with_banlist',
      arenaBgStyle: 'auto',
      opaqueAssetBacking: true,
      autoManageRelays: true,
    },
  };
}

function sanitizeUpgrades(raw: Partial<UpgradeLevels> | undefined): UpgradeLevels {
  const clean: UpgradeLevels = {
    attack: 0,
    defense: 0,
    speed: 0,
    regen: 0,
    magnet: 0,
  };
  if (!raw || typeof raw !== 'object') return clean;
  for (const spec of UPGRADE_SPECS) {
    const val = Number(raw[spec.key] ?? 0);
    if (Number.isFinite(val) && val > 0) {
      clean[spec.key] = Math.min(spec.maxLevel, Math.floor(val));
    }
  }
  return clean;
}

/**
 * Migrates any v1/v2 or v3 JSON payload into a valid v3 `PersistedGameState`
 * without losing high scores, Mojo, upgrades, receipts, or Codex unlocks.
 */
export function normalizeAndMigrateState(rawObj: unknown): PersistedGameState | null {
  if (!rawObj || typeof rawObj !== 'object') return null;
  const src = rawObj as Record<string, unknown>;
  const base = createDefaultState();

  const upgrades = sanitizeUpgrades(src.upgrades as Partial<UpgradeLevels> | undefined);
  const rawRebirthCount = Math.max(0, Math.floor(Number(src.rebirthCount ?? 0) || 0));
  const rawMojoSpentOnRebirths = Math.max(
    0,
    Math.floor(Number(src.mojoSpentOnRebirths ?? 0) || 0)
  );
  const spentOnUpgrades = computeTotalMojoSpentOnUpgrades(upgrades) + rawMojoSpentOnRebirths;

  const rawMojoBalance = Math.max(0, Math.floor(Number(src.mojoBalance ?? 0) || 0));
  const rawHighScore = Math.max(0, Math.floor(Number(src.highScore ?? 0) || 0));
  const rawLifetimeScore = Math.max(0, Math.floor(Number(src.lifetimeScore ?? 0) || 0));
  const rawBestWave = Math.max(1, Math.floor(Number(src.bestWave ?? 1) || 1));
  const rawTotalKills = Math.max(0, Math.floor(Number(src.totalKills ?? 0) || 0));
  const rawTotalBossKills = Math.max(0, Math.floor(Number(src.totalBossKills ?? 0) || 0));
  const rawTotalRuns = Math.max(0, Math.floor(Number(src.totalRuns ?? 0) || 0));

  // Settings & npub Moderation Lists (zero keyword/shortcode censorship)
  const rawSettings = (src.settings ?? {}) as Partial<GameSettings>;
  const emojiFilterMode: EmojiFilterMode =
    rawSettings.emojiFilterMode === 'safe_list_only'
      ? 'safe_list_only'
      : 'open_with_banlist';

  const contentWarningAcceptedAt =
    typeof src.contentWarningAcceptedAt === 'number' &&
    Number.isFinite(src.contentWarningAcceptedAt) &&
    src.contentWarningAcceptedAt > 0
      ? Math.floor(src.contentWarningAcceptedAt)
      : null;

  const blockedEmojiKeys = Array.isArray(src.blockedEmojiKeys)
    ? Array.from(
        new Set(
          src.blockedEmojiKeys
            .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
            .slice(0, 1000)
        )
      )
    : [];

  // Merge `nsfwBanPubkeys` and any legacy `blockedPackAuthors`
  const rawBanCandidates: string[] = [
    ...(Array.isArray(src.nsfwBanPubkeys)
      ? src.nsfwBanPubkeys.filter((x): x is string => typeof x === 'string')
      : []),
    ...(Array.isArray(src.blockedPackAuthors)
      ? src.blockedPackAuthors.filter((x): x is string => typeof x === 'string')
      : []),
  ];
  const nsfwBanPubkeys = normalizePubkeyList(rawBanCandidates).slice(0, 500);
  const nsfwBanEmojiHashes = normalizeEmojiHashList(
    Array.isArray(src.nsfwBanEmojiHashes)
      ? src.nsfwBanEmojiHashes.filter((x): x is string => typeof x === 'string')
      : []
  ).slice(0, 1000);

  const safePackAuthors = normalizePubkeyList(
    Array.isArray(src.safePackAuthors)
      ? src.safePackAuthors.filter((x): x is string => typeof x === 'string')
      : []
  ).slice(0, 500);

  const blockedKeySet = new Set(blockedEmojiKeys);
  const bannedAuthorSet = new Set([...getBuiltInBannedHexSet(), ...nsfwBanPubkeys]);
  const bannedHashSet = new Set([...getBuiltInBannedHashesSet(), ...nsfwBanEmojiHashes]);

  // Normalize receipts (clearing featuredEmoji if its key or hash was banned, or if it used a fake SVG)
  const localReceipts: RunReceiptRecord[] = [];
  if (Array.isArray(src.localReceipts)) {
    for (const item of src.localReceipts.slice(0, 60)) {
      if (!item || typeof item !== 'object') continue;
      const r = item as Partial<RunReceiptRecord>;
      if (!r.localId || !r.dTag) continue;

      let cleanFeatured = r.featuredEmoji;
      if (cleanFeatured) {
        const isFakeSvg =
          cleanFeatured.url?.startsWith('data:image/svg+xml;') &&
          !isGenuineReserveSvgUrl(cleanFeatured.url);
        const featHash = cleanFeatured.hash?.toLowerCase();
        if (
          isFakeSvg ||
          blockedKeySet.has(cleanFeatured.emojiKey) ||
          (featHash && bannedHashSet.has(featHash))
        ) {
          cleanFeatured = undefined;
        }
      }

      localReceipts.push({
        localId: String(r.localId),
        runSessionId: r.runSessionId ? String(r.runSessionId) : String(r.localId),
        runHash: String(r.runHash ?? ''),
        dTag: String(r.dTag),
        pubkey: String(r.pubkey ?? ''),
        score: Math.max(0, Math.floor(Number(r.score ?? 0) || 0)),
        wave: Math.max(1, Math.floor(Number(r.wave ?? 1) || 1)),
        defeated: Math.max(0, Math.floor(Number(r.defeated ?? 0) || 0)),
        bossesDefeated: Math.max(0, Math.floor(Number(r.bossesDefeated ?? 0) || 0)),
        durationSec: Math.max(1, Math.floor(Number(r.durationSec ?? 1) || 1)),
        mojoEarned: Math.max(0, Math.floor(Number(r.mojoEarned ?? 0) || 0)),
        careerXpEarned:
          r.careerXpEarned !== undefined
            ? Math.max(0, Math.floor(Number(r.careerXpEarned) || 0))
            : undefined,
        weaponsSummary: String(r.weaponsSummary ?? 'lightning_zap:1'),
        strongestSpellName: r.strongestSpellName ? String(r.strongestSpellName) : undefined,
        featuredEmoji: cleanFeatured,
        createdAt: Math.max(0, Math.floor(Number(r.createdAt ?? 0) || 0)),
        status:
          r.status === 'signing' || r.status === 'publishing'
            ? r.signedEvent
              ? 'signed_local'
              : 'unsigned_local'
            : (r.status ?? 'unsigned_local'),
        signedEvent: r.signedEvent,
        acceptedRelays: Array.isArray(r.acceptedRelays) ? r.acceptedRelays : [],
        rejectedRelays:
          r.rejectedRelays && typeof r.rejectedRelays === 'object' ? r.rejectedRelays : {},
        lastError: r.lastError ? String(r.lastError) : undefined,
      });
    }
  }

  // Normalize creditedRuns ledger & backfill legacy receipts so old runs cannot re-award Mojo
  const creditedRuns: Record<string, CreditedRunLedgerEntry> = {};
  if (src.creditedRuns && typeof src.creditedRuns === 'object') {
    for (const [k, v] of Object.entries(src.creditedRuns as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue;
      const entry = v as Partial<CreditedRunLedgerEntry>;
      const sessionId = String(entry.runSessionId || k);
      creditedRuns[sessionId] = {
        runSessionId: sessionId,
        mojo: Math.max(0, Math.floor(Number(entry.mojo ?? 0) || 0)),
        careerXp: Math.max(0, Math.floor(Number(entry.careerXp ?? 0) || 0)),
        kills: Math.max(0, Math.floor(Number(entry.kills ?? 0) || 0)),
        bosses: Math.max(0, Math.floor(Number(entry.bosses ?? 0) || 0)),
        wave: Math.max(1, Math.floor(Number(entry.wave ?? 1) || 1)),
        score: Math.max(0, Math.floor(Number(entry.score ?? 0) || 0)),
        completed: Boolean(entry.completed),
        updatedAt: Math.max(0, Math.floor(Number(entry.updatedAt ?? 0) || 0)),
      };
    }
  }

  for (const rec of localReceipts) {
    const sid = rec.runSessionId || rec.localId;
    if (!creditedRuns[sid]) {
      const estXp =
        rec.careerXpEarned ??
        rec.defeated * 4 + rec.wave * 20 + rec.bossesDefeated * 75;
      creditedRuns[sid] = {
        runSessionId: sid,
        mojo: rec.mojoEarned,
        careerXp: estXp,
        kills: rec.defeated,
        bosses: rec.bossesDefeated,
        wave: rec.wave,
        score: rec.score,
        completed: true,
        updatedAt: rec.createdAt * 1000,
      };
    }
  }

  const ledgerMojoSum = Object.values(creditedRuns).reduce((acc, r) => acc + r.mojo, 0);
  const ledgerXpSum = Object.values(creditedRuns).reduce((acc, r) => acc + r.careerXp, 0);

  const lifetimeMojoEarned = Math.max(
    Math.floor(Number(src.lifetimeMojoEarned ?? 0) || 0),
    rawMojoBalance + spentOnUpgrades,
    ledgerMojoSum
  );

  // Ensure existing saves keep their exact mojoBalance while never dropping below valid floor
  const mojoBalance =
    src.schemaVersion === CURRENT_SCHEMA_VERSION
      ? Math.max(0, lifetimeMojoEarned - spentOnUpgrades)
      : rawMojoBalance;

  const fallbackLegacyXp = rawTotalKills * 4 + rawTotalRuns * 25 + Math.max(0, rawBestWave - 1) * 30;
  const lifetimeXpEarned = Math.max(
    Math.floor(Number(src.lifetimeXpEarned ?? 0) || 0),
    ledgerXpSum,
    fallbackLegacyXp
  );

  // If a save performed Rebirth(s) before xpSpentOnRebirths was tracked and currently has 0 upgrades,
  // lock the pre-rebirth XP into xpSpentOnRebirths so the active cycle resets cleanly to Lv.1
  const hasExplicitXpSpent =
    typeof src.xpSpentOnRebirths === 'number' && Number.isFinite(src.xpSpentOnRebirths);
  const rawXpSpentOnRebirths = hasExplicitXpSpent
    ? Math.max(0, Math.min(lifetimeXpEarned, Math.floor(Number(src.xpSpentOnRebirths))))
    : rawRebirthCount > 0 && computeTotalUpgradeLevels(upgrades) === 0
      ? lifetimeXpEarned
      : 0;

  const career = derivePlayerCareerProgress(lifetimeXpEarned, rawXpSpentOnRebirths);

  // Migrate Codex to canonical 64-hex SHA-256 hash keys (`nip30:<hash>` / `reserve:<hash>`).
  // Purges any legacy 2-letter shortcode monogram SVGs (`AN`, `CH`, `BE`, etc.) while preserving
  // cumulative `totalKills`, `lifetimeXpEarned`, `playerLevel`, and `mojoBalance` untouched.
  const reserveByShortcode = new Map(
    RESERVE_EMOJI_DEFS.map((d) => [d.shortcode, d] as const)
  );
  const reserveByUrl = new Map(RESERVE_EMOJI_DEFS.map((d) => [d.url, d] as const));

  let rawCodexKillsFloor = 0;
  const codex: Record<string, CodexKillRecord> = {};
  if (src.codex && typeof src.codex === 'object') {
    for (const [rawKey, rawVal] of Object.entries(src.codex as Record<string, unknown>)) {
      if (!rawVal || typeof rawVal !== 'object') continue;
      const entry = rawVal as Partial<CodexKillRecord>;
      const kills = Math.max(0, Math.floor(Number(entry.kills ?? 0) || 0));
      if (kills <= 0) continue;

      rawCodexKillsFloor += kills;

      const cleanCode = sanitizeShortcode(entry.shortcode || rawKey);
      const matchedReserve =
        (entry.url ? reserveByUrl.get(entry.url) : undefined) ||
        ((entry.source === 'reserve' || rawKey.startsWith('reserve:') || !entry.url) && cleanCode
          ? reserveByShortcode.get(cleanCode)
          : undefined);

      let validUrl: string | undefined;
      let source: 'nip30' | 'reserve';

      if (matchedReserve) {
        validUrl = matchedReserve.url;
        source = 'reserve';
      } else {
        // Strictly require a real https:// media URL for NIP-30 emojis (never fake 2-letter shortcode SVGs!)
        validUrl = sanitizeUrl(entry.url);
        source = 'nip30';
      }

      if (!validUrl) continue;

      const derived = deriveEmojiStats(
        cleanCode || matchedReserve?.shortcode || '',
        validUrl,
        source,
        {
          packTitle: sanitizeDisplayText(entry.packTitle || matchedReserve?.packTitle, 36),
          packAuthor:
            entry.packAuthor && /^[0-9a-f]{64}$/i.test(entry.packAuthor)
              ? entry.packAuthor.toLowerCase()
              : undefined,
          packDTag: entry.packDTag ? sanitizeDisplayText(entry.packDTag, 32) : undefined,
          eventId:
            entry.eventId && /^[0-9a-f]{64}$/i.test(entry.eventId)
              ? entry.eventId.toLowerCase()
              : undefined,
        }
      );

      if (blockedKeySet.has(derived.emojiKey) || blockedKeySet.has(rawKey)) continue;
      if (bannedHashSet.has(derived.hash.toLowerCase())) continue;
      if (derived.packAuthor && bannedAuthorSet.has(derived.packAuthor.toLowerCase())) continue;

      const firstAt = Math.max(
        1,
        Math.floor(Number(entry.firstDefeatedAt ?? Date.now()) || Date.now())
      );
      const lastAt = Math.max(
        firstAt,
        Math.floor(Number(entry.lastDefeatedAt ?? firstAt) || firstAt)
      );

      const existing = codex[derived.emojiKey];
      if (existing) {
        // Sum kills if distinct legacy shortcode keys collapsed onto the same canonical media hash
        existing.kills =
          rawKey !== derived.emojiKey
            ? existing.kills + kills
            : Math.max(existing.kills, kills);
        existing.firstDefeatedAt = Math.min(existing.firstDefeatedAt, firstAt);
        existing.lastDefeatedAt = Math.max(existing.lastDefeatedAt, lastAt);
      } else {
        codex[derived.emojiKey] = traitToCodexRecord(derived, kills, firstAt, lastAt);
      }
    }
  }

  const codexKillsFloor = Math.max(
    rawCodexKillsFloor,
    Object.values(codex).reduce((acc, c) => acc + c.kills, 0)
  );

  const autoManageRelays =
    typeof rawSettings.autoManageRelays === 'boolean' ? rawSettings.autoManageRelays : true;

  // Relays: if autoManageRelays is enabled, strip deprecated/dead/paid default relays
  const cleanedRelays = Array.isArray(src.relays)
    ? Array.from(
        new Set(
          src.relays
            .map((r) => (typeof r === 'string' ? sanitizeRelayUrl(r) : undefined))
            .filter(
              (r): r is string =>
                Boolean(r) && (!autoManageRelays || !DEPRECATED_OR_PAID_RELAYS.has(r!))
            )
        )
      )
    : [];

  // Settings
  const settings: GameSettings = {
    sfx: typeof rawSettings.sfx === 'boolean' ? rawSettings.sfx : base.settings.sfx,
    haptics: typeof rawSettings.haptics === 'boolean' ? rawSettings.haptics : base.settings.haptics,
    crtScanlines:
      typeof rawSettings.crtScanlines === 'boolean'
        ? rawSettings.crtScanlines
        : base.settings.crtScanlines,
    screenShake:
      typeof rawSettings.screenShake === 'boolean'
        ? rawSettings.screenShake
        : base.settings.screenShake,
    flashingEffects:
      typeof rawSettings.flashingEffects === 'boolean'
        ? rawSettings.flashingEffects
        : base.settings.flashingEffects,
    denseParticles:
      typeof rawSettings.denseParticles === 'boolean'
        ? rawSettings.denseParticles
        : base.settings.denseParticles,
    reducedMotion:
      typeof rawSettings.reducedMotion === 'boolean'
        ? rawSettings.reducedMotion
        : base.settings.reducedMotion,
    codexViewMode:
      rawSettings.codexViewMode === 'stats'
        ? 'stats'
        : rawSettings.codexViewMode === 'gallery'
          ? 'gallery'
          : base.settings.codexViewMode,
    emojiFilterMode,
    arenaBgStyle:
      rawSettings.arenaBgStyle === 'dungeon_circuit' ||
      rawSettings.arenaBgStyle === 'citadel_plates' ||
      rawSettings.arenaBgStyle === 'starlight_grid' ||
      rawSettings.arenaBgStyle === 'auto'
        ? rawSettings.arenaBgStyle
        : 'auto',
    opaqueAssetBacking:
      typeof rawSettings.opaqueAssetBacking === 'boolean'
        ? rawSettings.opaqueAssetBacking
        : true,
    autoManageRelays,
  };

  // Progress Sync
  const rawSync = (src.progressSync ?? {}) as Partial<NostrProgressSyncState>;
  const progressSync: NostrProgressSyncState = {
    enabled: Boolean(rawSync.enabled),
    status:
      rawSync.status === 'signing' || rawSync.status === 'publishing'
        ? rawSync.pendingSignedEvent
          ? 'queued_offline'
          : 'idle'
        : (rawSync.status ?? 'idle'),
    dirty: Boolean(rawSync.dirty),
    lastSyncedAt: rawSync.lastSyncedAt ? Number(rawSync.lastSyncedAt) : undefined,
    lastSyncedPubkey: rawSync.lastSyncedPubkey ? String(rawSync.lastSyncedPubkey) : undefined,
    lastEventId: rawSync.lastEventId ? String(rawSync.lastEventId) : undefined,
    pendingSignedEvent: rawSync.pendingSignedEvent,
    acceptedRelays: Array.isArray(rawSync.acceptedRelays) ? rawSync.acceptedRelays : [],
    rejectedRelays:
      rawSync.rejectedRelays && typeof rawSync.rejectedRelays === 'object'
        ? rawSync.rejectedRelays
        : {},
    lastError: rawSync.lastError ? String(rawSync.lastError) : undefined,
  };

  const receiptsBossFloor = localReceipts.reduce((acc, r) => acc + (r.bossesDefeated || 0), 0);
  const receiptsScoreSum = localReceipts.reduce((acc, r) => acc + (r.score || 0), 0);
  const ledgerScoreSum = Object.values(creditedRuns).reduce((acc, r) => acc + (r.score || 0), 0);
  const ledgerBossSum = Object.values(creditedRuns).reduce((acc, r) => acc + (r.bosses || 0), 0);

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    revision: Math.max(0, Math.floor(Number(src.revision ?? 1) || 1)),
    updatedAt: Math.max(0, Math.floor(Number(src.updatedAt ?? 0) || 0)),
    ownerPubkey: typeof src.ownerPubkey === 'string' ? src.ownerPubkey : undefined,
    contentWarningAcceptedAt,
    mojoBalance,
    lifetimeMojoEarned: Math.max(lifetimeMojoEarned, mojoBalance + spentOnUpgrades),
    lifetimeXpEarned,
    playerLevel: career.playerLevel,
    playerXp: career.playerXp,
    playerXpNext: career.playerXpNext,
    rebirthCount: rawRebirthCount,
    mojoSpentOnRebirths: rawMojoSpentOnRebirths,
    xpSpentOnRebirths: rawXpSpentOnRebirths,
    highScore: Math.max(
      rawHighScore,
      localReceipts.reduce((m, r) => Math.max(m, r.score), 0)
    ),
    lifetimeScore: Math.max(rawLifetimeScore, receiptsScoreSum, ledgerScoreSum, rawHighScore),
    bestWave: Math.max(
      rawBestWave,
      localReceipts.reduce((m, r) => Math.max(m, r.wave), 1)
    ),
    totalKills: Math.max(rawTotalKills, codexKillsFloor),
    totalBossKills: Math.max(rawTotalBossKills, receiptsBossFloor, ledgerBossSum),
    totalRuns: Math.max(rawTotalRuns, localReceipts.length),
    upgrades,
    codex,
    blockedEmojiKeys,
    nsfwBanPubkeys,
    nsfwBanEmojiHashes,
    safePackAuthors,
    creditedRuns,
    localReceipts,
    progressSync,
    relays: cleanedRelays.length > 0 ? cleanedRelays : [...DEFAULT_RELAYS],
    settings,
  };
}

/**
 * Deterministically merges two progression states (e.g. local vs Android Web2App native bridge,
 * or local offline state vs remote Nostr `d: mojisurvivor:progress:v1` snapshot) without:
 * - duplicating Mojo or XP rewards for already-credited runs
 * - rolling back purchased upgrades
 * - losing Codex discoveries or newer offline settings
 */
export function reconcileProgressionStates(
  local: PersistedGameState,
  incoming: PersistedGameState
): PersistedGameState {
  const localIsNewer = (local.updatedAt || 0) >= (incoming.updatedAt || 0);
  const newer = localIsNewer ? local : incoming;

  const mergedUpgrades: UpgradeLevels = {
    attack: Math.max(local.upgrades.attack, incoming.upgrades.attack),
    defense: Math.max(local.upgrades.defense, incoming.upgrades.defense),
    speed: Math.max(local.upgrades.speed, incoming.upgrades.speed),
    regen: Math.max(local.upgrades.regen, incoming.upgrades.regen),
    magnet: Math.max(local.upgrades.magnet, incoming.upgrades.magnet),
  };

  // Merge idempotent run reward ledger (never double-credits the same runSessionId)
  const mergedCreditedRuns: Record<string, CreditedRunLedgerEntry> = {
    ...incoming.creditedRuns,
  };
  for (const [sid, locRun] of Object.entries(local.creditedRuns)) {
    const remRun = mergedCreditedRuns[sid];
    if (!remRun) {
      mergedCreditedRuns[sid] = { ...locRun };
    } else {
      mergedCreditedRuns[sid] = {
        runSessionId: sid,
        mojo: Math.max(locRun.mojo, remRun.mojo),
        careerXp: Math.max(locRun.careerXp, remRun.careerXp),
        kills: Math.max(locRun.kills, remRun.kills),
        wave: Math.max(locRun.wave, remRun.wave),
        score: Math.max(locRun.score, remRun.score),
        completed: locRun.completed || remRun.completed,
        updatedAt: Math.max(locRun.updatedAt, remRun.updatedAt),
      };
    }
  }

  const mergedBlockedEmojiKeys = Array.from(
    new Set([...(local.blockedEmojiKeys ?? []), ...(incoming.blockedEmojiKeys ?? [])])
  ).slice(0, 1000);
  const mergedNsfwBanPubkeys = normalizePubkeyList([
    ...(local.nsfwBanPubkeys ?? []),
    ...(incoming.nsfwBanPubkeys ?? []),
  ]).slice(0, 500);
  const mergedNsfwBanEmojiHashes = normalizeEmojiHashList([
    ...(local.nsfwBanEmojiHashes ?? []),
    ...(incoming.nsfwBanEmojiHashes ?? []),
  ]).slice(0, 1000);
  const mergedSafePackAuthors = normalizePubkeyList([
    ...(local.safePackAuthors ?? []),
    ...(incoming.safePackAuthors ?? []),
  ]).slice(0, 500);

  const blockedKeysSet = new Set(mergedBlockedEmojiKeys);
  const bannedAuthorsSet = new Set([...getBuiltInBannedHexSet(), ...mergedNsfwBanPubkeys]);
  const bannedHashesSet = new Set([
    ...getBuiltInBannedHashesSet(),
    ...mergedNsfwBanEmojiHashes,
  ]);

  const canonicalizeEntry = (rawEntry: CodexKillRecord): CodexKillRecord | null => {
    const validReserve =
      rawEntry.source === 'reserve' && isGenuineReserveSvgUrl(rawEntry.url);
    const validHttps = rawEntry.source === 'nip30' && Boolean(sanitizeUrl(rawEntry.url));
    if (!validReserve && !validHttps) return null;

    const derived = codexRecordToTrait(rawEntry);
    if (blockedKeysSet.has(derived.emojiKey) || blockedKeysSet.has(rawEntry.emojiKey)) {
      return null;
    }
    if (bannedHashesSet.has(derived.hash.toLowerCase())) return null;
    if (derived.packAuthor && bannedAuthorsSet.has(derived.packAuthor.toLowerCase())) {
      return null;
    }
    return traitToCodexRecord(
      derived,
      rawEntry.kills,
      rawEntry.firstDefeatedAt,
      rawEntry.lastDefeatedAt
    );
  };

  // Merge Codex entries by canonical 64-hex SHA-256 hash without reintroducing fake SVG placeholders
  const mergedCodex: Record<string, CodexKillRecord> = {};
  for (const rawEntry of Object.values(incoming.codex)) {
    const clean = canonicalizeEntry(rawEntry);
    if (!clean) continue;
    mergedCodex[clean.emojiKey] = clean;
  }
  for (const rawLoc of Object.values(local.codex)) {
    const locEntry = canonicalizeEntry(rawLoc);
    if (!locEntry) continue;

    const remEntry = mergedCodex[locEntry.emojiKey];
    if (!remEntry) {
      mergedCodex[locEntry.emojiKey] = locEntry;
    } else {
      const preferMeta =
        locEntry.packTitle && !remEntry.packTitle ? locEntry : remEntry;
      mergedCodex[locEntry.emojiKey] = {
        ...preferMeta,
        kills: Math.max(locEntry.kills, remEntry.kills),
        firstDefeatedAt: Math.min(locEntry.firstDefeatedAt, remEntry.firstDefeatedAt),
        lastDefeatedAt: Math.max(locEntry.lastDefeatedAt, remEntry.lastDefeatedAt),
      };
    }
  }

  // Merge local receipts by dTag / localId
  const receiptByKey = new Map<string, RunReceiptRecord>();
  for (const r of [...incoming.localReceipts, ...local.localReceipts]) {
    const key = r.dTag || r.localId;
    const prev = receiptByKey.get(key);
    if (!prev) {
      receiptByKey.set(key, r);
    } else if (r.status === 'confirmed' && prev.status !== 'confirmed') {
      receiptByKey.set(key, r);
    } else if (!prev.signedEvent && r.signedEvent) {
      receiptByKey.set(key, r);
    }
  }
  const mergedReceipts = Array.from(receiptByKey.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 60);

  // Anti-duplication Mojo & Career XP math
  const ledgerMojoSum = Object.values(mergedCreditedRuns).reduce((s, r) => s + r.mojo, 0);
  const ledgerXpSum = Object.values(mergedCreditedRuns).reduce((s, r) => s + r.careerXp, 0);

  // Unaccounted pre-ledger baseline (for legacy v2 saves that had Mojo before runSessionIds existed)
  const localUnledgeredMojo = Math.max(
    0,
    local.lifetimeMojoEarned -
      Object.values(local.creditedRuns).reduce((s, r) => s + r.mojo, 0)
  );
  const incomingUnledgeredMojo = Math.max(
    0,
    incoming.lifetimeMojoEarned -
      Object.values(incoming.creditedRuns).reduce((s, r) => s + r.mojo, 0)
  );
  const basePreLedgerMojo = Math.max(localUnledgeredMojo, incomingUnledgeredMojo);

  const lifetimeMojoEarned = Math.max(
    local.lifetimeMojoEarned,
    incoming.lifetimeMojoEarned,
    basePreLedgerMojo + ledgerMojoSum
  );

  const localRebirthCount = local.rebirthCount ?? 0;
  const incomingRebirthCount = incoming.rebirthCount ?? 0;
  const mergedRebirthCount = Math.max(localRebirthCount, incomingRebirthCount);
  const mergedMojoSpentOnRebirths = Math.max(
    local.mojoSpentOnRebirths ?? 0,
    incoming.mojoSpentOnRebirths ?? 0
  );

  // If one snapshot has a higher rebirthCount, honor the upgrades from the higher-rebirth state
  const effectiveUpgrades: UpgradeLevels =
    localRebirthCount !== incomingRebirthCount
      ? localRebirthCount > incomingRebirthCount
        ? { ...local.upgrades }
        : { ...incoming.upgrades }
      : mergedUpgrades;

  const totalSpent =
    computeTotalMojoSpentOnUpgrades(effectiveUpgrades) + mergedMojoSpentOnRebirths;
  const mojoBalance = Math.max(0, lifetimeMojoEarned - totalSpent);

  const localUnledgeredXp = Math.max(
    0,
    local.lifetimeXpEarned -
      Object.values(local.creditedRuns).reduce((s, r) => s + r.careerXp, 0)
  );
  const incomingUnledgeredXp = Math.max(
    0,
    incoming.lifetimeXpEarned -
      Object.values(incoming.creditedRuns).reduce((s, r) => s + r.careerXp, 0)
  );
  const lifetimeXpEarned = Math.max(
    local.lifetimeXpEarned,
    incoming.lifetimeXpEarned,
    Math.max(localUnledgeredXp, incomingUnledgeredXp) + ledgerXpSum
  );
  const mergedXpSpentOnRebirths =
    localRebirthCount !== incomingRebirthCount
      ? localRebirthCount > incomingRebirthCount
        ? local.xpSpentOnRebirths ?? 0
        : incoming.xpSpentOnRebirths ?? 0
      : Math.max(local.xpSpentOnRebirths ?? 0, incoming.xpSpentOnRebirths ?? 0);
  const career = derivePlayerCareerProgress(lifetimeXpEarned, mergedXpSpentOnRebirths);

  const codexKillsSum = Object.values(mergedCodex).reduce((s, c) => s + c.kills, 0);
  const completedLedgerRuns = Object.values(mergedCreditedRuns).filter((r) => r.completed).length;
  const ledgerScoreSum = Object.values(mergedCreditedRuns).reduce((s, r) => s + (r.score || 0), 0);
  const ledgerBossSum = Object.values(mergedCreditedRuns).reduce((s, r) => s + (r.bosses || 0), 0);

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    revision: Math.max(local.revision, incoming.revision) + 1,
    updatedAt: Date.now(),
    ownerPubkey: local.ownerPubkey || incoming.ownerPubkey,
    contentWarningAcceptedAt:
      local.contentWarningAcceptedAt || incoming.contentWarningAcceptedAt || null,
    mojoBalance,
    lifetimeMojoEarned,
    lifetimeXpEarned,
    playerLevel: career.playerLevel,
    playerXp: career.playerXp,
    playerXpNext: career.playerXpNext,
    rebirthCount: mergedRebirthCount,
    mojoSpentOnRebirths: mergedMojoSpentOnRebirths,
    xpSpentOnRebirths: mergedXpSpentOnRebirths,
    highScore: Math.max(local.highScore, incoming.highScore),
    lifetimeScore: Math.max(
      local.lifetimeScore ?? 0,
      incoming.lifetimeScore ?? 0,
      ledgerScoreSum,
      local.highScore,
      incoming.highScore
    ),
    bestWave: Math.max(local.bestWave, incoming.bestWave),
    totalKills: Math.max(local.totalKills, incoming.totalKills, codexKillsSum),
    totalBossKills: Math.max(
      local.totalBossKills ?? 0,
      incoming.totalBossKills ?? 0,
      ledgerBossSum
    ),
    totalRuns: Math.max(
      local.totalRuns,
      incoming.totalRuns,
      completedLedgerRuns,
      mergedReceipts.length
    ),
    upgrades: effectiveUpgrades,
    codex: mergedCodex,
    blockedEmojiKeys: mergedBlockedEmojiKeys,
    nsfwBanPubkeys: mergedNsfwBanPubkeys,
    nsfwBanEmojiHashes: mergedNsfwBanEmojiHashes,
    safePackAuthors: mergedSafePackAuthors,
    creditedRuns: mergedCreditedRuns,
    localReceipts: mergedReceipts,
    progressSync: {
      ...local.progressSync,
      enabled: local.progressSync.enabled || incoming.progressSync.enabled,
    },
    relays: newer.relays.length > 0 ? newer.relays : [...DEFAULT_RELAYS],
    settings: { ...newer.settings },
  };
}

/**
 * Applies an incremental or final run checkpoint idempotently using `runSessionId`.
 * Calling this repeatedly with increasing or identical totals for the same `runSessionId`
 * ONLY credits the delta above what was already banked for that run!
 */
export function applyRunCheckpointToState(
  prev: PersistedGameState,
  checkpoint: {
    runSessionId: string;
    mojoEarnedTotal: number;
    careerXpEarnedTotal: number;
    killsTotal: number;
    bossesDefeatedTotal?: number;
    waveReached: number;
    scoreReached: number;
    completed: boolean;
  }
): PersistedGameState {
  const existing = prev.creditedRuns[checkpoint.runSessionId];
  const prevMojo = existing?.mojo ?? 0;
  const prevXp = existing?.careerXp ?? 0;
  const prevKills = existing?.kills ?? 0;
  const prevBosses = existing?.bosses ?? 0;
  const prevScore = existing?.score ?? 0;
  const wasCompleted = existing?.completed ?? false;

  const nextMojo = Math.max(prevMojo, Math.max(0, Math.floor(checkpoint.mojoEarnedTotal)));
  const nextXp = Math.max(prevXp, Math.max(0, Math.floor(checkpoint.careerXpEarnedTotal)));
  const nextKills = Math.max(prevKills, Math.max(0, Math.floor(checkpoint.killsTotal)));
  const nextBosses = Math.max(
    prevBosses,
    Math.max(0, Math.floor(checkpoint.bossesDefeatedTotal ?? 0))
  );
  const nextWave = Math.max(existing?.wave ?? 1, Math.max(1, Math.floor(checkpoint.waveReached)));
  const nextScore = Math.max(prevScore, Math.max(0, Math.floor(checkpoint.scoreReached)));
  const nowCompleted = wasCompleted || checkpoint.completed;

  const deltaMojo = nextMojo - prevMojo;
  const deltaXp = nextXp - prevXp;
  const deltaKills = nextKills - prevKills;
  const deltaBosses = nextBosses - prevBosses;
  const deltaScore = nextScore - prevScore;
  const deltaRuns = !wasCompleted && checkpoint.completed ? 1 : 0;

  if (
    deltaMojo === 0 &&
    deltaXp === 0 &&
    deltaKills === 0 &&
    deltaBosses === 0 &&
    deltaScore === 0 &&
    deltaRuns === 0 &&
    nextScore <= prev.highScore &&
    nextWave <= prev.bestWave &&
    existing
  ) {
    return prev;
  }

  const nextLifetimeMojo = prev.lifetimeMojoEarned + deltaMojo;
  const nextMojoBalance = prev.mojoBalance + deltaMojo;
  const nextLifetimeXp = prev.lifetimeXpEarned + deltaXp;
  const career = derivePlayerCareerProgress(nextLifetimeXp, prev.xpSpentOnRebirths ?? 0);

  // Keep creditedRuns bounded to 150 most recent runs while preserving cumulative totals
  const updatedCredited: Record<string, CreditedRunLedgerEntry> = {
    ...prev.creditedRuns,
    [checkpoint.runSessionId]: {
      runSessionId: checkpoint.runSessionId,
      mojo: nextMojo,
      careerXp: nextXp,
      kills: nextKills,
      bosses: nextBosses,
      wave: nextWave,
      score: nextScore,
      completed: nowCompleted,
      updatedAt: Date.now(),
    },
  };

  const entries = Object.values(updatedCredited);
  if (entries.length > 150) {
    entries.sort((a, b) => b.updatedAt - a.updatedAt);
    const trimmed: Record<string, CreditedRunLedgerEntry> = {};
    for (const item of entries.slice(0, 150)) {
      trimmed[item.runSessionId] = item;
    }
    return {
      ...prev,
      revision: prev.revision + 1,
      updatedAt: Date.now(),
      mojoBalance: nextMojoBalance,
      lifetimeMojoEarned: nextLifetimeMojo,
      lifetimeXpEarned: nextLifetimeXp,
      playerLevel: career.playerLevel,
      playerXp: career.playerXp,
      playerXpNext: career.playerXpNext,
      highScore: Math.max(prev.highScore, nextScore),
      lifetimeScore: (prev.lifetimeScore ?? 0) + deltaScore,
      bestWave: Math.max(prev.bestWave, nextWave),
      totalKills: prev.totalKills + deltaKills,
      totalBossKills: (prev.totalBossKills ?? 0) + deltaBosses,
      totalRuns: prev.totalRuns + deltaRuns,
      creditedRuns: trimmed,
      progressSync: prev.progressSync.enabled
        ? { ...prev.progressSync, dirty: true }
        : prev.progressSync,
    };
  }

  return {
    ...prev,
    revision: prev.revision + 1,
    updatedAt: Date.now(),
    mojoBalance: nextMojoBalance,
    lifetimeMojoEarned: nextLifetimeMojo,
    lifetimeXpEarned: nextLifetimeXp,
    playerLevel: career.playerLevel,
    playerXp: career.playerXp,
    playerXpNext: career.playerXpNext,
    highScore: Math.max(prev.highScore, nextScore),
    lifetimeScore: (prev.lifetimeScore ?? 0) + deltaScore,
    bestWave: Math.max(prev.bestWave, nextWave),
    totalKills: prev.totalKills + deltaKills,
    totalBossKills: (prev.totalBossKills ?? 0) + deltaBosses,
    totalRuns: prev.totalRuns + deltaRuns,
    creditedRuns: updatedCredited,
    progressSync: prev.progressSync.enabled
      ? { ...prev.progressSync, dirty: true }
      : prev.progressSync,
  };
}

export function computeTotalUpgradeLevels(upgrades: UpgradeLevels): number {
  return (
    (upgrades.attack || 0) +
    (upgrades.defense || 0) +
    (upgrades.speed || 0) +
    (upgrades.regen || 0) +
    (upgrades.magnet || 0)
  );
}

export function canPerformCareerRebirth(state: PersistedGameState): boolean {
  const totalUpgradeLevels = computeTotalUpgradeLevels(state.upgrades);
  return state.playerLevel >= 20 || totalUpgradeLevels >= 15;
}

/**
 * Triggers Career Rebirth Prestige:
 * Resets Upgrade Lab levels to 0 AND resets active cycle Player Level to Lv.1 (0/100 XP)
 * while preserving all-time `lifetimeXpEarned` for stats/badges, locking invested Mojo
 * into `mojoSpentOnRebirths` and current `lifetimeXpEarned` into `xpSpentOnRebirths`.
 */
export function performCareerRebirth(prev: PersistedGameState): {
  ok: boolean;
  nextState: PersistedGameState;
  newRebirthCount: number;
  error?: string;
} {
  if (!canPerformCareerRebirth(prev)) {
    return {
      ok: false,
      nextState: prev,
      newRebirthCount: prev.rebirthCount ?? 0,
      error: 'Reach Cycle Player Lv.20 or 15 total Upgrade Lab levels to unlock Career Rebirth.',
    };
  }

  const currentUpgradeMojo = computeTotalMojoSpentOnUpgrades(prev.upgrades);
  const nextRebirthCount = (prev.rebirthCount ?? 0) + 1;
  const nextXpSpentOnRebirths = prev.lifetimeXpEarned;
  const career = derivePlayerCareerProgress(prev.lifetimeXpEarned, nextXpSpentOnRebirths);

  const nextState: PersistedGameState = {
    ...prev,
    revision: prev.revision + 1,
    updatedAt: Date.now(),
    playerLevel: career.playerLevel,
    playerXp: career.playerXp,
    playerXpNext: career.playerXpNext,
    rebirthCount: nextRebirthCount,
    mojoSpentOnRebirths: (prev.mojoSpentOnRebirths ?? 0) + currentUpgradeMojo,
    xpSpentOnRebirths: nextXpSpentOnRebirths,
    upgrades: {
      attack: 0,
      defense: 0,
      speed: 0,
      regen: 0,
      magnet: 0,
    },
    progressSync: prev.progressSync.enabled
      ? { ...prev.progressSync, dirty: true }
      : prev.progressSync,
  };

  return {
    ok: true,
    nextState,
    newRebirthCount: nextRebirthCount,
  };
}

/**
 * Reconciles verified `kind: 30078` run receipts fetched from Nostr relays for the active player
 * back into their local receipts, high-water marks (`highScore`, `bestWave`), and career totals
 * so earlier relay-signed runs are never missing from the Lobby or Profile.
 */
export function mergeOwnRelayRunsIntoState(
  prev: PersistedGameState,
  relayRuns: Array<{
    eventId: string;
    dTag: string;
    pubkey: string;
    score: number;
    wave: number;
    defeated: number;
    bosses: number;
    durationSec: number;
    runHash: string;
    weapons: string;
    createdAt: number;
    rawEvent: NostrEvent;
    featuredEmoji?: FeaturedEmojiSummary;
  }>
): PersistedGameState {
  if (!relayRuns || relayRuns.length === 0) return prev;

  const existingByDTag = new Map<string, RunReceiptRecord>();
  for (const r of prev.localReceipts) {
    existingByDTag.set(r.dTag || r.localId, r);
  }

  let changed = false;
  const mergedReceipts = [...prev.localReceipts];
  const mergedCredited = { ...prev.creditedRuns };

  for (const rel of relayRuns) {
    const key = rel.dTag || rel.eventId;
    const prevRec = existingByDTag.get(key);
    if (!prevRec) {
      const importedRec: RunReceiptRecord = {
        localId: rel.eventId,
        runSessionId: rel.dTag || rel.eventId,
        runHash: rel.runHash,
        dTag: rel.dTag,
        pubkey: rel.pubkey,
        score: rel.score,
        wave: rel.wave,
        defeated: rel.defeated,
        bossesDefeated: rel.bosses,
        durationSec: rel.durationSec,
        mojoEarned: Math.max(5, Math.floor(rel.defeated * 0.4 + rel.wave * 8 + rel.bosses * 25)),
        careerXpEarned: rel.defeated * 4 + rel.wave * 20 + rel.bosses * 75,
        weaponsSummary: rel.weapons,
        featuredEmoji: rel.featuredEmoji,
        createdAt: rel.createdAt,
        status: 'confirmed',
        signedEvent: rel.rawEvent,
        acceptedRelays: ['relay'],
        rejectedRelays: {},
      };
      mergedReceipts.push(importedRec);
      existingByDTag.set(key, importedRec);
      changed = true;

      if (!mergedCredited[key]) {
        mergedCredited[key] = {
          runSessionId: key,
          mojo: 0, // Do not mint duplicate spendable Mojo from historical relay receipts
          careerXp: 0,
          kills: rel.defeated,
          bosses: rel.bosses,
          wave: rel.wave,
          score: rel.score,
          completed: true,
          updatedAt: rel.createdAt * 1000,
        };
      }
    } else if (prevRec.status !== 'confirmed' && rel.rawEvent) {
      const idx = mergedReceipts.findIndex((r) => (r.dTag || r.localId) === key);
      if (idx !== -1) {
        mergedReceipts[idx] = {
          ...prevRec,
          status: 'confirmed',
          signedEvent: rel.rawEvent,
          acceptedRelays:
            prevRec.acceptedRelays.length > 0 ? prevRec.acceptedRelays : ['relay'],
        };
        changed = true;
      }
    }
  }

  const maxRelayScore = relayRuns.reduce((m, r) => Math.max(m, r.score), 0);
  const maxRelayWave = relayRuns.reduce((m, r) => Math.max(m, r.wave), 1);
  const nextHighScore = Math.max(prev.highScore, maxRelayScore);
  const nextBestWave = Math.max(prev.bestWave, maxRelayWave);

  const sortedReceipts = mergedReceipts
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 60);

  const allCompletedRuns = Math.max(
    prev.totalRuns,
    sortedReceipts.length,
    Object.values(mergedCredited).filter((c) => c.completed).length
  );
  const receiptsScoreSum = sortedReceipts.reduce((s, r) => s + r.score, 0);
  const receiptsKillsSum = sortedReceipts.reduce((s, r) => s + r.defeated, 0);
  const receiptsBossSum = sortedReceipts.reduce((s, r) => s + (r.bossesDefeated || 0), 0);

  const nextLifetimeScore = Math.max(
    prev.lifetimeScore ?? 0,
    receiptsScoreSum,
    nextHighScore
  );
  const nextTotalKills = Math.max(prev.totalKills, receiptsKillsSum);
  const nextTotalBossKills = Math.max(prev.totalBossKills ?? 0, receiptsBossSum);

  if (
    !changed &&
    nextHighScore === prev.highScore &&
    nextBestWave === prev.bestWave &&
    nextLifetimeScore === (prev.lifetimeScore ?? 0) &&
    nextTotalKills === prev.totalKills &&
    nextTotalBossKills === (prev.totalBossKills ?? 0) &&
    allCompletedRuns === prev.totalRuns
  ) {
    return prev;
  }

  return {
    ...prev,
    revision: prev.revision + 1,
    updatedAt: Date.now(),
    highScore: nextHighScore,
    bestWave: nextBestWave,
    lifetimeScore: nextLifetimeScore,
    totalKills: nextTotalKills,
    totalBossKills: nextTotalBossKills,
    totalRuns: allCompletedRuns,
    localReceipts: sortedReceipts,
    creditedRuns: mergedCredited,
  };
}

interface AndroidStorageBridge {
  getSavedGameState?: () => string;
  saveGameState?: (json: string) => void;
  vibrate?: (durationMs: number) => void;
}

function getAndroidBridge(): AndroidStorageBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { AndroidNostrBridge?: AndroidStorageBridge }).AndroidNostrBridge;
}

function tryParseCandidate(raw: string | null | undefined): PersistedGameState | null {
  if (!raw || raw.length < 2) return null;
  try {
    return normalizeAndMigrateState(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Loads and reconciles all available persistence slots (`v3`, `v3_backup`, legacy `v2`,
 * and Android Web2App native bridge). Never blindly overwrites newer native Web2App progression
 * with stale browser storage or vice versa.
 */
export function loadPersistedStateWithDiagnostics(): {
  state: PersistedGameState;
  error: string | null;
} {
  const candidates: PersistedGameState[] = [];
  let readError: string | null = null;

  try {
    const v3 = tryParseCandidate(localStorage.getItem(STORAGE_KEY_V3));
    if (v3) candidates.push(v3);

    const backup = tryParseCandidate(localStorage.getItem(STORAGE_KEY_BACKUP));
    if (backup) candidates.push(backup);

    const legacyV2 = tryParseCandidate(localStorage.getItem(STORAGE_KEY_V2_LEGACY));
    if (legacyV2) candidates.push(legacyV2);
  } catch (err) {
    readError =
      err instanceof Error
        ? `Browser storage read warning: ${err.message}`
        : 'Browser storage unavailable.';
  }

  try {
    const bridge = getAndroidBridge();
    if (bridge?.getSavedGameState) {
      const nativeCandidate = tryParseCandidate(bridge.getSavedGameState());
      if (nativeCandidate) {
        candidates.push(nativeCandidate);
      }
    }
  } catch (err) {
    readError =
      err instanceof Error
        ? `Android storage bridge warning: ${err.message}`
        : 'Android storage bridge read failed.';
  }

  if (candidates.length === 0) {
    return { state: createDefaultState(), error: readError };
  }

  // Merge all discovered candidates so neither newer Web2App bridge data nor newer localStorage data is lost
  let merged = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    merged = reconcileProgressionStates(merged, candidates[i]);
  }

  return { state: merged, error: readError };
}

export function loadPersistedState(): PersistedGameState {
  return loadPersistedStateWithDiagnostics().state;
}

/**
 * Immediately flushes `PersistedGameState` to primary v3 slot, recovery backup slot,
 * legacy v2 compatibility key, and Android Web2App native bridge (if available).
 * Returns `{ ok, error }` so storage failures are explicitly surfaced.
 */
export function savePersistedState(state: PersistedGameState): {
  ok: boolean;
  error?: string;
} {
  const stamped: PersistedGameState = {
    ...state,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: state.updatedAt > 0 ? state.updatedAt : Date.now(),
  };

  let serialized = '';
  try {
    serialized = JSON.stringify(stamped);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to serialize game progression.',
    };
  }

  let localOk = false;
  let nativeOk = false;
  let lastErr: string | undefined;

  try {
    localStorage.setItem(STORAGE_KEY_V3, serialized);
    localStorage.setItem(STORAGE_KEY_BACKUP, serialized);
    // Keep v2 key updated so downgrades or external Web2App inspectors see current highScore & state
    localStorage.setItem(STORAGE_KEY_V2_LEGACY, serialized);
    localOk = true;
  } catch (err) {
    lastErr =
      err instanceof Error
        ? `Storage write error: ${err.message}`
        : 'Browser localStorage quota exceeded or blocked.';
  }

  try {
    const bridge = getAndroidBridge();
    if (bridge?.saveGameState) {
      bridge.saveGameState(serialized);
      nativeOk = true;
    }
  } catch (err) {
    lastErr =
      err instanceof Error
        ? `Android bridge write error: ${err.message}`
        : 'Native Web2App storage write failed.';
  }

  if (!localOk && !nativeOk) {
    return { ok: false, error: lastErr || 'Unable to persist game progression.' };
  }
  return { ok: true };
}

export function loadActiveRunCheckpoint(): ActiveRunCheckpoint | null {
  try {
    const raw = localStorage.getItem(ACTIVE_RUN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveRunCheckpoint;
    if (!parsed || typeof parsed !== 'object' || !parsed.runSessionId) return null;
    // Expire stale checkpoints older than 12 hours
    if (Date.now() - (parsed.savedAt || 0) > 12 * 60 * 60 * 1000) {
      localStorage.removeItem(ACTIVE_RUN_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveActiveRunCheckpoint(checkpoint: ActiveRunCheckpoint | null): void {
  try {
    if (!checkpoint) {
      localStorage.removeItem(ACTIVE_RUN_STORAGE_KEY);
    } else {
      localStorage.setItem(ACTIVE_RUN_STORAGE_KEY, JSON.stringify(checkpoint));
    }
  } catch {
    // Non-fatal
  }
}

export function loadPendingPostRunSession(): PendingPostRunSession | null {
  try {
    const raw = localStorage.getItem(PENDING_POST_RUN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingPostRunSession;
    if (!parsed?.receiptLocalId) return null;
    if (Date.now() - (parsed.savedAt || 0) > 6 * 60 * 60 * 1000) {
      localStorage.removeItem(PENDING_POST_RUN_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function savePendingPostRunSession(session: PendingPostRunSession | null): void {
  try {
    if (!session) {
      localStorage.removeItem(PENDING_POST_RUN_KEY);
    } else {
      localStorage.setItem(PENDING_POST_RUN_KEY, JSON.stringify(session));
    }
  } catch {
    // Non-fatal
  }
}

export function triggerHaptic(ms = 20, enabled = true): void {
  if (!enabled) return;
  try {
    const bridge = getAndroidBridge();
    if (bridge?.vibrate) {
      bridge.vibrate(ms);
      return;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(ms);
    }
  } catch {
    // Ignore unsupported vibration APIs
  }
}
