interface Env {
  NOMINATIM_RATE_LIMITER: DurableObjectNamespace;
  NOMINATIM_USER_AGENT: string;
}

interface NominatimPlace {
  place_id?: number;
  osm_type?: string;
  osm_id?: number;
  name?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: Record<string, string>;
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 160;
const CACHE_TTL_SECONDS = 60 * 60 * 24;

function json(body: unknown, status = 200, extraHeaders: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${CACHE_TTL_SECONDS}`,
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function invalid(message: string) {
  return json({ message }, 400, { "cache-control": "no-store" });
}

function normaliseLanguage(value: string | null) {
  return (value || "en").trim().slice(0, 32);
}

function normaliseCountryCode(value: string | null) {
  const code = (value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : "";
}

function mapPlace(place: NominatimPlace) {
  const lat = Number(place.lat);
  const lng = Number(place.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const address = place.address || {};
  const id = place.osm_type && place.osm_id ? `${place.osm_type}${place.osm_id}` : String(place.place_id || "");
  if (!id) return null;
  return {
    id,
    name: place.name || place.display_name?.split(",")[0]?.trim() || "Unnamed place",
    address: place.display_name || "",
    lat,
    lng,
    city: address.city || address.town || address.village || address.municipality || "",
    district: address.suburb || address.city_district || address.county || "",
  };
}

export class NominatimRateLimiter {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(): Promise<Response> {
    const lastRequestAt = (await this.state.storage.get<number>("lastRequestAt")) || 0;
    const waitMs = Math.max(0, lastRequestAt + 1_000 - Date.now());
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    await this.state.storage.put("lastRequestAt", Date.now());
    return new Response(null, { status: 204 });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (request.method !== "GET") return json({ message: "Method not allowed" }, 405, { "cache-control": "no-store" });

    const requestUrl = new URL(request.url);
    if (requestUrl.pathname !== "/search") return json({ message: "Not found" }, 404, { "cache-control": "no-store" });
    if (!env.NOMINATIM_USER_AGENT?.trim()) {
      return json({ message: "Nominatim proxy is not configured" }, 503, { "cache-control": "no-store" });
    }

    const allowedParameters = new Set(["q", "city", "country", "countryCode", "language"]);
    if (Array.from(requestUrl.searchParams.keys()).some((name) => !allowedParameters.has(name))) {
      return invalid("Unsupported search parameter");
    }
    const query = requestUrl.searchParams.get("q")?.trim() || "";
    const city = requestUrl.searchParams.get("city")?.trim() || "";
    const country = requestUrl.searchParams.get("country")?.trim() || "";
    const countryCode = normaliseCountryCode(requestUrl.searchParams.get("countryCode"));
    const language = normaliseLanguage(requestUrl.searchParams.get("language"));
    if (query.length < MIN_QUERY_LENGTH) return invalid("Search query must contain at least two characters");
    if (query.length > MAX_QUERY_LENGTH) return invalid("Search query is too long");
    if (!countryCode) return invalid("A valid ISO 3166-1 alpha-2 country code is required");

    const cache = caches.default;
    const cacheKey = new Request(requestUrl.toString());
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const rateLimiter = env.NOMINATIM_RATE_LIMITER.get(env.NOMINATIM_RATE_LIMITER.idFromName("public-nominatim"));
    await rateLimiter.fetch("https://rate-limiter/permit");

    const upstream = new URL("https://nominatim.openstreetmap.org/search");
    upstream.searchParams.set("format", "jsonv2");
    upstream.searchParams.set("addressdetails", "1");
    upstream.searchParams.set("limit", "10");
    upstream.searchParams.set("countrycodes", countryCode.toLowerCase());
    upstream.searchParams.set("accept-language", language);
    upstream.searchParams.set("q", [query, city, country].filter(Boolean).join(", "));

    let response: Response;
    try {
      response = await fetch(upstream, {
        headers: { accept: "application/json", "user-agent": env.NOMINATIM_USER_AGENT },
      });
    } catch {
      return json({ message: "Place search is temporarily unavailable" }, 502, { "cache-control": "no-store" });
    }
    if (!response.ok) {
      return json({ message: "Place search is temporarily unavailable" }, response.status === 429 ? 429 : 502, { "cache-control": "no-store" });
    }

    const payload: unknown = await response.json();
    const results = Array.isArray(payload)
      ? payload
          .filter((place): place is NominatimPlace => Boolean(place) && typeof place === "object")
          .map(mapPlace)
          .filter((place): place is NonNullable<typeof place> => place !== null)
      : [];
    const result = json({ results });
    await cache.put(cacheKey, result.clone());
    return result;
  },
};
