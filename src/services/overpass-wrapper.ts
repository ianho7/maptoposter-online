/**
 * Overpass-Client 包装层
 *
 * 用于将外部构造好的 GeoJSON Polygon 传给 overpass-client，
 * 然后调用 overpass-client 库获取数据，并转换回 GeoJSON.FeatureCollection 格式。
 *
 * 切换说明:
 *   - 在 data-worker.ts 中修改 USE_OVERPASS_CLIENT 变量即可切换新旧实现
 *   - true  = 使用 overpass-client (本文件)
 *   - false = 使用 utils.ts 中的原始函数
 */

import osmtogeojson from "osmtogeojson";
import type { Feature, Polygon } from "geojson";
import {
  downloadRoads,
  downloadParks,
  downloadWater,
  downloadPOIs,
  type NetworkType,
  type OverpassProgressCallback,
} from "./overpass-client";
import { log } from "./overpass-client";

const DRIVE_SERVICE_RADIUS_THRESHOLD_METERS = 15_000;

type TerrainFeatureType = "water" | "parks";

const WATER_NATURAL_VALUES = new Set(["water", "coastline", "bay", "strait", "cape", "sea"]);
const WATER_VALUES = new Set(["lake", "reservoir", "pond", "lagoon", "basin"]);
const WATER_PLACE_VALUES = new Set(["sea", "ocean"]);
const PARK_LEISURE_VALUES = new Set([
  "park",
  "garden",
  "nature_reserve",
  "golf_course",
  "recreation_ground",
]);
const PARK_NATURAL_VALUES = new Set(["wood", "scrub", "grassland", "heath", "wetland", "fell", "beach"]);
const PARK_LANDUSE_VALUES = new Set(["forest", "grass", "meadow", "village_green", "allotments"]);

// OSM Overpass API 返回的 JSON 结构
interface OverpassResult {
  elements: OSMElement[];
}
interface OSMElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
  members?: OSMElement[];
  [key: string]: unknown;
}

function pickRicherArray<T>(current?: T[], incoming?: T[]): T[] | undefined {
  if (!current || current.length === 0) return incoming;
  if (!incoming || incoming.length === 0) return current;
  return incoming.length > current.length ? incoming : current;
}

export function deduplicateOverpassElements(elements: OSMElement[]): OSMElement[] {
  const deduped = new Map<string, OSMElement>();

  for (const element of elements) {
    const key = `${element.type}:${element.id}`;
    const existing = deduped.get(key);

    if (!existing) {
      deduped.set(key, element);
      continue;
    }

    deduped.set(key, {
      ...existing,
      ...element,
      tags: {
        ...existing.tags,
        ...element.tags,
      },
      nodes: pickRicherArray(existing.nodes, element.nodes),
      geometry: pickRicherArray(existing.geometry, element.geometry),
      members: pickRicherArray(existing.members, element.members),
    });
  }

  return Array.from(deduped.values());
}

function hasTagValue(
  properties: Record<string, unknown>,
  key: string,
  acceptedValues: Set<string>
): boolean {
  const value = properties[key];
  return typeof value === "string" && acceptedValues.has(value);
}

function isWaterFeature(properties: Record<string, unknown>): boolean {
  // The `>;` clause used to fetch relation members can return island ways in a
  // water response. Islands are land even when they are also members of a
  // water multipolygon, and must never be painted as water.
  if (properties.place === "island") {
    return false;
  }

  return (
    hasTagValue(properties, "natural", WATER_NATURAL_VALUES) ||
    typeof properties.waterway === "string" ||
    hasTagValue(properties, "place", WATER_PLACE_VALUES) ||
    hasTagValue(properties, "water", WATER_VALUES) ||
    properties.landuse === "reservoir"
  );
}

function isParkFeature(properties: Record<string, unknown>): boolean {
  return (
    hasTagValue(properties, "leisure", PARK_LEISURE_VALUES) ||
    hasTagValue(properties, "natural", PARK_NATURAL_VALUES) ||
    hasTagValue(properties, "landuse", PARK_LANDUSE_VALUES)
  );
}

/**
 * Keep only semantically requested terrain features after osmtogeojson has
 * used recursive OSM members to assemble relations. The members are needed
 * during conversion, but untagged/foreign members must not leak into a
 * render layer merely because they are polygons.
 */
export function filterTerrainGeoJSON(
  geojson: GeoJSON.FeatureCollection,
  type: TerrainFeatureType
): GeoJSON.FeatureCollection {
  const accepts = type === "water" ? isWaterFeature : isParkFeature;

  return {
    ...geojson,
    features: geojson.features.filter((feature) =>
      accepts((feature.properties ?? {}) as Record<string, unknown>)
    ),
  };
}

/**
 * 将 Overpass JSON 数组转换为 GeoJSON.FeatureCollection
 * @param results Overpass JSON 数组
 */
