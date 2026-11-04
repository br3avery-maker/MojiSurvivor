import React, { useState } from 'react';
import {
  getUpgradeCost,
  UPGRADE_SPECS,
  type UpgradeLevels,
  type UpgradeSpec,
} from '../lib/storage';

interface UpgradeLabViewProps {
  mojoBalance: number;
  upgrades: UpgradeLevels;
  onPurchaseUpgrade: (key: keyof UpgradeLevels, cost: number) => boolean;
}

export const UpgradeLabView: React.FC<UpgradeLabViewProps> = ({
  mojoBalance,
  upgrades,
  onPurchaseUpgrade,
}) => {
  const [recentNotice, setRecentNotice] = useState<string | null>(null);

  const handleBuy = (spec: UpgradeSpec) => {
    const currentLevel = upgrades[spec.key];
    if (currentLevel >= spec.maxLevel) return;
    const cost = getUpgradeCost(spec, currentLevel);
    const ok = onPurchaseUpgrade(spec.key, cost);
    if (ok) {
      setRecentNotice(
        `Unlocked ${spec.label} Level ${currentLevel + 1} (${spec.formatEffect(currentLevel + 1)}).`
      );
    } else {
      setRecentNotice(`Insufficient Mojo — requires ${cost} Mojo earned from arena takedowns.`);
    }
  };

  return (
    <section className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-8 border-b border-white/10">
        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">
            Mojo Upgrade Lab
          </h1>
          <p className="text-sm text-[#B8B8B8] mt-1.5 max-w-xl">
            Spend Mojo minted from verified enemy and Apex Boss takedowns to permanently strengthen hull and weapon systems.
          </p>
        </div>
        <div className="font-mono tabular-nums text-left sm:text-right">
          <div className="text-xs text-[#B8B8B8]">Available Mojo</div>
          <div className="text-2xl font-bold text-[#FF9900]">{mojoBalance.toLocaleString()}</div>
        </div>
      </div>

      {recentNotice && (
        <div className="mt-6 px-4 py-3 rounded-lg bg-[#111111] border border-white/15 text-sm text-white">
          {recentNotice}
        </div>
      )}

      <div className="mt-8 divide-y divide-white/10 border-y border-white/10">
        {UPGRADE_SPECS.map((spec) => {
          const level = upgrades[spec.key];
          const isMaxed = level >= spec.maxLevel;
          const cost = getUpgradeCost(spec, level);
          const canAfford = !isMaxed && mojoBalance >= cost;

          return (
            <div
              key={spec.key}
              className="py-6 flex flex-col md:flex-row md:items-center justify-between gap-6"
            >
              <div className="space-y-1.5 max-w-xl">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg font-display font-semibold text-white">{spec.label}</h2>
                  <span className="text-xs font-mono tabular-nums text-[#B8B8B8]">
                    · Level {level} / {spec.maxLevel}
                  </span>
                </div>
                <p className="text-sm text-[#B8B8B8]">{spec.summary}</p>
                <div className="text-xs font-mono tabular-nums text-white/90 pt-1 flex flex-wrap items-center gap-2">
                  <span>Current: {spec.formatEffect(level)}</span>
                  {!isMaxed && (
                    <>
                      <span aria-hidden="true" className="text-[#B8B8B8]">
                        →
                      </span>
                      <span className="text-[#FFB6D9]">
                        Next: {spec.formatEffect(level + 1)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                {!isMaxed && (
                  <span className="text-sm font-mono tabular-nums text-[#FF9900]">
                    {cost.toLocaleString()} Mojo
                  </span>
                )}
                <button
                  type="button"
                  disabled={!canAfford}
                  onClick={() => handleBuy(spec)}
                  className={`min-h-[42px] px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    isMaxed
                      ? 'bg-[#111111] border border-white/10 text-[#B8B8B8] cursor-default'
                      : canAfford
                        ? 'bg-[#FF1493] hover:bg-[#CD0D72] text-white'
                        : 'bg-[#1A1A1A] border border-white/10 text-[#5E5E5E] cursor-not-allowed'
                  }`}
                >
                  {isMaxed ? 'Max Level Reached' : 'Purchase Upgrade'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
