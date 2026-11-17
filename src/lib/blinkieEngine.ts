import { sha256Hex } from './cryptoStats';
import type { CollectorCardData } from './collectorCardSvg';

export type BlinkieLayout = 'classic' | 'ticker' | 'arcade';
export type BlinkieBorder = 'dots' | 'checker' | 'comet';
export type BlinkieAnimation = 'bounce' | 'march' | 'sparkle';
export type BlinkieStatFocus = 'career' | 'spell' | 'award' | 'nemesis';

export interface BlinkieTemplate {
  id: BlinkieStatFocus;
  name: string;
  width: number;
  height: number;
  layout: BlinkieLayout;
  border: BlinkieBorder;
  animation: BlinkieAnimation;
}

export const BLINKIE_FOCUS_MODES: readonly BlinkieTemplate[] = [
  {
    id: 'career',
    name: 'Survivor ID & Best Run',
    width: 620,
    height: 124,
    layout: 'classic',
    border: 'dots',
    animation: 'bounce',
  },
  {
    id: 'spell',
    name: 'Signature Spell & Wave',
    width: 640,
    height: 124,
    layout: 'ticker',
    border: 'checker',
    animation: 'march',
  },
  {
    id: 'award',
    name: 'Verified Award Flex',
    width: 620,
    height: 124,
    layout: 'arcade',
    border: 'comet',
    animation: 'sparkle',
  },
  {
    id: 'nemesis',
    name: 'Nemesis Moji Hunter',
    width: 640,
    height: 124,
    layout: 'ticker',
    border: 'dots',
    animation: 'sparkle',
  },
];

export const DEFAULT_BLINKIE_COLORS: readonly string[] = [
  '#FF1493',
  '#36F3EB',
  '#A179FF',
  '#F8F6FF',
];

const FPS = 8;
const FACES = ['wink', 'star', 'xeye', 'happy'] as const;
type FaceKind = (typeof FACES)[number];

/**
 * Hand-drawn 5x7 bitmap font ported from blinkie.py.
 * Renders crisp <rect> pixel blocks with zero dependency on system fonts.
 */
