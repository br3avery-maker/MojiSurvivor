import { sha256Hex } from './cryptoStats';

export type BlinkieLayout = 'classic' | 'ticker' | 'arcade';
export type BlinkieBorder = 'dots' | 'checker' | 'comet';
export type BlinkieAnimation = 'bounce' | 'march' | 'sparkle';

export interface BlinkieTemplate {
  id: string;
  name: string;
  width: number;
  height: number;
  layout: BlinkieLayout;
  border: BlinkieBorder;
  animation: BlinkieAnimation;
  tagline: string;
}

export const BLINKIE_TEMPLATES: readonly BlinkieTemplate[] = [
  {
    id: 'classic',
    name: 'Sugar Rush',
    width: 600,
    height: 124,
    layout: 'classic',
    border: 'dots',
    animation: 'bounce',
    tagline: 'RAINBOW FORM',
  },
  {
    id: 'ticker',
    name: 'Glitter Parade',
    width: 640,
    height: 124,
    layout: 'ticker',
    border: 'checker',
    animation: 'march',
    tagline: 'SURVIVOR',
  },
  {
    id: 'arcade',
    name: 'Cursed Dial-Up',
    width: 560,
    height: 124,
    layout: 'arcade',
    border: 'comet',
    animation: 'sparkle',
    tagline: 'SYSTEM ONLINE',
  },
  {
    id: 'angel_glitch',
    name: 'Angel Glitch',
    width: 640,
    height: 124,
    layout: 'ticker',
    border: 'dots',
    animation: 'sparkle',
    tagline: 'GLITTER BOMB',
  },
];

export const DEFAULT_BLINKIE_COLORS: readonly string[] = [
  '#FF1493',
  '#00F0FF',
  '#B388FF',
  '#F4F4FA',
];

export const BLINKIE_COLOR_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  colors: string[];
}> = [
  {
    id: 'brebre_rainbow',
    label: 'Mythic Prism (No Gold)',
    colors: ['#FF1493', '#00F0FF', '#B388FF', '#F4F4FA'],
  },
  {
    id: 'angel_silver',
    label: 'Angel Silver & Pink',
    colors: ['#FF1493', '#BCEFFC', '#D8B4FE', '#FFFFFF'],
  },
  {
    id: 'cyber_arcade',
    label: 'Cyber Dial-Up',
    colors: ['#00F5D4', '#FF1493', '#38BDF8', '#F4F4FA'],
  },
  {
    id: 'plasma_violet',
    label: 'Plasma Witch',
    colors: ['#C084FC', '#FF67E2', '#00F0FF', '#F4F4FA'],
  },
];

const FPS = 8;
const FACES = ['wink', 'star', 'xeye', 'happy'] as const;
type FaceKind = (typeof FACES)[number];

/**
 * Hand-drawn 5x7 bitmap font ported directly from blinkie.py.
 * Sprite glyphs are generated as <rect> pixels so visuals never depend on browser fonts.
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
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
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
 * Extracts up to 3 punchy, distinct colors from a local/CORS-safe avatar image URL,
 * lifting dark colors for high contrast on a #000000 black background (ported from blinkie.py).
 */
