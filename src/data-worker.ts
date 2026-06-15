/**
 * ================================================================
 * 切换说明
 * ================================================================
 * 文件顶部 USE_OVERPASS_CLIENT 变量控制:
 *   - true  = 使用新库 (src/services/overpass-client/)
 *   - false = 使用旧函数 (src/utils.ts)
 *
 * 相关文件:
 *   - 旧函数: src/utils.ts (fetchGraph, fetchFeatures, fetchPOIs)
 *   - 新库:   src/services/overpass-client/
 *   - 包装层: src/services/overpass-wrapper.ts
 * ================================================================
 */

// === 核心切换开关 (一行搞定切换) ===
const USE_OVERPASS_CLIENT = true; // true=使用新库(overpass-client), false=使用旧函数(utils.ts)

// === 导入 (两套都导入，保留原代码) ===
// 旧函数 (保留不动)
import {
  fetchGraph,
  fetchFeatures,
  fetchPOIs,
  fetchFromProtomaps,
  flattenRoadsGeoJSON,
  flattenPolygonsGeoJSON,
  flattenPOIsGeometry,
} from "./utils";
// 新库 (overpass-client) - 包装层
import {
  fetchGraphOverpass,
  fetchFeaturesOverpass,
  fetchPOIsOverpass,
} from "./services/overpass-wrapper";
import { mergeSeaPolygonsIntoWaterGeoJSON } from "./services/sea-polygons";
import {
  MAP_DATA_CACHE_VERSION,
  bboxToPolygon,
  buildCanonicalFetchRadiusMeters,
  buildCanonicalFetchViewportBbox,
} from "./lib/poster-viewport";
// 导入 getOverpassPause 用于进度更新
import { type OverpassProgressCallback } from "./services/overpass-client";

import { getDB, compress, decompress } from "./db";

const STORE_NAME = "geojson-cache";
const USE_PROTOMAPS = false; // MVP 开关：设置为 true 开启 Protomaps 高速抓取

