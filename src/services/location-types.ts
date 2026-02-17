/**
 * Location Data Types
 * Based on country-state-city CDN structure
 */

export interface Country {
  id: number;
  name: string;
  iso2: string;
  iso3: string;
  numeric_code?: string;
  phone_code?: string;
  capital?: string;
  currency_code?: string;
  currency_name?: string;
  tld?: string;
  native?: string;
  region?: string;
  subregion?: string;
  nationality?: string;
  timezones?: string[];
  translations?: Record<string, string>;
  latitude?: number;
  longitude?: number;
  emoji?: string;
  emojiU?: string;
}

export interface State {
  id: number;
  country_id: number;
  name: string;
  iso2: string;
  type?: string;
  latitude?: number;
  longitude?: number;
  countryCode?: string;  // 用于与国家关联
}

export interface City {
  id: number;
  state_id: number;
  country_id: number;
  name: string;
  latitude: number;
  longitude: number;
  countryCode?: string;  // 用于与国家关联
  stateCode?: string;    // 用于与省份关联
}

export interface LocationData {
  countries: Country[];
  states: State[];
  cities: City[];
}

export interface LocationServiceState {
  countries: Country[];
  statesByCountry: Record<number, State[]>;  // countryId -> states[]
  citiesByState: Record<number, City[]>;     // stateId -> cities[]
  lastUpdated: number;
  version: string;
}

export interface CacheMetadata {
  timestamp: number;
  version: string;
  dataVersion?: string;
}
