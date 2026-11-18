import {
  BunkerURI,
  NBrowserSigner,
  NConnectSigner,
  NPool,
  NRelay1,
  NSecSigner,
  type NostrEvent,
  type NostrFilter,
  type NostrSigner,
} from '@nostrify/nostrify';
import {
  finalizeEvent,
  generateSecretKey,
  getEventHash,
  getPublicKey,
  nip19,
  verifyEvent,
} from 'nostr-tools';
import { createNostrConnectURI, parseBunkerInput } from 'nostr-tools/nip46';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';
import {
  deriveEmojiStats,
  isGenuineReserveSvgUrl,
  RESERVE_EMOJI_DEFS,
  type EmojiCombatTrait,
} from './cryptoStats';
import {
  getBuiltInBannedHashesSet,
  getBuiltInBannedHexSet,
  getBuiltInSafeHexSet,
  isEmojiAllowedByModeration,
  normalizeEmojiHash,
  normalizeEmojiHashList,
  normalizePubkeyList,
  normalizePubkeyOrNpub,
  pubkeyHexToNpub,
  type EmojiFilterMode,
} from './moderationLists';
import {
  sanitizeDisplayText,
  sanitizeRelayUrl,
  sanitizeShortcode,
  sanitizeUrl,
} from './sanitizeUrl';
import {
  codexRecordToTrait,
  DEFAULT_RELAYS,
  DEPRECATED_OR_PAID_RELAYS,
  normalizeAndMigrateState,
  type CodexKillRecord,
  type PersistedGameState,
  type RunReceiptRecord,
} from './storage';
import {
  buildPlayerStatsForAwards,
  determineMojiRarity,
  evaluatePlayerAwards,
  getMojiSillySuperlative,
  type CardRarity,
} from './awardsAndCards';
import { sanitizeBlossomServerList } from './nsitePublisher';
import { normalizeRealmId, type RealmId } from './realms';

export interface RelayProbeResult {
  url: string;
  status: 'online' | 'unreachable' | 'paid_or_restricted';
  latencyMs: number;
  servesGameKinds: boolean;
  eventsSampled: number;
  checkedAt: number;
  reason?: string;
}

export const FREE_PUBLIC_RELAY_CANDIDATES: readonly string[] = [
  'wss://relay.primal.net',
  'wss://relay.nostr.band',
  'wss://offchain.pub',
  'wss://nostr.mom',
  'wss://relay.snort.social',
  'wss://nostr.oxtr.dev',
  'wss://relay.mostr.pub',
  'wss://nostr.einundzwanzig.space',
  'wss://relay.nostr.bg',
  'wss://nostr.fmt.wiz.biz',
  'wss://purplepag.es',
];

export type SignerMode = 'guest' | 'nsec' | 'nip07' | 'nip46' | 'nip55';

export interface NostrProfileMeta {
  pubkey: string;
  name?: string;
  displayName?: string;
  picture?: string;
  nip05?: string;
}

export interface VerifiedLeaderboardEntry {
  eventId: string;
  dTag: string;
  pubkey: string;
  npub: string;
  score: number;
  wave: number;
  defeated: number;
  bosses: number;
  durationSec: number;
  runHash: string;
  weapons: string;
  createdAt: number;
  sigPrefix: string;
  rawEvent: NostrEvent;
  source: 'relay' | 'local_confirmed';
  playerRunCount?: number;
  realmId?: RealmId;
  featuredEmoji?: import('./storage').FeaturedEmojiSummary;
}

export interface PlayerLeaderboardAggregate {
  pubkey: string;
  npub: string;
  runs: VerifiedLeaderboardEntry[];
  bestScoreRun: VerifiedLeaderboardEntry;
  bestWaveRun: VerifiedLeaderboardEntry;
  mostDefeatedRun: VerifiedLeaderboardEntry;
  mostBossesRun: VerifiedLeaderboardEntry;
  careerTotalScore: number;
  careerTotalDefeated: number;
  careerTotalBosses: number;
  careerRunCount: number;
  bestScore: number;
  bestWave: number;
  bestSingleDefeated: number;
  bestSingleBosses: number;
  latestRunAt: number;
  progressSnapshot?: PersistedGameState;
}

export interface AggregatedMojiLeaderboardEntry {
  emojiKey: string;
  shortcode: string;
  url: string;
  source: 'nip30' | 'reserve';
  tier: string;
  behavior: string;
  powerRating: number;
  packTitle: string;
  packAuthor?: string;
  hash?: string;
  totalKills: number;
  timesFeatured: number;
  slainByPlayersCount: number;
  rarity: CardRarity;
  superlative: string;
}

export type ImageLoadStatus = 'loading' | 'ready' | 'broken';

export type Nip55RequestPurpose =
  | 'get_public_key'
  | 'sign_run_receipt'
  | 'sign_progress_sync'
  | 'sign_note_share'
  | 'sign_nip09_delete';

export interface PendingNip55Request {
  requestId: string;
  purpose: Nip55RequestPurpose;
  createdAt: number;
  expiresAt: number;
  expectedPubkey?: string;
  targetLocalId?: string;
  unsignedEvent?: Omit<NostrEvent, 'id' | 'sig'>;
  expectedEventHash?: string;
}

export interface PendingNip46ConnectSession {
  uri: string;
  clientSkHex: string;
  clientPubkey: string;
  secret: string;
  relays: string[];
  createdAt: number;
  expiresAt: number;
}

interface StoredAuthSession {
  mode: SignerMode;
  pubkey: string;
  secretKeyHex?: string;
  bunkerUri?: string;
  clientSecretHex?: string;
}

const AUTH_STORAGE_KEY = 'mojisurvivor_v2_auth';
const GUEST_SK_STORAGE_KEY = 'mojisurvivor_v2_guest_sk';
const DELETED_RUNS_STORAGE_KEY = 'mojisurvivor_v2_deleted_runs';
const NIP55_PENDING_STORAGE_KEY = 'mojisurvivor_v3_nip55_pending';
const NIP46_PENDING_STORAGE_KEY = 'mojisurvivor_v3_nip46_pending';
const PROFILE_DISCOVERY_RELAYS = ['wss://purplepag.es'];

export const PROGRESS_SNAPSHOT_D_TAG = 'mojisurvivor:progress:v1';
export const MODERATION_REPORT_TOPIC = 'mojisurvivor-mod';
const RUN_D_TAG_PATTERN = /^mojisurvivor:run:\d+:[0-9a-f]{6,64}$/i;
const MOD_REPORT_D_TAG_PATTERN =
  /^mojisurvivor:mod:(nsfw_ban|nsfw_hash|safe_nomination):([0-9a-f]{64})$/i;

export interface RelayModerationReport {
  key: string;
  targetPubkey?: string;
  targetNpub?: string;
  emojiHash?: string;
  verdict: 'nsfw_ban' | 'nsfw_hash' | 'safe_nomination';
  packTitle?: string;
  packDTag?: string;
  reason?: string;
  reportCount: number;
  latestCreatedAt: number;
  latestEventId: string;
  reporterPubkeys: string[];
}

export function generateSecureHexToken(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/**
 * Validates a NIP-46 `nostrconnect://` connect response payload.
 * Per NIP-46 security requirements, a generic `'ack'` is insufficient when a CSPRNG secret
 * was issued — `result` MUST strictly match `expectedSecret`.
 */
export function validateNip46PairingResponse(
  payload: { result?: string; error?: string } | null | undefined,
  expectedSecret: string
): { ok: boolean; error?: string } {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Malformed NIP-46 response payload.' };
  }
  if (payload.error) {
    return { ok: false, error: String(payload.error) };
  }
  if (!expectedSecret || expectedSecret.length < 16) {
    return { ok: false, error: 'Missing local NIP-46 pairing secret.' };
  }
  if (payload.result !== expectedSecret) {
    return {
      ok: false,
      error:
        payload.result === 'ack'
          ? 'Rejected generic "ack" response — signer did not echo the required NIP-46 connection secret.'
          : 'Rejected NIP-46 response — connection secret mismatch.',
    };
  }
  return { ok: true };
}

/**
 * Strictly validates that a signed Nostr event matches the exact unsigned template,
 * expected publisher pubkey, deterministic SHA-256 event ID, and BIP-340 Schnorr signature.
 */
export function verifySignedEventMatchesRequest(
  signed: NostrEvent,
  expectedUnsigned: Omit<NostrEvent, 'id' | 'sig'>,
  expectedPubkeyHex: string,
  expectedEventHash?: string
): { ok: boolean; error?: string } {
  if (!signed || typeof signed !== 'object') {
    return { ok: false, error: 'Signed event object is missing.' };
  }
  if (!/^[0-9a-f]{64}$/i.test(signed.pubkey)) {
    return { ok: false, error: 'Signed event has an invalid public key.' };
  }
  if (signed.pubkey.toLowerCase() !== expectedPubkeyHex.toLowerCase()) {
    return {
      ok: false,
      error: 'Signed event pubkey does not match the active Nostr identity.',
    };
  }
  if (signed.kind !== expectedUnsigned.kind) {
    return {
      ok: false,
      error: `Signed event kind (${signed.kind}) does not match requested kind (${expectedUnsigned.kind}).`,
    };
  }
  if (signed.created_at !== expectedUnsigned.created_at) {
    return {
      ok: false,
      error: 'Signed event timestamp does not match the pending request.',
    };
  }
  if (signed.content !== expectedUnsigned.content) {
    return {
      ok: false,
      error: 'Signed event content was altered from the pending request.',
    };
  }
  if (JSON.stringify(signed.tags) !== JSON.stringify(expectedUnsigned.tags)) {
    return {
      ok: false,
      error: 'Signed event tags do not match the pending run/request.',
    };
  }
  const computedHash = getEventHash(signed);
  if (signed.id !== computedHash) {
    return { ok: false, error: 'Signed event ID hash does not match serialized payload.' };
  }
  if (expectedEventHash && signed.id !== expectedEventHash) {
    return {
      ok: false,
      error: 'Signed event belongs to a different request ID than the pending operation.',
    };
  }
  if (!verifyEvent(signed)) {
    return { ok: false, error: 'Invalid BIP-340 Schnorr signature on returned event.' };
  }
  return { ok: true };
}

export function formatShortNpub(pubkeyHex: string): string {
  try {
    if (!pubkeyHex || pubkeyHex.length !== 64) return 'npub1…';
    const npub = nip19.npubEncode(pubkeyHex);
    return `${npub.slice(0, 10)}…${npub.slice(-6)}`;
  } catch {
    return `${pubkeyHex.slice(0, 8)}…`;
  }
}

export function encodeFullNpub(pubkeyHex: string): string {
  try {
    return nip19.npubEncode(pubkeyHex);
  } catch {
    return pubkeyHex;
  }
}

function classifyRelayRejection(rejectedRelays: Record<string, string>): boolean {
  const reasons = Object.values(rejectedRelays);
  if (reasons.length === 0) return false;
  return reasons.some((msg) => {
    const lower = msg.toLowerCase();
    return (
      lower.includes('blocked') ||
      lower.includes('restricted') ||
      lower.includes('invalid') ||
      lower.includes('rejected') ||
      lower.includes('auth-required') ||
      lower.includes('pow:') ||
      lower.includes('rate-limited')
    );
  });
}

/**
 * Genuine Nostr protocol coordinator built on Soapbox's `@nostrify/nostrify` (`NPool`, `NRelay1`,
 * `NSecSigner`, `NBrowserSigner`, `NConnectSigner`) and `nostr-tools` (BIP-340 Schnorr).
 */
export class MojiNostrCoordinator {
  private relays: string[];
  private pool: NPool;
  private activeSigner: NostrSigner | null = null;
  public signerMode: SignerMode = 'guest';
  public pubkey = '';
  private localSecretHex = '';

  // Keyed by collision-resistant canonical SHA-256 hash (`nip30:<64hex>` or `reserve:<64hex>`)
  public emojis = new Map<string, EmojiCombatTrait>();
  public imageCache = new Map<string, HTMLImageElement>();
  public imageStatus = new Map<string, ImageLoadStatus>();
  public profiles = new Map<string, NostrProfileMeta>();
  public leaderboard = new Map<string, VerifiedLeaderboardEntry>();
  public remoteProgressSnapshots = new Map<string, PersistedGameState>();
  private deletedEventIds = new Set<string>();
  private deletedAddresses = new Set<string>();

  public syncingEmojis = false;
  public syncingLeaderboard = false;
  public probingRelays = false;
  public autoManageRelays = true;
  private hasPerformedInitialProbe = false;
  private onAutoRelaysUpdated?: (relays: string[]) => void;
  public relayReachability = new Map<string, 'idle' | 'ok' | 'error'>();
  public relayHealth = new Map<string, RelayProbeResult>();
  public lastSyncError: string | null = null;
  public filteredEmojiCount = 0;
  public moderationReports = new Map<string, RelayModerationReport>();
  public syncingModerationReports = false;

  private listeners = new Set<() => void>();
  private disableNetwork = false;
  private emojiFilterMode: EmojiFilterMode = 'open_with_banlist';
  private nsfwBanPubkeys = new Set<string>();
  private nsfwBanEmojiHashes = new Set<string>();
  private safePackAuthors = new Set<string>();
  private blockedEmojiKeys = new Set<string>();
  private nip51MutedAuthors = new Set<string>();

  constructor(
    initialRelays: string[],
    initialCodex?: Record<string, CodexKillRecord>,
    options?: {
      disableNetwork?: boolean;
      autoManageRelays?: boolean;
      onAutoRelaysUpdated?: (relays: string[]) => void;
      emojiFilterMode?: EmojiFilterMode;
      nsfwBanPubkeys?: string[];
      nsfwBanEmojiHashes?: string[];
      safePackAuthors?: string[];
      blockedEmojiKeys?: string[];
    }
  ) {
    this.disableNetwork = Boolean(options?.disableNetwork);
    this.autoManageRelays = options?.autoManageRelays ?? true;
    this.onAutoRelaysUpdated = options?.onAutoRelaysUpdated;
    if (options?.emojiFilterMode) {
      this.emojiFilterMode = options.emojiFilterMode;
    }
    if (Array.isArray(options?.nsfwBanPubkeys)) {
      this.nsfwBanPubkeys = new Set(normalizePubkeyList(options.nsfwBanPubkeys));
    }
    if (Array.isArray(options?.nsfwBanEmojiHashes)) {
      this.nsfwBanEmojiHashes = new Set(
        normalizeEmojiHashList(options.nsfwBanEmojiHashes)
      );
    }
    if (Array.isArray(options?.safePackAuthors)) {
      this.safePackAuthors = new Set(normalizePubkeyList(options.safePackAuthors));
    }
    if (Array.isArray(options?.blockedEmojiKeys)) {
      this.blockedEmojiKeys = new Set(options.blockedEmojiKeys);
    }

    this.relays = initialRelays
      .map((r) => sanitizeRelayUrl(r))
      .filter(
        (r): r is string =>
          Boolean(r) && (!this.autoManageRelays || !DEPRECATED_OR_PAID_RELAYS.has(r!))
      );
    if (this.relays.length === 0) {
      this.relays = [...DEFAULT_RELAYS];
    }

    this.loadDeletedTombstones();
    this.pool = this.buildPool();
    this.restoreOrInitIdentity();
    this.seedReserveEmojis();
    if (initialCodex) {
      this.hydrateEmojisFromCodex(initialCodex);
    }
  }

