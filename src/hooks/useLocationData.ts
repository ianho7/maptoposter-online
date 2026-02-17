/**
 * useLocationData Hook
 * Manages location data loading from CDN/IndexDB
 */

import { useEffect, useState, useCallback } from 'react';
import type { Country, State, City } from '@/services/location-types';
import { locationService } from '@/services/location-service';

export interface UseLocationDataResult {
  countries: Country[];
  getStatesByCountry: (countryId: number) => Promise<State[]>;
  getCitiesByState: (stateId: number) => Promise<City[]>;
  getCountryByName: (name: string) => Promise<Country | undefined>;
  getStateByName: (countryId: number, stateName: string) => Promise<State | undefined>;
  getCityByName: (stateId: number, cityName: string) => Promise<City | undefined>;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useLocationData(): UseLocationDataResult {
  const [countries, setCountries] = useState<Country[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await locationService.loadData();
      setCountries(data.countries);
      console.log(`✓ Location data loaded: ${data.countries.length} countries`);
      console.log('isLoading will be set to false');
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      console.error('Failed to load location data:', error);
    } finally {
      setIsLoading(false);
      console.log('isLoading = false');
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await locationService.refreshData();
      setCountries(data.countries);
      console.log('✓ Location data refreshed');
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      console.error('Failed to refresh location data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    countries,
    getStatesByCountry: locationService.getStatesByCountry.bind(locationService),
    getCitiesByState: locationService.getCitiesByState.bind(locationService),
    getCountryByName: locationService.getCountryByName.bind(locationService),
    getStateByName: locationService.getStateByName.bind(locationService),
    getCityByName: locationService.getCityByName.bind(locationService),
    isLoading,
    error,
    refresh,
  };
}
