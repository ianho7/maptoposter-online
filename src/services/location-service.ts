/**
 * Location Service
 * Handles CDN data fetching, IndexDB caching, and data associations
 */

import type {
  Country,
  State,
  City,
  LocationServiceState,
  CacheMetadata,
} from './location-types';

const DB_NAME = 'Map-Poster-DB';
const DB_VERSION = 2;
const STORE_COUNTRIES = 'countries';
const STORE_STATES = 'states';
const STORE_CITIES = 'cities';
const STORE_METADATA = 'metadata';
const CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const CDN_URLS = {
  countries: 'https://cdn.jsdelivr.net/gh/ianho7/location-data-slim@main/countries_slim.json',
  states: 'https://cdn.jsdelivr.net/gh/ianho7/location-data-slim@main/states_slim.json',
  cities: 'https://cdn.jsdelivr.net/gh/ianho7/location-data-slim@main/cities_slim.json',
};

export class LocationService {
  private db: IDBDatabase | null = null;
  private memoryCache: LocationServiceState | null = null;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;
  private loadingPromise: Promise<LocationServiceState> | null = null;  // 加载Promise，用于并发控制

  /**
   * Initialize IndexDB
   */
  async init(): Promise<void> {
    if (this.isInitializing) {
      return this.initPromise!;
    }

    if (this.db) {
      return; // Already initialized
    }

    this.isInitializing = true;
    this.initPromise = this._initDatabase();
    await this.initPromise;
  }

  private _initDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.warn('IndexDB initialization failed:', request.error);
        this.isInitializing = false;
        reject(request.error);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Clear existing stores if they exist to handle schema/data changes
        if (db.objectStoreNames.contains(STORE_COUNTRIES)) db.deleteObjectStore(STORE_COUNTRIES);
        if (db.objectStoreNames.contains(STORE_STATES)) db.deleteObjectStore(STORE_STATES);
        if (db.objectStoreNames.contains(STORE_CITIES)) db.deleteObjectStore(STORE_CITIES);
        if (db.objectStoreNames.contains(STORE_METADATA)) db.deleteObjectStore(STORE_METADATA);

