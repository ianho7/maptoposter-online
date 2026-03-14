/**
 * 预置查询模块 (Presets)
 *
 * 对标 OSMnx/_overpass.py 的 _get_network_filter() (L30-L142)
 *
 * 提供开箱即用的便捷函数，用于下载常见地理要素：
 *   - 道路网络（6 种类型：drive/drive_service/walk/bike/all_public/all）
 *   - 公园 (leisure=park/garden/nature_reserve)
 *   - 水体 (natural=water, waterway=*)
 *   - 兴趣点 POI (amenity=*)
 *
 * 使用示例：
 *
 * ```typescript
 * import * as turf from '@turf/turf';
 * import { downloadRoads, downloadParks, downloadWater, downloadPOIs } from './presets';
 *
 * const polygon = turf.polygon([[[116.3,39.9],[116.5,39.9],[116.5,40.0],[116.3,40.0],[116.3,39.9]]]);
 *
 * const roads = await downloadRoads(polygon, "drive");
 * const parks = await downloadParks(polygon);
 * const water = await downloadWater(polygon);
 * const pois  = await downloadPOIs(polygon, ["restaurant", "cafe", "hospital"]);
 * ```
 */

import type { Feature, MultiPolygon, Polygon } from "geojson";
import { makeOverpassPolygonCoordStrs } from "./geo";
import { log } from "./http";
import { downloadOverpassFeatures, downloadOverpassNetwork, type OverpassProgressCallback } from "./overpass";

// ─── 道路网络类型 ────────────────────────────────────────

/**
 * OSMnx 支持的 6 种道路网络类型。
 *
 * - "drive"：机动车可通行道路（不含服务道路如停车场通道）
 * - "drive_service"：机动车 + 服务道路
 * - "walk"：步行可通行的道路
 * - "bike"：自行车可通行的道路
 * - "all_public"：所有公共道路
 * - "all"：所有道路（含私人道路）
 */
export type NetworkType =
  | "drive"
  | "drive_service"
  | "walk"
  | "bike"
  | "all_public"
  | "all";

// ─── 道路过滤器 ──────────────────────────────────────────

/**
 * OSM "access" 标签的默认过滤器。
 * 排除标记为 private 的道路。
 *
 * 对标 OSMnx/settings.py 的 default_access (L141)
 */
const DEFAULT_ACCESS = '["access"!~"private"]';

/**
 * 获取指定道路网络类型的 Overpass way 过滤器字符串。
 *
 * 对标 OSMnx/_overpass.py 的 _get_network_filter() (L30-L142)
 *
 * 这些过滤器是 OSMnx 的核心竞争力之一——它们经过多年的社区反馈和实际测试，
 * 能精确地按交通方式过滤 OSM 道路数据。每种过滤器都有详细的注释说明其设计意图。
 *
 * @param networkType 道路网络类型
 * @returns Overpass QL 的 way 过滤器字符串，可直接拼接到 way 查询中
 *
 * @example
 * const filter = getNetworkFilter("drive");
 * // 返回: '["highway"]["area"!~"yes"]["access"!~"private"]["highway"!~"..."]...'
 */
