'use client';

import { useState, useEffect } from 'react';
import type { Location } from '@/lib/types';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface LocationSelectorProps {
  location: Location;
  onChange: (location: Location) => void;
}

// Sample data - in production this would come from an API
const COUNTRIES = [
  { name: 'China', code: 'CN' },
  { name: 'United States', code: 'US' },
  { name: 'France', code: 'FR' },
  { name: 'Japan', code: 'JP' },
  { name: 'United Kingdom', code: 'GB' },
  { name: 'Italy', code: 'IT' },
  { name: 'Germany', code: 'DE' },
  { name: 'Spain', code: 'ES' },
  { name: 'Australia', code: 'AU' },
  { name: 'Canada', code: 'CA' },
];

const STATES: Record<string, { name: string; cities: { name: string; lat: number; lng: number }[] }[]> = {
  'China': [
    { name: 'Beijing', cities: [{ name: 'Beijing', lat: 39.9042, lng: 116.4074 }] },
    { name: 'Shanghai', cities: [{ name: 'Shanghai', lat: 31.2304, lng: 121.4737 }] },
    { name: 'Guangdong', cities: [{ name: 'Guangzhou', lat: 23.1291, lng: 113.2644 }, { name: 'Shenzhen', lat: 22.5431, lng: 114.0579 }] },
    { name: 'Zhejiang', cities: [{ name: 'Hangzhou', lat: 30.2741, lng: 120.1551 }] },
    { name: 'Sichuan', cities: [{ name: 'Chengdu', lat: 30.5728, lng: 104.0668 }] },
  ],
  'United States': [
    { name: 'New York', cities: [{ name: 'New York City', lat: 40.7128, lng: -74.0060 }] },
    { name: 'California', cities: [{ name: 'Los Angeles', lat: 34.0522, lng: -118.2437 }, { name: 'San Francisco', lat: 37.7749, lng: -122.4194 }] },
    { name: 'Illinois', cities: [{ name: 'Chicago', lat: 41.8781, lng: -87.6298 }] },
    { name: 'Texas', cities: [{ name: 'Houston', lat: 29.7604, lng: -95.3698 }, { name: 'Austin', lat: 30.2672, lng: -97.7431 }] },
  ],
  'France': [
    { name: 'Ile-de-France', cities: [{ name: 'Paris', lat: 48.8566, lng: 2.3522 }] },
    { name: 'Provence-Alpes-Cote d\'Azur', cities: [{ name: 'Marseille', lat: 43.2965, lng: 5.3698 }, { name: 'Nice', lat: 43.7102, lng: 7.2620 }] },
    { name: 'Auvergne-Rhone-Alpes', cities: [{ name: 'Lyon', lat: 45.7640, lng: 4.8357 }] },
  ],
  'Japan': [
    { name: 'Tokyo', cities: [{ name: 'Tokyo', lat: 35.6762, lng: 139.6503 }] },
    { name: 'Osaka', cities: [{ name: 'Osaka', lat: 34.6937, lng: 135.5023 }] },
    { name: 'Kyoto', cities: [{ name: 'Kyoto', lat: 35.0116, lng: 135.7681 }] },
  ],
  'United Kingdom': [
    { name: 'England', cities: [{ name: 'London', lat: 51.5074, lng: -0.1278 }, { name: 'Manchester', lat: 53.4808, lng: -2.2426 }] },
    { name: 'Scotland', cities: [{ name: 'Edinburgh', lat: 55.9533, lng: -3.1883 }] },
  ],
  'Italy': [
    { name: 'Lazio', cities: [{ name: 'Rome', lat: 41.9028, lng: 12.4964 }] },
    { name: 'Lombardy', cities: [{ name: 'Milan', lat: 45.4642, lng: 9.1900 }] },
    { name: 'Tuscany', cities: [{ name: 'Florence', lat: 43.7696, lng: 11.2558 }] },
    { name: 'Veneto', cities: [{ name: 'Venice', lat: 45.4408, lng: 12.3155 }] },
  ],
  'Germany': [
    { name: 'Berlin', cities: [{ name: 'Berlin', lat: 52.5200, lng: 13.4050 }] },
    { name: 'Bavaria', cities: [{ name: 'Munich', lat: 48.1351, lng: 11.5820 }] },
    { name: 'Hamburg', cities: [{ name: 'Hamburg', lat: 53.5511, lng: 9.9937 }] },
  ],
  'Spain': [
    { name: 'Madrid', cities: [{ name: 'Madrid', lat: 40.4168, lng: -3.7038 }] },
    { name: 'Catalonia', cities: [{ name: 'Barcelona', lat: 41.3851, lng: 2.1734 }] },
    { name: 'Andalusia', cities: [{ name: 'Seville', lat: 37.3891, lng: -5.9845 }] },
  ],
  'Australia': [
    { name: 'New South Wales', cities: [{ name: 'Sydney', lat: -33.8688, lng: 151.2093 }] },
    { name: 'Victoria', cities: [{ name: 'Melbourne', lat: -37.8136, lng: 144.9631 }] },
  ],
  'Canada': [
    { name: 'Ontario', cities: [{ name: 'Toronto', lat: 43.6532, lng: -79.3832 }] },
    { name: 'British Columbia', cities: [{ name: 'Vancouver', lat: 49.2827, lng: -123.1207 }] },
    { name: 'Quebec', cities: [{ name: 'Montreal', lat: 45.5017, lng: -73.5673 }] },
  ],
};

