/**
 * Two-tab navigation for switching between Replacement Therapy (`/`) and
 * Bridge Therapy (`/bridge`).
 *
 * The Bridge tab is enabled by default now that all 375 Supabase configs
 * (3 cPRA thresholds × 5 strategies × 5 graft-survival values × 5 supply
 * proportions) have landed. To temporarily hide the tab in a deployment
 * (e.g. while debugging or running a staged demo), set the env var
 * `VITE_FEATURE_BRIDGE=false` — anything other than the literal string
 * "false" keeps it on.
 *
 * Use as a sibling of the page header, e.g. directly above `<main>`.
 */
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRightLeft, Hourglass, Beaker } from 'lucide-react';

export const BRIDGE_FEATURE_FLAG_ENABLED =
  import.meta.env.VITE_FEATURE_BRIDGE !== 'false';

const TABS: Array<{
  to: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  flagged?: boolean;
}> = [
  {
    to: '/',
    label: 'Replacement Therapy',
    // Surfaced in the tab on the active page; phrased to match the
    // intro card and SummaryMetrics paradigm tagline.
    description: 'Xenokidney as a definitive transplant',
    icon: ArrowRightLeft,
  },
  {
    to: '/bridge',
    label: 'Bridge Therapy',
    description: 'Keep patients alive while they wait',
    icon: Hourglass,
    flagged: true,
  },
];

const ModeNav: React.FC = () => {
  const { pathname } = useLocation();
  const visibleTabs = TABS.filter((t) => !t.flagged || BRIDGE_FEATURE_FLAG_ENABLED);

  if (visibleTabs.length < 2) {
    // Single-tab → no nav needed (shipping to production with bridge
    // feature flagged off).
    return null;
  }

  return (
    <nav
      role="tablist"
      aria-label="Therapy mode"
      className="border-b border-medical-border bg-card/95"
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center gap-1 -mb-px">
          {visibleTabs.map((tab) => {
            const isActive =
              tab.to === '/' ? pathname === '/' : pathname.startsWith(tab.to);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                role="tab"
                aria-selected={isActive}
                title={tab.description}
                className={`flex items-start gap-2 px-5 py-3 border-b-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-medical-border'
                }`}
              >
                <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div className="flex flex-col leading-tight">
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">
                    {tab.label.split(' ')[0] === 'Replacement' ? 'Replace' : 'Bridge'}
                  </span>
                  <span className="hidden md:inline text-[10px] font-normal opacity-80">
                    {tab.description}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default ModeNav;

// Re-exported icon used by Bridge.tsx page header so it doesn't have to
// reach into lucide-react and pick a sibling icon.
export const BridgeBeaker = Beaker;
