import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, RotateCcw, AlertTriangle, ArrowRight } from 'lucide-react';
import { ArenaView } from './components/ArenaView';
import { CodexView } from './components/CodexView';
import { FirstLoadWarningModal } from './components/FirstLoadWarningModal';
import {
  IdentitySettingsView,
  type AccordionPanel,
} from './components/IdentitySettingsView';
import { LeaderboardView } from './components/LeaderboardView';
import {
  UpgradeLabView,
  type CareerRebirthResult,
  type UpgradePurchaseResult,
} from './components/UpgradeLabView';
import { sha256Hex, type EmojiCombatTrait } from './lib/cryptoStats';
import type {
  CompletedRunSummary,
  RunProgressCheckpointPayload,
} from './lib/gameEngine';
import {
  normalizeEmojiHash,
  normalizePubkeyOrNpub,
  parseCuratorBlocklistJson,
  type EmojiFilterMode,
} from './lib/moderationLists';
import { formatShortNpub, MojiNostrCoordinator } from './lib/nostrEngine';
import {
  getLobbyPixelBannerDataUrl,
  MOJI_APP_ICON_URL,
} from './lib/pixelBackgrounds';
import {
  applyRunCheckpointToState,
  getUpgradeCost,
  loadActiveRunCheckpoint,
  loadPendingPostRunSession,
  loadPersistedStateWithDiagnostics,
  mergeOwnRelayRunsIntoState,
  performCareerRebirth,
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
    () =>
      new MojiNostrCoordinator(initialBoot.state.relays, initialBoot.state.codex, {
        emojiFilterMode: initialBoot.state.settings.emojiFilterMode,
        nsfwBanPubkeys: initialBoot.state.nsfwBanPubkeys,
        nsfwBanEmojiHashes: initialBoot.state.nsfwBanEmojiHashes,
        safePackAuthors: initialBoot.state.safePackAuthors,
        blockedEmojiKeys: initialBoot.state.blockedEmojiKeys,
        autoManageRelays: initialBoot.state.settings.autoManageRelays !== false,
        onAutoRelaysUpdated: (healthyRelays) => {
          const prev = persistedRef.current;
          if (
            prev.relays.length === healthyRelays.length &&
            prev.relays.every((r, idx) => r === healthyRelays[idx])
          ) {
            return;
          }
          const next = {
            ...prev,
            relays: healthyRelays,
            updatedAt: Date.now(),
          };
          persistedRef.current = next;
          setPersisted(next);
          savePersistedState(next);
        },
      })
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

  // Persist cleaned/migrated state on boot so purged legacy SVG placeholders never linger in storage
  useEffect(() => {
    savePersistedState(initialBoot.state);
  }, [initialBoot.state]);

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
            bossesDefeatedTotal: summary.bossesDefeated,
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

  const handlePerformRebirth = useCallback((): CareerRebirthResult => {
    const current = persistedRef.current;
    const res = performCareerRebirth(current);
    if (!res.ok) {
      return {
        ok: false,
        newRebirthCount: current.rebirthCount ?? 0,
        error: res.error,
      };
    }

    const updatedState = commitPersisted(() => res.nextState, { immediate: true });
    if (updatedState.progressSync.enabled && coordinator.signerMode !== 'nip55') {
      void syncProgressSnapshotToRelays();
    }

    return {
      ok: true,
      newRebirthCount: res.newRebirthCount,
    };
  }, [commitPersisted, coordinator.signerMode, syncProgressSnapshotToRelays]);

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
      coordinator.setAutoManageRelays(settings.autoManageRelays !== false);
      commitPersisted((prev) => ({ ...prev, settings }), { immediate: true });
    },
    [commitPersisted, coordinator]
  );

  const handleAcceptContentWarning = useCallback(
    (selectedMode: EmojiFilterMode) => {
      commitPersisted(
        (prev) => ({
          ...prev,
          contentWarningAcceptedAt: Date.now(),
          settings: {
            ...prev.settings,
            emojiFilterMode: selectedMode,
          },
        }),
        { immediate: true }
      );
    },
    [commitPersisted]
  );

  const handleChangeFilterMode = useCallback(
    (emojiFilterMode: EmojiFilterMode) => {
      handleUpdateSettings({
        ...persistedRef.current.settings,
        emojiFilterMode,
      });
    },
    [handleUpdateSettings]
  );

  const handleReportAndBanEmojiHash = useCallback(
    (opts: {
      emojiHash: string;
      targetPubkeyOrNpub?: string;
      packTitle?: string;
      packDTag?: string;
    }) => {
      const cleanHash = normalizeEmojiHash(opts.emojiHash);
      if (!cleanHash) {
        setGlobalNotice('Enter a valid 64-character SHA-256 emoji hex hash.');
        return;
      }

      commitPersisted(
        (prev) => {
          const nextHashBans = Array.from(
            new Set([...prev.nsfwBanEmojiHashes, cleanHash])
          );
          const removedUrls = new Set<string>();
          const nextCodex: typeof prev.codex = {};
          for (const [k, rec] of Object.entries(prev.codex)) {
            if (rec.hash?.toLowerCase() === cleanHash) {
              removedUrls.add(rec.url);
              continue;
            }
            nextCodex[k] = rec;
          }
          const nextReceipts = prev.localReceipts.map((r) =>
            r.featuredEmoji &&
            (r.featuredEmoji.hash?.toLowerCase() === cleanHash ||
              removedUrls.has(r.featuredEmoji.url))
              ? { ...r, featuredEmoji: undefined }
              : r
          );
          return {
            ...prev,
            revision: prev.revision + 1,
            nsfwBanEmojiHashes: nextHashBans,
            codex: nextCodex,
            localReceipts: nextReceipts,
          };
        },
        { immediate: true }
      );

      setGlobalNotice(
        `Privately banned hash #${cleanHash.slice(0, 8)} on this device and publishing anonymous NSFW hash report…`
      );

      void coordinator
        .publishAnonymousModerationReport({
          verdict: 'nsfw_hash',
          emojiHash: cleanHash,
          targetPubkeyOrNpub: opts.targetPubkeyOrNpub,
          packTitle: opts.packTitle,
          packDTag: opts.packDTag,
        })
        .then((res) => {
          if (res.ok && res.acceptedRelays.length > 0) {
            setGlobalNotice(
              `Banned hash #${cleanHash.slice(0, 8)} privately & published anonymous report to ${res.acceptedRelays.length} relay(s).`
            );
          } else {
            setGlobalNotice(
              `Banned hash #${cleanHash.slice(0, 8)} privately on your device.`
            );
          }
        });
    },
    [commitPersisted, coordinator]
  );

  const handleUnbanEmojiHash = useCallback(
    (emojiHash: string) => {
      const cleanHash = normalizeEmojiHash(emojiHash);
      if (!cleanHash) return;
      commitPersisted(
        (prev) => ({
          ...prev,
          revision: prev.revision + 1,
          nsfwBanEmojiHashes: prev.nsfwBanEmojiHashes.filter((h) => h !== cleanHash),
        }),
        { immediate: true }
      );
      setGlobalNotice(`Removed hash #${cleanHash.slice(0, 8)} from NSFW Hash Ban List.`);
    },
    [commitPersisted]
  );

  const handleReportAndBanAuthor = useCallback(
    (opts: {
      pubkeyOrNpub: string;
      packTitle?: string;
      packDTag?: string;
      emojiHash?: string;
    }) => {
      const targetHex = normalizePubkeyOrNpub(opts.pubkeyOrNpub);
      if (!targetHex) {
        setGlobalNotice('Invalid npub1… or 64-character hex public key.');
        return;
      }
      const cleanHash = opts.emojiHash ? normalizeEmojiHash(opts.emojiHash) : null;

      commitPersisted(
        (prev) => {
          const nextBans = Array.from(new Set([...prev.nsfwBanPubkeys, targetHex]));
          const nextHashBans = cleanHash
            ? Array.from(new Set([...prev.nsfwBanEmojiHashes, cleanHash]))
            : prev.nsfwBanEmojiHashes;
          const nextSafe = prev.safePackAuthors.filter((p) => p !== targetHex);
          const removedUrls = new Set<string>();
          const nextCodex: typeof prev.codex = {};
          for (const [k, rec] of Object.entries(prev.codex)) {
            if (
              rec.packAuthor?.toLowerCase() === targetHex ||
              (cleanHash && rec.hash?.toLowerCase() === cleanHash)
            ) {
              removedUrls.add(rec.url);
              continue;
            }
            nextCodex[k] = rec;
          }
          const nextReceipts = prev.localReceipts.map((r) =>
            r.featuredEmoji &&
            (removedUrls.has(r.featuredEmoji.url) ||
              (cleanHash && r.featuredEmoji.hash?.toLowerCase() === cleanHash))
              ? { ...r, featuredEmoji: undefined }
              : r
          );
          return {
            ...prev,
            revision: prev.revision + 1,
            nsfwBanPubkeys: nextBans,
            nsfwBanEmojiHashes: nextHashBans,
            safePackAuthors: nextSafe,
            codex: nextCodex,
            localReceipts: nextReceipts,
          };
        },
        { immediate: true }
      );

      setGlobalNotice(
        `Privately banned ${formatShortNpub(targetHex)} on this device and publishing anonymous NSFW report…`
      );

      void coordinator
        .publishAnonymousModerationReport({
          targetPubkeyOrNpub: targetHex,
          verdict: 'nsfw_ban',
          packTitle: opts.packTitle,
          packDTag: opts.packDTag,
          emojiHash: cleanHash ?? undefined,
        })
        .then((res) => {
          if (res.ok && res.acceptedRelays.length > 0) {
            setGlobalNotice(
              `Banned ${formatShortNpub(targetHex)} privately & published anonymous NSFW report to ${res.acceptedRelays.length} relay(s).`
            );
          } else {
            setGlobalNotice(
              `Banned ${formatShortNpub(targetHex)} privately on your device.`
            );
          }
        });
    },
    [commitPersisted, coordinator]
  );

  const handleUnbanAuthor = useCallback(
    (pubkeyHex: string) => {
      const target = normalizePubkeyOrNpub(pubkeyHex);
      if (!target) return;
      commitPersisted(
        (prev) => ({
          ...prev,
          revision: prev.revision + 1,
          nsfwBanPubkeys: prev.nsfwBanPubkeys.filter((p) => p !== target),
        }),
        { immediate: true }
      );
      setGlobalNotice(`Removed ${formatShortNpub(target)} from local NSFW Ban List.`);
    },
    [commitPersisted]
  );

  const handleAddSafeAuthor = useCallback(
    (opts: {
      pubkeyOrNpub: string;
      packTitle?: string;
      packDTag?: string;
      emojiHash?: string;
      publishNomination?: boolean;
    }) => {
      const targetHex = normalizePubkeyOrNpub(opts.pubkeyOrNpub);
      if (!targetHex) {
        setGlobalNotice('Invalid npub1… or 64-character hex public key.');
        return;
      }

      commitPersisted(
        (prev) => ({
          ...prev,
          revision: prev.revision + 1,
          safePackAuthors: Array.from(new Set([...prev.safePackAuthors, targetHex])),
          nsfwBanPubkeys: prev.nsfwBanPubkeys.filter((p) => p !== targetHex),
          progressSync: prev.progressSync.enabled
            ? { ...prev.progressSync, dirty: true }
            : prev.progressSync,
        }),
        { immediate: true }
      );

      if (opts.publishNomination !== false) {
        void coordinator.publishAnonymousModerationReport({
          targetPubkeyOrNpub: targetHex,
          verdict: 'safe_nomination',
          packTitle: opts.packTitle,
          packDTag: opts.packDTag,
          emojiHash: opts.emojiHash,
        });
      }

      setGlobalNotice(`Added ${formatShortNpub(targetHex)} to Verified Safe List.`);
    },
    [commitPersisted, coordinator]
  );

  const handleRemoveSafeAuthor = useCallback(
    (pubkeyHex: string) => {
      const target = normalizePubkeyOrNpub(pubkeyHex);
      if (!target) return;
      commitPersisted(
        (prev) => ({
          ...prev,
          revision: prev.revision + 1,
          safePackAuthors: prev.safePackAuthors.filter((p) => p !== target),
          progressSync: prev.progressSync.enabled
            ? { ...prev.progressSync, dirty: true }
            : prev.progressSync,
        }),
        { immediate: true }
      );
      setGlobalNotice(`Removed ${formatShortNpub(target)} from Safe List.`);
    },
    [commitPersisted]
  );

  const handleImportCuratorBlocklist = useCallback(
    (
      rawJson: string
    ): {
      ok: boolean;
      addedPubkeys: number;
      addedHashes: number;
      error?: string;
    } => {
      const parsed = parseCuratorBlocklistJson(rawJson);
      if (!parsed.ok || (parsed.pubkeys.length === 0 && parsed.emojiHashes.length === 0)) {
        return {
          ok: false,
          addedPubkeys: 0,
          addedHashes: 0,
          error:
            parsed.error ??
            'No valid publisher hex pubkeys or emoji URLs/hashes found in JSON payload.',
        };
      }

      let addedPubs = 0;
      let addedHashes = 0;
      commitPersisted(
        (prev) => {
          const prevPubSet = new Set(prev.nsfwBanPubkeys);
          const prevHashSet = new Set(prev.nsfwBanEmojiHashes);
          for (const pub of parsed.pubkeys) {
            if (!prevPubSet.has(pub)) {
              prevPubSet.add(pub);
              addedPubs += 1;
            }
          }
          for (const h of parsed.emojiHashes) {
            if (!prevHashSet.has(h)) {
              prevHashSet.add(h);
              addedHashes += 1;
            }
          }
          const nextPubs = Array.from(prevPubSet);
          const nextHashes = Array.from(prevHashSet);
          const nextSafe = prev.safePackAuthors.filter((p) => !prevPubSet.has(p));

          const nextCodex: typeof prev.codex = {};
          for (const [k, rec] of Object.entries(prev.codex)) {
            if (
              (rec.packAuthor && prevPubSet.has(rec.packAuthor.toLowerCase())) ||
              (rec.hash && prevHashSet.has(rec.hash.toLowerCase()))
            ) {
              continue;
            }
            nextCodex[k] = rec;
          }

          return {
            ...prev,
            revision: prev.revision + 1,
            nsfwBanPubkeys: nextPubs,
            nsfwBanEmojiHashes: nextHashes,
            safePackAuthors: nextSafe,
            codex: nextCodex,
          };
        },
        { immediate: true }
      );

      return {
        ok: true,
        addedPubkeys: addedPubs,
        addedHashes,
      };
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

  // Sync live SHA-256 Hash Ban List, npub Ban List, Safe List & filter mode into Nostr coordinator
  useEffect(() => {
    coordinator.updateModerationPolicy({
      emojiFilterMode: persisted.settings.emojiFilterMode,
      nsfwBanPubkeys: persisted.nsfwBanPubkeys,
      nsfwBanEmojiHashes: persisted.nsfwBanEmojiHashes,
      safePackAuthors: persisted.safePackAuthors,
      blockedEmojiKeys: persisted.blockedEmojiKeys,
    });
  }, [
    coordinator,
    persisted.settings.emojiFilterMode,
    persisted.nsfwBanPubkeys,
    persisted.nsfwBanEmojiHashes,
    persisted.safePackAuthors,
    persisted.blockedEmojiKeys,
  ]);

  // Merge offline-persisted Codex unlocks into coordinator's emoji map so Arena & Codex always include them
  useEffect(() => {
    coordinator.hydrateEmojisFromCodex(persisted.codex);
  }, [coordinator, persisted.codex]);

  const isEmojiAllowedCallback = useCallback(
    (trait: EmojiCombatTrait) => coordinator.isEmojiAllowed(trait),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      coordinator,
      nostrTick,
      persisted.settings.emojiFilterMode,
      persisted.nsfwBanPubkeys,
      persisted.nsfwBanEmojiHashes,
      persisted.safePackAuthors,
      persisted.blockedEmojiKeys,
    ]
  );

  const allEmojis = useMemo(
    () => Array.from(coordinator.emojis.values()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      coordinator,
      nostrTick,
      persisted.codex,
      persisted.settings.emojiFilterMode,
      persisted.nsfwBanPubkeys,
      persisted.nsfwBanEmojiHashes,
      persisted.safePackAuthors,
      persisted.blockedEmojiKeys,
    ]
  );

  const effectiveBannedSet = useMemo(
    () => coordinator.getEffectiveBannedPubkeys(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coordinator, nostrTick, persisted.nsfwBanPubkeys]
  );

  const effectiveBannedHashesSet = useMemo(
    () => coordinator.getEffectiveBannedEmojiHashes(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coordinator, nostrTick, persisted.nsfwBanEmojiHashes]
  );

  const effectiveSafeSet = useMemo(
    () => coordinator.getEffectiveSafePubkeys(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coordinator, nostrTick, persisted.safePackAuthors]
  );

  const relayModerationReports = useMemo(
    () => coordinator.getSortedModerationReports(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coordinator, nostrTick]
  );

  const liveNip30Count = useMemo(
    () => allEmojis.filter((e) => e.source === 'nip30' && isEmojiAllowedCallback(e)).length,
    [allEmojis, isEmojiAllowedCallback]
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

  // Automatically merge the active user's own verified historical relay runs into local best score, wave, and career totals
  useEffect(() => {
    if (myRelayRuns.length === 0) return;
    commitPersisted((prev) => mergeOwnRelayRunsIntoState(prev, myRelayRuns), {
      immediate: true,
    });
  }, [commitPersisted, myRelayRuns]);

  const playerAggregates = useMemo(
    () => coordinator.getPlayerLeaderboardAggregates(persisted),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coordinator, nostrTick, persisted]
  );

  const mojiLeaderboard = useMemo(
    () => coordinator.getMojiLeaderboard(persisted.codex),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coordinator, nostrTick, persisted.codex]
  );

  const activeProfile = coordinator.profiles.get(coordinator.pubkey);
  const discoveredCount = Object.values(persisted.codex).filter((r) => r.kills > 0).length;
  const totalKnownCodexCount = useMemo(() => {
    const keys = new Set<string>(
      allEmojis.filter((e) => isEmojiAllowedCallback(e)).map((e) => e.emojiKey)
    );
    for (const k of Object.keys(persisted.codex)) keys.add(k);
    return keys.size;
  }, [allEmojis, isEmojiAllowedCallback, persisted.codex]);
  const isSignedIn = coordinator.isSignedIn();
  const defaultAvatarUrl = MOJI_APP_ICON_URL;
  const lobbyPixelBannerUrl = useMemo(() => getLobbyPixelBannerDataUrl(), []);

  if (destination === 'arena') {
    return (
      <ArenaView
        coordinator={coordinator}
        profile={activeProfile}
        playerLevel={persisted.playerLevel}
        playerXp={persisted.playerXp}
        playerXpNext={persisted.playerXpNext}
        rebirthCount={persisted.rebirthCount}
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
    <div className="min-h-screen bg-[#07070B] text-white flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {persisted.contentWarningAcceptedAt === null && (
        <FirstLoadWarningModal onAccept={handleAcceptContentWarning} />
      )}

      {persisted.settings.crtScanlines && (
        <div className="pointer-events-none fixed inset-0 crt-scanlines opacity-30 z-40" />
      )}

      {/* Compact Sticky Top Chrome */}
      <div className="sticky top-0 z-30 bg-[#07070B]/95 backdrop-blur-md border-b border-white/10">
        <header className="max-w-5xl mx-auto flex items-center justify-between gap-6 px-4 py-2">
          <button
            type="button"
            onClick={() => navigateTo('lobby')}
            className="inline-flex items-center gap-2 text-base font-display font-bold tracking-tight text-white hover:text-[#FFB6D9] transition-colors whitespace-nowrap shrink-0"
          >
            <img
              src={MOJI_APP_ICON_URL}
              alt="MojiSurvivor emblem"
              className="w-7 h-7 rounded-md border border-[#FF1493]/70 object-cover shrink-0"
            />
            <span>MojiSurvivor</span>
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
                    ? 'text-white border-[#FF1493] font-semibold'
                    : 'border-transparent hover:text-[#FFB6D9]'
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
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] text-xs font-semibold text-white transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <span>
                {activeRunCheckpoint ? `Resume W${activeRunCheckpoint.wave}` : 'Start Run'}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        <nav
          aria-label="Mobile navigation"
          className="md:hidden grid grid-cols-5 border-t border-white/10 bg-[#111018] px-2"
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
                  : 'text-[#B8B8B8] border-transparent hover:text-[#FFB6D9]'
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
            <div className="px-3 py-2 rounded-lg bg-[#111111] border border-[#FF1493]/50 text-xs text-[#FFB6D9] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-[#FF1493]" />
              <span>{storageError}</span>
            </div>
          )}
          {globalNotice && (
            <div className="px-3 py-2 rounded-lg bg-[#111111] border border-[#9A0957] text-xs text-[#FFB6D9] flex items-center justify-between gap-2">
              <span>{globalNotice}</span>
              <button
                type="button"
                onClick={() => setGlobalNotice(null)}
                className="text-[#B8B8B8] hover:text-white text-xs shrink-0"
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
          <section className="max-w-5xl mx-auto px-4 py-4 space-y-3.5">
            {/* Hero Launch Panel */}
            <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-[#111018]">
              {lobbyPixelBannerUrl && (
                <img
                  src={lobbyPixelBannerUrl}
                  alt="16-bit pixel-art arena horizon"
                  className="absolute inset-0 w-full h-full object-cover opacity-50 pixelated"
                />
              )}
              <div className="relative bg-gradient-to-r from-[#07070B]/94 via-[#07070B]/84 to-[#111018]/78 p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-5">
                <div className="space-y-3 max-w-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl emoji-opaque-pod p-0.5 overflow-hidden shrink-0">
                      <img
                        src={activeProfile?.picture || defaultAvatarUrl}
                        alt="Active player persona"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = defaultAvatarUrl;
                        }}
                        className="w-full h-full rounded-[10px] object-cover"
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
                      <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono text-[#94A3B8]">
                        <span className="text-[#FFB6D9] font-semibold">
                          Lv.{persisted.playerLevel}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {isSignedIn ? coordinator.signerMode.toUpperCase() : 'Local Save'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() => openAccountPanel('profile')}
                          className="text-[#FF1493] hover:text-[#FFB6D9] font-semibold inline-flex items-center gap-1 whitespace-nowrap"
                        >
                          <span>{isSignedIn ? 'Account' : 'Sign In'}</span>
                          <span aria-hidden="true">→</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h1
                      className="text-xl sm:text-2xl font-display font-bold text-white tracking-tight leading-snug"
                      style={{ textWrap: 'balance' }}
                    >
                      MojiSurvivor Arena
                    </h1>
                    <p className="text-xs sm:text-sm text-[#B8B8B8] mt-1 leading-relaxed">
                      Move with mouse, touch, or WASD to battle statted Nostr emojis across 16-bit pixel arenas.
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
                        className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#FF1493] hover:bg-[#CD0D72] text-sm font-semibold text-white transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>
                          Resume Wave {activeRunCheckpoint.wave} ({activeRunCheckpoint.score.toLocaleString()} pts)
                        </span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleSaveActiveRunCheckpoint(null);
                          navigateTo('arena', { checkpoint: null });
                        }}
                        className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#0B0A12] border border-white/15 hover:border-[#FF1493] text-xs font-semibold text-white transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-[#FFB6D9]" />
                        <span>New Run</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => navigateTo('arena', { checkpoint: null })}
                        className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#FF1493] hover:bg-[#CD0D72] text-sm font-semibold text-white transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>Enter Battle Arena</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => navigateTo('upgrades')}
                        className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#0B0A12] border border-white/15 hover:border-[#FF1493] text-xs font-semibold text-white transition-colors whitespace-nowrap"
                      >
                        Upgrades ({persisted.mojoBalance.toLocaleString()} Mojo)
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Single Horizontal Hairline Stat Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-white/10 rounded-xl bg-[#111018] border border-white/10 font-mono tabular-nums">
              <div className="px-4 py-3">
                <div className="text-[11px] text-[#94A3B8] truncate">Player Level</div>
                <div className="text-sm sm:text-base font-bold text-[#FF1493] mt-0.5">
                  Lv.{persisted.playerLevel}
                  {(persisted.rebirthCount ?? 0) > 0 && (
                    <span className="text-xs font-semibold text-[#00F0FF]">
                      {' '}· R{persisted.rebirthCount}
                    </span>
                  )}
                </div>
              </div>
              <div className="px-4 py-3">
                <div className="text-[11px] text-[#94A3B8] truncate">Best Score</div>
                <div className="text-sm sm:text-base font-bold text-white mt-0.5">
                  {persisted.highScore.toLocaleString()}
                </div>
              </div>
              <div className="px-4 py-3">
                <div className="text-[11px] text-[#94A3B8] truncate">Best Wave</div>
                <div className="text-sm sm:text-base font-bold text-[#FFB6D9] mt-0.5">
                  W{persisted.bestWave}
                </div>
              </div>
              <div className="px-4 py-3">
                <div className="text-[11px] text-[#94A3B8] truncate">Mojo Banked</div>
                <div className="text-sm sm:text-base font-bold text-[#E2E8F0] mt-0.5">
                  {persisted.mojoBalance.toLocaleString()}
                </div>
              </div>
              <div className="col-span-2 sm:col-span-1 px-4 py-3">
                <div className="text-[11px] text-[#94A3B8] truncate">Emoji Pool</div>
                <div className="text-sm sm:text-base font-bold text-[#CBD5E1] mt-0.5">
                  {discoveredCount}/{totalKnownCodexCount}
                  <span className="text-xs font-normal text-[#64748B]">
                    {' '}({liveNip30Count} live)
                  </span>
                </div>
              </div>
            </div>
          </section>
        )}

        {destination === 'upgrades' && (
          <UpgradeLabView
            mojoBalance={persisted.mojoBalance}
            playerLevel={persisted.playerLevel}
            playerXp={persisted.playerXp}
            playerXpNext={persisted.playerXpNext}
            lifetimeXpEarned={persisted.lifetimeXpEarned}
            rebirthCount={persisted.rebirthCount}
            upgrades={persisted.upgrades}
            onPurchaseUpgrade={handlePurchaseUpgrade}
            onPerformRebirth={handlePerformRebirth}
          />
        )}

        {destination === 'codex' && (
          <CodexView
            emojis={allEmojis}
            codexRecords={persisted.codex}
            imageStatuses={coordinator.imageStatus}
            viewMode={persisted.settings.codexViewMode}
            syncing={coordinator.syncingEmojis}
            emojiFilterMode={persisted.settings.emojiFilterMode}
            bannedAuthorCount={effectiveBannedSet.size}
            bannedHashCount={effectiveBannedHashesSet.size}
            safeAuthorCount={effectiveSafeSet.size}
            safeAuthorsSet={effectiveSafeSet}
            isEmojiAllowed={isEmojiAllowedCallback}
            onChangeViewMode={handleChangeCodexViewMode}
            onSyncNip30={() => void coordinator.syncNip30Emojis()}
            onChangeFilterMode={handleChangeFilterMode}
            onOpenModerationPanel={() => openAccountPanel('moderation')}
            onReportAndBanAuthor={handleReportAndBanAuthor}
            onReportAndBanEmojiHash={handleReportAndBanEmojiHash}
            onAddSafeAuthor={handleAddSafeAuthor}
          />
        )}

        {destination === 'leaderboard' && (
          <LeaderboardView
            coordinator={coordinator}
            entries={sortedLeaderboard}
            playerAggregates={playerAggregates}
            mojiLeaderboard={mojiLeaderboard}
            persistedState={persisted}
            myRelayRuns={myRelayRuns}
            profiles={coordinator.profiles}
            localReceipts={persisted.localReceipts}
            currentPubkey={coordinator.pubkey}
            playerLevel={persisted.playerLevel}
            careerStats={{
              lifetimeScore: persisted.lifetimeScore ?? persisted.highScore,
              highScore: persisted.highScore,
              bestWave: persisted.bestWave,
              totalRuns: persisted.totalRuns,
              totalKills: persisted.totalKills,
              totalBossKills: persisted.totalBossKills ?? 0,
              lifetimeMojoEarned: persisted.lifetimeMojoEarned,
              rebirthCount: persisted.rebirthCount ?? 0,
              lifetimeXpEarned: persisted.lifetimeXpEarned,
            }}
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
            persistedState={persisted}
            myRelayRuns={myRelayRuns}
            progressSync={persisted.progressSync}
            storageError={storageError}
            relays={persisted.relays}
            settings={persisted.settings}
            nsfwBanPubkeys={persisted.nsfwBanPubkeys}
            nsfwBanEmojiHashes={persisted.nsfwBanEmojiHashes}
            safePackAuthors={persisted.safePackAuthors}
            relayReports={relayModerationReports}
            initialPanel={settingsPanel}
            onToggleProgressSync={handleToggleProgressSync}
            onSyncProgressNow={() => syncProgressSnapshotToRelays()}
            onPrepareNip55ProgressSync={handlePrepareNip55ProgressSync}
            onApplyNip55ProgressSignature={handleApplyNip55ProgressSignature}
            onRestoreProgressFromRelays={() => restoreProgressFromRelays(false)}
            onUpdateRelays={handleUpdateRelays}
            onUpdateSettings={handleUpdateSettings}
            onReportAndBanAuthor={handleReportAndBanAuthor}
            onUnbanAuthor={handleUnbanAuthor}
            onReportAndBanEmojiHash={handleReportAndBanEmojiHash}
            onUnbanEmojiHash={handleUnbanEmojiHash}
            onAddSafeAuthor={handleAddSafeAuthor}
            onRemoveSafeAuthor={handleRemoveSafeAuthor}
            onImportCuratorBlocklist={handleImportCuratorBlocklist}
            onRefreshModerationReports={async () => {
              await coordinator.syncModerationReports();
            }}
          />
        )}
      </main>
    </div>
  );
}
