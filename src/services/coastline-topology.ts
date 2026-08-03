import type { BBox } from "geojson";
import GeometryFactory from "jsts/org/locationtech/jts/geom/GeometryFactory.js";
import Coordinate from "jsts/org/locationtech/jts/geom/Coordinate.js";
import PrecisionModel from "jsts/org/locationtech/jts/geom/PrecisionModel.js";
import GeoJSONReader from "jsts/org/locationtech/jts/io/GeoJSONReader.js";
import GeoJSONWriter from "jsts/org/locationtech/jts/io/GeoJSONWriter.js";
import NodedSegmentString from "jsts/org/locationtech/jts/noding/NodedSegmentString.js";
import MCIndexSnapRounder from "jsts/org/locationtech/jts/noding/snapround/MCIndexSnapRounder.js";
import Polygonizer from "jsts/org/locationtech/jts/operation/polygonize/Polygonizer.js";
import IsValidOp from "jsts/org/locationtech/jts/operation/valid/IsValidOp.js";
import TopologyPreservingSimplifier from "jsts/org/locationtech/jts/simplify/TopologyPreservingSimplifier.js";
import ArrayList from "jsts/java/util/ArrayList.js";

export type LonLatPoint = [number, number];
export type MetricPoint = [number, number];

export interface LocalMetricProjection {
  centerLat: number;
  centerLng: number;
  metersPerLongitudeDegree: number;
  metersPerLatitudeDegree: number;
}

export interface DirectedMetricLine {
  sourceId: string;
  coordinates: MetricPoint[];
  closed: boolean;
}

export interface CleanedDirectedMetricLines {
  lines: DirectedMetricLine[];
  inputSegments: number;
  outputSegments: number;
  removedZeroLengthSegments: number;
  removedDuplicateSegments: number;
}

export interface SimplifiedDirectedMetricLines {
  lines: DirectedMetricLine[];
  structurePreserved: boolean;
}

export interface BudgetedMetricLines {
  lines: DirectedMetricLine[];
  inputSegments: number;
  simplifiedSegments: number;
  toleranceMeters: number;
  exceededHardLimit: boolean;
  structurePreserved: boolean;
}

export interface SegmentBudgetOptions {
  targetSegmentCount?: number;
  hardSegmentLimit?: number;
}

export type MetricBbox = [number, number, number, number];

export interface NodedMetricSegment {
  kind: "coastline" | "viewport-boundary";
  sourceId: string;
  start: MetricPoint;
  end: MetricPoint;
}

export interface NodedMetricLines {
  segments: NodedMetricSegment[];
}

export interface TopologyFaceDiagnostics {
  nodedSegments: number;
  matchedCoastlineSegments: number;
  unmatchedCoastlineSegments: number;
  candidateFaces: number;
  acceptedFaces: number;
  rejectedConflictFaces: number;
  rejectedInsufficientSupportFaces: number;
  nodeMs: number;
  polygonizeMs: number;
  classifyMs: number;
}

export interface TopologyFaceResult {
  acceptedFaces: MetricPoint[][][];
  diagnostics: TopologyFaceDiagnostics;
}

const METERS_PER_LATITUDE_DEGREE = 111_320;
const METRIC_COORDINATE_DIGITS = 6;
const METRIC_EPSILON = 1e-6;
const MAX_SUPPORTED_OUTPUT_DIMENSION_PX = 3_840;
const TARGET_SEGMENT_COUNT = 10_000;
const HARD_SEGMENT_LIMIT = 20_000;
const TOPOLOGY_PRECISION_SCALE = 1_000;
const MIN_DIRECTIONAL_SUPPORT_METERS = 25;
const MIN_FACE_AREA_M2 = 1;
const geometryFactory = new GeometryFactory();
const geoJsonReader = new GeoJSONReader(geometryFactory);
const geoJsonWriter = new GeoJSONWriter();

