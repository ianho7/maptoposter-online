import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, FileCheck, Loader2 } from "lucide-react";
import * as m from "@/paraglide/messages";

interface FontSettingsProps {
  customFont: Uint8Array | null;
  fontFileName: string;
  fontFileInputRef: React.RefObject<HTMLInputElement | null>;
  onFontUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClearFont: () => void;
  selectedPreset: string;
  fontLoadingPreset: string | null;
  onPresetFontSelect: (preset: string) => void;
}

const PRESETS = [
  { key: "default", label: () => m.font_preset_default() },
  { key: "LXGW_Neo_ZhiSong", label: () => m.font_preset_LXGW_Neo_ZhiSong() },
  { key: "fraunces", label: () => m.font_preset_fraunces() },
];

export function FontSettings({
  customFont,
  fontFileName,
  fontFileInputRef,
  onFontUpload,
  onClearFont,
  selectedPreset,
  fontLoadingPreset,
  onPresetFontSelect,
}: FontSettingsProps) {
  return (
    <Card className="p-4 bg-card border-border">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-primary" />
        <h2 className="text-lg text-foreground">{m.font_settings()}</h2>
      </div>

      <Tabs defaultValue="default" className="w-full">
        <TabsList className="w-full bg-secondary">
          {PRESETS.map((preset) => {
            const isLoading = fontLoadingPreset === preset.key;

            return (
              <TabsTrigger
                key={preset.key}
                value={preset.key}
                className="flex-1 text-foreground data-[state=active]:text-vanilla"
                onClick={() => onPresetFontSelect(preset.key)}
                disabled={isLoading}
              >
                {isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                {preset.label()}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {/* 自定义上传：与 preset 无关，始终可见 */}
      <div className="">
        {!customFont || selectedPreset !== "custom" ? (
          <div
            onClick={() => fontFileInputRef.current?.click()}
            className="border-1 border-dashed p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-secondary/50 transition-colors border-border"
          >
            <FileText className="w-6 h-6 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{m.upload_font()}</span>
            <span className="text-[10px] text-muted-foreground">{m.font_formats()}</span>
          </div>
        ) : (
          <div className="border p-3 flex items-center justify-between border-border bg-card">
            <div className="flex items-center gap-2 min-w-0">
              <FileCheck className="w-4 h-4 shrink-0 text-green-600" />
              <span className="text-sm truncate text-foreground">{fontFileName}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearFont}
              className="h-6 px-2 text-[10px] text-destructive"
            >
              {m.font_settings_clear()}
            </Button>
          </div>
        )}
      </div>

      <input
        type="file"
        ref={fontFileInputRef}
        onChange={onFontUpload}
        accept=".ttf,.otf"
        className="hidden"
      />
    </Card>
  );
}