export async function extractPaletteFromAvatarUrl(
  url: string | undefined,
  count = 3
): Promise<string[]> {
  if (!url) return [...DEFAULT_BLINKIE_COLORS];

  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (cols: string[]) => {
      if (settled) return;
      settled = true;
      resolve(cols);
    };
    const timer = setTimeout(() => finish([...DEFAULT_BLINKIE_COLORS]), 2200);
    if (!url.startsWith('data:') && !url.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.referrerPolicy = 'no-referrer';

    img.onload = () => {
      clearTimeout(timer);
      try {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish([...DEFAULT_BLINKIE_COLORS]);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        const buckets = new Map<string, Array<[number, number, number]>>();
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 160) continue;
          const [h, s, v] = rgbToHsv(r, g, b);
          if (s < 0.22 || v < 0.24 || (v > 0.98 && s < 0.3)) continue;
          const key = `${Math.round(h * 24) % 24}:${Math.round(s * 4)}:${Math.round(v * 4)}`;
          const list = buckets.get(key) ?? [];
          list.push([r, g, b]);
          buckets.set(key, list);
        }

        const ranked = Array.from(buckets.values()).sort((a, b) => {
          const sa = rgbToHsv(a[0][0], a[0][1], a[0][2])[1];
          const sb = rgbToHsv(b[0][0], b[0][1], b[0][2])[1];
          return b.length * (0.5 + sb) - a.length * (0.5 + sa);
        });

        const selected: Array<[number, number, number]> = [];
        for (const bucket of ranked) {
          const avg: [number, number, number] = [
            Math.floor(bucket.reduce((s, p) => s + p[0], 0) / bucket.length),
            Math.floor(bucket.reduce((s, p) => s + p[1], 0) / bucket.length),
            Math.floor(bucket.reduce((s, p) => s + p[2], 0) / bucket.length),
          ];
          const isDistinct = selected.every(
            (old) =>
              Math.hypot(avg[0] - old[0], avg[1] - old[1], avg[2] - old[2]) >= 73
          );
          if (isDistinct) {
            selected.push(avg);
          }
          if (selected.length >= count) break;
        }

        const lifted = selected.map(([r, g, b]) => {
          const [h, s, v] = rgbToHsv(r, g, b);
          return hsvToHex(h, Math.max(0.58, s), Math.max(0.82, v));
        });

        for (const fallback of DEFAULT_BLINKIE_COLORS) {
          if (lifted.length >= 4) break;
          if (!lifted.some((c) => c.toLowerCase() === fallback.toLowerCase())) {
            lifted.push(fallback);
          }
        }
        finish(lifted);
      } catch {
        finish([...DEFAULT_BLINKIE_COLORS]);
      }
    };

    img.onerror = () => {
      clearTimeout(timer);
      finish([...DEFAULT_BLINKIE_COLORS]);
    };
    img.src = url;
  });
}

