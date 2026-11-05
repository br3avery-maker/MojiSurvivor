import React, { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Copy,
  Check,
  Plus,
  Trash2,
  KeyRound,
  QrCode,
  LogOut,
  ChevronDown,
  RefreshCw,
  CloudUpload,
  CloudDownload,
  ExternalLink,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  Ban,
  Hash,
} from 'lucide-react';
import {
  getBuiltInBannedHashesSet,
  getBuiltInBannedHexSet,
  getBuiltInSafeHexSet,
  pubkeyHexToNpub,
  type EmojiFilterMode,
} from '../lib/moderationLists';
import {
  encodeFullNpub,
  formatShortNpub,
  MODERATION_REPORT_TOPIC,
  PROGRESS_SNAPSHOT_D_TAG,
  type MojiNostrCoordinator,
  type NostrProfileMeta,
  type RelayModerationReport,
} from '../lib/nostrEngine';
import { ARENA_PIXEL_BG_OPTIONS } from '../lib/pixelBackgrounds';
import { sanitizeRelayUrl } from '../lib/sanitizeUrl';
import type { GameSettings, NostrProgressSyncState } from '../lib/storage';

export type AccordionPanel = 'profile' | 'relays' | 'moderation' | 'game';

interface IdentitySettingsViewProps {
  coordinator: MojiNostrCoordinator;
  profile?: NostrProfileMeta;
  defaultAvatarUrl: string;
  playerLevel: number;
  playerXp: number;
  playerXpNext: number;
  mojoBalance: number;
  progressSync: NostrProgressSyncState;
  storageError: string | null;
  relays: string[];
  settings: GameSettings;
  nsfwBanPubkeys: string[];
  nsfwBanEmojiHashes: string[];
  safePackAuthors: string[];
  relayReports: RelayModerationReport[];
  initialPanel?: AccordionPanel;
  onToggleProgressSync: (enabled: boolean) => void;
  onSyncProgressNow: () => Promise<{ ok: boolean; message: string }>;
  onPrepareNip55ProgressSync: () => { ok: boolean; uri?: string; error?: string };
  onApplyNip55ProgressSignature: (raw: string) => Promise<{ ok: boolean; message: string }>;
  onRestoreProgressFromRelays: () => Promise<{ ok: boolean; message: string }>;
  onUpdateRelays: (relays: string[]) => void;
  onUpdateSettings: (next: GameSettings) => void;
  onReportAndBanAuthor: (opts: {
    pubkeyOrNpub: string;
    packTitle?: string;
    packDTag?: string;
    emojiHash?: string;
  }) => void;
  onUnbanAuthor: (pubkeyHex: string) => void;
  onReportAndBanEmojiHash: (opts: {
    emojiHash: string;
    targetPubkeyOrNpub?: string;
    packTitle?: string;
    packDTag?: string;
  }) => void;
  onUnbanEmojiHash: (emojiHash: string) => void;
  onAddSafeAuthor: (opts: {
    pubkeyOrNpub: string;
    packTitle?: string;
    packDTag?: string;
    emojiHash?: string;
    publishNomination?: boolean;
  }) => void;
  onRemoveSafeAuthor: (pubkeyHex: string) => void;
  onImportCuratorBlocklist?: (rawJson: string) => {
    ok: boolean;
    addedPubkeys: number;
    addedHashes: number;
    error?: string;
  };
  onRefreshModerationReports: () => Promise<void>;
}

