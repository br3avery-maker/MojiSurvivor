import React, { useMemo, useState } from 'react';
import { RefreshCw, ImageOff, Lock } from 'lucide-react';
import type { EmojiCombatTrait } from '../lib/cryptoStats';
import type { ImageLoadStatus } from '../lib/nostrEngine';
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
    <section className="max-w-5xl mx-auto px-4 py-3.5 space-y-3">
      {/* Compact Header Row */}
      <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-white/10">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-display font-bold text-white tracking-tight truncate">
            Emoji Codex
          </h1>
          <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-[#B8B8B8]">
            <span>
              {discoveredCount}/{emojis.length} unlocked
            </span>
            <span aria-hidden="true">·</span>
            <span>{liveNip30Count} NIP-30</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onSyncNip30}
          disabled={syncing}
          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#111111] border border-white/15 hover:border-[#FF1493] disabled:opacity-50 text-xs font-semibold text-white transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          <span>{syncing ? 'Syncing…' : 'Sync'}</span>
        </button>
      </div>

      {/* Single-Row Scrollable Filter Strip (Never wraps to 2 tall lines) */}
      <div className="flex items-center gap-1 overflow-x-auto p-1 rounded-lg bg-[#111111] border border-white/10">
        {(
          [
            ['all', `All (${emojis.length})`],
            ['discovered', `Unlocked (${discoveredCount})`],
            ['undiscovered', `Locked (${emojis.length - discoveredCount})`],
            ['nip30', `NIP-30 (${liveNip30Count})`],
            ['reserve', 'Reserve'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
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
        <div className="py-10 text-center rounded-xl bg-[#111111] border border-white/10">
          <p className="text-xs text-[#B8B8B8]">
            No emojis match this filter. Defeat rogue emojis in the Arena to unlock their traits.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {filtered.map((emoji) => {
            const record = codexRecords[emoji.shortcode];
            const isUnlocked = Boolean(record && record.kills > 0);
            const imgStatus = imageStatuses.get(emoji.url);
            const isBroken = imgStatus === 'broken';

            return (
              <article
                key={emoji.shortcode}
                className="rounded-xl bg-[#111111] border border-white/10 p-2.5 flex flex-col justify-between gap-2"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-lg bg-black border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                    {isBroken ? (
                      <ImageOff className="w-4 h-4 text-[#5E5E5E]" aria-label="Media URL unreachable" />
                    ) : (
                      <img
                        src={emoji.url}
                        alt={`:${emoji.shortcode}:`}
                        referrerPolicy="no-referrer"
                        className={`w-7 h-7 object-contain ${
                          isUnlocked ? 'opacity-100' : 'opacity-35 grayscale contrast-125'
                        }`}
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="font-mono text-xs font-semibold text-white truncate">
                      :{emoji.shortcode}:
                    </h2>
                    <div className="text-[10px] text-[#B8B8B8] truncate">
                      {isBroken
                        ? 'Media unreachable'
                        : emoji.packTitle || (emoji.source === 'nip30' ? 'Kind 30030' : 'Reserve')}
                    </div>
                  </div>
                </div>

                {isUnlocked ? (
                  <div className="pt-2 border-t border-white/10 space-y-1 text-[10px] font-mono tabular-nums">
                    <div className="flex items-center justify-between text-white">
                      <span>
                        {emoji.tier} · Pwr {emoji.powerRating}
                      </span>
                      <span className="text-[#FF1493]">{record.kills}x</span>
                    </div>
                    <div className="text-[#B8B8B8] flex items-center justify-between">
                      <span>
                        HP {emoji.hp} · DMG {emoji.damage}
                      </span>
                      <span>SPD {emoji.speed}</span>
                    </div>
                    <div className="text-[#888888] flex items-center justify-between truncate">
                      <span className="truncate">{emoji.behaviorName}</span>
                      <span className="shrink-0 ml-1">#{emoji.hash.slice(0, 6)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[10px] font-mono text-[#5E5E5E]">
                    <span className="flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      <span>Locked (???)</span>
                    </span>
                    <span> Arena</span>
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
