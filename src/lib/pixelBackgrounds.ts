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
    label: 'Auto Wave Cycle',
    subtitle: 'Rotates BreBre pixel-art realms as waves advance',
  },
  {
    id: 'dungeon_circuit',
    label: 'Obsidian Circuit Floor',
    subtitle: '#111111 flagstones · #5B0633 & #9A0957 pixel rune traces',
  },
  {
    id: 'citadel_plates',
    label: 'Citadel Armor Deck',
    subtitle: '#1A1A1A pixel plating · #5E5E5E rivets · #CD0D72 conduits',
  },
  {
    id: 'starlight_grid',
    label: 'Synth Starlight Grid',
    subtitle: '#000000 void · #5B0633 pixel grid · #FFB6D9 8-bit stars',
  },
];

const tileCanvasCache = new Map<string, HTMLCanvasElement>();
let cachedLobbyBannerUrl: string | null = null;

export function resolveArenaPixelBgStyle(
  style: ArenaPixelBgStyle | undefined,
  wave: number
): Exclude<ArenaPixelBgStyle, 'auto'> {
  if (style && style !== 'auto') return style;
  const cycle = Math.floor(Math.max(0, wave - 1) / 2) % 3;
  if (cycle === 0) return 'dungeon_circuit';
  if (cycle === 1) return 'citadel_plates';
  return 'starlight_grid';
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
 * rendered on a 64×64 pixel grid and scaled 4× with nearest-neighbor (`imageSmoothingEnabled = false`)
 * strictly using the BreBre Colors UI Standards Palette v0.
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
    // Base #000000 Black + #111111 Gray 900 pixel flagstones
    setPixel(lctx, 0, 0, BREBRE_PALETTE.black, gridSize, gridSize);

    // 32x32 staggered pixel stone blocks
    const blocks = [
      { x: 1, y: 1, w: 30, h: 30 },
      { x: 33, y: 1, w: 30, h: 30 },
      { x: 1, y: 33, w: 30, h: 30 },
      { x: 33, y: 33, w: 30, h: 30 },
    ];

    for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
      const b = blocks[bIdx];
      // Block fill in Gray 900 (#111111)
      setPixel(lctx, b.x, b.y, BREBRE_PALETTE.gray900, b.w, b.h);

      // Top/Left pixel bevel highlight in Gray 850 (#1A1A1A)
      setPixel(lctx, b.x, b.y, BREBRE_PALETTE.gray850, b.w, 1);
      setPixel(lctx, b.x, b.y, BREBRE_PALETTE.gray850, 1, b.h);

      // Subtle checkerboard pixel dithering in corners
      for (let dx = 2; dx < b.w - 2; dx += 4) {
        for (let dy = 2; dy < b.h - 2; dy += 4) {
          if ((dx + dy + bIdx) % 8 === 0) {
            setPixel(lctx, b.x + dx, b.y + dy, BREBRE_PALETTE.gray850, 1, 1);
          }
        }
      }

      // Corner pixel rivets (#5E5E5E Gray 600)
      setPixel(lctx, b.x + 2, b.y + 2, BREBRE_PALETTE.gray600, 1, 1);
      setPixel(lctx, b.x + b.w - 3, b.y + 2, BREBRE_PALETTE.gray600, 1, 1);
      setPixel(lctx, b.x + 2, b.y + b.h - 3, BREBRE_PALETTE.gray600, 1, 1);
      setPixel(lctx, b.x + b.w - 3, b.y + b.h - 3, BREBRE_PALETTE.gray600, 1, 1);
    }

    // Recessed pixel rune circuit seams along mortar channels (#5B0633 Pink Dark 3 & #9A0957 Pink Dark 2)
    setPixel(lctx, 0, 32, BREBRE_PALETTE.pinkDark3, gridSize, 1);
    setPixel(lctx, 32, 0, BREBRE_PALETTE.pinkDark3, 1, gridSize);

    // Stepped pixel circuit traces inside blocks
    for (let t = 8; t <= 24; t += 2) {
      setPixel(lctx, t, 16, BREBRE_PALETTE.pinkDark3, 1, 1);
      setPixel(lctx, 48, t + 32, BREBRE_PALETTE.pinkDark3, 1, 1);
    }
    setPixel(lctx, 15, 15, BREBRE_PALETTE.pinkDark2, 3, 3);
    setPixel(lctx, 16, 16, BREBRE_PALETTE.deepPink, 1, 1);

    setPixel(lctx, 47, 47, BREBRE_PALETTE.pinkDark2, 3, 3);
    setPixel(lctx, 48, 48, BREBRE_PALETTE.lightPink, 1, 1);

    // Intersection pixel node at (32, 32)
    setPixel(lctx, 31, 31, BREBRE_PALETTE.pinkDark2, 3, 3);
    setPixel(lctx, 32, 32, BREBRE_PALETTE.pinkDark1, 1, 1);
  } else if (resolved === 'citadel_plates') {
    // Base #111111 Gray 900 with #1A1A1A Gray 850 octagonal armor deck plates
    setPixel(lctx, 0, 0, BREBRE_PALETTE.gray900, gridSize, gridSize);

    // Diagonal seam channels in #000000 Black
    setPixel(lctx, 0, 0, BREBRE_PALETTE.black, gridSize, 1);
    setPixel(lctx, 0, 0, BREBRE_PALETTE.black, 1, gridSize);
    setPixel(lctx, 0, 32, BREBRE_PALETTE.black, gridSize, 1);
    setPixel(lctx, 32, 0, BREBRE_PALETTE.black, 1, gridSize);

    // Raised metallic plating (#1A1A1A)
    setPixel(lctx, 3, 3, BREBRE_PALETTE.gray850, 26, 26);
    setPixel(lctx, 35, 35, BREBRE_PALETTE.gray850, 26, 26);
    setPixel(lctx, 35, 3, BREBRE_PALETTE.black, 26, 26);
    setPixel(lctx, 37, 5, BREBRE_PALETTE.gray900, 22, 22);
    setPixel(lctx, 3, 35, BREBRE_PALETTE.black, 26, 26);
    setPixel(lctx, 5, 37, BREBRE_PALETTE.gray900, 22, 22);

    // Pixel rivets in #5E5E5E Gray 600 and #C0C0C0 Silver
    const rivetCoords = [
      [5, 5],
      [26, 5],
      [5, 26],
      [26, 26],
      [37, 37],
      [58, 37],
      [37, 58],
      [58, 58],
    ];
    for (const [rx, ry] of rivetCoords) {
      setPixel(lctx, rx, ry, BREBRE_PALETTE.gray600, 2, 2);
      setPixel(lctx, rx, ry, BREBRE_PALETTE.silver, 1, 1);
    }

    // Pink Dark 3 (#5B0633) & Pink Dark 2 (#9A0957) power conduits in recessed quadrants
    setPixel(lctx, 42, 14, BREBRE_PALETTE.pinkDark3, 12, 4);
    setPixel(lctx, 44, 15, BREBRE_PALETTE.pinkDark2, 8, 2);
    setPixel(lctx, 47, 15, BREBRE_PALETTE.pinkDark1, 2, 2);

    setPixel(lctx, 14, 42, BREBRE_PALETTE.pinkDark3, 4, 12);
    setPixel(lctx, 15, 44, BREBRE_PALETTE.pinkDark2, 2, 8);
    setPixel(lctx, 15, 47, BREBRE_PALETTE.deepPink, 2, 2);
  } else {
    // starlight_grid: Retro 8-bit synth void (#000000) + #5B0633 pixel grid + BreBre pixel stars
    setPixel(lctx, 0, 0, BREBRE_PALETTE.black, gridSize, gridSize);

    // Dithered pixel nebula cluster in #111111 & #5B0633
    const nebulaDots = [
      [10, 12],
      [12, 14],
      [14, 12],
      [11, 15],
      [44, 42],
      [46, 44],
      [42, 45],
      [45, 40],
    ];
    for (const [nx, ny] of nebulaDots) {
      setPixel(lctx, nx, ny, BREBRE_PALETTE.gray900, 2, 2);
    }
    setPixel(lctx, 12, 13, BREBRE_PALETTE.pinkDark3, 1, 1);
    setPixel(lctx, 44, 43, BREBRE_PALETTE.pinkDark3, 1, 1);

    // Dotted pixel synth grid every 32px
    for (let i = 0; i < gridSize; i += 2) {
      setPixel(
        lctx,
        i,
        0,
        i % 8 === 0 ? BREBRE_PALETTE.pinkDark2 : BREBRE_PALETTE.pinkDark3,
        1,
        1
      );
      setPixel(
        lctx,
        0,
        i,
        i % 8 === 0 ? BREBRE_PALETTE.pinkDark2 : BREBRE_PALETTE.pinkDark3,
        1,
        1
      );
      setPixel(lctx, i, 32, BREBRE_PALETTE.gray850, 1, 1);
      setPixel(lctx, 32, i, BREBRE_PALETTE.gray850, 1, 1);
    }

    // Crisp 8-bit pixel stars (#FFB6D9 Light Pink, #FF1493 Deep Pink, #C0C0C0 Silver, #FFFFFF White)
    // Plus-shaped pixel star at (20, 22)
    setPixel(lctx, 20, 21, BREBRE_PALETTE.pinkDark2, 1, 3);
    setPixel(lctx, 19, 22, BREBRE_PALETTE.pinkDark2, 3, 1);
    setPixel(lctx, 20, 22, BREBRE_PALETTE.lightPink, 1, 1);

    // Plus-shaped pixel star at (52, 18)
    setPixel(lctx, 52, 17, BREBRE_PALETTE.gray600, 1, 3);
    setPixel(lctx, 51, 18, BREBRE_PALETTE.gray600, 3, 1);
    setPixel(lctx, 52, 18, BREBRE_PALETTE.white, 1, 1);

    // Single-pixel stars
    setPixel(lctx, 8, 48, BREBRE_PALETTE.silver, 1, 1);
    setPixel(lctx, 27, 54, BREBRE_PALETTE.deepPink, 1, 1);
    setPixel(lctx, 56, 52, BREBRE_PALETTE.lightPink, 1, 1);
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
 *
 * - Dark/low-luminance sprites receive a high-contrast Silver (`#C0C0C0`) & Light Pink (`#FFB6D9`)
 *   opaque inner cushion so black line-art and dark silhouettes stand out crisply.
 * - Bright sprites receive a deep `#1A1A1A` / `#5B0633` opaque plate with a `#9A0957` rim.
 * - Cross-origin images that block `getImageData` receive a balanced dual-tone opaque plate
 *   (`#2A1521` outer ring + `#D8C8D2` inner contrast cushion) that guarantees contrast for both
 *   black/dark transparent PNGs and white/light emojis.
 */
export function getEmojiContrastBacking(
  img: HTMLImageElement | undefined,
  url: string
): EmojiContrastBackingStyle {
  const cached = contrastAnalysisCache.get(url);
  if (cached) return cached;

  // Default universal high-contrast dual-tone backing (contrasts against both #000000 and #FFFFFF sprites)
  const universalFallback: EmojiContrastBackingStyle = {
    outerFill: BREBRE_PALETTE.gray850,
    innerCushionFill: '#D4B8C8', // Balanced Silver-Pink mid-light cushion (contrasts with black AND white)
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
      if (a < 38) continue; // Ignore transparent background pixels
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Relative perceived luminance (0..255)
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      totalLum += lum;
      visiblePixels += 1;
    }

    if (visiblePixels === 0) {
      contrastAnalysisCache.set(url, universalFallback);
      return universalFallback;
    }

    const avgLum = totalLum / visiblePixels;
    // If average visible pixel luminance is dark (< 115), use a bright Silver/LightPink opaque cushion
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

    // For bright sprites, use an opaque #1A1A1A / #5B0633 dark plum-slate plate so it still separates from the floor
    const brightStyle: EmojiContrastBackingStyle = {
      outerFill: BREBRE_PALETTE.gray900,
      innerCushionFill: '#24111B',
      rimStroke: BREBRE_PALETTE.pinkDark2,
      isDarkAsset: false,
    };
    contrastAnalysisCache.set(url, brightStyle);
    return brightStyle;
  } catch {
    // Tainted cross-origin canvas: cache universal mid-light Silver-Pink opaque cushion so dark emojis never vanish
    contrastAnalysisCache.set(url, universalFallback);
    return universalFallback;
  }
}
