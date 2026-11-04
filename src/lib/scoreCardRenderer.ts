import { formatShortNpub, type NostrProfileMeta } from './nostrEngine';
import {
  getArenaPixelTileCanvas,
  getEmojiContrastBacking,
  MOJI_APP_ICON_URL,
} from './pixelBackgrounds';
import type { RunReceiptRecord } from './storage';

export interface ScoreCardRenderInput {
  receipt: RunReceiptRecord;
  profile?: NostrProfileMeta;
  playerLevel: number;
  defaultAvatarUrl: string;
}

export interface RenderedScoreCard {
  blob: Blob;
  dataUrl: string;
  fileName: string;
  summaryText: string;
}

function formatDurationClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function parseBestWeaponLabel(receipt: RunReceiptRecord): string {
  if (receipt.strongestSpellName) return receipt.strongestSpellName;
  const parts = (receipt.weaponsSummary || 'lightning_zap:1').split(',');
  let bestId = 'lightning_zap';
  let bestLvl = 1;
  for (const part of parts) {
    const [id, lvlStr] = part.split(':');
    const lvl = parseInt(lvlStr ?? '1', 10) || 1;
    if (lvl >= bestLvl && id) {
      bestId = id;
      bestLvl = lvl;
    }
  }
  const map: Record<string, [string, string, string]> = {
    lightning_zap: ['Lightning Zap', 'Double Spark', 'Chain Storm'],
    garlic_aura: ['Holy Garlic', 'Radiant Ward', 'Solar Cleansing'],
    orbiting_blades: ['Orbiting Blades', 'Twin Chakrams', 'Vortex Ring'],
    plasma_lance: ['Plasma Lance', 'Twin Railgun', 'Hyper Piercer'],
    nova_pulse: ['Nova Pulse', 'Supernova Wave', 'Singularity Blast'],
  };
  const tiers = map[bestId] ?? [bestId, bestId, bestId];
  const name =
    bestLvl <= 1
      ? tiers[0]
      : bestLvl === 2
        ? tiers[1]
        : bestLvl > 3
          ? `${tiers[2]} +${bestLvl - 3}`
          : tiers[2];
  return `${name} (Lv.${bestLvl})`;
}

/**
 * Loads an image safely for untainted Canvas export (`crossOrigin = "anonymous"`).
 * If a remote image lacks CORS headers, resolves `null` cleanly so `canvas.toBlob()` never throws.
 */
async function loadCorsCleanImage(url: string | undefined, timeoutMs = 2800): Promise<HTMLImageElement | null> {
  if (!url) return null;
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (res: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      resolve(res);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    if (!url.startsWith('data:') && !url.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      clearTimeout(timer);
      finish(img.naturalWidth > 0 ? img : null);
    };
    img.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
    img.src = url;
  });
}

function getHonestPublicationBadge(receipt: RunReceiptRecord): {
  label: string;
  detail: string;
  accent: string;
} {
  if (receipt.status === 'confirmed' && receipt.signedEvent && receipt.acceptedRelays.length > 0) {
    return {
      label: 'RELAY CONFIRMED · BIP-340',
      detail: `sig:${receipt.signedEvent.sig.slice(0, 12)} · ${receipt.acceptedRelays.length} relay(s)`,
      accent: '#00F0FF',
    };
  }
  if (
    receipt.signedEvent &&
    (receipt.status === 'signed_local' ||
      receipt.status === 'queued_offline' ||
      receipt.status === 'failed' ||
      receipt.status === 'rejected')
  ) {
    return {
      label: 'SIGNED LOCALLY · UNCONFIRMED',
      detail: `sig:${receipt.signedEvent.sig.slice(0, 12)} · pending relay OK`,
      accent: '#FFD700',
    };
  }
  return {
    label: 'LOCAL RUN · UNSIGNED',
    detail: `id:${receipt.runHash.slice(0, 10)} · not published to relays`,
    accent: '#B8B8B8',
  };
}

