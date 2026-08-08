import { OVERPASS_RACE_SERVERS } from "./overpass-client/config";

export interface HighlightedRoadResult {
  geojson: GeoJSON.FeatureCollection;
  bbox: [number, number, number, number] | null;
}

export async function fetchHighlightedRoad(
  roadName: string,
  centerLat: number,
  centerLon: number,
  radiusMeters: number
): Promise<HighlightedRoadResult> {
  const degPerMeter = 1 / 111320;
  const latDelta = radiusMeters * degPerMeter;
  const lonDelta = radiusMeters * degPerMeter / Math.cos(centerLat * Math.PI / 180);
  const south = centerLat - latDelta;
  const north = centerLat + latDelta;
  const west = centerLon - lonDelta;
  const east = centerLon + lonDelta;
  const bbox = `${south},${west},${north},${east}`;

  const query = `[out:json][timeout:30];(way["name"="${roadName}"](${bbox});way["name:zh"="${roadName}"](${bbox});way["name:en"="${roadName}"](${bbox}););out geom;`;

  const servers = [...OVERPASS_RACE_SERVERS];
  let lastError: Error | null = null;

  for (const server of servers) {
    try {
      const interpreterUrl = `${server.replace(/\/+$/, "")}/interpreter`;
      const res = await fetch(interpreterUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) {
        lastError = new Error(`Overpass ${res.status}: ${res.statusText}`);
        continue;
      }
      const json = await res.json();
      return parseOverpassToGeoJSON(json);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  throw lastError ?? new Error("All Overpass servers failed");
}

function parseOverpassToGeoJSON(
  data: { elements: Array<{ type: string; geometry?: Array<{ lat: number; lon: number }>; tags?: Record<string, string> }> }
): HighlightedRoadResult {
  const features: GeoJSON.Feature[] = [];
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;

  for (const el of data.elements) {
    if (el.type !== "way" || !el.geometry || el.geometry.length < 2) continue;

    const coords: [number, number][] = el.geometry.map((p) => {
      if (p.lon < minLon) minLon = p.lon;
      if (p.lon > maxLon) maxLon = p.lon;
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      return [p.lon, p.lat];
    });

    features.push({
      type: "Feature",
      properties: { highway: "highlighted" },
      geometry: { type: "LineString", coordinates: coords },
    });
  }

  const bbox: [number, number, number, number] | null =
    features.length > 0 ? [minLon, minLat, maxLon, maxLat] : null;

  return {
    geojson: { type: "FeatureCollection", features },
    bbox,
  };
}

const HIGHLIGHTED_TYPE = 6;

export function flattenHighlightedRoads(
  geojson: GeoJSON.FeatureCollection
): Float64Array {
  const segments: Array<{ coords: number[][] }> = [];

  for (const feature of geojson.features) {
    const geom = feature.geometry;
    if (!geom) continue;
    if (geom.type === "LineString") {
      const coords = (geom as GeoJSON.LineString).coordinates;
      if (coords.length >= 2) segments.push({ coords });
    } else if (geom.type === "MultiLineString") {
      for (const line of (geom as GeoJSON.MultiLineString).coordinates) {
        if (line.length >= 2) segments.push({ coords: line });
      }
    }
  }

  const totalPoints = segments.reduce((sum, s) => sum + s.coords.length, 0);
  const buffer = new Float64Array(1 + segments.length * 2 + totalPoints * 2);
  let offset = 0;
  buffer[offset++] = segments.length;

  for (const segment of segments) {
    buffer[offset++] = HIGHLIGHTED_TYPE;
    buffer[offset++] = segment.coords.length;
    for (const coord of segment.coords) {
      buffer[offset++] = coord[0];
      buffer[offset++] = coord[1];
    }
  }

  return buffer;
}

export function mergeRoadsWithHighlighted(
  baseRoads: Float64Array,
  highlighted: Float64Array
): Float64Array {
  if (highlighted.length <= 1) return baseRoads;
  if (baseRoads.length <= 1) return highlighted;

  const baseCount = baseRoads[0];
  const highlightedCount = highlighted[0];

  const merged = new Float64Array(baseRoads.length + highlighted.length - 1);
  merged[0] = baseCount + highlightedCount;
  merged.set(baseRoads.subarray(1), 1);
  merged.set(highlighted.subarray(1), baseRoads.length);

  return merged;
}

export function roadBboxToViewport(
  bbox: [number, number, number, number],
  aspectRatio: number,
  padding: number = 1.4
): { centerLat: number; centerLng: number; radius: number } {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLon + maxLon) / 2;

  const latSpanM = (maxLat - minLat) * 111320;
  const lonSpanM =
    (maxLon - minLon) * 111320 * Math.cos(centerLat * (Math.PI / 180));

  const safeAspect = aspectRatio > 0 ? aspectRatio : 1;
  const halfH = latSpanM / 2;
  const halfW = lonSpanM / 2;
  const radius =
    (safeAspect >= 1 ? Math.max(halfH, halfW / safeAspect) : Math.max(halfH * safeAspect, halfW)) *
    padding;

  return { centerLat, centerLng, radius: Math.max(radius, 500) };
}
