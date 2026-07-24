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
  onSeaDiagnostics?: (diagnostics: SeaPolygonDiagnostics) => void;
}

const geometryFactory = new GeometryFactory();
const geoJsonReader = new GeoJSONReader(geometryFactory);
const geoJsonWriter = new GeoJSONWriter();

const COORD_EPSILON = 1e-9;
const ENDPOINT_KEY_DIGITS = 8;
const BOUNDARY_TOLERANCE = 1e-6;
const MIN_SEA_POLYGON_AREA_M2 = 1;
const SEA_GENERATOR_VERSION = "directed-coastline-v1";
const MIN_DIRECTIONAL_SUPPORT_RATIO = 1e-6;
const MAX_CLIPPED_FRAGMENT_COUNT = 20_000;
const MAX_CLIPPED_SEGMENT_COUNT = 6_000;
const MAX_CLIPPED_VERTEX_COUNT = 100_000;

interface FaceEvidence {
  water: number;
  land: number;
}

interface FaceSpatialIndex {
  bbox: BBox;
  columns: number;
  rows: number;
  cells: Map<string, number[]>;
}

export interface SeaPolygonDiagnostics {
  clipped_fragments: number;
  clipped_segments: number;
  candidate_faces: number;
  sampled_segments: number;
  ambiguous_segments: number;
  total_directional_support: number;
  generated_faces: number;
  clip_ms: number;
  merge_ms: number;
  node_polygonize_ms: number;
  classify_ms: number;
  skipped_reason?:
    | "no-clipped-fragments"
    | "processing-budget"
    | "no-candidate-faces"
    | "ambiguous-segment"
    | "no-support";
}

export interface SeaPolygonBuildResult {
  polygons: Array<Feature<Polygon>>;
  diagnostics: SeaPolygonDiagnostics;
}

export function mergeSeaPolygonsIntoWaterGeoJSON(
  waterGeo: FeatureCollection,
  options: ViewportOptions
): FeatureCollection {
  if (hasGeneratedSeaPolygons(waterGeo)) {
    return waterGeo;
  }

  // Cached output from an older generator must never remain alongside a new
  // classification: it can still cover land even when the new classifier safely
  // declines to generate a replacement sea face.
  const sourceWaterGeo = removeGeneratedSeaPolygons(waterGeo);
  const coastlineFeatures = extractCoastlineFeatures(sourceWaterGeo);
  if (coastlineFeatures.length === 0) {
    return sourceWaterGeo;
  }

  const viewportBbox = buildViewportBbox(options);
  const seaBuildResult = buildSeaPolygonsWithDiagnostics(coastlineFeatures, viewportBbox);
  options.onSeaDiagnostics?.(seaBuildResult.diagnostics);
  const seaPolygons = seaBuildResult.polygons;

  if (seaPolygons.length === 0) {
    return sourceWaterGeo;
  }

  return {
    ...sourceWaterGeo,
    features: [...sourceWaterGeo.features, ...seaPolygons],
  };
}

export function hasGeneratedSeaPolygons(waterGeo: FeatureCollection): boolean {
  return waterGeo.features.some(
    (feature) =>
      feature.properties?.generated === "coastline-sea" &&
      feature.properties?.generator_version === SEA_GENERATOR_VERSION
  );
}

function removeGeneratedSeaPolygons(waterGeo: FeatureCollection): FeatureCollection {
  const features = waterGeo.features.filter(
    (feature) => feature.properties?.generated !== "coastline-sea"
  );
  return features.length === waterGeo.features.length ? waterGeo : { ...waterGeo, features };
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
  _centerPoint?: LonLatPoint
): Array<Feature<Polygon>> {
  return buildSeaPolygonsWithDiagnostics(coastlineFeatures, viewportBbox).polygons;
}