export function buildScoreSummaryText(
  receipt: RunReceiptRecord,
  profile?: NostrProfileMeta
): string {
  const playerName =
    profile?.displayName || profile?.name || formatShortNpub(receipt.pubkey);
  const bestSpell = parseBestWeaponLabel(receipt);
  const featuredHash =
    receipt.featuredEmoji?.hash ||
    receipt.featuredEmoji?.emojiKey.split(':').pop() ||
    '';
  const featured = featuredHash ? ` · Nemesis #${featuredHash.slice(0, 8)}` : '';
  const statusLine =
    receipt.status === 'confirmed' && receipt.signedEvent
      ? `Relay Confirmed (sig:${receipt.signedEvent.sig.slice(0, 10)})`
      : receipt.signedEvent
        ? 'Signed Local Receipt (unconfirmed on relays)'
        : 'Local Run Summary (unsigned)';

  return [
    `MojiSurvivor Arcade Receipt — ${playerName}`,
    `Score: ${receipt.score.toLocaleString()} pts · Wave ${receipt.wave}`,
    `Defeated: ${receipt.defeated} emojis (${receipt.bossesDefeated} Apex Bosses) · +${receipt.mojoEarned} Mojo`,
    `Time: ${formatDurationClock(receipt.durationSec)} · Top Spell: ${bestSpell}${featured}`,
    `${statusLine} · #mojisurvivor`,
  ].join('\n');
}

/**
 * Generates an actual downloadable/shareable high-DPI PNG digital arcade receipt
 * (`#000000` black, `#FF1493` deep pink, crisp `#FFFFFF` type, restrained `#00F0FF` & `#FFD700` accents).
 */
