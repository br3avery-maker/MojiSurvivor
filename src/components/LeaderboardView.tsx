import React, { useMemo, useState } from 'react';
import { RefreshCw, Send, Code2, Trash2, Share2, ExternalLink } from 'lucide-react';
import {
  formatShortNpub,
  type MojiNostrCoordinator,
  type NostrProfileMeta,
  type VerifiedLeaderboardEntry,
} from '../lib/nostrEngine';
import type { RunReceiptRecord } from '../lib/storage';
import { ScoreCardPanel } from './ScoreCardPanel';

interface LeaderboardViewProps {
  coordinator: MojiNostrCoordinator;
  entries: VerifiedLeaderboardEntry[];
  myRelayRuns: VerifiedLeaderboardEntry[];
  profiles: Map<string, NostrProfileMeta>;
  localReceipts: RunReceiptRecord[];
  currentPubkey: string;
  playerLevel: number;
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
  const [tab, setTab] = useState<'global' | 'local'>('global');
  const [inspectedEventId, setInspectedEventId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [scoreCardReceipt, setScoreCardReceipt] = useState<RunReceiptRecord | null>(null);
  const [nip55DrawerId, setNip55DrawerId] = useState<string | null>(null);
  const [nip55PasteInput, setNip55PasteInput] = useState('');

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
    <section className="max-w-5xl mx-auto px-4 py-3.5 space-y-3">
      {/* Header & Honest Cryptographic Verification Notice */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-2.5 border-b border-white/10">
        <div className="min-w-0 space-y-0.5">
          <h1 className="text-lg sm:text-xl font-display font-bold text-white tracking-tight">
            Relay Leaderboard
          </h1>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-[#B8B8B8]">
            <span>Personal best per pubkey</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{entries.length} ranked</span>
            <span aria-hidden="true">·</span>
            <span>BIP-340 Schnorr verified authorship (relay-attested, not server anti-cheat)</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onRefreshRelays}
          disabled={syncing}
          className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#111111] border border-white/15 hover:border-[#FF1493] disabled:opacity-50 text-xs font-semibold text-white transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          <span>{syncing ? 'Querying…' : 'Refresh'}</span>
        </button>
      </div>

      {/* Segmented View Switch */}
      <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#111111] border border-white/10">
        <button
          type="button"
          onClick={() => setTab('global')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
            tab === 'global' ? 'bg-[#FF1493] text-white' : 'text-[#B8B8B8] hover:text-white'
          }`}
        >
          Global Verified ({entries.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('local')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
            tab === 'local' ? 'bg-[#FF1493] text-white' : 'text-[#B8B8B8] hover:text-white'
          }`}
        >
          My Receipts ({totalMyRuns})
        </button>
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

      {tab === 'global' ? (
        entries.length === 0 ? (
          <div className="py-10 px-4 text-center rounded-xl bg-[#111111] border border-white/10">
            <p className="text-xs text-white font-medium">
              {syncing
                ? 'Verifying BIP-340 run receipts across relays…'
                : 'No verified Kind 30078 runs returned from connected relays yet.'}
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Compact List */}
            <div className="md:hidden divide-y divide-white/10 rounded-xl bg-[#111111] border border-white/10 overflow-hidden">
              {entries.slice(0, 50).map((entry, idx) => {
                const prof = profiles.get(entry.pubkey);
                const isCurrentUser = entry.pubkey === currentPubkey;
                const displayName =
                  prof?.displayName || prof?.name || formatShortNpub(entry.pubkey);
                const isExpanded = inspectedEventId === entry.eventId;

                return (
                  <div key={entry.eventId} className="p-3">
                    <div className="flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-xs font-mono tabular-nums text-[#B8B8B8] w-5 shrink-0">
                          #{idx + 1}
                        </span>
                        <div className="w-8 h-8 rounded-full bg-black border border-white/15 overflow-hidden shrink-0">
                          <img
                            src={prof?.picture || defaultAvatarUrl}
                            alt={displayName}
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = defaultAvatarUrl;
                            }}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate">
                            {displayName}
                            {isCurrentUser ? ' (You)' : ''}
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-[#B8B8B8] flex items-center gap-1.5">
                            <span>Wave {entry.wave}</span>
                            <span aria-hidden="true">·</span>
                            <span>{entry.defeated} kills</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right font-mono tabular-nums shrink-0">
                        <div className="text-sm font-bold text-[#FF1493]">
                          {entry.score.toLocaleString()}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setInspectedEventId(isExpanded ? null : entry.eventId)
                          }
                          className="text-[10px] text-[#00F0FF] hover:underline inline-flex items-center gap-1"
                        >
                          <span>sig:{entry.sigPrefix.slice(0, 8)}</span>
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-2.5 space-y-2">
                        <pre className="p-2 rounded bg-black text-[10px] font-mono text-[#B8B8B8] overflow-x-auto max-h-40">
                          {JSON.stringify(entry.rawEvent, null, 2)}
                        </pre>
                        {isCurrentUser && (
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setScoreCardReceipt(remoteEntryToReceiptRecord(entry))
                              }
                              className="min-h-[34px] px-2.5 py-1 rounded-md bg-black border border-white/20 text-[11px] font-semibold text-white inline-flex items-center gap-1.5"
                            >
                              <Share2 className="w-3 h-3 text-[#00F0FF]" />
                              <span>Score Card</span>
                            </button>
                            <button
                              type="button"
                              disabled={busyKey === entry.eventId}
                              onClick={() =>
                                void handleDeleteClick(entry.eventId, {
                                  eventId: entry.eventId,
                                  dTag: entry.dTag,
                                  pubkey: entry.pubkey,
                                  wasBroadcast: true,
                                })
                              }
                              className="min-h-[34px] px-2.5 py-1 rounded-md bg-black border border-rose-500/40 hover:border-rose-400 text-[11px] font-semibold text-rose-400 inline-flex items-center gap-1.5"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>
                                {busyKey === entry.eventId
                                  ? 'Deleting…'
                                  : 'Delete Run (NIP-09)'}
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop Full Table */}
            <div className="hidden md:block overflow-x-auto border border-white/10 rounded-xl bg-[#111111]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-xs text-[#B8B8B8] font-medium">
                    <th className="py-2.5 px-3.5">Rank</th>
                    <th className="py-2.5 px-3.5">Player</th>
                    <th className="py-2.5 px-3.5 text-right">Best Score</th>
                    <th className="py-2.5 px-3.5 text-right">Wave</th>
                    <th className="py-2.5 px-3.5 text-right">Defeated</th>
                    <th className="py-2.5 px-3.5">Schnorr Proof</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 text-xs font-mono tabular-nums">
                  {entries.slice(0, 50).map((entry, idx) => {
                    const prof = profiles.get(entry.pubkey);
                    const isCurrentUser = entry.pubkey === currentPubkey;
                    const displayName =
                      prof?.displayName || prof?.name || formatShortNpub(entry.pubkey);
                    const isExpanded = inspectedEventId === entry.eventId;

                    return (
                      <React.Fragment key={entry.eventId}>
                        <tr className="hover:bg-white/[0.02]">
                          <td className="py-2.5 px-3.5 text-[#B8B8B8]">#{idx + 1}</td>
                          <td className="py-2.5 px-3.5 font-sans">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-black border border-white/15 overflow-hidden shrink-0">
                                <img
                                  src={prof?.picture || defaultAvatarUrl}
                                  alt={displayName}
                                  referrerPolicy="no-referrer"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).src = defaultAvatarUrl;
                                  }}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-white truncate">
                                  {displayName}
                                  {isCurrentUser ? ' (You)' : ''}
                                </div>
                                <div className="text-[11px] font-mono text-[#B8B8B8] truncate">
                                  {prof?.nip05 || formatShortNpub(entry.pubkey)}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3.5 text-right text-sm font-semibold text-[#FF1493]">
                            {entry.score.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3.5 text-right text-white">{entry.wave}</td>
                          <td className="py-2.5 px-3.5 text-right text-[#B8B8B8]">
                            {entry.defeated}
                          </td>
                          <td className="py-2.5 px-3.5">
                            <button
                              type="button"
                              onClick={() =>
                                setInspectedEventId(isExpanded ? null : entry.eventId)
                              }
                              className="text-xs text-[#B8B8B8] hover:text-white inline-flex items-center gap-1 whitespace-nowrap"
                            >
                              <Code2 className="w-3.5 h-3.5 text-[#00F0FF]" />
                              <span>sig:{entry.sigPrefix}…</span>
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-black/70">
                            <td colSpan={6} className="p-3 space-y-2">
                              <pre className="text-[11px] text-[#B8B8B8] overflow-x-auto max-h-44">
                                {JSON.stringify(entry.rawEvent, null, 2)}
                              </pre>
                              {isCurrentUser && (
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setScoreCardReceipt(remoteEntryToReceiptRecord(entry))
                                    }
                                    className="min-h-[34px] px-2.5 py-1 rounded-md bg-black border border-white/20 text-[11px] font-semibold text-white inline-flex items-center gap-1.5"
                                  >
                                    <Share2 className="w-3 h-3 text-[#00F0FF]" />
                                    <span>Score Card</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busyKey === entry.eventId}
                                    onClick={() =>
                                      void handleDeleteClick(entry.eventId, {
                                        eventId: entry.eventId,
                                        dTag: entry.dTag,
                                        pubkey: entry.pubkey,
                                        wasBroadcast: true,
                                      })
                                    }
                                    className="min-h-[34px] px-2.5 py-1 rounded-md bg-black border border-rose-500/40 hover:border-rose-400 text-[11px] font-semibold text-rose-400 inline-flex items-center gap-1.5"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    <span>
                                      {busyKey === entry.eventId
                                        ? 'Deleting…'
                                        : 'Delete Run (NIP-09)'}
                                    </span>
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )
      ) : totalMyRuns === 0 ? (
        <div className="py-10 px-4 text-center rounded-xl bg-[#111111] border border-white/10">
          <p className="text-xs text-[#B8B8B8]">
            No run receipts recorded yet. Finish an Arena run to generate a receipt and shareable score card.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-white/10 rounded-xl bg-[#111111] border border-white/10">
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
                      <span aria-hidden="true" className="text-[#5E5E5E]">
                        ·
                      </span>
                      <span className="text-[#B8B8B8]">{rec.defeated} kills</span>
                      <span aria-hidden="true" className="text-[#5E5E5E]">
                        ·
                      </span>
                      <span className="text-[#FFD700]">+{rec.mojoEarned} Mojo</span>
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
                      <p className="text-[11px] text-amber-300 break-words">{rec.lastError}</p>
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
                        placeholder='Paste signed {"id":...,"sig":...} or 128-hex sig'
                        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md bg-[#111111] border border-white/15 text-xs font-mono text-white"
                      />
                      <button
                        type="button"
                        disabled={!nip55PasteInput.trim() || isBusy}
                        onClick={() => void handleApplyNip55Paste(rec)}
                        className="min-h-[34px] px-3 py-1.5 rounded-md bg-[#1A1A1A] border border-white/20 text-xs font-semibold text-white whitespace-nowrap"
                      >
                        Verify & Send
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
      )}
    </section>
  );
};
