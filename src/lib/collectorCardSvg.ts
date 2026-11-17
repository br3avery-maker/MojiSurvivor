import { sha256Hex } from './cryptoStats';
import {
  determinePlayerCardRarity,
  evaluatePlayerAwards,
  type CardRarity,
  type PlayerStatsSnapshotForAwards,
} from './awardsAndCards';
import { formatShortNpub, type NostrProfileMeta } from './nostrEngine';
import type { RenderedScoreCard } from './scoreCardRenderer';

export interface CollectorCardData {
  player: string;
  subtitleIdentity: string;
  pubkey: string;
  rarity: string;
  rarityTier: CardRarity;
  form: string;
  cycleLevel: number;
  rebirthTier: number;
  xp: number;
  awardsUnlocked: number;
  awardsTotal: number;
  bestRun: number;
  careerScore: number;
  highestWave: number;
  runs: number;
  defeated: number;
  bosses: number;
  mojoBalance: number;
  mojoLifetime: number;
  codexUnlocks: number;
  upgradeLevels: number;
  upgradeTotal: number;
  spell: string;
  spellLevel: number;
  nemesis: string;
  nemesisKills: number;
  badges: string[];
  nostrKind: number;
  avatarDataUrl?: string;
  mojiDataUrl?: string;
  avatarPalette: string[];
}

const DEFAULT_PALETTE = ['#FF1493', '#36F3EB', '#A179FF', '#F8F6FF'];
const WHITE = '#F7F5FF';
const MUTED = '#A9ABC0';
const SILVER = '#D3D9EA';
const FONTS = "'Outfit', 'Inter', 'Arial', sans-serif";

