import { formatShortNpub, type NostrProfileMeta, type VerifiedLeaderboardEntry } from './nostrEngine';
import {
  getArenaPixelTileCanvas,
  getEmojiContrastBacking,
  MOJI_APP_ICON_URL,
} from './pixelBackgrounds';
import {
  downloadScoreCardPng,
  shareOrDownloadScoreCard,
  type RenderedScoreCard,
} from './scoreCardRenderer';
import type { CodexKillRecord, PersistedGameState, RunReceiptRecord } from './storage';

export type CardRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'mythic';

export interface RarityVisualSpec {
  rarity: CardRarity;
  label: string;
  borderHex: string;
  accentHex: string;
  bgGlowCss: string;
  badgeBgCss: string;
  isRainbowMythic?: boolean;
}

/**
 * Rarity visual specification.
 * Note: Mythic/Apex uses a Prismatic Rainbow gradient with Chrome Silver (#FFFFFF / #E2E8F0) sparkles (zero gold).
 */
export const RARITY_SPECS: Record<CardRarity, RarityVisualSpec> = {
  common: {
    rarity: 'common',
    label: 'COMMON',
    borderHex: '#64748B',
    accentHex: '#CBD5E1',
    bgGlowCss: 'border-[#64748B]/70 bg-[#111111]',
    badgeBgCss: 'bg-[#1E293B] text-[#E2E8F0] border-[#64748B]',
  },
  uncommon: {
    rarity: 'uncommon',
    label: 'UNCOMMON',
    borderHex: '#10B981',
    accentHex: '#6EE7B7',
    bgGlowCss: 'border-[#10B981]/75 bg-[#0B1915]',
    badgeBgCss: 'bg-[#064E3B] text-[#A7F3D0] border-[#10B981]',
  },
  rare: {
    rarity: 'rare',
    label: 'RARE',
    borderHex: '#00F0FF',
    accentHex: '#00F0FF',
    bgGlowCss: 'border-[#00F0FF]/80 bg-[#081822]',
    badgeBgCss: 'bg-[#083344] text-[#00F0FF] border-[#00F0FF]',
  },
  epic: {
    rarity: 'epic',
    label: 'EPIC',
    borderHex: '#FF1493',
    accentHex: '#FFB6D9',
    bgGlowCss: 'border-[#FF1493]/85 bg-[#1A0814]',
    badgeBgCss: 'bg-[#5B0633] text-[#FFB6D9] border-[#FF1493]',
  },
  mythic: {
    rarity: 'mythic',
    label: 'MYTHIC · RAINBOW FOIL',
    borderHex: '#E2E8F0',
    accentHex: '#FFFFFF',
    bgGlowCss: 'border-[#E2E8F0] bg-[#140B1C]',
    badgeBgCss:
      'bg-gradient-to-r from-[#FF1493]/40 via-[#00F0FF]/35 to-[#A855F7]/40 text-white border-[#E2E8F0]',
    isRainbowMythic: true,
  },
};

export interface SillyAwardBadge {
  id: string;
  title: string;
  icon: string;
  rarity: CardRarity;
  quip: string;
  formulaText: string;
  progressText: string;
  unlocked: boolean;
}

export interface PlayerStatsSnapshotForAwards {
  pubkey: string;
  playerLevel: number;
  lifetimeXpEarned: number;
  rebirthCount: number;
  mojoBalance: number;
  lifetimeMojoEarned: number;
  highScore: number;
  lifetimeScore: number;
  bestWave: number;
  totalKills: number;
  totalBossKills: number;
  totalRuns: number;
  totalUpgradeLevels: number;
  codexUnlockedCount: number;
  topMojiShortcode?: string;
  topMojiUrl?: string;
  topMojiKills: number;
  topMojiPower?: number;
  signatureWeapon: string;
  fastestHighKillRunSec?: number;
}

const WEAPON_DISPLAY_NAMES: Record<string, string> = {
  lightning_zap: 'Chain Storm',
  garlic_aura: 'Solar Cleansing',
  orbiting_blades: 'Vortex Ring',
  plasma_lance: 'Hyper Piercer',
  nova_pulse: 'Singularity Blast',
};

