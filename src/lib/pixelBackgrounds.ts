/**
 * BreBre Colors UI Standards Palette v0 + Retro 16-Bit Pixel-Art Background Generator
 * & Opaque Asset Contrast Backing System for MojiSurvivor.
 */

export const MOJI_APP_ICON_URL =
  '/assets/aistudio/moji_survivor_emblem_1793749794956-C7_7CmkR_406e3441.jpg';

export const BREBRE_PALETTE = {
  black: '#000000',
  deepPink: '#FF1493',
  lightPink: '#FFB6D9',
  white: '#FFFFFF',
  gray100: '#B8B8B8',
  gray900: '#111111',
  gray850: '#1A1A1A',
  silver: '#C0C0C0',
  gray600: '#5E5E5E',
  pinkDark2: '#9A0957',
  pinkDark3: '#5B0633',
  pinkDark1: '#CD0D72',
} as const;

export type ArenaPixelBgStyle =
  | 'auto'
  | 'dungeon_circuit'
  | 'labyrinth_grid'
  | 'citadel_plates'
  | 'starlight_grid';

export interface ArenaPixelBgOption {
  id: ArenaPixelBgStyle;
  label: string;
  subtitle: string;
}

export const ARENA_PIXEL_BG_OPTIONS: readonly ArenaPixelBgOption[] = [
  {
    id: 'auto',
    label: 'Realm Default (Auto)',
    subtitle: 'Uses each Arena Realm’s dedicated 16-bit pixel floor art',
  },
  {
    id: 'dungeon_circuit',
    label: 'Obsidian Foundry Floor',
    subtitle: 'Forged basalt flagstones · glowing magenta ember fissures',
  },
  {
    id: 'labyrinth_grid',
    label: 'Circuit Labyrinth Deck',
    subtitle: 'Dark motherboard plating · pulsing cyan bus traces & grates',
  },
  {
    id: 'starlight_grid',
    label: 'Starlight Rift Void',
    subtitle: 'Cosmic obsidian plane · astral sigils & 8-bit constellations',
  },
  {
    id: 'citadel_plates',
    label: 'Citadel Armor Deck',
    subtitle: 'Riveted steel blast plates · reactor vents & hazard trims',
  },
];

const tileCanvasCache = new Map<string, HTMLCanvasElement>();
let cachedLobbyBannerUrl: string | null = null;

export function resolveArenaPixelBgStyle(
  style: ArenaPixelBgStyle | undefined,
  wave: number
): Exclude<ArenaPixelBgStyle, 'auto'> {
  if (style && style !== 'auto') return style;
  const cycle = Math.floor(Math.max(0, wave - 1) / 2) % 4;
  if (cycle === 0) return 'dungeon_circuit';
  if (cycle === 1) return 'labyrinth_grid';
  if (cycle === 2) return 'starlight_grid';
  return 'citadel_plates';
}

function setPixel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  w = 1,
  h = 1
): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/**
 * Generates and caches a crisp 256×256 seamless 16-bit retro pixel-art tile canvas
 * rendered on a 64×64 pixel grid and scaled 4× with nearest-neighbor (`imageSmoothingEnabled = false`).
 */
