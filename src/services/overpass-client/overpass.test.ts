import { describe, expect, it } from "bun:test";
import type { Feature, Polygon } from "geojson";

// 导入待测模块
import { overpassConfig } from "./config";
import { makeOverpassPolygonCoordStrs, polygonToOverpassCoordStr } from "./geo";
import { OverpassResponseError, parseResponse } from "./http";
import { downloadWater } from "./presets";
import { getOverpassPause, makeOverpassSettings } from "./overpass";
import { getNetworkFilter } from "./presets";

describe("Config Module", () => {
  it("should have default values", () => {
    expect(overpassConfig.requestsTimeout).toBe(180000);
    expect(overpassConfig.overpassRateLimit).toBe(true);
  });
});

describe("Geo Module", () => {
  it("should format coordinates correctly (lat lon with 6 decimals)", () => {
    const poly: Feature<Polygon> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [116.3000001, 39.9000001],
            [116.5000002, 39.9000002],
            [116.5000003, 40.0000003],
            [116.3000004, 40.0000004],
            [116.3000001, 39.9000001],
          ],
        ],
      },
    };

    const coordStr = polygonToOverpassCoordStr(poly);
    // 注意：lat 在前，lon 在后
    expect(coordStr).toBe(
      "39.900000 116.300000 39.900000 116.500000 40.000000 116.500000 40.000000 116.300000 39.900000 116.300000"
    );
  });

  it("should output valid polygon coord strs without splitting small area", () => {
    const poly: Feature<Polygon> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [116.3, 39.9],
            [116.31, 39.9],
            [116.31, 39.91],
            [116.3, 39.91],
            [116.3, 39.9],
          ],
        ],
      },
    };
    const strs = makeOverpassPolygonCoordStrs(poly);
    expect(strs.length).toBe(1);
    expect(typeof strs[0]).toBe("string");
  });

  it("should add overlap between adjacent sub-query polygons when subdivision is required", () => {
    const originalMaxArea = overpassConfig.maxQueryAreaSize;
    const originalOverlap = overpassConfig.subQueryOverlapMeters;

    try {
      overpassConfig.maxQueryAreaSize = 100_000_000;
      overpassConfig.subQueryOverlapMeters = 400;

      const poly: Feature<Polygon> = {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [109.0, 18.0],
              [109.4, 18.0],
              [109.4, 18.4],
              [109.0, 18.4],
              [109.0, 18.0],
            ],
          ],
        },
      };

      const strs = makeOverpassPolygonCoordStrs(poly);
      expect(strs.length).toBeGreaterThan(1);

      const boxes = strs.map(parseCoordStrBounds);
      let hasPositiveOverlap = false;

      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const lonOverlap =
            Math.min(boxes[i].maxLon, boxes[j].maxLon) - Math.max(boxes[i].minLon, boxes[j].minLon);
          const latOverlap =
            Math.min(boxes[i].maxLat, boxes[j].maxLat) - Math.max(boxes[i].minLat, boxes[j].minLat);

          if (lonOverlap > 0 && latOverlap > 0) {
            hasPositiveOverlap = true;
            break;
          }
        }

        if (hasPositiveOverlap) {
          break;
        }
      }

      expect(hasPositiveOverlap).toBe(true);
    } finally {
      overpassConfig.maxQueryAreaSize = originalMaxArea;
      overpassConfig.subQueryOverlapMeters = originalOverlap;
    }
  });
});

describe("Overpass Core Settings", () => {
  it("should make overpass settings string correctly", () => {
    overpassConfig.requestsTimeout = 60000; // 60s
    overpassConfig.overpassMemory = 1073741824;
    expect(makeOverpassSettings()).toBe("[out:json][timeout:60][maxsize:1073741824]");

    overpassConfig.overpassMemory = null;
    expect(makeOverpassSettings()).toBe("[out:json][timeout:60]");
  });
});

function parseCoordStrBounds(coordStr: string) {
  const values = coordStr.split(" ").map(Number);
  const lats: number[] = [];
  const lons: number[] = [];

  for (let i = 0; i < values.length; i += 2) {
    lats.push(values[i]);
    lons.push(values[i + 1]);
  }

  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons),
  };
}

