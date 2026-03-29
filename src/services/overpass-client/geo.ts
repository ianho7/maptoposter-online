/**
 * 地理空间工具模块
 *
 * 对标 OSMnx 的 utils_geo.py，实现：
 *   - 大区域多边形的自动切割（_quadrat_cut_geometry / _consolidate_subdivide_geometry）
 *   - 多边形 → Overpass QL 坐标串转换（_make_overpass_polygon_coord_strs）
 *
 * 依赖 @turf/turf 进行几何运算。
 */

import { bbox } from "@turf/bbox";
import { lineString, featureCollection, polygon } from "@turf/helpers";
import { lineSplit } from "@turf/line-split";
import { polygonToLine } from "@turf/polygon-to-line";
import { bboxPolygon } from "@turf/bbox-polygon";
import { intersect } from "@turf/intersect";
import { area } from "@turf/area";
import { convex } from "@turf/convex";
import type { Feature, LineString, MultiPolygon, Polygon } from "geojson";
import { overpassConfig } from "./config";
import { log } from "./http";

// ─── 类型 ────────────────────────────────────────────────

type AnyPolygon = Feature<Polygon> | Feature<MultiPolygon>;

// ─── 多边形切割 ──────────────────────────────────────────

/**
 * 将大多边形切割为面积不超过 maxArea 的子块。
 *
 * 对标 OSMnx/utils_geo.py 的 _quadrat_cut_geometry() (L183-L223)
 *
 * 算法：
 * 1. 计算多边形的 bounding box
 * 2. 根据 quadratWidth 生成水平和垂直切割线
 * 3. 逐条对多边形执行 lineSplit（递归拆分）
 * 4. 最终得到一组不超过阈值面积的子多边形
 *
 * @param polygon GeoJSON Polygon Feature
 * @param quadratWidth 每个网格块的边长（米）
 * @returns 切割后的子多边形数组
 */
function quadratCutGeometry(polygon: Feature<Polygon>, quadratWidth: number): Feature<Polygon>[] {
  const polygonBbox = bbox(polygon);
  const [left, bottom, right, top] = polygonBbox;

  // 最少 3 条切割线（生成 4 个象限）
  const minNum = 3;
  const xNum = Math.max(
    Math.ceil((right - left) / metersToDegrees(quadratWidth, (top + bottom) / 2)) + 1,
    minNum
  );
  const yNum = Math.max(Math.ceil((top - bottom) / metersToDegrees(quadratWidth)) + 1, minNum);

  const xPoints = linspace(left, right, xNum);
  const yPoints = linspace(bottom, top, yNum);

  // 生成网格线
  const lines: Feature<LineString>[] = [];
  for (const x of xPoints) {
    lines.push(
      lineString([
        [x, yPoints[0]],
        [x, yPoints[yPoints.length - 1]],
      ])
    );
  }
  for (const y of yPoints) {
    lines.push(
      lineString([
        [xPoints[0], y],
        [xPoints[xPoints.length - 1], y],
      ])
    );
  }

  // 递归切割
  // 对标 OSMnx/utils_geo.py L216-L221
  let geoms: Feature<Polygon>[] = [polygon];
  for (const line of lines) {
    const newGeoms: Feature<Polygon>[] = [];
    for (const g of geoms) {
      try {
        const split = lineSplit(polygonToLine(g) as any, line);
        if (split.features.length > 1) {
          // lineSplit 产生的是 LineString，需要回退为用 booleanIntersects 切割
          // 改用 intersect + difference 的方式
          const splitResult = splitPolygonByLine(g, line);
          newGeoms.push(...splitResult);
        } else {
          newGeoms.push(g);
        }
      } catch {
        newGeoms.push(g);
      }
    }
    geoms = newGeoms;
  }

  return geoms;
}

/**
 * 用一条线将多边形切分为两半。
 *
 * 通过构造线的两侧缓冲矩形，与原多边形做交集实现。
 */
