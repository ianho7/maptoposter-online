import { describe, expect, it } from "bun:test";
import osmtogeojson from "osmtogeojson";
import type { FeatureCollection, LineString, Polygon } from "geojson";
import {
  buildSeaPolygonsFromCoastlines,
  buildSeaPolygonsWithDiagnostics,
  buildViewportBbox,
  extractCoastlineFeatures,
  mergeSeaPolygonsIntoWaterGeoJSON,
} from "./sea-polygons";

describe("sea polygon generation", () => {
  it("extracts coastline line features from water geojson", () => {
    const waterGeo: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { natural: "coastline" },
          geometry: {
            type: "LineString",
            coordinates: [
              [0, -2],
              [0, 2],
            ],
          } satisfies LineString,
        },
        {
          type: "Feature",
          properties: { natural: "water" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [1, 1],
                [2, 1],
                [2, 2],
                [1, 2],
                [1, 1],
              ],
            ],
          } satisfies Polygon,
        },
      ],
    };

    const coastlines = extractCoastlineFeatures(waterGeo);
    expect(coastlines).toHaveLength(1);
    expect(coastlines[0].properties?.natural).toBe("coastline");
  });

  it("uses the right side of a directed coastline as water", () => {
    const coastlineFeatures: FeatureCollection["features"] = [
      {
        type: "Feature",
        properties: { natural: "coastline" },
        geometry: {
          type: "LineString",
          coordinates: [
            [0, 2],
            [0, -2],
          ],
        },
      },
    ];

    const seaPolygons = buildSeaPolygonsFromCoastlines(
      coastlineFeatures as any,
      [-1, -1, 1, 1],
      [-0.5, 0]
    );

    expect(seaPolygons).toHaveLength(1);
    expect(seaPolygons[0].properties?.generated).toBe("coastline-sea");
    expect(seaPolygons[0].properties?.classification).toBe("right-side-confidence");
    expect(pointInPolygon([-0.5, 0], seaPolygons[0].geometry)).toBe(true);
    expect(pointInPolygon([0.5, 0], seaPolygons[0].geometry)).toBe(false);
  });

  it("reverses the selected sea face when coastline direction reverses", () => {
    const coastlineFeatures: FeatureCollection["features"] = [
      {
        type: "Feature",
        properties: { natural: "coastline" },
        geometry: {
          type: "LineString",
          coordinates: [
            [0, -2],
            [0, 2],
          ],
        },
      },
    ];

    const seaPolygons = buildSeaPolygonsFromCoastlines(
      coastlineFeatures as any,
      [-1, -1, 1, 1],
      [-0.5, 0]
    );

    expect(seaPolygons).toHaveLength(1);
    expect(pointInPolygon([-0.5, 0], seaPolygons[0].geometry)).toBe(false);
    expect(pointInPolygon([0.5, 0], seaPolygons[0].geometry)).toBe(true);
  });

  it("reports bounded classifier diagnostics without per-segment logging", () => {
    const coastlineFeatures: FeatureCollection["features"] = [
      {
        type: "Feature",
        properties: { natural: "coastline" },
        geometry: {
          type: "LineString",
          coordinates: [
            [0, -2],
            [0, 2],
          ],
        },
      },
    ];

    const result = buildSeaPolygonsWithDiagnostics(coastlineFeatures as any, [-1, -1, 1, 1]);

    expect(result.polygons).toHaveLength(1);
    expect(result.diagnostics.generated_faces).toBe(1);
    expect(result.diagnostics.ambiguous_segments).toBe(0);
    expect(result.diagnostics.clip_ms).toBeGreaterThanOrEqual(0);
    expect(result.diagnostics.merge_ms).toBeGreaterThanOrEqual(0);
    expect(result.diagnostics.node_polygonize_ms).toBeGreaterThanOrEqual(0);
    expect(result.diagnostics.classify_ms).toBeGreaterThanOrEqual(0);
  });

  it("safely skips a NYC-scale dense coastline before noding when the segment budget is exceeded", () => {
    const coordinates = Array.from({ length: 12_004 }, (_, index) => [
      -2 + (index * 4) / 12_003,
      0,
    ]);
    const coastlineFeatures: FeatureCollection["features"] = [
      {
        type: "Feature",
        properties: { natural: "coastline" },
        geometry: { type: "LineString", coordinates },
      },
    ];

    const result = buildSeaPolygonsWithDiagnostics(coastlineFeatures as any, [-1, -1, 1, 1]);

    expect(result.polygons).toHaveLength(0);
    expect(result.diagnostics.clipped_segments).toBeGreaterThan(6_000);
    expect(result.diagnostics.skipped_reason).toBe("processing-budget");
    expect(result.diagnostics.node_polygonize_ms).toBe(0);
  });

  it("does not turn a non-center land face into sea in a multi-land viewport", () => {
    const coastlineFeatures: FeatureCollection["features"] = [
      {
        type: "Feature",
        properties: { natural: "coastline" },
        geometry: {
          type: "LineString",
          // Water is west of this southbound coastline.
          coordinates: [
            [-0.5, 2],
            [-0.5, -2],
          ],
        },
      },
      {
        type: "Feature",
        properties: { natural: "coastline" },
        geometry: {
          type: "LineString",
          // Water is east of this northbound coastline.
          coordinates: [
            [0, -2],
            [0, 2],
          ],
        },
      },
      {
        type: "Feature",
        properties: { natural: "coastline" },
        geometry: {
          type: "LineString",
          // Water is west of this southbound coastline; the outer east face is land.
          coordinates: [
            [0.5, 2],
            [0.5, -2],
          ],
        },
      },
    ];

    const seaPolygons = buildSeaPolygonsFromCoastlines(
      coastlineFeatures as any,
      [-1, -1, 1, 1],
      [-0.25, 0]
    );

    expect(isCoveredByAnySea([-0.75, 0], seaPolygons)).toBe(true);
    expect(isCoveredByAnySea([0.25, 0], seaPolygons)).toBe(true);
    expect(isCoveredByAnySea([-0.25, 0], seaPolygons)).toBe(false);
    expect(isCoveredByAnySea([0.75, 0], seaPolygons)).toBe(false);
  });

  it("returns no sea polygon when linework cannot form a closed region", () => {
    const coastlineFeatures: FeatureCollection["features"] = [
      {
        type: "Feature",
        properties: { natural: "coastline" },
        geometry: {
          type: "LineString",
          coordinates: [
            [-0.5, -0.2],
            [0.5, 0.2],
          ],
        },
      },
    ];

    const seaPolygons = buildSeaPolygonsFromCoastlines(
      coastlineFeatures as any,
      [-1, -1, 1, 1],
      [0, 0]
    );

    expect(seaPolygons).toHaveLength(0);
  });

  it("merges connected coastline segments before polygonizing", () => {
    const coastlineFeatures: FeatureCollection["features"] = [
      {
        type: "Feature",
        properties: { natural: "coastline" },
        geometry: {
          type: "LineString",
          coordinates: [
            [0, 2],
            [0, 0],
          ],
        },
      },
      {
        type: "Feature",
        properties: { natural: "coastline" },
        geometry: {
          type: "LineString",
          coordinates: [
            [0, 0],
            [0, -2],
          ],
        },
      },
    ];

    const seaPolygons = buildSeaPolygonsFromCoastlines(
      coastlineFeatures as any,
      [-1, -1, 1, 1],
      [0.5, 0]
    );

    expect(seaPolygons).toHaveLength(1);
    expect(pointInPolygon([-0.5, 0], seaPolygons[0].geometry)).toBe(true);
  });

  it("merges generated sea polygons back into the water feature collection", () => {
    const waterGeo: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { natural: "coastline" },
          geometry: {
            type: "LineString",
            coordinates: [
              [0, -2],
              [0, 2],
            ],
          },
        },
        {
          type: "Feature",
          properties: { natural: "water" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [0.2, 0.2],
                [0.4, 0.2],
                [0.4, 0.4],
                [0.2, 0.4],
                [0.2, 0.2],
              ],
            ],
          },
        },
      ],
    };

    const merged = mergeSeaPolygonsIntoWaterGeoJSON(waterGeo, {
      centerLat: 0,
      centerLng: 0.5,
      baseRadiusMeters: 111_320,
      aspectRatio: 1,
    });

    expect(merged.features.length).toBeGreaterThan(waterGeo.features.length);
    expect(
      merged.features.some((feature) => feature.properties?.generated === "coastline-sea")
    ).toBe(true);
  });

  it("does not regenerate sea polygons when cached water is already merged", () => {
    const waterGeo: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { natural: "coastline" },
          geometry: {
            type: "LineString",
            coordinates: [
              [0, -2],
              [0, 2],
            ],
          },
        },
        {
          type: "Feature",
          properties: {
            generated: "coastline-sea",
            natural: "sea",
            generator_version: "directed-coastline-v1",
          },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-1, -1],
                [0, -1],
                [0, 1],
                [-1, 1],
                [-1, -1],
              ],
            ],
          },
        },
      ],
    };

    const merged = mergeSeaPolygonsIntoWaterGeoJSON(waterGeo, {
      centerLat: 0,
      centerLng: 0.5,
      baseRadiusMeters: 111_320,
      aspectRatio: 1,
    });

    expect(merged).toBe(waterGeo);
    expect(
      merged.features.filter((feature) => feature.properties?.generated === "coastline-sea")
    ).toHaveLength(1);
  });

  it("replaces legacy generated sea instead of reusing it as current cache data", () => {
    const waterGeo: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { natural: "coastline" },
          geometry: {
            type: "LineString",
            coordinates: [
              [0, -2],
              [0, 2],
            ],
          },
        },
        {
          type: "Feature",
          properties: {
            generated: "coastline-sea",
            natural: "sea",
            generator_version: "legacy-v0",
          },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-1, -1],
                [0, -1],
                [0, 1],
                [-1, 1],
                [-1, -1],
              ],
            ],
          },
        },
      ],
    };

    const merged = mergeSeaPolygonsIntoWaterGeoJSON(waterGeo, {
      centerLat: 0,
      centerLng: 0,
      baseRadiusMeters: 111_320,
      aspectRatio: 1,
    });

    const generated = merged.features.filter(
      (feature) => feature.properties?.generated === "coastline-sea"
    );
    expect(generated).toHaveLength(1);
    expect(generated[0].properties?.generator_version).toBe("directed-coastline-v1");
    expect(pointInPolygon([-0.5, 0], generated[0].geometry as Polygon)).toBe(false);
    expect(pointInPolygon([0.5, 0], generated[0].geometry as Polygon)).toBe(true);
  });

  it("builds viewport bbox using aspect ratio", () => {
    const bbox = buildViewportBbox({
      centerLat: 20,
      centerLng: 110,
      baseRadiusMeters: 1000,
      aspectRatio: 2,
    });

    expect(bbox[0]).toBeLessThan(110);
    expect(bbox[2]).toBeGreaterThan(110);
    expect(bbox[1]).toBeLessThan(20);
    expect(bbox[3]).toBeGreaterThan(20);
  });

  it("prefers an explicit viewport bbox when one is provided", () => {
    const bbox = buildViewportBbox({
      centerLat: 20,
      centerLng: 110,
      baseRadiusMeters: 1000,
      aspectRatio: 2,
      viewportBbox: [109, 19, 111, 21],
    });

    expect(bbox).toEqual([109, 19, 111, 21]);
  });

  it("keeps the Haikou sample free of self-intersecting generated sea polygons", async () => {
    const samplePath = new URL("../../docs/inner-docs/water_result.json", import.meta.url);
    const raw = JSON.parse(await Bun.file(samplePath).text());
    const waterGeo = osmtogeojson(raw) as FeatureCollection;

    const merged = mergeSeaPolygonsIntoWaterGeoJSON(waterGeo, {
      centerLat: 20.0462,
      centerLng: 110.1957,
      baseRadiusMeters: 14_000,
      aspectRatio: 0.75,
    });

    const generated = merged.features.filter(
      (feature): feature is FeatureCollection["features"][number] => {
        return (
          feature.properties?.generated === "coastline-sea" && feature.geometry.type === "Polygon"
        );
      }
    );

    expect(generated.length).toBeGreaterThan(0);

    for (const feature of generated) {
      expect(countSelfIntersections(feature.geometry.coordinates[0] as [number, number][])).toBe(0);
    }
  });
});

