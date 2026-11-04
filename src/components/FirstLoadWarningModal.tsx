import React, { useState } from 'react';
import { ShieldAlert, ShieldCheck, CheckCircle2, ArrowRight } from 'lucide-react';
import type { EmojiFilterMode } from '../lib/moderationLists';
import { MOJI_APP_ICON_URL } from '../lib/pixelBackgrounds';

interface FirstLoadWarningModalProps {
  onAccept: (selectedMode: EmojiFilterMode) => void;
}

export const FirstLoadWarningModal: React.FC<FirstLoadWarningModalProps> = ({
  onAccept,
}) => {
  const [selectedMode, setSelectedMode] =
    useState<EmojiFilterMode>('open_with_banlist');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-load-warning-title"
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-[#111111] border-2 border-[#FF1493] p-5 space-y-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <img
            src={MOJI_APP_ICON_URL}
            alt="MojiSurvivor emblem"
            className="w-12 h-12 rounded-xl border border-[#FF1493] object-cover shrink-0"
          />
          <div className="min-w-0">
            <div className="w-7 h-1 rounded-full bg-[#FF1493] mb-1" />
            <h2
              id="first-load-warning-title"
              className="text-lg font-display font-bold text-white leading-snug"
            >
              Unmoderated Nostr Relay Content Notice
            </h2>
            <p className="text-xs text-[#B8B8B8] mt-1 leading-relaxed">
              MojiSurvivor discovers live <code className="font-mono text-[#FFB6D9]">kind:30030</code>{' '}
              custom emoji packs published on decentralized Nostr relays. Because public relays are
              permissionless, some users may publish NSFW or offensive imagery.
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-[#000000] border border-[#9A0957]/60 p-3 space-y-1.5 text-xs text-[#B8B8B8]">
          <div className="font-semibold text-white flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#FF1493] shrink-0" />
            <span>How MojiSurvivor Protects Your Game:</span>
          </div>
          <ul className="space-y-1 pl-5 list-disc text-[#B8B8B8]">
            <li>
              <span className="text-white font-medium">Private SHA-256 Hash &amp; npub Ban List:</span>{' '}
              Report any emoji in 1 tap from the Codex or Settings to immediately purge its{' '}
              <code className="font-mono text-[#FFB6D9]">SHA-256</code> hash &amp; publisher{' '}
              <code className="font-mono text-[#FFB6D9]">npub</code> on your device.
            </li>
            <li>
              <span className="text-white font-medium">Anonymous Public Audit Event:</span>{' '}
              Reporting publishes an ephemeral-key signed Nostr report event so the community can
              verify and expand the shared Ban &amp; Safe Lists without linking your personal identity.
            </li>
          </ul>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-white">
            Choose Your Emoji Discovery Mode:
          </div>

          <button
            type="button"
            onClick={() => setSelectedMode('open_with_banlist')}
            className={`w-full text-left p-3 rounded-xl border transition-colors flex items-start justify-between gap-2.5 ${
              selectedMode === 'open_with_banlist'
                ? 'bg-[#5B0633]/45 border-[#FF1493] text-white'
                : 'bg-[#000000] border-[#5B0633] text-[#B8B8B8] hover:border-[#9A0957]'
            }`}
          >
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-white">
                Live Nostr + NSFW Ban List (Recommended)
              </div>
              <div className="text-xs text-[#B8B8B8]">
                Loads live NIP-30 custom emojis while automatically filtering out all reported NSFW
                hashes and <code className="font-mono text-[#FFB6D9]">npub</code> authors.
              </div>
            </div>
            {selectedMode === 'open_with_banlist' && (
              <CheckCircle2 className="w-4 h-4 text-[#FF1493] shrink-0 mt-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setSelectedMode('safe_list_only')}
            className={`w-full text-left p-3 rounded-xl border transition-colors flex items-start justify-between gap-2.5 ${
              selectedMode === 'safe_list_only'
                ? 'bg-[#5B0633]/45 border-[#FF1493] text-white'
                : 'bg-[#000000] border-[#5B0633] text-[#B8B8B8] hover:border-[#9A0957]'
            }`}
          >
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-[#FFB6D9]" />
                <span>Safe List Only (Strict Mode)</span>
              </div>
              <div className="text-xs text-[#B8B8B8]">
                Only spawns custom emojis from publishers on your verified Safe List plus built-in
                Nostr reserve sprites.
              </div>
            </div>
            {selectedMode === 'safe_list_only' && (
              <CheckCircle2 className="w-4 h-4 text-[#FF1493] shrink-0 mt-0.5" />
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={() => onAccept(selectedMode)}
          className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#FF1493] hover:bg-[#CD0D72] text-sm font-semibold text-white transition-colors inline-flex items-center justify-center gap-2"
        >
          <span>I Understand — Enter MojiSurvivor</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