const FONT: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10011', '10101', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '★': ['00100', '10101', '01110', '11111', '01110', '10101', '00100'],
  '>': ['10000', '01000', '00100', '00010', '00100', '01000', '10000'],
  '<': ['00001', '00010', '00100', '01000', '00100', '00010', '00001'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  _: ['00000', '00000', '00000', '00000', '00000', '00000', '11111'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '*': ['00000', '10101', '01110', '11111', '01110', '10101', '00000'],
  '`': ['01000', '00100', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '00100', '00100', '01000'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '/': ['00001', '00001', '00010', '00100', '01000', '10000', '10000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  '#': ['01010', '01010', '11111', '01010', '11111', '01010', '01010'],
  '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
  '@': ['01110', '10001', '10111', '10101', '10111', '10000', '01110'],
};

function xmlEscape(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function rect(x: number, y: number, w: number, h: number, fill: string, extra = ''): string {
  return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(
    2
  )}" height="${h.toFixed(2)}" fill="${fill}" ${extra}/>`;
}

function sanitizeBitmapText(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9 ★><\-_+*`.,:/!?#=@]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bitmap(
  text: string,
  x: number,
  y: number,
  scale = 3,
  fill = '#ffffff',
  spacing = 1,
  wave = 0,
  phase = 0,
  maxWidth?: number
): string {
  const parts: string[] = [];
  const maxChars = maxWidth ? Math.floor(maxWidth / ((5 + spacing) * scale)) : 1000;
  const clean = sanitizeBitmapText(text).slice(0, maxChars);

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const pat = FONT[ch] ?? FONT[' '];
    const offset = wave
      ? Math.round(Math.sin((phase / 8) * 2 * Math.PI + i * 1.17) * wave)
      : 0;
    const xx = x + i * (5 + spacing) * scale;
    for (let row = 0; row < pat.length; row++) {
      const lineStr = pat[row];
      for (let col = 0; col < lineStr.length; col++) {
        if (lineStr[col] === '1') {
          parts.push(
            rect(xx + col * scale, y + row * scale + offset, scale, scale, fill)
          );
        }
      }
    }
  }
  return parts.join('');
}

function star(x: number, y: number, size: number, color: string): string {
  const s23 = (size * 0.23).toFixed(2);
  return `<path d="M${x} ${y - size} L${(x + size * 0.23).toFixed(2)} ${(
    y -
    size * 0.23
  ).toFixed(2)} L${x + size} ${y} L${(x + size * 0.23).toFixed(2)} ${(
    y +
    size * 0.23
  ).toFixed(2)} L${x} ${y + size} L${(x - size * 0.23).toFixed(2)} ${(
    y +
    size * 0.23
  ).toFixed(2)} L${x - size} ${y} L${(x - Number(s23)).toFixed(2)} ${(
    y -
    Number(s23)
  ).toFixed(2)} Z" fill="${color}"/>`;
}

function face(cx: number, cy: number, r: number, kind: FaceKind, accent: string): string {
  let s: string[] = [
    `<circle cx="${cx}" cy="${cy}" r="${r + 2.5}" fill="#060509" stroke="${accent}" stroke-width="2.5"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#faf7ff"/>`,
    `<circle cx="${(cx - r * 0.27).toFixed(2)}" cy="${(cy - r * 0.22).toFixed(
      2
    )}" r="${(r * 0.11).toFixed(2)}" fill="#101016"/>`,
  ];

  if (kind === 'wink') {
    s.push(
      `<path d="M${(cx + r * 0.12).toFixed(2)} ${(cy - r * 0.2).toFixed(2)} l${(
        r * 0.32
      ).toFixed(2)} 0" stroke="#101016" stroke-width="2.5" stroke-linecap="round"/>`,
      `<path d="M${(cx - r * 0.35).toFixed(2)} ${(cy + r * 0.18).toFixed(2)} Q${cx} ${(
        cy +
        r * 0.6
      ).toFixed(2)} ${(cx + r * 0.34).toFixed(2)} ${(cy + r * 0.16).toFixed(
        2
      )}" fill="none" stroke="#101016" stroke-width="2.5" stroke-linecap="round"/>`
    );
  } else if (kind === 'star') {
    s.push(
      star(
        Number((cx + r * 0.25).toFixed(2)),
        Number((cy - r * 0.24).toFixed(2)),
        Number((r * 0.16).toFixed(2)),
        accent
      ),
      `<path d="M${(cx - r * 0.4).toFixed(2)} ${(cy + r * 0.16).toFixed(2)} Q${cx} ${(
        cy +
        r * 0.7
      ).toFixed(2)} ${(cx + r * 0.42).toFixed(2)} ${(cy + r * 0.15).toFixed(
        2
      )} Z" fill="#111017"/>`
    );
  } else if (kind === 'xeye') {
    s = [
      `<circle cx="${cx}" cy="${cy}" r="${r + 2.5}" fill="#060509" stroke="${accent}" stroke-width="2.5"/>`,
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#faf7ff"/>`,
    ];
    for (const ex of [cx - r * 0.3, cx + r * 0.3]) {
      s.push(
        `<path d="M${(ex - r * 0.09).toFixed(2)} ${(cy - r * 0.35).toFixed(2)} l${(
          r * 0.18
        ).toFixed(2)} ${(r * 0.18).toFixed(2)} m0 ${(-r * 0.18).toFixed(2)} l${(
          -r * 0.18
        ).toFixed(2)} ${(r * 0.18).toFixed(
          2
        )}" fill="none" stroke="#15121a" stroke-width="2.5"/>`
      );
    }
    s.push(
      `<path d="M${(cx - r * 0.32).toFixed(2)} ${(cy + r * 0.33).toFixed(2)} Q${cx} ${(
        cy +
        r * 0.03
      ).toFixed(2)} ${(cx + r * 0.32).toFixed(2)} ${(cy + r * 0.33).toFixed(
        2
      )}" fill="none" stroke="#15121a" stroke-width="2.5"/>`
    );
  } else {
    s.push(
      `<circle cx="${(cx + r * 0.25).toFixed(2)}" cy="${(cy - r * 0.22).toFixed(
        2
      )}" r="${(r * 0.11).toFixed(2)}" fill="#101016"/>`,
      `<path d="M${(cx - r * 0.36).toFixed(2)} ${(cy + r * 0.13).toFixed(2)} Q${cx} ${(
        cy +
        r * 0.72
      ).toFixed(2)} ${(cx + r * 0.36).toFixed(2)} ${(cy + r * 0.13).toFixed(
        2
      )} Z" fill="#101016"/>`
    );
  }
  return s.join('');
}

function blinkingBorder(
  w: number,
  h: number,
  border: BlinkieBorder,
  phase: number,
  colors: readonly string[]
): string {
  const pieces: string[] = [];
  const active = phase % 2 !== 0 ? colors[0] : '#f6f4ff';

  if (border === 'dots') {
    for (let x = 8; x < w - 8; x += 12) {
      const color = (Math.floor(x / 12) + phase) % 3 !== 0 ? active : colors[1];
      pieces.push(rect(x, 5, 6, 6, color), rect(x, h - 11, 6, 6, color));
    }
    for (let y = 17; y < h - 13; y += 12) {
      const color = (Math.floor(y / 12) + phase) % 3 !== 0 ? active : colors[1];
      pieces.push(rect(5, y, 6, 6, color), rect(w - 11, y, 6, 6, color));
    }
  } else if (border === 'checker') {
    for (let x = 5; x < w - 5; x += 8) {
      const idx = Math.floor(x / 8) + phase;
      const color = idx % 2 !== 0 ? colors[idx % 3] : '#ffffff';
      pieces.push(rect(x, 5, 8, 8, color), rect(x, h - 13, 8, 8, color));
    }
    for (let y = 13; y < h - 13; y += 8) {
      const idx = Math.floor(y / 8) + phase;
      const color = idx % 2 !== 0 ? colors[idx % 3] : '#ffffff';
      pieces.push(rect(5, y, 8, 8, color), rect(w - 13, y, 8, 8, color));
    }
  } else {
    pieces.push(
      `<rect x="7" y="7" width="${w - 14}" height="${
        h - 14
      }" rx="11" fill="none" stroke="${active}" stroke-width="4" stroke-dasharray="3 7" stroke-dashoffset="${
        phase * 3
      }"/>`,
      `<rect x="12" y="12" width="${w - 24}" height="${
        h - 24
      }" rx="8" fill="none" stroke="${colors[1]}" stroke-width="1"/>`
    );
  }
  return pieces.join('');
}

function accents(
  w: number,
  h: number,
  seedHex: string,
  phase: number,
  colors: readonly string[],
  n = 12
): string {
  let state = parseInt(seedHex.slice(0, 8), 16) || 0x12345678;
  const nextRand = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };

  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = Math.floor(28 + nextRand() * (w - 50));
    const topBand = nextRand() < 0.5;
    const y = topBand
      ? Math.floor(18 + nextRand() * 12)
      : Math.floor(h - 30 + nextRand() * 12);
    const bright = (i + phase) % 4 === 0;
    if (bright) {
      out.push(star(x, y, 4 + (i % 3), colors[(i + phase) % 3]));
    }
  }
  return out.join('');
}