function convertToGeoJSON(results: Record<string, unknown>[]): GeoJSON.FeatureCollection | null {
  if (!results || results.length === 0) {
    return null;
  }

  // 合并所有分块数据中的 elements
  const allElements: OSMElement[] = results.flatMap(
    (res) => (res as unknown as OverpassResult).elements || []
  );
  const dedupedElements = deduplicateOverpassElements(allElements);

  if (dedupedElements.length === 0) {
    log("warn", "Overpass response contained no elements after deduplication");
    return null;
  }

  // 使用 osmtogeojson 转换为 GeoJSON
  const geojson = osmtogeojson({ elements: dedupedElements } as unknown as Parameters<
    typeof osmtogeojson
  >[0]) as GeoJSON.FeatureCollection;

  return geojson;
}

/**
 * 下载道路网络数据 (包装层)
 *
 * @param region 下载区域 polygon
 * @param baseRadius 基础半径 (米)，仅用于 LOD/networkType 判定
 * @param lodMode 细节等级
 * @param onProgress 进度回调函数
 * @param preFetchedPauseMs 预先获取的等待毫秒数（可选，避免重复调用 getOverpassPause）
 */
export async function fetchGraphOverpass(
  region: Feature<Polygon>,
  baseRadius: number,
  lodMode: "simplified" | "detailed" = "simplified",
  onProgress?: OverpassProgressCallback,
  preFetchedPauseMs?: number
): Promise<GeoJSON.FeatureCollection | null> {
  const coords = region.geometry.coordinates[0] ?? [];
  const firstCoord = coords[0] || [];
  log(
    "info",
    `[fetchGraphOverpass] polygon ready, baseRadius=${baseRadius}m, firstPoint=[lat=${firstCoord[1]?.toFixed(4)}, lng=${firstCoord[0]?.toFixed(4)}]`
  );

  const networkType = resolveRoadNetworkType(baseRadius, lodMode);

  log(
    "info",
    `[fetchGraphOverpass] lodMode=${lodMode}, baseRadius=${baseRadius}m, networkType=${networkType}, preFetchedPauseMs=${preFetchedPauseMs}`
  );

  try {
    const results = await downloadRoads(region, networkType, onProgress, preFetchedPauseMs);
    return convertToGeoJSON(results);
  } catch (error) {
    log("error", `fetchGraphOverpass failed: ${error}`);
    throw new Error(
      `fetchGraphOverpass failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function resolveRoadNetworkType(
  baseRadius: number,
  lodMode: "simplified" | "detailed"
): NetworkType {
  if (lodMode === "detailed") {
    return "all";
  }

  return baseRadius <= DRIVE_SERVICE_RADIUS_THRESHOLD_METERS ? "all" : "drive";
}

/**
 * 下载地理要素数据 (水体/公园) (包装层)
 *
 * @param region 下载区域 polygon
 * @param type 'water' | 'parks'
 * @param onProgress 进度回调函数
 * @param preFetchedPauseMs 预先获取的等待毫秒数（可选，避免重复调用 getOverpassPause）
 */
export async function fetchFeaturesOverpass(
  region: Feature<Polygon>,
  type: "water" | "parks",
  onProgress?: OverpassProgressCallback,
  preFetchedPauseMs?: number
): Promise<GeoJSON.FeatureCollection | null> {
  log("info", `[fetchFeaturesOverpass] type=${type}, polygon ready`);

  try {
    let results;

    if (type === "water") {
      // 水体: natural=water, waterway=*
      results = await downloadWater(region, onProgress, preFetchedPauseMs);
    } else {
      // 公园: leisure=park/garden/nature_reserve
      results = await downloadParks(region, onProgress, preFetchedPauseMs);
    }

    const geojson = convertToGeoJSON(results);
    return geojson ? filterTerrainGeoJSON(geojson, type) : null;
  } catch (error) {
    log("error", `fetchFeaturesOverpass (${type}) failed: ${error}`);
    throw new Error(
      `fetchFeaturesOverpass (${type}) failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * 下载兴趣点数据 (POI) (包装层)
 *
 * @param region 下载区域 polygon
 * @param onProgress 进度回调函数
 * @param preFetchedPauseMs 预先获取的等待毫秒数（可选，避免重复调用 getOverpassPause）
 */
export async function fetchPOIsOverpass(
  region: Feature<Polygon>,
  onProgress?: OverpassProgressCallback,
  preFetchedPauseMs?: number
): Promise<GeoJSON.FeatureCollection | null> {
  log("info", "[fetchPOIsOverpass] polygon ready");

  try {
    // 下载所有 amenity 类型的 POI (amenityTypes 传 undefined 表示获取所有类型)
    const results = await downloadPOIs(region, onProgress, preFetchedPauseMs);
    return convertToGeoJSON(results);
  } catch (error) {
    log("error", `fetchPOIsOverpass failed: ${error}`);
    throw new Error(
      `fetchPOIsOverpass failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