export function createLocalMetricProjection(bbox: BBox): LocalMetricProjection {
  const centerLng = (bbox[0] + bbox[2]) * 0.5;
  const centerLat = (bbox[1] + bbox[3]) * 0.5;

  return {
    centerLat,
    centerLng,
    metersPerLongitudeDegree: Math.cos((centerLat * Math.PI) / 180) * METERS_PER_LATITUDE_DEGREE,
    metersPerLatitudeDegree: METERS_PER_LATITUDE_DEGREE,
  };
}

export function projectLonLat(
  [lng, lat]: LonLatPoint,
  projection: LocalMetricProjection
): MetricPoint {
  return [
    (lng - projection.centerLng) * projection.metersPerLongitudeDegree,
    (lat - projection.centerLat) * projection.metersPerLatitudeDegree,
  ];
}

export function unprojectMetricPoint(
  [x, y]: MetricPoint,
  projection: LocalMetricProjection
): LonLatPoint {
  return [
    projection.centerLng + x / projection.metersPerLongitudeDegree,
    projection.centerLat + y / projection.metersPerLatitudeDegree,
  ];
}

export function cleanDirectedMetricLines(
  inputLines: DirectedMetricLine[]
): CleanedDirectedMetricLines {
  const normalizedLines: DirectedMetricLine[] = [];
  let inputSegments = 0;
  let removedZeroLengthSegments = 0;

  for (const inputLine of inputLines) {
    inputSegments += Math.max(0, inputLine.coordinates.length - 1);
    const coordinates: MetricPoint[] = [];

    for (const point of inputLine.coordinates) {
      const previous = coordinates.at(-1);
      if (previous && metricPointsEqual(previous, point)) {
        removedZeroLengthSegments++;
        continue;
      }
      coordinates.push([point[0], point[1]]);
    }

    if (coordinates.length < 2) continue;

    const closed = inputLine.closed || metricPointsEqual(coordinates[0], coordinates.at(-1)!);
    if (closed && !metricPointsEqual(coordinates[0], coordinates.at(-1)!)) {
      coordinates.push([...coordinates[0]] as MetricPoint);
    }

    normalizedLines.push({
      sourceId: inputLine.sourceId,
      coordinates,
      closed,
    });
  }

  const lines: DirectedMetricLine[] = [];
  const seenEdges = new Set<string>();
  let removedDuplicateSegments = 0;

  for (const line of normalizedLines) {
    let fragment: MetricPoint[] = [];
    let fragmentIndex = 0;
    const flushFragment = () => {
      if (fragment.length < 2) {
        fragment = [];
        return;
      }
      const closed = metricPointsEqual(fragment[0], fragment.at(-1)!);
      lines.push({
        sourceId: fragmentIndex === 0 ? line.sourceId : `${line.sourceId}#${fragmentIndex}`,
        coordinates: fragment,
        closed,
      });
      fragmentIndex++;
      fragment = [];
    };

    for (let index = 0; index < line.coordinates.length - 1; index++) {
      const start = line.coordinates[index];
      const end = line.coordinates[index + 1];
      const edgeKey = undirectedCleaningEdgeKey(start, end);
      // OSM relations can repeat only part of a way, sometimes reversed. Split at
      // the duplicate instead of joining the remaining endpoints across a gap.
      if (seenEdges.has(edgeKey)) {
        removedDuplicateSegments++;
        flushFragment();
        continue;
      }
      seenEdges.add(edgeKey);

      if (fragment.length === 0) fragment.push([...start] as MetricPoint);
      else if (!metricPointsEqual(fragment.at(-1)!, start)) {
        flushFragment();
        fragment.push([...start] as MetricPoint);
      }
      fragment.push([...end] as MetricPoint);
    }
    flushFragment();
  }

  return {
    lines,
    inputSegments,
    outputSegments: countMetricSegments(lines),
    removedZeroLengthSegments,
    removedDuplicateSegments,
  };
}

export function countMetricSegments(lines: DirectedMetricLine[]): number {
  return lines.reduce((total, line) => total + Math.max(0, line.coordinates.length - 1), 0);
}

