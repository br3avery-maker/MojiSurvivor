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
  RESERVE_EMOJI_DEFS,
  sha256Hex,
  type EmojiCombatTrait,
} from './cryptoStats';
import {
  sanitizeDisplayText,
  sanitizeRelayUrl,
  sanitizeShortcode,
  sanitizeUrl,
} from './sanitizeUrl';
import type { RunReceiptRecord } from './storage';

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
}

export type ImageLoadStatus = 'loading' | 'ready' | 'broken';

interface StoredAuthSession {
  mode: SignerMode;
  pubkey: string;
  secretKeyHex?: string;
  bunkerUri?: string;
  clientSecretHex?: string;
}

const AUTH_STORAGE_KEY = 'mojisurvivor_v2_auth';
const PROFILE_DISCOVERY_RELAYS = ['wss://purplepag.es'];

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
  private guestSecretHex = '';

  public emojis = new Map<string, EmojiCombatTrait>();
  public imageCache = new Map<string, HTMLImageElement>();
  public imageStatus = new Map<string, ImageLoadStatus>();
  public profiles = new Map<string, NostrProfileMeta>();
  public leaderboard = new Map<string, VerifiedLeaderboardEntry>();

  public syncingEmojis = false;
  public syncingLeaderboard = false;
  public relayReachability = new Map<string, 'idle' | 'ok' | 'error'>();
  public lastSyncError: string | null = null;

  private listeners = new Set<() => void>();

  constructor(initialRelays: string[]) {
    this.relays = initialRelays
      .map((r) => sanitizeRelayUrl(r))
      .filter((r): r is string => Boolean(r));
    if (this.relays.length === 0) {
      this.relays = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];
    }

    this.pool = this.buildPool();
    this.seedReserveEmojis();
    this.restoreOrInitIdentity();
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
      eoseTimeout: 600,
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
      this.emojis.set(def.shortcode, stats);
      this.preloadImage(def.url);
    }
  }

  public preloadImage(url: string): HTMLImageElement | undefined {
    const existing = this.imageCache.get(url);
    if (existing) return existing;

    // Reserve SVG data URIs and sanitized HTTPS URLs only
    if (!url.startsWith('data:image/svg+xml;') && !sanitizeUrl(url)) {
      this.imageStatus.set(url, 'broken');
      return undefined;
    }

    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    this.imageStatus.set(url, 'loading');

    img.onload = () => {
      if (img.naturalWidth > 0) {
        this.imageStatus.set(url, 'ready');
      } else {
        this.imageStatus.set(url, 'broken');
      }
      this.emit();
    };

    img.onerror = () => {
      this.imageStatus.set(url, 'broken');
      this.emit();
    };

    img.src = url;
    this.imageCache.set(url, img);
    return img;
  }

  /**
   * Restores saved signer session or generates a genuine BIP-340 secp256k1 guest keypair.
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
          this.guestSecretHex = parsed.secretKeyHex;
          this.pubkey = getPublicKey(sk);
          this.activeSigner = new NSecSigner(sk);
          this.signerMode = parsed.mode;
          return;
        }
        if (parsed.mode === 'nip07' && /^[0-9a-f]{64}$/i.test(parsed.pubkey)) {
          this.pubkey = parsed.pubkey;
          this.signerMode = 'nip07';
          this.activeSigner = new NBrowserSigner({ timeout: 3500 });
          return;
        }
        if (
          parsed.mode === 'nip46' &&
          parsed.bunkerUri &&
          parsed.clientSecretHex &&
          /^[0-9a-f]{64}$/i.test(parsed.pubkey)
        ) {
          this.pubkey = parsed.pubkey;
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
          this.pubkey = parsed.pubkey;
          this.signerMode = 'nip55';
          this.activeSigner = null; // External intent / native bridge invoked per sign
          return;
        }
      }
    } catch {
      // Fall through to fresh secp256k1 guest key
    }
    this.generateFreshGuestKey();
  }

  public generateFreshGuestKey(): void {
    const sk = generateSecretKey();
    const skHex = bytesToHex(sk);
    const pub = getPublicKey(sk);
    this.guestSecretHex = skHex;
    this.pubkey = pub;
    this.signerMode = 'guest';
    this.activeSigner = new NSecSigner(sk);
    this.persistAuth({
      mode: 'guest',
      pubkey: pub,
      secretKeyHex: skHex,
    });
    this.emit();
    void this.fetchProfiles([pub]);
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
      this.guestSecretHex = skHex;
      this.pubkey = pub;
      this.signerMode = 'nsec';
      this.activeSigner = new NSecSigner(skBytes);
      this.persistAuth({
        mode: 'nsec',
        pubkey: pub,
        secretKeyHex: skHex,
      });
      this.emit();
      void this.fetchProfiles([pub]);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not decode nsec key.',
      };
    }
  }

  public exportCurrentNsec(): string | null {
    if ((this.signerMode === 'guest' || this.signerMode === 'nsec') && this.guestSecretHex) {
      try {
        return nip19.nsecEncode(hexToBytes(this.guestSecretHex));
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
          'No NIP-07 extension (Alby, nos2x, Soapbox Signer) detected in this browser window. In sandboxed previews or mobile browsers, use NIP-46 Bunker instead.',
      };
    }
    try {
      const browserSigner = new NBrowserSigner({ timeout: 5000 });
      const pub = await browserSigner.getPublicKey();
      if (!/^[0-9a-f]{64}$/i.test(pub)) {
        return { ok: false, error: 'Extension returned an invalid hex public key.' };
      }
      this.pubkey = pub.toLowerCase();
      this.signerMode = 'nip07';
      this.activeSigner = browserSigner;
      this.persistAuth({ mode: 'nip07', pubkey: this.pubkey });
      this.emit();
      void this.fetchProfiles([this.pubkey]);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Extension connection rejected.',
      };
    }
  }

  /**
   * 2. NIP-46 Remote Signer (`bunker://` or NIP-05 via `parseBunkerInput` + `NConnectSigner`)
   */
  public async connectNip46Bunker(input: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const pointer = await parseBunkerInput(input.trim());
      if (!pointer || !pointer.pubkey) {
        return {
          ok: false,
          error: 'Invalid bunker:// URI or NIP-05 identifier. Paste a valid bunker://pubkey?relay=wss://... link.',
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

      this.pubkey = userPubkey.toLowerCase();
      this.signerMode = 'nip46';
      this.activeSigner = connectSigner;
      this.persistAuth({
        mode: 'nip46',
        pubkey: this.pubkey,
        bunkerUri: canonicalBunker,
        clientSecretHex: clientSkHex,
      });
      this.emit();
      void this.fetchProfiles([this.pubkey]);
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
   * Generates a client-initiated `nostrconnect://` pairing session (QR + URI) for mobile NIP-46 signers (Amber, Primal, nsec.app).
   */
  public createNostrConnectSession(abortSignal: AbortSignal): {
    uri: string;
    waitForApproval: () => Promise<{ ok: boolean; error?: string }>;
  } {
    const clientSk = generateSecretKey();
    const clientSkHex = bytesToHex(clientSk);
    const clientPubkey = getPublicKey(clientSk);
    const secret = sha256Hex(`${clientPubkey}:${Date.now()}`).slice(0, 16);

    const uri = createNostrConnectURI({
      clientPubkey,
      relays: this.relays,
      secret,
      name: 'MojiSurvivor',
      perms: ['sign_event:30078'],
    });

    const waitForApproval = async (): Promise<{ ok: boolean; error?: string }> => {
      const clientSigner = new NSecSigner(clientSk);
      const subFilter: NostrFilter = {
        kinds: [24133],
        '#p': [clientPubkey],
        since: Math.floor(Date.now() / 1000) - 10,
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

          const payload = JSON.parse(decrypted) as {
            result?: string;
            error?: string;
          };
          if (payload.error) {
            return { ok: false, error: payload.error };
          }
          if (payload.result === 'ack' || payload.result === secret) {
            const remoteSignerPubkey = ev.pubkey;
            const connectSigner = new NConnectSigner({
              relay: this.pool.group(this.relays),
              pubkey: remoteSignerPubkey,
              signer: clientSigner,
              timeout: 22_000,
            });
            const actualUserPubkey = await connectSigner.getPublicKey();
            const canonicalBunker = BunkerURI.fromJSON({
              pubkey: remoteSignerPubkey,
              relays: this.relays,
            }).toString();

            this.pubkey = actualUserPubkey.toLowerCase();
            this.signerMode = 'nip46';
            this.activeSigner = connectSigner;
            this.persistAuth({
              mode: 'nip46',
              pubkey: this.pubkey,
              bunkerUri: canonicalBunker,
              clientSecretHex: clientSkHex,
            });
            this.emit();
            void this.fetchProfiles([this.pubkey]);
            return { ok: true };
          }
        }
        return { ok: false, error: 'Pairing cancelled.' };
      } catch (err) {
        if (abortSignal.aborted) {
          return { ok: false, error: 'Pairing cancelled.' };
        }
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'NIP-46 pairing failed.',
        };
      }
    };

    return { uri, waitForApproval };
  }

  /**
   * 3. NIP-55 Android External Signer (`nostrsigner:` URI or `window.AndroidNostrBridge`)
   */
  public connectNip55WithPubkey(npubOrHex: string): { ok: boolean; error?: string } {
    try {
      const trimmed = npubOrHex.trim();
      let hex = '';
      if (trimmed.startsWith('npub1')) {
        const decoded = nip19.decode(trimmed);
        if (decoded.type !== 'npub') {
          return { ok: false, error: 'Expected an npub1… public key.' };
        }
        hex = decoded.data;
      } else if (/^[0-9a-f]{64}$/i.test(trimmed)) {
        hex = trimmed.toLowerCase();
      } else {
        return { ok: false, error: 'Enter the npub1… or 64-char hex pubkey from Amber.' };
      }

      this.pubkey = hex;
      this.signerMode = 'nip55';
      this.activeSigner = null;
      this.persistAuth({ mode: 'nip55', pubkey: hex });
      this.emit();
      void this.fetchProfiles([hex]);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Invalid Amber public key.',
      };
    }
  }

  public buildNip55GetPublicKeyUri(): string {
    const callbackUrl = encodeURIComponent(`${window.location.origin}${window.location.pathname}?nip55_pubkey=`);
    return `nostrsigner:?compressionType=none&returnType=signature&type=get_public_key&callbackUrl=${callbackUrl}`;
  }

  public buildNip55SignEventUri(unsignedEvent: Omit<NostrEvent, 'id' | 'sig'>): string {
    const encodedJson = encodeURIComponent(JSON.stringify(unsignedEvent));
    const callbackUrl = encodeURIComponent(`${window.location.origin}${window.location.pathname}?nip55_signed=`);
    return `nostrsigner:${encodedJson}?compressionType=none&returnType=event&type=sign_event&callbackUrl=${callbackUrl}`;
  }

  public disconnectToGuest(): void {
    this.generateFreshGuestKey();
  }

  private persistAuth(session: StoredAuthSession): void {
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Ignore storage error
    }
  }

  /**
   * Synchronizes both NIP-30 custom emoji packs and verified global leaderboard runs from relays.
   */
  public async syncAll(): Promise<void> {
    await Promise.allSettled([
      this.syncNip30Emojis(),
      this.syncGlobalLeaderboard(),
      this.pubkey ? this.fetchProfiles([this.pubkey]) : Promise.resolve(),
    ]);
  }

  public async syncNip30Emojis(): Promise<void> {
    if (this.syncingEmojis) return;
    this.syncingEmojis = true;
    this.emit();

    try {
      const events = await this.pool.query(
        [{ kinds: [30030, 10030], limit: 45 }],
        { signal: AbortSignal.timeout(8500) }
      );

      for (const ev of events) {
        if (!verifyEvent(ev)) continue;
        const dTag = ev.tags.find((t) => t[0] === 'd')?.[1];
        const titleTag = ev.tags.find((t) => t[0] === 'title')?.[1];
        const packTitle = sanitizeDisplayText(titleTag || dTag || 'NIP-30 Pack', 32);

        for (const tag of ev.tags) {
          if (tag[0] !== 'emoji') continue;
          const shortcode = sanitizeShortcode(tag[1]);
          const cleanUrl = sanitizeUrl(tag[2]);
          if (!shortcode || !cleanUrl) continue;

          if (!this.emojis.has(shortcode)) {
            const traits = deriveEmojiStats(shortcode, cleanUrl, 'nip30', {
              packTitle,
              packAuthor: ev.pubkey,
              eventId: ev.id,
            });
            this.emojis.set(shortcode, traits);
            this.preloadImage(cleanUrl);
          }
        }
      }
      this.lastSyncError = null;
    } catch (err) {
      this.lastSyncError =
        err instanceof Error ? err.message : 'Relay NIP-30 discovery timed out.';
    } finally {
      this.syncingEmojis = false;
      this.emit();
    }
  }

  public async syncGlobalLeaderboard(): Promise<void> {
    if (this.syncingLeaderboard) return;
    this.syncingLeaderboard = true;
    this.emit();

    try {
      const events = await this.pool.query(
        [{ kinds: [30078], '#t': ['mojisurvivor'], limit: 100 }],
        { signal: AbortSignal.timeout(9000) }
      );

      const authorSet = new Set<string>();
      for (const ev of events) {
        if (!verifyEvent(ev)) continue;
        const parsed = this.parseVerifiedScoreEvent(ev, 'relay');
        if (parsed) {
          this.leaderboard.set(parsed.eventId, parsed);
          authorSet.add(parsed.pubkey);
        }
      }

      for (const url of this.relays) {
        this.relayReachability.set(url, 'ok');
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

  public parseVerifiedScoreEvent(
    ev: NostrEvent,
    source: 'relay' | 'local_confirmed'
  ): VerifiedLeaderboardEntry | null {
    if (!verifyEvent(ev)) return null;
    const score = parseInt(ev.tags.find((t) => t[0] === 'score')?.[1] ?? '0', 10);
    const wave = parseInt(ev.tags.find((t) => t[0] === 'wave')?.[1] ?? '1', 10);
    const defeated = parseInt(ev.tags.find((t) => t[0] === 'defeated')?.[1] ?? '0', 10);
    const bosses = parseInt(ev.tags.find((t) => t[0] === 'bosses')?.[1] ?? '0', 10);
    const durationSec = parseInt(ev.tags.find((t) => t[0] === 'duration')?.[1] ?? '0', 10);
    const dTag = ev.tags.find((t) => t[0] === 'd')?.[1] ?? '';
    const runHash =
      ev.tags.find((t) => t[0] === 'run_hash')?.[1] ??
      dTag.split(':').pop() ??
      ev.id.slice(0, 12);
    const weapons = ev.tags.find((t) => t[0] === 'weapons')?.[1] ?? 'lightning_zap:1';

    if (!Number.isFinite(score) || score <= 0) return null;

    return {
      eventId: ev.id,
      pubkey: ev.pubkey,
      npub: encodeFullNpub(ev.pubkey),
      score,
      wave: Number.isFinite(wave) ? wave : 1,
      defeated: Number.isFinite(defeated) ? defeated : 0,
      bosses: Number.isFinite(bosses) ? bosses : 0,
      durationSec: Number.isFinite(durationSec) ? durationSec : 0,
      runHash,
      weapons,
      createdAt: ev.created_at,
      sigPrefix: ev.sig.slice(0, 12),
      rawEvent: ev,
      source,
    };
  }

  /**
   * Builds the NIP.md compliant unsigned event template for a completed game run.
   */
  public buildUnsignedRunTemplate(receipt: RunReceiptRecord): Omit<NostrEvent, 'id' | 'pubkey' | 'sig'> {
    return {
      kind: 30078,
      created_at: receipt.createdAt,
      tags: [
        ['d', receipt.dTag],
        ['t', 'mojisurvivor'],
        ['p', this.pubkey],
        ['score', String(receipt.score)],
        ['wave', String(receipt.wave)],
        ['defeated', String(receipt.defeated)],
        ['bosses', String(receipt.bossesDefeated)],
        ['duration', String(receipt.durationSec)],
        ['run_hash', receipt.runHash],
        ['weapons', receipt.weaponsSummary],
        ['client', 'mojisurvivor'],
        [
          'alt',
          `MojiSurvivor run receipt: ${receipt.score.toLocaleString()} pts on Wave ${receipt.wave} (${receipt.defeated} emojis defeated)`,
        ],
      ],
      content: '',
    };
  }

  /**
   * Signs a run receipt with the active signer (BIP-340 Schnorr) and broadcasts to each configured
   * relay individually to audit real NIP-01 `OK` acceptance vs failure.
   */
  public async signAndBroadcastReceipt(
    receipt: RunReceiptRecord,
    onProgress?: (updated: RunReceiptRecord) => void
  ): Promise<RunReceiptRecord> {
    const working: RunReceiptRecord = {
      ...receipt,
      pubkey: this.pubkey,
    };

    // Step 1: Sign if not already signed
    if (!working.signedEvent) {
      if (this.signerMode === 'nip55') {
        const androidBridge = (
          window as unknown as {
            AndroidNostrBridge?: {
              requestSignEvent?: (cbId: string, json: string) => void;
            };
          }
        ).AndroidNostrBridge;

        if (!androidBridge?.requestSignEvent) {
          working.status = 'failed';
          working.lastError =
            'NIP-55 requires opening Amber via intent URI on Android or pasting the signed JSON receipt.';
          onProgress?.({ ...working });
          return working;
        }
      }

      if (!this.activeSigner) {
        if (this.guestSecretHex) {
          const sk = hexToBytes(this.guestSecretHex);
          const signed = finalizeEvent(this.buildUnsignedRunTemplate(working), sk);
          working.signedEvent = signed;
        } else {
          working.status = 'failed';
          working.lastError = 'No active Nostr signer available.';
          onProgress?.({ ...working });
          return working;
        }
      } else {
        working.status = 'signing';
        working.lastError = undefined;
        onProgress?.({ ...working });

        try {
          const signed = await this.activeSigner.signEvent(
            this.buildUnsignedRunTemplate(working)
          );
          if (!verifyEvent(signed)) {
            working.status = 'failed';
            working.lastError = 'Signer returned an invalid BIP-340 Schnorr signature.';
            onProgress?.({ ...working });
            return working;
          }
          working.signedEvent = signed;
          working.pubkey = signed.pubkey;
        } catch (err) {
          working.status = 'failed';
          working.lastError =
            err instanceof Error ? err.message : 'Signature request rejected or timed out.';
          onProgress?.({ ...working });
          return working;
        }
      }
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
    const accepted: string[] = [];
    const rejected: Record<string, string> = {};

    await Promise.allSettled(
      this.relays.map(async (relayUrl) => {
        try {
          const relay = this.pool.relay(relayUrl);
          await relay.event(signedEvent, { signal: AbortSignal.timeout(9000) });
          accepted.push(relayUrl);
          this.relayReachability.set(relayUrl, 'ok');
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'Relay timeout or rejection';
          rejected[relayUrl] = reason;
          this.relayReachability.set(relayUrl, 'error');
        }
      })
    );

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
      working.status = 'failed';
      const firstReason = Object.values(rejected)[0];
      working.lastError = firstReason
        ? `No relay confirmed receipt (${firstReason}).`
        : 'All relays timed out. Receipt remains signed locally for retry.';
    }

    this.emit();
    onProgress?.({ ...working });
    return working;
  }

  /**
   * Accepts a signed event JSON returned from Android NIP-55 Amber callback or paste,
   * verifies its BIP-340 Schnorr signature, and broadcasts it to relays.
   */
  public async attachNip55SignedEventAndBroadcast(
    receipt: RunReceiptRecord,
    signedJson: string,
    onProgress?: (updated: RunReceiptRecord) => void
  ): Promise<RunReceiptRecord> {
    try {
      const parsed = JSON.parse(signedJson) as NostrEvent;
      if (!verifyEvent(parsed)) {
        const failed: RunReceiptRecord = {
          ...receipt,
          status: 'failed',
          lastError: 'Invalid BIP-340 signature on returned NIP-55 event.',
        };
        onProgress?.(failed);
        return failed;
      }
      return this.signAndBroadcastReceipt(
        {
          ...receipt,
          pubkey: parsed.pubkey,
          signedEvent: parsed,
        },
        onProgress
      );
    } catch (err) {
      const failed: RunReceiptRecord = {
        ...receipt,
        status: 'failed',
        lastError: err instanceof Error ? err.message : 'Malformed signed event JSON.',
      };
      onProgress?.(failed);
      return failed;
    }
  }

  /**
   * Returns emojis whose sprite images have loaded cleanly for 60 FPS canvas combat.
   */
  public getPlayableEmojiPool(): EmojiCombatTrait[] {
    const ready: EmojiCombatTrait[] = [];
    for (const trait of this.emojis.values()) {
      const status = this.imageStatus.get(trait.url);
      if (status === 'ready' || trait.url.startsWith('data:image/svg+xml;')) {
        ready.push(trait);
      }
    }
    if (ready.length === 0) {
      return Array.from(this.emojis.values()).filter((e) => e.source === 'reserve');
    }
    return ready;
  }

  public getSortedLeaderboard(): VerifiedLeaderboardEntry[] {
    return Array.from(this.leaderboard.values()).sort((a, b) => b.score - a.score);
  }
}
