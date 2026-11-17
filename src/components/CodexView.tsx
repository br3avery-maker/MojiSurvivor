import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshCw,
  Lock,
  LayoutGrid,
  ListFilter,
  Search,
  X,
  ShieldCheck,
  Ban,
  Copy,
  Check,
  SlidersHorizontal,
  Hash,
} from 'lucide-react';
import {
  isGenuineReserveSvgUrl,
  type EmojiCombatTrait,
  type EmojiTier,
} from '../lib/cryptoStats';
import { pubkeyHexToNpub, type EmojiFilterMode } from '../lib/moderationLists';
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
  emojiFilterMode: EmojiFilterMode;
  bannedAuthorCount: number;
  bannedHashCount: number;
  safeAuthorCount: number;
  safeAuthorsSet: ReadonlySet<string>;
  isEmojiAllowed: (trait: EmojiCombatTrait) => boolean;
  onChangeViewMode: (mode: CodexViewMode) => void;
  onSyncNip30: () => void;
  onChangeFilterMode: (mode: EmojiFilterMode) => void;
  onOpenModerationPanel: () => void;
  onReportAndBanAuthor: (opts: {
    pubkeyOrNpub: string;
    packTitle?: string;
    packDTag?: string;
    emojiHash?: string;
  }) => void;
  onReportAndBanEmojiHash: (opts: {
    emojiHash: string;
    targetPubkeyOrNpub?: string;
    packTitle?: string;
    packDTag?: string;
  }) => void;
  onAddSafeAuthor: (opts: {
    pubkeyOrNpub: string;
    packTitle?: string;
    packDTag?: string;
    emojiHash?: string;
  }) => void;
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

function hasRenderableArtwork(trait: EmojiCombatTrait): boolean {
  if (!trait.url) return false;
  if (trait.source === 'nip30') {
    return trait.url.startsWith('https://');
  }
  return isGenuineReserveSvgUrl(trait.url);
}