export function resolveSignatureWeaponFromRuns(
  runs: Array<{ weapons?: string; weaponsSummary?: string; strongestSpellName?: string }>
): string {
  const counts = new Map<string, number>();
  let highestEvolved: string | null = null;
  let highestLvl = 0;

  for (const r of runs) {
    if (r.strongestSpellName && !highestEvolved) {
      highestEvolved = r.strongestSpellName;
    }
    const raw = r.weapons || r.weaponsSummary || '';
    if (!raw) continue;
    for (const part of raw.split(',')) {
      const [wId, lvlStr] = part.trim().split(':');
      if (!wId) continue;
      const lvl = parseInt(lvlStr ?? '1', 10) || 1;
      counts.set(wId, (counts.get(wId) ?? 0) + lvl);
      if (lvl > highestLvl) {
        highestLvl = lvl;
        const baseName = WEAPON_DISPLAY_NAMES[wId] || wId;
        highestEvolved = `${baseName} (Lv.${lvl})`;
      }
    }
  }

  if (highestEvolved) return highestEvolved;
  let bestId = 'lightning_zap';
  let bestWeight = 0;
  for (const [id, weight] of counts.entries()) {
    if (weight > bestWeight) {
      bestWeight = weight;
      bestId = id;
    }
  }
  return WEAPON_DISPLAY_NAMES[bestId] || 'Lightning Zap';
}

export function buildPlayerStatsForAwards(opts: {
  pubkey: string;
  persisted?: PersistedGameState | null;
  relayRuns?: VerifiedLeaderboardEntry[];
  localReceipts?: RunReceiptRecord[];
}): PlayerStatsSnapshotForAwards {
  const { pubkey, persisted, relayRuns = [], localReceipts = [] } = opts;

  // Deduplicate runs across localReceipts and relayRuns by dTag or eventId
  const seenKeys = new Set<string>();
  const allRuns: Array<{
    score: number;
    wave: number;
    defeated: number;
    bosses: number;
    durationSec: number;
    weapons: string;
    strongestSpellName?: string;
    featuredEmoji?: {
      emojiKey: string;
      shortcode: string;
      url: string;
      tier: string;
      powerRating: number;
    };
  }> = [];

  for (const r of localReceipts) {
    if (r.pubkey.toLowerCase() !== pubkey.toLowerCase()) continue;
    const key = r.dTag || r.signedEvent?.id || r.localId;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    allRuns.push({
      score: r.score,
      wave: r.wave,
      defeated: r.defeated,
      bosses: r.bossesDefeated,
      durationSec: r.durationSec,
      weapons: r.weaponsSummary,
      strongestSpellName: r.strongestSpellName,
      featuredEmoji: r.featuredEmoji,
    });
  }

  for (const r of relayRuns) {
    if (r.pubkey.toLowerCase() !== pubkey.toLowerCase()) continue;
    const key = r.dTag || r.eventId;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    allRuns.push({
      score: r.score,
      wave: r.wave,
      defeated: r.defeated,
      bosses: r.bosses,
      durationSec: r.durationSec,
      weapons: r.weapons,
      featuredEmoji: r.featuredEmoji,
    });
  }

  const sumRunScore = allRuns.reduce((acc, r) => acc + r.score, 0);
  const sumRunKills = allRuns.reduce((acc, r) => acc + r.defeated, 0);
  const sumRunBosses = allRuns.reduce((acc, r) => acc + r.bosses, 0);
  const maxRunScore = allRuns.reduce((acc, r) => Math.max(acc, r.score), 0);
  const maxRunWave = allRuns.reduce((acc, r) => Math.max(acc, r.wave), 1);

  const highScore = Math.max(persisted?.highScore ?? 0, maxRunScore);
  const lifetimeScore = Math.max(
    persisted?.lifetimeScore ?? 0,
    sumRunScore,
    highScore
  );
  const bestWave = Math.max(persisted?.bestWave ?? 1, maxRunWave);
  const totalKills = Math.max(persisted?.totalKills ?? 0, sumRunKills);
  const totalBossKills = Math.max(persisted?.totalBossKills ?? 0, sumRunBosses);
  const totalRuns = Math.max(persisted?.totalRuns ?? 0, allRuns.length);

  const upgrades = persisted?.upgrades;
  const totalUpgradeLevels = upgrades
    ? upgrades.attack +
      upgrades.defense +
      upgrades.speed +
      upgrades.regen +
      upgrades.magnet
    : 0;

  const codexEntries = persisted?.codex ? Object.values(persisted.codex) : [];
  const codexUnlockedCount = codexEntries.filter((c) => c.kills > 0).length;
  const sortedCodex = [...codexEntries].sort((a, b) => b.kills - a.kills);
  const topCodex = sortedCodex[0];

  // Fallback to featured emoji from runs if codex isn't present (e.g. remote player)
  const featuredFromRun = allRuns.find((r) => r.featuredEmoji)?.featuredEmoji;

  let fastestHighKillRunSec: number | undefined;
  for (const r of allRuns) {
    if (r.defeated >= 75 && r.durationSec > 0) {
      if (fastestHighKillRunSec === undefined || r.durationSec < fastestHighKillRunSec) {
        fastestHighKillRunSec = r.durationSec;
      }
    }
  }

  const estimatedLifetimeXp =
    persisted?.lifetimeXpEarned ??
    Math.round(totalKills * 1.4 + totalBossKills * 45 + bestWave * 25);

  return {
    pubkey,
    playerLevel: persisted?.playerLevel ?? Math.max(1, Math.min(30, Math.floor(bestWave / 2) + 1)),
    lifetimeXpEarned: estimatedLifetimeXp,
    rebirthCount: persisted?.rebirthCount ?? 0,
    mojoBalance: persisted?.mojoBalance ?? 0,
    lifetimeMojoEarned:
      persisted?.lifetimeMojoEarned ?? Math.round(lifetimeScore / 180),
    highScore,
    lifetimeScore,
    bestWave,
    totalKills,
    totalBossKills,
    totalRuns,
    totalUpgradeLevels,
    codexUnlockedCount,
    topMojiShortcode: topCodex?.shortcode || featuredFromRun?.shortcode,
    topMojiUrl: topCodex?.url || featuredFromRun?.url,
    topMojiKills: topCodex?.kills ?? (featuredFromRun ? Math.max(1, Math.round(totalKills / 6)) : 0),
    topMojiPower: topCodex?.powerRating ?? featuredFromRun?.powerRating,
    signatureWeapon: resolveSignatureWeaponFromRuns(allRuns),
    fastestHighKillRunSec,
  };
}