export function getArenaPixelTileCanvas(
  style: ArenaPixelBgStyle | undefined,
  wave: number
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const resolved = resolveArenaPixelBgStyle(style, wave);
  const cached = tileCanvasCache.get(resolved);
  if (cached) return cached;

  const gridSize = 64;
  const scale = 4; // 256x256 output tile
  const lowRes = document.createElement('canvas');
  lowRes.width = gridSize;
  lowRes.height = gridSize;
  const lctx = lowRes.getContext('2d');
  if (!lctx) return null;
  lctx.imageSmoothingEnabled = false;

  if (resolved === 'dungeon_circuit') {
    // Obsidian Foundry: forged volcanic basalt flagstones + recessed ember-magenta forge channels
    setPixel(lctx, 0, 0, '#07060A', gridSize, gridSize);

    const stones = [
      { x: 1, y: 1, w: 30, h: 30, base: '#14121B', hi: '#221E2D', lo: '#0C0A10' },
      { x: 33, y: 1, w: 30, h: 30, base: '#121018', hi: '#1F1B29', lo: '#0A090F' },
      { x: 1, y: 33, w: 30, h: 30, base: '#121018', hi: '#1F1B29', lo: '#0A090F' },
      { x: 33, y: 33, w: 30, h: 30, base: '#15131C', hi: '#242030', lo: '#0D0B12' },
    ];

    for (let bIdx = 0; bIdx < stones.length; bIdx++) {
      const b = stones[bIdx];
      setPixel(lctx, b.x, b.y, b.base, b.w, b.h);
      // 2px chiseled bevel top/left + recessed bottom/right edge
      setPixel(lctx, b.x, b.y, b.hi, b.w - 1, 1);
      setPixel(lctx, b.x, b.y, b.hi, 1, b.h - 1);
      setPixel(lctx, b.x + 1, b.y + b.h - 1, b.lo, b.w - 1, 1);
      setPixel(lctx, b.x + b.w - 1, b.y + 1, b.lo, 1, b.h - 1);

      // Stone surface micro-texture & weathering grain
      for (let dx = 3; dx < b.w - 3; dx += 3) {
        for (let dy = 3; dy < b.h - 3; dy += 3) {
          const hash = (dx * 7 + dy * 13 + bIdx * 11) % 19;
          if (hash === 0 || hash === 5) {
            setPixel(lctx, b.x + dx, b.y + dy, b.hi, 1, 1);
          } else if (hash === 9) {
            setPixel(lctx, b.x + dx, b.y + dy, b.lo, 2, 1);
          }
        }
      }

      // Forged iron corner anchor bolts
      const corners = [
        [b.x + 2, b.y + 2],
        [b.x + b.w - 4, b.y + 2],
        [b.x + 2, b.y + b.h - 4],
        [b.x + b.w - 4, b.y + b.h - 4],
      ];
      for (const [cx, cy] of corners) {
        setPixel(lctx, cx, cy, '#332C3F', 2, 2);
        setPixel(lctx, cx, cy, '#645B73', 1, 1);
      }
    }

    // Cracked magma-rune fissure in top-right flagstone
    const crackPixels = [
      [40, 8], [41, 9], [42, 9], [43, 10], [44, 11], [44, 12], [45, 13],
      [46, 13], [47, 14], [48, 15], [49, 15], [42, 10], [41, 11],
    ];
    for (const [cx, cy] of crackPixels) {
      setPixel(lctx, cx, cy, '#08060B', 2, 2);
      setPixel(lctx, cx, cy, BREBRE_PALETTE.pinkDark3, 1, 1);
    }
    setPixel(lctx, 44, 11, BREBRE_PALETTE.pinkDark2, 1, 1);
    setPixel(lctx, 45, 13, BREBRE_PALETTE.deepPink, 1, 1);

    // Recessed foundry grate vent in bottom-left stone
    setPixel(lctx, 9, 41, '#08060B', 14, 14);
    setPixel(lctx, 10, 42, '#2B081B', 12, 12);
    for (let gy = 43; gy <= 51; gy += 3) {
      setPixel(lctx, 10, gy, '#1E1A26', 12, 2);
      setPixel(lctx, 10, gy, '#352E42', 12, 1);
    }
    setPixel(lctx, 14, 45, BREBRE_PALETTE.pinkDark2, 4, 1);
    setPixel(lctx, 15, 48, BREBRE_PALETTE.deepPink, 2, 1);

    // Glowing magma-circuit mortar channels at seams
    setPixel(lctx, 0, 32, BREBRE_PALETTE.pinkDark3, gridSize, 1);
    setPixel(lctx, 32, 0, BREBRE_PALETTE.pinkDark3, 1, gridSize);
    for (let i = 4; i < gridSize; i += 8) {
      setPixel(lctx, i, 32, BREBRE_PALETTE.pinkDark2, 3, 1);
      setPixel(lctx, 32, i, BREBRE_PALETTE.pinkDark2, 1, 3);
    }

    // Carved foundry anvil rune in top-left & bottom-right stones
    setPixel(lctx, 13, 13, '#0B0910', 6, 6);
    setPixel(lctx, 14, 14, BREBRE_PALETTE.pinkDark3, 4, 4);
    setPixel(lctx, 15, 15, BREBRE_PALETTE.pinkDark1, 2, 2);
    setPixel(lctx, 15, 15, BREBRE_PALETTE.lightPink, 1, 1);

    setPixel(lctx, 45, 45, '#0B0910', 6, 6);
    setPixel(lctx, 46, 46, BREBRE_PALETTE.pinkDark3, 4, 4);
    setPixel(lctx, 47, 47, BREBRE_PALETTE.deepPink, 2, 2);

    // Mortar junction foundry node at (32, 32)
    setPixel(lctx, 30, 30, '#09070D', 5, 5);
    setPixel(lctx, 31, 31, BREBRE_PALETTE.pinkDark2, 3, 3);
    setPixel(lctx, 32, 32, BREBRE_PALETTE.lightPink, 1, 1);
  } else if (resolved === 'labyrinth_grid') {
    // Circuit Labyrinth: dark cyber-slate PCB floor tiles with glowing #00F0FF cyan circuit buses & vents
    setPixel(lctx, 0, 0, '#070B10', gridSize, gridSize);

    // 4 beveled machined slate panels
    const panels = [
      { x: 1, y: 1, w: 30, h: 30 },
      { x: 33, y: 1, w: 30, h: 30 },
      { x: 1, y: 33, w: 30, h: 30 },
      { x: 33, y: 33, w: 30, h: 30 },
    ];
    for (let idx = 0; idx < panels.length; idx++) {
      const p = panels[idx];
      setPixel(lctx, p.x, p.y, idx % 2 === 0 ? '#0E1520' : '#0C121C', p.w, p.h);
      setPixel(lctx, p.x, p.y, '#1B283A', p.w - 1, 1);
      setPixel(lctx, p.x, p.y, '#1B283A', 1, p.h - 1);
      setPixel(lctx, p.x + 1, p.y + p.h - 1, '#060A10', p.w - 1, 1);
      setPixel(lctx, p.x + p.w - 1, p.y + 1, '#060A10', 1, p.h - 1);

      // Subtle machined grid ticks
      for (let gx = 6; gx < p.w - 4; gx += 6) {
        setPixel(lctx, p.x + gx, p.y + 4, '#162232', 1, 1);
        setPixel(lctx, p.x + gx, p.y + p.h - 5, '#162232', 1, 1);
      }
    }

    // Recessed cyan circuit bus channels across mortar lines
    setPixel(lctx, 0, 32, '#0A2E3B', gridSize, 1);
    setPixel(lctx, 32, 0, '#0A2E3B', 1, gridSize);
    for (let t = 6; t < gridSize; t += 12) {
      setPixel(lctx, t, 32, '#0E5B6E', 4, 1);
      setPixel(lctx, 32, t, '#0E5B6E', 1, 4);
    }

    // Stepped 45-degree PCB traces inside top-left & bottom-right panels
    setPixel(lctx, 6, 15, '#0C3E4F', 10, 2);
    setPixel(lctx, 16, 15, '#0C3E4F', 2, 10);
    setPixel(lctx, 16, 23, '#0C3E4F', 10, 2);
    setPixel(lctx, 7, 16, '#00B8D4', 8, 1);
    setPixel(lctx, 17, 16, '#00B8D4', 1, 7);

    // Solder via pads (glowing cyan cores)
    const vias = [
      [6, 15],
      [25, 23],
      [48, 12],
      [48, 22],
      [14, 48],
      [22, 48],
    ];
    for (const [vx, vy] of vias) {
      setPixel(lctx, vx - 1, vy - 1, '#082633', 3, 3);
      setPixel(lctx, vx, vy, '#00F0FF', 1, 1);
    }

    // Vertical circuit trace in top-right panel
    setPixel(lctx, 48, 12, '#0E5B6E', 1, 10);
    setPixel(lctx, 48, 16, '#00F0FF', 1, 2);

    // Horizontal circuit trace in bottom-left panel
    setPixel(lctx, 14, 48, '#0E5B6E', 8, 1);
    setPixel(lctx, 17, 48, '#00F0FF', 2, 1);

    // Floor cooling louver grating in bottom-right panel
    setPixel(lctx, 41, 41, '#060A10', 14, 14);
    for (let ly = 42; ly <= 52; ly += 3) {
      setPixel(lctx, 42, ly, '#172334', 12, 2);
      setPixel(lctx, 42, ly, '#253750', 12, 1);
    }
    setPixel(lctx, 46, 47, '#00F0FF', 4, 1);

    // Central bus junction relay node
    setPixel(lctx, 30, 30, '#071A24', 5, 5);
    setPixel(lctx, 31, 31, '#0097B2', 3, 3);
    setPixel(lctx, 32, 32, '#B2F5FF', 1, 1);
  } else if (resolved === 'citadel_plates') {
    // Citadel Core: Heavy reinforced chrome-slate battleship armor plating + reactor coolant channels
    setPixel(lctx, 0, 0, '#0C0D12', gridSize, gridSize);

    // Deep armor seams
    setPixel(lctx, 0, 0, '#050508', gridSize, 1);
    setPixel(lctx, 0, 0, '#050508', 1, gridSize);
    setPixel(lctx, 0, 32, '#050508', gridSize, 1);
    setPixel(lctx, 32, 0, '#050508', 1, gridSize);

    // Raised beveled steel deck plates (NW & SE quadrants)
    const raised = [
      { x: 2, y: 2, w: 28, h: 28 },
      { x: 34, y: 34, w: 28, h: 28 },
    ];
    for (const r of raised) {
      setPixel(lctx, r.x, r.y, '#191C26', r.w, r.h);
      setPixel(lctx, r.x, r.y, '#2F3546', r.w - 1, 1);
      setPixel(lctx, r.x, r.y, '#2F3546', 1, r.h - 1);
      setPixel(lctx, r.x + 1, r.y + r.h - 1, '#0D0F16', r.w - 1, 1);
      setPixel(lctx, r.x + r.w - 1, r.y + 1, '#0D0F16', 1, r.h - 1);
      // Inner recessed armor seam
      setPixel(lctx, r.x + 6, r.y + 6, '#131620', r.w - 12, r.h - 12);
      setPixel(lctx, r.x + 6, r.y + 6, '#262B3A', r.w - 12, 1);
      // Subtle steel diamond-tread pixels
      for (let tx = 9; tx < r.w - 9; tx += 4) {
        for (let ty = 9; ty < r.h - 9; ty += 4) {
          setPixel(lctx, r.x + tx, r.y + ty, '#232838', 2, 1);
        }
      }
    }

    // Recessed mechanical bay plates (NE & SW quadrants)
    setPixel(lctx, 34, 2, '#10121A', 28, 28);
    setPixel(lctx, 36, 4, '#151822', 24, 24);
    setPixel(lctx, 2, 34, '#10121A', 28, 28);
    setPixel(lctx, 4, 36, '#151822', 24, 24);

    // Chrome rivets with specular shine
    const rivetCoords = [
      [4, 4], [26, 4], [4, 26], [26, 26],
      [36, 36], [58, 36], [36, 58], [58, 58],
    ];
    for (const [rx, ry] of rivetCoords) {
      setPixel(lctx, rx, ry, '#475569', 2, 2);
      setPixel(lctx, rx, ry, '#E2E8F0', 1, 1);
    }

    // Warning stripe micro-accents on bay edges
    for (let sx = 38; sx < 58; sx += 4) {
      setPixel(lctx, sx, 26, '#334155', 2, 2);
      setPixel(lctx, 26, sx - 2, '#334155', 2, 2);
    }

    // Recessed high-energy power conduits in mechanical bays
    setPixel(lctx, 41, 12, '#07080D', 14, 8);
    setPixel(lctx, 42, 13, BREBRE_PALETTE.pinkDark3, 12, 6);
    setPixel(lctx, 44, 15, BREBRE_PALETTE.pinkDark1, 8, 2);
    setPixel(lctx, 47, 15, BREBRE_PALETTE.lightPink, 2, 2);

    setPixel(lctx, 12, 41, '#07080D', 8, 14);
    setPixel(lctx, 13, 42, '#0A2E3B', 6, 12);
    setPixel(lctx, 15, 44, '#00B8D4', 2, 8);
    setPixel(lctx, 15, 47, '#E0F7FA', 2, 2);
  } else {
    // starlight_grid: Deep cosmic obsidian plane with dithered amethyst nebula, astral rune grid & twinkling stars
    setPixel(lctx, 0, 0, '#05040A', gridSize, gridSize);

    // Layered dithered cosmic dust clouds
    const nebulaClusters = [
      { cx: 14, cy: 15, col: '#110B1F' },
      { cx: 48, cy: 46, col: '#120C22' },
      { cx: 46, cy: 16, col: '#0E091A' },
    ];
    for (const n of nebulaClusters) {
      for (let dx = -7; dx <= 7; dx++) {
        for (let dy = -7; dy <= 7; dy++) {
          const d2 = dx * dx + dy * dy;
          if (d2 <= 36 && (Math.abs(dx + dy) % 2 === 0 || d2 <= 12)) {
            setPixel(lctx, (n.cx + dx + 64) % 64, (n.cy + dy + 64) % 64, n.col, 1, 1);
          }
        }
      }
    }
    setPixel(lctx, 14, 15, '#2A144D', 2, 2);
    setPixel(lctx, 48, 46, '#2E1552', 2, 2);

    // Astral dotted ley-line grid every 32px
    for (let i = 0; i < gridSize; i += 2) {
      const majorCol = i % 8 === 0 ? '#581C87' : '#2E1065';
      setPixel(lctx, i, 0, majorCol, 1, 1);
      setPixel(lctx, 0, i, majorCol, 1, 1);
      if (i % 4 === 0) {
        setPixel(lctx, i, 32, '#1E1336', 1, 1);
        setPixel(lctx, 32, i, '#1E1336', 1, 1);
      }
    }

    // Subtle arcane diamond intersection sigil at (32, 32)
    setPixel(lctx, 32, 29, '#4C1D95', 1, 7);
    setPixel(lctx, 29, 32, '#4C1D95', 7, 1);
    setPixel(lctx, 31, 31, '#7E22CE', 3, 3);
    setPixel(lctx, 32, 32, '#E9D5FF', 1, 1);

    // Crisp 8-bit 4-point pixel stars
    setPixel(lctx, 20, 20, '#7E22CE', 1, 5);
    setPixel(lctx, 18, 22, '#7E22CE', 5, 1);
    setPixel(lctx, 20, 21, '#C084FC', 1, 3);
    setPixel(lctx, 19, 22, '#C084FC', 3, 1);
    setPixel(lctx, 20, 22, '#FFFFFF', 1, 1);

    setPixel(lctx, 52, 17, '#0E7490', 1, 3);
    setPixel(lctx, 51, 18, '#0E7490', 3, 1);
    setPixel(lctx, 52, 18, '#E0F7FA', 1, 1);

    // Scattered starfield pixels
    setPixel(lctx, 8, 48, '#CBD5E1', 1, 1);
    setPixel(lctx, 27, 54, '#FF1493', 1, 1);
    setPixel(lctx, 56, 52, '#E9D5FF', 1, 1);
    setPixel(lctx, 39, 9, '#C084FC', 1, 1);
    setPixel(lctx, 11, 37, '#94A3B8', 1, 1);
    setPixel(lctx, 58, 29, '#00F0FF', 1, 1);
  }

  const hiRes = document.createElement('canvas');
  hiRes.width = gridSize * scale;
  hiRes.height = gridSize * scale;
  const hctx = hiRes.getContext('2d');
  if (!hctx) return lowRes;
  hctx.imageSmoothingEnabled = false;
  hctx.drawImage(lowRes, 0, 0, hiRes.width, hiRes.height);

  tileCanvasCache.set(resolved, hiRes);
  return hiRes;
}

