/**
 * Location Service
 * Handles CDN data fetching and data associations
 */

import type { Country, State, City, LocationServiceState } from "./location-types";

const CDN_URLS = {
  countries: "https://cdn.jsdelivr.net/gh/ianho7/location-data-slim@main/countries_slim.json",
  states: "https://cdn.jsdelivr.net/gh/ianho7/location-data-slim@main/states_slim.json",
  cities: "https://cdn.jsdelivr.net/gh/ianho7/location-data-slim@main/cities_slim.json",
};

export class LocationService {
  private memoryCache: LocationServiceState | null = null;
  private loadingPromise: Promise<LocationServiceState> | null = null;

  /**
   * Load data (from CDN, using browser HTTP cache)
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
   * Refresh data from CDN (bypass browser cache)
   */
  async refreshData(): Promise<LocationServiceState> {
    this.memoryCache = null;
    this.loadingPromise = null;
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
    return data.statesByCountry[countryId] || [];
  }

  /**
   * Get cities by state ID
   */
  async getCitiesByState(stateId: number): Promise<City[]> {
    const data = await this.loadData();
    return data.citiesByState[stateId] || [];
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

  private _buildIndexes(
    countries: Country[],
    states: State[],
    cities: City[]
  ): {
    statesByCountry: Record<number, State[]>;
    citiesByState: Record<number, City[]>;
  } {
    const statesByCountry: Record<number, State[]> = {};
    const citiesByState: Record<number, City[]> = {};

    // Helpers for indexing when IDs are missing from CDN
    const countryIdByIso = new Map(countries.map((c) => [c.iso2, c.id]));
    const stateIdByCode = new Map(states.map((s) => [`${s.countryCode}-${s.iso2}`, s.id]));

    for (const state of states) {
      // If country_id is missing, try to find it via countryCode (iso2)
      if ((!state.country_id || state.country_id === 0) && (state as any).countryCode) {
        state.country_id = countryIdByIso.get((state as any).countryCode) || 0;
      }

      if (!statesByCountry[state.country_id]) {
        statesByCountry[state.country_id] = [];
      }
      statesByCountry[state.country_id].push(state);
    }

    for (const city of cities) {
      // If state_id is missing, try to find it via stateCode + countryCode
      if (
        (!city.state_id || city.state_id === 0) &&
        (city as any).stateCode &&
        (city as any).countryCode
      ) {
        city.state_id =
          stateIdByCode.get(`${(city as any).countryCode}-${(city as any).stateCode}`) || 0;
      }
      // If country_id is missing
      if ((!city.country_id || city.country_id === 0) && (city as any).countryCode) {
        city.country_id = countryIdByIso.get((city as any).countryCode) || 0;
      }

      if (!citiesByState[city.state_id]) {
        citiesByState[city.state_id] = [];
      }
      citiesByState[city.state_id].push(city);
    }

    return { statesByCountry, citiesByState };
  }

  private async _fetchFromCDN(): Promise<LocationServiceState> {
    const timeout = 10000; // 10 seconds timeout

    const fetchWithTimeout = (url: string) =>
      Promise.race([
        fetch(url),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Fetch timeout: ${url}`)), timeout)
        ),
      ]);

    try {
      // 并行下载所有数据
      console.log("Downloading countries, states, cities in parallel...");
      const [countriesRes, statesRes, citiesRes] = await Promise.all([
        fetchWithTimeout(CDN_URLS.countries),
        fetchWithTimeout(CDN_URLS.states),
        fetchWithTimeout(CDN_URLS.cities),
      ]);

      if (!countriesRes.ok) throw new Error(`HTTP ${countriesRes.status}: ${CDN_URLS.countries}`);
      if (!statesRes.ok) throw new Error(`HTTP ${statesRes.status}: ${CDN_URLS.states}`);
      if (!citiesRes.ok) throw new Error(`HTTP ${citiesRes.status}: ${CDN_URLS.cities}`);

      // 并行解析 JSON
      console.log("Parsing JSON data...");
      const [rawCountries, rawStates, rawCities] = await Promise.all([
        countriesRes.json(),
        statesRes.json(),
        citiesRes.json(),
      ]);

      const countries = this._normalizeCountries(rawCountries);
      const states = this._normalizeStates(rawStates);
      const cities = this._normalizeCities(rawCities);

      console.log("Processing and indexing data...");
      const { statesByCountry, citiesByState } = this._buildIndexes(countries, states, cities);

      console.log(
        `📊 Data parsed: ${countries.length} countries, ${states.length} states, ${cities.length} cities`
      );

      return {
        countries,
        statesByCountry,
        citiesByState,
        lastUpdated: Date.now(),
        version: "1.0.0",
      };
    } catch (error) {
      console.error("Failed to fetch from CDN:", error);
      throw error;
    }
  }

  /**
   * Normalize country data from CDN
   * CDN格式: {"n":"Afghanistan","i":"AF"}
   */
  private _normalizeCountries(data: any[]): Country[] {
    return data.map((item: any, index: number) => ({
      id: index,
      name: item.n || "",
      iso2: item.i || "",
    }));
  }

  /**
   * Normalize state data from CDN
   * CDN格式: {"n":"Canillo","i":"02","c":"AD"}
   */
  private _normalizeStates(data: any[]): State[] {
    return data.map((item: any, index: number) => ({
      id: index,
      country_id: 0,
      name: item.n || "",
      iso2: item.i || "",
      countryCode: item.c || "",
    }));
  }

  /**
   * Normalize city data from CDN
   * CDN格式: ["Canillo","AD","02"] (数组格式)
   */
  private _normalizeCities(data: any[]): City[] {
    return data.map((item: any, index: number) => {
      if (Array.isArray(item)) {
        return {
          id: index,
          state_id: 0,
          country_id: 0,
          name: item[0] || "",
          latitude: 0,
          longitude: 0,
          countryCode: item[1] || "",
          stateCode: item[2] || "",
        };
      }

      return {
        id: index,
        state_id: 0,
        country_id: 0,
        name: item.name || item.n || "",
        latitude: 0,
        longitude: 0,
        countryCode: item.country_code || item.countryCode || item.c || "",
        stateCode: item.state_code || item.stateCode || item.s || "",
      };
    });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.memoryCache = null;
    this.loadingPromise = null;
  }
}

// Singleton instance
export const locationService = new LocationService();
