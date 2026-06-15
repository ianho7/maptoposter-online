/**
 * Reverse Geocoding Service
 * Uses Nominatim /reverse API to resolve lat/lng to address details
 */

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const USER_AGENT = "MapToPoster/1.0";

export interface ReverseGeocodeAddress {
  country: string;
  countryCode: string;
  state: string;
  city: string;
  /** Typically a county/district level */
  county: string;
  /** Suburb / neighbourhood */
  suburb: string;
  municipality: string;
  town: string;
  village: string;
  /** ISO 3166-2 region code, e.g. "CN-BJ" for Beijing */
  iso3166_2_lvl4?: string;
  quarter: string;
}

export interface ReverseGeocodeResult {
  lat: string;
  lon: string;
  displayName: string;
  address: ReverseGeocodeAddress;
}

// Nominatim rate limit: 1 req/s
let lastNominatimCall = 0;

/**
 * Reverse geocode coordinates using Nominatim's /reverse endpoint.
 * Rate-limited to 1 request per second.
 */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<ReverseGeocodeResult | null> {
  // Rate limiting
  const now = Date.now();
  const elapsed = now - lastNominatimCall;
  if (elapsed < 1000) {
    await new Promise((r) => setTimeout(r, 1000 - elapsed));
  }

  try {
    const url = `${NOMINATIM_BASE}/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
    lastNominatimCall = Date.now();
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "en", // CDN 级联数据为英文名，要求 Nominatim 返回英文
      },
    });
    if (!res.ok) return null;

    const data = await res.json();
    if (!data || data.error) return null;

    const addr = data.address || {};
    return {
      lat: data.lat,
      lon: data.lon,
      displayName: data.display_name,
      address: {
        country: addr.country || "",
        countryCode: addr.country_code || "",
        state: addr.state || "",
        city: addr.city || addr.town || addr.village || addr.county || "",
        county: addr.county || "",
        suburb: addr.suburb || "",
        municipality: addr.municipality || "",
        town: addr.town || "",
        village: addr.village || "",
        iso3166_2_lvl4: addr["ISO3166-2-lvl4"] as string | undefined,
        quarter: addr.quarter || "",
      },
    };
  } catch (err) {
    console.error("Reverse geocoding failed:", err);
    return null;
  }
}
