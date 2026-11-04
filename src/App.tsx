import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, ChevronRight, RotateCcw, AlertTriangle } from 'lucide-react';
import defaultAvatarUrl from './assets/images/moji_survivor_emblem_1793749794956.jpg';
import lobbyBackdropUrl from './assets/images/arena_lobby_backdrop_1793749795243.jpg';
import { ArenaView } from './components/ArenaView';
import { CodexView } from './components/CodexView';
import {
  IdentitySettingsView,
  type AccordionPanel,
} from './components/IdentitySettingsView';
import { LeaderboardView } from './components/LeaderboardView';
import {
  UpgradeLabView,
  type UpgradePurchaseResult,
} from './components/UpgradeLabView';
import { sha256Hex, type EmojiCombatTrait } from './lib/cryptoStats';
import type {
  CompletedRunSummary,
  RunProgressCheckpointPayload,
} from './lib/gameEngine';
import { formatShortNpub, MojiNostrCoordinator } from './lib/nostrEngine';
import {
  applyRunCheckpointToState,
  getUpgradeCost,
  loadActiveRunCheckpoint,
  loadPendingPostRunSession,
  loadPersistedStateWithDiagnostics,
  reconcileProgressionStates,
  saveActiveRunCheckpoint,
  savePendingPostRunSession,
  savePersistedState,
  traitToCodexRecord,
  type ActiveRunCheckpoint,
  type CodexViewMode,
  type GameSettings,
  type PersistedGameState,
  type RunReceiptRecord,
  type UpgradeSpec,
} from './lib/storage';

type Destination = 'lobby' | 'arena' | 'upgrades' | 'codex' | 'leaderboard' | 'identity';

