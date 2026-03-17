import { useState, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SlidersHorizontal, X } from "lucide-react";

export interface ActiveFilter {
  key: string;
  label: string;
  value: string;
  onClear: () => void;
}

interface FilterToolbarProps {
  activeFilters: ActiveFilter[];
  children: ReactNode;
  /** Additional elements to render inline (e.g. action buttons) */
  actions?: ReactNode;
}

export function FilterToolbar({ activeFilters, children, actions }: FilterToolbarProps) {
  const [open, setOpen] = useState(false);
  const visibleFilters = activeFilters.filter((f) => f.value);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filter
            {visibleFilters.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5 text-[10px] rounded-full">
                {visibleFilters.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-4 space-y-3">
          {children}
        </PopoverContent>
      </Popover>

      {visibleFilters.map((f) => (
        <Badge key={f.key} variant="secondary" className="gap-1 py-1 px-2 text-xs font-normal">
          <span className="text-muted-foreground">{f.label}:</span> {f.value}
          <button onClick={f.onClear} className="ml-0.5 hover:text-destructive">
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}

      {actions}
    </div>
  );
}
