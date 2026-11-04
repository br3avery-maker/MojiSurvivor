import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, CheckCircle2, AlertTriangle, Send, Code2 } from 'lucide-react';
import { retroAudio } from '../lib/audio';
import type { EmojiCombatTrait } from '../lib/cryptoStats';
import {
  MojiSurvivorEngine,
  type ArenaHudSnapshot,
  type CompletedRunSummary,
  type LevelUpChoice,
} from '../lib/gameEngine';
import type { MojiNostrCoordinator } from '../lib/nostrEngine';
import type { GameSettings, RunReceiptRecord, UpgradeLevels } from '../lib/storage';

interface ArenaViewProps {
  coordinator: MojiNostrCoordinator;
  upgrades: UpgradeLevels;
  settings: GameSettings;
  defaultAvatarUrl: string;
  onEnemyDefeated: (trait: EmojiCombatTrait) => void;
  onRunCompleted: (summary: CompletedRunSummary) => RunReceiptRecord;
  onReceiptUpdated: (updated: RunReceiptRecord) => void;
  onExitToLobby: () => void;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const ArenaView: React.FC<ArenaViewProps> = ({
  coordinator,
  upgrades,
  settings,
  defaultAvatarUrl,
  onEnemyDefeated,
  onRunCompleted,
  onReceiptUpdated,
  onExitToLobby,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<MojiSurvivorEngine | null>(null);
  const defaultAvatarImgRef = useRef<HTMLImageElement | null>(null);

  const [runSeed, setRunSeed] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [bannerToast, setBannerToast] = useState<string | null>(null);
  const [levelChoices, setLevelChoices] = useState<LevelUpChoice[] | null>(null);
  const [completedSummary, setCompletedSummary] = useState<CompletedRunSummary | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<RunReceiptRecord | null>(null);
  const [showRawEvent, setShowRawEvent] = useState(false);
  const [nip55SignedInput, setNip55SignedInput] = useState('');

  const [hud, setHud] = useState<ArenaHudSnapshot>({
    hp: 100,
    maxHp: 100,
    level: 1,
    exp: 0,
    expNext: 20,
    wave: 1,
    waveProgressPct: 0,
    score: 0,
    mojoEarned: 0,
    defeated: 0,
    bossesDefeated: 0,
    elapsedSec: 0,
    weapons: [],
    boss: null,
    buffs: {
      speedRemaining: 0,
      shieldHits: 0,
      shieldRemaining: 0,
      furyRemaining: 0,
    },
  });

  useEffect(() => {
    const img = new Image();
    img.src = defaultAvatarUrl;
    defaultAvatarImgRef.current = img;
  }, [defaultAvatarUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    retroAudio.enabled = settings.sfx;
    retroAudio.unlock();

    let toastTimeout: ReturnType<typeof setTimeout> | null = null;

    const engine = new MojiSurvivorEngine(canvas, upgrades, settings, {
      getEmojiPool: () => coordinator.getPlayableEmojiPool(),
      getImage: (url) => coordinator.imageCache.get(url) ?? coordinator.preloadImage(url),
      getPlayerAvatar: () => {
        const profile = coordinator.profiles.get(coordinator.pubkey);
        if (profile?.picture) {
          const cached = coordinator.imageCache.get(profile.picture);
          if (cached && cached.complete && cached.naturalWidth > 0) return cached;
        }
        return defaultAvatarImgRef.current ?? undefined;
      },
      onHudUpdate: (snapshot) => setHud(snapshot),
      onBannerToast: (msg) => {
        setBannerToast(msg);
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => setBannerToast(null), 1900);
      },
      onLevelUpChoices: (choices) => {
        setLevelChoices(choices);
      },
      onEnemyDefeated: (trait) => {
        onEnemyDefeated(trait);
      },
      onGameOver: (summary) => {
        setCompletedSummary(summary);
        const createdReceipt = onRunCompleted(summary);
        setActiveReceipt(createdReceipt);
      },
    });

    engineRef.current = engine;
    engine.start();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !completedSummary && !levelChoices) {
        setIsPaused((prev) => {
          const next = !prev;
          engine.setPaused(next);
          return next;
        });
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden && engineRef.current && !completedSummary && !levelChoices) {
        setIsPaused(true);
        engineRef.current.setPaused(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (toastTimeout) clearTimeout(toastTimeout);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runSeed]);

  useEffect(() => {
    engineRef.current?.updateSettings(settings);
    retroAudio.enabled = settings.sfx;
  }, [settings]);

  const togglePause = () => {
    if (levelChoices || completedSummary) return;
    const next = !isPaused;
    setIsPaused(next);
    engineRef.current?.setPaused(next);
  };

  const handleRestart = () => {
    setIsPaused(false);
    setLevelChoices(null);
    setCompletedSummary(null);
    setActiveReceipt(null);
    setShowRawEvent(false);
    setNip55SignedInput('');
    setRunSeed((s) => s + 1);
  };

  const handleSignAndPublish = async () => {
    if (!activeReceipt) return;
    const finalRecord = await coordinator.signAndBroadcastReceipt(activeReceipt, (progress) => {
      setActiveReceipt(progress);
      onReceiptUpdated(progress);
    });
    setActiveReceipt(finalRecord);
    onReceiptUpdated(finalRecord);
  };

  const handleNip55BroadcastPaste = async () => {
    if (!activeReceipt || !nip55SignedInput.trim()) return;
    const finalRecord = await coordinator.attachNip55SignedEventAndBroadcast(
      activeReceipt,
      nip55SignedInput.trim(),
      (progress) => {
        setActiveReceipt(progress);
        onReceiptUpdated(progress);
      }
    );
    setActiveReceipt(finalRecord);
    onReceiptUpdated(finalRecord);
  };

  const hpPct = Math.max(0, Math.min(100, (hud.hp / Math.max(1, hud.maxHp)) * 100));
  const expPct = Math.max(0, Math.min(100, (hud.exp / Math.max(1, hud.expNext)) * 100));

  return (
    <div className="relative w-full h-[100dvh] bg-black overflow-hidden select-none">
      {/* Full-bleed edge-to-edge 60 FPS Arena Canvas — Touch & drag anywhere, ZERO virtual joystick */}
      <canvas
        ref={canvasRef}
        className="block w-full h-full touch-none cursor-crosshair"
        aria-label="MojiSurvivor combat arena — drag anywhere or use WASD or arrow keys to move"
      />

      {settings.crtScanlines && (
        <div className="pointer-events-none fixed inset-0 crt-scanlines opacity-35 z-10" />
      )}

      {/* Unobtrusive Top Combat HUD */}
      <div
        className="pointer-events-none absolute top-0 inset-x-0 z-20 px-4 pt-3 pb-2 bg-gradient-to-b from-black/85 via-black/45 to-transparent"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          {/* Left: Hull Integrity & Level EXP */}
          <div className="flex flex-col gap-1.5 min-w-[180px] sm:min-w-[240px]">
            <div className="flex items-center justify-between text-xs font-mono tabular-nums">
              <span className="text-white font-semibold">
                HP {hud.hp}/{hud.maxHp}
              </span>
              <span className="text-[#B8B8B8]">
                {hpPct > 35 ? 'Hull Nominal' : 'Hull Critical'}
              </span>
            </div>
            <div className="h-2 w-full bg-[#1A1A1A] rounded-sm overflow-hidden border border-white/10">
              <div
                className="h-full bg-[#FF1493] transition-transform duration-100 origin-left"
                style={{ transform: `scaleX(${hpPct / 100})` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[#B8B8B8]">
              <span>LVL {hud.level}</span>
              <span>
                EXP {hud.exp}/{hud.expNext}
              </span>
            </div>
            <div className="h-1.5 w-full bg-[#1A1A1A] rounded-sm overflow-hidden">
              <div
                className="h-full bg-[#00F0FF] transition-transform duration-100 origin-left"
                style={{ transform: `scaleX(${expPct / 100})` }}
              />
            </div>
          </div>

          {/* Center: Wave, Score & Mojo */}
          <div className="flex items-center gap-5 sm:gap-8 text-center font-mono tabular-nums">
            <div>
              <div className="text-[11px] text-[#B8B8B8]">Wave</div>
              <div className="text-base sm:text-lg font-semibold text-white">{hud.wave}</div>
            </div>
            <div>
              <div className="text-[11px] text-[#B8B8B8]">Score</div>
              <div className="text-base sm:text-lg font-semibold text-[#FF1493]">
                {hud.score.toLocaleString()}
              </div>
            </div>
            <div className="hidden sm:block">
              <div className="text-[11px] text-[#B8B8B8]">Mojo</div>
              <div className="text-base sm:text-lg font-semibold text-[#FF9900]">
                +{hud.mojoEarned}
              </div>
            </div>
            <div className="hidden md:block">
              <div className="text-[11px] text-[#B8B8B8]">Time</div>
              <div className="text-base sm:text-lg font-semibold text-white">
                {formatDuration(hud.elapsedSec)}
              </div>
            </div>
          </div>

          {/* Right: Compact Pause Control */}
          <div className="pointer-events-auto shrink-0">
            <button
              type="button"
              onClick={togglePause}
              onPointerDown={(e) => e.stopPropagation()}
              className="min-h-[42px] px-3.5 py-2 rounded-lg bg-[#111111]/90 border border-white/15 text-xs font-semibold text-white hover:border-[#FF1493] focus-visible:outline-2 focus-visible:outline-[#FF1493] transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <Pause className="w-4 h-4 text-[#FF1493]" />
              <span>Pause</span>
            </button>
          </div>
        </div>

        {/* Contextual Boss Segmented Bar (Only when Wave-5 Apex Boss is active) */}
        {hud.boss && (
          <div className="max-w-lg mx-auto mt-3 px-3 py-2 rounded-lg bg-[#111111]/90 border border-[#FF1493]/50">
            <div className="flex items-center justify-between text-xs font-mono tabular-nums mb-1">
              <span className="font-semibold text-[#FFB6D9]">Apex Boss {hud.boss.name}</span>
              <span className="text-white">
                {hud.boss.hp} / {hud.boss.maxHp}
              </span>
            </div>
            <div className="h-2.5 w-full bg-black rounded-sm overflow-hidden border border-[#FF1493]/40">
              <div
                className="h-full bg-[#FF1493] transition-transform duration-100 origin-left"
                style={{
                  transform: `scaleX(${Math.max(0, hud.boss.hp / Math.max(1, hud.boss.maxHp))})`,
                }}
              />
            </div>
          </div>
        )}

        {/* Contextual Active Power-Up Countdown Strip (Only when active) */}
        {(hud.buffs.speedRemaining > 0 ||
          hud.buffs.shieldHits > 0 ||
          hud.buffs.furyRemaining > 0) && (
          <div className="max-w-6xl mx-auto mt-2 flex items-center gap-3 text-xs font-mono tabular-nums text-[#FFB6D9]">
            {hud.buffs.speedRemaining > 0 && (
              <span>Speed Boost {Math.ceil(hud.buffs.speedRemaining)}s</span>
            )}
            {hud.buffs.shieldHits > 0 && (
              <span>
                Aegis Shield {hud.buffs.shieldHits} hits ({Math.ceil(hud.buffs.shieldRemaining)}s)
              </span>
            )}
            {hud.buffs.furyRemaining > 0 && (
              <span>Overclock Fury {Math.ceil(hud.buffs.furyRemaining)}s</span>
            )}
          </div>
        )}
      </div>

      {/* Transient Contextual Event Banner */}
      {bannerToast && (
        <div className="pointer-events-none absolute top-24 inset-x-0 z-20 flex justify-center px-4">
          <div className="px-4 py-1.5 rounded-md bg-[#111111]/95 border border-[#FF1493]/60 text-sm font-semibold text-white">
            {bannerToast}
          </div>
        </div>
      )}

      {/* Level-Up & Spell Merging Modal */}
      {levelChoices && (
        <div
          className="absolute inset-0 z-30 bg-black/80 flex items-center justify-center p-4"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="w-full max-w-xl rounded-xl bg-[#111111] border border-white/15 p-6">
            <div className="flex items-baseline justify-between gap-4 mb-2">
              <h2 className="text-2xl font-display font-bold text-white">
                Level {hud.level} Spell Selection
              </h2>
              <span className="text-xs font-mono text-[#FFB6D9]">
                Duplicates merge & evolve
              </span>
            </div>
            <p className="text-sm text-[#B8B8B8] mb-5">
              Choose a new auto-firing spell or merge an equipped spell into its higher-tier form.
            </p>

            <div className="space-y-3">
              {levelChoices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() => {
                    setLevelChoices(null);
                    engineRef.current?.applyLevelUpChoice(choice);
                  }}
                  className="w-full text-left p-4 rounded-lg bg-[#1A1A1A] border border-white/10 hover:border-[#FF1493] focus-visible:outline-2 focus-visible:outline-[#FF1493] transition-colors"
                >
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="font-display text-base font-bold text-white">
                      {choice.evolvedName}
                    </span>
                    <span className="text-xs font-mono tabular-nums text-[#FF1493]">
                      {choice.isMerge
                        ? `Merge → Level ${choice.nextLevel}`
                        : 'New Level 1 Spell'}
                    </span>
                  </div>
                  <p className="text-xs text-[#B8B8B8] mb-2">{choice.description}</p>
                  <div className="text-xs font-mono tabular-nums text-white/80 flex items-center gap-2">
                    <span>Damage {choice.projectedDamage}</span>
                    <span aria-hidden="true">·</span>
                    <span>Cooldown {choice.projectedCooldown}s</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Pause Modal */}
      {isPaused && !levelChoices && !completedSummary && (
        <div
          className="absolute inset-0 z-30 bg-black/80 flex items-center justify-center p-4"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="w-full max-w-sm rounded-xl bg-[#111111] border border-white/15 p-6">
            <h2 className="text-2xl font-display font-bold text-white mb-1">Run Paused</h2>
            <p className="text-sm text-[#B8B8B8] mb-5 font-mono tabular-nums">
              Wave {hud.wave} · {hud.score.toLocaleString()} pts · +{hud.mojoEarned} Mojo
            </p>

            {hud.weapons.length > 0 && (
              <div className="mb-6 pt-3 border-t border-white/10">
                <div className="text-xs text-[#B8B8B8] mb-2">Equipped Spells</div>
                <div className="space-y-1 text-xs font-mono tabular-nums text-white">
                  {hud.weapons.map((w) => (
                    <div key={w.id} className="flex justify-between">
                      <span>{w.name}</span>
                      <span className="text-[#FFB6D9]">Lvl {w.level}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={togglePause}
                className="min-h-[44px] px-4 py-2.5 rounded-lg bg-[#FF1493] text-white text-sm font-semibold hover:bg-[#CD0D72] transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <Play className="w-4 h-4" />
                <span>Resume Run</span>
              </button>
              <button
                type="button"
                onClick={handleRestart}
                className="min-h-[44px] px-4 py-2.5 rounded-lg bg-[#1A1A1A] border border-white/15 text-white text-sm font-semibold hover:border-white/35 transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Restart Run</span>
              </button>
              <button
                type="button"
                onClick={onExitToLobby}
                className="min-h-[44px] px-4 py-2.5 rounded-lg text-[#B8B8B8] hover:text-white text-sm font-medium transition-colors whitespace-nowrap"
              >
                Exit to Lobby
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post-Run Summary & BIP-340 Receipt Broadcast Modal */}
      {completedSummary && activeReceipt && (
        <div
          className="absolute inset-0 z-30 bg-black/85 flex items-center justify-center p-4 overflow-y-auto"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="w-full max-w-lg rounded-xl bg-[#111111] border border-white/15 p-6 my-auto">
            <h2 className="text-2xl font-display font-bold text-white mb-1">Run Complete</h2>
            <p className="text-xs text-[#B8B8B8] font-mono tabular-nums mb-5">
              Receipt d-tag: {activeReceipt.dTag}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-y border-white/10 mb-5 font-mono tabular-nums">
              <div>
                <div className="text-xs text-[#B8B8B8]">Score</div>
                <div className="text-lg font-bold text-[#FF1493]">
                  {completedSummary.score.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-xs text-[#B8B8B8]">Wave</div>
                <div className="text-lg font-bold text-white">{completedSummary.wave}</div>
              </div>
              <div>
                <div className="text-xs text-[#B8B8B8]">Defeated</div>
                <div className="text-lg font-bold text-white">{completedSummary.defeated}</div>
              </div>
              <div>
                <div className="text-xs text-[#B8B8B8]">Mojo Minted</div>
                <div className="text-lg font-bold text-[#FF9900]">
                  +{completedSummary.mojoEarned}
                </div>
              </div>
            </div>

            {/* Cryptographic Receipt State Box */}
            <div className="rounded-lg bg-[#1A1A1A] border border-white/10 p-4 mb-5">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-xs font-semibold text-white">
                  Nostr Relay Receipt (Kind 30078 · BIP-340)
                </span>
                <span className="text-xs font-mono tabular-nums text-[#FFB6D9]">
                  {activeReceipt.status === 'unsigned_local' && 'Saved locally · Not yet signed'}
                  {activeReceipt.status === 'signing' && 'Awaiting signer…'}
                  {activeReceipt.status === 'publishing' && 'Signed · Broadcasting to relays…'}
                  {activeReceipt.status === 'queued_offline' && 'Signed · Queued offline'}
                  {activeReceipt.status === 'confirmed' &&
                    `Confirmed · ${activeReceipt.acceptedRelays.length}/${coordinator.getRelays().length} relays`}
                  {activeReceipt.status === 'failed' && 'Broadcast incomplete'}
                </span>
              </div>

              {activeReceipt.status === 'confirmed' && (
                <div className="flex items-start gap-2 text-xs text-emerald-300 mt-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Accepted via NIP-01 OK by {activeReceipt.acceptedRelays.join(', ')}.
                  </span>
                </div>
              )}

              {activeReceipt.lastError && (
                <div className="flex items-start gap-2 text-xs text-amber-300 mt-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{activeReceipt.lastError}</span>
                </div>
              )}

              {/* NIP-55 Android Amber Intent Helper */}
              {coordinator.signerMode === 'nip55' && activeReceipt.status !== 'confirmed' && (
                <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                  <p className="text-xs text-[#B8B8B8]">
                    Sign with Amber (NIP-55) on Android, or paste the signed event JSON returned by your external signer:
                  </p>
                  <a
                    href={coordinator.buildNip55SignEventUri({
                      ...coordinator.buildUnsignedRunTemplate(activeReceipt),
                      pubkey: coordinator.pubkey,
                    })}
                    className="inline-flex items-center px-3 py-2 rounded-md bg-[#111111] border border-white/20 text-xs font-semibold text-white hover:border-[#FF1493]"
                  >
                    Open in Amber (nostrsigner:)
                  </a>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={nip55SignedInput}
                      onChange={(e) => setNip55SignedInput(e.target.value)}
                      placeholder='Paste signed {"id":...,"sig":...} JSON'
                      className="flex-1 px-3 py-1.5 rounded-md bg-black border border-white/15 text-xs font-mono text-white"
                    />
                    <button
                      type="button"
                      onClick={() => void handleNip55BroadcastPaste()}
                      className="px-3 py-1.5 rounded-md bg-[#FF1493] text-xs font-semibold text-white whitespace-nowrap"
                    >
                      Verify & Send
                    </button>
                  </div>
                </div>
              )}

              {coordinator.signerMode !== 'nip55' && activeReceipt.status !== 'confirmed' && (
                <div className="mt-3">
                  <button
                    type="button"
                    disabled={
                      activeReceipt.status === 'signing' ||
                      activeReceipt.status === 'publishing'
                    }
                    onClick={() => void handleSignAndPublish()}
                    className="w-full min-h-[42px] px-4 py-2 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] disabled:opacity-50 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      {activeReceipt.signedEvent
                        ? 'Retry Relay Broadcast'
                        : 'Sign & Broadcast Run Receipt'}
                    </span>
                  </button>
                </div>
              )}

              {activeReceipt.signedEvent && (
                <div className="mt-3 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setShowRawEvent((v) => !v)}
                    className="text-xs font-mono text-[#B8B8B8] hover:text-white flex items-center gap-1.5"
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    <span>{showRawEvent ? 'Hide Signed Event JSON' : 'Inspect Signed Event JSON'}</span>
                  </button>
                  {showRawEvent && (
                    <pre className="mt-2 p-2.5 rounded bg-black text-[11px] font-mono text-[#B8B8B8] overflow-x-auto max-h-40">
                      {JSON.stringify(activeReceipt.signedEvent, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleRestart}
                className="flex-1 min-h-[44px] px-4 py-2.5 rounded-lg bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors whitespace-nowrap"
              >
                Play Again
              </button>
              <button
                type="button"
                onClick={onExitToLobby}
                className="flex-1 min-h-[44px] px-4 py-2.5 rounded-lg bg-[#1A1A1A] border border-white/15 text-white text-sm font-semibold hover:border-white/35 transition-colors whitespace-nowrap"
              >
                Return to Lobby
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