function xmlEscape(raw: string | number): string {
  return String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function num(v: number): string {
  return Math.max(0, Math.round(v)).toLocaleString('en-US');
}

class DeterministicRng {
  private state: number;

  constructor(seedHex: string, xorMask = 0) {
    const slice = seedHex.slice(0, 8);
    const parsed = parseInt(slice, 16) || 0x1337beef;
    this.state = (parsed ^ xorMask) >>> 0;
    if (this.state === 0) this.state = 0x9e3779b9;
  }

  public nextFloat(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public randInt(minInclusive: number, maxInclusive: number): number {
    return (
      minInclusive +
      Math.floor(this.nextFloat() * (maxInclusive - minInclusive + 1))
    );
  }

  public uniform(min: number, max: number): number {
    return min + this.nextFloat() * (max - min);
  }

  public choice<T>(items: readonly T[]): T {
    return items[Math.floor(this.nextFloat() * items.length)] ?? items[0];
  }
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (max !== min) {
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h, s, v];
}

function hsvToHex(h: number, s: number, v: number): string {
  // Enforce zero-gold constraint: shift warm yellow/gold hues (0.10..0.18) toward electric magenta/cyan/violet
  let safeH = h;
  if (safeH >= 0.09 && safeH <= 0.19) {
    safeH = safeH < 0.14 ? 0.92 : 0.52;
  }
  const i = Math.floor(safeH * 6);
  const f = safeH * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r = 0;
  let g = 0;
  let b = 0;
  switch (i % 6) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    case 5:
      r = v;
      g = p;
      b = q;
      break;
  }
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n * 255)))
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Loads an image URL (such as the player's Nostr avatar or top Moji sprite),
 * converts it to a self-contained data URL for SVG embedding, and samples its
 * dominant non-gold colors.
 */
export async function resolveImageAndPalette(
  url: string | undefined,
  fallbackUrl?: string
): Promise<{ dataUrl?: string; palette: string[] }> {
  const tryLoad = (targetUrl: string): Promise<HTMLImageElement | null> =>
    new Promise((resolve) => {
      const img = new Image();
      let settled = false;
      const done = (res: HTMLImageElement | null) => {
        if (settled) return;
        settled = true;
        resolve(res);
      };
      const timer = setTimeout(() => done(null), 2400);
      if (!targetUrl.startsWith('data:') && !targetUrl.startsWith('blob:')) {
        img.crossOrigin = 'anonymous';
      }
      img.referrerPolicy = 'no-referrer';
      img.onload = () => {
        clearTimeout(timer);
        done(img.naturalWidth > 0 ? img : null);
      };
      img.onerror = () => {
        clearTimeout(timer);
        done(null);
      };
      img.src = targetUrl;
    });

  let img = url ? await tryLoad(url) : null;
  if (!img && fallbackUrl && fallbackUrl !== url) {
    img = await tryLoad(fallbackUrl);
  }
  if (!img) {
    return { dataUrl: fallbackUrl || url, palette: [...DEFAULT_PALETTE] };
  }

  try {
    const size = 160;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { dataUrl: url || fallbackUrl, palette: [...DEFAULT_PALETTE] };
    }
    ctx.drawImage(img, 0, 0, size, size);
    const dataUrl = canvas.toDataURL('image/png');

    // Sample dominant high-contrast palette from image pixels
    const px = ctx.getImageData(0, 0, size, size).data;
    const buckets = new Map<string, Array<[number, number, number]>>();
    for (let i = 0; i < px.length; i += 16) {
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      const a = px[i + 3];
      if (a < 150) continue;
      const [h, s, v] = rgbToHsv(r, g, b);
      if (s < 0.2 || v < 0.22) continue;
      const key = `${Math.round(h * 18) % 18}:${Math.round(s * 3)}`;
      const list = buckets.get(key) ?? [];
      list.push([r, g, b]);
      buckets.set(key, list);
    }

    const ranked = Array.from(buckets.values()).sort((a, b) => b.length - a.length);
    const selected: Array<[number, number, number]> = [];
    for (const bucket of ranked) {
      const avg: [number, number, number] = [
        Math.floor(bucket.reduce((s, p) => s + p[0], 0) / bucket.length),
        Math.floor(bucket.reduce((s, p) => s + p[1], 0) / bucket.length),
        Math.floor(bucket.reduce((s, p) => s + p[2], 0) / bucket.length),
      ];
      if (
        selected.every(
          (o) => Math.hypot(avg[0] - o[0], avg[1] - o[1], avg[2] - o[2]) >= 65
        )
      ) {
        selected.push(avg);
      }
      if (selected.length >= 4) break;
    }

    const palette = selected.map(([r, g, b]) => {
      const [h, s, v] = rgbToHsv(r, g, b);
      return hsvToHex(h, Math.max(0.62, s), Math.max(0.84, v));
    });

    for (const fallback of DEFAULT_PALETTE) {
      if (palette.length >= 4) break;
      if (!palette.includes(fallback)) palette.push(fallback);
    }

    return { dataUrl, palette };
  } catch {
    return { dataUrl: url || fallbackUrl, palette: [...DEFAULT_PALETTE] };
  }
}

