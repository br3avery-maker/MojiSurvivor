import type { ArenaPixelBgStyle } from './pixelBackgrounds';

export type RealmId =
  | 'obsidian_foundry'
  | 'circuit_labyrinth'
  | 'starlight_rift'
  | 'citadel_core';

export interface RealmObstacle {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'stone' | 'energy';
  label?: string;
}

export type RealmPadKind = 'magnet_shrine' | 'warp_rune' | 'overcharge_node';

export interface RealmPadSpec {
  id: string;
  kind: RealmPadKind;
  x: number;
  y: number;
  radius: number;
  label: string;
  cooldownSec: number;
  linkPadId?: string;
}

export interface RealmSpec {
  id: RealmId;
  order: number;
  name: string;
  shortName: string;
  tagline: string;
  unlockBossWave: number | null;
  unlockRequirementLabel: string;
  defaultFloorStyle: Exclude<ArenaPixelBgStyle, 'auto'>;
  accentHex: string;
  arenaWidth: number;
  arenaHeight: number;
  mojoMult: number;
  xpMult: number;
  swarmerSpeedMult: number;
  bossCooldownMult: number;
  bossDropMult: number;
  sniperStalkerBias: number;
  riftHazards: boolean;
  obstacles: readonly RealmObstacle[];
  pads: readonly RealmPadSpec[];
}

export const DEFAULT_REALM_ID: RealmId = 'obsidian_foundry';