/**
 * Renders the User Icon + Nemesis Moji + Animated Survivor Expression Pod
 * on the right side of the Blinkie, bobbing across the 8 frames.
 */
function playerAndMojiPodStrip(
  x: number,
  y: number,
  r: number,
  phase: number,
  data: CollectorCardData,
  colors: readonly string[]
): string {
  const bobs = [0, -3, -1, 2, 0, -2, 1, 2];
  const result: string[] = [];

  // Slot 0: Player's actual User Icon (embedded data URL)
  const bob0 = bobs[phase % 8];
  const cx0 = x;
  const cy0 = y + bob0;
  const c0 = colors[phase % 3];
  if (data.avatarDataUrl) {
    const clipId = `avClip_${phase}_${Math.round(cx0)}`;
    result.push(
      `<defs><clipPath id="${clipId}"><circle cx="${cx0}" cy="${cy0}" r="${r}"/></clipPath></defs>`,
      `<circle cx="${cx0}" cy="${cy0}" r="${r + 2.5}" fill="#060509" stroke="${c0}" stroke-width="2.5"/>`,
      `<image href="${xmlEscape(data.avatarDataUrl)}" x="${cx0 - r}" y="${
        cy0 - r
      }" width="${r * 2}" height="${
        r * 2
      }" clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice"/>`
    );
  } else {
    result.push(face(cx0, cy0, r, FACES[phase % 4], c0));
  }

  // Slot 1: Player's actual Nemesis NIP-30 Moji Sprite (or animated face fallback)
  const bob1 = bobs[(phase + 2) % 8];
  const cx1 = x + r * 2 + 10;
  const cy1 = y + bob1;
  const c1 = colors[(phase + 1) % 3];
  if (data.mojiDataUrl) {
    const clipId = `mjClip_${phase}_${Math.round(cx1)}`;
    result.push(
      `<defs><clipPath id="${clipId}"><circle cx="${cx1}" cy="${cy1}" r="${r}"/></clipPath></defs>`,
      `<circle cx="${cx1}" cy="${cy1}" r="${r + 2.5}" fill="#140E1E" stroke="${c1}" stroke-width="2.5"/>`,
      `<image href="${xmlEscape(data.mojiDataUrl)}" x="${cx1 - r + 2}" y="${
        cy1 - r + 2
      }" width="${(r - 2) * 2}" height="${
        (r - 2) * 2
      }" clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid meet"/>`
    );
  } else {
    result.push(face(cx1, cy1, r, FACES[(phase + 1) % 4], c1));
  }

  // Slot 2: Cycling pixel-art Moji expression
  const bob2 = bobs[(phase + 4) % 8];
  const cx2 = x + (r * 2 + 10) * 2;
  const cy2 = y + bob2;
  const kind = FACES[(Math.floor(phase / 2) + 2) % FACES.length];
  result.push(face(cx2, cy2, r, kind, colors[(phase + 2) % 3]));

  return result.join('');
}

