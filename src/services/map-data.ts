/**
 * 地图数据服务：管理内存缓存并与 Data Worker 通信
 */

export interface MapData {
  roads: Float64Array;
  water: Float64Array;
  parks: Float64Array;
  pois: Float64Array; // 合并 POI 到 MapData
  fromCache: boolean;
  cacheLevel?: "memory" | "indexeddb" | "none"; // 缓存层级
  isProtomaps?: boolean;
}

export interface POIData {
  pois: Float64Array;
  fromCache: boolean;
  isProtomaps?: boolean;
}

// 进度回调类型
export type ProgressCallback = (progress: number, step: string) => void;

class MapDataService {
  private memoryCache = new Map<string, MapData>();
  private worker: Worker | null = null;
  private pendingRequests = new Map<number, { resolve: Function; reject: Function }>();
  private requestId = 0;
  private progressCallback: ProgressCallback | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.worker = new Worker(new URL("../data-worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (event) => {
        const { id, success, payload, error, progress, step, type } = event.data;

        // 处理进度消息
        if (type === "PROGRESS" && this.progressCallback) {
          this.progressCallback(progress, step);
          return;
        }

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

  // 设置进度回调
  setProgressCallback(callback: ProgressCallback | null) {
    this.progressCallback = callback;
  }

  async getMapData(
    country: string,
    city: string,
    lat: number,
    lng: number,
    radius: number,
    baseRadius: number,
    lodMode: "simplified" | "detailed" = "simplified"
  ): Promise<MapData> {
    const cacheKey = `${country}:${city}:${baseRadius}:${lodMode}`;

    // 1. 尝试 L1 内存缓存
    if (this.memoryCache.has(cacheKey)) {
      console.log(`[MapDataService] L1 Memory Hit: ${city} (LOD: ${lodMode})`);
      const cached = this.memoryCache.get(cacheKey)!;
      // 重要：返回副本，防止缓存的 Buffer 在 postMessage 中被 Detached
      return {
        roads: cached.roads.slice(),
        water: cached.water.slice(),
        parks: cached.parks.slice(),
        pois: cached.pois.slice(), // 合并 POI
        fromCache: true,
        cacheLevel: "memory",
        isProtomaps: cached.isProtomaps,
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
      type: "GET_MAP_DATA",
      payload: { country, city, lat, lng, radius, baseRadius, lodMode },
    });

    const result = await promise;

    // 3. 存入 L1 内存缓存
    // 我们存一份副本在内存里，把原始结果返回（或者反过来）
    // 这里选择存副本，返回原始值，因为原始值马上就要被 App.tsx 消耗掉
    this.memoryCache.set(cacheKey, {
      roads: result.roads.slice(),
      water: result.water.slice(),
      parks: result.parks.slice(),
      pois: result.pois.slice(), // 合并 POI
      fromCache: result.fromCache,
      cacheLevel: result.cacheLevel,
      isProtomaps: result.isProtomaps,
    });

    return result;
  }

  // [已废弃] POI 已合并到 getMapData 中，此方法保留用于向后兼容
  async getPOIs(
    country: string,
    city: string,
    lat: number,
    lng: number,
    radius: number
  ): Promise<POIData> {
    // 直接调用 getMapData，获取其中的 pois
    const mapData = await this.getMapData(country, city, lat, lng, radius, radius, "simplified");
    return {
      pois: mapData.pois,
      fromCache: mapData.fromCache,
      isProtomaps: mapData.isProtomaps,
    };
  }
}

export const mapDataService = new MapDataService();