export const REALM_CATALOG: readonly RealmSpec[] = [
  {
    id: 'obsidian_foundry',
    order: 1,
    name: 'Obsidian Foundry',
    shortName: 'Foundry',
    tagline: 'Open anvil · 4 anchor pylons',
    unlockBossWave: null,
    unlockRequirementLabel: 'Open',
    defaultFloorStyle: 'dungeon_circuit',
    accentHex: '#FF1493',
    arenaWidth: 1800,
    arenaHeight: 1800,
    mojoMult: 1.0,
    xpMult: 1.0,
    swarmerSpeedMult: 1.0,
    bossCooldownMult: 1.0,
    bossDropMult: 1,
    sniperStalkerBias: 0,
    riftHazards: false,
    obstacles: [
      { id: 'pylon_nw', x: 600, y: 600, w: 64, h: 64, kind: 'stone', label: 'PYLON' },
      { id: 'pylon_ne', x: 1136, y: 600, w: 64, h: 64, kind: 'stone', label: 'PYLON' },
      { id: 'pylon_sw', x: 600, y: 1136, w: 64, h: 64, kind: 'stone', label: 'PYLON' },
      { id: 'pylon_se', x: 1136, y: 1136, w: 64, h: 64, kind: 'stone', label: 'PYLON' },
    ],
    pads: [],
  },
  {
    id: 'circuit_labyrinth',
    order: 2,
    name: 'Circuit Labyrinth',
    shortName: 'Labyrinth',
    tagline: 'Corridors · Magnet Shrines · 1.25x',
    unlockBossWave: 5,
    unlockRequirementLabel: 'Defeat W5 Boss',
    defaultFloorStyle: 'dungeon_circuit',
    accentHex: '#00F0FF',
    arenaWidth: 1800,
    arenaHeight: 1800,
    mojoMult: 1.25,
    xpMult: 1.25,
    swarmerSpeedMult: 1.15,
    bossCooldownMult: 1.0,
    bossDropMult: 1,
    sniperStalkerBias: 0,
    riftHazards: false,
    obstacles: [
      // Symmetrical corridor segments leaving wide flanking lanes around center (900, 900)
      { id: 'wall_n', x: 740, y: 560, w: 320, h: 36, kind: 'stone' },
      { id: 'wall_s', x: 740, y: 1204, w: 320, h: 36, kind: 'stone' },
      { id: 'wall_w_top', x: 520, y: 680, w: 36, h: 150, kind: 'stone' },
      { id: 'wall_w_bot', x: 520, y: 970, w: 36, h: 150, kind: 'stone' },
      { id: 'wall_e_top', x: 1244, y: 680, w: 36, h: 150, kind: 'stone' },
      { id: 'wall_e_bot', x: 1244, y: 970, w: 36, h: 150, kind: 'stone' },
    ],
    pads: [
      {
        id: 'shrine_west',
        kind: 'magnet_shrine',
        x: 340,
        y: 900,
        radius: 34,
        label: 'MAGNET SHRINE',
        cooldownSec: 18,
      },
      {
        id: 'shrine_east',
        kind: 'magnet_shrine',
        x: 1460,
        y: 900,
        radius: 34,
        label: 'MAGNET SHRINE',
        cooldownSec: 18,
      },
    ],
  },
  {
    id: 'starlight_rift',
    order: 3,
    name: 'Starlight Rift',
    shortName: 'Starlight',
    tagline: 'Warp Runes · Void Hazards · 1.5x',
    unlockBossWave: 10,
    unlockRequirementLabel: 'Defeat W10 Boss',
    defaultFloorStyle: 'starlight_grid',
    accentHex: '#C084FC',
    arenaWidth: 1800,
    arenaHeight: 1800,
    mojoMult: 1.5,
    xpMult: 1.5,
    swarmerSpeedMult: 1.05,
    bossCooldownMult: 0.94,
    bossDropMult: 1,
    sniperStalkerBias: 0.35,
    riftHazards: true,
    obstacles: [
      // Energy monoliths block movement & standard bullets while piercing Plasma Lance shoots through
      { id: 'mono_nw', x: 640, y: 650, w: 58, h: 58, kind: 'energy', label: 'RIFT' },
      { id: 'mono_ne', x: 1102, y: 650, w: 58, h: 58, kind: 'energy', label: 'RIFT' },
      { id: 'mono_sw', x: 640, y: 1092, w: 58, h: 58, kind: 'energy', label: 'RIFT' },
      { id: 'mono_se', x: 1102, y: 1092, w: 58, h: 58, kind: 'energy', label: 'RIFT' },
    ],
    pads: [
      {
        id: 'warp_nw',
        kind: 'warp_rune',
        x: 420,
        y: 440,
        radius: 34,
        label: 'WARP A',
        cooldownSec: 5.5,
        linkPadId: 'warp_se',
      },
      {
        id: 'warp_se',
        kind: 'warp_rune',
        x: 1380,
        y: 1360,
        radius: 34,
        label: 'WARP B',
        cooldownSec: 5.5,
        linkPadId: 'warp_nw',
      },
    ],
  },
  {
    id: 'citadel_core',
    order: 4,
    name: 'Citadel Core',
    shortName: 'Citadel',
    tagline: 'Overcharge Nodes · 2x Boss Drops · 1.85x',
    unlockBossWave: 15,
    unlockRequirementLabel: 'Defeat W15 Boss',
    defaultFloorStyle: 'citadel_plates',
    accentHex: '#E2E8F0',
    arenaWidth: 1460,
    arenaHeight: 1460,
    mojoMult: 1.85,
    xpMult: 1.75,
    swarmerSpeedMult: 1.1,
    bossCooldownMult: 0.78,
    bossDropMult: 2,
    sniperStalkerBias: 0.2,
    riftHazards: false,
    obstacles: [
      { id: 'baffle_nw', x: 460, y: 460, w: 72, h: 36, kind: 'stone' },
      { id: 'baffle_ne', x: 928, y: 460, w: 72, h: 36, kind: 'stone' },
      { id: 'baffle_sw', x: 460, y: 964, w: 72, h: 36, kind: 'stone' },
      { id: 'baffle_se', x: 928, y: 964, w: 72, h: 36, kind: 'stone' },
    ],
    pads: [
      {
        id: 'overcharge_west',
        kind: 'overcharge_node',
        x: 440,
        y: 730,
        radius: 52,
        label: '+25% HASTE',
        cooldownSec: 0,
      },
      {
        id: 'overcharge_east',
        kind: 'overcharge_node',
        x: 1020,
        y: 730,
        radius: 52,
        label: '+25% HASTE',
        cooldownSec: 0,
      },
    ],
  },
];

