/**
 * Tiny segmented-control primitive for the Pareto toolbar.
 *
 * Used by `ReplacementPareto` and `Bridge` to expose the new overlay
 * selector (off / thresholds / strategies) and view selector
 * (cumulative / marginal). Pure Tailwind + native <button>; no shadcn
 * Button primitive needed because the dashboard's dependency footprint
 * doesn't include one yet.
 */
import React from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Optional shorter label used when space is tight. */
  shortLabel?: string;
  /** Optional tooltip surfaced via title attribute. */
  hint?: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  /** Optional label rendered before the control (e.g. "Overlay:"). */
  label?: string;
  /** Compact rendering (smaller padding + text). Defaults to false. */
  compact?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  compact = false,
  className,
  ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {label && (
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      )}
      <div
        role="radiogroup"
        aria-label={ariaLabel ?? label}
        className="inline-flex rounded-md border border-medical-border bg-card p-0.5 shadow-sm"
      >
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              title={opt.hint}
              onClick={() => onChange(opt.value)}
              className={cn(
                'rounded-sm transition-colors font-medium whitespace-nowrap',
                compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
                selected
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default SegmentedControl;
