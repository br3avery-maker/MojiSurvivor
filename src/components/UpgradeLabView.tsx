import React, { useState } from 'react';
import { Check, AlertCircle, ArrowRight, Sparkles, Flame } from 'lucide-react';
import {
  computeTotalUpgradeLevels,
  getUpgradeCost,
  UPGRADE_SPECS,
  type UpgradeLevels,
  type UpgradeSpec,
} from '../lib/storage';

export interface UpgradePurchaseResult {
  ok: boolean;
  newLevel: number;
  remainingMojo: number;
  error?: string;
}

export interface CareerRebirthResult {
  ok: boolean;
  newRebirthCount: number;
  error?: string;
}

interface UpgradeLabViewProps {
  mojoBalance: number;
  playerLevel: number;
  playerXp: number;
  playerXpNext: number;
  rebirthCount?: number;
  upgrades: UpgradeLevels;
  onPurchaseUpgrade: (spec: UpgradeSpec) => UpgradePurchaseResult;
  onPerformRebirth?: () => CareerRebirthResult;
}

export const UpgradeLabView: React.FC<UpgradeLabViewProps> = ({
  mojoBalance,
  playerLevel,
  playerXp,
  playerXpNext,
  rebirthCount = 0,
  upgrades,
  onPurchaseUpgrade,
  onPerformRebirth,
}) => {
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    key?: string;
  } | null>(null);
  const [confirmRebirth, setConfirmRebirth] = useState(false);

  const totalUpgradeLevels = computeTotalUpgradeLevels(upgrades);
  const canRebirth = playerLevel >= 20 || totalUpgradeLevels >= 15;

  const handleBuy = (spec: UpgradeSpec) => {
    const res = onPurchaseUpgrade(spec);
    if (res.ok) {
      setFeedback({
        type: 'success',
        key: spec.key,
        message: `Upgraded ${spec.label} to Lv.${res.newLevel}/${spec.maxLevel} (${res.remainingMojo.toLocaleString()} Mojo remaining).`,
      });
    } else {
      setFeedback({
        type: 'error',
        key: spec.key,
        message: res.error ?? `Unable to purchase ${spec.label}.`,
      });
    }
  };

  const handleRebirthClick = () => {
    if (!onPerformRebirth) return;
    if (!confirmRebirth) {
      setConfirmRebirth(true);
      return;
    }
    const res = onPerformRebirth();
    setConfirmRebirth(false);
    if (res.ok) {
      setFeedback({
        type: 'success',
        message: `Career Rebirth Tier ${res.newRebirthCount} unlocked! Permanent +${res.newRebirthCount * 15}% DMG, +${res.newRebirthCount * 12}% Mojo Bounty, +${res.newRebirthCount * 10}% Max Hull, and +${res.newRebirthCount * 6}% Haste active.`,
      });
    } else {
      setFeedback({
        type: 'error',
        message: res.error ?? 'Requirements not met for Career Rebirth.',
      });
    }
  };

  return (
    <section className="max-w-5xl mx-auto px-4 py-4 space-y-3.5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#9A0957]/45">
        <div>
          <div className="w-7 h-1 rounded-full bg-[#FF1493] mb-1" />
          <h1 className="text-lg font-display font-bold text-white">Upgrade Lab</h1>
          <p className="text-xs text-[#B8B8B8]">
            Permanent hull &amp; spell upgrades saved locally and synced via Nostr snapshots.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums text-sm">
          {rebirthCount > 0 && (
            <div>
              <span className="text-xs text-[#B8B8B8]">Rebirth: </span>
              <span className="font-bold text-[#00F0FF]">Tier {rebirthCount}</span>
            </div>
          )}
          <div>
            <span className="text-xs text-[#B8B8B8]">Player Lv: </span>
            <span className="font-bold text-[#FFB6D9]">Lv.{playerLevel}</span>
            <span className="text-xs text-[#5E5E5E]">
              {' '}({playerXp}/{playerXpNext})
            </span>
          </div>
          <div>
            <span className="text-xs text-[#B8B8B8]">Mojo Available: </span>
            <span className="font-bold text-[#FFD700]">
              {mojoBalance.toLocaleString()} Mojo
            </span>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className={`px-3.5 py-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
            feedback.type === 'success'
              ? 'bg-[#111111] border-[#FF1493]/60 text-[#FFB6D9]'
              : 'bg-[#111111] border-[#9A0957] text-[#B8B8B8]'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <Check className="w-4 h-4 shrink-0 text-[#FF1493]" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-[#FFB6D9]" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs text-[#B8B8B8] hover:text-white shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Career Rebirth Prestige Panel */}
      <div className="p-4 rounded-xl bg-[#111111] border border-[#00F0FF]/40 flex flex-col md:flex-row md:items-center justify-between gap-3.5">
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-display font-bold text-white">
              <Flame className="w-4 h-4 text-[#00F0FF]" />
              <span>Career Rebirth Prestige</span>
            </span>
            <span className="text-xs font-mono font-semibold text-[#00F0FF] tabular-nums">
              · Tier {rebirthCount} Active
            </span>
          </div>
          <p className="text-xs text-[#B8B8B8] leading-relaxed">
            Reset your 5 Upgrade Lab tracks to Lv.0 at{' '}
            <span className="text-white font-semibold">Career Player Lv.20+</span> (or{' '}
            <span className="text-white font-semibold">15+ total upgrade levels</span>, currently{' '}
            <span className="font-mono text-[#FFB6D9]">{totalUpgradeLevels}/25</span>) in exchange for a permanent, stackable{' '}
            <span className="text-[#00F0FF] font-semibold">Rebirth Tier</span>. Your unspent Mojo, Career Player Level, and Codex unlocks are preserved.
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums text-[#C0C0C0] pt-0.5">
            <span>
              Next Tier ({rebirthCount + 1}):{' '}
              <strong className="text-[#FF1493]">+{(rebirthCount + 1) * 15}% Spell DMG</strong>
            </span>
            <span>·</span>
            <span>
              <strong className="text-[#FFD700]">+{(rebirthCount + 1) * 12}% Mojo Bounty</strong>
            </span>
            <span>·</span>
            <span>
              <strong className="text-[#00F0FF]">+{(rebirthCount + 1) * 10}% Max Hull</strong>
            </span>
            <span>·</span>
            <span>
              <strong className="text-[#FFB6D9]">+{(rebirthCount + 1) * 6}% Fire Haste</strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {confirmRebirth && (
            <button
              type="button"
              onClick={() => setConfirmRebirth(false)}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-black border border-white/15 text-xs font-mono text-[#B8B8B8] hover:text-white"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            disabled={!canRebirth}
            onClick={handleRebirthClick}
            className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-mono font-semibold transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
              canRebirth
                ? confirmRebirth
                  ? 'bg-[#00F0FF] text-black hover:bg-[#66F7FF] cursor-pointer'
                  : 'bg-[#1A1A1A] border border-[#00F0FF] text-[#00F0FF] hover:bg-[#00F0FF]/15 cursor-pointer'
                : 'bg-black border border-white/10 text-[#5E5E5E] cursor-not-allowed'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {!canRebirth
                ? `Locked (Need Lv.20 or 15 Upgr)`
                : confirmRebirth
                  ? `Confirm Rebirth → Tier ${rebirthCount + 1}`
                  : `Ascend to Rebirth Tier ${rebirthCount + 1}`}
            </span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {UPGRADE_SPECS.map((spec) => {
          const level = upgrades[spec.key];
          const isMax = level >= spec.maxLevel;
          const cost = getUpgradeCost(spec, level);
          const canAfford = !isMax && mojoBalance >= cost;
          const deficit = Math.max(0, cost - mojoBalance);

          return (
            <div
              key={spec.key}
              className="p-4 rounded-xl bg-[#111111] border border-[#9A0957]/45 hover:border-[#9A0957] transition-colors flex flex-col justify-between gap-3"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-display font-bold text-white">
                    {spec.label}
                  </h2>
                  <span className="text-xs font-mono font-semibold text-[#FFB6D9] tabular-nums">
                    Lv.{level}/{spec.maxLevel}
                  </span>
                </div>
                <p className="text-xs text-[#B8B8B8] leading-relaxed">
                  {spec.summary}
                </p>

                {/* Segmented Level Progress Bar in BreBre Pink */}
                <div className="flex items-center gap-1 pt-1">
                  {Array.from({ length: spec.maxLevel }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-sm ${
                        i < level ? 'bg-[#FF1493]' : 'bg-[#1A1A1A] border border-[#5B0633]/60'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#5B0633]/60">
                <span className="text-xs font-mono text-[#C0C0C0] tabular-nums">
                  {spec.formatEffect(level)}
                </span>

                <button
                  type="button"
                  onClick={() => handleBuy(spec)}
                  aria-disabled={!canAfford}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-mono font-semibold transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
                    isMax
                      ? 'bg-[#1A1A1A] border border-[#5B0633] text-[#5E5E5E] cursor-default'
                      : canAfford
                        ? 'bg-[#FF1493] hover:bg-[#CD0D72] text-white cursor-pointer'
                        : 'bg-[#000000] border border-[#5B0633] text-[#B8B8B8] hover:border-[#9A0957]'
                  }`}
                >
                  {isMax ? (
                    <span>MAXED</span>
                  ) : canAfford ? (
                    <>
                      <span>Buy · {cost.toLocaleString()} Mojo</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  ) : (
                    <span>
                      {cost.toLocaleString()} Mojo (need {deficit.toLocaleString()})
                    </span>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
