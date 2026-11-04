import React, { useEffect, useRef, useState } from 'react';
import {
  Pause,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Send,
  Code2,
  Share2,
  ExternalLink,
  XCircle,
} from 'lucide-react';
import { retroAudio } from '../lib/audio';
import type { EmojiCombatTrait } from '../lib/cryptoStats';
import {
  MojiSurvivorEngine,
  type ArenaHudSnapshot,
  type CompletedRunSummary,
  type LevelUpChoice,
  type RunProgressCheckpointPayload,
} from '../lib/gameEngine';
import type { MojiNostrCoordinator, NostrProfileMeta } from '../lib/nostrEngine';
import {
  savePendingPostRunSession,
  type ActiveRunCheckpoint,
  type GameSettings,
  type RunReceiptRecord,
  type UpgradeLevels,
} from '../lib/storage';
import { ScoreCardPanel } from './ScoreCardPanel';

interface ArenaViewProps {
  coordinator: MojiNostrCoordinator;
  profile?: NostrProfileMeta;
  playerLevel: number;
  playerXp: number;
  playerXpNext: number;
  upgrades: UpgradeLevels;
  settings: GameSettings;
  defaultAvatarUrl: string;
  initialCheckpoint?: ActiveRunCheckpoint | null;
  initialCompletedReceipt?: RunReceiptRecord | null;
  onEnemyDefeated: (trait: EmojiCombatTrait) => void;
  onCheckpointProgress: (payload: RunProgressCheckpointPayload) => void;
  onSaveActiveRunCheckpoint: (checkpoint: ActiveRunCheckpoint | null) => void;
  onRunCompleted: (summary: CompletedRunSummary) => RunReceiptRecord;
  onReceiptUpdated: (updated: RunReceiptRecord) => void;
  onExitToLobby: () => void;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function receiptToCompletedSummary(rec: RunReceiptRecord): CompletedRunSummary {
  return {
    runSessionId: rec.runSessionId || rec.localId,
    score: rec.score,
    wave: rec.wave,
    defeated: rec.defeated,
    bossesDefeated: rec.bossesDefeated,
    durationSec: rec.durationSec,
    mojoEarned: rec.mojoEarned,
    careerXpEarned: rec.careerXpEarned ?? 0,
    weaponsSummary: rec.weaponsSummary,
    strongestSpellName: rec.strongestSpellName || 'Lightning Zap',
    featuredEmoji: rec.featuredEmoji,
  };
}

export const ArenaView: React.FC<ArenaViewProps> = ({
  coordinator,
  profile,
  playerLevel,
  upgrades,
  settings,
  defaultAvatarUrl,
  initialCheckpoint,
  initialCompletedReceipt,
  onEnemyDefeated,
  onCheckpointProgress,
  onSaveActiveRunCheckpoint,
  onRunCompleted,
  onReceiptUpdated,
  onExitToLobby,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<MojiSurvivorEngine | null>(null);
  const defaultAvatarImgRef = useRef<HTMLImageElement | null>(null);
  const gameOverRef = useRef<boolean>(Boolean(initialCompletedReceipt));
  const levelChoicesRef = useRef<LevelUpChoice[] | null>(null);

  const [runSeed, setRunSeed] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [bannerToast, setBannerToast] = useState<string | null>(null);
  const [levelChoices, setLevelChoices] = useState<LevelUpChoice[] | null>(null);
  const [completedSummary, setCompletedSummary] = useState<CompletedRunSummary | null>(() =>
    initialCompletedReceipt ? receiptToCompletedSummary(initialCompletedReceipt) : null
  );
  const [activeReceipt, setActiveReceipt] = useState<RunReceiptRecord | null>(
    () => initialCompletedReceipt ?? null
  );
  const [postRunTab, setPostRunTab] = useState<'receipt' | 'scorecard'>('receipt');
  const [showRawEvent, setShowRawEvent] = useState(false);
  const [nip55SignedInput, setNip55SignedInput] = useState('');

  const [hud, setHud] = useState<ArenaHudSnapshot>({
    hp: initialCheckpoint?.playerHp ?? 100,
    maxHp: initialCheckpoint?.playerMaxHp ?? 100,
    level: initialCheckpoint?.spellLevel ?? 1,
    exp: initialCheckpoint?.spellExp ?? 0,
    expNext: initialCheckpoint?.spellExpNext ?? 20,
    wave: initialCheckpoint?.wave ?? 1,
    waveProgressPct: 0,
    score: initialCheckpoint?.score ?? 0,
    mojoEarned: initialCheckpoint?.mojoEarned ?? 0,
    defeated: initialCheckpoint?.defeated ?? 0,
    bossesDefeated: initialCheckpoint?.bossesDefeated ?? 0,
    elapsedSec: initialCheckpoint?.elapsedSec ?? 0,
    weapons: [],
    boss: null,
    buffs: {
      speedRemaining: 0,
      shieldHits: 0,
      shieldRemaining: 0,
      furyRemaining: 0,
    },
  });

  // Keep post-run receipt synced if parent updates it (e.g. async Amber callback completion)
  useEffect(() => {
    if (
      initialCompletedReceipt &&
      (!activeReceipt || activeReceipt.localId === initialCompletedReceipt.localId)
    ) {
      setActiveReceipt(initialCompletedReceipt);
      if (!completedSummary) {
        setCompletedSummary(receiptToCompletedSummary(initialCompletedReceipt));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCompletedReceipt]);

  useEffect(() => {
    const img = new Image();
    img.src = defaultAvatarUrl;
    defaultAvatarImgRef.current = img;
  }, [defaultAvatarUrl]);

  useEffect(() => {
    // If opened solely to display a recovered post-run receipt after returning from Amber, skip spawning combat
    if (runSeed === 0 && initialCompletedReceipt) {
      gameOverRef.current = true;
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    gameOverRef.current = false;
    levelChoicesRef.current = null;
    retroAudio.enabled = settings.sfx;
    retroAudio.unlock();

    let toastTimeout: ReturnType<typeof setTimeout> | null = null;
    const checkpointToLoad = runSeed === 0 ? initialCheckpoint : null;

    const engine = new MojiSurvivorEngine(
      canvas,
      upgrades,
      settings,
      {
        getEmojiPool: () => coordinator.getPlayableEmojiPool(),
        getImage: (url) => coordinator.imageCache.get(url) ?? coordinator.preloadImage(url),
        getPlayerAvatar: () => {
          const prof = coordinator.profiles.get(coordinator.pubkey);
          if (prof?.picture) {
            const cached = coordinator.imageCache.get(prof.picture);
            if (cached && cached.complete && cached.naturalWidth > 0) return cached;
          }
          return defaultAvatarImgRef.current ?? undefined;
        },
        onHudUpdate: (snapshot) => setHud(snapshot),
        onBannerToast: (msg) => {
          setBannerToast(msg);
          if (toastTimeout) clearTimeout(toastTimeout);
          toastTimeout = setTimeout(() => setBannerToast(null), 1800);
        },
        onLevelUpChoices: (choices) => {
          levelChoicesRef.current = choices;
          setLevelChoices(choices);
          onSaveActiveRunCheckpoint(engine.exportRunCheckpoint());
        },
        onEnemyDefeated: (trait) => {
          onEnemyDefeated(trait);
        },
        onCheckpointProgress: (payload) => {
          onCheckpointProgress(payload);
        },
        onGameOver: (summary) => {
          gameOverRef.current = true;
          onSaveActiveRunCheckpoint(null);
          setCompletedSummary(summary);
          const createdReceipt = onRunCompleted(summary);
          setActiveReceipt(createdReceipt);
          savePendingPostRunSession({
            savedAt: Date.now(),
            receiptLocalId: createdReceipt.localId,
          });
        },
      },
      checkpointToLoad
    );

    engineRef.current = engine;
    engine.start();

    if (checkpointToLoad) {
      setBannerToast(`Resumed Wave ${checkpointToLoad.wave}`);
      toastTimeout = setTimeout(() => setBannerToast(null), 1800);
    }

    const persistActiveCheckpointIfAlive = () => {
      if (!engineRef.current || gameOverRef.current) return;
      engineRef.current.flushCheckpoint(false);
      onSaveActiveRunCheckpoint(engineRef.current.exportRunCheckpoint());
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !gameOverRef.current && !levelChoicesRef.current) {
        setIsPaused((prev) => {
          const next = !prev;
          engine.setPaused(next);
          if (next) {
            onSaveActiveRunCheckpoint(engine.exportRunCheckpoint());
          }
          return next;
        });
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden && engineRef.current && !gameOverRef.current) {
        if (!levelChoicesRef.current) {
          setIsPaused(true);
          engineRef.current.setPaused(true);
        }
        persistActiveCheckpointIfAlive();
      }
    };

    const onPageHide = () => {
      persistActiveCheckpointIfAlive();
    };

    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      if (toastTimeout) clearTimeout(toastTimeout);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
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
    if (next && engineRef.current) {
      onSaveActiveRunCheckpoint(engineRef.current.exportRunCheckpoint());
    }
  };

  const handleRestart = () => {
    onSaveActiveRunCheckpoint(null);
    savePendingPostRunSession(null);
    gameOverRef.current = false;
    levelChoicesRef.current = null;
    setIsPaused(false);
    setLevelChoices(null);
    setCompletedSummary(null);
    setActiveReceipt(null);
    setPostRunTab('receipt');
    setShowRawEvent(false);
    setNip55SignedInput('');
    setRunSeed((s) => s + 1);
  };

  const handlePauseSaveAndExit = () => {
    if (engineRef.current && !gameOverRef.current) {
      engineRef.current.flushCheckpoint(false);
      onSaveActiveRunCheckpoint(engineRef.current.exportRunCheckpoint());
    }
    savePendingPostRunSession(null);
    onExitToLobby();
  };

  const handlePostRunExitToLobby = () => {
    onSaveActiveRunCheckpoint(null);
    savePendingPostRunSession(null);
    onExitToLobby();
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

  const handleLaunchNip55ReceiptSign = () => {
    if (!activeReceipt) return;
    const prepared = coordinator.prepareNip55SignEventRequest({
      purpose: 'sign_run_receipt',
      unsignedTemplate: coordinator.buildUnsignedRunTemplate(activeReceipt),
      targetLocalId: activeReceipt.localId,
    });
    if ('error' in prepared) {
      const updated: RunReceiptRecord = {
        ...activeReceipt,
        status: 'failed',
        lastError: prepared.error,
      };
      setActiveReceipt(updated);
      onReceiptUpdated(updated);
      return;
    }
    savePendingPostRunSession({
      savedAt: Date.now(),
      receiptLocalId: activeReceipt.localId,
    });
    const signingRecord: RunReceiptRecord = {
      ...activeReceipt,
      status: 'signing',
      lastError: undefined,
    };
    setActiveReceipt(signingRecord);
    onReceiptUpdated(signingRecord);
    window.location.href = prepared.uri;
  };

  const handleCancelNip55Pending = () => {
    coordinator.clearPendingNip55Request();
    if (!activeReceipt) return;
    const resetRecord: RunReceiptRecord = {
      ...activeReceipt,
      status: activeReceipt.signedEvent ? 'signed_local' : 'unsigned_local',
      lastError: 'Cancelled pending Amber signature request.',
    };
    setActiveReceipt(resetRecord);
    onReceiptUpdated(resetRecord);
  };

  const handleNip55BroadcastPaste = async () => {
    if (!activeReceipt || !nip55SignedInput.trim()) return;
    const finalRecord = await coordinator.attachNip55SignedEventAndBroadcast(
      activeReceipt,
      nip55SignedInput.trim(),
      undefined,
      (progress) => {
        setActiveReceipt(progress);
        onReceiptUpdated(progress);
      }
    );
    setActiveReceipt(finalRecord);
    onReceiptUpdated(finalRecord);
    if (finalRecord.status === 'confirmed' || finalRecord.status === 'queued_offline') {
      setNip55SignedInput('');
    }
  };

  const pendingNip55 = coordinator.getPendingNip55Request();
  const isAwaitingThisReceiptNip55 =
    pendingNip55?.purpose === 'sign_run_receipt' &&
    pendingNip55.targetLocalId === activeReceipt?.localId;

  const hpPct = Math.max(0, Math.min(100, (hud.hp / Math.max(1, hud.maxHp)) * 100));
  const expPct = Math.max(0, Math.min(100, (hud.exp / Math.max(1, hud.expNext)) * 100));

  return (
    <div className="relative w-full h-[100dvh] bg-black overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        className="block w-full h-full touch-none cursor-crosshair"
        aria-label="MojiSurvivor combat arena — drag anywhere or use WASD or arrow keys to move"
      />

      {settings.crtScanlines && (
        <div className="pointer-events-none fixed inset-0 crt-scanlines opacity-35 z-10" />
      )}

      {/* Compact Top Combat HUD */}
      <div
        className="pointer-events-none absolute top-0 inset-x-0 z-20 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1.5 bg-gradient-to-b from-black/85 via-black/40 to-transparent"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          {/* Left: HP, Per-Run Spell Level & Persistent Player Level */}
          <div className="flex flex-col gap-1 min-w-[152px] sm:min-w-[220px]">
            <div className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
              <span className="text-white font-semibold">
                HP {hud.hp}/{hud.maxHp}
              </span>
              <span className="text-[#B8B8B8]">
                Spell Lv.{hud.level} · <span className="text-[#00F0FF]">Plr Lv.{playerLevel}</span>
              </span>
            </div>
            <div className="h-1.5 w-full bg-[#1A1A1A] rounded-sm overflow-hidden">
              <div
                className="h-full bg-[#FF1493] transition-transform duration-100 origin-left"
                style={{ transform: `scaleX(${hpPct / 100})` }}
              />
            </div>
            <div className="h-1 w-full bg-[#1A1A1A] rounded-sm overflow-hidden">
              <div
                className="h-full bg-[#00FF9D] transition-transform duration-100 origin-left"
                style={{ transform: `scaleX(${expPct / 100})` }}
              />
            </div>
          </div>

          {/* Center: Wave, Score & Banked Mojo */}
          <div className="flex items-center gap-3 sm:gap-6 text-center font-mono tabular-nums">
            <div>
              <div className="text-[10px] text-[#B8B8B8]">Wave</div>
              <div className="text-sm sm:text-base font-semibold text-white">{hud.wave}</div>
            </div>
            <div>
              <div className="text-[10px] text-[#B8B8B8]">Score</div>
              <div className="text-sm sm:text-base font-semibold text-[#FF1493]">
                {hud.score.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[#B8B8B8]">Mojo</div>
              <div className="text-sm sm:text-base font-semibold text-[#FFD700]">
                +{hud.mojoEarned}
              </div>
            </div>
            <div className="hidden sm:block">
              <div className="text-[10px] text-[#B8B8B8]">Time</div>
              <div className="text-sm sm:text-base font-semibold text-white">
                {formatDuration(hud.elapsedSec)}
              </div>
            </div>
          </div>

          {/* Right: Pause */}
          <div className="pointer-events-auto shrink-0">
            <button
              type="button"
              onClick={togglePause}
              onPointerDown={(e) => e.stopPropagation()}
              className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[#111111]/90 border border-white/15 text-xs font-semibold text-white hover:border-[#FF1493] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Pause className="w-3.5 h-3.5 text-[#FF1493]" />
              <span>Pause</span>
            </button>
          </div>
        </div>

        {hud.boss && (
          <div className="max-w-md mx-auto mt-2 px-2.5 py-1.5 rounded-lg bg-[#111111]/90 border border-[#FF2442]/60">
            <div className="flex items-center justify-between text-[11px] font-mono tabular-nums mb-1">
              <span className="font-semibold text-[#FF8FA3] truncate">
                Apex {hud.boss.name}
              </span>
              <span className="text-white shrink-0">
                {hud.boss.hp}/{hud.boss.maxHp}
              </span>
            </div>
            <div className="h-2 w-full bg-black rounded-sm overflow-hidden">
              <div
                className="h-full bg-[#FF2442] transition-transform duration-100 origin-left"
                style={{
                  transform: `scaleX(${Math.max(0, hud.boss.hp / Math.max(1, hud.boss.maxHp))})`,
                }}
              />
            </div>
          </div>
        )}

        {(hud.buffs.speedRemaining > 0 ||
          hud.buffs.shieldHits > 0 ||
          hud.buffs.furyRemaining > 0) && (
          <div className="max-w-5xl mx-auto mt-1.5 flex items-center gap-3 text-[11px] font-mono tabular-nums">
            {hud.buffs.speedRemaining > 0 && (
              <span className="text-[#00F0FF]">
                Speed {Math.ceil(hud.buffs.speedRemaining)}s
              </span>
            )}
            {hud.buffs.shieldHits > 0 && (
              <span className="text-[#00FF9D]">
                Shield {hud.buffs.shieldHits}x ({Math.ceil(hud.buffs.shieldRemaining)}s)
              </span>
            )}
            {hud.buffs.furyRemaining > 0 && (
              <span className="text-[#C084FC]">
                Fury {Math.ceil(hud.buffs.furyRemaining)}s
              </span>
            )}
          </div>
        )}
      </div>

      {bannerToast && (
        <div className="pointer-events-none absolute top-16 inset-x-0 z-20 flex justify-center px-4">
          <div className="px-3 py-1 rounded-md bg-[#111111]/95 border border-[#FF1493]/60 text-xs font-semibold text-white">
            {bannerToast}
          </div>
        </div>
      )}

      {/* Per-Run Spell Level-Up & Merging Modal */}
      {levelChoices && (
        <div
          className="absolute inset-0 z-30 bg-black/80 flex items-center justify-center p-3"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="w-full max-w-md rounded-xl bg-[#111111] border border-white/15 p-4">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <h2 className="text-lg font-display font-bold text-white">
                Spell Level {hud.level} Pick
              </h2>
              <span className="text-[11px] font-mono text-[#FFB6D9]">
                Duplicates merge
              </span>
            </div>
            <p className="text-xs text-[#B8B8B8] mb-3">
              Per-run combat arsenal upgrade · Career Player Lv.{playerLevel}
            </p>

            <div className="space-y-2">
              {levelChoices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() => {
                    levelChoicesRef.current = null;
                    setLevelChoices(null);
                    engineRef.current?.applyLevelUpChoice(choice);
                  }}
                  className="w-full text-left p-3 rounded-lg bg-[#1A1A1A] border border-white/10 hover:border-[#FF1493] transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-sm font-bold text-white">
                      {choice.evolvedName}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-[#FF1493] shrink-0">
                      {choice.isMerge ? `Merge → Lvl ${choice.nextLevel}` : 'New Spell'}
                    </span>
                  </div>
                  <p className="text-xs text-[#B8B8B8] mt-0.5">{choice.description}</p>
                  <div className="text-[11px] font-mono tabular-nums text-white/80 mt-1 flex items-center gap-2">
                    <span>DMG {choice.projectedDamage}</span>
                    <span aria-hidden="true">·</span>
                    <span>CD {choice.projectedCooldown}s</span>
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
          className="absolute inset-0 z-30 bg-black/80 flex items-center justify-center p-3"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="w-full max-w-xs rounded-xl bg-[#111111] border border-white/15 p-4">
            <h2 className="text-lg font-display font-bold text-white">Run Paused</h2>
            <p className="text-xs text-[#B8B8B8] mb-1 font-mono tabular-nums">
              Wave {hud.wave} · {hud.score.toLocaleString()} pts · +{hud.mojoEarned} Mojo
            </p>
            <p className="text-[11px] text-emerald-300/90 mb-3">
              Collected Mojo & Career XP are safely checkpointed.
            </p>

            {hud.weapons.length > 0 && (
              <div className="mb-3.5 pt-2.5 border-t border-white/10 space-y-1 text-xs font-mono tabular-nums text-white">
                {hud.weapons.map((w) => (
                  <div key={w.id} className="flex justify-between">
                    <span>{w.name}</span>
                    <span className="text-[#FFB6D9]">Spell Lv.{w.level}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={togglePause}
                className="min-h-[42px] px-4 py-2 rounded-lg bg-[#FF1493] text-white text-xs font-semibold hover:bg-[#CD0D72] transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Resume Run</span>
              </button>
              <button
                type="button"
                onClick={handleRestart}
                className="min-h-[42px] px-4 py-2 rounded-lg bg-[#1A1A1A] border border-white/15 text-white text-xs font-semibold hover:border-white/35 transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restart Fresh Run</span>
              </button>
              <button
                type="button"
                onClick={handlePauseSaveAndExit}
                className="min-h-[40px] px-4 py-1.5 rounded-lg text-[#B8B8B8] hover:text-white text-xs font-medium transition-colors whitespace-nowrap"
              >
                Save Checkpoint & Exit to Lobby
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post-Run Summary, BIP-340 Receipt & Shareable Arcade Score Card Modal */}
      {completedSummary && activeReceipt && (
        <div
          className="absolute inset-0 z-30 bg-black/85 flex items-center justify-center p-3 overflow-y-auto"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="w-full max-w-lg rounded-xl bg-[#111111] border border-white/15 p-4 my-auto space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-xl font-display font-bold text-white">Run Complete</h2>
                <p className="text-[11px] text-[#B8B8B8] font-mono tabular-nums truncate">
                  {activeReceipt.dTag}
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-[#00F0FF] shrink-0">
                Player Lv.{playerLevel}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2 py-2.5 border-y border-white/10 font-mono tabular-nums text-center">
              <div>
                <div className="text-[10px] text-[#B8B8B8]">Score</div>
                <div className="text-sm font-bold text-[#FF1493]">
                  {completedSummary.score.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[#B8B8B8]">Wave</div>
                <div className="text-sm font-bold text-white">{completedSummary.wave}</div>
              </div>
              <div>
                <div className="text-[10px] text-[#B8B8B8]">Kills</div>
                <div className="text-sm font-bold text-white">{completedSummary.defeated}</div>
              </div>
              <div>
                <div className="text-[10px] text-[#B8B8B8]">Mojo Banked</div>
                <div className="text-sm font-bold text-[#FFD700]">
                  +{completedSummary.mojoEarned}
                </div>
              </div>
            </div>

            {/* Segmented Mode Switch: Relay Receipt vs Shareable Arcade Score Card */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-black border border-white/10">
              <button
                type="button"
                onClick={() => setPostRunTab('receipt')}
                className={`min-h-[36px] px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  postRunTab === 'receipt'
                    ? 'bg-[#FF1493] text-white'
                    : 'text-[#B8B8B8] hover:text-white'
                }`}
              >
                Relay Receipt
              </button>
              <button
                type="button"
                onClick={() => setPostRunTab('scorecard')}
                className={`min-h-[36px] px-3 py-1.5 rounded-md text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 ${
                  postRunTab === 'scorecard'
                    ? 'bg-[#FF1493] text-white'
                    : 'text-[#B8B8B8] hover:text-white'
                }`}
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Score Card PNG</span>
              </button>
            </div>

            {postRunTab === 'receipt' ? (
              <div className="rounded-lg bg-[#1A1A1A] border border-white/10 p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white">Kind 30078 Run Receipt</span>
                  <span className="text-[11px] font-mono tabular-nums text-[#FFB6D9]">
                    {activeReceipt.status === 'unsigned_local' && 'Unsigned local run'}
                    {activeReceipt.status === 'signing' && 'Awaiting signature…'}
                    {activeReceipt.status === 'signed_local' && 'Signed locally · Unconfirmed'}
                    {activeReceipt.status === 'publishing' && 'Broadcasting to relays…'}
                    {activeReceipt.status === 'queued_offline' && 'Signed · Queued offline'}
                    {activeReceipt.status === 'confirmed' &&
                      `Confirmed · ${activeReceipt.acceptedRelays.length}/${coordinator.getRelays().length} relays`}
                    {activeReceipt.status === 'rejected' && 'Rejected'}
                    {activeReceipt.status === 'failed' && 'Broadcast incomplete'}
                  </span>
                </div>

                {activeReceipt.status === 'confirmed' && (
                  <div className="flex items-start gap-1.5 text-xs text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Accepted by {activeReceipt.acceptedRelays.join(', ')}.</span>
                  </div>
                )}

                {activeReceipt.lastError && (
                  <div className="flex items-start gap-1.5 text-xs text-amber-300">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{activeReceipt.lastError}</span>
                  </div>
                )}

                {coordinator.signerMode === 'nip55' && activeReceipt.status !== 'confirmed' && (
                  <div className="pt-2 border-t border-white/10 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleLaunchNip55ReceiptSign}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] text-xs font-semibold text-white inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Sign in Amber (nostrsigner:)</span>
                      </button>

                      {isAwaitingThisReceiptNip55 && (
                        <button
                          type="button"
                          onClick={handleCancelNip55Pending}
                          className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-black border border-white/15 hover:border-white/35 text-xs text-[#B8B8B8] hover:text-white inline-flex items-center gap-1 whitespace-nowrap"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Cancel</span>
                        </button>
                      )}

                      {activeReceipt.signedEvent && (
                        <button
                          type="button"
                          onClick={() => void handleSignAndPublish()}
                          className="min-h-[38px] px-3 py-1.5 rounded-lg bg-black border border-[#00F0FF]/40 text-xs font-semibold text-[#00F0FF] whitespace-nowrap"
                        >
                          Retry Relay Broadcast
                        </button>
                      )}
                    </div>

                    <p className="text-[11px] text-[#B8B8B8]">
                      If Web2App does not auto-return the callback URL, paste Amber&apos;s signed JSON or 128-hex signature below:
                    </p>

                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={nip55SignedInput}
                        onChange={(e) => setNip55SignedInput(e.target.value)}
                        placeholder='Paste signed {"id":...,"sig":...} or hex sig'
                        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md bg-black border border-white/15 text-xs font-mono text-white"
                      />
                      <button
                        type="button"
                        disabled={!nip55SignedInput.trim()}
                        onClick={() => void handleNip55BroadcastPaste()}
                        className="min-h-[36px] px-3 py-1.5 rounded-md bg-[#1A1A1A] border border-white/20 hover:border-[#FF1493] disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap"
                      >
                        Verify & Send
                      </button>
                    </div>
                  </div>
                )}

                {coordinator.signerMode !== 'nip55' && activeReceipt.status !== 'confirmed' && (
                  <button
                    type="button"
                    disabled={
                      activeReceipt.status === 'signing' || activeReceipt.status === 'publishing'
                    }
                    onClick={() => void handleSignAndPublish()}
                    className="w-full min-h-[40px] px-3 py-2 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] disabled:opacity-50 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      {activeReceipt.signedEvent
                        ? 'Retry Relay Broadcast'
                        : 'Sign & Broadcast Receipt'}
                    </span>
                  </button>
                )}

                {activeReceipt.signedEvent && (
                  <div className="pt-2 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => setShowRawEvent((v) => !v)}
                      className="text-[11px] font-mono text-[#B8B8B8] hover:text-white flex items-center gap-1"
                    >
                      <Code2 className="w-3 h-3" />
                      <span>{showRawEvent ? 'Hide Event JSON' : 'Inspect Event JSON'}</span>
                    </button>
                    {showRawEvent && (
                      <pre className="mt-1.5 p-2 rounded bg-black text-[10px] font-mono text-[#B8B8B8] overflow-x-auto max-h-32">
                        {JSON.stringify(activeReceipt.signedEvent, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <ScoreCardPanel
                receipt={activeReceipt}
                profile={profile}
                playerLevel={playerLevel}
                defaultAvatarUrl={defaultAvatarUrl}
                coordinator={coordinator}
                onBeforeExternalIntent={() => {
                  savePendingPostRunSession({
                    savedAt: Date.now(),
                    receiptLocalId: activeReceipt.localId,
                  });
                }}
              />
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleRestart}
                className="min-h-[42px] px-3 py-2 rounded-lg bg-white text-black text-xs font-semibold hover:bg-white/90 transition-colors whitespace-nowrap"
              >
                Play Again
              </button>
              <button
                type="button"
                onClick={handlePostRunExitToLobby}
                className="min-h-[42px] px-3 py-2 rounded-lg bg-[#1A1A1A] border border-white/15 text-white text-xs font-semibold hover:border-white/35 transition-colors whitespace-nowrap"
              >
                Lobby
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
