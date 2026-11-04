import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshCw,
  ImageOff,
  Lock,
  LayoutGrid,
  ListFilter,
  Search,
  X,
} from 'lucide-react';
import { type EmojiCombatTrait, type EmojiTier } from '../lib/cryptoStats';
import { formatShortNpub, type ImageLoadStatus } from '../lib/nostrEngine';
import {
  codexRecordToTrait,
  type CodexKillRecord,
  type CodexViewMode,
} from '../lib/storage';

type UnlockFilter = 'all' | 'discovered' | 'undiscovered';
type SourceFilter = 'all' | 'nip30' | 'reserve';
type RarityFilter = 'all' | EmojiTier;

interface CodexViewProps {
  emojis: EmojiCombatTrait[];
  codexRecords: Record<string, CodexKillRecord>;
  imageStatuses: Map<string, ImageLoadStatus>;
  viewMode: CodexViewMode;
  syncing: boolean;
  onChangeViewMode: (mode: CodexViewMode) => void;
  onSyncNip30: () => void;
}

const PAGE_BATCH_SIZE = 120;

function getTierAccentClass(tier: EmojiTier, unlocked: boolean): string {
  if (!unlocked) return 'border-white/10';
  switch (tier) {
    case 'Apex':
      return 'border-[#FF1493]/70';
    case 'Epic':
      return 'border-purple-400/60';
    case 'Rare':
      return 'border-[#00F0FF]/55';
    default:
      return 'border-white/20';
  }
}

function getTierTextColor(tier: EmojiTier): string {
  switch (tier) {
    case 'Apex':
      return 'text-[#FF1493]';
    case 'Epic':
      return 'text-purple-300';
    case 'Rare':
      return 'text-[#00F0FF]';
    default:
      return 'text-white';
  }
}

