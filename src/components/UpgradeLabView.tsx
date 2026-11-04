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
        `${spec.label} upgraded to Level ${currentLevel + 1} (${spec.formatEffect(currentLevel + 1)}).`
      );
    } else {
      setRecentNotice(`Need ${cost} Mojo (defeat enemies in Arena to mint Mojo).`);
    }
  };

  return (
    <section className="max-w-5xl mx-auto px-4 py-3.5 space-y-3">
      <div className="flex items-center justify-between gap-4 pb-2.5 border-b border-white/10">
        <div>
          <h1 className="text-lg sm:text-xl font-display font-bold text-white tracking-tight">
            Mojo Upgrade Lab
          </h1>
          <p className="text-xs text-[#B8B8B8]">
            Permanent hull & spell upgrades funded by arena takedowns
          </p>
        </div>
        <div className="font-mono tabular-nums text-right shrink-0">
          <div className="text-[11px] text-[#B8B8B8]">Mojo</div>
          <div className="text-lg font-bold text-[#FF9900]">{mojoBalance.toLocaleString()}</div>
        </div>
      </div>

      {recentNotice && (
        <div className="px-3 py-2 rounded-lg bg-[#111111] border border-white/15 text-xs text-white">
          {recentNotice}
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
              className="p-3 rounded-xl bg-[#111111] border border-white/10 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-sm font-display font-semibold text-white truncate">
                    {spec.label}
                  </h2>
                  <span className="text-[11px] font-mono tabular-nums text-[#B8B8B8] shrink-0">
                    · Lvl {level}/{spec.maxLevel}
                  </span>
                </div>
                <p className="text-[11px] text-[#B8B8B8] line-clamp-1">{spec.summary}</p>
                <div className="text-[11px] font-mono tabular-nums text-white/90 flex flex-wrap items-center gap-1.5 pt-0.5">
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
                disabled={!canAfford}
                onClick={() => handleBuy(spec)}
                className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-mono font-semibold tabular-nums transition-colors whitespace-nowrap shrink-0 ${
                  isMaxed
                    ? 'bg-black border border-white/10 text-[#B8B8B8] cursor-default'
                    : canAfford
                      ? 'bg-[#FF1493] hover:bg-[#CD0D72] text-white'
                      : 'bg-[#1A1A1A] border border-white/10 text-[#888888] cursor-not-allowed'
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
