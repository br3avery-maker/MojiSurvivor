import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FolderOpen,
  Globe,
  Plus,
  RefreshCw,
  Rocket,
  RotateCcw,
  Server,
  Trash2,
} from 'lucide-react';
import {
  buildBlossomServerListTemplate,
  buildLegacy34128FileTemplates,
  buildNip5aManifestTemplate,
  checkBlossomBlobExists,
  collectDirectoryFiles,
  collectHostedBuildFiles,
  computeNsiteGatewayUrls,
  DEFAULT_BLOSSOM_SERVERS,
  isValidSiteSlug,
  normalizeSiteSlug,
  publishAssetsToBlossomServers,
  sanitizeBlossomServerList,
  sanitizeBlossomServerUrl,
  type NsitePublishProgress,
  type NsiteTargetType,
  type SiteAssetFile,
} from '../lib/nsitePublisher';
import { type MojiNostrCoordinator, verifySignedEventMatchesRequest } from '../lib/nostrEngine';
import type { PersistedGameState } from '../lib/storage';

interface NsitePublisherPanelProps {
  coordinator: MojiNostrCoordinator;
  relays: string[];
  preferredBlossomServers?: string[];
  lastNsitePublish?: PersistedGameState['lastNsitePublish'];
  onUpdateBlossomServers?: (servers: string[]) => void;
  onRecordNsitePublish?: (record: NonNullable<PersistedGameState['lastNsitePublish']>) => void;
}

