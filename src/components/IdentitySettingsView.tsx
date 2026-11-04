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
} from 'lucide-react';
import {
  encodeFullNpub,
  formatShortNpub,
  PROGRESS_SNAPSHOT_D_TAG,
  type MojiNostrCoordinator,
  type NostrProfileMeta,
} from '../lib/nostrEngine';
import { sanitizeRelayUrl } from '../lib/sanitizeUrl';
import type { GameSettings, NostrProgressSyncState } from '../lib/storage';

export type AccordionPanel = 'profile' | 'relays' | 'game';

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
  initialPanel?: AccordionPanel;
  onToggleProgressSync: (enabled: boolean) => void;
  onSyncProgressNow: () => Promise<{ ok: boolean; message: string }>;
  onPrepareNip55ProgressSync: () => { ok: boolean; uri?: string; error?: string };
  onApplyNip55ProgressSignature: (raw: string) => Promise<{ ok: boolean; message: string }>;
  onRestoreProgressFromRelays: () => Promise<{ ok: boolean; message: string }>;
  onUpdateRelays: (relays: string[]) => void;
  onUpdateSettings: (next: GameSettings) => void;
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
  initialPanel = 'profile',
  onToggleProgressSync,
  onSyncProgressNow,
  onPrepareNip55ProgressSync,
  onApplyNip55ProgressSignature,
  onRestoreProgressFromRelays,
  onUpdateRelays,
  onUpdateSettings,
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

  useEffect(() => {
    setOpenPanel(initialPanel);
  }, [initialPanel]);

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

  const handleConnectBunker = async (e: React.FormEvent) => {
    e.preventDefault();
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

  const handleBindNip55 = (e: React.FormEvent) => {
    e.preventDefault();
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

  const handleImportNsec = (e: React.FormEvent) => {
    e.preventDefault();
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

  const handleAddRelay = (e: React.FormEvent) => {
    e.preventDefault();
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
  };

  const handleRemoveRelay = (url: string) => {
    if (relays.length <= 1) {
      setErrorMessage('At least one relay must remain configured.');
      return;
    }
    onUpdateRelays(relays.filter((r) => r !== url));
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
                    <div className="w-12 h-12 rounded-full bg-black border border-[#FF1493] overflow-hidden shrink-0">
                      <img
                        src={profile?.picture || defaultAvatarUrl}
                        alt="Nostr profile avatar"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = defaultAvatarUrl;
                        }}
                        className="w-full h-full object-cover"
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
                <div className="p-2.5 rounded-lg bg-black border border-white/10 flex items-center justify-between gap-2">
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
                      onClick={() => {
                        coordinator.generateFreshGuestKey();
                        setStatusMessage('Rotated new local Guest Key.');
                      }}
                      className="min-h-[34px] px-2.5 py-1 rounded bg-[#111111] border border-white/15 text-xs text-[#B8B8B8] hover:text-white whitespace-nowrap"
                    >
                      New Guest
                    </button>
                  </div>
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

                    <form onSubmit={handleBindNip55} className="flex gap-1.5">
                      <input
                        type="text"
                        value={nip55PubkeyInput}
                        onChange={(e) => setNip55PubkeyInput(e.target.value)}
                        placeholder="Or paste Amber npub1… / hex"
                        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md bg-[#111111] border border-white/15 text-xs font-mono text-white"
                      />
                      <button
                        type="submit"
                        disabled={!nip55PubkeyInput.trim()}
                        className="min-h-[36px] px-2.5 py-1.5 rounded-md bg-[#1A1A1A] border border-white/15 hover:border-white/40 disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                      >
                        Bind
                      </button>
                    </form>
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

                    <form onSubmit={(e) => void handleConnectBunker(e)} className="flex gap-1.5">
                      <input
                        type="text"
                        value={bunkerInput}
                        onChange={(e) => setBunkerInput(e.target.value)}
                        placeholder="bunker://pubkey?relay=wss://..."
                        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md bg-[#111111] border border-white/15 text-xs font-mono text-white"
                      />
                      <button
                        type="submit"
                        disabled={busyAction === 'bunker' || !bunkerInput.trim()}
                        className="min-h-[36px] px-2.5 py-1.5 rounded-md bg-[#1A1A1A] border border-white/15 hover:border-white/40 disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                      >
                        {busyAction === 'bunker' ? '…' : 'Connect'}
                      </button>
                    </form>
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
                    <form onSubmit={handleImportNsec} className="flex gap-1.5">
                      <input
                        type="password"
                        value={nsecImportInput}
                        onChange={(e) => setNsecImportInput(e.target.value)}
                        placeholder="nsec1…"
                        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md bg-[#111111] border border-white/15 text-xs font-mono text-white"
                      />
                      <button
                        type="submit"
                        disabled={!nsecImportInput.trim()}
                        className="min-h-[36px] px-2.5 py-1.5 rounded-md bg-[#1A1A1A] border border-white/15 hover:border-white/40 disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                      >
                        Import
                      </button>
                    </form>
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

      {/* ACCORDION 2: RELAYS */}
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
              {relays.length} active
            </span>
            <ChevronDown
              className={`w-4 h-4 text-[#B8B8B8] shrink-0 transition-transform duration-150 ${
                openPanel === 'relays' ? 'rotate-180 text-[#FF1493]' : ''
              }`}
            />
          </div>
        </button>

        {openPanel === 'relays' && (
          <div className="px-4 pb-4 pt-3 border-t border-white/10 space-y-2.5">
            <form onSubmit={handleAddRelay} className="flex gap-2">
              <input
                type="text"
                value={newRelayInput}
                onChange={(e) => setNewRelayInput(e.target.value)}
                placeholder="wss://relay.nostr.band"
                className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-black border border-white/15 text-xs font-mono text-white"
              />
              <button
                type="submit"
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] text-xs font-semibold text-white flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </form>

            <div className="divide-y divide-white/10 rounded-lg bg-black border border-white/10">
              {relays.map((url) => {
                const reach = coordinator.relayReachability.get(url) ?? 'idle';
                return (
                  <div
                    key={url}
                    className="px-3 py-2.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="font-mono text-white truncate">{url}</span>
                      <span className="text-[11px] text-[#B8B8B8] shrink-0">
                        {reach === 'ok' ? '· OK' : reach === 'error' ? '· Timeout' : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveRelay(url)}
                      aria-label={`Remove ${url}`}
                      className="min-h-[34px] min-w-[34px] flex items-center justify-center text-[#B8B8B8] hover:text-white shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ACCORDION 3: GAME SETTINGS */}
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
          <div className="px-4 pb-4 pt-3 border-t border-white/10">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(
                [
                  ['sfx', 'Synth Audio'],
                  ['haptics', 'Haptics'],
                  ['reducedMotion', 'Reduced Motion'],
                  ['screenShake', 'Screen Shake'],
                  ['flashingEffects', 'Hit Flash'],
                  ['denseParticles', 'Dense Sparks'],
                  ['crtScanlines', 'CRT Lines'],
                ] as const
              ).map(([key, title]) => {
                const enabled = settings[key];
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
                    className="min-h-[40px] px-3 py-2 rounded-lg bg-black border border-white/10 hover:border-white/25 transition-colors flex items-center justify-between gap-2"
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