export const CodexView: React.FC<CodexViewProps> = ({
  emojis,
  codexRecords,
  imageStatuses,
  viewMode,
  syncing,
  onChangeViewMode,
  onSyncNip30,
}) => {
  const [unlockFilter, setUnlockFilter] = useState<UnlockFilter>('all');
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(PAGE_BATCH_SIZE);
  const [selectedEmojiKey, setSelectedEmojiKey] = useState<string | null>(null);
  const [brokenUrls, setBrokenUrls] = useState<Set<string>>(() => new Set());

  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Merge live/reserve emojis with persisted Codex records so unlocked entries NEVER disappear offline
  const unifiedPool = useMemo(() => {
    const byKey = new Map<string, EmojiCombatTrait>();
    for (const item of emojis) {
      byKey.set(item.emojiKey, item);
    }
    for (const rec of Object.values(codexRecords)) {
      if (!rec?.emojiKey || !rec.shortcode) continue;
      if (!byKey.has(rec.emojiKey)) {
        byKey.set(rec.emojiKey, codexRecordToTrait(rec));
      }
    }
    return Array.from(byKey.values());
  }, [emojis, codexRecords]);

  // Fallback index for legacy shortcode-matched unlocks (when URL hash matches)
  const recordByEmojiKey = useMemo(() => {
    const map = new Map<string, CodexKillRecord>();
    const byHash = new Map<string, CodexKillRecord>();
    for (const rec of Object.values(codexRecords)) {
      if (!rec || rec.kills <= 0) continue;
      map.set(rec.emojiKey, rec);
      if (rec.hash) byHash.set(rec.hash, rec);
    }
    return {
      getFor(emoji: EmojiCombatTrait): CodexKillRecord | undefined {
        return map.get(emoji.emojiKey) ?? byHash.get(emoji.hash);
      },
    };
  }, [codexRecords]);

  const discoveredCount = useMemo(
    () => unifiedPool.filter((e) => Boolean(recordByEmojiKey.getFor(e)?.kills)).length,
    [unifiedPool, recordByEmojiKey]
  );

  const liveNip30Count = useMemo(
    () => unifiedPool.filter((e) => e.source === 'nip30').length,
    [unifiedPool]
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return unifiedPool
      .filter((item) => {
        const unlocked = Boolean(recordByEmojiKey.getFor(item)?.kills);
        if (unlockFilter === 'discovered' && !unlocked) return false;
        if (unlockFilter === 'undiscovered' && unlocked) return false;
        if (sourceFilter !== 'all' && item.source !== sourceFilter) return false;
        if (rarityFilter !== 'all' && item.tier !== rarityFilter) return false;
        if (q) {
          const inCode = item.shortcode.toLowerCase().includes(q);
          const inPack = (item.packTitle ?? '').toLowerCase().includes(q);
          if (!inCode && !inPack) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const ka = recordByEmojiKey.getFor(a)?.kills ?? 0;
        const kb = recordByEmojiKey.getFor(b)?.kills ?? 0;
        if ((ka > 0) !== (kb > 0)) return kb > 0 ? 1 : -1;
        return b.powerRating - a.powerRating || a.shortcode.localeCompare(b.shortcode);
      });
  }, [
    unifiedPool,
    recordByEmojiKey,
    unlockFilter,
    sourceFilter,
    rarityFilter,
    searchQuery,
  ]);

  // Reset chunk limit only when filter criteria change (NOT when opening/closing details!)
  useEffect(() => {
    setVisibleLimit(PAGE_BATCH_SIZE);
  }, [unlockFilter, rarityFilter, sourceFilter, searchQuery, viewMode]);

  // Progressive infinite scroll observer for smooth rendering with 1,000+ emojis
  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || visibleLimit >= filtered.length) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleLimit((prev) => Math.min(filtered.length, prev + PAGE_BATCH_SIZE));
        }
      },
      { rootMargin: '280px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visibleLimit, filtered.length]);

  const visibleItems = useMemo(
    () => filtered.slice(0, visibleLimit),
    [filtered, visibleLimit]
  );

  const selectedEmoji = useMemo(
    () =>
      selectedEmojiKey
        ? unifiedPool.find((e) => e.emojiKey === selectedEmojiKey) ?? null
        : null,
    [unifiedPool, selectedEmojiKey]
  );

  const markUrlBroken = (url: string) => {
    setBrokenUrls((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  };

  return (
    <section className="max-w-5xl mx-auto px-4 py-3.5 space-y-3">
      {/* Header + Persistent Gallery / Stats View Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-white/10">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-display font-bold text-white tracking-tight truncate">
            Emoji Codex
          </h1>
          <div className="flex items-center gap-1.5 text-xs font-mono tabular-nums text-[#B8B8B8]">
            <span>
              {discoveredCount}/{unifiedPool.length} unlocked
            </span>
            <span aria-hidden="true">·</span>
            <span>{liveNip30Count} NIP-30</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div
            role="group"
            aria-label="Codex display mode"
            className="inline-flex items-center p-0.5 rounded-lg bg-[#111111] border border-white/15"
          >
            <button
              type="button"
              onClick={() => onChangeViewMode('gallery')}
              className={`min-h-[36px] px-2.5 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                viewMode === 'gallery'
                  ? 'bg-[#FF1493] text-white'
                  : 'text-[#B8B8B8] hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Gallery</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeViewMode('stats')}
              className={`min-h-[36px] px-2.5 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                viewMode === 'stats'
                  ? 'bg-[#FF1493] text-white'
                  : 'text-[#B8B8B8] hover:text-white'
              }`}
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span>Stats</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onSyncNip30}
            disabled={syncing}
            className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#111111] border border-white/15 hover:border-[#FF1493] disabled:opacity-50 text-xs font-semibold text-white transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing…' : 'Sync'}</span>
          </button>
        </div>
      </div>

      {/* Filter Controls: Unlock State, Rarity, Source & Search */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 overflow-x-auto p-1 rounded-lg bg-[#111111] border border-white/10">
            {(
              [
                ['all', `All (${unifiedPool.length})`],
                ['discovered', `Unlocked (${discoveredCount})`],
                ['undiscovered', `Locked (${unifiedPool.length - discoveredCount})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setUnlockFilter(key)}
                className={`min-h-[32px] px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  unlockFilter === key
                    ? 'bg-[#FF1493] text-white'
                    : 'text-[#B8B8B8] hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <select
            aria-label="Filter by rarity"
            value={rarityFilter}
            onChange={(e) => setRarityFilter(e.target.value as RarityFilter)}
            className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-[#111111] border border-white/15 text-xs font-medium text-white"
          >
            <option value="all">All Rarities</option>
            <option value="Apex">Apex</option>
            <option value="Epic">Epic</option>
            <option value="Rare">Rare</option>
            <option value="Common">Common</option>
          </select>

          <select
            aria-label="Filter by emoji source"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
            className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-[#111111] border border-white/15 text-xs font-medium text-white"
          >
            <option value="all">All Sources</option>
            <option value="nip30">Live NIP-30 ({liveNip30Count})</option>
            <option value="reserve">Offline Reserve</option>
          </select>

          <div className="relative flex-1 min-w-[160px]">
            <Search className="w-3.5 h-3.5 text-[#888888] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search :shortcode: or pack…"
              className="w-full min-h-[38px] pl-8 pr-3 py-1.5 rounded-lg bg-[#111111] border border-white/15 text-xs text-white placeholder:text-[#777777]"
            />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-10 px-4 text-center rounded-xl bg-[#111111] border border-white/10">
          <p className="text-xs text-[#B8B8B8]">
            No emojis match the active filters. Clear filters or defeat rogue emojis in the Arena.
          </p>
        </div>
      ) : viewMode === 'gallery' ? (
        /* COMPACT RESPONSIVE GALLERY VIEW */
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
          {visibleItems.map((emoji) => {
            const record = recordByEmojiKey.getFor(emoji);
            const isUnlocked = Boolean(record && record.kills > 0);
            const isBroken =
              brokenUrls.has(emoji.url) || imageStatuses.get(emoji.url) === 'broken';

            return (
              <button
                key={emoji.emojiKey}
                type="button"
                onClick={() => setSelectedEmojiKey(emoji.emojiKey)}
                aria-label={`Inspect :${emoji.shortcode}: (${isUnlocked ? 'Unlocked' : 'Locked'})`}
                className={`group relative aspect-square rounded-xl bg-[#111111] border ${getTierAccentClass(
                  emoji.tier,
                  isUnlocked
                )} hover:border-[#FF1493] p-2 flex flex-col items-center justify-between transition-colors overflow-hidden`}
              >
                <div className="w-full flex items-center justify-between text-[10px] font-mono tabular-nums">
                  {isUnlocked ? (
                    <span className="text-[#FF1493] font-semibold">
                      {record!.kills}x
                    </span>
                  ) : (
                    <Lock className="w-3 h-3 text-[#6E6E6E]" aria-hidden="true" />
                  )}
                  <span className="text-[#8E8E8E]">{emoji.tier[0]}</span>
                </div>

                <div className="flex-1 flex items-center justify-center w-full">
                  {isBroken ? (
                    <div className="w-9 h-9 rounded-lg bg-black border border-white/10 flex flex-col items-center justify-center text-[10px] font-mono text-[#B8B8B8]">
                      <ImageOff className="w-3.5 h-3.5 text-[#666666]" />
                    </div>
                  ) : (
                    <img
                      src={emoji.url}
                      alt={`:${emoji.shortcode}:`}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={() => markUrlBroken(emoji.url)}
                      className={`w-10 h-10 object-contain transition-transform group-hover:scale-105 ${
                        isUnlocked
                          ? 'opacity-100'
                          : 'opacity-45 saturate-50 contrast-110'
                      }`}
                    />
                  )}
                </div>

                <div className="w-full text-[11px] font-mono text-white/90 truncate text-center">
                  :{emoji.shortcode}:
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        /* POWER-STAT CARDS VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {visibleItems.map((emoji) => {
            const record = recordByEmojiKey.getFor(emoji);
            const isUnlocked = Boolean(record && record.kills > 0);
            const isBroken =
              brokenUrls.has(emoji.url) || imageStatuses.get(emoji.url) === 'broken';

            return (
              <article
                key={emoji.emojiKey}
                onClick={() => setSelectedEmojiKey(emoji.emojiKey)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedEmojiKey(emoji.emojiKey);
                  }
                }}
                className={`rounded-xl bg-[#111111] border ${getTierAccentClass(
                  emoji.tier,
                  isUnlocked
                )} hover:border-[#FF1493] p-3 flex flex-col justify-between gap-2.5 cursor-pointer transition-colors`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-11 h-11 rounded-lg bg-black border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                    {isBroken ? (
                      <ImageOff
                        className="w-4 h-4 text-[#666666]"
                        aria-label="Media URL unreachable"
                      />
                    ) : (
                      <img
                        src={emoji.url}
                        alt={`:${emoji.shortcode}:`}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={() => markUrlBroken(emoji.url)}
                        className={`w-8 h-8 object-contain ${
                          isUnlocked
                            ? 'opacity-100'
                            : 'opacity-45 saturate-50 contrast-110'
                        }`}
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="font-mono text-xs font-semibold text-white truncate">
                      :{emoji.shortcode}:
                    </h2>
                    <div className="text-xs text-[#B8B8B8] truncate">
                      {isBroken
                        ? 'Media unreachable'
                        : emoji.packTitle ||
                          (emoji.source === 'nip30' ? 'NIP-30 Pack' : 'Reserve')}
                    </div>
                  </div>
                </div>

                {isUnlocked ? (
                  <div className="pt-2 border-t border-white/10 space-y-1 text-xs font-mono tabular-nums">
                    <div className="flex items-center justify-between text-white">
                      <span className={getTierTextColor(emoji.tier)}>
                        {emoji.tier} · Pwr {emoji.powerRating}
                      </span>
                      <span className="text-[#FF1493] font-semibold">
                        {record!.kills} defeated
                      </span>
                    </div>
                    <div className="text-[#B8B8B8] flex items-center justify-between">
                      <span>
                        HP {emoji.hp} · DMG {emoji.damage}
                      </span>
                      <span>SPD {emoji.speed}</span>
                    </div>
                    <div className="text-[#9E9E9E] flex items-center justify-between truncate">
                      <span className="truncate">{emoji.behaviorName}</span>
                      <span className="shrink-0 ml-1">#{emoji.hash.slice(0, 6)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs font-mono text-[#888888]">
                    <span className="flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      <span>Undefeated</span>
                    </span>
                    <span className={getTierTextColor(emoji.tier)}>{emoji.tier}</span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Progressive Scroll Sentinel & Manual Fallback */}
      {visibleLimit < filtered.length && (
        <div ref={loadMoreRef} className="pt-2 flex justify-center">
          <button
            type="button"
            onClick={() =>
              setVisibleLimit((prev) => Math.min(filtered.length, prev + PAGE_BATCH_SIZE))
            }
            className="min-h-[40px] px-4 py-2 rounded-lg bg-[#111111] border border-white/15 hover:border-[#FF1493] text-xs font-semibold text-white"
          >
            Show More ({visibleLimit} of {filtered.length})
          </button>
        </div>
      )}

      {/* Detail Inspector Modal (Preserves underlying scroll position and filters) */}
      {selectedEmoji && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Details for :${selectedEmoji.shortcode}:`}
          onClick={() => setSelectedEmojiKey(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-[#111111] border border-white/20 p-4 space-y-3.5"
          >
            {(() => {
              const rec = recordByEmojiKey.getFor(selectedEmoji);
              const unlocked = Boolean(rec && rec.kills > 0);
              const isBroken =
                brokenUrls.has(selectedEmoji.url) ||
                imageStatuses.get(selectedEmoji.url) === 'broken';

              return (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-16 h-16 rounded-xl bg-black border border-[#FF1493]/50 flex items-center justify-center shrink-0 overflow-hidden">
                        {isBroken ? (
                          <ImageOff className="w-6 h-6 text-[#777777]" />
                        ) : (
                          <img
                            src={selectedEmoji.url}
                            alt={`:${selectedEmoji.shortcode}:`}
                            referrerPolicy="no-referrer"
                            onError={() => markUrlBroken(selectedEmoji.url)}
                            className={`w-12 h-12 object-contain ${
                              unlocked ? '' : 'opacity-65 saturate-75'
                            }`}
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-base font-mono font-bold text-white truncate">
                          :{selectedEmoji.shortcode}:
                        </h2>
                        <div className="text-xs text-[#B8B8B8] truncate">
                          {selectedEmoji.packTitle ||
                            (selectedEmoji.source === 'nip30'
                              ? 'NIP-30 Custom Emoji'
                              : 'Offline Reserve')}
                        </div>
                        <div className="text-xs font-mono mt-0.5 flex items-center gap-2">
                          <span className={getTierTextColor(selectedEmoji.tier)}>
                            {selectedEmoji.tier}
                          </span>
                          <span aria-hidden="true" className="text-[#666666]">
                            ·
                          </span>
                          <span className="text-white">
                            {unlocked ? `${rec!.kills} defeated` : 'Undefeated in Arena'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedEmojiKey(null)}
                      aria-label="Close emoji inspector"
                      className="min-h-[36px] min-w-[36px] rounded-lg bg-black border border-white/15 text-[#B8B8B8] hover:text-white flex items-center justify-center shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-2 p-2.5 rounded-xl bg-black border border-white/10 font-mono tabular-nums text-center">
                    <div>
                      <div className="text-[11px] text-[#9E9E9E]">Power</div>
                      <div className="text-sm font-bold text-[#FF1493]">
                        {selectedEmoji.powerRating}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-[#9E9E9E]">HP</div>
                      <div className="text-sm font-bold text-white">{selectedEmoji.hp}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-[#9E9E9E]">DMG</div>
                      <div className="text-sm font-bold text-white">
                        {selectedEmoji.damage}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-[#9E9E9E]">SPD</div>
                      <div className="text-sm font-bold text-[#00F0FF]">
                        {selectedEmoji.speed}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs font-mono text-[#B8B8B8] bg-black/70 rounded-xl p-3 border border-white/10">
                    <div className="flex justify-between gap-2">
                      <span>AI Archetype</span>
                      <span className="text-white">{selectedEmoji.behaviorName}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span>Bounty</span>
                      <span className="text-[#FFD700]">
                        +{selectedEmoji.expValue * 4} Spell XP · +{selectedEmoji.mojoValue} Mojo
                      </span>
                    </div>
                    {selectedEmoji.packAuthor && (
                      <div className="flex justify-between gap-2">
                        <span>Publisher</span>
                        <span className="text-white truncate">
                          {formatShortNpub(selectedEmoji.packAuthor)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between gap-2">
                      <span>SHA-256 Trait Seed</span>
                      <span className="text-[#00F0FF]">
                        sha256:{selectedEmoji.hash.slice(0, 12)}
                      </span>
                    </div>
                    {unlocked && rec?.firstDefeatedAt && (
                      <div className="flex justify-between gap-2">
                        <span>First Defeated</span>
                        <span className="text-white">
                          {new Date(rec.firstDefeatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </section>
  );
};