export function buildCollectorCardData(
  stats: PlayerStatsSnapshotForAwards,
  profile?: NostrProfileMeta,
  resolvedAssets?: {
    avatarDataUrl?: string;
    mojiDataUrl?: string;
    avatarPalette?: string[];
  }
): CollectorCardData {
  const awards = evaluatePlayerAwards(stats);
  const unlocked = awards.filter((a) => a.unlocked);
  const rarityTier = determinePlayerCardRarity(stats, unlocked.length);

  const rarityMap: Record<CardRarity, { rarity: string; form: string }> = {
    mythic: { rarity: 'MYTHIC', form: 'RAINBOW' },
    epic: { rarity: 'EPIC', form: 'NEON' },
    rare: { rarity: 'RARE', form: 'CYBER' },
    uncommon: { rarity: 'UNCOMMON', form: 'MINT' },
    common: { rarity: 'COMMON', form: 'CHROME' },
  };

  const rawSpell = stats.signatureWeapon || 'Chain Storm (Lv.1)';
  const lvlMatch = /\(Lv\.(\d+)\)/i.exec(rawSpell);
  const spellLevel = lvlMatch ? parseInt(lvlMatch[1], 10) || 1 : 1;
  const cleanSpell = rawSpell.replace(/\s*\(Lv\.\d+\)/i, '').trim() || 'Chain Storm';

  const displayName =
    profile?.displayName || profile?.name || formatShortNpub(stats.pubkey);
  const subtitleIdentity = profile?.nip05 || formatShortNpub(stats.pubkey);

  const badgeTitles = (unlocked.length > 0 ? unlocked : awards.slice(0, 4))
    .slice(0, 4)
    .map((b) => b.title);

  return {
    player: displayName,
    subtitleIdentity,
    pubkey: stats.pubkey,
    rarity: rarityMap[rarityTier].rarity,
    rarityTier,
    form: rarityMap[rarityTier].form,
    cycleLevel: stats.playerLevel,
    rebirthTier: stats.rebirthCount,
    xp: stats.lifetimeXpEarned,
    awardsUnlocked: unlocked.length,
    awardsTotal: awards.length,
    bestRun: stats.highScore,
    careerScore: stats.lifetimeScore,
    highestWave: stats.bestWave,
    runs: stats.totalRuns,
    defeated: stats.totalKills,
    bosses: stats.totalBossKills,
    mojoBalance: stats.mojoBalance,
    mojoLifetime: stats.lifetimeMojoEarned,
    codexUnlocks: stats.codexUnlockedCount,
    upgradeLevels: stats.totalUpgradeLevels,
    upgradeTotal: 44,
    spell: cleanSpell,
    spellLevel,
    nemesis: stats.topMojiShortcode ? `:${stats.topMojiShortcode}:` : ':moji-swarm:',
    nemesisKills: stats.topMojiKills,
    badges: badgeTitles,
    nostrKind: 30078,
    avatarDataUrl: resolvedAssets?.avatarDataUrl || profile?.picture,
    mojiDataUrl: resolvedAssets?.mojiDataUrl || stats.topMojiUrl,
    avatarPalette:
      resolvedAssets?.avatarPalette && resolvedAssets.avatarPalette.length >= 3
        ? resolvedAssets.avatarPalette
        : [...DEFAULT_PALETTE],
  };
}

function txt(
  x: number,
  y: number,
  content: string | number,
  size = 22,
  fill = WHITE,
  weight = 500,
  anchor: 'start' | 'middle' | 'end' = 'start',
  spacing?: number
): string {
  const spAttr = spacing !== undefined ? ` letter-spacing="${spacing}"` : '';
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="${FONTS}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}"${spAttr}>${xmlEscape(
    content
  )}</text>`;
}

function rect(
  x: number,
  y: number,
  w: number,
  h: number,
  r = 0,
  fill = 'none',
  stroke = 'none',
  sw = 1,
  opacity?: string | number
): string {
  const opAttr = opacity !== undefined ? ` opacity="${opacity}"` : '';
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${opAttr}/>`;
}

function circle(
  cx: number,
  cy: number,
  r: number,
  fill = 'none',
  stroke = 'none',
  sw = 1,
  extra = ''
): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
}

function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke = SILVER,
  sw = 1,
  opacity?: string | number
): string {
  const opAttr = opacity !== undefined ? ` opacity="${opacity}"` : '';
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}"${opAttr}/>`;
}

function poly(
  points: Array<[number, number]>,
  fill: string,
  stroke = 'none',
  sw = 1,
  opacity?: string | number
): string {
  const p = points.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const opAttr = opacity !== undefined ? ` opacity="${opacity}"` : '';
  return `<polygon points="${p}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${opAttr}/>`;
}

function path(
  d: string,
  fill = 'none',
  stroke = 'none',
  sw = 1,
  extra = ''
): string {
  return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
}

