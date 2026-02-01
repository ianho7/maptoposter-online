'use client';

import { POSTER_SIZES, type PosterSize } from '@/lib/types';
import { cn } from '@/lib/utils';

interface SizeSelectorProps {
  selectedSize: string;
  onSelect: (size: PosterSize) => void;
}

export function SizeSelector({ selectedSize, onSelect }: SizeSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {POSTER_SIZES.map((size) => (
        <button
          key={size.id}
          onClick={() => onSelect(size)}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200",
            selectedSize === size.id
              ? "border-accent bg-accent/10 text-accent"
              : "border-border/50 hover:border-border bg-card/30"
          )}
        >
          {/* Size icon */}
          <div 
            className="w-4 h-5 border rounded-sm flex-shrink-0"
            style={{ 
              aspectRatio: size.aspect,
              borderColor: selectedSize === size.id ? 'var(--accent)' : 'var(--border)',
              width: size.aspect.includes('/') && parseFloat(size.aspect.split('/')[0]) > parseFloat(size.aspect.split('/')[1]) ? '20px' : '12px',
              height: size.aspect.includes('/') && parseFloat(size.aspect.split('/')[0]) > parseFloat(size.aspect.split('/')[1]) ? '12px' : '20px',
            }}
          />
          <span className="text-xs font-medium whitespace-nowrap">{size.name}</span>
        </button>
      ))}
    </div>
  );
}
