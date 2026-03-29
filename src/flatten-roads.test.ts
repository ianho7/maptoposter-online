import { describe, expect, it } from "bun:test";

import { flattenRoadsGeoJSON } from "./utils";

describe("flattenRoadsGeoJSON", () => {
  it("expands a MultiLineString into multiple road segments instead of keeping only the first line", () => {
    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { highway: "secondary" },
          geometry: {
            type: "MultiLineString",
            coordinates: [
              [
                [109.5, 18.2],
                [109.6, 18.3],
              ],
              [
                [109.7, 18.4],
                [109.8, 18.5],
                [109.9, 18.6],
              ],
            ],
          },
        } as GeoJSON.Feature,
      ],
    };

    const flattened = flattenRoadsGeoJSON(geojson);

    expect(flattened[0]).toBe(2);

    let offset = 1;

    expect(flattened[offset++]).toBe(2); // secondary
    expect(flattened[offset++]).toBe(2);
    expect(Array.from(flattened.slice(offset, offset + 4))).toEqual([109.5, 18.2, 109.6, 18.3]);
    offset += 4;

    expect(flattened[offset++]).toBe(2); // same type for second line
    expect(flattened[offset++]).toBe(3);
    expect(Array.from(flattened.slice(offset, offset + 6))).toEqual([
      109.7, 18.4, 109.8, 18.5, 109.9, 18.6,
    ]);
  });

  it("skips degenerate line segments shorter than two points", () => {
    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { highway: "residential" },
          geometry: {
            type: "MultiLineString",
            coordinates: [
              [[110.0, 18.0]],
              [
                [110.1, 18.1],
                [110.2, 18.2],
              ],
            ],
          },
        } as GeoJSON.Feature,
      ],
    };

    const flattened = flattenRoadsGeoJSON(geojson);

    expect(flattened[0]).toBe(1);
    expect(Array.from(flattened.slice(1, 7))).toEqual([4, 2, 110.1, 18.1, 110.2, 18.2]);
  });
});
