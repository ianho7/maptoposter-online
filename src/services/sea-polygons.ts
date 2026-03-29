import { area as turfArea } from "@turf/area";
import { polygon as turfPolygon } from "@turf/helpers";
import type {
  BBox,
  Feature,
  FeatureCollection,
  LineString,
  MultiLineString,
  Polygon,
} from "geojson";
import ArrayList from "jsts/java/util/ArrayList.js";
import GeometryFactory from "jsts/org/locationtech/jts/geom/GeometryFactory.js";
import PrecisionModel from "jsts/org/locationtech/jts/geom/PrecisionModel.js";
import GeoJSONReader from "jsts/org/locationtech/jts/io/GeoJSONReader.js";
import GeoJSONWriter from "jsts/org/locationtech/jts/io/GeoJSONWriter.js";
import GeometryNoder from "jsts/org/locationtech/jts/noding/snapround/GeometryNoder.js";
import Polygonizer from "jsts/org/locationtech/jts/operation/polygonize/Polygonizer.js";
import { buildRenderViewportBbox } from "@/lib/poster-viewport";

type LonLatPoint = [number, number];

interface ViewportOptions {
  centerLat: number;
  centerLng: number;
  baseRadiusMeters: number;
  aspectRatio?: number;
  viewportBbox?: BBox;
}

const geometryFactory = new GeometryFactory();
const geoJsonReader = new GeoJSONReader(geometryFactory);
const geoJsonWriter = new GeoJSONWriter();

const COORD_EPSILON = 1e-9;
const BOUNDARY_TOLERANCE = 1e-6;
const MIN_SEA_POLYGON_AREA_M2 = 1;

export function mergeSeaPolygonsIntoWaterGeoJSON(
  waterGeo: FeatureCollection,
  options: ViewportOptions
): FeatureCollection {
  const coastlineFeatures = extractCoastlineFeatures(waterGeo);
  if (coastlineFeatures.length === 0) {
    return waterGeo;
  }

  const viewportBbox = buildViewportBbox(options);
  const seaPolygons = buildSeaPolygonsFromCoastlines(coastlineFeatures, viewportBbox, [
    options.centerLng,
    options.centerLat,
  ]);

  if (seaPolygons.length === 0) {
    return waterGeo;
  }

  return {
    ...waterGeo,
    features: [...waterGeo.features, ...seaPolygons],
  };
}

export function buildViewportBbox({
  centerLat,
  centerLng,
  baseRadiusMeters,
  aspectRatio,
  viewportBbox,
}: ViewportOptions): BBox {
  if (viewportBbox) {
    return viewportBbox;
  }

  return buildRenderViewportBbox({
    centerLat,
    centerLng,
    baseRadiusMeters,
    aspectRatio: aspectRatio ?? 1,
  });
}

export function extractCoastlineFeatures(
  waterGeo: FeatureCollection
): Array<Feature<LineString | MultiLineString>> {
  return waterGeo.features.filter((feature): feature is Feature<LineString | MultiLineString> => {
    const natural =
      typeof feature.properties?.natural === "string" ? feature.properties.natural : "";
    return (
      natural === "coastline" &&
      (feature.geometry.type === "LineString" || feature.geometry.type === "MultiLineString")
    );
  });
}

