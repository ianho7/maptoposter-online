import { useState, useEffect, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Route, Search, X, Loader2 } from "lucide-react";
import type { RoadSuggestion } from "@/services/highlighted-road";

interface HighlightRoadSettingsProps {
  roadName: string;
  onRoadNameChange: (val: string) => void;
  isLoading: boolean;
  hasData: boolean;
  onSearch: () => void;
  onClear: () => void;
  onSearchSuggestions: (keyword: string) => Promise<RoadSuggestion[]>;
}

export function HighlightRoadSettings({
  roadName,
  onRoadNameChange,
  isLoading,
  hasData,
  onSearch,
  onClear,
  onSearchSuggestions,
}: HighlightRoadSettingsProps) {
  const [suggestions, setSuggestions] = useState<RoadSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSuggestLoading, setIsSuggestLoading] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);
  const skipSuggestRef = useRef(false);

  const fetchSuggestions = useCallback(
    async (keyword: string) => {
      if (keyword.trim().length < 2) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }
      setIsSuggestLoading(true);
      try {
        const results = await onSearchSuggestions(keyword.trim());
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
        setActiveSuggestion(-1);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setIsSuggestLoading(false);
      }
    },
    [onSearchSuggestions]
  );

  useEffect(() => {
    if (skipSuggestRef.current) {
      skipSuggestRef.current = false;
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(roadName), 400);
    return () => clearTimeout(debounceRef.current);
  }, [roadName, fetchSuggestions]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectSuggestion = (s: RoadSuggestion) => {
    skipSuggestRef.current = true;
    onRoadNameChange(s.name);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === "Enter" && !isLoading) onSearch();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggestion((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestion((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeSuggestion >= 0) {
        selectSuggestion(suggestions[activeSuggestion]);
      } else {
        setShowSuggestions(false);
        onSearch();
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

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
          <div className="flex gap-2" ref={containerRef}>
            <div className="relative flex-1">
              <Input
                className="h-9 border-border bg-card w-full"
                placeholder="例：滨海大道"
                value={roadName}
                onChange={(e) => onRoadNameChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (suggestions.length > 0) setShowSuggestions(true);
                }}
              />
              {isSuggestLoading && (
                <Loader2 className="w-3 h-3 animate-spin absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              )}
              {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                  {suggestions.map((s, i) => (
                    <li
                      key={s.name}
                      className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                        i === activeSuggestion
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50"
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectSuggestion(s);
                      }}
                    >
                      <span className="text-foreground">{s.name}</span>
                      {s.nameEn && s.nameEn !== s.name && (
                        <span className="ml-2 text-xs text-muted-foreground">{s.nameEn}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Button
              variant="default"
              size="sm"
              className="h-9 px-3"
              onClick={() => {
                setShowSuggestions(false);
                onSearch();
              }}
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
