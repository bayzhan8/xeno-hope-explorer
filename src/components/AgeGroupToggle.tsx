import React from 'react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, ChevronUp } from 'lucide-react';

export const AGE_GROUPS = [
  { key: 'age0_18', label: '0-18', color: '#8b5cf6' },
  { key: 'age18_45', label: '18-45', color: '#3b82f6' },
  { key: 'age45_60', label: '45-60', color: '#10b981' },
  { key: 'age60plus', label: '60+', color: '#f59e0b' }
] as const;

interface AgeGroupToggleProps {
  visible: Record<string, boolean>;
  onChange: (key: string, visible: boolean) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}

export const AgeGroupToggle: React.FC<AgeGroupToggleProps> = ({
  visible,
  onChange,
  expanded,
  onToggleExpand
}) => {
  return (
    <div className="border-t border-medical-border pt-2 mt-2">
      <button
        type="button"
        onClick={onToggleExpand}
        className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        <span>Age Group Breakdown</span>
        <span className="text-xs text-muted-foreground font-normal">(optional)</span>
      </button>

      {expanded && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 p-3 bg-muted/20 rounded-lg border border-medical-border/50">
          {AGE_GROUPS.map((group) => (
            <div key={group.key} className="flex items-center gap-1.5">
              <Checkbox
                id={`age-${group.key}`}
                checked={visible[group.key]}
                onCheckedChange={(checked) => onChange(group.key, checked === true)}
                className="data-[state=checked]:bg-primary h-3.5 w-3.5"
              />
              <Label
                htmlFor={`age-${group.key}`}
                className="text-xs font-normal cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: group.color }}
                />
                {group.label} years
              </Label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
