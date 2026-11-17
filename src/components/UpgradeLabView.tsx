import React, { useState } from 'react';
import { Check, AlertCircle, ArrowRight, Sparkles, Flame } from 'lucide-react';
import {
  computeTotalUpgradeLevels,
  getUpgradeCost,
  MAX_TOTAL_UPGRADE_LEVELS,
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
  lifetimeXpEarned?: number;
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
  lifetimeXpEarned = 0,
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
        message: `Upgraded ${spec.label} to Lv.${res.newLevel}/${spec.maxLevel} (${res.remainingMojo.toLocaleString()} Mojo left).`,
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
        message: `Rebirth Tier ${res.newRebirthCount} unlocked! Cycle Level reset to Lv.1.`,
      });
    } else {
      setFeedback({
        type: 'error',
        message: res.error ?? 'Requirements not met for Rebirth.',
      });
    }
  };

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* Clean Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 border-b border-white/10">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-white tracking-tight">
            Upgrade Lab
          </h1>
          <p className="text-sm text-[#B8B8B8] mt-0.5">
            Spend Mojo on permanent ship and spell upgrades.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm font-mono tabular-nums text-[#B8B8B8]">
          {rebirthCount > 0 && (
            <span>
              Rebirth <strong className="text-[#36F3EB]">Tier {rebirthCount}</strong>
            </span>
          )}
          <span>
            Cycle <strong className="text-white">Lv.{playerLevel}</strong>{' '}
            <span className="text-[#6B6E82]">
              ({playerXp}/{playerXpNext})
            </span>
          </span>
          {lifetimeXpEarned > 0 && (
            <span>
              Lifetime XP{' '}
              <strong className="text-[#D3D9EA]">
                {lifetimeXpEarned.toLocaleString()}
              </strong>
            </span>
          )}
          <span>
            Mojo{' '}
            <strong className="text-[#FF1493]">
              {mojoBalance.toLocaleString()}
            </strong>
          </span>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className="px-4 py-3 rounded-xl bg-[#111018] border border-white/15 text-xs flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2 text-[#D3D9EA]">
            {feedback.type === 'success' ? (
              <Check className="w-4 h-4 shrink-0 text-[#36F3EB]" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-[#FF1493]" />
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

      {/* Concise Career Rebirth Prestige Panel */}
      <div className="p-4 sm:p-5 rounded-xl bg-[#111018] border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Flame className="w-4 h-4 text-[#36F3EB] shrink-0" />
            <span className="font-display font-bold text-white">
              Career Rebirth Prestige
            </span>
            <span className="text-xs font-mono text-[#36F3EB] tabular-nums">
              · Tier {rebirthCount} Active
            </span>
          </div>
          <p className="text-xs text-[#B8B8B8]">
            Resets Upgrades &amp; Cycle Level to Lv.1 · Preserves Mojo, Lifetime XP &amp; Codex (requires Lv.20 or 15+ upgrades, currently{' '}
            <span className="font-mono text-white">
              {totalUpgradeLevels}/{MAX_TOTAL_UPGRADE_LEVELS}
            </span>
            ).
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono tabular-nums text-[#D3D9EA]">
            <span>Next Tier ({rebirthCount + 1}):</span>
            <span className="text-[#FF1493]">+{(rebirthCount + 1) * 15}% Spell DMG</span>
            <span aria-hidden="true">·</span>
            <span>+{(rebirthCount + 1) * 12}% Mojo Bounty</span>
            <span aria-hidden="true">·</span>
            <span className="text-[#36F3EB]">+{(rebirthCount + 1) * 10}% Max Hull</span>
            <span aria-hidden="true">·</span>
            <span>+{(rebirthCount + 1) * 6}% Haste</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {confirmRebirth && (
            <button
              type="button"
              onClick={() => setConfirmRebirth(false)}
              className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[#181722] border border-white/15 text-xs font-semibold text-[#B8B8B8] hover:text-white"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            disabled={!canRebirth}
            onClick={handleRebirthClick}
            className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
              canRebirth
                ? confirmRebirth
                  ? 'bg-[#36F3EB] text-black hover:bg-[#66F7FF] cursor-pointer'
                  : 'bg-[#181722] border border-[#36F3EB]/60 text-[#36F3EB] hover:bg-[#36F3EB]/10 cursor-pointer'
                : 'bg-[#07070B] border border-white/10 text-[#6B6E82] cursor-not-allowed'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {!canRebirth
                ? 'Need Lv.20 or 15 Upgr'
                : confirmRebirth
                  ? `Confirm Tier ${rebirthCount + 1}`
                  : `Ascend to Tier ${rebirthCount + 1}`}
            </span>
          </button>
        </div>
      </div>

      {/* Clean Quiet Upgrade Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {UPGRADE_SPECS.map((spec) => {
          const level = upgrades[spec.key];
          const isMax = level >= spec.maxLevel;
          const cost = getUpgradeCost(spec, level);
          const canAfford = !isMax && mojoBalance >= cost;
          const deficit = Math.max(0, cost - mojoBalance);

          return (
            <div
              key={spec.key}
              className="p-4 sm:p-5 rounded-xl bg-[#111018] border border-white/10 hover:border-white/20 transition-colors flex flex-col justify-between gap-3.5"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm sm:text-base font-display font-bold text-white">
                    {spec.label}
                  </h2>
                  <span className="text-xs font-mono font-semibold text-[#D3D9EA] tabular-nums">
                    Lv.{level}/{spec.maxLevel}
                  </span>
                </div>
                <p className="text-xs text-[#B8B8B8] leading-relaxed">
                  {spec.summary}
                </p>

                {/* Segmented Level Progress Bar */}
                <div className="flex items-center gap-1 pt-1">
                  {Array.from({ length: spec.maxLevel }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-sm ${
                        i < level ? 'bg-[#FF1493]' : 'bg-[#1C1B26]'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/10">
                <span className="text-xs font-mono text-[#D3D9EA] tabular-nums">
                  {spec.formatEffect(level)}
                </span>

                <button
                  type="button"
                  onClick={() => handleBuy(spec)}
                  aria-disabled={!canAfford}
                  className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
                    isMax
                      ? 'bg-[#181722] border border-white/10 text-[#6B6E82] cursor-default'
                      : canAfford
                        ? 'bg-[#FF1493] hover:bg-[#CD0D72] text-white cursor-pointer'
                        : 'bg-[#07070B] border border-white/15 text-[#B8B8B8] hover:border-white/30'
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