/**
 * Generates a crisp 16-bit retro pixel-art arcade horizon banner in the BreBre Colors palette
 * for the Lobby hero card and header backdrop.
 */
export function getLobbyPixelBannerDataUrl(): string {
  if (cachedLobbyBannerUrl) return cachedLobbyBannerUrl;
  if (typeof document === 'undefined') return '';

  const w = 160;
  const h = 64;
  const scale = 4;
  const low = document.createElement('canvas');
  low.width = w;
  low.height = h;
  const ctx = low.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingEnabled = false;

  // Sky: #000000 Black top to #111111 Gray 900 & #5B0633 Pink Dark 3 horizon bands
  setPixel(ctx, 0, 0, BREBRE_PALETTE.black, w, 26);
  setPixel(ctx, 0, 26, BREBRE_PALETTE.gray900, w, 8);
  setPixel(ctx, 0, 34, BREBRE_PALETTE.pinkDark3, w, 6);
  setPixel(ctx, 0, 40, BREBRE_PALETTE.pinkDark2, w, 2);

  // Pixel dither transitions between sky bands
  for (let x = 0; x < w; x += 2) {
    setPixel(ctx, x, 25, BREBRE_PALETTE.gray900, 1, 1);
    setPixel(ctx, x + 1, 33, BREBRE_PALETTE.pinkDark3, 1, 1);
    setPixel(ctx, x, 39, BREBRE_PALETTE.pinkDark2, 1, 1);
  }

  // Retro pixel stars in upper sky (#FFFFFF, #FFB6D9, #C0C0C0, #FF1493)
  const stars: Array<[number, number, string]> = [
    [12, 6, BREBRE_PALETTE.white],
    [28, 14, BREBRE_PALETTE.lightPink],
    [45, 8, BREBRE_PALETTE.silver],
    [66, 5, BREBRE_PALETTE.deepPink],
    [94, 7, BREBRE_PALETTE.lightPink],
    [118, 12, BREBRE_PALETTE.white],
    [136, 6, BREBRE_PALETTE.silver],
    [149, 15, BREBRE_PALETTE.deepPink],
  ];
  for (const [sx, sy, scol] of stars) {
    setPixel(ctx, sx, sy, scol, 1, 1);
  }
  // Twinkling 4-point pixel star
  setPixel(ctx, 118, 11, BREBRE_PALETTE.pinkDark2, 1, 3);
  setPixel(ctx, 117, 12, BREBRE_PALETTE.pinkDark2, 3, 1);
  setPixel(ctx, 118, 12, BREBRE_PALETTE.white, 1, 1);

  // Retro Pixel Sun with horizontal scanline cuts (#FF1493, #FFB6D9, #CD0D72)
  const sunCx = 80;
  const sunCy = 32;
  const sunR = 14;
  for (let y = sunCy - sunR; y <= 40; y++) {
    if (y > 31 && y % 2 === 0) continue; // Classic outrun pixel scanline cutout
    const dy = y - sunCy;
    const span = Math.floor(Math.sqrt(Math.max(0, sunR * sunR - dy * dy)));
    const rowColor =
      y < sunCy - 5
        ? BREBRE_PALETTE.lightPink
        : y < sunCy + 2
          ? BREBRE_PALETTE.deepPink
          : BREBRE_PALETTE.pinkDark1;
    setPixel(ctx, sunCx - span, y, rowColor, span * 2, 1);
  }

  // Distant Pixel Citadel Silhouette along horizon (y = 28..41)
  const skylineHeights = [
    4, 4, 8, 8, 12, 12, 6, 6, 15, 15, 15, 9, 9, 5, 5, 11, 11, 7, 7, 3, 3, 0, 0, 0,
    0, 0, 0, 4, 4, 10, 10, 14, 14, 8, 8, 16, 16, 11, 11, 6, 6,
  ];
  for (let i = 0; i < skylineHeights.length; i++) {
    const bh = skylineHeights[i];
    if (bh <= 0) continue;
    const bx = i * 4;
    setPixel(ctx, bx, 41 - bh, BREBRE_PALETTE.gray900, 4, bh);
    setPixel(ctx, bx, 41 - bh, BREBRE_PALETTE.pinkDark2, 4, 1);
    if (bh >= 10) {
      setPixel(ctx, bx + 1, 43 - bh, BREBRE_PALETTE.lightPink, 1, 1);
    }
  }

  // Perspective Pixel Grid Floor (y = 41..64)
  setPixel(ctx, 0, 41, BREBRE_PALETTE.black, w, h - 41);
  setPixel(ctx, 0, 41, BREBRE_PALETTE.deepPink, w, 1);

  const horizonRows = [43, 46, 50, 55, 61];
  for (const ry of horizonRows) {
    setPixel(
      ctx,
      0,
      ry,
      ry < 50 ? BREBRE_PALETTE.pinkDark3 : BREBRE_PALETTE.pinkDark2,
      w,
      1
    );
  }

  // Perspective radiating pixel lines from center horizon (80, 41)
  for (let gx = -80; gx <= 80; gx += 16) {
    for (let y = 42; y < h; y++) {
      const t = (y - 41) / (h - 41);
      const px = Math.round(80 + gx * (0.25 + t * 1.35));
      if (px >= 0 && px < w) {
        setPixel(
          ctx,
          px,
          y,
          gx === 0 ? BREBRE_PALETTE.deepPink : BREBRE_PALETTE.pinkDark2,
          1,
          1
        );
      }
    }
  }

  const out = document.createElement('canvas');
  out.width = w * scale;
  out.height = h * scale;
  const octx = out.getContext('2d');
  if (!octx) return '';
  octx.imageSmoothingEnabled = false;
  octx.drawImage(low, 0, 0, out.width, out.height);

  cachedLobbyBannerUrl = out.toDataURL('image/png');
  return cachedLobbyBannerUrl;
}

