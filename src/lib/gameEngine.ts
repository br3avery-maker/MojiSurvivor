import {
  drawArenaPerimeter,
  drawExpGem,
  drawMojoCoin,
  drawPowerUpCrate,
  drawRealmObstacle,
  drawRealmPad,
} from './arenaSprites';
import { retroAudio } from './audio';
import { sha256Hex, type EmojiCombatTrait } from './cryptoStats';
import { getArenaPixelTileCanvas } from './pixelBackgrounds';
import {
  DEFAULT_REALM_ID,
  getRealmSpec,
  getRealmUnlockedForBossWave,
  normalizeRealmId,
  type RealmId,
  type RealmObstacle,
  type RealmSpec,
} from './realms';
import {
  triggerHaptic,
  type ActiveRunCheckpoint,
  type FeaturedEmojiSummary,
  type GameSettings,
  type UpgradeLevels,
} from './storage';

export type WeaponId =
  | 'lightning_zap'
  | 'garlic_aura'
  | 'orbiting_blades'
  | 'plasma_lance'
  | 'nova_pulse';

export interface ActiveWeapon {
  id: WeaponId;
  level: number;
  cooldown: number;
  timer: number;
  damage: number;
  range: number;
}

export interface LevelUpChoice {
  id: WeaponId;
  baseName: string;
  evolvedName: string;
  nextLevel: number;
  isMerge: boolean;
  projectedDamage: number;
  projectedCooldown: number;
  description: string;
}

export type PowerUpKind = 'speed' | 'shield' | 'fury' | 'magnet';

export interface ActiveBuffsHud {
  speedRemaining: number;
  shieldHits: number;
  shieldRemaining: number;
  furyRemaining: number;
}

export interface ArenaHudSnapshot {
  realmId: RealmId;
  realmName: string;
  overchargeActive: boolean;
  hp: number;
  maxHp: number;
  level: number;
  exp: number;
  expNext: number;
  wave: number;
  waveProgressPct: number;
  score: number;
  mojoEarned: number;
  defeated: number;
  bossesDefeated: number;
  elapsedSec: number;
  weapons: Array<{ id: WeaponId; name: string; level: number }>;
  boss: { name: string; hp: number; maxHp: number; tier: string } | null;
  buffs: ActiveBuffsHud;
}

export interface CompletedRunSummary {
  runSessionId: string;
  realmId: RealmId;
  score: number;
  wave: number;
  defeated: number;
  bossesDefeated: number;
  durationSec: number;
  mojoEarned: number;
  careerXpEarned: number;
  weaponsSummary: string;
  strongestSpellName: string;
  featuredEmoji?: FeaturedEmojiSummary;
}

export interface RunProgressCheckpointPayload {
  runSessionId: string;
  mojoEarnedTotal: number;
  careerXpEarnedTotal: number;
  killsTotal: number;
  bossesDefeatedTotal?: number;
  waveReached: number;
  scoreReached: number;
  completed: boolean;
}

interface WeaponCatalogItem {
  id: WeaponId;
  tiers: [string, string, string];
  baseDamage: number;
  baseCooldown: number;
  range: number;
  description: string;
}

export const WEAPON_CATALOG: readonly WeaponCatalogItem[] = [
  {
    id: 'lightning_zap',
    tiers: ['Lightning Zap', 'Double Spark', 'Chain Storm'],
    baseDamage: 28,
    baseCooldown: 0.78,
    range: 210,
    description: 'Strikes close rogue emojis and chains secondary arcs on merge.',
  },
  {
    id: 'garlic_aura',
    tiers: ['Holy Garlic', 'Radiant Ward', 'Solar Cleansing'],
    baseDamage: 18,
    baseCooldown: 0.58,
    range: 88,
    description: 'Pulses a close-quarters ward that damages and repels swarmers.',
  },
  {
    id: 'orbiting_blades',
    tiers: ['Orbiting Blades', 'Twin Chakrams', 'Vortex Ring'],
    baseDamage: 24,
    baseCooldown: 0.42,
    range: 76,
    description: 'Maintains revolving energy satellites that slice colliding foes.',
  },
  {
    id: 'plasma_lance',
    tiers: ['Plasma Lance', 'Twin Railgun', 'Hyper Piercer'],
    baseDamage: 42,
    baseCooldown: 0.92,
    range: 280,
    description: 'Fires armor-piercing bolts straight through dense enemy lines.',
  },
  {
    id: 'nova_pulse',
    tiers: ['Nova Pulse', 'Supernova Wave', 'Singularity Blast'],
    baseDamage: 46,
    baseCooldown: 1.85,
    range: 175,
    description: 'Detonates an expanding shockwave ring that blasts nearby waves.',
  },
];

const WEAPON_MIN_COOLDOWN: Record<WeaponId, number> = {
  lightning_zap: 0.42,
  garlic_aura: 0.36,
  orbiting_blades: 0.26,
  plasma_lance: 0.52,
  nova_pulse: 1.15,
};

export function computeWeaponStatsForLevel(
  id: WeaponId,
  level: number
): { damage: number; cooldown: number; range: number } {
  const def = WEAPON_CATALOG.find((w) => w.id === id) ?? WEAPON_CATALOG[0];
  const lvl = Math.max(1, level);
  const minCd = WEAPON_MIN_COOLDOWN[id] ?? 0.4;
  // Strong early merges (Lv.2 = +26%, Lv.3 = +54%) with controlled overdrive scaling at Lv.4+
  const scaleMult =
    lvl === 1
      ? 1.0
      : lvl === 2
        ? 1.26
        : lvl === 3
          ? 1.54
          : 1.54 + (lvl - 3) * 0.22;
  const damage = Math.round(def.baseDamage * scaleMult);
  const cooldown = Number(
    Math.max(minCd, def.baseCooldown * Math.pow(0.93, Math.min(6, lvl - 1))).toFixed(2)
  );
  return { damage, cooldown, range: def.range };
}

export function getWeaponDisplayName(id: WeaponId, level: number): string {
  const def = WEAPON_CATALOG.find((w) => w.id === id);
  if (!def) return id;
  if (level <= 1) return def.tiers[0];
  if (level === 2) return def.tiers[1];
  return level > 3 ? `${def.tiers[2]} +${level - 3}` : def.tiers[2];
}

interface EnemyEntity {
  uid: number;
  trait: EmojiCombatTrait;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  radius: number;
  isBoss: boolean;
  bossSpawnWave?: number;
  isElite: boolean;
  phaseAngle: number;
  actionTimer: number;
  hitFlash: number;
  knockbackCooldown: number;
}

interface ProjectileEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  pierceLeft: number;
  life: number;
  hitIds: Set<number>;
}

interface EnemyBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  life: number;
}

interface DropOrb {
  x: number;
  y: number;
  kind: 'exp' | 'mojo';
  value: number;
  magnetized: boolean;
}

interface PowerUpCrate {
  x: number;
  y: number;
  kind: PowerUpKind;
  label: string;
  life: number;
}

interface ShockwaveRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  playerDamage?: number;
  enemyDamage?: number;
  color: string;
  hitIds: Set<number>;
}

interface HazardZone {
  x: number;
  y: number;
  radius: number;
  fuse: number;
  maxFuse: number;
  damage: number;
}

interface VisualParticle {
  kind: 'spark' | 'text' | 'arc' | 'afterimage';
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  vx: number;
  vy: number;
  radius: number;
  text?: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface GameEngineCallbacks {
  getEmojiPool: () => EmojiCombatTrait[];
  getImage: (url: string) => HTMLImageElement | undefined;
  getPlayerAvatar: () => HTMLImageElement | undefined;
  onHudUpdate: (hud: ArenaHudSnapshot) => void;
  onBannerToast: (message: string) => void;
  onLevelUpChoices: (choices: LevelUpChoice[]) => void;
  onEnemyDefeated: (trait: EmojiCombatTrait) => void;
  onCheckpointProgress: (payload: RunProgressCheckpointPayload) => void;
  onRealmUnlocked?: (realmId: RealmId) => void;
  onGameOver: (summary: CompletedRunSummary) => void;
}

/**
 * 60 FPS HTML5 Canvas Survivor Engine.
 * Enforces touch-and-drag anywhere without any rendered virtual joystick, ring, or reserved zone,
 * alongside full keyboard (WASD / Arrows) and mouse-drag support.
 */
export class MojiSurvivorEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private callbacks: GameEngineCallbacks;
  private upgrades: UpgradeLevels;
  private settings: GameSettings;
  private careerPlayerLevel = 1;
  private rebirthCount = 0;
  private rebirthMojoMultiplier = 1;
  private realmId: RealmId = DEFAULT_REALM_ID;
  private realmSpec: RealmSpec = getRealmSpec(DEFAULT_REALM_ID);
  private padCooldowns = new Map<string, number>();
  private overchargeActive = false;
  private riftHazardTimer = 6.5;

  private arenaWidth = 1800;
  private arenaHeight = 1800;
  private rafId: number | null = null;
  private running = false;
  private paused = false;
  private lastTimestamp = 0;
  private hudEmitAccumulator = 0;
  private nextEntityUid = 1;

  // Player state
  private player = {
    x: 900,
    y: 900,
    radius: 20,
    hp: 100,
    maxHp: 100,
    armorReduction: 0,
    baseSpeed: 230,
    regenPerSec: 0.4,
    pickupRadius: 85,
    damageMultiplier: 1,
    fireRateHaste: 1,
    level: 1,
    exp: 0,
    expNext: 18,
    invulnTimer: 0,
    orbitHitCooldowns: new Map<number, number>(),
    weapons: [] as ActiveWeapon[],
    buffs: {
      speedTimer: 0,
      shieldHits: 0,
      shieldTimer: 0,
      furyTimer: 0,
      globalMagnetTimer: 0,
    },
  };

  private afterimageTimer = 0;
  private siphonCooldown = 0;
  private stationaryTimer = 0;
  private stationaryAnchor = { x: 900, y: 900 };

  // Run counters
  public runSessionId = '';
  private wave = 1;
  private waveTimer = 0;
  private midWaveSurgeTriggered = false;
  private readonly waveDuration = 30;
  private score = 0;
  private mojoEarned = 0;
  private careerXpEarned = 0;
  private defeated = 0;
  private bossesDefeated = 0;
  private elapsedSec = 0;
  private featuredEmoji: FeaturedEmojiSummary | undefined = undefined;
  private checkpointAccumulator = 0;
  private lastFlushedMojo = -1;
  private lastFlushedXp = -1;
  private lastFlushedKills = -1;
  private killsSinceMojoCoin = 0;

  // Entities
  private enemies: EnemyEntity[] = [];
  private projectiles: ProjectileEntity[] = [];
  private enemyBullets: EnemyBullet[] = [];
  private orbs: DropOrb[] = [];
  private crates: PowerUpCrate[] = [];
  private shockwaves: ShockwaveRing[] = [];
  private hazards: HazardZone[] = [];
  private particles: VisualParticle[] = [];
  private activeBoss: EnemyEntity | null = null;

  private spawnTimer = 0;
  private crateTimer = 14;
  private shakeTimer = 0;
  private shakeMagnitude = 0;

  // Hardware-accelerated DOM <img> sprite pool so animated .gif / .webp NIP-30 emojis animate natively in the Arena
  private spriteLayerEl: HTMLDivElement | null = null;
  private enemySpriteEls = new Map<number, HTMLImageElement>();
  private playerSpriteEl: HTMLImageElement | null = null;

