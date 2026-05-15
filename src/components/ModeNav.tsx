/**
 * Two-tab navigation for switching between Replacement Therapy (`/`) and
 * Bridge Therapy (`/bridge`).
 *
 * The Bridge tab only renders when the `VITE_FEATURE_BRIDGE` env var is set
 * to `"true"` so we can ship the route to production *before* the
 * Supabase data has finished landing — flip the flag once the backend
 * sweep completes and the tab appears for everyone.
 *
 * Use as a sibling of the page header, e.g. directly above `<main>`.
 */
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRightLeft, Hourglass, Beaker } from 'lucide-react';

export const BRIDGE_FEATURE_FLAG_ENABLED = import.meta.env.VITE_FEATURE_BRIDGE === 'true';

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
    description: 'Xenografts replace standard human transplants',
    icon: ArrowRightLeft,
  },
  {
    to: '/bridge',
    label: 'Bridge Therapy',
    description: 'Xenografts bridge to a permanent human transplant',
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
                className={`flex items-center gap-2 px-5 py-3 border-b-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-medical-border'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">
                  {tab.label.split(' ')[0] === 'Replacement' ? 'Replace' : 'Bridge'}
                </span>
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