function pointInPolygon(point: [number, number], polygon: Polygon): boolean {
  if (polygon.coordinates.length === 0) {
    return false;
  }

  if (!pointInRing(point, polygon.coordinates[0] as [number, number][])) {
    return false;
  }

  for (let i = 1; i < polygon.coordinates.length; i++) {
    if (pointInRing(point, polygon.coordinates[i] as [number, number][])) {
      return false;
    }
  }

  return true;
}

function isCoveredByAnySea(
  point: [number, number],
  seaPolygons: Array<{ geometry: Polygon }>
): boolean {
  return seaPolygons.some((feature) => pointInPolygon(point, feature.geometry));
}

function pointInRing(point: [number, number], ring: [number, number][]): boolean {
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

function countSelfIntersections(ring: [number, number][]): number {
  let intersections = 0;

  for (let i = 0; i < ring.length - 1; i++) {
    const a1 = ring[i];
    const a2 = ring[i + 1];

    for (let j = i + 2; j < ring.length - 1; j++) {
      if (i === 0 && j === ring.length - 2) {
        continue;
      }

      const b1 = ring[j];
      const b2 = ring[j + 1];

      if (segmentsIntersect(a1, a2, b1, b2)) {
        intersections++;
      }
    }
  }

  return intersections;
}

function segmentsIntersect(
  a1: [number, number],
  a2: [number, number],
  b1: [number, number],
  b2: [number, number]
): boolean {
  const d1 = direction(a1, a2, b1);
  const d2 = direction(a1, a2, b2);
  const d3 = direction(b1, b2, a1);
  const d4 = direction(b1, b2, a2);

  return d1 * d2 < 0 && d3 * d4 < 0;
}

function direction(a: [number, number], b: [number, number], c: [number, number]): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
