/**
 * ChartContextHeader — a uniform metadata strip rendered under each
 * chart's title. The May 2026 design review found that even
 * sophisticated reviewers were unclear on:
 *
 *   - WHO the chart is counting (cohort / subgroup)
 *   - WHAT the y-axis is measuring (stock vs. flow, cumulative vs. annual)
 *   - WHEN baseline is shown (xeno_proportion = 0 with same other params)
 *   - HOW supply is parameterized for this scenario
 *
 * Every chart card now renders this strip so a reader can answer
 * those four questions without leaving the chart. Keep this component
 * deliberately small and text-only — no controls, no toggles, no
 * additional state. It's just signage.
 */
import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';

export interface ChartContextHeaderProps {
  /** Who is being counted, e.g. "Patients on kidney waitlist". */
  population: string;
  /** What the y-axis represents, e.g. "Snapshot count (stock)". */
  measure: string;
  /** Time-scale label, e.g. "Year-end snapshot · 1–10 years". */
  timing: string;
  /**
   * What "baseline" means in this chart. Defaults to the project-wide
   * convention so callers don't have to repeat it.
   */
  baseline?: string;
  /**
   * Supply / strategy tag shared across all charts in the page.
   * Threaded down from the page so it stays in sync with the controls.
   */
  supplyTag: string;
  /**
   * Optional one-line note that flags a chart-specific subtlety
   * (e.g. "Re-transplants from graft failures count toward this total").
   */
  note?: string;
}

const ChartContextHeader: React.FC<ChartContextHeaderProps> = ({
  population,
  measure,
  timing,
  baseline = 'Same parameters, xeno_proportion = 0',
  supplyTag,
  note,
}) => {
  return (
    <div className="text-[11px] leading-snug text-muted-foreground bg-muted/30 border border-medical-border rounded-md px-3 py-2 mt-2 space-y-0.5">
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        <span><span className="text-foreground font-medium">Population:</span> {population}</span>
        <span><span className="text-foreground font-medium">Y-axis:</span> {measure}</span>
        <span><span className="text-foreground font-medium">Time:</span> {timing}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        <span><span className="text-foreground font-medium">Baseline:</span> {baseline}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-foreground font-medium">Supply:</span>
        <span>{supplyTag}</span>
      </div>
      {note && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-start gap-1 pt-0.5 text-[11px] text-foreground/80 cursor-help">
                <Info className="w-3 h-3 mt-[2px] flex-shrink-0" aria-label="Chart note" />
                <span>{note}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-xs">{note}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
};

export default ChartContextHeader;