/**
 * Evaluates 10 deterministic Silly & Career Math Awards from signed run receipts and progression state.
 * Every badge includes its exact mathematical formula and current progress.
 */
export function evaluatePlayerAwards(
  stats: PlayerStatsSnapshotForAwards
): SillyAwardBadge[] {
  const isLuckyMojoNumber =
    stats.mojoBalance === 666 ||
    stats.mojoBalance === 420 ||
    stats.mojoBalance === 1337 ||
    stats.mojoBalance === 777;

  return [
    {
      id: 'ascension_addict',
      title: 'Ascension Addict',
      icon: '✨',
      rarity: 'mythic',
      quip: 'Wait, we were supposed to re-level between Rebirths?',
      formulaText: 'rebirth_tier >= 3',
      progressText: `Tier ${stats.rebirthCount} / 3`,
      unlocked: stats.rebirthCount >= 3,
    },
    {
      id: 'apex_bully',
      title: 'Apex Bully',
      icon: '👑',
      rarity: 'mythic',
      quip: 'Walked into the Boss Arena and took their lunch money.',
      formulaText: 'total_bosses >= 5',
      progressText: `${stats.totalBossKills.toLocaleString()} / 5 Bosses`,
      unlocked: stats.totalBossKills >= 5,
    },
    {
      id: 'six_figure_survivor',
      title: 'Six-Figure Survivor',
      icon: '🌈',
      rarity: 'mythic',
      quip: 'Broke the 100,000-point barrier in a single verified Arena run.',
      formulaText: 'best_run_score >= 100,000',
      progressText: `${stats.highScore.toLocaleString()} / 100,000 pts`,
      unlocked: stats.highScore >= 100_000,
    },
    {
      id: 'cursed_banker',
      title: 'The Cursed Banker',
      icon: '🔮',
      rarity: 'epic',
      quip: 'Held an auspiciously cursed Mojo balance (666 / 420 / 777 / 1337) or banked 2,000+ Mojo.',
      formulaText: 'mojo in {420,666,777,1337} OR lifetime_mojo >= 2,000',
      progressText: isLuckyMojoNumber
        ? `Exact ${stats.mojoBalance} Mojo!`
        : `${stats.lifetimeMojoEarned.toLocaleString()} / 2,000 Mojo`,
      unlocked: isLuckyMojoNumber || stats.lifetimeMojoEarned >= 2000,
    },
    {
      id: 'emoji_exterminator',
      title: 'Emoji Exterminator',
      icon: '⚡',
      rarity: 'epic',
      quip: 'Personal vendetta against custom NIP-30 PNGs.',
      formulaText: 'total_defeated >= 1,000',
      progressText: `${stats.totalKills.toLocaleString()} / 1,000 Defeated`,
      unlocked: stats.totalKills >= 1000,
    },
    {
      id: 'moji_nemesis',
      title: 'Public Enemy #1',
      icon: '🎯',
      rarity: 'epic',
      quip: 'Picked one specific emoji species and bullied it relentlessly.',
      formulaText: 'max_single_moji_kills >= 40',
      progressText: `${stats.topMojiKills.toLocaleString()} / 40 on Top Moji`,
      unlocked: stats.topMojiKills >= 40,
    },
    {
      id: 'nip30_archivist',
      title: 'NIP-30 Archivist',
      icon: '📚',
      rarity: 'rare',
      quip: 'Collecting relay emojis like holographic trading cards.',
      formulaText: 'codex_unlocked >= 20',
      progressText: `${stats.codexUnlockedCount} / 20 Unlocks`,
      unlocked: stats.codexUnlockedCount >= 20,
    },
    {
      id: 'spellweaver_supreme',
      title: 'Spellweaver Supreme',
      icon: '🌀',
      rarity: 'rare',
      quip: 'Tuned hull and spell tracks in the Upgrade Lab or evolved an arcane weapon.',
      formulaText: 'upgrade_levels >= 12 OR rebirth >= 1',
      progressText: `${stats.totalUpgradeLevels} Lv · R${stats.rebirthCount}`,
      unlocked: stats.totalUpgradeLevels >= 12 || stats.rebirthCount >= 1,
    },
    {
      id: 'marathon_anomaly',
      title: 'Endurance Anomaly',
      icon: '🏃',
      rarity: 'uncommon',
      quip: 'Refused to leave the Arena even when the swarm turned neon.',
      formulaText: 'best_wave >= 10 OR total_runs >= 8',
      progressText: `Wave ${stats.bestWave} · ${stats.totalRuns} Runs`,
      unlocked: stats.bestWave >= 10 || stats.totalRuns >= 8,
    },
    {
      id: 'speedrun_sparkler',
      title: 'Caffeine Rush',
      icon: '☕',
      rarity: 'uncommon',
      quip: 'Defeated 75+ emojis in a blitz run or completed 3+ verified runs.',
      formulaText: '(kills >= 75 & time <= 180s) OR runs >= 3',
      progressText: `${stats.totalRuns} Verified Runs`,
      unlocked:
        (stats.fastestHighKillRunSec !== undefined &&
          stats.fastestHighKillRunSec <= 180) ||
        stats.totalRuns >= 3,
    },
  ];
}

