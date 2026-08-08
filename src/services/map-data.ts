/**
 * 地图数据服务：管理内存缓存并与 Data Worker 通信
 */
import { MAP_DATA_CACHE_VERSION } from "@/lib/poster-viewport";

export interface MapData {
  roads: Float64Array;
  water: Float64Array;
  parks: Float64Array;
  pois: Float64Array; // 合并 POI 到 MapData
  fromCache: boolean;
  cacheLevel?: "memory" | "indexeddb" | "none"; // 缓存层级
  isProtomaps?: boolean;
  /** Present only for an explicitly requested local diagnostic export. */
  rawWaterGeo?: GeoJSON.FeatureCollection;
}

export interface POIData {
  pois: Float64Array;
  fromCache: boolean;
  isProtomaps?: boolean;
}

// 进度回调类型
export type ProgressCallback = (progress: number, step: string) => void;
export type DiagnosticLogCallback = (line: string) => void;

export class MapDataService {
  private memoryCache = new Map<string, MapData>();
  private worker: Worker | null = null;
  private pendingRequests = new Map<number, { resolve: Function; reject: Function }>();
  private requestId = 0;
  private progressCallback: ProgressCallback | null = null;
  private diagnosticLogCallback: DiagnosticLogCallback | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.worker = new Worker(new URL("../data-worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (event) => {
        const { id, success, payload, error, progress, step, type, line } = event.data;

        // 处理进度消息
        if (type === "PROGRESS" && this.progressCallback) {
          this.progressCallback(progress, step);
          return;
        }

        if (type === "DIAGNOSTIC_LOG") {
          this.diagnosticLogCallback?.(line);
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

  setDiagnosticLogCallback(callback: DiagnosticLogCallback | null) {
    this.diagnosticLogCallback = callback;
  }

  /**
   * 获取地图数据（内存缓存 → Worker → IndexedDB → 网络）
   * @param district 区/县级行政区，仅当与 city 不同时才会影响缓存 key（兼容旧缓存）
   */
  async getMapData(
    country: string,
    city: string,
    lat: number,
    lng: number,
    baseRadius: number,
    lodMode: "simplified" | "detailed" = "simplified",
    district?: string,
    skipPois?: boolean,
    debugRawWaterGeo = false
  ): Promise<MapData> {
    // district 不等于 city 时才加入 key，保证城市级缓存仍可命中旧数据
    const districtPart = district && district !== city ? `:${district}` : "";
    // L1 内存缓存 key 追加 skipPois 标识，防止无 POI 的缓存污染有 POI 的缓存
    const poiPart = skipPois ? ":nopois" : "";
    const cacheKey = `${MAP_DATA_CACHE_VERSION}:${country}:${city}${districtPart}:${baseRadius}:${lodMode}${poiPart}`;

    // 1. 尝试 L1 内存缓存
    if (!debugRawWaterGeo && this.memoryCache.has(cacheKey)) {
      console.log(
        `[MapDataService] L1 Memory Hit: ${city}${district ? ` > ${district}` : ""} (LOD: ${lodMode})`
      );
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
      payload: {
        country,
        city,
        lat,
        lng,
        baseRadius,
        lodMode,
        district,
        skipPois,
        debugRawWaterGeo,
      },
    });

    const result = await promise;

    // 3. 存入 L1 内存缓存
    // 我们存一份副本在内存里，把原始结果返回（或者反过来）
    // 这里选择存副本，返回原始值，因为原始值马上就要被 App.tsx 消耗掉
    if (!debugRawWaterGeo) {
      this.memoryCache.set(cacheKey, {
        roads: result.roads.slice(),
        water: result.water.slice(),
        parks: result.parks.slice(),
        pois: result.pois.slice(), // 合并 POI
        fromCache: result.fromCache,
        cacheLevel: result.cacheLevel,
        isProtomaps: result.isProtomaps,
      });
    }

    return result;
  }

  // [已废弃] POI 已合并到 getMapData 中，此方法保留用于向后兼容
  async getPOIs(
    country: string,
    city: string,
    lat: number,
    lng: number,
    radius: number,
    district?: string
  ): Promise<POIData> {
    const mapData = await this.getMapData(country, city, lat, lng, radius, "simplified", district);
    return {
      pois: mapData.pois,
      fromCache: mapData.fromCache,
      isProtomaps: mapData.isProtomaps,
    };
  }
  async fetchRoadGeometry(
    country: string,
    city: string,
    baseRadius: number,
    lodMode: "simplified" | "detailed",
    roadName: string,
    district?: string
  ): Promise<{ features: GeoJSON.Feature[]; found: boolean }> {
    if (!this.worker || !roadName.trim()) return { features: [], found: false };

    const id = this.requestId++;
    const promise = new Promise<{ features: GeoJSON.Feature[]; found: boolean }>(
      (resolve, reject) => {
        this.pendingRequests.set(id, { resolve, reject });
      }
    );

    this.worker.postMessage({
      id,
      type: "FETCH_ROAD_GEOMETRY",
      payload: { country, city, baseRadius, lodMode, roadName: roadName.trim(), district },
    });

    return promise;
  }

  async searchRoadNames(
    country: string,
    city: string,
    baseRadius: number,
    lodMode: "simplified" | "detailed",
    keyword: string,
    district?: string
  ): Promise<Array<{ name: string; nameZh?: string; nameEn?: string }>> {
    if (!this.worker || !keyword.trim()) return [];

    const id = this.requestId++;
    const promise = new Promise<Array<{ name: string; nameZh?: string; nameEn?: string }>>(
      (resolve, reject) => {
        this.pendingRequests.set(id, { resolve, reject });
      }
    );

    this.worker.postMessage({
      id,
      type: "SEARCH_ROAD_NAMES",
      payload: { country, city, baseRadius, lodMode, keyword: keyword.trim(), district },
    });

    return promise;
  }
}

export const mapDataService = new MapDataService();