function splitPolygonByLine(
  polygon: Feature<Polygon>,
  line: Feature<LineString>
): Feature<Polygon>[] {
  try {
    const coords = line.geometry.coordinates;
    const isVertical = Math.abs(coords[0][0] - coords[1][0]) < 1e-10;

    if (isVertical) {
      const x = coords[0][0];
      const polygonBbox = bbox(polygon);
      // 左半部分
      const leftClip = bboxPolygon([polygonBbox[0], polygonBbox[1], x, polygonBbox[3]]);
      // 右半部分
      const rightClip = bboxPolygon([x, polygonBbox[1], polygonBbox[2], polygonBbox[3]]);

      const parts: Feature<Polygon>[] = [];
      const leftIntersect = intersect(featureCollection([polygon, leftClip]));
      const rightIntersect = intersect(featureCollection([polygon, rightClip]));

      if (leftIntersect) parts.push(...extractPolygons(leftIntersect));
      if (rightIntersect) parts.push(...extractPolygons(rightIntersect));

      return parts.length > 0 ? parts : [polygon];
    } else {
      const y = coords[0][1];
      const polygonBbox = bbox(polygon);
      // 下半部分
      const bottomClip = bboxPolygon([polygonBbox[0], polygonBbox[1], polygonBbox[2], y]);
      // 上半部分
      const topClip = bboxPolygon([polygonBbox[0], y, polygonBbox[2], polygonBbox[3]]);

      const parts: Feature<Polygon>[] = [];
      const bottomIntersect = intersect(featureCollection([polygon, bottomClip]));
      const topIntersect = intersect(featureCollection([polygon, topClip]));

      if (bottomIntersect) parts.push(...extractPolygons(bottomIntersect));
      if (topIntersect) parts.push(...extractPolygons(topIntersect));

      return parts.length > 0 ? parts : [polygon];
    }
  } catch {
    return [polygon];
  }
}

/**
 * 从 intersect 结果中提取 Polygon Feature 列表。
 */
function extractPolygons(geom: Feature<Polygon | MultiPolygon>): Feature<Polygon>[] {
  if (geom.geometry.type === "Polygon") {
    return [geom as Feature<Polygon>];
  }
  if (geom.geometry.type === "MultiPolygon") {
    return geom.geometry.coordinates.map((coords) => polygon(coords));
  }
  return [];
}

// ─── 主入口 ──────────────────────────────────────────────

/**
 * 整合并切分多边形，确保每个子块面积不超过配置的最大值。
 *
 * 对标 OSMnx/utils_geo.py 的 _consolidate_subdivide_geometry() (L125-L180)
 *
 * 逻辑：
 * 1. 如果是 MultiPolygon 或面积超标的 Polygon，先取凸包 (convex hull)
 * 2. 检查面积是否超标
 * 3. 若超标，以 sqrt(maxArea) 为网格宽度进行切割
 *
 * @param polygon GeoJSON Polygon 或 MultiPolygon Feature
 * @returns 切割后的子多边形数组
 */
export function subdividePolygon(polygon: AnyPolygon): Feature<Polygon>[] {
  const maxArea = overpassConfig.maxQueryAreaSize;

  // 计算面积（平方米）
  let polygonArea = area(polygon);
  let workingPoly: Feature<Polygon>;

  // 如果是 MultiPolygon 或面积超标，取凸包
  if (polygon.geometry.type === "MultiPolygon" || polygonArea > maxArea) {
    const hull = convex(polygon);
    if (!hull) {
      log("warn", "Could not compute convex hull, using bbox");
      workingPoly = bboxPolygon(bbox(polygon));
    } else {
      workingPoly = hull;
    }
    polygonArea = area(workingPoly);
  } else {
    workingPoly = polygon as Feature<Polygon>;
  }

  // 如果面积不超标，直接返回
  if (polygonArea <= maxArea) {
    return [workingPoly];
  }

  // 面积超标：按 sqrt(maxArea) 作为网格宽度切割
  const quadratWidth = Math.sqrt(maxArea);
  log(
    "info",
    `Area ${(polygonArea / 1e6).toFixed(0)}km² exceeds max ${(maxArea / 1e6).toFixed(0)}km², subdividing...`
  );

  return quadratCutGeometry(workingPoly, quadratWidth);
}

