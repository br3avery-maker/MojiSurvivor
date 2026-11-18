import { nip19, type NostrEvent } from 'nostr-tools';

export const DEFAULT_BLOSSOM_SERVERS: readonly string[] = [
  'https://blossom.primal.net',
  'https://cdn.satellite.earth',
  'https://blossom.band',
];

export const NSITE_SLUG_REGEX = /^[a-z0-9-]{1,13}$/;
export const BUILD_MANIFEST_FILENAME = 'build-manifest.json';

export interface SiteAssetFile {
  path: string;
  bytes: Uint8Array;
  sha256: string;
  size: number;
  contentType: string;
}

export interface HostedBuildCollectionResult {
  ok: boolean;
  files: SiteAssetFile[];
  isDevMode?: boolean;
  error?: string;
}

export interface BuildManifestEntry {
  path: string;
  size: number;
  contentType?: string;
}

export interface BuildManifestDocument {
  version: number;
  generatedAt: string;
  files: BuildManifestEntry[];
}

export type NsiteTargetType = 'root' | 'named';

export interface NsitePublishProgress {
  phase:
    | 'collecting'
    | 'checking_blobs'
    | 'signing_blossom_auth'
    | 'uploading_blobs'
    | 'signing_manifest'
    | 'publishing_relays'
    | 'done';
  message: string;
  uploadedCount: number;
  skippedCount: number;
  totalFiles: number;
}

export interface NsiteGatewayLinks {
  npub: string;
  primaryUrl: string;
  alternateUrl: string;
  naddr?: string;
}

export function normalizeSiteSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 13);
}

export function isValidSiteSlug(slug: string): boolean {
  return NSITE_SLUG_REGEX.test(slug);
}

export function normalizeSitePath(raw: string): string {
  let clean = raw.trim().replace(/\\/g, '/');
  clean = clean.split('?')[0].split('#')[0];
  clean = clean.replace(/^(\.\/)+/, '');
  if (!clean.startsWith('/')) clean = `/${clean}`;
  clean = clean.replace(/\/{2,}/g, '/');
  return clean === '/' ? '/index.html' : clean;
}

const USED_AISTUDIO_ASSETS = new Set<string>([
  '/assets/aistudio/moji_survivor_emblem_1793749794956-C7_7CmkR_406e3441.jpg',
]);

export function shouldIncludeNsiteAssetPath(rawPath: string): boolean {
  const norm = normalizeSitePath(rawPath);
  const lower = norm.toLowerCase();
  if (lower.endsWith('.map') || lower.endsWith('.zip')) return false;
  if (norm.split('/').some((seg) => seg.startsWith('.'))) return false;
  if (lower.startsWith('/assets/aistudio/') && !USED_AISTUDIO_ASSETS.has(norm)) {
    return false;
  }
  return true;
}