type BundleSourceMode = 'hosted' | 'directory';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const NsitePublisherPanel: React.FC<NsitePublisherPanelProps> = ({
  coordinator,
  relays,
  preferredBlossomServers,
  lastNsitePublish,
  onUpdateBlossomServers,
  onRecordNsitePublish,
}) => {
  const initialServers = useMemo(() => {
    const clean = sanitizeBlossomServerList(preferredBlossomServers ?? []);
    return clean.length > 0 ? clean : [...DEFAULT_BLOSSOM_SERVERS];
  }, [preferredBlossomServers]);

  const [sourceMode, setSourceMode] = useState<BundleSourceMode>('hosted');
  const [bundleFiles, setBundleFiles] = useState<SiteAssetFile[]>([]);
  const [bundleMessage, setBundleMessage] = useState<string | null>(null);
  const [bundleIsDevMode, setBundleIsDevMode] = useState(false);
  const [scanningBundle, setScanningBundle] = useState(false);

  const [siteType, setSiteType] = useState<NsiteTargetType>(
    lastNsitePublish?.siteType ?? 'named'
  );
  const [slugInput, setSlugInput] = useState<string>(
    lastNsitePublish?.slug ?? 'mojisurvivor'
  );
  const [publishLegacy34128, setPublishLegacy34128] = useState(false);
  const [syncBlossomList10063, setSyncBlossomList10063] = useState(false);

  const [blossomServers, setBlossomServers] = useState<string[]>(initialServers);
  const [newBlossomInput, setNewBlossomInput] = useState('');
  const [fetchingBlossom10063, setFetchingBlossom10063] = useState(false);

  const [dryRunReport, setDryRunReport] = useState<{
    checkedAt: number;
    existingOnPrimary: number;
    missingOnPrimary: number;
    primaryServer: string;
  } | null>(null);
  const [dryRunBusy, setDryRunBusy] = useState(false);

  const [publishing, setPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState<NsitePublishProgress | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<{
    manifestEventId: string;
    primaryUrl: string;
    alternateUrl: string;
    npub: string;
    naddr?: string;
    acceptedRelays: string[];
    rejectedRelays: Record<string, string>;
    uploadedCount: number;
    skippedCount: number;
    legacyPublishedCount: number;
  } | null>(null);

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setBlossomServers(initialServers);
  }, [initialServers]);

  const setFolderInputAttributes = useCallback((node: HTMLInputElement | null) => {
    folderInputRef.current = node;
    if (node) {
      node.setAttribute('webkitdirectory', '');
      node.setAttribute('directory', '');
    }
  }, []);

  const normalizedSlug = normalizeSiteSlug(slugInput);
  const slugValid = siteType === 'root' || isValidSiteSlug(normalizedSlug);

  const gatewayPreview = useMemo(() => {
    if (!/^[0-9a-f]{64}$/i.test(coordinator.pubkey)) return null;
    if (siteType === 'named' && !isValidSiteSlug(normalizedSlug)) return null;
    return computeNsiteGatewayUrls(coordinator.pubkey, siteType, normalizedSlug, relays);
  }, [coordinator.pubkey, normalizedSlug, relays, siteType]);

  const totalBundleBytes = useMemo(
    () => bundleFiles.reduce((sum, f) => sum + f.size, 0),
    [bundleFiles]
  );

  const scanHostedBundle = useCallback(async () => {
    setScanningBundle(true);
    setBundleMessage(null);
    setDryRunReport(null);
    setPublishError(null);
    const res = await collectHostedBuildFiles();
    setScanningBundle(false);
    if (res.ok) {
      setSourceMode('hosted');
      setBundleFiles(res.files);
      setBundleIsDevMode(false);
      setBundleMessage(
        `Scanned ${res.files.length} production asset(s) from this hosted app.`
      );
    } else {
      setBundleFiles([]);
      setBundleIsDevMode(Boolean(res.isDevMode));
      setBundleMessage(
        res.error ??
          'No hosted build-manifest.json detected. Select your local dist/ folder or run "npm run publish:nsite".'
      );
    }
  }, []);

  useEffect(() => {
    void scanHostedBundle();
  }, [scanHostedBundle]);

  const handleFolderSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setScanningBundle(true);
    setPublishError(null);
    setDryRunReport(null);
    try {
      const files = await collectDirectoryFiles(fileList);
      setSourceMode('directory');
      setBundleIsDevMode(false);
      setBundleFiles(files);
      if (files.length === 0) {
        setBundleMessage('No publishable files found in the selected folder.');
      } else if (!files.some((f) => f.path === '/index.html')) {
        setBundleMessage(
          `Loaded ${files.length} file(s), but /index.html was not found at folder root. Make sure you select the built dist/ folder.`
        );
      } else {
        setBundleMessage(
          `Loaded ${files.length} built file(s) from selected folder ready to publish.`
        );
      }
    } catch (err) {
      setBundleMessage(
        err instanceof Error ? err.message : 'Failed to inspect selected folder.'
      );
    } finally {
      setScanningBundle(false);
      e.target.value = '';
    }
  };

  const commitBlossomServers = (nextRaw: string[]) => {
    const clean = sanitizeBlossomServerList(nextRaw);
    if (clean.length === 0) return;
    setBlossomServers(clean);
    onUpdateBlossomServers?.(clean);
  };

  const handleAddBlossomServer = () => {
    const clean = sanitizeBlossomServerUrl(newBlossomInput);
    if (!clean) {
      setPublishError('Enter a valid https:// Blossom server URL.');
      return;
    }
    if (blossomServers.includes(clean)) {
      setNewBlossomInput('');
      return;
    }
    setPublishError(null);
    commitBlossomServers([...blossomServers, clean]);
    setNewBlossomInput('');
  };

  const handleRemoveBlossomServer = (url: string) => {
    if (blossomServers.length <= 1) {
      setPublishError('Keep at least one Blossom server configured.');
      return;
    }
    setPublishError(null);
    commitBlossomServers(blossomServers.filter((s) => s !== url));
  };

  const handleResetBlossomServers = () => {
    setPublishError(null);
    commitBlossomServers([...DEFAULT_BLOSSOM_SERVERS]);
  };

  const handleFetchKind10063 = async () => {
    setFetchingBlossom10063(true);
    setPublishError(null);
    try {
      const discovered = await coordinator.fetchUserBlossomServers();
      if (discovered.length === 0) {
        setBundleMessage(
          'No kind:10063 Blossom server list found on configured relays for this pubkey.'
        );
      } else {
        commitBlossomServers(discovered);
        setBundleMessage(
          `Loaded ${discovered.length} Blossom server(s) from your kind:10063 list.`
        );
      }
    } catch (err) {
      setPublishError(
        err instanceof Error ? err.message : 'Failed to query kind:10063 server list.'
      );
    } finally {
      setFetchingBlossom10063(false);
    }
  };

  const handleDryRun = async () => {
    if (bundleFiles.length === 0 || blossomServers.length === 0) return;
    setDryRunBusy(true);
    setPublishError(null);
    const primaryServer = blossomServers[0];
    let existing = 0;
    for (const file of bundleFiles) {
      const ok = await checkBlossomBlobExists(primaryServer, file.sha256);
      if (ok) existing += 1;
    }
    setDryRunReport({
      checkedAt: Date.now(),
      existingOnPrimary: existing,
      missingOnPrimary: bundleFiles.length - existing,
      primaryServer,
    });
    setDryRunBusy(false);
  };

  const copyText = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(key);
      window.setTimeout(() => {
        setCopiedField((prev) => (prev === key ? null : prev));
      }, 1800);
    } catch {
      // Clipboard blocked
    }
  };

  const signerIsNip55 = coordinator.signerMode === 'nip55';
  const signerIsGuest = coordinator.signerMode === 'guest';

  const handlePublish = async () => {
    if (signerIsNip55) {
      setPublishError(
        'Amber (NIP-55) cannot sign multi-file Blossom uploads non-interactively in the browser. Connect NIP-07, NIP-46 bunker/QR, or run "npm run publish:nsite".'
      );
      return;
    }
    if (bundleFiles.length === 0) {
      setPublishError('Select a built dist/ folder or scan a production build first.');
      return;
    }
    if (!slugValid) {
      setPublishError(
        'Named site slug must be 1–13 lowercase alphanumeric or hyphen characters.'
      );
      return;
    }
    if (blossomServers.length === 0) {
      setPublishError('Configure at least one Blossom server.');
      return;
    }
    if (relays.length === 0) {
      setPublishError('Configure at least one Nostr write relay first.');
      return;
    }

    setPublishing(true);
    setPublishError(null);
    setPublishResult(null);

    try {
      // 1. Check & upload static assets to Blossom servers with BUD-11 kind:24242 auth
      const uploadRes = await publishAssetsToBlossomServers({
        files: bundleFiles,
        servers: blossomServers,
        signEvent: (tmpl) => coordinator.signCustomEvent(tmpl),
        onProgress: (p) => setPublishProgress(p),
      });

      if (!uploadRes.ok) {
        setPublishError(
          uploadRes.error || 'Blossom asset upload failed across configured servers.'
        );
        setPublishing(false);
        return;
      }

      // 2. Optionally publish kind:10063 server list so gateways find blobs reliably
      if (syncBlossomList10063) {
        setPublishProgress({
          phase: 'signing_manifest',
          message: 'Signing kind:10063 Blossom server list…',
          uploadedCount: uploadRes.uploadedCount,
          skippedCount: uploadRes.skippedCount,
          totalFiles: bundleFiles.length,
        });
        const serverTemplate = buildBlossomServerListTemplate(blossomServers);
        const signedServerEvent = await coordinator.signCustomEvent(serverTemplate);
        if (signedServerEvent.ok) {
          await coordinator.broadcastEventToRelays(signedServerEvent.event, relays);
        }
      }

      // 3. Build, sign & verify NIP-5A manifest (kind:15128 root or kind:35128 named)
      setPublishProgress({
        phase: 'signing_manifest',
        message:
          siteType === 'root'
            ? 'Requesting signature for NIP-5A root manifest (kind:15128)…'
            : `Requesting signature for NIP-5A named manifest (kind:35128, d=${normalizedSlug})…`,
        uploadedCount: uploadRes.uploadedCount,
        skippedCount: uploadRes.skippedCount,
        totalFiles: bundleFiles.length,
      });

      const manifestTemplate = buildNip5aManifestTemplate({
        siteType,
        slug: siteType === 'named' ? normalizedSlug : undefined,
        files: bundleFiles,
      });

      const signedManifestRes = await coordinator.signCustomEvent(manifestTemplate);
      if (!signedManifestRes.ok) {
        setPublishError(signedManifestRes.error);
        setPublishing(false);
        return;
      }

      const verifyRes = verifySignedEventMatchesRequest(
        signedManifestRes.event,
        { ...manifestTemplate, pubkey: coordinator.pubkey },
        coordinator.pubkey
      );
      if (!verifyRes.ok) {
        setPublishError(verifyRes.error || 'Signed NIP-5A manifest failed verification.');
        setPublishing(false);
        return;
      }

      // 4. Broadcast manifest event to write relays
      setPublishProgress({
        phase: 'publishing_relays',
        message: `Publishing manifest to ${relays.length} Nostr relay(s)…`,
        uploadedCount: uploadRes.uploadedCount,
        skippedCount: uploadRes.skippedCount,
        totalFiles: bundleFiles.length,
      });

      const broadcastRes = await coordinator.broadcastEventToRelays(
        signedManifestRes.event,
        relays
      );

      if (broadcastRes.accepted.length === 0) {
        const firstReason =
          Object.values(broadcastRes.rejected)[0] || 'No relay accepted the manifest.';
        setPublishError(`Manifest broadcast failed: ${firstReason}`);
        setPublishing(false);
        return;
      }

      // 5. Optional legacy NIP-5A v0 kind:34128 per-path events
      let legacyPublishedCount = 0;
      if (publishLegacy34128) {
        const legacyTemplates = buildLegacy34128FileTemplates(bundleFiles);
        for (let i = 0; i < legacyTemplates.length; i++) {
          setPublishProgress({
            phase: 'publishing_relays',
            message: `Publishing legacy kind:34128 path ${i + 1}/${legacyTemplates.length}…`,
            uploadedCount: uploadRes.uploadedCount,
            skippedCount: uploadRes.skippedCount,
            totalFiles: bundleFiles.length,
          });
          const legacySign = await coordinator.signCustomEvent(legacyTemplates[i]);
          if (legacySign.ok) {
            const legacyOut = await coordinator.broadcastEventToRelays(
              legacySign.event,
              relays
            );
            if (legacyOut.accepted.length > 0) legacyPublishedCount += 1;
          }
        }
      }

      const links = computeNsiteGatewayUrls(
        signedManifestRes.event.pubkey,
        siteType,
        siteType === 'named' ? normalizedSlug : undefined,
        relays
      );

      setPublishProgress({
        phase: 'done',
        message: `Published to ${broadcastRes.accepted.length}/${relays.length} relay(s).`,
        uploadedCount: uploadRes.uploadedCount,
        skippedCount: uploadRes.skippedCount,
        totalFiles: bundleFiles.length,
      });

      setPublishResult({
        manifestEventId: signedManifestRes.event.id,
        primaryUrl: links.primaryUrl,
        alternateUrl: links.alternateUrl,
        npub: links.npub,
        naddr: links.naddr,
        acceptedRelays: broadcastRes.accepted,
        rejectedRelays: broadcastRes.rejected,
        uploadedCount: uploadRes.uploadedCount,
        skippedCount: uploadRes.skippedCount,
        legacyPublishedCount,
      });

      onRecordNsitePublish?.({
        siteType,
        slug: siteType === 'named' ? normalizedSlug : undefined,
        eventId: signedManifestRes.event.id,
        gatewayUrl: links.primaryUrl,
        publishedAt: Date.now(),
      });
    } catch (err) {
      setPublishError(
        err instanceof Error ? err.message : 'Unexpected error during Nsite deploy.'
      );
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#B8B8B8] leading-relaxed">
        Deploy or clone MojiSurvivor onto your own Nostr <span className="text-white font-semibold">npub</span> using{' '}
        <span className="text-white font-semibold">NIP-5A</span> manifests (
        <code className="text-[#00F0FF]">kind:15128</code> root or{' '}
        <code className="text-[#00F0FF]">kind:35128</code> named) and{' '}
        <span className="text-white font-semibold">BUD-11</span> Blossom storage. Every clone automatically shares the{' '}
        <code className="text-[#FFB6D9]">#t:mojisurvivor</code> leaderboard and{' '}
        <code className="text-[#FFB6D9]">mojisurvivor:progress:v1</code> save sync.
      </p>

      {/* Signer Guard Notices */}
      {signerIsNip55 && (
        <div className="p-3 rounded-xl bg-[#0B0A12] border border-amber-500/40 text-xs text-amber-200 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-white">
              Amber (NIP-55) cannot batch-sign browser Blossom uploads
            </div>
            <p className="text-[#CBD5E1]">
              Switch to a browser extension (NIP-07) or remote bunker / QR session (NIP-46) in the{' '}
              <span className="text-white">Nostr Account</span> section above, or run{' '}
              <code className="text-[#00F0FF]">npm run publish:nsite</code> from your terminal.
            </p>
          </div>
        </div>
      )}

      {signerIsGuest && (
        <div className="p-3 rounded-xl bg-[#0B0A12] border border-[#00F0FF]/35 text-xs text-[#CBD5E1] flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-[#00F0FF] shrink-0 mt-0.5" />
          <div>
            Guest Mode signs with a temporary browser keypair. Sign in with NIP-07 or NIP-46 above if you want the Nsite hosted under your permanent{' '}
            <code className="text-white">npub</code>.
          </div>
        </div>
      )}

      {/* 1. Bundle Source */}
      <div className="p-3.5 rounded-xl bg-[#0B0A12] border border-white/10 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-white">1. Production Build Source</div>
            <div className="text-[11px] text-[#94A3B8]">
              Clone the currently running Nsite or upload a locally built{' '}
              <code className="text-white">dist/</code> folder.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={scanningBundle || publishing}
              onClick={() => void scanHostedBundle()}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                sourceMode === 'hosted'
                  ? 'bg-[#1A1626] border-[#00F0FF] text-white'
                  : 'bg-black border-white/15 text-[#B8B8B8] hover:border-white/30'
              }`}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-[#00F0FF] ${scanningBundle ? 'animate-spin' : ''}`}
              />
              <span>Clone Current App</span>
            </button>

            <button
              type="button"
              disabled={scanningBundle || publishing}
              onClick={() => folderInputRef.current?.click()}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                sourceMode === 'directory'
                  ? 'bg-[#1A1626] border-[#FF1493] text-white'
                  : 'bg-black border-white/15 text-[#B8B8B8] hover:border-white/30'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5 text-[#FF1493]" />
              <span>Select Built Folder (dist/)</span>
            </button>

            <input
              ref={setFolderInputAttributes}
              type="file"
              multiple
              onChange={(e) => void handleFolderSelected(e)}
              className="hidden"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums pt-1 border-t border-white/10">
          <span className="text-[#E2E8F0]">
            {bundleFiles.length > 0
              ? `${bundleFiles.length} file(s) · ${formatBytes(totalBundleBytes)}`
              : bundleIsDevMode
                ? 'Vite dev server detected — select dist/ or use CLI'
                : 'No bundle loaded'}
          </span>
          {bundleFiles.length > 0 && (
            <button
              type="button"
              disabled={dryRunBusy || publishing}
              onClick={() => void handleDryRun()}
              className="min-h-[34px] px-2.5 py-1 rounded-md bg-black border border-white/15 hover:border-[#00F0FF] text-[11px] font-semibold text-white whitespace-nowrap"
            >
              {dryRunBusy ? 'Checking…' : 'Dry Run / Check Blobs'}
            </button>
          )}
        </div>

        {bundleMessage && (
          <p className="text-[11px] text-[#B8B8B8] leading-relaxed">{bundleMessage}</p>
        )}

        {dryRunReport && (
          <div className="p-2.5 rounded-lg bg-black border border-white/10 text-[11px] font-mono tabular-nums text-[#CBD5E1] space-y-1">
            <div>
              Primary check ({dryRunReport.primaryServer.replace(/^https?:\/\//, '')}):{' '}
              <span className="text-emerald-400">
                {dryRunReport.existingOnPrimary} already hosted
              </span>
              {' · '}
              <span className="text-[#FFB6D9]">
                {dryRunReport.missingOnPrimary} to upload
              </span>
            </div>
            <div className="max-h-24 overflow-y-auto text-[10px] text-[#94A3B8] space-y-0.5">
              {bundleFiles.slice(0, 12).map((f) => (
                <div key={f.path} className="truncate">
                  {f.path} · {f.sha256.slice(0, 14)}… · {formatBytes(f.size)}
                </div>
              ))}
              {bundleFiles.length > 12 && (
                <div>+{bundleFiles.length - 12} more file(s)</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. Target Type & Slug */}
      <div className="p-3.5 rounded-xl bg-[#0B0A12] border border-white/10 space-y-3">
        <div className="text-xs font-semibold text-white">2. Nsite Target</div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            disabled={publishing}
            onClick={() => setSiteType('named')}
            className={`min-h-[48px] text-left p-3 rounded-xl border transition-colors ${
              siteType === 'named'
                ? 'bg-[#FF1493]/12 border-[#FF1493] text-white'
                : 'bg-black border-white/10 text-[#B8B8B8] hover:border-white/25'
            }`}
          >
            <div className="text-xs font-semibold text-white">Named Site (kind:35128)</div>
            <div className="text-[11px] text-[#94A3B8] mt-0.5">
              Custom subdomain slug (e.g. mojisurvivor) · Safe alongside personal sites
            </div>
          </button>

          <button
            type="button"
            disabled={publishing}
            onClick={() => setSiteType('root')}
            className={`min-h-[48px] text-left p-3 rounded-xl border transition-colors ${
              siteType === 'root'
                ? 'bg-[#FF1493]/12 border-[#FF1493] text-white'
                : 'bg-black border-white/10 text-[#B8B8B8] hover:border-white/25'
            }`}
          >
            <div className="text-xs font-semibold text-white">Root Site (kind:15128)</div>
            <div className="text-[11px] text-[#94A3B8] mt-0.5">
              Publishes directly to npub.nsite.lol (replaces your existing root Nsite)
            </div>
          </button>
        </div>

        {siteType === 'named' && (
          <div className="space-y-1.5">
            <label
              htmlFor="nsite-slug-input"
              className="block text-[11px] font-medium text-[#B8B8B8]"
            >
              Named Site Slug (1–13 chars, lowercase letters, digits, hyphens)
            </label>
            <div className="flex items-center gap-2">
              <input
                id="nsite-slug-input"
                type="text"
                maxLength={13}
                value={slugInput}
                onChange={(e) => setSlugInput(e.target.value)}
                onBlur={() => {
                  if (normalizedSlug) setSlugInput(normalizedSlug);
                }}
                placeholder="mojisurvivor"
                className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-black border border-white/15 focus:border-[#FF1493] outline-none text-xs font-mono text-white"
              />
              <span
                className={`text-[11px] font-mono shrink-0 ${
                  slugValid ? 'text-emerald-400' : 'text-amber-300'
                }`}
              >
                {slugValid ? `${normalizedSlug.length}/13 valid` : 'Invalid slug'}
              </span>
            </div>
          </div>
        )}

        {gatewayPreview && (
          <div className="p-2.5 rounded-lg bg-black border border-white/10 text-[11px] font-mono space-y-1">
            <div className="text-[#94A3B8] flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-[#00F0FF]" />
              <span>Preview URL:</span>
            </div>
            <div className="text-[#00F0FF] break-all">{gatewayPreview.primaryUrl}</div>
            <div className="text-[#94A3B8] break-all">{gatewayPreview.alternateUrl}</div>
          </div>
        )}

        <label className="flex items-center gap-2 text-xs text-[#CBD5E1] cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={publishLegacy34128}
            onChange={(e) => setPublishLegacy34128(e.target.checked)}
            className="accent-[#FF1493] w-4 h-4"
          />
          <span>
            Also emit legacy <code className="text-white">kind:34128</code> per-path events (for older gateways)
          </span>
        </label>
      </div>

      {/* 3. Blossom Servers & Relays */}
      <div className="p-3.5 rounded-xl bg-[#0B0A12] border border-white/10 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
            <Server className="w-3.5 h-3.5 text-[#00F0FF]" />
            <span>3. Blossom Storage Servers</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={fetchingBlossom10063 || publishing}
              onClick={() => void handleFetchKind10063()}
              className="min-h-[34px] px-2.5 py-1 rounded-md bg-black border border-white/15 hover:border-[#00F0FF] text-[11px] font-medium text-white inline-flex items-center gap-1 whitespace-nowrap"
            >
              <RefreshCw
                className={`w-3 h-3 text-[#00F0FF] ${fetchingBlossom10063 ? 'animate-spin' : ''}`}
              />
              <span>Load My kind:10063</span>
            </button>
            <button
              type="button"
              disabled={publishing}
              onClick={handleResetBlossomServers}
              className="min-h-[34px] px-2.5 py-1 rounded-md bg-black border border-white/15 hover:border-white/30 text-[11px] font-medium text-[#B8B8B8] inline-flex items-center gap-1 whitespace-nowrap"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Defaults</span>
            </button>
          </div>
        </div>

        <div className="divide-y divide-white/10 rounded-lg bg-black border border-white/10">
          {blossomServers.map((srv) => (
            <div key={srv} className="px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-xs font-mono text-[#E2E8F0] truncate">{srv}</span>
              <button
                type="button"
                disabled={blossomServers.length <= 1 || publishing}
                aria-label={`Remove Blossom server ${srv}`}
                onClick={() => handleRemoveBlossomServer(srv)}
                className="p-1 text-[#94A3B8] hover:text-rose-400 disabled:opacity-40"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={newBlossomInput}
            onChange={(e) => setNewBlossomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddBlossomServer();
              }
            }}
            placeholder="https://blossom.example.com"
            className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-black border border-white/15 focus:border-[#00F0FF] outline-none text-xs font-mono text-white"
          />
          <button
            type="button"
            disabled={publishing}
            onClick={handleAddBlossomServer}
            className="min-h-[38px] px-3 py-1.5 rounded-lg bg-black border border-white/15 hover:border-[#00F0FF] text-xs font-semibold text-white inline-flex items-center gap-1 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        </div>

        <label className="flex items-center gap-2 text-xs text-[#CBD5E1] cursor-pointer">
          <input
            type="checkbox"
            checked={syncBlossomList10063}
            onChange={(e) => setSyncBlossomList10063(e.target.checked)}
            className="accent-[#FF1493] w-4 h-4"
          />
          <span>
            Also publish updated <code className="text-white">kind:10063</code> server list to relays
          </span>
        </label>

        <div className="pt-2 border-t border-white/10 text-[11px] font-mono text-[#94A3B8]">
          Write relays ({relays.length}): {relays.join(' · ')}
        </div>
      </div>

      {/* Progress / Errors */}
      {publishProgress && publishing && (
        <div className="p-3 rounded-xl bg-[#0B0A12] border border-[#00F0FF]/40 text-xs text-[#00F0FF] flex items-center gap-2 font-mono tabular-nums">
          <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
          <span>{publishProgress.message}</span>
        </div>
      )}

      {publishError && (
        <div className="p-3 rounded-xl bg-[#0B0A12] border border-amber-500/40 text-xs text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{publishError}</span>
        </div>
      )}

      {/* Primary Deploy Action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          disabled={publishing || signerIsNip55 || bundleFiles.length === 0 || !slugValid}
          onClick={() => void handlePublish()}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#FF1493] hover:bg-[#CD0D72] disabled:opacity-45 text-sm font-semibold text-white transition-colors inline-flex items-center gap-2 whitespace-nowrap"
        >
          <Rocket className="w-4 h-4" />
          <span>{publishing ? 'Publishing Nsite…' : 'Publish to Nsite'}</span>
        </button>

        {lastNsitePublish && !publishResult && (
          <div className="text-[11px] font-mono text-[#94A3B8] truncate">
            Last deploy:{' '}
            {lastNsitePublish.siteType === 'named'
              ? `/${lastNsitePublish.slug}`
              : 'root'}{' '}
            · {new Date(lastNsitePublish.publishedAt).toLocaleDateString()}
          </div>
        )}
      </div>

      {/* Post-Publish Receipt */}
      {publishResult && (
        <div className="p-3.5 rounded-xl bg-[#0B0A12] border border-emerald-500/45 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              Nsite Live! ({publishResult.uploadedCount} uploaded ·{' '}
              {publishResult.skippedCount} deduped ·{' '}
              {publishResult.acceptedRelays.length}/{relays.length} relays)
              {publishResult.legacyPublishedCount > 0
                ? ` · ${publishResult.legacyPublishedCount} legacy kind:34128`
                : ''}
            </span>
          </div>

          <div className="space-y-1.5 text-xs font-mono">
            <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-black border border-white/10">
              <a
                href={publishResult.primaryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#00F0FF] hover:underline truncate inline-flex items-center gap-1"
              >
                <span className="truncate">{publishResult.primaryUrl}</span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              </a>
              <button
                type="button"
                onClick={() => void copyText(publishResult.primaryUrl, 'primaryUrl')}
                className="px-2 py-1 rounded bg-[#111018] border border-white/15 text-[11px] text-white inline-flex items-center gap-1 shrink-0"
              >
                {copiedField === 'primaryUrl' ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                <span>Copy URL</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#B8B8B8]">
              <button
                type="button"
                onClick={() => void copyText(publishResult.alternateUrl, 'altUrl')}
                className="px-2 py-1 rounded bg-black border border-white/15 hover:border-white/30 text-white inline-flex items-center gap-1"
              >
                {copiedField === 'altUrl' ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                <span>nsite.run URL</span>
              </button>

              <button
                type="button"
                onClick={() => void copyText(publishResult.npub, 'npub')}
                className="px-2 py-1 rounded bg-black border border-white/15 hover:border-white/30 text-white inline-flex items-center gap-1"
              >
                {copiedField === 'npub' ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                <span>Copy npub</span>
              </button>

              {publishResult.naddr && (
                <button
                  type="button"
                  onClick={() => void copyText(publishResult.naddr!, 'naddr')}
                  className="px-2 py-1 rounded bg-black border border-white/15 hover:border-white/30 text-white inline-flex items-center gap-1"
                >
                  {copiedField === 'naddr' ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>Copy naddr</span>
                </button>
              )}

              <span className="text-[#94A3B8] truncate">
                event: {publishResult.manifestEventId.slice(0, 14)}…
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
