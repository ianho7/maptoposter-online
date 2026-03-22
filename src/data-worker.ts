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

self.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data;

  try {
    if (type === "GET_MAP_DATA") {
      const { country, city, lat, lng, radius, baseRadius, lodMode } = payload;
      const db = await getDB();

      const results = {
        roads: new Float64Array(0),
        water: new Float64Array(0),
        parks: new Float64Array(0),
        pois: new Float64Array(0), // 合并 POI 到 getMapData
        fromCache: false,
      };

      // 1. 检查 IndexedDB 缓存 (包含 POI)
      const types = ["roads", "water", "parks"];
      const cachedBlobs: Record<string, Blob | undefined> = {};
      let allCached = true;

      for (const t of types) {
        const key = `map_data:${country}:${city}:${baseRadius}:${lodMode}:${t}`;
        const blob = await db.get(STORE_NAME, key);
        if (blob) {
          cachedBlobs[t] = blob;
        } else {
          allCached = false;
        }
      }

      // POI 缓存检查
      const poisCacheKey = `map_data:${country}:${city}:${baseRadius}:pois`;
      const poisCachedBlob = await db.get(STORE_NAME, poisCacheKey);
      let poisCached = !!poisCachedBlob;

      if (allCached && poisCached) {
        console.log(`[DataWorker] Cache Hit: ${city}, ${country} (LOD: ${lodMode}) + POIs`);
        // 发送缓存恢复进度
        sendProgress(60, "step_restore_cache");

        const [roadsJSON, waterJSON, parksJSON, poisJSON] = await Promise.all([
          decompress(cachedBlobs["roads"]!).then(JSON.parse),
          decompress(cachedBlobs["water"]!).then(JSON.parse),
          decompress(cachedBlobs["parks"]!).then(JSON.parse),
          decompress(poisCachedBlob!).then(JSON.parse),
        ]);

        results.roads = flattenRoadsGeoJSON(roadsJSON) as any;
        results.water = flattenPolygonsGeoJSON(waterJSON) as any;
        results.parks = flattenPolygonsGeoJSON(parksJSON) as any;
        results.pois = flattenPOIsGeometry(poisJSON) as any;
        results.fromCache = true;
      } else {
        let roadsGeo, waterGeo, parksGeo;

        if (USE_PROTOMAPS) {
          console.log(`[DataWorker] Cache Miss: ${city}. Fetching from Protomaps...`);
          sendProgress(5, "step_fetching_data");
          const protomapsData = await fetchFromProtomaps([lat, lng], radius);
          if (!protomapsData) throw new Error("Failed to fetch data from Protomaps");
          roadsGeo = protomapsData.roads;
          waterGeo = protomapsData.water;
          parksGeo = protomapsData.landuse;
        } else if (USE_OVERPASS_CLIENT) {
          // [新库] 使用 overpass-client (串行请求，避免触发服务器并发限制)
          console.log(
            `[DataWorker] Cache Miss: ${city}. Fetching from overpass-client (sequential) with LOD: ${lodMode}...`
          );

          // 步骤1: 获取道路 (overpass-client 内部会处理 API 槽位检查和倒计时)
          sendProgress(5, "step_fetching_roads");
          roadsGeo = await fetchGraphOverpass(
            [lat, lng],
            radius,
            lodMode,
            createProgressCallback(5, "step_fetching_roads")
          );

          // 步骤2: 获取水体
          sendProgress(15, "step_fetching_water");
          waterGeo = await fetchFeaturesOverpass(
            [lat, lng],
            radius,
            "water",
            createProgressCallback(15, "step_fetching_water")
          );

          // 步骤3: 获取公园
          sendProgress(25, "step_fetching_parks");
          parksGeo = await fetchFeaturesOverpass(
            [lat, lng],
            radius,
            "parks",
            createProgressCallback(25, "step_fetching_parks")
          );

          // 步骤4: 获取POI
          sendProgress(35, "step_fetching_pois");

          // 串行获取 POI (合并到 getMapData 中)
          if (!poisCached) {
            // 传入进度回调，overpass-client 内部会处理 API 槽位检查和倒计时
            const poisGeo = await fetchPOIsOverpass(
              [lat, lng],
              radius,
              createProgressCallback(40, "step_fetching_pois")
            );
            if (poisGeo) {
              const compressed = await compress(JSON.stringify(poisGeo));
              await db.put(STORE_NAME, compressed, poisCacheKey);
              results.pois = flattenPOIsGeometry(poisGeo) as any;
            }
          } else {
            const poisJSON = await decompress(poisCachedBlob!).then(JSON.parse);
            results.pois = flattenPOIsGeometry(poisJSON) as any;
          }

          sendProgress(60, "step_fetch_complete");
        } else {
          // [旧函数] 使用 utils.ts 中的原始函数
          console.log(
            `[DataWorker] Cache Miss: ${city}. Fetching from OSM (Parallel) with LOD: ${lodMode}...`
          );
          sendProgress(10, "step_fetching_roads");
          const fetched = await Promise.all([
            fetchGraph([lat, lng], radius, lodMode),
            fetchFeatures(
              [lat, lng],
              radius,
              {
                natural: ["water", "wetland", "sea", "bay"],
                waterway: ["riverbank", "river", "canal"],
                landuse: ["reservoir"],
              },
              "water"
            ),
            fetchFeatures(
              [lat, lng],
              radius,
              {
                leisure: ["park", "garden", "playground"],
                landuse: ["grass", "forest", "park"],
                natural: ["wood", "scrub"],
              },
              "parks"
            ),
          ]);
          roadsGeo = fetched[0];
          waterGeo = fetched[1];
          parksGeo = fetched[2];

          // 串行获取 POI (合并到 getMapData 中)
          sendProgress(35, "step_fetching_pois");
          if (!poisCached) {
            const poisGeo = await fetchPOIs([lat, lng], radius);
            if (poisGeo) {
              const compressed = await compress(JSON.stringify(poisGeo));
              await db.put(STORE_NAME, compressed, poisCacheKey);
              results.pois = flattenPOIsGeometry(poisGeo) as any;
            }
          } else {
            const poisJSON = await decompress(poisCachedBlob!).then(JSON.parse);
            results.pois = flattenPOIsGeometry(poisJSON) as any;
          }

          sendProgress(60, "step_fetch_complete");
        }

        if (!roadsGeo || !waterGeo || !parksGeo) {
          throw new Error("Failed to fetch data from remote source");
        }

        results.roads = flattenRoadsGeoJSON(roadsGeo) as any;
        results.water = flattenPolygonsGeoJSON(waterGeo) as any;
        results.parks = flattenPolygonsGeoJSON(parksGeo) as any;

        // 异步存入库 (不包含 POI，因为已经同步存入)
        const saveTasks = [
          { type: "roads", data: roadsGeo },
          { type: "water", data: waterGeo },
          { type: "parks", data: parksGeo },
        ].map(async ({ type: t, data }) => {
          const json = JSON.stringify(data);
          const compressed = await compress(json);
          const key = `map_data:${country}:${city}:${baseRadius}:${lodMode}:${t}`;
          return db.put(STORE_NAME, compressed, key);
        });
        await Promise.all(saveTasks);
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