export function buildSeaPolygonsFromCoastlines(
  coastlineFeatures: Array<Feature<LineString | MultiLineString>>,
  viewportBbox: BBox,
  centerPoint: LonLatPoint
): Array<Feature<Polygon>> {
  const mergedLineStrings = mergeConnectedCoastlines(coastlineFeatures);
  const clippedFragments = mergedLineStrings.flatMap((line) =>
    clipLineStringToBbox(line, viewportBbox)
  );

  if (clippedFragments.length === 0) {
    return [];
  }

  const polygonizer = new Polygonizer();
  const linework = [...clippedFragments, ...buildViewportBoundarySegments(viewportBbox)];
  const lineGeometries = new ArrayList([]);

  for (const line of linework) {
    if (line.length < 2) continue;
    lineGeometries.add(
      geoJsonReader.read({
        type: "LineString",
        coordinates: line,
      })
    );
  }

  const geometryNoder = new GeometryNoder(new PrecisionModel(1_000_000_000));
  geometryNoder.setValidate(true);
  const nodedLinework = geometryNoder.node(lineGeometries);
  polygonizer.add(nodedLinework);

  const polygonCollection = polygonizer.getPolygons();
  if (!polygonCollection || polygonCollection.size() === 0) {
    return [];
  }

  const polygons = polygonCollection
    .toArray()
    .map((geometry) => geometryToGeoJSONPolygon(geometry))
    .filter((polygon): polygon is Polygon => polygon !== null)
    .filter((polygon) => turfArea(turfPolygon(polygon.coordinates)) > MIN_SEA_POLYGON_AREA_M2);

  if (polygons.length === 0) {
    return [];
  }

  const landFaceIndex = polygons.findIndex((polygon) => pointInPolygon(centerPoint, polygon));
  if (landFaceIndex === -1) {
    return [];
  }

  const seen = new Set<string>();

  return polygons
    .filter((_, index) => index !== landFaceIndex)
    .map(
      (polygon): Feature<Polygon> => ({
        type: "Feature",
        geometry: polygon,
        properties: {
          generated: "coastline-sea",
          natural: "sea",
        },
      })
    )
    .filter((feature) => {
      const key = JSON.stringify(
        feature.geometry.coordinates[0].map(([lng, lat]) => [
          roundCoord(lng, 6),
          roundCoord(lat, 6),
        ])
      );
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function mergeConnectedCoastlines(
  coastlineFeatures: Array<Feature<LineString | MultiLineString>>
): LonLatPoint[][] {
  const pending: LonLatPoint[][] = [];

  for (const feature of coastlineFeatures) {
    if (feature.geometry.type === "LineString") {
      pending.push(feature.geometry.coordinates as LonLatPoint[]);
    } else {
      for (const line of feature.geometry.coordinates) {
        pending.push(line as LonLatPoint[]);
      }
    }
  }

  const merged: LonLatPoint[][] = [];

  while (pending.length > 0) {
    let current = [...pending.pop()!];
    let changed = true;

    while (changed) {
      changed = false;

      for (let i = pending.length - 1; i >= 0; i--) {
        const candidate = pending[i];
        const mergedLine = tryMergeLineStrings(current, candidate);
        if (!mergedLine) continue;

        current = mergedLine;
        pending.splice(i, 1);
        changed = true;
      }
    }

    merged.push(current);
  }

  return merged;
}

function tryMergeLineStrings(a: LonLatPoint[], b: LonLatPoint[]): LonLatPoint[] | null {
  const aStart = a[0];
  const aEnd = a[a.length - 1];
  const bStart = b[0];
  const bEnd = b[b.length - 1];

  if (pointsAlmostEqual(aEnd, bStart)) {
    return [...a, ...b.slice(1)];
  }
  if (pointsAlmostEqual(aEnd, bEnd)) {
    return [...a, ...[...b].reverse().slice(1)];
  }
  if (pointsAlmostEqual(aStart, bEnd)) {
    return [...b, ...a.slice(1)];
  }
  if (pointsAlmostEqual(aStart, bStart)) {
    return [...[...b].reverse(), ...a.slice(1)];
  }

  return null;
}

function buildViewportBoundarySegments(bbox: BBox): LonLatPoint[][] {
  const [minLng, minLat, maxLng, maxLat] = bbox;

  return [
    [
      [minLng, minLat],
      [maxLng, minLat],
    ],
    [
      [maxLng, minLat],
      [maxLng, maxLat],
    ],
    [
      [maxLng, maxLat],
      [minLng, maxLat],
    ],
    [
      [minLng, maxLat],
      [minLng, minLat],
    ],
  ];
}

function geometryToGeoJSONPolygon(geometry: unknown): Polygon | null {
  const geoJson = geoJsonWriter.write(geometry as never) as Polygon | null;
  if (!geoJson || geoJson.type !== "Polygon" || !Array.isArray(geoJson.coordinates)) {
    return null;
  }

  return {
    type: "Polygon",
    coordinates: geoJson.coordinates.map((ring) =>
      ring.map(([lng, lat]) => [lng, lat] as LonLatPoint)
    ),
  };
}

function clipLineStringToBbox(coords: LonLatPoint[], bbox: BBox): LonLatPoint[][] {
  const fragments: LonLatPoint[][] = [];
  let current: LonLatPoint[] = [];

  for (let i = 0; i < coords.length - 1; i++) {
    const clipped = clipSegmentToBbox(coords[i], coords[i + 1], bbox);

    if (!clipped) {
      if (current.length >= 2) {
        fragments.push(current);
      }
      current = [];
      continue;
    }

    const [start, end] = clipped;
    if (current.length === 0) {
      current.push(start);
    } else if (!pointsAlmostEqual(current[current.length - 1], start)) {
      if (current.length >= 2) {
        fragments.push(current);
      }
      current = [start];
    }

    pushUniquePoint(current, end);
  }

  if (current.length >= 2) {
    fragments.push(current);
  }

  return fragments;
}

function clipSegmentToBbox(
  start: LonLatPoint,
  end: LonLatPoint,
  bbox: BBox
): [LonLatPoint, LonLatPoint] | null {
  let [x1, y1] = start;
  let [x2, y2] = end;
  let code1 = computeOutCode(x1, y1, bbox);
  let code2 = computeOutCode(x2, y2, bbox);

  while (true) {
    if ((code1 | code2) === 0) {
      return [snapPointToBoundary([x1, y1], bbox), snapPointToBoundary([x2, y2], bbox)];
    }

    if ((code1 & code2) !== 0) {
      return null;
    }

    const outCode = code1 !== 0 ? code1 : code2;
    const [minLng, minLat, maxLng, maxLat] = bbox;
    let x = 0;
    let y = 0;

    if (outCode & 8) {
      x = x1 + ((x2 - x1) * (maxLat - y1)) / (y2 - y1);
      y = maxLat;
    } else if (outCode & 4) {
      x = x1 + ((x2 - x1) * (minLat - y1)) / (y2 - y1);
      y = minLat;
    } else if (outCode & 2) {
      y = y1 + ((y2 - y1) * (maxLng - x1)) / (x2 - x1);
      x = maxLng;
    } else {
      y = y1 + ((y2 - y1) * (minLng - x1)) / (x2 - x1);
      x = minLng;
    }

    if (outCode === code1) {
      x1 = x;
      y1 = y;
      code1 = computeOutCode(x1, y1, bbox);
    } else {
      x2 = x;
      y2 = y;
      code2 = computeOutCode(x2, y2, bbox);
    }
  }
}

function computeOutCode(x: number, y: number, bbox: BBox): number {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  let code = 0;

  if (x < minLng) code |= 1;
  if (x > maxLng) code |= 2;
  if (y < minLat) code |= 4;
  if (y > maxLat) code |= 8;

  return code;
}

function pointInPolygon(point: LonLatPoint, polygon: Polygon): boolean {
  if (polygon.coordinates.length === 0) {
    return false;
  }

  if (!pointInRing(point, polygon.coordinates[0] as LonLatPoint[])) {
    return false;
  }

  for (let i = 1; i < polygon.coordinates.length; i++) {
    if (pointInRing(point, polygon.coordinates[i] as LonLatPoint[])) {
      return false;
    }
  }

  return true;
}

function pointInRing(point: LonLatPoint, ring: LonLatPoint[]): boolean {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function snapPointToBoundary(point: LonLatPoint, bbox: BBox): LonLatPoint {
  let [lng, lat] = point;
  const [minLng, minLat, maxLng, maxLat] = bbox;

  if (Math.abs(lng - minLng) <= BOUNDARY_TOLERANCE) lng = minLng;
  if (Math.abs(lng - maxLng) <= BOUNDARY_TOLERANCE) lng = maxLng;
  if (Math.abs(lat - minLat) <= BOUNDARY_TOLERANCE) lat = minLat;
  if (Math.abs(lat - maxLat) <= BOUNDARY_TOLERANCE) lat = maxLat;

  return [lng, lat];
}

function pushUniquePoint(points: LonLatPoint[], nextPoint: LonLatPoint) {
  if (points.length === 0 || !pointsAlmostEqual(points[points.length - 1], nextPoint)) {
    points.push(nextPoint);
  }
}

function pointsAlmostEqual(a: LonLatPoint, b: LonLatPoint): boolean {
  return Math.abs(a[0] - b[0]) <= COORD_EPSILON && Math.abs(a[1] - b[1]) <= COORD_EPSILON;
}

function roundCoord(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
