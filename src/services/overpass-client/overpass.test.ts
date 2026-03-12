import { describe, expect, it } from "bun:test";
import * as turf from "@turf/turf";
import type { Feature, Polygon } from "geojson";

// 导入待测模块
import { overpassConfig } from "./config";
import { makeOverpassPolygonCoordStrs, polygonToOverpassCoordStr } from "./geo";
import { OverpassResponseError, parseResponse } from "./http";
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
    const poly: Feature<Polygon> = turf.polygon([[
      [116.3000001, 39.9000001],
      [116.5000002, 39.9000002],
      [116.5000003, 40.0000003],
      [116.3000004, 40.0000004],
      [116.3000001, 39.9000001],
    ]]);
    
    const coordStr = polygonToOverpassCoordStr(poly);
    // 注意：lat 在前，lon 在后
    expect(coordStr).toBe(
      "39.900000 116.300000 39.900000 116.500000 40.000000 116.500000 40.000000 116.300000 39.900000 116.300000"
    );
  });

  it("should output valid polygon coord strs without splitting small area", () => {
    const poly = turf.polygon([[[116.3, 39.9], [116.31, 39.9], [116.31, 39.91], [116.3, 39.91], [116.3, 39.9]]]);
    const strs = makeOverpassPolygonCoordStrs(poly);
    expect(strs.length).toBe(1);
    expect(typeof strs[0]).toBe("string");
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

describe("HTTP Module - parseResponse", () => {
  it("should detect remark field and throw OverpassResponseError", async () => {
    // 模拟带有 remark 的恶意"200 OK"响应
    const mockJson = {
      version: 0.6,
      generator: "Overpass API",
      remark: "runtime error: Query timed out in \"query\" at line 1",
      elements: []
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
});