export const IdentitySettingsView: React.FC<IdentitySettingsViewProps> = ({
  coordinator,
  profile,
  defaultAvatarUrl,
  playerLevel,
  playerXp,
  playerXpNext,
  mojoBalance,
  progressSync,
  storageError,
  relays,
  settings,
  nsfwBanPubkeys,
  nsfwBanEmojiHashes,
  safePackAuthors,
  relayReports,
  initialPanel = 'profile',
  onToggleProgressSync,
  onSyncProgressNow,
  onPrepareNip55ProgressSync,
  onApplyNip55ProgressSignature,
  onRestoreProgressFromRelays,
  onUpdateRelays,
  onUpdateSettings,
  onReportAndBanAuthor,
  onUnbanAuthor,
  onReportAndBanEmojiHash,
  onUnbanEmojiHash,
  onAddSafeAuthor,
  onRemoveSafeAuthor,
  onImportCuratorBlocklist,
  onRefreshModerationReports,
}) => {
  const [openPanel, setOpenPanel] = useState<AccordionPanel | null>(initialPanel);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [bunkerInput, setBunkerInput] = useState('');
  const [nostrConnectUri, setNostrConnectUri] = useState<string | null>(null);
  const [nostrConnectQr, setNostrConnectQr] = useState<string | null>(null);
  const connectAbortRef = useRef<AbortController | null>(null);
  const listeningNip46Ref = useRef<boolean>(false);

  const [nip55PubkeyInput, setNip55PubkeyInput] = useState('');
  const [nip55ProgressPaste, setNip55ProgressPaste] = useState('');
  const [nsecImportInput, setNsecImportInput] = useState('');
  const [revealedNsec, setRevealedNsec] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [newRelayInput, setNewRelayInput] = useState('');
  const [banHashInput, setBanHashInput] = useState('');
  const [banNpubInput, setBanNpubInput] = useState('');
  const [safeNpubInput, setSafeNpubInput] = useState('');
  const [curatorJsonInput, setCuratorJsonInput] = useState('');
  const [reportTab, setReportTab] = useState<'all' | 'nsfw' | 'safe_nomination'>('all');

  useEffect(() => {
    setOpenPanel(initialPanel);
  }, [initialPanel]);

  useEffect(() => {
    if (openPanel === 'moderation') {
      void onRefreshModerationReports();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPanel]);

  const startOrResumeNip46Session = useCallback(
    async (reuseExisting: boolean, copyImmediately: boolean) => {
      connectAbortRef.current?.abort();
      const controller = new AbortController();
      connectAbortRef.current = controller;
      listeningNip46Ref.current = true;
      setErrorMessage(null);

      const session = coordinator.createNostrConnectSession(
        controller.signal,
        reuseExisting
      );
      setNostrConnectUri(session.uri);

      if (copyImmediately) {
        try {
          await navigator.clipboard.writeText(session.uri);
          setCopiedField('nc');
          setTimeout(() => setCopiedField(null), 2200);
          setStatusMessage(
            'Copied nostrconnect:// link. Paste it into Amber or Primal, approve, and return here.'
          );
        } catch {
          setStatusMessage(
            'Generated nostrconnect:// link. Tap "Copy Pairing URI", paste into your signer app, and return.'
          );
        }
      }

      try {
        const dataUrl = await QRCode.toDataURL(session.uri, {
          width: 180,
          margin: 1,
          color: { dark: '#FFFFFF', light: '#000000' },
        });
        setNostrConnectQr(dataUrl);
      } catch {
        setNostrConnectQr(null);
      }

      setBusyAction('qr');
      const res = await session.waitForApproval();
      listeningNip46Ref.current = false;
      setBusyAction(null);

      if (res.ok) {
        setNostrConnectUri(null);
        setNostrConnectQr(null);
        setStatusMessage('Signed in via NIP-46 Nostr Connect (CSPRNG secret verified).');
      } else if (
        res.error &&
        res.error !== 'Pairing cancelled.' &&
        res.error !== 'Pairing paused or cancelled.'
      ) {
        setErrorMessage(res.error);
      }
    },
    [coordinator]
  );

  // Resume pending NIP-46 pairing automatically if the user switched to Amber/Primal and returned
  useEffect(() => {
    if (!coordinator.isSignedIn() && coordinator.getPendingNip46Session()) {
      void startOrResumeNip46Session(true, false);
    }

    const onVisibility = () => {
      if (
        !document.hidden &&
        !coordinator.isSignedIn() &&
        coordinator.getPendingNip46Session() &&
        !listeningNip46Ref.current
      ) {
        void startOrResumeNip46Session(true, false);
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      connectAbortRef.current?.abort();
      listeningNip46Ref.current = false;
    };
  }, [coordinator, startOrResumeNip46Session]);

  const isSignedIn = coordinator.isSignedIn();
  const fullNpub = encodeFullNpub(coordinator.pubkey);
  const nip07Available = coordinator.isNip07ExtensionDetected();
  const androidAvailable = coordinator.isAndroidEnvironment();
  const pendingNip55 = coordinator.getPendingNip55Request();

  const togglePanel = (panel: AccordionPanel) => {
    setOpenPanel((prev) => (prev === panel ? null : panel));
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(label);
      setTimeout(() => setCopiedField(null), 1800);
    } catch {
      setErrorMessage('Clipboard write blocked by browser permissions.');
    }
  };

  const handleConnectNip07 = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setBusyAction('nip07');
    const res = await coordinator.connectNip07Extension();
    setBusyAction(null);
    if (res.ok) {
      setStatusMessage('Signed in via NIP-07 browser extension.');
    } else {
      setErrorMessage(res.error ?? 'Extension connection failed.');
    }
  };

  const handleConnectBunker = async () => {
    if (!bunkerInput.trim()) return;
    setErrorMessage(null);
    setStatusMessage(null);
    setBusyAction('bunker');
    const res = await coordinator.connectNip46Bunker(bunkerInput);
    setBusyAction(null);
    if (res.ok) {
      setBunkerInput('');
      setNostrConnectUri(null);
      setNostrConnectQr(null);
      setStatusMessage('Signed in via NIP-46 remote signer.');
    } else {
      setErrorMessage(res.error ?? 'NIP-46 connection failed.');
    }
  };

  const handleCancelNip46Pairing = () => {
    connectAbortRef.current?.abort();
    listeningNip46Ref.current = false;
    coordinator.clearPendingNip46Session();
    setNostrConnectUri(null);
    setNostrConnectQr(null);
    setBusyAction(null);
    setStatusMessage('Cancelled pending NIP-46 pairing session.');
  };

  const handleLaunchNip55PublicKey = () => {
    setErrorMessage(null);
    setStatusMessage(null);
    const { uri } = coordinator.prepareNip55PublicKeyRequest();
    window.location.href = uri;
  };

  const handleBindNip55 = () => {
    if (!nip55PubkeyInput.trim()) return;
    setErrorMessage(null);
    setStatusMessage(null);
    const res = coordinator.connectNip55WithPubkey(nip55PubkeyInput);
    if (res.ok) {
      setNip55PubkeyInput('');
      setStatusMessage('Connected Android Amber (NIP-55) public key.');
    } else {
      setErrorMessage(res.error ?? 'Invalid public key.');
    }
  };

  const handleImportNsec = () => {
    if (!nsecImportInput.trim()) return;
    setErrorMessage(null);
    setStatusMessage(null);
    const res = coordinator.importNsecKey(nsecImportInput);
    if (res.ok) {
      setNsecImportInput('');
      setRevealedNsec(null);
      setStatusMessage('Signed in with imported secret key.');
    } else {
      setErrorMessage(res.error ?? 'Invalid nsec key.');
    }
  };

  const handleLogout = () => {
    connectAbortRef.current?.abort();
    listeningNip46Ref.current = false;
    setNostrConnectUri(null);
    setNostrConnectQr(null);
    setRevealedNsec(null);
    setErrorMessage(null);
    coordinator.logout();
    setStatusMessage('Logged out of Nostr account. Local progression remains intact.');
  };

  const handleRefreshProfile = async () => {
    setBusyAction('profile');
    await coordinator.refreshActiveProfile();
    setBusyAction(null);
  };

  const handleSyncProgressClick = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    if (coordinator.signerMode === 'nip55') {
      const prep = onPrepareNip55ProgressSync();
      if (!prep.ok || !prep.uri) {
        setErrorMessage(prep.error ?? 'Unable to prepare Amber progression signature request.');
        return;
      }
      window.location.href = prep.uri;
      return;
    }
    setBusyAction('sync_progress');
    const res = await onSyncProgressNow();
    setBusyAction(null);
    if (res.ok) {
      setStatusMessage(res.message);
    } else {
      setErrorMessage(res.message);
    }
  };

  const handleNip55ProgressPasteSubmit = async () => {
    if (!nip55ProgressPaste.trim()) return;
    setErrorMessage(null);
    setStatusMessage(null);
    setBusyAction('sync_progress');
    const res = await onApplyNip55ProgressSignature(nip55ProgressPaste.trim());
    setBusyAction(null);
    if (res.ok) {
      setNip55ProgressPaste('');
      setStatusMessage(res.message);
    } else {
      setErrorMessage(res.message);
    }
  };

  const handleRestoreProgressClick = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setBusyAction('restore_progress');
    const res = await onRestoreProgressFromRelays();
    setBusyAction(null);
    if (res.ok) {
      setStatusMessage(res.message);
    } else {
      setErrorMessage(res.message);
    }
  };

  const handleAddRelay = () => {
    const cleaned = sanitizeRelayUrl(newRelayInput);
    if (!cleaned) {
      setErrorMessage('Enter a valid wss:// relay URL.');
      return;
    }
    if (relays.includes(cleaned)) {
      setNewRelayInput('');
      return;
    }
    onUpdateRelays([...relays, cleaned]);
    setNewRelayInput('');
    setErrorMessage(null);
    setStatusMessage(`Added custom relay ${cleaned}.`);
  };

  const handleRemoveRelay = (url: string) => {
    if (relays.length <= 1) {
      setErrorMessage('At least one relay must remain configured.');
      return;
    }
    onUpdateRelays(relays.filter((r) => r !== url));
  };

  const handleScanRelaysNow = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setBusyAction('scan_relays');
    const selected = await coordinator.scanAndSelectHealthyRelays(true);
    setBusyAction(null);
    onUpdateRelays(selected);
    setStatusMessage(
      `Probed free public relays: ${selected.length} responsive relay(s) selected (${selected.join(', ')}).`
    );
  };

  const handleToggleAutoManageRelays = (nextAuto: boolean) => {
    coordinator.setAutoManageRelays(nextAuto);
    onUpdateSettings({
      ...settings,
      autoManageRelays: nextAuto,
    });
    if (nextAuto) {
      void handleScanRelaysNow();
    } else {
      setStatusMessage(
        'Switched to Manual Relay Mode. You can now add or remove custom wss:// relays.'
      );
    }
  };

  const handleImportCuratorJson = () => {
    if (!curatorJsonInput.trim() || !onImportCuratorBlocklist) return;
    setErrorMessage(null);
    setStatusMessage(null);
    const res = onImportCuratorBlocklist(curatorJsonInput.trim());
    if (res.ok) {
      setCuratorJsonInput('');
      setStatusMessage(
        `Imported moji-curator-blocklist/v1: +${res.addedPubkeys} publisher npub(s) and +${res.addedHashes} emoji SHA-256 hash(es) blocked.`
      );
    } else {
      setErrorMessage(res.error ?? 'Failed to parse blocklist JSON.');
    }
  };

  const signerLabel =
    coordinator.signerMode === 'nip07'
      ? 'Browser Extension (NIP-07)'
      : coordinator.signerMode === 'nip46'
        ? 'Remote Signer (NIP-46)'
        : coordinator.signerMode === 'nip55'
          ? 'Android Amber (NIP-55)'
          : coordinator.signerMode === 'nsec'
            ? 'Secret Key (nsec)'
            : 'Guest Mode';

  const profileSummaryText = isSignedIn
    ? `${profile?.displayName || profile?.name || formatShortNpub(coordinator.pubkey)} · ${coordinator.signerMode.toUpperCase()}`
    : 'Guest · Not signed in';

  return (
    <section className="max-w-3xl mx-auto px-4 py-3.5 space-y-2.5">
      {storageError && (
        <div className="px-3 py-2 rounded-lg bg-[#111111] border border-amber-500/40 text-xs text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{storageError}</span>
        </div>
      )}

      {statusMessage && (
        <div className="px-3 py-2 rounded-lg bg-[#111111] border border-emerald-500/40 text-xs text-emerald-300">
          {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div className="px-3 py-2 rounded-lg bg-[#111111] border border-amber-500/40 text-xs text-amber-300">
          {errorMessage}
        </div>
      )}

      {/* ACCORDION 1: PROFILE, SIGNERS & CROSS-DEVICE NOSTR SAVE (Default Open) */}
      <div className="rounded-xl bg-[#111111] border border-white/10 overflow-hidden">
        <button
          type="button"
          aria-expanded={openPanel === 'profile'}
          onClick={() => togglePanel('profile')}
          className="w-full min-h-[48px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02] transition-colors"
        >
          <span className="text-sm font-display font-bold text-white whitespace-nowrap">
            Profile & Cloud Save
          </span>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-mono text-[#B8B8B8] truncate">
              {profileSummaryText}
            </span>
            <ChevronDown
              className={`w-4 h-4 text-[#B8B8B8] shrink-0 transition-transform duration-150 ${
                openPanel === 'profile' ? 'rotate-180 text-[#FF1493]' : ''
              }`}
            />
          </div>
        </button>

        {openPanel === 'profile' && (
          <div className="px-4 pb-4 pt-1 border-t border-white/10 space-y-4">
            {isSignedIn ? (
              /* SIGNED-IN STATE: Sign-in forms hidden; displays active account + Log Out */
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-xl emoji-opaque-pod p-0.5 overflow-hidden shrink-0">
                      <img
                        src={profile?.picture || defaultAvatarUrl}
                        alt="Nostr profile avatar"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = defaultAvatarUrl;
                        }}
                        className="w-full h-full rounded-[10px] object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-base font-display font-bold text-white truncate">
                        {profile?.displayName ||
                          profile?.name ||
                          formatShortNpub(coordinator.pubkey)}
                      </div>
                      {profile?.nip05 && (
                        <div className="text-xs font-mono text-[#FFB6D9] truncate">
                          {profile.nip05}
                        </div>
                      )}
                      <div className="text-xs text-[#B8B8B8] mt-0.5">
                        Signed in via {signerLabel} · Player Lv.{playerLevel} ({playerXp}/{playerXpNext} XP)
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-[#1A1A1A] border border-white/15 hover:border-[#FF1493] text-xs font-semibold text-white transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <LogOut className="w-3.5 h-3.5 text-[#FF1493]" />
                    <span>Log Out</span>
                  </button>
                </div>

                <div className="p-2.5 rounded-lg bg-black border border-white/10 flex items-center justify-between gap-2">
                  <code className="text-[11px] font-mono text-[#B8B8B8] truncate">
                    {fullNpub}
                  </code>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => void copyText(fullNpub, 'npub')}
                      className="text-xs text-white/80 hover:text-white inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      {copiedField === 'npub' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedField === 'npub' ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={busyAction === 'profile'}
                      onClick={() => void handleRefreshProfile()}
                      className="text-xs text-[#B8B8B8] hover:text-white inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${busyAction === 'profile' ? 'animate-spin' : ''}`}
                      />
                      <span>Sync</span>
                    </button>
                  </div>
                </div>

                {coordinator.signerMode === 'nsec' && coordinator.exportCurrentNsec() && (
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setRevealedNsec((prev) =>
                          prev ? null : coordinator.exportCurrentNsec()
                        )
                      }
                      className="text-xs text-[#FF9900] hover:underline inline-flex items-center gap-1.5"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>{revealedNsec ? 'Hide Secret Key' : 'Reveal Backup nsec'}</span>
                    </button>
                    {revealedNsec && (
                      <div className="px-2.5 py-1.5 rounded bg-black border border-white/10 flex items-center justify-between gap-2">
                        <code className="text-[10px] font-mono text-[#FF9900] truncate">
                          {revealedNsec}
                        </code>
                        <button
                          type="button"
                          onClick={() => void copyText(revealedNsec, 'nsec')}
                          className="text-[11px] text-white shrink-0"
                        >
                          {copiedField === 'nsec' ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* LOGGED-OUT (GUEST) STATE: Shows Guest bar + Sign-In options */
              <div className="space-y-3 pt-2">
                <div className="p-2.5 rounded-lg bg-black border border-white/10 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white">
                        Guest Mode · Player Lv.{playerLevel} ({mojoBalance.toLocaleString()} Mojo)
                      </div>
                      <div className="text-[11px] font-mono text-[#B8B8B8] truncate">
                        {formatShortNpub(coordinator.pubkey)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => void copyText(fullNpub, 'npub')}
                        className="min-h-[34px] px-2.5 py-1 rounded bg-[#111111] border border-white/15 text-xs text-white whitespace-nowrap"
                      >
                        {copiedField === 'npub' ? 'Copied' : 'Copy npub'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setRevealedNsec((prev) =>
                            prev ? null : coordinator.exportCurrentNsec()
                          )
                        }
                        className="min-h-[34px] px-2.5 py-1 rounded bg-[#111111] border border-[#FF1493]/40 text-xs text-[#FFB6D9] hover:text-white inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <KeyRound className="w-3 h-3 text-[#FF1493]" />
                        <span>{revealedNsec ? 'Hide nsec' : 'Reveal nsec'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRevealedNsec(null);
                          coordinator.generateFreshGuestKey();
                          setStatusMessage('Rotated new local Guest Key.');
                        }}
                        className="min-h-[34px] px-2.5 py-1 rounded bg-[#111111] border border-white/15 text-xs text-[#B8B8B8] hover:text-white whitespace-nowrap"
                      >
                        New Guest
                      </button>
                    </div>
                  </div>

                  {revealedNsec && (
                    <div className="px-2.5 py-1.5 rounded bg-[#111111] border border-[#FF1493]/35 flex items-center justify-between gap-2">
                      <code className="text-[10px] font-mono text-[#FFB6D9] truncate">
                        {revealedNsec}
                      </code>
                      <button
                        type="button"
                        onClick={() => void copyText(revealedNsec, 'nsec')}
                        className="text-[11px] font-semibold text-white hover:text-[#FF1493] shrink-0"
                      >
                        {copiedField === 'nsec' ? 'Copied!' : 'Copy nsec'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="text-xs font-semibold text-[#B8B8B8] pt-1">
                  Sign in with Nostr
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Android Amber (NIP-55 Primary Intent Path) */}
                  <div className="rounded-lg bg-black border border-white/10 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-white">
                          Android Amber (NIP-55)
                        </div>
                        <div className="text-[11px] text-[#B8B8B8]">
                          {androidAvailable
                            ? 'nostrsigner: external signer'
                            : 'Android external signer URI'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleLaunchNip55PublicKey}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] text-xs font-semibold text-white inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open Amber</span>
                      </button>
                    </div>

                    {pendingNip55?.purpose === 'get_public_key' && (
                      <div className="p-2 rounded bg-[#111111] border border-[#00F0FF]/35 flex items-center justify-between gap-2 text-[11px] text-[#00F0FF]">
                        <span>Awaiting Amber approval…</span>
                        <button
                          type="button"
                          onClick={() => coordinator.clearPendingNip55Request()}
                          className="text-white/80 hover:text-white inline-flex items-center gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Cancel</span>
                        </button>
                      </div>
                    )}

                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={nip55PubkeyInput}
                        onChange={(e) => setNip55PubkeyInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleBindNip55();
                          }
                        }}
                        placeholder="Or paste Amber npub1… / hex"
                        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md bg-[#111111] border border-white/15 text-xs font-mono text-white"
                      />
                      <button
                        type="button"
                        onClick={handleBindNip55}
                        disabled={!nip55PubkeyInput.trim()}
                        className="min-h-[36px] px-2.5 py-1.5 rounded-md bg-[#1A1A1A] border border-white/15 hover:border-white/40 disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                      >
                        Bind
                      </button>
                    </div>
                  </div>

                  {/* NIP-46 Remote Signer (Same-Phone Copy URI + QR + Bunker) */}
                  <div className="rounded-lg bg-black border border-white/10 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-white">
                        Remote Signer (NIP-46)
                      </span>
                      <span className="text-[11px] font-mono text-[#B8B8B8]">
                        Amber · Primal · Bunker
                      </span>
                    </div>

                    {!nostrConnectUri ? (
                      <button
                        type="button"
                        onClick={() => void startOrResumeNip46Session(false, true)}
                        className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>Create & Copy Pairing Link</span>
                      </button>
                    ) : (
                      <div className="p-2.5 rounded-lg bg-[#111111] border border-[#FF1493]/40 space-y-2">
                        <div className="flex items-center gap-2.5">
                          {nostrConnectQr && (
                            <img
                              src={nostrConnectQr}
                              alt="NIP-46 Nostr Connect QR"
                              className="w-20 h-20 rounded bg-black border border-white/15 shrink-0"
                            />
                          )}
                          <div className="min-w-0 space-y-1.5 flex-1">
                            <p className="text-[11px] text-white leading-snug">
                              Paste link into your signer app, approve, and switch back here:
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={() => void copyText(nostrConnectUri, 'nc')}
                                className="min-h-[32px] px-2.5 py-1 rounded bg-black border border-white/20 text-xs font-mono text-[#00F0FF] inline-flex items-center gap-1 whitespace-nowrap"
                              >
                                {copiedField === 'nc' ? (
                                  <Check className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                                <span>{copiedField === 'nc' ? 'Copied!' : 'Copy Pairing URI'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelNip46Pairing}
                                className="min-h-[32px] px-2 py-1 rounded bg-black border border-white/15 text-xs text-[#B8B8B8] hover:text-white whitespace-nowrap"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={bunkerInput}
                        onChange={(e) => setBunkerInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleConnectBunker();
                          }
                        }}
                        placeholder="bunker://pubkey?relay=wss://..."
                        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md bg-[#111111] border border-white/15 text-xs font-mono text-white"
                      />
                      <button
                        type="button"
                        onClick={() => void handleConnectBunker()}
                        disabled={busyAction === 'bunker' || !bunkerInput.trim()}
                        className="min-h-[36px] px-2.5 py-1.5 rounded-md bg-[#1A1A1A] border border-white/15 hover:border-white/40 disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                      >
                        {busyAction === 'bunker' ? '…' : 'Connect'}
                      </button>
                    </div>
                  </div>

                  {/* NIP-07 Extension */}
                  <div className="rounded-lg bg-black border border-white/10 p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white">
                        Browser Extension (NIP-07)
                      </div>
                      <div className="text-[11px] font-mono text-[#B8B8B8] truncate">
                        {nip07Available ? 'Detected' : 'Not detected in window'}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busyAction === 'nip07'}
                      onClick={() => void handleConnectNip07()}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#1A1A1A] border border-white/15 hover:border-[#FF1493] disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                    >
                      {busyAction === 'nip07' ? 'Wait…' : 'Sign In'}
                    </button>
                  </div>

                  {/* Secret Key Import */}
                  <div className="rounded-lg bg-black border border-white/10 p-3 space-y-2">
                    <div className="text-xs font-semibold text-white">Secret Key (nsec)</div>
                    <div className="flex gap-1.5">
                      <input
                        type="password"
                        value={nsecImportInput}
                        onChange={(e) => setNsecImportInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleImportNsec();
                          }
                        }}
                        placeholder="nsec1…"
                        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md bg-[#111111] border border-white/15 text-xs font-mono text-white"
                      />
                      <button
                        type="button"
                        onClick={handleImportNsec}
                        disabled={!nsecImportInput.trim()}
                        className="min-h-[36px] px-2.5 py-1.5 rounded-md bg-[#1A1A1A] border border-white/15 hover:border-white/40 disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                      >
                        Import
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* CROSS-DEVICE NOSTR PROGRESSION SYNC (`kind: 30078`, `d: mojisurvivor:progress:v1`) */}
            <div className="pt-3 border-t border-white/10 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white">
                    Nostr Cross-Device Progression Sync
                  </div>
                  <div className="text-[11px] font-mono text-[#B8B8B8] truncate">
                    kind:30078 · d:{PROGRESS_SNAPSHOT_D_TAG}
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={progressSync.enabled}
                  onClick={() => onToggleProgressSync(!progressSync.enabled)}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-black border border-white/15 hover:border-white/35 text-xs font-mono font-semibold flex items-center gap-2 shrink-0"
                >
                  <span className="text-white">Auto-Sync</span>
                  <span
                    className={
                      progressSync.enabled ? 'text-[#FF1493]' : 'text-[#5E5E5E]'
                    }
                  >
                    {progressSync.enabled ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>

              <p className="text-xs text-[#B8B8B8] leading-relaxed">
                Publishes permanent game state (Player Level, Mojo ledger, purchased upgrades, and unlocked Codex metadata) publicly to your relays so any signed-in device can restore and merge your save. Private keys and pairing secrets are never included.
              </p>

              <div className="p-2.5 rounded-lg bg-black border border-white/10 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums">
                  <span className="text-[#B8B8B8]">
                    Status:{' '}
                    <span className="text-white">
                      {progressSync.status === 'idle' && (progressSync.dirty ? 'Local changes unsynced' : 'Local save up to date')}
                      {progressSync.status === 'signing' && 'Signing snapshot…'}
                      {progressSync.status === 'queued_offline' && 'Signed · Queued offline'}
                      {progressSync.status === 'publishing' && 'Publishing to relays…'}
                      {progressSync.status === 'confirmed' &&
                        `Synced (${progressSync.acceptedRelays.length} relay${progressSync.acceptedRelays.length === 1 ? '' : 's'})`}
                      {progressSync.status === 'rejected' && 'Relay rejected snapshot'}
                      {progressSync.status === 'failed' && 'Sync incomplete (retryable)'}
                    </span>
                  </span>
                  {progressSync.lastSyncedAt && (
                    <span className="text-[11px] text-[#B8B8B8]">
                      Last sync {new Date(progressSync.lastSyncedAt).toLocaleTimeString()}
                    </span>
                  )}
                </div>

                {progressSync.lastError && (
                  <p className="text-xs text-amber-300">{progressSync.lastError}</p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busyAction === 'sync_progress'}
                    onClick={() => void handleSyncProgressClick()}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] disabled:opacity-50 text-xs font-semibold text-white inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <CloudUpload className="w-3.5 h-3.5" />
                    <span>
                      {busyAction === 'sync_progress'
                        ? 'Syncing…'
                        : coordinator.signerMode === 'nip55'
                          ? 'Sign Save in Amber'
                          : 'Save Snapshot to Relays'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={busyAction === 'restore_progress'}
                    onClick={() => void handleRestoreProgressClick()}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#1A1A1A] border border-white/15 hover:border-[#00F0FF] disabled:opacity-50 text-xs font-semibold text-white inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <CloudDownload className="w-3.5 h-3.5 text-[#00F0FF]" />
                    <span>
                      {busyAction === 'restore_progress'
                        ? 'Checking Relays…'
                        : 'Restore & Merge Save'}
                    </span>
                  </button>
                </div>

                {coordinator.signerMode === 'nip55' && (
                  <div className="pt-2 border-t border-white/10 space-y-1.5">
                    <p className="text-[11px] text-[#B8B8B8]">
                      Paste Amber&apos;s signed progression event or 128-hex signature if Web2App does not auto-callback:
                    </p>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={nip55ProgressPaste}
                        onChange={(e) => setNip55ProgressPaste(e.target.value)}
                        placeholder='Paste signed {"id":...,"sig":...} or hex sig'
                        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md bg-[#111111] border border-white/15 text-xs font-mono text-white"
                      />
                      <button
                        type="button"
                        disabled={!nip55ProgressPaste.trim() || busyAction === 'sync_progress'}
                        onClick={() => void handleNip55ProgressPasteSubmit()}
                        className="min-h-[36px] px-3 py-1.5 rounded-md bg-[#1A1A1A] border border-white/20 text-xs font-semibold text-white whitespace-nowrap"
                      >
                        Broadcast
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ACCORDION 2: RELAYS (AUTO-PROBE DISCOVERY + MANUAL OVERRIDE) */}
      <div className="rounded-xl bg-[#111111] border border-white/10 overflow-hidden">
        <button
          type="button"
          aria-expanded={openPanel === 'relays'}
          onClick={() => togglePanel('relays')}
          className="w-full min-h-[48px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02] transition-colors"
        >
          <span className="text-sm font-display font-bold text-white whitespace-nowrap">
            Relays
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono tabular-nums text-[#B8B8B8]">
              {relays.length} active · {settings.autoManageRelays !== false ? 'Auto' : 'Manual'}
            </span>
            <ChevronDown
              className={`w-4 h-4 text-[#B8B8B8] shrink-0 transition-transform duration-150 ${
                openPanel === 'relays' ? 'rotate-180 text-[#FF1493]' : ''
              }`}
            />
          </div>
        </button>

        {openPanel === 'relays' && (
          <div className="px-4 pb-4 pt-3 border-t border-white/10 space-y-3">
            <div className="p-3 rounded-lg bg-black border border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <div className="text-xs font-semibold text-white">
                  Automatic Public Relay Discovery &amp; Health Pruning
                </div>
                <p className="text-[11px] text-[#B8B8B8]">
                  Probes free public relays on startup for WebSocket reachability and event kinds (<code className="font-mono text-white">30030</code>, <code className="font-mono text-white">10030</code>, <code className="font-mono text-white">30078</code>), prioritizing <code className="font-mono text-[#00F0FF]">wss://relay.primal.net</code> and dropping unresponsive or paid relays. Toggle OFF to configure custom relays manually.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={busyAction === 'scan_relays' || coordinator.probingRelays}
                  onClick={() => void handleScanRelaysNow()}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#111111] border border-white/15 hover:border-[#00F0FF] disabled:opacity-50 text-xs font-semibold text-white inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 text-[#00F0FF] ${
                      busyAction === 'scan_relays' || coordinator.probingRelays
                        ? 'animate-spin'
                        : ''
                    }`}
                  />
                  <span>
                    {busyAction === 'scan_relays' || coordinator.probingRelays
                      ? 'Scanning…'
                      : 'Scan Relays'}
                  </span>
                </button>

                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.autoManageRelays !== false}
                  onClick={() =>
                    handleToggleAutoManageRelays(settings.autoManageRelays === false)
                  }
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#111111] border border-white/15 hover:border-[#FF1493] text-xs font-mono font-semibold flex items-center gap-2 shrink-0"
                >
                  <span className="text-white">Auto-Manage</span>
                  <span
                    className={
                      settings.autoManageRelays !== false
                        ? 'text-[#FF1493]'
                        : 'text-[#5E5E5E]'
                    }
                  >
                    {settings.autoManageRelays !== false ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>
            </div>

            {settings.autoManageRelays === false && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newRelayInput}
                  onChange={(e) => setNewRelayInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddRelay();
                    }
                  }}
                  placeholder="wss://relay.primal.net"
                  className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-black border border-white/15 text-xs font-mono text-white"
                />
                <button
                  type="button"
                  onClick={handleAddRelay}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] text-xs font-semibold text-white flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Relay</span>
                </button>
              </div>
            )}

            <div className="divide-y divide-white/10 rounded-lg bg-black border border-white/10">
              {relays.map((url) => {
                const reach = coordinator.relayReachability.get(url) ?? 'idle';
                const probe = coordinator.relayHealth.get(url);
                return (
                  <div
                    key={url}
                    className="px-3 py-2.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-white truncate">{url}</span>
                      <span
                        className={`text-[11px] font-mono shrink-0 ${
                          reach === 'ok'
                            ? 'text-emerald-400'
                            : reach === 'error'
                              ? 'text-amber-400'
                              : 'text-[#B8B8B8]'
                        }`}
                      >
                        {reach === 'ok'
                          ? `· Online${probe?.latencyMs ? ` (${probe.latencyMs}ms)` : ''}`
                          : reach === 'error'
                            ? '· Unreachable'
                            : '· Ready'}
                      </span>
                    </div>
                    {settings.autoManageRelays === false && (
                      <button
                        type="button"
                        onClick={() => handleRemoveRelay(url)}
                        aria-label={`Remove ${url}`}
                        className="min-h-[34px] min-w-[34px] flex items-center justify-center text-[#B8B8B8] hover:text-white shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ACCORDION 3: MODERATION (NSFW HASH & NPUB BAN LISTS, SAFE LIST & RELAY REPORTS) */}
      <div className="rounded-xl bg-[#111111] border border-white/10 overflow-hidden">
        {(() => {
          const builtInBans = Array.from(getBuiltInBannedHexSet());
          const builtInHashBans = Array.from(getBuiltInBannedHashesSet());
          const builtInSafe = Array.from(getBuiltInSafeHexSet());
          const allBannedHex = Array.from(new Set([...builtInBans, ...nsfwBanPubkeys]));
          const allBannedHashes = Array.from(
            new Set([...builtInHashBans, ...nsfwBanEmojiHashes])
          );
          const allSafeHex = Array.from(new Set([...builtInSafe, ...safePackAuthors]));
          const nsfwReportCount = relayReports.filter(
            (r) => r.verdict === 'nsfw_ban' || r.verdict === 'nsfw_hash'
          ).length;
          const filteredReports = relayReports.filter((r) => {
            if (reportTab === 'all') return true;
            if (reportTab === 'nsfw') {
              return r.verdict === 'nsfw_ban' || r.verdict === 'nsfw_hash';
            }
            return r.verdict === 'safe_nomination';
          });

          return (
            <>
              <button
                type="button"
                aria-expanded={openPanel === 'moderation'}
                onClick={() => togglePanel('moderation')}
                className="w-full min-h-[48px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02] transition-colors"
              >
                <span className="text-sm font-display font-bold text-white whitespace-nowrap">
                  Moderation (Ban &amp; Safe Lists)
                </span>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-mono text-[#B8B8B8] truncate">
                    {allBannedHex.length} npubs · {allBannedHashes.length} hashes · {allSafeHex.length} safe
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-[#B8B8B8] shrink-0 transition-transform duration-150 ${
                      openPanel === 'moderation' ? 'rotate-180 text-[#FF1493]' : ''
                    }`}
                  />
                </div>
              </button>

              {openPanel === 'moderation' && (
                <div className="px-4 pb-4 pt-3 border-t border-white/10 space-y-3.5">
                  {/* Discovery Mode Selector */}
                  <div className="p-3 rounded-lg bg-black border border-white/10 flex flex-wrap items-center justify-between gap-2.5">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white">
                        NIP-30 Discovery Filter Mode
                      </div>
                      <p className="text-[11px] text-[#B8B8B8] mt-0.5">
                        Default mode keeps all live Nostr custom emojis active and privately filters out banned SHA-256 hashes &amp; npubs.
                      </p>
                    </div>

                    <div
                      role="group"
                      aria-label="Emoji moderation filter mode"
                      className="inline-flex items-center p-0.5 rounded-lg bg-[#111111] border border-white/15"
                    >
                      {(
                        [
                          ['open_with_banlist', 'Live Nostr + Ban List'],
                          ['safe_list_only', 'Safe List Only'],
                        ] as const satisfies readonly [EmojiFilterMode, string][]
                      ).map(([modeKey, label]) => (
                        <button
                          key={modeKey}
                          type="button"
                          onClick={() =>
                            onUpdateSettings({
                              ...settings,
                              emojiFilterMode: modeKey,
                            })
                          }
                          className={`min-h-[32px] px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                            settings.emojiFilterMode === modeKey
                              ? 'bg-[#FF1493] text-white'
                              : 'text-[#B8B8B8] hover:text-white'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Private NSFW Emoji SHA-256 Hash Ban List */}
                  <div className="p-3 rounded-lg bg-black border border-white/10 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                          <Hash className="w-3.5 h-3.5 text-[#FF1493]" />
                          <span>NSFW Emoji SHA-256 Hash Ban List ({allBannedHashes.length})</span>
                        </div>
                        <p className="text-[11px] text-[#B8B8B8] mt-0.5">
                          Blocks an exact emoji image hash everywhere (even if reposted across different packs or user lists) and publishes an anonymous NIP-94 <code className="font-mono text-white">x</code>-hash report.
                        </p>
                      </div>

                      {allBannedHashes.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            void copyText(
                              JSON.stringify(allBannedHashes, null, 2),
                              'ban_hash_json'
                            )
                          }
                          className="min-h-[32px] px-2.5 py-1 rounded bg-[#111111] border border-white/15 hover:border-white/40 text-xs font-mono text-white inline-flex items-center gap-1 shrink-0"
                        >
                          {copiedField === 'ban_hash_json' ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>
                            {copiedField === 'ban_hash_json' ? 'Copied JSON' : 'Copy Ban Hashes'}
                          </span>
                        </button>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={banHashInput}
                        onChange={(e) => setBanHashInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (!banHashInput.trim()) return;
                            onReportAndBanEmojiHash({ emojiHash: banHashInput.trim() });
                            setBanHashInput('');
                          }
                        }}
                        placeholder="64-char SHA-256 emoji hash (#… or https://…)"
                        className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-[#111111] border border-white/15 text-xs font-mono text-white"
                      />
                      <button
                        type="button"
                        disabled={!banHashInput.trim()}
                        onClick={() => {
                          if (!banHashInput.trim()) return;
                          onReportAndBanEmojiHash({ emojiHash: banHashInput.trim() });
                          setBanHashInput('');
                        }}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                      >
                        Ban &amp; Report Hash
                      </button>
                    </div>

                    {allBannedHashes.length > 0 && (
                      <div className="divide-y divide-white/10 rounded-lg bg-[#111111] border border-white/10 max-h-40 overflow-y-auto">
                        {allBannedHashes.map((hashHex) => {
                          const isBuiltIn = builtInHashBans.includes(hashHex);
                          return (
                            <div
                              key={hashHex}
                              className="px-3 py-2 flex items-center justify-between gap-2 text-xs font-mono"
                            >
                              <div className="min-w-0 flex items-center gap-2">
                                <span className="text-white truncate">
                                  #{hashHex.slice(0, 12)}…{hashHex.slice(-6)}
                                </span>
                                <span className="text-[11px] text-[#8E8E8E] shrink-0">
                                  · {isBuiltIn ? 'Built-in' : 'Private Local'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void copyText(hashHex, `ban_hash_${hashHex}`)
                                  }
                                  className="min-h-[28px] px-2 rounded bg-black border border-white/15 text-[11px] text-[#B8B8B8] hover:text-white inline-flex items-center gap-1"
                                >
                                  {copiedField === `ban_hash_${hashHex}` ? (
                                    <Check className="w-3 h-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                  <span>Hash</span>
                                </button>
                                {!isBuiltIn && (
                                  <button
                                    type="button"
                                    onClick={() => onUnbanEmojiHash(hashHex)}
                                    className="min-h-[28px] px-2 rounded bg-black border border-white/15 text-[11px] text-[#B8B8B8] hover:text-white"
                                  >
                                    Unban
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Private NSFW npub Ban List + Anonymous Report */}
                  <div className="p-3 rounded-lg bg-black border border-white/10 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                          <Ban className="w-3.5 h-3.5 text-[#FF1493]" />
                          <span>NSFW Publisher npub Ban List ({allBannedHex.length})</span>
                        </div>
                        <p className="text-[11px] text-[#B8B8B8] mt-0.5">
                          Privately filters all packs from a reported publisher on your device and publishes an anonymous report to relays for review.
                        </p>
                      </div>

                      {allBannedHex.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            void copyText(
                              JSON.stringify(allBannedHex.map(pubkeyHexToNpub), null, 2),
                              'ban_json'
                            )
                          }
                          className="min-h-[32px] px-2.5 py-1 rounded bg-[#111111] border border-white/15 hover:border-white/40 text-xs font-mono text-white inline-flex items-center gap-1 shrink-0"
                        >
                          {copiedField === 'ban_json' ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>
                            {copiedField === 'ban_json' ? 'Copied JSON' : 'Copy Ban npubs'}
                          </span>
                        </button>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={banNpubInput}
                        onChange={(e) => setBanNpubInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (!banNpubInput.trim()) return;
                            onReportAndBanAuthor({ pubkeyOrNpub: banNpubInput.trim() });
                            setBanNpubInput('');
                          }
                        }}
                        placeholder="npub1… or 64-char hex pubkey"
                        className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-[#111111] border border-white/15 text-xs font-mono text-white"
                      />
                      <button
                        type="button"
                        disabled={!banNpubInput.trim()}
                        onClick={() => {
                          if (!banNpubInput.trim()) return;
                          onReportAndBanAuthor({ pubkeyOrNpub: banNpubInput.trim() });
                          setBanNpubInput('');
                        }}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                      >
                        Ban &amp; Report
                      </button>
                    </div>

                    {allBannedHex.length > 0 && (
                      <div className="divide-y divide-white/10 rounded-lg bg-[#111111] border border-white/10 max-h-40 overflow-y-auto">
                        {allBannedHex.map((hex) => {
                          const fullNpub = pubkeyHexToNpub(hex);
                          const isBuiltIn = builtInBans.includes(hex);
                          return (
                            <div
                              key={hex}
                              className="px-3 py-2 flex items-center justify-between gap-2 text-xs font-mono"
                            >
                              <div className="min-w-0 flex items-center gap-2">
                                <span className="text-white truncate">
                                  {formatShortNpub(hex)}
                                </span>
                                <span className="text-[11px] text-[#8E8E8E] shrink-0">
                                  · {isBuiltIn ? 'Built-in' : 'Private Local'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => void copyText(fullNpub, `ban_${hex}`)}
                                  aria-label={`Copy ${fullNpub}`}
                                  className="min-h-[28px] px-2 rounded bg-black border border-white/15 text-[11px] text-[#B8B8B8] hover:text-white inline-flex items-center gap-1"
                                >
                                  {copiedField === `ban_${hex}` ? (
                                    <Check className="w-3 h-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                  <span>npub</span>
                                </button>
                                {!isBuiltIn && (
                                  <button
                                    type="button"
                                    onClick={() => onUnbanAuthor(hex)}
                                    className="min-h-[28px] px-2 rounded bg-black border border-white/15 text-[11px] text-[#B8B8B8] hover:text-white"
                                  >
                                    Unban
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Verified Safe List (Grows Over Time) */}
                  <div className="p-3 rounded-lg bg-black border border-white/10 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-[#00F0FF]" />
                          <span>Verified Safe List ({allSafeHex.length})</span>
                        </div>
                        <p className="text-[11px] text-[#B8B8B8] mt-0.5">
                          Trusted custom emoji pack creators curated over time for Safe List Only mode.
                        </p>
                      </div>

                      {allSafeHex.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            void copyText(
                              JSON.stringify(allSafeHex.map(pubkeyHexToNpub), null, 2),
                              'safe_json'
                            )
                          }
                          className="min-h-[32px] px-2.5 py-1 rounded bg-[#111111] border border-white/15 hover:border-white/40 text-xs font-mono text-white inline-flex items-center gap-1 shrink-0"
                        >
                          {copiedField === 'safe_json' ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>
                            {copiedField === 'safe_json' ? 'Copied JSON' : 'Copy Safe npubs'}
                          </span>
                        </button>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={safeNpubInput}
                        onChange={(e) => setSafeNpubInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (!safeNpubInput.trim()) return;
                            onAddSafeAuthor({
                              pubkeyOrNpub: safeNpubInput.trim(),
                              publishNomination: true,
                            });
                            setSafeNpubInput('');
                          }
                        }}
                        placeholder="npub1… or 64-char hex pubkey"
                        className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-[#111111] border border-white/15 text-xs font-mono text-white"
                      />
                      <button
                        type="button"
                        disabled={!safeNpubInput.trim()}
                        onClick={() => {
                          if (!safeNpubInput.trim()) return;
                          onAddSafeAuthor({
                            pubkeyOrNpub: safeNpubInput.trim(),
                            publishNomination: true,
                          });
                          setSafeNpubInput('');
                        }}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#1A1A1A] border border-[#00F0FF]/40 hover:border-[#00F0FF] disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                      >
                        Add Safe npub
                      </button>
                    </div>

                    {allSafeHex.length > 0 && (
                      <div className="divide-y divide-white/10 rounded-lg bg-[#111111] border border-white/10 max-h-40 overflow-y-auto">
                        {allSafeHex.map((hex) => {
                          const fullNpub = pubkeyHexToNpub(hex);
                          const isBuiltIn = builtInSafe.includes(hex);
                          return (
                            <div
                              key={hex}
                              className="px-3 py-2 flex items-center justify-between gap-2 text-xs font-mono"
                            >
                              <div className="min-w-0 flex items-center gap-2">
                                <span className="text-[#00F0FF] truncate">
                                  {formatShortNpub(hex)}
                                </span>
                                <span className="text-[11px] text-[#8E8E8E] shrink-0">
                                  · {isBuiltIn ? 'Built-in' : 'Saved'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => void copyText(fullNpub, `safe_${hex}`)}
                                  className="min-h-[28px] px-2 rounded bg-black border border-white/15 text-[11px] text-[#B8B8B8] hover:text-white inline-flex items-center gap-1"
                                >
                                  {copiedField === `safe_${hex}` ? (
                                    <Check className="w-3 h-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                  <span>npub</span>
                                </button>
                                {!isBuiltIn && (
                                  <button
                                    type="button"
                                    onClick={() => onRemoveSafeAuthor(hex)}
                                    className="min-h-[28px] px-2 rounded bg-black border border-white/15 text-[11px] text-[#B8B8B8] hover:text-white"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Curator Blocklist JSON Importer (`moji-curator-blocklist/v1`) */}
                  {onImportCuratorBlocklist && (
                    <div className="p-3 rounded-lg bg-black border border-white/10 space-y-2">
                      <div className="text-xs font-semibold text-white">
                        Import Curator Blocklist JSON (moji-curator-blocklist/v1)
                      </div>
                      <p className="text-[11px] text-[#B8B8B8]">
                        Paste a <code className="font-mono text-white">moji-curator-blocklist/v1</code> JSON payload to batch-import <code className="font-mono text-white">blockedPublishers</code> and hash-ban <code className="font-mono text-white">blocked[].url</code> entries on your device.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <textarea
                          rows={2}
                          value={curatorJsonInput}
                          onChange={(e) => setCuratorJsonInput(e.target.value)}
                          placeholder='{"format":"moji-curator-blocklist/v1","blocked":[...],"blockedPublishers":[...]}'
                          className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-[#111111] border border-white/15 text-xs font-mono text-white"
                        />
                        <button
                          type="button"
                          disabled={!curatorJsonInput.trim()}
                          onClick={handleImportCuratorJson}
                          className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap shrink-0 self-end sm:self-stretch"
                        >
                          Import Blocklist
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Published Relay Reports (`kind:30078 #t:mojisurvivor-mod`) — Audit Queue */}
                  <div className="p-3 rounded-lg bg-black border border-white/10 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white">
                          Published Relay Reports (#t:{MODERATION_REPORT_TOPIC})
                        </div>
                        <p className="text-[11px] text-[#B8B8B8] mt-0.5">
                          Text-only audit feed of anonymously reported SHA-256 emoji hashes, NSFW npubs &amp; Safe List nominations on your relays.
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={coordinator.syncingModerationReports}
                        onClick={() => void onRefreshModerationReports()}
                        className="min-h-[34px] px-3 py-1 rounded-lg bg-[#111111] border border-white/15 hover:border-[#FF1493] disabled:opacity-50 text-xs font-semibold text-white inline-flex items-center gap-1.5 shrink-0"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${
                            coordinator.syncingModerationReports ? 'animate-spin' : ''
                          }`}
                        />
                        <span>Check Relays</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#111111] border border-white/10 w-fit">
                      {(
                        [
                          ['all', `All (${relayReports.length})`],
                          ['nsfw', `NSFW Reports (${nsfwReportCount})`],
                          [
                            'safe_nomination',
                            `Safe Nominations (${relayReports.filter((r) => r.verdict === 'safe_nomination').length})`,
                          ],
                        ] as const
                      ).map(([tabKey, label]) => (
                        <button
                          key={tabKey}
                          type="button"
                          onClick={() => setReportTab(tabKey)}
                          className={`min-h-[28px] px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                            reportTab === tabKey
                              ? 'bg-[#FF1493] text-white'
                              : 'text-[#B8B8B8] hover:text-white'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {filteredReports.length === 0 ? (
                      <div className="py-4 px-3 rounded-lg bg-[#111111] border border-white/10 text-center text-xs text-[#9E9E9E]">
                        No published moderation reports found on connected relays yet.
                      </div>
                    ) : (
                      <div className="divide-y divide-white/10 rounded-lg bg-[#111111] border border-white/10 max-h-56 overflow-y-auto">
                        {filteredReports.map((rep) => {
                          const isAuthorBanned = rep.targetPubkey
                            ? allBannedHex.includes(rep.targetPubkey)
                            : false;
                          const isHashBanned = rep.emojiHash
                            ? allBannedHashes.includes(rep.emojiHash)
                            : false;
                          const isSafe = rep.targetPubkey
                            ? allSafeHex.includes(rep.targetPubkey)
                            : false;

                          return (
                            <div
                              key={rep.key}
                              className="p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                            >
                              <div className="min-w-0 space-y-0.5">
                                <div className="flex flex-wrap items-center gap-1.5 font-mono">
                                  <span
                                    className={
                                      rep.verdict === 'safe_nomination'
                                        ? 'text-[#00F0FF] font-semibold'
                                        : 'text-[#FF1493] font-semibold'
                                    }
                                  >
                                    {rep.verdict === 'nsfw_hash'
                                      ? 'NSFW Hash'
                                      : rep.verdict === 'nsfw_ban'
                                        ? 'NSFW npub'
                                        : 'Safe Nominee'}
                                  </span>
                                  {rep.emojiHash && (
                                    <>
                                      <span className="text-[#666666]">·</span>
                                      <span className="text-white">
                                        #{rep.emojiHash.slice(0, 10)}
                                      </span>
                                    </>
                                  )}
                                  {rep.targetPubkey && (
                                    <>
                                      <span className="text-[#666666]">·</span>
                                      <span className="text-white">
                                        {formatShortNpub(rep.targetPubkey)}
                                      </span>
                                    </>
                                  )}
                                  <span className="text-[#8E8E8E]">
                                    ({rep.reportCount}x)
                                  </span>
                                </div>
                                <div className="text-[11px] text-[#B8B8B8] truncate">
                                  {rep.packTitle
                                    ? `Pack: ${rep.packTitle}`
                                    : rep.verdict === 'nsfw_hash'
                                      ? 'NIP-94 SHA-256 Media Hash'
                                      : 'NIP-30 Publisher'}
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                {rep.emojiHash && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void copyText(
                                        rep.emojiHash!,
                                        `rep_hash_${rep.key}`
                                      )
                                    }
                                    className="min-h-[30px] px-2 rounded bg-black border border-white/15 text-[11px] font-mono text-[#B8B8B8] hover:text-white inline-flex items-center gap-1"
                                  >
                                    {copiedField === `rep_hash_${rep.key}` ? (
                                      <Check className="w-3 h-3 text-emerald-400" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                    <span>Hash</span>
                                  </button>
                                )}

                                {rep.targetNpub && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void copyText(
                                        rep.targetNpub!,
                                        `rep_npub_${rep.key}`
                                      )
                                    }
                                    className="min-h-[30px] px-2 rounded bg-black border border-white/15 text-[11px] font-mono text-[#B8B8B8] hover:text-white inline-flex items-center gap-1"
                                  >
                                    {copiedField === `rep_npub_${rep.key}` ? (
                                      <Check className="w-3 h-3 text-emerald-400" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                    <span>npub</span>
                                  </button>
                                )}

                                {rep.emojiHash && !isHashBanned && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onReportAndBanEmojiHash({
                                        emojiHash: rep.emojiHash!,
                                        targetPubkeyOrNpub: rep.targetPubkey,
                                        packTitle: rep.packTitle,
                                        packDTag: rep.packDTag,
                                      })
                                    }
                                    className="min-h-[30px] px-2.5 rounded bg-black border border-[#FF1493]/50 hover:bg-[#FF1493] text-[11px] font-semibold text-white"
                                  >
                                    Ban Hash
                                  </button>
                                )}

                                {rep.targetPubkey && !isAuthorBanned && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onReportAndBanAuthor({
                                        pubkeyOrNpub: rep.targetPubkey!,
                                        packTitle: rep.packTitle,
                                        packDTag: rep.packDTag,
                                        emojiHash: rep.emojiHash,
                                      })
                                    }
                                    className="min-h-[30px] px-2.5 rounded bg-black border border-[#FF1493]/50 hover:bg-[#FF1493] text-[11px] font-semibold text-white"
                                  >
                                    Ban npub
                                  </button>
                                )}

                                {rep.targetPubkey && !isSafe && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onAddSafeAuthor({
                                        pubkeyOrNpub: rep.targetPubkey!,
                                        packTitle: rep.packTitle,
                                        packDTag: rep.packDTag,
                                        emojiHash: rep.emojiHash,
                                        publishNomination: false,
                                      })
                                    }
                                    className="min-h-[30px] px-2.5 rounded bg-black border border-[#00F0FF]/40 hover:border-[#00F0FF] text-[11px] font-semibold text-white"
                                  >
                                    Safe
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* ACCORDION 4: GAME SETTINGS */}
      <div className="rounded-xl bg-[#111111] border border-white/10 overflow-hidden">
        <button
          type="button"
          aria-expanded={openPanel === 'game'}
          onClick={() => togglePanel('game')}
          className="w-full min-h-[48px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02] transition-colors"
        >
          <span className="text-sm font-display font-bold text-white whitespace-nowrap">
            Game Settings
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-[#B8B8B8]">
              Audio {settings.sfx ? 'ON' : 'OFF'} · Reduced Motion {settings.reducedMotion ? 'ON' : 'OFF'}
            </span>
            <ChevronDown
              className={`w-4 h-4 text-[#B8B8B8] shrink-0 transition-transform duration-150 ${
                openPanel === 'game' ? 'rotate-180 text-[#FF1493]' : ''
              }`}
            />
          </div>
        </button>

        {openPanel === 'game' && (
          <div className="px-4 pb-4 pt-3 border-t border-[#5B0633] space-y-3.5">
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-white">
                16-Bit BreBre Pixel Arena Background
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ARENA_PIXEL_BG_OPTIONS.map((opt) => {
                  const active = (settings.arenaBgStyle ?? 'auto') === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        onUpdateSettings({
                          ...settings,
                          arenaBgStyle: opt.id,
                        })
                      }
                      className={`text-left p-2.5 rounded-xl border transition-colors ${
                        active
                          ? 'bg-[#5B0633]/45 border-[#FF1493] text-white'
                          : 'bg-[#000000] border-[#5B0633] text-[#B8B8B8] hover:border-[#9A0957]'
                      }`}
                    >
                      <div className="text-xs font-semibold text-white flex items-center justify-between gap-2">
                        <span>{opt.label}</span>
                        {active && (
                          <span className="text-[10px] font-mono text-[#FFB6D9]">ACTIVE</span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#B8B8B8] mt-0.5">{opt.subtitle}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  ['opaqueAssetBacking', 'Opaque Sprite Plate'],
                  ['sfx', 'Synth Audio'],
                  ['haptics', 'Haptics'],
                  ['reducedMotion', 'Reduced Motion'],
                  ['screenShake', 'Screen Shake'],
                  ['flashingEffects', 'Hit Flash'],
                  ['denseParticles', 'Dense Sparks'],
                  ['crtScanlines', 'CRT Lines'],
                ] as const
              ).map(([key, title]) => {
                const enabled =
                  key === 'opaqueAssetBacking'
                    ? settings.opaqueAssetBacking !== false
                    : settings[key];
                return (
                  <button
                    key={key}
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    onClick={() =>
                      onUpdateSettings({
                        ...settings,
                        [key]: !enabled,
                      })
                    }
                    className="min-h-[40px] px-3 py-2 rounded-lg bg-[#000000] border border-[#5B0633] hover:border-[#9A0957] transition-colors flex items-center justify-between gap-2"
                  >
                    <span className="text-xs font-medium text-white truncate">{title}</span>
                    <span
                      className={`text-xs font-mono font-semibold shrink-0 ${
                        enabled ? 'text-[#FF1493]' : 'text-[#5E5E5E]'
                      }`}
                    >
                      {enabled ? 'ON' : 'OFF'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
