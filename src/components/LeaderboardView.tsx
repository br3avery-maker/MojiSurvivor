import React, { useState } from 'react';
import { RefreshCw, Send, Code2 } from 'lucide-react';
import {
  formatShortNpub,
  type NostrProfileMeta,
  type VerifiedLeaderboardEntry,
} from '../lib/nostrEngine';
import type { RunReceiptRecord } from '../lib/storage';

interface LeaderboardViewProps {
  entries: VerifiedLeaderboardEntry[];
  profiles: Map<string, NostrProfileMeta>;
  localReceipts: RunReceiptRecord[];
  currentPubkey: string;
  defaultAvatarUrl: string;
  relayCount: number;
  syncing: boolean;
  onRefreshRelays: () => void;
  onBroadcastLocalReceipt: (receipt: RunReceiptRecord) => Promise<void>;
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  entries,
  profiles,
  localReceipts,
  currentPubkey,
  defaultAvatarUrl,
  relayCount,
  syncing,
  onRefreshRelays,
  onBroadcastLocalReceipt,
}) => {
  const [tab, setTab] = useState<'global' | 'local'>('global');
  const [inspectedEventId, setInspectedEventId] = useState<string | null>(null);
  const [busyReceiptId, setBusyReceiptId] = useState<string | null>(null);

  const handleBroadcastClick = async (rec: RunReceiptRecord) => {
    setBusyReceiptId(rec.localId);
    try {
      await onBroadcastLocalReceipt(rec);
    } finally {
      setBusyReceiptId(null);
    }
  };

  return (
    <section className="max-w-5xl mx-auto px-4 py-3.5 space-y-3">
      {/* Compact Header */}
      <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-white/10">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-display font-bold text-white tracking-tight truncate">
            Relay Leaderboard
          </h1>
          <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-[#B8B8B8]">
            <span>Kind 30078</span>
            <span aria-hidden="true">·</span>
            <span>BIP-340 verified ({entries.length})</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onRefreshRelays}
          disabled={syncing}
          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#111111] border border-white/15 hover:border-[#FF1493] disabled:opacity-50 text-xs font-semibold text-white transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          <span>{syncing ? 'Querying…' : 'Refresh'}</span>
        </button>
      </div>

      {/* Compact Segmented View Switch */}
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
          My Receipts ({localReceipts.length})
        </button>
      </div>

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
            {/* Mobile Zero-Overflow Compact List */}
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
                      <pre className="mt-2.5 p-2 rounded bg-black text-[10px] font-mono text-[#B8B8B8] overflow-x-auto max-h-40">
                        {JSON.stringify(entry.rawEvent, null, 2)}
                      </pre>
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
                    <th className="py-2.5 px-3.5 text-right">Score</th>
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
                            <td colSpan={6} className="p-3">
                              <pre className="text-[11px] text-[#B8B8B8] overflow-x-auto max-h-44">
                                {JSON.stringify(entry.rawEvent, null, 2)}
                              </pre>
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
      ) : localReceipts.length === 0 ? (
        <div className="py-10 px-4 text-center rounded-xl bg-[#111111] border border-white/10">
          <p className="text-xs text-[#B8B8B8]">
            No local run receipts recorded yet. Finish an Arena run to generate a receipt.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-white/10 rounded-xl bg-[#111111] border border-white/10">
          {localReceipts.map((rec) => {
            const isBusy = busyReceiptId === rec.localId;
            return (
              <div
                key={rec.localId}
                className="p-3 flex items-center justify-between gap-3"
              >
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
                    <span className="text-[#FF9900]">+{rec.mojoEarned} Mojo</span>
                  </div>

                  <div className="text-[11px] font-mono tabular-nums text-[#B8B8B8] truncate">
                    {rec.status === 'confirmed' &&
                      `Confirmed · ${rec.acceptedRelays.length}/${relayCount} relays`}
                    {rec.status === 'queued_offline' && 'Signed · Queued offline'}
                    {rec.status === 'unsigned_local' && 'Unsigned local run'}
                    {rec.status === 'signing' && 'Signing…'}
                    {rec.status === 'publishing' && 'Broadcasting…'}
                    {rec.status === 'failed' &&
                      (rec.signedEvent ? 'Signed · Pending relay OK' : 'Signature pending')}
                  </div>

                  {rec.lastError && (
                    <p className="text-[11px] text-amber-300 truncate">{rec.lastError}</p>
                  )}
                </div>

                {rec.status !== 'confirmed' && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleBroadcastClick(rec)}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] disabled:opacity-50 text-xs font-semibold text-white transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Send className="w-3 h-3" />
                    <span>{isBusy ? 'Sending…' : rec.signedEvent ? 'Retry' : 'Sign'}</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