export async function renderRunScoreCardPng(
  input: ScoreCardRenderInput
): Promise<RenderedScoreCard> {
  const { receipt, profile, playerLevel, defaultAvatarUrl } = input;
  const width = 640;
  const height = 840;
  const scale = 2;

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable for score card generation.');
  }
  ctx.scale(scale, scale);

  // Load images with untainted CORS safety
  const [avatarImg, fallbackImg, featuredEmojiImg, brandIconImg] = await Promise.all([
    loadCorsCleanImage(profile?.picture),
    loadCorsCleanImage(defaultAvatarUrl),
    loadCorsCleanImage(receipt.featuredEmoji?.url),
    loadCorsCleanImage(MOJI_APP_ICON_URL),
  ]);
  const playerImg = avatarImg || fallbackImg || brandIconImg;

  // 1. BreBre Colors Retro Pixel-Art Ticket Base
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  const pixelTile = getArenaPixelTileCanvas('dungeon_circuit', receipt.wave);
  if (pixelTile) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let tx = 0; tx < width; tx += pixelTile.width) {
      for (let ty = 0; ty < height; ty += pixelTile.height) {
        ctx.drawImage(pixelTile, tx, ty);
      }
    }
    ctx.restore();
  }

  // Outer receipt frame (#111111 Gray 900 + #9A0957 / #FF1493 double border)
  const pad = 24;
  ctx.fillStyle = '#111111';
  ctx.strokeStyle = '#9A0957';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(pad - 2, pad - 2, width - (pad - 2) * 2, height - (pad - 2) * 2, 22);
  ctx.stroke();

  ctx.strokeStyle = '#FF1493';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(pad, pad, width - pad * 2, height - pad * 2, 20);
  ctx.fill();
  ctx.stroke();

  // Top deep-pink accent bar
  ctx.fillStyle = '#FF1493';
  ctx.beginPath();
  ctx.roundRect(pad + 18, pad + 18, width - (pad + 18) * 2, 6, 3);
  ctx.fill();

  // Brand App Icon + Arcade Header
  if (brandIconImg) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(pad + 24, pad + 34, 34, 34, 8);
    ctx.clip();
    ctx.drawImage(brandIconImg, pad + 24, pad + 34, 34, 34);
    ctx.restore();
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 24px "Outfit", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('MOJISURVIVOR', brandIconImg ? pad + 68 : pad + 26, pad + 60);

  ctx.fillStyle = '#FFB6D9';
  ctx.font = '600 13px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  const dateStr = new Date(receipt.createdAt * 1000).toISOString().slice(0, 16).replace('T', ' ');
  ctx.fillText(`ARCADE RECEIPT · ${dateStr}Z`, width - pad - 26, pad + 58);

  // Dashed receipt perforation
  const drawPerforation = (y: number) => {
    ctx.save();
    ctx.strokeStyle = '#5B0633';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(pad + 22, y);
    ctx.lineTo(width - pad - 22, y);
    ctx.stroke();
    ctx.restore();
  };

  drawPerforation(pad + 80);

  // Player Identity Row with Opaque Contrast Cushion
  const avatarX = pad + 56;
  const avatarY = pad + 128;
  const avatarR = 28;

  ctx.save();
  ctx.fillStyle = '#5B0633';
  ctx.strokeStyle = '#FF1493';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#C0C0C0';
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarR - 3, 0, Math.PI * 2);
  ctx.fill();

  if (playerImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarR - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(
      playerImg,
      avatarX - (avatarR - 2),
      avatarY - (avatarR - 2),
      (avatarR - 2) * 2,
      (avatarR - 2) * 2
    );
    ctx.restore();
  } else {
    ctx.fillStyle = '#FF1493';
    ctx.font = '700 20px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const initial = (profile?.displayName || profile?.name || 'M').slice(0, 1).toUpperCase();
    ctx.fillText(initial, avatarX, avatarY + 1);
  }
  ctx.restore();

  const displayName =
    profile?.displayName || profile?.name || formatShortNpub(receipt.pubkey);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 22px "Outfit", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(displayName.slice(0, 26), pad + 100, pad + 123);

  ctx.fillStyle = '#B8B8B8';
  ctx.font = '500 13px "JetBrains Mono", monospace';
  const subIdentity = profile?.nip05
    ? `${profile.nip05} · Player Lv.${playerLevel}`
    : `${formatShortNpub(receipt.pubkey)} · Player Lv.${playerLevel}`;
  ctx.fillText(subIdentity.slice(0, 42), pad + 100, pad + 145);

  drawPerforation(pad + 176);

  // Hero Score Block
  ctx.fillStyle = '#120710';
  ctx.strokeStyle = 'rgba(255, 20, 147, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(pad + 24, pad + 196, width - (pad + 24) * 2, 134, 14);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#FFB6D9';
  ctx.font = '600 13px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('FINAL RUN SCORE', width / 2, pad + 226);

  ctx.fillStyle = '#FF1493';
  ctx.font = '800 60px "JetBrains Mono", monospace';
  ctx.fillText(receipt.score.toLocaleString(), width / 2, pad + 292);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '600 14px "JetBrains Mono", monospace';
  ctx.fillText(
    `WAVE ${receipt.wave} REACHED  ·  TIME ${formatDurationClock(receipt.durationSec)}`,
    width / 2,
    pad + 318
  );

  // 4-Cell Arcade Stat Grid
  const statsY = pad + 350;
  const colW = (width - (pad + 24) * 2 - 16) / 2;
  const rowH = 74;

  const statCells: Array<{ label: string; value: string; color: string }> = [
    {
      label: 'EMOJIS DEFEATED',
      value: receipt.defeated.toLocaleString(),
      color: '#FFFFFF',
    },
    {
      label: 'APEX BOSSES SLAIN',
      value: String(receipt.bossesDefeated),
      color: '#00F0FF',
    },
    {
      label: 'MOJO BANKED',
      value: `+${receipt.mojoEarned.toLocaleString()} MOJO`,
      color: '#FFD700',
    },
    {
      label: 'DURATION',
      value: formatDurationClock(receipt.durationSec),
      color: '#FFFFFF',
    },
  ];

  statCells.forEach((cell, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const cx = pad + 24 + col * (colW + 16);
    const cy = statsY + row * (rowH + 12);

    ctx.fillStyle = '#14141A';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(cx, cy, colW, rowH, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#9E9EA8';
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(cell.label, cx + 16, cy + 26);

    ctx.fillStyle = cell.color;
    ctx.font = '700 22px "JetBrains Mono", monospace';
    ctx.fillText(cell.value, cx + 16, cy + 56);
  });

  // Loadout & Featured Defeated Emoji Strip
  const loadoutY = statsY + (rowH + 12) * 2 + 8;
  ctx.fillStyle = '#14141A';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(pad + 24, loadoutY, width - (pad + 24) * 2, 108, 12);
  ctx.fill();
  ctx.stroke();

  const bestSpell = parseBestWeaponLabel(receipt);
  ctx.fillStyle = '#9E9EA8';
  ctx.font = '600 11px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText('SIGNATURE SPELL', pad + 42, loadoutY + 28);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 18px "Outfit", system-ui, sans-serif';
  ctx.fillText(bestSpell, pad + 42, loadoutY + 54);

  if (receipt.featuredEmoji) {
    const featHash =
      receipt.featuredEmoji.hash ||
      receipt.featuredEmoji.emojiKey.split(':').pop() ||
      '';
    ctx.fillStyle = '#FFB6D9';
    ctx.font = '500 13px "JetBrains Mono", monospace';
    ctx.fillText(
      `Featured Takedown: #${featHash.slice(0, 8)} (${receipt.featuredEmoji.tier} · Pwr ${receipt.featuredEmoji.powerRating})`,
      pad + 42,
      loadoutY + 84
    );

    const badgeX = width - pad - 76;
    const badgeY = loadoutY + 54;
    const backing = getEmojiContrastBacking(
      featuredEmojiImg ?? undefined,
      receipt.featuredEmoji.url
    );
    ctx.fillStyle = backing.outerFill;
    ctx.strokeStyle = '#FF1493';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(badgeX - 30, badgeY - 30, 60, 60, 12);
    ctx.fill();
    ctx.stroke();

    // Opaque high-contrast inner cushion so dark/non-contrasting emojis pop on the exported receipt
    ctx.fillStyle = backing.innerCushionFill;
    ctx.beginPath();
    ctx.roundRect(badgeX - 25, badgeY - 25, 50, 50, 9);
    ctx.fill();

    if (featuredEmojiImg) {
      ctx.drawImage(featuredEmojiImg, badgeX - 22, badgeY - 22, 44, 44);
    } else {
      ctx.fillStyle = '#5B0633';
      ctx.font = '700 12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`#${featHash.slice(0, 6)}`, badgeX, badgeY + 4);
    }
  } else {
    ctx.fillStyle = '#B8B8B8';
    ctx.font = '500 12px "JetBrains Mono", monospace';
    ctx.fillText(`Loadout: ${receipt.weaponsSummary}`, pad + 42, loadoutY + 84);
  }

  drawPerforation(height - pad - 96);

  // Honest Cryptographic Receipt Footer
  const pubBadge = getHonestPublicationBadge(receipt);
  ctx.textAlign = 'left';
  ctx.fillStyle = pubBadge.accent;
  ctx.font = '700 13px "JetBrains Mono", monospace';
  ctx.fillText(pubBadge.label, pad + 26, height - pad - 58);

  ctx.fillStyle = '#B8B8B8';
  ctx.font = '500 12px "JetBrains Mono", monospace';
  ctx.fillText(pubBadge.detail, pad + 26, height - pad - 36);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#7E7E8A';
  ctx.font = '500 11px "JetBrains Mono", monospace';
  ctx.fillText(receipt.dTag.slice(0, 36), width - pad - 26, height - pad - 36);

  const dataUrl = canvas.toDataURL('image/png');
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('Failed to encode score card PNG blob.'));
    }, 'image/png');
  });

  return {
    blob,
    dataUrl,
    fileName: `mojisurvivor-${receipt.runHash || receipt.localId}.png`,
    summaryText: buildScoreSummaryText(receipt, profile),
  };
}

