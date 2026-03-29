import { describe, expect, it } from "bun:test";
import {
  MAP_DATA_CACHE_VERSION,
  bboxToPolygon,
  buildCanonicalFetchRadiusMeters,
  buildCanonicalFetchViewportBbox,
  buildRenderViewportBbox,
} from "./poster-viewport";

describe("poster viewport helpers", () => {
  it("builds a stable canonical fetch bbox for the same center and base radius", () => {
    const first = buildCanonicalFetchViewportBbox({
      centerLat: 20.0462,
      centerLng: 110.1957,
      baseRadiusMeters: 15_000,
    });
    const second = buildCanonicalFetchViewportBbox({
      centerLat: 20.0462,
      centerLng: 110.1957,
      baseRadiusMeters: 15_000,
    });

    expect(first).toEqual(second);
  });

  it("builds a canonical fetch bbox that covers a wider render viewport", () => {
    const canonical = buildCanonicalFetchViewportBbox({
      centerLat: 20,
      centerLng: 110,
      baseRadiusMeters: 15_000,
    });
    const render = buildRenderViewportBbox({
      centerLat: 20,
      centerLng: 110,
      baseRadiusMeters: 15_000,
      aspectRatio: 16 / 9,
    });

    expect(canonical[0]).toBeLessThanOrEqual(render[0]);
    expect(canonical[1]).toBeLessThanOrEqual(render[1]);
    expect(canonical[2]).toBeGreaterThanOrEqual(render[2]);
    expect(canonical[3]).toBeGreaterThanOrEqual(render[3]);
  });

  it("converts a bbox into a closed polygon ring", () => {
    const polygon = bboxToPolygon([109, 18, 111, 20]);

    expect(polygon.geometry.type).toBe("Polygon");
    expect(polygon.geometry.coordinates[0]).toEqual([
      [109, 18],
      [111, 18],
      [111, 20],
      [109, 20],
      [109, 18],
    ]);
  });

  it("builds a canonical fallback circle radius that covers the canonical fetch viewport", () => {
    const radius = buildCanonicalFetchRadiusMeters(15_000);
    expect(radius).toBeGreaterThan(15_000);
  });

  it("exposes a cache version prefix for canonical fetch viewport data", () => {
    expect(MAP_DATA_CACHE_VERSION).toContain("canonical-fetch-viewport");
  });
});
