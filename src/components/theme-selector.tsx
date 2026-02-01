'use client';

import { MAP_THEMES, type MapTheme } from '@/lib/types';
import { cn } from '@/lib/utils';

interface ThemeSelectorProps {
  selectedTheme: string;
  onSelect: (theme: MapTheme) => void;
}

export function ThemeSelector({ selectedTheme, onSelect }: ThemeSelectorProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {MAP_THEMES.map((theme) => (
          <button
            key={theme.id}
            onClick={() => onSelect(theme)}
            className={cn(
              "group relative p-2 rounded-lg border transition-all duration-200",
              selectedTheme === theme.id
                ? "border-accent ring-2 ring-accent/30"
                : "border-border/50 hover:border-border"
            )}
          >
            {/* Theme preview */}
            <div 
              className="aspect-[3/4] rounded overflow-hidden mb-2"
              style={{ backgroundColor: theme.colors.bg }}
            >
              {/* Mini map preview */}
              <div className="relative w-full h-full p-1">
                {/* Water */}
                <div 
                  className="absolute top-2 left-2 w-4 h-3 rounded-sm opacity-60"
                  style={{ backgroundColor: theme.colors.water }}
                />
                {/* Park */}
                <div 
                  className="absolute top-4 right-2 w-3 h-2 rounded-sm opacity-60"
                  style={{ backgroundColor: theme.colors.parks }}
                />
                {/* Roads */}
                <div 
                  className="absolute top-1/2 left-0 right-0 h-[2px] opacity-70"
                  style={{ backgroundColor: theme.colors.road_primary }}
                />
                <div 
                  className="absolute top-1/3 left-1/4 w-[2px] h-1/2 opacity-50"
                  style={{ backgroundColor: theme.colors.road_secondary }}
                />
                <div 
                  className="absolute top-2/3 left-1/2 w-[1px] h-1/3 opacity-40"
                  style={{ backgroundColor: theme.colors.road_tertiary }}
                />
                
                {/* Title preview */}
                <div 
                  className="absolute bottom-1 left-0 right-0 text-center"
                  style={{ color: theme.colors.text }}
                >
                  <div className="text-[6px] font-serif tracking-wider uppercase">CITY</div>
                </div>
              </div>
            </div>
            
            <span 
              className="text-xs font-medium block text-center truncate"
              style={{ color: selectedTheme === theme.id ? 'var(--accent)' : 'inherit' }}
            >
              {theme.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
