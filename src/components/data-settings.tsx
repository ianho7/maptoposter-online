import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings2 } from "lucide-react";
import * as m from "@/paraglide/messages";

interface DataSettingsProps {
  baseRadius: number;
  onBaseRadiusChange: (val: number) => void;
}

export function DataSettings({ baseRadius, onBaseRadiusChange }: DataSettingsProps) {
  return (
    <Card className="p-4 bg-card border-border">
      <div className="flex items-center gap-2">
        <Settings2 className="w-4 h-4 text-primary" />
        <h2 className="text-lg  text-foreground">{m.label_map_radius()}</h2>
      </div>
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              {m.label_map_radius()}
            </Label>
            <span className="text-xs font-mono text-primary">{baseRadius}m</span>
          </div>
          <Select
            value={baseRadius.toString()}
            onValueChange={(val) => onBaseRadiusChange(parseInt(val))}
          >
            <SelectTrigger className="w-full h-9 border-border bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 18 }, (_, i) => 3000 + i * 1000).map((radius) => (
                <SelectItem key={radius} value={radius.toString()}>
                  {radius}m
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] italic px-1 text-muted-foreground">{m.radius_desc()}</p>
        </div>
      </div>
    </Card>
  );
}