  // Invisible touch/pointer drag vector + keyboard state (ZERO visible virtual joystick)
  private activePointerId: number | null = null;
  private dragAnchor = { x: 0, y: 0 };
  private dragVector = { x: 0, y: 0 };
  private keysDown = new Set<string>();

  private cleanupListeners: (() => void) | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    upgrades: UpgradeLevels,
    settings: GameSettings,
    callbacks: GameEngineCallbacks,
    initialCheckpoint?: ActiveRunCheckpoint | null,
    careerPlayerLevel = 1,
    rebirthCount = 0,
    realmId: RealmId = DEFAULT_REALM_ID
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('2D canvas context unavailable');
    }
    this.ctx = context;
    this.upgrades = upgrades;
    this.settings = settings;
    this.callbacks = callbacks;
    this.careerPlayerLevel = Math.max(1, careerPlayerLevel);
    this.rebirthCount = Math.max(0, Math.floor(rebirthCount));
    this.rebirthMojoMultiplier = 1 + this.rebirthCount * 0.12;
    this.realmId = normalizeRealmId(initialCheckpoint?.realmId ?? realmId);
    this.realmSpec = getRealmSpec(this.realmId);
    this.arenaWidth = this.realmSpec.arenaWidth;
    this.arenaHeight = this.realmSpec.arenaHeight;

    this.initSpriteLayer();
    this.initRunState(initialCheckpoint);
    this.bindInputs();
    this.resizeCanvas();
  }

  private initSpriteLayer(): void {
    const parent = this.canvas.parentElement;
    if (!parent || typeof document === 'undefined') return;
    const layer = document.createElement('div');
    layer.setAttribute('aria-hidden', 'true');
    layer.style.position = 'absolute';
    layer.style.inset = '0';
    layer.style.overflow = 'hidden';
    layer.style.pointerEvents = 'none';
    layer.style.zIndex = '5';
    parent.appendChild(layer);
    this.spriteLayerEl = layer;
  }

  private clearSpriteDomElements(): void {
    for (const el of this.enemySpriteEls.values()) {
      el.remove();
    }
    this.enemySpriteEls.clear();
    if (this.playerSpriteEl) {
      this.playerSpriteEl.remove();
      this.playerSpriteEl = null;
    }
  }

  public updateSettings(next: GameSettings): void {
    this.settings = next;
  }

  private initRunState(checkpoint?: ActiveRunCheckpoint | null): void {
    const careerBonusLv = Math.max(0, this.careerPlayerLevel - 1);
    const rebirthHullMult = 1 + this.rebirthCount * 0.1;
    const rebirthDmgMult = 1 + this.rebirthCount * 0.15;
    const rebirthHasteBonus = this.rebirthCount * 0.06;
    const maxHp = Math.round(
      (100 + this.upgrades.defense * 22 + careerBonusLv * 4) * rebirthHullMult
    );
    const restoredWeapons: ActiveWeapon[] =
      checkpoint && Array.isArray(checkpoint.weapons) && checkpoint.weapons.length > 0
        ? checkpoint.weapons.map((w) => {
            const calibrated = computeWeaponStatsForLevel(w.id, w.level);
            return {
              id: w.id,
              level: w.level,
              cooldown: calibrated.cooldown,
              timer: calibrated.cooldown * 0.5,
              damage: calibrated.damage,
              range: calibrated.range,
            };
          })
          : [
            {
              id: 'lightning_zap',
              level: 1,
              cooldown: 0.78,
              timer: 0.62,
              damage: 28,
              range: 210,
            },
          ];

    this.player = {
      x: this.arenaWidth / 2,
      y: this.arenaHeight / 2,
      radius: 20,
      hp: checkpoint ? Math.max(25, Math.min(maxHp, checkpoint.playerHp)) : maxHp,
      maxHp,
      armorReduction: Math.min(0.42, this.upgrades.defense * 0.045 + careerBonusLv * 0.006),
      baseSpeed: 232 * (1 + this.upgrades.speed * 0.06 + Math.min(0.18, careerBonusLv * 0.006)),
      regenPerSec: 0.35 + this.upgrades.regen * 0.55 + careerBonusLv * 0.08,
      pickupRadius: 86 + this.upgrades.magnet * 22 + careerBonusLv * 1.5,
      damageMultiplier:
        (1 + this.upgrades.attack * 0.16 + careerBonusLv * 0.035) * rebirthDmgMult,
      fireRateHaste:
        1 + Math.min(0.28, careerBonusLv * 0.012) + Math.min(0.36, rebirthHasteBonus),
      level: checkpoint ? Math.max(1, checkpoint.spellLevel) : 1,
      exp: checkpoint ? Math.max(0, checkpoint.spellExp) : 0,
      expNext: checkpoint ? Math.max(18, checkpoint.spellExpNext) : 18,
      invulnTimer: 1.5,
      orbitHitCooldowns: new Map(),
      weapons: restoredWeapons,
      buffs: {
        speedTimer: 0,
        shieldHits: 0,
        shieldTimer: 0,
        furyTimer: 0,
        globalMagnetTimer: 0,
      },
    };

    const randomSalt = Math.random().toString(36).slice(2, 10);
    this.runSessionId =
      checkpoint?.runSessionId ||
      `run_${Date.now()}_${sha256Hex(`${Date.now()}:${randomSalt}`).slice(0, 10)}`;
    this.wave = checkpoint ? Math.max(1, checkpoint.wave) : 1;
    this.waveTimer = checkpoint ? Math.max(0, checkpoint.waveTimer) : 0;
    this.midWaveSurgeTriggered = this.waveTimer >= 16;
    this.score = checkpoint ? Math.max(0, checkpoint.score) : 0;
    this.mojoEarned = checkpoint ? Math.max(0, checkpoint.mojoEarned) : 0;
    this.careerXpEarned = checkpoint ? Math.max(0, checkpoint.careerXpEarned) : 0;
    this.defeated = checkpoint ? Math.max(0, checkpoint.defeated) : 0;
    this.bossesDefeated = checkpoint ? Math.max(0, checkpoint.bossesDefeated) : 0;
    this.elapsedSec = checkpoint ? Math.max(0, checkpoint.elapsedSec) : 0;
    this.featuredEmoji = checkpoint?.featuredEmoji;
    this.checkpointAccumulator = 0;
    this.lastFlushedMojo = this.mojoEarned;
    this.lastFlushedXp = this.careerXpEarned;
    this.lastFlushedKills = this.defeated;
    this.killsSinceMojoCoin = 0;
    this.siphonCooldown = 0;
    this.stationaryTimer = 0;
    this.stationaryAnchor = { x: this.player.x, y: this.player.y };

    this.padCooldowns.clear();
    this.overchargeActive = false;
    this.riftHazardTimer = 6.5;

    this.enemies = [];
    this.projectiles = [];
    this.enemyBullets = [];
    this.orbs = [];
    this.crates = [];
    this.shockwaves = [];
    this.hazards = [];
    this.particles = [];
    this.activeBoss = null;
    this.spawnTimer = 1.35;
    this.crateTimer = 14;
    this.clearSpriteDomElements();

    // Seed 2 approachable starter enemies at safe perimeter distance so the player isn't ambushed on start
    const baseOpeningAngle = Math.random() * Math.PI * 2;
    for (let i = 0; i < 2; i++) {
      const ang = baseOpeningAngle + i * (Math.PI * 0.65) + (Math.random() - 0.5) * 0.25;
      this.spawnRegularEnemy(ang, 370 + Math.random() * 60, false);
    }
  }

  private isPointInsideObstacle(x: number, y: number, pad = 0, types?: ReadonlyArray<RealmObstacle['kind']>): boolean {
    for (const obs of this.realmSpec.obstacles) {
      if (types && !types.includes(obs.kind)) continue;
      if (
        x >= obs.x - pad &&
        x <= obs.x + obs.w + pad &&
        y >= obs.y - pad &&
        y <= obs.y + obs.h + pad
      ) {
        return true;
      }
    }
    return false;
  }

  private resolveCircleVsObstacles(
    x: number,
    y: number,
    radius: number,
    margin = 36
  ): { x: number; y: number } {
    let cx = Math.max(margin, Math.min(this.arenaWidth - margin, x));
    let cy = Math.max(margin, Math.min(this.arenaHeight - margin, y));

    for (const obs of this.realmSpec.obstacles) {
      const nearestX = Math.max(obs.x, Math.min(cx, obs.x + obs.w));
      const nearestY = Math.max(obs.y, Math.min(cy, obs.y + obs.h));
      const dx = cx - nearestX;
      const dy = cy - nearestY;
      const distSq = dx * dx + dy * dy;

      if (distSq === 0) {
        // Center is inside obstacle; push out along shortest escape axis
        const dLeft = cx - obs.x;
        const dRight = obs.x + obs.w - cx;
        const dTop = cy - obs.y;
        const dBottom = obs.y + obs.h - cy;
        const minEdge = Math.min(dLeft, dRight, dTop, dBottom);
        if (minEdge === dLeft) cx = obs.x - radius;
        else if (minEdge === dRight) cx = obs.x + obs.w + radius;
        else if (minEdge === dTop) cy = obs.y - radius;
        else cy = obs.y + obs.h + radius;
      } else if (distSq < radius * radius) {
        const dist = Math.sqrt(distSq);
        const overlap = radius - dist;
        cx += (dx / dist) * overlap;
        cy += (dy / dist) * overlap;
      }
    }

    return {
      x: Math.max(margin, Math.min(this.arenaWidth - margin, cx)),
      y: Math.max(margin, Math.min(this.arenaHeight - margin, cy)),
    };
  }

  private bindInputs(): void {
    const onPointerDown = (e: PointerEvent) => {
      if (!this.running || this.paused) return;
      if (this.activePointerId !== null) return;
      this.activePointerId = e.pointerId;
      const rect = this.canvas.getBoundingClientRect();
      this.dragAnchor = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      this.dragVector = { x: 0, y: 0 };
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        // Ignore synthetic pointer events
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== this.activePointerId || !this.running || this.paused) return;
      const rect = this.canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const dx = cx - this.dragAnchor.x;
      const dy = cy - this.dragAnchor.y;
      const dist = Math.hypot(dx, dy);
      const maxPull = 54;

      if (dist > 4) {
        const clamped = Math.min(dist, maxPull);
        this.dragVector = {
          x: (dx / dist) * (clamped / maxPull),
          y: (dy / dist) * (clamped / maxPull),
        };
      } else {
        this.dragVector = { x: 0, y: 0 };
      }

      // Continuous drift-anchor compensation so players never have to lift and re-grab
      if (dist > maxPull) {
        this.dragAnchor.x = cx - (dx / dist) * maxPull;
        this.dragAnchor.y = cy - (dy / dist) * maxPull;
      }
    };

    const stopPointer = (e: PointerEvent) => {
      if (e.pointerId === this.activePointerId) {
        this.activePointerId = null;
        this.dragVector = { x: 0, y: 0 };
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        this.keysDown.add(k);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.keysDown.delete(e.key.toLowerCase());
    };

    const onResize = () => this.resizeCanvas();

    this.canvas.addEventListener('pointerdown', onPointerDown);
    this.canvas.addEventListener('pointermove', onPointerMove);
    this.canvas.addEventListener('pointerup', stopPointer);
    this.canvas.addEventListener('pointercancel', stopPointer);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onResize);

    this.cleanupListeners = () => {
      this.canvas.removeEventListener('pointerdown', onPointerDown);
      this.canvas.removeEventListener('pointermove', onPointerMove);
      this.canvas.removeEventListener('pointerup', stopPointer);
      this.canvas.removeEventListener('pointercancel', stopPointer);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
    };
  }

  public resizeCanvas(): void {
    const parent = this.canvas.parentElement;
    const width = parent ? parent.clientWidth : window.innerWidth;
    const height = parent ? parent.clientHeight : window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(320, Math.floor(width * dpr));
    this.canvas.height = Math.max(320, Math.floor(height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  public start(): void {
    this.running = true;
    this.paused = false;
    this.lastTimestamp = performance.now();
    this.emitHud();
    this.rafId = requestAnimationFrame(this.tick);
  }

  public setPaused(nextPaused: boolean): void {
    this.paused = nextPaused;
    this.activePointerId = null;
    this.dragVector = { x: 0, y: 0 };
    if (nextPaused) {
      this.flushCheckpoint(false);
    } else {
      this.lastTimestamp = performance.now();
    }
  }

  /**
   * Immediately flushes any newly earned Mojo, Career XP, kills, and high-water marks
   * for this `runSessionId` so backgrounding, exiting, or restarting never loses progress.
   */
  public flushCheckpoint(completed = false): void {
    if (
      !completed &&
      this.mojoEarned === this.lastFlushedMojo &&
      this.careerXpEarned === this.lastFlushedXp &&
      this.defeated === this.lastFlushedKills
    ) {
      return;
    }
    this.lastFlushedMojo = this.mojoEarned;
    this.lastFlushedXp = this.careerXpEarned;
    this.lastFlushedKills = this.defeated;
    this.callbacks.onCheckpointProgress({
      runSessionId: this.runSessionId,
      mojoEarnedTotal: this.mojoEarned,
      careerXpEarnedTotal: this.careerXpEarned,
      killsTotal: this.defeated,
      bossesDefeatedTotal: this.bossesDefeated,
      waveReached: this.wave,
      scoreReached: this.score,
      completed,
    });
  }

  public exportRunCheckpoint(): ActiveRunCheckpoint | null {
    if (!this.running || this.player.hp <= 0) return null;
    return {
      runSessionId: this.runSessionId,
      realmId: this.realmId,
      savedAt: Date.now(),
      wave: this.wave,
      waveTimer: this.waveTimer,
      score: this.score,
      mojoEarned: this.mojoEarned,
      careerXpEarned: this.careerXpEarned,
      defeated: this.defeated,
      bossesDefeated: this.bossesDefeated,
      elapsedSec: this.elapsedSec,
      playerHp: Math.round(this.player.hp),
      playerMaxHp: this.player.maxHp,
      spellLevel: this.player.level,
      spellExp: this.player.exp,
      spellExpNext: this.player.expNext,
      weapons: this.player.weapons.map((w) => ({
        id: w.id,
        level: w.level,
        cooldown: w.cooldown,
        damage: w.damage,
        range: w.range,
      })),
      featuredEmoji: this.featuredEmoji,
    };
  }

  public applyLevelUpChoice(choice: LevelUpChoice): void {
    const existing = this.player.weapons.find((w) => w.id === choice.id);
    if (existing) {
      const calibrated = computeWeaponStatsForLevel(choice.id, choice.nextLevel);
      existing.level = choice.nextLevel;
      existing.damage = calibrated.damage;
      existing.cooldown = calibrated.cooldown;
      this.callbacks.onBannerToast(`Merged into ${choice.evolvedName}`);
    } else {
      const def = WEAPON_CATALOG.find((w) => w.id === choice.id)!;
      this.player.weapons.push({
        id: choice.id,
        level: 1,
        cooldown: def.baseCooldown,
        timer: def.baseCooldown * 0.7,
        damage: def.baseDamage,
        range: def.range,
      });
      this.callbacks.onBannerToast(`Equipped ${choice.evolvedName}`);
    }
    this.setPaused(false);
    this.emitHud();
  }

  public destroy(): void {
    if (this.running) {
      this.flushCheckpoint(false);
    }
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.cleanupListeners?.();
    this.clearSpriteDomElements();
    if (this.spriteLayerEl) {
      this.spriteLayerEl.remove();
      this.spriteLayerEl = null;
    }
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    const rawDt = (now - this.lastTimestamp) / 1000;
    this.lastTimestamp = now;
    const dt = Math.min(0.05, Math.max(0, rawDt));

    if (!this.paused) {
      this.stepSimulation(dt);
    }
    this.renderFrame();

    this.rafId = requestAnimationFrame(this.tick);
  };

  private resolveMovementVector(): { x: number; y: number } {
    let kx = 0;
    let ky = 0;
    if (this.keysDown.has('a') || this.keysDown.has('arrowleft')) kx -= 1;
    if (this.keysDown.has('d') || this.keysDown.has('arrowright')) kx += 1;
    if (this.keysDown.has('w') || this.keysDown.has('arrowup')) ky -= 1;
    if (this.keysDown.has('s') || this.keysDown.has('arrowdown')) ky += 1;

    if (kx !== 0 || ky !== 0) {
      const len = Math.hypot(kx, ky);
      return { x: kx / len, y: ky / len };
    }
    return this.dragVector;
  }

  private stepSimulation(dt: number): void {
    this.elapsedSec += dt;
    this.waveTimer += dt;
    this.checkpointAccumulator += dt;

    if (this.checkpointAccumulator >= 4.0) {
      this.checkpointAccumulator = 0;
      this.flushCheckpoint(false);
    }

    // Mid-wave surge in Wave 4+ from a flanking arc (never a 360-degree inescapable trap)
    const maxActiveCap =
      this.wave === 1
        ? 10
        : this.wave === 2
          ? 14
          : this.wave === 3
            ? 18
            : this.wave === 4
              ? 22
              : Math.min(44, 14 + this.wave * 2);

    if (!this.midWaveSurgeTriggered && this.wave >= 4 && this.waveTimer >= 16) {
      this.midWaveSurgeTriggered = true;
      const ambushCount = Math.min(6, 2 + Math.floor(this.wave / 2));
      const baseArc = Math.random() * Math.PI * 2;
      for (let i = 0; i < ambushCount; i++) {
        if (this.enemies.length >= maxActiveCap) break;
        const angle = baseArc + (i - ambushCount / 2) * 0.38;
        const isGuaranteedElite = this.wave >= 4 && i === 0;
        this.spawnRegularEnemy(angle, 410, isGuaranteedElite);
      }
      this.callbacks.onBannerToast(`Wave ${this.wave} Swarm Surge!`);
    }

    if (this.waveTimer >= this.waveDuration) {
      this.waveTimer -= this.waveDuration;
      this.wave += 1;
      this.midWaveSurgeTriggered = false;
      this.careerXpEarned += 20;
      this.flushCheckpoint(false);
      if (this.wave % 5 === 0) {
        this.spawnApexBoss();
      } else {
        this.callbacks.onBannerToast(`Wave ${this.wave}`);
      }
    }

    // Regenerate HP & decay timers (standing completely still reduces passive regen by 75%)
    if (this.siphonCooldown > 0) this.siphonCooldown = Math.max(0, this.siphonCooldown - dt);
    if (this.player.regenPerSec > 0 && this.player.hp < this.player.maxHp) {
      const regenMult = this.stationaryTimer > 1.8 ? 0.25 : 1.0;
      this.player.hp = Math.min(
        this.player.maxHp,
        this.player.hp + this.player.regenPerSec * regenMult * dt
      );
    }
    if (this.player.invulnTimer > 0) this.player.invulnTimer = Math.max(0, this.player.invulnTimer - dt);
    if (this.player.buffs.speedTimer > 0) this.player.buffs.speedTimer = Math.max(0, this.player.buffs.speedTimer - dt);
    if (this.player.buffs.furyTimer > 0) this.player.buffs.furyTimer = Math.max(0, this.player.buffs.furyTimer - dt);
    if (this.player.buffs.globalMagnetTimer > 0) {
      this.player.buffs.globalMagnetTimer = Math.max(0, this.player.buffs.globalMagnetTimer - dt);
    }
    if (this.player.buffs.shieldTimer > 0) {
      this.player.buffs.shieldTimer = Math.max(0, this.player.buffs.shieldTimer - dt);
      if (this.player.buffs.shieldTimer <= 0) {
        this.player.buffs.shieldHits = 0;
      }
    }
    if (this.shakeTimer > 0) this.shakeTimer = Math.max(0, this.shakeTimer - dt);

    // Move player inside arena bounds & resolve against realm pylons / corridor walls
    const mv = this.resolveMovementVector();
    const speedBoost = this.player.buffs.speedTimer > 0 ? 1.55 : 1.0;
    const velocity = this.player.baseSpeed * speedBoost;
    const movedPlayer = this.resolveCircleVsObstacles(
      this.player.x + mv.x * velocity * dt,
      this.player.y + mv.y * velocity * dt,
      this.player.radius,
      36
    );
    this.player.x = movedPlayer.x;
    this.player.y = movedPlayer.y;

    // Realm Interactive Pads (Magnet Shrines, Linked Warp Runes, Overcharge Nodes)
    this.overchargeActive = false;
    for (const [pid, cd] of this.padCooldowns.entries()) {
      if (cd - dt <= 0) this.padCooldowns.delete(pid);
      else this.padCooldowns.set(pid, cd - dt);
    }

    for (const pad of this.realmSpec.pads) {
      const pDist = Math.hypot(this.player.x - pad.x, this.player.y - pad.y);
      const activeCd = this.padCooldowns.get(pad.id) ?? 0;

      if (pad.kind === 'overcharge_node') {
        if (pDist <= pad.radius + this.player.radius * 0.4) {
          this.overchargeActive = true;
        }
      } else if (pad.kind === 'magnet_shrine' && activeCd <= 0 && pDist <= pad.radius + this.player.radius * 0.5) {
        this.padCooldowns.set(pad.id, pad.cooldownSec);
        this.player.buffs.globalMagnetTimer = Math.max(this.player.buffs.globalMagnetTimer, 4.5);
        retroAudio.playPowerup();
        triggerHaptic(28, this.settings.haptics);
        this.callbacks.onBannerToast('Magnet Shrine Activated');
        this.shockwaves.push({
          x: pad.x,
          y: pad.y,
          radius: 18,
          maxRadius: 210,
          life: 0.42,
          maxLife: 0.42,
          color: '#00F0FF',
          hitIds: new Set(),
        });
      } else if (pad.kind === 'warp_rune' && activeCd <= 0 && pad.linkPadId && pDist <= pad.radius + this.player.radius * 0.35) {
        const destPad = this.realmSpec.pads.find((p) => p.id === pad.linkPadId);
        if (destPad) {
          this.padCooldowns.set(pad.id, pad.cooldownSec);
          this.padCooldowns.set(destPad.id, destPad.cooldownSec);
          this.shockwaves.push({
            x: pad.x,
            y: pad.y,
            radius: 16,
            maxRadius: 96,
            life: 0.28,
            maxLife: 0.28,
            color: '#C084FC',
            hitIds: new Set(),
          });
          this.player.x = destPad.x;
          this.player.y = destPad.y;
          this.player.invulnTimer = Math.max(this.player.invulnTimer, 0.6);
          this.stationaryAnchor = { x: destPad.x, y: destPad.y };
          this.stationaryTimer = 0;
          retroAudio.playPowerup();
          triggerHaptic(32, this.settings.haptics);
          this.callbacks.onBannerToast('Starlight Warp Shift');
          this.shockwaves.push({
            x: destPad.x,
            y: destPad.y,
            radius: 16,
            maxRadius: 110,
            life: 0.32,
            maxLife: 0.32,
            color: '#00F0FF',
            hitIds: new Set(),
          });
        }
      }
    }

    // Starlight Rift telegraphed ambient rift hazards
    if (this.realmSpec.riftHazards) {
      this.riftHazardTimer -= dt;
      if (this.riftHazardTimer <= 0 && this.hazards.length < 4) {
        this.riftHazardTimer = Math.max(5.5, 9.5 - this.wave * 0.22);
        const rAng = Math.random() * Math.PI * 2;
        const rDist = 70 + Math.random() * 110;
        const hx = Math.max(80, Math.min(this.arenaWidth - 80, this.player.x + Math.cos(rAng) * rDist));
        const hy = Math.max(80, Math.min(this.arenaHeight - 80, this.player.y + Math.sin(rAng) * rDist));
        this.hazards.push({
          x: hx,
          y: hy,
          radius: 62,
          fuse: 1.25,
          maxFuse: 1.25,
          damage: Math.round(16 + this.wave * 3.5),
        });
      }
    }

    // Track stationary camping / AFK position & fire telegraphed Target-Lock Mortar if camping in one spot
    const anchorDist = Math.hypot(
      this.player.x - this.stationaryAnchor.x,
      this.player.y - this.stationaryAnchor.y
    );
    if (anchorDist > 28) {
      this.stationaryAnchor = { x: this.player.x, y: this.player.y };
      this.stationaryTimer = 0;
    } else {
      this.stationaryTimer += dt;
      const lockThreshold = this.wave >= 5 ? 2.6 : 3.2;
      if (this.wave >= 2 && this.stationaryTimer >= lockThreshold && this.enemies.length > 0) {
        this.stationaryTimer = lockThreshold - 1.35;
        this.hazards.push({
          x: this.player.x,
          y: this.player.y,
          radius: 56,
          fuse: 0.9,
          maxFuse: 0.9,
          damage: Math.round(this.player.maxHp * 0.22 + this.wave * 4.5),
        });
      }
    }

    // Speed boost cyan neon trail
    if (this.player.buffs.speedTimer > 0 && (Math.abs(mv.x) > 0.05 || Math.abs(mv.y) > 0.05)) {
      this.afterimageTimer += dt;
      if (this.afterimageTimer >= 0.055) {
        this.afterimageTimer = 0;
        this.particles.push({
          kind: 'afterimage',
          x: this.player.x,
          y: this.player.y,
          vx: 0,
          vy: 0,
          radius: this.player.radius - 2,
          color: '#00F0FF',
          life: 0.24,
          maxLife: 0.24,
        });
      }
    }

    // Spawn enemies with controlled on-screen cap so waves stay readable and conquerable
    const minActiveEnemies =
      this.wave === 1
        ? 3
        : this.wave === 2
          ? 4
          : Math.min(18, 3 + this.wave);
    const spawnInterval =
      this.wave === 1
        ? 1.35
        : this.wave === 2
          ? 1.15
          : this.wave === 3
            ? 1.0
            : Math.max(0.45, 1.05 - this.wave * 0.045);
    this.spawnTimer -= dt * (this.enemies.length < minActiveEnemies ? 1.35 : 1.0);
    if (this.spawnTimer <= 0 && this.enemies.length < maxActiveCap) {
      this.spawnTimer = spawnInterval;
      const baseBatch =
        this.wave <= 2 ? 1 : 1 + Math.floor((this.wave - 1) / 3);
      const extra =
        this.wave >= 3 && Math.random() < 0.35 ? 1 : 0;
      const batch = Math.min(3, baseBatch + extra);
      for (let i = 0; i < batch; i++) {
        if (this.enemies.length >= maxActiveCap) break;
        this.spawnRegularEnemy();
      }
    }

    // Spawn temporary power-up crates
    this.crateTimer -= dt;
    if (this.crateTimer <= 0 && this.crates.length < 2) {
      this.crateTimer = 20;
      this.spawnPowerUpCrate();
    }

    // Fire auto-weapons (scaled by Career Level haste, Overclock Fury, and Citadel Overcharge Node)
    const fireRateMult =
      this.player.fireRateHaste *
      (this.player.buffs.furyTimer > 0 ? 1.3 : 1.0) *
      (this.overchargeActive ? 1.25 : 1.0);
    const dmgMult =
      this.player.damageMultiplier * (this.player.buffs.furyTimer > 0 ? 1.45 : 1.0);

    for (const weapon of this.player.weapons) {
      if (weapon.id === 'orbiting_blades') {
        this.stepOrbitingBlades(weapon, dmgMult, dt);
        continue;
      }
      weapon.timer += dt * fireRateMult;
      if (weapon.timer >= weapon.cooldown) {
        weapon.timer = 0;
        this.fireWeapon(weapon, dmgMult);
      }
    }

    this.stepProjectiles(dt);
    this.stepEnemies(dt);
    this.stepEnemyBullets(dt);
    this.stepOrbsAndCrates(dt);
    this.stepEffects(dt);

    this.hudEmitAccumulator += dt;
    if (this.hudEmitAccumulator >= 0.1) {
      this.hudEmitAccumulator = 0;
      this.emitHud();
    }
  }

  private spawnRegularEnemy(
    forceAngle?: number,
    forceDist?: number,
    forceElite?: boolean
  ): void {
    const pool = this.callbacks.getEmojiPool();
    if (pool.length === 0) return;

    let trait = pool[Math.floor(Math.random() * pool.length)];
    if (this.realmSpec.sniperStalkerBias > 0 && Math.random() < this.realmSpec.sniperStalkerBias) {
      const specialistPool = pool.filter(
        (t) =>
          t.behaviorType === 1 ||
          t.behaviorType === 3 ||
          t.tier === 'Rare' ||
          t.tier === 'Apex'
      );
      if (specialistPool.length > 0) {
        trait = specialistPool[Math.floor(Math.random() * specialistPool.length)];
      }
    }

    const angle = forceAngle ?? Math.random() * Math.PI * 2;
    const dist = forceDist ?? 350 + Math.random() * 110;
    const rawX = Math.max(40, Math.min(this.arenaWidth - 40, this.player.x + Math.cos(angle) * dist));
    const rawY = Math.max(40, Math.min(this.arenaHeight - 40, this.player.y + Math.sin(angle) * dist));
    const safePos = this.resolveCircleVsObstacles(rawX, rawY, 24, 40);
    const x = safePos.x;
    const y = safePos.y;

    const w = Math.max(0, this.wave - 1);
    const lateWave = Math.max(0, this.wave - 5);
    const intraWave = (this.waveTimer / this.waveDuration) * 0.1;
    // Waves 1-4 stay approachable; Wave 6+ ramps progressively so late waves challenge high-level builds
    const waveHpScale =
      (1 + w * 0.24 + Math.pow(w, 1.45) * 0.075 + Math.pow(lateWave, 1.85) * 0.16) *
      (1 + intraWave);
    const isElite =
      forceElite ?? (this.wave >= 3 && Math.random() < Math.min(0.24, 0.04 + w * 0.016));
    const bruteMult = trait.behaviorType === 2 ? 1.25 : 1.0;
    const eliteHpMult = isElite ? 1.85 : 1.0;
    const baseCombatHp = 16 + trait.hp * 0.28;
    const hp = Math.max(20, Math.round(baseCombatHp * waveHpScale * bruteMult * eliteHpMult));

    const baseSpeed = 56 + trait.speed * 22;
    const waveSpeedScale = 0.86 + Math.min(0.78, w * 0.052 + lateWave * 0.02);
    const realmSpeedMult = trait.behaviorType === 0 ? this.realmSpec.swarmerSpeedMult : 1.0;
    const speed = baseSpeed * waveSpeedScale * realmSpeedMult * (isElite ? 1.1 : 1.0);

    const waveDmgScale = 1 + w * 0.15 + Math.pow(w, 1.25) * 0.045 + Math.pow(lateWave, 1.5) * 0.08;
    const damage = Math.max(
      4,
      Math.round((3 + trait.damage * 0.45) * waveDmgScale * (isElite ? 1.25 : 1.0))
    );

    const baseRadius = trait.behaviorType === 2 ? 21 : 17;

    this.enemies.push({
      uid: this.nextEntityUid++,
      trait,
      x,
      y,
      hp,
      maxHp: hp,
      speed,
      damage,
      radius: isElite ? baseRadius + 4 : baseRadius,
      isBoss: false,
      isElite,
      phaseAngle: Math.random() * Math.PI * 2,
      actionTimer: 1.5 + Math.random() * 1.2,
      hitFlash: 0,
      knockbackCooldown: 0,
    });
  }

  private spawnApexBoss(): void {
    const pool = this.callbacks.getEmojiPool();
    if (pool.length === 0) return;
    const sortedByPower = [...pool].sort((a, b) => b.powerRating - a.powerRating);
    const bossTrait = sortedByPower[0];

    retroAudio.playBossSiren();
    triggerHaptic(60, this.settings.haptics);
    this.callbacks.onBannerToast(
      `Wave ${this.wave} Apex Boss · #${bossTrait.hash.slice(0, 6)}`
    );

    const angle = Math.random() * Math.PI * 2;
    const rawX = Math.max(80, Math.min(this.arenaWidth - 80, this.player.x + Math.cos(angle) * 320));
    const rawY = Math.max(80, Math.min(this.arenaHeight - 80, this.player.y + Math.sin(angle) * 320));
    const safeBoss = this.resolveCircleVsObstacles(rawX, rawY, 44, 80);
    const w = Math.max(0, this.wave - 1);
    const lateWave = Math.max(0, this.wave - 5);
    const bossHp = Math.round(
      (560 + this.wave * 165 + Math.pow(w, 1.72) * 44 + Math.pow(lateWave, 2.0) * 65) *
        (bossTrait.powerRating / 90)
    );

    const boss: EnemyEntity = {
      uid: this.nextEntityUid++,
      trait: bossTrait,
      x: safeBoss.x,
      y: safeBoss.y,
      hp: bossHp,
      maxHp: bossHp,
      speed: 112 + Math.min(68, this.wave * 3.2),
      damage: Math.round(20 + this.wave * 3.4 + Math.pow(lateWave, 1.35) * 2.2),
      radius: 40,
      isBoss: true,
      bossSpawnWave: this.wave,
      isElite: true,
      phaseAngle: 0,
      actionTimer: 1.65 * this.realmSpec.bossCooldownMult,
      hitFlash: 0,
      knockbackCooldown: 999,
    };
    this.enemies.push(boss);
    this.activeBoss = boss;
  }

  private spawnPowerUpCrate(): void {
    const options: Array<{ kind: PowerUpKind; label: string }> = [
      { kind: 'speed', label: 'Speed Boost' },
      { kind: 'shield', label: 'Aegis Shield' },
      { kind: 'fury', label: 'Overclock Fury' },
      { kind: 'magnet', label: 'Super Magnet' },
    ];
    const picked = options[Math.floor(Math.random() * options.length)];
    const angle = Math.random() * Math.PI * 2;
    const dist = 180 + Math.random() * 200;
    const safeCrate = this.resolveCircleVsObstacles(
      this.player.x + Math.cos(angle) * dist,
      this.player.y + Math.sin(angle) * dist,
      20,
      60
    );
    this.crates.push({
      x: safeCrate.x,
      y: safeCrate.y,
      kind: picked.kind,
      label: picked.label,
      life: 22,
    });
  }

  private fireWeapon(weapon: ActiveWeapon, dmgMult: number): void {
    if (this.enemies.length === 0) return;

    if (weapon.id === 'lightning_zap') {
      const maxRange = Math.min(275, weapon.range + weapon.level * 14);
      const candidates = [...this.enemies]
        .map((e) => ({ e, d: Math.hypot(e.x - this.player.x, e.y - this.player.y) }))
        .filter((item) => item.d <= maxRange)
        .sort((a, b) => a.d - b.d);

      if (candidates.length > 0) {
        retroAudio.playShoot('zap');
        const primary = candidates[0].e;
        this.particles.push({
          kind: 'arc',
          x: this.player.x,
          y: this.player.y,
          x2: primary.x,
          y2: primary.y,
          vx: 0,
          vy: 0,
          radius: 2,
          color: '#00F0FF',
          life: 0.14,
          maxLife: 0.14,
        });
        this.damageEnemy(primary, weapon.damage * dmgMult);

        // Chain arcs scale from 1 target at Lv.1 up to 4 targets at Lv.4+
        const maxChainTargets = Math.min(4, weapon.level);
        const chainDmgMult = weapon.level === 1 ? 0.55 : weapon.level === 2 ? 0.72 : 0.85;
        if (maxChainTargets > 0) {
          const chainJumpNeighbors = [...this.enemies]
            .filter((other) => other.uid !== primary.uid)
            .map((other) => ({
              e: other,
              d: Math.hypot(other.x - primary.x, other.y - primary.y),
            }))
            .filter((item) => item.d <= 150)
            .sort((a, b) => a.d - b.d)
            .slice(0, maxChainTargets);

          for (const { e: chained } of chainJumpNeighbors) {
            this.particles.push({
              kind: 'arc',
              x: primary.x,
              y: primary.y,
              x2: chained.x,
              y2: chained.y,
              vx: 0,
              vy: 0,
              radius: 1.5,
              color: '#00F0FF',
              life: 0.12,
              maxLife: 0.12,
            });
            this.damageEnemy(chained, weapon.damage * dmgMult * chainDmgMult);
          }
        }
      }
    } else if (weapon.id === 'garlic_aura') {
      const radius = Math.min(145, weapon.range + weapon.level * 10);
      let hitAny = false;
      for (const e of [...this.enemies]) {
        const dist = Math.hypot(e.x - this.player.x, e.y - this.player.y);
        if (dist <= radius + e.radius) {
          this.damageEnemy(e, weapon.damage * dmgMult, true);
          hitAny = true;
        }
      }
      if (hitAny && this.settings.flashingEffects && !this.settings.reducedMotion) {
        this.shockwaves.push({
          x: this.player.x,
          y: this.player.y,
          radius: radius * 0.7,
          maxRadius: radius,
          life: 0.18,
          maxLife: 0.18,
          color: 'rgba(192, 132, 252, 0.55)',
          hitIds: new Set(),
        });
      }
    } else if (weapon.id === 'plasma_lance') {
      const maxAcquireRange = weapon.range + weapon.level * 18;
      const target = [...this.enemies]
        .map((e) => ({ e, d: Math.hypot(e.x - this.player.x, e.y - this.player.y) }))
        .filter((item) => item.d <= maxAcquireRange)
        .sort((a, b) => a.d - b.d)[0]?.e;
      if (!target) return;
      const baseAngle = Math.atan2(target.y - this.player.y, target.x - this.player.x);
      const count = weapon.level >= 3 ? 3 : weapon.level >= 2 ? 2 : 1;
      const perBoltDmg = weapon.damage * dmgMult;
      retroAudio.playShoot('lance');
      for (let i = 0; i < count; i++) {
        const spread = count === 1 ? 0 : (i - (count - 1) / 2) * 0.14;
        const ang = baseAngle + spread;
        this.projectiles.push({
          x: this.player.x,
          y: this.player.y,
          vx: Math.cos(ang) * 490,
          vy: Math.sin(ang) * 490,
          damage: perBoltDmg,
          pierceLeft: Math.min(6, 2 + weapon.level),
          life: 0.65,
          hitIds: new Set(),
        });
      }
    } else if (weapon.id === 'nova_pulse') {
      retroAudio.playShoot('nova');
      this.shockwaves.push({
        x: this.player.x,
        y: this.player.y,
        radius: 20,
        maxRadius: Math.min(255, weapon.range + weapon.level * 18),
        life: 0.38,
        maxLife: 0.38,
        playerDamage: weapon.damage * dmgMult,
        color: '#818CF8',
        hitIds: new Set(),
      });
    }
  }

  private stepOrbitingBlades(weapon: ActiveWeapon, dmgMult: number, dt: number): void {
    for (const [uid, cd] of this.player.orbitHitCooldowns.entries()) {
      if (cd - dt <= 0) this.player.orbitHitCooldowns.delete(uid);
      else this.player.orbitHitCooldowns.set(uid, cd - dt);
    }

    const bladeCount = Math.min(5, 1 + weapon.level);
    const spin = performance.now() / 360;
    const orbitRadius = Math.min(104, weapon.range + weapon.level * 5);
    const hitCooldown = Math.max(0.28, weapon.cooldown);
    const perBladeDmg = weapon.damage * dmgMult;

    for (let b = 0; b < bladeCount; b++) {
      const ang = spin + (b * Math.PI * 2) / bladeCount;
      const bx = this.player.x + Math.cos(ang) * orbitRadius;
      const by = this.player.y + Math.sin(ang) * orbitRadius;

      for (const e of [...this.enemies]) {
        if (this.player.orbitHitCooldowns.has(e.uid)) continue;
        if (Math.hypot(e.x - bx, e.y - by) <= e.radius + 14) {
          this.player.orbitHitCooldowns.set(e.uid, hitCooldown);
          this.damageEnemy(e, perBladeDmg, true);
        }
      }
    }
  }

  private stepProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;

      // Stone walls block player projectiles; Starlight 'energy' monoliths let piercing Plasma Lance beams pass
      if (p.life <= 0 || this.isPointInsideObstacle(p.x, p.y, 4, ['stone'])) {
        this.projectiles.splice(i, 1);
        continue;
      }

      for (const e of [...this.enemies]) {
        if (p.hitIds.has(e.uid)) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) <= e.radius + 13) {
          p.hitIds.add(e.uid);
          this.damageEnemy(e, p.damage);
          p.pierceLeft -= 1;
          if (p.pierceLeft <= 0) {
            p.life = 0;
            break;
          }
        }
      }
    }
  }

  private stepEnemies(dt: number): void {
    // Pairwise separation pass so enemies fan out into a surrounding horde instead of stacking on 1 pixel
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        const sdx = a.x - b.x;
        const sdy = a.y - b.y;
        const minSep = a.radius + b.radius + 6;
        if (Math.abs(sdx) >= minSep || Math.abs(sdy) >= minSep) continue;
        const sDist = Math.hypot(sdx, sdy);
        if (sDist > 0.001 && sDist < minSep) {
          const push = ((minSep - sDist) / minSep) * 48 * dt;
          const pnx = sdx / sDist;
          const pny = sdy / sDist;
          if (!a.isBoss) {
            a.x += pnx * push;
            a.y += pny * push;
          }
          if (!b.isBoss) {
            b.x -= pnx * push;
            b.y -= pny * push;
          }
        }
      }
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
      if (e.knockbackCooldown > 0) e.knockbackCooldown = Math.max(0, e.knockbackCooldown - dt);

      const dx = this.player.x - e.x;
      const dy = this.player.y - e.y;
      const dist = Math.max(0.001, Math.hypot(dx, dy));
      const nx = dx / dist;
      const ny = dy / dist;

      if (e.isBoss) {
        const lungeMult = e.actionTimer < 0.55 ? 1.52 : 1.0;
        e.x += nx * e.speed * lungeMult * dt;
        e.y += ny * e.speed * lungeMult * dt;
        e.actionTimer -= dt;
        if (e.actionTimer <= 0) {
          e.actionTimer =
            Math.max(1.25, 1.75 - this.wave * 0.015) * this.realmSpec.bossCooldownMult;
          // Radial projectile burst + aimed 3-shot fan + Target-Lock Mortar on player coordinates
          const spokes = 8 + Math.min(8, Math.floor(this.wave / 3));
          for (let s = 0; s < spokes; s++) {
            const ang = e.phaseAngle + (s * Math.PI * 2) / spokes;
            this.enemyBullets.push({
              x: e.x,
              y: e.y,
              vx: Math.cos(ang) * 245,
              vy: Math.sin(ang) * 245,
              damage: e.damage * 0.85,
              radius: 6,
              life: 3.4,
            });
          }
          const aimedAngle = Math.atan2(dy, dx);
          for (const offset of [-0.18, 0, 0.18]) {
            const ang = aimedAngle + offset;
            this.enemyBullets.push({
              x: e.x,
              y: e.y,
              vx: Math.cos(ang) * 290,
              vy: Math.sin(ang) * 290,
              damage: e.damage * 0.9,
              radius: 6,
              life: 3.0,
            });
          }
          // Target-Lock Mortar at player's exact position (forces movement)
          this.hazards.push({
            x: this.player.x,
            y: this.player.y,
            radius: 58,
            fuse: 0.9,
            maxFuse: 0.9,
            damage: Math.round(e.damage * 1.15),
          });
          if (dist < 210) {
            this.shockwaves.push({
              x: e.x,
              y: e.y,
              radius: 26,
              maxRadius: 165,
              life: 0.45,
              maxLife: 0.45,
              enemyDamage: e.damage * 0.95,
              color: '#FF2442',
              hitIds: new Set(),
            });
          }
          e.phaseAngle += 0.45;
        }
      } else if (e.trait.behaviorType === 0) {
        // Swarm Rusher: slight burst when closing in without outrunning early players
        const rushBoost = dist < 180 ? 1.14 : 1.03;
        e.x += nx * e.speed * rushBoost * dt;
        e.y += ny * e.speed * rushBoost * dt;
      } else if (e.trait.behaviorType === 1) {
        // Zigzag Stalker
        e.phaseAngle += dt * 6.0;
        const perpX = -ny * Math.sin(e.phaseAngle) * 0.58;
        const perpY = nx * Math.sin(e.phaseAngle) * 0.58;
        e.x += (nx * 1.0 + perpX) * e.speed * dt;
        e.y += (ny * 1.0 + perpY) * e.speed * dt;
      } else if (e.trait.behaviorType === 2) {
        // Shockwave Brute
        e.x += nx * e.speed * 0.86 * dt;
        e.y += ny * e.speed * 0.86 * dt;
        e.actionTimer -= dt;
        if (this.wave >= 2 && e.actionTimer <= 0 && dist < 210) {
          e.actionTimer = 2.6;
          this.shockwaves.push({
            x: e.x,
            y: e.y,
            radius: 18,
            maxRadius: 135,
            life: 0.45,
            maxLife: 0.45,
            enemyDamage: e.damage * 0.9,
            color: '#FF2442',
            hitIds: new Set(),
          });
          if (e.isElite && this.wave >= 5 && this.hazards.length < 3) {
            this.hazards.push({
              x: this.player.x,
              y: this.player.y,
              radius: 50,
              fuse: 0.95,
              maxFuse: 0.95,
              damage: Math.round(e.damage * 1.05),
            });
          }
        }
      } else {
        // Orbiting Sniper
        if (dist > 235) {
          e.x += nx * e.speed * dt;
          e.y += ny * e.speed * dt;
        } else {
          e.x += -ny * e.speed * 0.78 * dt;
          e.y += nx * e.speed * 0.78 * dt;
        }
        e.actionTimer -= dt;
        if (this.wave >= 2 && e.actionTimer <= 0 && dist < 390) {
          e.actionTimer = Math.max(1.65, 2.7 - this.wave * 0.04);
          this.enemyBullets.push({
            x: e.x,
            y: e.y,
            vx: nx * 235,
            vy: ny * 235,
            damage: e.damage * 0.85,
            radius: 5,
            life: 2.6,
          });
        }
      }

      const resolvedE = this.resolveCircleVsObstacles(e.x, e.y, e.radius, 24);
      e.x = resolvedE.x;
      e.y = resolvedE.y;

      if (Math.hypot(this.player.x - e.x, this.player.y - e.y) <= e.radius + this.player.radius - 2) {
        this.applyPlayerDamage(e.damage);
      }
    }
  }

  private stepEnemyBullets(dt: number): void {
    for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
      const b = this.enemyBullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || this.isPointInsideObstacle(b.x, b.y, b.radius * 0.5)) {
        this.enemyBullets.splice(i, 1);
        continue;
      }
      if (Math.hypot(b.x - this.player.x, b.y - this.player.y) <= b.radius + this.player.radius) {
        this.enemyBullets.splice(i, 1);
        this.applyPlayerDamage(b.damage);
      }
    }
  }

  private stepOrbsAndCrates(dt: number): void {
    const globalPull = this.player.buffs.globalMagnetTimer > 0;
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const orb = this.orbs[i];
      const dx = this.player.x - orb.x;
      const dy = this.player.y - orb.y;
      const dist = Math.hypot(dx, dy);

      if (globalPull || dist <= this.player.pickupRadius) {
        orb.magnetized = true;
      }

      if (orb.magnetized && dist > 1) {
        const pullSpeed = globalPull ? 560 : 390;
        orb.x += (dx / dist) * pullSpeed * dt;
        orb.y += (dy / dist) * pullSpeed * dt;
      }

      if (dist <= this.player.radius + 10) {
        this.orbs.splice(i, 1);
        if (orb.kind === 'exp') {
          this.grantExp(orb.value);
        } else {
          const boostedMojo = Math.max(
            1,
            Math.round(orb.value * this.rebirthMojoMultiplier * this.realmSpec.mojoMult)
          );
          this.mojoEarned += boostedMojo;
          this.score += boostedMojo * 15;
          retroAudio.playPickup();
          if (this.particles.length < 130) {
            this.particles.push({
              kind: 'text',
              x: this.player.x + (Math.random() - 0.5) * 14,
              y: this.player.y - this.player.radius - 10,
              vx: 0,
              vy: -30,
              radius: 0,
              text: `+${boostedMojo} MOJO`,
              color: '#FACC15',
              life: 0.45,
              maxLife: 0.45,
            });
          }
        }
      }
    }

    for (let i = this.crates.length - 1; i >= 0; i--) {
      const c = this.crates[i];
      c.life -= dt;
      if (c.life <= 0) {
        this.crates.splice(i, 1);
        continue;
      }
      if (Math.hypot(c.x - this.player.x, c.y - this.player.y) <= this.player.radius + 18) {
        this.crates.splice(i, 1);
        this.activateCrate(c);
      }
    }
  }

  private activateCrate(crate: PowerUpCrate): void {
    retroAudio.playPowerup();
    triggerHaptic(30, this.settings.haptics);
    this.callbacks.onBannerToast(crate.label);

    if (crate.kind === 'speed') {
      this.player.buffs.speedTimer = 7;
    } else if (crate.kind === 'shield') {
      this.player.buffs.shieldHits = 2;
      this.player.buffs.shieldTimer = 10;
    } else if (crate.kind === 'fury') {
      this.player.buffs.furyTimer = 8;
    } else if (crate.kind === 'magnet') {
      this.player.buffs.globalMagnetTimer = 4.0;
    }
  }

  private stepEffects(dt: number): void {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.life -= dt;
      const progress = 1 - Math.max(0, sw.life / sw.maxLife);
      sw.radius = 18 + (sw.maxRadius - 18) * progress;

      if (sw.playerDamage) {
        for (const e of [...this.enemies]) {
          if (sw.hitIds.has(e.uid)) continue;
          const dist = Math.hypot(e.x - sw.x, e.y - sw.y);
          if (Math.abs(dist - sw.radius) <= e.radius + 16) {
            sw.hitIds.add(e.uid);
            this.damageEnemy(e, sw.playerDamage, true);
          }
        }
      }

      if (sw.enemyDamage && !sw.hitIds.has(0)) {
        const pDist = Math.hypot(this.player.x - sw.x, this.player.y - sw.y);
        if (Math.abs(pDist - sw.radius) <= this.player.radius + 10) {
          sw.hitIds.add(0);
          this.applyPlayerDamage(sw.enemyDamage);
        }
      }

      if (sw.life <= 0) {
        this.shockwaves.splice(i, 1);
      }
    }

    // Target-Lock Mortar Hazard rings (punish stationary AFK camping while easily dodged when moving)
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.fuse -= dt;
      if (h.fuse <= 0) {
        this.hazards.splice(i, 1);
        this.shockwaves.push({
          x: h.x,
          y: h.y,
          radius: 12,
          maxRadius: h.radius,
          life: 0.24,
          maxLife: 0.24,
          color: '#FF2442',
          hitIds: new Set(),
        });
        const pDist = Math.hypot(this.player.x - h.x, this.player.y - h.y);
        if (pDist <= h.radius + this.player.radius * 0.5) {
          this.applyPlayerDamage(h.damage);
        }
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  private damageEnemy(enemy: EnemyEntity, rawAmount: number, allowKnockback = false): void {
    const dmg = Math.max(1, Math.round(rawAmount));
    enemy.hp -= dmg;
    enemy.hitFlash = 0.09;

    // Controlled close-quarters knockback with per-enemy cooldown & wave resistance (prevents AFK perma-juggling)
    if (
      allowKnockback &&
      !enemy.isBoss &&
      enemy.trait.behaviorType !== 2 &&
      enemy.hp > 0 &&
      enemy.knockbackCooldown <= 0
    ) {
      enemy.knockbackCooldown = 0.78;
      const kdx = enemy.x - this.player.x;
      const kdy = enemy.y - this.player.y;
      const kDist = Math.max(1, Math.hypot(kdx, kdy));
      const waveResist = Math.max(0.22, 1 - Math.max(0, this.wave - 2) * 0.065);
      const knockbackPx = (enemy.isElite ? 5 : 10) * waveResist;
      enemy.x = Math.max(36, Math.min(this.arenaWidth - 36, enemy.x + (kdx / kDist) * knockbackPx));
      enemy.y = Math.max(36, Math.min(this.arenaHeight - 36, enemy.y + (kdy / kDist) * knockbackPx));
    }

    if (this.particles.length < 140) {
      this.particles.push({
        kind: 'text',
        x: enemy.x + (Math.random() - 0.5) * 14,
        y: enemy.y - enemy.radius - 4,
        vx: 0,
        vy: -32,
        radius: 0,
        text: String(dmg),
        color: enemy.isBoss || dmg >= 65 ? '#00F0FF' : '#F8FAFC',
        life: 0.42,
        maxLife: 0.42,
      });
    }

    if (enemy.hp <= 0) {
      const idx = this.enemies.indexOf(enemy);
      if (idx !== -1) this.enemies.splice(idx, 1);
      if (this.activeBoss?.uid === enemy.uid) {
        this.activeBoss = null;
        this.bossesDefeated += 1;
        const bossMojo = Math.round(
          25 * this.rebirthMojoMultiplier * this.realmSpec.mojoMult * this.realmSpec.bossDropMult
        );
        this.mojoEarned += bossMojo;
        this.careerXpEarned += Math.round(75 * this.realmSpec.xpMult);
        this.score += 1200;

        const unlockedRealm = getRealmUnlockedForBossWave(enemy.bossSpawnWave ?? this.wave);
        if (unlockedRealm) {
          this.callbacks.onRealmUnlocked?.(unlockedRealm);
          const unlockedSpec = getRealmSpec(unlockedRealm);
          this.callbacks.onBannerToast(
            `Apex Boss Defeated · Unlocked ${unlockedSpec.name}! (+${bossMojo} Mojo)`
          );
        } else {
          this.callbacks.onBannerToast(`Apex Boss Defeated · +${bossMojo} Mojo`);
        }
      }

      this.defeated += 1;
      this.careerXpEarned += Math.max(
        2,
        Math.round(enemy.trait.expValue * 2 * this.realmSpec.xpMult)
      );
      this.score += Math.round(
        enemy.trait.powerRating * (enemy.isBoss ? 8 : enemy.isElite ? 2.5 : 1)
      );

      if (!this.featuredEmoji || enemy.trait.powerRating >= this.featuredEmoji.powerRating || enemy.isBoss) {
        this.featuredEmoji = {
          emojiKey: enemy.trait.emojiKey,
          hash: enemy.trait.hash,
          shortcode: enemy.trait.shortcode,
          url: enemy.trait.url,
          tier: enemy.trait.tier,
          powerRating: enemy.trait.powerRating,
          packTitle: enemy.trait.packTitle,
        };
      }

      this.callbacks.onEnemyDefeated(enemy.trait);
      if (enemy.isBoss) {
        this.flushCheckpoint(false);
      }

      // Sustain siphon: Cooldown-gated & requires active movement (never rewards AFK standing still)
      if (
        this.player.hp < this.player.maxHp &&
        this.stationaryTimer < 2.0 &&
        (enemy.isBoss || (this.siphonCooldown <= 0 && (enemy.isElite || Math.random() < 0.05)))
      ) {
        if (!enemy.isBoss) {
          this.siphonCooldown = 3.8;
        }
        const healAmt = Math.max(
          3,
          Math.round(this.player.maxHp * (enemy.isBoss ? 0.18 : enemy.isElite ? 0.04 : 0.025))
        );
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + healAmt);
        this.particles.push({
          kind: 'text',
          x: this.player.x,
          y: this.player.y - this.player.radius - 12,
          vx: 0,
          vy: -26,
          radius: 0,
          text: `+${healAmt} HP`,
          color: '#00FF9D',
          life: 0.45,
          maxLife: 0.45,
        });
      }

      // Drop EXP shard and calibrated Mojo Coin bounty (resolved outside obstacles so coins never hide inside walls/pylons)
      const expDrop = enemy.isBoss
        ? 45
        : enemy.isElite
          ? enemy.trait.expValue * 3
          : Math.max(3, Math.round(enemy.trait.expValue * 1.8));
      const safeExpPos = this.resolveCircleVsObstacles(enemy.x, enemy.y, 10, 24);
      this.orbs.push({
        x: safeExpPos.x,
        y: safeExpPos.y,
        kind: 'exp',
        value: expDrop,
        magnetized: false,
      });

      this.killsSinceMojoCoin += 1;
      const shouldDropCoin =
        enemy.isBoss ||
        enemy.isElite ||
        this.killsSinceMojoCoin >= 4 ||
        Math.random() < 0.3;

      if (shouldDropCoin) {
        this.killsSinceMojoCoin = 0;
        if (enemy.isBoss) {
          const totalBossOrb = 15 * this.realmSpec.bossDropMult;
          const coinCount = 3;
          const perCoin = Math.max(5, Math.round(totalBossOrb / coinCount));
          for (let c = 0; c < coinCount; c++) {
            const ang = (c * Math.PI * 2) / coinCount + 0.4;
            const safeCoinPos = this.resolveCircleVsObstacles(
              enemy.x + Math.cos(ang) * 26,
              enemy.y + Math.sin(ang) * 26,
              12,
              24
            );
            this.orbs.push({
              x: safeCoinPos.x,
              y: safeCoinPos.y,
              kind: 'mojo',
              value: perCoin,
              magnetized: false,
            });
          }
        } else {
          const safeCoinPos = this.resolveCircleVsObstacles(
            enemy.x + 14,
            enemy.y - 8,
            10,
            24
          );
          this.orbs.push({
            x: safeCoinPos.x,
            y: safeCoinPos.y,
            kind: 'mojo',
            value: enemy.isElite ? enemy.trait.mojoValue + 1 : enemy.trait.mojoValue,
            magnetized: false,
          });
        }
      }

      const burstPalette = ['#FF1493', '#00F0FF', '#A855F7', '#00FF9D'];
      const allowDense = this.settings.denseParticles && !this.settings.reducedMotion;
      const burstCount = this.settings.reducedMotion ? 2 : allowDense ? (enemy.isBoss ? 26 : 8) : 3;
      for (let k = 0; k < burstCount; k++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 45 + Math.random() * 110;
        this.particles.push({
          kind: 'spark',
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          radius: enemy.isBoss ? 3.5 : 2.2,
          color: burstPalette[k % burstPalette.length],
          life: 0.35,
          maxLife: 0.35,
        });
      }
    }
  }

  private applyPlayerDamage(rawDamage: number): void {
    if (this.player.invulnTimer > 0) return;
    this.player.invulnTimer = this.wave >= 8 ? 0.36 : 0.52;

    // Defensive micro-repulse on hit in early waves so overlapping crowds cannot pin a moving player
    if (this.wave <= 6) {
      for (const e of this.enemies) {
        if (e.isBoss) continue;
        const rdx = e.x - this.player.x;
        const rdy = e.y - this.player.y;
        const rDist = Math.hypot(rdx, rdy);
        if (rDist > 0.001 && rDist < 88) {
          const push = ((88 - rDist) / 88) * 26;
          e.x = Math.max(36, Math.min(this.arenaWidth - 36, e.x + (rdx / rDist) * push));
          e.y = Math.max(36, Math.min(this.arenaHeight - 36, e.y + (rdy / rDist) * push));
        }
      }
    }

    if (this.player.buffs.shieldHits > 0) {
      this.player.buffs.shieldHits -= 1;
      if (this.player.buffs.shieldHits <= 0) {
        this.player.buffs.shieldTimer = 0;
      }
      this.particles.push({
        kind: 'text',
        x: this.player.x,
        y: this.player.y - this.player.radius - 8,
        vx: 0,
        vy: -28,
        radius: 0,
        text: 'BLOCKED',
        color: '#00FF9D',
        life: 0.45,
        maxLife: 0.45,
      });
      triggerHaptic(18, this.settings.haptics);
      return;
    }

    const mitigated = Math.max(1, Math.round(rawDamage * (1 - this.player.armorReduction)));
    this.player.hp = Math.max(0, this.player.hp - mitigated);
    this.particles.push({
      kind: 'text',
      x: this.player.x,
      y: this.player.y - this.player.radius - 8,
      vx: 0,
      vy: -30,
      radius: 0,
      text: `-${mitigated}`,
      color: '#FF2442',
      life: 0.48,
      maxLife: 0.48,
    });
    retroAudio.playHit();
    triggerHaptic(35, this.settings.haptics);

    if (this.settings.screenShake && !this.settings.reducedMotion) {
      this.shakeTimer = 0.16;
      this.shakeMagnitude = 5;
    }

    this.emitHud();

    if (this.player.hp <= 0) {
      this.finishRun();
    }
  }

  private grantExp(amount: number): void {
    this.player.exp += amount;
    retroAudio.playPickup();

    if (this.player.exp >= this.player.expNext) {
      this.player.exp -= this.player.expNext;
      this.player.level += 1;
      this.player.expNext = Math.floor(
        this.player.expNext * 1.35 + 14 + this.player.level * 5
      );
      this.paused = true;
      this.activePointerId = null;
      this.dragVector = { x: 0, y: 0 };
      this.flushCheckpoint(false);
      retroAudio.playLevelUp();
      this.emitHud();
      this.callbacks.onLevelUpChoices(this.buildLevelUpChoices());
    }
  }

  private buildLevelUpChoices(): LevelUpChoice[] {
    const shuffled = [...WEAPON_CATALOG].sort(() => Math.random() - 0.5).slice(0, 3);
    return shuffled.map((def) => {
      const owned = this.player.weapons.find((w) => w.id === def.id);
      const nextLevel = owned ? owned.level + 1 : 1;
      const stats = computeWeaponStatsForLevel(def.id, nextLevel);
      const effectiveDamage = Math.round(stats.damage * this.player.damageMultiplier);
      const effectiveCooldown = Number(
        (stats.cooldown / this.player.fireRateHaste).toFixed(2)
      );
      return {
        id: def.id,
        baseName: def.tiers[0],
        evolvedName: getWeaponDisplayName(def.id, nextLevel),
        nextLevel,
        isMerge: Boolean(owned),
        projectedDamage: effectiveDamage,
        projectedCooldown: effectiveCooldown,
        description: owned
          ? `Merge duplicate ${getWeaponDisplayName(def.id, owned.level)} into ${getWeaponDisplayName(def.id, nextLevel)}.`
          : def.description,
      };
    });
  }

  public finishRun(): void {
    if (!this.running) return;
    this.running = false;
    retroAudio.playGameOver();
    this.flushCheckpoint(true);

    const weaponsSummary = this.player.weapons
      .map((w) => `${w.id}:${w.level}`)
      .join(',');

    const topWeapon = [...this.player.weapons].sort(
      (a, b) => b.level - a.level || b.damage - a.damage
    )[0];
    const strongestSpellName = topWeapon
      ? `${getWeaponDisplayName(topWeapon.id, topWeapon.level)} (Lv.${topWeapon.level})`
      : 'Lightning Zap (Lv.1)';

    this.callbacks.onGameOver({
      runSessionId: this.runSessionId,
      realmId: this.realmId,
      score: this.score,
      wave: this.wave,
      defeated: this.defeated,
      bossesDefeated: this.bossesDefeated,
      durationSec: Math.max(1, Math.round(this.elapsedSec)),
      mojoEarned: this.mojoEarned,
      careerXpEarned: this.careerXpEarned,
      weaponsSummary,
      strongestSpellName,
      featuredEmoji: this.featuredEmoji,
    });
  }

  private emitHud(): void {
    this.callbacks.onHudUpdate({
      realmId: this.realmId,
      realmName: this.realmSpec.shortName,
      overchargeActive: this.overchargeActive,
      hp: Math.round(this.player.hp),
      maxHp: this.player.maxHp,
      level: this.player.level,
      exp: this.player.exp,
      expNext: this.player.expNext,
      wave: this.wave,
      waveProgressPct: Math.min(100, (this.waveTimer / this.waveDuration) * 100),
      score: this.score,
      mojoEarned: this.mojoEarned,
      defeated: this.defeated,
      bossesDefeated: this.bossesDefeated,
      elapsedSec: Math.floor(this.elapsedSec),
      weapons: this.player.weapons.map((w) => ({
        id: w.id,
        name: getWeaponDisplayName(w.id, w.level),
        level: w.level,
      })),
      boss: this.activeBoss
        ? {
            name: `#${this.activeBoss.trait.hash.slice(0, 6)}`,
            hp: Math.max(0, Math.round(this.activeBoss.hp)),
            maxHp: this.activeBoss.maxHp,
            tier: this.activeBoss.trait.tier,
          }
        : null,
      buffs: {
        speedRemaining: this.player.buffs.speedTimer,
        shieldHits: this.player.buffs.shieldHits,
        shieldRemaining: this.player.buffs.shieldTimer,
        furyRemaining: this.player.buffs.furyTimer,
      },
    });
  }

  private renderFrame(): void {
    const ctx = this.ctx;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const viewW = this.canvas.width / dpr;
    const viewH = this.canvas.height / dpr;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, viewW, viewH);

    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeTimer > 0 && this.settings.screenShake && !this.settings.reducedMotion) {
      shakeX = (Math.random() - 0.5) * this.shakeMagnitude * 2;
      shakeY = (Math.random() - 0.5) * this.shakeMagnitude * 2;
    }

    const camX = this.player.x - viewW / 2 + shakeX;
    const camY = this.player.y - viewH / 2 + shakeY;

    ctx.save();
    ctx.translate(-camX, -camY);

    // Retro 16-bit BreBre Colors pixel-art arena tilemap + realm floor style + double-pixel perimeter
    const effectiveBgStyle =
      this.settings.arenaBgStyle && this.settings.arenaBgStyle !== 'auto'
        ? this.settings.arenaBgStyle
        : this.realmSpec.defaultFloorStyle;
    const tileCanvas = getArenaPixelTileCanvas(effectiveBgStyle, this.wave);
    if (tileCanvas) {
      const tileSize = tileCanvas.width; // 256px
      const startTileX = Math.max(0, Math.floor(camX / tileSize) * tileSize);
      const endTileX = Math.min(this.arenaWidth, camX + viewW + tileSize);
      const startTileY = Math.max(0, Math.floor(camY / tileSize) * tileSize);
      const endTileY = Math.min(this.arenaHeight, camY + viewH + tileSize);

      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.beginPath();
      ctx.rect(0, 0, this.arenaWidth, this.arenaHeight);
      ctx.clip();

      for (let tx = startTileX; tx < endTileX; tx += tileSize) {
        for (let ty = startTileY; ty < endTileY; ty += tileSize) {
          ctx.drawImage(tileCanvas, tx, ty, tileSize, tileSize);
        }
      }
      ctx.restore();
    } else {
      ctx.strokeStyle = 'rgba(154, 9, 87, 0.28)';
      ctx.lineWidth = 1;
      const gridStep = 90;
      const startX = Math.max(0, Math.floor(camX / gridStep) * gridStep);
      const endX = Math.min(this.arenaWidth, camX + viewW + gridStep);
      const startY = Math.max(0, Math.floor(camY / gridStep) * gridStep);
      const endY = Math.min(this.arenaHeight, camY + viewH + gridStep);

      ctx.beginPath();
      for (let gx = startX; gx <= endX; gx += gridStep) {
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, this.arenaHeight);
      }
      for (let gy = startY; gy <= endY; gy += gridStep) {
        ctx.moveTo(0, gy);
        ctx.lineTo(this.arenaWidth, gy);
      }
      ctx.stroke();
    }

    const animTimeSec = performance.now() * 0.001;

    // 16-Bit Pixel-Art Realm Interactive Pads (Magnet Shrines, Warp Runes, Overcharge Nodes)
    for (const pad of this.realmSpec.pads) {
      const cd = this.padCooldowns.get(pad.id) ?? 0;
      drawRealmPad(
        ctx,
        pad,
        cd,
        this.overchargeActive,
        animTimeSec,
        this.settings.reducedMotion
      );
    }

    // 16-Bit Pixel-Art Realm Obstacles (Forged Pylons, Armored Corridor Walls, Crystal Monoliths, Blast Baffles)
    for (const obs of this.realmSpec.obstacles) {
      drawRealmObstacle(
        ctx,
        obs,
        this.realmId,
        animTimeSec,
        this.settings.reducedMotion
      );
    }

    // 16-Bit Armored Arena Perimeter Wall & Glowing Energy Barrier
    drawArenaPerimeter(ctx, this.arenaWidth, this.arenaHeight, this.realmSpec.accentHex);

    // Pickups: 16-Bit Faceted Emerald XP Crystals & Gleaming Spinning Gold Mojo Coins
    for (const orb of this.orbs) {
      if (orb.kind === 'exp') {
        drawExpGem(ctx, orb.x, orb.y, orb.value, animTimeSec, this.settings.reducedMotion);
      } else {
        drawMojoCoin(ctx, orb.x, orb.y, orb.value, animTimeSec, this.settings.reducedMotion);
      }
    }

    // 16-Bit Pixel-Art Power-Up Supply Pods
    for (const c of this.crates) {
      drawPowerUpCrate(
        ctx,
        c.x,
        c.y,
        c.kind,
        animTimeSec,
        this.settings.reducedMotion
      );
    }

    // Telegraphed Target-Lock Mortar Hazard Rings (Crimson Reticle + Countdown Fill)
    for (const h of this.hazards) {
      const pct = 1 - Math.max(0, h.fuse / h.maxFuse);
      ctx.save();
      ctx.fillStyle = `rgba(255, 36, 66, ${0.08 + pct * 0.18})`;
      ctx.strokeStyle = '#FF2442';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Shrinking lock-on inner ring
      ctx.setLineDash([]);
      ctx.strokeStyle = '#FFCCD5';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(h.x, h.y, Math.max(6, h.radius * (1 - pct)), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Shockwave rings (Player Indigo Nova vs Enemy Crimson Hazard)
    for (const sw of this.shockwaves) {
      ctx.save();
      ctx.strokeStyle = sw.color;
      ctx.lineWidth = sw.enemyDamage ? 3 : 2.5;
      if (sw.enemyDamage) {
        ctx.setLineDash([8, 5]);
      }
      ctx.globalAlpha = Math.max(0.12, sw.life / sw.maxLife);
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Player Garlic Aura (Orchid Violet harmonic perimeter)
    const garlic = this.player.weapons.find((w) => w.id === 'garlic_aura');
    if (garlic) {
      const r = Math.min(145, garlic.range + garlic.level * 10);
      ctx.save();
      ctx.fillStyle = 'rgba(192, 132, 252, 0.07)';
      ctx.strokeStyle = 'rgba(192, 132, 252, 0.38)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(this.player.x, this.player.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Player Orbiting Blades (Spinning Emerald-Teal Chakram Diamonds)
    const blades = this.player.weapons.find((w) => w.id === 'orbiting_blades');
    if (blades) {
      const bladeCount = Math.min(5, 1 + blades.level);
      const spin = performance.now() / 360;
      const orbitRadius = Math.min(104, blades.range + blades.level * 5);

      ctx.save();
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.player.x, this.player.y, orbitRadius, 0, Math.PI * 2);
      ctx.stroke();

      for (let b = 0; b < bladeCount; b++) {
        const ang = spin + (b * Math.PI * 2) / bladeCount;
        const bx = this.player.x + Math.cos(ang) * orbitRadius;
        const by = this.player.y + Math.sin(ang) * orbitRadius;

        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(ang * 2.5);
        ctx.fillStyle = '#10B981';
        ctx.strokeStyle = '#A7F3D0';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(5.5, 0);
        ctx.lineTo(0, 9);
        ctx.lineTo(-5.5, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    // Player Plasma Lance Projectiles (Directional Neon Pink + White-Core Laser Bolts)
    for (const p of this.projectiles) {
      const ang = Math.atan2(p.vy, p.vx);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(ang);
      ctx.strokeStyle = '#FF1493';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-9, 0);
      ctx.lineTo(7, 0);
      ctx.stroke();

      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(7, 0);
      ctx.stroke();
      ctx.restore();
    }

    // Hostile Enemy Projectiles: High-Danger Crimson Barbed Darts with Trailing Tail
    // (100% distinct in color AND shape from Gold Mojo Coins & Emerald XP Gems)
    for (const eb of this.enemyBullets) {
      const ang = Math.atan2(eb.vy, eb.vx);
      ctx.save();
      ctx.translate(eb.x, eb.y);
      ctx.rotate(ang);

      // Crimson danger wake trail
      ctx.strokeStyle = 'rgba(255, 36, 66, 0.45)';
      ctx.lineWidth = eb.radius * 1.3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-eb.radius * 2.8, 0);
      ctx.lineTo(0, 0);
      ctx.stroke();

      // Sharp crimson hazard spearhead
      const r = eb.radius + 2.5;
      ctx.fillStyle = '#FF2442';
      ctx.strokeStyle = '#FFCCD5';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(r + 2.5, 0);
      ctx.lineTo(-r, -r * 0.78);
      ctx.lineTo(-r * 0.45, 0);
      ctx.lineTo(-r, r * 0.78);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Hot inner core
      ctx.fillStyle = '#FFF1F2';
      ctx.beginPath();
      ctx.arc(1, 0, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Enemies (Live NIP-30 custom emojis + tier rings + animated DOM <img> sprites)
    const activeEnemyUids = new Set<number>();
    for (const e of this.enemies) {
      activeEnemyUids.add(e.uid);
      ctx.save();
      if (e.isBoss) {
        ctx.strokeStyle = '#FF2442';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius + 6, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = '#FF1493';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius + 10, 0, Math.PI * 2);
        ctx.stroke();
      } else if (e.isElite) {
        ctx.strokeStyle = '#00F0FF';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      } else if (e.trait.tier === 'Apex' || e.trait.tier === 'Rare') {
        ctx.strokeStyle =
          e.trait.tier === 'Apex'
            ? 'rgba(251, 113, 133, 0.55)'
            : 'rgba(168, 85, 247, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Subtle dark translucent shadow halo under the emoji so animated GIF transparency stays clean
      if (this.settings.opaqueAssetBacking !== false) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.strokeStyle = e.isBoss
          ? '#FF1493'
          : e.isElite
            ? 'rgba(255, 182, 217, 0.65)'
            : 'rgba(154, 9, 87, 0.45)';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius + 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      if (this.spriteLayerEl) {
        let spriteEl = this.enemySpriteEls.get(e.uid);
        if (!spriteEl) {
          spriteEl = document.createElement('img');
          spriteEl.src = e.trait.url;
          spriteEl.alt = '';
          spriteEl.referrerPolicy = 'no-referrer';
          spriteEl.style.position = 'absolute';
          spriteEl.style.left = '0px';
          spriteEl.style.top = '0px';
          spriteEl.style.pointerEvents = 'none';
          spriteEl.style.userSelect = 'none';
          spriteEl.style.objectFit = 'contain';
          spriteEl.style.willChange = 'transform';
          this.spriteLayerEl.appendChild(spriteEl);
          this.enemySpriteEls.set(e.uid, spriteEl);
        }

        const size = e.radius * 2;
        const sx = e.x - camX - e.radius;
        const sy = e.y - camY - e.radius;
        if (sx + size < -24 || sx > viewW + 24 || sy + size < -24 || sy > viewH + 24) {
          spriteEl.style.display = 'none';
        } else {
          spriteEl.style.display = 'block';
          spriteEl.style.width = `${size}px`;
          spriteEl.style.height = `${size}px`;
          spriteEl.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
          spriteEl.style.filter =
            e.hitFlash > 0 && this.settings.flashingEffects && !this.settings.reducedMotion
              ? 'brightness(2.2) contrast(1.2)'
              : 'none';
        }
      } else {
        const img = this.callbacks.getImage(e.trait.url);
        if (img && img.complete && img.naturalWidth > 0) {
          const size = e.radius * 2;
          ctx.drawImage(img, e.x - e.radius, e.y - e.radius, size, size);
        } else {
          ctx.fillStyle = '#1A1A1A';
          ctx.strokeStyle = '#FF1493';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }

      if (e.hp < e.maxHp && !e.isBoss) {
        const bw = e.radius * 1.8;
        const pct = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = '#111111';
        ctx.fillRect(e.x - bw / 2, e.y - e.radius - 9, bw, 4);
        ctx.fillStyle = '#FF1493';
        ctx.fillRect(e.x - bw / 2, e.y - e.radius - 9, bw * pct, 4);
      }
      ctx.restore();
    }

    // Prune defeated enemy DOM <img> nodes immediately
    if (this.enemySpriteEls.size > 0) {
      for (const [uid, el] of this.enemySpriteEls.entries()) {
        if (!activeEnemyUids.has(uid)) {
          el.remove();
          this.enemySpriteEls.delete(uid);
        }
      }
    }

    // Player character & color-matched active buff rings
    ctx.save();
    if (this.player.buffs.shieldHits > 0) {
      ctx.strokeStyle = '#00FF9D';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(this.player.x, this.player.y, this.player.radius + 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (this.player.buffs.furyTimer > 0) {
      ctx.strokeStyle = '#A855F7';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(this.player.x, this.player.y, this.player.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Subtle dark player pedestal ring
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.strokeStyle = '#00F0FF';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(this.player.x, this.player.y, this.player.radius + 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const avatar = this.callbacks.getPlayerAvatar();
    if (this.spriteLayerEl && avatar && avatar.src) {
      if (!this.playerSpriteEl) {
        const pEl = document.createElement('img');
        pEl.src = avatar.src;
        pEl.alt = '';
        pEl.referrerPolicy = 'no-referrer';
        pEl.style.position = 'absolute';
        pEl.style.left = '0px';
        pEl.style.top = '0px';
        pEl.style.borderRadius = '9999px';
        pEl.style.objectFit = 'cover';
        pEl.style.pointerEvents = 'none';
        pEl.style.userSelect = 'none';
        pEl.style.willChange = 'transform';
        this.spriteLayerEl.appendChild(pEl);
        this.playerSpriteEl = pEl;
      } else if (this.playerSpriteEl.src !== avatar.src) {
        this.playerSpriteEl.src = avatar.src;
      }
      const pSize = (this.player.radius - 1.5) * 2;
      const px = this.player.x - camX - pSize / 2;
      const py = this.player.y - camY - pSize / 2;
      this.playerSpriteEl.style.width = `${pSize}px`;
      this.playerSpriteEl.style.height = `${pSize}px`;
      this.playerSpriteEl.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0)`;
    } else if (avatar && avatar.complete && avatar.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.player.x, this.player.y, this.player.radius - 2, 0, Math.PI * 2);
      ctx.clip();
      const s = (this.player.radius - 2) * 2;
      ctx.drawImage(avatar, this.player.x - s / 2, this.player.y - s / 2, s, s);
      ctx.restore();
    } else {
      ctx.fillStyle = '#FF1493';
      ctx.beginPath();
      ctx.arc(this.player.x, this.player.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Particles, electric cyan lightning arcs & floating combat numbers
    for (const p of this.particles) {
      ctx.save();
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      if (p.kind === 'text' && p.text) {
        ctx.fillStyle = p.color;
        ctx.font = '700 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
      } else if (p.kind === 'arc' && p.x2 !== undefined && p.y2 !== undefined) {
        const dx = p.x2 - p.x;
        const dy = p.y2 - p.y;
        const m1x = p.x + dx * 0.33 + (Math.random() - 0.5) * 18;
        const m1y = p.y + dy * 0.33 + (Math.random() - 0.5) * 18;
        const m2x = p.x + dx * 0.66 + (Math.random() - 0.5) * 18;
        const m2y = p.y + dy * 0.66 + (Math.random() - 0.5) * 18;

        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(m1x, m1y);
        ctx.lineTo(m2x, m2y);
        ctx.lineTo(p.x2, p.y2);
        ctx.stroke();

        ctx.strokeStyle = '#E0FFFF';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      } else if (p.kind === 'afterimage') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.restore();
  }
}