        // Create stores
        db.createObjectStore(STORE_COUNTRIES, { keyPath: 'id' }).createIndex('iso2', 'iso2');
        const stateStore = db.createObjectStore(STORE_STATES, { keyPath: 'id' });
        stateStore.createIndex('country_id', 'country_id');
        const cityStore = db.createObjectStore(STORE_CITIES, { keyPath: 'id' });
        cityStore.createIndex('state_id', 'state_id');
        cityStore.createIndex('country_id', 'country_id');
        db.createObjectStore(STORE_METADATA, { keyPath: 'type' });
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.isInitializing = false;
        resolve();
      };
    });
  }

  /**
   * Load data (from cache or CDN)
   */
  async loadData(): Promise<LocationServiceState> {
    console.log(`[${new Date().toISOString()}] loadData() called`);

    // 1. 如果已有内存缓存，直接返回
    if (this.memoryCache) {
      console.log('✓ Returning from memory cache');
      return this.memoryCache;
    }

    // 2. 如果正在加载中（任何阶段），返回同一个 Promise（并发控制）
    if (this.loadingPromise) {
      console.log('⏳ Data loading already in progress, waiting...');
      return this.loadingPromise;
    }

    // 3. 创建新的加载流程
    console.log('🚀 Starting new data loading flow');
    this.loadingPromise = (async () => {
      try {
        await this.init();

        // 尝试从 IndexDB 加载
        const cachedData = await this._loadFromIndexDB();
        if (cachedData) {
          this.memoryCache = cachedData;
          return cachedData;
        }

        // 从 CDN 获取
        console.log('Fetching location data from CDN...');
        const data = await this._fetchFromCDN();
        await this._saveToIndexDB(data);
        this.memoryCache = data;
        return data;
      } finally {
        // 清理加载状态
        this.loadingPromise = null;
      }
    })();

    return this.loadingPromise;
  }

  /**
   * Refresh data from CDN
   */
  async refreshData(): Promise<LocationServiceState> {
    await this.init();
    console.log('Refreshing location data from CDN...');
    const data = await this._fetchFromCDN();
    await this._saveToIndexDB(data);
    this.memoryCache = data;
    return data;
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

  private _buildIndexes(countries: Country[], states: State[], cities: City[]): {
    statesByCountry: Record<number, State[]>,
    citiesByState: Record<number, City[]>
  } {
    const statesByCountry: Record<number, State[]> = {};
    const citiesByState: Record<number, City[]> = {};

    // Helpers for indexing when IDs are missing from CDN
    const countryIdByIso = new Map(countries.map(c => [c.iso2, c.id]));
    const stateIdByCode = new Map(states.map(s => [`${s.countryCode}-${s.iso2}`, s.id]));

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
      if ((!city.state_id || city.state_id === 0) && (city as any).stateCode && (city as any).countryCode) {
        city.state_id = stateIdByCode.get(`${(city as any).countryCode}-${(city as any).stateCode}`) || 0;
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
      console.log('Downloading countries...');
      const countriesRes = await fetchWithTimeout(CDN_URLS.countries);
      if (!countriesRes.ok) throw new Error(`HTTP ${countriesRes.status}: ${CDN_URLS.countries}`);
      const rawCountries = (await countriesRes.json()) as any[];
      const countries = this._normalizeCountries(rawCountries);

      console.log('Downloading states...');
      const statesRes = await fetchWithTimeout(CDN_URLS.states);
      if (!statesRes.ok) throw new Error(`HTTP ${statesRes.status}: ${CDN_URLS.states}`);
      const rawStates = (await statesRes.json()) as any[];
      const states = this._normalizeStates(rawStates);

      console.log('Downloading cities...');
      const citiesRes = await fetchWithTimeout(CDN_URLS.cities);
      if (!citiesRes.ok) throw new Error(`HTTP ${citiesRes.status}: ${CDN_URLS.cities}`);
      const rawCities = (await citiesRes.json()) as any[];
      const cities = this._normalizeCities(rawCities);

      console.log('Processing and indexing data...');
      const { statesByCountry, citiesByState } = this._buildIndexes(countries, states, cities);

      console.log(`📊 Data parsed: ${countries.length} countries, ${states.length} states, ${cities.length} cities`);

      return {
        countries,
        statesByCountry,
        citiesByState,
        lastUpdated: Date.now(),
        version: '1.0.0',
      };
    } catch (error) {
      console.error('Failed to fetch from CDN:', error);
      throw error;
    }
  }

  /**
   * Normalize country data from CDN
   * CDN格式: {"n":"Afghanistan","i":"AF"}
   */
  private _normalizeCountries(data: any[]): Country[] {
    return data.map((item: any, index: number) => ({
      id: index,  // CDN数据中没有id，使用索引
      name: item.n || '',  // n = 国家名称
      iso2: item.i || '',  // i = ISO2代码
      iso3: '',  // CDN数据中没有
      numeric_code: undefined,
      phone_code: undefined,
      capital: undefined,
      currency_code: undefined,
      currency_name: undefined,
      tld: undefined,
      native: undefined,
      region: undefined,
      subregion: undefined,
      nationality: undefined,
      timezones: undefined,
      translations: undefined,
      latitude: undefined,
      longitude: undefined,
      emoji: undefined,
      emojiU: undefined,
    }));
  }

  /**
   * Normalize state data from CDN
   * CDN格式: {"n":"Canillo","i":"02","c":"AD"}
   */
  private _normalizeStates(data: any[]): State[] {
    return data.map((item: any, index: number) => ({
      id: index,  // CDN数据中没有id，使用索引
      country_id: 0,  // 初始为0，后续在_buildIndexes中通过countryCode关联
      name: item.n || '',  // n = 省份名称
      iso2: item.i || '',  // i = 省份代码
      type: undefined,
      latitude: undefined,
      longitude: undefined,
      countryCode: item.c || '',  // c = 国家代码，用于关联
    }));
  }

  /**
   * Normalize city data from CDN
   * CDN格式: ["Canillo","AD","02"] (数组格式)
   * 数组索引: [0]=城市名, [1]=国家代码, [2]=省份代码
   */
  private _normalizeCities(data: any[]): City[] {
    return data.map((item: any, index: number) => {
      // 处理数组格式的数据
      if (Array.isArray(item)) {
        return {
          id: index,
          state_id: 0,  // 初始为0，后续在_buildIndexes中关联
          country_id: 0,  // 初始为0，后续在_buildIndexes中关联
          name: item[0] || '',  // 数组第一个元素是城市名
          latitude: 0,  // CDN数据中没有坐标
          longitude: 0,
          countryCode: item[1] || '',  // 数组第二个元素是国家代码
          stateCode: item[2] || '',  // 数组第三个元素是省份代码
        };
      }

      // 降级处理：如果不是数组格式，尝试对象格式（兼容性）
      return {
        id: index,
        state_id: 0,
        country_id: 0,
        name: item.name || item.n || '',
        latitude: 0,
        longitude: 0,
        countryCode: item.country_code || item.countryCode || item.c || '',
        stateCode: item.state_code || item.stateCode || item.s || '',
      };
    });
  }

  private async _saveToIndexDB(data: LocationServiceState): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(
        [STORE_COUNTRIES, STORE_STATES, STORE_CITIES, STORE_METADATA],
        'readwrite'
      );

      tx.onerror = () => {
        console.error('IndexDB transaction failed:', tx.error);
        reject(tx.error);
      };

      try {
        // Clear existing data
        tx.objectStore(STORE_COUNTRIES).clear();
        tx.objectStore(STORE_STATES).clear();
        tx.objectStore(STORE_CITIES).clear();

        // Insert countries with error handling
        const countriesStore = tx.objectStore(STORE_COUNTRIES);
        for (const country of data.countries) {
          const request = countriesStore.add(country);
          request.onerror = () => {
            console.error('Error adding country:', country, request.error);
          };
        }

        // Insert states with error handling
        const statesStore = tx.objectStore(STORE_STATES);
        for (const states of Object.values(data.statesByCountry)) {
          for (const state of states) {
            const request = statesStore.add(state);
            request.onerror = () => {
              console.error('Error adding state:', state, request.error);
            };
          }
        }

        // Insert cities with error handling
        const citiesStore = tx.objectStore(STORE_CITIES);
        for (const cities of Object.values(data.citiesByState)) {
          for (const city of cities) {
            const request = citiesStore.add(city);
            request.onerror = () => {
              console.error('Error adding city:', city, request.error);
            };
          }
        }

        // Save metadata
        const metadata: CacheMetadata = {
          timestamp: Date.now(),
          version: data.version,
        };
        tx.objectStore(STORE_METADATA).put({
          type: 'location-cache',
          ...metadata,
        });

        tx.oncomplete = () => {
          console.log('✓ Data saved to IndexDB');
          resolve();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private async _loadFromIndexDB(): Promise<LocationServiceState | null> {
    if (!this.db) return null;

    return new Promise((resolve) => {
      const tx = this.db!.transaction(
        [STORE_COUNTRIES, STORE_STATES, STORE_CITIES, STORE_METADATA],
        'readonly'
      );

      try {
        // Check cache validity
        const metadataReq = tx.objectStore(STORE_METADATA).get('location-cache');
        let isValid = false;
        let metadata: CacheMetadata | undefined;

        metadataReq.onsuccess = () => {
          metadata = metadataReq.result as CacheMetadata | undefined;
          if (metadata && Date.now() - metadata.timestamp < CACHE_DURATION_MS) {
            isValid = true;
          }
        };

        // Create all requests BEFORE transaction completes
        const countriesReq = tx.objectStore(STORE_COUNTRIES).getAll();
        const statesReq = tx.objectStore(STORE_STATES).getAll();
        const citiesReq = tx.objectStore(STORE_CITIES).getAll();

        // Store results
        let countries: Country[] = [];
        let states: State[] = [];
        let cities: City[] = [];

        countriesReq.onsuccess = () => {
          countries = countriesReq.result || [];
        };

        statesReq.onsuccess = () => {
          states = statesReq.result || [];
        };

        citiesReq.onsuccess = () => {
          cities = citiesReq.result || [];
        };

        tx.oncomplete = () => {
          if (!isValid) {
            console.log('Cache expired, will fetch from CDN');
            resolve(null);
            return;
          }

          const { statesByCountry, citiesByState } = this._buildIndexes(countries, states, cities);

          console.log(
            `✓ Data loaded from IndexDB: ${countries.length} countries, ${states.length} states, ${cities.length} cities`
          );

          resolve({
            countries,
            statesByCountry,
            citiesByState,
            lastUpdated: Date.now(),
            version: '1.0.0',
          });
        };

        tx.onerror = () => {
          console.warn('IndexDB read failed:', tx.error);
          resolve(null);
        };
      } catch (error) {
        console.warn('Error reading from IndexDB:', error);
        resolve(null);
      }
    });
  }

  /**
   * Clear cache
   */
  async clearCache(): Promise<void> {
    // 清除内存缓存和加载状态
    this.memoryCache = null;
    this.loadingPromise = null;

    if (!this.db) {
      console.log('IndexDB not initialized, only cleared memory cache');
      return;
    }

    return new Promise((resolve) => {
      const tx = this.db!.transaction(
        [STORE_COUNTRIES, STORE_STATES, STORE_CITIES, STORE_METADATA],
        'readwrite'
      );

      tx.objectStore(STORE_COUNTRIES).clear();
      tx.objectStore(STORE_STATES).clear();
      tx.objectStore(STORE_CITIES).clear();
      tx.objectStore(STORE_METADATA).clear();

      tx.oncomplete = () => {
        console.log('✓ All caches cleared (memory + IndexDB)');
        resolve();
      };

      tx.onerror = () => {
        console.error('Error clearing cache:', tx.error);
        resolve();
      };
    });
  }
}

// Singleton instance
export const locationService = new LocationService();
