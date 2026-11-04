import React, { useMemo, useState } from 'react';
import { RefreshCw, ImageOff, Lock } from 'lucide-react';
import type { EmojiCombatTrait } from '../lib/cryptoStats';
import { formatShortNpub, type ImageLoadStatus } from '../lib/nostrEngine';
import type { CodexKillRecord } from '../lib/storage';

type CodexFilter = 'all' | 'discovered' | 'undiscovered' | 'nip30' | 'reserve';

interface CodexViewProps {
  emojis: EmojiCombatTrait[];
  codexRecords: Record<string, CodexKillRecord>;
  imageStatuses: Map<string, ImageLoadStatus>;
  syncing: boolean;
  onSyncNip30: () => void;
}

export const CodexView: React.FC<CodexViewProps> = ({
  emojis,
  codexRecords,
  imageStatuses,
  syncing,
  onSyncNip30,
}) => {
  const [filter, setFilter] = useState<CodexFilter>('all');

  const discoveredCount = useMemo(
    () => emojis.filter((e) => Boolean(codexRecords[e.shortcode]?.kills)).length,
    [emojis, codexRecords]
  );

  const liveNip30Count = useMemo(
    () => emojis.filter((e) => e.source === 'nip30').length,
    [emojis]
  );

  const filtered = useMemo(() => {
    return emojis
      .filter((item) => {
        const unlocked = Boolean(codexRecords[item.shortcode]?.kills);
        if (filter === 'discovered') return unlocked;
        if (filter === 'undiscovered') return !unlocked;
        if (filter === 'nip30') return item.source === 'nip30';
        if (filter === 'reserve') return item.source === 'reserve';
        return true;
      })
      .sort((a, b) => {
        const ka = codexRecords[a.shortcode]?.kills ?? 0;
        const kb = codexRecords[b.shortcode]?.kills ?? 0;
        if ((ka > 0) !== (kb > 0)) return kb > 0 ? 1 : -1;
        return b.powerRating - a.powerRating;
      });
  }, [emojis, codexRecords, filter]);

  return (
    <section className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-8 border-b border-white/10">
        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">
            Emoji Bestiary & NIP-30 Codex
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums text-[#B8B8B8] mt-2">
            <span>
              Discovered {discoveredCount} / {emojis.length}
            </span>
            <span aria-hidden="true">·</span>
            <span>Live NIP-30 Relay Emojis {liveNip30Count}</span>
            <span aria-hidden="true">·</span>
            <span>Defeat an emoji in combat to reveal its SHA-256 traits</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onSyncNip30}
          disabled={syncing}
          className="min-h-[42px] px-4 py-2 rounded-lg bg-[#111111] border border-white/15 hover:border-[#FF1493] disabled:opacity-50 text-xs font-semibold text-white transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 self-start md:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          <span>{syncing ? 'Querying Kind 30030…' : 'Sync NIP-30 Packs'}</span>
        </button>
      </div>

      {/* Interactive Filter Segmented Control */}
      <div className="mt-6 inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#111111] border border-white/10">
        {(
          [
            ['all', `All (${emojis.length})`],
            ['discovered', `Discovered (${discoveredCount})`],
            ['undiscovered', `Undiscovered (${emojis.length - discoveredCount})`],
            ['nip30', `Live NIP-30 (${liveNip30Count})`],
            ['reserve', 'Reserve Pool'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              filter === key
                ? 'bg-[#FF1493] text-white'
                : 'text-[#B8B8B8] hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-10 py-14 text-center rounded-xl bg-[#111111] border border-white/10">
          <p className="text-sm text-[#B8B8B8]">
            No emojis match this filter yet. Enter the Arena to defeat and unlock NIP-30 emojis.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((emoji) => {
            const record = codexRecords[emoji.shortcode];
            const isUnlocked = Boolean(record && record.kills > 0);
            const imgStatus = imageStatuses.get(emoji.url);
            const isBroken = imgStatus === 'broken';

            return (
              <article
                key={emoji.shortcode}
                className="rounded-xl bg-[#111111] border border-white/10 p-5 flex flex-col justify-between gap-4"
              >
                <div className="flex items-start gap-4">
                  {/* Emoji Visual Slot with Explicit Broken Media State */}
                  <div className="w-14 h-14 rounded-lg bg-black border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                    {isBroken ? (
                      <div
                        className="flex flex-col items-center justify-center text-[#5E5E5E]"
                        title="Relay media URL unreachable"
                      >
                        <ImageOff className="w-5 h-5" />
                      </div>
                    ) : (
                      <img
                        src={emoji.url}
                        alt={`:${emoji.shortcode}: custom Nostr emoji`}
                        referrerPolicy="no-referrer"
                        className={`w-10 h-10 object-contain transition-opacity ${
                          isUnlocked ? 'opacity-100' : 'opacity-35 grayscale contrast-125'
                        }`}
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="font-mono text-sm font-semibold text-white truncate">
                      :{emoji.shortcode}:
                    </h2>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#B8B8B8] mt-1">
                      <span>{emoji.packTitle || 'NIP-30 Set'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{emoji.source === 'nip30' ? 'Kind 30030' : 'Offline Reserve'}</span>
                    </div>
                    {isBroken && (
                      <p className="text-[11px] text-amber-300 mt-1">
                        Media URL unreachable — excluded from active spawn pool
                      </p>
                    )}
                  </div>
                </div>

                {isUnlocked ? (
                  <div className="pt-3 border-t border-white/10 space-y-2 text-xs font-mono tabular-nums">
                    <div className="flex items-center justify-between text-white">
                      <span>
                        {emoji.tier} · Power {emoji.powerRating}
                      </span>
                      <span className="text-[#FF1493]">{record.kills} defeated</span>
                    </div>
                    <div className="text-[#B8B8B8] flex flex-wrap items-center gap-2">
                      <span>HP {emoji.hp}</span>
                      <span aria-hidden="true">·</span>
                      <span>SPD {emoji.speed}</span>
                      <span aria-hidden="true">·</span>
                      <span>DMG {emoji.damage}</span>
                    </div>
                    <div className="text-[#B8B8B8] flex items-center justify-between">
                      <span>{emoji.behaviorName}</span>
                      <span>sha256:{emoji.hash.slice(0, 8)}</span>
                    </div>
                    {emoji.packAuthor && (
                      <div className="text-[11px] text-[#5E5E5E] truncate">
                        Pack author {formatShortNpub(emoji.packAuthor)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs font-mono text-[#5E5E5E]">
                    <span className="flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Traits locked (???)</span>
                    </span>
                    <span>Defeat in Arena</span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
