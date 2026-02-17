import type { Coordinates, NominatimResult, Point } from './types';
import osmtogeojson from 'osmtogeojson';
import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';

/**
 * 将经度转换为瓦片 X 坐标
 */
export function lon2tile(lon: number, zoom: number): number {
    return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

/**
 * 将纬度转换为瓦片 Y 坐标
 */
export function lat2tile(lat: number, zoom: number): number {
    return Math.floor(
        ((1 -
            Math.log(
                Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
            ) /
            Math.PI) /
            2) *
        Math.pow(2, zoom)
    );
}

/**
 * 将瓦片 X 坐标转换为经度
 */
export function tile2lon(x: number, z: number): number {
    return (x / Math.pow(2, z)) * 360 - 180;
}

/**
 * 将瓦片 Y 坐标转换为纬度
 */
export function tile2lat(y: number, z: number): number {
    const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/**
 * 获取指定城市和国家的坐标
 * 包含基础频率限制处理
 */
export async function getCoordinates(city: string, country: string): Promise<Coordinates> {
    console.log("Looking up coordinates...");

    // 频率限制：1秒延迟
    await new Promise((resolve) => setTimeout(resolve, 1000));

    try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${city}, ${country}`)}&format=json&addressdetails=1`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'city_map_poster'
            }
        });

        if (!response.ok) {
            throw new Error(`Nominatim error: ${response.statusText}`);
        }

        const results = await response.json() as NominatimResult[];

        if (results && results.length > 0) {
            const location = results[0];
            console.log(`✓ Found: ${location.display_name}`);

            const coords: Coordinates = {
                latitude: parseFloat(location.lat),
                longitude: parseFloat(location.lon)
            };

            console.log(`✓ Coordinates: ${coords.latitude}, ${coords.longitude}`);
            return coords;
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Geocoding failed for ${city}, ${country}: ${message}`);
    }

    throw new Error(`Could not find coordinates for ${city}, ${country}`);
}

/**
 * 极简 Douglas-Peucker 抽稀算法
 */
function simplifyPoints(points: number[][], tolerance: number): number[][] {
    if (points.length <= 2) return points;

    let maxDist = 0;
    let index = 0;
    const end = points.length - 1;

    for (let i = 1; i < end; i++) {
        const d = getSqSegDist(points[i], points[0], points[end]);
        if (d > maxDist) {
            index = i;
            maxDist = d;
        }
    }

    if (maxDist > tolerance * tolerance) {
        const res1 = simplifyPoints(points.slice(0, index + 1), tolerance);
        const res2 = simplifyPoints(points.slice(index), tolerance);
        return res1.slice(0, res1.length - 1).concat(res2);
    } else {
        return [points[0], points[end]];
    }
}

function getSqSegDist(p: number[], p1: number[], p2: number[]) {
    let x = p1[0], y = p1[1], dx = p2[0] - x, dy = p2[1] - y;
    if (dx !== 0 || dy !== 0) {
        let t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
        if (t > 1) {
            x = p2[0]; y = p2[1];
        } else if (t > 0) {
            x += dx * t; y += dy * t;
        }
    }
    dx = p[0] - x; dy = p[1] - y;
    return dx * dx + dy * dy;
}

/**
 * 清洗 GeoJSON 数据，保留必要属性并进行几何抽稀
 */
function cleanGeoJSON(
    geojson: GeoJSON.FeatureCollection,
    keepProperties: string[] = [],
    tolerance: number = 0
): GeoJSON.FeatureCollection {
    return {
        ...geojson,
        features: geojson.features.map(feature => {
            let geometry = feature.geometry;

            // 如果开启了抽稀且是线段/多边形
            if (tolerance > 0 && geometry) {
                if (geometry.type === 'LineString') {
                    geometry = {
                        ...geometry,
                        coordinates: simplifyPoints(geometry.coordinates, tolerance)
                    };
                } else if (geometry.type === 'Polygon') {
                    geometry = {
                        ...geometry,
                        coordinates: geometry.coordinates.map(ring => simplifyPoints(ring, tolerance))
                    };
                } else if (geometry.type === 'MultiLineString') {
                    geometry = {
                        ...geometry,
                        coordinates: geometry.coordinates.map(line => simplifyPoints(line, tolerance))
                    };
                } else if (geometry.type === 'MultiPolygon') {
                    geometry = {
                        ...geometry,
                        coordinates: geometry.coordinates.map(poly =>
                            poly.map(ring => simplifyPoints(ring, tolerance))
                        )
                    };
                }
            }

            return {
                ...feature,
                geometry,
                properties: keepProperties.reduce((acc, key) => {
                    if (feature.properties && feature.properties[key] !== undefined) {
                        acc[key] = feature.properties[key];
                    }
                    return acc;
                }, {} as Record<string, any>)
            };
        })
    };
}

const PROTOMAPS_API_KEY = 'a3ebb7bc0e4dff5e'; // 请在此处替换为你的 API Key

/**
 * 从 Protomaps 获取全要素数据 (道路、水体、公园等)
 */
export async function fetchFromProtomaps(
    point: Point,
    dist: number
): Promise<{
    roads: GeoJSON.FeatureCollection;
    water: GeoJSON.FeatureCollection;
    landuse: GeoJSON.FeatureCollection;
    pois: GeoJSON.FeatureCollection;
} | null> {
    const [lat, lon] = point;
    const latRad = lat * (Math.PI / 180);
    const deltaLat = dist / 111320;
    const deltaLon = dist / (111320 * Math.cos(latRad));

    const south = lat - deltaLat;
    const west = lon - deltaLon;
    const north = lat + deltaLat;
    const east = lon + deltaLon;

    // 提升到 Zoom 15 以获取完整的街道细节（包括住宅区小巷）
    const zoom = 15;
    const xMin = lon2tile(west, zoom);
    const xMax = lon2tile(east, zoom);
    const yMin = lat2tile(north, zoom);
    const yMax = lat2tile(south, zoom);

    const roads: GeoJSON.Feature[] = [];
    const water: GeoJSON.Feature[] = [];
    const landuse: GeoJSON.Feature[] = [];
    const pois: GeoJSON.Feature[] = [];

    const fetchQueue: { x: number, y: number }[] = [];
    // 限制范围，防止在特大城市 Z15 抓取太多瓦片导致内存溢出
    const tileLimit = 1000;
    let count = 0;
    for (let x = xMin; x <= xMax; x++) {
        for (let y = yMin; y <= yMax; y++) {
            if (count++ < tileLimit) fetchQueue.push({ x, y });
        }
    }

    console.log(`[Protomaps] Fetching ${fetchQueue.length} tiles at Z${zoom} for bbox...`);

    // 限制并发数量
    const CONCURRENCY = 10;
    const processQueue = async () => {
        while (fetchQueue.length > 0) {
            const { x, y } = fetchQueue.shift()!;
            const url = `https://api.protomaps.com/tiles/v3/${zoom}/${x}/${y}.mvt?key=${PROTOMAPS_API_KEY}`;
            try {
                const response = await fetch(url);
                if (!response.ok) continue;
                const buffer = await response.arrayBuffer();
                const pbf = new Pbf(new Uint8Array(buffer));
                const tile = new VectorTile(pbf);

                if (tile.layers.roads) extractLayerFeatures(tile.layers.roads, x, y, zoom, roads);
                if (tile.layers.water) extractLayerFeatures(tile.layers.water, x, y, zoom, water);

                // 公园探测：同时检查 landuse 和 natural 图层
                const processParks = (layer: any) => {
                    const parkKinds = ['park', 'forest', 'wood', 'grass', 'garden', 'playground', 'nature_reserve', 'common', 'leisure'];
                    extractLayerFeatures(layer, x, y, zoom, landuse, (f) => {
                        const k = f.properties?.kind || '';
                        const kd = f.properties?.kind_detail || '';
                        return parkKinds.includes(k) || parkKinds.includes(kd);
                    });
                };
                if (tile.layers.landuse) processParks(tile.layers.landuse);
                if (tile.layers.natural) processParks(tile.layers.natural);

                if (tile.layers.pois || tile.layers.places) {
                    const layer = tile.layers.pois || tile.layers.places;
                    extractLayerFeatures(layer, x, y, zoom, pois, (f) => {
                        return f.geometry.type === 'Point' && !!f.properties;
                    });
                }
            } catch (e) {
                console.error(`Error tile ${zoom}/${x}/${y}:`, e);
            }
        }
    };

    const workers = Array.from({ length: CONCURRENCY }, () => processQueue());
    await Promise.all(workers);

    // 【关键修复】：对 POI 进行随机洗牌，防止采样只集中在西侧（左侧）
    for (let i = pois.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pois[i], pois[j]] = [pois[j], pois[i]];
    }

    console.log(`[Protomaps] Download complete. Roads: ${roads.length}, Water: ${water.length}, Parks: ${landuse.length}, POIs: ${pois.length}`);

    return {
        roads: { type: 'FeatureCollection', features: roads },
        water: { type: 'FeatureCollection', features: water },
        landuse: { type: 'FeatureCollection', features: landuse },
        pois: { type: 'FeatureCollection', features: pois }
    };
}

