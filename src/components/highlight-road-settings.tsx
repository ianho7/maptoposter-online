import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Route, Search, X, Loader2 } from "lucide-react";

interface HighlightRoadSettingsProps {
  roadName: string;
  onRoadNameChange: (val: string) => void;
  isLoading: boolean;
  hasData: boolean;
  onSearch: () => void;
  onClear: () => void;
}

export function HighlightRoadSettings({
  roadName,
  onRoadNameChange,
  isLoading,
  hasData,
  onSearch,
  onClear,
}: HighlightRoadSettingsProps) {
  return (
    <Card className="p-4 bg-card border-border">
      <div className="flex items-center gap-2 mb-3">
        <Route className="w-4 h-4 text-primary" />
        <h2 className="text-lg text-foreground">道路海报</h2>
      </div>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            道路名称
          </Label>
          <div className="flex gap-2">
            <Input
              className="flex-1 h-9 border-border bg-card"
              placeholder="例：滨海大道"
              value={roadName}
              onChange={(e) => onRoadNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isLoading) onSearch();
              }}
            />
            <Button
              variant="default"
              size="sm"
              className="h-9 px-3"
              onClick={onSearch}
              disabled={isLoading || !roadName.trim()}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </Button>
            {hasData && (
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3"
                onClick={onClear}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
        {hasData && (
          <p className="text-xs text-green-600">
            ✓ 道路海报模式已激活，视口将自动适配道路范围
          </p>
        )}
        <p className="text-[12px] italic px-1 text-muted-foreground">
          输入道路名称，以该道路为中心生成专属海报。周围路网将作为低对比度纹理背景
        </p>
      </div>
    </Card>
  );
}