function star(x: number, y: number, r: number, color = SILVER, op: string | number = 1): string {
  const d = [
    `M${x.toFixed(2)} ${(y - r).toFixed(2)}`,
    `Q${(x + r * 0.17).toFixed(2)} ${(y - r * 0.17).toFixed(2)} ${(x + r).toFixed(2)} ${y.toFixed(2)}`,
    `Q${(x + r * 0.17).toFixed(2)} ${(y + r * 0.17).toFixed(2)} ${x.toFixed(2)} ${(y + r).toFixed(2)}`,
    `Q${(x - r * 0.17).toFixed(2)} ${(y + r * 0.17).toFixed(2)} ${(x - r).toFixed(2)} ${y.toFixed(2)}`,
    `Q${(x - r * 0.17).toFixed(2)} ${(y - r * 0.17).toFixed(2)} ${x.toFixed(2)} ${(y - r).toFixed(2)} Z`,
  ].join(' ');
  return path(d, color, 'none', 1, `opacity="${op}"`);
}

function defs(data: CollectorCardData): string {
  const [c0, c1, c2] = data.avatarPalette;
  const foilStops =
    data.rarityTier === 'mythic'
      ? `<stop offset="0%" stop-color="#FF1493"/><stop offset="19%" stop-color="${c0}"/>
         <stop offset="37%" stop-color="#A179FF"/><stop offset="55%" stop-color="${c1}"/>
         <stop offset="73%" stop-color="#F8F6FF"/><stop offset="87%" stop-color="${c2}"/>
         <stop offset="100%" stop-color="#FF1493"/>`
      : data.rarityTier === 'epic'
        ? `<stop offset="0%" stop-color="${c0}"/><stop offset="50%" stop-color="#FFB6D9"/><stop offset="100%" stop-color="${c2}"/>`
        : data.rarityTier === 'rare'
          ? `<stop offset="0%" stop-color="${c1}"/><stop offset="50%" stop-color="#F8F6FF"/><stop offset="100%" stop-color="${c0}"/>`
          : data.rarityTier === 'uncommon'
            ? `<stop offset="0%" stop-color="#10B981"/><stop offset="50%" stop-color="${c1}"/><stop offset="100%" stop-color="#F8F6FF"/>`
            : `<stop offset="0%" stop-color="#94A3B8"/><stop offset="50%" stop-color="#F8F6FF"/><stop offset="100%" stop-color="${c0}"/>`;

  return `<defs>
    <linearGradient id="foil" x1="0%" y1="12%" x2="100%" y2="82%">
      ${foilStops}
    </linearGradient>
    <radialGradient id="glow">
      <stop offset="0%" stop-color="${c0}" stop-opacity="0.34"/>
      <stop offset="45%" stop-color="${c1}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="42" height="42" patternUnits="userSpaceOnUse">
      <path d="M 42 0 L 0 0 0 42" fill="none" stroke="${c0}" stroke-opacity="0.11" stroke-width="0.8"/>
    </pattern>
    <clipPath id="heroAvatarClip">
      <circle cx="360" cy="462" r="146"/>
    </clipPath>
    <clipPath id="mojiSatelliteClip">
      <circle cx="486" cy="586" r="44"/>
    </clipPath>
    <clipPath id="miniAvatarClip">
      <circle cx="114" cy="918" r="24"/>
    </clipPath>
    <clipPath id="backAvatarClip">
      <circle cx="106" cy="98" r="28"/>
    </clipPath>
    <clipPath id="backMojiClip">
      <circle cx="614" cy="802" r="30"/>
    </clipPath>
  </defs>`;
}