export interface EmojiContrastBackingStyle {
  outerFill: string;
  innerCushionFill: string;
  rimStroke: string;
  isDarkAsset: boolean;
}

const contrastAnalysisCache = new Map<string, EmojiContrastBackingStyle>();

/**
 * Inspects an emoji/avatar image (when CORS allows pixel readback) to detect dark or
 * low-contrast transparent assets, and returns a 100% opaque BreBre Colors backing plate.
 */
export function getEmojiContrastBacking(
  img: HTMLImageElement | undefined,
  url: string
): EmojiContrastBackingStyle {
  const cached = contrastAnalysisCache.get(url);
  if (cached) return cached;

  const universalFallback: EmojiContrastBackingStyle = {
    outerFill: BREBRE_PALETTE.gray850,
    innerCushionFill: '#D4B8C8',
    rimStroke: BREBRE_PALETTE.pinkDark2,
    isDarkAsset: true,
  };

  if (!img || !img.complete || img.naturalWidth === 0 || typeof document === 'undefined') {
    return universalFallback;
  }

  try {
    const sampleSize = 16;
    const c = document.createElement('canvas');
    c.width = sampleSize;
    c.height = sampleSize;
    const ctx = c.getContext('2d');
    if (!ctx) return universalFallback;

    ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
    const data = ctx.getImageData(0, 0, sampleSize, sampleSize).data;

    let visiblePixels = 0;
    let totalLum = 0;

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 38) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      totalLum += lum;
      visiblePixels += 1;
    }

    if (visiblePixels === 0) {
      contrastAnalysisCache.set(url, universalFallback);
      return universalFallback;
    }

    const avgLum = totalLum / visiblePixels;
    if (avgLum < 115) {
      const darkStyle: EmojiContrastBackingStyle = {
        outerFill: BREBRE_PALETTE.pinkDark3,
        innerCushionFill: BREBRE_PALETTE.silver,
        rimStroke: BREBRE_PALETTE.lightPink,
        isDarkAsset: true,
      };
      contrastAnalysisCache.set(url, darkStyle);
      return darkStyle;
    }

    const brightStyle: EmojiContrastBackingStyle = {
      outerFill: BREBRE_PALETTE.gray900,
      innerCushionFill: '#24111B',
      rimStroke: BREBRE_PALETTE.pinkDark2,
      isDarkAsset: false,
    };
    contrastAnalysisCache.set(url, brightStyle);
    return brightStyle;
  } catch {
    contrastAnalysisCache.set(url, universalFallback);
    return universalFallback;
  }
}
