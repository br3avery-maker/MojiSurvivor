import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip19,
  SimplePool,
  type NostrEvent,
} from 'nostr-tools';
import { BunkerSigner, createNostrConnectURI, parseBunkerInput } from 'nostr-tools/nip46';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';
import QRCode from 'qrcode';
import {
  BUILD_MANIFEST_FILENAME,
  buildBlossomServerListTemplate,
  buildLegacy34128FileTemplates,
  buildNip5aManifestTemplate,
  checkBlossomBlobExists,
  computeNsiteGatewayUrls,
  computeSha256Hex,
  DEFAULT_BLOSSOM_SERVERS,
  guessMimeType,
  isValidSiteSlug,
  normalizeSitePath,
  normalizeSiteSlug,
  publishAssetsToBlossomServers,
  sanitizeBlossomServerList,
  shouldIncludeNsiteAssetPath,
  type NsiteTargetType,
  type SiteAssetFile,
} from '../src/lib/nsitePublisher';
import { DEFAULT_RELAYS } from '../src/lib/storage';

interface CliOptions {
  build: boolean;
  dir: string;
  siteType: NsiteTargetType;
  slug: string;
  legacy34128: boolean;
  sync10063: boolean;
  dryRun: boolean;
  blossomServers: string[];
  relays: string[];
  bunkerUri?: string;
}

function parseCliArgs(argv: string[]): CliOptions {
  let build = false;
  let dir = 'dist';
  let siteType: NsiteTargetType = 'named';
  let slug = 'mojisurvivor';
  let legacy34128 = false;
  let sync10063 = false;
  let dryRun = false;
  let blossomServers = [...DEFAULT_BLOSSOM_SERVERS];
  let relays = [...DEFAULT_RELAYS];
  let bunkerUri: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--build') {
      build = true;
    } else if (arg === '--dir' && argv[i + 1]) {
      dir = argv[++i];
    } else if (arg === '--root') {
      siteType = 'root';
    } else if (arg === '--named') {
      siteType = 'named';
      if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
        slug = argv[++i];
      }
    } else if (arg === '--slug' && argv[i + 1]) {
      siteType = 'named';
      slug = argv[++i];
    } else if (arg === '--legacy-34128') {
      legacy34128 = true;
    } else if (arg === '--sync-10063') {
      sync10063 = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--blossom' && argv[i + 1]) {
      const parsed = sanitizeBlossomServerList(argv[++i].split(','));
      if (parsed.length > 0) blossomServers = parsed;
    } else if (arg === '--relays' && argv[i + 1]) {
      const parsed = argv[++i]
        .split(',')
        .map((r) => r.trim())
        .filter((r) => r.startsWith('wss://') || r.startsWith('ws://'));
      if (parsed.length > 0) relays = Array.from(new Set(parsed));
    } else if (arg === '--bunker' && argv[i + 1]) {
      bunkerUri = argv[++i].trim();
    } else if (arg === '--help' || arg === '-h') {
      console.log(`MojiSurvivor NIP-5A Nsite Publisher

Usage:
  npm run publish:nsite -- [options]

Options:
  --build                 Run "npm run build" before collecting files
  --dir <path>            Directory to publish (default: dist)
  --root                  Publish as root site (kind:15128, no d-tag)
  --named <slug>          Publish as named site (kind:35128, default: mojisurvivor)
  --legacy-34128          Also publish legacy NIP-5A kind:34128 per-path events
  --sync-10063            Publish kind:10063 Blossom server list
  --blossom <csv>         Comma-separated Blossom servers
  --relays <csv>          Comma-separated Nostr wss:// relays
  --bunker <uri>          Sign with a NIP-46 bunker:// URI
  --dry-run               Inspect & hash bundle and verify Blossom presence without signing
  NOSTR_NSEC env var      Sign non-interactively with an nsec1... or 64-hex secret key
`);
      process.exit(0);
    }
  }

  return {
    build,
    dir,
    siteType,
    slug: normalizeSiteSlug(slug),
    legacy34128,
    sync10063,
    dryRun,
    blossomServers,
    relays,
    bunkerUri,
  };
}