function svgOpen(data: CollectorCardData): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1080" viewBox="0 0 720 1080">${defs(
    data
  )}`;
}

function base(data: CollectorCardData, seedHex: string, xorMask = 0): string[] {
  const [c0, c1] = data.avatarPalette;
  const out: string[] = [
    rect(0, 0, 720, 1080, 0, '#000000'),
    rect(11, 11, 698, 1058, 36, '#09080F', 'url(#foil)', 3.2),
    rect(22, 22, 676, 1036, 28, 'none', '#FAE9FB', 0.8, 0.55),
    rect(36, 36, 648, 1008, 24, 'url(#grid)'),
    rect(36, 36, 648, 1008, 24, 'none', c0, 1, 0.45),
    rect(37, 37, 646, 1006, 24, 'url(#glow)'),
  ];

  const rng = new DeterministicRng(seedHex, xorMask);
  // Star density scales with player achievements & rebirths
  const rimCount = 56 + Math.min(40, data.awardsUnlocked * 4 + data.rebirthTier * 3);
  for (let i = 0; i < rimCount; i++) {
    const x = rng.randInt(45, 674);
    const y = rng.randInt(47, 1030);
    if (x > 115 && x < 605 && y > 110 && y < 976) {
      continue;
    }
    if (i % 5 === 0) {
      out.push(star(x, y, rng.choice([3.4, 4.2, 5.8]), SILVER, 0.72));
    } else {
      out.push(
        circle(
          x,
          y,
          rng.choice([0.8, 1.1, 1.6]),
          i % 3 === 0 ? c1 : c0,
          'none',
          1,
          'opacity="0.58"'
        )
      );
    }
  }
  return out;
}

function footer(out: string[], data: CollectorCardData, side: string): void {
  out.push(
    line(70, 1001, 650, 1001, '#73738D', 1, 0.6),
    txt(
      70,
      1028,
      `MOJISURVIVOR  /  NOSTR ${data.nostrKind}  •  ${formatShortNpub(data.pubkey)}`,
      11.5,
      MUTED,
      650,
      'start',
      1.2
    ),
    txt(650, 1028, `${side}  •  ${data.player.slice(0, 18)}`, 12, SILVER, 600, 'end')
  );
}

/**
 * Renders one clean focal circular portrait inside a crisp prismatic/silver ring
 * with soft ambient glow — no stacked shards, bolts, or overlapping satellite circles.
 */
function heroPortrait(out: string[], data: CollectorCardData): void {
  const cx = 360;
  const cy = 462;
  const [c0, c1] = data.avatarPalette;

  out.push(
    circle(cx, cy, 240, 'url(#glow)'),
    circle(cx, cy, 174, 'none', c1, 1, 'opacity="0.24"'),
    circle(cx, cy, 162, '#07070B', 'url(#foil)', 6.5),
    circle(cx, cy, 152, '#0D0B14', '#F6F7FF', 1.6, 'opacity="0.75"')
  );

  if (data.avatarDataUrl) {
    out.push(
      `<g clip-path="url(#heroAvatarClip)">`,
      rect(cx - 150, cy - 150, 300, 300, 0, '#120E1C'),
      `<image href="${xmlEscape(
        data.avatarDataUrl
      )}" x="${cx - 146}" y="${cy - 146}" width="292" height="292" preserveAspectRatio="xMidYMid slice"/>`,
      `</g>`
    );
  } else {
    out.push(
      circle(cx, cy, 144, '#130F1E', c0, 2.5),
      txt(cx, cy + 28, data.player.slice(0, 2).toUpperCase(), 88, WHITE, 900, 'middle')
    );
  }
}