export function buildSeaPolygonsWithDiagnostics(
  coastlineFeatures: Array<Feature<LineString | MultiLineString>>,
  viewportBbox: BBox
): SeaPolygonBuildResult {
  const diagnostics: SeaPolygonDiagnostics = {
    clipped_fragments: 0,
    clipped_segments: 0,
    candidate_faces: 0,
    sampled_segments: 0,
    ambiguous_segments: 0,
    total_directional_support: 0,
    generated_faces: 0,
    clip_ms: 0,
    merge_ms: 0,
    node_polygonize_ms: 0,
    classify_ms: 0,
  };
  const clipStart = performance.now();
  const clippedFragments = coastlineFeatures.flatMap((feature) =>
    featureToLineStrings(feature).flatMap((line) => clipLineStringToBbox(line, viewportBbox))
  );
  diagnostics.clip_ms = performance.now() - clipStart;
  diagnostics.clipped_fragments = clippedFragments.length;
  diagnostics.clipped_segments = clippedFragments.reduce(
    (total, fragment) => total + Math.max(0, fragment.length - 1),
    0
  );

  if (clippedFragments.length === 0) {
    diagnostics.skipped_reason = "no-clipped-fragments";
    return { polygons: [], diagnostics };
  }

  const clippedVertexCount = clippedFragments.reduce((total, fragment) => total + fragment.length, 0);
  if (
    clippedFragments.length > MAX_CLIPPED_FRAGMENT_COUNT ||
    diagnostics.clipped_segments > MAX_CLIPPED_SEGMENT_COUNT ||
    clippedVertexCount > MAX_CLIPPED_VERTEX_COUNT
  ) {
    diagnostics.skipped_reason = "processing-budget";
    return { polygons: [], diagnostics };
  }

  const mergeStart = performance.now();
  const mergedLineStrings = mergeConnectedLineStrings(clippedFragments);
  diagnostics.merge_ms = performance.now() - mergeStart;
  const polygonizer = new Polygonizer();
  const linework = [...mergedLineStrings, ...buildViewportBoundarySegments(viewportBbox)];
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

  const nodePolygonizeStart = performance.now();
  const geometryNoder = new GeometryNoder(new PrecisionModel(1_000_000_000));
  geometryNoder.setValidate(true);
  const nodedLinework = geometryNoder.node(lineGeometries);
  polygonizer.add(nodedLinework);

  const polygonCollection = polygonizer.getPolygons();
  if (!polygonCollection || polygonCollection.size() === 0) {
    diagnostics.skipped_reason = "no-candidate-faces";
    return { polygons: [], diagnostics };
  }

  const polygons = polygonCollection
    .toArray()
    .map((geometry) => geometryToGeoJSONPolygon(geometry))
    .filter((polygon): polygon is Polygon => polygon !== null)
    .filter((polygon) => turfArea(turfPolygon(polygon.coordinates)) > MIN_SEA_POLYGON_AREA_M2);
  diagnostics.node_polygonize_ms = performance.now() - nodePolygonizeStart;
  diagnostics.candidate_faces = polygons.length;

  if (polygons.length === 0) {
    diagnostics.skipped_reason = "no-candidate-faces";
    return { polygons: [], diagnostics };
  }

  const faceIndex = buildFaceSpatialIndex(polygons, viewportBbox);
  const classifyStart = performance.now();
  const evidence = polygons.map((): FaceEvidence => ({ water: 0, land: 0 }));
  const sampleOffset = buildDirectionalSampleOffset(viewportBbox);
  let totalSupport = 0;

  for (const fragment of clippedFragments) {
    for (let pointIndex = 0; pointIndex < fragment.length - 1; pointIndex++) {
      const start = fragment[pointIndex];
      const end = fragment[pointIndex + 1];
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const length = Math.hypot(dx, dy);
      if (length <= COORD_EPSILON) continue;
      diagnostics.sampled_segments++;

      const midpoint: LonLatPoint = [(start[0] + end[0]) * 0.5, (start[1] + end[1]) * 0.5];
      let rightFaceIndex = -1;
      let leftFaceIndex = -1;

      // A noded coastline can pass very close to a boundary or an intersection.
      // Retry a bounded set of offsets before classifying that segment as ambiguous.
      for (const offsetMultiplier of [1, 0.25, 4]) {
        const offset = sampleOffset * offsetMultiplier;
        const rightSample: LonLatPoint = [
          midpoint[0] + (dy / length) * offset,
          midpoint[1] - (dx / length) * offset,
        ];
        const leftSample: LonLatPoint = [
          midpoint[0] - (dy / length) * offset,
          midpoint[1] + (dx / length) * offset,
        ];
        const nextRightFaceIndex = findFaceIndexContainingPoint(rightSample, polygons, faceIndex);
        const nextLeftFaceIndex = findFaceIndexContainingPoint(leftSample, polygons, faceIndex);
        if (
          nextRightFaceIndex !== -1 &&
          nextLeftFaceIndex !== -1 &&
          nextRightFaceIndex !== nextLeftFaceIndex
        ) {
          rightFaceIndex = nextRightFaceIndex;
          leftFaceIndex = nextLeftFaceIndex;
          break;
        }
      }

      // A coastline must separate two distinct polygonized faces. Ambiguous input
      // safely declines sea generation instead of risking a land-overwriting fill.
      if (
        rightFaceIndex === -1 ||
        leftFaceIndex === -1 ||
        rightFaceIndex === leftFaceIndex
      ) {
        diagnostics.ambiguous_segments++;
        diagnostics.classify_ms = performance.now() - classifyStart;
        diagnostics.skipped_reason = "ambiguous-segment";
        return { polygons: [], diagnostics };
      }

      evidence[rightFaceIndex].water += length;
      evidence[leftFaceIndex].land += length;
      totalSupport += length;
    }
  }

  if (totalSupport <= 0) {
    diagnostics.classify_ms = performance.now() - classifyStart;
    diagnostics.skipped_reason = "no-support";
    return { polygons: [], diagnostics };
  }
  diagnostics.total_directional_support = totalSupport;

  const minDirectionalSupport = totalSupport * MIN_DIRECTIONAL_SUPPORT_RATIO;

  const seen = new Set<string>();

  const seaPolygons = polygons
    .filter((polygon, index) => {
      const faceEvidence = evidence[index];
      return (
        faceEvidence.water >= minDirectionalSupport &&
        faceEvidence.land <= COORD_EPSILON &&
        polygonTouchesViewportBoundary(polygon, viewportBbox)
      );
    })
    .map(
      (polygon): Feature<Polygon> => ({
        type: "Feature",
        geometry: polygon,
        properties: {
          generated: "coastline-sea",
          natural: "sea",
          generator_version: SEA_GENERATOR_VERSION,
          classification: "right-side-confidence",
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
  diagnostics.generated_faces = seaPolygons.length;
  diagnostics.classify_ms = performance.now() - classifyStart;
  return { polygons: seaPolygons, diagnostics };
}

function buildDirectionalSampleOffset(bbox: BBox): number {
  const width = Math.abs(bbox[2] - bbox[0]);
  const height = Math.abs(bbox[3] - bbox[1]);
  return Math.max(Math.hypot(width, height) / 10_000, COORD_EPSILON * 100);
}

function buildFaceSpatialIndex(polygons: Polygon[], bbox: BBox): FaceSpatialIndex {
  const dimension = Math.min(64, Math.max(4, Math.ceil(Math.sqrt(polygons.length))));
  const index: FaceSpatialIndex = {
    bbox,
    columns: dimension,
    rows: dimension,
    cells: new Map<string, number[]>(),
  };

  for (let polygonIndex = 0; polygonIndex < polygons.length; polygonIndex++) {
    const polygonBbox = getPolygonBbox(polygons[polygonIndex]);
    const [minColumn, minRow] = pointToFaceCell([polygonBbox[0], polygonBbox[1]], index);
    const [maxColumn, maxRow] = pointToFaceCell([polygonBbox[2], polygonBbox[3]], index);

    for (let column = minColumn; column <= maxColumn; column++) {
      for (let row = minRow; row <= maxRow; row++) {
        const key = faceCellKey(column, row);
        const bucket = index.cells.get(key);
        if (bucket) {
          bucket.push(polygonIndex);
        } else {
          index.cells.set(key, [polygonIndex]);
        }
      }
    }
  }

  return index;
}

function findFaceIndexContainingPoint(
  point: LonLatPoint,
  polygons: Polygon[],
  faceIndex: FaceSpatialIndex
): number {
  const [column, row] = pointToFaceCell(point, faceIndex);
  const candidates = faceIndex.cells.get(faceCellKey(column, row)) ?? [];

  for (const polygonIndex of candidates) {
    const polygon = polygons[polygonIndex];
    if (pointInPolygon(point, polygon)) {
      return polygonIndex;
    }
  }

  return -1;
}

function pointToFaceCell(point: LonLatPoint, index: FaceSpatialIndex): [number, number] {
  const [minLng, minLat, maxLng, maxLat] = index.bbox;
  const column = Math.floor(((point[0] - minLng) / (maxLng - minLng || 1)) * index.columns);
  const row = Math.floor(((point[1] - minLat) / (maxLat - minLat || 1)) * index.rows);
  return [
    Math.max(0, Math.min(index.columns - 1, column)),
    Math.max(0, Math.min(index.rows - 1, row)),
  ];
}

function faceCellKey(column: number, row: number): string {
  return `${column}:${row}`;
}

function getPolygonBbox(polygon: Polygon): BBox {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const ring of polygon.coordinates) {
    for (const [lng, lat] of ring as LonLatPoint[]) {
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
    }
  }

  return [minLng, minLat, maxLng, maxLat];
}

function polygonTouchesViewportBoundary(polygon: Polygon, bbox: BBox): boolean {
  const exteriorRing = polygon.coordinates[0] as LonLatPoint[] | undefined;
  if (!exteriorRing) return false;

  const [minLng, minLat, maxLng, maxLat] = bbox;
  return exteriorRing.some(
    ([lng, lat]) =>
      Math.abs(lng - minLng) <= BOUNDARY_TOLERANCE ||
      Math.abs(lng - maxLng) <= BOUNDARY_TOLERANCE ||
      Math.abs(lat - minLat) <= BOUNDARY_TOLERANCE ||
      Math.abs(lat - maxLat) <= BOUNDARY_TOLERANCE
  );
}

function featureToLineStrings(feature: Feature<LineString | MultiLineString>): LonLatPoint[][] {
  if (feature.geometry.type === "LineString") {
    return [feature.geometry.coordinates as LonLatPoint[]];
  }

  return feature.geometry.coordinates.map((line) => line as LonLatPoint[]);
}

function mergeConnectedLineStrings(lineStrings: LonLatPoint[][]): LonLatPoint[][] {
  const segments = lineStrings.filter((line) => line.length >= 2);
  if (segments.length <= 1) {
    return segments.map((line) => [...line]);
  }

  const endpointIndex = buildEndpointIndex(segments);
  const used = new Uint8Array(segments.length);
  const merged: LonLatPoint[][] = [];

  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;

    const current = [...segments[i]];
    used[i] = 1;

    extendLineEnd(current, segments, endpointIndex, used);
    current.reverse();
    extendLineEnd(current, segments, endpointIndex, used);
    current.reverse();

    merged.push(current);
  }

  return merged;
}

function buildEndpointIndex(lineStrings: LonLatPoint[][]): Map<string, number[]> {
  const endpointIndex = new Map<string, number[]>();

  for (let i = 0; i < lineStrings.length; i++) {
    addEndpoint(endpointIndex, lineStrings[i][0], i);
    addEndpoint(endpointIndex, lineStrings[i][lineStrings[i].length - 1], i);
  }

  return endpointIndex;
}

function addEndpoint(index: Map<string, number[]>, point: LonLatPoint, lineIndex: number) {
  const key = pointKey(point);
  const bucket = index.get(key);
  if (bucket) {
    bucket.push(lineIndex);
  } else {
    index.set(key, [lineIndex]);
  }
}

function extendLineEnd(
  line: LonLatPoint[],
  segments: LonLatPoint[][],
  endpointIndex: Map<string, number[]>,
  used: Uint8Array
) {
  while (true) {
    const endpoint = line[line.length - 1];
    const candidates = endpointIndex.get(pointKey(endpoint));
    if (!candidates) {
      return;
    }

    let nextIndex = -1;
    let reverse = false;

    for (const candidateIndex of candidates) {
      if (used[candidateIndex]) continue;

      const candidate = segments[candidateIndex];
      if (pointsAlmostEqual(endpoint, candidate[0])) {
        nextIndex = candidateIndex;
        reverse = false;
        break;
      }
      if (pointsAlmostEqual(endpoint, candidate[candidate.length - 1])) {
        nextIndex = candidateIndex;
        reverse = true;
        break;
      }
    }

    if (nextIndex === -1) {
      return;
    }

    used[nextIndex] = 1;
    appendLine(line, segments[nextIndex], reverse);
  }
}

function appendLine(target: LonLatPoint[], source: LonLatPoint[], reverse: boolean) {
  if (reverse) {
    for (let i = source.length - 2; i >= 0; i--) {
      pushUniquePoint(target, source[i]);
    }
    return;
  }

  for (let i = 1; i < source.length; i++) {
    pushUniquePoint(target, source[i]);
  }
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

function pointKey(point: LonLatPoint): string {
  return `${roundCoord(point[0], ENDPOINT_KEY_DIGITS)},${roundCoord(point[1], ENDPOINT_KEY_DIGITS)}`;
}

function roundCoord(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
