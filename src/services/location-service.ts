/**
 * Location Service
 * Loads location data from jsdelivr CDN
 * Uses compressed field names: i(id), n(name), i2(iso2), c(countryCode), s(stateCode), la(latitude), lo(longitude), si(stateId)
 */

import type { Country, State, City, LocationServiceState } from "./location-types";

const CDN_BASE = "https://cdn.jsdelivr.net/gh/ianho7/location-data-slim@8ef462b877208e600635b9dc8aef404ca02e1fa1";

const DATA_URLS = {
  countries: `${CDN_BASE}/countries.json`,
  states: (iso2: string) => `${CDN_BASE}/states-${iso2.toLowerCase()}.json`,
  cities: (countryIso2: string) => `${CDN_BASE}/cities-${countryIso2.toLowerCase()}.json`,
};

interface RawCountry {
  i: number;
  n: string;
  i2: string;
}

interface RawState {
  i: number;
  n: string;
  i2: string;
  c: string;
}

interface RawCity {
  i: number;
  n: string;
  la: string;
  lo: string;
  si: number;
  s: string;
  c: string;
}

export class LocationService {
  private memoryCache: LocationServiceState | null = null;
  private loadingPromise: Promise<LocationServiceState> | null = null;

  // Cache for lazy-loaded data
  private statesCache: Record<string, State[]> = {};
  private citiesCache: Record<string, City[]> = {};
  private countriesMap: Map<number, Country> = new Map();
  // New: Map stateId to countryIso2 for quick lookup
  private stateCountryMap: Map<number, string> = new Map();

  /**
   * Load data from jsdelivr CDN
   */
  async loadData(): Promise<LocationServiceState> {
    console.log(`[${new Date().toISOString()}] loadData() called`);

    // 1. 如果已有内存缓存，直接返回
    if (this.memoryCache) {
      console.log("✓ Returning from memory cache");
      return this.memoryCache;
    }

    // 2. 如果正在加载中，返回同一个 Promise（并发控制）
    if (this.loadingPromise) {
      console.log("⏳ Data loading already in progress, waiting...");
      return this.loadingPromise;
    }

    // 3. 创建新的加载流程
    console.log("🚀 Starting new data loading flow");
    this.loadingPromise = (async () => {
      const data = await this._fetchFromCDN();
      this.memoryCache = data;
      return data;
    })();

    return this.loadingPromise;
  }

  /**
   * Refresh data (clear cache and reload)
   */
  async refreshData(): Promise<LocationServiceState> {
    this.memoryCache = null;
    this.loadingPromise = null;
    this.statesCache = {};
    this.citiesCache = {};
    this.countriesMap = new Map();
    this.stateCountryMap = new Map();
    return this.loadData();
  }

  /**
   * Get countries list
   */
  async getCountries(): Promise<Country[]> {
    const data = await this.loadData();
    return data.countries;
  }

  /**
   * Get states by country ID
   */
  async getStatesByCountry(countryId: number): Promise<State[]> {
    const data = await this.loadData();

    // Build countries map for quick lookup
    if (this.countriesMap.size === 0) {
      data.countries.forEach((c) => this.countriesMap.set(c.id, c));
    }

    const country = this.countriesMap.get(countryId);
    if (!country) return [];

    const iso2 = country.iso2;

    // Return from cache if available
    if (this.statesCache[iso2]) {
      return this.statesCache[iso2];
    }

    // Try to fetch from CDN
    try {
      const response = await fetch(DATA_URLS.states(iso2));
      if (response.ok) {
        const rawStates: RawState[] = await response.json();
        const states: State[] = rawStates.map((s) => ({
          id: s.i,
          name: s.n,
          iso2: s.i2,
          countryCode: s.c,
          country_id: countryId,
        }));

        // Cache states and build stateId -> countryIso2 mapping
        this.statesCache[iso2] = states;
        states.forEach((s) => {
          this.stateCountryMap.set(s.id, iso2);
        });

        return states;
      }
    } catch (err) {
      console.error(`Failed to load states for ${iso2}:`, err);
    }

    return [];
  }

