import React, { useEffect, useMemo, useState } from 'react';
import { Download, Repeat, Share2, Sparkles } from 'lucide-react';
import {
  downloadScoreCardPng,
  evaluatePlayerAwards,
  RARITY_SPECS,
  shareOrDownloadScoreCard,
  type CardRarity,
  type PlayerStatsSnapshotForAwards,
} from '../lib/awardsAndCards';
import {
  buildCollectorCardData,
  renderCollectorCardPng,
  resolveImageAndPalette,
} from '../lib/collectorCardSvg';
import type { NostrProfileMeta } from '../lib/nostrEngine';

/**
 * Chrome Silver (#FFFFFF / #D3D9EA) 4-Point Star Sparkle SVG.
 * Used on Mythic Prismatic Rainbow cards (zero gold).
 */
export const SilverSparkleIcon: React.FC<{ className?: string }> = ({
  className = 'w-4 h-4',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path
      d="M12 1L14.6 9.4L23 12L14.6 14.6L12 23L9.4 14.6L1 12L9.4 9.4L12 1Z"
      fill="#FFFFFF"
      stroke="#D3D9EA"
      strokeWidth="1.2"
    />
  </svg>
);

interface PlayerTradingCardProps {
  stats: PlayerStatsSnapshotForAwards;
  profile?: NostrProfileMeta;
  defaultAvatarUrl: string;
  compact?: boolean;
}

const DEFAULT_AVATAR_PALETTE = ['#FF1493', '#36F3EB', '#A179FF', '#F8F6FF'];

/**
 * Clean, flippable Two-Sided Collector Card (01 / Front & 02 / Career Archive).
 * Features a single clean focal portrait in a prismatic/silver ring with soft ambient glow,
 * no stacked layers, no nested card boxes, and no experimental Blinkie banner.
 */
export const PlayerTradingCard: React.FC<PlayerTradingCardProps> = ({
  stats,
  profile,
  defaultAvatarUrl,
}) => {
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const [resolvedAssets, setResolvedAssets] = useState<{
    avatarDataUrl?: string;
    mojiDataUrl?: string;
    avatarPalette: string[];
  }>({
    avatarDataUrl: profile?.picture || defaultAvatarUrl,
    mojiDataUrl: stats.topMojiUrl,
    avatarPalette: DEFAULT_AVATAR_PALETTE,
  });

  useEffect(() => {
    let cancelled = false;
    void resolveImageAndPalette(profile?.picture, defaultAvatarUrl).then((av) => {
      if (cancelled) return;
      setResolvedAssets({
        avatarDataUrl: av.dataUrl || profile?.picture || defaultAvatarUrl,
        mojiDataUrl: stats.topMojiUrl,
        avatarPalette: av.palette,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.picture, defaultAvatarUrl, stats.topMojiUrl]);

  const cardData = useMemo(
    () => buildCollectorCardData(stats, profile, resolvedAssets),
    [stats, profile, resolvedAssets]
  );

  const awards = useMemo(() => evaluatePlayerAwards(stats), [stats]);
  const unlockedAwards = useMemo(
    () => awards.filter((a) => a.unlocked),
    [awards]
  );
  const showcaseAwards = useMemo(
    () => (unlockedAwards.length > 0 ? unlockedAwards : awards).slice(0, 4),
    [unlockedAwards, awards]
  );

  const [c0, c1] = cardData.avatarPalette;

  const handleShareOrSaveCard = async (mode: 'share' | 'download') => {
    setExporting(true);
    setExportNotice(null);
    try {
      const rendered = await renderCollectorCardPng({
        stats,
        profile,
        defaultAvatarUrl,
        side,
      });
      if (mode === 'download') {
        downloadScoreCardPng(rendered);
        setExportNotice(
          `Saved ${side === 'front' ? 'Front' : 'Career Archive'} Collector Card PNG.`
        );
      } else {
        const res = await shareOrDownloadScoreCard(rendered);
        setExportNotice(
          res.method === 'download'
            ? 'Saved Collector Card PNG.'
            : 'Shared Collector Card.'
        );
      }
    } catch {
      setExportNotice('Could not export card image.');
    } finally {
      setExporting(false);
    }
  };

  const foilBorderGradient =
    cardData.rarityTier === 'mythic'
      ? `linear-gradient(135deg, #FF1493 0%, ${c0} 25%, #A179FF 50%, ${c1} 75%, #F8F6FF 100%)`
      : `linear-gradient(135deg, ${c0} 0%, ${c1} 55%, #F8F6FF 100%)`;

  return (
    <div className="w-full max-w-md mx-auto space-y-3">
      {/* Outer Foil Rim */}
      <div
        className="relative rounded-3xl p-[2px] shadow-[0_20px_50px_rgba(0,0,0,0.65)]"
        style={{ background: foilBorderGradient }}
      >
        {/* Inner Card Surface */}
        <div
          className="relative rounded-[22px] bg-[#0B0A12] px-6 py-6 overflow-hidden"
          style={{
            backgroundImage: `radial-gradient(circle at 50% 34%, ${c0}24 0%, ${c1}10 42%, transparent 72%)`,
          }}
        >
          {/* Card Header */}
          <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-white/10">
            <span className="text-xs font-display font-bold tracking-[0.16em] text-[#D3D9EA]">
              {side === 'front' ? 'MOJI / SURVIVOR' : 'CAREER ARCHIVE'}
            </span>
            <span className="text-[11px] font-mono font-bold tracking-[0.14em] text-white inline-flex items-center gap-1">
              {cardData.rarityTier === 'mythic' && (
                <SilverSparkleIcon className="w-3 h-3" />
              )}
              <span>{cardData.rarity}</span>
            </span>
          </div>

          {side === 'front' ? (
            /* ==================== 01 / FRONT ==================== */
            <div className="pt-4 space-y-5">
              {/* Player & Signature Spell Lockup */}
              <div>
                <h2 className="text-2xl sm:text-3xl font-display font-black tracking-tight text-white truncate">
                  {cardData.player}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-mono text-[#B8B8B8]">
                  <span style={{ color: c0 }} className="font-semibold">
                    {cardData.spell} Lv.{cardData.spellLevel}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Rebirth {String(cardData.rebirthTier).padStart(2, '0')}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{cardData.xp.toLocaleString()} XP</span>
                </div>
              </div>

              {/* Single Clean Focal Portrait (Prismatic/Silver Ring + Soft Ambient Glow) */}
              <div className="py-2 flex items-center justify-center">
                <div
                  className="relative w-40 h-40 sm:w-44 sm:h-44 rounded-full p-[3px]"
                  style={{
                    background: foilBorderGradient,
                    boxShadow: `0 0 38px -8px ${c0}55`,
                  }}
                >
                  <div className="w-full h-full rounded-full bg-[#07070B] p-1 overflow-hidden border border-white/70">
                    <img
                      src={profile?.picture || defaultAvatarUrl}
                      alt={cardData.player}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = defaultAvatarUrl;
                      }}
                      className="w-full h-full rounded-full object-cover"
                    />
                  </div>
                </div>
              </div>

              {/* Clean Two-Column Stats Separated by Hairlines */}
              <div className="border-t border-white/10">
                <div className="grid grid-cols-12 items-end py-3.5 border-b border-white/10 font-mono tabular-nums">
                  <div className="col-span-5 pr-3 border-r border-white/10">
                    <div className="text-[11px] font-sans font-semibold tracking-wider text-[#A9ABC0]">
                      Cycle Level
                    </div>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-3xl sm:text-4xl font-display font-black text-white leading-none">
                        {String(cardData.cycleLevel).padStart(2, '0')}
                      </span>
                      <span className="text-xs font-bold" style={{ color: c0 }}>
                        LV
                      </span>
                    </div>
                  </div>

                  <div className="col-span-7 pl-4">
                    <div className="text-[11px] font-sans font-semibold tracking-wider text-[#A9ABC0]">
                      Best Run
                    </div>
                    <div className="mt-1 flex items-baseline justify-between gap-1">
                      <span className="text-2xl sm:text-3xl font-display font-black text-white leading-none truncate">
                        {cardData.bestRun.toLocaleString()}
                      </span>
                      <span className="text-xs font-bold shrink-0" style={{ color: c0 }}>
                        PTS
                      </span>
                    </div>
                  </div>
                </div>

                {/* Wave | Bosses */}
                <div className="flex items-center justify-between py-3 text-sm font-mono font-bold tabular-nums">
                  <span style={{ color: c1 }}>Wave {cardData.highestWave}</span>
                  <span className="text-[#D3D9EA]">{cardData.bosses} Bosses</span>
                </div>
              </div>

              {/* Clean Achievement Diamond Row (No nested box) */}
              <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-[#A9ABC0]">
                  Achievements ({cardData.awardsUnlocked}/{cardData.awardsTotal})
                </span>
                <div
                  className="flex items-center gap-1.5 shrink-0"
                  aria-label={`${cardData.awardsUnlocked} of ${cardData.awardsTotal} achievements unlocked`}
                >
                  {awards.map((badge, idx) => (
                    <span
                      key={badge.id || idx}
                      title={`${badge.title}: ${badge.quip}`}
                      className={`inline-block w-2.5 h-2.5 rotate-45 ${
                        badge.unlocked
                          ? 'border border-white/80'
                          : 'bg-[#181722] border border-white/15 opacity-50'
                      }`}
                      style={
                        badge.unlocked
                          ? { background: foilBorderGradient }
                          : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* ==================== 02 / REVERSE — CAREER ARCHIVE ==================== */
            <div className="pt-4 space-y-4">
              {/* All-Time Career Score */}
              <div className="pb-3.5 border-b border-white/10">
                <div className="text-xs font-semibold text-[#A9ABC0]">
                  All-Time Career Score
                </div>
                <div className="text-3xl sm:text-4xl font-display font-black text-white tracking-tight mt-1 font-mono tabular-nums">
                  {cardData.careerScore.toLocaleString()}
                </div>
                <div className="text-xs font-mono text-[#A9ABC0] mt-1">
                  {cardData.runs} verified runs · {cardData.player}
                </div>
              </div>

              {/* 4 Two-Column Hairline Comparison Rows */}
              <div className="divide-y divide-white/10 font-mono tabular-nums">
                {[
                  [
                    {
                      label: 'Emojis Defeated',
                      val: cardData.defeated.toLocaleString(),
                      color: c1,
                    },
                    {
                      label: 'Highest Wave',
                      val: String(cardData.highestWave).padStart(2, '0'),
                      color: '#FFFFFF',
                    },
                  ],
                  [
                    {
                      label: 'Bosses Slain',
                      val: cardData.bosses.toLocaleString(),
                      color: c0,
                    },
                    {
                      label: 'Total Runs',
                      val: cardData.runs.toLocaleString(),
                      color: '#FFFFFF',
                    },
                  ],
                  [
                    {
                      label: 'Mojo Balance',
                      val: cardData.mojoBalance.toLocaleString(),
                      color: c0,
                    },
                    {
                      label: 'Lifetime Mojo',
                      val: cardData.mojoLifetime.toLocaleString(),
                      color: '#FFFFFF',
                    },
                  ],
                  [
                    {
                      label: 'Codex Entries',
                      val: cardData.codexUnlocks.toLocaleString(),
                      color: c1,
                    },
                    {
                      label: 'Upgrade Levels',
                      val: `${cardData.upgradeLevels}/${cardData.upgradeTotal}`,
                      color: '#FFFFFF',
                    },
                  ],
                ].map((pair, rIdx) => (
                  <div key={rIdx} className="grid grid-cols-2 py-2.5 items-center">
                    <div className="pr-3 border-r border-white/10">
                      <div className="text-[11px] font-sans text-[#A9ABC0]">
                        {pair[0].label}
                      </div>
                      <div
                        className="text-base sm:text-lg font-display font-bold mt-0.5"
                        style={{ color: pair[0].color }}
                      >
                        {pair[0].val}
                      </div>
                    </div>
                    <div className="pl-4">
                      <div className="text-[11px] font-sans text-[#A9ABC0]">
                        {pair[1].label}
                      </div>
                      <div
                        className="text-base sm:text-lg font-display font-bold mt-0.5"
                        style={{ color: pair[1].color }}
                      >
                        {pair[1].val}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Signature Spell & Nemesis */}
              <div className="py-3 border-y border-white/10 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-[#A9ABC0]">Signature &amp; Nemesis</div>
                  <div className="text-sm font-display font-bold text-white truncate mt-0.5">
                    {cardData.spell} (Lv.{cardData.spellLevel}) · {cardData.nemesis}
                  </div>
                </div>
                <span className="text-xs font-mono text-[#D3D9EA] shrink-0">
                  {cardData.nemesisKills.toLocaleString()} defeated
                </span>
              </div>

              {/* Verified Achievements (4 Titles, Two Clean Rows) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-white">Verified Achievements</span>
                  <span className="font-mono" style={{ color: c1 }}>
                    {cardData.awardsUnlocked} / {cardData.awardsTotal}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {showcaseAwards.map((badge) => (
                    <div
                      key={badge.id}
                      title={badge.quip}
                      className="flex items-center gap-2 min-w-0"
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          background: badge.unlocked ? foilBorderGradient : '#373342',
                        }}
                      />
                      <span
                        className={`text-xs font-medium truncate ${
                          badge.unlocked ? 'text-white' : 'text-[#A9ABC0]/55'
                        }`}
                      >
                        {badge.title}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Card Footer with Flip & Save */}
          <div className="mt-5 pt-3.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-mono text-[#A9ABC0]">
              {side === 'front' ? '01 / Front' : '02 / Archive'}
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSide((s) => (s === 'front' ? 'back' : 'front'))}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#181722] border border-white/15 hover:border-white/35 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Repeat className="w-3.5 h-3.5" style={{ color: c1 }} />
                <span>Flip Card</span>
              </button>

              <button
                type="button"
                disabled={exporting}
                onClick={() => void handleShareOrSaveCard('share')}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#181722] border border-white/15 hover:border-white/35 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Share2 className="w-3.5 h-3.5" style={{ color: c0 }} />
                <span>{exporting ? '…' : 'Share'}</span>
              </button>

              <button
                type="button"
                disabled={exporting}
                onClick={() => void handleShareOrSaveCard('download')}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#181722] border border-white/15 hover:border-white/35 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 text-[#D3D9EA]" />
                <span>Save PNG</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {exportNotice && (
        <div className="px-3 py-1.5 rounded-lg bg-[#111018] border border-white/10 text-xs text-[#D3D9EA] text-center">
          {exportNotice}
        </div>
      )}
    </div>
  );
};

export interface MojiLeaderboardItem {
  emojiKey: string;
  shortcode: string;
  url: string;
  source: 'nip30' | 'reserve';
  tier: string;
  behavior: string;
  powerRating: number;
  packTitle: string;
  packAuthor?: string;
  hash?: string;
  totalKills: number;
  timesFeatured: number;
  slainByPlayersCount: number;
  rarity: CardRarity;
  superlative: string;
}

export const MojiRarityCard: React.FC<{
  item: MojiLeaderboardItem;
  rank: number;
}> = ({ item, rank }) => {
  const spec = RARITY_SPECS[item.rarity];

  return (
    <div
      className={`relative rounded-2xl p-[2px] transition-transform hover:-translate-y-0.5 ${
        spec.isRainbowMythic
          ? 'bg-[linear-gradient(135deg,#FF1493_0%,#FF67E2_19%,#A179FF_37%,#36F3EB_55%,#F8F6FF_73%,#A8F5CA_87%,#FF1493_100%)] shadow-[0_0_20px_rgba(226,232,240,0.16)]'
          : ''
      }`}
      style={spec.isRainbowMythic ? undefined : { background: spec.borderHex }}
    >
      <div
        className={`relative h-full rounded-[14px] bg-[#111018] p-4 flex flex-col justify-between gap-3 overflow-hidden ${
          spec.isRainbowMythic ? 'border border-[#E2E8F0]/80' : ''
        }`}
      >
        {spec.isRainbowMythic && (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-15 bg-[linear-gradient(125deg,rgba(255,20,147,0.35)_0%,rgba(54,243,235,0.25)_40%,rgba(248,246,255,0.3)_70%,rgba(161,121,255,0.35)_100%)]"
            />
            <SilverSparkleIcon className="pointer-events-none absolute top-2.5 right-3 w-3.5 h-3.5" />
          </>
        )}

        <div className="relative flex items-center justify-between gap-2 text-xs font-mono">
          <span className="font-bold text-[#E2E8F0] tabular-nums">#{rank}</span>
          <span className="text-[11px] font-bold tracking-wider text-[#D3D9EA] inline-flex items-center gap-1">
            {spec.isRainbowMythic && <Sparkles className="w-3 h-3 text-white" />}
            <span>{spec.label}</span>
          </span>
        </div>

        <div className="relative flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl emoji-opaque-pod p-1.5 flex items-center justify-center shrink-0">
            <img
              src={item.url}
              alt={item.shortcode}
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-display font-bold text-white truncate">
              :{item.shortcode}:
            </div>
            <div className="text-xs text-[#A9ABC0] truncate">
              {item.packTitle} · {item.superlative}
            </div>
          </div>
        </div>

        <div className="relative grid grid-cols-3 gap-2 pt-2.5 border-t border-white/10 font-mono tabular-nums text-xs">
          <div>
            <div className="text-[10px] text-[#A9ABC0]">Slain</div>
            <div className="font-bold text-[#FF1493]">
              {item.totalKills.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#A9ABC0]">Featured</div>
            <div className="font-bold text-[#36F3EB]">
              {item.timesFeatured}x
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#A9ABC0]">Power</div>
            <div className="font-bold text-[#E2E8F0]">{item.powerRating}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