export function generateCollectorCardFrontSvg(data: CollectorCardData): string {
  const seedHex = sha256Hex(`${data.pubkey}:${data.bestRun}:${data.highestWave}`);
  const out: string[] = [svgOpen(data), ...base(data, seedHex, 0)];
  const [c0, c1] = data.avatarPalette;

  const playerHeadline = data.player.toUpperCase().slice(0, 18);
  const spellSubline = `${data.spell.toUpperCase()} (LV.${data.spellLevel})   •   ${data.form} FORM`;

  out.push(
    txt(67, 90, 'MOJI  /  SURVIVOR', 20, WHITE, 850, 'start', 2.4),
    rect(520, 59, 130, 42, 21, '#15121D', 'url(#foil)', 2),
    txt(585, 86, data.rarity, 17, WHITE, 850, 'middle', 1.8),
    line(68, 117, 651, 117, '#666073', 1),
    txt(68, 160, playerHeadline, 42, WHITE, 900, 'start', -0.6),
    txt(69, 185, spellSubline, 13, c0, 750, 'start', 1.8),
    txt(
      69,
      211,
      `REBIRTH ${String(data.rebirthTier).padStart(2, '0')}    /    ${num(
        data.xp
      )} LIFETIME XP`,
      12,
      SILVER,
      700,
      'start',
      1.1
    )
  );

  heroPortrait(out, data);

  out.push(
    txt(70, 740, 'CYCLE LEVEL', 13, MUTED, 730, 'start', 2.2),
    txt(68, 800, String(data.cycleLevel).padStart(2, '0'), 64, WHITE, 900),
    txt(164, 794, 'LV', 18, c0, 800, 'start', 1),
    line(270, 728, 270, 803, '#63536C', 1),
    txt(303, 740, 'BEST SINGLE RUN', 13, MUTED, 730, 'start', 2.2),
    txt(302, 795, num(data.bestRun), 46, WHITE, 900, 'start', -1.8),
    txt(645, 795, 'PTS', 14, c0, 800, 'end'),
    line(70, 822, 650, 822, '#5D4E67', 1),
    txt(70, 852, `WAVE ${data.highestWave}`, 23, c1, 800),
    txt(360, 852, `${num(data.defeated)} SLAIN`, 20, WHITE, 750, 'middle'),
    txt(650, 852, `${data.bosses} BOSSES`, 23, SILVER, 800, 'end'),
    rect(68, 877, 584, 82, 14, '#111019', '#363041', 1.1)
  );

  if (data.avatarDataUrl) {
    out.push(
      circle(114, 918, 26, '#09080F', 'url(#foil)', 2),
      `<g clip-path="url(#miniAvatarClip)">`,
      `<image href="${xmlEscape(
        data.avatarDataUrl
      )}" x="90" y="894" width="48" height="48" preserveAspectRatio="xMidYMid slice"/>`,
      `</g>`
    );
  }

  const textStartX = data.avatarDataUrl ? 152 : 88;
  out.push(
    txt(textStartX, 910, data.subtitleIdentity.slice(0, 28), 16, WHITE, 750),
    txt(textStartX, 937, `ACHIEVEMENTS (${data.awardsUnlocked}/${data.awardsTotal})`, 11.5, MUTED, 750, 'start', 1.4)
  );

  for (let i = 0; i < data.awardsTotal; i++) {
    const x = 408 + i * 23.5;
    if (i < data.awardsUnlocked) {
      out.push(
        poly(
          [
            [x, 924],
            [x + 8, 932],
            [x, 940],
            [x - 8, 932],
          ],
          'url(#foil)',
          '#FAF7FF',
          0.8
        )
      );
    } else {
      out.push(
        poly(
          [
            [x, 924],
            [x + 8, 932],
            [x, 940],
            [x - 8, 932],
          ],
          '#191822',
          '#686476',
          1
        )
      );
    }
  }

  footer(out, data, '01 / FRONT');
  return out.join('') + '</svg>';
}

function smallStat(
  out: string[],
  x: number,
  y: number,
  heading: string,
  value: string,
  color = WHITE
): void {
  out.push(
    txt(x, y, heading, 13, MUTED, 750, 'start', 1.25),
    txt(x, y + 40, value, 31, color, 800, 'start', -0.7)
  );
}