export function calculateSimplificationToleranceMeters(
  bbox: BBox,
  projection: LocalMetricProjection,
  pixelFraction: 0.25 | 0.5
): number {
  const southwest = projectLonLat([bbox[0], bbox[1]], projection);
  const northeast = projectLonLat([bbox[2], bbox[3]], projection);
  const maximumViewportEdgeMeters = Math.max(
    Math.abs(northeast[0] - southwest[0]),
    Math.abs(northeast[1] - southwest[1])
  );
  return (maximumViewportEdgeMeters / MAX_SUPPORTED_OUTPUT_DIMENSION_PX) * pixelFraction;
}

export function simplifyDirectedMetricLines(
  lines: DirectedMetricLine[],
  toleranceMeters: number
): SimplifiedDirectedMetricLines {
  if (lines.length === 0 || toleranceMeters <= 0) {
    return { lines: cloneMetricLines(lines), structurePreserved: true };
  }

  const geometry = geoJsonReader.read({
    type: "MultiLineString",
    coordinates: lines.map((line) => line.coordinates),
  });
  const simplifiedGeometry = TopologyPreservingSimplifier.simplify(geometry, toleranceMeters);
  const geoJson = geoJsonWriter.write(simplifiedGeometry as never) as {
    type: "MultiLineString" | "LineString";
    coordinates: MetricPoint[][] | MetricPoint[];
  };
  const simplifiedCoordinates =
    geoJson.type === "LineString"
      ? [geoJson.coordinates as MetricPoint[]]
      : (geoJson.coordinates as MetricPoint[][]);

  if (simplifiedCoordinates.length !== lines.length) {
    return { lines: cloneMetricLines(lines), structurePreserved: false };
  }

  const simplifiedLines = lines.map(
    (line, index): DirectedMetricLine => ({
      sourceId: line.sourceId,
      closed: line.closed,
      coordinates: simplifiedCoordinates[index].map(([x, y]) => [x, y]),
    })
  );
  const structurePreserved = simplifiedLines.every((line, index) =>
    lineStructureMatches(lines[index], line)
  );

  return {
    lines: structurePreserved ? simplifiedLines : cloneMetricLines(lines),
    structurePreserved,
  };
}

export function simplifyMetricLinesForBudget(
  lines: DirectedMetricLine[],
  bbox: BBox,
  projection: LocalMetricProjection,
  options: SegmentBudgetOptions = {}
): BudgetedMetricLines {
  const targetSegmentCount = options.targetSegmentCount ?? TARGET_SEGMENT_COUNT;
  const hardSegmentLimit = options.hardSegmentLimit ?? HARD_SEGMENT_LIMIT;
  const inputSegments = countMetricSegments(lines);
  if (inputSegments <= targetSegmentCount) {
    return {
      lines: cloneMetricLines(lines),
      inputSegments,
      simplifiedSegments: inputSegments,
      toleranceMeters: 0,
      exceededHardLimit: false,
      structurePreserved: true,
    };
  }

  const toleranceFractions: Array<0.25 | 0.5> = [0.25, 0.5];
  let currentLines = cloneMetricLines(lines);
  let toleranceMeters = 0;
  let structurePreserved = true;

  for (const fraction of toleranceFractions) {
    toleranceMeters = calculateSimplificationToleranceMeters(bbox, projection, fraction);
    const result = simplifyDirectedMetricLines(lines, toleranceMeters);
    if (!result.structurePreserved) {
      structurePreserved = false;
      currentLines = cloneMetricLines(lines);
      break;
    }
    currentLines = result.lines;
    if (countMetricSegments(currentLines) <= targetSegmentCount) break;
  }

  const simplifiedSegments = countMetricSegments(currentLines);
  return {
    lines: currentLines,
    inputSegments,
    simplifiedSegments,
    toleranceMeters,
    exceededHardLimit: !structurePreserved || simplifiedSegments > hardSegmentLimit,
    structurePreserved,
  };
}

