import type { NostrEvent } from '@nostrify/nostrify';

export interface UpgradeLevels {
  attack: number;
  defense: number;
  speed: number;
  regen: number;
  magnet: number;
}

export interface CodexKillRecord {
  shortcode: string;
  kills: number;
  firstDefeatedAt: number;
  powerRating: number;
}

export type ReceiptPublishStatus =
  | 'unsigned_local'
  | 'signing'
  | 'queued_offline'
  | 'publishing'
  | 'confirmed'
  | 'failed';

export interface RunReceiptRecord {
  localId: string;
  runHash: string;
  dTag: string;
  pubkey: string;
  score: number;
  wave: number;
  defeated: number;
  bossesDefeated: number;
  durationSec: number;
  mojoEarned: number;
  weaponsSummary: string;
  createdAt: number;
  status: ReceiptPublishStatus;
  signedEvent?: NostrEvent;
  acceptedRelays: string[];
  rejectedRelays: Record<string, string>;
  lastError?: string;
}

export interface GameSettings {
  sfx: boolean;
  haptics: boolean;
  crtScanlines: boolean;
  screenShake: boolean;
  flashingEffects: boolean;
  denseParticles: boolean;
}

export interface PersistedGameState {
  mojoBalance: number;
  highScore: number;
  bestWave: number;
  totalKills: number;
  totalRuns: number;
  upgrades: UpgradeLevels;
  codex: Record<string, CodexKillRecord>;
  localReceipts: RunReceiptRecord[];
  relays: string[];
  settings: GameSettings;
}

export const DEFAULT_RELAYS: string[] = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
];

const STORAGE_KEY = 'mojisurvivor_v2_state';

const DEFAULT_STATE: PersistedGameState = {
  mojoBalance: 0,
  highScore: 0,
  bestWave: 1,
  totalKills: 0,
  totalRuns: 0,
  upgrades: {
    attack: 0,
    defense: 0,
    speed: 0,
    regen: 0,
    magnet: 0,
  },
  codex: {},
  localReceipts: [],
  relays: [...DEFAULT_RELAYS],
  settings: {
    sfx: true,
    haptics: true,
    crtScanlines: false,
    screenShake: true,
    flashingEffects: true,
    denseParticles: true,
  },
};

export function loadPersistedState(): PersistedGameState {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    const androidBridge = (
      window as unknown as {
        AndroidNostrBridge?: { getSavedGameState?: () => string };
      }
    ).AndroidNostrBridge;
    if (!raw && androidBridge?.getSavedGameState) {
      const nativeSaved = androidBridge.getSavedGameState();
      if (nativeSaved && nativeSaved.length > 10) {
        raw = nativeSaved;
      }
    }
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw) as Partial<PersistedGameState>;
    return {
      ...structuredClone(DEFAULT_STATE),
      ...parsed,
      upgrades: { ...DEFAULT_STATE.upgrades, ...(parsed.upgrades ?? {}) },
      settings: { ...DEFAULT_STATE.settings, ...(parsed.settings ?? {}) },
      relays:
        Array.isArray(parsed.relays) && parsed.relays.length > 0
          ? parsed.relays
          : [...DEFAULT_RELAYS],
      localReceipts: Array.isArray(parsed.localReceipts) ? parsed.localReceipts : [],
      codex: parsed.codex && typeof parsed.codex === 'object' ? parsed.codex : {},
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

export function savePersistedState(state: PersistedGameState): void {
  try {
    const serialized = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, serialized);
    const androidBridge = (
      window as unknown as {
        AndroidNostrBridge?: { saveGameState?: (json: string) => void };
      }
    ).AndroidNostrBridge;
    if (androidBridge?.saveGameState) {
      androidBridge.saveGameState(serialized);
    }
  } catch {
    // Storage quota or private mode fallback
  }
}

export function triggerHaptic(ms = 20, enabled = true): void {
  if (!enabled) return;
  try {
    const androidBridge = (
      window as unknown as {
        AndroidNostrBridge?: { vibrate?: (durationMs: number) => void };
      }
    ).AndroidNostrBridge;
    if (androidBridge?.vibrate) {
      androidBridge.vibrate(ms);
      return;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(ms);
    }
  } catch {
    // Ignore unsupported vibration APIs
  }
}

export interface UpgradeSpec {
  key: keyof UpgradeLevels;
  label: string;
  summary: string;
  maxLevel: number;
  baseCost: number;
  costMultiplier: number;
  formatEffect: (level: number) => string;
}

export const UPGRADE_SPECS: readonly UpgradeSpec[] = [
  {
    key: 'attack',
    label: 'Spell Output',
    summary: 'Increases base weapon and evolved spell damage across all slots.',
    maxLevel: 10,
    baseCost: 25,
    costMultiplier: 1.55,
    formatEffect: (lvl) => `+${lvl * 12}% damage`,
  },
  {
    key: 'defense',
    label: 'Hull Plating',
    summary: 'Raises maximum health and reduces incoming contact and sniper damage.',
    maxLevel: 10,
    baseCost: 25,
    costMultiplier: 1.5,
    formatEffect: (lvl) => `+${lvl * 18} max HP · -${Math.min(45, lvl * 4)}% dmg taken`,
  },
  {
    key: 'speed',
    label: 'Vector Thrusters',
    summary: 'Boosts base arena movement velocity for dodging swarmers and boss slams.',
    maxLevel: 8,
    baseCost: 30,
    costMultiplier: 1.6,
    formatEffect: (lvl) => `+${lvl * 7}% move speed`,
  },
  {
    key: 'regen',
    label: 'Nano Repair',
    summary: 'Continuously restores hull integrity every second during active waves.',
    maxLevel: 8,
    baseCost: 35,
    costMultiplier: 1.65,
    formatEffect: (lvl) => `${(lvl * 0.6).toFixed(1)} HP / sec`,
  },
  {
    key: 'magnet',
    label: 'Attractor Field',
    summary: 'Expands automatic pickup radius for EXP shards and Mojo coins.',
    maxLevel: 8,
    baseCost: 20,
    costMultiplier: 1.5,
    formatEffect: (lvl) => `${75 + lvl * 22}px pickup radius`,
  },
];

export function getUpgradeCost(spec: UpgradeSpec, currentLevel: number): number {
  return Math.floor(spec.baseCost * Math.pow(spec.costMultiplier, currentLevel));
}