async function collectFilesFromDisk(targetDir: string): Promise<SiteAssetFile[]> {
  const absRoot = path.resolve(targetDir);
  if (!fs.existsSync(absRoot) || !fs.statSync(absRoot).isDirectory()) {
    throw new Error(`Directory not found: ${absRoot}. Run "npm run build" or pass --build.`);
  }

  const collected: SiteAssetFile[] = [];
  const walk = async (dir: string, prefix: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(fullPath, rel);
      } else if (entry.isFile() && shouldIncludeNsiteAssetPath(rel)) {
        const normPath = normalizeSitePath(rel);
        const bytes = new Uint8Array(fs.readFileSync(fullPath));
        const sha256 = await computeSha256Hex(bytes);
        collected.push({
          path: normPath,
          bytes,
          sha256,
          size: bytes.byteLength,
          contentType: guessMimeType(normPath),
        });
      }
    }
  };

  await walk(absRoot, '');
  collected.sort((a, b) => a.path.localeCompare(b.path));

  // Ensure self-cloning build-manifest.json exists and matches collected assets
  if (!collected.some((f) => f.path === `/${BUILD_MANIFEST_FILENAME}`)) {
    const manifestDoc = {
      version: 1,
      generatedAt: new Date().toISOString(),
      files: collected.map((f) => ({
        path: f.path,
        size: f.size,
        contentType: f.contentType,
      })),
    };
    const manifestBytes = new Uint8Array(
      Buffer.from(JSON.stringify(manifestDoc, null, 2), 'utf-8')
    );
    const manifestSha = await computeSha256Hex(manifestBytes);
    collected.push({
      path: `/${BUILD_MANIFEST_FILENAME}`,
      bytes: manifestBytes,
      sha256: manifestSha,
      size: manifestBytes.byteLength,
      contentType: 'application/json; charset=utf-8',
    });
    collected.sort((a, b) => a.path.localeCompare(b.path));
  }

  return collected;
}

function decodeSecretKeyEnv(raw: string): Uint8Array {
  const trimmed = raw.trim();
  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return hexToBytes(trimmed.toLowerCase());
  }
  const decoded = nip19.decode(trimmed);
  if (decoded.type !== 'nsec') {
    throw new Error('NOSTR_NSEC must be an nsec1... string or 64-char hex secret key.');
  }
  return decoded.data;
}

async function createCliSigner(opts: CliOptions): Promise<{
  pubkey: string;
  signEvent: (
    template: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>
  ) => Promise<{ ok: true; event: NostrEvent } | { ok: false; error: string }>;
  close: () => Promise<void>;
}> {
  const envNsec = process.env.NOSTR_NSEC?.trim();
  if (envNsec) {
    const sk = decodeSecretKeyEnv(envNsec);
    const pubkey = getPublicKey(sk).toLowerCase();
    return {
      pubkey,
      signEvent: async (template) => ({
        ok: true,
        event: finalizeEvent(template, sk),
      }),
      close: async () => {},
    };
  }

  const clientSk = generateSecretKey();
  const clientPub = getPublicKey(clientSk);

  let bunker: BunkerSigner;
  if (opts.bunkerUri) {
    const pointer = await parseBunkerInput(opts.bunkerUri);
    if (!pointer) {
      throw new Error('Invalid --bunker URI or NIP-05 identifier.');
    }
    console.log(`[NIP-46] Connecting to bunker ${pointer.pubkey.slice(0, 12)}…`);
    bunker = BunkerSigner.fromBunker(clientSk, pointer, {
      onauth: (url) => {
        console.log(`\n[NIP-46] Approve authorization at:\n${url}\n`);
      },
    });
    await bunker.connect();
  } else {
    const secret = bytesToHex(generateSecretKey()).slice(0, 16);
    const connectUri = createNostrConnectURI({
      clientPubkey: clientPub,
      relays: opts.relays,
      secret,
      name: 'MojiSurvivor CLI Publisher',
      perms: [
        'get_public_key',
        'sign_event:15128',
        'sign_event:35128',
        'sign_event:34128',
        'sign_event:24242',
        'sign_event:10063',
      ],
    });
    const qrText = await QRCode.toString(connectUri, { type: 'terminal', small: true });
    console.log('\n[NIP-46] Scan this QR code or paste the URI into Amber / nsec.app / Primal:\n');
    console.log(qrText);
    console.log(`${connectUri}\n`);
    console.log('Waiting up to 5 minutes for remote signer approval…');

    bunker = await BunkerSigner.fromURI(
      clientSk,
      connectUri,
      {
        onauth: (url) => {
          console.log(`\n[NIP-46] Approve authorization at:\n${url}\n`);
        },
      },
      300_000
    );
  }

  const userPubkey = (await bunker.getPublicKey()).toLowerCase();
  console.log(`[NIP-46] Connected as ${nip19.npubEncode(userPubkey)}`);

  return {
    pubkey: userPubkey,
    signEvent: async (template) => {
      try {
        const signed = await bunker.signEvent(template);
        return { ok: true, event: signed };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Remote signer rejected request.',
        };
      }
    },
    close: async () => {
      await bunker.close();
    },
  };
}

async function publishToRelays(
  pool: SimplePool,
  relays: readonly string[],
  event: NostrEvent
): Promise<{ accepted: string[]; rejected: Record<string, string> }> {
  const accepted: string[] = [];
  const rejected: Record<string, string> = {};
  const results = await Promise.allSettled(
    relays.map(async (relay) => {
      await Promise.any(pool.publish([relay], event));
      return relay;
    })
  );
  for (let i = 0; i < relays.length; i++) {
    const res = results[i];
    if (res.status === 'fulfilled') {
      accepted.push(relays[i]);
    } else {
      rejected[relays[i]] =
        res.reason instanceof Error ? res.reason.message : 'Relay rejected event';
    }
  }
  return { accepted, rejected };
}

