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
    <div className="flex flex-wrap gap-3 mb-3 p-3 bg-muted/30 rounded-lg border border-medical-border">
      {series.map((s) => (
        <div key={s.key} className="flex items-center gap-2">
          <Checkbox
            id={`toggle-${s.key}`}
            checked={visible[s.key]}
            onCheckedChange={(checked) => onChange(s.key, checked === true)}
            className="data-[state=checked]:bg-primary"
          />
          <Label
            htmlFor={`toggle-${s.key}`}
            className="text-xs font-normal cursor-pointer flex items-center gap-1.5"
          >
            <span
              className="w-3 h-0.5 rounded"
              style={{ backgroundColor: s.color }}
            />
            {s.label}
          </Label>
        </div>
      ))}
    </div>
  );
};