/**
 * Triggers native Android / Web Share sheet with the generated PNG file if supported,
 * or falls back cleanly to downloading the PNG file.
 */
export async function shareOrDownloadScoreCard(
  card: RenderedScoreCard
): Promise<{ method: 'web_share' | 'android_bridge' | 'download' }> {
  // Check optional Web2App Android share bridge first
  const androidBridge = (
    window as unknown as {
      AndroidNostrBridge?: {
        shareImageBase64?: (dataUrl: string, caption: string) => boolean | void;
      };
    }
  ).AndroidNostrBridge;

  if (androidBridge?.shareImageBase64) {
    try {
      const res = androidBridge.shareImageBase64(card.dataUrl, card.summaryText);
      if (res !== false) {
        return { method: 'android_bridge' };
      }
    } catch {
      // Fall through to navigator.share / download
    }
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const file = new File([card.blob], card.fileName, { type: 'image/png' });
      const canShareFiles =
        typeof navigator.canShare === 'function' ? navigator.canShare({ files: [file] }) : true;
      if (canShareFiles) {
        await navigator.share({
          title: 'MojiSurvivor Run Receipt',
          text: card.summaryText,
          files: [file],
        });
        return { method: 'web_share' };
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { method: 'web_share' };
      }
      // Fall through to file download
    }
  }

  downloadScoreCardPng(card);
  return { method: 'download' };
}

export function downloadScoreCardPng(card: RenderedScoreCard): void {
  const url = URL.createObjectURL(card.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = card.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
