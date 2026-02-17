import { fetchGraph, fetchFeatures, fetchPOIs, fetchFromProtomaps, flattenRoadsGeoJSON, flattenPolygonsGeoJSON, flattenPOIsGeometry } from './utils';
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
                fromCache: false
            };

            // 1. 检查 IndexedDB 缓存
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

            if (allCached) {
                console.log(`[DataWorker] Cache Hit: ${city}, ${country} (LOD: ${lodMode})`);
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
                let roadsGeo, waterGeo, parksGeo;

                if (USE_PROTOMAPS) {
                    console.log(`[DataWorker] Cache Miss: ${city}. Fetching from Protomaps...`);
                    const protomapsData = await fetchFromProtomaps([lat, lng], radius);
                    if (!protomapsData) throw new Error("Failed to fetch data from Protomaps");
                    roadsGeo = protomapsData.roads;
                    waterGeo = protomapsData.water;
                    parksGeo = protomapsData.landuse;
                } else {
                    console.log(`[DataWorker] Cache Miss: ${city}. Fetching from OSM (Parallel) with LOD: ${lodMode}...`);
                    const fetched = await Promise.all([
                        fetchGraph([lat, lng], radius, lodMode),
                        fetchFeatures([lat, lng], radius, { "natural": ["water", "wetland"], "waterway": ["riverbank", "river", "canal"] }, "water"),
                        fetchFeatures([lat, lng], radius, { "leisure": ["park", "garden", "playground"], "landuse": ["grass", "forest", "park"] }, "parks")
                    ]);
                    roadsGeo = fetched[0];
                    waterGeo = fetched[1];
                    parksGeo = fetched[2];
                }

                if (!roadsGeo || !waterGeo || !parksGeo) {
                    throw new Error("Failed to fetch data from remote source");
                }

                results.roads = flattenRoadsGeoJSON(roadsGeo) as any;
                results.water = flattenPolygonsGeoJSON(waterGeo) as any;
                results.parks = flattenPolygonsGeoJSON(parksGeo) as any;

                // 异步存入库
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

            // 4. 返回结果
            const transferList = [results.roads.buffer, results.water.buffer, results.parks.buffer].filter(b => b instanceof ArrayBuffer) as Transferable[];
            (self as any).postMessage({
                id,
                success: true,
                payload: {
                    roads: results.roads as any,
                    water: results.water as any,
                    parks: results.parks as any,
                    fromCache: results.fromCache,
                    isProtomaps: USE_PROTOMAPS
                }
            }, transferList);

        } else if (type === 'GET_POIS') {
            const { country, city, lat, lng, radius } = payload;
            const db = await getDB();
            const results = { pois: new Float64Array([0]), fromCache: false };

            const cacheKey = `map_data:${country}:${city}:${radius}:pois`;
            const cachedBlob = await db.get(STORE_NAME, cacheKey);

            if (cachedBlob) {
                const poisJSON = await decompress(cachedBlob).then(JSON.parse);
                results.pois = flattenPOIsGeometry(poisJSON) as any;
                results.fromCache = true;
            } else {
                let poisGeo;
                if (USE_PROTOMAPS) {
                    const protomapsData = await fetchFromProtomaps([lat, lng], radius);
                    poisGeo = protomapsData?.pois;
                } else {
                    poisGeo = await fetchPOIs([lat, lng], radius);
                }

                if (poisGeo) {
                    const compressed = await compress(JSON.stringify(poisGeo));
                    await db.put(STORE_NAME, compressed, cacheKey);
                    results.pois = flattenPOIsGeometry(poisGeo) as any;
                }
            }

            const transferList = [results.pois.buffer].filter(b => b instanceof ArrayBuffer) as Transferable[];
            (self as any).postMessage({
                id, success: true, payload: { pois: results.pois as any, fromCache: results.fromCache }
            }, transferList);
        }
    } catch (error) {
        self.postMessage({ id, success: false, error: error instanceof Error ? error.message : String(error) });
    }
};
