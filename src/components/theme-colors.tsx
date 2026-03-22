import { Card } from "@/components/ui/card";
import { Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAP_THEMES, type MapColors, type MapTheme } from "@/lib/types";
import * as m from "@/paraglide/messages";
import { useMemo } from "react";

type ColorKey = keyof MapColors;

interface ColorKeyDef {
  key: ColorKey;
  label: string;
}

interface ThemeColorsProps {
  selectedTheme: MapTheme;
  customColors: MapColors;
  useCustomColors: boolean;
  themeNameMap: Record<string, string>;
  onThemeChange: (theme: MapTheme) => void;
  onCustomColorsChange: (colors: MapColors) => void;
  onUseCustomColorsChange: (useCustom: boolean) => void;
}

export function ThemeColors({
  selectedTheme,
  customColors,
  useCustomColors,
  themeNameMap,
  onThemeChange,
  onCustomColorsChange,
  onUseCustomColorsChange,
}: ThemeColorsProps) {
  const colorKeys: ColorKeyDef[] = useMemo(
    () => [
      { key: "bg", label: m.color_bg() },
      { key: "text", label: m.color_text() },
      { key: "gradient_color", label: m.color_gradient() },
      { key: "water", label: m.color_water() },
      { key: "parks", label: m.color_parks() },
      { key: "poi_color", label: m.color_poi() },
      { key: "road_motorway", label: m.color_road_motorway() },
      { key: "road_primary", label: m.color_road_primary() },
      { key: "road_secondary", label: m.color_road_secondary() },
      { key: "road_tertiary", label: m.color_road_tertiary() },
      { key: "road_residential", label: m.color_road_residential() },
      { key: "road_default", label: m.color_road_default() },
    ],
    []
  );

  return (
    <Card className="p-4 bg-card border-border">
      <div className="flex items-center gap-2">
        <Palette className="w-4 h-4 text-primary" />
        <h2 className="text-lg  text-foreground">{m.theme_colors()}</h2>
      </div>
      <div className="mt-4 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {MAP_THEMES.map((theme: MapTheme) => (
            <button
              key={theme.id}
              onClick={() => {
                onThemeChange(theme);
                onCustomColorsChange(theme.colors);
                onUseCustomColorsChange(false);
              }}
              className={cn(
                "p-2 border-1 transition-all flex flex-col items-center gap-2 cursor-pointer",
                selectedTheme.id === theme.id && !useCustomColors
                  ? "border-primary bg-background/60"
                  : "border-transparent bg-transparent hover:bg-background/50"
              )}
            >
              <div className="flex -space-x-1.5">
                {(Object.values(theme.colors) as string[])
                  .slice(0, 4)
                  .map((color: string, i: number) => (
                    <div
                      key={i}
                      className="w-5 h-5 border border-background shadow-sm"
                      style={{ backgroundColor: color }}
                    />
                  ))}
              </div>
              <span className="text-[12px] font-medium line-clamp-1 text-foreground">
                {themeNameMap[theme.id] || theme.name}
              </span>
            </button>
          ))}
        </div>

        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar pt-1">
          {colorKeys.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <span className="text-[11px] whitespace-nowrap text-muted-foreground">{label}</span>
              <div className="flex items-center gap-2">
                <div className="relative group">
                  <input
                    type="color"
                    value={customColors[key]}
                    onChange={(e) =>
                      onCustomColorsChange({ ...customColors, [key]: e.target.value })
                    }
                    className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent p-0 overflow-hidden [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none"
                  />
                </div>
                <span className="w-20 h-8 text-[11px] font-mono px-2 border border-border bg-card text-foreground flex items-center rounded">
                  {customColors[key]}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