export function sanitizeBlossomServerUrl(raw: string): string | null {
  try {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const withScheme = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (
      parsed.protocol === 'http:' &&
      parsed.hostname !== 'localhost' &&
      parsed.hostname !== '127.0.0.1'
    ) {
      return null;
    }
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

export function sanitizeBlossomServerList(rawList: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of rawList) {
    const clean = sanitizeBlossomServerUrl(item);
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  }
  return out;
}

export function guessMimeType(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html; charset=utf-8';
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'application/javascript; charset=utf-8';
  if (lower.endsWith('.css')) return 'text/css; charset=utf-8';
  if (lower.endsWith('.json') || lower.endsWith('.webmanifest')) return 'application/json; charset=utf-8';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.ico')) return 'image/x-icon';
  if (lower.endsWith('.woff2')) return 'font/woff2';
  if (lower.endsWith('.woff')) return 'font/woff';
  if (lower.endsWith('.wasm')) return 'application/wasm';
  if (lower.endsWith('.txt')) return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

function toArrayBufferCopy(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export async function computeSha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = toArrayBufferCopy(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buf);
  const view = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < view.length; i++) {
    hex += view[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function encodeBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

/**
 * Builds a BUD-11 `kind: 24242` Blossom upload authorization event template
 * covering one or multiple SHA-256 `x` hashes.
 */
export function buildBatchedBlossomUploadAuthTemplate(
  sha256Hashes: readonly string[],
  opts?: {
    createdAtSec?: number;
    ttlSec?: number;
    content?: string;
  }
): Omit<NostrEvent, 'id' | 'pubkey' | 'sig'> {
  const createdAt = Math.floor(opts?.createdAtSec ?? Date.now() / 1000);
  const ttl = Math.max(60, Math.floor(opts?.ttlSec ?? 600));
  const uniqueHashes = Array.from(
    new Set(
      sha256Hashes
        .map((h) => h.trim().toLowerCase())
        .filter((h) => /^[0-9a-f]{64}$/.test(h))
    )
  );
  if (uniqueHashes.length === 0) {
    throw new Error('At least one valid 64-hex SHA-256 digest is required for BUD-11 upload auth.');
  }

  return {
    kind: 24242,
    created_at: createdAt,
    tags: [
      ['t', 'upload'],
      ['expiration', String(createdAt + ttl)],
      ...uniqueHashes.map((h) => ['x', h]),
    ],
    content: opts?.content ?? `Upload ${uniqueHashes.length} MojiSurvivor bundle file(s)`,
  };
}

export function buildSingleBlossomUploadAuthTemplate(
  sha256Hash: string,
  opts?: {
    createdAtSec?: number;
    ttlSec?: number;
    content?: string;
  }
): Omit<NostrEvent, 'id' | 'pubkey' | 'sig'> {
  return buildBatchedBlossomUploadAuthTemplate([sha256Hash], {
    ...opts,
    content: opts?.content ?? `Upload MojiSurvivor file ${sha256Hash.slice(0, 12)}`,
  });
}

/**
 * Builds an unsigned NIP-5A Nsite manifest event:
 * - Root site (`siteType: 'root'`): `kind: 15128` replaceable event (NO `d` tag!)
 * - Named site (`siteType: 'named'`): `kind: 35128` addressable event (`["d", slug]`, max 13 chars `[a-z0-9-]`)
 */
export function buildNip5aManifestTemplate(opts: {
  siteType: NsiteTargetType;
  slug?: string;
  files: ReadonlyArray<Pick<SiteAssetFile, 'path' | 'sha256'>>;
  title?: string;
  description?: string;
  createdAtSec?: number;
  includeGameTopicTag?: boolean;
}): Omit<NostrEvent, 'id' | 'pubkey' | 'sig'> {
  const createdAt = Math.floor(opts.createdAtSec ?? Date.now() / 1000);
  const sortedFiles = [...opts.files]
    .map((f) => ({
      path: normalizeSitePath(f.path),
      sha256: f.sha256.trim().toLowerCase(),
    }))
    .filter((f) => /^[0-9a-f]{64}$/.test(f.sha256))
    .sort((a, b) => a.path.localeCompare(b.path));

  if (sortedFiles.length === 0) {
    throw new Error('Cannot build NIP-5A manifest without hashed files.');
  }

  const tags: string[][] = [];

  if (opts.siteType === 'named') {
    const cleanSlug = (opts.slug ?? '').trim();
    if (!isValidSiteSlug(cleanSlug)) {
      throw new Error(
        'Named site slug must be 1–13 lowercase alphanumeric or hyphen characters (^[a-z0-9-]{1,13}$).'
      );
    }
    tags.push(['d', cleanSlug]);
  }

  for (const file of sortedFiles) {
    tags.push(['path', file.path, file.sha256]);
  }

  tags.push(['title', opts.title || 'MojiSurvivor']);
  tags.push([
    'description',
    opts.description || 'Retro-arcade Nostr survivor action game powered by NIP-30 custom emojis.',
  ]);
  if (opts.includeGameTopicTag !== false) {
    tags.push(['t', 'mojisurvivor']);
  }
  tags.push(['client', 'mojisurvivor']);
  tags.push([
    'alt',
    opts.siteType === 'root'
      ? 'MojiSurvivor Nsite root manifest (NIP-5A)'
      : `MojiSurvivor Nsite named manifest (${opts.slug})`,
  ]);

  return {
    kind: opts.siteType === 'root' ? 15128 : 35128,
    created_at: createdAt,
    tags,
    content: '',
  };
}

/**
 * Builds legacy NIP-5A v0 `kind: 34128` per-path file events for older gateways.
 */
export function buildLegacy34128FileTemplates(
  files: ReadonlyArray<Pick<SiteAssetFile, 'path' | 'sha256'>>,
  createdAtSec = Math.floor(Date.now() / 1000)
): Array<Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>> {
  return files.map((file) => ({
    kind: 34128,
    created_at: createdAtSec,
    tags: [
      ['d', normalizeSitePath(file.path)],
      ['x', file.sha256.trim().toLowerCase()],
      ['client', 'mojisurvivor'],
    ],
    content: '',
  }));
}

/**
 * Builds a user Blossom server list (`kind: 10063`) event template (`["server", url]`).
 */
export function buildBlossomServerListTemplate(
  servers: readonly string[],
  createdAtSec = Math.floor(Date.now() / 1000)
): Omit<NostrEvent, 'id' | 'pubkey' | 'sig'> {
  const cleaned = sanitizeBlossomServerList(servers);
  if (cleaned.length === 0) {
    throw new Error('At least one valid Blossom server URL is required for kind:10063.');
  }
  return {
    kind: 10063,
    created_at: createdAtSec,
    tags: cleaned.map((url) => ['server', url]),
    content: '',
  };
}

export function computeNsiteGatewayUrls(
  pubkeyHex: string,
  siteType: NsiteTargetType,
  slug?: string,
  relays?: readonly string[]
): NsiteGatewayLinks {
  const cleanPub = pubkeyHex.toLowerCase();
  const npub = nip19.npubEncode(cleanPub);
  if (siteType === 'named' && slug && isValidSiteSlug(slug)) {
    const naddr = nip19.naddrEncode({
      kind: 35128,
      pubkey: cleanPub,
      identifier: slug,
      relays: relays ? relays.slice(0, 4) : undefined,
    });
    return {
      npub,
      primaryUrl: `https://${npub}-${slug}.nsite.lol/`,
      alternateUrl: `https://nsite.run/${npub}/${slug}/`,
      naddr,
    };
  }
  return {
    npub,
    primaryUrl: `https://${npub}.nsite.lol/`,
    alternateUrl: `https://nsite.run/${npub}/`,
  };
}

export async function checkBlossomBlobExists(
  serverUrl: string,
  sha256: string,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  const base = sanitizeBlossomServerUrl(serverUrl);
  if (!base) return false;
  try {
    const res = await fetchImpl(`${base}/${sha256}`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(6000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function uploadBlossomBlob(
  serverUrl: string,
  file: SiteAssetFile,
  signedAuthEvent: NostrEvent,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; status: number; error?: string }> {
  const base = sanitizeBlossomServerUrl(serverUrl);
  if (!base) return { ok: false, status: 0, error: `Invalid server URL: ${serverUrl}` };

  try {
    const authHeader = `Nostr ${encodeBase64Utf8(JSON.stringify(signedAuthEvent))}`;
    const res = await fetchImpl(`${base}/upload`, {
      method: 'PUT',
      headers: {
        Authorization: authHeader,
        'Content-Type': file.contentType || 'application/octet-stream',
        'X-SHA-256': file.sha256,
      },
      body: toArrayBufferCopy(file.bytes),
      signal: AbortSignal.timeout(25_000),
    });

    if (res.ok) {
      return { ok: true, status: res.status };
    }

    const reasonHeader = res.headers.get('X-Reason');
    let bodyText = '';
    try {
      bodyText = (await res.text()).slice(0, 140);
    } catch {
      // Ignore read failure
    }
    return {
      ok: false,
      status: res.status,
      error: reasonHeader || bodyText || `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : 'Network error during upload',
    };
  }
}

/**
 * Collects production static files from the currently hosted app using `./build-manifest.json`.
 * Rejects cleanly when running on a Vite dev server (pointing at `/src/*.tsx` instead of a static bundle).
 */
export async function collectHostedBuildFiles(
  fetchImpl: typeof fetch = fetch
): Promise<HostedBuildCollectionResult> {
  try {
    const res = await fetchImpl(`./${BUILD_MANIFEST_FILENAME}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return {
        ok: false,
        files: [],
        isDevMode: true,
        error:
          'No built static bundle manifest detected (typical on Vite dev server). Select your local dist/ folder or run "npm run publish:nsite".',
      };
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      return {
        ok: false,
        files: [],
        isDevMode: true,
        error:
          'Running inside dev mode without a static build-manifest.json. Select your built dist/ folder or use the CLI script.',
      };
    }

    const manifest = (await res.json()) as BuildManifestDocument;
    if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.files) || manifest.files.length === 0) {
      return {
        ok: false,
        files: [],
        isDevMode: true,
        error: 'Hosted build-manifest.json is malformed or empty.',
      };
    }

    const hasSourceModules = manifest.files.some(
      (f) => f.path.endsWith('.tsx') || f.path.endsWith('.ts')
    );
    if (hasSourceModules) {
      return {
        ok: false,
        files: [],
        isDevMode: true,
        error: 'Dev TypeScript sources cannot be published directly. Run "npm run build" first.',
      };
    }

    const files: SiteAssetFile[] = [];
    for (const entry of manifest.files) {
      const normPath = normalizeSitePath(entry.path);
      const relUrl = `.${normPath}`;
      const assetRes = await fetchImpl(relUrl, {
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      });
      if (!assetRes.ok) {
        return {
          ok: false,
          files: [],
          error: `Failed to fetch hosted asset ${normPath} (HTTP ${assetRes.status}).`,
        };
      }
      const bytes = new Uint8Array(await assetRes.arrayBuffer());
      const sha256 = await computeSha256Hex(bytes);
      files.push({
        path: normPath,
        bytes,
        sha256,
        size: bytes.byteLength,
        contentType: entry.contentType || guessMimeType(normPath),
      });
    }

    // Also include build-manifest.json itself so deployed clones remain self-clonable!
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
    const manifestSha = await computeSha256Hex(manifestBytes);
    if (!files.some((f) => f.path === `/${BUILD_MANIFEST_FILENAME}`)) {
      files.push({
        path: `/${BUILD_MANIFEST_FILENAME}`,
        bytes: manifestBytes,
        sha256: manifestSha,
        size: manifestBytes.byteLength,
        contentType: 'application/json; charset=utf-8',
      });
    }

    return { ok: true, files };
  } catch (err) {
    return {
      ok: false,
      files: [],
      isDevMode: true,
      error:
        err instanceof Error
          ? err.message
          : 'Could not inspect hosted bundle manifest.',
    };
  }
}

/**
 * Reads files selected via `<input type="file" webkitdirectory>` and strips the outer
 * directory name (e.g. `dist/index.html` -> `/index.html`).
 */
export async function collectDirectoryFiles(fileList: FileList): Promise<SiteAssetFile[]> {
  const rawFiles = Array.from(fileList);
  const paths = rawFiles.map((f) => (f.webkitRelativePath || f.name).replace(/\\/g, '/'));
  const firstSegments = new Set(
    paths.map((p) => (p.includes('/') ? p.split('/')[0] : ''))
  );
  const sharedRootPrefix =
    firstSegments.size === 1 && Array.from(firstSegments)[0] !== ''
      ? `${Array.from(firstSegments)[0]}/`
      : '';

  const collected: SiteAssetFile[] = [];
  for (let i = 0; i < rawFiles.length; i++) {
    const file = rawFiles[i];
    let relPath = paths[i];
    if (sharedRootPrefix && relPath.startsWith(sharedRootPrefix)) {
      relPath = relPath.slice(sharedRootPrefix.length);
    }
    if (
      !relPath ||
      !shouldIncludeNsiteAssetPath(relPath)
    ) {
      continue;
    }
    const normPath = normalizeSitePath(relPath);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha256 = await computeSha256Hex(bytes);
    collected.push({
      path: normPath,
      bytes,
      sha256,
      size: bytes.byteLength,
      contentType: file.type || guessMimeType(normPath),
    });
  }

  return collected.sort((a, b) => a.path.localeCompare(b.path));
}

export async function publishAssetsToBlossomServers(opts: {
  files: readonly SiteAssetFile[];
  servers: readonly string[];
  signEvent: (
    template: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>
  ) => Promise<{ ok: true; event: NostrEvent } | { ok: false; error: string }>;
  onProgress?: (progress: NsitePublishProgress) => void;
  fetchImpl?: typeof fetch;
}): Promise<{
  ok: boolean;
  uploadedCount: number;
  skippedCount: number;
  perServerResults: Record<string, { okCount: number; failedFiles: string[]; errors: string[] }>;
  error?: string;
}> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const cleanServers = sanitizeBlossomServerList(opts.servers);
  if (cleanServers.length === 0) {
    return {
      ok: false,
      uploadedCount: 0,
      skippedCount: 0,
      perServerResults: {},
      error: 'No valid Blossom servers configured.',
    };
  }

  const totalFiles = opts.files.length;
  opts.onProgress?.({
    phase: 'checking_blobs',
    message: `Checking ${totalFiles} file hashes across ${cleanServers.length} Blossom server(s)…`,
    uploadedCount: 0,
    skippedCount: 0,
    totalFiles,
  });

  // Check which files are missing on each server
  const missingByServer = new Map<string, SiteAssetFile[]>();
  const allMissingHashes = new Set<string>();
  let skippedChecks = 0;

  for (const server of cleanServers) {
    const missing: SiteAssetFile[] = [];
    for (const file of opts.files) {
      const exists = await checkBlossomBlobExists(server, file.sha256, fetchImpl);
      if (exists) {
        skippedChecks += 1;
      } else {
        missing.push(file);
        allMissingHashes.add(file.sha256);
      }
    }
    missingByServer.set(server, missing);
  }

  const perServerResults: Record<
    string,
    { okCount: number; failedFiles: string[]; errors: string[] }
  > = {};
  for (const server of cleanServers) {
    const missingCount = missingByServer.get(server)?.length ?? 0;
    perServerResults[server] = {
      okCount: totalFiles - missingCount,
      failedFiles: [],
      errors: [],
    };
  }

  if (allMissingHashes.size === 0) {
    return {
      ok: true,
      uploadedCount: 0,
      skippedCount: skippedChecks,
      perServerResults,
    };
  }

  // Try one batched BUD-11 kind:24242 auth signature covering all missing hashes
  opts.onProgress?.({
    phase: 'signing_blossom_auth',
    message: `Requesting BUD-11 kind:24242 signature for ${allMissingHashes.size} missing blob(s)…`,
    uploadedCount: 0,
    skippedCount: skippedChecks,
    totalFiles,
  });

  const batchSignRes = await opts.signEvent(
    buildBatchedBlossomUploadAuthTemplate(Array.from(allMissingHashes))
  );
  if (!batchSignRes.ok) {
    return {
      ok: false,
      uploadedCount: 0,
      skippedCount: skippedChecks,
      perServerResults,
      error: batchSignRes.error,
    };
  }

  let uploadedCount = 0;
  const singleAuthCache = new Map<string, NostrEvent>();

  for (const server of cleanServers) {
    const missing = missingByServer.get(server) ?? [];
    for (const file of missing) {
      opts.onProgress?.({
        phase: 'uploading_blobs',
        message: `Uploading ${file.path} to ${server.replace(/^https?:\/\//, '')}…`,
        uploadedCount,
        skippedCount: skippedChecks,
        totalFiles,
      });

      let upRes = await uploadBlossomBlob(server, file, batchSignRes.event, fetchImpl);

      // Automatic fallback: some Blossom servers only accept single-x kind:24242 tokens
      if (!upRes.ok && (upRes.status === 400 || upRes.status === 401 || upRes.status === 403)) {
        let singleAuth = singleAuthCache.get(file.sha256);
        if (!singleAuth) {
          const singleRes = await opts.signEvent(
            buildSingleBlossomUploadAuthTemplate(file.sha256)
          );
          if (singleRes.ok) {
            singleAuth = singleRes.event;
            singleAuthCache.set(file.sha256, singleAuth);
          }
        }
        if (singleAuth) {
          upRes = await uploadBlossomBlob(server, file, singleAuth, fetchImpl);
        }
      }

      if (upRes.ok) {
        uploadedCount += 1;
        perServerResults[server].okCount += 1;
      } else {
        perServerResults[server].failedFiles.push(file.path);
        if (upRes.error) {
          perServerResults[server].errors.push(`${file.path}: ${upRes.error}`);
        }
      }
    }
  }

  const allSucceededOnAtLeastOneServer = opts.files.every((f) =>
    cleanServers.some((srv) => !perServerResults[srv].failedFiles.includes(f.path))
  );

  return {
    ok: allSucceededOnAtLeastOneServer,
    uploadedCount,
    skippedCount: skippedChecks,
    perServerResults,
    error: allSucceededOnAtLeastOneServer
      ? undefined
      : 'One or more files failed to upload to all configured Blossom servers.',
  };
}
