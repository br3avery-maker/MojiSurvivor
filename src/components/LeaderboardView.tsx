import React, { useMemo, useState } from 'react';
import {
  RefreshCw,
  Send,
  Code2,
  Trash2,
  Share2,
  ExternalLink,
  History,
  Sparkles,
  Trophy,
  ChevronDown,
} from 'lucide-react';
import {
  formatShortNpub,
  type AggregatedMojiLeaderboardEntry,
  type MojiNostrCoordinator,
  type NostrProfileMeta,
  type PlayerLeaderboardAggregate,
  type VerifiedLeaderboardEntry,
} from '../lib/nostrEngine';
import { getRealmSpec } from '../lib/realms';
import type { PersistedGameState, RunReceiptRecord } from '../lib/storage';
import { MojiRarityCard } from './PlayerTradingCard';
import { ScoreCardPanel } from './ScoreCardPanel';

export interface CareerLifetimeTotals {
  lifetimeScore: number;
  highScore: number;
  bestWave: number;
  totalRuns: number;
  totalKills: number;
  totalBossKills: number;
  lifetimeMojoEarned: number;
  rebirthCount: number;
  lifetimeXpEarned?: number;
}

export type LeaderboardSortMode =
  | 'career_score'
  | 'career_defeated'
  | 'career_bosses'
  | 'career_runs'
  | 'best_score'
  | 'best_wave'
  | 'best_defeated'
  | 'best_bosses';

export type MojiSortMode = 'slain' | 'featured' | 'power';

interface LeaderboardViewProps {
  coordinator: MojiNostrCoordinator;
  entries: VerifiedLeaderboardEntry[];
  playerAggregates?: PlayerLeaderboardAggregate[];
  mojiLeaderboard?: AggregatedMojiLeaderboardEntry[];
  persistedState?: PersistedGameState;
  myRelayRuns: VerifiedLeaderboardEntry[];
  profiles: Map<string, NostrProfileMeta>;
  localReceipts: RunReceiptRecord[];
  currentPubkey: string;
  playerLevel: number;
  careerStats?: CareerLifetimeTotals;
  defaultAvatarUrl: string;
  relayCount: number;
  syncing: boolean;
  onRefreshRelays: () => void;
  onBroadcastLocalReceipt: (receipt: RunReceiptRecord) => Promise<void>;
  onReceiptUpdated: (updated: RunReceiptRecord) => void;
  onDeleteReceipt: (opts: {
    localId?: string;
    eventId?: string;
    dTag?: string;
    pubkey: string;
    wasBroadcast: boolean;
  }) => Promise<void>;
}