  public getEffectiveBannedPubkeys(): Set<string> {
    return new Set([
      ...getBuiltInBannedHexSet(),
      ...this.nsfwBanPubkeys,
      ...this.nip51MutedAuthors,
    ]);
  }

  public getEffectiveBannedEmojiHashes(): Set<string> {
    return new Set([...getBuiltInBannedHashesSet(), ...this.nsfwBanEmojiHashes]);
  }

  public getEffectiveSafePubkeys(): Set<string> {
    return new Set([...getBuiltInSafeHexSet(), ...this.safePackAuthors]);
  }

  public isEmojiAllowed(trait: EmojiCombatTrait): boolean {
    return isEmojiAllowedByModeration(trait, {
      filterMode: this.emojiFilterMode,
      bannedPubkeys: this.getEffectiveBannedSetRef(),
      bannedEmojiHashes: this.getEffectiveBannedEmojiHashes(),
      safePubkeys: this.getEffectiveSafePubkeys(),
      blockedEmojiKeys: this.blockedEmojiKeys,
      activeUserPubkey: this.pubkey,
      isSignedIn: this.isSignedIn(),
    });
  }

  private getEffectiveBannedSetRef(): Set<string> {
    return this.getEffectiveBannedPubkeys();
  }

  /**
   * Updates the active `npub` Ban List, SHA-256 Hash Ban List, Safe List, and filter mode in real time,
   * immediately removing banned emojis from memory and re-syncing if widened.
   */
  public updateModerationPolicy(opts: {
    emojiFilterMode: EmojiFilterMode;
    nsfwBanPubkeys: string[];
    nsfwBanEmojiHashes?: string[];
    safePackAuthors: string[];
    blockedEmojiKeys: string[];
  }): void {
    const prevMode = this.emojiFilterMode;
    const prevBanSize = this.nsfwBanPubkeys.size;
    const prevHashBanSize = this.nsfwBanEmojiHashes.size;
    const prevSafeSize = this.safePackAuthors.size;

    this.emojiFilterMode = opts.emojiFilterMode;
    this.nsfwBanPubkeys = new Set(normalizePubkeyList(opts.nsfwBanPubkeys));
    this.nsfwBanEmojiHashes = new Set(
      normalizeEmojiHashList(opts.nsfwBanEmojiHashes ?? [])
    );
    this.safePackAuthors = new Set(normalizePubkeyList(opts.safePackAuthors));
    this.blockedEmojiKeys = new Set(opts.blockedEmojiKeys);

    this.pruneDisallowedEmojis();
    this.seedReserveEmojis();

    if (
      prevMode !== opts.emojiFilterMode ||
      this.nsfwBanPubkeys.size < prevBanSize ||
      this.nsfwBanEmojiHashes.size < prevHashBanSize ||
      (opts.emojiFilterMode === 'safe_list_only' && this.safePackAuthors.size > prevSafeSize)
    ) {
      void this.syncNip30Emojis();
    }
  }

  private pruneDisallowedEmojis(): void {
    let removed = false;
    for (const [key, trait] of this.emojis.entries()) {
      if (!this.isEmojiAllowed(trait)) {
        this.emojis.delete(key);
        if (trait.source === 'nip30') {
          this.imageCache.delete(trait.url);
          this.imageStatus.delete(trait.url);
        }
        this.filteredEmojiCount += 1;
        removed = true;
      }
    }
    if (removed) {
      this.emit();
    }
  }

  /**
   * Immediately restores all previously unlocked Codex emojis into `this.emojis`
   * (honoring active NSFW npub/hash ban rules and rejecting fake SVG placeholders)
   * so offline restarts retain unlocked entries.
   */
  public hydrateEmojisFromCodex(codex: Record<string, CodexKillRecord>): void {
    let added = false;
    for (const rec of Object.values(codex)) {
      if (!rec || !rec.url) continue;
      if (rec.source === 'reserve' && !isGenuineReserveSvgUrl(rec.url)) continue;
      if (rec.source === 'nip30' && !sanitizeUrl(rec.url)) continue;
      const trait = codexRecordToTrait(rec);
      if (!this.isEmojiAllowed(trait)) continue;
      if (!this.emojis.has(trait.emojiKey)) {
        this.emojis.set(trait.emojiKey, trait);
        this.preloadImage(trait.url);
        added = true;
      }
    }
    if (added) {
      this.emit();
    }
  }

  private loadDeletedTombstones(): void {
    try {
      const raw = localStorage.getItem(DELETED_RUNS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { ids?: string[]; addrs?: string[] };
      if (Array.isArray(parsed.ids)) {
        for (const id of parsed.ids) {
          if (typeof id === 'string') this.deletedEventIds.add(id);
        }
      }
      if (Array.isArray(parsed.addrs)) {
        for (const addr of parsed.addrs) {
          if (typeof addr === 'string') this.deletedAddresses.add(addr);
        }
      }
    } catch {
      // Ignore corrupt tombstone cache
    }
  }

  private persistDeletedTombstones(): void {
    try {
      localStorage.setItem(
        DELETED_RUNS_STORAGE_KEY,
        JSON.stringify({
          ids: Array.from(this.deletedEventIds).slice(-200),
          addrs: Array.from(this.deletedAddresses).slice(-200),
        })
      );
    } catch {
      // Ignore quota errors
    }
  }

  private buildPool(): NPool {
    return new NPool({
      open: (url: string) =>
        new NRelay1(url, {
          idleTimeout: 25_000,
          verifyEvent: (event: NostrEvent): boolean => {
            if (event.kind === 1059 || event.kind === 21059) {
              return event.id === getEventHash(event);
            }
            return verifyEvent(event);
          },
          auth: async (challenge: string) => {
            if (!this.activeSigner) {
              throw new Error('No active signer for NIP-42 AUTH');
            }
            return this.activeSigner.signEvent({
              kind: 22242,
              content: '',
              tags: [
                ['relay', url],
                ['challenge', challenge],
              ],
              created_at: Math.floor(Date.now() / 1000),
            });
          },
        }),
      reqRouter: (filters: NostrFilter[]) => {
        const routes = new Map<string, NostrFilter[]>();
        const isProfileOnly = filters.every(
          (f) => f.kinds && f.kinds.length === 1 && f.kinds[0] === 0
        );
        const targets = isProfileOnly
          ? Array.from(new Set([...this.relays, ...PROFILE_DISCOVERY_RELAYS]))
          : this.relays;
        for (const url of targets) {
          routes.set(url, filters);
        }
        return routes;
      },
      eventRouter: () => [...this.relays],
      eoseTimeout: 1400,
    });
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const cb of this.listeners) {
      cb();
    }
  }

  public getRelays(): string[] {
    return [...this.relays];
  }

  public setAutoManageRelays(
    enabled: boolean,
    onAutoRelaysUpdated?: (relays: string[]) => void
  ): void {
    if (onAutoRelaysUpdated) {
      this.onAutoRelaysUpdated = onAutoRelaysUpdated;
    }
    const changed = this.autoManageRelays !== enabled;
    this.autoManageRelays = enabled;
    this.emit();
    if (enabled && changed) {
      void this.scanAndSelectHealthyRelays(true).then(() => {
        void this.syncAll();
      });
    }
  }

  /**
   * Probes a single relay URL for WebSocket reachability, NIP-11 payment/auth restrictions,
   * round-trip latency, and whether it serves our game event kinds (`30030`, `10030`, `30078`).
   */
  public async probeRelayHealth(
    rawUrl: string,
    timeoutMs = 3400
  ): Promise<RelayProbeResult> {
    const url = sanitizeRelayUrl(rawUrl) ?? rawUrl;
    if (DEPRECATED_OR_PAID_RELAYS.has(url)) {
      const restricted: RelayProbeResult = {
        url,
        status: 'paid_or_restricted',
        latencyMs: 0,
        servesGameKinds: false,
        eventsSampled: 0,
        checkedAt: Date.now(),
        reason: 'Paid, retired, or incompatible relay',
      };
      this.relayHealth.set(url, restricted);
      this.relayReachability.set(url, 'error');
      return restricted;
    }

    const startMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let tempRelay: NRelay1 | null = null;
    try {
      tempRelay = new NRelay1(url, { idleTimeout: 4000 });
      const events = await tempRelay.query(
        [{ kinds: [30030, 10030, 30078], limit: 3 }],
        { signal: AbortSignal.timeout(timeoutMs) }
      );
      const endMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const latencyMs = Math.max(1, Math.round(endMs - startMs));
      const result: RelayProbeResult = {
        url,
        status: 'online',
        latencyMs,
        servesGameKinds: events.length > 0,
        eventsSampled: events.length,
        checkedAt: Date.now(),
      };
      this.relayHealth.set(url, result);
      this.relayReachability.set(url, 'ok');
      return result;
    } catch (err) {
      const endMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const reason = err instanceof Error ? err.message : 'Connection timeout';
      const isPaidOrRestricted = /paid|payment|restricted|auth-required|blocked/i.test(reason);
      const result: RelayProbeResult = {
        url,
        status: isPaidOrRestricted ? 'paid_or_restricted' : 'unreachable',
        latencyMs: Math.max(1, Math.round(endMs - startMs)),
        servesGameKinds: false,
        eventsSampled: 0,
        checkedAt: Date.now(),
        reason,
      };
      this.relayHealth.set(url, result);
      this.relayReachability.set(url, 'error');
      return result;
    } finally {
      if (tempRelay) {
        try {
          await tempRelay.close();
        } catch {
          // Ignore close errors
        }
      }
    }
  }

  /**
   * Scans the candidate pool of free public relays on startup or manual trigger,
   * identifies which relays are online, responsive, and serving our event kinds,
   * and prunes dead/unresponsive relays so the app never repeatedly pings dead endpoints.
   */
  public async scanAndSelectHealthyRelays(forceRescan = false): Promise<string[]> {
    if (this.disableNetwork) return this.relays;
    if (this.probingRelays) return this.relays;
    if (!this.autoManageRelays && !forceRescan) return this.relays;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return this.relays;

    this.probingRelays = true;
    this.emit();

    try {
      const candidateSet = new Set<string>([
        ...this.relays.filter((r) => !DEPRECATED_OR_PAID_RELAYS.has(r)),
        ...FREE_PUBLIC_RELAY_CANDIDATES,
      ]);
      const candidates = Array.from(candidateSet);
      const probeResults = await Promise.all(
        candidates.map((url) => this.probeRelayHealth(url, 3200))
      );

      const onlineRelays = probeResults
        .filter((r) => r.status === 'online')
        .sort((a, b) => {
          // Always prioritize wss://relay.primal.net if online
          if (a.url === 'wss://relay.primal.net') return -1;
          if (b.url === 'wss://relay.primal.net') return 1;
          // Prefer relays that returned game event kinds (30030 / 10030 / 30078)
          if (a.servesGameKinds !== b.servesGameKinds) {
            return a.servesGameKinds ? -1 : 1;
          }
          return a.latencyMs - b.latencyMs;
        });

      if (onlineRelays.length > 0 && this.autoManageRelays) {
        const selected = onlineRelays.slice(0, 4).map((r) => r.url);
        this.relays = selected;
        this.hasPerformedInitialProbe = true;
        this.onAutoRelaysUpdated?.(selected);
      } else if (this.autoManageRelays && this.relays.length === 0) {
        this.relays = ['wss://relay.primal.net'];
      }
      return [...this.relays];
    } finally {
      this.probingRelays = false;
      this.emit();
    }
  }

  public setRelays(nextRelays: string[]): void {
    const cleaned = Array.from(
      new Set(
        nextRelays.map((r) => sanitizeRelayUrl(r)).filter((r): r is string => Boolean(r))
      )
    );
    if (cleaned.length === 0) return;
    this.relays = cleaned;
    this.emit();
    void this.syncAll();
  }

  private seedReserveEmojis(): void {
    for (const def of RESERVE_EMOJI_DEFS) {
      const stats = deriveEmojiStats(def.shortcode, def.url, 'reserve', {
        packTitle: def.packTitle,
      });
      this.emojis.set(stats.emojiKey, stats);
      this.preloadImage(def.url);
    }
  }

  public preloadImage(url: string): HTMLImageElement | undefined {
    const existing = this.imageCache.get(url);
    if (existing) return existing;

    const validReserve = isGenuineReserveSvgUrl(url);
    if (!validReserve && !sanitizeUrl(url)) {
      this.imageStatus.set(url, 'broken');
      return undefined;
    }

    if (typeof Image === 'undefined') {
      if (validReserve) {
        this.imageStatus.set(url, 'ready');
      }
      return undefined;
    }

    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    this.imageStatus.set(url, 'loading');

    const pruneDeadUrl = () => {
      this.imageStatus.set(url, 'broken');
      for (const [key, trait] of this.emojis.entries()) {
        if (trait.source === 'nip30' && trait.url === url) {
          this.emojis.delete(key);
        }
      }
      this.emit();
    };

    img.onload = () => {
      if (img.naturalWidth > 0) {
        this.imageStatus.set(url, 'ready');
        this.emit();
      } else {
        pruneDeadUrl();
      }
    };

    img.onerror = () => {
      pruneDeadUrl();
    };

    img.src = url;
    this.imageCache.set(url, img);
    return img;
  }

