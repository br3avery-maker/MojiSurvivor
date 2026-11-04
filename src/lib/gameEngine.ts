import { retroAudio } from './audio';
import type { EmojiCombatTrait } from './cryptoStats';
import { triggerHaptic, type GameSettings, type UpgradeLevels } from './storage';

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
  score: number;
  wave: number;
  defeated: number;
  bossesDefeated: number;
  durationSec: number;
  mojoEarned: number;
  weaponsSummary: string;
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
    baseDamage: 32,
    baseCooldown: 1.05,
    range: 310,
    description: 'Strikes nearest rogue emojis with high-voltage arcs.',
  },
  {
    id: 'garlic_aura',
    tiers: ['Holy Garlic', 'Radiant Ward', 'Solar Cleansing'],
    baseDamage: 18,
    baseCooldown: 0.55,
    range: 96,
    description: 'Pulses a persistent perimeter field that sears close swarmers.',
  },
  {
    id: 'orbiting_blades',
    tiers: ['Orbiting Blades', 'Twin Chakrams', 'Vortex Ring'],
    baseDamage: 24,
    baseCooldown: 0.2,
    range: 74,
    description: 'Maintains revolving energy satellites that slice colliding foes.',
  },
  {
    id: 'plasma_lance',
    tiers: ['Plasma Lance', 'Twin Railgun', 'Hyper Piercer'],
    baseDamage: 46,
    baseCooldown: 1.25,
    range: 460,
    description: 'Fires armor-piercing bolts straight through dense enemy lines.',
  },
  {
    id: 'nova_pulse',
    tiers: ['Nova Pulse', 'Supernova Wave', 'Singularity Blast'],
    baseDamage: 62,
    baseCooldown: 2.6,
    range: 250,
    description: 'Detonates an expanding shockwave ring clearing surrounding waves.',
  },
];

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
  phaseAngle: number;
  actionTimer: number;
  hitFlash: number;
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
    baseSpeed: 215,
    regenPerSec: 0,
    pickupRadius: 80,
    damageMultiplier: 1,
    level: 1,
    exp: 0,
    expNext: 22,
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

  // Run counters
  private wave = 1;
  private waveTimer = 0;
  private readonly waveDuration = 30;
  private score = 0;
  private mojoEarned = 0;
  private defeated = 0;
  private bossesDefeated = 0;
  private elapsedSec = 0;

  // Entities
  private enemies: EnemyEntity[] = [];
  private projectiles: ProjectileEntity[] = [];
  private enemyBullets: EnemyBullet[] = [];
  private orbs: DropOrb[] = [];
  private crates: PowerUpCrate[] = [];
  private shockwaves: ShockwaveRing[] = [];
  private particles: VisualParticle[] = [];
  private activeBoss: EnemyEntity | null = null;

  private spawnTimer = 0;
  private crateTimer = 8;
  private shakeTimer = 0;
  private shakeMagnitude = 0;

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
    callbacks: GameEngineCallbacks
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

    this.initRunState();
    this.bindInputs();
    this.resizeCanvas();
  }

  public updateSettings(next: GameSettings): void {
    this.settings = next;
  }

  private initRunState(): void {
    const maxHp = 100 + this.upgrades.defense * 18;
    this.player = {
      x: this.arenaWidth / 2,
      y: this.arenaHeight / 2,
      radius: 20,
      hp: maxHp,
      maxHp,
      armorReduction: Math.min(0.45, this.upgrades.defense * 0.04),
      baseSpeed: 215 * (1 + this.upgrades.speed * 0.07),
      regenPerSec: this.upgrades.regen * 0.6,
      pickupRadius: 75 + this.upgrades.magnet * 22,
      damageMultiplier: 1 + this.upgrades.attack * 0.12,
      level: 1,
      exp: 0,
      expNext: 20,
      invulnTimer: 0,
      orbitHitCooldowns: new Map(),
      weapons: [
        {
          id: 'lightning_zap',
          level: 1,
          cooldown: 1.0,
          timer: 0.7,
          damage: 32,
          range: 310,
        },
      ],
      buffs: {
        speedTimer: 0,
        shieldHits: 0,
        shieldTimer: 0,
        furyTimer: 0,
        globalMagnetTimer: 0,
      },
    };

    this.wave = 1;
    this.waveTimer = 0;
    this.score = 0;
    this.mojoEarned = 0;
    this.defeated = 0;
    this.bossesDefeated = 0;
    this.elapsedSec = 0;
    this.enemies = [];
    this.projectiles = [];
    this.enemyBullets = [];
    this.orbs = [];
    this.crates = [];
    this.shockwaves = [];
    this.particles = [];
    this.activeBoss = null;
    this.spawnTimer = 0.25;
    this.crateTimer = 10;
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
    if (!nextPaused) {
      this.lastTimestamp = performance.now();
    }
  }

  public applyLevelUpChoice(choice: LevelUpChoice): void {
    const existing = this.player.weapons.find((w) => w.id === choice.id);
    if (existing) {
      existing.level = choice.nextLevel;
      existing.damage = choice.projectedDamage;
      existing.cooldown = choice.projectedCooldown;
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
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.cleanupListeners?.();
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

    if (this.waveTimer >= this.waveDuration) {
      this.waveTimer -= this.waveDuration;
      this.wave += 1;
      if (this.wave % 5 === 0) {
        this.spawnApexBoss();
      } else {
        this.callbacks.onBannerToast(`Wave ${this.wave}`);
      }
    }

    // Regenerate HP & decay timers
    if (this.player.regenPerSec > 0 && this.player.hp < this.player.maxHp) {
      this.player.hp = Math.min(
        this.player.maxHp,
        this.player.hp + this.player.regenPerSec * dt
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

    // Move player inside arena bounds
    const mv = this.resolveMovementVector();
    const speedBoost = this.player.buffs.speedTimer > 0 ? 1.7 : 1.0;
    const velocity = this.player.baseSpeed * speedBoost;
    this.player.x = Math.max(
      36,
      Math.min(this.arenaWidth - 36, this.player.x + mv.x * velocity * dt)
    );
    this.player.y = Math.max(
      36,
      Math.min(this.arenaHeight - 36, this.player.y + mv.y * velocity * dt)
    );

    // Speed boost pink neon trail
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
          color: '#FF1493',
          life: 0.24,
          maxLife: 0.24,
        });
      }
    }

    // Spawn enemies
    const spawnInterval = Math.max(0.28, 1.25 - this.wave * 0.075);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.enemies.length < 95) {
      this.spawnTimer = spawnInterval;
      const batch = this.wave >= 6 ? 2 : 1;
      for (let i = 0; i < batch; i++) {
        this.spawnRegularEnemy();
      }
    }

    // Spawn temporary power-up crates
    this.crateTimer -= dt;
    if (this.crateTimer <= 0 && this.crates.length < 3) {
      this.crateTimer = 17;
      this.spawnPowerUpCrate();
    }

    // Fire auto-weapons
    const fireRateMult = this.player.buffs.furyTimer > 0 ? 1.5 : 1.0;
    const dmgMult =
      this.player.damageMultiplier * (this.player.buffs.furyTimer > 0 ? 2.0 : 1.0);

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

  private spawnRegularEnemy(): void {
    const pool = this.callbacks.getEmojiPool();
    if (pool.length === 0) return;
    const trait = pool[Math.floor(Math.random() * pool.length)];

    const angle = Math.random() * Math.PI * 2;
    const dist = 460 + Math.random() * 140;
    const x = Math.max(40, Math.min(this.arenaWidth - 40, this.player.x + Math.cos(angle) * dist));
    const y = Math.max(40, Math.min(this.arenaHeight - 40, this.player.y + Math.sin(angle) * dist));

    const waveScale = 1 + (this.wave - 1) * 0.16;
    const hp = Math.round(trait.hp * waveScale);

    this.enemies.push({
      uid: this.nextEntityUid++,
      trait,
      x,
      y,
      hp,
      maxHp: hp,
      speed: (48 + trait.speed * 26) * (1 + Math.min(0.45, (this.wave - 1) * 0.03)),
      damage: Math.round(trait.damage * (1 + (this.wave - 1) * 0.08)),
      radius: trait.behaviorType === 2 ? 22 : 17,
      isBoss: false,
      phaseAngle: Math.random() * Math.PI * 2,
      actionTimer: 1.5 + Math.random() * 1.5,
      hitFlash: 0,
    });
  }

  private spawnApexBoss(): void {
    const pool = this.callbacks.getEmojiPool();
    if (pool.length === 0) return;
    const sortedByPower = [...pool].sort((a, b) => b.powerRating - a.powerRating);
    const bossTrait = sortedByPower[0];

    retroAudio.playBossSiren();
    triggerHaptic(60, this.settings.haptics);
    this.callbacks.onBannerToast(`Wave ${this.wave} Apex Boss — :${bossTrait.shortcode}:`);

    const angle = Math.random() * Math.PI * 2;
    const x = Math.max(80, Math.min(this.arenaWidth - 80, this.player.x + Math.cos(angle) * 420));
    const y = Math.max(80, Math.min(this.arenaHeight - 80, this.player.y + Math.sin(angle) * 420));
    const bossHp = Math.round((950 + this.wave * 240) * (bossTrait.powerRating / 90));

    const boss: EnemyEntity = {
      uid: this.nextEntityUid++,
      trait: bossTrait,
      x,
      y,
      hp: bossHp,
      maxHp: bossHp,
      speed: 78,
      damage: 24 + this.wave * 2,
      radius: 42,
      isBoss: true,
      phaseAngle: 0,
      actionTimer: 2.4,
      hitFlash: 0,
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
    const dist = 200 + Math.random() * 240;
    this.crates.push({
      x: Math.max(60, Math.min(this.arenaWidth - 60, this.player.x + Math.cos(angle) * dist)),
      y: Math.max(60, Math.min(this.arenaHeight - 60, this.player.y + Math.sin(angle) * dist)),
      kind: picked.kind,
      label: picked.label,
      life: 24,
    });
  }

  private fireWeapon(weapon: ActiveWeapon, dmgMult: number): void {
    if (this.enemies.length === 0) return;

    if (weapon.id === 'lightning_zap') {
      const nearest = [...this.enemies]
        .map((e) => ({ e, d: Math.hypot(e.x - this.player.x, e.y - this.player.y) }))
        .filter((item) => item.d <= weapon.range + weapon.level * 24)
        .sort((a, b) => a.d - b.d)
        .slice(0, Math.min(4, weapon.level));

      if (nearest.length > 0) {
        retroAudio.playShoot('zap');
        for (const { e } of nearest) {
          this.particles.push({
            kind: 'arc',
            x: this.player.x,
            y: this.player.y,
            x2: e.x,
            y2: e.y,
            vx: 0,
            vy: 0,
            radius: 2,
            color: '#00F0FF',
            life: 0.14,
            maxLife: 0.14,
          });
          this.damageEnemy(e, weapon.damage * dmgMult);
        }
      }
    } else if (weapon.id === 'garlic_aura') {
      const radius = weapon.range + weapon.level * 18;
      let hitAny = false;
      for (const e of [...this.enemies]) {
        if (Math.hypot(e.x - this.player.x, e.y - this.player.y) <= radius + e.radius) {
          this.damageEnemy(e, weapon.damage * dmgMult);
          hitAny = true;
        }
      }
      if (hitAny && this.settings.flashingEffects) {
        this.shockwaves.push({
          x: this.player.x,
          y: this.player.y,
          radius: radius * 0.7,
          maxRadius: radius,
          life: 0.18,
          maxLife: 0.18,
          color: 'rgba(255, 20, 147, 0.45)',
          hitIds: new Set(),
        });
      }
    } else if (weapon.id === 'plasma_lance') {
      const target = [...this.enemies].sort(
        (a, b) =>
          Math.hypot(a.x - this.player.x, a.y - this.player.y) -
          Math.hypot(b.x - this.player.x, b.y - this.player.y)
      )[0];
      if (!target) return;
      const baseAngle = Math.atan2(target.y - this.player.y, target.x - this.player.x);
      const count = weapon.level >= 2 ? 2 : 1;
      retroAudio.playShoot('lance');
      for (let i = 0; i < count; i++) {
        const spread = count === 2 ? (i === 0 ? -0.09 : 0.09) : 0;
        const ang = baseAngle + spread;
        this.projectiles.push({
          x: this.player.x,
          y: this.player.y,
          vx: Math.cos(ang) * 540,
          vy: Math.sin(ang) * 540,
          damage: weapon.damage * dmgMult,
          pierceLeft: 1 + weapon.level,
          life: 1.1,
          hitIds: new Set(),
        });
      }
    } else if (weapon.id === 'nova_pulse') {
      retroAudio.playShoot('nova');
      this.shockwaves.push({
        x: this.player.x,
        y: this.player.y,
        radius: 24,
        maxRadius: weapon.range + weapon.level * 38,
        life: 0.42,
        maxLife: 0.42,
        playerDamage: weapon.damage * dmgMult,
        color: '#FF1493',
        hitIds: new Set(),
      });
    }
  }

  private stepOrbitingBlades(weapon: ActiveWeapon, dmgMult: number, dt: number): void {
    for (const [uid, cd] of this.player.orbitHitCooldowns.entries()) {
      if (cd - dt <= 0) this.player.orbitHitCooldowns.delete(uid);
      else this.player.orbitHitCooldowns.set(uid, cd - dt);
    }

    const bladeCount = weapon.level + 1;
    const spin = performance.now() / 420;
    const orbitRadius = weapon.range + weapon.level * 6;

    for (let b = 0; b < bladeCount; b++) {
      const ang = spin + (b * Math.PI * 2) / bladeCount;
      const bx = this.player.x + Math.cos(ang) * orbitRadius;
      const by = this.player.y + Math.sin(ang) * orbitRadius;

      for (const e of [...this.enemies]) {
        if (this.player.orbitHitCooldowns.has(e.uid)) continue;
        if (Math.hypot(e.x - bx, e.y - by) <= e.radius + 11) {
          this.player.orbitHitCooldowns.set(e.uid, 0.32);
          this.damageEnemy(e, weapon.damage * dmgMult);
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

      if (p.life <= 0) {
        this.projectiles.splice(i, 1);
        continue;
      }

      for (const e of [...this.enemies]) {
        if (p.hitIds.has(e.uid)) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) <= e.radius + 8) {
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
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);

      const dx = this.player.x - e.x;
      const dy = this.player.y - e.y;
      const dist = Math.max(0.001, Math.hypot(dx, dy));
      const nx = dx / dist;
      const ny = dy / dist;

      if (e.isBoss) {
        e.x += nx * e.speed * dt;
        e.y += ny * e.speed * dt;
        e.actionTimer -= dt;
        if (e.actionTimer <= 0) {
          e.actionTimer = 2.6;
          // Radial projectile burst + shockwave
          const spokes = 8;
          for (let s = 0; s < spokes; s++) {
            const ang = e.phaseAngle + (s * Math.PI * 2) / spokes;
            this.enemyBullets.push({
              x: e.x,
              y: e.y,
              vx: Math.cos(ang) * 185,
              vy: Math.sin(ang) * 185,
              damage: e.damage * 0.75,
              radius: 6,
              life: 3.4,
            });
          }
          e.phaseAngle += 0.4;
        }
      } else if (e.trait.behaviorType === 0) {
        // Swarm Rusher
        e.x += nx * e.speed * 1.12 * dt;
        e.y += ny * e.speed * 1.12 * dt;
      } else if (e.trait.behaviorType === 1) {
        // Zigzag Stalker
        e.phaseAngle += dt * 6;
        const perpX = -ny * Math.sin(e.phaseAngle) * 0.65;
        const perpY = nx * Math.sin(e.phaseAngle) * 0.65;
        e.x += (nx + perpX) * e.speed * dt;
        e.y += (ny + perpY) * e.speed * dt;
      } else if (e.trait.behaviorType === 2) {
        // Shockwave Brute
        e.x += nx * e.speed * 0.78 * dt;
        e.y += ny * e.speed * 0.78 * dt;
        e.actionTimer -= dt;
        if (e.actionTimer <= 0 && dist < 170) {
          e.actionTimer = 3.5;
          this.shockwaves.push({
            x: e.x,
            y: e.y,
            radius: 18,
            maxRadius: 120,
            life: 0.45,
            maxLife: 0.45,
            enemyDamage: e.damage * 0.85,
            color: '#FF9900',
            hitIds: new Set(),
          });
        }
      } else {
        // Orbiting Sniper
        if (dist > 240) {
          e.x += nx * e.speed * dt;
          e.y += ny * e.speed * dt;
        } else {
          e.x += -ny * e.speed * 0.75 * dt;
          e.y += nx * e.speed * 0.75 * dt;
        }
        e.actionTimer -= dt;
        if (e.actionTimer <= 0 && dist < 360) {
          e.actionTimer = 2.8;
          this.enemyBullets.push({
            x: e.x,
            y: e.y,
            vx: nx * 210,
            vy: ny * 210,
            damage: e.damage * 0.8,
            radius: 5,
            life: 2.6,
          });
        }
      }

      if (dist <= e.radius + this.player.radius - 2) {
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
      if (b.life <= 0) {
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
          this.mojoEarned += orb.value;
          this.score += orb.value * 15;
          retroAudio.playPickup();
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
      this.player.buffs.speedTimer = 8;
    } else if (crate.kind === 'shield') {
      this.player.buffs.shieldHits = 3;
      this.player.buffs.shieldTimer = 12;
    } else if (crate.kind === 'fury') {
      this.player.buffs.furyTimer = 10;
    } else if (crate.kind === 'magnet') {
      this.player.buffs.globalMagnetTimer = 4.5;
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
            this.damageEnemy(e, sw.playerDamage);
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

  private damageEnemy(enemy: EnemyEntity, rawAmount: number): void {
    const dmg = Math.max(1, Math.round(rawAmount));
    enemy.hp -= dmg;
    enemy.hitFlash = 0.09;

    if (this.particles.length < 140) {
      this.particles.push({
        kind: 'text',
        x: enemy.x + (Math.random() - 0.5) * 14,
        y: enemy.y - enemy.radius - 4,
        vx: 0,
        vy: -32,
        radius: 0,
        text: String(dmg),
        color: enemy.isBoss ? '#FF9900' : '#FFFFFF',
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
        this.mojoEarned += 25;
        this.score += 1200;
        this.callbacks.onBannerToast('Apex Boss Defeated · +25 Mojo');
      }

      this.defeated += 1;
      this.score += Math.round(enemy.trait.powerRating * (enemy.isBoss ? 8 : 1));
      this.callbacks.onEnemyDefeated(enemy.trait);

      // Drop EXP shard and Mojo bounty
      this.orbs.push({
        x: enemy.x,
        y: enemy.y,
        kind: 'exp',
        value: enemy.isBoss ? 35 : enemy.trait.expValue * 4,
        magnetized: false,
      });

      if (enemy.isBoss || Math.random() < 0.42) {
        this.orbs.push({
          x: enemy.x + 10,
          y: enemy.y - 6,
          kind: 'mojo',
          value: enemy.isBoss ? 12 : enemy.trait.mojoValue,
          magnetized: false,
        });
      }

      const burstCount = this.settings.denseParticles ? (enemy.isBoss ? 26 : 8) : 3;
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
          color: k % 2 === 0 ? '#FF1493' : '#00F0FF',
          life: 0.35,
          maxLife: 0.35,
        });
      }
    }
  }

  private applyPlayerDamage(rawDamage: number): void {
    if (this.player.invulnTimer > 0) return;
    this.player.invulnTimer = 0.42;

    if (this.player.buffs.shieldHits > 0) {
      this.player.buffs.shieldHits -= 1;
      if (this.player.buffs.shieldHits <= 0) {
        this.player.buffs.shieldTimer = 0;
      }
      triggerHaptic(18, this.settings.haptics);
      return;
    }

    const mitigated = Math.max(1, Math.round(rawDamage * (1 - this.player.armorReduction)));
    this.player.hp = Math.max(0, this.player.hp - mitigated);
    retroAudio.playHit();
    triggerHaptic(35, this.settings.haptics);

    if (this.settings.screenShake) {
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
      this.player.expNext = Math.floor(this.player.expNext * 1.34 + 14);
      this.paused = true;
      this.activePointerId = null;
      this.dragVector = { x: 0, y: 0 };
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
      const projDmg = owned ? Math.round(owned.damage * 1.36) : def.baseDamage;
      const projCd = owned
        ? Number(Math.max(0.24, owned.cooldown * 0.88).toFixed(2))
        : def.baseCooldown;
      return {
        id: def.id,
        baseName: def.tiers[0],
        evolvedName: getWeaponDisplayName(def.id, nextLevel),
        nextLevel,
        isMerge: Boolean(owned),
        projectedDamage: projDmg,
        projectedCooldown: projCd,
        description: owned
          ? `Merge duplicate ${getWeaponDisplayName(def.id, owned.level)} into ${getWeaponDisplayName(def.id, nextLevel)}.`
          : def.description,
      };
    });
  }

  private finishRun(): void {
    this.running = false;
    retroAudio.playGameOver();
    const weaponsSummary = this.player.weapons
      .map((w) => `${w.id}:${w.level}`)
      .join(',');

    this.callbacks.onGameOver({
      score: this.score,
      wave: this.wave,
      defeated: this.defeated,
      bossesDefeated: this.bossesDefeated,
      durationSec: Math.max(1, Math.round(this.elapsedSec)),
      mojoEarned: this.mojoEarned,
      weaponsSummary,
    });
  }

  private emitHud(): void {
    this.callbacks.onHudUpdate({
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
            name: `:${this.activeBoss.trait.shortcode}:`,
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
    if (this.shakeTimer > 0 && this.settings.screenShake) {
      shakeX = (Math.random() - 0.5) * this.shakeMagnitude * 2;
      shakeY = (Math.random() - 0.5) * this.shakeMagnitude * 2;
    }

    const camX = this.player.x - viewW / 2 + shakeX;
    const camY = this.player.y - viewH / 2 + shakeY;

    ctx.save();
    ctx.translate(-camX, -camY);

    // Subtle coordinate grid + arena perimeter
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
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

    ctx.strokeStyle = '#FF1493';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, this.arenaWidth, this.arenaHeight);

    // Orbs
    for (const orb of this.orbs) {
      ctx.beginPath();
      if (orb.kind === 'exp') {
        ctx.fillStyle = '#00F0FF';
        ctx.arc(orb.x, orb.y, 4.5, 0, Math.PI * 2);
      } else {
        ctx.fillStyle = '#FF9900';
        ctx.arc(orb.x, orb.y, 6, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    // Power-up crates
    for (const c of this.crates) {
      ctx.save();
      ctx.fillStyle = '#111111';
      ctx.strokeStyle =
        c.kind === 'speed'
          ? '#FF1493'
          : c.kind === 'shield'
            ? '#00F0FF'
            : c.kind === 'fury'
              ? '#FF9900'
              : '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(c.x - 13, c.y - 13, 26, 26, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const code = c.kind === 'speed' ? 'SPD' : c.kind === 'shield' ? 'SHD' : c.kind === 'fury' ? 'FRY' : 'MAG';
      ctx.fillText(code, c.x, c.y + 0.5);
      ctx.restore();
    }

    // Shockwave rings
    for (const sw of this.shockwaves) {
      ctx.save();
      ctx.strokeStyle = sw.color;
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = Math.max(0.1, sw.life / sw.maxLife);
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Player aura & orbiting blades
    const garlic = this.player.weapons.find((w) => w.id === 'garlic_aura');
    if (garlic) {
      const r = garlic.range + garlic.level * 18;
      ctx.save();
      ctx.fillStyle = 'rgba(255, 20, 147, 0.06)';
      ctx.strokeStyle = 'rgba(255, 20, 147, 0.28)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.arc(this.player.x, this.player.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    const blades = this.player.weapons.find((w) => w.id === 'orbiting_blades');
    if (blades) {
      const bladeCount = blades.level + 1;
      const spin = performance.now() / 420;
      const orbitRadius = blades.range + blades.level * 6;
      for (let b = 0; b < bladeCount; b++) {
        const ang = spin + (b * Math.PI * 2) / bladeCount;
        const bx = this.player.x + Math.cos(ang) * orbitRadius;
        const by = this.player.y + Math.sin(ang) * orbitRadius;
        ctx.fillStyle = '#00F0FF';
        ctx.beginPath();
        ctx.arc(bx, by, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Player projectiles
    ctx.fillStyle = '#FF1493';
    for (const p of this.projectiles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Enemy projectiles
    ctx.fillStyle = '#FF9900';
    for (const eb of this.enemyBullets) {
      ctx.beginPath();
      ctx.arc(eb.x, eb.y, eb.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Enemies (Live NIP-30 custom emojis + reserve Nostr sprites)
    for (const e of this.enemies) {
      ctx.save();
      if (e.isBoss) {
        ctx.strokeStyle = '#FF1493';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius + 5, 0, Math.PI * 2);
        ctx.stroke();
      }

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

      if (e.hitFlash > 0 && this.settings.flashingEffects) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      if (e.hp < e.maxHp && !e.isBoss) {
        const bw = e.radius * 1.8;
        const pct = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(e.x - bw / 2, e.y - e.radius - 8, bw, 4);
        ctx.fillStyle = '#FF1493';
        ctx.fillRect(e.x - bw / 2, e.y - e.radius - 8, bw * pct, 4);
      }
      ctx.restore();
    }

    // Player character
    ctx.save();
    if (this.player.buffs.shieldHits > 0) {
      ctx.strokeStyle = '#00F0FF';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(this.player.x, this.player.y, this.player.radius + 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (this.player.buffs.furyTimer > 0) {
      ctx.strokeStyle = '#FF9900';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.player.x, this.player.y, this.player.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = '#111111';
    ctx.strokeStyle = '#FF1493';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(this.player.x, this.player.y, this.player.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const avatar = this.callbacks.getPlayerAvatar();
    if (avatar && avatar.complete && avatar.naturalWidth > 0) {
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

    // Particles & damage numbers
    for (const p of this.particles) {
      ctx.save();
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      if (p.kind === 'text' && p.text) {
        ctx.fillStyle = p.color;
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
      } else if (p.kind === 'arc' && p.x2 !== undefined && p.y2 !== undefined) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        const mx = (p.x + p.x2) / 2 + (Math.random() - 0.5) * 18;
        const my = (p.y + p.y2) / 2 + (Math.random() - 0.5) * 18;
        ctx.lineTo(mx, my);
        ctx.lineTo(p.x2, p.y2);
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
