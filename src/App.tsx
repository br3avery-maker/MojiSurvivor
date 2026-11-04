import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { ArenaView } from './components/ArenaView';
import { CodexView } from './components/CodexView';
import { IdentitySettingsView } from './components/IdentitySettingsView';
import { LeaderboardView } from './components/LeaderboardView';
import { UpgradeLabView } from './components/UpgradeLabView';
import { sha256Hex, type EmojiCombatTrait } from './lib/cryptoStats';
import type { CompletedRunSummary } from './lib/gameEngine';
import { formatShortNpub, MojiNostrCoordinator } from './lib/nostrEngine';
import {
  loadPersistedState,
  savePersistedState,
  type GameSettings,
  type PersistedGameState,
  type RunReceiptRecord,
  type UpgradeLevels,
} from './lib/storage';

type Destination = 'lobby' | 'arena' | 'upgrades' | 'codex' | 'leaderboard' | 'identity';

const DEFAULT_AVATAR_URL = '/src/assets/images/moji_survivor_emblem_1793749794956.jpg';
const LOBBY_BACKDROP_URL = '/src/assets/images/arena_lobby_backdrop_1793749795243.jpg';

export default function App() {
  const [persisted, setPersisted] = useState<PersistedGameState>(() => loadPersistedState());
  const [coordinator] = useState<MojiNostrCoordinator>(
    () => new MojiNostrCoordinator(loadPersistedState().relays)
  );
  const [nostrTick, setNostrTick] = useState(0);
  const [destination, setDestination] = useState<Destination>('lobby');

  // Subscribe to reactive updates from MojiNostrCoordinator
  useEffect(() => {
    const unsub = coordinator.subscribe(() => {
      setNostrTick((t) => t + 1);
    });
    void coordinator.syncAll();
    return unsub;
  }, [coordinator]);

  // Persist progression & settings updates
  useEffect(() => {
    savePersistedState(persisted);
  }, [persisted]);

  // Handle Android NIP-55 callback query parameters & automatic offline queue flush
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nip55Pub = params.get('nip55_pubkey');
    const nip55Signed = params.get('nip55_signed');

    if (nip55Pub) {
      coordinator.connectNip55WithPubkey(nip55Pub);
      window.history.replaceState({}, '', window.location.pathname);
    }

    if (nip55Signed) {
      const latestPending = persisted.localReceipts.find((r) => r.status !== 'confirmed');
      if (latestPending) {
        void coordinator
          .attachNip55SignedEventAndBroadcast(latestPending, nip55Signed)
          .then((updated) => {
            setPersisted((prev) => ({
              ...prev,
              localReceipts: prev.localReceipts.map((r) =>
                r.localId === updated.localId ? updated : r
              ),
            }));
          });
      }
      window.history.replaceState({}, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onOnline = () => {
      const queued = persisted.localReceipts.filter((r) => r.status === 'queued_offline');
      for (const rec of queued) {
        void coordinator.signAndBroadcastReceipt(rec).then((updated) => {
          setPersisted((prev) => ({
            ...prev,
            localReceipts: prev.localReceipts.map((r) =>
              r.localId === updated.localId ? updated : r
            ),
          }));
        });
      }
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [coordinator, persisted.localReceipts]);

  const handleEnemyDefeated = useCallback((trait: EmojiCombatTrait) => {
    setPersisted((prev) => {
      const prevEntry = prev.codex[trait.shortcode];
      return {
        ...prev,
        codex: {
          ...prev.codex,
          [trait.shortcode]: {
            shortcode: trait.shortcode,
            kills: (prevEntry?.kills ?? 0) + 1,
            firstDefeatedAt: prevEntry?.firstDefeatedAt ?? Date.now(),
            powerRating: trait.powerRating,
          },
        },
      };
    });
  }, []);

  const handleRunCompleted = useCallback(
    (summary: CompletedRunSummary): RunReceiptRecord => {
      const createdAt = Math.floor(Date.now() / 1000);
      const runHash = sha256Hex(
        `${coordinator.pubkey}:${summary.score}:${summary.wave}:${summary.defeated}:${createdAt}`
      ).slice(0, 12);
      const dTag = `mojisurvivor:run:${createdAt}:${runHash}`;

      const newReceipt: RunReceiptRecord = {
        localId: `${createdAt}-${runHash}`,
        runHash,
        dTag,
        pubkey: coordinator.pubkey,
        score: summary.score,
        wave: summary.wave,
        defeated: summary.defeated,
        bossesDefeated: summary.bossesDefeated,
        durationSec: summary.durationSec,
        mojoEarned: summary.mojoEarned,
        weaponsSummary: summary.weaponsSummary,
        createdAt,
        status: 'unsigned_local',
        acceptedRelays: [],
        rejectedRelays: {},
      };

      setPersisted((prev) => ({
        ...prev,
        mojoBalance: prev.mojoBalance + summary.mojoEarned,
        highScore: Math.max(prev.highScore, summary.score),
        bestWave: Math.max(prev.bestWave, summary.wave),
        totalKills: prev.totalKills + summary.defeated,
        totalRuns: prev.totalRuns + 1,
        localReceipts: [newReceipt, ...prev.localReceipts].slice(0, 40),
      }));

      return newReceipt;
    },
    [coordinator.pubkey]
  );

  const handleReceiptUpdated = useCallback((updated: RunReceiptRecord) => {
    setPersisted((prev) => ({
      ...prev,
      localReceipts: prev.localReceipts.map((r) =>
        r.localId === updated.localId ? updated : r
      ),
    }));
  }, []);

  const handlePurchaseUpgrade = useCallback(
    (key: keyof UpgradeLevels, cost: number): boolean => {
      let purchased = false;
      setPersisted((prev) => {
        if (prev.mojoBalance < cost) return prev;
        purchased = true;
        return {
          ...prev,
          mojoBalance: prev.mojoBalance - cost,
          upgrades: {
            ...prev.upgrades,
            [key]: prev.upgrades[key] + 1,
          },
        };
      });
      return purchased;
    },
    []
  );

  const handleUpdateRelays = useCallback(
    (relays: string[]) => {
      coordinator.setRelays(relays);
      setPersisted((prev) => ({ ...prev, relays }));
    },
    [coordinator]
  );

  const handleUpdateSettings = useCallback((settings: GameSettings) => {
    setPersisted((prev) => ({ ...prev, settings }));
  }, []);

  const allEmojis = useMemo(
    () => Array.from(coordinator.emojis.values()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coordinator, nostrTick]
  );

  const liveNip30Count = useMemo(
    () => allEmojis.filter((e) => e.source === 'nip30').length,
    [allEmojis]
  );

  const sortedLeaderboard = useMemo(
    () => coordinator.getSortedLeaderboard(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coordinator, nostrTick]
  );

  const activeProfile = coordinator.profiles.get(coordinator.pubkey);

  // Full-bleed edge-to-edge Arena Combat takes over the screen with zero website chrome
  if (destination === 'arena') {
    return (
      <ArenaView
        coordinator={coordinator}
        upgrades={persisted.upgrades}
        settings={persisted.settings}
        defaultAvatarUrl={DEFAULT_AVATAR_URL}
        onEnemyDefeated={handleEnemyDefeated}
        onRunCompleted={handleRunCompleted}
        onReceiptUpdated={handleReceiptUpdated}
        onExitToLobby={() => setDestination('lobby')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {persisted.settings.crtScanlines && (
        <div className="pointer-events-none fixed inset-0 crt-scanlines opacity-30 z-40" />
      )}

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-white/10 bg-black/95 sticky top-0 z-30">
        <button
          type="button"
          onClick={() => setDestination('lobby')}
          className="text-lg font-display font-bold tracking-tight text-white hover:text-[#FF1493] transition-colors whitespace-nowrap shrink-0"
        >
          MojiSurvivor
        </button>

        <nav
          aria-label="Primary game navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-[#B8B8B8]"
        >
          {(
            [
              ['lobby', 'Lobby'],
              ['upgrades', 'Upgrade Lab'],
              ['codex', 'Codex'],
              ['leaderboard', 'Leaderboard'],
              ['identity', 'Identity'],
            ] as const
          ).map(([dest, label]) => (
            <button
              key={dest}
              type="button"
              onClick={() => setDestination(dest)}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                destination === dest
                  ? 'text-white border-[#FF1493]'
                  : 'border-transparent hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setDestination('arena')}
            className="min-h-[40px] px-4 py-2 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0"
          >
            Start Run
          </button>
        </div>
      </header>

      {/* Compact Mobile Navigation Row */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden flex items-center justify-between gap-2 px-4 py-2.5 border-b border-white/10 bg-[#111111] overflow-x-auto"
      >
        {(
          [
            ['lobby', 'Lobby'],
            ['upgrades', 'Upgrades'],
            ['codex', 'Codex'],
            ['leaderboard', 'Ranks'],
            ['identity', 'Identity'],
          ] as const
        ).map(([dest, label]) => (
          <button
            key={dest}
            type="button"
            onClick={() => setDestination(dest)}
            className={`px-2.5 py-1.5 rounded text-xs font-medium whitespace-nowrap shrink-0 ${
              destination === dest ? 'text-[#FF1493] font-semibold' : 'text-[#B8B8B8]'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Main Content Area */}
      <main className="flex-1">
        {destination === 'lobby' && (
          <section className="max-w-6xl mx-auto px-6 py-10 space-y-12">
            {/* Primary Arcade Lobby Split */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#FFB6D9]">
                    <span>NIP-30 Custom Emoji Arena</span>
                    <span aria-hidden="true">·</span>
                    <span>BIP-340 Schnorr Receipts</span>
                    <span aria-hidden="true">·</span>
                    <span>Nostrify + nostr-tools</span>
                  </div>

                  <h1
                    className="font-display font-bold text-white tracking-tight leading-[1.08]"
                    style={{
                      fontSize: 'clamp(2.25rem, 4vw, 3.6rem)',
                      textWrap: 'balance',
                    }}
                  >
                    Survive the rogue custom emojis of Nostr.
                  </h1>

                  <p className="text-base text-[#B8B8B8] leading-relaxed max-w-xl">
                    Every <code className="font-mono text-white">kind:30030</code> emoji pack harvested from your relays becomes a deterministic enemy archetype powered by SHA-256. Merge auto-firing spells, defeat Wave-5 Apex Bosses, and sign immutable run receipts to the global leaderboard.
                  </p>
                </div>

                {/* Active Persona Inline Strip + Primary Launch */}
                <div className="pt-2 space-y-5">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-full bg-[#111111] border border-[#FF1493] overflow-hidden shrink-0">
                      <img
                        src={activeProfile?.picture || DEFAULT_AVATAR_URL}
                        alt="Active player persona"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR_URL;
                        }}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">
                        {activeProfile?.displayName ||
                          activeProfile?.name ||
                          formatShortNpub(coordinator.pubkey)}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#B8B8B8]">
                        <span>
                          {coordinator.signerMode === 'guest'
                            ? 'Local secp256k1 Guest Key'
                            : `Signer: ${coordinator.signerMode.toUpperCase()}`}
                        </span>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() => setDestination('identity')}
                          className="text-[#FFB6D9] hover:text-white underline whitespace-nowrap"
                        >
                          Configure Signer & Relays
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setDestination('arena')}
                      className="min-h-[48px] px-6 py-3 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] text-sm font-semibold text-white transition-colors inline-flex items-center gap-2.5 whitespace-nowrap shrink-0"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Enter Battle Arena</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDestination('upgrades')}
                      className="min-h-[48px] px-5 py-3 rounded-lg bg-[#111111] border border-white/15 hover:border-white/35 text-sm font-semibold text-white transition-colors whitespace-nowrap shrink-0"
                    >
                      Mojo Upgrade Lab ({persisted.mojoBalance.toLocaleString()} Mojo)
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Tactical Arena Visual Card */}
              <div className="lg:col-span-5 relative rounded-xl overflow-hidden border border-white/15 bg-[#111111] min-h-[280px]">
                <img
                  src={LOBBY_BACKDROP_URL}
                  alt="Obsidian tactical arena coordinate grid"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent p-6 flex flex-col justify-end">
                  <div className="text-xs font-mono text-[#FFB6D9] mb-1">
                    Controls & Spell Evolution
                  </div>
                  <p className="text-sm text-white/95 leading-snug">
                    Touch and drag anywhere on the arena (or use WASD / Arrow keys) to maneuver—no on-screen joystick clutter. Weapons auto-target and duplicate picks evolve up to Tier 3.
                  </p>
                </div>
              </div>
            </div>

            {/* Full-Width 4-Column Saved Progression & Relay Sync Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 py-6 border-y border-white/10 font-mono tabular-nums">
              <div>
                <div className="text-xs text-[#B8B8B8]">Personal High Score</div>
                <div className="text-2xl font-bold text-white mt-1">
                  {persisted.highScore.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-xs text-[#B8B8B8]">Highest Wave Reached</div>
                <div className="text-2xl font-bold text-white mt-1">
                  Wave {persisted.bestWave}
                </div>
              </div>
              <div>
                <div className="text-xs text-[#B8B8B8]">Owned Mojo Balance</div>
                <div className="text-2xl font-bold text-[#FF9900] mt-1">
                  {persisted.mojoBalance.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-xs text-[#B8B8B8]">NIP-30 Emojis Synced</div>
                <div className="text-2xl font-bold text-[#00F0FF] mt-1">
                  {allEmojis.length} ({liveNip30Count} live)
                </div>
              </div>
            </div>

            {/* Quick Destination Directory */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <button
                type="button"
                onClick={() => setDestination('codex')}
                className="text-left p-6 rounded-xl bg-[#111111] border border-white/10 hover:border-[#FF1493] transition-colors space-y-2"
              >
                <div className="text-xs font-mono text-[#B8B8B8]">01. Bestiary</div>
                <h2 className="text-lg font-display font-bold text-white">
                  Emoji Codex ({Object.keys(persisted.codex).length}/{allEmojis.length})
                </h2>
                <p className="text-sm text-[#B8B8B8]">
                  Inspect unlocked NIP-30 custom emojis, SHA-256 derived HP/Speed/Damage stats, and AI archetypes.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setDestination('leaderboard')}
                className="text-left p-6 rounded-xl bg-[#111111] border border-white/10 hover:border-[#FF1493] transition-colors space-y-2"
              >
                <div className="text-xs font-mono text-[#B8B8B8]">02. Relay Proofs</div>
                <h2 className="text-lg font-display font-bold text-white">
                  Global Leaderboard ({sortedLeaderboard.length} runs)
                </h2>
                <p className="text-sm text-[#B8B8B8]">
                  Audit BIP-340 Schnorr-verified Kind 30078 run receipts and manage your offline publish queue.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setDestination('identity')}
                className="text-left p-6 rounded-xl bg-[#111111] border border-white/10 hover:border-[#FF1493] transition-colors space-y-2"
              >
                <div className="text-xs font-mono text-[#B8B8B8]">03. Signers & Relays</div>
                <h2 className="text-lg font-display font-bold text-white">
                  NIP-07, NIP-46 & NIP-55
                </h2>
                <p className="text-sm text-[#B8B8B8]">
                  Connect browser extensions, remote bunkers, or Android Amber, and customize sensory comfort.
                </p>
              </button>
            </div>
          </section>
        )}

        {destination === 'upgrades' && (
          <UpgradeLabView
            mojoBalance={persisted.mojoBalance}
            upgrades={persisted.upgrades}
            onPurchaseUpgrade={handlePurchaseUpgrade}
          />
        )}

        {destination === 'codex' && (
          <CodexView
            emojis={allEmojis}
            codexRecords={persisted.codex}
            imageStatuses={coordinator.imageStatus}
            syncing={coordinator.syncingEmojis}
            onSyncNip30={() => void coordinator.syncNip30Emojis()}
          />
        )}

        {destination === 'leaderboard' && (
          <LeaderboardView
            entries={sortedLeaderboard}
            profiles={coordinator.profiles}
            localReceipts={persisted.localReceipts}
            currentPubkey={coordinator.pubkey}
            defaultAvatarUrl={DEFAULT_AVATAR_URL}
            relayCount={persisted.relays.length}
            syncing={coordinator.syncingLeaderboard}
            onRefreshRelays={() => void coordinator.syncGlobalLeaderboard()}
            onBroadcastLocalReceipt={async (rec) => {
              await coordinator.signAndBroadcastReceipt(rec, handleReceiptUpdated);
            }}
          />
        )}

        {destination === 'identity' && (
          <IdentitySettingsView
            coordinator={coordinator}
            profile={activeProfile}
            defaultAvatarUrl={DEFAULT_AVATAR_URL}
            relays={persisted.relays}
            settings={persisted.settings}
            onUpdateRelays={handleUpdateRelays}
            onUpdateSettings={handleUpdateSettings}
          />
        )}
      </main>
    </div>
  );
}
