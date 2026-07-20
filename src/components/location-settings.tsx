import { useId } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LocationCombobox } from "@/components/location-combobox";
import { CoordinateInput } from "@/components/coordinate-input";
import { MapPin } from "lucide-react";
import { type Location } from "@/lib/types";
import { type State, type City, type Country, type District } from "@/services/location-types";
import * as m from "@/paraglide/messages";

interface LocationSettingsProps {
  location: Location;
  countries: Country[];
  states: State[];
  cities: City[];
  districts: District[];
  selectedCountry: string;
  selectedState: string;
  selectedCity: string;
  selectedDistrict: string;
  customTitle: string;
  isStatesLoading: boolean;
  isCitiesLoading: boolean;
  isDistrictsLoading: boolean;
  locationLoading: boolean;
  onCountryChange: (val: string) => void;
  onStateChange: (val: string) => void;
  onCityChange: (val: string) => void;
  onDistrictChange: (val: string) => void;
  onCustomTitleChange: (val: string) => void;
  locationMode: "search" | "coordinates";
  onLocationModeChange: (mode: "search" | "coordinates") => void;
  coordinateLat: number;
  coordinateLng: number;
  onLatChange: (lat: number) => void;
  onLngChange: (lng: number) => void;
  onCoordinatesChange?: (lat: number, lng: number) => void;
}

export function LocationSettings({
  location,
  countries,
  states,
  cities,
  districts,
  selectedCountry,
  selectedState,
  selectedCity,
  selectedDistrict,
  customTitle,
  isStatesLoading,
  isCitiesLoading,
  isDistrictsLoading,
  locationLoading,
  onCountryChange,
  onStateChange,
  onCityChange,
  onDistrictChange,
  onCustomTitleChange,
  locationMode,
  onLocationModeChange,
  coordinateLat,
  coordinateLng,
  onLatChange,
  onLngChange,
  onCoordinatesChange,
}: LocationSettingsProps) {
  const countryLabelId = useId();
  const stateLabelId = useId();
  const cityLabelId = useId();
  const districtLabelId = useId();
  const customTitleSearchLabelId = useId();
  const customTitleSearchInputId = useId();
  const customTitleCoordinatesLabelId = useId();
  const customTitleCoordinatesInputId = useId();

  return (
    <Card className="p-4 bg-card border-border">
      <div className="flex items-center gap-2">
        <MapPin className="w-4 h-4 text-primary" />
        <h2 className="text-lg text-foreground">{m.location()}</h2>
      </div>

      <Tabs
        value={locationMode}
        onValueChange={(v) => onLocationModeChange(v as "search" | "coordinates")}
        className="w-full"
      >
        <TabsList className="w-full bg-secondary">
          <TabsTrigger
            value="search"
            className="flex-1 text-foreground data-[state=active]:text-vanilla"
          >
            {m.location_mode_search()}
          </TabsTrigger>
          <TabsTrigger
            value="coordinates"
            className="flex-1 text-foreground data-[state=active]:text-vanilla"
          >
            {m.location_mode_coordinates()}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="mt-3">
          <div className="space-y-3">
            <div>
              <Label
                id={countryLabelId}
                className="text-xs uppercase tracking-wider text-muted-foreground"
              >
                {m.label_country()}
              </Label>
              <LocationCombobox
                options={countries}
                value={selectedCountry}
                onValueChange={onCountryChange}
                placeholder={m.placeholder_select_country()}
                emptyText={m.empty_country()}
                labelId={countryLabelId}
                triggerId={`${countryLabelId}-trigger`}
                disabled={locationLoading}
              />
            </div>
            <div>
              <Label
                id={stateLabelId}
                className="text-xs uppercase tracking-wider text-muted-foreground"
              >
                {m.label_state()}
              </Label>
              <LocationCombobox
                options={states}
                value={selectedState}
                onValueChange={onStateChange}
                placeholder={m.placeholder_select_state()}
                emptyText={m.empty_state()}
                labelId={stateLabelId}
                triggerId={`${stateLabelId}-trigger`}
                disabled={states.length === 0 && !isStatesLoading}
                isLoading={isStatesLoading}
              />
            </div>
            <div>
              <Label
                id={cityLabelId}
                className="text-xs uppercase tracking-wider text-muted-foreground"
              >
                {m.label_city()}
              </Label>
              <LocationCombobox
                options={cities}
                value={selectedCity}
                onValueChange={onCityChange}
                placeholder={m.placeholder_select_city()}
                emptyText={m.empty_city()}
                labelId={cityLabelId}
                triggerId={`${cityLabelId}-trigger`}
                disabled={cities.length === 0 && !isCitiesLoading}
                isLoading={isCitiesLoading}
              />
            </div>
            <div>
              <Label
                id={districtLabelId}
                className="text-xs uppercase tracking-wider text-muted-foreground"
              >
                {m.label_district()}
              </Label>
              <LocationCombobox
                options={districts}
                value={selectedDistrict}
                onValueChange={onDistrictChange}
                placeholder={m.placeholder_select_district()}
                emptyText={m.empty_district()}
                labelId={districtLabelId}
                triggerId={`${districtLabelId}-trigger`}
                disabled={districts.length === 0 && !isDistrictsLoading}
                isLoading={isDistrictsLoading}
              />
            </div>
            <div>
              <Label
                htmlFor={customTitleSearchInputId}
                id={customTitleSearchLabelId}
                className="text-xs uppercase tracking-wider text-muted-foreground"
              >
                {m.label_custom_title()}
              </Label>
              <Input
                id={customTitleSearchInputId}
                value={customTitle}
                onChange={(e) => onCustomTitleChange(e.target.value)}
                placeholder={location.city}
                aria-labelledby={customTitleSearchLabelId}
                className="border-border bg-card text-foreground"
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="coordinates" className="mt-3 space-y-3">
          <CoordinateInput
            lat={coordinateLat}
            lng={coordinateLng}
            onLatChange={onLatChange}
            onLngChange={onLngChange}
            onCoordinatesChange={onCoordinatesChange}
          />
          <div>
            <Label
              htmlFor={customTitleCoordinatesInputId}
              id={customTitleCoordinatesLabelId}
              className="text-xs uppercase tracking-wider text-muted-foreground"
            >
              {m.label_custom_title()}
            </Label>
            <Input
              id={customTitleCoordinatesInputId}
              value={customTitle}
              onChange={(e) => onCustomTitleChange(e.target.value)}
              placeholder={location.city}
              aria-labelledby={customTitleCoordinatesLabelId}
              className="border-border bg-card text-foreground"
            />
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