export function nodeDirectedMetricLines(
  coastlineLines: DirectedMetricLine[],
  bbox: MetricBbox
): NodedMetricLines {
  const segmentStrings = new ArrayList([]);

  for (const line of coastlineLines) {
    if (line.coordinates.length < 2) continue;
    segmentStrings.add(
      new NodedSegmentString(
        line.coordinates.map(([x, y]) => new Coordinate(x, y)),
        { kind: "coastline", sourceId: line.sourceId }
      )
    );
  }

  for (const [index, coordinates] of buildMetricViewportBoundary(bbox).entries()) {
    segmentStrings.add(
      new NodedSegmentString(
        coordinates.map(([x, y]) => new Coordinate(x, y)),
        { kind: "viewport-boundary", sourceId: `viewport-${index}` }
      )
    );
  }

  const snapRounder = new MCIndexSnapRounder(new PrecisionModel(TOPOLOGY_PRECISION_SCALE));
  snapRounder.computeNodes(segmentStrings);
  const nodedSubstrings = snapRounder.getNodedSubstrings();
  const segments: NodedMetricSegment[] = [];

  for (const segmentString of nodedSubstrings.toArray()) {
    const data = segmentString.getData() as {
      kind: "coastline" | "viewport-boundary";
      sourceId: string;
    };
    const coordinates = segmentString.getCoordinates() as Array<{ x: number; y: number }>;
    for (let index = 0; index < coordinates.length - 1; index++) {
      const start: MetricPoint = [coordinates[index].x, coordinates[index].y];
      const end: MetricPoint = [coordinates[index + 1].x, coordinates[index + 1].y];
      if (metricPointsEqual(start, end)) continue;
      segments.push({ kind: data.kind, sourceId: data.sourceId, start, end });
    }
  }

  return { segments };
}

export function buildTopologyFaces(
  coastlineLines: DirectedMetricLine[],
  bbox: MetricBbox,
  simplificationToleranceMeters: number
): TopologyFaceResult {
  const diagnostics: TopologyFaceDiagnostics = {
    nodedSegments: 0,
    matchedCoastlineSegments: 0,
    unmatchedCoastlineSegments: 0,
    candidateFaces: 0,
    acceptedFaces: 0,
    rejectedConflictFaces: 0,
    rejectedInsufficientSupportFaces: 0,
    nodeMs: 0,
    polygonizeMs: 0,
    classifyMs: 0,
  };
  const nodeStart = performance.now();
  const noded = nodeDirectedMetricLines(coastlineLines, bbox);
  diagnostics.nodeMs = performance.now() - nodeStart;
  diagnostics.nodedSegments = noded.segments.length;
  const polygonizeStart = performance.now();
  const polygonizer = new Polygonizer();
  const uniqueEdges = new Map<string, NodedMetricSegment>();

  for (const segment of noded.segments) {
    const { key } = metricEdgeKey(segment.start, segment.end);
    if (!uniqueEdges.has(key)) uniqueEdges.set(key, segment);
  }

  const lineGeometries = new ArrayList([]);
  for (const segment of uniqueEdges.values()) {
    lineGeometries.add(
      geometryFactory.createLineString([
        new Coordinate(segment.start[0], segment.start[1]),
        new Coordinate(segment.end[0], segment.end[1]),
      ])
    );
  }
  polygonizer.add(lineGeometries);

  const polygonCollection = polygonizer.getPolygons();
  const candidateFaces = polygonCollection
    ? polygonCollection
        .toArray()
        .map((geometry) => metricPolygonFromGeometry(geometry))
        .filter((polygon): polygon is MetricPoint[][] => polygon !== null)
        .filter((polygon) => metricPolygonArea(polygon) > MIN_FACE_AREA_M2)
    : [];
  diagnostics.candidateFaces = candidateFaces.length;
  diagnostics.polygonizeMs = performance.now() - polygonizeStart;

  const classifyStart = performance.now();
  const faceEdges = buildFaceEdgeIndex(candidateFaces);
  const evidence = candidateFaces.map(() => ({ water: 0, land: 0 }));
  const countedEvidence = new Set<string>();

  for (const segment of noded.segments) {
    if (segment.kind !== "coastline") continue;
    const edge = metricEdgeKey(segment.start, segment.end);
    const adjacentFaces = faceEdges.get(edge.key);
    if (!adjacentFaces || adjacentFaces.length === 0) {
      diagnostics.unmatchedCoastlineSegments++;
      continue;
    }

    diagnostics.matchedCoastlineSegments++;
    const length = metricDistance(segment.start, segment.end);
    for (const adjacentFace of adjacentFaces) {
      const sameDirection = edge.forward === adjacentFace.forward;
      const side = sameDirection ? adjacentFace.faceSide : oppositeSide(adjacentFace.faceSide);
      // The same source can revisit a noded edge through relation expansion. It
      // contributes evidence once, so duplicated metadata cannot amplify a vote.
      const evidenceKey = `${segment.sourceId}|${edge.key}|${adjacentFace.faceIndex}|${side}`;
      if (countedEvidence.has(evidenceKey)) continue;
      countedEvidence.add(evidenceKey);
      evidence[adjacentFace.faceIndex][side === "right" ? "water" : "land"] += length;
    }
  }

  const minimumSupport = Math.max(
    MIN_DIRECTIONAL_SUPPORT_METERS,
    simplificationToleranceMeters * 4
  );
  const acceptedFaces: MetricPoint[][][] = [];

  for (let faceIndex = 0; faceIndex < candidateFaces.length; faceIndex++) {
    const face = candidateFaces[faceIndex];
    const faceEvidence = evidence[faceIndex];
    if (faceEvidence.water > 0 && faceEvidence.land > METRIC_EPSILON) {
      diagnostics.rejectedConflictFaces++;
      continue;
    }
    if (
      faceEvidence.water < minimumSupport ||
      faceEvidence.land > METRIC_EPSILON ||
      !metricPolygonTouchesBoundary(face, bbox)
    ) {
      diagnostics.rejectedInsufficientSupportFaces++;
      continue;
    }
    acceptedFaces.push(face);
  }

  diagnostics.acceptedFaces = acceptedFaces.length;
  diagnostics.classifyMs = performance.now() - classifyStart;
  return { acceptedFaces, diagnostics };
}

