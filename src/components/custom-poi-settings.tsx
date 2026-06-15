import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type PoiSource } from "@/lib/types";
import { MapPinned, Pin } from "lucide-react";
import * as m from "@/paraglide/messages";

interface CustomPOISettingsProps {
  customPoiCount: number;
  poiSourceLabel: string;
  poiSource: PoiSource;
  onManageClick: () => void;
  onPoiSourceChange: (val: PoiSource) => void;
}

export function CustomPOISettings({
  customPoiCount,
  poiSource,
  onManageClick,
  onPoiSourceChange,
}: CustomPOISettingsProps) {
  const poiSourceOptions: { value: PoiSource; label: string }[] = [
    { value: "off", label: m.poi_source_off() },
    { value: "overpass", label: m.poi_source_overpass() },
    { value: "custom", label: m.poi_source_custom() },
  ];

  return (
    <Card className="border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Pin className="h-4 w-4 text-primary" />
        <h2 className="text-lg text-foreground">{m.custom_poi_nav_label()}</h2>
      </div>
      <div className="space-y-3">
        {/* <p className="text-sm text-muted-foreground">{m.custom_poi_section_description()}</p> */}
        <div className="space-y-2">
          {/* <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {m.toggle_show_pois()}
          </p> */}
          <div className="grid grid-cols-3 gap-2">
            {poiSourceOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onPoiSourceChange(option.value)}
                className={cn(
                  "p-2 border transition-all cursor-pointer text-xs text-foreground",
                  poiSource === option.value
                    ? "border-primary bg-background/60"
                    : "border-transparent bg-transparent hover:bg-background/50"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {poiSource === "custom" && (
          <div className="flex flex-wrap items-center justify-between gap-2 border border-border/70 bg-secondary/20 p-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <MapPinned className="h-4 w-4 text-primary" />
                <span>{m.custom_poi_added_count({ count: String(customPoiCount) })}</span>
              </div>
            </div>
            <Button type="button" className="h-7 cursor-pointer" onClick={onManageClick}>
              {m.custom_poi_manage_button()}
            </Button>
          </div>
        )}
        <p className="text-[12px] italic text-muted-foreground">
          {poiSource === "off"
            ? m.poi_hint_off()
            : poiSource === "overpass"
              ? m.poi_hint_overpass()
              : m.poi_hint_custom()}
        </p>
      </div>
    </Card>
  );
}