function rect(x: number, y: number, w: number, h: number, fill: string, extra = ''): string {
  return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(
    2
  )}" height="${h.toFixed(2)}" fill="${fill}" ${extra}/>`;
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
  const maxChars = maxWidth ? Math.floor(maxWidth / (6 * scale)) : 1000;
  const upper = text.toUpperCase().slice(0, maxChars);

  for (let i = 0; i < upper.length; i++) {
    const ch = upper[i];
    const pat = FONT[ch] ?? FONT['?'];
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
    `<circle cx="${cx}" cy="${cy}" r="${r + 3}" fill="#060509" stroke="${accent}" stroke-width="3"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#faf7ff"/>`,
    `<circle cx="${(cx - r * 0.27).toFixed(2)}" cy="${(cy - r * 0.22).toFixed(
      2
    )}" r="${(r * 0.11).toFixed(2)}" fill="#101016"/>`,
  ];

  if (kind === 'wink') {
    s.push(
      `<path d="M${(cx + r * 0.12).toFixed(2)} ${(cy - r * 0.2).toFixed(2)} l${(
        r * 0.32
      ).toFixed(2)} 0" stroke="#101016" stroke-width="3" stroke-linecap="round"/>`,
      `<path d="M${(cx - r * 0.35).toFixed(2)} ${(cy + r * 0.18).toFixed(2)} Q${cx} ${(
        cy +
        r * 0.6
      ).toFixed(2)} ${(cx + r * 0.34).toFixed(2)} ${(cy + r * 0.16).toFixed(
        2
      )}" fill="none" stroke="#101016" stroke-width="3" stroke-linecap="round"/>`
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
      `<circle cx="${cx}" cy="${cy}" r="${r + 3}" fill="#060509" stroke="${accent}" stroke-width="3"/>`,
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
        )}" fill="none" stroke="#15121a" stroke-width="3"/>`
      );
    }
    s.push(
      `<path d="M${(cx - r * 0.32).toFixed(2)} ${(cy + r * 0.33).toFixed(2)} Q${cx} ${(
        cy +
        r * 0.03
      ).toFixed(2)} ${(cx + r * 0.32).toFixed(2)} ${(cy + r * 0.33).toFixed(
        2
      )}" fill="none" stroke="#15121a" stroke-width="3"/>`
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

  if (kind === 'wink') {
    s.push(
      `<path d="M${(cx - r * 0.04).toFixed(2)} ${(cy + r * 0.41).toFixed(2)} q${(
        r * 0.1
      ).toFixed(2)} ${(r * 0.23).toFixed(2)} ${(r * 0.2).toFixed(
        2
      )} 0" fill="#ff1493" stroke="#ff1493" stroke-width="3"/>`
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

function mojiStrip(
  x: number,
  y: number,
  r: number,
  phase: number,
  colors: readonly string[]
): string {
  const bobs = [0, -3, -1, 2, 0, -2, 1, 2];
  const result: string[] = [];
  for (let i = 0; i < 3; i++) {
    const kind = FACES[(Math.floor(phase / 2) + i) % FACES.length];
    const bob = bobs[(phase + i * 2) % 8];
    result.push(
      face(
        x + i * (r * 2 + 9),
        y + bob,
        r,
        kind,
        colors[(i + Math.floor(phase / 2)) % 3]
      )
    );
  }
  return result.join('');
}

function frameContent(
  template: BlinkieTemplate,
  label: string,
  level: number,
  colors: readonly string[],
  seedHex: string,
  phase: number
): string {
  const w = template.width;
  const h = template.height;
  const layout = template.layout;
  const border = template.border;
  const anim = template.animation;

  const s: string[] = [
    rect(0, 0, w, h, '#000000'),
    rect(14, 14, w - 28, h - 28, '#100b17', 'rx="7"'),
    blinkingBorder(w, h, border, phase, colors),
  ];

  const mainLabel = (label || 'MYTHIC MOJI').toUpperCase();
  if (layout === 'classic') {
    s.push(
      bitmap(mainLabel, 27, 24, 4, '#ffffff', 1, 0, 0, w - 260),
      rect(26, 61, w - 220, 4, colors[phase % 3]),
      bitmap(
        `LV ${level}  ${template.tagline}`,
        30,
        74,
        2,
        colors[1],
        1,
        0,
        0,
        w - 205
      ),
      mojiStrip(w - 159, 54, 18, phase, colors)
    );
  } else if (layout === 'ticker') {
    s.push(
      star(44, 49, 13, colors[phase % 3]),
      bitmap(mainLabel, 66, 23, 4, colors[0], 1, 0, 0, w - 245),
      bitmap(
        `${template.tagline}   LV ${level}`,
        68,
        64,
        2.5,
        '#ffffff',
        1,
        0,
        0,
        w - 235
      ),
      mojiStrip(w - 140, 59, 16, phase, colors),
      rect(66, 51, w - 230, 4, colors[Math.floor(phase / 2) % 3])
    );
  } else {
    s.push(
      rect(30, 27, w - 62, 7, colors[phase % 3]),
      bitmap(`>> ${mainLabel}`, 30, 45, 3.4, '#ffffff', 1, 0, 0, w - 180),
      bitmap(
        `SYSTEM ONLINE  LV ${level}`,
        30,
        87,
        2,
        colors[1],
        1,
        0,
        0,
        w - 115
      ),
      face(w - 76, 69, 26, FACES[Math.floor(phase / 2) % 4], colors[0]),
      rect(w - 29, 89, 6, 11, colors[phase % 3])
    );
  }

  const symbols = phase % 2 !== 0 ? '★ + - _ * ` + -' : '+ ★ _ - ` * - +';
  s.push(
    bitmap(
      symbols,
      w * 0.41,
      layout !== 'arcade' ? h - 21 : 102,
      1.45,
      colors[Math.floor(phase / 2) % 3],
      1,
      anim === 'bounce' ? 3 : 1,
      phase,
      w * 0.35
    )
  );

  if (anim === 'march') {
    s.push(bitmap('+-_*`', 28 + ((phase * 9) % 38), h - 22, 2, colors[2]));
  }
  if (anim === 'sparkle') {
    s.push(star(w - 45, 32, 6 + (phase % 3) * 2, '#ffffff'));
  }
  s.push(accents(w, h, seedHex, phase, colors));

  return s.join('');
}

export function makeBlinkieSvg(opts: {
  template: BlinkieTemplate;
  label: string;
  username: string;
  level: number;
  colors?: readonly string[];
  phase?: number;
}): string {
  const {
    template,
    label,
    username,
    level,
    colors = DEFAULT_BLINKIE_COLORS,
    phase,
  } = opts;
  const w = template.width;
  const h = template.height;
  const safeColors =
    colors.length >= 3 ? colors : [...colors, ...DEFAULT_BLINKIE_COLORS].slice(0, 4);

  const seedHex = sha256Hex(`${username}\0${label}\0${template.id}`);
  const title = xmlEscape(`${label} - level ${level} - ${username} - ${template.name}`);
  const header = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}"><title>${title}</title><desc>Animated pixel-art MojiSurvivor blinkie with a flashing border, cycling Moji expressions and dancing text art.</desc>`;

  if (phase !== undefined) {
    return (
      header +
      frameContent(template, label, level, safeColors, seedHex, phase) +
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
        label,
        level,
        safeColors,
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

/**
 * Dependency-free GIF89a LZW encoder for exporting genuine 8-frame looping Blinkie GIFs
 * directly in the browser at 200ms/frame (matches blinkie.py output).
 */
function encodeAnimatedGif89a(
  frames: ImageData[],
  width: number,
  height: number,
  delayCs = 20
): Uint8Array {
  // Build a global 256-color palette from the frames (blinkies use < 32 crisp colors)
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

  // Header + Logical Screen Descriptor (256-color GCT = 0xF7)
  writeStr('GIF89a');
  writeU16(width);
  writeU16(height);
  bytes.push(0xf7, 0, 0);

  // Global Color Table (256 * 3 bytes)
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = paletteRgb[i];
    bytes.push(r, g, b);
  }

  // NETSCAPE2.0 infinite loop extension
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
    // Graphic Control Extension (200ms = 20 centiseconds)
    bytes.push(0x21, 0xf9, 0x04, 0x04);
    writeU16(delayCs);
    bytes.push(0x00, 0x00);

    // Image Descriptor
    bytes.push(0x2c);
    writeU16(0);
    writeU16(0);
    writeU16(width);
    writeU16(height);
    bytes.push(0x00);

    // Map pixels to 256-color palette index
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
          const dist = (d[off] - pr) ** 2 + (d[off + 1] - pg) ** 2 + (d[off + 2] - pb) ** 2;
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

  // GIF Trailer
  bytes.push(0x3b);
  return new Uint8Array(bytes);
}

export async function exportBlinkieAsset(opts: {
  template: BlinkieTemplate;
  label: string;
  username: string;
  level: number;
  colors: readonly string[];
  format: 'svg' | 'png' | 'gif';
}): Promise<{ blob: Blob; fileName: string }> {
  const { template, label, username, level, colors, format } = opts;
  const slug = (label || 'blinkie')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);

  if (format === 'svg') {
    const svg = makeBlinkieSvg({ template, label, username, level, colors });
    return {
      blob: new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
      fileName: `mojisurvivor-blinkie-${slug}.svg`,
    };
  }

  const outW = template.width;
  const outH = template.height;

  if (format === 'png') {
    const frame0Svg = makeBlinkieSvg({
      template,
      label,
      username,
      level,
      colors,
      phase: 0,
    });
    const imgData = await rasterizeSvgFrame(frame0Svg, outW * 2, outH * 2);
    const canvas = document.createElement('canvas');
    canvas.width = outW * 2;
    canvas.height = outH * 2;
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(imgData, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png');
    });
    return {
      blob,
      fileName: `mojisurvivor-blinkie-${slug}.png`,
    };
  }

  // 8-frame looping GIF export at 200ms/frame
  const frames: ImageData[] = [];
  for (let phase = 0; phase < FPS; phase++) {
    const staticSvg = makeBlinkieSvg({
      template,
      label,
      username,
      level,
      colors,
      phase,
    });
    const frameData = await rasterizeSvgFrame(staticSvg, outW, outH);
    frames.push(frameData);
  }

  const gifBytes = encodeAnimatedGif89a(frames, outW, outH, 20);
  return {
    blob: new Blob([gifBytes.buffer as ArrayBuffer], { type: 'image/gif' }),
    fileName: `mojisurvivor-blinkie-${slug}.gif`,
  };
}
