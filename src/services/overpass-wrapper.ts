/**
 * Overpass-Client 包装层
 *
 * 用于将原始的 [lat, lng], radius 参数格式转换为 GeoJSON Polygon，
 * 然后调用 overpass-client 库获取数据，并转换回 GeoJSON.FeatureCollection 格式。
 *
 * 切换说明:
 *   - 在 data-worker.ts 中修改 USE_OVERPASS_CLIENT 变量即可切换新旧实现
 *   - true  = 使用 overpass-client (本文件)
 *   - false = 使用 utils.ts 中的原始函数
 */

import { point as turfPoint } from "@turf/helpers";
import { buffer } from "@turf/buffer";
import osmtogeojson from "osmtogeojson";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import {
  downloadRoads,
  downloadParks,
  downloadWater,
  downloadPOIs,
  type NetworkType,
  type OverpassProgressCallback,
} from "./overpass-client";
import { log } from "./overpass-client";

// 类型定义 (复用 utils.ts 的 Point 类型)
type Point = [number, number];

/**
 * 将 Overpass JSON 数组转换为 GeoJSON.FeatureCollection
 * @param results Overpass JSON 数组
 */
function convertToGeoJSON(results: Record<string, unknown>[]): GeoJSON.FeatureCollection | null {
  if (!results || results.length === 0) {
    return null;
  }

  // 合并所有分块数据中的 elements
  const allElements = results.flatMap((res) => (res as any).elements || []);

  if (allElements.length === 0) {
    return null;
  }

  // 使用 osmtogeojson 转换为 GeoJSON
  const geojson = osmtogeojson({ elements: allElements } as any) as GeoJSON.FeatureCollection;

  return geojson;
}

/**
 * 下载道路网络数据 (包装层)
 *
 * @param point 中心点坐标 [lng, lat]
 * @param dist 半径 (米)
 * @param lodMode 细节等级
 * @param onProgress 进度回调函数
 * @param preFetchedPauseMs 预先获取的等待毫秒数（可选，避免重复调用 getOverpassPause）
 */
export async function fetchGraphOverpass(
  point: Point,
  dist: number,
  lodMode: "simplified" | "detailed" = "simplified",
  onProgress?: OverpassProgressCallback,
  preFetchedPauseMs?: number
): Promise<GeoJSON.FeatureCollection | null> {
  // point 格式为 [lat, lon]，与旧函数兼容
  const [lat, lng] = point;

  // 将米转换为千米 (turf buffer 单位)
  const distKm = dist / 1000;

  // 生成圆形区域多边形 (使用 buffer) - turf 使用 [lng, lat] 顺序
  const centerPoint = turfPoint([lng, lat]);
  const polygon = buffer(centerPoint, distKm, { units: "kilometers", steps: 64 }) as
    | Feature<Polygon>
    | Feature<MultiPolygon>
    | null;

  if (!polygon) {
    log("error", "Failed to create polygon buffer for roads");
    return null;
  }

  // 调试日志：显示多边形坐标
  const coords =
    polygon.geometry.type === "Polygon"
      ? polygon.geometry.coordinates[0]
      : polygon.geometry.type === "MultiPolygon"
        ? polygon.geometry.coordinates[0][0]
        : [];
  const firstCoord = coords[0] || [];
  // turf 使用 [lng, lat]，所以 firstCoord 是 [lng, lat]
  log(
    "info",
    `[fetchGraphOverpass] polygon: center=[lat=${lat.toFixed(4)}, lng=${lng.toFixed(4)}], radius=${dist}m, firstPoint=[lat=${firstCoord[1]?.toFixed(4)}, lng=${firstCoord[0]?.toFixed(4)}]`
  );

  // 根据 lodMode 选择道路类型
  let networkType: NetworkType = "all";

  if (lodMode === "detailed") {
    // 细节模式：保留所有道路
    networkType = "all";
  } else {
    // 精简模式：根据半径选择
    if (dist > 5000) {
      // 大范围只保留主干道
      networkType = "drive";
    } else {
      // 小范围保留更多道路
      networkType = "drive_service";
    }
  }

  log(
    "info",
    `[fetchGraphOverpass] lodMode=${lodMode}, dist=${dist}m, networkType=${networkType}, preFetchedPauseMs=${preFetchedPauseMs}`
  );

  try {
    const results = await downloadRoads(polygon, networkType, onProgress, preFetchedPauseMs);
    return convertToGeoJSON(results);
  } catch (error) {
    log("error", `fetchGraphOverpass failed: ${error}`);
    return null;
  }
}