/**
 * Resolves the two lines of bitmap text for a given frame directly from the player's
 * live CollectorCardData stats. Frames 0..3 and 4..7 alternate complimentary stat readouts!
 */
function resolveStatDrivenTexts(
  data: CollectorCardData,
  focus: BlinkieStatFocus,
  phase: number
): { headline: string; subline: string } {
  const secondHalf = phase >= 4;
  const playerUpper = sanitizeBitmapText(data.player) || 'SURVIVOR';
  const spellUpper = sanitizeBitmapText(data.spell) || 'CHAIN STORM';
  const topAward =
    sanitizeBitmapText(data.badges[0] || `${data.rarity} SURVIVOR`) ||
    'MYTHIC SURVIVOR';
  const nemesisClean =
    sanitizeBitmapText(data.nemesis.replace(/:/g, '')) || 'MOJI SWARM';

  if (focus === 'spell') {
    return {
      headline: secondHalf ? `${spellUpper} LV ${data.spellLevel}` : spellUpper,
      subline: secondHalf
        ? `${playerUpper}  W${data.highestWave}  ${data.bosses} BOSSES`
        : `LV ${data.cycleLevel} R${data.rebirthTier}  ${data.bestRun.toLocaleString()} PTS`,
    };
  }

  if (focus === 'award') {
    return {
      headline: topAward,
      subline: secondHalf
        ? `${data.awardsUnlocked}/${data.awardsTotal} AWARDS  ${data.careerScore.toLocaleString()} PTS`
        : `${playerUpper}  LV ${data.cycleLevel}  R${data.rebirthTier}  W${data.highestWave}`,
    };
  }

  if (focus === 'nemesis') {
    return {
      headline: `NEMESIS ${nemesisClean}`,
      subline: secondHalf
        ? `${data.defeated.toLocaleString()} TOTAL SLAIN  ${data.bosses} BOSS`
        : `${data.nemesisKills.toLocaleString()}X DEFEATED BY ${playerUpper}`,
    };
  }

  // Default 'career': alternates Player Name & Rarity Form with Best Run / Career Totals
  return {
    headline: secondHalf ? `${playerUpper} ${data.rarity}` : playerUpper,
    subline: secondHalf
      ? `W${data.highestWave}  ${data.defeated.toLocaleString()} SLAIN  ${data.bosses} BOSS`
      : `LV ${data.cycleLevel} R${data.rebirthTier}  BEST ${data.bestRun.toLocaleString()} PTS`,
  };
}