function metricPointsEqual(a: MetricPoint, b: MetricPoint): boolean {
  return Math.abs(a[0] - b[0]) <= METRIC_EPSILON && Math.abs(a[1] - b[1]) <= METRIC_EPSILON;
}

function undirectedCleaningEdgeKey(start: MetricPoint, end: MetricPoint): string {
  const startKey = cleaningPointKey(start);
  const endKey = cleaningPointKey(end);
  return startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
}

function cleaningPointKey([x, y]: MetricPoint): string {
  return `${roundMetricCoordinate(x, METRIC_COORDINATE_DIGITS)},${roundMetricCoordinate(y, METRIC_COORDINATE_DIGITS)}`;
}

function roundMetricCoordinate(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

interface FaceEdgeAdjacency {
  faceIndex: number;
  faceSide: "left" | "right";
  forward: boolean;
}

function buildMetricViewportBoundary(bbox: MetricBbox): MetricPoint[][] {
  const [minX, minY, maxX, maxY] = bbox;
  return [
    [
      [minX, minY],
      [maxX, minY],
    ],
    [
      [maxX, minY],
      [maxX, maxY],
    ],
    [
      [maxX, maxY],
      [minX, maxY],
    ],
    [
      [minX, maxY],
      [minX, minY],
    ],
  ];
}

function metricPolygonFromGeometry(geometry: unknown): MetricPoint[][] | null {
  if (!IsValidOp.isValid(geometry)) return null;
  const geoJson = geoJsonWriter.write(geometry as never) as {
    type?: string;
    coordinates?: MetricPoint[][];
  };
  if (geoJson.type !== "Polygon" || !Array.isArray(geoJson.coordinates)) return null;
  return geoJson.coordinates.map((ring) => ring.map(([x, y]) => [x, y]));
}

function buildFaceEdgeIndex(faces: MetricPoint[][][]): Map<string, FaceEdgeAdjacency[]> {
  const index = new Map<string, FaceEdgeAdjacency[]>();

  for (let faceIndex = 0; faceIndex < faces.length; faceIndex++) {
    const face = faces[faceIndex];
    for (let ringIndex = 0; ringIndex < face.length; ringIndex++) {
      const ring = face[ringIndex];
      const faceSide = determineFaceSideForRing(ring, ringIndex > 0);

      for (let pointIndex = 0; pointIndex < ring.length - 1; pointIndex++) {
        const edge = metricEdgeKey(ring[pointIndex], ring[pointIndex + 1]);
        const adjacency: FaceEdgeAdjacency = {
          faceIndex,
          faceSide,
          forward: edge.forward,
        };
        const bucket = index.get(edge.key);
        if (bucket) bucket.push(adjacency);
        else index.set(edge.key, [adjacency]);
      }
    }
  }

  return index;
}

export function determineFaceSideForRing(ring: MetricPoint[], isHole: boolean): "left" | "right" {
  // An exterior face lies inside its ring; a polygon face lies outside a hole.
  // Ring winding therefore has the opposite meaning for holes.
  const counterClockwise = signedRingArea(ring) > 0;
  if (isHole) return counterClockwise ? "right" : "left";
  return counterClockwise ? "left" : "right";
}

function metricEdgeKey(start: MetricPoint, end: MetricPoint): { key: string; forward: boolean } {
  // Snap-rounding and face indexing share this millimetre grid. Comparing the
  // direction bit later recovers left/right adjacency without offset samples.
  const startKey = preciseMetricPointKey(start);
  const endKey = preciseMetricPointKey(end);
  return startKey < endKey
    ? { key: `${startKey}|${endKey}`, forward: true }
    : { key: `${endKey}|${startKey}`, forward: false };
}

function preciseMetricPointKey([x, y]: MetricPoint): string {
  return `${Math.round(x * TOPOLOGY_PRECISION_SCALE)},${Math.round(y * TOPOLOGY_PRECISION_SCALE)}`;
}

function signedRingArea(ring: MetricPoint[]): number {
  let twiceArea = 0;
  for (let index = 0; index < ring.length - 1; index++) {
    twiceArea += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return twiceArea * 0.5;
}

function metricPolygonArea(polygon: MetricPoint[][]): number {
  if (polygon.length === 0) return 0;
  return Math.max(
    0,
    Math.abs(signedRingArea(polygon[0])) -
      polygon.slice(1).reduce((total, ring) => total + Math.abs(signedRingArea(ring)), 0)
  );
}

function metricPolygonTouchesBoundary(polygon: MetricPoint[][], bbox: MetricBbox): boolean {
  const [minX, minY, maxX, maxY] = bbox;
  return polygon[0]?.some(
    ([x, y]) =>
      Math.abs(x - minX) <= METRIC_EPSILON ||
      Math.abs(x - maxX) <= METRIC_EPSILON ||
      Math.abs(y - minY) <= METRIC_EPSILON ||
      Math.abs(y - maxY) <= METRIC_EPSILON
  );
}

function metricDistance(a: MetricPoint, b: MetricPoint): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function oppositeSide(side: "left" | "right"): "left" | "right" {
  return side === "left" ? "right" : "left";
}

function cloneMetricLines(lines: DirectedMetricLine[]): DirectedMetricLine[] {
  return lines.map((line) => ({
    sourceId: line.sourceId,
    closed: line.closed,
    coordinates: line.coordinates.map(([x, y]) => [x, y]),
  }));
}

function lineStructureMatches(before: DirectedMetricLine, after: DirectedMetricLine): boolean {
  if (after.coordinates.length < (before.closed ? 4 : 2)) return false;
  if (!metricPointsEqual(before.coordinates[0], after.coordinates[0])) return false;
  if (!metricPointsEqual(before.coordinates.at(-1)!, after.coordinates.at(-1)!)) return false;
  if (before.closed !== metricPointsEqual(after.coordinates[0], after.coordinates.at(-1)!)) {
    return false;
  }
  if (!before.closed) return true;
  return (
    Math.sign(signedRingArea(before.coordinates)) === Math.sign(signedRingArea(after.coordinates))
  );
}