/**
 * 下载地理要素数据 (水体/公园) (包装层)
 *
 * @param point 中心点坐标 [lng, lat]
 * @param dist 半径 (米)
 * @param type 'water' | 'parks'
 * @param onProgress 进度回调函数
 * @param preFetchedPauseMs 预先获取的等待毫秒数（可选，避免重复调用 getOverpassPause）
 */
export async function fetchFeaturesOverpass(
  point: Point,
  dist: number,
  type: "water" | "parks",
  onProgress?: OverpassProgressCallback,
  preFetchedPauseMs?: number
): Promise<GeoJSON.FeatureCollection | null> {
  // point 格式为 [lat, lon]，与旧函数兼容
  const [lat, lng] = point;
  const distKm = dist / 1000;

  // 生成圆形区域多边形
  const centerPoint = turfPoint([lng, lat]);
  const polygon = buffer(centerPoint, distKm, { units: "kilometers", steps: 64 }) as
    | Feature<Polygon>
    | Feature<MultiPolygon>
    | null;

  if (!polygon) {
    log("error", `Failed to create polygon buffer for ${type}`);
    return null;
  }

  log("info", `[fetchFeaturesOverpass] type=${type}, dist=${dist}m`);

  try {
    let results;

    if (type === "water") {
      // 水体: natural=water, waterway=*
      results = await downloadWater(polygon, onProgress, preFetchedPauseMs);
    } else {
      // 公园: leisure=park/garden/nature_reserve
      results = await downloadParks(polygon, onProgress, preFetchedPauseMs);
    }

    return convertToGeoJSON(results);
  } catch (error) {
    log("error", `fetchFeaturesOverpass (${type}) failed: ${error}`);
    return null;
  }
}

/**
 * 下载兴趣点数据 (POI) (包装层)
 *
 * @param point 中心点坐标 [lng, lat]
 * @param dist 半径 (米)
 * @param onProgress 进度回调函数
 * @param preFetchedPauseMs 预先获取的等待毫秒数（可选，避免重复调用 getOverpassPause）
 */
export async function fetchPOIsOverpass(
  point: Point,
  dist: number,
  onProgress?: OverpassProgressCallback,
  preFetchedPauseMs?: number
): Promise<GeoJSON.FeatureCollection | null> {
  // point 格式为 [lat, lon]，与旧函数兼容
  const [lat, lng] = point;
  const distKm = dist / 1000;

  // 生成圆形区域多边形
  const centerPoint = turfPoint([lng, lat]);
  const polygon = buffer(centerPoint, distKm, { units: "kilometers", steps: 64 }) as
    | Feature<Polygon>
    | Feature<MultiPolygon>
    | null;

  if (!polygon) {
    log("error", "Failed to create polygon buffer for POIs");
    return null;
  }

  log("info", `[fetchPOIsOverpass] dist=${dist}m`);

  try {
    // 下载所有 amenity 类型的 POI (amenityTypes 传 undefined 表示获取所有类型)
    const results = await downloadPOIs(polygon, undefined, onProgress, preFetchedPauseMs);
    return convertToGeoJSON(results);
  } catch (error) {
    log("error", `fetchPOIsOverpass failed: ${error}`);
    return null;
  }
}