export function generateCollectorCardBackSvg(data: CollectorCardData): string {
  const seedHex = sha256Hex(`${data.pubkey}:reverse:${data.careerScore}`);
  const out: string[] = [svgOpen(data), ...base(data, seedHex, 0x1234)];
  const [c0, c1] = data.avatarPalette;

  if (data.avatarDataUrl) {
    out.push(
      circle(106, 98, 30, '#09080F', 'url(#foil)', 2.4),
      `<g clip-path="url(#backAvatarClip)">`,
      `<image href="${xmlEscape(
        data.avatarDataUrl
      )}" x="78" y="70" width="56" height="56" preserveAspectRatio="xMidYMid slice"/>`,
      `</g>`
    );
  }

  const headerX = data.avatarDataUrl ? 150 : 68;
  out.push(
    txt(headerX, 94, 'THE CAREER ARCHIVE', 31, WHITE, 900, 'start', -0.8),
    rect(530, 61, 120, 36, 18, '#120D1C', 'url(#foil)', 2),
    txt(590, 85, data.rarity, 16, WHITE, 850, 'middle', 2),
    txt(
      headerX,
      122,
      `${data.player.slice(0, 22)}  •  ${data.subtitleIdentity.slice(0, 24)}`,
      12.5,
      MUTED,
      650,
      'start',
      0.8
    ),
    line(70, 149, 650, 149, '#686077', 1),
    txt(70, 191, 'ALL-TIME CAREER SCORE', 14, c1, 760, 'start', 2.1),
    txt(65, 270, num(data.careerScore), 64, WHITE, 900, 'start', -2),
    txt(
      73,
      294,
      `TOTAL POINTS ACROSS ${num(data.runs)} VERIFIED RUNS  •  REBIRTH TIER ${data.rebirthTier}`,
      12,
      MUTED,
      730,
      'start',
      1.3
    ),
    line(70, 318, 650, 318, '#535066', 1)
  );

  // Two-column comparison lines driven by player stats
  const specs: Array<[string, string, string]> = [
    ['EMOJIS DEFEATED', num(data.defeated), c1],
    ['HIGHEST WAVE', `WAVE ${String(data.highestWave).padStart(2, '0')}`, WHITE],
    ['APEX BOSSES SLAIN', num(data.bosses), c0],
    ['VERIFIED RUNS', num(data.runs), WHITE],
    ['MOJO BALANCE', num(data.mojoBalance), c0],
    ['LIFETIME MOJO', num(data.mojoLifetime), WHITE],
    ['CODEX ENTRIES', `${num(data.codexUnlocks)} MOJIS`, c1],
    ['UPGRADE LAB', `${data.upgradeLevels}/${data.upgradeTotal} LV`, WHITE],
  ];

  for (let row = 0; row < 4; row++) {
    const y = 348 + row * 102;
    const left = specs[2 * row];
    const right = specs[2 * row + 1];
    smallStat(out, 75, y, left[0], left[1], left[2]);
    smallStat(out, 393, y, right[0], right[1], right[2]);
    out.push(line(365, y - 12, 365, y + 47, '#373342', 1));
    if (row < 3) {
      out.push(line(75, y + 61, 642, y + 61, '#322C3D', 1));
    }
  }

  out.push(
    line(70, 733, 650, 733, '#60516C', 1),
    txt(75, 769, 'SIGNATURE SPELL & NEMESIS MOJI', 13, MUTED, 800, 'start', 1.8),
    txt(
      75,
      807,
      `${data.spell.toUpperCase().slice(0, 20)} (LV.${data.spellLevel})`,
      25,
      WHITE,
      880,
      'start',
      0.4
    ),
    txt(
      75,
      835,
      `MOST SLAIN MOJI: ${data.nemesis}   •   ${num(data.nemesisKills)} DEFEATED`,
      13.5,
      SILVER,
      650
    )
  );

  if (data.mojiDataUrl) {
    out.push(
      circle(614, 802, 34, '#120E1C', 'url(#foil)', 2.4),
      `<g clip-path="url(#backMojiClip)">`,
      `<image href="${xmlEscape(
        data.mojiDataUrl
      )}" x="588" y="776" width="52" height="52" preserveAspectRatio="xMidYMid meet"/>`,
      `</g>`
    );
  } else {
    out.push(txt(650, 807, `LV ${data.spellLevel}`, 21, c0, 800, 'end'));
  }

  out.push(
    line(70, 858, 650, 858, '#60516C', 1),
    txt(75, 890, 'VERIFIED ACHIEVEMENTS', 15, WHITE, 850, 'start', 1.4),
    txt(
      650,
      890,
      `${data.awardsUnlocked} / ${data.awardsTotal} UNLOCKED`,
      15,
      c1,
      850,
      'end'
    )
  );

  const names = data.badges.slice(0, 4);
  for (let i = 0; i < names.length; i++) {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const x = 77 + col * 300;
    const y = 918 + row * 34;
    out.push(circle(x + 8, y - 6, 6, 'url(#foil)'));
    out.push(txt(x + 22, y, names[i], 15, WHITE, 650));
  }

  footer(out, data, '02 / REVERSE');
  return out.join('') + '</svg>';
}