async function main() {
  const opts = parseCliArgs(process.argv.slice(2));

  if (opts.siteType === 'named' && !isValidSiteSlug(opts.slug)) {
    throw new Error(
      `Invalid --named slug "${opts.slug}". Must match ^[a-z0-9-]{1,13}$ (lowercase letters/numbers/hyphens).`
    );
  }

  if (opts.build) {
    console.log('[1/4] Building production bundle (npm run build)…');
    execSync('npm run build', { stdio: 'inherit' });
  }

  console.log(`[2/4] Scanning static files in ${opts.dir}…`);
  const files = await collectFilesFromDisk(opts.dir);
  if (files.length === 0) {
    throw new Error(`No files found in ${opts.dir}.`);
  }
  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  console.log(
    `Collected ${files.length} file(s) (${(totalBytes / 1024).toFixed(1)} KB total).`
  );

  const previewManifest = buildNip5aManifestTemplate({
    siteType: opts.siteType,
    slug: opts.siteType === 'named' ? opts.slug : undefined,
    files,
  });

  if (opts.dryRun) {
    console.log('\n[DRY RUN] Checking Blossom presence on', opts.blossomServers[0]);
    let presentCount = 0;
    for (const file of files) {
      const exists = await checkBlossomBlobExists(opts.blossomServers[0], file.sha256);
      if (exists) presentCount += 1;
      console.log(
        `  ${exists ? '[HIT ]' : '[MISS]'} ${file.path} (${file.sha256.slice(0, 12)}…, ${file.size} B)`
      );
    }
    console.log(
      `\n[DRY RUN] Manifest preview: kind:${previewManifest.kind}${
        opts.siteType === 'named' ? ` d="${opts.slug}"` : ' (root)'
      }, ${files.length} path tags, ${presentCount}/${files.length} already on primary Blossom.`
    );
    return;
  }

  const signer = await createCliSigner(opts);
  const pool = new SimplePool();

  try {
    console.log('[3/4] Checking & uploading blobs to Blossom servers…');
    const uploadRes = await publishAssetsToBlossomServers({
      files,
      servers: opts.blossomServers,
      signEvent: signer.signEvent,
      onProgress: (p) => {
        if (p.phase === 'signing_blossom_auth' || p.phase === 'checking_blobs') {
          console.log(`  ${p.message}`);
        }
      },
    });
    if (!uploadRes.ok) {
      throw new Error(uploadRes.error || 'Blossom upload failed.');
    }
    console.log(
      `  Blossom complete: ${uploadRes.uploadedCount} uploaded, ${uploadRes.skippedCount} already present.`
    );

    if (opts.sync10063) {
      const serverTmpl = buildBlossomServerListTemplate(opts.blossomServers);
      const signedServer = await signer.signEvent(serverTmpl);
      if (signedServer.ok) {
        await publishToRelays(pool, opts.relays, signedServer.event);
        console.log('  Published kind:10063 Blossom server list.');
      }
    }

    console.log(`[4/4] Signing & broadcasting NIP-5A kind:${previewManifest.kind} manifest…`);
    const signedManifest = await signer.signEvent(previewManifest);
    if (!signedManifest.ok) {
      throw new Error(signedManifest.error);
    }

    const broadcast = await publishToRelays(pool, opts.relays, signedManifest.event);
    if (broadcast.accepted.length === 0) {
      throw new Error(
        `No relay accepted manifest event: ${JSON.stringify(broadcast.rejected)}`
      );
    }

    if (opts.legacy34128) {
      const legacyTmpls = buildLegacy34128FileTemplates(files);
      let legacyOk = 0;
      for (const tmpl of legacyTmpls) {
        const res = await signer.signEvent(tmpl);
        if (res.ok) {
          const out = await publishToRelays(pool, opts.relays, res.event);
          if (out.accepted.length > 0) legacyOk += 1;
        }
      }
      console.log(`  Published ${legacyOk}/${legacyTmpls.length} legacy kind:34128 events.`);
    }

    const links = computeNsiteGatewayUrls(
      signedManifest.event.pubkey,
      opts.siteType,
      opts.siteType === 'named' ? opts.slug : undefined,
      opts.relays
    );

    console.log('\n========================================');
    console.log('MojiSurvivor Nsite Published!');
    console.log(`npub:       ${links.npub}`);
    if (links.naddr) console.log(`naddr:      ${links.naddr}`);
    console.log(`event id:   ${signedManifest.event.id}`);
    console.log(`relays ok:  ${broadcast.accepted.join(', ')}`);
    console.log(`primary:    ${links.primaryUrl}`);
    console.log(`alternate:  ${links.alternateUrl}`);
    console.log('========================================\n');
  } finally {
    await signer.close();
    pool.close(opts.relays);
  }
}

main().catch((err) => {
  console.error('\n[publish-nsite error]', err instanceof Error ? err.message : err);
  process.exit(1);
});
