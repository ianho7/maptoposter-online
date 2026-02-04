import { fetchGraph, fetchFeatures, flattenRoadsGeoJSON, flattenPolygonsGeoJSON } from './utils';
import { getDB, compress, decompress } from './db';

const STORE_NAME = 'geojson-cache';

self.onmessage = async (event: MessageEvent) => {
    const { id, type, payload } = event.data;

    try {
        if (type === 'GET_MAP_DATA') {
            const { country, city, lat, lng, radius } = payload;
            const db = await getDB();

            const results = {
                roads: new Float64Array(0),
                water: new Float64Array(0),
                parks: new Float64Array(0),
                fromCache: false
            };

            // 1. 检查 IndexedDB 缓存
            const types = ['roads', 'water', 'parks'];
            const cachedBlobs: Record<string, Blob | undefined> = {};
            let allCached = true;

            for (const t of types) {
                const key = `map_data:${country}:${city}:${radius}:${t}`;
                const blob = await db.get(STORE_NAME, key);
                if (blob) {
                    cachedBlobs[t] = blob;
                } else {
                    allCached = false;
                }
            }

            if (allCached) {
                console.log(`[DataWorker] Cache Hit: ${city}, ${country}`);
                const [roadsJSON, waterJSON, parksJSON] = await Promise.all([
                    decompress(cachedBlobs['roads']!).then(JSON.parse),
                    decompress(cachedBlobs['water']!).then(JSON.parse),
                    decompress(cachedBlobs['parks']!).then(JSON.parse)
                ]);

                results.roads = flattenRoadsGeoJSON(roadsJSON) as any;
                results.water = flattenPolygonsGeoJSON(waterJSON) as any;
                results.parks = flattenPolygonsGeoJSON(parksJSON) as any;
                results.fromCache = true;
            } else {
                console.log(`[DataWorker] Cache Miss: ${city}, ${country}. Fetching from OSM...`);
                // 2. 缓存未命中，从网络抓取
                const [roadsGeo, waterGeo, parksGeo] = await Promise.all([
                    fetchGraph([lat, lng], radius),
                    fetchFeatures([lat, lng], radius, { "natural": "water", "waterway": "riverbank" }, "water"),
                    fetchFeatures([lat, lng], radius, { "leisure": "park", "landuse": "grass" }, "parks")
                ]);

                if (!roadsGeo || !waterGeo || !parksGeo) {
                    throw new Error("Failed to fetch data from OSM");
                }

                // 3. 异步压缩并入库 (不阻塞返回结果)
                const saveTasks = [
                    { type: 'roads', data: roadsGeo },
                    { type: 'water', data: waterGeo },
                    { type: 'parks', data: parksGeo }
                ].map(async ({ type: t, data }) => {
                    const json = JSON.stringify(data);
                    const compressed = await compress(json);
                    const key = `map_data:${country}:${city}:${radius}:${t}`;
                    return db.put(STORE_NAME, compressed, key);
                });

                // 我们不需要 await saveTasks，因为可以直接开始扁平化并返回
                // 但为了稳健，我们先并行处理
                results.roads = flattenRoadsGeoJSON(roadsGeo) as any;
                results.water = flattenPolygonsGeoJSON(waterGeo) as any;
                results.parks = flattenPolygonsGeoJSON(parksGeo) as any;

                await Promise.all(saveTasks);
            }

            // 4. 返回结果 (使用 Transferable)
            const transferList = [
                results.roads.buffer,
                results.water.buffer,
                results.parks.buffer
            ].filter(b => b instanceof ArrayBuffer) as Transferable[];

            (self as any).postMessage({
                id,
                success: true,
                payload: {
                    roads: results.roads as any,
                    water: results.water as any,
                    parks: results.parks as any,
                    fromCache: results.fromCache
                }
            }, transferList);
        }
    } catch (error) {
        self.postMessage({
            id,
            success: false,
            error: error instanceof Error ? error.message : String(error)
        });
    }
};