export function svgStringToDataUrl(svgString: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
}

async function loadSvgImage(svgString: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

export async function renderCollectorCardPng(opts: {
  stats: PlayerStatsSnapshotForAwards;
  profile?: NostrProfileMeta;
  defaultAvatarUrl?: string;
  side?: 'front' | 'back' | 'both';
}): Promise<RenderedScoreCard> {
  const { stats, profile, defaultAvatarUrl, side = 'both' } = opts;

  const [avatarResolved, mojiResolved] = await Promise.all([
    resolveImageAndPalette(profile?.picture, defaultAvatarUrl),
    resolveImageAndPalette(stats.topMojiUrl),
  ]);

  const data = buildCollectorCardData(stats, profile, {
    avatarDataUrl: avatarResolved.dataUrl,
    mojiDataUrl: mojiResolved.dataUrl,
    avatarPalette: avatarResolved.palette,
  });

  const frontSvg = generateCollectorCardFrontSvg(data);
  const backSvg = generateCollectorCardBackSvg(data);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable.');
  }

  if (side === 'both') {
    const pad = 28;
    const gap = 28;
    const cardW = 720;
    const cardH = 1080;
    canvas.width = cardW * 2 + pad * 2 + gap;
    canvas.height = cardH + pad * 2;

    ctx.fillStyle = '#08070C';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const [frontImg, backImg] = await Promise.all([
      loadSvgImage(frontSvg),
      loadSvgImage(backSvg),
    ]);
    ctx.drawImage(frontImg, pad, pad, cardW, cardH);
    ctx.drawImage(backImg, pad + cardW + gap, pad, cardW, cardH);
  } else {
    canvas.width = 720 * 2;
    canvas.height = 1080 * 2;
    const targetSvg = side === 'front' ? frontSvg : backSvg;
    const img = await loadSvgImage(targetSvg);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }

  const dataUrl = canvas.toDataURL('image/png');
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('Failed to encode collector card PNG.'));
    }, 'image/png');
  });

  const summaryText = [
    `MojiSurvivor Collector Card — ${data.player} (${data.rarity} · ${data.form} FORM)`,
    `Cycle Lv.${data.cycleLevel} · Rebirth ${String(data.rebirthTier).padStart(2, '0')} · ${num(data.xp)} Lifetime XP`,
    `Best Run: ${num(data.bestRun)} PTS (Wave ${data.highestWave}) · Career Score: ${num(data.careerScore)} PTS`,
    `Defeated: ${num(data.defeated)} Emojis (${data.bosses} Bosses) · Achievements: ${data.awardsUnlocked}/${data.awardsTotal}`,
    `#mojisurvivor`,
  ].join('\n');

  return {
    blob,
    dataUrl,
    fileName: `mojisurvivor-card-${side}-${stats.pubkey.slice(0, 8)}.png`,
    summaryText,
  };
}

export function downloadCollectorCardSvg(
  svgString: string,
  fileName: string
): void {
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