export function determinePlayerCardRarity(
  stats: PlayerStatsSnapshotForAwards,
  unlockedCount: number
): CardRarity {
  if (
    stats.rebirthCount >= 3 ||
    stats.highScore >= 150_000 ||
    stats.totalBossKills >= 5 ||
    unlockedCount >= 6
  ) {
    return 'mythic';
  }
  if (
    stats.rebirthCount >= 1 ||
    stats.highScore >= 75_000 ||
    stats.totalKills >= 1000 ||
    unlockedCount >= 4
  ) {
    return 'epic';
  }
  if (stats.highScore >= 25_000 || stats.bestWave >= 8 || unlockedCount >= 2) {
    return 'rare';
  }
  if (stats.totalRuns >= 2 || stats.highScore >= 5000) {
    return 'uncommon';
  }
  return 'common';
}

export function determineMojiRarity(opts: {
  tier: string;
  powerRating: number;
  totalKills: number;
  timesFeatured: number;
}): CardRarity {
  const { tier, powerRating, totalKills, timesFeatured } = opts;
  if (tier === 'Apex' || powerRating >= 88 || totalKills >= 200 || timesFeatured >= 3) {
    return 'mythic';
  }
  if (tier === 'Epic' || tier === 'Elite' || powerRating >= 74 || totalKills >= 75 || timesFeatured >= 2) {
    return 'epic';
  }
  if (tier === 'Rare' || powerRating >= 60 || totalKills >= 25 || timesFeatured >= 1) {
    return 'rare';
  }
  if (powerRating >= 45 || totalKills >= 5) {
    return 'uncommon';
  }
  return 'common';
}

