import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAP_THEMES, type MapColors, type MapTheme } from "@/lib/types";
import * as m from "@/paraglide/messages";
import { memo, useEffect, useState } from "react";

type ColorKey = keyof MapColors;

function isValidHexColor(color: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(color);
}

interface ColorKeyDef {
  key: ColorKey;
  label: string;
}

interface ClipboardColorJson {
  background: string;
  text: string;
  mask_gradient: string;
  water: string;
  park_greenery: string;
  poi: string;
  roads: {
    highway: string;
    primary: string;
    secondary: string;
    tertiary: string;
    residential: string;
    other: string;
  };
}

function isClipboardColorJson(value: unknown): value is ClipboardColorJson {
  if (!value || typeof value !== "object") return false;

  const json = value as Record<string, unknown>;
  const roads = json.roads;

  if (!roads || typeof roads !== "object") return false;

  const requiredStringFields = [
    "background",
    "text",
    "mask_gradient",
    "water",
    "park_greenery",
    "poi",
  ] as const;
  const requiredRoadFields = [
    "highway",
    "primary",
    "secondary",
    "tertiary",
    "residential",
    "other",
  ] as const;

  return (
    requiredStringFields.every((field) => typeof json[field] === "string") &&
    requiredRoadFields.every(
      (field) => typeof (roads as Record<string, unknown>)[field] === "string"
    )
  );
}

// ─── 独立的颜色行组件，内部维护本地 state，避免拖动时触发父组件重渲染 ───

interface ColorInputProps {
  colorKey: ColorKey;
  label: string;
  value: string;
  onChange: (key: ColorKey, value: string) => void;
}

const ColorInput = memo(function ColorInput({ colorKey, label, value, onChange }: ColorInputProps) {
  const [localValue, setLocalValue] = useState(value);

  // 当父组件传入的 value 变化时（例如切换预设主题）同步本地状态
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const commitToParent = (val: string) => {
    const finalVal = isValidHexColor(val) ? val : "#000000";
    setLocalValue(finalVal);
    onChange(colorKey, finalVal);
  };

  return (
    <div className="flex items-center justify-between gap-4">
      <Label className="text-[11px] whitespace-nowrap text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={localValue}
          onChange={(e) => {
            // 拖动时只更新本地 state，不触发父组件重渲染
            setLocalValue(e.target.value);
          }}
          onMouseUp={(e) => {
            // 松开鼠标时才同步给父组件
            commitToParent((e.target as HTMLInputElement).value);
          }}
          onTouchEnd={(e) => {
            commitToParent((e.target as HTMLInputElement).value);
          }}
          // 键盘 / 失焦兜底
          onBlur={(e) => {
            commitToParent(e.target.value);
          }}
          className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent p-0 overflow-hidden [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none"
        />
        <Input
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={(e) => {
            commitToParent(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitToParent((e.target as HTMLInputElement).value);
            }
          }}
          className="w-20 h-8 text-[11px] font-mono px-2 border-border bg-card text-foreground"
          placeholder="#000000"
        />
      </div>
    </div>
  );
});

// ─── 主组件 ───

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
  const [isImporting, setIsImporting] = useState(false);
  const showClipboardImport = import.meta.env.DEV;

  const colorKeys: ColorKeyDef[] = [
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
  ];

  const handleColorChange = (key: ColorKey, val: string) => {
    onCustomColorsChange({ ...customColors, [key]: val });
  };

  const handlePasteFromClipboard = async () => {
    if (!navigator.clipboard?.readText) {
      alert("当前浏览器不支持读取剪贴板。");
      return;
    }

    setIsImporting(true);

    try {
      const text = await navigator.clipboard.readText();
      const parsed = JSON.parse(text);

      if (!isClipboardColorJson(parsed)) {
        alert("剪贴板里的配色 JSON 格式不正确。");
        return;
      }

      onCustomColorsChange({
        bg: parsed.background,
        text: parsed.text,
        gradient_color: parsed.mask_gradient,
        water: parsed.water,
        parks: parsed.park_greenery,
        poi_color: parsed.poi,
        road_motorway: parsed.roads.highway,
        road_primary: parsed.roads.primary,
        road_secondary: parsed.roads.secondary,
        road_tertiary: parsed.roads.tertiary,
        road_residential: parsed.roads.residential,
        road_default: parsed.roads.other,
      });
      onUseCustomColorsChange(true);
    } catch (error) {
      console.error("Failed to import colors from clipboard:", error);
      alert("读取剪贴板失败，或 JSON 解析失败。");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Card className="p-4 bg-card border-border">
      <div className="flex items-center gap-2">
        <Palette className="w-4 h-4 text-primary" />
        <h2 className="text-lg text-foreground">{m.theme_colors()}</h2>
      </div>
      <Tabs defaultValue="presets" className="w-full">
        <TabsList className="w-full bg-secondary">
          <TabsTrigger
            value="presets"
            className="flex-1 text-foreground data-[state=active]:text-vanilla"
            onClick={() => onUseCustomColorsChange(false)}
          >
            {m.tab_presets()}
          </TabsTrigger>
          <TabsTrigger
            value="custom"
            className="flex-1 text-foreground data-[state=active]:text-vanilla"
            onClick={() => onUseCustomColorsChange(true)}
          >
            {m.tab_custom()}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="presets" className="mt-3">
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
        </TabsContent>

        <TabsContent value="custom" className="mt-3">
          {showClipboardImport ? (
            <div className="mb-3 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePasteFromClipboard}
                disabled={isImporting}
              >
                {isImporting ? "导入中..." : "从剪贴板导入配色"}
              </Button>
            </div>
          ) : null}
          <div className="space-y-4 pr-2 custom-scrollbar pt-1">
            {colorKeys.map(({ key, label }) => (
              <ColorInput
                key={key}
                colorKey={key}
                label={label}
                value={customColors[key]}
                onChange={handleColorChange}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
