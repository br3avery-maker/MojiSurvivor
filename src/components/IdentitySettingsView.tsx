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
      setStatusMessage('Connected to NIP-46 remote signer via bunker URI.');
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
        width: 220,
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
      setStatusMessage('Bound Android NIP-55 external signer identity.');
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
      ? 'Browser Extension (NIP-07)'
      : coordinator.signerMode === 'nip46'
        ? 'Remote Signer (NIP-46)'
        : coordinator.signerMode === 'nip55'
          ? 'Android Amber Signer (NIP-55)'
          : coordinator.signerMode === 'nsec'
            ? 'Imported Local Key (secp256k1)'
            : 'Local Guest Keypair (secp256k1)';

  return (
    <section className="max-w-5xl mx-auto px-6 py-10 space-y-12">
      {/* Active Persona Header */}
      <div className="pb-8 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-16 h-16 rounded-full bg-[#111111] border border-[#FF1493] overflow-hidden shrink-0">
            <img
              src={profile?.picture || defaultAvatarUrl}
              alt="Active Nostr persona avatar"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = defaultAvatarUrl;
              }}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-display font-bold text-white truncate">
              {profile?.displayName || profile?.name || 'Nostr Survivor'}
            </h1>
            <div className="text-xs text-[#FFB6D9] mt-0.5">{signerLabel}</div>
            <div className="flex items-center gap-2 mt-1.5">
              <code className="text-xs font-mono text-[#B8B8B8] truncate max-w-[240px] sm:max-w-md">
                {fullNpub}
              </code>
              <button
                type="button"
                onClick={() => void copyText(fullNpub, 'npub')}
                className="text-xs text-white/80 hover:text-white inline-flex items-center gap-1 shrink-0"
              >
                {copiedField === 'npub' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedField === 'npub' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Only show Switch to Guest Key when signed into an external or imported account */}
        {coordinator.signerMode !== 'guest' && (
          <button
            type="button"
            onClick={() => {
              coordinator.disconnectToGuest();
              setRevealedNsec(null);
              setStatusMessage('Switched to a fresh local secp256k1 guest keypair.');
            }}
            className="min-h-[42px] px-4 py-2 rounded-lg bg-[#111111] border border-white/15 hover:border-white/35 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            Switch to Guest Key
          </button>
        )}
      </div>

      {statusMessage && (
        <div className="px-4 py-3 rounded-lg bg-[#111111] border border-emerald-500/40 text-sm text-emerald-300">
          {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div className="px-4 py-3 rounded-lg bg-[#111111] border border-amber-500/40 text-sm text-amber-300">
          {errorMessage}
        </div>
      )}

      {/* Distinct Nostr Signer Integrations */}
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-display font-bold text-white">
            01. Nostr Signer Integrations
          </h2>
          <p className="text-sm text-[#B8B8B8] mt-1">
            NIP-07 browser extensions, NIP-46 remote bunkers, and Android NIP-55 intents operate as separate protocol adapters. Offline gameplay never blocks on a signer.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Adapter A: NIP-07 Browser Extension */}
          <div className="rounded-xl bg-[#111111] border border-white/10 p-5 flex flex-col justify-between gap-4">
            <div>
              <h3 className="text-base font-display font-semibold text-white">
                Browser Extension (NIP-07)
              </h3>
              <p className="text-xs text-[#B8B8B8] mt-1">
                Sign directly with Alby, nos2x, or Soapbox Signer via <code className="font-mono">window.nostr</code>.
              </p>
              <p className="text-xs font-mono text-[#B8B8B8] mt-2">
                Status: {nip07Available ? 'Extension detected' : 'Not injected in current frame'}
              </p>
            </div>
            <button
              type="button"
              disabled={busyAction === 'nip07'}
              onClick={() => void handleConnectNip07()}
              className="min-h-[42px] px-4 py-2 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] disabled:opacity-50 text-xs font-semibold text-white transition-colors whitespace-nowrap"
            >
              {busyAction === 'nip07' ? 'Requesting Pubkey…' : 'Connect Browser Extension'}
            </button>
          </div>

          {/* Adapter B: NIP-46 Remote Signer (Bunker / Nostr Connect QR) */}
          <div className="rounded-xl bg-[#111111] border border-white/10 p-5 flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div>
                <h3 className="text-base font-display font-semibold text-white">
                  Remote Signer (NIP-46 Bunker & QR)
                </h3>
                <p className="text-xs text-[#B8B8B8] mt-1">
                  Works across all browsers, iframes, and static nsite gateways via NIP-44 encrypted relay RPC.
                </p>
              </div>

              <form onSubmit={(e) => void handleConnectBunker(e)} className="flex gap-2">
                <input
                  type="text"
                  value={bunkerInput}
                  onChange={(e) => setBunkerInput(e.target.value)}
                  placeholder="bunker://pubkey?relay=wss://..."
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-black border border-white/15 text-xs font-mono text-white"
                />
                <button
                  type="submit"
                  disabled={busyAction === 'bunker' || !bunkerInput.trim()}
                  className="px-3.5 py-2 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                >
                  {busyAction === 'bunker' ? 'Connecting…' : 'Connect'}
                </button>
              </form>

              {nostrConnectUri ? (
                <div className="pt-2 border-t border-white/10 space-y-2">
                  {nostrConnectQr && (
                    <img
                      src={nostrConnectQr}
                      alt="NIP-46 nostrconnect pairing QR code"
                      className="w-36 h-36 rounded bg-black border border-white/15 mx-auto"
                    />
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono text-[#FFB6D9]">
                      Waiting for remote signer approval…
                    </span>
                    <button
                      type="button"
                      onClick={() => void copyText(nostrConnectUri, 'nc')}
                      className="text-xs font-mono text-white underline whitespace-nowrap"
                    >
                      {copiedField === 'nc' ? 'Copied URI' : 'Copy URI'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleStartQrPairing()}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-black border border-white/15 hover:border-[#FF1493] text-xs font-medium text-white transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <QrCode className="w-3.5 h-3.5 text-[#FF1493]" />
                  <span>Generate Nostr Connect Pairing QR</span>
                </button>
              )}
            </div>
          </div>

          {/* Adapter C: Android NIP-55 External Signer (Amber) */}
          <div className="rounded-xl bg-[#111111] border border-white/10 p-5 flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div>
                <h3 className="text-base font-display font-semibold text-white">
                  Android External Signer (NIP-55 Amber)
                </h3>
                <p className="text-xs text-[#B8B8B8] mt-1">
                  Dispatches <code className="font-mono">nostrsigner:</code> URI intents to Amber (<code className="font-mono">com.greenart7c3.nostrsigner</code>) on Android devices.
                </p>
                <p className="text-xs font-mono text-[#B8B8B8] mt-1.5">
                  Environment: {androidAvailable ? 'Android detected' : 'Desktop / Web (use NIP-46 QR for mobile Amber)'}
                </p>
              </div>

              <a
                href={coordinator.buildNip55GetPublicKeyUri()}
                className="inline-flex items-center justify-center w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-black border border-white/15 hover:border-[#FF1493] text-xs font-medium text-white transition-colors whitespace-nowrap"
              >
                Launch Amber Public Key Intent
              </a>

              <form onSubmit={handleBindNip55} className="flex gap-2">
                <input
                  type="text"
                  value={nip55PubkeyInput}
                  onChange={(e) => setNip55PubkeyInput(e.target.value)}
                  placeholder="Bind Amber npub1… or hex pubkey"
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-black border border-white/15 text-xs font-mono text-white"
                />
                <button
                  type="submit"
                  disabled={!nip55PubkeyInput.trim()}
                  className="px-3.5 py-2 rounded-lg bg-[#1A1A1A] border border-white/15 hover:border-white/40 disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                >
                  Bind
                </button>
              </form>
            </div>
          </div>

          {/* Adapter D: Local BIP-340 secp256k1 Keypair */}
          <div className="rounded-xl bg-[#111111] border border-white/10 p-5 flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div>
                <h3 className="text-base font-display font-semibold text-white">
                  Local secp256k1 Keypair (NSecSigner)
                </h3>
                <p className="text-xs text-[#B8B8B8] mt-1">
                  Signs real BIP-340 Schnorr events locally in browser storage for zero-latency guest play or imported <code className="font-mono">nsec</code> keys.
                </p>
              </div>

              <form onSubmit={handleImportNsec} className="flex gap-2">
                <input
                  type="password"
                  value={nsecImportInput}
                  onChange={(e) => setNsecImportInput(e.target.value)}
                  placeholder="Import nsec1… key"
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-black border border-white/15 text-xs font-mono text-white"
                />
                <button
                  type="submit"
                  disabled={!nsecImportInput.trim()}
                  className="px-3.5 py-2 rounded-lg bg-[#1A1A1A] border border-white/15 hover:border-white/40 disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                >
                  Import
                </button>
              </form>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {coordinator.exportCurrentNsec() && (
                  <button
                    type="button"
                    onClick={() =>
                      setRevealedNsec((prev) =>
                        prev ? null : coordinator.exportCurrentNsec()
                      )
                    }
                    className="px-3 py-1.5 rounded-lg bg-black border border-white/15 text-xs font-medium text-[#B8B8B8] hover:text-white inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-[#FF9900]" />
                    <span>{revealedNsec ? 'Hide nsec' : 'Backup Local nsec'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    coordinator.generateFreshGuestKey();
                    setRevealedNsec(null);
                    setStatusMessage('Generated a new BIP-340 secp256k1 guest keypair.');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-black border border-white/15 text-xs font-medium text-[#B8B8B8] hover:text-white whitespace-nowrap"
                >
                  Rotate New Guest Key
                </button>
              </div>

              {revealedNsec && (
                <div className="p-2.5 rounded bg-black border border-white/10 flex items-center justify-between gap-2">
                  <code className="text-[11px] font-mono text-[#FF9900] truncate">
                    {revealedNsec}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copyText(revealedNsec, 'nsec')}
                    className="text-xs text-white shrink-0"
                  >
                    {copiedField === 'nsec' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Relay Pool Configuration */}
      <div className="space-y-4 pt-8 border-t border-white/10">
        <div>
          <h2 className="text-xl font-display font-bold text-white">02. Nostr Relay Pool</h2>
          <p className="text-sm text-[#B8B8B8] mt-1">
            Relays queried for NIP-30 custom emoji packs (<code className="font-mono">kind:30030</code>) and written to when broadcasting run receipts (<code className="font-mono">kind:30078</code>).
          </p>
        </div>

        <form onSubmit={handleAddRelay} className="flex gap-2 max-w-lg">
          <input
            type="text"
            value={newRelayInput}
            onChange={(e) => setNewRelayInput(e.target.value)}
            placeholder="wss://relay.nostr.band"
            className="flex-1 px-3.5 py-2 rounded-lg bg-[#111111] border border-white/15 text-xs font-mono text-white"
          />
          <button
            type="submit"
            className="min-h-[40px] px-4 py-2 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Relay</span>
          </button>
        </form>

        <div className="divide-y divide-white/10 border-y border-white/10 max-w-2xl">
          {relays.map((url) => {
            const reach = coordinator.relayReachability.get(url) ?? 'idle';
            return (
              <div key={url} className="py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-mono text-white truncate">{url}</div>
                  <div className="text-xs text-[#B8B8B8]">
                    {reach === 'ok'
                      ? 'Reachable · Verified NIP-01'
                      : reach === 'error'
                        ? 'Last request timed out or rejected'
                        : 'Configured'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveRelay(url)}
                  aria-label={`Remove ${url}`}
                  className="p-2 text-[#B8B8B8] hover:text-white transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Audio, Graphics & Reduced-Sensory Accessibility Controls */}
      <div className="space-y-4 pt-8 border-t border-white/10">
        <div>
          <h2 className="text-xl font-display font-bold text-white">
            03. Audio, Performance & Sensory Comfort
          </h2>
          <p className="text-sm text-[#B8B8B8] mt-1">
            Customize synthesized audio, vibration, and visual intensity during dense high-wave swarms.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl">
          {(
            [
              ['sfx', 'Retro Synth Audio', '8-bit Web Audio cues for spells, pickups, and sirens'],
              ['haptics', 'Haptic Vibration', 'Tactile pulse on damage, crates, and Apex Boss spawns'],
              ['screenShake', 'Impact Screen Shake', 'Brief camera recoil when taking hull damage'],
              ['flashingEffects', 'Hit Flash Highlights', 'Luminance flash on struck enemies and aura pulses'],
              ['denseParticles', 'High Particle Density', 'Full spark bursts on takedowns'],
              ['crtScanlines', 'CRT Scanline Overlay', 'Subtle horizontal arcade monitor lines'],
            ] as const
          ).map(([key, title, desc]) => {
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
                className="text-left p-4 rounded-xl bg-[#111111] border border-white/10 hover:border-white/25 transition-colors flex items-center justify-between gap-4"
              >
                <div>
                  <div className="text-sm font-semibold text-white">{title}</div>
                  <div className="text-xs text-[#B8B8B8] mt-0.5">{desc}</div>
                </div>
                <span
                  className={`text-xs font-mono font-semibold whitespace-nowrap shrink-0 ${
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
    </section>
  );
};