export function getNetworkFilter(networkType: NetworkType): string {
  log("debug", `Building network filter for type: '${networkType}'`);

  // ── drive ──
  // 机动车可通行道路。
  // 排除规则：
  //   - 非机动车道路（人行道、自行车道、步道等）
  //   - 服务道路（service roads，如停车场通道、小巷）
  //   - 施工中/已废弃/已规划的道路
  //   - 标记 motor_vehicle=no 或 motorcar=no 的道路
  // 对标 OSMnx/_overpass.py L77-L84
  const drive =
    `["highway"]["area"!~"yes"]${DEFAULT_ACCESS}` +
    `["highway"!~"abandoned|bridleway|bus_guideway|construction|corridor|` +
    `cycleway|elevator|escalator|footway|no|path|pedestrian|planned|platform|` +
    `proposed|raceway|razed|rest_area|service|services|steps|track"]` +
    `["motor_vehicle"!~"no"]["motorcar"!~"no"]` +
    `["service"!~"alley|driveway|emergency_access|parking|parking_aisle|private"]`;

  // ── drive_service ──
  // 机动车 + 服务道路（允许 service=* 但排除部分类型）。
  // 与 drive 的区别：不排除 "service" highway 类型，但仍排除部分 service 子类型。
  // 对标 OSMnx/_overpass.py L87-L94
  const driveService =
    `["highway"]["area"!~"yes"]${DEFAULT_ACCESS}` +
    `["highway"!~"abandoned|bridleway|bus_guideway|construction|corridor|` +
    `cycleway|elevator|escalator|footway|no|path|pedestrian|planned|platform|` +
    `proposed|raceway|razed|rest_area|services|steps|track"]` +
    `["motor_vehicle"!~"no"]["motorcar"!~"no"]` +
    `["service"!~"emergency_access|parking|parking_aisle|private"]`;

  // ── walk ──
  // 步行可通行道路。
  // 允许服务道路（如停车场过道、小巷——虽然不舒适但可步行）。
  // 排除自行车专用道和机动车专用道。
  // 排除标有独立人行道 (sidewalk=separate) 的道路（避免重复计算）。
  // 对标 OSMnx/_overpass.py L101-L108
  const walk =
    `["highway"]["area"!~"yes"]${DEFAULT_ACCESS}` +
    `["highway"!~"abandoned|bus_guideway|construction|cycleway|motor|no|planned|` +
    `platform|proposed|raceway|razed|rest_area|services"]` +
    `["foot"!~"no"]["service"!~"private"]` +
    `["sidewalk"!~"separate"]["sidewalk:both"!~"separate"]` +
    `["sidewalk:left"!~"separate"]["sidewalk:right"!~"separate"]`;

  // ── bike ──
  // 自行车可通行道路。
  // 排除人行道、机动车专用道、标记 bicycle=no 的道路。
  // 对标 OSMnx/_overpass.py L112-L118
  const bike =
    `["highway"]["area"!~"yes"]${DEFAULT_ACCESS}` +
    `["highway"!~"abandoned|bus_guideway|construction|corridor|elevator|` +
    `escalator|footway|motor|no|planned|platform|proposed|raceway|razed|` +
    `rest_area|services|steps"]` +
    `["bicycle"!~"no"]["service"!~"private"]`;

  // ── all_public ──
  // 所有公共道路（排除私人道路和非现役道路）。
  // 对标 OSMnx/_overpass.py L122-L127
  const allPublic =
    `["highway"]["area"!~"yes"]${DEFAULT_ACCESS}` +
    `["highway"!~"abandoned|construction|no|planned|platform|proposed|raceway|` +
    `razed|rest_area|services"]` +
    `["service"!~"private"]`;

  // ── all ──
  // 所有道路（包含私人道路），仅排除非现役道路。
  // 注意：这里没有 DEFAULT_ACCESS 过滤器。
  // 对标 OSMnx/_overpass.py L131-L134
  const all =
    `["highway"]["area"!~"yes"]["highway"!~"abandoned|construction|no|planned|` +
    `platform|proposed|raceway|razed|rest_area|services"]`;

  // 过滤器映射表
  const filters: Record<NetworkType, string> = {
    drive,
    drive_service: driveService,
    walk,
    bike,
    all_public: allPublic,
    all,
  };

  const filter = filters[networkType];
  if (!filter) {
    // 理论上 TypeScript 的类型系统应该阻止走到这里，但以防万一
    throw new Error(`Unrecognized network_type: '${networkType}'`);
  }

  log("debug", `Network filter for '${networkType}': ${filter.substring(0, 80)}...`);
  return filter;
}

// ─── 便捷下载函数 ────────────────────────────────────────

/**
 * 下载指定区域内的道路网络数据。
 *
 * 内部流程：
 * 1. 将输入多边形切割为子块（如果面积超标）
 * 2. 使用 getNetworkFilter() 获取对应的 Overpass 过滤器
 * 3. 逐块串行请求 Overpass API
 *
 * @param polygon GeoJSON Polygon 或 MultiPolygon
 * @param networkType 道路网络类型，默认 "all"
 * @returns 所有子块的 Overpass JSON 响应数组
 *
 * @example
 * const roads = await downloadRoads(myPolygon, "drive");
 * // roads[0].elements → OSM ways 和 nodes
 */
export async function downloadRoads(
  polygon: Feature<Polygon> | Feature<MultiPolygon>,
  networkType: NetworkType = "all",
  onProgress?: OverpassProgressCallback,
  preFetchedPauseMs?: number,
): Promise<Record<string, unknown>[]> {
  log("info", `=== downloadRoads: type='${networkType}' ===`);

  // 步骤 1：切割多边形为子块坐标串
  const coordStrs = makeOverpassPolygonCoordStrs(polygon);
  log("info", `Polygon split into ${coordStrs.length} sub-region(s)`);

  // 步骤 2：获取道路过滤器
  const wayFilter = getNetworkFilter(networkType);

  // 步骤 3：逐块请求
  const results = await downloadOverpassNetwork(coordStrs, wayFilter, onProgress, preFetchedPauseMs);
  log("info", `=== downloadRoads complete: ${results.length} response(s) ===`);

  return results;
}

