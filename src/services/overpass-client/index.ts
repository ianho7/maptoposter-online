/**
 * overpass-client 统一导出入口
 *
 * 使用示例：
 *
 * ```typescript
 * import {
 *   overpassConfig,
 *   overpassRequest,
 *   downloadOverpassNetwork,
 *   downloadOverpassFeatures,
 *   makeOverpassPolygonCoordStrs,
 * } from './overpass-client';
 *
 * // 切换服务器
 * overpassConfig.overpassUrl = "https://overpass.openstreetmap.fr/api";
 *
 * // 直接发送原始查询
 * const data = await overpassRequest('[out:json];node["amenity"="cafe"](51.5,-0.1,51.6,0.1);out;');
 *
 * // 或者使用高级 API：先切割区域再逐块请求
 * import * as turf from '@turf/turf';
 * const polygon = turf.polygon([[[116.3,39.9],[116.5,39.9],[116.5,40.0],[116.3,40.0],[116.3,39.9]]]);
 * const coordStrs = makeOverpassPolygonCoordStrs(polygon);
 * const results = await downloadOverpassNetwork(coordStrs, '["highway"]');
 * ```
 */

// 配置
export { overpassConfig, type OverpassConfig } from "./config";

// HTTP 工具（高级用户可能需要直接使用）
export {
  OverpassResponseError,
  OverpassStatusCodeError,
  log,
  sleep,
} from "./http";

// Overpass 请求核心
export {
  overpassRequest,
  downloadOverpassNetwork,
  downloadOverpassFeatures,
  makeOverpassSettings,
  getOverpassPause,
  type OverpassProgressCallback,
} from "./overpass";

// 几何工具
export {
  subdividePolygon,
  polygonToOverpassCoordStr,
  makeOverpassPolygonCoordStrs,
} from "./geo";

// 预置查询 (针对常用场景)
export {
  type NetworkType,
  getNetworkFilter,
  downloadRoads,
  downloadParks,
  downloadWater,
  downloadPOIs,
} from "./presets";