const REALM_BY_ID = new Map<RealmId, RealmSpec>(
  REALM_CATALOG.map((r) => [r.id, r])
);

export function normalizeRealmId(raw: unknown): RealmId {
  if (typeof raw === 'string' && REALM_BY_ID.has(raw as RealmId)) {
    return raw as RealmId;
  }
  return DEFAULT_REALM_ID;
}

export function getRealmSpec(id?: RealmId | string): RealmSpec {
  return REALM_BY_ID.get(normalizeRealmId(id)) ?? REALM_CATALOG[0];
}

export function mergeUnlockedRealms(
  a?: readonly string[],
  b?: readonly string[]
): RealmId[] {
  const validSet = new Set<RealmId>([DEFAULT_REALM_ID]);
  for (const list of [a, b]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (REALM_BY_ID.has(item as RealmId)) {
        validSet.add(item as RealmId);
      }
    }
  }
  return REALM_CATALOG.filter((r) => validSet.has(r.id)).map((r) => r.id);
}

/**
 * Returns any realms newly unlocked by defeating an Apex Boss that spawned on `bossWave`.
 * Bosses appear at Wave 5, 10, 15, ...
 */
export function getRealmUnlockedForBossWave(bossWave: number): RealmId | null {
  if (bossWave >= 15) return 'citadel_core';
  if (bossWave >= 10) return 'starlight_rift';
  if (bossWave >= 5) return 'circuit_labyrinth';
  return null;
}

export function getAllRealmsUnlockedUpToBossWave(maxBossWaveCleared: number): RealmId[] {
  const out: RealmId[] = [DEFAULT_REALM_ID];
  if (maxBossWaveCleared >= 5) out.push('circuit_labyrinth');
  if (maxBossWaveCleared >= 10) out.push('starlight_rift');
  if (maxBossWaveCleared >= 15) out.push('citadel_core');
  return out;
}

/**
 * Backfills realm unlocks cleanly for existing players whose historical saves/run receipts
 * demonstrate Wave 5, Wave 10, or Wave 15 Apex Boss clears.
 */
export function evaluateBackfilledUnlockedRealms(opts: {
  existingUnlocked?: readonly string[];
  bestWave: number;
  totalBossKills: number;
  runs?: ReadonlyArray<{ wave: number; bossesDefeated?: number; bosses?: number }>;
}): RealmId[] {
  const unlocked = new Set<RealmId>(mergeUnlockedRealms(opts.existingUnlocked));

  if (Array.isArray(opts.runs)) {
    for (const run of opts.runs) {
      const bossKills = Math.max(run.bossesDefeated ?? 0, run.bosses ?? 0);
      if (bossKills > 0 && run.wave >= 5) unlocked.add('circuit_labyrinth');
      if (bossKills > 0 && run.wave >= 10) unlocked.add('starlight_rift');
      if (bossKills > 0 && run.wave >= 15) unlocked.add('citadel_core');
    }
  }

  // Fallback for pre-realm saves where bestWave advanced past boss milestones with recorded boss kills
  if (opts.totalBossKills >= 1 && opts.bestWave >= 6) {
    unlocked.add('circuit_labyrinth');
  }
  if (opts.totalBossKills >= 2 && opts.bestWave >= 11) {
    unlocked.add('starlight_rift');
  }
  if (opts.totalBossKills >= 3 && opts.bestWave >= 16) {
    unlocked.add('citadel_core');
  }

  return REALM_CATALOG.filter((r) => unlocked.has(r.id)).map((r) => r.id);
}