describe("HTTP Module - parseResponse", () => {
  it("should detect remark field and throw OverpassResponseError", async () => {
    // 模拟带有 remark 的恶意"200 OK"响应
    const mockJson = {
      version: 0.6,
      generator: "Overpass API",
      remark: 'runtime error: Query timed out in "query" at line 1',
      elements: [],
    };
    const response = new Response(JSON.stringify(mockJson), {
      status: 200,
      headers: { "content-length": "100" },
    });
    Object.defineProperty(response, "url", { value: "https://example.com" });

    // 断言必须抛出指定的异常
    await expect(parseResponse(response)).rejects.toThrow(OverpassResponseError);
  });

  it("should pass cleanly if no remark is present", async () => {
    const mockJson = { elements: [{ type: "node", id: 1 }] };
    const response = new Response(JSON.stringify(mockJson), { status: 200 });
    Object.defineProperty(response, "url", { value: "https://example.com" });
    const data = await parseResponse(response);
    expect(data.elements).toBeDefined();
    expect((data.elements as any[])[0].id).toBe(1);
  });
});

describe("Presets Module", () => {
  it("should generate drive filter with correct exclusions", () => {
    const filter = getNetworkFilter("drive");
    expect(filter).toContain('["highway"]["area"!~"yes"]');
    expect(filter).toContain('["highway"!~"abandoned|');
    expect(filter).toContain('["motor_vehicle"!~"no"]');
    expect(filter).toContain('["service"!~"alley|');
  });

  it("should throw error for invalid network type", () => {
    // 使用 any 绕过 ts 类型检查来测试运行时的防御性
    expect(() => getNetworkFilter("invalid_type" as any)).toThrow();
  });

  it("should keep existing water tags and append new fill-friendly water tags", async () => {
    const originalFetch = globalThis.fetch;
    const originalRateLimit = overpassConfig.overpassRateLimit;
    const originalTimeout = overpassConfig.requestsTimeout;

    let capturedQuery = "";

    try {
      overpassConfig.overpassRateLimit = false;
      overpassConfig.requestsTimeout = 5_000;

      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith("/status")) {
          const response = new Response(
            "Connected as: 1\nCurrent time: 2026-03-25T00:00:00Z\nRate limit: 2\n2 slots available now.\n",
            { status: 200 }
          );
          Object.defineProperty(response, "url", { value: url });
          return response;
        }

        const body = String(init?.body ?? "");
        const encoded = body.startsWith("data=") ? body.slice(5) : body;
        capturedQuery = decodeURIComponent(encoded);

        const response = new Response(JSON.stringify({ elements: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
        Object.defineProperty(response, "url", { value: url });
        return response;
      }) as typeof fetch;

      const polygon: Feature<Polygon> = {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [110.2, 20.0],
              [110.3, 20.0],
              [110.3, 20.1],
              [110.2, 20.1],
              [110.2, 20.0],
            ],
          ],
        },
      };

      await downloadWater(polygon);

      expect(capturedQuery).toContain('["natural"="water"]');
      expect(capturedQuery).toContain('["natural"="coastline"]');
      expect(capturedQuery).toContain('["natural"="bay"]');
      expect(capturedQuery).toContain('["natural"="strait"]');
      expect(capturedQuery).toContain('["natural"="cape"]');
      expect(capturedQuery).toContain('["waterway"]');
      expect(capturedQuery).toContain('["place"="sea"]');
      expect(capturedQuery).toContain('["place"="ocean"]');

      expect(capturedQuery).toContain('["natural"="sea"]');
      expect(capturedQuery).toContain('["landuse"="reservoir"]');
      expect(capturedQuery).toContain('["water"="lake"]');
      expect(capturedQuery).toContain('["water"="reservoir"]');
      expect(capturedQuery).toContain('["water"="pond"]');
      expect(capturedQuery).toContain('["water"="lagoon"]');
      expect(capturedQuery).toContain('["water"="basin"]');
    } finally {
      globalThis.fetch = originalFetch;
      overpassConfig.overpassRateLimit = originalRateLimit;
      overpassConfig.requestsTimeout = originalTimeout;
    }
  });
});