function extractLayerFeatures(
    layer: any,
    x: number,
    y: number,
    z: number,
    featureArray: GeoJSON.Feature[],
    filter?: (geojson: GeoJSON.Feature) => boolean
) {
    // 激进映射表：为了补偿 Protomaps Z15 分类偏细的问题，全面提升道路权重
    const protomapsToOsm: Record<string, string> = {
        'highway': 'motorway',
        'motorway': 'motorway',
        'trunk': 'primary',     // 提升为一级路
        'primary': 'primary',
        'major_road': 'primary',
        'secondary': 'secondary',
        'medium_road': 'secondary',
        'tertiary': 'secondary', // 提升为二级路
        'minor_road': 'tertiary', // 提升为三级路
        'residential': 'residential',
        'street': 'residential',
        'service': 'residential', // 提升服务道路为住宅级别
        'track': 'residential',   // 提升小径
        'path': 'residential'
    };

    for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i);
        const geojson: GeoJSON.Feature = feature.toGeoJSON(x, y, z);

        // 关键：属性预处理，确保后续的 roadTypeToEnum 能识别
        if (geojson.properties) {
            const pk = geojson.properties.kind;
            const pd = geojson.properties.kind_detail;

            if (!geojson.properties.highway) {
                // 1. 优先尝试映射具体的 kind_detail
                if (pd && protomapsToOsm[pd]) {
                    geojson.properties.highway = protomapsToOsm[pd];
                }
                // 2. 映射大类 kind
                else if (pk && protomapsToOsm[pk]) {
                    geojson.properties.highway = protomapsToOsm[pk];
                }
                // 3. 特殊逻辑：如果是 V3 中常见的 major/medium/minor
                else if (pk === 'major_road') geojson.properties.highway = 'primary';
                else if (pk === 'medium_road') geojson.properties.highway = 'secondary';
                else if (pk === 'minor_road') geojson.properties.highway = 'tertiary';
                // 4. 最后降级
                else if (pd) geojson.properties.highway = pd;
                else if (pk) geojson.properties.highway = pk;
            }
        }

        // 应用过滤器
        if (filter && !filter(geojson)) {
            continue;
        }

        featureArray.push(geojson);
    }
}