  /**
   * Restores saved signer session or initializes a persistent BIP-340 secp256k1 guest keypair.
   */
  private restoreOrInitIdentity(): void {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredAuthSession;
        if (
          (parsed.mode === 'guest' || parsed.mode === 'nsec') &&
          parsed.secretKeyHex &&
          /^[0-9a-f]{64}$/i.test(parsed.secretKeyHex)
        ) {
          const sk = hexToBytes(parsed.secretKeyHex);
          this.localSecretHex = parsed.secretKeyHex;
          this.pubkey = getPublicKey(sk);
          this.activeSigner = new NSecSigner(sk);
          this.signerMode = parsed.mode;
          return;
        }
        if (parsed.mode === 'nip07' && /^[0-9a-f]{64}$/i.test(parsed.pubkey)) {
          this.localSecretHex = '';
          this.pubkey = parsed.pubkey.toLowerCase();
          this.signerMode = 'nip07';
          this.activeSigner = new NBrowserSigner({ timeout: 5000 });
          return;
        }
        if (
          parsed.mode === 'nip46' &&
          parsed.bunkerUri &&
          parsed.clientSecretHex &&
          /^[0-9a-f]{64}$/i.test(parsed.pubkey)
        ) {
          this.localSecretHex = '';
          this.pubkey = parsed.pubkey.toLowerCase();
          this.signerMode = 'nip46';
          const bunker = new BunkerURI(parsed.bunkerUri);
          const clientSigner = new NSecSigner(hexToBytes(parsed.clientSecretHex));
          this.activeSigner = new NConnectSigner({
            relay: this.pool.group(bunker.relays.length > 0 ? bunker.relays : this.relays),
            pubkey: bunker.pubkey,
            signer: clientSigner,
            timeout: 25_000,
          });
          return;
        }
        if (parsed.mode === 'nip55' && /^[0-9a-f]{64}$/i.test(parsed.pubkey)) {
          // CRITICAL: Clear localSecretHex so NIP-55 NEVER falls back to signing with a guest key!
          this.localSecretHex = '';
          this.pubkey = parsed.pubkey.toLowerCase();
          this.signerMode = 'nip55';
          this.activeSigner = null;
          return;
        }
      }
    } catch {
      // Fall through to saved or fresh guest key
    }
    this.activateSavedOrFreshGuestKey();
  }

  private activateSavedOrFreshGuestKey(): void {
    try {
      const savedGuestSk = localStorage.getItem(GUEST_SK_STORAGE_KEY);
      if (savedGuestSk && /^[0-9a-f]{64}$/i.test(savedGuestSk)) {
        const sk = hexToBytes(savedGuestSk);
        const pub = getPublicKey(sk);
        this.localSecretHex = savedGuestSk;
        this.pubkey = pub;
        this.signerMode = 'guest';
        this.activeSigner = new NSecSigner(sk);
        this.persistAuth({
          mode: 'guest',
          pubkey: pub,
          secretKeyHex: savedGuestSk,
        });
        this.emit();
        return;
      }
    } catch {
      // Ignore storage error
    }
    this.generateFreshGuestKey();
  }

  public generateFreshGuestKey(): void {
    const sk = generateSecretKey();
    const skHex = bytesToHex(sk);
    const pub = getPublicKey(sk);
    this.localSecretHex = skHex;
    this.pubkey = pub;
    this.signerMode = 'guest';
    this.activeSigner = new NSecSigner(sk);
    try {
      localStorage.setItem(GUEST_SK_STORAGE_KEY, skHex);
    } catch {
      // Ignore storage error
    }
    this.persistAuth({
      mode: 'guest',
      pubkey: pub,
      secretKeyHex: skHex,
    });
    this.emit();
    void this.fetchProfiles([pub]);
  }

  public isSignedIn(): boolean {
    return this.signerMode !== 'guest';
  }

  public importNsecKey(nsecOrHex: string): { ok: boolean; error?: string } {
    try {
      const trimmed = nsecOrHex.trim();
      let skBytes: Uint8Array;
      if (trimmed.startsWith('nsec1')) {
        const decoded = nip19.decode(trimmed);
        if (decoded.type !== 'nsec') {
          return { ok: false, error: 'Expected an nsec1… secret key.' };
        }
        skBytes = decoded.data;
      } else if (/^[0-9a-f]{64}$/i.test(trimmed)) {
        skBytes = hexToBytes(trimmed.toLowerCase());
      } else {
        return { ok: false, error: 'Invalid secret key format. Paste an nsec1… string.' };
      }

      const skHex = bytesToHex(skBytes);
      const pub = getPublicKey(skBytes);
      this.localSecretHex = skHex;
      this.pubkey = pub;
      this.signerMode = 'nsec';
      this.activeSigner = new NSecSigner(skBytes);
      this.clearPendingNip55Request();
      this.clearPendingNip46Session();
      this.persistAuth({
        mode: 'nsec',
        pubkey: pub,
        secretKeyHex: skHex,
      });
      this.emit();
      void this.fetchProfiles([pub]);
      void this.syncNip30Emojis();
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not decode nsec key.',
      };
    }
  }

  public exportCurrentNsec(): string | null {
    if ((this.signerMode === 'guest' || this.signerMode === 'nsec') && this.localSecretHex) {
      try {
        return nip19.nsecEncode(hexToBytes(this.localSecretHex));
      } catch {
        return null;
      }
    }
    return null;
  }

  public isNip07ExtensionDetected(): boolean {
    return typeof (window as unknown as { nostr?: unknown }).nostr !== 'undefined';
  }

  public isAndroidEnvironment(): boolean {
    const hasBridge =
      typeof (window as unknown as { AndroidNostrBridge?: unknown }).AndroidNostrBridge !==
      'undefined';
    const isAndroidUA =
      typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
    return hasBridge || isAndroidUA;
  }

  /**
   * 1. NIP-07 Browser Extension (`window.nostr` via `@nostrify/nostrify` `NBrowserSigner`)
   */
  public async connectNip07Extension(): Promise<{ ok: boolean; error?: string }> {
    if (!this.isNip07ExtensionDetected()) {
      return {
        ok: false,
        error:
          'No NIP-07 extension (Alby, nos2x, Soapbox Signer) detected in this window. Use NIP-46 or Amber instead.',
      };
    }
    try {
      const browserSigner = new NBrowserSigner({ timeout: 5000 });
      const pub = await browserSigner.getPublicKey();
      if (!/^[0-9a-f]{64}$/i.test(pub)) {
        return { ok: false, error: 'Extension returned an invalid hex public key.' };
      }
      this.localSecretHex = '';
      this.pubkey = pub.toLowerCase();
      this.signerMode = 'nip07';
      this.activeSigner = browserSigner;
      this.clearPendingNip55Request();
      this.clearPendingNip46Session();
      this.persistAuth({ mode: 'nip07', pubkey: this.pubkey });
      this.emit();
      void this.fetchProfiles([this.pubkey]);
      void this.syncNip30Emojis();
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Extension connection rejected.',
      };
    }
  }

  /**
   * 2a. NIP-46 Remote Signer via pasted `bunker://` URI or NIP-05 (Preserves tested preview signing!)
   */
  public async connectNip46Bunker(input: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const pointer = await parseBunkerInput(input.trim());
      if (!pointer || !pointer.pubkey) {
        return {
          ok: false,
          error:
            'Invalid bunker:// URI or NIP-05 identifier. Paste a valid bunker://pubkey?relay=wss://... link.',
        };
      }
      const relays =
        pointer.relays.length > 0
          ? pointer.relays
              .map((r) => sanitizeRelayUrl(r))
              .filter((r): r is string => Boolean(r))
          : this.relays;

      const clientSk = generateSecretKey();
      const clientSkHex = bytesToHex(clientSk);
      const clientSigner = new NSecSigner(clientSk);

      const connectSigner = new NConnectSigner({
        relay: this.pool.group(relays),
        pubkey: pointer.pubkey,
        signer: clientSigner,
        timeout: 22_000,
      });

      await connectSigner.connect(pointer.secret || undefined);
      const userPubkey = await connectSigner.getPublicKey();

      const canonicalBunker = BunkerURI.fromJSON({
        pubkey: pointer.pubkey,
        relays,
        secret: pointer.secret || undefined,
      }).toString();

      this.localSecretHex = '';
      this.pubkey = userPubkey.toLowerCase();
      this.signerMode = 'nip46';
      this.activeSigner = connectSigner;
      this.clearPendingNip46Session();
      this.clearPendingNip55Request();
      this.persistAuth({
        mode: 'nip46',
        pubkey: this.pubkey,
        bunkerUri: canonicalBunker,
        clientSecretHex: clientSkHex,
      });
      this.emit();
      void this.fetchProfiles([this.pubkey]);
      void this.syncNip30Emojis();
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? `NIP-46 handshake failed: ${err.message}`
            : 'Remote signer timed out or rejected connection.',
      };
    }
  }

  /**
   * 2b. Client-initiated `nostrconnect://` pairing session with CSPRNG secret validation
   * and app-switch session persistence (Copy URI -> Paste in Amber/Primal -> Approve -> Return).
   */
  public getPendingNip46Session(): PendingNip46ConnectSession | null {
    try {
      const raw =
        sessionStorage.getItem(NIP46_PENDING_STORAGE_KEY) ||
        localStorage.getItem(NIP46_PENDING_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PendingNip46ConnectSession;
      if (
        !parsed?.uri ||
        !parsed.clientSkHex ||
        !parsed.secret ||
        Date.now() > parsed.expiresAt
      ) {
        this.clearPendingNip46Session();
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  public clearPendingNip46Session(): void {
    try {
      sessionStorage.removeItem(NIP46_PENDING_STORAGE_KEY);
      localStorage.removeItem(NIP46_PENDING_STORAGE_KEY);
    } catch {
      // Ignore storage error
    }
  }

  private savePendingNip46Session(session: PendingNip46ConnectSession): void {
    const serialized = JSON.stringify(session);
    try {
      sessionStorage.setItem(NIP46_PENDING_STORAGE_KEY, serialized);
      localStorage.setItem(NIP46_PENDING_STORAGE_KEY, serialized);
    } catch {
      // Ignore storage error
    }
  }

  public createNostrConnectSession(
    abortSignal: AbortSignal,
    reuseExisting = false
  ): {
    uri: string;
    waitForApproval: () => Promise<{ ok: boolean; error?: string }>;
  } {
    const existing = reuseExisting ? this.getPendingNip46Session() : null;

    let session: PendingNip46ConnectSession;
    if (existing) {
      session = existing;
    } else {
      const clientSk = generateSecretKey();
      const clientSkHex = bytesToHex(clientSk);
      const clientPubkey = getPublicKey(clientSk);
      // 128-bit CSPRNG pairing secret (never predictable from timestamp/pubkey)
      const secret = generateSecureHexToken(16);
      const relays = [...this.relays];

      const uri = createNostrConnectURI({
        clientPubkey,
        relays,
        secret,
        name: 'MojiSurvivor',
        perms: [
          'sign_event:30078',
          'sign_event:5',
          'sign_event:1',
          'sign_event:24242',
          'sign_event:15128',
          'sign_event:35128',
          'sign_event:34128',
          'sign_event:10063',
        ],
      });

      const now = Date.now();
      session = {
        uri,
        clientSkHex,
        clientPubkey,
        secret,
        relays,
        createdAt: now,
        expiresAt: now + 10 * 60 * 1000,
      };
      this.savePendingNip46Session(session);
    }

    const waitForApproval = async (): Promise<{ ok: boolean; error?: string }> => {
      const clientSigner = new NSecSigner(hexToBytes(session.clientSkHex));
      const sinceSec = Math.floor(session.createdAt / 1000) - 15;
      const subFilter: NostrFilter = {
        kinds: [24133],
        '#p': [session.clientPubkey],
        since: sinceSec,
      };

      try {
        for await (const msg of this.pool.req([subFilter], { signal: abortSignal })) {
          if (msg[0] !== 'EVENT') continue;
          const ev = msg[2];
          if (!verifyEvent(ev)) continue;

          let decrypted = '';
          try {
            decrypted = await clientSigner.nip44.decrypt(ev.pubkey, ev.content);
          } catch {
            try {
              decrypted = await clientSigner.nip04.decrypt(ev.pubkey, ev.content);
            } catch {
              continue;
            }
          }

          let payload: { result?: string; error?: string };
          try {
            payload = JSON.parse(decrypted) as { result?: string; error?: string };
          } catch {
            continue;
          }

          // Ignore RPC request echoes that don't carry a result/error
          if (payload.result === undefined && payload.error === undefined) {
            continue;
          }

          const check = validateNip46PairingResponse(payload, session.secret);
          if (!check.ok) {
            this.clearPendingNip46Session();
            return { ok: false, error: check.error };
          }

          const remoteSignerPubkey = ev.pubkey;
          const connectSigner = new NConnectSigner({
            relay: this.pool.group(session.relays.length > 0 ? session.relays : this.relays),
            pubkey: remoteSignerPubkey,
            signer: clientSigner,
            timeout: 22_000,
          });
          const actualUserPubkey = await connectSigner.getPublicKey();
          const canonicalBunker = BunkerURI.fromJSON({
            pubkey: remoteSignerPubkey,
            relays: session.relays.length > 0 ? session.relays : this.relays,
          }).toString();

          this.localSecretHex = '';
          this.pubkey = actualUserPubkey.toLowerCase();
          this.signerMode = 'nip46';
          this.activeSigner = connectSigner;
          this.clearPendingNip46Session();
          this.clearPendingNip55Request();
          this.persistAuth({
            mode: 'nip46',
            pubkey: this.pubkey,
            bunkerUri: canonicalBunker,
            clientSecretHex: session.clientSkHex,
          });
          this.emit();
          void this.fetchProfiles([this.pubkey]);
          void this.syncNip30Emojis();
          return { ok: true };
        }
        return { ok: false, error: 'Pairing cancelled.' };
      } catch (err) {
        if (abortSignal.aborted) {
          return { ok: false, error: 'Pairing paused or cancelled.' };
        }
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'NIP-46 pairing failed.',
        };
      }
    };

    return { uri: session.uri, waitForApproval };
  }

  /**
   * 3. NIP-55 Android External Signer (`nostrsigner:` URI primary path — never assumes connected
   * merely from opening URI, never falls back to guest key, binds every response to exact request).
   */
  public getPendingNip55Request(): PendingNip55Request | null {
    try {
      const raw = localStorage.getItem(NIP55_PENDING_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PendingNip55Request;
      if (!parsed?.requestId || !parsed.purpose) {
        this.clearPendingNip55Request();
        return null;
      }
      if (Date.now() > parsed.expiresAt) {
        this.clearPendingNip55Request();
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  public clearPendingNip55Request(): void {
    try {
      localStorage.removeItem(NIP55_PENDING_STORAGE_KEY);
    } catch {
      // Ignore storage error
    }
    this.emit();
  }

  private savePendingNip55Request(req: PendingNip55Request): void {
    try {
      localStorage.setItem(NIP55_PENDING_STORAGE_KEY, JSON.stringify(req));
    } catch {
      // Ignore storage error
    }
    this.emit();
  }

  private buildBaseCallbackUrl(): string {
    if (typeof window === 'undefined') return 'https://localhost/';
    return `${window.location.origin}${window.location.pathname}`;
  }

  /**
   * Prepares a `get_public_key` NIP-55 URI intent for Amber without marking the account
   * signed in yet. Connection only completes when Amber returns a valid public key.
   */
  public prepareNip55PublicKeyRequest(): { requestId: string; uri: string } {
    const requestId = generateSecureHexToken(12);
    const now = Date.now();
    this.savePendingNip55Request({
      requestId,
      purpose: 'get_public_key',
      createdAt: now,
      expiresAt: now + 10 * 60 * 1000,
    });
    const cb = `${this.buildBaseCallbackUrl()}?nip55_req=${requestId}&nip55_pubkey=`;
    const uri = `nostrsigner:?compressionType=none&returnType=signature&type=get_public_key&id=${requestId}&callbackUrl=${encodeURIComponent(cb)}`;
    return { requestId, uri };
  }

  /**
   * Prepares a request-bound `sign_event` NIP-55 URI intent for Amber, locking the exact
   * expected event ID hash, tags, content, kind, and pubkey in persistent pending state.
   */
  public prepareNip55SignEventRequest(opts: {
    purpose: Exclude<Nip55RequestPurpose, 'get_public_key'>;
    unsignedTemplate: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>;
    targetLocalId?: string;
  }): { requestId: string; uri: string; expectedEventHash: string } | { error: string } {
    if (this.signerMode !== 'nip55' || !/^[0-9a-f]{64}$/i.test(this.pubkey)) {
      return { error: 'Amber (NIP-55) identity is not bound yet.' };
    }
    const requestId = generateSecureHexToken(12);
    const unsignedWithPubkey: Omit<NostrEvent, 'id' | 'sig'> = {
      ...opts.unsignedTemplate,
      pubkey: this.pubkey,
    };
    const expectedEventHash = getEventHash(unsignedWithPubkey);
    const now = Date.now();

    this.savePendingNip55Request({
      requestId,
      purpose: opts.purpose,
      createdAt: now,
      expiresAt: now + 15 * 60 * 1000,
      expectedPubkey: this.pubkey,
      targetLocalId: opts.targetLocalId,
      unsignedEvent: unsignedWithPubkey,
      expectedEventHash,
    });

    const encodedJson = encodeURIComponent(JSON.stringify(unsignedWithPubkey));
    const cb = `${this.buildBaseCallbackUrl()}?nip55_req=${requestId}&nip55_signed=`;
    const uri = `nostrsigner:${encodedJson}?compressionType=none&returnType=event&type=sign_event&current_user=${this.pubkey}&id=${requestId}&callbackUrl=${encodeURIComponent(cb)}`;
    return { requestId, uri, expectedEventHash };
  }

  public connectNip55WithPubkey(npubOrHex: string, requestId?: string): {
    ok: boolean;
    error?: string;
  } {
    try {
      const pending = this.getPendingNip55Request();
      if (requestId && pending && pending.requestId !== requestId) {
        return {
          ok: false,
          error: 'Returned Amber public key did not match the active NIP-55 request ID.',
        };
      }

      const trimmed = npubOrHex.trim();
      if (!trimmed || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'rejected') {
        this.clearPendingNip55Request();
        return { ok: false, error: 'Amber public key request was cancelled or rejected.' };
      }

      let hex = '';
      if (trimmed.startsWith('npub1')) {
        const decoded = nip19.decode(trimmed);
        if (decoded.type !== 'npub') {
          return { ok: false, error: 'Expected an npub1… public key.' };
        }
        hex = decoded.data.toLowerCase();
      } else if (/^[0-9a-f]{64}$/i.test(trimmed)) {
        hex = trimmed.toLowerCase();
      } else {
        return { ok: false, error: 'Enter the npub1… or 64-char hex pubkey from Amber.' };
      }

      this.localSecretHex = '';
      this.pubkey = hex;
      this.signerMode = 'nip55';
      this.activeSigner = null;
      this.clearPendingNip55Request();
      this.clearPendingNip46Session();
      this.persistAuth({ mode: 'nip55', pubkey: hex });
      this.emit();
      void this.fetchProfiles([hex]);
      void this.syncNip30Emojis();
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Invalid Amber public key.',
      };
    }
  }

  /**
   * Resolves and strictly verifies a returned Amber NIP-55 signature or signed event JSON
   * against the exact persisted `PendingNip55Request`.
   */
  public resolvePendingNip55SignResponse(opts: {
    rawResponse: string;
    requestId?: string;
    expectedTargetLocalId?: string;
  }):
    | {
        ok: true;
        purpose: Exclude<Nip55RequestPurpose, 'get_public_key'>;
        targetLocalId?: string;
        signedEvent: NostrEvent;
      }
    | { ok: false; error: string } {
    const pending = this.getPendingNip55Request();
    if (!pending || pending.purpose === 'get_public_key' || !pending.unsignedEvent || !pending.expectedPubkey) {
      return {
        ok: false,
        error: 'No matching pending Amber signature request found (or request expired).',
      };
    }

    if (opts.requestId && opts.requestId !== pending.requestId) {
      return {
        ok: false,
        error: 'Rejected Amber callback: request ID does not match the active pending operation.',
      };
    }

    if (
      opts.expectedTargetLocalId &&
      pending.targetLocalId &&
      opts.expectedTargetLocalId !== pending.targetLocalId
    ) {
      return {
        ok: false,
        error: 'Rejected signed event: belongs to a different run receipt.',
      };
    }

    const trimmed = opts.rawResponse.trim();
    if (!trimmed || trimmed.toLowerCase() === 'rejected' || trimmed.toLowerCase() === 'cancelled') {
      this.clearPendingNip55Request();
      return { ok: false, error: 'Signature request was rejected or cancelled in Amber.' };
    }

    let candidateEvent: NostrEvent;
    try {
      if (trimmed.startsWith('{')) {
        candidateEvent = JSON.parse(trimmed) as NostrEvent;
      } else if (/^[0-9a-f]{128}$/i.test(trimmed) && pending.expectedEventHash) {
        // Amber `returnType=signature` fallback: assemble against exact locked unsigned template
        candidateEvent = {
          ...pending.unsignedEvent,
          id: pending.expectedEventHash,
          sig: trimmed.toLowerCase(),
        };
      } else {
        return {
          ok: false,
          error: 'Unrecognized response from Amber. Expected signed event JSON or 128-hex Schnorr signature.',
        };
      }
    } catch {
      return { ok: false, error: 'Malformed signed event JSON returned from Amber.' };
    }

    const verification = verifySignedEventMatchesRequest(
      candidateEvent,
      pending.unsignedEvent,
      pending.expectedPubkey,
      pending.expectedEventHash
    );
    if (!verification.ok) {
      return { ok: false, error: verification.error ?? 'Signed event verification failed.' };
    }

    const resolvedPurpose = pending.purpose;
    const resolvedTargetId = pending.targetLocalId;
    this.clearPendingNip55Request();

    return {
      ok: true,
      purpose: resolvedPurpose,
      targetLocalId: resolvedTargetId,
      signedEvent: candidateEvent,
    };
  }

  public logout(): void {
    this.clearPendingNip55Request();
    this.clearPendingNip46Session();
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // Ignore storage error
    }
    this.activateSavedOrFreshGuestKey();
  }

  public disconnectToGuest(): void {
    this.logout();
  }

  public async refreshActiveProfile(): Promise<void> {
    if (!this.pubkey) return;
    this.profiles.delete(this.pubkey);
    await this.fetchProfiles([this.pubkey]);
  }

  private persistAuth(session: StoredAuthSession): void {
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Ignore storage error
    }
  }

  /**
   * Synchronizes NIP-30 custom emoji packs (including referenced kind:30030 sets from kind:10030)
   * and verified global leaderboard runs from relays.
   * When `autoManageRelays` is enabled, probes candidate free relays on initial startup first
   * so unresponsive relays are pruned before querying.
   */
  public async syncAll(): Promise<void> {
    if (!this.disableNetwork && this.autoManageRelays && !this.hasPerformedInitialProbe) {
      this.hasPerformedInitialProbe = true;
      await this.scanAndSelectHealthyRelays(false);
    }
    await Promise.allSettled([
      this.syncNip30Emojis(),
      this.syncGlobalLeaderboard(),
      this.pubkey ? this.fetchProfiles([this.pubkey]) : Promise.resolve(),
    ]);
  }

  /**
   * Parses a user's NIP-51 `kind: 10000` Mute List (`p` muted pubkeys)
   * so authors muted on Nostr are automatically excluded from emoji discovery.
   */
  public ingestNip51MuteList(ev: NostrEvent): void {
    if (!ev || ev.kind !== 10000 || !verifyEvent(ev)) return;
    for (const tag of ev.tags) {
      if (tag[0] === 'p' && typeof tag[1] === 'string' && /^[0-9a-f]{64}$/i.test(tag[1])) {
        this.nip51MutedAuthors.add(tag[1].toLowerCase());
      }
    }
    this.pruneDisallowedEmojis();
  }

  public ingestNip30PackEvent(ev: NostrEvent): void {
    if (!verifyEvent(ev)) return;

    const authorLower = ev.pubkey.toLowerCase();
    const bannedAuthors = this.getEffectiveBannedPubkeys();
    if (bannedAuthors.has(authorLower)) {
      this.filteredEmojiCount += 1;
      return;
    }

    const rawD = ev.tags.find((t) => t[0] === 'd')?.[1];
    const titleTag = ev.tags.find((t) => t[0] === 'title')?.[1];
    const packTitle = sanitizeDisplayText(
      titleTag || rawD || (ev.kind === 10030 ? 'User Emoji List' : 'NIP-30 Pack'),
      36
    );
    const packDTag = rawD ? sanitizeDisplayText(rawD, 32) : undefined;

    for (const tag of ev.tags) {
      if (tag[0] !== 'emoji') continue;
      const cleanUrl = sanitizeUrl(tag[2]);
      if (!cleanUrl) continue;
      if (this.imageStatus.get(cleanUrl) === 'broken') continue;

      const shortcode = sanitizeShortcode(tag[1]) || '';
      const traits = deriveEmojiStats(shortcode, cleanUrl, 'nip30', {
        packTitle,
        packAuthor: authorLower,
        packDTag,
        eventId: ev.id,
      });

      if (!this.isEmojiAllowed(traits)) {
        this.filteredEmojiCount += 1;
        continue;
      }

      const existing = this.emojis.get(traits.emojiKey);
      if (!existing) {
        this.emojis.set(traits.emojiKey, traits);
        this.preloadImage(cleanUrl);
      } else if (ev.kind === 30030 && existing.packTitle === 'User Emoji List') {
        // Enrich canonical pack metadata when a 30030 set follows a 10030 user list for the same hash
        this.emojis.set(traits.emojiKey, traits);
      }
    }
  }

  public static extractNip30SetReferences(
    events: NostrEvent[]
  ): Array<{ author: string; dTag: string; coord: string }> {
    const fetchedSetCoords = new Set<string>();
    const referencedSetPointers = new Map<
      string,
      { author: string; dTag: string; coord: string }
    >();

    for (const ev of events) {
      if (!verifyEvent(ev)) continue;
      if (ev.kind === 30030) {
        const dVal = ev.tags.find((t) => t[0] === 'd')?.[1] ?? '';
        fetchedSetCoords.add(`30030:${ev.pubkey.toLowerCase()}:${dVal}`);
      }
    }

    for (const ev of events) {
      if (!verifyEvent(ev) || ev.kind !== 10030) continue;
      for (const tag of ev.tags) {
        if (tag[0] !== 'a' || typeof tag[1] !== 'string') continue;
        const parts = tag[1].split(':');
        if (parts.length < 3 || parts[0] !== '30030') continue;
        const refAuthor = parts[1].toLowerCase();
        const refDTag = parts.slice(2).join(':');
        if (!/^[0-9a-f]{64}$/.test(refAuthor) || !refDTag) continue;
        const coord = `30030:${refAuthor}:${refDTag}`;
        if (!fetchedSetCoords.has(coord)) {
          referencedSetPointers.set(coord, { author: refAuthor, dTag: refDTag, coord });
        }
      }
    }

    return Array.from(referencedSetPointers.values());
  }

  public async syncNip30Emojis(): Promise<void> {
    if (this.disableNetwork || this.syncingEmojis) return;

    this.syncingEmojis = true;
    this.emit();

    try {
      const filters: NostrFilter[] = [];
      const hasValidUser = Boolean(this.pubkey && /^[0-9a-f]{64}$/i.test(this.pubkey));

      if (this.emojiFilterMode === 'safe_list_only') {
        const safeAuthors = Array.from(this.getEffectiveSafePubkeys());
        if (this.isSignedIn() && hasValidUser) {
          safeAuthors.push(this.pubkey.toLowerCase());
        }
        const uniqueSafeAuthors = Array.from(new Set(safeAuthors)).slice(0, 60);
        if (uniqueSafeAuthors.length > 0) {
          filters.push({ kinds: [30030, 10030], authors: uniqueSafeAuthors, limit: 60 });
        }
      } else {
        filters.push({ kinds: [30030, 10030], limit: 60 });
        if (hasValidUser) {
          filters.push({ kinds: [10030, 30030, 10000], authors: [this.pubkey], limit: 30 });
        }
      }

      if (filters.length === 0) {
        this.pruneDisallowedEmojis();
        return;
      }

      const events = await this.pool.query(filters, {
        signal: AbortSignal.timeout(8500),
      });

      for (const ev of events) {
        if (ev.kind === 10000) {
          this.ingestNip51MuteList(ev);
        }
      }

      const bannedSet = this.getEffectiveBannedPubkeys();
      const packEvents = events.filter((ev) => ev.kind === 30030 || ev.kind === 10030);
      for (const ev of packEvents) {
        if (!verifyEvent(ev)) continue;
        this.ingestNip30PackEvent(ev);
      }

      const missingRefs = MojiNostrCoordinator.extractNip30SetReferences(packEvents);
      if (missingRefs.length > 0) {
        const ptrs = missingRefs.slice(0, 35);
        const safeSet = this.getEffectiveSafePubkeys();
        const authors = Array.from(new Set(ptrs.map((p) => p.author))).filter((a) => {
          if (bannedSet.has(a)) return false;
          if (this.emojiFilterMode === 'safe_list_only') {
            return safeSet.has(a) || (this.isSignedIn() && a === this.pubkey.toLowerCase());
          }
          return true;
        });
        const dTags = Array.from(new Set(ptrs.map((p) => p.dTag)));

        if (authors.length > 0 && dTags.length > 0) {
          try {
            const referencedEvents = await this.pool.query(
              [{ kinds: [30030], authors, '#d': dTags, limit: 50 }],
              { signal: AbortSignal.timeout(7000) }
            );
            for (const refEv of referencedEvents) {
              if (refEv.kind === 30030) {
                this.ingestNip30PackEvent(refEv);
              }
            }
          } catch {
            // Non-fatal follow-up pack query timeout
          }
        }
      }

      this.pruneDisallowedEmojis();
      this.lastSyncError = null;
    } catch (err) {
      this.lastSyncError =
        err instanceof Error ? err.message : 'Relay NIP-30 discovery timed out.';
    } finally {
      this.syncingEmojis = false;
      this.emit();
    }
  }

  /**
   * Signs an anonymous Nostr moderation report (`kind: 30078`, `#t: mojisurvivor-mod`)
   * using a freshly generated one-time ephemeral keypair (`generateSecretKey()`).
   *
   * Anchors reports on `npub` (`p` tag) and/or canonical 64-hex SHA-256 `emojiHash` (`x` tag) —
   * never shortcodes — while keeping the reporter's personal Nostr identity 100% private.
   */
  public buildAnonymousModerationReportEvent(opts: {
    targetPubkeyOrNpub?: string;
    emojiHash?: string;
    verdict: 'nsfw_ban' | 'nsfw_hash' | 'safe_nomination';
    packTitle?: string;
    packDTag?: string;
    reason?: string;
  }):
    | {
        ok: true;
        event: NostrEvent;
        targetHex?: string;
        targetNpub?: string;
        emojiHash?: string;
      }
    | { ok: false; error: string } {
    const targetHex = normalizePubkeyOrNpub(opts.targetPubkeyOrNpub) ?? undefined;
    const cleanEmojiHash = normalizeEmojiHash(opts.emojiHash) ?? undefined;

    if (opts.verdict === 'nsfw_hash') {
      if (!cleanEmojiHash) {
        return {
          ok: false,
          error: 'Enter a valid 64-character hex SHA-256 emoji hash.',
        };
      }
    } else if (!targetHex) {
      return {
        ok: false,
        error: 'Enter a valid npub1… or 64-character hex public key.',
      };
    }

    const targetNpub = targetHex ? pubkeyHexToNpub(targetHex) : undefined;
    const ephemeralSk = generateSecretKey();

    const cleanPackTitle = sanitizeDisplayText(opts.packTitle, 48);
    const cleanPackDTag = sanitizeDisplayText(opts.packDTag, 40);
    const cleanReason = sanitizeDisplayText(
      opts.reason ||
        (opts.verdict === 'safe_nomination'
          ? 'Verified safe custom emoji pack publisher'
          : opts.verdict === 'nsfw_hash'
            ? 'NSFW custom emoji media SHA-256 hash'
            : 'NSFW custom emoji pack publisher'),
      120
    );

    const primaryId = opts.verdict === 'nsfw_hash' ? cleanEmojiHash! : targetHex!;
    const tags: string[][] = [
      ['d', `mojisurvivor:mod:${opts.verdict}:${primaryId}`],
      ['t', MODERATION_REPORT_TOPIC],
      ['L', 'mojisurvivor.moderation'],
      [
        'l',
        opts.verdict === 'safe_nomination'
          ? 'safe-pack'
          : opts.verdict === 'nsfw_hash'
            ? 'nsfw-hash'
            : 'nsfw-ban',
        'mojisurvivor.moderation',
      ],
      ['client', 'mojisurvivor'],
    ];

    if (targetHex && targetNpub) {
      tags.push(['p', targetHex]);
      tags.push(['npub', targetNpub]);
    }
    if (cleanEmojiHash) {
      tags.push(['x', cleanEmojiHash]);
    }
    if (cleanPackTitle) tags.push(['pack_title', cleanPackTitle]);
    if (cleanPackDTag) tags.push(['pack_d', cleanPackDTag]);

    const altTarget =
      opts.verdict === 'nsfw_hash'
        ? `sha256:${cleanEmojiHash!.slice(0, 16)}`
        : targetNpub!;
    tags.push([
      'alt',
      `MojiSurvivor anonymous ${
        opts.verdict === 'safe_nomination'
          ? 'safe list nomination'
          : opts.verdict === 'nsfw_hash'
            ? 'NSFW emoji hash report'
            : 'NSFW npub report'
      }: ${altTarget}`,
    ]);

    const contentPayload = {
      version: 2,
      verdict: opts.verdict,
      targetPubkey: targetHex,
      targetNpub,
      emojiHash: cleanEmojiHash,
      packTitle: cleanPackTitle,
      packDTag: cleanPackDTag,
      reason: cleanReason,
    };

    const signed = finalizeEvent(
      {
        kind: 30078,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: JSON.stringify(contentPayload),
      },
      ephemeralSk
    );

    return {
      ok: true,
      event: signed,
      targetHex,
      targetNpub,
      emojiHash: cleanEmojiHash,
    };
  }

  /**
   * Verifies and ingests a `kind: 30078` `#t: mojisurvivor-mod` event from relays
   * into the inspectable text-only Moderation Reports table (never preloading reported media).
   */
  public ingestModerationReportEvent(ev: NostrEvent): boolean {
    if (!ev || ev.kind !== 30078 || !verifyEvent(ev)) return false;

    const dTag = ev.tags.find((t) => t[0] === 'd')?.[1] ?? '';
    const match = MOD_REPORT_D_TAG_PATTERN.exec(dTag);
    if (!match) return false;

    const hasTopic = ev.tags.some(
      (t) => t[0] === 't' && t[1] === MODERATION_REPORT_TOPIC
    );
    if (!hasTopic) return false;

    const verdict = match[1].toLowerCase() as
      | 'nsfw_ban'
      | 'nsfw_hash'
      | 'safe_nomination';
    const dSubjectHex = match[2].toLowerCase();

    const pTag = normalizePubkeyOrNpub(ev.tags.find((t) => t[0] === 'p')?.[1]);
    const xTag = normalizeEmojiHash(ev.tags.find((t) => t[0] === 'x')?.[1]);

    if (verdict === 'nsfw_hash') {
      if (xTag && xTag !== dSubjectHex) return false;
    } else {
      if (pTag && pTag !== dSubjectHex) return false;
    }

    const targetPubkey = verdict === 'nsfw_hash' ? (pTag ?? undefined) : dSubjectHex;
    const targetNpub = targetPubkey ? pubkeyHexToNpub(targetPubkey) : undefined;
    const emojiHash = verdict === 'nsfw_hash' ? dSubjectHex : (xTag ?? undefined);

    const packTitle = sanitizeDisplayText(
      ev.tags.find((t) => t[0] === 'pack_title')?.[1],
      48
    );
    const packDTag = sanitizeDisplayText(ev.tags.find((t) => t[0] === 'pack_d')?.[1], 40);

    let reason: string | undefined;
    try {
      if (ev.content) {
        const parsed = JSON.parse(ev.content) as { reason?: string };
        reason = sanitizeDisplayText(parsed.reason, 120);
      }
    } catch {
      // Ignore optional content JSON
    }

    const key = `${verdict}:${dSubjectHex}`;
    const existing = this.moderationReports.get(key);
    const reporterPub = ev.pubkey.toLowerCase();

    if (!existing) {
      this.moderationReports.set(key, {
        key,
        targetPubkey,
        targetNpub,
        emojiHash,
        verdict,
        packTitle: packTitle || undefined,
        packDTag: packDTag || undefined,
        reason,
        reportCount: 1,
        latestCreatedAt: ev.created_at,
        latestEventId: ev.id,
        reporterPubkeys: [reporterPub],
      });
    } else {
      const reporters = existing.reporterPubkeys.includes(reporterPub)
        ? existing.reporterPubkeys
        : [...existing.reporterPubkeys, reporterPub];
      const isNewer = ev.created_at >= existing.latestCreatedAt;
      this.moderationReports.set(key, {
        ...existing,
        targetPubkey: (isNewer && targetPubkey) || existing.targetPubkey,
        targetNpub: (isNewer && targetNpub) || existing.targetNpub,
        emojiHash: (isNewer && emojiHash) || existing.emojiHash,
        packTitle: (isNewer && packTitle) || existing.packTitle,
        packDTag: (isNewer && packDTag) || existing.packDTag,
        reason: (isNewer && reason) || existing.reason,
        reportCount: reporters.length,
        latestCreatedAt: Math.max(existing.latestCreatedAt, ev.created_at),
        latestEventId: isNewer ? ev.id : existing.latestEventId,
        reporterPubkeys: reporters,
      });
    }
    return true;
  }

  public async publishAnonymousModerationReport(opts: {
    targetPubkeyOrNpub?: string;
    emojiHash?: string;
    verdict: 'nsfw_ban' | 'nsfw_hash' | 'safe_nomination';
    packTitle?: string;
    packDTag?: string;
    reason?: string;
  }): Promise<{
    ok: boolean;
    acceptedRelays: string[];
    event?: NostrEvent;
    targetHex?: string;
    targetNpub?: string;
    emojiHash?: string;
    error?: string;
  }> {
    const built = this.buildAnonymousModerationReportEvent(opts);
    if (!built.ok) {
      return { ok: false, acceptedRelays: [], error: built.error };
    }

    this.ingestModerationReportEvent(built.event);
    this.emit();

    if (this.disableNetwork || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      return {
        ok: true,
        acceptedRelays: [],
        event: built.event,
        targetHex: built.targetHex,
        targetNpub: built.targetNpub,
        emojiHash: built.emojiHash,
      };
    }

    const { accepted, rejected } = await this.broadcastSignedEventToRelays(built.event);
    this.emit();
    if (accepted.length > 0) {
      return {
        ok: true,
        acceptedRelays: accepted,
        event: built.event,
        targetHex: built.targetHex,
        targetNpub: built.targetNpub,
        emojiHash: built.emojiHash,
      };
    }

    const firstErr = Object.values(rejected)[0];
    return {
      ok: false,
      acceptedRelays: [],
      event: built.event,
      targetHex: built.targetHex,
      targetNpub: built.targetNpub,
      emojiHash: built.emojiHash,
      error: firstErr || 'Applied locally; relays did not confirm anonymous report yet.',
    };
  }

  public async syncModerationReports(): Promise<RelayModerationReport[]> {
    if (this.disableNetwork || this.syncingModerationReports) {
      return this.getSortedModerationReports();
    }
    this.syncingModerationReports = true;
    this.emit();

    try {
      const events = await this.pool.query(
        [{ kinds: [30078], '#t': [MODERATION_REPORT_TOPIC], limit: 200 }],
        { signal: AbortSignal.timeout(8500) }
      );
      for (const ev of events) {
        this.ingestModerationReportEvent(ev);
      }
    } catch {
      // Non-fatal relay report lookup timeout
    } finally {
      this.syncingModerationReports = false;
      this.emit();
    }

    return this.getSortedModerationReports();
  }

  public getSortedModerationReports(
    verdictFilter?: 'all' | 'nsfw_ban' | 'nsfw_hash' | 'safe_nomination'
  ): RelayModerationReport[] {
    return Array.from(this.moderationReports.values())
      .filter(
        (r) =>
          !verdictFilter || verdictFilter === 'all' || r.verdict === verdictFilter
      )
      .sort(
        (a, b) =>
          b.reportCount - a.reportCount || b.latestCreatedAt - a.latestCreatedAt
      );
  }

  public async syncGlobalLeaderboard(): Promise<void> {
    if (this.disableNetwork || this.syncingLeaderboard) return;
    this.syncingLeaderboard = true;
    this.emit();

    try {
      const events = await this.pool.query(
        [
          { kinds: [30078], '#t': ['mojisurvivor'], limit: 150 },
          { kinds: [30078], '#t': ['mojisurvivor-progress'], limit: 80 },
          { kinds: [5], '#k': ['30078'], limit: 100 },
        ],
        { signal: AbortSignal.timeout(9000) }
      );

      // NIP-09 pass: only honor kind:5 deletions authored by the exact same pubkey
      const relayDeletedByAuthor = new Map<string, Set<string>>();
      for (const ev of events) {
        if (ev.kind !== 5 || !verifyEvent(ev)) continue;
        let authorIdSet = relayDeletedByAuthor.get(ev.pubkey);
        if (!authorIdSet) {
          authorIdSet = new Set<string>();
          relayDeletedByAuthor.set(ev.pubkey, authorIdSet);
        }
        for (const tag of ev.tags) {
          if (tag[0] === 'e' && typeof tag[1] === 'string') {
            authorIdSet.add(tag[1]);
          } else if (
            tag[0] === 'a' &&
            typeof tag[1] === 'string' &&
            tag[1].startsWith(`30078:${ev.pubkey}:`)
          ) {
            this.deletedAddresses.add(tag[1]);
          }
        }
      }

      for (const [id, entry] of this.leaderboard.entries()) {
        const addr = `30078:${entry.pubkey}:${entry.dTag}`;
        if (
          this.deletedEventIds.has(id) ||
          this.deletedAddresses.has(addr) ||
          relayDeletedByAuthor.get(entry.pubkey)?.has(id)
        ) {
          this.leaderboard.delete(id);
        }
      }

      const authorSet = new Set<string>();
      const latestProgressByPubkey = new Map<string, { state: PersistedGameState; createdAt: number }>();

      for (const ev of events) {
        if (ev.kind !== 30078 || !verifyEvent(ev)) continue;
        const dTag = ev.tags.find((t) => t[0] === 'd')?.[1] ?? '';
        if (dTag === PROGRESS_SNAPSHOT_D_TAG) {
          const parsedSnap = this.parseVerifiedProgressSnapshot(ev);
          if (parsedSnap) {
            const pk = ev.pubkey.toLowerCase();
            const existingSnap = latestProgressByPubkey.get(pk);
            if (!existingSnap || parsedSnap.createdAt >= existingSnap.createdAt) {
              latestProgressByPubkey.set(pk, {
                state: parsedSnap.state,
                createdAt: parsedSnap.createdAt,
              });
              this.remoteProgressSnapshots.set(pk, parsedSnap.state);
              authorSet.add(pk);
            }
          }
          continue;
        }

        const parsed = this.parseVerifiedScoreEvent(ev, 'relay');
        if (!parsed) continue;
        const addr = `30078:${parsed.pubkey}:${parsed.dTag}`;
        if (
          this.deletedEventIds.has(parsed.eventId) ||
          this.deletedAddresses.has(addr) ||
          relayDeletedByAuthor.get(parsed.pubkey)?.has(parsed.eventId)
        ) {
          continue;
        }
        this.leaderboard.set(parsed.eventId, parsed);
        authorSet.add(parsed.pubkey);
      }

      for (const url of this.relays) {
        if (this.relayReachability.get(url) !== 'error') {
          this.relayReachability.set(url, 'ok');
        }
      }

      if (authorSet.size > 0) {
        await this.fetchProfiles(Array.from(authorSet));
      }
    } catch (err) {
      this.lastSyncError =
        err instanceof Error ? err.message : 'Leaderboard relay query failed.';
    } finally {
      this.syncingLeaderboard = false;
      this.emit();
    }
  }

  public async fetchProfiles(pubkeys: string[]): Promise<void> {
    if (this.disableNetwork) return;
    const missing = pubkeys.filter(
      (pk) => /^[0-9a-f]{64}$/i.test(pk) && !this.profiles.has(pk)
    );
    if (missing.length === 0) return;

    try {
      const events = await this.pool.query(
        [{ kinds: [0], authors: missing.slice(0, 50), limit: 50 }],
        { signal: AbortSignal.timeout(6500) }
      );
      for (const ev of events) {
        if (!verifyEvent(ev)) continue;
        try {
          const raw = JSON.parse(ev.content) as Record<string, unknown>;
          const meta: NostrProfileMeta = {
            pubkey: ev.pubkey,
            name: sanitizeDisplayText(String(raw.name ?? ''), 28),
            displayName: sanitizeDisplayText(String(raw.display_name ?? ''), 28),
            picture: sanitizeUrl(typeof raw.picture === 'string' ? raw.picture : undefined),
            nip05: sanitizeDisplayText(String(raw.nip05 ?? ''), 42),
          };
          const existing = this.profiles.get(ev.pubkey);
          if (!existing) {
            this.profiles.set(ev.pubkey, meta);
            if (meta.picture) this.preloadImage(meta.picture);
          }
        } catch {
          // Malformed kind 0 JSON
        }
      }
      this.emit();
    } catch {
      // Non-fatal profile lookup failure
    }
  }

  /**
   * Strictly validates a `kind: 30078` MojiSurvivor run receipt before admitting it
   * into the leaderboard. Rejects progress snapshots, non-matching `d`/`t` tags,
   * mismatched `p` tags, out-of-range metrics, or invalid BIP-340 signatures.
   */
  public parseVerifiedScoreEvent(
    ev: NostrEvent,
    source: 'relay' | 'local_confirmed'
  ): VerifiedLeaderboardEntry | null {
    if (!ev || ev.kind !== 30078 || !verifyEvent(ev)) return null;

    const dTag = ev.tags.find((t) => t[0] === 'd')?.[1] ?? '';
    if (!RUN_D_TAG_PATTERN.test(dTag)) return null;

    const hasTopicTag = ev.tags.some((t) => t[0] === 't' && t[1] === 'mojisurvivor');
    if (!hasTopicTag) return null;

    const pTag = ev.tags.find((t) => t[0] === 'p')?.[1];
    if (pTag && pTag.toLowerCase() !== ev.pubkey.toLowerCase()) {
      return null;
    }

    const score = Number(ev.tags.find((t) => t[0] === 'score')?.[1]);
    const wave = Number(ev.tags.find((t) => t[0] === 'wave')?.[1]);
    const defeated = Number(ev.tags.find((t) => t[0] === 'defeated')?.[1]);
    const bosses = Number(ev.tags.find((t) => t[0] === 'bosses')?.[1] ?? '0');
    const durationSec = Number(ev.tags.find((t) => t[0] === 'duration')?.[1]);

    if (
      !Number.isInteger(score) ||
      score <= 0 ||
      score > 100_000_000 ||
      !Number.isInteger(wave) ||
      wave < 1 ||
      wave > 10_000 ||
      !Number.isInteger(defeated) ||
      defeated < 0 ||
      defeated > 1_000_000 ||
      !Number.isInteger(bosses) ||
      bosses < 0 ||
      bosses > 10_000 ||
      !Number.isInteger(durationSec) ||
      durationSec < 1 ||
      durationSec > 86_400
    ) {
      return null;
    }

    const runHash =
      ev.tags.find((t) => t[0] === 'run_hash')?.[1] ??
      dTag.split(':').pop() ??
      ev.id.slice(0, 12);
    const weaponsRaw = ev.tags.find((t) => t[0] === 'weapons')?.[1] ?? 'lightning_zap:1';
    const weapons = sanitizeDisplayText(weaponsRaw, 120) || 'lightning_zap:1';

    let featuredEmoji: VerifiedLeaderboardEntry['featuredEmoji'];
    const featTag = ev.tags.find((t) => t[0] === 'featured_emoji');
    if (featTag && featTag.length >= 4) {
      const cleanUrl = sanitizeUrl(featTag[3]) || (isGenuineReserveSvgUrl(featTag[3]) ? featTag[3] : null);
      if (cleanUrl) {
        const rawTier = sanitizeDisplayText(featTag[4] || 'Common', 16);
        const validTier: import('./cryptoStats').EmojiTier =
          rawTier === 'Apex' || rawTier === 'Epic' || rawTier === 'Rare'
            ? rawTier
            : 'Common';
        featuredEmoji = {
          emojiKey: sanitizeDisplayText(featTag[1], 80) || 'nip30:unknown',
          shortcode: sanitizeShortcode(featTag[2]) || 'moji',
          url: cleanUrl,
          tier: validTier,
          powerRating: Math.max(1, Math.min(100, Number(featTag[5]) || 50)),
          packTitle: sanitizeDisplayText(featTag[6] || 'NIP-30 Pack', 36) || 'NIP-30 Pack',
        };
      }
    }

    const mapTag = ev.tags.find((t) => t[0] === 'map')?.[1];

    return {
      eventId: ev.id,
      dTag,
      pubkey: ev.pubkey.toLowerCase(),
      npub: encodeFullNpub(ev.pubkey),
      score,
      wave,
      defeated,
      bosses,
      durationSec,
      runHash,
      weapons,
      realmId: mapTag ? normalizeRealmId(mapTag) : undefined,
      createdAt: ev.created_at,
      sigPrefix: ev.sig.slice(0, 12),
      rawEvent: ev,
      source,
      featuredEmoji,
    };
  }

  /**
   * Builds the NIP.md compliant unsigned event template for a completed game run.
   */
  public buildUnsignedRunTemplate(
    receipt: RunReceiptRecord,
    pubkeyOverride?: string
  ): Omit<NostrEvent, 'id' | 'pubkey' | 'sig'> {
    const ownerPubkey = (pubkeyOverride || receipt.pubkey || this.pubkey).toLowerCase();
    const tags: string[][] = [
      ['d', receipt.dTag],
      ['t', 'mojisurvivor'],
      ['p', ownerPubkey],
      ['score', String(receipt.score)],
      ['wave', String(receipt.wave)],
      ['defeated', String(receipt.defeated)],
      ['bosses', String(receipt.bossesDefeated)],
      ['duration', String(receipt.durationSec)],
      ['run_hash', receipt.runHash],
      ['weapons', receipt.weaponsSummary],
    ];

    const existingHasMapTag = receipt.signedEvent?.tags.some((t) => t[0] === 'map');
    if (receipt.realmId && (!receipt.signedEvent || existingHasMapTag)) {
      tags.push(['map', receipt.realmId]);
    }

    // If a pre-signed event already exists on this receipt, match its exact tag layout
    const existingHasFeaturedTag = receipt.signedEvent?.tags.some(
      (t) => t[0] === 'featured_emoji'
    );
    if (
      receipt.featuredEmoji &&
      (!receipt.signedEvent || existingHasFeaturedTag)
    ) {
      tags.push([
        'featured_emoji',
        receipt.featuredEmoji.emojiKey,
        receipt.featuredEmoji.shortcode,
        receipt.featuredEmoji.url,
        receipt.featuredEmoji.tier,
        String(receipt.featuredEmoji.powerRating),
        receipt.featuredEmoji.packTitle || 'NIP-30 Pack',
      ]);
    }

    tags.push(['client', 'mojisurvivor']);
    tags.push([
      'alt',
      `MojiSurvivor run receipt: ${receipt.score.toLocaleString()} pts on Wave ${receipt.wave} (${receipt.defeated} emojis defeated)`,
    ]);

    return {
      kind: 30078,
      created_at: receipt.createdAt,
      tags,
      content: '',
    };
  }

  /**
   * Signs an unsigned template with the currently active non-NIP-55 signer.
   * NEVER falls back to signing with a guest key if the user selected NIP-55, NIP-07, or NIP-46.
   */
  private async signTemplateWithActiveSigner(
    template: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>
  ): Promise<{ ok: true; event: NostrEvent } | { ok: false; error: string }> {
    if (this.signerMode === 'nip55') {
      return {
        ok: false,
        error:
          'Amber (NIP-55) uses the nostrsigner: external intent flow. Tap "Sign in Amber" to authorize.',
      };
    }

    if ((this.signerMode === 'guest' || this.signerMode === 'nsec') && this.localSecretHex) {
      try {
        const sk = hexToBytes(this.localSecretHex);
        const expectedPub = getPublicKey(sk);
        const signed = finalizeEvent(template, sk);
        const check = verifySignedEventMatchesRequest(
          signed,
          { ...template, pubkey: expectedPub },
          expectedPub
        );
        if (!check.ok) {
          return { ok: false, error: check.error ?? 'Signature verification failed.' };
        }
        return { ok: true, event: signed };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Local Schnorr signing failed.',
        };
      }
    }

    if (!this.activeSigner) {
      return { ok: false, error: 'No active Nostr signer available for current mode.' };
    }

    try {
      const signed = await this.activeSigner.signEvent(template);
      const check = verifySignedEventMatchesRequest(
        signed,
        { ...template, pubkey: this.pubkey },
        this.pubkey
      );
      if (!check.ok) {
        return { ok: false, error: check.error ?? 'Signer returned mismatched event.' };
      }
      return { ok: true, event: signed };
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error ? err.message : 'Signature request rejected or timed out.',
      };
    }
  }

  public async signCustomEvent(
    template: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>
  ): Promise<{ ok: true; event: NostrEvent } | { ok: false; error: string }> {
    return this.signTemplateWithActiveSigner(template);
  }

  public async broadcastEventToRelays(
    signedEvent: NostrEvent,
    relayOverrides?: readonly string[]
  ): Promise<{
    accepted: string[];
    rejected: Record<string, string>;
  }> {
    const targetRelays =
      relayOverrides && relayOverrides.length > 0 ? Array.from(new Set(relayOverrides)) : this.relays;
    const accepted: string[] = [];
    const rejected: Record<string, string> = {};

    await Promise.allSettled(
      targetRelays.map(async (relayUrl) => {
        try {
          const relay = this.pool.relay(relayUrl);
          await relay.event(signedEvent, { signal: AbortSignal.timeout(7500) });
          accepted.push(relayUrl);
          this.relayReachability.set(relayUrl, 'ok');
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'Relay timeout or rejection';
          rejected[relayUrl] = reason;
          this.relayReachability.set(relayUrl, 'error');
        }
      })
    );

    return { accepted, rejected };
  }

  public async fetchUserBlossomServers(targetPubkey = this.pubkey): Promise<string[]> {
    if (!targetPubkey || !/^[0-9a-f]{64}$/i.test(targetPubkey)) return [];
    try {
      const events = await this.pool.query(
        [
          {
            kinds: [10063],
            authors: [targetPubkey.toLowerCase()],
            limit: 5,
          },
        ],
        { signal: AbortSignal.timeout(6500) }
      );
      let latest: NostrEvent | null = null;
      for (const ev of events) {
        if (!verifyEvent(ev)) continue;
        if (!latest || ev.created_at > latest.created_at) latest = ev;
      }
      if (!latest) return [];
      const urls = latest.tags
        .filter((t) => t[0] === 'server' && typeof t[1] === 'string')
        .map((t) => t[1]);
      return sanitizeBlossomServerList(urls);
    } catch {
      return [];
    }
  }

  private async broadcastSignedEventToRelays(signedEvent: NostrEvent): Promise<{
    accepted: string[];
    rejected: Record<string, string>;
  }> {
    const accepted: string[] = [];
    const rejected: Record<string, string> = {};

    await Promise.allSettled(
      this.relays.map(async (relayUrl) => {
        try {
          const relay = this.pool.relay(relayUrl);
          await relay.event(signedEvent, { signal: AbortSignal.timeout(7500) });
          accepted.push(relayUrl);
          this.relayReachability.set(relayUrl, 'ok');
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'Relay timeout or rejection';
          rejected[relayUrl] = reason;
          this.relayReachability.set(relayUrl, 'error');
        }
      })
    );

    // If autoManageRelays is active and some relays accepted while others failed/timed out,
    // prune the unresponsive relays so future broadcasts/queries don't stall on them
    if (this.autoManageRelays && accepted.length > 0 && Object.keys(rejected).length > 0) {
      this.relays = [...accepted];
      this.onAutoRelaysUpdated?.([...accepted]);
    }

    return { accepted, rejected };
  }

  /**
   * Signs a run receipt with the active signer (BIP-340 Schnorr) and broadcasts to each configured
   * relay individually to audit real NIP-01 `OK` acceptance vs rejection/timeout.
   */
  public async signAndBroadcastReceipt(
    receipt: RunReceiptRecord,
    onProgress?: (updated: RunReceiptRecord) => void
  ): Promise<RunReceiptRecord> {
    const ownerPubkey = receipt.signedEvent?.pubkey || this.pubkey;
    const working: RunReceiptRecord = {
      ...receipt,
      pubkey: ownerPubkey,
    };

    // Step 1: Sign if not already signed (or re-verify existing signature matches this exact run)
    if (working.signedEvent) {
      const expectedUnsigned = {
        ...this.buildUnsignedRunTemplate(working, working.signedEvent.pubkey),
        pubkey: working.signedEvent.pubkey,
      };
      const existingCheck = verifySignedEventMatchesRequest(
        working.signedEvent,
        expectedUnsigned,
        working.signedEvent.pubkey
      );
      if (!existingCheck.ok) {
        working.status = 'rejected';
        working.signedEvent = undefined;
        working.lastError = existingCheck.error;
        onProgress?.({ ...working });
        return working;
      }
    } else {
      working.status = 'signing';
      working.lastError = undefined;
      onProgress?.({ ...working });

      const template = this.buildUnsignedRunTemplate(working, this.pubkey);
      const signResult = await this.signTemplateWithActiveSigner(template);
      if (!signResult.ok) {
        working.status = 'failed';
        working.lastError = signResult.error;
        onProgress?.({ ...working });
        return working;
      }

      working.signedEvent = signResult.event;
      working.pubkey = signResult.event.pubkey;
      working.status = 'signed_local';
      onProgress?.({ ...working });
    }

    // Step 2: Check browser online state before relay broadcast
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      working.status = 'queued_offline';
      working.lastError = 'Device offline — signed receipt saved in publish queue.';
      onProgress?.({ ...working });
      return working;
    }

    // Step 3: Broadcast signed event to each write relay and audit real NIP-01 OK responses
    working.status = 'publishing';
    onProgress?.({ ...working });

    const signedEvent = working.signedEvent!;
    const { accepted, rejected } = await this.broadcastSignedEventToRelays(signedEvent);

    working.acceptedRelays = accepted;
    working.rejectedRelays = rejected;

    if (accepted.length > 0) {
      working.status = 'confirmed';
      working.lastError = undefined;
      const verifiedEntry = this.parseVerifiedScoreEvent(signedEvent, 'local_confirmed');
      if (verifiedEntry) {
        this.leaderboard.set(verifiedEntry.eventId, verifiedEntry);
      }
    } else {
      const wasExplicitlyRejected = classifyRelayRejection(rejected);
      working.status = wasExplicitlyRejected ? 'rejected' : 'failed';
      const firstReason = Object.values(rejected)[0];
      working.lastError = firstReason
        ? `${wasExplicitlyRejected ? 'Relay rejected receipt' : 'No relay confirmed receipt'} (${firstReason}). Signed receipt saved for retry.`
        : 'All relays timed out. Signed receipt remains saved locally for retry.';
    }

    this.emit();
    onProgress?.({ ...working });
    return working;
  }

  /**
   * Attaches a signed event returned from Android NIP-55 Amber (via callback URL or paste)
   * ONLY after verifying it matches the exact local run receipt's template, tags, pubkey, and hash.
   */
  public async attachNip55SignedEventAndBroadcast(
    receipt: RunReceiptRecord,
    rawResponse: string,
    requestId?: string,
    onProgress?: (updated: RunReceiptRecord) => void
  ): Promise<RunReceiptRecord> {
    // First check against active pending request if present; otherwise verify directly against receipt template
    const pending = this.getPendingNip55Request();
    let verifiedSignedEvent: NostrEvent | null = null;

    if (pending && pending.purpose === 'sign_run_receipt') {
      const resolved = this.resolvePendingNip55SignResponse({
        rawResponse,
        requestId,
        expectedTargetLocalId: receipt.localId,
      });
      if (!resolved.ok) {
        const failed: RunReceiptRecord = {
          ...receipt,
          status: 'rejected',
          lastError: resolved.error,
        };
        onProgress?.(failed);
        return failed;
      }
      verifiedSignedEvent = resolved.signedEvent;
    } else {
      // Direct paste verification bound strictly to this receipt + active NIP-55 pubkey
      const expectedUnsigned: Omit<NostrEvent, 'id' | 'sig'> = {
        ...this.buildUnsignedRunTemplate(receipt, this.pubkey),
        pubkey: this.pubkey,
      };
      const expectedHash = getEventHash(expectedUnsigned);
      const trimmed = rawResponse.trim();
      let candidate: NostrEvent;
      try {
        if (trimmed.startsWith('{')) {
          candidate = JSON.parse(trimmed) as NostrEvent;
        } else if (/^[0-9a-f]{128}$/i.test(trimmed)) {
          candidate = {
            ...expectedUnsigned,
            id: expectedHash,
            sig: trimmed.toLowerCase(),
          };
        } else {
          const failed: RunReceiptRecord = {
            ...receipt,
            status: 'rejected',
            lastError: 'Invalid Amber signed payload format.',
          };
          onProgress?.(failed);
          return failed;
        }
      } catch {
        const failed: RunReceiptRecord = {
          ...receipt,
          status: 'rejected',
          lastError: 'Malformed signed event JSON.',
        };
        onProgress?.(failed);
        return failed;
      }

      const check = verifySignedEventMatchesRequest(
        candidate,
        expectedUnsigned,
        this.pubkey,
        expectedHash
      );
      if (!check.ok) {
        const failed: RunReceiptRecord = {
          ...receipt,
          status: 'rejected',
          lastError: check.error,
        };
        onProgress?.(failed);
        return failed;
      }
      verifiedSignedEvent = candidate;
    }

    return this.signAndBroadcastReceipt(
      {
        ...receipt,
        pubkey: verifiedSignedEvent.pubkey,
        status: 'signed_local',
        signedEvent: verifiedSignedEvent,
      },
      onProgress
    );
  }

  /**
   * Builds the addressable `kind: 30078` (`d: mojisurvivor:progress:v1`) permanent progression snapshot.
   * Contains ONLY public game progression (level, Mojo ledger, upgrades, unlocked Codex metadata) —
   * never private keys, pairing secrets, or relay configuration.
   */
  public buildUnsignedProgressTemplate(
    state: PersistedGameState,
    createdAtSec = Math.floor(Date.now() / 1000)
  ): Omit<NostrEvent, 'id' | 'pubkey' | 'sig'> {
    const codexEntries = Object.values(state.codex)
      .sort((a, b) => b.kills - a.kills)
      .slice(0, 500);
    const codexMap: Record<string, CodexKillRecord> = {};
    for (const c of codexEntries) {
      codexMap[c.emojiKey] = c;
    }

    const ledgerEntries = Object.values(state.creditedRuns)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 150);
    const ledgerMap: PersistedGameState['creditedRuns'] = {};
    for (const l of ledgerEntries) {
      ledgerMap[l.runSessionId] = l;
    }

    const publicPayload = {
      schemaVersion: 3,
      revision: state.revision,
      updatedAt: state.updatedAt || Date.now(),
      mojoBalance: state.mojoBalance,
      lifetimeMojoEarned: state.lifetimeMojoEarned,
      lifetimeXpEarned: state.lifetimeXpEarned,
      xpSpentOnRebirths: state.xpSpentOnRebirths ?? 0,
      playerLevel: state.playerLevel,
      rebirthCount: state.rebirthCount ?? 0,
      mojoSpentOnRebirths: state.mojoSpentOnRebirths ?? 0,
      highScore: state.highScore,
      lifetimeScore: state.lifetimeScore ?? state.highScore,
      bestWave: state.bestWave,
      totalKills: state.totalKills,
      totalBossKills: state.totalBossKills ?? 0,
      totalRuns: state.totalRuns,
      unlockedRealms: state.unlockedRealms ?? ['obsidian_foundry'],
      selectedRealmId: state.selectedRealmId ?? 'obsidian_foundry',
      upgrades: state.upgrades,
      codex: codexMap,
      safePackAuthors: state.safePackAuthors.slice(0, 300),
      creditedRuns: ledgerMap,
    };

    const statsSnapshot = buildPlayerStatsForAwards({
      pubkey: this.pubkey.toLowerCase(),
      persisted: state,
      relayRuns: this.getVerifiedRunsForPubkey(this.pubkey),
      localReceipts: state.localReceipts,
    });
    const awards = evaluatePlayerAwards(statsSnapshot);
    const unlockedBadgeTags = awards
      .filter((a) => a.unlocked)
      .map((a) => ['badge', a.id]);

    return {
      kind: 30078,
      created_at: createdAtSec,
      tags: [
        ['d', PROGRESS_SNAPSHOT_D_TAG],
        ['t', 'mojisurvivor-progress'],
        ['p', this.pubkey.toLowerCase()],
        ['schema', '3'],
        ['level', String(state.playerLevel)],
        ['lifetime_xp', String(state.lifetimeXpEarned)],
        ['rebirth', String(state.rebirthCount ?? 0)],
        ['mojo', String(state.mojoBalance)],
        ['lifetime_mojo', String(state.lifetimeMojoEarned)],
        ['high_score', String(state.highScore)],
        ['lifetime_score', String(state.lifetimeScore ?? state.highScore)],
        ['best_wave', String(state.bestWave)],
        ['total_kills', String(state.totalKills)],
        ['total_bosses', String(state.totalBossKills ?? 0)],
        ['total_runs', String(state.totalRuns)],
        ['codex_count', String(Object.keys(codexMap).length)],
        ['fav_weapon', statsSnapshot.signatureWeapon],
        ...unlockedBadgeTags,
        ['client', 'mojisurvivor'],
        [
          'alt',
          `MojiSurvivor progression save: Cycle Lv.${state.playerLevel}${
            (state.rebirthCount ?? 0) > 0 ? ` (Rebirth ${state.rebirthCount})` : ''
          }, Best Score ${state.highScore.toLocaleString()}`,
        ],
      ],
      content: JSON.stringify(publicPayload),
    };
  }

  public parseVerifiedProgressSnapshot(
    ev: NostrEvent,
    expectedPubkey?: string
  ): { state: PersistedGameState; createdAt: number; eventId: string } | null {
    if (!ev || ev.kind !== 30078 || !verifyEvent(ev)) return null;
    if (expectedPubkey && ev.pubkey.toLowerCase() !== expectedPubkey.toLowerCase()) {
      return null;
    }

    const dTag = ev.tags.find((t) => t[0] === 'd')?.[1];
    if (dTag !== PROGRESS_SNAPSHOT_D_TAG) return null;

    const hasProgressTag = ev.tags.some(
      (t) => t[0] === 't' && (t[1] === 'mojisurvivor-progress' || t[1] === 'mojisurvivor')
    );
    if (!hasProgressTag) return null;

    const pTag = ev.tags.find((t) => t[0] === 'p')?.[1];
    if (pTag && pTag.toLowerCase() !== ev.pubkey.toLowerCase()) return null;

    try {
      const parsedJson = JSON.parse(ev.content) as Record<string, unknown>;
      const migrated = normalizeAndMigrateState({
        ...parsedJson,
        ownerPubkey: ev.pubkey.toLowerCase(),
      });
      if (!migrated) return null;
      return {
        state: migrated,
        createdAt: ev.created_at,
        eventId: ev.id,
      };
    } catch {
      return null;
    }
  }

  public async signAndPublishProgressSnapshot(
    state: PersistedGameState,
    existingSignedEvent?: NostrEvent
  ): Promise<{
    status: 'confirmed' | 'queued_offline' | 'rejected' | 'failed';
    signedEvent?: NostrEvent;
    acceptedRelays: string[];
    rejectedRelays: Record<string, string>;
    error?: string;
  }> {
    let signed = existingSignedEvent;
    if (!signed) {
      const template = this.buildUnsignedProgressTemplate(state);
      const signRes = await this.signTemplateWithActiveSigner(template);
      if (!signRes.ok) {
        return {
          status: 'failed',
          acceptedRelays: [],
          rejectedRelays: {},
          error: signRes.error,
        };
      }
      signed = signRes.event;
    } else if (!verifyEvent(signed) || signed.pubkey.toLowerCase() !== this.pubkey.toLowerCase()) {
      return {
        status: 'rejected',
        acceptedRelays: [],
        rejectedRelays: {},
        error: 'Pending progression snapshot signature does not match active identity.',
      };
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return {
        status: 'queued_offline',
        signedEvent: signed,
        acceptedRelays: [],
        rejectedRelays: {},
        error: 'Offline — signed progression snapshot queued for relay sync.',
      };
    }

    const { accepted, rejected } = await this.broadcastSignedEventToRelays(signed);
    if (accepted.length > 0) {
      return {
        status: 'confirmed',
        signedEvent: signed,
        acceptedRelays: accepted,
        rejectedRelays: rejected,
      };
    }

    const isRejected = classifyRelayRejection(rejected);
    const firstErr = Object.values(rejected)[0];
    return {
      status: isRejected ? 'rejected' : 'failed',
      signedEvent: signed,
      acceptedRelays: [],
      rejectedRelays: rejected,
      error: firstErr || 'No relay confirmed progression snapshot yet.',
    };
  }

  public async fetchLatestProgressSnapshot(
    targetPubkey = this.pubkey
  ): Promise<{
    found: boolean;
    snapshot?: { state: PersistedGameState; createdAt: number; eventId: string };
    error?: string;
  }> {
    if (!targetPubkey || !/^[0-9a-f]{64}$/i.test(targetPubkey)) {
      return { found: false, error: 'Invalid public key for progression lookup.' };
    }

    try {
      const events = await this.pool.query(
        [
          {
            kinds: [30078],
            authors: [targetPubkey.toLowerCase()],
            '#d': [PROGRESS_SNAPSHOT_D_TAG],
            limit: 10,
          },
        ],
        { signal: AbortSignal.timeout(8500) }
      );

      let latest: { state: PersistedGameState; createdAt: number; eventId: string } | undefined;
      for (const ev of events) {
        const parsed = this.parseVerifiedProgressSnapshot(ev, targetPubkey);
        if (!parsed) continue;
        if (!latest || parsed.createdAt > latest.createdAt) {
          latest = parsed;
        }
      }

      if (!latest) {
        return { found: false };
      }
      return { found: true, snapshot: latest };
    } catch (err) {
      return {
        found: false,
        error: err instanceof Error ? err.message : 'Failed to query progression snapshot.',
      };
    }
  }

  /**
   * Builds and publishes an explicitly user-authorized `kind: 1` note sharing a run summary.
   * Never invoked automatically.
   */
  public buildUnsignedScoreNoteTemplate(
    noteText: string,
    receipt: RunReceiptRecord
  ): Omit<NostrEvent, 'id' | 'pubkey' | 'sig'> {
    const tags: string[][] = [
      ['t', 'mojisurvivor'],
      ['client', 'mojisurvivor'],
    ];
    if (receipt.status === 'confirmed' && receipt.signedEvent) {
      tags.push(['e', receipt.signedEvent.id]);
      tags.push(['a', `30078:${receipt.signedEvent.pubkey}:${receipt.dTag}`]);
    }
    return {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: noteText.trim(),
    };
  }

  public async signAndPublishScoreNote(
    noteText: string,
    receipt: RunReceiptRecord,
    preSignedEvent?: NostrEvent
  ): Promise<{ ok: boolean; acceptedRelays: string[]; eventId?: string; error?: string }> {
    let signed = preSignedEvent;
    if (!signed) {
      const template = this.buildUnsignedScoreNoteTemplate(noteText, receipt);
      const signRes = await this.signTemplateWithActiveSigner(template);
      if (!signRes.ok) {
        return { ok: false, acceptedRelays: [], error: signRes.error };
      }
      signed = signRes.event;
    }

    const { accepted, rejected } = await this.broadcastSignedEventToRelays(signed);
    if (accepted.length > 0) {
      return { ok: true, acceptedRelays: accepted, eventId: signed.id };
    }
    const firstReason = Object.values(rejected)[0];
    return {
      ok: false,
      acceptedRelays: [],
      error: firstReason || 'No relay accepted note broadcast.',
    };
  }

  /**
   * Signs and broadcasts a genuine NIP-09 (`kind: 5`) Event Deletion request for a player's own
   * run receipt, and removes matching entries from local leaderboard state.
   */
  public async deleteRunReceipt(opts: {
    eventId?: string;
    dTag?: string;
    pubkey: string;
    broadcastNip09?: boolean;
    preSignedNip09?: NostrEvent;
  }): Promise<{ ok: boolean; acceptedRelays: string[]; error?: string }> {
    const addr = opts.dTag ? `30078:${opts.pubkey}:${opts.dTag}` : undefined;
    if (opts.eventId) this.deletedEventIds.add(opts.eventId);
    if (addr) this.deletedAddresses.add(addr);
    this.persistDeletedTombstones();

    for (const [id, entry] of this.leaderboard.entries()) {
      const entryAddr = `30078:${entry.pubkey}:${entry.dTag}`;
      if ((opts.eventId && id === opts.eventId) || (addr && entryAddr === addr)) {
        this.leaderboard.delete(id);
      }
    }
    this.emit();

    if (!opts.broadcastNip09 || opts.pubkey !== this.pubkey || (!opts.eventId && !opts.dTag)) {
      return { ok: true, acceptedRelays: [] };
    }

    let signedDeletion = opts.preSignedNip09 ?? null;
    if (!signedDeletion) {
      if (this.signerMode === 'nip55') {
        return { ok: true, acceptedRelays: [] };
      }
      const tags: string[][] = [];
      if (opts.eventId) tags.push(['e', opts.eventId]);
      if (addr) tags.push(['a', addr]);
      tags.push(['k', '30078']);

      const deletionTemplate: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'> = {
        kind: 5,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: 'Deleted MojiSurvivor run receipt',
      };

      const signRes = await this.signTemplateWithActiveSigner(deletionTemplate);
      if (!signRes.ok) {
        return { ok: false, acceptedRelays: [], error: signRes.error };
      }
      signedDeletion = signRes.event;
    }

    const { accepted } = await this.broadcastSignedEventToRelays(signedDeletion);
    this.emit();
    return { ok: true, acceptedRelays: accepted };
  }

  /**
   * Returns emojis whose sprite images have loaded cleanly for 60 FPS canvas combat.
   */
  public getPlayableEmojiPool(): EmojiCombatTrait[] {
    const ready: EmojiCombatTrait[] = [];
    for (const trait of this.emojis.values()) {
      const status = this.imageStatus.get(trait.url);
      if (status === 'ready' || isGenuineReserveSvgUrl(trait.url)) {
        ready.push(trait);
      }
    }
    if (ready.length === 0) {
      return Array.from(this.emojis.values()).filter((e) => e.source === 'reserve');
    }
    return ready;
  }

  /**
   * Returns verified leaderboard entries deduplicated by `pubkey` so each player is ranked
   * once by their personal-best verified score.
   */
  public getSortedLeaderboard(): VerifiedLeaderboardEntry[] {
    const bestByPubkey = new Map<string, VerifiedLeaderboardEntry>();
    const countsByPubkey = new Map<string, number>();

    for (const entry of this.leaderboard.values()) {
      const addr = `30078:${entry.pubkey}:${entry.dTag}`;
      if (this.deletedEventIds.has(entry.eventId) || this.deletedAddresses.has(addr)) {
        continue;
      }
      countsByPubkey.set(entry.pubkey, (countsByPubkey.get(entry.pubkey) ?? 0) + 1);
      const currentBest = bestByPubkey.get(entry.pubkey);
      if (
        !currentBest ||
        entry.score > currentBest.score ||
        (entry.score === currentBest.score && entry.wave > currentBest.wave) ||
        (entry.score === currentBest.score &&
          entry.wave === currentBest.wave &&
          entry.createdAt > currentBest.createdAt)
      ) {
        bestByPubkey.set(entry.pubkey, entry);
      }
    }

    return Array.from(bestByPubkey.values())
      .map((entry) => ({
        ...entry,
        playerRunCount: countsByPubkey.get(entry.pubkey) ?? 1,
      }))
      .sort((a, b) => b.score - a.score || b.wave - a.wave || b.createdAt - a.createdAt);
  }

  public getVerifiedRunsForPubkey(pubkey: string): VerifiedLeaderboardEntry[] {
    if (!pubkey) return [];
    const target = pubkey.toLowerCase();
    return Array.from(this.leaderboard.values())
      .filter((entry) => {
        const addr = `30078:${entry.pubkey}:${entry.dTag}`;
        return (
          entry.pubkey === target &&
          !this.deletedEventIds.has(entry.eventId) &&
          !this.deletedAddresses.has(addr)
        );
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Groups all verified Kind 30078 run receipts by pubkey and merges any published
   * `mojisurvivor:progress:v1` snapshot so the Leaderboard can rank players by either
   * All-Time Career Totals (cumulative score, total kills, total bosses, total runs)
   * OR Best Single Run for each metric, while exposing each player's full Run History.
   */
  public getPlayerLeaderboardAggregates(
    localState?: PersistedGameState
  ): PlayerLeaderboardAggregate[] {
    const runsByPubkey = new Map<string, VerifiedLeaderboardEntry[]>();

    for (const entry of this.leaderboard.values()) {
      const addr = `30078:${entry.pubkey}:${entry.dTag}`;
      if (this.deletedEventIds.has(entry.eventId) || this.deletedAddresses.has(addr)) {
        continue;
      }
      const list = runsByPubkey.get(entry.pubkey) ?? [];
      list.push(entry);
      runsByPubkey.set(entry.pubkey, list);
    }

    const aggregates: PlayerLeaderboardAggregate[] = [];

    for (const [pubkey, rawRuns] of runsByPubkey.entries()) {
      // Deduplicate by dTag in case multiple relays returned the same addressable run
      const byDTag = new Map<string, VerifiedLeaderboardEntry>();
      for (const r of rawRuns) {
        const key = r.dTag || r.eventId;
        const prev = byDTag.get(key);
        if (!prev || r.score > prev.score || r.createdAt > prev.createdAt) {
          byDTag.set(key, r);
        }
      }
      const runs = Array.from(byDTag.values()).sort(
        (a, b) => b.createdAt - a.createdAt || b.score - a.score
      );
      if (runs.length === 0) continue;

      let bestScoreRun = runs[0];
      let bestWaveRun = runs[0];
      let mostDefeatedRun = runs[0];
      let mostBossesRun = runs[0];

      let sumScore = 0;
      let sumDefeated = 0;
      let sumBosses = 0;
      let latestRunAt = 0;

      for (const r of runs) {
        sumScore += r.score;
        sumDefeated += r.defeated;
        sumBosses += r.bosses;
        if (r.createdAt > latestRunAt) latestRunAt = r.createdAt;

        if (r.score > bestScoreRun.score || (r.score === bestScoreRun.score && r.wave > bestScoreRun.wave)) {
          bestScoreRun = r;
        }
        if (r.wave > bestWaveRun.wave || (r.wave === bestWaveRun.wave && r.score > bestWaveRun.score)) {
          bestWaveRun = r;
        }
        if (r.defeated > mostDefeatedRun.defeated || (r.defeated === mostDefeatedRun.defeated && r.score > mostDefeatedRun.score)) {
          mostDefeatedRun = r;
        }
        if (r.bosses > mostBossesRun.bosses || (r.bosses === mostBossesRun.bosses && r.score > mostBossesRun.score)) {
          mostBossesRun = r;
        }
      }

      const snap =
        localState && pubkey === this.pubkey.toLowerCase()
          ? localState
          : this.remoteProgressSnapshots.get(pubkey);

      const careerTotalScore = Math.max(snap?.lifetimeScore ?? 0, sumScore);
      const careerTotalDefeated = Math.max(snap?.totalKills ?? 0, sumDefeated);
      const careerTotalBosses = Math.max(snap?.totalBossKills ?? 0, sumBosses);
      const careerRunCount = Math.max(snap?.totalRuns ?? 0, runs.length);

      aggregates.push({
        pubkey,
        npub: encodeFullNpub(pubkey),
        runs,
        bestScoreRun: { ...bestScoreRun, playerRunCount: runs.length },
        bestWaveRun: { ...bestWaveRun, playerRunCount: runs.length },
        mostDefeatedRun: { ...mostDefeatedRun, playerRunCount: runs.length },
        mostBossesRun: { ...mostBossesRun, playerRunCount: runs.length },
        careerTotalScore,
        careerTotalDefeated,
        careerTotalBosses,
        careerRunCount,
        bestScore: Math.max(snap?.highScore ?? 0, bestScoreRun.score),
        bestWave: Math.max(snap?.bestWave ?? 1, bestWaveRun.wave),
        bestSingleDefeated: mostDefeatedRun.defeated,
        bestSingleBosses: mostBossesRun.bosses,
        latestRunAt,
        progressSnapshot: snap,
      });
    }

    return aggregates.sort(
      (a, b) => b.bestScore - a.bestScore || b.careerTotalScore - a.careerTotalScore
    );
  }

  /**
   * Aggregates NIP-30 and Reserve emojis across live relay packs, local Codex records,
   * remote players' public `mojisurvivor:progress:v1` Codex snapshots, and run `featured_emoji` tags
   * to build the Moji Leaderboard with Rarity Graphics and silly superlatives.
   */
  public getMojiLeaderboard(
    localCodex?: Record<string, CodexKillRecord>
  ): AggregatedMojiLeaderboardEntry[] {
    const map = new Map<
      string,
      {
        emojiKey: string;
        shortcode: string;
        url: string;
        source: 'nip30' | 'reserve';
        tier: string;
        behavior: string;
        powerRating: number;
        packTitle: string;
        packAuthor?: string;
        hash?: string;
        totalKills: number;
        timesFeatured: number;
        slainByPlayers: Set<string>;
      }
    >();

    const upsertTrait = (trait: EmojiCombatTrait) => {
      if (!this.isEmojiAllowed(trait)) return;
      if (this.imageStatus.get(trait.url) === 'broken') return;
      const existing = map.get(trait.emojiKey);
      if (!existing) {
        map.set(trait.emojiKey, {
          emojiKey: trait.emojiKey,
          shortcode: trait.shortcode,
          url: trait.url,
          source: trait.source,
          tier: trait.tier,
          behavior: trait.behaviorName,
          powerRating: trait.powerRating,
          packTitle: trait.packTitle || 'NIP-30 Pack',
          packAuthor: trait.packAuthor,
          hash: trait.hash,
          totalKills: 0,
          timesFeatured: 0,
          slainByPlayers: new Set<string>(),
        });
      }
    };

    for (const trait of this.emojis.values()) {
      upsertTrait(trait);
    }

    const ingestCodexMap = (
      codex: Record<string, CodexKillRecord> | undefined,
      ownerKey: string
    ) => {
      if (!codex) return;
      for (const rec of Object.values(codex)) {
        if (!rec || !rec.url || rec.kills <= 0) continue;
        const trait = codexRecordToTrait(rec);
        if (!this.isEmojiAllowed(trait)) continue;
        upsertTrait(trait);
        const item = map.get(trait.emojiKey);
        if (item) {
          item.totalKills += rec.kills;
          item.slainByPlayers.add(ownerKey);
        }
      }
    };

    ingestCodexMap(localCodex, this.pubkey || 'local');

    for (const [pk, snap] of this.remoteProgressSnapshots.entries()) {
      if (localCodex && pk.toLowerCase() === this.pubkey.toLowerCase()) continue;
      ingestCodexMap(snap.codex, pk.toLowerCase());
    }

    for (const run of this.leaderboard.values()) {
      if (run.featuredEmoji) {
        const feat = run.featuredEmoji;
        const existing = map.get(feat.emojiKey);
        if (existing) {
          existing.timesFeatured += 1;
          existing.slainByPlayers.add(run.pubkey);
          if (existing.totalKills === 0) {
            existing.totalKills += Math.max(1, Math.round(run.defeated / 12));
          }
        }
      }
    }

    const rawList = Array.from(map.values()).sort(
      (a, b) =>
        b.totalKills - a.totalKills ||
        b.timesFeatured - a.timesFeatured ||
        b.powerRating - a.powerRating
    );

    return rawList.map((item, idx) => {
      const rarity = determineMojiRarity({
        tier: item.tier,
        powerRating: item.powerRating,
        totalKills: item.totalKills,
        timesFeatured: item.timesFeatured,
      });
      const superlative = getMojiSillySuperlative(idx, {
        totalKills: item.totalKills,
        timesFeatured: item.timesFeatured,
        powerRating: item.powerRating,
        tier: item.tier,
        behavior: item.behavior,
      });
      return {
        emojiKey: item.emojiKey,
        shortcode: item.shortcode,
        url: item.url,
        source: item.source,
        tier: item.tier,
        behavior: item.behavior,
        powerRating: item.powerRating,
        packTitle: item.packTitle,
        packAuthor: item.packAuthor,
        hash: item.hash,
        totalKills: item.totalKills,
        timesFeatured: item.timesFeatured,
        slainByPlayersCount: item.slainByPlayers.size,
        rarity,
        superlative,
      };
    });
  }
}
