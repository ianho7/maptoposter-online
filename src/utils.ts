import type { Coordinates, NominatimResult, Point } from './types';
import osmtogeojson from 'osmtogeojson';

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

/**
 * 从 OpenStreetMap 获取街道网络数据
 * 使用 Overpass API 并转换为 GeoJSON
 */
export async function fetchGraph(point: Point, dist: number): Promise<GeoJSON.FeatureCollection | null> {
    const [lat, lon] = point;

    const latRad = lat * (Math.PI / 180);
    const deltaLat = dist / 111320;
    const deltaLon = dist / (111320 * Math.cos(latRad));

    const south = lat - deltaLat;
    const west = lon - deltaLon;
    const north = lat + deltaLat;
    const east = lon + deltaLon;

    const query = `
    [out:json][timeout:300];
    (
      way["highway"](${south},${west},${north},${east});
      node(w);
    );
    out body;
    >;
    out skel qt;
  `;

    // const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    const url = `https://overpass.openstreetmap.fr/api/interpreter?data=${encodeURIComponent(query)}`;

    try {
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log("Fetching street network from Overpass...");
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Overpass API error: ${response.statusText}`);
        }

        const osmData = await response.json();
        const geojson = osmtogeojson(osmData) as GeoJSON.FeatureCollection;

        // 【优化】：仅保留 highway 属性，并应用 0.00001 的抽稀（约 1 米精度）
        return cleanGeoJSON(geojson, ['highway'], 0.00001);

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error while fetching graph: ${message}`);
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

    const bbox = `${lat - deltaLat},${lon - deltaLon},${lat + deltaLat},${lon + deltaLon}`;

    // 构建 OR 查询：(nwr["key1"="val1"]; nwr["key2"="val2"]; ...)
    const tagFilters = Object.entries(tags)
        .map(([key, value]) => {
            let filter = '';
            if (value === true) {
                filter = `["${key}"]`;
            } else if (Array.isArray(value)) {
                filter = `["${key}"~"${value.join('|')}"]`;
            } else {
                filter = `["${key}"="${value}"]`;
            }
            return `nwr${filter}(${bbox});`;
        })
        .join('');

    const query = `
    [out:json][timeout:300];
    (
      ${tagFilters}
    );
    out body;
    >;
    out skel qt;
  `;

    // const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    const url = `https://overpass.openstreetmap.fr/api/interpreter?data=${encodeURIComponent(query)}`;

    try {
        await new Promise(resolve => setTimeout(resolve, 300));
        console.log(`Fetching ${name} features from Overpass...`);
        console.log(`  Query: ${query.replace(/\n/g, ' ').substring(0, 150)}...`);

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Overpass error: ${response.statusText}`);

        const osmData = await response.json();
        const geojson = osmtogeojson(osmData) as GeoJSON.FeatureCollection;

        // 【优化】：抽稀且不需要属性
        return cleanGeoJSON(geojson, [], 0.00001);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`OSM error while fetching features (${name}): ${msg}`);
        return null;
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

/**
 * 从 OpenStreetMap 获取兴趣点 (POI) 数据
 * 包括 amenity、shop、cafe、restaurant、park 等常见类型
 */
export async function fetchPOIs(point: Point, dist: number): Promise<GeoJSON.FeatureCollection | null> {
    const [lat, lon] = point;

    const latRad = lat * (Math.PI / 180);
    const deltaLat = dist / 111320;
    const deltaLon = dist / (111320 * Math.cos(latRad));

    const south = lat - deltaLat;
    const west = lon - deltaLon;
    const north = lat + deltaLat;
    const east = lon + deltaLon;

        // 查询主要 POI 类型，限制返回数量为 5000 以避免超大数据集
        // 注意：Overpass QL 的计数形式是 `out geom 5000;`（空格），而不是括号形式
        const query = `
        [out:json][timeout:300];
        (
            node["amenity"](${south},${west},${north},${east});
            node["shop"](${south},${west},${north},${east});
            node["cafe"](${south},${west},${north},${east});
            node["restaurant"](${south},${west},${north},${east});
            node["leisure"~"park|garden"](${south},${west},${north},${east});
            node["tourism"](${south},${west},${north},${east});
        );
        out body;
        >;
        out geom 5000;
    `;

        // 防护：确保 bbox 为有限数字，便于排查 NaN/Infinity 导致的解析错误
        if (![south, west, north, east].every(Number.isFinite)) {
                console.error('Invalid bbox for POI query:', { south, west, north, east });
                return null;
        }

        // 打印 query 以便在出错时快速调试（不要在生产环境中长时间保留）
        console.log('Overpass POI query:', query);

    // const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    const url = `https://overpass.openstreetmap.fr/api/interpreter?data=${encodeURIComponent(query)}`;

    try {
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log("Fetching POI data from Overpass...");
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Overpass API error: ${response.statusText}`);
        }

        const osmData = await response.json();
        const geojson = osmtogeojson(osmData) as GeoJSON.FeatureCollection;

        // 保留 Point 类型的要素，不需要额外属性
        const pointFeatures = geojson.features.filter(f => f.geometry.type === 'Point');
        return {
            ...geojson,
            features: pointFeatures
        };

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error while fetching POIs: ${message}`);
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
