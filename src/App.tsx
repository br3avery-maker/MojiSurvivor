import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Play, ChevronRight } from 'lucide-react';
import { ArenaView } from './components/ArenaView';
import { CodexView } from './components/CodexView';
import {
  IdentitySettingsView,
  type AccordionPanel,
} from './components/IdentitySettingsView';
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
  const [settingsPanel, setSettingsPanel] = useState<AccordionPanel>('profile');

  useEffect(() => {
    const unsub = coordinator.subscribe(() => {
      setNostrTick((t) => t + 1);
    });
    void coordinator.syncAll();
    return unsub;
  }, [coordinator]);

  useEffect(() => {
    savePersistedState(persisted);
  }, [persisted]);

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

  const openAccountPanel = useCallback((panel: AccordionPanel = 'profile') => {
    setSettingsPanel(panel);
    setDestination('identity');
  }, []);

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
  const discoveredCount = Object.keys(persisted.codex).length;
  const isSignedIn = coordinator.isSignedIn();

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

      {/* Compact Sticky Top Chrome (3-Zone Top Bar + Mobile Tab Strip) */}
      <div className="sticky top-0 z-30 bg-black border-b border-white/10">
        <header className="max-w-5xl mx-auto flex items-center justify-between gap-8 px-4 py-2">
          <button
            type="button"
            onClick={() => setDestination('lobby')}
            className="text-base font-display font-bold tracking-tight text-white hover:text-[#FF1493] transition-colors whitespace-nowrap shrink-0"
          >
            MojiSurvivor
          </button>

          <nav
            aria-label="Primary game navigation"
            className="hidden md:flex items-center gap-6 text-xs font-medium text-[#B8B8B8]"
          >
            {(
              [
                ['lobby', 'Lobby'],
                ['upgrades', 'Upgrades'],
                ['codex', 'Codex'],
                ['leaderboard', 'Leaderboard'],
                ['identity', 'Profile'],
              ] as const
            ).map(([dest, label]) => (
              <button
                key={dest}
                type="button"
                onClick={() =>
                  dest === 'identity' ? openAccountPanel('profile') : setDestination(dest)
                }
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
              className="min-h-[34px] px-3.5 py-1.5 rounded-md bg-[#FF1493] hover:bg-[#CD0D72] text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0"
            >
              Start Run
            </button>
          </div>
        </header>

        <nav
          aria-label="Mobile navigation"
          className="md:hidden grid grid-cols-5 border-t border-white/10 bg-[#0A0A0A] px-2"
        >
          {(
            [
              ['lobby', 'Lobby'],
              ['upgrades', 'Upgrades'],
              ['codex', 'Codex'],
              ['leaderboard', 'Ranks'],
              ['identity', 'Profile'],
            ] as const
          ).map(([dest, label]) => (
            <button
              key={dest}
              type="button"
              onClick={() =>
                dest === 'identity' ? openAccountPanel('profile') : setDestination(dest)
              }
              className={`min-h-[36px] text-center text-[11px] font-medium whitespace-nowrap border-b-2 transition-colors ${
                destination === dest
                  ? 'text-white border-[#FF1493] font-semibold'
                  : 'text-[#B8B8B8] border-transparent hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content Container */}
      <main className="flex-1 pb-16">
        {destination === 'lobby' && (
          <section className="max-w-5xl mx-auto px-4 py-3.5 space-y-3">
            {/* Compact Hero Arena Card */}
            <div className="relative rounded-xl overflow-hidden border border-white/15 bg-[#111111]">
              <img
                src={LOBBY_BACKDROP_URL}
                alt="Obsidian tactical arena backdrop"
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-cover opacity-35"
              />
              <div className="relative bg-gradient-to-r from-black/90 via-black/80 to-black/70 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3.5">
                <div className="space-y-2 max-w-xl">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-black border border-[#FF1493] overflow-hidden shrink-0">
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
                        {isSignedIn
                          ? activeProfile?.displayName ||
                            activeProfile?.name ||
                            formatShortNpub(coordinator.pubkey)
                          : 'Guest Player'}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#B8B8B8]">
                        <span>
                          {isSignedIn ? coordinator.signerMode.toUpperCase() : 'Not signed in'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() => openAccountPanel('profile')}
                          className="text-[#FFB6D9] hover:text-white underline whitespace-nowrap"
                        >
                          {isSignedIn ? 'Manage Profile' : 'Sign In'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h1
                      className="text-xl sm:text-2xl font-display font-bold text-white tracking-tight leading-snug"
                      style={{ textWrap: 'balance' }}
                    >
                      NIP-30 Custom Emoji Survivor Arena
                    </h1>
                    <p className="text-xs text-[#B8B8B8] mt-0.5 leading-relaxed">
                      Drag anywhere or use WASD to dodge live <code className="font-mono text-white">kind:30030</code> emojis, merge duplicate spells, and broadcast BIP-340 receipts.
                    </p>
                  </div>
                </div>

                <div className="flex sm:flex-row flex-col gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setDestination('arena')}
                    className="min-h-[44px] px-5 py-2.5 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] text-sm font-semibold text-white transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Enter Battle Arena</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDestination('upgrades')}
                    className="min-h-[44px] px-4 py-2.5 rounded-lg bg-black/80 border border-white/15 hover:border-white/35 text-xs font-semibold text-white transition-colors whitespace-nowrap"
                  >
                    Upgrades ({persisted.mojoBalance.toLocaleString()} Mojo)
                  </button>
                </div>
              </div>
            </div>

            {/* Compact 4-Metric Strip */}
            <div className="grid grid-cols-4 gap-2 py-2.5 px-3 rounded-xl bg-[#111111] border border-white/10 font-mono tabular-nums text-center sm:text-left">
              <div>
                <div className="text-[10px] sm:text-xs text-[#B8B8B8] truncate">Best Score</div>
                <div className="text-sm sm:text-lg font-bold text-white">
                  {persisted.highScore.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[10px] sm:text-xs text-[#B8B8B8] truncate">Best Wave</div>
                <div className="text-sm sm:text-lg font-bold text-white">
                  W{persisted.bestWave}
                </div>
              </div>
              <div>
                <div className="text-[10px] sm:text-xs text-[#B8B8B8] truncate">Mojo</div>
                <div className="text-sm sm:text-lg font-bold text-[#FF9900]">
                  {persisted.mojoBalance.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[10px] sm:text-xs text-[#B8B8B8] truncate">NIP-30 Pool</div>
                <div className="text-sm sm:text-lg font-bold text-[#00F0FF]">
                  {allEmojis.length}
                  <span className="hidden sm:inline text-xs font-normal text-[#B8B8B8]">
                    {' '}({liveNip30Count} live)
                  </span>
                </div>
              </div>
            </div>

            {/* Compact Destination Rows */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setDestination('codex')}
                className="text-left px-3.5 py-3 rounded-xl bg-[#111111] border border-white/10 hover:border-[#FF1493] transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-display font-bold text-white truncate">
                    Emoji Codex · {discoveredCount}/{allEmojis.length}
                  </div>
                  <p className="text-xs text-[#B8B8B8] truncate mt-0.5">
                    SHA-256 combat traits & unlocked NIP-30 packs
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-[#B8B8B8] shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => setDestination('leaderboard')}
                className="text-left px-3.5 py-3 rounded-xl bg-[#111111] border border-white/10 hover:border-[#FF1493] transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-display font-bold text-white truncate">
                    Leaderboard · {sortedLeaderboard.length} verified
                  </div>
                  <p className="text-xs text-[#B8B8B8] truncate mt-0.5">
                    BIP-340 relay scores & local receipt queue
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-[#B8B8B8] shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => openAccountPanel('profile')}
                className="text-left px-3.5 py-3 rounded-xl bg-[#111111] border border-white/10 hover:border-[#FF1493] transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-display font-bold text-white truncate">
                    Profile, Relays & Settings
                  </div>
                  <p className="text-xs text-[#B8B8B8] truncate mt-0.5">
                    {isSignedIn
                      ? `${activeProfile?.displayName || activeProfile?.name || 'Signed in'} · ${persisted.relays.length} relays`
                      : `Sign in · ${persisted.relays.length} relays · Audio & CRT`}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-[#B8B8B8] shrink-0" />
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
            initialPanel={settingsPanel}
            onUpdateRelays={handleUpdateRelays}
            onUpdateSettings={handleUpdateSettings}
          />
        )}
      </main>
    </div>
  );
}
