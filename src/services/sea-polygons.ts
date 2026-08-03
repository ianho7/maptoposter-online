import type {
  BBox,
  Feature,
  FeatureCollection,
  LineString,
  MultiLineString,
  Polygon,
} from "geojson";
import { buildRenderViewportBbox } from "@/lib/poster-viewport";
import {
  buildTopologyFaces,
  cleanDirectedMetricLines,
  createLocalMetricProjection,
  projectLonLat,
  simplifyMetricLinesForBudget,
  unprojectMetricPoint,
  type DirectedMetricLine,
  type MetricBbox,
  type SegmentBudgetOptions,
} from "./coastline-topology";

type LonLatPoint = [number, number];

interface ViewportOptions {
  centerLat: number;
  centerLng: number;
  baseRadiusMeters: number;
  aspectRatio?: number;
  viewportBbox?: BBox;
  onSeaDiagnostics?: (diagnostics: SeaPolygonDiagnostics) => void;
}

const COORD_EPSILON = 1e-9;
const BOUNDARY_TOLERANCE = 1e-6;
const SEA_GENERATOR_VERSION = "directed-coastline-v2";

export interface SeaPolygonDiagnostics {
  clipped_fragments: number;
  clipped_segments: number;
  candidate_faces: number;
  generated_faces: number;
  clip_ms: number;
  node_polygonize_ms: number;
  classify_ms: number;
  input_segments: number;
  deduplicated_segments: number;
  simplified_segments: number;
  simplification_tolerance_m: number;
  simplify_ms: number;
  noded_segments: number;
  matched_coastline_segments: number;
  unmatched_coastline_segments: number;
  accepted_faces: number;
  rejected_conflict_faces: number;
  rejected_insufficient_support_faces: number;
  skipped_reason?:
    | "no-clipped-fragments"
    | "no-support"
    | "processing-budget-after-simplification"
    | "topology-error";
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
  viewportBbox: BBox,
  segmentBudgetOptions: SegmentBudgetOptions = {}
): SeaPolygonBuildResult {
  const diagnostics: SeaPolygonDiagnostics = {
    clipped_fragments: 0,
    clipped_segments: 0,
    candidate_faces: 0,
    generated_faces: 0,
    clip_ms: 0,
    node_polygonize_ms: 0,
    classify_ms: 0,
    input_segments: 0,
    deduplicated_segments: 0,
    simplified_segments: 0,
    simplification_tolerance_m: 0,
    simplify_ms: 0,
    noded_segments: 0,
    matched_coastline_segments: 0,
    unmatched_coastline_segments: 0,
    accepted_faces: 0,
    rejected_conflict_faces: 0,
    rejected_insufficient_support_faces: 0,
  };
  const clipStart = performance.now();
  const clippedFragments = coastlineFeatures.flatMap((feature, featureIndex) =>
    featureToLineStrings(feature).flatMap((line, lineIndex) =>
      clipLineStringToBbox(line, viewportBbox).map((coordinates) => ({
        sourceId: `coastline-${featureIndex}-${lineIndex}`,
        coordinates,
      }))
    )
  );
  diagnostics.clip_ms = performance.now() - clipStart;
  diagnostics.clipped_fragments = clippedFragments.length;
  diagnostics.clipped_segments = clippedFragments.reduce(
    (total, fragment) => total + Math.max(0, fragment.coordinates.length - 1),
    0
  );
  diagnostics.input_segments = diagnostics.clipped_segments;

  if (clippedFragments.length === 0) {
    diagnostics.skipped_reason = "no-clipped-fragments";
    return { polygons: [], diagnostics };
  }

  try {
    const projection = createLocalMetricProjection(viewportBbox);
    const projectedLines: DirectedMetricLine[] = clippedFragments.map((fragment) => ({
      sourceId: fragment.sourceId,
      closed:
        fragment.coordinates.length > 2 &&
        pointsAlmostEqual(fragment.coordinates[0], fragment.coordinates.at(-1)!),
      coordinates: fragment.coordinates.map((point) => projectLonLat(point, projection)),
    }));
    const preprocessStart = performance.now();
    const cleaned = cleanDirectedMetricLines(projectedLines);
    diagnostics.deduplicated_segments = cleaned.outputSegments;
    const simplified = simplifyMetricLinesForBudget(
      cleaned.lines,
      viewportBbox,
      projection,
      segmentBudgetOptions
    );
    diagnostics.simplify_ms = performance.now() - preprocessStart;
    diagnostics.simplified_segments = simplified.simplifiedSegments;
    diagnostics.simplification_tolerance_m = simplified.toleranceMeters;

    if (simplified.exceededHardLimit || !simplified.structurePreserved) {
      diagnostics.skipped_reason = "processing-budget-after-simplification";
      return { polygons: [], diagnostics };
    }

    const southwest = projectLonLat([viewportBbox[0], viewportBbox[1]], projection);
    const northeast = projectLonLat([viewportBbox[2], viewportBbox[3]], projection);
    const metricBbox: MetricBbox = [southwest[0], southwest[1], northeast[0], northeast[1]];
    const topology = buildTopologyFaces(simplified.lines, metricBbox, simplified.toleranceMeters);
    diagnostics.node_polygonize_ms =
      topology.diagnostics.nodeMs + topology.diagnostics.polygonizeMs;
    diagnostics.classify_ms = topology.diagnostics.classifyMs;
    diagnostics.noded_segments = topology.diagnostics.nodedSegments;
    diagnostics.matched_coastline_segments = topology.diagnostics.matchedCoastlineSegments;
    diagnostics.unmatched_coastline_segments = topology.diagnostics.unmatchedCoastlineSegments;
    diagnostics.candidate_faces = topology.diagnostics.candidateFaces;
    diagnostics.accepted_faces = topology.diagnostics.acceptedFaces;
    diagnostics.rejected_conflict_faces = topology.diagnostics.rejectedConflictFaces;
    diagnostics.rejected_insufficient_support_faces =
      topology.diagnostics.rejectedInsufficientSupportFaces;

    const polygons = topology.acceptedFaces.map(
      (face): Feature<Polygon> => ({
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: face.map((ring) =>
            ring.map((point) => unprojectMetricPoint(point, projection))
          ),
        },
        properties: {
          generated: "coastline-sea",
          natural: "sea",
          generator_version: SEA_GENERATOR_VERSION,
          classification: "right-side-topology",
        },
      })
    );
    diagnostics.generated_faces = polygons.length;
    if (polygons.length === 0) diagnostics.skipped_reason = "no-support";
    return { polygons, diagnostics };
  } catch {
    diagnostics.skipped_reason = "topology-error";
    return { polygons: [], diagnostics };
  }
}

function featureToLineStrings(feature: Feature<LineString | MultiLineString>): LonLatPoint[][] {
  if (feature.geometry.type === "LineString") {
    return [feature.geometry.coordinates as LonLatPoint[]];
  }

  return feature.geometry.coordinates.map((line) => line as LonLatPoint[]);
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