/**
 * 将多边形转为 Overpass QL 的 poly 坐标串格式。
 *
 * 对标 OSMnx/_overpass.py 的 _make_overpass_polygon_coord_strs() (L250-L283)
 *
 * Overpass 的坐标格式要求 "lat lon lat lon ..."（注意是 lat-lon 顺序，
 * 与 GeoJSON 的 lon-lat 相反）。
 * 坐标精度取 6 位小数（约 5-10 厘米），确保同一区域的请求哈希一致。
 *
 * @param polygon GeoJSON Polygon Feature
 * @returns "lat1 lon1 lat2 lon2 ..." 格式的坐标串（仅外环，忽略内环/洞）
 */
export function polygonToOverpassCoordStr(polygon: Feature<Polygon>): string {
  // 取外环坐标（index 0），忽略内环
  const ring = polygon.geometry.coordinates[0];
  return ring.map(([lon, lat]) => `${lat.toFixed(6)} ${lon.toFixed(6)}`).join(" ");
}

/**
 * 将一个（可能很大的）多边形转为一组 Overpass 坐标串。
 *
 * 这是几何模块的主入口函数：
 * 1. 调用 subdividePolygon 进行面积检查和切割
 * 2. 对每个子块调用 polygonToOverpassCoordStr 生成坐标串
 *
 * @param polygon GeoJSON Polygon 或 MultiPolygon Feature
 * @returns 坐标串数组，每个元素对应一个 Overpass 子查询
 */
export function makeOverpassPolygonCoordStrs(polygon: AnyPolygon): string[] {
  const subPolygons = subdividePolygon(polygon);
  log("info", `Polygon subdivided into ${subPolygons.length} sub-query(ies)`);

  const queryPolygons =
    subPolygons.length > 1 && overpassConfig.subQueryOverlapMeters > 0
      ? subPolygons.map((subPolygon) =>
          expandPolygonBboxForQuery(subPolygon, overpassConfig.subQueryOverlapMeters)
        )
      : subPolygons;

  if (queryPolygons !== subPolygons) {
    log(
      "info",
      `Applied ${overpassConfig.subQueryOverlapMeters}m overlap to ${queryPolygons.length} sub-query polygon(s)`
    );
  }

  return queryPolygons.map(polygonToOverpassCoordStr);
}

// ─── 内部工具 ────────────────────────────────────────────

/**
 * 生成 [start, end] 内均匀分布的 n 个点。
 */
function linspace(start: number, end: number, n: number): number[] {
  if (n <= 1) return [start];
  const step = (end - start) / (n - 1);
  return Array.from({ length: n }, (_, i) => start + step * i);
}

/**
 * 粗略地将米转为经度度数（在给定纬度下）。
 * 用于切割网格的间距估算。
 */
function metersToDegrees(meters: number, latitude = 0): number {
  // 地球半径约 6,371,009 米
  const EARTH_RADIUS = 6_371_009;
  const degPerMeter = 180 / (Math.PI * EARTH_RADIUS);
  // 经度方向需要除以 cos(lat) 进行修正
  return (meters * degPerMeter) / Math.cos((latitude * Math.PI) / 180);
}

function expandPolygonBboxForQuery(
  polygon: Feature<Polygon>,
  overlapMeters: number
): Feature<Polygon> {
  const [left, bottom, right, top] = bbox(polygon);
  const centerLat = (bottom + top) / 2;
  const latPad = metersToLatitudeDegrees(overlapMeters);
  const lonPad = metersToLongitudeDegrees(overlapMeters, centerLat);

  return bboxPolygon([left - lonPad, bottom - latPad, right + lonPad, top + latPad]);
}

function metersToLatitudeDegrees(meters: number): number {
  return metersToDegrees(meters);
}

function metersToLongitudeDegrees(meters: number, latitude: number): number {
  return metersToDegrees(meters, latitude);
}
