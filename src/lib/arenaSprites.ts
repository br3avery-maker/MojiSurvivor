/**
 * 16-Bit Pixel-Art Arena Prop, Obstacle, Interactive Pad, Power-Up Crate,
 * Perimeter Wall, and Lobby Realm Diorama Renderer for MojiSurvivor.
 *
 * Uses cached nearest-neighbor offscreen pixel canvases paired with lightweight
 * animated pixel FX — zero placeholder boxes or wireframe developer text.
 */

import { getArenaPixelTileCanvas } from './pixelBackgrounds';
import { getRealmSpec, type RealmId, type RealmObstacle, type RealmPadSpec } from './realms';

export type PowerUpCrateKind = 'speed' | 'shield' | 'fury' | 'magnet';

const spriteCache = new Map<string, HTMLCanvasElement>();
const realmPreviewCache = new Map<RealmId, string>();

function px(
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

function makePixelCanvas(
  gridW: number,
  gridH: number,
  draw: (ctx: CanvasRenderingContext2D) => void
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = gridW;
  c.height = gridH;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  return c;
}

/**
 * 16-bit 2.5D Obsidian Foundry Anchor Pylon (24×28 pixel grid -> scaled crisp to obstacle bounds).
 * Stepped forged basalt pedestal, dark iron corner clamps, glowing carved magma-magenta rune face,
 * and recessed top forge brazier crystal.
 */
function getFoundryPylonSprite(): HTMLCanvasElement | null {
  const key = 'obs:foundry_pylon';
  const cached = spriteCache.get(key);
  if (cached) return cached;

  const sprite = makePixelCanvas(24, 28, (ctx) => {
    // Stepped stone base plinth (y = 20..27)
    px(ctx, 1, 20, '#07060B', 22, 8);
    px(ctx, 2, 21, '#1B1826', 20, 6);
    px(ctx, 2, 21, '#312B42', 20, 1);
    px(ctx, 2, 26, '#0E0C14', 20, 1);
    // Corner iron anchor bolts on base
    px(ctx, 3, 23, '#64748B', 2, 2);
    px(ctx, 3, 23, '#CBD5E1', 1, 1);
    px(ctx, 19, 23, '#64748B', 2, 2);
    px(ctx, 19, 23, '#CBD5E1', 1, 1);

    // Front vertical pillar face (2.5D height, y = 13..22)
    px(ctx, 3, 13, '#09080F', 18, 10);
    px(ctx, 4, 14, '#181523', 16, 8);
    // Side iron edge trim
    px(ctx, 4, 14, '#2A253A', 2, 8);
    px(ctx, 18, 14, '#12101A', 2, 8);
    // Recessed carved magenta energy conduit on front wall
    px(ctx, 10, 15, '#0B0710', 4, 7);
    px(ctx, 11, 15, '#9A0957', 2, 6);
    px(ctx, 11, 16, '#FF1493', 2, 3);
    px(ctx, 11, 17, '#FFB6D9', 1, 1);
    // Side carved grooves
    px(ctx, 7, 16, '#0D0B14', 1, 5);
    px(ctx, 16, 16, '#0D0B14', 1, 5);

    // Top crown slab (y = 2..15)
    px(ctx, 2, 2, '#08070D', 20, 13);
    px(ctx, 3, 3, '#252134', 18, 11);
    // Top-left chiseled bevel highlight
    px(ctx, 3, 3, '#474060', 18, 1);
    px(ctx, 3, 3, '#3B3450', 1, 11);
    // Bottom-right bevel shadow
    px(ctx, 3, 13, '#13101C', 18, 1);
    px(ctx, 20, 4, '#13101C', 1, 10);

    // 4 forged steel corner brackets
    const brackets = [
      [3, 3],
      [18, 3],
      [3, 11],
      [18, 11],
    ];
    for (const [bx, by] of brackets) {
      px(ctx, bx, by, '#475569', 3, 3);
      px(ctx, bx, by, '#94A3B8', 2, 1);
      px(ctx, bx, by, '#E2E8F0', 1, 1);
    }

    // Recessed furnace core basin in crown center
    px(ctx, 7, 5, '#09070E', 10, 7);
    px(ctx, 8, 6, '#3D0724', 8, 5);
    px(ctx, 9, 6, '#9A0957', 6, 5);
    px(ctx, 10, 7, '#FF1493', 4, 3);
    px(ctx, 11, 7, '#FFB6D9', 2, 2);
    px(ctx, 11, 7, '#FFFFFF', 1, 1);
  });

  if (sprite) spriteCache.set(key, sprite);
  return sprite;
}

/**
 * 16-bit Floating Starlight Rift Void Energy Monolith (22×28 pixel grid).
 * Faceted amethyst crystal obelisk hovering over an etched rune socket.
 */
function getRiftMonolithSprite(): HTMLCanvasElement | null {
  const key = 'obs:rift_monolith';
  const cached = spriteCache.get(key);
  if (cached) return cached;

  const sprite = makePixelCanvas(22, 28, (ctx) => {
    // Outer dark silhouette
    px(ctx, 10, 1, '#140826', 2, 2);
    px(ctx, 8, 3, '#140826', 6, 2);
    px(ctx, 6, 5, '#140826', 10, 3);
    px(ctx, 4, 8, '#140826', 14, 11);
    px(ctx, 6, 19, '#140826', 10, 3);
    px(ctx, 8, 22, '#140826', 6, 2);
    px(ctx, 10, 24, '#140826', 2, 2);

    // Deep amethyst crystal body
    px(ctx, 10, 2, '#6B21A8', 2, 2);
    px(ctx, 8, 4, '#6B21A8', 6, 2);
    px(ctx, 6, 6, '#581C87', 10, 14);
    px(ctx, 5, 9, '#4C1D95', 12, 9);
    px(ctx, 8, 20, '#3B0764', 6, 3);
    px(ctx, 10, 23, '#3B0764', 2, 2);

    // Left sunlit crystal facet (bright orchid -> lilac specular)
    px(ctx, 9, 4, '#A855F7', 2, 2);
    px(ctx, 7, 6, '#A855F7', 4, 12);
    px(ctx, 6, 9, '#C084FC', 3, 8);
    px(ctx, 7, 7, '#E9D5FF', 2, 5);
    px(ctx, 8, 5, '#FAF5FF', 1, 4);

    // Right shadowed facet
    px(ctx, 12, 6, '#3B0764', 4, 12);
    px(ctx, 14, 9, '#2E1065', 2, 8);

    // Glowing cyan-pink rift fracture core down the spine
    px(ctx, 10, 7, '#C084FC', 2, 11);
    px(ctx, 10, 9, '#F0ABFC', 2, 7);
    px(ctx, 10, 10, '#FFFFFF', 1, 4);
    px(ctx, 11, 12, '#00F0FF', 1, 2);

    // Floating side crystal shards
    px(ctx, 2, 11, '#7E22CE', 2, 4);
    px(ctx, 2, 11, '#E9D5FF', 1, 2);
    px(ctx, 18, 12, '#7E22CE', 2, 4);
    px(ctx, 18, 12, '#C084FC', 1, 2);
  });

  if (sprite) spriteCache.set(key, sprite);
  return sprite;
}

/**
 * 16-bit Citadel Core Reinforced Blast Baffle (36×20 pixel grid -> scales crisp to 72×36).
 */
function getCitadelBaffleSprite(): HTMLCanvasElement | null {
  const key = 'obs:citadel_baffle';
  const cached = spriteCache.get(key);
  if (cached) return cached;

  const sprite = makePixelCanvas(36, 20, (ctx) => {
    // Base armor shell
    px(ctx, 0, 1, '#07080D', 36, 18);
    // Front lower vertical armor apron (y = 12..18)
    px(ctx, 1, 12, '#141722', 34, 6);
    // Diagonal steel/slate hazard stripes along lower face
    for (let x = 3; x < 33; x += 4) {
      px(ctx, x, 13, '#334155', 2, 4);
      px(ctx, x + 1, 13, '#64748B', 1, 2);
    }
    px(ctx, 1, 17, '#090B10', 34, 1);

    // Top beveled titanium blast deck (y = 2..12)
    px(ctx, 1, 2, '#272D3D', 34, 10);
    px(ctx, 1, 2, '#64748B', 34, 1);
    px(ctx, 2, 3, '#94A3B8', 32, 1);
    px(ctx, 1, 11, '#11141E', 34, 1);

    // Bolted armored end-caps
    px(ctx, 1, 2, '#334155', 5, 16);
    px(ctx, 2, 3, '#CBD5E1', 3, 2);
    px(ctx, 30, 2, '#334155', 5, 16);
    px(ctx, 31, 3, '#CBD5E1', 3, 2);
    // Rivets on end-caps
    px(ctx, 3, 8, '#0F172A', 1, 1);
    px(ctx, 3, 14, '#E2E8F0', 1, 1);
    px(ctx, 32, 8, '#0F172A', 1, 1);
    px(ctx, 32, 14, '#E2E8F0', 1, 1);

    // Recessed center armor bay with glowing status diodes
    px(ctx, 8, 5, '#0F131C', 20, 5);
    px(ctx, 9, 6, '#1E2433', 18, 3);
    px(ctx, 11, 7, '#00F0FF', 4, 1);
    px(ctx, 17, 7, '#FF1493', 2, 1);
    px(ctx, 21, 7, '#00F0FF', 4, 1);
  });

  if (sprite) spriteCache.set(key, sprite);
  return sprite;
}

/**
 * 16-bit Circuit Labyrinth Armored Corridor Wall (dynamically cached per w×h dimension).
 */
function getLabyrinthWallSprite(w: number, h: number): HTMLCanvasElement | null {
  const key = `obs:lab_wall:${w}x${h}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;

  const gw = Math.max(12, Math.round(w / 2));
  const gh = Math.max(12, Math.round(h / 2));
  const horizontal = gw >= gh;

  const sprite = makePixelCanvas(gw, gh, (ctx) => {
    // Outer shadow border
    px(ctx, 0, 0, '#05080D', gw, gh);

    // South-facing 2.5D vertical wall face (bottom 5 pixel rows)
    const faceH = Math.min(6, Math.floor(gh * 0.34));
    const topH = gh - faceH - 1;

    // Front vertical bulkhead face
    px(ctx, 1, topH, '#0B121D', gw - 2, faceH);
    px(ctx, 1, topH, '#162436', gw - 2, 1);
    for (let vx = 4; vx < gw - 4; vx += 8) {
      px(ctx, vx, topH + 1, '#101B2B', 2, faceH - 2);
      px(ctx, vx + 3, topH + 2, '#0A3E4F', 3, 1);
    }

    // Top armored walkway/wall cap
    px(ctx, 1, 1, '#162233', gw - 2, topH - 1);
    px(ctx, 1, 1, '#2D4463', gw - 2, 1);
    px(ctx, 1, 1, '#243750', 1, topH - 1);
    px(ctx, gw - 2, 2, '#0B121C', 1, topH - 2);

    // Segmented metal plating seams & rivets
    if (horizontal) {
      for (let sx = 12; sx < gw - 10; sx += 16) {
        px(ctx, sx, 2, '#0A1019', 1, topH - 2);
        px(ctx, sx + 1, 2, '#243750', 1, topH - 2);
      }
      // Central recessed cyan circuit channel
      const midY = Math.max(3, Math.floor(topH / 2));
      px(ctx, 4, midY - 1, '#07111A', gw - 8, 3);
      px(ctx, 5, midY, '#0E5B6E', gw - 10, 1);
      for (let nx = 8; nx < gw - 8; nx += 14) {
        px(ctx, nx, midY - 1, '#00B8D4', 3, 3);
        px(ctx, nx + 1, midY, '#B2F5FF', 1, 1);
      }
      // Bolted end-cap posts
      px(ctx, 1, 1, '#253954', 5, gh - 2);
      px(ctx, 2, 2, '#64748B', 3, 2);
      px(ctx, gw - 6, 1, '#253954', 5, gh - 2);
      px(ctx, gw - 5, 2, '#64748B', 3, 2);
    } else {
      for (let sy = 10; sy < topH - 6; sy += 14) {
        px(ctx, 2, sy, '#0A1019', gw - 4, 1);
        px(ctx, 2, sy + 1, '#243750', gw - 4, 1);
      }
      // Vertical cyan circuit channel
      const midX = Math.max(3, Math.floor(gw / 2));
      px(ctx, midX - 1, 4, '#07111A', 3, topH - 6);
      px(ctx, midX, 5, '#0E5B6E', 1, topH - 8);
      for (let ny = 8; ny < topH - 6; ny += 14) {
        px(ctx, midX - 1, ny, '#00B8D4', 3, 3);
        px(ctx, midX, ny + 1, '#B2F5FF', 1, 1);
      }
      // Top & bottom cap posts
      px(ctx, 1, 1, '#253954', gw - 2, 5);
      px(ctx, 2, 2, '#64748B', gw - 4, 2);
      px(ctx, 1, gh - 6, '#253954', gw - 2, 5);
      px(ctx, 2, gh - 5, '#475569', gw - 4, 2);
    }
  });

  if (sprite) spriteCache.set(key, sprite);
  return sprite;
}

/**
 * 16-bit Pixel-Art Power-Up Crate Sprites (16×16 grid -> drawn at 28×28 crisp).
 */
function getPowerUpCrateSprite(kind: PowerUpCrateKind): HTMLCanvasElement | null {
  const key = `crate:${kind}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;

  const palette: Record<
    PowerUpCrateKind,
    { rim: string; glow: string; dark: string; core: string }
  > = {
    speed: { rim: '#00F0FF', glow: '#67E8F9', dark: '#083344', core: '#ECFEFF' },
    shield: { rim: '#00FF9D', glow: '#6EE7B7', dark: '#064E3B', core: '#ECFDF5' },
    fury: { rim: '#C084FC', glow: '#F0ABFC', dark: '#3B0764', core: '#FAF5FF' },
    magnet: { rim: '#E2E8F0', glow: '#00F0FF', dark: '#1E293B', core: '#FFFFFF' },
  };

  const c = palette[kind];
  const sprite = makePixelCanvas(16, 16, (ctx) => {
    // Beveled metallic supply pod
    px(ctx, 1, 1, '#05060A', 14, 14);
    px(ctx, 2, 2, c.rim, 12, 12);
    px(ctx, 3, 3, c.dark, 10, 10);
    // Corner rivets
    px(ctx, 2, 2, '#FFFFFF', 1, 1);
    px(ctx, 13, 2, '#CBD5E1', 1, 1);
    px(ctx, 2, 13, '#CBD5E1', 1, 1);
    px(ctx, 13, 13, '#64748B', 1, 1);

    if (kind === 'speed') {
      // Crisp pixel lightning bolt
      px(ctx, 8, 4, c.glow, 3, 1);
      px(ctx, 7, 5, c.core, 3, 1);
      px(ctx, 6, 6, c.core, 3, 1);
      px(ctx, 5, 7, c.rim, 6, 2);
      px(ctx, 7, 9, c.core, 3, 1);
      px(ctx, 6, 10, c.glow, 3, 1);
      px(ctx, 5, 11, c.rim, 3, 1);
    } else if (kind === 'shield') {
      // Crisp pixel kite shield
      px(ctx, 5, 4, c.rim, 6, 1);
      px(ctx, 4, 5, c.glow, 8, 4);
      px(ctx, 5, 9, c.rim, 6, 2);
      px(ctx, 6, 11, c.rim, 4, 1);
      px(ctx, 7, 12, c.glow, 2, 1);
      // Inner cross shine
      px(ctx, 7, 5, c.core, 2, 5);
      px(ctx, 5, 7, c.core, 6, 1);
    } else if (kind === 'fury') {
      // Crisp pixel 4-point overdrive burst / star
      px(ctx, 7, 3, c.rim, 2, 10);
      px(ctx, 3, 7, c.rim, 10, 2);
      px(ctx, 5, 5, c.glow, 6, 6);
      px(ctx, 6, 6, '#FF1493', 4, 4);
      px(ctx, 7, 7, c.core, 2, 2);
    } else {
      // Crisp pixel horseshoe magnet
      px(ctx, 4, 4, '#FF1493', 2, 2);
      px(ctx, 10, 4, '#00F0FF', 2, 2);
      px(ctx, 4, 6, c.rim, 2, 4);
      px(ctx, 10, 6, c.rim, 2, 4);
      px(ctx, 5, 10, c.rim, 6, 2);
      px(ctx, 6, 11, c.core, 4, 1);
    }
  });

  if (sprite) spriteCache.set(key, sprite);
  return sprite;
}

/**
 * 16-bit Pixel-Art Pad Emblems (20×20 pixel grid) for Magnet Shrine, Warp Rune & Overcharge Node.
 */
function getPadEmblemSprite(kind: RealmPadSpec['kind']): HTMLCanvasElement | null {
  const key = `pad:${kind}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;

  const sprite = makePixelCanvas(20, 20, (ctx) => {
    if (kind === 'magnet_shrine') {
      // Octagonal recessed shrine dais
      px(ctx, 5, 1, '#081822', 10, 18);
      px(ctx, 1, 5, '#081822', 18, 10);
      px(ctx, 3, 3, '#0D2230', 14, 14);
      px(ctx, 5, 2, '#1E3A4C', 10, 1);
      px(ctx, 5, 17, '#061118', 10, 1);
      // Glowing horseshoe magnet icon in center
      px(ctx, 5, 4, '#FF1493', 3, 3);
      px(ctx, 12, 4, '#00F0FF', 3, 3);
      px(ctx, 5, 7, '#CBD5E1', 3, 6);
      px(ctx, 12, 7, '#CBD5E1', 3, 6);
      px(ctx, 6, 13, '#94A3B8', 8, 3);
      px(ctx, 7, 13, '#E2E8F0', 6, 2);
      // Center spark between poles
      px(ctx, 9, 5, '#00F0FF', 2, 1);
      px(ctx, 9, 7, '#FFFFFF', 2, 1);
    } else if (kind === 'warp_rune') {
      // Arcane octagonal rune socket
      px(ctx, 5, 1, '#120822', 10, 18);
      px(ctx, 1, 5, '#120822', 18, 10);
      px(ctx, 3, 3, '#1E0D38', 14, 14);
      // Corner rune notches
      px(ctx, 9, 2, '#C084FC', 2, 2);
      px(ctx, 9, 16, '#C084FC', 2, 2);
      px(ctx, 2, 9, '#C084FC', 2, 2);
      px(ctx, 16, 9, '#C084FC', 2, 2);
      // Inner pixel portal vortex
      px(ctx, 6, 6, '#581C87', 8, 8);
      px(ctx, 7, 7, '#A855F7', 6, 6);
      px(ctx, 8, 8, '#00F0FF', 4, 4);
      px(ctx, 9, 9, '#FFFFFF', 2, 2);
    } else {
      // Citadel Overcharge Reactor pad
      px(ctx, 4, 1, '#0F131D', 12, 18);
      px(ctx, 1, 4, '#0F131D', 18, 12);
      px(ctx, 3, 3, '#1C2232', 14, 14);
      // Corner chrome bolts
      px(ctx, 4, 4, '#94A3B8', 2, 2);
      px(ctx, 14, 4, '#94A3B8', 2, 2);
      px(ctx, 4, 14, '#94A3B8', 2, 2);
      px(ctx, 14, 14, '#94A3B8', 2, 2);
      // Upward double-chevron Haste emitter in center
      px(ctx, 9, 5, '#E2E8F0', 2, 2);
      px(ctx, 7, 7, '#00F0FF', 2, 2);
      px(ctx, 11, 7, '#00F0FF', 2, 2);
      px(ctx, 9, 10, '#E2E8F0', 2, 2);
      px(ctx, 7, 12, '#00F0FF', 2, 2);
      px(ctx, 11, 12, '#00F0FF', 2, 2);
    }
  });

  if (sprite) spriteCache.set(key, sprite);
  return sprite;
}

/**
 * Renders a crafted 16-bit pixel-art Realm Obstacle with cast ground shadow and live ambient energy FX.
 */
export function drawRealmObstacle(
  ctx: CanvasRenderingContext2D,
  obs: RealmObstacle,
  realmId: RealmId,
  timeSec: number,
  reducedMotion: boolean
): void {
  ctx.save();
  ctx.imageSmoothingEnabled = false;

  const pulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(timeSec * 3.4 + obs.x * 0.02);

  if (obs.kind === 'energy' || realmId === 'starlight_rift') {
    // Floating Starlight Rift Crystal Monolith
    const cx = obs.x + obs.w / 2;
    const cy = obs.y + obs.h / 2;
    const bobY = reducedMotion ? 0 : Math.sin(timeSec * 2.8 + obs.x * 0.03) * 3.5;

    // Etched arcane floor socket underneath
    ctx.fillStyle = 'rgba(20, 8, 38, 0.82)';
    ctx.strokeStyle = 'rgba(192, 132, 252, 0.42)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, obs.y + obs.h - 4, obs.w * 0.46, obs.h * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Soft amethyst ambient glow
    ctx.fillStyle = `rgba(192, 132, 252, ${0.12 + pulse * 0.1})`;
    ctx.beginPath();
    ctx.arc(cx, cy + bobY, obs.w * 0.55, 0, Math.PI * 2);
    ctx.fill();

    const sprite = getRiftMonolithSprite();
    if (sprite) {
      const drawW = obs.w + 8;
      const drawH = obs.h + 18;
      ctx.drawImage(
        sprite,
        Math.round(cx - drawW / 2),
        Math.round(obs.y + obs.h - drawH + bobY - 2),
        Math.round(drawW),
        Math.round(drawH)
      );
    }

    // Orbiting pixel starlight motes
    if (!reducedMotion) {
      for (let m = 0; m < 2; m++) {
        const ang = timeSec * 1.9 + m * Math.PI + obs.y * 0.01;
        const mx = Math.round(cx + Math.cos(ang) * (obs.w * 0.48));
        const my = Math.round(cy - 6 + Math.sin(ang) * (obs.h * 0.24) + bobY);
        ctx.fillStyle = m === 0 ? '#E9D5FF' : '#00F0FF';
        ctx.fillRect(mx, my, 3, 3);
      }
    }
    ctx.restore();
    return;
  }

  // Ground cast shadow for solid stone / armored obstacles
  ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
  ctx.fillRect(obs.x + 4, obs.y + obs.h - 2, obs.w, 8);

  if (realmId === 'obsidian_foundry') {
    // 2.5D Obsidian Foundry Anchor Pylon (protrudes slightly upward for true top-down RPG depth)
    const sprite = getFoundryPylonSprite();
    if (sprite) {
      const overhangY = 12;
      ctx.drawImage(
        sprite,
        Math.round(obs.x - 2),
        Math.round(obs.y - overhangY),
        Math.round(obs.w + 4),
        Math.round(obs.h + overhangY + 2)
      );
    }

    // Animated pulsing furnace-core glow in the pylon crown
    const coreX = obs.x + obs.w / 2;
    const coreY = obs.y + obs.h * 0.22;
    ctx.fillStyle = `rgba(255, 20, 147, ${0.18 + pulse * 0.22})`;
    ctx.beginPath();
    ctx.arc(coreX, coreY, 16 + pulse * 4, 0, Math.PI * 2);
    ctx.fill();

    // Rising pixel ember spark
    if (!reducedMotion) {
      const sparkPhase = (timeSec * 0.9 + obs.x * 0.013) % 1;
      const sx = Math.round(coreX + Math.sin(timeSec * 5 + obs.y) * 5);
      const sy = Math.round(coreY - sparkPhase * 18);
      ctx.fillStyle = sparkPhase < 0.5 ? '#FFB6D9' : '#FF1493';
      ctx.globalAlpha = 1 - sparkPhase;
      ctx.fillRect(sx, sy, 3, 3);
    }
  } else if (realmId === 'circuit_labyrinth') {
    // 2.5D Circuit Labyrinth Armored Corridor Wall
    const sprite = getLabyrinthWallSprite(obs.w, obs.h);
    if (sprite) {
      ctx.drawImage(sprite, Math.round(obs.x), Math.round(obs.y - 4), Math.round(obs.w), Math.round(obs.h + 4));
    }

    // Traveling cyan data pulse pixel along the wall's central circuit bus
    if (!reducedMotion) {
      const t = (timeSec * 0.55 + (obs.x + obs.y) * 0.002) % 1;
      ctx.fillStyle = '#00F0FF';
      if (obs.w >= obs.h) {
        const pxX = Math.round(obs.x + 14 + t * Math.max(12, obs.w - 28));
        const pxY = Math.round(obs.y + obs.h * 0.3);
        ctx.fillRect(pxX, pxY, 10, 3);
        ctx.fillStyle = '#ECFEFF';
        ctx.fillRect(pxX + 4, pxY, 4, 3);
      } else {
        const pxX = Math.round(obs.x + obs.w * 0.5 - 1);
        const pxY = Math.round(obs.y + 12 + t * Math.max(12, obs.h - 28));
        ctx.fillRect(pxX, pxY, 3, 10);
        ctx.fillStyle = '#ECFEFF';
        ctx.fillRect(pxX, pxY + 4, 3, 4);
      }
    }
  } else {
    // Citadel Core Reinforced Blast Baffle
    const sprite = getCitadelBaffleSprite();
    if (sprite) {
      ctx.drawImage(sprite, Math.round(obs.x), Math.round(obs.y - 4), Math.round(obs.w), Math.round(obs.h + 4));
    }
    // Pulsing center diode glow
    ctx.fillStyle = `rgba(0, 240, 255, ${0.14 + pulse * 0.18})`;
    ctx.fillRect(Math.round(obs.x + obs.w * 0.28), Math.round(obs.y + obs.h * 0.24), Math.round(obs.w * 0.44), 6);
  }

  ctx.restore();
}

/**
 * Renders a crafted 16-bit pixel-art Interactive Pad (Magnet Shrine, Warp Rune, Overcharge Node).
 */
export function drawRealmPad(
  ctx: CanvasRenderingContext2D,
  pad: RealmPadSpec,
  cooldownSec: number,
  overchargeActive: boolean,
  timeSec: number,
  reducedMotion: boolean
): void {
  const ready = cooldownSec <= 0;
  const accent =
    pad.kind === 'magnet_shrine'
      ? '#00F0FF'
      : pad.kind === 'warp_rune'
        ? '#C084FC'
        : '#00F0FF';

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // Outer energy ring / field aura
  const wavePhase = reducedMotion ? 0.5 : (timeSec * 0.9) % 1;
  if (pad.kind === 'magnet_shrine' && ready) {
    // Inward-pulling magnetic pulse ring
    const ringR = pad.radius * (1.28 - wavePhase * 0.55);
    ctx.strokeStyle = `rgba(0, 240, 255, ${(1 - Math.abs(wavePhase - 0.5) * 2) * 0.45})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, ringR, 0, Math.PI * 2);
    ctx.stroke();
  } else if (pad.kind === 'warp_rune' && ready) {
    // Rotating outer arcane rune ring
    ctx.save();
    ctx.translate(pad.x, pad.y);
    ctx.rotate(reducedMotion ? 0 : timeSec * 1.15);
    ctx.strokeStyle = 'rgba(192, 132, 252, 0.72)';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, pad.radius + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else if (pad.kind === 'overcharge_node') {
    // Spinning reactor field ring (flares bright when player is inside)
    ctx.save();
    ctx.translate(pad.x, pad.y);
    ctx.rotate(reducedMotion ? 0 : timeSec * (overchargeActive ? 2.6 : 0.75));
    ctx.fillStyle = overchargeActive
      ? 'rgba(0, 240, 255, 0.16)'
      : 'rgba(226, 232, 240, 0.06)';
    ctx.beginPath();
    ctx.arc(0, 0, pad.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = overchargeActive ? '#00F0FF' : 'rgba(226, 232, 240, 0.55)';
    ctx.lineWidth = overchargeActive ? 2.5 : 1.75;
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, pad.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Pixel-art dais & emblem sprite
  const sprite = getPadEmblemSprite(pad.kind);
  if (sprite) {
    const size = Math.round(pad.radius * (pad.kind === 'overcharge_node' ? 1.18 : 1.75));
    ctx.globalAlpha = ready ? 1 : 0.48;
    ctx.drawImage(
      sprite,
      Math.round(pad.x - size / 2),
      Math.round(pad.y - size / 2),
      size,
      size
    );
    ctx.globalAlpha = 1;
  }

  // Subtle radial recharge arc + numeric timer ONLY when on cooldown
  if (!ready && pad.cooldownSec > 0) {
    const pct = Math.max(0, Math.min(1, 1 - cooldownSec / pad.cooldownSec));
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, pad.radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, pad.radius, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#07070B';
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, 13, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#E2E8F0';
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.ceil(cooldownSec)}s`, pad.x, pad.y + 0.5);
  }

  ctx.restore();
}

/**
 * Renders a 16-bit pixel-art Power-Up Crate with floating bob & beacon ring.
 */
export function drawPowerUpCrate(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kind: PowerUpCrateKind,
  timeSec: number,
  reducedMotion: boolean
): void {
  const crateColor =
    kind === 'speed'
      ? '#00F0FF'
      : kind === 'shield'
        ? '#00FF9D'
        : kind === 'fury'
          ? '#C084FC'
          : '#E2E8F0';

  const bob = reducedMotion ? 0 : Math.sin(timeSec * 4.5 + x * 0.05) * 2.5;
  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // Ground shadow + pulsing beacon halo
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(x, y + 13, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = crateColor;
  ctx.globalAlpha = 0.36;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 18 + (reducedMotion ? 0 : Math.sin(timeSec * 4) * 1.5), 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = 1;
  const sprite = getPowerUpCrateSprite(kind);
  if (sprite) {
    ctx.drawImage(sprite, Math.round(x - 14), Math.round(y - 14 + bob), 28, 28);
  }

  ctx.restore();
}

/**
 * 4-frame 16-bit spinning Gold Mojo Coin sprites (12×12 grid -> drawn crisp at 18×18 / 22×22).
 * Frames: 0 = full circular bullion face, 1 = 3/4 oblique turn, 2 = gleaming thin edge, 3 = reverse 3/4 turn.
 */
function getMojoCoinSprite(frame: number): HTMLCanvasElement | null {
  const f = ((frame % 4) + 4) % 4;
  const key = `pickup:mojo_coin:${f}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;

  const sprite = makePixelCanvas(12, 12, (ctx) => {
    if (f === 0) {
      // Full-face gleaming gold coin with dark bronze outline for maximum floor contrast
      px(ctx, 4, 0, '#451A03', 4, 1);
      px(ctx, 2, 1, '#451A03', 8, 1);
      px(ctx, 1, 2, '#451A03', 10, 8);
      px(ctx, 2, 10, '#451A03', 8, 1);
      px(ctx, 4, 11, '#451A03', 4, 1);

      // Outer gold rim
      px(ctx, 4, 1, '#F59E0B', 4, 10);
      px(ctx, 2, 2, '#F59E0B', 8, 8);
      px(ctx, 1, 4, '#F59E0B', 10, 4);

      // Lower-right shaded antique gold rim bevel
      px(ctx, 4, 10, '#B45309', 4, 1);
      px(ctx, 8, 9, '#B45309', 2, 1);
      px(ctx, 10, 4, '#B45309', 1, 4);
      px(ctx, 9, 8, '#D97706', 1, 1);

      // Bright bullion gold inner disc
      px(ctx, 3, 2, '#FACC15', 6, 8);
      px(ctx, 2, 3, '#FACC15', 8, 6);

      // Top-left bright specular gleam
      px(ctx, 4, 2, '#FEF08A', 3, 1);
      px(ctx, 3, 3, '#FEF08A', 2, 2);
      px(ctx, 3, 2, '#FFFFFF', 1, 1);
      px(ctx, 2, 4, '#FEF08A', 1, 2);

      // Embossed inner ring recess & golden vertical mint emblem
      px(ctx, 5, 3, '#B45309', 2, 6);
      px(ctx, 5, 3, '#D97706', 1, 5);
      px(ctx, 6, 4, '#FEF9C3', 1, 4);
      px(ctx, 4, 4, '#D97706', 1, 1);
      px(ctx, 7, 7, '#B45309', 1, 1);
    } else if (f === 1 || f === 3) {
      // 3/4 turned coin (narrower oval with visible metallic rim thickness)
      px(ctx, 4, 0, '#451A03', 4, 1);
      px(ctx, 3, 1, '#451A03', 6, 10);
      px(ctx, 2, 3, '#451A03', 8, 6);
      px(ctx, 4, 11, '#451A03', 4, 1);

      // Metallic rim side thickness
      const rimX = f === 1 ? 7 : 3;
      const faceX = f === 1 ? 3 : 4;
      px(ctx, 4, 1, '#D97706', 4, 10);
      px(ctx, 3, 3, '#D97706', 6, 6);
      px(ctx, rimX, 2, '#B45309', 2, 8);

      // Gleaming tilted face
      px(ctx, faceX, 2, '#FACC15', 4, 8);
      px(ctx, faceX + 1, 2, '#FEF08A', 2, 3);
      px(ctx, faceX + 1, 2, '#FFFFFF', 1, 1);
      px(ctx, faceX + 2, 4, '#B45309', 1, 4);
    } else {
      // Edge-on coin glint (classic 16-bit flash frame)
      px(ctx, 4, 0, '#451A03', 4, 12);
      px(ctx, 5, 1, '#F59E0B', 2, 10);
      px(ctx, 5, 2, '#FEF08A', 2, 5);
      px(ctx, 5, 3, '#FFFFFF', 1, 3);
      px(ctx, 6, 7, '#B45309', 1, 3);
    }
  });

  if (sprite) spriteCache.set(key, sprite);
  return sprite;
}

/**
 * 16-bit Faceted Emerald XP Crystal sprite (10×12 grid -> drawn crisp at 14×16 / 18×20).
 */
function getExpGemSprite(): HTMLCanvasElement | null {
  const key = 'pickup:exp_gem';
  const cached = spriteCache.get(key);
  if (cached) return cached;

  const sprite = makePixelCanvas(10, 12, (ctx) => {
    // Dark emerald silhouette outline
    px(ctx, 4, 0, '#022C22', 2, 1);
    px(ctx, 3, 1, '#022C22', 4, 2);
    px(ctx, 2, 3, '#022C22', 6, 2);
    px(ctx, 1, 5, '#022C22', 8, 2);
    px(ctx, 2, 7, '#022C22', 6, 2);
    px(ctx, 3, 9, '#022C22', 4, 2);
    px(ctx, 4, 11, '#022C22', 2, 1);

    // Emerald crystal body
    px(ctx, 4, 1, '#059669', 2, 10);
    px(ctx, 3, 3, '#059669', 4, 6);
    px(ctx, 2, 5, '#059669', 6, 2);

    // Bright spring-emerald left/top facet
    px(ctx, 4, 2, '#00FF9D', 2, 8);
    px(ctx, 3, 4, '#00FF9D', 3, 4);
    px(ctx, 2, 5, '#34D399', 2, 2);

    // Crisp specular crystal glint
    px(ctx, 4, 3, '#A7F3D0', 1, 4);
    px(ctx, 3, 4, '#A7F3D0', 1, 2);
    px(ctx, 4, 3, '#FFFFFF', 1, 1);
  });

  if (sprite) spriteCache.set(key, sprite);
  return sprite;
}

/**
 * Renders a gleaming 16-bit spinning Gold Mojo Coin on the arena floor.
 */
export function drawMojoCoin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  value: number,
  timeSec: number,
  reducedMotion: boolean
): void {
  const big = value >= 5;
  const size = big ? 22 : 18;
  const phase = (x * 0.037 + y * 0.023) % 4;
  const frame = reducedMotion ? 0 : Math.floor((timeSec * 6.5 + phase) % 4);
  const bob = reducedMotion ? 0 : Math.sin(timeSec * 5.2 + x * 0.05) * 1.6;

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // Ground shadow directly below the floating coin
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.ellipse(x, y + size * 0.44, size * 0.34, size * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Warm golden shimmer aura so coins immediately pop off dark pixel tiles
  ctx.fillStyle = big ? 'rgba(250, 204, 21, 0.24)' : 'rgba(250, 204, 21, 0.16)';
  ctx.beginPath();
  ctx.arc(x, y + bob, size * 0.62, 0, Math.PI * 2);
  ctx.fill();

  const sprite = getMojoCoinSprite(frame);
  if (sprite) {
    ctx.drawImage(
      sprite,
      Math.round(x - size / 2),
      Math.round(y - size / 2 + bob),
      size,
      size
    );
  } else {
    // Crisp vector fallback
    ctx.fillStyle = '#FACC15';
    ctx.strokeStyle = '#78350F';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y + bob, size * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FEF08A';
    ctx.beginPath();
    ctx.arc(x - 1.5, y + bob - 1.5, size * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Renders a crisp 16-bit faceted Emerald XP Crystal gem on the arena floor.
 */
export function drawExpGem(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  value: number,
  timeSec: number,
  reducedMotion: boolean
): void {
  const big = value >= 15;
  const drawW = big ? 16 : 12;
  const drawH = big ? 20 : 15;
  const bob = reducedMotion ? 0 : Math.sin(timeSec * 4.4 + y * 0.04) * 1.2;

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  ctx.beginPath();
  ctx.ellipse(x, y + drawH * 0.42, drawW * 0.36, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();

  const sprite = getExpGemSprite();
  if (sprite) {
    ctx.drawImage(
      sprite,
      Math.round(x - drawW / 2),
      Math.round(y - drawH / 2 + bob),
      drawW,
      drawH
    );
  } else {
    ctx.fillStyle = '#00FF9D';
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y - drawH * 0.45 + bob);
    ctx.lineTo(x + drawW * 0.42, y + bob);
    ctx.lineTo(x, y + drawH * 0.45 + bob);
    ctx.lineTo(x - drawW * 0.42, y + bob);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Renders a crisp 16-bit armored perimeter wall frame around the arena boundary.
 */
export function drawArenaPerimeter(
  ctx: CanvasRenderingContext2D,
  arenaWidth: number,
  arenaHeight: number,
  accentHex: string
): void {
  ctx.save();
  const wallT = 18;

  // Solid outer dark-iron perimeter parapet
  ctx.fillStyle = '#0C0B13';
  ctx.fillRect(-wallT, -wallT, arenaWidth + wallT * 2, wallT);
  ctx.fillRect(-wallT, arenaHeight, arenaWidth + wallT * 2, wallT);
  ctx.fillRect(-wallT, 0, wallT, arenaHeight);
  ctx.fillRect(arenaWidth, 0, wallT, arenaHeight);

  // Inner metallic rim + glowing energy barrier line
  ctx.strokeStyle = '#332E45';
  ctx.lineWidth = 4;
  ctx.strokeRect(-wallT + 2, -wallT + 2, arenaWidth + wallT * 2 - 4, arenaHeight + wallT * 2 - 4);

  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(0, 0, arenaWidth, arenaHeight);

  // Corner anchor beacons
  const corners = [
    [0, 0],
    [arenaWidth, 0],
    [0, arenaHeight],
    [arenaWidth, arenaHeight],
  ];
  for (const [cx, cy] of corners) {
    ctx.fillStyle = '#1B1928';
    ctx.fillRect(cx - 10, cy - 10, 20, 20);
    ctx.fillStyle = accentHex;
    ctx.fillRect(cx - 4, cy - 4, 8, 8);
  }
  ctx.restore();
}

/**
 * Generates and caches a crisp 16-bit pixel-art miniature diorama preview (192×72)
 * for each Arena Realm card in the Lobby Realm Selector.
 */
export function getRealmPreviewDataUrl(realmId: RealmId): string {
  const cached = realmPreviewCache.get(realmId);
  if (cached) return cached;
  if (typeof document === 'undefined') return '';

  const spec = getRealmSpec(realmId);
  const w = 192;
  const h = 72;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingEnabled = false;

  // Tile the realm's actual 16-bit pixel floor texture at 0.5x mini-scale
  const floorTile = getArenaPixelTileCanvas(spec.defaultFloorStyle, 1);
  if (floorTile) {
    const miniTile = 96;
    for (let tx = 0; tx < w; tx += miniTile) {
      for (let ty = 0; ty < h; ty += miniTile) {
        ctx.drawImage(floorTile, tx, ty, miniTile, miniTile);
      }
    }
  } else {
    ctx.fillStyle = '#0B0A12';
    ctx.fillRect(0, 0, w, h);
  }

  // Draw signature 16-bit props from this realm in miniature
  if (realmId === 'obsidian_foundry') {
    const pylon = getFoundryPylonSprite();
    if (pylon) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(36, 46, 26, 6);
      ctx.fillRect(130, 46, 26, 6);
      ctx.drawImage(pylon, 34, 16, 28, 34);
      ctx.drawImage(pylon, 128, 16, 28, 34);
    }
    // Glowing forge ember accents
    ctx.fillStyle = 'rgba(255, 20, 147, 0.25)';
    ctx.beginPath();
    ctx.arc(48, 26, 12, 0, Math.PI * 2);
    ctx.arc(142, 26, 12, 0, Math.PI * 2);
    ctx.fill();
  } else if (realmId === 'circuit_labyrinth') {
    const wall = getLabyrinthWallSprite(120, 28);
    const shrine = getPadEmblemSprite('magnet_shrine');
    if (wall) {
      ctx.drawImage(wall, 14, 12, 72, 18);
      ctx.drawImage(wall, 106, 44, 72, 18);
    }
    if (shrine) {
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(142, 24, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.drawImage(shrine, 128, 10, 28, 28);
    }
  } else if (realmId === 'starlight_rift') {
    const monolith = getRiftMonolithSprite();
    const warp = getPadEmblemSprite('warp_rune');
    if (warp) {
      ctx.strokeStyle = 'rgba(192, 132, 252, 0.65)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(54, 42, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.drawImage(warp, 40, 28, 28, 28);
    }
    if (monolith) {
      ctx.fillStyle = 'rgba(192, 132, 252, 0.22)';
      ctx.beginPath();
      ctx.arc(138, 34, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(monolith, 124, 14, 28, 36);
    }
  } else {
    const baffle = getCitadelBaffleSprite();
    const node = getPadEmblemSprite('overcharge_node');
    if (baffle) {
      ctx.drawImage(baffle, 20, 14, 52, 26);
      ctx.drawImage(baffle, 120, 38, 52, 26);
    }
    if (node) {
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(146, 22, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.drawImage(node, 134, 10, 24, 24);
    }
  }

  // Subtle dark vignette gradient along bottom for crisp UI text legibility
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(7, 7, 11, 0.08)');
  grad.addColorStop(1, 'rgba(7, 7, 11, 0.65)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const dataUrl = canvas.toDataURL('image/png');
  realmPreviewCache.set(realmId, dataUrl);
  return dataUrl;
}
