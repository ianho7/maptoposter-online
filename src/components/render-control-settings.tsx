import { Card } from "@/components/ui/card";
import { Eye } from "lucide-react";
import * as m from "@/paraglide/messages";

interface RenderControlSettingsProps {
  showCoords: boolean;
  showCity: boolean;
  showCountry: boolean;
  enableRoadMaskOptimization: boolean;
  onShowCoordsChange: (val: boolean) => void;
  onShowCityChange: (val: boolean) => void;
  onShowCountryChange: (val: boolean) => void;
  onEnableRoadMaskOptimizationChange: (val: boolean) => void;
}

export function RenderControlSettings({
  showCoords,
  showCity,
  showCountry,
  enableRoadMaskOptimization,
  onShowCoordsChange,
  onShowCityChange,
  onShowCountryChange,
  onEnableRoadMaskOptimizationChange,
}: RenderControlSettingsProps) {
  const textToggles = [
    { checked: showCity, onChange: onShowCityChange, label: m.toggle_show_city() },
    { checked: showCountry, onChange: onShowCountryChange, label: m.toggle_show_country() },
    { checked: showCoords, onChange: onShowCoordsChange, label: m.toggle_show_coords() },
    {
      checked: enableRoadMaskOptimization,
      onChange: onEnableRoadMaskOptimizationChange,
      label: m.toggle_road_mask_optimization(),
    },
  ];

  return (
    <Card className="p-4 bg-card border-border">
      <div className="flex items-center gap-2">
        <Eye className="w-4 h-4 text-primary" />
        <h2 className="text-lg text-foreground">{m.render_control()}</h2>
      </div>
      <div className="flex flex-wrap gap-1">
        {textToggles.map(({ checked, onChange, label }) => (
          <label
            key={label}
            className="flex items-center gap-3 cursor-pointer py-1 px-1 hover:bg-secondary/30 rounded transition-colors"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => onChange(e.target.checked)}
              className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
            />
            <span className="text-sm text-foreground select-none">{label}</span>
          </label>
        ))}
      </div>
    </Card>
  );
}