export function LocationSelector({ location, onChange }: LocationSelectorProps) {
  const [states, setStates] = useState<typeof STATES[string]>([]);
  const [cities, setCities] = useState<{ name: string; lat: number; lng: number }[]>([]);

  useEffect(() => {
    if (location.country && STATES[location.country]) {
      setStates(STATES[location.country]);
    } else {
      setStates([]);
    }
  }, [location.country]);

  useEffect(() => {
    const stateData = states.find(s => s.name === location.state);
    if (stateData) {
      setCities(stateData.cities);
    } else {
      setCities([]);
    }
  }, [location.state, states]);

  const handleCountryChange = (country: string) => {
    onChange({ ...location, country, state: '', city: '', lat: undefined, lng: undefined });
  };

  const handleStateChange = (state: string) => {
    onChange({ ...location, state, city: '', lat: undefined, lng: undefined });
  };

  const handleCityChange = (cityName: string) => {
    const cityData = cities.find(c => c.name === cityName);
    if (cityData) {
      onChange({ 
        ...location, 
        city: cityName, 
        lat: cityData.lat, 
        lng: cityData.lng 
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Country</Label>
        <Select value={location.country} onValueChange={handleCountryChange}>
          <SelectTrigger className="bg-card/50 border-border/50">
            <SelectValue placeholder="Select country" />
          </SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((country) => (
              <SelectItem key={country.code} value={country.name}>
                {country.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider">State / Province</Label>
        <Select 
          value={location.state} 
          onValueChange={handleStateChange}
          disabled={states.length === 0}
        >
          <SelectTrigger className="bg-card/50 border-border/50">
            <SelectValue placeholder="Select state" />
          </SelectTrigger>
          <SelectContent>
            {states.map((state) => (
              <SelectItem key={state.name} value={state.name}>
                {state.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider">City</Label>
        <Select 
          value={location.city} 
          onValueChange={handleCityChange}
          disabled={cities.length === 0}
        >
          <SelectTrigger className="bg-card/50 border-border/50">
            <SelectValue placeholder="Select city" />
          </SelectTrigger>
          <SelectContent>
            {cities.map((city) => (
              <SelectItem key={city.name} value={city.name}>
                {city.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Manual coordinate input */}
      <div className="pt-2 border-t border-border/30">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
          Or enter coordinates manually
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Latitude</Label>
            <Input
              type="number"
              step="0.0001"
              value={location.lat || ''}
              onChange={(e) => onChange({ ...location, lat: parseFloat(e.target.value) || undefined })}
              placeholder="e.g. 48.8566"
              className="h-8 text-xs bg-card/50"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Longitude</Label>
            <Input
              type="number"
              step="0.0001"
              value={location.lng || ''}
              onChange={(e) => onChange({ ...location, lng: parseFloat(e.target.value) || undefined })}
              placeholder="e.g. 2.3522"
              className="h-8 text-xs bg-card/50"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
