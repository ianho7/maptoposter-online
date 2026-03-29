import { polygon as turfPolygon } from "@turf/helpers";
import type { BBox, Feature, Polygon } from "geojson";

interface BaseViewportOptions {
  centerLat: number;
  centerLng: number;
  baseRadiusMeters: number;
}

interface RenderViewportOptions extends BaseViewportOptions {
  aspectRatio: number;
}

const EARTH_METERS_PER_DEGREE_LAT = 111_320;

// Keep this list in sync with the poster sizes exposed in App.tsx.
const SUPPORTED_POSTER_DIMENSIONS: Array<{ width: number; height: number }> = [
  { width: 1500, height: 3200 },
  { width: 3000, height: 3000 },
  { width: 2400, height: 3200 },
  { width: 2160, height: 3840 },
  { width: 3200, height: 2400 },
  { width: 3840, height: 2160 },
  { width: 2480, height: 3508 },
  { width: 3508, height: 2480 },
];

const MAX_SUPPORTED_ASPECT = Math.max(
  ...SUPPORTED_POSTER_DIMENSIONS.map(({ width, height }) => width / height)
);
const MAX_SUPPORTED_INVERSE_ASPECT = Math.max(
  ...SUPPORTED_POSTER_DIMENSIONS.map(({ width, height }) => height / width)
);

export const MAP_DATA_CACHE_VERSION = "v7-canonical-fetch-viewport-deduped-overpass";

export function buildRenderViewportBbox({
  centerLat,
  centerLng,
  baseRadiusMeters,
  aspectRatio,
}: RenderViewportOptions): BBox {
  const safeAspect = aspectRatio > 0 ? aspectRatio : 1;
  const halfWidthMeters = safeAspect >= 1 ? baseRadiusMeters * safeAspect : baseRadiusMeters;
  const halfHeightMeters = safeAspect >= 1 ? baseRadiusMeters : baseRadiusMeters / safeAspect;

  return buildBboxFromHalfExtents({
    centerLat,
    centerLng,
    halfWidthMeters,
    halfHeightMeters,
  });
}

export function buildCanonicalFetchViewportBbox({
  centerLat,
  centerLng,
  baseRadiusMeters,
}: BaseViewportOptions): BBox {
  return buildBboxFromHalfExtents({
    centerLat,
    centerLng,
    halfWidthMeters: baseRadiusMeters * MAX_SUPPORTED_ASPECT,
    halfHeightMeters: baseRadiusMeters * MAX_SUPPORTED_INVERSE_ASPECT,
  });
}

export function buildCanonicalFetchRadiusMeters(baseRadiusMeters: number): number {
  const halfWidthMeters = baseRadiusMeters * MAX_SUPPORTED_ASPECT;
  const halfHeightMeters = baseRadiusMeters * MAX_SUPPORTED_INVERSE_ASPECT;
  return Math.hypot(halfWidthMeters, halfHeightMeters);
}

export function bboxToPolygon(bbox: BBox): Feature<Polygon> {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return turfPolygon([
    [
      [minLng, minLat],
      [maxLng, minLat],
      [maxLng, maxLat],
      [minLng, maxLat],
      [minLng, minLat],
    ],
  ]);
}

export function getCanonicalFetchViewportExtents(baseRadiusMeters: number) {
  return {
    halfWidthMeters: baseRadiusMeters * MAX_SUPPORTED_ASPECT,
    halfHeightMeters: baseRadiusMeters * MAX_SUPPORTED_INVERSE_ASPECT,
  };
}

function buildBboxFromHalfExtents({
  centerLat,
  centerLng,
  halfWidthMeters,
  halfHeightMeters,
}: {
  centerLat: number;
  centerLng: number;
  halfWidthMeters: number;
  halfHeightMeters: number;
}): BBox {
  const latDelta = metersToLatitudeDegrees(halfHeightMeters);
  const lngDelta = metersToLongitudeDegrees(halfWidthMeters, centerLat);

  return [centerLng - lngDelta, centerLat - latDelta, centerLng + lngDelta, centerLat + latDelta];
}

function metersToLatitudeDegrees(meters: number): number {
  return meters / EARTH_METERS_PER_DEGREE_LAT;
}

function metersToLongitudeDegrees(meters: number, latitude: number): number {
  const cosLat = Math.cos((latitude * Math.PI) / 180);
  const metersPerDegree = Math.max(EARTH_METERS_PER_DEGREE_LAT * Math.abs(cosLat), 1);
  return meters / metersPerDegree;
}