export const CodexView: React.FC<CodexViewProps> = ({
  emojis,
  codexRecords,
  imageStatuses,
  viewMode,
  syncing,
  emojiFilterMode,
  bannedAuthorCount,
  bannedHashCount,
  safeAuthorCount,
  safeAuthorsSet,
  isEmojiAllowed,
  onChangeViewMode,
  onSyncNip30,
  onChangeFilterMode,
  onOpenModerationPanel,
  onReportAndBanAuthor,
  onReportAndBanEmojiHash,
  onAddSafeAuthor,
}) => {
  const [unlockFilter, setUnlockFilter] = useState<UnlockFilter>('all');
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFiltersDrawer, setShowFiltersDrawer] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(PAGE_BATCH_SIZE);
  const [selectedEmojiKey, setSelectedEmojiKey] = useState<string | null>(null);
  const [brokenUrls, setBrokenUrls] = useState<Set<string>>(() => new Set());
  const [copiedField, setCopiedField] = useState<'hash' | 'npub' | null>(null);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Merge live/reserve emojis with persisted Codex records by canonical SHA-256 hash key,
  // stripping any dead/broken URLs or legacy placeholder SVGs so zero broken boxes render.
  const unifiedPool = useMemo(() => {
    const byKey = new Map<string, EmojiCombatTrait>();
    for (const item of emojis) {
      if (!hasRenderableArtwork(item)) continue;
      if (brokenUrls.has(item.url) || imageStatuses.get(item.url) === 'broken') continue;
      if (!isEmojiAllowed(item)) continue;
      byKey.set(item.emojiKey, item);
    }
    for (const rec of Object.values(codexRecords)) {
      if (!rec?.emojiKey || !rec.url) continue;
      if (!byKey.has(rec.emojiKey)) {
        const trait = codexRecordToTrait(rec);
        if (!hasRenderableArtwork(trait)) continue;
        if (brokenUrls.has(trait.url) || imageStatuses.get(trait.url) === 'broken') continue;
        if (!isEmojiAllowed(trait)) continue;
        byKey.set(trait.emojiKey, trait);
      }
    }
    return Array.from(byKey.values());
  }, [emojis, codexRecords, brokenUrls, imageStatuses, isEmojiAllowed]);

  // Match unlocks strictly by canonical hash identity (`emojiKey` or 64-hex `hash`)
  const recordByEmojiKey = useMemo(() => {
    const map = new Map<string, CodexKillRecord>();
    const byHash = new Map<string, CodexKillRecord>();
    for (const rec of Object.values(codexRecords)) {
      if (!rec || rec.kills <= 0) continue;
      map.set(rec.emojiKey, rec);
      if (rec.hash) byHash.set(rec.hash.toLowerCase(), rec);
    }
    return {
      getFor(emoji: EmojiCombatTrait): CodexKillRecord | undefined {
        return map.get(emoji.emojiKey) ?? byHash.get(emoji.hash.toLowerCase());
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

  const hasSecondaryFiltersActive =
    rarityFilter !== 'all' ||
    sourceFilter !== 'all' ||
    searchQuery.trim().length > 0 ||
    emojiFilterMode === 'safe_list_only';

  const filtered = useMemo(() => {
    const rawQ = searchQuery.trim().toLowerCase();
    const cleanHashQ = rawQ.startsWith('#')
      ? rawQ.slice(1)
      : rawQ.startsWith('sha256:')
        ? rawQ.slice(7)
        : rawQ;

    return unifiedPool
      .filter((item) => {
        const unlocked = Boolean(recordByEmojiKey.getFor(item)?.kills);
        if (unlockFilter === 'discovered' && !unlocked) return false;
        if (unlockFilter === 'undiscovered' && unlocked) return false;
        if (sourceFilter !== 'all' && item.source !== sourceFilter) return false;
        if (rarityFilter !== 'all' && item.tier !== rarityFilter) return false;
        if (rawQ) {
          const inHash = item.hash.toLowerCase().includes(cleanHashQ);
          const inPack = (item.packTitle ?? '').toLowerCase().includes(rawQ);
          const inBehavior = item.behaviorName.toLowerCase().includes(rawQ);
          const inAuthorHex = (item.packAuthor ?? '').toLowerCase().includes(rawQ);
          const inAuthorNpub = item.packAuthor
            ? pubkeyHexToNpub(item.packAuthor).toLowerCase().includes(rawQ)
            : false;
          if (!inHash && !inPack && !inBehavior && !inAuthorHex && !inAuthorNpub) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        const ka = recordByEmojiKey.getFor(a)?.kills ?? 0;
        const kb = recordByEmojiKey.getFor(b)?.kills ?? 0;
        if ((ka > 0) !== (kb > 0)) return kb > 0 ? 1 : -1;
        return b.powerRating - a.powerRating || a.hash.localeCompare(b.hash);
      });
  }, [
    unifiedPool,
    recordByEmojiKey,
    unlockFilter,
    sourceFilter,
    rarityFilter,
    searchQuery,
  ]);

  useEffect(() => {
    setVisibleLimit(PAGE_BATCH_SIZE);
  }, [unlockFilter, rarityFilter, sourceFilter, searchQuery, viewMode]);

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

  const copyValue = async (text: string, field: 'hash' | 'npub') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1800);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  return (
    <section className="max-w-5xl mx-auto px-3.5 sm:px-4 py-2.5 sm:py-3.5 space-y-2.5">
      {/* Compact Row 1: Title + Counts | Grid/Stats + Sync */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#9A0957]/45">
        <div className="min-w-0 flex items-baseline gap-2">
          <h1 className="text-base sm:text-xl font-display font-bold text-white tracking-tight shrink-0">
            Codex
          </h1>
          <span className="text-[11px] sm:text-xs font-mono tabular-nums text-[#B8B8B8] truncate">
            {discoveredCount}/{unifiedPool.length} · {liveNip30Count} live · opaque contrast pods
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div
            role="group"
            aria-label="Codex display mode"
            className="inline-flex items-center p-0.5 rounded-lg bg-[#111111] border border-[#9A0957]/55"
          >
            <button
              type="button"
              onClick={() => onChangeViewMode('gallery')}
              className={`min-h-[32px] px-2 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1 transition-colors ${
                viewMode === 'gallery'
                  ? 'bg-[#FF1493] text-white'
                  : 'text-[#B8B8B8] hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Grid</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeViewMode('stats')}
              className={`min-h-[32px] px-2 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1 transition-colors ${
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
            aria-label="Sync NIP-30 custom emojis"
            className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#000000] border border-[#9A0957] hover:border-[#FF1493] disabled:opacity-50 text-xs font-semibold text-white transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#FFB6D9] ${syncing ? 'animate-spin' : ''}`} />
            <span className="hidden xs:inline sm:inline">{syncing ? 'Sync…' : 'Sync'}</span>
          </button>
        </div>
      </div>

      {/* Compact Row 2: Unlock Tabs + Collapsible Filters/Moderation Toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-0.5 overflow-x-auto p-0.5 rounded-lg bg-[#111111] border border-[#9A0957]/45 min-w-0">
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
              className={`min-h-[30px] px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                unlockFilter === key
                  ? 'bg-[#FF1493] text-white'
                  : 'text-[#B8B8B8] hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          aria-expanded={showFiltersDrawer}
          onClick={() => setShowFiltersDrawer((prev) => !prev)}
          className={`min-h-[32px] px-2.5 py-1 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
            showFiltersDrawer || hasSecondaryFiltersActive
              ? 'bg-[#5B0633]/50 border-[#FF1493] text-white'
              : 'bg-[#111111] border-[#9A0957]/55 text-[#B8B8B8] hover:text-white'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-[#FFB6D9]" />
          <span>Filters</span>
        </button>
      </div>

      {/* Collapsible Search, Tier/Source & Hash/npub Moderation Drawer */}
      {showFiltersDrawer && (
        <div className="p-2.5 rounded-xl bg-[#111111] border border-[#9A0957]/55 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[170px]">
              <Search className="w-3.5 h-3.5 text-[#888888] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search #hash, pack, or npub…"
                className="w-full min-h-[36px] pl-8 pr-3 py-1 rounded-lg bg-black border border-white/15 text-xs font-mono text-white placeholder:text-[#777777]"
              />
            </div>

            <select
              aria-label="Filter by rarity"
              value={rarityFilter}
              onChange={(e) => setRarityFilter(e.target.value as RarityFilter)}
              className="min-h-[36px] px-2.5 py-1 rounded-lg bg-black border border-white/15 text-xs font-medium text-white"
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
              className="min-h-[36px] px-2.5 py-1 rounded-lg bg-black border border-white/15 text-xs font-medium text-white"
            >
              <option value="all">All Sources</option>
              <option value="nip30">Live NIP-30 ({liveNip30Count})</option>
              <option value="reserve">Offline Reserve</option>
            </select>
          </div>

          <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
            <div
              role="group"
              aria-label="NIP-30 moderation mode"
              className="inline-flex items-center p-0.5 rounded-md bg-black border border-white/15"
            >
              <button
                type="button"
                onClick={() => onChangeFilterMode('open_with_banlist')}
                className={`min-h-[28px] px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                  emojiFilterMode === 'open_with_banlist'
                    ? 'bg-[#FF1493] text-white'
                    : 'text-[#B8B8B8] hover:text-white'
                }`}
              >
                Live Nostr + Ban List
              </button>
              <button
                type="button"
                onClick={() => onChangeFilterMode('safe_list_only')}
                className={`min-h-[28px] px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                  emojiFilterMode === 'safe_list_only'
                    ? 'bg-[#FF1493] text-white'
                    : 'text-[#B8B8B8] hover:text-white'
                }`}
              >
                Safe List Only ({safeAuthorCount})
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-[#B8B8B8]">
              <span>
                Bans: {bannedAuthorCount} npubs · {bannedHashCount} hashes
              </span>
              <button
                type="button"
                onClick={onOpenModerationPanel}
                className="min-h-[28px] px-2.5 py-1 rounded bg-black border border-white/15 hover:border-[#FF1493] text-xs font-sans font-semibold text-white whitespace-nowrap"
              >
                Ban &amp; Safe Lists
              </button>
            </div>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="py-10 px-4 text-center rounded-xl bg-[#111111] border border-white/10">
          <p className="text-xs text-[#B8B8B8]">
            No emojis match the active filters. Clear filters or defeat rogue emojis in the Arena.
          </p>
        </div>
      ) : viewMode === 'gallery' ? (
        /* COMPACT HASH-ADDRESSED ARTWORK GALLERY */
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
          {visibleItems.map((emoji) => {
            const record = recordByEmojiKey.getFor(emoji);
            const isUnlocked = Boolean(record && record.kills > 0);
            const shortHash = emoji.hash.slice(0, 6);

            return (
              <button
                key={emoji.emojiKey}
                type="button"
                onClick={() => setSelectedEmojiKey(emoji.emojiKey)}
                aria-label={`Inspect emoji #${shortHash} (${isUnlocked ? 'Unlocked' : 'Locked'})`}
                className={`group relative aspect-square rounded-xl bg-[#111111] border ${getTierAccentClass(
                  emoji.tier,
                  isUnlocked
                )} hover:border-[#FF1493] p-1.5 flex flex-col items-center justify-between transition-colors overflow-hidden`}
              >
                <div className="w-full flex items-center justify-between text-[10px] font-mono tabular-nums leading-none">
                  {isUnlocked ? (
                    <span className="text-[#FF1493] font-semibold">
                      {record!.kills}x
                    </span>
                  ) : (
                    <Lock className="w-2.5 h-2.5 text-[#666666]" aria-hidden="true" />
                  )}
                  <span className="text-[#7A7A7A]">{emoji.tier[0]}</span>
                </div>

                <div className="flex-1 flex items-center justify-center w-full py-0.5">
                  <div
                    className={`w-12 h-12 sm:w-13 sm:h-13 rounded-xl flex items-center justify-center p-1 ${
                      isUnlocked
                        ? 'emoji-opaque-pod'
                        : 'bg-[#1A1A1A] border border-[#5B0633]/80'
                    }`}
                  >
                    <img
                      src={emoji.url}
                      alt={`Emoji #${shortHash}`}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={() => markUrlBroken(emoji.url)}
                      className={`w-9 h-9 sm:w-10 sm:h-10 object-contain transition-transform group-hover:scale-105 ${
                        isUnlocked
                          ? 'opacity-100'
                          : 'opacity-45 saturate-50 contrast-110'
                      }`}
                    />
                  </div>
                </div>

                <div className="w-full text-[10px] font-mono text-[#B8B8B8] truncate text-center leading-none">
                  #{shortHash}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        /* HASH-DERIVED COMBAT STAT CARDS */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {visibleItems.map((emoji) => {
            const record = recordByEmojiKey.getFor(emoji);
            const isUnlocked = Boolean(record && record.kills > 0);
            const shortHash = emoji.hash.slice(0, 8);

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
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 overflow-hidden p-1 ${
                      isUnlocked
                        ? 'emoji-opaque-pod'
                        : 'bg-[#1A1A1A] border border-[#5B0633]'
                    }`}
                  >
                    <img
                      src={emoji.url}
                      alt={`Emoji #${shortHash}`}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={() => markUrlBroken(emoji.url)}
                      className={`w-9 h-9 object-contain ${
                        isUnlocked
                          ? 'opacity-100'
                          : 'opacity-45 saturate-50 contrast-110'
                      }`}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="font-mono text-xs font-semibold text-white truncate">
                      #{shortHash}
                    </h2>
                    <div className="text-xs text-[#B8B8B8] truncate">
                      {emoji.packTitle ||
                        (emoji.source === 'nip30' ? 'NIP-30 Custom Emoji' : 'Offline Reserve')}
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
                      <span className="shrink-0 ml-1">sha256</span>
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
            className="min-h-[38px] px-4 py-1.5 rounded-lg bg-[#111111] border border-white/15 hover:border-[#FF1493] text-xs font-semibold text-white"
          >
            Show More ({visibleLimit} of {filtered.length})
          </button>
        </div>
      )}

      {/* Detail Inspector Modal (Pure SHA-256 Hash Identity & Moderation) */}
      {selectedEmoji && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Details for emoji #${selectedEmoji.hash.slice(0, 12)}`}
          onClick={() => setSelectedEmojiKey(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-[#111111] border-2 border-[#FF1493] p-4 space-y-3.5 shadow-2xl"
          >
            {(() => {
              const rec = recordByEmojiKey.getFor(selectedEmoji);
              const unlocked = Boolean(rec && rec.kills > 0);
              const hashLabel = selectedEmoji.hash.slice(0, 12);

              return (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-16 h-16 rounded-xl emoji-opaque-pod flex items-center justify-center shrink-0 overflow-hidden p-1.5">
                        <img
                          src={selectedEmoji.url}
                          alt={`Emoji #${hashLabel}`}
                          referrerPolicy="no-referrer"
                          onError={() => {
                            markUrlBroken(selectedEmoji.url);
                            setSelectedEmojiKey(null);
                          }}
                          className={`w-12 h-12 object-contain ${
                            unlocked ? '' : 'opacity-65 saturate-75'
                          }`}
                        />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-base font-mono font-bold text-white truncate">
                          #{hashLabel}
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
                      <span className="text-[#E2E8F0]">
                        +{selectedEmoji.expValue * 4} Spell XP · +{selectedEmoji.mojoValue} Mojo
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>SHA-256 Hash</span>
                      <button
                        type="button"
                        onClick={() => void copyValue(selectedEmoji.hash, 'hash')}
                        className="text-[#00F0FF] hover:text-white inline-flex items-center gap-1 truncate"
                      >
                        <span className="truncate">
                          {selectedEmoji.hash.slice(0, 10)}…{selectedEmoji.hash.slice(-6)}
                        </span>
                        {copiedField === 'hash' ? (
                          <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                        ) : (
                          <Copy className="w-3 h-3 text-[#888888] shrink-0" />
                        )}
                      </button>
                    </div>
                    {selectedEmoji.packAuthor && (
                      <div className="flex items-center justify-between gap-2">
                        <span>Publisher npub</span>
                        <button
                          type="button"
                          onClick={() =>
                            void copyValue(
                              pubkeyHexToNpub(selectedEmoji.packAuthor!),
                              'npub'
                            )
                          }
                          className="text-white hover:text-[#00F0FF] inline-flex items-center gap-1 truncate"
                        >
                          <span className="truncate">
                            {formatShortNpub(selectedEmoji.packAuthor)}
                          </span>
                          {copiedField === 'npub' ? (
                            <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                          ) : (
                            <Copy className="w-3 h-3 text-[#888888] shrink-0" />
                          )}
                        </button>
                      </div>
                    )}
                    {unlocked && rec?.firstDefeatedAt && (
                      <div className="flex justify-between gap-2">
                        <span>First Defeated</span>
                        <span className="text-white">
                          {new Date(rec.firstDefeatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>

                  {selectedEmoji.source === 'nip30' && (
                    <div className="pt-2 border-t border-white/10 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            onReportAndBanEmojiHash({
                              emojiHash: selectedEmoji.hash,
                              targetPubkeyOrNpub: selectedEmoji.packAuthor,
                              packTitle: selectedEmoji.packTitle,
                              packDTag: selectedEmoji.packDTag,
                            });
                            setSelectedEmojiKey(null);
                          }}
                          className="flex-1 min-h-[38px] px-3 py-1.5 rounded-lg bg-black border border-[#FF1493]/60 hover:bg-[#FF1493] text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors"
                        >
                          <Hash className="w-3.5 h-3.5" />
                          <span>Ban &amp; Report Hash #{selectedEmoji.hash.slice(0, 6)}</span>
                        </button>

                        {selectedEmoji.packAuthor && (
                          <button
                            type="button"
                            onClick={() => {
                              onReportAndBanAuthor({
                                pubkeyOrNpub: selectedEmoji.packAuthor!,
                                packTitle: selectedEmoji.packTitle,
                                packDTag: selectedEmoji.packDTag,
                                emojiHash: selectedEmoji.hash,
                              });
                              setSelectedEmojiKey(null);
                            }}
                            className="flex-1 min-h-[38px] px-3 py-1.5 rounded-lg bg-black border border-white/20 hover:border-[#FF1493] text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors"
                          >
                            <Ban className="w-3.5 h-3.5 text-[#FF1493]" />
                            <span>Ban Publisher npub</span>
                          </button>
                        )}
                      </div>

                      {selectedEmoji.packAuthor && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-[#9E9E9E]">
                            Bans stay private on your device &amp; publish an anonymous relay report.
                          </span>
                          {safeAuthorsSet.has(selectedEmoji.packAuthor.toLowerCase()) ? (
                            <span className="min-h-[32px] px-2.5 py-1 rounded-lg bg-black border border-[#00F0FF]/40 text-[11px] font-mono text-[#00F0FF] inline-flex items-center gap-1 whitespace-nowrap shrink-0">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>Safe Listed</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                onAddSafeAuthor({
                                  pubkeyOrNpub: selectedEmoji.packAuthor!,
                                  packTitle: selectedEmoji.packTitle,
                                  packDTag: selectedEmoji.packDTag,
                                  emojiHash: selectedEmoji.hash,
                                });
                              }}
                              className="min-h-[32px] px-2.5 py-1 rounded-lg bg-black border border-white/15 hover:border-[#00F0FF] text-[11px] font-semibold text-white inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                            >
                              <ShieldCheck className="w-3.5 h-3.5 text-[#00F0FF]" />
                              <span>Safe List npub</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </section>
  );
};