function frameContent(
  template: BlinkieTemplate,
  data: CollectorCardData,
  colors: readonly string[],
  seedHex: string,
  phase: number
): string {
  const w = template.width;
  const h = template.height;
  const layout = template.layout;
  const border = template.border;
  const anim = template.animation;

  const { headline, subline } = resolveStatDrivenTexts(data, template.id, phase);

  const s: string[] = [
    rect(0, 0, w, h, '#000000'),
    rect(14, 14, w - 28, h - 28, '#100b17', 'rx="7"'),
    blinkingBorder(w, h, border, phase, colors),
  ];

  if (layout === 'classic') {
    s.push(
      bitmap(headline, 26, 24, 3.6, '#ffffff', 1, 0, 0, w - 210),
      rect(26, 59, w - 205, 4, colors[phase % 3]),
      bitmap(subline, 28, 71, 2, colors[1], 1, 0, 0, w - 200),
      playerAndMojiPodStrip(w - 152, 54, 18, phase, data, colors)
    );
  } else if (layout === 'ticker') {
    s.push(
      star(38, 46, 12, colors[phase % 3]),
      bitmap(headline, 58, 23, 3.5, colors[0], 1, 0, 0, w - 230),
      bitmap(subline, 60, 63, 2.1, '#ffffff', 1, 0, 0, w - 225),
      playerAndMojiPodStrip(w - 148, 57, 17, phase, data, colors),
      rect(58, 51, w - 225, 4, colors[Math.floor(phase / 2) % 3])
    );
  } else {
    s.push(
      rect(28, 25, w - 56, 6, colors[phase % 3]),
      bitmap(`>> ${headline}`, 28, 41, 3.2, '#ffffff', 1, 0, 0, w - 200),
      bitmap(subline, 28, 79, 2, colors[1], 1, 0, 0, w - 200),
      playerAndMojiPodStrip(w - 148, 64, 16.5, phase, data, colors)
    );
  }

  const symbols = phase % 2 !== 0 ? '★ + - _ * ` + -' : '+ ★ _ - ` * - +';
  s.push(
    bitmap(
      symbols,
      w * 0.38,
      layout !== 'arcade' ? h - 21 : 101,
      1.45,
      colors[Math.floor(phase / 2) % 3],
      1,
      anim === 'bounce' ? 3 : 1,
      phase,
      w * 0.34
    )
  );

  if (anim === 'march') {
    s.push(bitmap('+-_*`', 28 + ((phase * 9) % 38), h - 22, 2, colors[2]));
  }
  if (anim === 'sparkle') {
    s.push(star(w - 42, 28, 6 + (phase % 3) * 2, '#ffffff'));
  }
  s.push(accents(w, h, seedHex, phase, colors));

  return s.join('');
}

