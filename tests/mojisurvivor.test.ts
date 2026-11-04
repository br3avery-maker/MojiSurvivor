import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { finalizeEvent, generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import {
  buildStableEmojiKey,
  deriveEmojiStats,
  extractEmojiHash,
  RESERVE_EMOJI_DEFS,
} from '../src/lib/cryptoStats';
import {
  normalizeEmojiHash,
  normalizePubkeyOrNpub,
  pubkeyHexToNpub,
} from '../src/lib/moderationLists';
import {
  MODERATION_REPORT_TOPIC,
  MojiNostrCoordinator,
  PROGRESS_SNAPSHOT_D_TAG,
  validateNip46PairingResponse,
  verifySignedEventMatchesRequest,
} from '../src/lib/nostrEngine';
import { buildScoreSummaryText } from '../src/lib/scoreCardRenderer';
import {
  applyRunCheckpointToState,
  computeTotalMojoSpentOnUpgrades,
  createDefaultState,
  getUpgradeCost,
  loadActiveRunCheckpoint,
  loadPersistedStateWithDiagnostics,
  normalizeAndMigrateState,
  reconcileProgressionStates,
  saveActiveRunCheckpoint,
  savePersistedState,
  traitToCodexRecord,
  UPGRADE_SPECS,
  type PersistedGameState,
  type RunReceiptRecord,
} from '../src/lib/storage';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  public failWrites = false;

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) {
      throw new Error('QuotaExceededError');
    }
    this.map.set(key, String(value));
  }
}

const mockLocalStorage = new MemoryStorage();
const mockSessionStorage = new MemoryStorage();
let mockOnline = true;
let mockBridgeSavedJson: string | null = null;
let mockBridgeEnabled = false;

// Set up deterministic browser-like globals for headless Node execution (never connects to relays unless sync called)
Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  configurable: true,
});
Object.defineProperty(globalThis, 'sessionStorage', {
  value: mockSessionStorage,
  configurable: true,
});
Object.defineProperty(globalThis, 'navigator', {
  value: {
    get onLine() {
      return mockOnline;
    },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Web2App)',
  },
  configurable: true,
});
Object.defineProperty(globalThis, 'window', {
  value: {
    location: {
      origin: 'https://mojisurvivor.app',
      pathname: '/',
      search: '',
    },
    localStorage: mockLocalStorage,
    sessionStorage: mockSessionStorage,
    get AndroidNostrBridge() {
      if (!mockBridgeEnabled) return undefined;
      return {
        getSavedGameState: () => mockBridgeSavedJson ?? '',
        saveGameState: (json: string) => {
          if (mockLocalStorage.failWrites && mockBridgeSavedJson === '__FAIL__') {
            throw new Error('BridgeWriteFailed');
          }
          mockBridgeSavedJson = json;
        },
      };
    },
  },
  configurable: true,
});

beforeEach(() => {
  mockLocalStorage.clear();
  mockLocalStorage.failWrites = false;
  mockSessionStorage.clear();
  mockOnline = true;
  mockBridgeSavedJson = null;
  mockBridgeEnabled = false;
});

