import type { PoiSearchProvider } from "@/lib/types";

export function getDefaultPoiSearchProvider(countryIso2: string): PoiSearchProvider {
  return countryIso2.trim().toUpperCase() === "CN" ? "amap" : "nominatim";
}

export function createNamespacedPoiSourceId(provider: PoiSearchProvider, id: string) {
  return `${provider}:${id}`;
}
