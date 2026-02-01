/**
 * 地图数据服务：管理内存缓存并与 Data Worker 通信
 */

export interface MapData {
    roads: Float64Array;
    water: Float64Array;
    parks: Float64Array;
    fromCache: boolean;
}

class MapDataService {
    private memoryCache = new Map<string, MapData>();
    private worker: Worker | null = null;
    private pendingRequests = new Map<number, { resolve: Function, reject: Function }>();
    private requestId = 0;

    constructor() {
        if (typeof window !== 'undefined') {
            this.worker = new Worker(new URL('../data-worker.ts', import.meta.url), { type: 'module' });
            this.worker.onmessage = (event) => {
                const { id, success, payload, error } = event.data;
                const pending = this.pendingRequests.get(id);
                if (pending) {
                    this.pendingRequests.delete(id);
                    if (success) {
                        pending.resolve(payload);
                    } else {
                        pending.reject(new Error(error));
                    }
                }
            };
        }
    }

    async getMapData(
        country: string,
        city: string,
        lat: number,
        lng: number,
        radius: number
    ): Promise<MapData> {
        const cacheKey = `${country}:${city}:${radius}`;

        // 1. 尝试 L1 内存缓存
        if (this.memoryCache.has(cacheKey)) {
            console.log(`[MapDataService] L1 Memory Hit: ${city}`);
            const cached = this.memoryCache.get(cacheKey)!;
            // 重要：返回副本，防止缓存的 Buffer 在 postMessage 中被 Detached
            return {
                roads: cached.roads.slice(),
                water: cached.water.slice(),
                parks: cached.parks.slice(),
                fromCache: true
            };
        }

        // 2. 向 Worker 请求数据 (Worker 会处理 L2 IndexedDB 和网络)
        if (!this.worker) throw new Error("Data Worker not initialized");

        const id = this.requestId++;
        const promise = new Promise<MapData>((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
        });

        this.worker.postMessage({
            id,
            type: 'GET_MAP_DATA',
            payload: { country, city, lat, lng, radius }
        });

        const result = await promise;

        // 3. 存入 L1 内存缓存
        // 我们存一份副本在内存里，把原始结果返回（或者反过来）
        // 这里选择存副本，返回原始值，因为原始值马上就要被 App.tsx 消耗掉
        this.memoryCache.set(cacheKey, {
            roads: result.roads.slice(),
            water: result.water.slice(),
            parks: result.parks.slice(),
            fromCache: result.fromCache
        });

        return result;
    }
}

export const mapDataService = new MapDataService();