describe('MojiSurvivor — Progression Persistence, Nostr Sync & Signer Security', () => {
  it('1. Migrates legacy v2 saves cleanly to SHA-256 hash keys and purges fake 2-letter SVG placeholders without losing kills, Mojo, or Player Level', () => {
    const legacyV2 = {
      mojoBalance: 140,
      highScore: 58955,
      bestWave: 10,
      totalKills: 552,
      totalRuns: 4,
      upgrades: { attack: 2, defense: 1, speed: 0, regen: 1, magnet: 0 },
      codex: {
        nostrich_runner: {
          shortcode: 'nostrich_runner',
          kills: 17,
          firstDefeatedAt: 1700000000000,
          powerRating: 95,
        },
        url_less_placeholder: {
          shortcode: 'angy',
          kills: 5,
          firstDefeatedAt: 1700000050000,
          powerRating: 131,
        },
        fake_monogram_svg: {
          shortcode: 'cheermon',
          url: `data:image/svg+xml;utf8,${encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#180614"/><text>CH</text></svg>'
          )}`,
          source: 'nip30',
          kills: 9,
          firstDefeatedAt: 1700000060000,
          powerRating: 120,
        },
        valid_nip30: {
          shortcode: 'rocket',
          url: 'https://cdn.example.com/emotes/rocket.png',
          source: 'nip30',
          kills: 11,
          firstDefeatedAt: 1700000070000,
          powerRating: 131,
        },
      },
      localReceipts: [],
      relays: ['wss://relay.damus.io'],
      settings: {
        sfx: true,
        haptics: true,
        crtScanlines: false,
        screenShake: true,
        flashingEffects: true,
        denseParticles: true,
      },
    };

    mockLocalStorage.setItem('mojisurvivor_v2_state', JSON.stringify(legacyV2));

    const { state, error } = loadPersistedStateWithDiagnostics();
    assert.equal(error, null);
    assert.equal(state.schemaVersion, 3);
    assert.equal(state.highScore, 58955);
    assert.equal(state.bestWave, 10);
    assert.equal(state.totalKills, 552, 'Total historical kills preserved even when fake SVG entries are purged');
    assert.equal(state.mojoBalance, 140);
    assert.equal(state.upgrades.attack, 2);
    assert.equal(state.upgrades.defense, 1);
    assert.equal(state.upgrades.regen, 1);

    const expectedSpent = computeTotalMojoSpentOnUpgrades(state.upgrades);
    assert.equal(state.lifetimeMojoEarned, 140 + expectedSpent);
    assert.ok(state.playerLevel >= 2, 'Persistent career player level derived from historical progress');

    const nostrichReserve = RESERVE_EMOJI_DEFS.find((r) => r.shortcode === 'nostrich_runner')!;
    const expectedReserveKey = buildStableEmojiKey(nostrichReserve.url, 'reserve');
    assert.equal(state.codex[expectedReserveKey]?.kills, 17);

    const expectedRocketKey = buildStableEmojiKey(
      'https://cdn.example.com/emotes/rocket.png',
      'nip30'
    );
    assert.equal(state.codex[expectedRocketKey]?.kills, 11);

    assert.equal(
      Object.values(state.codex).some(
        (c) => c.shortcode === 'angy' || c.shortcode === 'cheermon'
      ),
      false,
      'URL-less and fake two-letter monogram SVG entries must be purged completely'
    );
  });

  it('2. Checkpoints mid-run Mojo & Career XP idempotently (zero loss on exit, zero duplication on completion/retry)', () => {
    let state = createDefaultState();

    // Mid-run checkpoint on Wave 3 (e.g., player backgrounds app or switches to Amber)
    state = applyRunCheckpointToState(state, {
      runSessionId: 'run_abc_1',
      mojoEarnedTotal: 45,
      careerXpEarnedTotal: 160,
      killsTotal: 38,
      waveReached: 3,
      scoreReached: 4200,
      completed: false,
    });

    assert.equal(state.mojoBalance, 45);
    assert.equal(state.playerLevel, 2); // 160 XP crosses 100 XP threshold -> Lv.2 with 60 XP
    assert.equal(state.playerXp, 60);
    assert.equal(state.totalRuns, 0); // Still mid-run

    // Duplicate checkpoint flush (e.g. both visibilitychange and pagehide firing)
    const duplicateFlush = applyRunCheckpointToState(state, {
      runSessionId: 'run_abc_1',
      mojoEarnedTotal: 45,
      careerXpEarnedTotal: 160,
      killsTotal: 38,
      waveReached: 3,
      scoreReached: 4200,
      completed: false,
    });
    assert.equal(duplicateFlush.mojoBalance, 45, 'Duplicate flush must never duplicate Mojo');

    // Run resumes and finishes on Wave 6 with 80 total Mojo
    const finished = applyRunCheckpointToState(duplicateFlush, {
      runSessionId: 'run_abc_1',
      mojoEarnedTotal: 80,
      careerXpEarnedTotal: 310,
      killsTotal: 90,
      waveReached: 6,
      scoreReached: 12500,
      completed: true,
    });

    assert.equal(finished.mojoBalance, 80, 'Only the +35 delta above 45 is banked');
    assert.equal(finished.lifetimeMojoEarned, 80);
    assert.equal(finished.totalKills, 90);
    assert.equal(finished.totalRuns, 1);

    // Re-running completion for same runSessionId does not add another run or Mojo
    const replayed = applyRunCheckpointToState(finished, {
      runSessionId: 'run_abc_1',
      mojoEarnedTotal: 80,
      careerXpEarnedTotal: 310,
      killsTotal: 90,
      waveReached: 6,
      scoreReached: 12500,
      completed: true,
    });
    assert.equal(replayed.mojoBalance, 80);
    assert.equal(replayed.totalRuns, 1);
  });

  it('3. Reconciles Android Web2App native bridge storage with browser localStorage without overwriting newer progress', () => {
    mockBridgeEnabled = true;

    // Stale browser storage (only 20 Mojo, Lv.1)
    let staleBrowser = createDefaultState();
    staleBrowser = applyRunCheckpointToState(staleBrowser, {
      runSessionId: 'run_1',
      mojoEarnedTotal: 20,
      careerXpEarnedTotal: 40,
      killsTotal: 10,
      waveReached: 2,
      scoreReached: 1500,
      completed: true,
    });
    mockLocalStorage.setItem('mojisurvivor_v3_state', JSON.stringify(staleBrowser));

    // Newer native Web2App bridge state (bought Attack Lv.1 and earned Run 2)
    let newerBridge = applyRunCheckpointToState(staleBrowser, {
      runSessionId: 'run_2',
      mojoEarnedTotal: 60,
      careerXpEarnedTotal: 200,
      killsTotal: 55,
      waveReached: 5,
      scoreReached: 9800,
      completed: true,
    });
    const atkCost = getUpgradeCost(UPGRADE_SPECS[0], 0); // 25 Mojo
    newerBridge = {
      ...newerBridge,
      revision: newerBridge.revision + 1,
      updatedAt: Date.now() + 5000,
      mojoBalance: newerBridge.mojoBalance - atkCost,
      upgrades: { ...newerBridge.upgrades, attack: 1 },
    };
    mockBridgeSavedJson = JSON.stringify(newerBridge);

    const loaded = loadPersistedStateWithDiagnostics();
    assert.equal(loaded.state.highScore, 9800);
    assert.equal(loaded.state.upgrades.attack, 1);
    assert.equal(loaded.state.mojoBalance, 80 - atkCost);

    // Explicit storage failure reporting when all backing stores fail
    mockLocalStorage.failWrites = true;
    mockBridgeSavedJson = '__FAIL__';
    const failedSave = savePersistedState(loaded.state);
    assert.equal(failedSave.ok, false);
    assert.ok(failedSave.error && failedSave.error.length > 0);
  });

  it('4. Keys & deduplicates NIP-30 emojis purely by canonical 64-hex SHA-256 hash and restores offline Codex unlocks', () => {
    const pubA = 'a'.repeat(64);
    const pubB = 'b'.repeat(64);
    const blossomDigest = '0123456789abcdef'.repeat(4);

    assert.equal(
      extractEmojiHash(`https://blossom.primal.net/${blossomDigest}.webp`),
      blossomDigest,
      'Extracts embedded 64-hex Blossom SHA-256 digest directly from URL path'
    );

    const rocketA = deriveEmojiStats(
      'rocket',
      'https://cdn.example.com/a/rocket.png',
      'nip30',
      { packAuthor: pubA, packDTag: 'space-pack', packTitle: 'Space Pack A' }
    );
    const rocketB = deriveEmojiStats(
      'rocket',
      'https://cdn.example.com/b/rocket.png',
      'nip30',
      { packAuthor: pubB, packDTag: 'retro-pack', packTitle: 'Retro Pack B' }
    );
    const duplicateMediaDifferentCode = deriveEmojiStats(
      'totally_different_shortcode',
      'https://cdn.example.com/a/rocket.png',
      'nip30',
      { packAuthor: pubB, packDTag: 'repost-list', packTitle: 'Reposted List' }
    );

    assert.notEqual(
      rocketA.emojiKey,
      rocketB.emojiKey,
      'Different media hashes never collide even if shortcodes match'
    );
    assert.equal(
      rocketA.emojiKey,
      duplicateMediaDifferentCode.emojiKey,
      'Identical media hash shares exact canonical nip30:<64hex> key and combat stats regardless of shortcode'
    );
    assert.equal(rocketA.powerRating, duplicateMediaDifferentCode.powerRating);
    assert.equal(
      buildStableEmojiKey('https://cdn.example.com/a/rocket.png', 'nip30'),
      rocketA.emojiKey
    );

    let state = createDefaultState();
    state.settings.codexViewMode = 'gallery';
    state.codex[rocketA.emojiKey] = traitToCodexRecord(rocketA, 5, 1700000100000);
    state.codex[rocketB.emojiKey] = traitToCodexRecord(rocketB, 2, 1700000200000);

    savePersistedState(state);

    // Cold offline restart: instantiate coordinator with persisted codex, ZERO relay calls
    const reloaded = loadPersistedStateWithDiagnostics().state;
    assert.equal(reloaded.settings.codexViewMode, 'gallery');

    const offlineCoordinator = new MojiNostrCoordinator(reloaded.relays, reloaded.codex, {
      disableNetwork: true,
    });
    assert.ok(
      offlineCoordinator.emojis.has(rocketA.emojiKey),
      'Unlocked NIP-30 emoji A restored immediately offline by SHA-256 key'
    );
    assert.ok(
      offlineCoordinator.emojis.has(rocketB.emojiKey),
      'Unlocked NIP-30 emoji B restored immediately offline by SHA-256 key'
    );
    assert.equal(offlineCoordinator.emojis.get(rocketA.emojiKey)?.packTitle, 'Space Pack A');

    // Verify kind:10030 ["a", "30030:<pubkey>:<d-tag>"] set reference extraction & cross-pack deduplication
    const setAuthorSk = generateSecretKey();
    const setAuthorPub = getPublicKey(setAuthorSk);
    const userSk = generateSecretKey();
    const list10030 = finalizeEvent(
      {
        kind: 10030,
        created_at: 1790000100,
        tags: [
          ['a', `30030:${setAuthorPub}:cyber-emotes`, 'wss://relay.damus.io'],
          ['emoji', 'reposted_laser', 'https://cdn.example.com/cyber/laser_pepe.png'],
        ],
        content: '',
      },
      userSk
    );
    const refs = MojiNostrCoordinator.extractNip30SetReferences([list10030]);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].author, setAuthorPub.toLowerCase());
    assert.equal(refs[0].dTag, 'cyber-emotes');

    const pack30030 = finalizeEvent(
      {
        kind: 30030,
        created_at: 1790000200,
        tags: [
          ['d', 'cyber-emotes'],
          ['title', 'Cyber Emotes'],
          ['emoji', 'laser_pepe', 'https://cdn.example.com/cyber/laser_pepe.png'],
        ],
        content: '',
      },
      setAuthorSk
    );
    offlineCoordinator.ingestNip30PackEvent(list10030);
    offlineCoordinator.ingestNip30PackEvent(pack30030);

    const laserHash = extractEmojiHash('https://cdn.example.com/cyber/laser_pepe.png');
    const matchingEntries = Array.from(offlineCoordinator.emojis.values()).filter(
      (e) => e.hash === laserHash
    );
    assert.equal(
      matchingEntries.length,
      1,
      'Same custom emoji media across kind:10030 and kind:30030 deduplicates into 1 hash entry'
    );
    assert.equal(matchingEntries[0].packTitle, 'Cyber Emotes');
  });

  it('5. Signs Nostr mojisurvivor:progress:v1 snapshots, queues offline, and reconciles cross-device saves without duplicating Mojo', async () => {
    const sk = generateSecretKey();
    const nsec = nip19.nsecEncode(sk);
    const pubHex = getPublicKey(sk);

    // Device A: Sign in, complete Run A (100 Mojo), buy Attack Lv.1 (25 Mojo) -> 75 Mojo left
    const coordA = new MojiNostrCoordinator(['wss://relay.damus.io'], undefined, {
      disableNetwork: true,
    });
    assert.equal(coordA.importNsecKey(nsec).ok, true);
    assert.equal(coordA.pubkey, pubHex);

    let stateA = createDefaultState();
    stateA.progressSync.enabled = true;
    stateA = applyRunCheckpointToState(stateA, {
      runSessionId: 'device_a_run_1',
      mojoEarnedTotal: 100,
      careerXpEarnedTotal: 250,
      killsTotal: 120,
      waveReached: 7,
      scoreReached: 18400,
      completed: true,
    });
    const atkCost = getUpgradeCost(UPGRADE_SPECS[0], 0); // 25
    stateA = {
      ...stateA,
      mojoBalance: stateA.mojoBalance - atkCost,
      upgrades: { ...stateA.upgrades, attack: 1 },
    };

    // Offline publish test -> must queue signed snapshot without losing signature
    mockOnline = false;
    const offlineSync = await coordA.signAndPublishProgressSnapshot(stateA);
    assert.equal(offlineSync.status, 'queued_offline');
    assert.ok(offlineSync.signedEvent, 'Signed event preserved in offline queue');
    assert.equal(
      offlineSync.signedEvent.tags.find((t) => t[0] === 'd')?.[1],
      PROGRESS_SNAPSHOT_D_TAG
    );
    assert.ok(
      !offlineSync.signedEvent.content.includes(nsec),
      'Snapshot must never leak nsec secret key'
    );

    // Parse verified snapshot on Device B, where player also played offline Run B (50 Mojo) & bought Magnet Lv.1 (20 Mojo)
    let stateB = createDefaultState();
    stateB = applyRunCheckpointToState(stateB, {
      runSessionId: 'device_b_run_1',
      mojoEarnedTotal: 50,
      careerXpEarnedTotal: 110,
      killsTotal: 45,
      waveReached: 4,
      scoreReached: 6200,
      completed: true,
    });
    const magCost = getUpgradeCost(UPGRADE_SPECS[4], 0); // 20
    stateB = {
      ...stateB,
      mojoBalance: stateB.mojoBalance - magCost,
      upgrades: { ...stateB.upgrades, magnet: 1 },
    };

    const parsedRemote = coordA.parseVerifiedProgressSnapshot(
      offlineSync.signedEvent!,
      pubHex
    );
    assert.ok(parsedRemote, 'Valid Schnorr-signed progress snapshot must verify cleanly');

    const merged = reconcileProgressionStates(stateB, parsedRemote!.state);
    assert.equal(merged.upgrades.attack, 1, 'Preserves Device A upgrade');
    assert.equal(merged.upgrades.magnet, 1, 'Preserves Device B upgrade');
    assert.equal(merged.lifetimeMojoEarned, 150, '100 + 50 Mojo across distinct runSessionIds');
    assert.equal(
      merged.mojoBalance,
      150 - atkCost - magCost,
      'Exact spendable Mojo = 150 - 25 - 20 = 105 (zero duplication, zero lost upgrades)'
    );
    assert.equal(merged.highScore, 18400);

    // Re-merging identical snapshot is strictly idempotent
    const mergedAgain = reconcileProgressionStates(merged, parsedRemote!.state);
    assert.equal(mergedAgain.mojoBalance, merged.mojoBalance);
    assert.equal(mergedAgain.lifetimeMojoEarned, 150);
  });

  it('6. Enforces strict NIP-55 Amber request binding & rejects guest fallback, wrong pubkey, or mismatched event payloads', async () => {
    const amberSk = generateSecretKey();
    const amberPub = getPublicKey(amberSk);
    const attackerSk = generateSecretKey();

    const coord = new MojiNostrCoordinator(['wss://relay.damus.io'], undefined, {
      disableNetwork: true,
    });

    // Preparing get_public_key URI must NOT mark user signed in
    const pkReq = coord.prepareNip55PublicKeyRequest();
    assert.ok(pkReq.uri.startsWith('nostrsigner:'));
    assert.equal(coord.isSignedIn(), false, 'Opening URI alone must never mark Amber connected');

    // Wrong requestId on callback must be rejected
    const wrongReqConnect = coord.connectNip55WithPubkey(amberPub, 'wrong_req_id');
    assert.equal(wrongReqConnect.ok, false);
    assert.equal(coord.isSignedIn(), false);

    // Valid pubkey + matching requestId binds NIP-55 mode and clears guest secret key
    const validConnect = coord.connectNip55WithPubkey(amberPub, pkReq.requestId);
    assert.equal(validConnect.ok, true);
    assert.equal(coord.signerMode, 'nip55');
    assert.equal(coord.pubkey, amberPub);
    assert.equal(coord.exportCurrentNsec(), null, 'No guest secret key retained in NIP-55 mode');

    const receipt: RunReceiptRecord = {
      localId: '1790000000-deadbeefcafe',
      runSessionId: 'run_nip55_1',
      runHash: 'deadbeefcafe',
      dTag: 'mojisurvivor:run:1790000000:deadbeefcafe',
      pubkey: amberPub,
      score: 24500,
      wave: 8,
      defeated: 210,
      bossesDefeated: 1,
      durationSec: 245,
      mojoEarned: 64,
      weaponsSummary: 'lightning_zap:3',
      createdAt: 1790000000,
      status: 'unsigned_local',
      acceptedRelays: [],
      rejectedRelays: {},
    };

    // Direct signAndBroadcastReceipt must refuse guest fallback when in NIP-55 mode
    const directAttempt = await coord.signAndBroadcastReceipt(receipt);
    assert.equal(directAttempt.status, 'failed');
    assert.equal(directAttempt.signedEvent, undefined);

    // Prepare request-bound NIP-55 sign_event URI
    const template = coord.buildUnsignedRunTemplate(receipt);
    const signPrep = coord.prepareNip55SignEventRequest({
      purpose: 'sign_run_receipt',
      unsignedTemplate: template,
      targetLocalId: receipt.localId,
    });
    assert.ok('uri' in signPrep);

    // 6a. Reject event signed by wrong pubkey (attackerSk)
    const wrongPubSigned = finalizeEvent(template, attackerSk);
    const wrongPubRes = coord.resolvePendingNip55SignResponse({
      rawResponse: JSON.stringify(wrongPubSigned),
      requestId: signPrep.requestId,
      expectedTargetLocalId: receipt.localId,
    });
    assert.equal(wrongPubRes.ok, false);

    // 6b. Reject event signed by right pubkey but with tampered score tag / wrong dTag
    const tamperedTemplate = {
      ...template,
      tags: template.tags.map((t) => (t[0] === 'score' ? ['score', '9999999'] : t)),
    };
    const tamperedSigned = finalizeEvent(tamperedTemplate, amberSk);
    const tamperedRes = coord.resolvePendingNip55SignResponse({
      rawResponse: JSON.stringify(tamperedSigned),
      requestId: signPrep.requestId,
      expectedTargetLocalId: receipt.localId,
    });
    assert.equal(tamperedRes.ok, false);

    // 6c. Accept genuine BIP-340 signature matching exact pending template, pubkey, and requestId
    const validSigned = finalizeEvent(template, amberSk);
    const validRes = coord.resolvePendingNip55SignResponse({
      rawResponse: JSON.stringify(validSigned),
      requestId: signPrep.requestId,
      expectedTargetLocalId: receipt.localId,
    });
    assert.equal(validRes.ok, true);
    if (validRes.ok) {
      assert.equal(validRes.signedEvent.id, signPrep.expectedEventHash);
      assert.equal(
        verifySignedEventMatchesRequest(
          validRes.signedEvent,
          { ...template, pubkey: amberPub },
          amberPub,
          signPrep.expectedEventHash
        ).ok,
        true
      );
    }
  });

  it('7. Validates NIP-46 CSPRNG pairing secret strictly (rejects generic "ack") and persists session across app switches', () => {
    const coord = new MojiNostrCoordinator(['wss://relay.damus.io'], undefined, {
      disableNetwork: true,
    });
    const abort = new AbortController();
    const session = coord.createNostrConnectSession(abort.signal, false);

    assert.ok(session.uri.startsWith('nostrconnect://'));
    const persistedPending = coord.getPendingNip46Session();
    assert.ok(persistedPending);
    assert.equal(persistedPending!.secret.length, 32, '128-bit CSPRNG hex secret');

    // Reusing session after switching back from Amber/Primal preserves exact URI & secret
    const resumed = coord.createNostrConnectSession(abort.signal, true);
    assert.equal(resumed.uri, session.uri);
    abort.abort();

    // Generic "ack" MUST be rejected when a secret was issued
    const ackCheck = validateNip46PairingResponse({ result: 'ack' }, persistedPending!.secret);
    assert.equal(ackCheck.ok, false);
    assert.match(ackCheck.error ?? '', /ack/i);

    // Wrong secret rejected
    const wrongCheck = validateNip46PairingResponse(
      { result: '00001111222233334444555566667777' },
      persistedPending!.secret
    );
    assert.equal(wrongCheck.ok, false);

    // Exact CSPRNG secret accepted
    const exactCheck = validateNip46PairingResponse(
      { result: persistedPending!.secret },
      persistedPending!.secret
    );
    assert.equal(exactCheck.ok, true);
  });

  it('8. Validates Leaderboard Kind 30078 run receipts strictly and separates progress snapshots & receipt statuses', () => {
    const sk = generateSecretKey();
    const pub = getPublicKey(sk);
    const coord = new MojiNostrCoordinator(['wss://relay.damus.io'], undefined, {
      disableNetwork: true,
    });

    const validReceipt: RunReceiptRecord = {
      localId: '1791111111-aabbccddeeff',
      runHash: 'aabbccddeeff',
      dTag: 'mojisurvivor:run:1791111111:aabbccddeeff',
      pubkey: pub,
      score: 31200,
      wave: 9,
      defeated: 290,
      bossesDefeated: 1,
      durationSec: 270,
      mojoEarned: 75,
      strongestSpellName: 'Chain Storm',
      weaponsSummary: 'lightning_zap:3',
      createdAt: 1791111111,
      status: 'confirmed',
      acceptedRelays: ['wss://relay.damus.io'],
      rejectedRelays: {},
    };

    const validEvent = finalizeEvent(coord.buildUnsignedRunTemplate(validReceipt, pub), sk);
    const parsedValid = coord.parseVerifiedScoreEvent(validEvent, 'relay');
    assert.ok(parsedValid);
    assert.equal(parsedValid!.score, 31200);

    // Progress snapshot (`d: mojisurvivor:progress:v1`) must NEVER be parsed as a leaderboard score
    const progressEvent = finalizeEvent(
      coord.buildUnsignedProgressTemplate(createDefaultState()),
      sk
    );
    assert.equal(coord.parseVerifiedScoreEvent(progressEvent, 'relay'), null);

    // Mismatched `p` tag must be rejected
    const spoofedPTemplate = coord.buildUnsignedRunTemplate(validReceipt, 'f'.repeat(64));
    const spoofedPEvent = finalizeEvent(spoofedPTemplate, sk);
    assert.equal(coord.parseVerifiedScoreEvent(spoofedPEvent, 'relay'), null);

    // Out-of-bounds score must be rejected
    const negativeScoreEvent = finalizeEvent(
      coord.buildUnsignedRunTemplate({ ...validReceipt, score: -50 }, pub),
      sk
    );
    assert.equal(coord.parseVerifiedScoreEvent(negativeScoreEvent, 'relay'), null);

    // Score card summary text distinguishes relay-confirmed vs local unsigned runs
    const confirmedText = buildScoreSummaryText({
      ...validReceipt,
      signedEvent: validEvent,
    });
    assert.match(confirmedText, /Relay Confirmed/);

    const unsignedText = buildScoreSummaryText({
      ...validReceipt,
      status: 'unsigned_local',
      signedEvent: undefined,
    });
    assert.match(unsignedText, /Local Run Summary \(unsigned\)/i);
  });

  it('9. Preserves active run checkpoints and handles rapid consecutive upgrade purchases accurately', () => {
    saveActiveRunCheckpoint({
      runSessionId: 'run_resume_test',
      savedAt: Date.now(),
      wave: 4,
      waveTimer: 12.5,
      score: 7400,
      mojoEarned: 32,
      careerXpEarned: 140,
      defeated: 68,
      bossesDefeated: 0,
      elapsedSec: 102,
      playerHp: 88,
      playerMaxHp: 118,
      spellLevel: 5,
      spellExp: 14,
      spellExpNext: 68,
      weapons: [
        { id: 'lightning_zap', level: 3, cooldown: 0.85, damage: 64, range: 310 },
      ],
    });

    const restoredCheckpoint = loadActiveRunCheckpoint();
    assert.ok(restoredCheckpoint);
    assert.equal(restoredCheckpoint!.wave, 4);
    assert.equal(restoredCheckpoint!.spellLevel, 5);

    // Simulate rapid synchronous Upgrade Lab clicks on Attack (costs: Lv0->25, Lv1->38, Lv2->60 => total 123)
    const spec = UPGRADE_SPECS[0];
    let state: PersistedGameState = {
      ...createDefaultState(),
      mojoBalance: 100,
      lifetimeMojoEarned: 100,
    };

    const purchaseSync = () => {
      const lvl = state.upgrades[spec.key];
      const cost = getUpgradeCost(spec, lvl);
      if (state.mojoBalance < cost) {
        return { ok: false, remaining: state.mojoBalance, level: lvl };
      }
      state = {
        ...state,
        mojoBalance: state.mojoBalance - cost,
        upgrades: { ...state.upgrades, [spec.key]: lvl + 1 },
      };
      return { ok: true, remaining: state.mojoBalance, level: state.upgrades[spec.key] };
    };

    const click1 = purchaseSync(); // -25 -> 75 left, Lv.1
    const click2 = purchaseSync(); // -38 -> 37 left, Lv.2
    const click3 = purchaseSync(); // needs 60, only 37 left -> fails cleanly!

    assert.deepEqual(click1, { ok: true, remaining: 75, level: 1 });
    assert.deepEqual(click2, { ok: true, remaining: 37, level: 2 });
    assert.deepEqual(click3, { ok: false, remaining: 37, level: 2 });
    assert.equal(normalizeAndMigrateState(state)?.mojoBalance, 37);
  });

  it('10. Shows first-load warning, keeps live Nostr open without keyword censorship, bans SHA-256 hashes & npubs privately, publishes anonymous relay reports, and supports Safe List curation', async () => {
    // 10a. First-load warning defaults to `null` until accepted, then persists
    const fresh = createDefaultState();
    assert.equal(fresh.contentWarningAcceptedAt, null);
    assert.equal(fresh.settings.emojiFilterMode, 'open_with_banlist');

    savePersistedState({ ...fresh, contentWarningAcceptedAt: 1793000000000 });
    const reloaded = loadPersistedStateWithDiagnostics().state;
    assert.equal(reloaded.contentWarningAcceptedAt, 1793000000000);

    // 10b. Live NIP-30 packs are NEVER choked by keyword heuristics in default `open_with_banlist` mode
    const userSk = generateSecretKey();
    const userPub = getPublicKey(userSk);
    const nsfwAuthorSk = generateSecretKey();
    const nsfwAuthorPub = getPublicKey(nsfwAuthorSk);
    const nsfwAuthorNpub = pubkeyHexToNpub(nsfwAuthorPub);
    const safeAuthorSk = generateSecretKey();
    const safeAuthorPub = getPublicKey(safeAuthorSk);
    const reposterSk = generateSecretKey();

    assert.equal(normalizePubkeyOrNpub(nsfwAuthorNpub), nsfwAuthorPub);

    const coord = new MojiNostrCoordinator(['wss://relay.damus.io'], undefined, {
      disableNetwork: true,
    });
    assert.equal(coord.importNsecKey(nip19.nsecEncode(userSk)).ok, true);

    const wildHash = extractEmojiHash('https://cdn.example.com/wild_emote.png');
    const badHash1 = extractEmojiHash('https://cdn.example.com/bad1.png');
    const badHashReposted = extractEmojiHash('https://cdn.example.com/reposted_nsfw.png');
    assert.equal(normalizeEmojiHash(`#${badHashReposted}`), badHashReposted);

    const wildNostrPack = finalizeEvent(
      {
        kind: 30030,
        created_at: 1792000100,
        tags: [
          ['d', 'edgy-nostr-pack'],
          ['content-warning', 'edgy'],
          ['emoji', 'wild_emote', 'https://cdn.example.com/wild_emote.png'],
        ],
        content: '',
      },
      safeAuthorSk
    );
    const reportedNsfwPack = finalizeEvent(
      {
        kind: 30030,
        created_at: 1792000200,
        tags: [
          ['d', 'spam-pack'],
          ['title', 'Spam Pack'],
          ['emoji', 'bad_emote_1', 'https://cdn.example.com/bad1.png'],
          ['emoji', 'bad_emote_2', 'https://cdn.example.com/bad2.png'],
        ],
        content: '',
      },
      nsfwAuthorSk
    );
    const repostedPackFromStranger = finalizeEvent(
      {
        kind: 10030,
        created_at: 1792000300,
        tags: [
          ['emoji', 'innocent_shortcode', 'https://cdn.example.com/reposted_nsfw.png'],
        ],
        content: '',
      },
      reposterSk
    );

    coord.ingestNip30PackEvent(wildNostrPack);
    coord.ingestNip30PackEvent(reportedNsfwPack);
    coord.ingestNip30PackEvent(repostedPackFromStranger);

    assert.equal(
      Array.from(coord.emojis.values()).some((e) => e.hash === wildHash),
      true,
      'Open Nostr mode must NOT kill packs based on tags or keywords'
    );
    assert.equal(
      Array.from(coord.emojis.values()).some((e) => e.hash === badHash1),
      true
    );

    // 10c. Report & Ban both npub AND standalone SHA-256 emoji hash:
    coord.updateModerationPolicy({
      emojiFilterMode: 'open_with_banlist',
      nsfwBanPubkeys: [nsfwAuthorNpub],
      nsfwBanEmojiHashes: [badHashReposted],
      safePackAuthors: [],
      blockedEmojiKeys: [],
    });
    assert.equal(
      Array.from(coord.emojis.values()).some((e) => e.packAuthor === nsfwAuthorPub),
      false,
      'All emojis from banned npub are immediately filtered out'
    );
    assert.equal(
      Array.from(coord.emojis.values()).some((e) => e.hash === badHashReposted),
      false,
      'Banned SHA-256 media hash is immediately filtered out regardless of shortcode or reposter'
    );
    assert.equal(
      Array.from(coord.emojis.values()).some((e) => e.hash === wildHash),
      true,
      'Non-banned Nostr packs remain untouched'
    );

    const reportAuthorRes = await coord.publishAnonymousModerationReport({
      targetPubkeyOrNpub: nsfwAuthorNpub,
      verdict: 'nsfw_ban',
      packTitle: 'Spam Pack',
      packDTag: 'spam-pack',
      emojiHash: badHash1,
    });
    assert.equal(reportAuthorRes.ok, true);
    assert.ok(reportAuthorRes.event);
    assert.notEqual(
      reportAuthorRes.event!.pubkey,
      userPub,
      'Moderation report MUST be signed by an anonymous ephemeral keypair, never exposing the player npub'
    );
    assert.equal(
      reportAuthorRes.event!.tags.find((t) => t[0] === 't')?.[1],
      MODERATION_REPORT_TOPIC
    );
    assert.equal(
      reportAuthorRes.event!.tags.find((t) => t[0] === 'x')?.[1],
      badHash1,
      'Includes NIP-94 SHA-256 x-hash tag instead of shortcode'
    );

    const reportHashOnlyRes = await coord.publishAnonymousModerationReport({
      verdict: 'nsfw_hash',
      emojiHash: badHashReposted,
    });
    assert.equal(reportHashOnlyRes.ok, true);
    assert.equal(
      reportHashOnlyRes.event!.tags.find((t) => t[0] === 'x')?.[1],
      badHashReposted
    );

    // Verify published reports are inspectable in Relay Moderation Reports feed
    const allReports = coord.getSortedModerationReports('all');
    assert.equal(allReports.length, 2);
    assert.ok(allReports.some((r) => r.verdict === 'nsfw_ban' && r.targetNpub === nsfwAuthorNpub));
    assert.ok(allReports.some((r) => r.verdict === 'nsfw_hash' && r.emojiHash === badHashReposted));

    // Verify public progression snapshot (`mojisurvivor:progress:v1`) NEVER exposes private `nsfwBanPubkeys` or `nsfwBanEmojiHashes`
    const stateWithPrivateBan: PersistedGameState = {
      ...fresh,
      mojoBalance: 300,
      lifetimeMojoEarned: 300,
      nsfwBanPubkeys: [nsfwAuthorPub],
      nsfwBanEmojiHashes: [badHashReposted],
      safePackAuthors: [safeAuthorPub],
    };
    const progressTemplate = coord.buildUnsignedProgressTemplate(stateWithPrivateBan);
    assert.ok(
      !progressTemplate.content.includes(nsfwAuthorPub) &&
        !progressTemplate.content.includes(badHashReposted),
      'Private NSFW ban lists (npubs and SHA-256 hashes) must never leak inside public Nostr progression snapshots'
    );

    // 10d. Safe List Only mode restricts NIP-30 packs strictly to safe-listed npubs (+ user's own packs)
    const strangerSk = generateSecretKey();
    const strangerHash = extractEmojiHash('https://cdn.example.com/stranger.png');
    const strangerPack = finalizeEvent(
      {
        kind: 30030,
        created_at: 1792000500,
        tags: [
          ['d', 'stranger-pack'],
          ['emoji', 'stranger_emote', 'https://cdn.example.com/stranger.png'],
        ],
        content: '',
      },
      strangerSk
    );
    coord.ingestNip30PackEvent(strangerPack);
    assert.equal(
      Array.from(coord.emojis.values()).some((e) => e.hash === strangerHash),
      true
    );

    coord.updateModerationPolicy({
      emojiFilterMode: 'safe_list_only',
      nsfwBanPubkeys: [nsfwAuthorPub],
      nsfwBanEmojiHashes: [badHashReposted],
      safePackAuthors: [safeAuthorPub],
      blockedEmojiKeys: [],
    });
    assert.equal(
      Array.from(coord.emojis.values()).some((e) => e.hash === wildHash),
      true,
      'Safe-listed creator pack remains active in Safe List Only mode'
    );
    assert.equal(
      Array.from(coord.emojis.values()).some((e) => e.hash === strangerHash),
      false,
      'Non-safe-listed stranger pack is excluded in Safe List Only mode'
    );
  });
});
