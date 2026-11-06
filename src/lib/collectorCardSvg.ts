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
}

const PINK = '#FF1493';
const WHITE = '#F7F5FF';
const MUTED = '#A9ABC0';
const SILVER = '#D3D9EA';
const CYAN = '#36F3EB';
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

/**
 * Deterministic PRNG seeded from player identity string (matches Python generator's deterministic seeding).
 */
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

export function buildCollectorCardData(
  stats: PlayerStatsSnapshotForAwards,
  profile?: NostrProfileMeta
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

  // Parse spell name and level from stats.signatureWeapon (e.g., "Chain Storm (Lv.4)")
  const rawSpell = stats.signatureWeapon || 'Chain Storm (Lv.1)';
  const lvlMatch = /\(Lv\.(\d+)\)/i.exec(rawSpell);
  const spellLevel = lvlMatch ? parseInt(lvlMatch[1], 10) || 1 : 1;
  const cleanSpell = rawSpell.replace(/\s*\(Lv\.\d+\)/i, '').trim() || 'Chain Storm';

  const displayName =
    profile?.displayName || profile?.name || formatShortNpub(stats.pubkey);

  const badgeTitles = (unlocked.length > 0 ? unlocked : awards.slice(0, 4))
    .slice(0, 4)
    .map((b) => b.title);

  return {
    player: displayName,
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

function defs(rarityTier: CardRarity): string {
  // Prismatic rainbow + silver foil for Mythic; distinct zero-gold gradients for other tiers
  const foilStops =
    rarityTier === 'mythic'
      ? `<stop offset="0%" stop-color="#FF1493"/><stop offset="19%" stop-color="#FF67E2"/>
         <stop offset="37%" stop-color="#A179FF"/><stop offset="55%" stop-color="#36F3EB"/>
         <stop offset="73%" stop-color="#F8F6FF"/><stop offset="87%" stop-color="#A8F5CA"/>
         <stop offset="100%" stop-color="#FF1493"/>`
      : rarityTier === 'epic'
        ? `<stop offset="0%" stop-color="#FF1493"/><stop offset="50%" stop-color="#FFB6D9"/><stop offset="100%" stop-color="#A179FF"/>`
        : rarityTier === 'rare'
          ? `<stop offset="0%" stop-color="#36F3EB"/><stop offset="50%" stop-color="#F8F6FF"/><stop offset="100%" stop-color="#5B92EF"/>`
          : rarityTier === 'uncommon'
            ? `<stop offset="0%" stop-color="#10B981"/><stop offset="50%" stop-color="#A8F5CA"/><stop offset="100%" stop-color="#36F3EB"/>`
            : `<stop offset="0%" stop-color="#94A3B8"/><stop offset="50%" stop-color="#F8F6FF"/><stop offset="100%" stop-color="#64748B"/>`;

  return `<defs>
    <linearGradient id="foil" x1="0%" y1="12%" x2="100%" y2="82%">
      ${foilStops}
    </linearGradient>
    <linearGradient id="prism" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#30102B"/><stop offset="36%" stop-color="#3C185C"/>
      <stop offset="62%" stop-color="#133944"/><stop offset="100%" stop-color="#240B28"/>
    </linearGradient>
    <linearGradient id="orb" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset="0.62" stop-color="#E7E9F2"/>
      <stop offset="1" stop-color="#A4B2CB"/>
    </linearGradient>
    <radialGradient id="glow">
      <stop offset="0%" stop-color="#DD35F9" stop-opacity="0.30"/>
      <stop offset="45%" stop-color="#8B1AA6" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="42" height="42" patternUnits="userSpaceOnUse">
      <path d="M 42 0 L 0 0 0 42" fill="none" stroke="#9F6AC5" stroke-opacity="0.09" stroke-width="0.8"/>
    </pattern>
  </defs>`;
}

function svgOpen(rarityTier: CardRarity): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1080" viewBox="0 0 720 1080">${defs(
    rarityTier
  )}`;
}

function base(seedHex: string, xorMask = 0): string[] {
  const out: string[] = [
    rect(0, 0, 720, 1080, 0, '#000000'),
    rect(11, 11, 698, 1058, 36, '#09080F', 'url(#foil)', 3),
    rect(22, 22, 676, 1036, 28, 'none', '#FAE9FB', 0.7, 0.52),
    rect(36, 36, 648, 1008, 24, 'url(#grid)'),
    rect(36, 36, 648, 1008, 24, 'none', '#4C274B', 1),
    rect(37, 37, 646, 1006, 24, 'url(#glow)'),
  ];

  const rng = new DeterministicRng(seedHex, xorMask);
  for (let i = 0; i < 74; i++) {
    const x = rng.randInt(45, 674);
    const y = rng.randInt(47, 1030);
    // Restrict stars mostly to rim; keep all content clear
    if (x > 115 && x < 605 && y > 110 && y < 976) {
      continue;
    }
    if (i % 6 === 0) {
      out.push(star(x, y, rng.choice([3.4, 4, 5.8]), SILVER, 0.65));
    } else {
      out.push(
        circle(
          x,
          y,
          rng.choice([0.7, 1, 1.5]),
          i % 4 === 0 ? CYAN : PINK,
          'none',
          1,
          'opacity="0.55"'
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
      `MOJISURVIVOR  /  NOSTR ${data.nostrKind}`,
      12,
      MUTED,
      650,
      'start',
      1.5
    ),
    txt(650, 1028, `${side}  •  ${data.player}`, 12, SILVER, 500, 'end')
  );
}

function hero(out: string[], seedHex: string): void {
  const rng = new DeterministicRng(seedHex, 0);
  const cx = 360;
  const cy = 462;

  out.push(
    circle(cx, cy, 252, 'url(#glow)'),
    circle(
      cx,
      cy,
      211,
      'none',
      '#FF1493',
      1.0,
      'stroke-dasharray="2 16" opacity="0.48"'
    ),
    circle(cx, cy, 196, 'none', '#BCEFFC', 0.9, 'opacity="0.33"')
  );

  // Angular foil shards: deterministic per npub/pubkey
  const palette = ['#FF1493', '#CC3BFC', '#8A76FF', '#39E5E0', '#CCE2FF', '#5B92EF'];
  for (let i = 0; i < 16; i++) {
    const a = (i * 2 * Math.PI) / 16 + (-9 * Math.PI) / 180;
    const b = a + (rng.uniform(11, 20) * Math.PI) / 180;
    const inner = rng.uniform(167, 192);
    const outer = rng.uniform(205, 258);
    const points: Array<[number, number]> = [
      [cx + inner * Math.cos(a), cy + inner * Math.sin(a)],
      [cx + outer * Math.cos(a + 0.05), cy + outer * Math.sin(a + 0.05)],
      [cx + outer * 0.9 * Math.cos(b), cy + outer * 0.9 * Math.sin(b)],
      [cx + (inner - 15) * Math.cos(b - 0.05), cy + (inner - 15) * Math.sin(b - 0.05)],
    ];
    out.push(
      poly(
        points,
        palette[i % palette.length],
        'none',
        1,
        (0.13 + 0.14 * (i % 3)).toFixed(2)
      )
    );
  }

  // Hero emblem's rings and silhouette
  out.push(
    circle(cx, cy, 172, '#05050B', '#605179', 14),
    circle(cx, cy, 174, 'none', 'url(#foil)', 8),
    circle(cx, cy, 161, 'none', '#F6F7FF', 2.5, 'opacity="0.89"'),
    circle(cx, cy, 152, 'url(#orb)'),
    circle(cx - 47, cy - 42, 13, '#06060B'),
    circle(cx + 47, cy - 42, 13, '#06060B'),
    // X pupils
    path(
      `M ${cx - 64} ${cy - 60} l 34 36 m 0 -36 l -34 36`,
      'none',
      '#0A0A10',
      9,
      'stroke-linecap="round"'
    ),
    path(
      `M ${cx + 30} ${cy - 60} l 34 36 m 0 -36 l -34 36`,
      'none',
      '#0A0A10',
      9,
      'stroke-linecap="round"'
    ),
    path(
      `M ${cx - 81} ${cy + 45} Q ${cx} ${cy + 119} ${cx + 84} ${cy + 34}`,
      'none',
      '#0B0B11',
      13,
      'stroke-linecap="round"'
    ),
    path(
      `M ${cx + 26} ${cy + 77} q 5 44 29 37 q 18 -6 9 -47`,
      PINK,
      '#0D0C13',
      6
    ),
    path(`M ${cx + 47} ${cy + 100} q 12 2 16 -12`, 'none', '#FFBBE2', 3)
  );

  // Electrified chain: polygon lightning with anchor rivets
  const bolts: Array<[number, number, number, number]> = [
    [121, 394, 1, -8],
    [557, 502, 0.92, 8],
    [258, 646, 0.72, -18],
  ];
  const baseBoltPts: Array<[number, number]> = [
    [-7, -73],
    [30, -73],
    [7, -16],
    [34, -16],
    [-29, 76],
    [-11, 10],
    [-39, 10],
  ];

  for (const [bx, by, sc, rot] of bolts) {
    const a = (rot * Math.PI) / 180;
    const transformed: Array<[number, number]> = baseBoltPts.map(([u, v]) => [
      bx + sc * (u * Math.cos(a) - v * Math.sin(a)),
      by + sc * (u * Math.sin(a) + v * Math.cos(a)),
    ]);
    out.push(poly(transformed, '#F7F8FF', '#25D8F3', 2.4));
    out.push(circle(bx, by, 9, '#06050A', PINK, 3));
  }

  // Chain link segments
  const chains: Array<[[number, number], [number, number]]> = [
    [
      [155, 554],
      [228, 608],
    ],
    [
      [493, 355],
      [567, 329],
    ],
  ];
  for (const [[x1, y1], [x2, y2]] of chains) {
    out.push(line(x1, y1, x2, y2, '#DDD7F0', 7, 0.66));
    for (let j = 0; j < 4; j++) {
      const t = (j + 0.5) / 4;
      const px = x1 + t * (x2 - x1);
      const py = y1 + t * (y2 - y1);
      out.push(circle(px, py, 9, '#090910', SILVER, 4));
    }
  }

  const stars: Array<[number, number, number]> = [
    [143, 290, 7],
    [576, 420, 6],
    [183, 607, 11],
    [581, 615, 8],
    [316, 228, 6],
  ];
  for (const [sx, sy, sr] of stars) {
    out.push(star(sx, sy, sr, SILVER));
  }
}

export function generateCollectorCardFrontSvg(data: CollectorCardData): string {
  const seedHex = sha256Hex(data.pubkey || data.player);
  const out: string[] = [svgOpen(data.rarityTier), ...base(seedHex, 0)];

  const spellHeadline = data.spell.toUpperCase().slice(0, 18);
  out.push(
    txt(67, 90, 'MOJI  /  SURVIVOR', 20, WHITE, 850, 'start', 2.4),
    rect(520, 59, 130, 42, 21, '#15121D', 'url(#foil)', 2),
    txt(585, 88, data.rarity, 18, WHITE, 850, 'middle', 1.8),
    line(68, 117, 651, 117, '#666073', 1),
    txt(68, 160, spellHeadline, 44, WHITE, 900, 'start', -0.8),
    txt(
      69,
      184,
      `SIGNATURE MOJI    •    ${data.form} FORM`,
      13,
      PINK,
      750,
      'start',
      2
    ),
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

  hero(out, seedHex);

  out.push(
    txt(70, 740, 'CYCLE LEVEL', 13, MUTED, 730, 'start', 2.2),
    txt(68, 800, String(data.cycleLevel).padStart(2, '0'), 64, WHITE, 900),
    txt(164, 794, 'LV', 18, PINK, 800, 'start', 1),
    line(270, 728, 270, 803, '#63536C', 1),
    txt(303, 740, 'BEST RUN', 13, MUTED, 730, 'start', 2.2),
    txt(302, 795, num(data.bestRun), 46, WHITE, 900, 'start', -1.8),
    txt(645, 795, 'PTS', 14, PINK, 800, 'end'),
    line(70, 822, 650, 822, '#5D4E67', 1),
    txt(70, 852, `WAVE ${data.highestWave}`, 23, CYAN, 800),
    txt(650, 852, `${data.bosses} BOSSES`, 23, SILVER, 800, 'end'),
    rect(68, 877, 584, 82, 14, '#111019', '#363041', 1.1),
    txt(88, 908, data.player.slice(0, 26), 18, WHITE, 750),
    txt(88, 937, 'ACHIEVEMENTS', 12, MUTED, 750, 'start', 1.7)
  );

  for (let i = 0; i < data.awardsTotal; i++) {
    const x = 400 + i * 24.6;
    if (i < data.awardsUnlocked) {
      out.push(
        poly(
          [
            [x, 927],
            [x + 8, 934],
            [x, 941],
            [x - 8, 934],
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
            [x, 927],
            [x + 8, 934],
            [x, 941],
            [x - 8, 934],
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
  const seedHex = sha256Hex(data.pubkey || data.player);
  const out: string[] = [svgOpen(data.rarityTier), ...base(seedHex, 0x1234)];

  out.push(
    txt(68, 94, 'THE CAREER ARCHIVE', 34, WHITE, 900, 'start', -0.8),
    rect(530, 61, 120, 36, 18, '#120D1C', 'url(#foil)', 2),
    txt(590, 85, data.rarity, 16, WHITE, 850, 'middle', 2),
    txt(
      70,
      127,
      `PERMANENT RECORD  /  ${data.player.slice(0, 28)}`,
      13,
      MUTED,
      650,
      'start',
      1.0
    ),
    line(70, 149, 650, 149, '#686077', 1),
    txt(70, 191, 'ALL-TIME CAREER SCORE', 14, CYAN, 760, 'start', 2.1),
    txt(65, 270, num(data.careerScore), 65, WHITE, 900, 'start', -2),
    txt(73, 294, 'TOTAL POINTS', 12, MUTED, 730, 'start', 1.5),
    line(70, 318, 650, 318, '#535066', 1)
  );

  // Two-column comparison lines (NOT 6 dashboard cards)
  const specs: Array<[string, string, string]> = [
    ['EMOJIS DEFEATED', num(data.defeated), CYAN],
    ['HIGHEST WAVE', String(data.highestWave).padStart(2, '0'), WHITE],
    ['BOSSES SLAIN', num(data.bosses), PINK],
    ['RUNS', String(data.runs), WHITE],
    ['MOJO BALANCE', num(data.mojoBalance), PINK],
    ['LIFETIME MOJO', num(data.mojoLifetime), WHITE],
    ['CODEX ENTRIES', num(data.codexUnlocks), CYAN],
    ['UPGRADE LEVELS', `${data.upgradeLevels}/${data.upgradeTotal}`, WHITE],
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
    txt(75, 769, 'SIGNATURE', 13, MUTED, 800, 'start', 1.8),
    txt(75, 807, data.spell.toUpperCase().slice(0, 22), 26, WHITE, 880, 'start', 0.4),
    txt(650, 807, `LV ${data.spellLevel}`, 21, PINK, 800, 'end'),
    txt(
      75,
      833,
      `NEMESIS: ${data.nemesis}   /   ${num(data.nemesisKills)} DEFEATED`,
      14,
      SILVER,
      650
    ),
    line(70, 858, 650, 858, '#60516C', 1),
    txt(75, 890, 'VERIFIED ACHIEVEMENTS', 15, WHITE, 850, 'start', 1.4),
    txt(
      650,
      890,
      `${data.awardsUnlocked} / ${data.awardsTotal}`,
      15,
      CYAN,
      850,
      'end'
    )
  );

  // Four featured award names in two clean rows
  const names = data.badges.slice(0, 4);
  for (let i = 0; i < names.length; i++) {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const x = 77 + col * 300;
    const y = 916 + row * 34;
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

/**
 * Renders the Two-Sided Collector Card (Front, Reverse, or Side-by-Side Dual Spread)
 * to a high-DPI PNG blob for sharing or downloading.
 */
export async function renderCollectorCardPng(opts: {
  stats: PlayerStatsSnapshotForAwards;
  profile?: NostrProfileMeta;
  side?: 'front' | 'back' | 'both';
}): Promise<RenderedScoreCard> {
  const { stats, profile, side = 'both' } = opts;
  const data = buildCollectorCardData(stats, profile);
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