export function makeBlinkieSvgFromStats(opts: {
  data: CollectorCardData;
  focus?: BlinkieStatFocus;
  phase?: number;
}): string {
  const { data, focus = 'career', phase } = opts;
  const template =
    BLINKIE_FOCUS_MODES.find((t) => t.id === focus) ?? BLINKIE_FOCUS_MODES[0];
  const w = template.width;
  const h = template.height;
  const colors =
    data.avatarPalette.length >= 3
      ? data.avatarPalette
      : [...DEFAULT_BLINKIE_COLORS];

  const seedHex = sha256Hex(`${data.pubkey}\0${data.player}\0${focus}`);
  const title = xmlEscape(
    `${data.player} - Lv.${data.cycleLevel} - ${data.rarity} Blinkie`
  );
  const header = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}"><title>${title}</title><desc>Animated pixel-art MojiSurvivor blinkie generated from ${xmlEscape(
    data.player
  )} stats and Nostr avatar.</desc>`;

  if (phase !== undefined) {
    return (
      header +
      frameContent(template, data, colors, seedHex, phase) +
      '</svg>'
    );
  }

  const css: string[] = ['<style>'];
  for (let i = 0; i < FPS; i++) {
    const start = (i * 100) / FPS;
    const end = ((i + 1) * 100) / FPS;
    css.push(
      `@keyframes frame${i} { 0%, ${Math.max(0, start - 0.001).toFixed(
        4
      )}% { opacity:0; } ${start.toFixed(4)}%, ${(end - 0.001).toFixed(
        4
      )}% { opacity:1; } ${end.toFixed(4)}%, 100% { opacity:0; } }`,
      `.f${i} { opacity:0; animation:frame${i} 1.6s steps(1,end) infinite; }`
    );
  }
  css.push(
    '@media (prefers-reduced-motion:reduce) { .frame {animation:none !important; opacity:0} .f0{opacity:1} }',
    '</style>'
  );

  const groups: string[] = [];
  for (let i = 0; i < FPS; i++) {
    groups.push(
      `<g class="frame f${i}">${frameContent(
        template,
        data,
        colors,
        seedHex,
        i
      )}</g>`
    );
  }

  return header + css.join('') + groups.join('') + '</svg>';
}

async function rasterizeSvgFrame(
  svgString: string,
  width: number,
  height: number
): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(ctx.getImageData(0, 0, width, height));
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function encodeAnimatedGif89a(
  frames: ImageData[],
  width: number,
  height: number,
  delayCs = 20
): Uint8Array {
  const paletteRgb: Array<[number, number, number]> = [[0, 0, 0]];
  const colorToIndex = new Map<number, number>();
  colorToIndex.set(0, 0);

  for (const frame of frames) {
    const d = frame.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] & 0xf8;
      const g = d[i + 1] & 0xf8;
      const b = d[i + 2] & 0xf8;
      const key = (r << 16) | (g << 8) | b;
      if (!colorToIndex.has(key) && paletteRgb.length < 256) {
        colorToIndex.set(key, paletteRgb.length);
        paletteRgb.push([d[i], d[i + 1], d[i + 2]]);
      }
    }
  }
  while (paletteRgb.length < 256) {
    paletteRgb.push([0, 0, 0]);
  }

  const bytes: number[] = [];
  const writeStr = (s: string) => {
    for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i));
  };
  const writeU16 = (v: number) => {
    bytes.push(v & 0xff, (v >> 8) & 0xff);
  };

  writeStr('GIF89a');
  writeU16(width);
  writeU16(height);
  bytes.push(0xf7, 0, 0);

  for (let i = 0; i < 256; i++) {
    const [r, g, b] = paletteRgb[i];
    bytes.push(r, g, b);
  }

  bytes.push(0x21, 0xff, 0x0b);
  writeStr('NETSCAPE2.0');
  bytes.push(0x03, 0x01, 0x00, 0x00, 0x00);

  const lzwEncodeFrame = (indexedPixels: Uint8Array): number[] => {
    const minCodeSize = 8;
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;

    const outSubBlocks: number[] = [minCodeSize];
    let bitBuffer = 0;
    let bitCount = 0;
    let blockBuffer: number[] = [];

    const flushByte = (b: number) => {
      blockBuffer.push(b);
      if (blockBuffer.length === 255) {
        outSubBlocks.push(255, ...blockBuffer);
        blockBuffer = [];
      }
    };

    const emitCode = (code: number, size: number) => {
      bitBuffer |= code << bitCount;
      bitCount += size;
      while (bitCount >= 8) {
        flushByte(bitBuffer & 0xff);
        bitBuffer >>= 8;
        bitCount -= 8;
      }
    };

    let codeSize = minCodeSize + 1;
    let nextCode = eoiCode + 1;
    let dict = new Map<number, number>();

    emitCode(clearCode, codeSize);
    let prefix = indexedPixels[0];

    for (let i = 1; i < indexedPixels.length; i++) {
      const k = indexedPixels[i];
      const dictKey = (prefix << 8) | k;
      const found = dict.get(dictKey);
      if (found !== undefined) {
        prefix = found;
      } else {
        emitCode(prefix, codeSize);
        if (nextCode < 4096) {
          dict.set(dictKey, nextCode++);
          if (nextCode > 1 << codeSize && codeSize < 12) {
            codeSize++;
          }
        } else {
          emitCode(clearCode, codeSize);
          dict = new Map<number, number>();
          codeSize = minCodeSize + 1;
          nextCode = eoiCode + 1;
        }
        prefix = k;
      }
    }

    emitCode(prefix, codeSize);
    emitCode(eoiCode, codeSize);
    if (bitCount > 0) {
      flushByte(bitBuffer & 0xff);
    }
    if (blockBuffer.length > 0) {
      outSubBlocks.push(blockBuffer.length, ...blockBuffer);
    }
    outSubBlocks.push(0x00);
    return outSubBlocks;
  };

  for (const frame of frames) {
    bytes.push(0x21, 0xf9, 0x04, 0x04);
    writeU16(delayCs);
    bytes.push(0x00, 0x00);

    bytes.push(0x2c);
    writeU16(0);
    writeU16(0);
    writeU16(width);
    writeU16(height);
    bytes.push(0x00);

    const indexed = new Uint8Array(width * height);
    const d = frame.data;
    for (let p = 0; p < indexed.length; p++) {
      const off = p * 4;
      const r = d[off] & 0xf8;
      const g = d[off + 1] & 0xf8;
      const b = d[off + 2] & 0xf8;
      const key = (r << 16) | (g << 8) | b;
      let idx = colorToIndex.get(key);
      if (idx === undefined) {
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let c = 0; c < paletteRgb.length; c++) {
          const [pr, pg, pb] = paletteRgb[c];
          const dist =
            (d[off] - pr) ** 2 + (d[off + 1] - pg) ** 2 + (d[off + 2] - pb) ** 2;
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = c;
          }
        }
        idx = bestIdx;
      }
      indexed[p] = idx;
    }

    const encoded = lzwEncodeFrame(indexed);
    for (let i = 0; i < encoded.length; i++) {
      bytes.push(encoded[i]);
    }
  }

  bytes.push(0x3b);
  return new Uint8Array(bytes);
}

export async function exportStatBlinkieAsset(opts: {
  data: CollectorCardData;
  focus: BlinkieStatFocus;
  format: 'svg' | 'png' | 'gif';
}): Promise<{ blob: Blob; fileName: string }> {
  const { data, focus, format } = opts;
  const template =
    BLINKIE_FOCUS_MODES.find((t) => t.id === focus) ?? BLINKIE_FOCUS_MODES[0];
  const slug = `${data.player}-${focus}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28);

  if (format === 'svg') {
    const svg = makeBlinkieSvgFromStats({ data, focus });
    return {
      blob: new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
      fileName: `mojisurvivor-blinkie-${slug}.svg`,
    };
  }

  const outW = template.width;
  const outH = template.height;

  if (format === 'png') {
    const frame0Svg = makeBlinkieSvgFromStats({ data, focus, phase: 0 });
    const imgData = await rasterizeSvgFrame(frame0Svg, outW * 2, outH * 2);
    const canvas = document.createElement('canvas');
    canvas.width = outW * 2;
    canvas.height = outH * 2;
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(imgData, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('PNG export failed'))),
        'image/png'
      );
    });
    return {
      blob: new Blob([blob], { type: 'image/png' }),
      fileName: `mojisurvivor-blinkie-${slug}.png`,
    };
  }

  const frames: ImageData[] = [];
  for (let phase = 0; phase < FPS; phase++) {
    const staticSvg = makeBlinkieSvgFromStats({ data, focus, phase });
    const frameData = await rasterizeSvgFrame(staticSvg, outW, outH);
    frames.push(frameData);
  }

  const gifBytes = encodeAnimatedGif89a(frames, outW, outH, 20);
  return {
    blob: new Blob([gifBytes.buffer as ArrayBuffer], { type: 'image/gif' }),
    fileName: `mojisurvivor-blinkie-${slug}.gif`,
  };
}
