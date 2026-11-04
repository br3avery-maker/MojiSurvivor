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
    <section className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-8 border-b border-white/10">
        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">
            Global Relay Leaderboard
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums text-[#B8B8B8] mt-2">
            <span>Kind 30078 (#t=mojisurvivor)</span>
            <span aria-hidden="true">·</span>
            <span>BIP-340 Schnorr verified</span>
            <span aria-hidden="true">·</span>
            <span>{entries.length} verified relay runs</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onRefreshRelays}
          disabled={syncing}
          className="min-h-[42px] px-4 py-2 rounded-lg bg-[#111111] border border-white/15 hover:border-[#FF1493] disabled:opacity-50 text-xs font-semibold text-white transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 self-start md:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          <span>{syncing ? 'Querying Relays…' : 'Query Relays'}</span>
        </button>
      </div>

      {/* Interactive View Switcher */}
      <div className="mt-6 inline-flex items-center gap-1 p-1 rounded-lg bg-[#111111] border border-white/10">
        <button
          type="button"
          onClick={() => setTab('global')}
          className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
            tab === 'global' ? 'bg-[#FF1493] text-white' : 'text-[#B8B8B8] hover:text-white'
          }`}
        >
          Global Verified Runs ({entries.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('local')}
          className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
            tab === 'local' ? 'bg-[#FF1493] text-white' : 'text-[#B8B8B8] hover:text-white'
          }`}
        >
          My Run Receipts & Queue ({localReceipts.length})
        </button>
      </div>

      {tab === 'global' ? (
        entries.length === 0 ? (
          <div className="mt-8 py-14 px-6 text-center rounded-xl bg-[#111111] border border-white/10">
            <p className="text-sm text-white font-medium">
              {syncing
                ? 'Verifying BIP-340 run receipts across Nostr relays…'
                : 'No verified Kind 30078 MojiSurvivor runs returned from connected relays yet.'}
            </p>
            <p className="text-xs text-[#B8B8B8] mt-1.5 max-w-md mx-auto">
              Complete an Arena run and broadcast your signed receipt to stake the top spot on your configured relays.
            </p>
          </div>
        ) : (
          <div className="mt-8 overflow-x-auto border border-white/10 rounded-xl bg-[#111111]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-xs text-[#B8B8B8] font-medium">
                  <th className="py-3.5 px-4">Rank</th>
                  <th className="py-3.5 px-4">Player (Kind 0 / npub)</th>
                  <th className="py-3.5 px-4 text-right">Score</th>
                  <th className="py-3.5 px-4 text-right">Wave</th>
                  <th className="py-3.5 px-4 text-right">Defeated</th>
                  <th className="py-3.5 px-4">Schnorr Proof</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-sm font-mono tabular-nums">
                {entries.slice(0, 50).map((entry, idx) => {
                  const prof = profiles.get(entry.pubkey);
                  const isCurrentUser = entry.pubkey === currentPubkey;
                  const displayName =
                    prof?.displayName || prof?.name || formatShortNpub(entry.pubkey);
                  const isExpanded = inspectedEventId === entry.eventId;

                  return (
                    <React.Fragment key={entry.eventId}>
                      <tr className="hover:bg-white/[0.02]">
                        <td className="py-3.5 px-4 text-[#B8B8B8]">#{idx + 1}</td>
                        <td className="py-3.5 px-4 font-sans">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-black border border-white/15 overflow-hidden shrink-0">
                              <img
                                src={prof?.picture || defaultAvatarUrl}
                                alt={`${displayName} avatar`}
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).src = defaultAvatarUrl;
                                }}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-white truncate">
                                {displayName}
                                {isCurrentUser ? ' (You)' : ''}
                              </div>
                              <div className="text-xs font-mono text-[#B8B8B8] truncate">
                                {prof?.nip05 || formatShortNpub(entry.pubkey)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-semibold text-[#FF1493]">
                          {entry.score.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-right text-white">{entry.wave}</td>
                        <td className="py-3.5 px-4 text-right text-[#B8B8B8]">
                          {entry.defeated}
                        </td>
                        <td className="py-3.5 px-4">
                          <button
                            type="button"
                            onClick={() =>
                              setInspectedEventId(isExpanded ? null : entry.eventId)
                            }
                            className="text-xs text-[#B8B8B8] hover:text-white inline-flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <Code2 className="w-3.5 h-3.5 text-[#00F0FF]" />
                            <span>sig:{entry.sigPrefix}…</span>
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-black/70">
                          <td colSpan={6} className="p-4">
                            <div className="text-xs text-[#B8B8B8] mb-2">
                              Verified BIP-340 Nostr Event ({entry.eventId})
                            </div>
                            <pre className="text-[11px] text-[#B8B8B8] overflow-x-auto max-h-48">
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
        )
      ) : localReceipts.length === 0 ? (
        <div className="mt-8 py-14 px-6 text-center rounded-xl bg-[#111111] border border-white/10">
          <p className="text-sm text-[#B8B8B8]">
            No local run receipts recorded yet. Finish an Arena run to generate a receipt.
          </p>
        </div>
      ) : (
        <div className="mt-8 divide-y divide-white/10 border-y border-white/10">
          {localReceipts.map((rec) => {
            const isBusy = busyReceiptId === rec.localId;
            return (
              <div
                key={rec.localId}
                className="py-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums text-sm">
                    <span className="font-bold text-[#FF1493]">
                      {rec.score.toLocaleString()} pts
                    </span>
                    <span aria-hidden="true" className="text-[#5E5E5E]">
                      ·
                    </span>
                    <span className="text-white">Wave {rec.wave}</span>
                    <span aria-hidden="true" className="text-[#5E5E5E]">
                      ·
                    </span>
                    <span className="text-[#B8B8B8]">{rec.defeated} defeated</span>
                    <span aria-hidden="true" className="text-[#5E5E5E]">
                      ·
                    </span>
                    <span className="text-[#FF9900]">+{rec.mojoEarned} Mojo</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums text-[#B8B8B8]">
                    <span>
                      {rec.status === 'confirmed' &&
                        `Confirmed by ${rec.acceptedRelays.length}/${relayCount} relays`}
                      {rec.status === 'queued_offline' &&
                        'Signed locally · Queued for relay broadcast'}
                      {rec.status === 'unsigned_local' && 'Unsigned local run'}
                      {rec.status === 'signing' && 'Signing…'}
                      {rec.status === 'publishing' && 'Broadcasting…'}
                      {rec.status === 'failed' &&
                        (rec.signedEvent
                          ? 'Signed locally · Relay confirmation pending'
                          : 'Signature pending')}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{new Date(rec.createdAt * 1000).toLocaleString()}</span>
                  </div>

                  {rec.lastError && (
                    <p className="text-xs text-amber-300 pt-0.5">{rec.lastError}</p>
                  )}
                </div>

                {rec.status !== 'confirmed' && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleBroadcastClick(rec)}
                    className="min-h-[40px] px-4 py-2 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] disabled:opacity-50 text-xs font-semibold text-white transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 self-start md:self-auto"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      {isBusy
                        ? 'Broadcasting…'
                        : rec.signedEvent
                          ? 'Retry Broadcast'
                          : 'Sign & Broadcast'}
                    </span>
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
