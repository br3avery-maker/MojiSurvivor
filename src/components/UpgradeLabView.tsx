import React, { useState } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import {
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

interface UpgradeLabViewProps {
  mojoBalance: number;
  playerLevel: number;
  playerXp: number;
  playerXpNext: number;
  upgrades: UpgradeLevels;
  onPurchaseUpgrade: (spec: UpgradeSpec) => UpgradePurchaseResult;
}

export const UpgradeLabView: React.FC<UpgradeLabViewProps> = ({
  mojoBalance,
  playerLevel,
  playerXp,
  playerXpNext,
  upgrades,
  onPurchaseUpgrade,
}) => {
  const [feedback, setFeedback] = useState<{
    kind: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleBuy = (spec: UpgradeSpec) => {
    const res = onPurchaseUpgrade(spec);
    if (res.ok) {
      setFeedback({
        kind: 'success',
        message: `${spec.label} upgraded to Level ${res.newLevel} (${spec.formatEffect(res.newLevel)}) · ${res.remainingMojo.toLocaleString()} Mojo remaining.`,
      });
    } else {
      setFeedback({
        kind: 'error',
        message: res.error || `Not enough Mojo for ${spec.label}.`,
      });
    }
  };

  const xpPct = Math.min(100, Math.max(0, (playerXp / Math.max(1, playerXpNext)) * 100));

  return (
    <section className="max-w-5xl mx-auto px-4 py-3.5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2.5 border-b border-white/10">
        <div>
          <h1 className="text-lg sm:text-xl font-display font-bold text-white tracking-tight">
            Mojo Upgrade Lab
          </h1>
          <p className="text-xs text-[#B8B8B8]">
            Permanent hull & spell upgrades banked across every run
          </p>
        </div>

        <div className="flex items-center gap-5 font-mono tabular-nums">
          <div className="text-right">
            <div className="text-xs text-[#B8B8B8]">Player Level</div>
            <div className="text-sm font-bold text-[#00FF9D]">
              Lv.{playerLevel}{' '}
              <span className="text-xs font-normal text-[#B8B8B8]">
                ({playerXp}/{playerXpNext} XP)
              </span>
            </div>
            <div className="mt-1 h-1 w-28 bg-[#1A1A1A] rounded-sm overflow-hidden ml-auto">
              <div
                className="h-full bg-[#00FF9D] origin-left transition-transform duration-150"
                style={{ transform: `scaleX(${xpPct / 100})` }}
              />
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-xs text-[#B8B8B8]">Available Mojo</div>
            <div className="text-lg font-bold text-[#FFD700]">
              {mojoBalance.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className={`px-3.5 py-2.5 rounded-lg bg-[#111111] border text-xs flex items-center gap-2 ${
            feedback.kind === 'success'
              ? 'border-emerald-500/40 text-emerald-300'
              : 'border-amber-500/40 text-amber-300'
          }`}
        >
          {feedback.kind === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {UPGRADE_SPECS.map((spec) => {
          const level = upgrades[spec.key];
          const isMaxed = level >= spec.maxLevel;
          const cost = getUpgradeCost(spec, level);
          const canAfford = !isMaxed && mojoBalance >= cost;

          return (
            <div
              key={spec.key}
              className="p-3.5 rounded-xl bg-[#111111] border border-white/10 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-sm font-display font-semibold text-white truncate">
                    {spec.label}
                  </h2>
                  <span className="text-xs font-mono tabular-nums text-[#B8B8B8] shrink-0">
                    · Lvl {level}/{spec.maxLevel}
                  </span>
                </div>
                <p className="text-xs text-[#B8B8B8] leading-snug">{spec.summary}</p>
                <div className="text-xs font-mono tabular-nums text-white/90 flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span>{spec.formatEffect(level)}</span>
                  {!isMaxed && (
                    <>
                      <span aria-hidden="true" className="text-[#B8B8B8]">
                        →
                      </span>
                      <span className="text-[#FFB6D9]">{spec.formatEffect(level + 1)}</span>
                    </>
                  )}
                </div>
              </div>

              <button
                type="button"
                disabled={isMaxed}
                onClick={() => handleBuy(spec)}
                className={`min-h-[42px] px-3.5 py-2 rounded-lg text-xs font-mono font-semibold tabular-nums transition-colors whitespace-nowrap shrink-0 ${
                  isMaxed
                    ? 'bg-black border border-white/10 text-[#B8B8B8] cursor-default'
                    : canAfford
                      ? 'bg-[#FF1493] hover:bg-[#CD0D72] text-white'
                      : 'bg-[#1A1A1A] border border-white/10 text-[#9E9E9E] hover:border-white/25'
                }`}
              >
                {isMaxed ? 'Maxed' : `${cost} Mojo`}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
};
