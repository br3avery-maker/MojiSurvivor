import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileCode2,
  Lock,
  Palette,
  Share2,
  Sparkles,
  Wand2,
} from 'lucide-react';
import {
  downloadScoreCardPng,
  evaluatePlayerAwards,
  RARITY_SPECS,
  shareOrDownloadScoreCard,
  type CardRarity,
  type PlayerStatsSnapshotForAwards,
} from '../lib/awardsAndCards';
import {
  BLINKIE_COLOR_PRESETS,
  BLINKIE_TEMPLATES,
  DEFAULT_BLINKIE_COLORS,
  exportBlinkieAsset,
  extractPaletteFromAvatarUrl,
  makeBlinkieSvg,
  type BlinkieAnimation,
  type BlinkieBorder,
  type BlinkieLayout,
  type BlinkieTemplate,
} from '../lib/blinkieEngine';
import {
  buildCollectorCardData,
  downloadCollectorCardSvg,
  generateCollectorCardBackSvg,
  generateCollectorCardFrontSvg,
  renderCollectorCardPng,
  svgStringToDataUrl,
} from '../lib/collectorCardSvg';
import { formatShortNpub, type NostrProfileMeta } from '../lib/nostrEngine';

/**
 * Chrome Silver (#FFFFFF / #E2E8F0) 4-Point Star Sparkle SVG.
 * Used exclusively on Mythic Prismatic Rainbow cards (zero gold).
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
      stroke="#E2E8F0"
      strokeWidth="1.2"
    />
  </svg>
);

interface PlayerTradingCardProps {
  stats: PlayerStatsSnapshotForAwards;
  profile?: NostrProfileMeta;
  defaultAvatarUrl: string;
  showAllAwards?: boolean;
  compact?: boolean;
}

type StudioViewMode = 'spread' | 'front' | 'back' | 'blinkie';

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const PlayerTradingCard: React.FC<PlayerTradingCardProps> = ({
  stats,
  profile,
  defaultAvatarUrl,
  showAllAwards = true,
  compact = false,
}) => {
  const [viewMode, setViewMode] = useState<StudioViewMode>(
    compact ? 'front' : 'spread'
  );
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [showMathDrawer, setShowMathDrawer] = useState(false);

  // Collector Card Data & 720x1080 Vector SVGs
  const cardData = useMemo(
    () => buildCollectorCardData(stats, profile),
    [stats, profile]
  );
  const frontSvg = useMemo(
    () => generateCollectorCardFrontSvg(cardData),
    [cardData]
  );
  const backSvg = useMemo(
    () => generateCollectorCardBackSvg(cardData),
    [cardData]
  );
  const frontDataUrl = useMemo(() => svgStringToDataUrl(frontSvg), [frontSvg]);
  const backDataUrl = useMemo(() => svgStringToDataUrl(backSvg), [backSvg]);

  const awards = useMemo(() => evaluatePlayerAwards(stats), [stats]);
  const unlockedAwards = useMemo(
    () => awards.filter((a) => a.unlocked),
    [awards]
  );
  const raritySpec = RARITY_SPECS[cardData.rarityTier];

  // Blinkie Lab State
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    BLINKIE_TEMPLATES[0].id
  );
  const [customLabel, setCustomLabel] = useState<string>(() =>
    cardData.spell.toUpperCase().slice(0, 16)
  );
  const [customTagline, setCustomTagline] = useState<string>(
    BLINKIE_TEMPLATES[0].tagline
  );
  const [customLayout, setCustomLayout] = useState<BlinkieLayout>(
    BLINKIE_TEMPLATES[0].layout
  );
  const [customBorder, setCustomBorder] = useState<BlinkieBorder>(
    BLINKIE_TEMPLATES[0].border
  );
  const [customAnimation, setCustomAnimation] = useState<BlinkieAnimation>(
    BLINKIE_TEMPLATES[0].animation
  );
  const [avatarPalette, setAvatarPalette] = useState<string[]>([
    ...DEFAULT_BLINKIE_COLORS,
  ]);
  const [selectedPaletteId, setSelectedPaletteId] = useState<string>('avatar');
  const [blinkieExporting, setBlinkieExporting] = useState(false);

  // Extract punchy high-contrast palette from player's Nostr avatar (or default icon)
  useEffect(() => {
    let cancelled = false;
    const sourceUrl = profile?.picture || defaultAvatarUrl;
    void extractPaletteFromAvatarUrl(sourceUrl, 3).then((cols) => {
      if (!cancelled && cols.length >= 3) {
        setAvatarPalette(cols);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.picture, defaultAvatarUrl]);

  const handleSelectBlinkieTemplate = (tpl: BlinkieTemplate) => {
    setSelectedTemplateId(tpl.id);
    setCustomLayout(tpl.layout);
    setCustomBorder(tpl.border);
    setCustomAnimation(tpl.animation);
    setCustomTagline(tpl.tagline);
  };

  const activeBlinkieColors = useMemo(() => {
    if (selectedPaletteId === 'avatar') {
      return avatarPalette;
    }
    const found = BLINKIE_COLOR_PRESETS.find((p) => p.id === selectedPaletteId);
    return found ? found.colors : [...DEFAULT_BLINKIE_COLORS];
  }, [selectedPaletteId, avatarPalette]);

  const activeBlinkieTemplate: BlinkieTemplate = useMemo(() => {
    const baseTpl =
      BLINKIE_TEMPLATES.find((t) => t.id === selectedTemplateId) ??
      BLINKIE_TEMPLATES[0];
    return {
      ...baseTpl,
      layout: customLayout,
      border: customBorder,
      animation: customAnimation,
      tagline: (customTagline || baseTpl.tagline).toUpperCase().slice(0, 18),
    };
  }, [selectedTemplateId, customLayout, customBorder, customAnimation, customTagline]);

  const blinkieSvgString = useMemo(
    () =>
      makeBlinkieSvg({
        template: activeBlinkieTemplate,
        label: (customLabel || cardData.spell || 'MYTHIC MOJI')
          .toUpperCase()
          .slice(0, 18),
        username: cardData.player,
        level: cardData.cycleLevel,
        colors: activeBlinkieColors,
      }),
    [
      activeBlinkieTemplate,
      customLabel,
      cardData.spell,
      cardData.player,
      cardData.cycleLevel,
      activeBlinkieColors,
    ]
  );

  const blinkieDataUrl = useMemo(
    () => svgStringToDataUrl(blinkieSvgString),
    [blinkieSvgString]
  );

  const handleExportCollectorCard = async (
    action: 'share' | 'download_both' | 'download_front' | 'download_back'
  ) => {
    setExporting(true);
    setExportMessage(null);
    try {
      const side =
        action === 'download_front'
          ? 'front'
          : action === 'download_back'
            ? 'back'
            : 'both';
      const rendered = await renderCollectorCardPng({
        stats,
        profile,
        side,
      });
      if (action === 'share') {
        const res = await shareOrDownloadScoreCard(rendered);
        setExportMessage(
          res.method === 'download'
            ? 'Downloaded Two-Sided Collector Card PNG.'
            : 'Shared Two-Sided Collector Card.'
        );
      } else {
        downloadScoreCardPng(rendered);
        setExportMessage(
          side === 'both'
            ? 'Downloaded Dual Spread (01 Front + 02 Reverse) PNG.'
            : `Downloaded ${side === 'front' ? '01 / FRONT' : '02 / REVERSE'} PNG.`
        );
      }
    } catch (err) {
      setExportMessage(
        err instanceof Error ? err.message : 'Failed to render Collector Card PNG.'
      );
    } finally {
      setExporting(false);
    }
  };

  const handleExportBlinkie = async (format: 'gif' | 'svg' | 'png') => {
    setBlinkieExporting(true);
    setExportMessage(null);
    try {
      const res = await exportBlinkieAsset({
        template: activeBlinkieTemplate,
        label: (customLabel || cardData.spell || 'MYTHIC MOJI')
          .toUpperCase()
          .slice(0, 18),
        username: cardData.player,
        level: cardData.cycleLevel,
        colors: activeBlinkieColors,
        format,
      });
      triggerBlobDownload(res.blob, res.fileName);
      setExportMessage(
        format === 'gif'
          ? 'Downloaded 8-frame looping Blinkie .GIF (200ms/frame).'
          : format === 'svg'
            ? 'Downloaded animated pixel-art Blinkie .SVG.'
            : 'Downloaded crisp 2× Blinkie .PNG.'
      );
    } catch (err) {
      setExportMessage(
        err instanceof Error ? err.message : 'Failed to export Blinkie.'
      );
    } finally {
      setBlinkieExporting(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Studio Outer Foil Container */}
      <div
        className={`relative rounded-2xl p-[2px] transition-all ${
          raritySpec.isRainbowMythic
            ? 'bg-[linear-gradient(135deg,#FF1493_0%,#FF67E2_19%,#A179FF_37%,#36F3EB_55%,#F8F6FF_73%,#A8F5CA_87%,#FF1493_100%)] shadow-[0_0_28px_rgba(211,217,234,0.22)]'
            : ''
        }`}
        style={
          raritySpec.isRainbowMythic
            ? undefined
            : { background: raritySpec.borderHex }
        }
      >
        <div className="relative rounded-[14px] bg-[#08070C] p-3.5 sm:p-4 overflow-hidden border border-[#FAE9FB]/30">
          {/* Top Bar: Collector Studio Mode Switcher + Share/Export Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/10">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider border ${raritySpec.badgeBgCss}`}
              >
                {raritySpec.isRainbowMythic && (
                  <SilverSparkleIcon className="w-3 h-3 shrink-0" />
                )}
                <span>
                  {cardData.rarity} • {cardData.form} FORM
                </span>
              </span>

              <div className="inline-flex rounded-lg bg-[#12101B] p-0.5 border border-white/10">
                <button
                  type="button"
                  onClick={() => setViewMode('spread')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold transition-colors ${
                    viewMode === 'spread'
                      ? 'bg-[#FF1493] text-white'
                      : 'text-[#A9ABC0] hover:text-white'
                  }`}
                >
                  01 + 02 Spread
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('front')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold transition-colors ${
                    viewMode === 'front'
                      ? 'bg-[#FF1493] text-white'
                      : 'text-[#A9ABC0] hover:text-white'
                  }`}
                >
                  01 / Front
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('back')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold transition-colors ${
                    viewMode === 'back'
                      ? 'bg-[#FF1493] text-white'
                      : 'text-[#A9ABC0] hover:text-white'
                  }`}
                >
                  02 / Reverse
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('blinkie')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold inline-flex items-center gap-1 transition-colors ${
                    viewMode === 'blinkie'
                      ? 'bg-gradient-to-r from-[#FF1493] to-[#36F3EB] text-black'
                      : 'text-[#36F3EB] hover:text-white'
                  }`}
                >
                  <Wand2 className="w-3 h-3" />
                  <span>Blinkie Lab</span>
                </button>
              </div>
            </div>

            {viewMode !== 'blinkie' && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => void handleExportCollectorCard('share')}
                  className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[#15121D] border border-[#D3D9EA]/40 hover:border-[#36F3EB] text-[11px] font-mono font-bold text-white inline-flex items-center gap-1 transition-colors"
                >
                  <Share2 className="w-3 h-3 text-[#36F3EB]" />
                  <span>{exporting ? 'Rendering…' : 'Share Spread'}</span>
                </button>
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() =>
                    void handleExportCollectorCard(
                      viewMode === 'front'
                        ? 'download_front'
                        : viewMode === 'back'
                          ? 'download_back'
                          : 'download_both'
                    )
                  }
                  className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[#15121D] border border-[#D3D9EA]/40 hover:border-[#FF1493] text-[11px] font-mono font-bold text-white inline-flex items-center gap-1 transition-colors"
                  title="Download high-DPI Collector Card PNG"
                >
                  <Download className="w-3 h-3 text-[#FF1493]" />
                  <span>PNG</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadCollectorCardSvg(
                      viewMode === 'back' ? backSvg : frontSvg,
                      `mojisurvivor-card-${viewMode === 'back' ? 'back' : 'front'}-${stats.pubkey.slice(0, 8)}.svg`
                    )
                  }
                  className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[#15121D] border border-white/15 hover:border-[#D3D9EA] text-[11px] font-mono text-[#D3D9EA] inline-flex items-center gap-1 transition-colors"
                  title="Download pure vector SVG card"
                >
                  <FileCode2 className="w-3 h-3 text-[#36F3EB]" />
                  <span className="hidden sm:inline">SVG</span>
                </button>
              </div>
            )}
          </div>

          {exportMessage && (
            <div className="mt-2.5 px-3 py-1.5 rounded-lg bg-black/80 border border-[#36F3EB]/40 text-[11px] font-mono text-[#36F3EB] flex items-center justify-between gap-2">
              <span>{exportMessage}</span>
              <button
                type="button"
                onClick={() => setExportMessage(null)}
                className="text-[#A9ABC0] hover:text-white text-[10px]"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* VIEW 1: TWO-SIDED 720x1080 VECTOR COLLECTOR CARDS (01 / FRONT & 02 / REVERSE) */}
          {viewMode !== 'blinkie' && (
            <div className="mt-3.5">
              {viewMode === 'spread' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-mono text-[#A9ABC0] px-1">
                      <span>01 / FRONT — HERO & SIGNATURE SPELL</span>
                      <button
                        type="button"
                        onClick={() => void handleExportCollectorCard('download_front')}
                        className="text-[#36F3EB] hover:underline"
                      >
                        Save Front PNG
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setViewMode('front')}
                      className="block w-full rounded-2xl overflow-hidden border border-white/10 hover:border-[#FF1493]/60 transition-all shadow-[0_14px_40px_rgba(0,0,0,0.65)]"
                      title="Click to inspect 01 / FRONT full-size"
                    >
                      <img
                        src={frontDataUrl}
                        alt={`${cardData.player} Collector Card Front`}
                        className="w-full h-auto block select-none"
                      />
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-mono text-[#A9ABC0] px-1">
                      <span>02 / REVERSE — THE CAREER ARCHIVE</span>
                      <button
                        type="button"
                        onClick={() => void handleExportCollectorCard('download_back')}
                        className="text-[#36F3EB] hover:underline"
                      >
                        Save Reverse PNG
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setViewMode('back')}
                      className="block w-full rounded-2xl overflow-hidden border border-white/10 hover:border-[#36F3EB]/60 transition-all shadow-[0_14px_40px_rgba(0,0,0,0.65)]"
                      title="Click to inspect 02 / REVERSE full-size"
                    >
                      <img
                        src={backDataUrl}
                        alt={`${cardData.player} Collector Card Reverse`}
                        className="w-full h-auto block select-none"
                      />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="max-w-[440px] mx-auto space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#A9ABC0] px-1">
                    <span>
                      {viewMode === 'front'
                        ? '01 / FRONT — COLLECTOR TRADING CARD (720×1080)'
                        : '02 / REVERSE — THE CAREER ARCHIVE (720×1080)'}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setViewMode(viewMode === 'front' ? 'back' : 'front')
                      }
                      className="text-[#36F3EB] hover:underline font-bold"
                    >
                      Flip to {viewMode === 'front' ? '02 / Reverse →' : '← 01 / Front'}
                    </button>
                  </div>
                  <div className="rounded-2xl overflow-hidden border border-white/15 shadow-[0_16px_48px_rgba(0,0,0,0.75)]">
                    <img
                      src={viewMode === 'front' ? frontDataUrl : backDataUrl}
                      alt={`${cardData.player} Collector Card ${viewMode}`}
                      className="w-full h-auto block select-none"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VIEW 2: MOJISURVIVOR // BLINKIE LAB (8-Frame Animated Webcore Pixel Studio) */}
          {viewMode === 'blinkie' && (
            <div className="mt-3.5 space-y-4">
              <div className="p-3.5 rounded-xl bg-[#100B17] border border-[#FF1493]/35 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-mono font-bold tracking-widest text-[#FF1493] uppercase">
                      MOJISURVIVOR // BLINKIE LAB
                    </div>
                    <h4 className="text-sm sm:text-base font-display font-bold text-white">
                      8-Frame Looping Pixel-Art Webcore Blinkie Studio
                    </h4>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={blinkieExporting}
                      onClick={() => void handleExportBlinkie('gif')}
                      className="min-h-[34px] px-3 py-1.5 rounded-lg bg-[#FF1493] hover:bg-[#ff2da0] text-xs font-mono font-bold text-white inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>
                        {blinkieExporting ? 'Encoding GIF…' : 'Export 8-Frame .GIF'}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={blinkieExporting}
                      onClick={() => void handleExportBlinkie('svg')}
                      className="min-h-[34px] px-2.5 py-1.5 rounded-lg bg-[#161321] border border-[#36F3EB]/50 hover:border-[#36F3EB] text-xs font-mono font-bold text-[#36F3EB] inline-flex items-center gap-1 transition-colors"
                    >
                      <FileCode2 className="w-3.5 h-3.5" />
                      <span>.SVG</span>
                    </button>
                    <button
                      type="button"
                      disabled={blinkieExporting}
                      onClick={() => void handleExportBlinkie('png')}
                      className="min-h-[34px] px-2.5 py-1.5 rounded-lg bg-[#161321] border border-white/20 hover:border-white text-xs font-mono font-bold text-white inline-flex items-center gap-1 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>2× .PNG</span>
                    </button>
                  </div>
                </div>

                {/* Live 8-Frame Animated Blinkie Stage */}
                <div className="p-4 rounded-xl bg-black border border-white/15 flex flex-col items-center justify-center gap-2 overflow-x-auto">
                  <img
                    src={blinkieDataUrl}
                    alt={`${customLabel} animated blinkie`}
                    className="w-full max-w-[640px] h-auto block select-none"
                    style={{ imageRendering: 'pixelated' }}
                  />
                  <div className="text-[10px] font-mono text-[#A9ABC0]">
                    {activeBlinkieTemplate.width}×{activeBlinkieTemplate.height}px • 8-frame CSS steps(1,end) & GIF89a loop (200ms/frame) • Zero Gold
                  </div>
                </div>

                {/* Template Presets */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-mono font-bold text-[#D3D9EA] uppercase">
                    1. Choose Blinkie Template
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {BLINKIE_TEMPLATES.map((tpl) => {
                      const active = selectedTemplateId === tpl.id;
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => handleSelectBlinkieTemplate(tpl)}
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            active
                              ? 'bg-[#1F122B] border-[#FF1493] text-white'
                              : 'bg-[#14111D] border-white/10 text-[#A9ABC0] hover:text-white'
                          }`}
                        >
                          <div className="text-xs font-display font-bold">
                            {tpl.name}
                          </div>
                          <div className="text-[10px] font-mono text-[#36F3EB] mt-0.5">
                            {tpl.layout} • {tpl.border} • {tpl.animation}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Text, Layout, Border, Animation, and Avatar Palette Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-[#A9ABC0] mb-1">
                      Main Pixel Headline (5×7 Bitmap Font)
                    </label>
                    <input
                      type="text"
                      maxLength={18}
                      value={customLabel}
                      onChange={(e) => setCustomLabel(e.target.value)}
                      placeholder="CHAIN STORM"
                      className="w-full px-3 py-1.5 rounded-lg bg-black border border-white/20 text-xs font-mono text-white focus:border-[#FF1493] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-[#A9ABC0] mb-1">
                      Sub-Banner Tagline (Combined with LV {cardData.cycleLevel})
                    </label>
                    <input
                      type="text"
                      maxLength={18}
                      value={customTagline}
                      onChange={(e) => setCustomTagline(e.target.value)}
                      placeholder="RAINBOW FORM"
                      className="w-full px-3 py-1.5 rounded-lg bg-black border border-white/20 text-xs font-mono text-white focus:border-[#36F3EB] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <div className="text-[10px] font-mono uppercase text-[#A9ABC0] mb-1">
                      Layout Mode
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {(['classic', 'ticker', 'arcade'] as BlinkieLayout[]).map(
                        (l) => (
                          <button
                            key={l}
                            type="button"
                            onClick={() => setCustomLayout(l)}
                            className={`py-1 rounded text-[11px] font-mono uppercase border ${
                              customLayout === l
                                ? 'bg-[#FF1493]/25 border-[#FF1493] text-white font-bold'
                                : 'bg-black/60 border-white/10 text-[#A9ABC0]'
                            }`}
                          >
                            {l}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-mono uppercase text-[#A9ABC0] mb-1">
                      Border Chase
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {(['dots', 'checker', 'comet'] as BlinkieBorder[]).map(
                        (b) => (
                          <button
                            key={b}
                            type="button"
                            onClick={() => setCustomBorder(b)}
                            className={`py-1 rounded text-[11px] font-mono uppercase border ${
                              customBorder === b
                                ? 'bg-[#36F3EB]/20 border-[#36F3EB] text-white font-bold'
                                : 'bg-black/60 border-white/10 text-[#A9ABC0]'
                            }`}
                          >
                            {b}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-mono uppercase text-[#A9ABC0] mb-1">
                      Pixel Motion
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {(['bounce', 'march', 'sparkle'] as BlinkieAnimation[]).map(
                        (a) => (
                          <button
                            key={a}
                            type="button"
                            onClick={() => setCustomAnimation(a)}
                            className={`py-1 rounded text-[11px] font-mono uppercase border ${
                              customAnimation === a
                                ? 'bg-[#A179FF]/25 border-[#A179FF] text-white font-bold'
                                : 'bg-black/60 border-white/10 text-[#A9ABC0]'
                            }`}
                          >
                            {a}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>

                {/* Palette Picker: Sampled from Avatar + Zero-Gold Presets */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase text-[#D3D9EA]">
                    <Palette className="w-3.5 h-3.5 text-[#36F3EB]" />
                    <span>High-Contrast Color Palette (Sampled from Avatar or Preset)</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedPaletteId('avatar')}
                      className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-mono inline-flex items-center gap-2 transition-all ${
                        selectedPaletteId === 'avatar'
                          ? 'bg-[#1D1528] border-[#36F3EB] text-white font-bold'
                          : 'bg-black/60 border-white/10 text-[#A9ABC0]'
                      }`}
                    >
                      <span className="flex items-center gap-1">
                        {avatarPalette.slice(0, 3).map((hex, i) => (
                          <span
                            key={i}
                            className="w-3 h-3 rounded-full border border-white/40"
                            style={{ backgroundColor: hex }}
                          />
                        ))}
                      </span>
                      <span>Avatar Sampled</span>
                    </button>

                    {BLINKIE_COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setSelectedPaletteId(preset.id)}
                        className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-mono inline-flex items-center gap-2 transition-all ${
                          selectedPaletteId === preset.id
                            ? 'bg-[#1D1528] border-[#FF1493] text-white font-bold'
                            : 'bg-black/60 border-white/10 text-[#A9ABC0]'
                        }`}
                      >
                        <span className="flex items-center gap-1">
                          {preset.colors.slice(0, 3).map((hex, i) => (
                            <span
                              key={i}
                              className="w-3 h-3 rounded-full border border-white/40"
                              style={{ backgroundColor: hex }}
                            />
                          ))}
                        </span>
                        <span>{preset.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Collapsible 10 Verified Achievements & Math Formula Inspector */}
          {showAllAwards && !compact && (
            <div className="mt-3.5 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowMathDrawer((prev) => !prev)}
                className="w-full flex items-center justify-between gap-2 text-left py-1 text-xs font-mono text-[#D3D9EA] hover:text-white transition-colors"
              >
                <span className="inline-flex items-center gap-1.5 font-bold">
                  <Award className="w-4 h-4 text-[#36F3EB]" />
                  <span>
                    VERIFIED ACHIEVEMENTS & QUERYABLE MATH ({unlockedAwards.length} / {awards.length} UNLOCKED)
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] text-[#36F3EB]">
                  <span>{showMathDrawer ? 'Hide Formulas' : 'Inspect All 10 Badges'}</span>
                  {showMathDrawer ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </span>
              </button>

              {showMathDrawer && (
                <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {awards.map((badge) => {
                    const badgeRarity = RARITY_SPECS[badge.rarity];
                    return (
                      <div
                        key={badge.id}
                        className={`p-2.5 rounded-xl border transition-colors ${
                          badge.unlocked
                            ? badgeRarity.isRainbowMythic
                              ? 'bg-[#191124] border-[#E2E8F0]/80'
                              : 'bg-[#15121E] border-white/20'
                            : 'bg-black/40 border-white/5 opacity-60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-base shrink-0">{badge.icon}</span>
                            <span className="text-xs font-display font-bold text-white truncate">
                              {badge.title}
                            </span>
                            {badge.unlocked ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#36F3EB] shrink-0" />
                            ) : (
                              <Lock className="w-3 h-3 text-[#64748B] shrink-0" />
                            )}
                          </div>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border shrink-0 ${badgeRarity.badgeBgCss}`}
                          >
                            {badge.rarity.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#CBD5E1] mt-1 leading-snug">
                          {badge.quip}
                        </p>
                        <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] font-mono">
                          <code className="text-[#36F3EB] truncate">{badge.formulaText}</code>
                          <span className="text-[#E2E8F0] shrink-0">{badge.progressText}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
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
          ? 'bg-[linear-gradient(135deg,#FF1493_0%,#FF67E2_19%,#A179FF_37%,#36F3EB_55%,#F8F6FF_73%,#A8F5CA_87%,#FF1493_100%)] shadow-[0_0_20px_rgba(226,232,240,0.2)]'
          : ''
      }`}
      style={spec.isRainbowMythic ? undefined : { background: spec.borderHex }}
    >
      <div
        className={`relative h-full rounded-[14px] bg-[#0D0D14] p-3 flex flex-col justify-between gap-2.5 overflow-hidden ${
          spec.isRainbowMythic ? 'border border-[#E2E8F0]/85' : ''
        }`}
      >
        {spec.isRainbowMythic && (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-20 bg-[linear-gradient(125deg,rgba(255,20,147,0.35)_0%,rgba(54,243,235,0.25)_40%,rgba(248,246,255,0.3)_70%,rgba(161,121,255,0.35)_100%)]"
            />
            <SilverSparkleIcon className="pointer-events-none absolute top-2 right-2.5 w-3.5 h-3.5 animate-pulse" />
            <SilverSparkleIcon className="pointer-events-none absolute bottom-2.5 right-3 w-3 h-3 opacity-80" />
          </>
        )}

        {/* Top Rank + Rarity Badge */}
        <div className="relative flex items-center justify-between gap-1.5">
          <span className="text-xs font-mono font-bold text-[#E2E8F0]">
            #{rank}
          </span>
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider border ${spec.badgeBgCss}`}
          >
            {spec.isRainbowMythic && <Sparkles className="w-2.5 h-2.5 text-white" />}
            <span>{spec.label}</span>
          </span>
        </div>

        {/* Center Emoji Sprite Stage */}
        <div className="relative flex items-center gap-3 py-1">
          <div
            className={`w-14 h-14 rounded-2xl emoji-opaque-pod p-1.5 flex items-center justify-center shrink-0 border ${
              spec.isRainbowMythic ? 'border-[#E2E8F0]' : 'border-white/20'
            }`}
          >
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
            <div className="text-[11px] font-mono text-[#CBD5E1] truncate">
              {item.packTitle}
            </div>
            <div className="mt-1 inline-block px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] font-mono text-[#36F3EB] truncate max-w-full">
              {item.superlative}
            </div>
          </div>
        </div>

        {/* Bottom Stat Strip */}
        <div className="relative grid grid-cols-3 gap-1.5 pt-2 border-t border-white/10 font-mono tabular-nums text-center">
          <div className="p-1.5 rounded bg-black/60">
            <div className="text-[9px] text-[#94A3B8] uppercase">Slain</div>
            <div className="text-xs font-bold text-[#FF1493]">
              {item.totalKills.toLocaleString()}
            </div>
          </div>
          <div className="p-1.5 rounded bg-black/60">
            <div className="text-[9px] text-[#94A3B8] uppercase">Featured</div>
            <div className="text-xs font-bold text-[#36F3EB]">
              {item.timesFeatured}x
            </div>
          </div>
          <div className="p-1.5 rounded bg-black/60">
            <div className="text-[9px] text-[#94A3B8] uppercase">Power</div>
            <div className="text-xs font-bold text-[#E2E8F0]">
              {item.powerRating} ({item.tier})
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