/**
 * 将道路 GeoJSON 扁平化为 Float64Array
 */
export function flattenRoadsGeoJSON(geojson: GeoJSON.FeatureCollection): Float64Array {
    const features = geojson.features;
    let totalPoints = 0;
    features.forEach((f: any) => {
        if (f.geometry.type === 'LineString') {
            totalPoints += f.geometry.coordinates.length;
        } else if (f.geometry.type === 'MultiLineString') {
            totalPoints += f.geometry.coordinates[0]?.length || 0;
        }
    });

    const buffer = new Float64Array(1 + features.length * 2 + totalPoints * 2);
    let offset = 0;
    buffer[offset++] = features.length;

    for (const f of features) {
        const props = f.properties || {};
        const typeStr = Array.isArray(props.highway) ? props.highway[0] : props.highway;
        buffer[offset++] = roadTypeToEnum(typeStr || 'unclassified');

        const geom = f.geometry as any;
        let coords = [];
        if (geom.type === 'LineString') {
            coords = geom.coordinates;
        } else if (geom.type === 'MultiLineString') {
            coords = geom.coordinates[0] || [];
        }

        buffer[offset++] = coords.length;
        for (let i = 0; i < coords.length; i++) {
            buffer[offset++] = coords[i][0];
            buffer[offset++] = coords[i][1];
        }
    }
    return buffer;
}

function roadTypeToEnum(highway: string): number {
    switch (highway) {
        case 'motorway': case 'motorway_link': return 0;
        case 'trunk': case 'trunk_link': case 'primary': case 'primary_link': return 1;
        case 'secondary': case 'secondary_link': return 2;
        case 'tertiary': case 'tertiary_link': return 3;
        case 'residential': case 'living_street': case 'unclassified': return 4;
        default: return 5;
    }
}

/**
 * 将多边形 GeoJSON 扁平化为 Float64Array
 */
