import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { LocationCombobox } from "@/components/location-combobox";
import { MapPin } from "lucide-react";
import { type Location } from "@/lib/types";
import { type State, type City, type Country } from "@/services/location-types";
import * as m from "@/paraglide/messages";

interface LocationSettingsProps {
  location: Location;
  countries: Country[];
  states: State[];
  cities: City[];
  selectedCountry: string;
  selectedState: string;
  selectedCity: string;
  customTitle: string;
  isStatesLoading: boolean;
  isCitiesLoading: boolean;
  locationLoading: boolean;
  onCountryChange: (val: string) => void;
  onStateChange: (val: string) => void;
  onCityChange: (val: string) => void;
  onCustomTitleChange: (val: string) => void;
}

export function LocationSettings({
  location,
  countries,
  states,
  cities,
  selectedCountry,
  selectedState,
  selectedCity,
  customTitle,
  isStatesLoading,
  isCitiesLoading,
  locationLoading,
  onCountryChange,
  onStateChange,
  onCityChange,
  onCustomTitleChange,
}: LocationSettingsProps) {
  return (
    <Card className="p-4 bg-card border-border">
      <div className="flex items-center gap-2">
        <MapPin className="w-4 h-4 text-primary" />
        <h2 className="text-lg  text-foreground">{m.location()}</h2>
      </div>
      <div className="space-y-3">
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            {m.label_country()}
          </Label>
          <LocationCombobox
            options={countries}
            value={selectedCountry}
            onValueChange={onCountryChange}
            placeholder={m.placeholder_select_country()}
            emptyText={m.empty_country()}
            disabled={locationLoading}
          />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            {m.label_state()}
          </Label>
          <LocationCombobox
            options={states}
            value={selectedState}
            onValueChange={onStateChange}
            placeholder={m.placeholder_select_state()}
            emptyText={m.empty_state()}
            disabled={states.length === 0 && !isStatesLoading}
            isLoading={isStatesLoading}
          />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            {m.label_city()}
          </Label>
          <LocationCombobox
            options={cities}
            value={selectedCity}
            onValueChange={onCityChange}
            placeholder={m.placeholder_select_city()}
            emptyText={m.empty_city()}
            disabled={cities.length === 0 && !isCitiesLoading}
            isLoading={isCitiesLoading}
          />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            {m.label_custom_title()}
          </Label>
          <Input
            value={customTitle}
            onChange={(e) => onCustomTitleChange(e.target.value)}
            placeholder={location.city}
            className="border-border bg-card text-foreground"
          />
        </div>
      </div>
    </Card>
  );
}
