import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, Plus, Trash2, KeyRound, QrCode } from 'lucide-react';
import {
  encodeFullNpub,
  type MojiNostrCoordinator,
  type NostrProfileMeta,
} from '../lib/nostrEngine';
import { sanitizeRelayUrl } from '../lib/sanitizeUrl';
import type { GameSettings } from '../lib/storage';

interface IdentitySettingsViewProps {
  coordinator: MojiNostrCoordinator;
  profile?: NostrProfileMeta;
  defaultAvatarUrl: string;
  relays: string[];
  settings: GameSettings;
  onUpdateRelays: (relays: string[]) => void;
  onUpdateSettings: (next: GameSettings) => void;
}

export const IdentitySettingsView: React.FC<IdentitySettingsViewProps> = ({
  coordinator,
  profile,
  defaultAvatarUrl,
  relays,
  settings,
  onUpdateRelays,
  onUpdateSettings,
}) => {
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
    return () => {
      connectAbortRef.current?.abort();
    };
  }, []);

  const fullNpub = encodeFullNpub(coordinator.pubkey);
  const nip07Available = coordinator.isNip07ExtensionDetected();
  const androidAvailable = coordinator.isAndroidEnvironment();

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
      setStatusMessage('Connected to NIP-07 browser extension.');
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
      setStatusMessage('Connected to NIP-46 remote signer.');
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
      setStatusMessage('Paired remote signer via NIP-46 Nostr Connect.');
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
      setStatusMessage('Bound Android NIP-55 identity.');
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
      setStatusMessage('Imported secp256k1 secret key.');
    } else {
      setErrorMessage(res.error ?? 'Invalid nsec key.');
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
      ? 'Extension (NIP-07)'
      : coordinator.signerMode === 'nip46'
        ? 'Remote Signer (NIP-46)'
        : coordinator.signerMode === 'nip55'
          ? 'Amber Signer (NIP-55)'
          : coordinator.signerMode === 'nsec'
            ? 'Imported Key (secp256k1)'
            : 'Guest Key (secp256k1)';

  return (
    <section className="max-w-5xl mx-auto px-4 py-3.5 space-y-4">
      {/* Compact Persona Bar */}
      <div className="p-3 rounded-xl bg-[#111111] border border-white/10 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-full bg-black border border-[#FF1493] overflow-hidden shrink-0">
            <img
              src={profile?.picture || defaultAvatarUrl}
              alt="Active Nostr persona"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = defaultAvatarUrl;
              }}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-display font-bold text-white truncate">
                {profile?.displayName || profile?.name || 'Nostr Survivor'}
              </h1>
              <span className="text-[11px] font-mono text-[#FFB6D9] shrink-0">
                · {signerLabel}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <code className="text-[11px] font-mono text-[#B8B8B8] truncate max-w-[180px] sm:max-w-sm">
                {fullNpub}
              </code>
              <button
                type="button"
                onClick={() => void copyText(fullNpub, 'npub')}
                className="text-[11px] text-white/80 hover:text-white inline-flex items-center gap-1 shrink-0"
              >
                {copiedField === 'npub' ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                <span>{copiedField === 'npub' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        </div>

        {coordinator.signerMode !== 'guest' && (
          <button
            type="button"
            onClick={() => {
              coordinator.disconnectToGuest();
              setRevealedNsec(null);
              setStatusMessage('Switched to a fresh guest keypair.');
            }}
            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-black border border-white/15 hover:border-white/35 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0"
          >
            Guest Key
          </button>
        )}
      </div>

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

      {/* 01. Signer Adapters (Tight 2x2 Grid) */}
      <div className="space-y-2">
        <h2 className="text-sm font-display font-bold text-white">01. Nostr Signers</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {/* NIP-07 */}
          <div className="rounded-xl bg-[#111111] border border-white/10 p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-xs font-display font-semibold text-white">
                Browser Extension (NIP-07)
              </h3>
              <p className="text-[11px] font-mono text-[#B8B8B8] truncate">
                {nip07Available ? 'window.nostr detected' : 'Not injected in frame'}
              </p>
            </div>
            <button
              type="button"
              disabled={busyAction === 'nip07'}
              onClick={() => void handleConnectNip07()}
              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] disabled:opacity-50 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0"
            >
              {busyAction === 'nip07' ? 'Connecting…' : 'Connect'}
            </button>
          </div>

          {/* NIP-46 */}
          <div className="rounded-xl bg-[#111111] border border-white/10 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-display font-semibold text-white">
                Remote Signer (NIP-46 Bunker & QR)
              </h3>
              {!nostrConnectUri && (
                <button
                  type="button"
                  onClick={() => void handleStartQrPairing()}
                  className="text-[11px] text-[#FFB6D9] hover:text-white inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <QrCode className="w-3 h-3" />
                  <span>Pairing QR</span>
                </button>
              )}
            </div>

            <form onSubmit={(e) => void handleConnectBunker(e)} className="flex gap-2">
              <input
                type="text"
                value={bunkerInput}
                onChange={(e) => setBunkerInput(e.target.value)}
                placeholder="bunker://pubkey?relay=wss://..."
                className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-black border border-white/15 text-xs font-mono text-white"
              />
              <button
                type="submit"
                disabled={busyAction === 'bunker' || !bunkerInput.trim()}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap shrink-0"
              >
                {busyAction === 'bunker' ? 'Wait…' : 'Connect'}
              </button>
            </form>

            {nostrConnectUri && (
              <div className="pt-2 border-t border-white/10 flex items-center gap-3">
                {nostrConnectQr && (
                  <img
                    src={nostrConnectQr}
                    alt="NIP-46 QR"
                    className="w-24 h-24 rounded bg-black border border-white/15 shrink-0"
                  />
                )}
                <div className="min-w-0 space-y-1.5">
                  <div className="text-[11px] font-mono text-[#FFB6D9]">
                    Awaiting mobile signer approval…
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyText(nostrConnectUri, 'nc')}
                    className="px-2.5 py-1 rounded bg-black border border-white/15 text-[11px] font-mono text-white whitespace-nowrap"
                  >
                    {copiedField === 'nc' ? 'Copied URI' : 'Copy nostrconnect://'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* NIP-55 Amber */}
          <div className="rounded-xl bg-[#111111] border border-white/10 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-display font-semibold text-white">
                Android Amber (NIP-55)
              </h3>
              <a
                href={coordinator.buildNip55GetPublicKeyUri()}
                className="text-[11px] text-[#FFB6D9] hover:text-white underline whitespace-nowrap shrink-0"
              >
                {androidAvailable ? 'Launch Amber Intent' : 'nostrsigner: URI'}
              </a>
            </div>

            <form onSubmit={handleBindNip55} className="flex gap-2">
              <input
                type="text"
                value={nip55PubkeyInput}
                onChange={(e) => setNip55PubkeyInput(e.target.value)}
                placeholder="Bind Amber npub1… or hex"
                className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-black border border-white/15 text-xs font-mono text-white"
              />
              <button
                type="submit"
                disabled={!nip55PubkeyInput.trim()}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#1A1A1A] border border-white/15 hover:border-white/40 disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap shrink-0"
              >
                Bind
              </button>
            </form>
          </div>

          {/* Local secp256k1 Keypair */}
          <div className="rounded-xl bg-[#111111] border border-white/10 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-display font-semibold text-white">
                Local Keypair (NSecSigner)
              </h3>
              <div className="flex items-center gap-2">
                {coordinator.exportCurrentNsec() && (
                  <button
                    type="button"
                    onClick={() =>
                      setRevealedNsec((prev) =>
                        prev ? null : coordinator.exportCurrentNsec()
                      )
                    }
                    className="text-[11px] text-[#FF9900] hover:underline inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    <KeyRound className="w-3 h-3" />
                    <span>{revealedNsec ? 'Hide' : 'Backup nsec'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    coordinator.generateFreshGuestKey();
                    setRevealedNsec(null);
                    setStatusMessage('Generated new guest keypair.');
                  }}
                  className="text-[11px] text-[#B8B8B8] hover:text-white underline whitespace-nowrap"
                >
                  New Guest
                </button>
              </div>
            </div>

            <form onSubmit={handleImportNsec} className="flex gap-2">
              <input
                type="password"
                value={nsecImportInput}
                onChange={(e) => setNsecImportInput(e.target.value)}
                placeholder="Import nsec1… key"
                className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-black border border-white/15 text-xs font-mono text-white"
              />
              <button
                type="submit"
                disabled={!nsecImportInput.trim()}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#1A1A1A] border border-white/15 hover:border-white/40 disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap shrink-0"
              >
                Import
              </button>
            </form>

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
        </div>
      </div>

      {/* 02. Relays & 03. Sensory Toggles Side-by-Side on Desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-white/10">
        <div className="space-y-2">
          <h2 className="text-sm font-display font-bold text-white">02. Relay Pool</h2>
          <form onSubmit={handleAddRelay} className="flex gap-2">
            <input
              type="text"
              value={newRelayInput}
              onChange={(e) => setNewRelayInput(e.target.value)}
              placeholder="wss://relay.nostr.band"
              className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-[#111111] border border-white/15 text-xs font-mono text-white"
            />
            <button
              type="submit"
              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] text-xs font-semibold text-white flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </form>

          <div className="divide-y divide-white/10 rounded-xl bg-[#111111] border border-white/10">
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

        <div className="space-y-2">
          <h2 className="text-sm font-display font-bold text-white">
            03. Audio & Sensory Comfort
          </h2>
          <div className="grid grid-cols-2 gap-2">
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
                  className="min-h-[38px] px-3 py-2 rounded-lg bg-[#111111] border border-white/10 hover:border-white/25 transition-colors flex items-center justify-between gap-2"
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
      </div>
    </section>
  );
};
