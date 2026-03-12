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
import { fetchGraph, fetchFeatures, fetchPOIs, fetchFromProtomaps, flattenRoadsGeoJSON, flattenPolygonsGeoJSON, flattenPOIsGeometry } from './utils';
// 新库 (overpass-client) - 包装层
import { fetchGraphOverpass, fetchFeaturesOverpass, fetchPOIsOverpass } from './services/overpass-wrapper';

import { getDB, compress, decompress } from './db';

const STORE_NAME = 'geojson-cache';
const USE_PROTOMAPS = false; // MVP 开关：设置为 true 开启 Protomaps 高速抓取

self.onmessage = async (event: MessageEvent) => {
    const { id, type, payload } = event.data;

    try {
        if (type === 'GET_MAP_DATA') {
            const { country, city, lat, lng, radius, lodMode } = payload;
            const db = await getDB();

            const results = {
                roads: new Float64Array(0),
                water: new Float64Array(0),
                parks: new Float64Array(0),
                pois: new Float64Array(0),  // 合并 POI 到 getMapData
                fromCache: false
            };

            // 1. 检查 IndexedDB 缓存 (包含 POI)
            const types = ['roads', 'water', 'parks'];
            const cachedBlobs: Record<string, Blob | undefined> = {};
            let allCached = true;

            for (const t of types) {
                const key = `map_data:${country}:${city}:${radius}:${lodMode}:${t}`;
                const blob = await db.get(STORE_NAME, key);
                if (blob) {
                    cachedBlobs[t] = blob;
                } else {
                    allCached = false;
                }
            }

            // POI 缓存检查
            const poisCacheKey = `map_data:${country}:${city}:${radius}:pois`;
            const poisCachedBlob = await db.get(STORE_NAME, poisCacheKey);
            let poisCached = !!poisCachedBlob;

            if (allCached && poisCached) {
                console.log(`[DataWorker] Cache Hit: ${city}, ${country} (LOD: ${lodMode}) + POIs`);
                const [roadsJSON, waterJSON, parksJSON, poisJSON] = await Promise.all([
                    decompress(cachedBlobs['roads']!).then(JSON.parse),
                    decompress(cachedBlobs['water']!).then(JSON.parse),
                    decompress(cachedBlobs['parks']!).then(JSON.parse),
                    decompress(poisCachedBlob!).then(JSON.parse)
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
                    const protomapsData = await fetchFromProtomaps([lat, lng], radius);
                    if (!protomapsData) throw new Error("Failed to fetch data from Protomaps");
                    roadsGeo = protomapsData.roads;
                    waterGeo = protomapsData.water;
                    parksGeo = protomapsData.landuse;
                } else if (USE_OVERPASS_CLIENT) {
                    // [新库] 使用 overpass-client (串行请求，避免触发服务器并发限制)
                    console.log(`[DataWorker] Cache Miss: ${city}. Fetching from overpass-client (sequential) with LOD: ${lodMode}...`);
                    roadsGeo = await fetchGraphOverpass([lat, lng], radius, lodMode);
                    waterGeo = await fetchFeaturesOverpass([lat, lng], radius, 'water');
                    parksGeo = await fetchFeaturesOverpass([lat, lng], radius, 'parks');

                    // 串行获取 POI (合并到 getMapData 中)
                    if (!poisCached) {
                        const poisGeo = await fetchPOIsOverpass([lat, lng], radius);
                        if (poisGeo) {
                            const compressed = await compress(JSON.stringify(poisGeo));
                            await db.put(STORE_NAME, compressed, poisCacheKey);
                            results.pois = flattenPOIsGeometry(poisGeo) as any;
                        }
                    } else {
                        const poisJSON = await decompress(poisCachedBlob!).then(JSON.parse);
                        results.pois = flattenPOIsGeometry(poisJSON) as any;
                    }
                } else {
                    // [旧函数] 使用 utils.ts 中的原始函数
                    console.log(`[DataWorker] Cache Miss: ${city}. Fetching from OSM (Parallel) with LOD: ${lodMode}...`);
                    const fetched = await Promise.all([
                        fetchGraph([lat, lng], radius, lodMode),
                        fetchFeatures([lat, lng], radius, { "natural": ["water", "wetland"], "waterway": ["riverbank", "river", "canal"] }, "water"),
                        fetchFeatures([lat, lng], radius, { "leisure": ["park", "garden", "playground"], "landuse": ["grass", "forest", "park"] }, "parks")
                    ]);
                    roadsGeo = fetched[0];
                    waterGeo = fetched[1];
                    parksGeo = fetched[2];

                    // 串行获取 POI (合并到 getMapData 中)
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
                }

                if (!roadsGeo || !waterGeo || !parksGeo) {
                    throw new Error("Failed to fetch data from remote source");
                }

                results.roads = flattenRoadsGeoJSON(roadsGeo) as any;
                results.water = flattenPolygonsGeoJSON(waterGeo) as any;
                results.parks = flattenPolygonsGeoJSON(parksGeo) as any;

                // 异步存入库 (不包含 POI，因为已经同步存入)
                const saveTasks = [
                    { type: 'roads', data: roadsGeo },
                    { type: 'water', data: waterGeo },
                    { type: 'parks', data: parksGeo }
                ].map(async ({ type: t, data }) => {
                    const json = JSON.stringify(data);
                    const compressed = await compress(json);
                    const key = `map_data:${country}:${city}:${radius}:${lodMode}:${t}`;
                    return db.put(STORE_NAME, compressed, key);
                });
                await Promise.all(saveTasks);
            }

            // 4. 返回结果 (包含 POI)
            const transferList = [results.roads.buffer, results.water.buffer, results.parks.buffer, results.pois.buffer].filter(b => b instanceof ArrayBuffer) as Transferable[];
            (self as any).postMessage({
                id,
                success: true,
                payload: {
                    roads: results.roads as any,
                    water: results.water as any,
                    parks: results.parks as any,
                    pois: results.pois as any,
                    fromCache: results.fromCache,
                    isProtomaps: USE_PROTOMAPS
                }
            }, transferList);
        }
    } catch (error) {
        self.postMessage({ id, success: false, error: error instanceof Error ? error.message : String(error) });
    }
};
