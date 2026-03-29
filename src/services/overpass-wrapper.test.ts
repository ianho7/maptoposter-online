import { describe, expect, it } from "bun:test";
import { deduplicateOverpassElements, resolveRoadNetworkType } from "./overpass-wrapper";

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
