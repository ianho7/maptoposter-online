import type { Location } from "@/lib/types";
import type { City, State } from "@/services/location-types";

export interface ResolvedLocationDraft {
  country: string;
  state: string;
  city: string;
  district: string;
  coordinates?: { lat: number; lng: number };
}

export interface CityResolutionContext {
  requestedCityName: string;
  state: Pick<State, "id" | "name" | "iso2"> | null;
  stateCities: City[];
}

export interface StandaloneRegionFallback {
  city: string;
  lat: number;
  lng: number;
}

export interface CityResolutionResult {
  resolvedCityName: string;
  coordinates: { lat: number; lng: number } | null;
  usedFallback: boolean;
}

export function coalesceCoordinates(
  primary: { lat: number; lng: number } | null,
  fallback: Pick<Location, "lat" | "lng"> | null | undefined
): { lat: number; lng: number } | undefined {
  if (primary) return primary;

  if (typeof fallback?.lat === "number" && typeof fallback?.lng === "number") {
    return { lat: fallback.lat, lng: fallback.lng };
  }

  return undefined;
}

function parseCoordinate(value: number | string | undefined): number | null {
  const parsed = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseCityCoordinates(city: City | undefined): { lat: number; lng: number } | null {
  if (!city) return null;

  const lat = parseCoordinate(city.latitude);
  const lng = parseCoordinate(city.longitude);
  if (lat === null || lng === null) return null;

  return { lat, lng };
}

export function normalizeLocationName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function namesReferToSameLocation(first: string, second: string): boolean {
  const normalizedFirst = normalizeLocationName(first);
  const normalizedSecond = normalizeLocationName(second);
  if (!normalizedFirst || !normalizedSecond) return false;

  return (
    normalizedFirst === normalizedSecond ||
    normalizedFirst.includes(normalizedSecond) ||
    normalizedSecond.includes(normalizedFirst)
  );
}

function findExactCityMatch(cities: City[], requestedCityName: string): City | undefined {
  return cities.find((city) => city.name.toLowerCase() === requestedCityName.toLowerCase());
}

function findRestrictedBrokenDataMatch(
  cities: City[],
  requestedCityName: string,
  state: Pick<State, "name" | "iso2"> | null
): City | undefined {
  if (!state) return undefined;

  const normalizedRequested = normalizeLocationName(requestedCityName);
  const normalizedState = normalizeLocationName(state.name);
  const stateIso = state.iso2.toUpperCase();

  return cities.find((city) => {
    const cityCoordinates = parseCityCoordinates(city);
    if (!cityCoordinates) return false;

    const normalizedCity = normalizeLocationName(city.name);
    if (normalizedCity !== normalizedRequested) return false;

    // Narrow fallback for broken hierarchies such as Ireland/Dublin where the
    // city exists in the same country but is attached to a different state_id.
    if (normalizedRequested && normalizedRequested === normalizedState) {
      return true;
    }

    return Boolean(stateIso && city.stateCode?.toUpperCase() === stateIso);
  });
}

export function resolveCitySelection(
  context: CityResolutionContext,
  standaloneFallback: StandaloneRegionFallback | null
): CityResolutionResult {
  const exactCity = findExactCityMatch(context.stateCities, context.requestedCityName);
  if (exactCity) {
    return {
      resolvedCityName: exactCity.name,
      coordinates: parseCityCoordinates(exactCity),
      usedFallback: false,
    };
  }

  const restrictedFallback = findRestrictedBrokenDataMatch(
    context.stateCities,
    context.requestedCityName,
    context.state
  );
  if (restrictedFallback) {
    return {
      resolvedCityName: restrictedFallback.name,
      coordinates: parseCityCoordinates(restrictedFallback),
      usedFallback: true,
    };
  }

  if (standaloneFallback) {
    return {
      resolvedCityName: standaloneFallback.city,
      coordinates: { lat: standaloneFallback.lat, lng: standaloneFallback.lng },
      usedFallback: true,
    };
  }

  return {
    resolvedCityName: context.requestedCityName,
    coordinates: null,
    usedFallback: false,
  };
}

export function buildResolvedLocation({
  country,
  state,
  city,
  district,
  coordinates,
}: ResolvedLocationDraft): Location {
  return {
    country,
    state,
    city,
    district,
    ...(coordinates ? coordinates : {}),
  };
}