export function getMojiSillySuperlative(
  rankIndex: number,
  moji: {
    totalKills: number;
    timesFeatured: number;
    powerRating: number;
    tier: string;
    behavior: string;
  }
): string {
  if (rankIndex === 0 && moji.totalKills > 0) return '🥇 Most Bullied Sprite';
  if (moji.timesFeatured >= 2) return '📸 Top Run Celebrity';
  if (moji.tier === 'Apex' || moji.powerRating >= 88) return '🌈 Mythic Boss Energy';
  if (moji.totalKills >= 100) return '💥 Punching Bag Hall-of-Famer';
  if (moji.behavior.includes('Stalker') || moji.behavior === 'charger') return '🏎️ Reckless Speedster';
  if (moji.behavior.includes('Sniper') || moji.behavior === 'ranged') return '🎯 Long-Range Menace';
  if (moji.behavior.includes('Brute') || moji.behavior === 'tank') return '🛡️ Absolute Chonk Unit';
  if (moji.totalKills >= 25) return '⚡ Crowd Favorite Target';
  return '👾 Arena Contender';
}

async function loadCorsCleanImage(
  url: string | undefined,
  timeoutMs = 2600
): Promise<HTMLImageElement | null> {
  if (!url) return null;
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (res: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      resolve(res);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    if (!url.startsWith('data:') && !url.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      clearTimeout(timer);
      finish(img.naturalWidth > 0 ? img : null);
    };
    img.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
    img.src = url;
  });
}

function drawFourPointSilverSparkle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius = outerRadius * 0.26
): void {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = '#E2E8F0';
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.restore();
}

/**
 * Renders a high-DPI (1280x1680) collectible Survivor Trading Card PNG.
 * Uses Prismatic Rainbow + Chrome Silver 4-Point Sparkles for Mythic rarity (zero gold).
 */
