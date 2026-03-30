import React from 'react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

interface SeriesConfig {
  key: string;
  label: string;
  color: string;
}

interface ChartSeriesToggleProps {
  series: SeriesConfig[];
  visible: Record<string, boolean>;
  onChange: (key: string, visible: boolean) => void;
}

export const ChartSeriesToggle: React.FC<ChartSeriesToggleProps> = ({
  series,
  visible,
  onChange,
}) => {
  return (
    <div className="grid grid-cols-3 gap-x-4 gap-y-2 mt-4 p-3 bg-muted/30 rounded-lg border border-medical-border">
      {series.map((s) => (
        <div key={s.key} className="flex items-center gap-1.5">
          <Checkbox
            id={`toggle-${s.key}`}
            checked={visible[s.key]}
            onCheckedChange={(checked) => onChange(s.key, checked === true)}
            className="data-[state=checked]:bg-primary h-3.5 w-3.5"
          />
          <Label
            htmlFor={`toggle-${s.key}`}
            className="text-xs font-normal cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
          >
            <span
              className="w-2.5 h-0.5 rounded"
              style={{ backgroundColor: s.color }}
            />
            {s.label}
          </Label>
        </div>
      ))}
    </div>
  );
};