export function flattenPolygonsGeoJSON(geojson: GeoJSON.FeatureCollection): Float64Array {
    const features = geojson.features.filter(f => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon');

    // 使用数组暂存，最后统一转 Float64Array（多边形结构较复杂，预计算长度较难）
    const result: number[] = [features.length];
    for (const f of features) {
        const geom = f.geometry as any;
        if (geom.type === 'Polygon') {
            addPolygonToData(result, geom.coordinates);
        } else if (geom.type === 'MultiPolygon') {
            if (geom.coordinates.length > 0) {
                addPolygonToData(result, geom.coordinates[0]);
            }
        }
    }
    return new Float64Array(result);
}

function addPolygonToData(data: number[], rings: number[][][]) {
    const exterior = rings[0] || [];
    data.push(exterior.length);
    data.push(rings.length - 1); // 洞的数量
    for (let i = 0; i < exterior.length; i++) {
        data.push(exterior[i][0]);
        data.push(exterior[i][1]);
    }
    for (let i = 1; i < rings.length; i++) {
        const ring = rings[i];
        data.push(ring.length);
        for (let j = 0; j < ring.length; j++) {
            data.push(ring[j][0]);
            data.push(ring[j][1]);
        }
    }
}

/**
 * 将道路二进制数据切分为多个分片，用于并行处理
 */
export function shardRoadsBinary(data: Float64Array, numShards: number): Float64Array[] {
    if (numShards <= 1) return [data];

    const totalFeatures = data[0];
    const shards: Float64Array[] = [];
    const featuresPerShard = Math.ceil(totalFeatures / numShards);

    let offset = 1;
    for (let s = 0; s < numShards; s++) {
        let count = 0;

        // 先扫描计算该分片的长度
        let scanOffset = offset;
        while (scanOffset < data.length && count < featuresPerShard) {
            const pointCount = data[scanOffset + 1];
            scanOffset += 2 + pointCount * 2;
            count++;
        }

        if (count > 0) {
            const shardBuffer = new Float64Array(1 + (scanOffset - offset));
            shardBuffer[0] = count;
            shardBuffer.set(data.subarray(offset, scanOffset), 1);
            shards.push(shardBuffer);
            offset = scanOffset;
        }

        if (offset >= data.length) break;
    }

    return shards;
}

const OVERPASS_SERVERS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter",
    "https://overpass.n.tyras.nl/api/interpreter", // 增加一个稳定的荷兰镜像
];

let currentServerIndex = 0;

/**
 * 核心请求工具：实现自动切服用轮询
 */
