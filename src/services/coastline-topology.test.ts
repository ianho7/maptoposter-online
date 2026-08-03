import { describe, expect, it } from "bun:test";
import type { BBox } from "geojson";
import {
  cleanDirectedMetricLines,
  createLocalMetricProjection,
  calculateSimplificationToleranceMeters,
  buildTopologyFaces,
  determineFaceSideForRing,
  nodeDirectedMetricLines,
  projectLonLat,
  simplifyDirectedMetricLines,
  simplifyMetricLinesForBudget,
  unprojectMetricPoint,
} from "./coastline-topology";

describe("coastline topology preprocessing", () => {
  it("round-trips the Lisbon viewport corners through local metres", () => {
    const bbox: BBox = [-9.42, 38.48, -8.88, 38.98];
    const projection = createLocalMetricProjection(bbox);

    for (const point of [
      [bbox[0], bbox[1]],
      [bbox[0], bbox[3]],
      [bbox[2], bbox[1]],
      [bbox[2], bbox[3]],
      [-9.14843, 38.72635],
    ] as Array<[number, number]>) {
      const roundTripped = unprojectMetricPoint(projectLonLat(point, projection), projection);
      expect(roundTripped[0]).toBeCloseTo(point[0], 10);
      expect(roundTripped[1]).toBeCloseTo(point[1], 10);
    }
  });

  it("removes duplicate and zero-length edges while preserving direction and endpoints", () => {
    const result = cleanDirectedMetricLines([
      {
        sourceId: "open",
        closed: false,
        coordinates: [
          [0, 0],
          [0, 0],
          [10, 0],
          [20, 0],
        ],
      },
      {
        sourceId: "reverse-duplicate",
        closed: false,
        coordinates: [
          [20, 0],
          [10, 0],
          [0, 0],
        ],
      },
      {
        sourceId: "closed",
        closed: true,
        coordinates: [
          [30, 0],
          [40, 0],
          [40, 10],
          [30, 0],
        ],
      },
    ]);

    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toEqual({
      sourceId: "open",
      closed: false,
      coordinates: [
        [0, 0],
        [10, 0],
        [20, 0],
      ],
    });
    expect(result.lines[1].coordinates[0]).toEqual([30, 0]);
    expect(result.lines[1].coordinates.at(-1)).toEqual([30, 0]);
    expect(result.removedZeroLengthSegments).toBe(1);
    expect(result.removedDuplicateSegments).toBe(2);
  });

  it("removes a partially overlapping reverse edge without joining across the removed gap", () => {
    const result = cleanDirectedMetricLines([
      {
        sourceId: "base",
        closed: false,
        coordinates: [
          [0, 0],
          [10, 0],
          [20, 0],
        ],
      },
      {
        sourceId: "partial",
        closed: false,
        coordinates: [
          [30, 0],
          [20, 0],
          [10, 0],
          [40, 0],
        ],
      },
    ]);

    expect(result.removedDuplicateSegments).toBe(1);
    expect(result.lines.map((line) => line.coordinates)).toEqual([
      [
        [0, 0],
        [10, 0],
        [20, 0],
      ],
      [
        [30, 0],
        [20, 0],
      ],
      [
        [10, 0],
        [40, 0],
      ],
    ]);
  });

  it("topology-simplifies all components without changing their order, endpoints, or closure", () => {
    const denseOpen = Array.from(
      { length: 101 },
      (_, index) => [index, Math.sin(index) * 0.01] as [number, number]
    );
    const lines = [
      { sourceId: "open", closed: false, coordinates: denseOpen },
      {
        sourceId: "closed",
        closed: true,
        coordinates: [
          [200, 0],
          [250, 0],
          [250, 50],
          [200, 0],
        ] as Array<[number, number]>,
      },
    ];

    const result = simplifyDirectedMetricLines(lines, 1);

    expect(result.structurePreserved).toBe(true);
    expect(result.lines.map((line) => line.sourceId)).toEqual(["open", "closed"]);
    expect(result.lines[0].coordinates[0]).toEqual(lines[0].coordinates[0]);
    expect(result.lines[0].coordinates.at(-1)).toEqual(lines[0].coordinates.at(-1));
    expect(result.lines[0].coordinates.length).toBeLessThan(lines[0].coordinates.length);
    expect(result.lines[1].coordinates[0]).toEqual(result.lines[1].coordinates.at(-1));
  });

  it("keeps every original vertex within the requested simplification tolerance", () => {
    const coordinates = Array.from(
      { length: 101 },
      (_, index) => [index, Math.sin(index / 10) * 1.5] as [number, number]
    );
    const toleranceMeters = 2;
    const result = simplifyDirectedMetricLines(
      [{ sourceId: "curve", closed: false, coordinates }],
      toleranceMeters
    );

    expect(result.structurePreserved).toBe(true);
    expect(result.lines[0].coordinates.length).toBeLessThan(coordinates.length);
    expect(maxVertexDistanceToLine(coordinates, result.lines[0].coordinates)).toBeLessThanOrEqual(
      toleranceMeters
    );
  });

  it("uses a quarter-pixel tolerance first and never exceeds half a pixel", () => {
    const bbox: BBox = [-9.42, 38.48, -8.88, 38.98];
    const projection = createLocalMetricProjection(bbox);
    const quarterPixel = calculateSimplificationToleranceMeters(bbox, projection, 0.25);
    const halfPixel = calculateSimplificationToleranceMeters(bbox, projection, 0.5);

    expect(quarterPixel).toBeGreaterThan(0);
    expect(halfPixel).toBeCloseTo(quarterPixel * 2, 10);

    const denseLine = Array.from(
      { length: 12_004 },
      (_, index) => [index * 0.5, Math.sin(index / 20) * 0.01] as [number, number]
    );
    const result = simplifyMetricLinesForBudget(
      [{ sourceId: "dense", closed: false, coordinates: denseLine }],
      bbox,
      projection
    );

    expect(result.toleranceMeters).toBeLessThanOrEqual(halfPixel);
    expect(result.simplifiedSegments).toBeLessThanOrEqual(10_000);
    expect(result.exceededHardLimit).toBe(false);
  });

  it("safely reports a hard-budget failure after the half-pixel limit", () => {
    const bbox: BBox = [-0.01, -0.01, 0.01, 0.01];
    const projection = createLocalMetricProjection(bbox);
    const line = Array.from(
      { length: 202 },
      (_, index) => [index, index % 2 === 0 ? -10 : 10] as [number, number]
    );
    const result = simplifyMetricLinesForBudget(
      [{ sourceId: "complex", closed: false, coordinates: line }],
      bbox,
      projection,
      { targetSegmentCount: 100, hardSegmentLimit: 200 }
    );

    expect(result.toleranceMeters).toBe(
      calculateSimplificationToleranceMeters(bbox, projection, 0.5)
    );
    expect(result.simplifiedSegments).toBeGreaterThan(200);
    expect(result.exceededHardLimit).toBe(true);
  });

  it("keeps source and direction on coastline edges split at intersections", () => {
    const result = nodeDirectedMetricLines(
      [
        {
          sourceId: "horizontal",
          closed: false,
          coordinates: [
            [-10, 0],
            [10, 0],
          ],
        },
        {
          sourceId: "vertical",
          closed: false,
          coordinates: [
            [0, -10],
            [0, 10],
          ],
        },
      ],
      [-20, -20, 20, 20]
    );
    const coastlineEdges = result.segments.filter((segment) => segment.kind === "coastline");
    const boundaryEdges = result.segments.filter((segment) => segment.kind === "viewport-boundary");

    expect(coastlineEdges).toHaveLength(4);
    expect(coastlineEdges.filter((segment) => segment.sourceId === "horizontal")).toHaveLength(2);
    expect(
      coastlineEdges
        .filter((segment) => segment.sourceId === "horizontal")
        .every((segment) => segment.end[0] > segment.start[0])
    ).toBe(true);
    expect(boundaryEdges.length).toBeGreaterThanOrEqual(4);
    expect(boundaryEdges.every((segment) => segment.kind === "viewport-boundary")).toBe(true);
  });

  it("maps clockwise and counter-clockwise outer and hole rings to the correct face side", () => {
    const counterClockwise: Array<[number, number]> = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ];
    const clockwise = [...counterClockwise].reverse();

    expect(determineFaceSideForRing(counterClockwise, false)).toBe("left");
    expect(determineFaceSideForRing(clockwise, false)).toBe("right");
    expect(determineFaceSideForRing(counterClockwise, true)).toBe("right");
    expect(determineFaceSideForRing(clockwise, true)).toBe("left");
  });

  it("classifies faces from exact directed-edge adjacency and preserves an island hole", () => {
    const result = buildTopologyFaces(
      [
        {
          sourceId: "island",
          closed: true,
          coordinates: [
            [-5, -5],
            [5, -5],
            [5, 5],
            [-5, 5],
            [-5, -5],
          ],
        },
      ],
      [-20, -20, 20, 20],
      1
    );

    expect(result.acceptedFaces).toHaveLength(1);
    expect(metricPointInPolygon([15, 0], result.acceptedFaces[0])).toBe(true);
    expect(metricPointInPolygon([0, 0], result.acceptedFaces[0])).toBe(false);
    expect(result.diagnostics.rejectedConflictFaces).toBe(0);
    expect(result.diagnostics.matchedCoastlineSegments).toBeGreaterThan(0);
  });

  it("rejects only an unrelated ambiguous fragment instead of clearing a valid sea face", () => {
    const result = buildTopologyFaces(
      [
        {
          sourceId: "coast",
          closed: false,
          coordinates: [
            [0, -20],
            [0, 20],
          ],
        },
        {
          sourceId: "fragment",
          closed: false,
          coordinates: [
            [-18, -1],
            [-17, 1],
          ],
        },
      ],
      [-20, -20, 20, 20],
      1
    );

    expect(result.acceptedFaces.some((face) => metricPointInPolygon([5, 0], face))).toBe(true);
    expect(result.diagnostics.unmatchedCoastlineSegments).toBeGreaterThan(0);
  });

  it("rejects a conflicting face without deleting a separate trusted sea face", () => {
    const result = buildTopologyFaces(
      [
        {
          sourceId: "main-coast",
          closed: false,
          coordinates: [
            [0, -20],
            [0, 20],
          ],
        },
        {
          sourceId: "west-island",
          closed: true,
          coordinates: [
            [-15, -5],
            [-5, -5],
            [-5, 5],
            [-15, 5],
            [-15, -5],
          ],
        },
      ],
      [-20, -20, 20, 20],
      1
    );

    expect(result.acceptedFaces.some((face) => metricPointInPolygon([10, 0], face))).toBe(true);
    expect(result.diagnostics.rejectedConflictFaces).toBeGreaterThan(0);
  });
});

function metricPointInPolygon(point: [number, number], polygon: Array<Array<[number, number]>>) {
  if (!metricPointInRing(point, polygon[0])) return false;
  return polygon.slice(1).every((ring) => !metricPointInRing(point, ring));
}

function maxVertexDistanceToLine(
  points: Array<[number, number]>,
  line: Array<[number, number]>
): number {
  return Math.max(
    ...points.map((point) =>
      Math.min(
        ...line
          .slice(0, -1)
          .map((start, index) => pointToSegmentDistance(point, start, line[index + 1]))
      )
    )
  );
}

function pointToSegmentDistance(
  point: [number, number],
  start: [number, number],
  end: [number, number]
): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const ratio =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared)
        );
  return Math.hypot(point[0] - (start[0] + ratio * dx), point[1] - (start[1] + ratio * dy));
}

function metricPointInRing(point: [number, number], ring: Array<[number, number]>) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x, y] = ring[index];
    const [previousX, previousY] = ring[previous];
    if (
      y > point[1] !== previousY > point[1] &&
      point[0] < ((previousX - x) * (point[1] - y)) / (previousY - y) + x
    ) {
      inside = !inside;
    }
  }
  return inside;
}
