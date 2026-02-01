'use client';

import { EXAMPLE_LOCATIONS, MAP_THEMES, type Location, type MapTheme } from '@/lib/types';

interface ExampleCardsProps {
  onSelect: (location: Location, theme: MapTheme) => void;
}

export function ExampleCards({ onSelect }: ExampleCardsProps) {
  const examples = EXAMPLE_LOCATIONS.map((loc, index) => ({
    location: loc,
    theme: MAP_THEMES[index % MAP_THEMES.length],
  }));

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="font-serif text-lg text-foreground mb-1">Explore Examples</h3>
        <p className="text-xs text-muted-foreground">Click to use as starting point</p>
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {examples.map((example, index) => (
          <button
            key={index}
            onClick={() => onSelect(example.location, example.theme)}
            className="group relative aspect-[3/4] rounded-lg overflow-hidden border border-border/30 hover:border-accent/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
            style={{ backgroundColor: example.theme.colors.bg }}
          >
            {/* Decorative border */}
            <div 
              className="absolute inset-2 border opacity-20"
              style={{ borderColor: example.theme.colors.text }}
            />
            
            {/* Simulated map pattern */}
            <div className="absolute inset-4">
              {/* Water bodies */}
              <div 
                className="absolute top-4 left-3 w-8 h-6 rounded-full opacity-40"
                style={{ backgroundColor: example.theme.colors.water }}
              />
              
              {/* Parks */}
              <div 
                className="absolute bottom-8 right-4 w-6 h-4 rounded opacity-40"
                style={{ backgroundColor: example.theme.colors.parks }}
              />
              
              {/* Road network */}
              <svg className="absolute inset-0 w-full h-full opacity-50">
                <line 
                  x1="10%" y1="30%" x2="90%" y2="30%" 
                  stroke={example.theme.colors.road_primary} 
                  strokeWidth="2"
                />
                <line 
                  x1="30%" y1="10%" x2="30%" y2="70%" 
                  stroke={example.theme.colors.road_secondary} 
                  strokeWidth="1.5"
                />
                <line 
                  x1="60%" y1="20%" x2="60%" y2="80%" 
                  stroke={example.theme.colors.road_tertiary} 
                  strokeWidth="1"
                />
                <line 
                  x1="20%" y1="50%" x2="80%" y2="60%" 
                  stroke={example.theme.colors.road_residential} 
                  strokeWidth="0.5"
                />
              </svg>
            </div>
            
            {/* City name */}
            <div 
              className="absolute bottom-3 left-0 right-0 text-center"
              style={{ color: example.theme.colors.text }}
            >
              <div className="text-xs font-serif tracking-[0.2em] uppercase">
                {example.location.city}
              </div>
              <div className="text-[8px] opacity-60 mt-0.5">
                {example.location.country}
              </div>
            </div>
            
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/5 transition-colors" />
          </button>
        ))}
      </div>
    </div>
  );
}
