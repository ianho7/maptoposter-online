import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, FileCheck } from "lucide-react";
import * as m from "@/paraglide/messages";

interface FontSettingsProps {
  customFont: Uint8Array | null;
  fontFileName: string;
  fontFileInputRef: React.RefObject<HTMLInputElement | null>;
  onFontUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClearFont: () => void;
}

export function FontSettings({
  customFont,
  fontFileName,
  fontFileInputRef,
  onFontUpload,
  onClearFont,
}: FontSettingsProps) {
  return (
    <Card className="p-4 bg-card border-border">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-primary" />
        <h2 className="text-lg  text-foreground">{m.font_settings()}</h2>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          {customFont && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearFont}
              className="h-6 px-2 text-[10px] text-destructive"
            >
              Clear
            </Button>
          )}
        </div>
        {!customFont ? (
          <div
            onClick={() => fontFileInputRef.current?.click()}
            className="border-2 border-dashed p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-secondary/50 transition-colors border-border"
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
          </div>
        )}
        <input
          type="file"
          ref={fontFileInputRef}
          onChange={onFontUpload}
          accept=".ttf,.otf"
          className="hidden"
        />
      </div>
    </Card>
  );
}