export default function App() {
  const [initialBoot] = useState(() => loadPersistedStateWithDiagnostics());
  const [persisted, setPersisted] = useState<PersistedGameState>(initialBoot.state);
  const persistedRef = useRef<PersistedGameState>(initialBoot.state);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtySaveRef = useRef<boolean>(false);

  const [storageError, setStorageError] = useState<string | null>(initialBoot.error);
  const [globalNotice, setGlobalNotice] = useState<string | null>(null);

  const [coordinator] = useState<MojiNostrCoordinator>(
    () => new MojiNostrCoordinator(initialBoot.state.relays, initialBoot.state.codex)
  );
  const [nostrTick, setNostrTick] = useState(0);
  const [destination, setDestination] = useState<Destination>('lobby');
  const [settingsPanel, setSettingsPanel] = useState<AccordionPanel>('profile');

  const [activeRunCheckpoint, setActiveRunCheckpoint] = useState<ActiveRunCheckpoint | null>(
    () => loadActiveRunCheckpoint()
  );
  const [arenaInitialCheckpoint, setArenaInitialCheckpoint] =
    useState<ActiveRunCheckpoint | null>(null);
  const [arenaInitialReceipt, setArenaInitialReceipt] =
    useState<RunReceiptRecord | null>(null);

  const flushPersistedNow = useCallback((targetState?: PersistedGameState) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    dirtySaveRef.current = false;
    const stateToWrite = targetState ?? persistedRef.current;
    const res = savePersistedState(stateToWrite);
    if (!res.ok) {
      setStorageError(res.error ?? 'Failed to write progression to device storage.');
    } else {
      setStorageError((prev) => (prev ? null : prev));
    }
  }, []);

  /**
   * Synchronous ref-backed state transition helper.
   * Ensures rapid clicks (e.g., Upgrade Lab) always read the exact latest balance/levels
   * while supporting debounced writes for 60 FPS enemy-defeat updates and immediate flushes
   * for checkpoints, purchases, receipts, and app-lifecycle transitions.
   */
  const commitPersisted = useCallback(
    (
      updater: (prev: PersistedGameState) => PersistedGameState,
      options?: { immediate?: boolean }
    ): PersistedGameState => {
      const prev = persistedRef.current;
      const next = updater(prev);
      if (next === prev) return prev;

      const stamped: PersistedGameState = {
        ...next,
        updatedAt: Date.now(),
      };
      persistedRef.current = stamped;
      setPersisted(stamped);

      if (options?.immediate === false) {
        dirtySaveRef.current = true;
        if (!saveTimerRef.current) {
          saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null;
            if (dirtySaveRef.current) {
              flushPersistedNow(persistedRef.current);
            }
          }, 650);
        }
      } else {
        flushPersistedNow(stamped);
      }

      return stamped;
    },
    [flushPersistedNow]
  );

  // Flush any pending batched Codex writes on visibility change, pagehide, or unload
  useEffect(() => {
    const flushIfDirty = () => {
      if (dirtySaveRef.current || saveTimerRef.current) {
        flushPersistedNow(persistedRef.current);
      }
    };
    const onVisibility = () => {
      if (document.hidden) flushIfDirty();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flushIfDirty);
    window.addEventListener('beforeunload', flushIfDirty);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flushIfDirty);
      window.removeEventListener('beforeunload', flushIfDirty);
      flushIfDirty();
    };
  }, [flushPersistedNow]);

  // Navigation helper with Android Web2App hardware Back button history integration
  const navigateTo = useCallback(
    (
      nextDest: Destination,
      opts?: {
        checkpoint?: ActiveRunCheckpoint | null;
        completedReceipt?: RunReceiptRecord | null;
        pushHistory?: boolean;
      }
    ) => {
      if (nextDest === 'arena') {
        setArenaInitialCheckpoint(opts?.checkpoint ?? null);
        setArenaInitialReceipt(opts?.completedReceipt ?? null);
      } else {
        setArenaInitialReceipt(null);
      }
      setDestination(nextDest);

      if (opts?.pushHistory !== false && typeof window !== 'undefined') {
        try {
          window.history.pushState({ mojiDest: nextDest }, '', window.location.pathname);
        } catch {
          // Ignore sandbox history restriction
        }
      }
    },
    []
  );

  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      const targetDest = (e.state as { mojiDest?: Destination } | null)?.mojiDest;
      if (targetDest && targetDest !== 'arena') {
        setDestination(targetDest);
      } else {
        setDestination('lobby');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const unsub = coordinator.subscribe(() => {
      setNostrTick((t) => t + 1);
    });
    void coordinator.syncAll();
    return unsub;
  }, [coordinator]);

  // Background Nostr Progression Sync publisher (checkpointed, local-first)
  const syncProgressSnapshotToRelays = useCallback(
    async (overrideSignedEvent?: import('@nostrify/nostrify').NostrEvent) => {
      if (coordinator.signerMode === 'nip55' && !overrideSignedEvent) {
        commitPersisted((prev) => ({
          ...prev,
          progressSync: {
            ...prev.progressSync,
            dirty: true,
          },
        }));
        return {
          ok: false,
          message:
            'Saved locally. Tap "Sign Save in Amber" in Profile & Cloud Save to publish snapshot.',
        };
      }

      commitPersisted((prev) => ({
        ...prev,
        progressSync: {
          ...prev.progressSync,
          status: overrideSignedEvent ? 'publishing' : 'signing',
          lastError: undefined,
        },
      }));

      const res = await coordinator.signAndPublishProgressSnapshot(
        persistedRef.current,
        overrideSignedEvent
      );

      commitPersisted((prev) => ({
        ...prev,
        ownerPubkey: coordinator.isSignedIn() ? coordinator.pubkey : prev.ownerPubkey,
        progressSync: {
          ...prev.progressSync,
          status: res.status,
          dirty: res.status !== 'confirmed',
          lastSyncedAt:
            res.status === 'confirmed' ? Date.now() : prev.progressSync.lastSyncedAt,
          lastSyncedPubkey:
            res.status === 'confirmed'
              ? coordinator.pubkey
              : prev.progressSync.lastSyncedPubkey,
          lastEventId: res.signedEvent?.id ?? prev.progressSync.lastEventId,
          pendingSignedEvent:
            res.status === 'confirmed' ? undefined : res.signedEvent,
          acceptedRelays: res.acceptedRelays,
          rejectedRelays: res.rejectedRelays,
          lastError: res.error,
        },
      }));

      if (res.status === 'confirmed') {
        return {
          ok: true,
          message: `Synced progression snapshot to ${res.acceptedRelays.length} relay(s).`,
        };
      }
      return {
        ok: false,
        message: res.error || 'Snapshot saved locally; relay sync queued for retry.',
      };
    },
    [commitPersisted, coordinator]
  );

  // Restore & reconcile cross-device Nostr progression snapshot
  const restoreProgressFromRelays = useCallback(
    async (silentIfMissing = false): Promise<{ ok: boolean; message: string }> => {
      const fetchRes = await coordinator.fetchLatestProgressSnapshot(coordinator.pubkey);
      if (!fetchRes.found || !fetchRes.snapshot) {
        return {
          ok: false,
          message:
            fetchRes.error ||
            (silentIfMissing
              ? ''
              : 'No published mojisurvivor:progress:v1 save found on relays for this identity yet.'),
        };
      }

      const incoming = fetchRes.snapshot.state;
      const merged = commitPersisted((prev) => {
        const reconciled = reconcileProgressionStates(prev, incoming);
        return {
          ...reconciled,
          ownerPubkey: coordinator.pubkey,
          progressSync: {
            ...reconciled.progressSync,
            status: 'confirmed',
            dirty: false,
            lastSyncedAt: Date.now(),
            lastSyncedPubkey: coordinator.pubkey,
            lastEventId: fetchRes.snapshot!.eventId,
            lastError: undefined,
          },
        };
      });

      coordinator.hydrateEmojisFromCodex(merged.codex);
      return {
        ok: true,
        message: `Restored & reconciled Nostr save (Player Lv.${merged.playerLevel}, ${merged.mojoBalance.toLocaleString()} Mojo, ${Object.keys(merged.codex).length} Codex unlocks).`,
      };
    },
    [commitPersisted, coordinator]
  );

  // Auto-reconcile cross-device save when signing in to a Nostr account
  const lastReconciledIdentityRef = useRef<string>(
    coordinator.isSignedIn() ? coordinator.pubkey : ''
  );
  useEffect(() => {
    const signedInPubkey = coordinator.isSignedIn() ? coordinator.pubkey : '';
    if (signedInPubkey && signedInPubkey !== lastReconciledIdentityRef.current) {
      lastReconciledIdentityRef.current = signedInPubkey;
      void restoreProgressFromRelays(true).then((res) => {
        if (res.ok && res.message) {
          setGlobalNotice(res.message);
          setTimeout(() => setGlobalNotice(null), 5000);
        }
      });
    } else if (!signedInPubkey) {
      lastReconciledIdentityRef.current = '';
    }
  }, [coordinator, nostrTick, restoreProgressFromRelays]);

  // Handle startup NIP-55 URL callbacks (`?nip55_req=...&nip55_pubkey=...` / `nip55_signed=...` / `event=...` / `signature=...`)
  // and recover interrupted Post-Run modal if present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reqId = params.get('nip55_req') ?? params.get('id') ?? undefined;
    const rawPub = params.get('nip55_pubkey');
    const rawSigned =
      params.get('nip55_signed') ?? params.get('event') ?? params.get('signature');
    const genericResult = params.get('result');

    const pendingNip55 = coordinator.getPendingNip55Request();

    if (rawPub !== null || (pendingNip55?.purpose === 'get_public_key' && genericResult !== null)) {
      const candidatePub = rawPub ?? genericResult ?? '';
      const res = coordinator.connectNip55WithPubkey(candidatePub, reqId);
      setSettingsPanel('profile');
      setDestination('identity');
      setGlobalNotice(
        res.ok
          ? 'Connected Android Amber (NIP-55) public key.'
          : res.error ?? 'Amber sign-in cancelled.'
      );
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    const signedCandidate =
      rawSigned ??
      (pendingNip55 && pendingNip55.purpose !== 'get_public_key' ? genericResult : null);

    if (signedCandidate !== null) {
      window.history.replaceState({}, '', window.location.pathname);

      if (!pendingNip55 || pendingNip55.purpose === 'get_public_key') {
        setGlobalNotice('Ignored unexpected NIP-55 callback with no matching pending request.');
        return;
      }

      if (pendingNip55.purpose === 'sign_run_receipt') {
        const targetReceipt = persistedRef.current.localReceipts.find(
          (r) => r.localId === pendingNip55.targetLocalId
        );
        if (!targetReceipt) {
          coordinator.clearPendingNip55Request();
          setGlobalNotice('Pending run receipt was not found.');
          return;
        }

        // Restore the Run Complete view immediately while verifying & broadcasting
        const postRunSession = loadPendingPostRunSession();
        if (postRunSession?.receiptLocalId === targetReceipt.localId) {
          setArenaInitialCheckpoint(null);
          setArenaInitialReceipt(targetReceipt);
          setDestination('arena');
        }

        void coordinator
          .attachNip55SignedEventAndBroadcast(
            targetReceipt,
            signedCandidate,
            reqId,
            (progress) => {
              commitPersisted((prev) => ({
                ...prev,
                localReceipts: prev.localReceipts.map((r) =>
                  r.localId === progress.localId ? progress : r
                ),
              }));
              setArenaInitialReceipt((curr) =>
                curr?.localId === progress.localId ? progress : curr
              );
            }
          )
          .then((finalRec) => {
            commitPersisted((prev) => ({
              ...prev,
              localReceipts: prev.localReceipts.map((r) =>
                r.localId === finalRec.localId ? finalRec : r
              ),
            }));
            setArenaInitialReceipt((curr) =>
              curr?.localId === finalRec.localId ? finalRec : curr
            );
          });
        return;
      }

      if (pendingNip55.purpose === 'sign_progress_sync') {
        const resolved = coordinator.resolvePendingNip55SignResponse({
          rawResponse: signedCandidate,
          requestId: reqId,
        });
        setSettingsPanel('profile');
        setDestination('identity');
        if (!resolved.ok) {
          setGlobalNotice(resolved.error);
          return;
        }
        void syncProgressSnapshotToRelays(resolved.signedEvent).then((syncRes) => {
          setGlobalNotice(syncRes.message);
        });
        return;
      }

      if (pendingNip55.purpose === 'sign_note_share') {
        const resolved = coordinator.resolvePendingNip55SignResponse({
          rawResponse: signedCandidate,
          requestId: reqId,
        });
        const targetReceipt = persistedRef.current.localReceipts.find(
          (r) => r.localId === pendingNip55.targetLocalId
        );
        if (targetReceipt) {
          setArenaInitialReceipt(targetReceipt);
          setDestination('arena');
        }
        if (!resolved.ok) {
          setGlobalNotice(resolved.error);
          return;
        }
        if (targetReceipt) {
          void coordinator
            .signAndPublishScoreNote(
              resolved.signedEvent.content,
              targetReceipt,
              resolved.signedEvent
            )
            .then((noteRes) => {
              setGlobalNotice(
                noteRes.ok
                  ? `Posted Amber-signed score note to ${noteRes.acceptedRelays.length} relay(s).`
                  : noteRes.error ?? 'Failed to broadcast score note.'
              );
            });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retry queued offline signed receipts & progression snapshots on startup and reconnect
  const flushOfflineQueues = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    const current = persistedRef.current;
    const queuedReceipts = current.localReceipts.filter(
      (r) => r.status === 'queued_offline' && r.signedEvent
    );
    for (const rec of queuedReceipts) {
      void coordinator.signAndBroadcastReceipt(rec).then((updated) => {
        commitPersisted((prev) => ({
          ...prev,
          localReceipts: prev.localReceipts.map((r) =>
            r.localId === updated.localId ? updated : r
          ),
        }));
      });
    }

    if (
      current.progressSync.enabled &&
      current.progressSync.status === 'queued_offline' &&
      current.progressSync.pendingSignedEvent
    ) {
      void syncProgressSnapshotToRelays(current.progressSync.pendingSignedEvent);
    }
  }, [commitPersisted, coordinator, syncProgressSnapshotToRelays]);

  useEffect(() => {
    flushOfflineQueues();
    window.addEventListener('online', flushOfflineQueues);
    return () => window.removeEventListener('online', flushOfflineQueues);
  }, [flushOfflineQueues]);

  const openAccountPanel = useCallback(
    (panel: AccordionPanel = 'profile') => {
      setSettingsPanel(panel);
      navigateTo('identity');
    },
    [navigateTo]
  );

  const handleSaveActiveRunCheckpoint = useCallback(
    (checkpoint: ActiveRunCheckpoint | null) => {
      saveActiveRunCheckpoint(checkpoint);
      setActiveRunCheckpoint(checkpoint);
    },
    []
  );

  const handleEnemyDefeated = useCallback(
    (trait: EmojiCombatTrait) => {
      const now = Date.now();
      commitPersisted(
        (prev) => {
          const prevEntry = prev.codex[trait.emojiKey];
          const updatedRecord = traitToCodexRecord(
            trait,
            (prevEntry?.kills ?? 0) + 1,
            prevEntry?.firstDefeatedAt ?? now,
            now
          );
          return {
            ...prev,
            revision: prev.revision + 1,
            codex: {
              ...prev.codex,
              [trait.emojiKey]: updatedRecord,
            },
            progressSync: prev.progressSync.enabled
              ? { ...prev.progressSync, dirty: true }
              : prev.progressSync,
          };
        },
        { immediate: false }
      );
    },
    [commitPersisted]
  );

  const handleCheckpointProgress = useCallback(
    (payload: RunProgressCheckpointPayload) => {
      commitPersisted((prev) => applyRunCheckpointToState(prev, payload), {
        immediate: true,
      });
    },
    [commitPersisted]
  );

  const handleRunCompleted = useCallback(
    (summary: CompletedRunSummary): RunReceiptRecord => {
      const createdAt = Math.floor(Date.now() / 1000);
      const runHash = sha256Hex(
        `${coordinator.pubkey}:${summary.runSessionId}:${summary.score}:${summary.wave}:${summary.defeated}:${createdAt}`
      ).slice(0, 12);
      const dTag = `mojisurvivor:run:${createdAt}:${runHash}`;

      const newReceipt: RunReceiptRecord = {
        localId: `${createdAt}-${runHash}`,
        runSessionId: summary.runSessionId,
        runHash,
        dTag,
        pubkey: coordinator.pubkey,
        score: summary.score,
        wave: summary.wave,
        defeated: summary.defeated,
        bossesDefeated: summary.bossesDefeated,
        durationSec: summary.durationSec,
        mojoEarned: summary.mojoEarned,
        careerXpEarned: summary.careerXpEarned,
        weaponsSummary: summary.weaponsSummary,
        strongestSpellName: summary.strongestSpellName,
        featuredEmoji: summary.featuredEmoji,
        createdAt,
        status: 'unsigned_local',
        acceptedRelays: [],
        rejectedRelays: {},
      };

      const nextState = commitPersisted(
        (prev) => {
          const banked = applyRunCheckpointToState(prev, {
            runSessionId: summary.runSessionId,
            mojoEarnedTotal: summary.mojoEarned,
            careerXpEarnedTotal: summary.careerXpEarned,
            killsTotal: summary.defeated,
            waveReached: summary.wave,
            scoreReached: summary.score,
            completed: true,
          });

          const filteredReceipts = banked.localReceipts.filter(
            (r) => !summary.runSessionId || r.runSessionId !== summary.runSessionId
          );

          return {
            ...banked,
            revision: banked.revision + 1,
            localReceipts: [newReceipt, ...filteredReceipts].slice(0, 50),
          };
        },
        { immediate: true }
      );

      handleSaveActiveRunCheckpoint(null);

      if (nextState.progressSync.enabled && coordinator.signerMode !== 'nip55') {
        void syncProgressSnapshotToRelays();
      }

      return newReceipt;
    },
    [commitPersisted, coordinator, handleSaveActiveRunCheckpoint, syncProgressSnapshotToRelays]
  );

  const handleReceiptUpdated = useCallback(
    (updated: RunReceiptRecord) => {
      commitPersisted(
        (prev) => ({
          ...prev,
          localReceipts: prev.localReceipts.map((r) =>
            r.localId === updated.localId ? updated : r
          ),
        }),
        { immediate: true }
      );
    },
    [commitPersisted]
  );

  const handleDeleteReceipt = useCallback(
    async (opts: {
      localId?: string;
      eventId?: string;
      dTag?: string;
      pubkey: string;
      wasBroadcast: boolean;
    }) => {
      await coordinator.deleteRunReceipt({
        eventId: opts.eventId,
        dTag: opts.dTag,
        pubkey: opts.pubkey,
        broadcastNip09: opts.wasBroadcast,
      });

      commitPersisted(
        (prev) => {
          const remaining = prev.localReceipts.filter((r) => {
            if (opts.localId && r.localId === opts.localId) return false;
            if (opts.eventId && r.signedEvent?.id === opts.eventId) return false;
            if (opts.dTag && r.dTag === opts.dTag) return false;
            return true;
          });

          const remainingRelayRuns = coordinator.getVerifiedRunsForPubkey(coordinator.pubkey);
          const maxLocalScore = remaining.reduce((m, r) => Math.max(m, r.score), 0);
          const maxRelayScore = remainingRelayRuns.reduce((m, r) => Math.max(m, r.score), 0);
          const maxLocalWave = remaining.reduce((m, r) => Math.max(m, r.wave), 1);
          const maxRelayWave = remainingRelayRuns.reduce((m, r) => Math.max(m, r.wave), 1);

          return {
            ...prev,
            revision: prev.revision + 1,
            highScore: Math.max(maxLocalScore, maxRelayScore),
            bestWave:
              remaining.length === 0 && remainingRelayRuns.length === 0
                ? 1
                : Math.max(maxLocalWave, maxRelayWave),
            localReceipts: remaining,
          };
        },
        { immediate: true }
      );
    },
    [commitPersisted, coordinator]
  );

  const handlePurchaseUpgrade = useCallback(
    (spec: UpgradeSpec): UpgradePurchaseResult => {
      const current = persistedRef.current;
      const currentLevel = current.upgrades[spec.key];

      if (currentLevel >= spec.maxLevel) {
        return {
          ok: false,
          newLevel: currentLevel,
          remainingMojo: current.mojoBalance,
          error: `${spec.label} is already at maximum level (${spec.maxLevel}).`,
        };
      }

      const cost = getUpgradeCost(spec, currentLevel);
      if (current.mojoBalance < cost) {
        return {
          ok: false,
          newLevel: currentLevel,
          remainingMojo: current.mojoBalance,
          error: `Need ${cost.toLocaleString()} Mojo for ${spec.label} (you have ${current.mojoBalance.toLocaleString()} Mojo).`,
        };
      }

      const newLevel = currentLevel + 1;
      const remainingMojo = current.mojoBalance - cost;

      const updatedState = commitPersisted(
        (prev) => ({
          ...prev,
          revision: prev.revision + 1,
          mojoBalance: Math.max(0, prev.mojoBalance - cost),
          upgrades: {
            ...prev.upgrades,
            [spec.key]: prev.upgrades[spec.key] + 1,
          },
          progressSync: prev.progressSync.enabled
            ? { ...prev.progressSync, dirty: true }
            : prev.progressSync,
        }),
        { immediate: true }
      );

      if (updatedState.progressSync.enabled && coordinator.signerMode !== 'nip55') {
        void syncProgressSnapshotToRelays();
      }

      return {
        ok: true,
        newLevel,
        remainingMojo,
      };
    },
    [commitPersisted, coordinator.signerMode, syncProgressSnapshotToRelays]
  );

  const handleToggleProgressSync = useCallback(
    (enabled: boolean) => {
      commitPersisted(
        (prev) => ({
          ...prev,
          progressSync: {
            ...prev.progressSync,
            enabled,
            dirty: enabled ? true : prev.progressSync.dirty,
          },
        }),
        { immediate: true }
      );
      if (enabled && coordinator.signerMode !== 'nip55') {
        void syncProgressSnapshotToRelays();
      }
    },
    [commitPersisted, coordinator.signerMode, syncProgressSnapshotToRelays]
  );

  const handlePrepareNip55ProgressSync = useCallback(() => {
    const template = coordinator.buildUnsignedProgressTemplate(persistedRef.current);
    const prepared = coordinator.prepareNip55SignEventRequest({
      purpose: 'sign_progress_sync',
      unsignedTemplate: template,
    });
    if ('error' in prepared) {
      return { ok: false, error: prepared.error };
    }
    return { ok: true, uri: prepared.uri };
  }, [coordinator]);

  const handleApplyNip55ProgressSignature = useCallback(
    async (raw: string): Promise<{ ok: boolean; message: string }> => {
      const resolved = coordinator.resolvePendingNip55SignResponse({
        rawResponse: raw,
      });
      if (!resolved.ok) {
        return { ok: false, message: resolved.error };
      }
      return syncProgressSnapshotToRelays(resolved.signedEvent);
    },
    [coordinator, syncProgressSnapshotToRelays]
  );

  const handleUpdateRelays = useCallback(
    (relays: string[]) => {
      coordinator.setRelays(relays);
      commitPersisted((prev) => ({ ...prev, relays }), { immediate: true });
    },
    [commitPersisted, coordinator]
  );

  const handleUpdateSettings = useCallback(
    (settings: GameSettings) => {
      commitPersisted((prev) => ({ ...prev, settings }), { immediate: true });
    },
    [commitPersisted]
  );

  const handleChangeCodexViewMode = useCallback(
    (codexViewMode: CodexViewMode) => {
      commitPersisted(
        (prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            codexViewMode,
          },
        }),
        { immediate: true }
      );
    },
    [commitPersisted]
  );

  // Merge offline-persisted Codex unlocks into coordinator's emoji map so Arena & Codex always include them
  useEffect(() => {
    coordinator.hydrateEmojisFromCodex(persisted.codex);
  }, [coordinator, persisted.codex]);

  const allEmojis = useMemo(
    () => Array.from(coordinator.emojis.values()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coordinator, nostrTick, persisted.codex]
  );

  const liveNip30Count = useMemo(
    () => allEmojis.filter((e) => e.source === 'nip30').length,
    [allEmojis]
  );

  const sortedLeaderboard = useMemo(
    () => coordinator.getSortedLeaderboard(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coordinator, nostrTick]
  );

  const myRelayRuns = useMemo(
    () => coordinator.getVerifiedRunsForPubkey(coordinator.pubkey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coordinator, nostrTick]
  );

  const activeProfile = coordinator.profiles.get(coordinator.pubkey);
  const discoveredCount = Object.values(persisted.codex).filter((r) => r.kills > 0).length;
  const totalKnownCodexCount = useMemo(() => {
    const keys = new Set<string>(allEmojis.map((e) => e.emojiKey));
    for (const k of Object.keys(persisted.codex)) keys.add(k);
    return keys.size;
  }, [allEmojis, persisted.codex]);
  const isSignedIn = coordinator.isSignedIn();

  if (destination === 'arena') {
    return (
      <ArenaView
        coordinator={coordinator}
        profile={activeProfile}
        playerLevel={persisted.playerLevel}
        playerXp={persisted.playerXp}
        playerXpNext={persisted.playerXpNext}
        upgrades={persisted.upgrades}
        settings={persisted.settings}
        defaultAvatarUrl={defaultAvatarUrl}
        initialCheckpoint={arenaInitialCheckpoint}
        initialCompletedReceipt={arenaInitialReceipt}
        onEnemyDefeated={handleEnemyDefeated}
        onCheckpointProgress={handleCheckpointProgress}
        onSaveActiveRunCheckpoint={handleSaveActiveRunCheckpoint}
        onRunCompleted={handleRunCompleted}
        onReceiptUpdated={handleReceiptUpdated}
        onExitToLobby={() => {
          savePendingPostRunSession(null);
          navigateTo('lobby', { pushHistory: false });
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {persisted.settings.crtScanlines && (
        <div className="pointer-events-none fixed inset-0 crt-scanlines opacity-30 z-40" />
      )}

      {/* Compact Sticky Top Chrome */}
      <div className="sticky top-0 z-30 bg-black border-b border-white/10">
        <header className="max-w-5xl mx-auto flex items-center justify-between gap-6 px-4 py-2">
          <button
            type="button"
            onClick={() => navigateTo('lobby')}
            className="text-base font-display font-bold tracking-tight text-white hover:text-[#FF1493] transition-colors whitespace-nowrap shrink-0"
          >
            MojiSurvivor
          </button>

          <nav
            aria-label="Primary game navigation"
            className="hidden md:flex items-center gap-6 text-xs font-medium text-[#B8B8B8]"
          >
            {(
              [
                ['lobby', 'Lobby'],
                ['upgrades', 'Upgrades'],
                ['codex', 'Codex'],
                ['leaderboard', 'Leaderboard'],
                ['identity', 'Profile'],
              ] as const
            ).map(([dest, label]) => (
              <button
                key={dest}
                type="button"
                onClick={() =>
                  dest === 'identity' ? openAccountPanel('profile') : navigateTo(dest)
                }
                className={`py-1.5 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  destination === dest
                    ? 'text-white border-[#FF1493]'
                    : 'border-transparent hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                navigateTo('arena', { checkpoint: activeRunCheckpoint ?? null })
              }
              className="min-h-[38px] px-3.5 py-1.5 rounded-md bg-[#FF1493] hover:bg-[#CD0D72] text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0"
            >
              {activeRunCheckpoint ? `Resume W${activeRunCheckpoint.wave}` : 'Start Run'}
            </button>
          </div>
        </header>

        <nav
          aria-label="Mobile navigation"
          className="md:hidden grid grid-cols-5 border-t border-white/10 bg-[#0A0A0A] px-2"
        >
          {(
            [
              ['lobby', 'Lobby'],
              ['upgrades', 'Upgrades'],
              ['codex', 'Codex'],
              ['leaderboard', 'Ranks'],
              ['identity', 'Profile'],
            ] as const
          ).map(([dest, label]) => (
            <button
              key={dest}
              type="button"
              onClick={() =>
                dest === 'identity' ? openAccountPanel('profile') : navigateTo(dest)
              }
              className={`min-h-[40px] text-center text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                destination === dest
                  ? 'text-white border-[#FF1493] font-semibold'
                  : 'text-[#B8B8B8] border-transparent hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {(storageError || globalNotice) && (
        <div className="max-w-5xl w-full mx-auto px-4 pt-3 space-y-2">
          {storageError && (
            <div className="px-3 py-2 rounded-lg bg-[#111111] border border-amber-500/40 text-xs text-amber-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{storageError}</span>
            </div>
          )}
          {globalNotice && (
            <div className="px-3 py-2 rounded-lg bg-[#111111] border border-[#00F0FF]/40 text-xs text-[#00F0FF] flex items-center justify-between gap-2">
              <span>{globalNotice}</span>
              <button
                type="button"
                onClick={() => setGlobalNotice(null)}
                className="text-white/75 hover:text-white text-xs shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Content Container */}
      <main className="flex-1 pb-16">
        {destination === 'lobby' && (
          <section className="max-w-5xl mx-auto px-4 py-3.5 space-y-3">
            {/* Hero Arena Card */}
            <div className="relative rounded-xl overflow-hidden border border-white/15 bg-[#111111]">
              <img
                src={lobbyBackdropUrl}
                alt="Obsidian tactical arena backdrop"
                className="absolute inset-0 w-full h-full object-cover opacity-35"
              />
              <div className="relative bg-gradient-to-r from-black/90 via-black/80 to-black/70 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3.5">
                <div className="space-y-2 max-w-xl">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-full bg-black border border-[#FF1493] overflow-hidden shrink-0">
                      <img
                        src={activeProfile?.picture || defaultAvatarUrl}
                        alt="Active player persona"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = defaultAvatarUrl;
                        }}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">
                        {isSignedIn
                          ? activeProfile?.displayName ||
                            activeProfile?.name ||
                            formatShortNpub(coordinator.pubkey)
                          : 'Guest Player'}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono text-[#B8B8B8]">
                        <span className="text-[#00F0FF]">
                          Player Lv.{persisted.playerLevel}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {isSignedIn ? coordinator.signerMode.toUpperCase() : 'Not signed in'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() => openAccountPanel('profile')}
                          className="text-[#FFB6D9] hover:text-white underline whitespace-nowrap"
                        >
                          {isSignedIn ? 'Manage Profile & Cloud Save' : 'Sign In'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h1
                      className="text-xl sm:text-2xl font-display font-bold text-white tracking-tight leading-snug"
                      style={{ textWrap: 'balance' }}
                    >
                      NIP-30 Custom Emoji Survivor Arena
                    </h1>
                    <p className="text-xs text-[#B8B8B8] mt-0.5 leading-relaxed">
                      Drag anywhere or use WASD to dodge live <code className="font-mono text-white">kind:30030</code> emojis, merge duplicate spells, and broadcast BIP-340 receipts.
                    </p>
                  </div>
                </div>

                <div className="flex sm:flex-row flex-col gap-2 shrink-0">
                  {activeRunCheckpoint ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          navigateTo('arena', { checkpoint: activeRunCheckpoint })
                        }
                        className="min-h-[44px] px-5 py-2.5 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] text-sm font-semibold text-white transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>
                          Resume Wave {activeRunCheckpoint.wave} ({activeRunCheckpoint.score.toLocaleString()} pts)
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleSaveActiveRunCheckpoint(null);
                          navigateTo('arena', { checkpoint: null });
                        }}
                        className="min-h-[44px] px-4 py-2.5 rounded-lg bg-black/80 border border-white/15 hover:border-white/35 text-xs font-semibold text-white transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>New Run</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => navigateTo('arena', { checkpoint: null })}
                        className="min-h-[44px] px-5 py-2.5 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] text-sm font-semibold text-white transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>Enter Battle Arena</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => navigateTo('upgrades')}
                        className="min-h-[44px] px-4 py-2.5 rounded-lg bg-black/80 border border-white/15 hover:border-white/35 text-xs font-semibold text-white transition-colors whitespace-nowrap"
                      >
                        Upgrades ({persisted.mojoBalance.toLocaleString()} Mojo)
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* 5-Metric Progression Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 py-2.5 px-3.5 rounded-xl bg-[#111111] border border-white/10 font-mono tabular-nums">
              <div>
                <div className="text-xs text-[#B8B8B8] truncate">Player Level</div>
                <div className="text-sm sm:text-lg font-bold text-[#00F0FF]">
                  Lv.{persisted.playerLevel}
                  <span className="text-xs font-normal text-[#B8B8B8]">
                    {' '}({persisted.playerXp}/{persisted.playerXpNext})
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xs text-[#B8B8B8] truncate">Best Score</div>
                <div className="text-sm sm:text-lg font-bold text-white">
                  {persisted.highScore.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-xs text-[#B8B8B8] truncate">Best Wave</div>
                <div className="text-sm sm:text-lg font-bold text-white">
                  W{persisted.bestWave}
                </div>
              </div>
              <div>
                <div className="text-xs text-[#B8B8B8] truncate">Mojo Banked</div>
                <div className="text-sm sm:text-lg font-bold text-[#FFD700]">
                  {persisted.mojoBalance.toLocaleString()}
                </div>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <div className="text-xs text-[#B8B8B8] truncate">Emoji Pool</div>
                <div className="text-sm sm:text-lg font-bold text-white">
                  {totalKnownCodexCount}
                  <span className="text-xs font-normal text-[#B8B8B8]">
                    {' '}({liveNip30Count} live)
                  </span>
                </div>
              </div>
            </div>

            {/* Destination Rows */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => navigateTo('codex')}
                className="text-left px-3.5 py-3 rounded-xl bg-[#111111] border border-white/10 hover:border-[#FF1493] transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-display font-bold text-white truncate">
                    Emoji Codex · {discoveredCount}/{totalKnownCodexCount}
                  </div>
                  <p className="text-xs text-[#B8B8B8] truncate mt-0.5">
                    Gallery & Stats views · Offline unlocks preserved
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-[#B8B8B8] shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => navigateTo('leaderboard')}
                className="text-left px-3.5 py-3 rounded-xl bg-[#111111] border border-white/10 hover:border-[#FF1493] transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-display font-bold text-white truncate">
                    Leaderboard · {sortedLeaderboard.length} verified
                  </div>
                  <p className="text-xs text-[#B8B8B8] truncate mt-0.5">
                    BIP-340 relay receipts & shareable PNG score cards
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-[#B8B8B8] shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => openAccountPanel('profile')}
                className="text-left px-3.5 py-3 rounded-xl bg-[#111111] border border-white/10 hover:border-[#FF1493] transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-display font-bold text-white truncate">
                    Profile, Cloud Save & Settings
                  </div>
                  <p className="text-xs text-[#B8B8B8] truncate mt-0.5">
                    {isSignedIn
                      ? `${activeProfile?.displayName || activeProfile?.name || 'Signed in'} · Sync ${persisted.progressSync.enabled ? 'ON' : 'OFF'}`
                      : `Amber / NIP-46 Sign-In · ${persisted.relays.length} relays`}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-[#B8B8B8] shrink-0" />
              </button>
            </div>
          </section>
        )}

        {destination === 'upgrades' && (
          <UpgradeLabView
            mojoBalance={persisted.mojoBalance}
            playerLevel={persisted.playerLevel}
            playerXp={persisted.playerXp}
            playerXpNext={persisted.playerXpNext}
            upgrades={persisted.upgrades}
            onPurchaseUpgrade={handlePurchaseUpgrade}
          />
        )}

        {destination === 'codex' && (
          <CodexView
            emojis={allEmojis}
            codexRecords={persisted.codex}
            imageStatuses={coordinator.imageStatus}
            viewMode={persisted.settings.codexViewMode}
            syncing={coordinator.syncingEmojis}
            onChangeViewMode={handleChangeCodexViewMode}
            onSyncNip30={() => void coordinator.syncNip30Emojis()}
          />
        )}

        {destination === 'leaderboard' && (
          <LeaderboardView
            coordinator={coordinator}
            entries={sortedLeaderboard}
            myRelayRuns={myRelayRuns}
            profiles={coordinator.profiles}
            localReceipts={persisted.localReceipts}
            currentPubkey={coordinator.pubkey}
            playerLevel={persisted.playerLevel}
            defaultAvatarUrl={defaultAvatarUrl}
            relayCount={persisted.relays.length}
            syncing={coordinator.syncingLeaderboard}
            onRefreshRelays={() => void coordinator.syncGlobalLeaderboard()}
            onBroadcastLocalReceipt={async (rec) => {
              await coordinator.signAndBroadcastReceipt(rec, handleReceiptUpdated);
            }}
            onReceiptUpdated={handleReceiptUpdated}
            onDeleteReceipt={handleDeleteReceipt}
          />
        )}

        {destination === 'identity' && (
          <IdentitySettingsView
            coordinator={coordinator}
            profile={activeProfile}
            defaultAvatarUrl={defaultAvatarUrl}
            playerLevel={persisted.playerLevel}
            playerXp={persisted.playerXp}
            playerXpNext={persisted.playerXpNext}
            mojoBalance={persisted.mojoBalance}
            progressSync={persisted.progressSync}
            storageError={storageError}
            relays={persisted.relays}
            settings={persisted.settings}
            initialPanel={settingsPanel}
            onToggleProgressSync={handleToggleProgressSync}
            onSyncProgressNow={() => syncProgressSnapshotToRelays()}
            onPrepareNip55ProgressSync={handlePrepareNip55ProgressSync}
            onApplyNip55ProgressSignature={handleApplyNip55ProgressSignature}
            onRestoreProgressFromRelays={() => restoreProgressFromRelays(false)}
            onUpdateRelays={handleUpdateRelays}
            onUpdateSettings={handleUpdateSettings}
          />
        )}
      </main>
    </div>
  );
}