export async function renderPlayerTradingCardPng(opts: {
  stats: PlayerStatsSnapshotForAwards;
  profile?: NostrProfileMeta;
  defaultAvatarUrl: string;
}): Promise<RenderedScoreCard> {
  const { stats, profile, defaultAvatarUrl } = opts;
  const awards = evaluatePlayerAwards(stats);
  const unlockedAwards = awards.filter((a) => a.unlocked);
  const rarity = determinePlayerCardRarity(stats, unlockedAwards.length);
  const raritySpec = RARITY_SPECS[rarity];

  const width = 640;
  const height = 860;
  const scale = 2;

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable for trading card generation.');
  }
  ctx.scale(scale, scale);

  const [avatarImg, fallbackImg, mojiImg, brandIconImg] = await Promise.all([
    loadCorsCleanImage(profile?.picture),
    loadCorsCleanImage(defaultAvatarUrl),
    loadCorsCleanImage(stats.topMojiUrl),
    loadCorsCleanImage(MOJI_APP_ICON_URL),
  ]);
  const playerImg = avatarImg || fallbackImg || brandIconImg;

  // 1. Dark Collector Backdrop with 16-bit BreBre Pixel Tile Texture
  ctx.fillStyle = '#050508';
  ctx.fillRect(0, 0, width, height);

  const pixelTile = getArenaPixelTileCanvas('starlight_grid', stats.bestWave);
  if (pixelTile) {
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.imageSmoothingEnabled = false;
    for (let tx = 0; tx < width; tx += pixelTile.width) {
      for (let ty = 0; ty < height; ty += pixelTile.height) {
        ctx.drawImage(pixelTile, tx, ty);
      }
    }
    ctx.restore();
  }

  const pad = 22;

  // 2. Outer Collectible Foil Border (Prismatic Rainbow + Silver Sparkles for Mythic)
  if (raritySpec.isRainbowMythic) {
    const rainbowGrad = ctx.createLinearGradient(0, 0, width, height);
    rainbowGrad.addColorStop(0, '#FF1493');
    rainbowGrad.addColorStop(0.22, '#FF6B00');
    rainbowGrad.addColorStop(0.45, '#00F5D4');
    rainbowGrad.addColorStop(0.68, '#00F0FF');
    rainbowGrad.addColorStop(0.85, '#A855F7');
    rainbowGrad.addColorStop(1, '#FF1493');

    ctx.fillStyle = rainbowGrad;
    ctx.beginPath();
    ctx.roundRect(pad - 6, pad - 6, width - (pad - 6) * 2, height - (pad - 6) * 2, 26);
    ctx.fill();

    // Inner Chrome Silver Bezel
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(pad - 1, pad - 1, width - (pad - 1) * 2, height - (pad - 1) * 2, 22);
    ctx.stroke();
  } else {
    ctx.strokeStyle = raritySpec.borderHex;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(pad - 2, pad - 2, width - (pad - 2) * 2, height - (pad - 2) * 2, 24);
    ctx.stroke();
  }

  // Card Inner Surface
  ctx.fillStyle = '#0E0E14';
  ctx.beginPath();
  ctx.roundRect(pad + 2, pad + 2, width - (pad + 2) * 2, height - (pad + 2) * 2, 20);
  ctx.fill();

  // Subtle holographic diagonal sheen
  const sheenGrad = ctx.createLinearGradient(pad, pad, width - pad, height * 0.55);
  if (raritySpec.isRainbowMythic) {
    sheenGrad.addColorStop(0, 'rgba(255, 20, 147, 0.16)');
    sheenGrad.addColorStop(0.35, 'rgba(0, 240, 255, 0.12)');
    sheenGrad.addColorStop(0.7, 'rgba(168, 85, 247, 0.14)');
    sheenGrad.addColorStop(1, 'rgba(226, 232, 240, 0.05)');
  } else {
    sheenGrad.addColorStop(0, 'rgba(255, 20, 147, 0.10)');
    sheenGrad.addColorStop(1, 'rgba(0, 240, 255, 0.03)');
  }
  ctx.fillStyle = sheenGrad;
  ctx.beginPath();
  ctx.roundRect(pad + 2, pad + 2, width - (pad + 2) * 2, height - (pad + 2) * 2, 20);
  ctx.fill();

  // Draw Chrome Silver 4-Point Sparkles on Mythic Cards
  if (raritySpec.isRainbowMythic) {
    const sparkleCoords: Array<[number, number, number]> = [
      [pad + 34, pad + 32, 9],
      [width - pad - 34, pad + 34, 10],
      [width - pad - 48, pad + 178, 8],
      [pad + 42, pad + 240, 7],
      [width - pad - 36, height - pad - 44, 9],
      [pad + 38, height - pad - 48, 8],
    ];
    for (const [sx, sy, sr] of sparkleCoords) {
      drawFourPointSilverSparkle(ctx, sx, sy, sr);
    }
  }

  // 3. Top Collector Header Bar
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 18px "Outfit", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('MOJISURVIVOR · COLLECTOR CARD', pad + 26, pad + 40);

  ctx.fillStyle = raritySpec.accentHex;
  ctx.font = '700 12px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(raritySpec.label, width - pad - 26, pad + 39);

  // 4. Portrait Hero Stage
  const stageX = pad + 24;
  const stageY = pad + 56;
  const stageW = width - (pad + 24) * 2;
  const stageH = 152;

  ctx.fillStyle = '#15101D';
  ctx.strokeStyle = raritySpec.isRainbowMythic ? '#E2E8F0' : raritySpec.borderHex;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(stageX, stageY, stageW, stageH, 16);
  ctx.fill();
  ctx.stroke();

  // Avatar Pod
  const avX = stageX + 66;
  const avY = stageY + stageH / 2;
  const avR = 44;

  ctx.save();
  ctx.fillStyle = '#5B0633';
  ctx.strokeStyle = raritySpec.isRainbowMythic ? '#E2E8F0' : '#FF1493';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(avX, avY, avR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#E2E8F0';
  ctx.beginPath();
  ctx.arc(avX, avY, avR - 4, 0, Math.PI * 2);
  ctx.fill();

  if (playerImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(avX, avY, avR - 3, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(
      playerImg,
      avX - (avR - 3),
      avY - (avR - 3),
      (avR - 3) * 2,
      (avR - 3) * 2
    );
    ctx.restore();
  }
  ctx.restore();

  const displayName =
    profile?.displayName || profile?.name || formatShortNpub(stats.pubkey);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 26px "Outfit", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(displayName.slice(0, 22), stageX + 128, stageY + 52);

  ctx.fillStyle = '#B8B8B8';
  ctx.font = '500 13px "JetBrains Mono", monospace';
  ctx.fillText(
    profile?.nip05 ? profile.nip05.slice(0, 34) : formatShortNpub(stats.pubkey),
    stageX + 128,
    stageY + 76
  );

  // Cycle Level + Rebirth + All-Time XP Pill
  ctx.fillStyle = '#FF1493';
  ctx.font = '700 15px "JetBrains Mono", monospace';
  const levelLine = `Cycle Lv.${stats.playerLevel}  ·  Rebirth Tier ${stats.rebirthCount}`;
  ctx.fillText(levelLine, stageX + 128, stageY + 106);

  ctx.fillStyle = '#E2E8F0';
  ctx.font = '600 12px "JetBrains Mono", monospace';
  ctx.fillText(
    `All-Time XP: ${stats.lifetimeXpEarned.toLocaleString()} XP  ·  ${unlockedAwards.length}/${awards.length} Awards`,
    stageX + 128,
    stageY + 129
  );

  // 5. 6-Cell Career & Best Run Stat Matrix
  const gridY = stageY + stageH + 18;
  const colW = (stageW - 14) / 2;
  const rowH = 68;

  const statCells: Array<{ label: string; value: string; color: string }> = [
    {
      label: 'BEST SINGLE RUN',
      value: `${stats.highScore.toLocaleString()} PTS`,
      color: '#FF1493',
    },
    {
      label: 'ALL-TIME CAREER SCORE',
      value: `${stats.lifetimeScore.toLocaleString()} PTS`,
      color: '#FFFFFF',
    },
    {
      label: 'HIGHEST WAVE · RUNS',
      value: `WAVE ${stats.bestWave} · ${stats.totalRuns} RUNS`,
      color: '#00F0FF',
    },
    {
      label: 'EMOJIS · APEX BOSSES SLAIN',
      value: `${stats.totalKills.toLocaleString()} · ${stats.totalBossKills} BOSS`,
      color: '#E2E8F0',
    },
    {
      label: 'MOJO BANK · LIFETIME',
      value: `${stats.mojoBalance.toLocaleString()} (${stats.lifetimeMojoEarned.toLocaleString()})`,
      color: '#FFB6D9',
    },
    {
      label: 'CODEX UNLOCKS · UPGRADES',
      value: `${stats.codexUnlockedCount} MOJIS · ${stats.totalUpgradeLevels}/44 LV`,
      color: '#00F5D4',
    },
  ];

  statCells.forEach((cell, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const cx = stageX + col * (colW + 14);
    const cy = gridY + row * (rowH + 10);

    ctx.fillStyle = '#14141D';
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(cx, cy, colW, rowH, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#94A3B8';
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(cell.label, cx + 14, cy + 24);

    ctx.fillStyle = cell.color;
    ctx.font = '700 18px "JetBrains Mono", monospace';
    ctx.fillText(cell.value.slice(0, 24), cx + 14, cy + 50);
  });

  // 6. Signature Spell & Nemesis Moji Strip
  const nemesisY = gridY + (rowH + 10) * 3 + 6;
  ctx.fillStyle = '#14141D';
  ctx.strokeStyle = 'rgba(255, 20, 147, 0.35)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(stageX, nemesisY, stageW, 88, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#94A3B8';
  ctx.font = '600 10px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText('SIGNATURE SPELL & NEMESIS MOJI', stageX + 16, nemesisY + 24);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 17px "Outfit", system-ui, sans-serif';
  ctx.fillText(`Spell: ${stats.signatureWeapon}`, stageX + 16, nemesisY + 48);

  ctx.fillStyle = '#FFB6D9';
  ctx.font = '500 12px "JetBrains Mono", monospace';
  const mojiText = stats.topMojiShortcode
    ? `Most Slain Moji: :${stats.topMojiShortcode}: (${stats.topMojiKills.toLocaleString()} defeated)`
    : `Total Emojis Defeated: ${stats.totalKills.toLocaleString()}`;
  ctx.fillText(mojiText.slice(0, 48), stageX + 16, nemesisY + 71);

  if (mojiImg && stats.topMojiUrl) {
    const podX = stageX + stageW - 48;
    const podY = nemesisY + 44;
    const backing = getEmojiContrastBacking(mojiImg, stats.topMojiUrl);
    ctx.fillStyle = backing.outerFill;
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(podX - 28, podY - 28, 56, 56, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = backing.innerCushionFill;
    ctx.beginPath();
    ctx.roundRect(podX - 23, podY - 23, 46, 46, 9);
    ctx.fill();
    ctx.drawImage(mojiImg, podX - 20, podY - 20, 40, 40);
  }

  // 7. Unlocked Silly Awards Showcase
  const awardsY = nemesisY + 102;
  ctx.fillStyle = '#E2E8F0';
  ctx.font = '700 12px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(
    `VERIFIED SILLY AWARDS & MATH BADGES (${unlockedAwards.length}/${awards.length})`,
    stageX,
    awardsY + 14
  );

  const showcaseAwards = (unlockedAwards.length > 0 ? unlockedAwards : awards).slice(0, 4);
  const badgeW = (stageW - 12) / 2;
  const badgeH = 54;

  showcaseAwards.forEach((badge, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const bx = stageX + col * (badgeW + 12);
    const by = awardsY + 24 + row * (badgeH + 10);

    ctx.fillStyle = badge.unlocked ? '#1A1224' : '#111116';
    ctx.strokeStyle = badge.unlocked
      ? RARITY_SPECS[badge.rarity].borderHex
      : 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(bx, by, badgeW, badgeH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = badge.unlocked ? '#FFFFFF' : '#64748B';
    ctx.font = '700 13px "Outfit", system-ui, sans-serif';
    ctx.fillText(`${badge.icon} ${badge.title}`.slice(0, 24), bx + 12, by + 23);

    ctx.fillStyle = badge.unlocked ? '#00F0FF' : '#475569';
    ctx.font = '500 10px "JetBrains Mono", monospace';
    ctx.fillText(
      `${badge.formulaText} · ${badge.progressText}`.slice(0, 34),
      bx + 12,
      by + 42
    );
  });

  // 8. Cryptographic Queryable Footer
  ctx.fillStyle = '#94A3B8';
  ctx.font = '500 11px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(
    `QUERYABLE NOSTR SAVE · kind:30078 · ${formatShortNpub(stats.pubkey)}`,
    stageX,
    height - pad - 22
  );

  ctx.fillStyle = '#E2E8F0';
  ctx.textAlign = 'right';
  ctx.fillText('#mojisurvivor', width - pad - 24, height - pad - 22);

  const dataUrl = canvas.toDataURL('image/png');
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('Failed to encode trading card PNG blob.'));
    }, 'image/png');
  });

  const summaryText = [
    `MojiSurvivor Collector Card — ${displayName} (${raritySpec.label})`,
    `Cycle Lv.${stats.playerLevel} · Rebirth Tier ${stats.rebirthCount} · All-Time XP: ${stats.lifetimeXpEarned.toLocaleString()}`,
    `Best Run: ${stats.highScore.toLocaleString()} pts (W${stats.bestWave}) · Career Score: ${stats.lifetimeScore.toLocaleString()} pts`,
    `Defeated: ${stats.totalKills.toLocaleString()} emojis (${stats.totalBossKills} Apex Bosses) · Awards: ${unlockedAwards.map((a) => a.title).join(', ') || 'None yet'}`,
    `#mojisurvivor`,
  ].join('\n');

  return {
    blob,
    dataUrl,
    fileName: `mojisurvivor-card-${stats.pubkey.slice(0, 8)}.png`,
    summaryText,
  };
}

export { downloadScoreCardPng, shareOrDownloadScoreCard };