  /**
   * Get cities by state ID
   */
  async getCitiesByState(stateId: number): Promise<City[]> {
    const data = await this.loadData();

    // Build countries map for quick lookup (only if needed)
    if (this.countriesMap.size === 0) {
      data.countries.forEach((c) => this.countriesMap.set(c.id, c));
    }

    // Quick lookup: find countryIso2 from stateId
    let targetCountryIso2: string | undefined;

    // First check if we already have the mapping
    if (this.stateCountryMap.has(stateId)) {
      targetCountryIso2 = this.stateCountryMap.get(stateId);
    } else {
      // If not, we need to load the correct country's states
      // Find the country first by checking all loaded states caches
      for (const [iso2, states] of Object.entries(this.statesCache)) {
        const state = states.find((s) => s.id === stateId);
        if (state) {
          targetCountryIso2 = iso2;
          break;
        }
      }
    }

    // If still not found, we need to find which country this state belongs to
    // This should rarely happen if getStatesByCountry was called first
    if (!targetCountryIso2) {
      console.warn(`State ${stateId} country not found, may need to call getStatesByCountry first`);
      return [];
    }

    // Return from cities cache if available
    if (this.citiesCache[targetCountryIso2]) {
      return this.citiesCache[targetCountryIso2].filter((c) => c.state_id === stateId);
    }

    // Fetch cities for this country
    try {
      const response = await fetch(DATA_URLS.cities(targetCountryIso2));
      if (response.ok) {
        const rawCities: RawCity[] = await response.json();
        const cities: City[] = rawCities.map((c) => ({
          id: c.i,
          name: c.n,
          latitude: parseFloat(c.la) || 0,
          longitude: parseFloat(c.lo) || 0,
          state_id: c.si,
          country_id: 0,
          countryCode: c.c,
          stateCode: c.s,
        }));

        this.citiesCache[targetCountryIso2] = cities;
        return cities.filter((c) => c.state_id === stateId);
      }
    } catch (err) {
      console.error(`Failed to load cities for ${targetCountryIso2}:`, err);
    }

    return [];
  }

  /**
   * Find country by name
   */
  async getCountryByName(name: string): Promise<Country | undefined> {
    const countries = await this.getCountries();
    return countries.find((c) => c.name.toLowerCase() === name.toLowerCase());
  }

  /**
   * Find state by country and state name
   */
  async getStateByName(countryId: number, stateName: string): Promise<State | undefined> {
    const states = await this.getStatesByCountry(countryId);
    return states.find((s) => s.name.toLowerCase() === stateName.toLowerCase());
  }

  /**
   * Find city by state and city name
   */
  async getCityByName(stateId: number, cityName: string): Promise<City | undefined> {
    const cities = await this.getCitiesByState(stateId);
    return cities.find((c) => c.name.toLowerCase() === cityName.toLowerCase());
  }

  private async _fetchFromCDN(): Promise<LocationServiceState> {
    try {
      console.log("Fetching countries from CDN...");

      const response = await fetch(DATA_URLS.countries);
      if (!response.ok) {
        throw new Error(`Failed to fetch countries: ${response.status}`);
      }

      const rawCountries: RawCountry[] = await response.json();
      const countries: Country[] = rawCountries.map((c) => ({
        id: c.i,
        name: c.n,
        iso2: c.i2,
      }));

      console.log(`✓ Loaded ${countries.length} countries`);

      // Build initial index structures
      const statesByCountry: Record<string, State[]> = {};
      const citiesByState: Record<string, Record<string, City[]>> = {};

      return {
        countries,
        statesByCountry,
        citiesByState,
        lastUpdated: Date.now(),
        version: "2.0.0",
      };
    } catch (error) {
      console.error("Failed to load from CDN:", error);
      throw error;
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.memoryCache = null;
    this.loadingPromise = null;
    this.statesCache = {};
    this.citiesCache = {};
    this.countriesMap = new Map();
    this.stateCountryMap = new Map();
  }
}

// Singleton instance
export const locationService = new LocationService();
