import { Card } from "@/components/ui/card";
import { type PosterSize } from "@/components/artistic-map";
import { cn } from "@/lib/utils";

interface LocalPosterSize extends PosterSize {
  icon: React.ReactNode;
}

interface PosterSizeSelectorProps {
  sizes: LocalPosterSize[];
  selectedSize: LocalPosterSize;
  onSizeChange: (size: LocalPosterSize) => void;
}

export function PosterSizeSelector({ sizes, selectedSize, onSizeChange }: PosterSizeSelectorProps) {
  return (
    <Card className="p-4 bg-card border-border">
      <h2 className="text-lg text-foreground mb-4">Poster Size</h2>
      <div className="grid grid-cols-2 gap-2">
        {sizes.map((size) => (
          <button
            key={size.id}
            onClick={() => onSizeChange(size)}
            className={cn(
              "p-3 border-1 transition-all flex items-center gap-2 cursor-pointer",
              selectedSize.id === size.id
                ? "border-primary bg-background/60"
                : "border-transparent bg-transparent hover:bg-background/50"
            )}
          >
            <span className="text-primary">{size.icon}</span>
            <span className="text-xs text-foreground">{size.name}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}