/**
 * 下载指定区域内的公园数据。
 *
 * 查询的 OSM 标签：
 * - leisure=park（城市公园）
 * - leisure=garden（花园）
 * - leisure=nature_reserve（自然保护区）
 *
 * @param polygon GeoJSON Polygon 或 MultiPolygon
 * @param onProgress 进度回调函数
 * @param preFetchedPauseMs 预先获取的等待毫秒数（可选，避免重复调用 getOverpassPause）
 * @returns 所有子块的 Overpass JSON 响应数组
 */
export async function downloadParks(
  polygon: Feature<Polygon> | Feature<MultiPolygon>,
  onProgress?: OverpassProgressCallback,
  preFetchedPauseMs?: number,
): Promise<Record<string, unknown>[]> {
  log("info", `=== downloadParks ===`);

  const coordStrs = makeOverpassPolygonCoordStrs(polygon);
  log("info", `Polygon split into ${coordStrs.length} sub-region(s)`);

  // 查询 leisure 标签下的公园相关值
  const tags = { leisure: ["park", "garden", "nature_reserve"] };
  const results = await downloadOverpassFeatures(coordStrs, tags, onProgress, preFetchedPauseMs);

  log("info", `=== downloadParks complete: ${results.length} response(s) ===`);
  return results;
}

/**
 * 下载指定区域内的水体数据。
 *
 * 查询的 OSM 标签：
 * - natural=water（湖泊、池塘等静态水体）
 * - waterway=*（河流、溪流等动态水体——true 表示匹配所有值）
 *
 * @param polygon GeoJSON Polygon 或 MultiPolygon
 * @param onProgress 进度回调函数
 * @param preFetchedPauseMs 预先获取的等待毫秒数（可选，避免重复调用 getOverpassPause）
 * @returns 所有子块的 Overpass JSON 响应数组
 */
export async function downloadWater(
  polygon: Feature<Polygon> | Feature<MultiPolygon>,
  onProgress?: OverpassProgressCallback,
  preFetchedPauseMs?: number,
): Promise<Record<string, unknown>[]> {
  log("info", `=== downloadWater ===`);

  const coordStrs = makeOverpassPolygonCoordStrs(polygon);
  log("info", `Polygon split into ${coordStrs.length} sub-region(s)`);

  // natural=water 匹配静态水体, waterway=true 匹配所有动态水体
  const tags = { natural: "water", waterway: true as const };
  const results = await downloadOverpassFeatures(coordStrs, tags, onProgress, preFetchedPauseMs);

  log("info", `=== downloadWater complete: ${results.length} response(s) ===`);
  return results;
}

/**
 * 下载指定区域内的兴趣点 (POI) 数据。
 *
 * @param polygon GeoJSON Polygon 或 MultiPolygon
 * @param amenityTypes 可选，指定要查询的 amenity 类型列表。
 *   - 传入数组如 ["restaurant", "cafe", "hospital"] → 只下载这些类型
 *   - 不传或传 undefined → 下载所有 amenity 标签的 POI
 * @param onProgress 进度回调函数
 * @param preFetchedPauseMs 预先获取的等待毫秒数（可选，避免重复调用 getOverpassPause）
 * @returns 所有子块的 Overpass JSON 响应数组
 *
 * @example
 * // 下载所有 POI
 * const allPOIs = await downloadPOIs(polygon);
 * // 下载指定类型
 * const food = await downloadPOIs(polygon, ["restaurant", "cafe", "fast_food"]);
 */
export async function downloadPOIs(
  polygon: Feature<Polygon> | Feature<MultiPolygon>,
  amenityTypes?: string[],
  onProgress?: OverpassProgressCallback,
  preFetchedPauseMs?: number,
): Promise<Record<string, unknown>[]> {
  const typeDesc = amenityTypes ? amenityTypes.join(", ") : "all";
  log("info", `=== downloadPOIs: types=[${typeDesc}] ===`);

  const coordStrs = makeOverpassPolygonCoordStrs(polygon);
  log("info", `Polygon split into ${coordStrs.length} sub-region(s)`);

  // 如果指定了类型列表，使用数组形式；否则用 true 匹配所有
  const tags: Record<string, boolean | string | string[]> = {
    amenity: amenityTypes ?? true,
  };
  const results = await downloadOverpassFeatures(coordStrs, tags, onProgress, preFetchedPauseMs);

  log("info", `=== downloadPOIs complete: ${results.length} response(s) ===`);
  return results;
}