// Worker self 类型，用于 postMessage 类型安全
interface WorkerSelf {
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

// 进度消息辅助函数
function sendProgress(progress: number, step: string) {
  (self as WorkerSelf).postMessage({ type: "PROGRESS", progress, step });
}

function formatMs(duration: number): string {
  return `${Math.round(duration)}ms`;
}

function logTiming(
  scope: string,
  name: string,
  timings: Record<string, number | string | undefined>
) {
  const parts = Object.entries(timings)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${typeof value === "number" ? formatMs(value) : value}`);
  console.log(`[Timing][${scope}][${name}] ${parts.join(" ")}`);
}

// 创建带基础进度的进度回调
function createProgressCallback(
  baseProgress: number,
  baseStep: string
): OverpassProgressCallback | undefined {
  return (
    _progress: number,
    step: string,
    _currentBlock?: number,
    _totalBlocks?: number,
    secondsRemaining?: number
  ) => {
    if (step === "waiting_slot" && secondsRemaining !== undefined) {
      // API 槽位等待
      sendProgress(baseProgress, `step_waiting_api:${secondsRemaining}`);
    } else if (step === "waiting_slot_complete") {
      // 槽位等待结束，恢复显示当前的步骤
      sendProgress(baseProgress, baseStep);
    } else if (step === "retrying_error" && secondsRemaining !== undefined) {
      // 错误重试等待
      console.log(`[DataWorker] retrying_error: secondsRemaining=${secondsRemaining}`);
      sendProgress(baseProgress, `step_retrying_error:${secondsRemaining}`);
    } else if (step === "retrying_complete") {
      // 重试倒计时结束，恢复显示当前的步骤
      sendProgress(baseProgress, baseStep);
    } else {
      // 其他情况，使用基础进度和步骤
      sendProgress(baseProgress, baseStep);
    }
  };
}

function createMapDataCacheKey(
  country: string,
  city: string,
  baseRadius: number,
  lodMode: "simplified" | "detailed",
  type: string,
  district?: string
) {
  const d = district && district !== city ? `:${district}` : "";
  return `map_data:${MAP_DATA_CACHE_VERSION}:${country}:${city}${d}:${baseRadius}:${lodMode}:${type}`;
}

function createPOIsCacheKey(country: string, city: string, baseRadius: number, district?: string) {
  const d = district && district !== city ? `:${district}` : "";
  return `map_data:${MAP_DATA_CACHE_VERSION}:${country}:${city}${d}:${baseRadius}:pois`;
}

type MapDataType = "roads" | "water" | "parks" | "pois";

function createCacheKey(
  country: string,
  city: string,
  baseRadius: number,
  lodMode: "simplified" | "detailed",
  type: MapDataType,
  district?: string
) {
  if (type === "pois") {
    return createPOIsCacheKey(country, city, baseRadius, district);
  }

  return createMapDataCacheKey(country, city, baseRadius, lodMode, type, district);
}

async function restoreCachedType(
  type: MapDataType,
  blob: Blob,
  context: {
    lat: number;
    lng: number;
    baseRadius: number;
    fetchViewportBbox: ReturnType<typeof buildCanonicalFetchViewportBbox>;
    saveMergedWater?: (data: GeoJSON.FeatureCollection) => Promise<void>;
  },
  progress?: {
    start: number;
    span: number;
  }
) {
  const report = (fraction: number, step: string) => {
    if (!progress) return;
    sendProgress(Math.round(progress.start + progress.span * fraction), step);
  };

  const totalStart = performance.now();

  report(0, "step_cache_decompressing");
  const decompressStart = performance.now();
  const rawJson = await decompress(blob);
  const decompressMs = performance.now() - decompressStart;

  report(0.35, "step_cache_parsing");
  const parseStart = performance.now();
  const json = JSON.parse(rawJson) as GeoJSON.FeatureCollection;
  const parseMs = performance.now() - parseStart;

  let seaMergeMs: number | undefined;
  let flattenMs = 0;
  let result: Float64Array;
  let cacheWriteBack = false;

  if (type === "roads") {
    report(0.75, "step_cache_flattening");
    const flattenStart = performance.now();
    result = flattenRoadsGeoJSON(json) as Float64Array;
    flattenMs = performance.now() - flattenStart;
  } else if (type === "water") {
    report(0.55, "step_cache_merging_water");
    const seaMergeStart = performance.now();
    const mergedWaterJSON = mergeSeaPolygonsIntoWaterGeoJSON(json, {
      centerLat: context.lat,
      centerLng: context.lng,
      baseRadiusMeters: context.baseRadius,
      viewportBbox: context.fetchViewportBbox,
    });
    seaMergeMs = performance.now() - seaMergeStart;
    if (mergedWaterJSON !== json && context.saveMergedWater) {
      cacheWriteBack = true;
      const writeBackStart = performance.now();
      void context
        .saveMergedWater(mergedWaterJSON)
        .then(() => {
          logTiming("cache", "waterWriteBack", { total: performance.now() - writeBackStart });
        })
        .catch((error) => {
          console.warn("[DataWorker] Failed to write merged water cache", error);
        });
    }

    report(0.8, "step_cache_flattening");
    const flattenStart = performance.now();
    result = flattenPolygonsGeoJSON(mergedWaterJSON) as Float64Array;
    flattenMs = performance.now() - flattenStart;
  } else if (type === "parks") {
    report(0.75, "step_cache_flattening");
    const flattenStart = performance.now();
    result = flattenPolygonsGeoJSON(json) as Float64Array;
    flattenMs = performance.now() - flattenStart;
  } else {
    report(0.75, "step_cache_flattening");
    const flattenStart = performance.now();
    result = flattenPOIsGeometry(json) as Float64Array;
    flattenMs = performance.now() - flattenStart;
  }

  logTiming("cache", type, {
    decompress: decompressMs,
    parse: parseMs,
    seaMerge: seaMergeMs,
    writeBack: cacheWriteBack ? "scheduled" : undefined,
    flatten: flattenMs,
    total: performance.now() - totalStart,
    features: json.features?.length?.toString(),
    output: result.length.toString(),
  });

  return result;
}

async function saveFetchedType(
  db: Awaited<ReturnType<typeof getDB>>,
  country: string,
  city: string,
  baseRadius: number,
  lodMode: "simplified" | "detailed",
  type: MapDataType,
  data: GeoJSON.FeatureCollection,
  district?: string
) {
  const json = JSON.stringify(data);
  const compressed = await compress(json);
  const key = createCacheKey(country, city, baseRadius, lodMode, type, district);
  await db.put(STORE_NAME, compressed, key);
}

self.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data;

  try {
    if (type === "GET_MAP_DATA") {
      const { country, city, lat, lng, baseRadius, lodMode, district } = payload;
      const db = await getDB();
      sendProgress(11, "step_cache_checking");
      const fetchViewportBbox = buildCanonicalFetchViewportBbox({
        centerLat: lat,
        centerLng: lng,
        baseRadiusMeters: baseRadius,
      });
      const fetchViewportPolygon = bboxToPolygon(fetchViewportBbox);
      const fetchRadius = buildCanonicalFetchRadiusMeters(baseRadius);

      const results = {
        roads: new Float64Array(0),
        water: new Float64Array(0),
        parks: new Float64Array(0),
        pois: new Float64Array(0), // 合并 POI 到 getMapData
        fromCache: false,
      };

      // skipPois: 用户关闭 POI 渲染时跳过 POI 缓存检查和网络请求，节省带宽
      const types: MapDataType[] = payload.skipPois
        ? ["roads", "water", "parks"]
        : ["roads", "water", "parks", "pois"];
      const cachedBlobs: Partial<Record<MapDataType, Blob>> = {};
      const missingTypes = new Set<MapDataType>();

      for (const mapType of types) {
        const key = createCacheKey(country, city, baseRadius, lodMode, mapType, district);
        const blob = await db.get(STORE_NAME, key);
        if (blob) {
          cachedBlobs[mapType] = blob;
        } else {
          missingTypes.add(mapType);
        }
      }

      if (missingTypes.size === 0) {
        console.log(
          `[DataWorker] Cache Hit: ${city}, ${country}${district ? ` > ${district}` : ""} (LOD: ${lodMode})${payload.skipPois ? "" : " + POIs"}`
        );
        sendProgress(14, "step_cache_hit");
        const cacheRestoreStart = performance.now();
        const restoreContext = {
          lat,
          lng,
          baseRadius,
          fetchViewportBbox,
          saveMergedWater: (data: GeoJSON.FeatureCollection) =>
            saveFetchedType(db, country, city, baseRadius, lodMode, "water", data, district),
        };
        // skipPois 时跳过 POI 恢复，避免 cachedBlobs["pois"] 为 undefined 导致报错
        const baseRestorePlan: Array<{ type: MapDataType; start: number; span: number }> = [
          { type: "roads", start: 16, span: 10 },
          { type: "water", start: 26, span: 20 },
          { type: "parks", start: 46, span: 8 },
        ];
        const poiPlan = payload.skipPois
          ? []
          : [{ type: "pois" as MapDataType, start: 54, span: 5 }];
        const restorePlan = [...baseRestorePlan, ...poiPlan];

        for (const item of restorePlan) {
          results[item.type] = (await restoreCachedType(
            item.type,
            cachedBlobs[item.type]!,
            restoreContext,
            {
              start: item.start,
              span: item.span,
            }
          )) as any;
        }

        sendProgress(60, "step_cache_restore_complete");
        logTiming("cache", "all", { total: performance.now() - cacheRestoreStart });
        results.fromCache = true;
      } else {
        // 先恢复已命中的缓存，未命中的类型后续按顺序请求
        const cachedRestoreTasks = (Object.entries(cachedBlobs) as [MapDataType, Blob][]).map(
          async ([mapType, blob]) => {
            const restored = await restoreCachedType(mapType, blob, {
              lat,
              lng,
              baseRadius,
              fetchViewportBbox,
              saveMergedWater: (data: GeoJSON.FeatureCollection) =>
                saveFetchedType(db, country, city, baseRadius, lodMode, "water", data, district),
            });
            results[mapType] = restored as any;
          }
        );
        await Promise.all(cachedRestoreTasks);

        let roadsGeo: GeoJSON.FeatureCollection | null = null;
        let waterGeo: GeoJSON.FeatureCollection | null = null;
        let parksGeo: GeoJSON.FeatureCollection | null = null;
        let poisGeo: GeoJSON.FeatureCollection | null = null;

        if (USE_PROTOMAPS) {
          console.log(
            `[DataWorker] Cache Miss: ${city}${district ? ` > ${district}` : ""}. Fetching from Protomaps...`
          );
          sendProgress(5, "step_fetching_data");
          const protomapsData = await fetchFromProtomaps([lat, lng], fetchRadius);
          if (!protomapsData) throw new Error("Failed to fetch data from Protomaps");
          if (missingTypes.has("roads")) {
            roadsGeo = protomapsData.roads;
            results.roads = flattenRoadsGeoJSON(roadsGeo) as any;
            await saveFetchedType(
              db,
              country,
              city,
              baseRadius,
              lodMode,
              "roads",
              roadsGeo,
              district
            );
          }
          if (missingTypes.has("water")) {
            waterGeo = protomapsData.water;
            const mergedWaterGeo = mergeSeaPolygonsIntoWaterGeoJSON(waterGeo, {
              centerLat: lat,
              centerLng: lng,
              baseRadiusMeters: baseRadius,
              viewportBbox: fetchViewportBbox,
            });
            results.water = flattenPolygonsGeoJSON(mergedWaterGeo) as any;
            await saveFetchedType(
              db,
              country,
              city,
              baseRadius,
              lodMode,
              "water",
              mergedWaterGeo,
              district
            );
          }
          if (missingTypes.has("parks")) {
            parksGeo = protomapsData.landuse;
            results.parks = flattenPolygonsGeoJSON(parksGeo) as any;
            await saveFetchedType(
              db,
              country,
              city,
              baseRadius,
              lodMode,
              "parks",
              parksGeo,
              district
            );
          }
          if (missingTypes.has("pois")) {
            poisGeo = protomapsData.pois;
            results.pois = flattenPOIsGeometry(poisGeo) as any;
            await saveFetchedType(
              db,
              country,
              city,
              baseRadius,
              lodMode,
              "pois",
              poisGeo,
              district
            );
          }
        } else if (USE_OVERPASS_CLIENT) {
          // [新库] 使用 overpass-client (串行请求，避免触发服务器并发限制)
          console.log(
            `[DataWorker] Cache Miss: ${city}. Fetching from overpass-client (sequential) with LOD: ${lodMode}...`
          );

          // 步骤1: 获取道路 (overpass-client 内部会处理 API 槽位检查和倒计时)
          if (missingTypes.has("roads")) {
            sendProgress(5, "step_fetching_roads");
            roadsGeo = await fetchGraphOverpass(
              fetchViewportPolygon,
              baseRadius,
              lodMode,
              createProgressCallback(5, "step_fetching_roads")
            );
            if (roadsGeo) {
              results.roads = flattenRoadsGeoJSON(roadsGeo) as any;
              await saveFetchedType(
                db,
                country,
                city,
                baseRadius,
                lodMode,
                "roads",
                roadsGeo,
                district
              );
            }
          }

          // 步骤2: 获取水体
          if (missingTypes.has("water")) {
            sendProgress(15, "step_fetching_water");
            waterGeo = await fetchFeaturesOverpass(
              fetchViewportPolygon,
              "water",
              createProgressCallback(15, "step_fetching_water")
            );
            if (waterGeo) {
              const mergedWaterGeo = mergeSeaPolygonsIntoWaterGeoJSON(waterGeo, {
                centerLat: lat,
                centerLng: lng,
                baseRadiusMeters: baseRadius,
                viewportBbox: fetchViewportBbox,
              });
              results.water = flattenPolygonsGeoJSON(mergedWaterGeo) as any;
              await saveFetchedType(
                db,
                country,
                city,
                baseRadius,
                lodMode,
                "water",
                mergedWaterGeo,
                district
              );
            }
          }

          // 步骤3: 获取公园
          if (missingTypes.has("parks")) {
            sendProgress(25, "step_fetching_parks");
            const fetchedParksGeo = await fetchFeaturesOverpass(
              fetchViewportPolygon,
              "parks",
              createProgressCallback(25, "step_fetching_parks")
            );
            if (fetchedParksGeo) {
              parksGeo = fetchedParksGeo;
              results.parks = flattenPolygonsGeoJSON(parksGeo) as any;
              await saveFetchedType(
                db,
                country,
                city,
                baseRadius,
                lodMode,
                "parks",
                parksGeo,
                district
              );
            }
          }

          // 步骤4: 获取POI
          if (missingTypes.has("pois")) {
            sendProgress(35, "step_fetching_pois");

            // 串行获取 POI (合并到 getMapData 中)
            poisGeo = await fetchPOIsOverpass(
              fetchViewportPolygon,
              createProgressCallback(40, "step_fetching_pois")
            );
            if (poisGeo) {
              results.pois = flattenPOIsGeometry(poisGeo) as any;
              await saveFetchedType(
                db,
                country,
                city,
                baseRadius,
                lodMode,
                "pois",
                poisGeo,
                district
              );
            }
          }

          sendProgress(60, "step_fetch_complete");
        } else {
          // [旧函数] 使用 utils.ts 中的原始函数
          console.log(
            `[DataWorker] Cache Miss: ${city}. Fetching from OSM (Parallel) with LOD: ${lodMode}...`
          );
          if (missingTypes.has("roads")) {
            sendProgress(10, "step_fetching_roads");
            roadsGeo = await fetchGraph([lat, lng], fetchRadius, lodMode);
            if (roadsGeo) {
              results.roads = flattenRoadsGeoJSON(roadsGeo) as any;
              await saveFetchedType(
                db,
                country,
                city,
                baseRadius,
                lodMode,
                "roads",
                roadsGeo,
                district
              );
            }
          }

          if (missingTypes.has("water")) {
            sendProgress(15, "step_fetching_water");
            waterGeo = await fetchFeatures(
              [lat, lng],
              fetchRadius,
              {
                natural: ["water", "wetland", "sea", "bay"],
                waterway: ["riverbank", "river", "canal"],
                landuse: ["reservoir"],
              },
              "water"
            );
            if (waterGeo) {
              const mergedWaterGeo = mergeSeaPolygonsIntoWaterGeoJSON(waterGeo, {
                centerLat: lat,
                centerLng: lng,
                baseRadiusMeters: baseRadius,
                viewportBbox: fetchViewportBbox,
              });
              results.water = flattenPolygonsGeoJSON(mergedWaterGeo) as any;
              await saveFetchedType(
                db,
                country,
                city,
                baseRadius,
                lodMode,
                "water",
                mergedWaterGeo,
                district
              );
            }
          }

          if (missingTypes.has("parks")) {
            sendProgress(25, "step_fetching_parks");
            const fetchedParksGeo = await fetchFeatures(
              [lat, lng],
              fetchRadius,
              {
                leisure: ["park", "garden", "playground"],
                landuse: ["grass", "forest", "park"],
                natural: ["wood", "scrub"],
              },
              "parks"
            );
            if (fetchedParksGeo) {
              parksGeo = fetchedParksGeo;
              results.parks = flattenPolygonsGeoJSON(parksGeo) as any;
              await saveFetchedType(
                db,
                country,
                city,
                baseRadius,
                lodMode,
                "parks",
                parksGeo,
                district
              );
            }
          }

          // 串行获取 POI (合并到 getMapData 中)
          if (missingTypes.has("pois")) {
            sendProgress(35, "step_fetching_pois");
            poisGeo = await fetchPOIs([lat, lng], fetchRadius);
            if (poisGeo) {
              results.pois = flattenPOIsGeometry(poisGeo) as any;
              await saveFetchedType(
                db,
                country,
                city,
                baseRadius,
                lodMode,
                "pois",
                poisGeo,
                district
              );
            }
          }

          sendProgress(60, "step_fetch_complete");
        }

        if (
          (missingTypes.has("roads") && !roadsGeo) ||
          (missingTypes.has("water") && !waterGeo) ||
          (missingTypes.has("parks") && !parksGeo) ||
          (missingTypes.has("pois") && !poisGeo)
        ) {
          const missing = [
            missingTypes.has("roads") && !roadsGeo ? "roads" : "",
            missingTypes.has("water") && !waterGeo ? "water" : "",
            missingTypes.has("parks") && !parksGeo ? "parks" : "",
            missingTypes.has("pois") && !poisGeo ? "pois" : "",
          ]
            .filter(Boolean)
            .join(", ");
          throw new Error(`Failed to fetch data from remote source: missing ${missing}`);
        }
      }

      // 4. 返回结果 (包含 POI)
      const transferList = [
        results.roads.buffer,
        results.water.buffer,
        results.parks.buffer,
        results.pois.buffer,
      ].filter((b) => b instanceof ArrayBuffer) as Transferable[];
      (self as WorkerSelf).postMessage(
        {
          id,
          success: true,
          payload: {
            roads: results.roads as any,
            water: results.water as any,
            parks: results.parks as any,
            pois: results.pois as any,
            fromCache: results.fromCache,
            cacheLevel: results.fromCache ? "indexeddb" : "none",
            isProtomaps: USE_PROTOMAPS,
          },
        },
        transferList
      );
    }
  } catch (error) {
    self.postMessage({
      id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
