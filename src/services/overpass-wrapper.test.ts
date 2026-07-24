import { describe, expect, it } from "bun:test";
import {
  deduplicateOverpassElements,
  filterTerrainGeoJSON,
  resolveRoadNetworkType,
} from "./overpass-wrapper";

function polygonFeature(properties: Record<string, string>): GeoJSON.Feature {
  return {
    type: "Feature",
    properties,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [118.7, 32.0],
          [118.8, 32.0],
          [118.8, 32.1],
          [118.7, 32.1],
          [118.7, 32.0],
        ],
      ],
    },
  };
}

describe("overpass wrapper road network selection", () => {
  it("keeps detailed mode on the all network", () => {
    expect(resolveRoadNetworkType(15_000, "detailed")).toBe("all");
  });

  it("uses all for simplified mid-range posters up to 15km", () => {
    expect(resolveRoadNetworkType(5_000, "simplified")).toBe("all");
    expect(resolveRoadNetworkType(15_000, "simplified")).toBe("all");
  });

  it("falls back to drive only beyond the 15km simplified threshold", () => {
    expect(resolveRoadNetworkType(15_001, "simplified")).toBe("drive");
  });

  it("deduplicates overlapping overpass elements and keeps the richer way geometry", () => {
    const deduped = deduplicateOverpassElements([
      {
        type: "way",
        id: 1,
        nodes: [1, 2],
        geometry: [
          { lat: 18.1, lon: 109.5 },
          { lat: 18.2, lon: 109.6 },
        ],
        tags: { highway: "residential" },
      },
      {
        type: "way",
        id: 1,
        nodes: [1, 2, 3],
        geometry: [
          { lat: 18.1, lon: 109.5 },
          { lat: 18.2, lon: 109.6 },
          { lat: 18.3, lon: 109.7 },
        ],
        tags: { name: "Test Road" },
      },
      { type: "node", id: 1, lat: 18.1, lon: 109.5 },
      { type: "node", id: 1, lat: 18.1, lon: 109.5 },
    ] as any);

    expect(deduped).toHaveLength(2);

    const way = deduped.find((element) => element.type === "way");
    expect(way?.nodes).toEqual([1, 2, 3]);
    expect(way?.geometry).toHaveLength(3);
    expect(way?.tags).toEqual({ highway: "residential", name: "Test Road" });
  });
});

describe("overpass wrapper terrain filtering", () => {
  it("keeps only water-tagged features and drops recursive island members", () => {
    const filtered = filterTerrainGeoJSON(
      {
        type: "FeatureCollection",
        features: [
          polygonFeature({ natural: "water", water: "lake", name: "玄武湖" }),
          polygonFeature({ place: "island", name: "梁洲" }),
          polygonFeature({ natural: "wood", name: "鹭鸟岛" }),
        ],
      },
      "water"
    );

    expect(filtered.features.map((feature) => feature.properties?.name)).toEqual(["玄武湖"]);
  });

  it("keeps green land features while excluding recursively returned water members", () => {
    const filtered = filterTerrainGeoJSON(
      {
        type: "FeatureCollection",
        features: [
          polygonFeature({ natural: "wood", name: "鹭鸟岛" }),
          polygonFeature({ leisure: "park", name: "玄武公园" }),
          polygonFeature({ natural: "water", water: "lake", name: "玄武湖" }),
        ],
      },
      "parks"
    );

    expect(filtered.features.map((feature) => feature.properties?.name)).toEqual([
      "鹭鸟岛",
      "玄武公园",
    ]);
  });
});
