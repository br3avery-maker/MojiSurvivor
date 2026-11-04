import React, { useEffect, useState } from 'react';
import { Download, Share2, Copy, Check, Send, ExternalLink, X } from 'lucide-react';
import type { MojiNostrCoordinator, NostrProfileMeta } from '../lib/nostrEngine';
import {
  downloadScoreCardPng,
  renderRunScoreCardPng,
  shareOrDownloadScoreCard,
  type RenderedScoreCard,
} from '../lib/scoreCardRenderer';
import type { RunReceiptRecord } from '../lib/storage';

interface ScoreCardPanelProps {
  receipt: RunReceiptRecord;
  profile?: NostrProfileMeta;
  playerLevel: number;
  defaultAvatarUrl: string;
  coordinator: MojiNostrCoordinator;
  onBeforeExternalIntent?: () => void;
  onClose?: () => void;
}

export const ScoreCardPanel: React.FC<ScoreCardPanelProps> = ({
  receipt,
  profile,
  playerLevel,
  defaultAvatarUrl,
  coordinator,
  onBeforeExternalIntent,
  onClose,
}) => {
  const [card, setCard] = useState<RenderedScoreCard | null>(null);
  const [generating, setGenerating] = useState(true);
  const [copiedText, setCopiedText] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [showNostrComposer, setShowNostrComposer] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [postingNote, setPostingNote] = useState(false);
  const [nip55NoteUri, setNip55NoteUri] = useState<string | null>(null);
  const [nip55SignedNoteInput, setNip55SignedNoteInput] = useState('');

  useEffect(() => {
    let cancelled = false;
    setGenerating(true);
    setErrorMsg(null);

    void renderRunScoreCardPng({
      receipt,
      profile,
      playerLevel,
      defaultAvatarUrl,
    })
      .then((rendered) => {
        if (cancelled) return;
        setCard(rendered);
        setNoteDraft((prev) => prev || rendered.summaryText);
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMsg(
          err instanceof Error ? err.message : 'Unable to generate PNG score card.'
        );
      })
      .finally(() => {
        if (!cancelled) setGenerating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    receipt,
    receipt.status,
    receipt.signedEvent,
    profile,
    playerLevel,
    defaultAvatarUrl,
  ]);

  const handleShare = async () => {
    if (!card) return;
    setErrorMsg(null);
    const res = await shareOrDownloadScoreCard(card);
    if (res.method === 'download') {
      setFeedback('Saved PNG score card to downloads.');
    } else {
      setFeedback('Opened system share sheet.');
    }
  };

  const handleDownload = () => {
    if (!card) return;
    downloadScoreCardPng(card);
    setFeedback('Downloaded PNG arcade receipt.');
  };

  const handleCopySummary = async () => {
    if (!card) return;
    try {
      await navigator.clipboard.writeText(card.summaryText);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 1800);
    } catch {
      setErrorMsg('Clipboard access blocked by browser permissions.');
    }
  };

  const handleOpenComposer = () => {
    if (card) {
      setNoteDraft(card.summaryText);
    }
    setShowNostrComposer((prev) => !prev);
    setFeedback(null);
    setErrorMsg(null);

    if (coordinator.signerMode === 'nip55' && card) {
      const template = coordinator.buildUnsignedScoreNoteTemplate(
        card.summaryText,
        receipt
      );
      const prepared = coordinator.prepareNip55SignEventRequest({
        purpose: 'sign_note_share',
        unsignedTemplate: template,
        targetLocalId: receipt.localId,
      });
      if ('uri' in prepared) {
        setNip55NoteUri(prepared.uri);
      }
    }
  };

  const handlePublishNote = async () => {
    if (!noteDraft.trim()) return;
    setPostingNote(true);
    setErrorMsg(null);
    setFeedback(null);
    const res = await coordinator.signAndPublishScoreNote(noteDraft, receipt);
    setPostingNote(false);
    if (res.ok) {
      setShowNostrComposer(false);
      setFeedback(`Posted score note to ${res.acceptedRelays.length} relay(s).`);
    } else {
      setErrorMsg(res.error ?? 'Failed to publish score note.');
    }
  };

  const handlePublishNip55NotePaste = async () => {
    if (!nip55SignedNoteInput.trim()) return;
    setPostingNote(true);
    setErrorMsg(null);
    const resolved = coordinator.resolvePendingNip55SignResponse({
      rawResponse: nip55SignedNoteInput.trim(),
      expectedTargetLocalId: receipt.localId,
    });
    if (!resolved.ok) {
      setPostingNote(false);
      setErrorMsg(resolved.error);
      return;
    }
    const res = await coordinator.signAndPublishScoreNote(
      noteDraft,
      receipt,
      resolved.signedEvent
    );
    setPostingNote(false);
    if (res.ok) {
      setNip55SignedNoteInput('');
      setShowNostrComposer(false);
      setFeedback(`Posted Amber-signed note to ${res.acceptedRelays.length} relay(s).`);
    } else {
      setErrorMsg(res.error ?? 'Relay broadcast failed.');
    }
  };

  return (
    <div className="rounded-xl bg-[#111111] border border-[#9A0957]/60 p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-display font-bold text-white">
            Arcade Score Card
          </h3>
          <p className="text-xs text-[#B8B8B8]">
            Generated PNG receipt · {receipt.status === 'confirmed' ? 'Relay-confirmed proof' : 'Local summary'}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close score card"
            className="min-h-[36px] min-w-[36px] rounded-lg bg-[#000000] border border-[#9A0957]/60 text-[#B8B8B8] hover:text-white flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Rendered PNG Image Preview */}
      <div className="rounded-lg bg-[#000000] border border-[#5B0633] p-2 flex items-center justify-center min-h-[220px]">
        {generating ? (
          <span className="text-xs font-mono text-[#B8B8B8]">
            Rendering PNG arcade receipt…
          </span>
        ) : card ? (
          <img
            src={card.dataUrl}
            alt="MojiSurvivor downloadable arcade score card"
            className="w-full max-w-[300px] h-auto rounded-md border border-[#9A0957]/50"
          />
        ) : (
          <span className="text-xs text-[#FFB6D9]">
            {errorMsg || 'Score card unavailable.'}
          </span>
        )}
      </div>

      {feedback && (
        <div className="px-3 py-2 rounded-lg bg-[#000000] border border-[#FF1493]/50 text-xs text-[#FFB6D9]">
          {feedback}
        </div>
      )}

      {errorMsg && (
        <div className="px-3 py-2 rounded-lg bg-[#000000] border border-[#9A0957] text-xs text-[#FFB6D9]">
          {errorMsg}
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          type="button"
          disabled={!card}
          onClick={() => void handleShare()}
          className="min-h-[40px] px-3 py-2 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] disabled:opacity-50 text-xs font-semibold text-white transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>Share PNG</span>
        </button>

        <button
          type="button"
          disabled={!card}
          onClick={handleDownload}
          className="min-h-[40px] px-3 py-2 rounded-lg bg-[#000000] border border-[#9A0957] hover:border-[#FF1493] disabled:opacity-50 text-xs font-semibold text-white transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5 text-[#FFB6D9]" />
          <span>Download</span>
        </button>

        <button
          type="button"
          disabled={!card}
          onClick={() => void handleCopySummary()}
          className="min-h-[40px] px-3 py-2 rounded-lg bg-[#000000] border border-[#9A0957] hover:border-[#FF1493] disabled:opacity-50 text-xs font-semibold text-white transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
        >
          {copiedText ? (
            <Check className="w-3.5 h-3.5 text-[#FF1493]" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-[#C0C0C0]" />
          )}
          <span>{copiedText ? 'Copied' : 'Copy Text'}</span>
        </button>

        <button
          type="button"
          disabled={!card}
          onClick={handleOpenComposer}
          className="min-h-[40px] px-3 py-2 rounded-lg bg-[#000000] border border-[#9A0957] hover:border-[#FF1493] disabled:opacity-50 text-xs font-semibold text-white transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
        >
          <Send className="w-3.5 h-3.5 text-[#FFB6D9]" />
          <span>Post Note</span>
        </button>
      </div>

      {/* Explicit User-Authorized Nostr Kind 1 Note Composer */}
      {showNostrComposer && (
        <div className="pt-2.5 border-t border-white/10 space-y-2">
          <div className="text-xs font-medium text-[#B8B8B8]">
            Authorize public Nostr <code className="font-mono text-white">kind:1</code> note (never posted automatically):
          </div>
          <textarea
            rows={4}
            value={noteDraft}
            onChange={(e) => {
              const nextText = e.target.value;
              setNoteDraft(nextText);
              if (coordinator.signerMode === 'nip55') {
                const template = coordinator.buildUnsignedScoreNoteTemplate(
                  nextText,
                  receipt
                );
                const prep = coordinator.prepareNip55SignEventRequest({
                  purpose: 'sign_note_share',
                  unsignedTemplate: template,
                  targetLocalId: receipt.localId,
                });
                if ('uri' in prep) setNip55NoteUri(prep.uri);
              }
            }}
            className="w-full p-2.5 rounded-lg bg-black border border-white/15 text-xs font-mono text-white"
          />

          {coordinator.signerMode === 'nip55' ? (
            <div className="space-y-2">
              {nip55NoteUri && (
                <a
                  href={nip55NoteUri}
                  onClick={() => onBeforeExternalIntent?.()}
                  className="min-h-[38px] px-3 py-2 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] text-xs font-semibold text-white inline-flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Sign Note in Amber (nostrsigner:)</span>
                </a>
              )}
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={nip55SignedNoteInput}
                  onChange={(e) => setNip55SignedNoteInput(e.target.value)}
                  placeholder="Paste signed event JSON or hex signature if not auto-returned"
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md bg-black border border-white/15 text-xs font-mono text-white"
                />
                <button
                  type="button"
                  disabled={postingNote || !nip55SignedNoteInput.trim()}
                  onClick={() => void handlePublishNip55NotePaste()}
                  className="min-h-[36px] px-3 py-1.5 rounded-md bg-white text-black text-xs font-semibold disabled:opacity-50 whitespace-nowrap"
                >
                  {postingNote ? 'Posting…' : 'Broadcast'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNostrComposer(false)}
                className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs text-[#B8B8B8] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={postingNote || !noteDraft.trim()}
                onClick={() => void handlePublishNote()}
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#FF1493] hover:bg-[#CD0D72] disabled:opacity-50 text-xs font-semibold text-white inline-flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{postingNote ? 'Signing & Posting…' : 'Sign & Post to Nostr'}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