function remoteEntryToReceiptRecord(entry: VerifiedLeaderboardEntry): RunReceiptRecord {
  return {
    localId: entry.eventId,
    runHash: entry.runHash,
    dTag: entry.dTag,
    pubkey: entry.pubkey,
    score: entry.score,
    wave: entry.wave,
    defeated: entry.defeated,
    bossesDefeated: entry.bosses,
    durationSec: entry.durationSec,
    mojoEarned: 0,
    weaponsSummary: entry.weapons,
    realmId: entry.realmId,
    featuredEmoji: entry.featuredEmoji,
    createdAt: entry.createdAt,
    status: 'confirmed',
    signedEvent: entry.rawEvent,
    acceptedRelays: ['relay'],
    rejectedRelays: {},
  };
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  coordinator,
  entries,
  playerAggregates: propAggregates,
  mojiLeaderboard: propMojis,
  persistedState,
  myRelayRuns,
  profiles,
  localReceipts,
  currentPubkey,
  playerLevel,
  defaultAvatarUrl,
  relayCount,
  syncing,
  onRefreshRelays,
  onBroadcastLocalReceipt,
  onReceiptUpdated,
  onDeleteReceipt,
}) => {
  const [tab, setTab] = useState<'global' | 'mojis' | 'local'>('global');
  const [sortMode, setSortMode] = useState<LeaderboardSortMode>('career_score');
  const [mojiSortMode, setMojiSortMode] = useState<MojiSortMode>('slain');
  const [expandedPubkey, setExpandedPubkey] = useState<string | null>(null);
  const [inspectedEventId, setInspectedEventId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [scoreCardReceipt, setScoreCardReceipt] = useState<RunReceiptRecord | null>(null);
  const [nip55DrawerId, setNip55DrawerId] = useState<string | null>(null);
  const [nip55PasteInput, setNip55PasteInput] = useState('');

  const playerAggregates = useMemo(() => {
    if (propAggregates && propAggregates.length > 0) return propAggregates;
    return coordinator.getPlayerLeaderboardAggregates(persistedState);
  }, [propAggregates, coordinator, persistedState]);

  const mojiEntries = useMemo(() => {
    const base =
      propMojis && propMojis.length > 0
        ? [...propMojis]
        : coordinator.getMojiLeaderboard(persistedState?.codex);

    base.sort((a, b) => {
      if (mojiSortMode === 'featured') {
        return (
          b.timesFeatured - a.timesFeatured ||
          b.totalKills - a.totalKills ||
          b.powerRating - a.powerRating
        );
      }
      if (mojiSortMode === 'power') {
        return (
          b.powerRating - a.powerRating ||
          b.totalKills - a.totalKills ||
          b.timesFeatured - a.timesFeatured
        );
      }
      return (
        b.totalKills - a.totalKills ||
        b.timesFeatured - a.timesFeatured ||
        b.powerRating - a.powerRating
      );
    });
    return base;
  }, [propMojis, coordinator, persistedState?.codex, mojiSortMode]);

  const sortedAggregates = useMemo(() => {
    const copy = [...playerAggregates];
    copy.sort((a, b) => {
      switch (sortMode) {
        case 'career_score':
          return b.careerTotalScore - a.careerTotalScore || b.bestScore - a.bestScore;
        case 'career_defeated':
          return (
            b.careerTotalDefeated - a.careerTotalDefeated ||
            b.careerTotalScore - a.careerTotalScore
          );
        case 'career_bosses':
          return (
            b.careerTotalBosses - a.careerTotalBosses ||
            b.careerTotalDefeated - a.careerTotalDefeated ||
            b.careerTotalScore - a.careerTotalScore
          );
        case 'career_runs':
          return (
            b.careerRunCount - a.careerRunCount ||
            b.careerTotalScore - a.careerTotalScore
          );
        case 'best_wave':
          return b.bestWave - a.bestWave || b.bestScore - a.bestScore;
        case 'best_defeated':
          return (
            b.bestSingleDefeated - a.bestSingleDefeated || b.bestScore - a.bestScore
          );
        case 'best_bosses':
          return (
            b.bestSingleBosses - a.bestSingleBosses ||
            b.bestSingleDefeated - a.bestSingleDefeated ||
            b.bestScore - a.bestScore
          );
        case 'best_score':
        default:
          return b.bestScore - a.bestScore || b.bestWave - a.bestWave;
      }
    });
    return copy;
  }, [playerAggregates, sortMode]);

  const combinedMyRuns = useMemo(() => {
    const seenEventIds = new Set<string>();
    const seenDTags = new Set<string>();
    for (const rec of localReceipts) {
      if (rec.signedEvent?.id) seenEventIds.add(rec.signedEvent.id);
      if (rec.dTag) seenDTags.add(rec.dTag);
    }

    const remoteOnly = myRelayRuns.filter(
      (r) => !seenEventIds.has(r.eventId) && (!r.dTag || !seenDTags.has(r.dTag))
    );

    return { localReceipts, remoteOnly };
  }, [localReceipts, myRelayRuns]);

  const totalMyRuns =
    combinedMyRuns.localReceipts.length + combinedMyRuns.remoteOnly.length;

  const handleBroadcastClick = async (rec: RunReceiptRecord) => {
    if (coordinator.signerMode === 'nip55' && !rec.signedEvent) {
      setNip55DrawerId((prev) => (prev === rec.localId ? null : rec.localId));
      return;
    }
    setBusyKey(rec.localId);
    try {
      await onBroadcastLocalReceipt(rec);
    } finally {
      setBusyKey(null);
    }
  };

  const handleLaunchNip55Sign = (rec: RunReceiptRecord) => {
    const prepared = coordinator.prepareNip55SignEventRequest({
      purpose: 'sign_run_receipt',
      unsignedTemplate: coordinator.buildUnsignedRunTemplate(rec),
      targetLocalId: rec.localId,
    });
    if ('error' in prepared) {
      onReceiptUpdated({
        ...rec,
        status: 'failed',
        lastError: prepared.error,
      });
      return;
    }
    onReceiptUpdated({
      ...rec,
      status: 'signing',
      lastError: undefined,
    });
    window.location.href = prepared.uri;
  };

  const handleApplyNip55Paste = async (rec: RunReceiptRecord) => {
    if (!nip55PasteInput.trim()) return;
    setBusyKey(rec.localId);
    try {
      const updated = await coordinator.attachNip55SignedEventAndBroadcast(
        rec,
        nip55PasteInput.trim(),
        undefined,
        onReceiptUpdated
      );
      onReceiptUpdated(updated);
      if (updated.status === 'confirmed' || updated.status === 'queued_offline') {
        setNip55PasteInput('');
        setNip55DrawerId(null);
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleDeleteClick = async (
    key: string,
    opts: {
      localId?: string;
      eventId?: string;
      dTag?: string;
      pubkey: string;
      wasBroadcast: boolean;
    }
  ) => {
    setBusyKey(key);
    try {
      await onDeleteReceipt(opts);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <section className="max-w-5xl mx-auto px-4 py-4 space-y-3.5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
        <div className="min-w-0 space-y-0.5">
          <h1 className="text-lg sm:text-xl font-display font-bold text-white tracking-tight">
            Ranks &amp; Hall of Fame
          </h1>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-[#94A3B8]">
            <span className="font-mono tabular-nums text-[#E2E8F0]">
              {playerAggregates.length || entries.length} survivors
            </span>
            <span aria-hidden="true">·</span>
            <span>BIP-340 Schnorr verified runs</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onRefreshRelays}
          disabled={syncing}
          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#111018] border border-white/15 hover:border-[#FF1493] disabled:opacity-50 text-xs font-semibold text-white transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 text-[#FFB6D9] ${syncing ? 'animate-spin' : ''}`}
          />
          <span>{syncing ? 'Querying…' : 'Refresh Relays'}</span>
        </button>
      </div>

      {/* Single-Row Toolbar: Segmented View Switcher + Compact Sort Select */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div
          role="tablist"
          aria-label="Leaderboard sections"
          className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#111018] border border-white/10"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'global'}
            onClick={() => setTab('global')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
              tab === 'global'
                ? 'bg-[#FF1493] text-white'
                : 'text-[#B8B8B8] hover:text-white'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>Survivors ({sortedAggregates.length})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === 'mojis'}
            onClick={() => setTab('mojis')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
              tab === 'mojis'
                ? 'bg-[#FF1493] text-white'
                : 'text-[#B8B8B8] hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Moji Hall of Fame ({mojiEntries.length})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === 'local'}
            onClick={() => setTab('local')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              tab === 'local'
                ? 'bg-[#FF1493] text-white'
                : 'text-[#B8B8B8] hover:text-white'
            }`}
          >
            My Runs ({totalMyRuns})
          </button>
        </div>

        {tab === 'global' && (
          <label className="inline-flex items-center gap-2 text-xs text-[#94A3B8]">
            <span className="hidden sm:inline font-medium">Sort:</span>
            <select
              aria-label="Sort survivor rankings"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as LeaderboardSortMode)}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#111018] border border-white/15 hover:border-white/30 text-xs font-semibold text-white focus:outline-none focus:border-[#FF1493]"
            >
              <option value="career_score">Career Score</option>
              <option value="best_score">Best Single Run</option>
              <option value="best_wave">Highest Wave</option>
              <option value="career_bosses">Career Bosses</option>
              <option value="career_defeated">Total Defeated</option>
              <option value="career_runs">Most Runs</option>
              <option value="best_defeated">Single Run Kills</option>
              <option value="best_bosses">Single Run Bosses</option>
            </select>
          </label>
        )}

        {tab === 'mojis' && (
          <label className="inline-flex items-center gap-2 text-xs text-[#94A3B8]">
            <span className="hidden sm:inline font-medium">Sort:</span>
            <select
              aria-label="Sort Moji leaderboard"
              value={mojiSortMode}
              onChange={(e) => setMojiSortMode(e.target.value as MojiSortMode)}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#111018] border border-white/15 hover:border-white/30 text-xs font-semibold text-white focus:outline-none focus:border-[#FF1493]"
            >
              <option value="slain">Most Slain</option>
              <option value="featured">Top Featured</option>
              <option value="power">Power Rating</option>
            </select>
          </label>
        )}
      </div>

      {scoreCardReceipt && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setScoreCardReceipt(null)}
        >
          <div
            className="w-full max-w-md my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <ScoreCardPanel
              receipt={scoreCardReceipt}
              profile={profiles.get(scoreCardReceipt.pubkey)}
              playerLevel={playerLevel}
              defaultAvatarUrl={defaultAvatarUrl}
              coordinator={coordinator}
              onClose={() => setScoreCardReceipt(null)}
            />
          </div>
        </div>
      )}

      {/* TAB 1: GLOBAL PLAYER RANKS */}
      {tab === 'global' && (
        <>
          {sortedAggregates.length === 0 ? (
            <div className="py-10 px-4 text-center rounded-xl bg-[#111018] border border-white/10">
              <p className="text-xs text-white font-medium">
                {syncing
                  ? 'Verifying BIP-340 run receipts and career histories across relays…'
                  : 'No verified Kind 30078 runs returned from connected relays yet.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/10 rounded-xl bg-[#111018] border border-white/10 overflow-hidden">
              {sortedAggregates.slice(0, 50).map((agg, idx) => {
                const prof = profiles.get(agg.pubkey);
                const isCurrentUser = agg.pubkey === currentPubkey;
                const displayName =
                  prof?.displayName || prof?.name || formatShortNpub(agg.pubkey);
                const isExpanded = expandedPubkey === agg.pubkey;

                const primaryMetricLabel =
                  sortMode === 'career_score'
                    ? `${agg.careerTotalScore.toLocaleString()} career pts`
                    : sortMode === 'career_defeated'
                      ? `${agg.careerTotalDefeated.toLocaleString()} total defeated`
                      : sortMode === 'career_bosses'
                        ? `${agg.careerTotalBosses.toLocaleString()} total bosses`
                        : sortMode === 'career_runs'
                          ? `${agg.careerRunCount} verified runs`
                          : sortMode === 'best_wave'
                            ? `Wave ${agg.bestWave} (${agg.bestScore.toLocaleString()} pts)`
                            : sortMode === 'best_defeated'
                              ? `${agg.bestSingleDefeated.toLocaleString()} kills (${agg.bestScore.toLocaleString()} pts)`
                              : sortMode === 'best_bosses'
                                ? `${agg.bestSingleBosses} bosses (${agg.bestScore.toLocaleString()} pts)`
                                : `${agg.bestScore.toLocaleString()} pts`;

                return (
                  <div key={agg.pubkey} className="p-3 sm:p-3.5 transition-colors hover:bg-white/[0.015]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs sm:text-sm font-mono font-bold tabular-nums text-[#FFB6D9] w-6 shrink-0">
                          #{idx + 1}
                        </span>
                        <div className="w-9 h-9 rounded-full emoji-opaque-pod p-0.5 overflow-hidden shrink-0">
                          <img
                            src={prof?.picture || defaultAvatarUrl}
                            alt={displayName}
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = defaultAvatarUrl;
                            }}
                            className="w-full h-full rounded-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs sm:text-sm font-semibold text-white truncate">
                              {displayName}
                              {isCurrentUser ? ' (You)' : ''}
                            </span>
                            {agg.progressSnapshot &&
                              (agg.progressSnapshot.rebirthCount ?? 0) > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-[#00F0FF]/15 border border-[#00F0FF]/40 text-[10px] font-mono text-[#00F0FF]">
                                  R{agg.progressSnapshot.rebirthCount}
                                </span>
                              )}
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-[#B8B8B8] flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                            <span>Best: {agg.bestScore.toLocaleString()} (W{agg.bestWave})</span>
                            <span aria-hidden="true">·</span>
                            <span>Career: {agg.careerTotalDefeated.toLocaleString()} kills</span>
                            {agg.careerTotalBosses > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-[#00F0FF]">
                                  {agg.careerTotalBosses} boss
                                </span>
                              </>
                            )}
                            <span aria-hidden="true">·</span>
                            <span className="text-[#E2E8F0]">
                              {agg.runs.length} signed run{agg.runs.length === 1 ? '' : 's'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 ml-auto shrink-0 font-mono tabular-nums">
                        <div className="text-right">
                          <div className="text-sm sm:text-base font-bold text-[#FF1493]">
                            {primaryMetricLabel}
                          </div>
                          <div className="text-[10px] text-[#94A3B8]">
                            sig:{agg.bestScoreRun.sigPrefix.slice(0, 8)}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setExpandedPubkey((prev) =>
                              prev === agg.pubkey ? null : agg.pubkey
                            )
                          }
                          className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#0B0A12] border border-white/15 hover:border-[#00F0FF] text-xs font-semibold text-white inline-flex items-center gap-1 transition-colors"
                        >
                          <History className="w-3.5 h-3.5 text-[#00F0FF]" />
                          <span className="hidden sm:inline">Run History</span>
                          <ChevronDown
                            className={`w-3.5 h-3.5 text-[#B8B8B8] transition-transform ${
                              isExpanded ? 'rotate-180 text-[#FF1493]' : ''
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Expanded Drawer: Clean Hairline Career Summary + Chronological Run History (No Nested Cards) */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-white/10 space-y-2.5">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono tabular-nums text-[#CBD5E1]">
                          <span>
                            Career{' '}
                            <strong className="text-[#FF1493]">
                              {agg.careerTotalScore.toLocaleString()}
                            </strong>{' '}
                            pts
                          </span>
                          <span>
                            Best{' '}
                            <strong className="text-white">
                              {agg.bestScore.toLocaleString()}
                            </strong>{' '}
                            (W{agg.bestWave})
                          </span>
                          <span>
                            Defeated{' '}
                            <strong className="text-[#FFB6D9]">
                              {agg.careerTotalDefeated.toLocaleString()}
                            </strong>
                          </span>
                          <span>
                            Bosses{' '}
                            <strong className="text-[#00F0FF]">
                              {agg.careerTotalBosses.toLocaleString()}
                            </strong>
                          </span>
                          <span className="text-[#94A3B8] ml-auto">
                            {agg.runs.length} signed run{agg.runs.length === 1 ? '' : 's'} · kind:30078
                          </span>
                        </div>

                        <div className="divide-y divide-white/10 max-h-64 overflow-y-auto border-t border-white/10">
                            {agg.runs.map((runItem, rIdx) => {
                              const showRaw = inspectedEventId === runItem.eventId;
                              return (
                                <div key={runItem.eventId} className="py-2 space-y-1.5">
                                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="text-[#94A3B8]">#{rIdx + 1}</span>
                                      <span className="font-bold text-[#FF1493]">
                                        {runItem.score.toLocaleString()} pts
                                      </span>
                                      <span className="text-white">W{runItem.wave}</span>
                                      <span className="text-[#B8B8B8]">
                                        {runItem.defeated} kills
                                      </span>
                                      {runItem.bosses > 0 && (
                                        <span className="text-[#00F0FF]">
                                          {runItem.bosses} boss
                                        </span>
                                      )}
                                      <span className="text-[11px] text-[#64748B]">
                                        {new Date(runItem.createdAt * 1000).toLocaleDateString()}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setScoreCardReceipt(
                                            remoteEntryToReceiptRecord(runItem)
                                          )
                                        }
                                        className="px-2 py-0.5 rounded bg-[#161622] border border-white/15 hover:border-[#00F0FF] text-[11px] text-white inline-flex items-center gap-1"
                                      >
                                        <Share2 className="w-3 h-3 text-[#00F0FF]" />
                                        <span>Receipt</span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() =>
                                          setInspectedEventId(
                                            showRaw ? null : runItem.eventId
                                          )
                                        }
                                        className="text-[11px] text-[#00F0FF] hover:underline inline-flex items-center gap-1"
                                      >
                                        <Code2 className="w-3 h-3" />
                                        <span>sig:{runItem.sigPrefix.slice(0, 8)}</span>
                                      </button>

                                      {isCurrentUser && (
                                        <button
                                          type="button"
                                          disabled={busyKey === runItem.eventId}
                                          onClick={() =>
                                            void handleDeleteClick(runItem.eventId, {
                                              eventId: runItem.eventId,
                                              dTag: runItem.dTag,
                                              pubkey: runItem.pubkey,
                                              wasBroadcast: true,
                                            })
                                          }
                                          className="text-[11px] text-rose-400 hover:underline inline-flex items-center gap-1"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                          <span>Delete</span>
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {showRaw && (
                                    <pre className="p-2 rounded bg-[#08080C] border border-white/10 text-[10px] font-mono text-[#CBD5E1] overflow-x-auto max-h-40">
                                      {JSON.stringify(runItem.rawEvent, null, 2)}
                                    </pre>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* TAB 2: MOJI HALL OF FAME WITH COLLECTIBLE RARITY CARDS */}
      {tab === 'mojis' && (
        <div className="space-y-3">
          <div className="px-3.5 py-2.5 rounded-xl bg-[#111018] border border-white/10 text-xs text-[#94A3B8]">
            Collectible Nostr emoji cards ranked by Arena takedowns, top-run features, and SHA-256 power rating.{' '}
            <span className="text-white font-semibold">
              Mythic cards shimmer with Prismatic Rainbow foil &amp; Chrome Silver sparkles.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {mojiEntries.slice(0, 48).map((item, idx) => (
              <MojiRarityCard key={item.emojiKey} item={item} rank={idx + 1} />
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: MY RUNS */}
      {tab === 'local' &&
        (totalMyRuns === 0 ? (
          <div className="py-10 px-4 text-center rounded-xl bg-[#111018] border border-white/10">
            <p className="text-xs text-[#B8B8B8]">
              No run receipts recorded yet. Finish an Arena run to generate a receipt and shareable score card.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/10 rounded-xl bg-[#111018] border border-white/10">
            {combinedMyRuns.localReceipts.map((rec) => {
              const isBusy = busyKey === rec.localId;
              const wasBroadcast =
                rec.status === 'confirmed' || rec.acceptedRelays.length > 0;
              const showNip55Drawer = nip55DrawerId === rec.localId;

              return (
                <div key={rec.localId} className="p-3 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5 font-mono tabular-nums text-xs">
                        <span className="font-bold text-[#FF1493]">
                          {rec.score.toLocaleString()} pts
                        </span>
                        <span aria-hidden="true" className="text-[#5E5E5E]">
                          ·
                        </span>
                        <span className="text-white">W{rec.wave}</span>
                        {rec.realmId && (
                          <>
                            <span aria-hidden="true" className="text-[#5E5E5E]">
                              ·
                            </span>
                            <span className="text-[#00F0FF]">
                              {getRealmSpec(rec.realmId).shortName}
                            </span>
                          </>
                        )}
                        <span aria-hidden="true" className="text-[#5E5E5E]">
                          ·
                        </span>
                        <span className="text-[#B8B8B8]">{rec.defeated} kills</span>
                        <span aria-hidden="true" className="text-[#5E5E5E]">
                          ·
                        </span>
                        <span className="text-[#E2E8F0]">+{rec.mojoEarned} Mojo</span>
                      </div>

                      <div className="text-[11px] font-mono tabular-nums text-[#B8B8B8] truncate">
                        {rec.status === 'confirmed' &&
                          `Confirmed · ${rec.acceptedRelays.length}/${relayCount} relays`}
                        {rec.status === 'signed_local' &&
                          'Signed locally · Not yet confirmed by relays'}
                        {rec.status === 'queued_offline' &&
                          'Signed · Queued offline for auto-retry'}
                        {rec.status === 'unsigned_local' && 'Unsigned local run'}
                        {rec.status === 'signing' && 'Awaiting signer…'}
                        {rec.status === 'publishing' && 'Broadcasting to relays…'}
                        {rec.status === 'rejected' && 'Rejected by relay / signer check'}
                        {rec.status === 'failed' &&
                          (rec.signedEvent
                            ? 'Signed · Relay broadcast incomplete (retryable)'
                            : 'Signature incomplete')}
                      </div>

                      {rec.lastError && (
                        <p className="text-[11px] text-amber-300 break-words">
                          {rec.lastError}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setScoreCardReceipt(rec)}
                        className="min-h-[36px] px-2.5 py-1 rounded-lg bg-black border border-white/15 hover:border-[#00F0FF] text-xs font-medium text-white transition-colors inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <Share2 className="w-3.5 h-3.5 text-[#00F0FF]" />
                        <span className="hidden sm:inline">Card</span>
                      </button>

                      {rec.status !== 'confirmed' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleBroadcastClick(rec)}
                          className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] disabled:opacity-50 text-xs font-semibold text-white transition-colors flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <Send className="w-3 h-3" />
                          <span>
                            {isBusy
                              ? 'Working…'
                              : rec.signedEvent
                                ? 'Retry'
                                : coordinator.signerMode === 'nip55'
                                  ? 'Amber Sign'
                                  : 'Sign'}
                          </span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isBusy}
                        aria-label="Delete run receipt"
                        onClick={() =>
                          void handleDeleteClick(rec.localId, {
                            localId: rec.localId,
                            eventId: rec.signedEvent?.id,
                            dTag: rec.dTag,
                            pubkey: rec.pubkey,
                            wasBroadcast,
                          })
                        }
                        className="min-h-[36px] px-2.5 py-1 rounded-lg bg-black border border-white/15 hover:border-rose-400 hover:text-rose-400 disabled:opacity-50 text-xs font-medium text-[#B8B8B8] transition-colors inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Delete</span>
                      </button>
                    </div>
                  </div>

                  {showNip55Drawer && coordinator.signerMode === 'nip55' && (
                    <div className="p-2.5 rounded-lg bg-black border border-white/15 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-[#B8B8B8]">
                          Authorize exact run <code className="text-white">{rec.dTag}</code> in Amber:
                        </span>
                        <button
                          type="button"
                          onClick={() => handleLaunchNip55Sign(rec)}
                          className="min-h-[34px] px-3 py-1 rounded-md bg-[#FF1493] text-xs font-semibold text-white inline-flex items-center gap-1.5"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Open Amber (nostrsigner:)</span>
                        </button>
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={nip55PasteInput}
                          onChange={(e) => setNip55PasteInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void handleApplyNip55Paste(rec);
                            }
                          }}
                          placeholder='Paste signed {"id":...,"sig":...} or 128-hex sig'
                          className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md bg-[#111111] border border-white/15 text-xs font-mono text-white"
                        />
                        <button
                          type="button"
                          disabled={!nip55PasteInput.trim() || isBusy}
                          onClick={() => void handleApplyNip55Paste(rec)}
                          className="min-h-[34px] px-3 py-1.5 rounded-md bg-[#1A1A1A] border border-white/20 text-xs font-semibold text-white whitespace-nowrap"
                        >
                          Verify &amp; Send
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {combinedMyRuns.remoteOnly.map((remote) => {
              const isBusy = busyKey === remote.eventId;
              return (
                <div
                  key={remote.eventId}
                  className="p-3 flex items-center justify-between gap-2.5"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-1.5 font-mono tabular-nums text-xs">
                      <span className="font-bold text-[#FF1493]">
                        {remote.score.toLocaleString()} pts
                      </span>
                      <span aria-hidden="true" className="text-[#5E5E5E]">
                        ·
                      </span>
                      <span className="text-white">W{remote.wave}</span>
                      {remote.realmId && (
                        <>
                          <span aria-hidden="true" className="text-[#5E5E5E]">
                            ·
                          </span>
                          <span className="text-[#00F0FF]">
                            {getRealmSpec(remote.realmId).shortName}
                          </span>
                        </>
                      )}
                      <span aria-hidden="true" className="text-[#5E5E5E]">
                        ·
                      </span>
                      <span className="text-[#B8B8B8]">{remote.defeated} kills</span>
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-[#00F0FF] truncate">
                      Confirmed relay receipt · sig:{remote.sigPrefix}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setScoreCardReceipt(remoteEntryToReceiptRecord(remote))}
                      className="min-h-[36px] px-2.5 py-1 rounded-lg bg-black border border-white/15 hover:border-[#00F0FF] text-xs font-medium text-white transition-colors inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <Share2 className="w-3.5 h-3.5 text-[#00F0FF]" />
                      <span className="hidden sm:inline">Card</span>
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      aria-label="Delete relay run receipt"
                      onClick={() =>
                        void handleDeleteClick(remote.eventId, {
                          eventId: remote.eventId,
                          dTag: remote.dTag,
                          pubkey: remote.pubkey,
                          wasBroadcast: true,
                        })
                      }
                      className="min-h-[36px] px-2.5 py-1 rounded-lg bg-black border border-white/15 hover:border-rose-400 hover:text-rose-400 disabled:opacity-50 text-xs font-medium text-[#B8B8B8] transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isBusy ? 'Deleting…' : 'Delete'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
    </section>
  );
};
