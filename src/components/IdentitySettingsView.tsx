import React, { useEffect, useRef, useState } from 'react';
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
} from 'lucide-react';
import {
  encodeFullNpub,
  formatShortNpub,
  type MojiNostrCoordinator,
  type NostrProfileMeta,
} from '../lib/nostrEngine';
import { sanitizeRelayUrl } from '../lib/sanitizeUrl';
import type { GameSettings } from '../lib/storage';

export type AccordionPanel = 'profile' | 'relays' | 'game';

interface IdentitySettingsViewProps {
  coordinator: MojiNostrCoordinator;
  profile?: NostrProfileMeta;
  defaultAvatarUrl: string;
  relays: string[];
  settings: GameSettings;
  initialPanel?: AccordionPanel;
  onUpdateRelays: (relays: string[]) => void;
  onUpdateSettings: (next: GameSettings) => void;
}

export const IdentitySettingsView: React.FC<IdentitySettingsViewProps> = ({
  coordinator,
  profile,
  defaultAvatarUrl,
  relays,
  settings,
  initialPanel = 'profile',
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

  const [nip55PubkeyInput, setNip55PubkeyInput] = useState('');
  const [nsecImportInput, setNsecImportInput] = useState('');
  const [revealedNsec, setRevealedNsec] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [newRelayInput, setNewRelayInput] = useState('');

  useEffect(() => {
    setOpenPanel(initialPanel);
  }, [initialPanel]);

  useEffect(() => {
    return () => {
      connectAbortRef.current?.abort();
    };
  }, []);

  const isSignedIn = coordinator.isSignedIn();
  const fullNpub = encodeFullNpub(coordinator.pubkey);
  const nip07Available = coordinator.isNip07ExtensionDetected();
  const androidAvailable = coordinator.isAndroidEnvironment();

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

  const handleStartQrPairing = async () => {
    connectAbortRef.current?.abort();
    const controller = new AbortController();
    connectAbortRef.current = controller;
    setErrorMessage(null);
    setStatusMessage(null);

    const session = coordinator.createNostrConnectSession(controller.signal);
    setNostrConnectUri(session.uri);

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
    setBusyAction(null);
    if (res.ok) {
      setNostrConnectUri(null);
      setNostrConnectQr(null);
      setStatusMessage('Signed in via NIP-46 Nostr Connect.');
    } else if (res.error && res.error !== 'Pairing cancelled.') {
      setErrorMessage(res.error);
    }
  };

  const handleBindNip55 = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    const res = coordinator.connectNip55WithPubkey(nip55PubkeyInput);
    if (res.ok) {
      setNip55PubkeyInput('');
      setStatusMessage('Signed in with Android NIP-55 identity.');
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
    setNostrConnectUri(null);
    setNostrConnectQr(null);
    setRevealedNsec(null);
    setErrorMessage(null);
    coordinator.logout();
    setStatusMessage('Logged out of Nostr account. Now using offline Guest Key.');
  };

  const handleRefreshProfile = async () => {
    setBusyAction('profile');
    await coordinator.refreshActiveProfile();
    setBusyAction(null);
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

      {/* ACCORDION 1: PROFILE & ACCOUNT (Default Open) */}
      <div className="rounded-xl bg-[#111111] border border-white/10 overflow-hidden">
        <button
          type="button"
          aria-expanded={openPanel === 'profile'}
          onClick={() => togglePanel('profile')}
          className="w-full min-h-[48px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02] transition-colors"
        >
          <span className="text-sm font-display font-bold text-white whitespace-nowrap">
            Profile
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
          <div className="px-4 pb-4 pt-1 border-t border-white/10 space-y-3">
            {isSignedIn ? (
              /* SIGNED-IN STATE: Sign-in forms are completely hidden; shows active profile + Log Out */
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
                      <div className="text-[11px] text-[#B8B8B8] mt-0.5">
                        Signed in via {signerLabel}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#1A1A1A] border border-white/15 hover:border-[#FF1493] text-xs font-semibold text-white transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
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
                      Playing in Guest Mode
                    </div>
                    <div className="text-[11px] font-mono text-[#B8B8B8] truncate">
                      {formatShortNpub(coordinator.pubkey)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void copyText(fullNpub, 'npub')}
                      className="px-2.5 py-1 rounded bg-[#111111] border border-white/15 text-[11px] text-white whitespace-nowrap"
                    >
                      {copiedField === 'npub' ? 'Copied' : 'Copy npub'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        coordinator.generateFreshGuestKey();
                        setStatusMessage('Rotated new local Guest Key.');
                      }}
                      className="px-2.5 py-1 rounded bg-[#111111] border border-white/15 text-[11px] text-[#B8B8B8] hover:text-white whitespace-nowrap"
                    >
                      New Guest
                    </button>
                  </div>
                </div>

                <div className="text-xs font-semibold text-[#B8B8B8] pt-1">
                  Sign in with Nostr
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* NIP-07 Extension */}
                  <div className="rounded-lg bg-black border border-white/10 p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white">
                        Extension (NIP-07)
                      </div>
                      <div className="text-[11px] font-mono text-[#B8B8B8] truncate">
                        {nip07Available ? 'Detected' : 'Not detected'}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busyAction === 'nip07'}
                      onClick={() => void handleConnectNip07()}
                      className="min-h-[34px] px-3 py-1.5 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                    >
                      {busyAction === 'nip07' ? 'Wait…' : 'Sign In'}
                    </button>
                  </div>

                  {/* NIP-46 Remote Signer */}
                  <div className="rounded-lg bg-black border border-white/10 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-white">
                        Bunker / QR (NIP-46)
                      </span>
                      {!nostrConnectUri && (
                        <button
                          type="button"
                          onClick={() => void handleStartQrPairing()}
                          className="text-[11px] text-[#FFB6D9] hover:text-white inline-flex items-center gap-1 whitespace-nowrap"
                        >
                          <QrCode className="w-3 h-3" />
                          <span>Show QR</span>
                        </button>
                      )}
                    </div>

                    <form onSubmit={(e) => void handleConnectBunker(e)} className="flex gap-1.5">
                      <input
                        type="text"
                        value={bunkerInput}
                        onChange={(e) => setBunkerInput(e.target.value)}
                        placeholder="bunker://..."
                        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md bg-[#111111] border border-white/15 text-xs font-mono text-white"
                      />
                      <button
                        type="submit"
                        disabled={busyAction === 'bunker' || !bunkerInput.trim()}
                        className="min-h-[34px] px-2.5 py-1.5 rounded-md bg-[#FF1493] hover:bg-[#CD0D72] disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                      >
                        {busyAction === 'bunker' ? '…' : 'Connect'}
                      </button>
                    </form>

                    {nostrConnectUri && (
                      <div className="pt-2 border-t border-white/10 flex items-center gap-2.5">
                        {nostrConnectQr && (
                          <img
                            src={nostrConnectQr}
                            alt="NIP-46 QR"
                            className="w-20 h-20 rounded bg-black border border-white/15 shrink-0"
                          />
                        )}
                        <div className="min-w-0 space-y-1">
                          <div className="text-[10px] font-mono text-[#FFB6D9]">
                            Scan or copy URI in signer…
                          </div>
                          <button
                            type="button"
                            onClick={() => void copyText(nostrConnectUri, 'nc')}
                            className="px-2 py-1 rounded bg-[#111111] border border-white/15 text-[10px] font-mono text-white whitespace-nowrap"
                          >
                            {copiedField === 'nc' ? 'Copied URI' : 'Copy URI'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* NIP-55 Android Amber */}
                  <div className="rounded-lg bg-black border border-white/10 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-white">
                        Amber (NIP-55)
                      </span>
                      <a
                        href={coordinator.buildNip55GetPublicKeyUri()}
                        className="text-[11px] text-[#FFB6D9] hover:text-white underline whitespace-nowrap"
                      >
                        {androidAvailable ? 'Open Amber' : 'nostrsigner:'}
                      </a>
                    </div>
                    <form onSubmit={handleBindNip55} className="flex gap-1.5">
                      <input
                        type="text"
                        value={nip55PubkeyInput}
                        onChange={(e) => setNip55PubkeyInput(e.target.value)}
                        placeholder="npub1… or hex"
                        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md bg-[#111111] border border-white/15 text-xs font-mono text-white"
                      />
                      <button
                        type="submit"
                        disabled={!nip55PubkeyInput.trim()}
                        className="min-h-[34px] px-2.5 py-1.5 rounded-md bg-[#1A1A1A] border border-white/15 hover:border-white/40 disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                      >
                        Bind
                      </button>
                    </form>
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
                        className="min-h-[34px] px-2.5 py-1.5 rounded-md bg-[#1A1A1A] border border-white/15 hover:border-white/40 disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                      >
                        Sign In
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}
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
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] text-xs font-semibold text-white flex items-center gap-1 whitespace-nowrap shrink-0"
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
                    className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="font-mono text-white truncate">{url}</span>
                      <span className="text-[10px] text-[#B8B8B8] shrink-0">
                        {reach === 'ok' ? '· OK' : reach === 'error' ? '· Timeout' : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveRelay(url)}
                      aria-label={`Remove ${url}`}
                      className="p-1 text-[#B8B8B8] hover:text-white shrink-0"
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
              Audio {settings.sfx ? 'ON' : 'OFF'} · CRT {settings.crtScanlines ? 'ON' : 'OFF'}
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
                    className="min-h-[38px] px-3 py-2 rounded-lg bg-black border border-white/10 hover:border-white/25 transition-colors flex items-center justify-between gap-2"
                  >
                    <span className="text-xs font-medium text-white truncate">{title}</span>
                    <span
                      className={`text-[11px] font-mono font-semibold shrink-0 ${
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