async function fetchWithRetry(query: string, retries = 2): Promise<Response> {
    const server = OVERPASS_SERVERS[currentServerIndex];
    currentServerIndex = (currentServerIndex + 1) % OVERPASS_SERVERS.length;
    const url = `${server}?data=${encodeURIComponent(query)}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response;
    } catch (e) {
        if (retries > 0) {
            console.warn(`[Overpass] Server ${server} failed, retrying next...`);
            return fetchWithRetry(query, retries - 1);
        }
        throw e;
    }
}

/**
 * 从 OpenStreetMap 获取街道网络数据
 */
export async function fetchGraph(point: Point, dist: number, lodMode: 'simplified' | 'detailed' = 'simplified'): Promise<GeoJSON.FeatureCollection | null> {
    const [lat, lon] = point;
    const latRad = lat * (Math.PI / 180);
    const deltaLat = dist / 111320;
    const deltaLon = dist / (111320 * Math.cos(latRad));

    const south = (lat - deltaLat).toFixed(4);
    const west = (lon - deltaLon).toFixed(4);
    const north = (lat + deltaLat).toFixed(4);
    const east = (lon + deltaLon).toFixed(4);

    // 【策略：动态细节等级 LOD】
    // 根据请求半径自动调整路网精细度，防止大范围采集时服务器挂起或内存溢出。
    let highwayFilter = '';
    if (lodMode === 'detailed') {
        // 细节模式：保留住宅区和普通街道
        console.log(`[LOD] 细节模式采集 (${dist}m)...`);
        highwayFilter = 'motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|service';
    } else {
        // 精简模式：大面积下仅保留主干道
        if (dist > 5000) {
            console.log(`[LOD] 精简模式 (半径 > 5000m)，仅抓取主干道...`);
            highwayFilter = 'motorway|trunk|primary|secondary|tertiary';
        } else {
            console.log(`[LOD] 精简模式 (半径 <= 5000m)，抓取全量道路...`);
            highwayFilter = 'motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|service';
        }
    }

    const query = `
    [out:json][timeout:60];
    way["highway"~"${highwayFilter}"](${south},${west},${north},${east});
    out geom qt;
  `;

    try {
        console.log(`[OSM] Fetching roads...`);
        const response = await fetchWithRetry(query);
        const osmData = await response.json();
        return cleanGeoJSON(osmtogeojson(osmData) as any, ['highway'], 0.00001);
    } catch (error) {
        console.error(`Roads Fetch Failed: ${error}`);
        return null;
    }
}

/**
 * 从 OSM 获取地理要素（如水体、公园等）
 */
export async function fetchFeatures(
    point: [number, number],
    dist: number,
    tags: Record<string, string | boolean | string[]>,
    name: string
): Promise<GeoJSON.FeatureCollection | null> {
    const [lat, lon] = point;
    const latRad = lat * (Math.PI / 180);
    const deltaLat = dist / 111320;
    const deltaLon = dist / (111320 * Math.cos(latRad));

    const south = (lat - deltaLat).toFixed(4);
    const west = (lon - deltaLon).toFixed(4);
    const north = (lat + deltaLat).toFixed(4);
    const east = (lon + deltaLon).toFixed(4);
    const bbox = `${south},${west},${north},${east}`;

    const tagFilters = Object.entries(tags)
        .map(([key, value]) => {
            let filter = '';
            if (value === true) filter = `["${key}"]`;
            else if (Array.isArray(value)) filter = `["${key}"~"${value.join('|')}"]`;
            else filter = `["${key}"="${value}"]`;
            return `nwr${filter}(${bbox});`;
        })
        .join('');

    const query = `[out:json][timeout:60];(${tagFilters});out geom qt;`;

    try {
        console.log(`[OSM] Fetching ${name}...`);
        const response = await fetchWithRetry(query);
        const osmData = await response.json();
        return cleanGeoJSON(osmtogeojson(osmData) as any, [], 0.00001);
    } catch (error) {
        console.error(`Features (${name}) Fetch Failed: ${error}`);
        return null;
    }
}

/**
 * 从 OpenStreetMap 获取兴趣点 (POI) 数据
 */
export async function fetchPOIs(point: Point, dist: number): Promise<GeoJSON.FeatureCollection | null> {
    const [lat, lon] = point;
    const latRad = lat * (Math.PI / 180);
    const deltaLat = dist / 111320;
    const deltaLon = dist / (111320 * Math.cos(latRad));

    const south = (lat - deltaLat).toFixed(4);
    const west = (lon - deltaLon).toFixed(4);
    const north = (lat + deltaLat).toFixed(4);
    const east = (lon + deltaLon).toFixed(4);

    // 【优化】：POI 也改为 out geom qt，并增加 bbox 规范化
    const query = `
        [out:json][timeout:60];
        (
            node["amenity"](${south},${west},${north},${east});
            node["shop"](${south},${west},${north},${east});
            node["tourism"](${south},${west},${north},${east});
        );
        out geom qt;
    `;

    try {
        console.log("[OSM] Fetching POIs...");
        const response = await fetchWithRetry(query);
        const osmData = await response.json();
        const geojson = osmtogeojson(osmData) as GeoJSON.FeatureCollection;
        const pointFeatures = geojson.features.filter(f => f.geometry.type === 'Point');
        return { ...geojson, features: pointFeatures };
    } catch (error) {
        console.error(`POIs Fetch Failed: ${error}`);
        return null;
    }
}


/**
 * 将 POI GeoJSON 扁平化为 Float64Array
 * 格式：[poi_count, [x, y], [x, y], ...]
 * 每个 POI 仅保存坐标，不保存属性（节省内存）
 */
export function flattenPOIsGeometry(geojson: GeoJSON.FeatureCollection | null): Float64Array {
    if (!geojson) {
        // 返回只包含 POI 数量为 0 的数组
        return new Float64Array([0]);
    }

    const features = geojson.features.filter(f => f.geometry.type === 'Point');

    // 格式：[poi_count, x1, y1, x2, y2, ...]
    const buffer = new Float64Array(1 + features.length * 2);
    buffer[0] = features.length;

    let offset = 1;
    for (const feature of features) {
        const coords = (feature.geometry as any).coordinates;
        if (coords && coords.length >= 2) {
            buffer[offset++] = coords[0];  // longitude (x)
            buffer[offset++] = coords[1];  // latitude (y)
        }
    }

    return buffer;
}
