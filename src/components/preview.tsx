/**
 * MapLibre GL 艺术模式地图 - React + TypeScript
 *
 * 使用方法：
 * 1. 安装依赖: npm install maplibre-gl
 * 2. 传入你的自定义配色
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// ============================================
// 类型定义
// ============================================

export interface PosterSize {
    id: string;
    name: string;
    width: number;
    height: number;
}

export interface ArtisticTheme {
    /** 背景色 */
    bg: string;
    /** 水域颜色 */
    water: string;
    /** 公园/绿地颜色 */
    parks: string;
    /** 高速公路颜色 */
    road_motorway: string;
    /** 主干道颜色 */
    road_primary: string;
    /** 次干道颜色 */
    road_secondary: string;
    /** 支路颜色 */
    road_tertiary: string;
    /** 住宅区道路颜色 */
    road_residential: string;
    /** 默认道路颜色 */
    road_default: string;
    /** 路线颜色 */
    route: string;
    /** POI 文字颜色 */
    poi?: string;
    /** 渐变遮罩颜色 */
    gradientColor?: string;
}

export interface MapLocation {
    lat: number;
    lon: number;
}

export interface RoutePoint {
    lat: number;
    lon: number;
}

interface ArtisticMapProps {
    /** 中心坐标 */
    location: MapLocation;
    /** 缩放级别 (1-18)，优先级低于 radius */
    zoom?: number;
    /** 可视半径（米），会覆盖 zoom 参数 */
    radius?: number;
    /** 自定义配色主题 */
    theme: ArtisticTheme;
    /** 是否显示路线 */
    showRoute?: boolean;
    /** 路线点 (起点和终点) */
    routePoints?: RoutePoint[];
    /** 自定义类名 */
    className?: string;
    /** 加载完成回调 */
    onLoad?: (map: maplibregl.Map) => void;
    /** 移动结束回调 */
    onMoveEnd?: (location: MapLocation) => void;
    /** 道路粗细缩放比例 */
    roadWidthMultiplier?: number;
    /** 地图容器宽高比 */
    aspectRatio?: number;
    /** POI 密度控制
     * 可选值：
     * - 'none': 不显示任何 POI
     * - 'sparse': 稀疏，只显示 rank <= 3 的 POI
     * - 'medium': 适中，默认密度，rank <= 10
     * - 'dense': 密集，显示所有 POI
     */
    poiDensity?: 'none' | 'sparse' | 'medium' | 'dense';
}

// ============================================
// 计算给定中心和半径的边界框 [minLng, minLat, maxLng, maxLat]
function getBoundsFromRadius(
    center: { lat: number; lon: number },
    radiusMeters: number
): [[number, number], [number, number]] {
    // 1度纬度 ≈ 111320 米
    const latDelta = radiusMeters / 111320;
    // 1度经度 = 111320 * cos(纬度) 米
    const lonDelta = radiusMeters / (111320 * Math.cos(center.lat * Math.PI / 180));
    return [
        [center.lon - lonDelta, center.lat - latDelta], // 西南角
        [center.lon + lonDelta, center.lat + latDelta], // 东北角
    ];
}

// ============================================
// 样式生成器
// ============================================

function generateMapLibreStyle(
    theme: ArtisticTheme,
    showRoute: boolean,
    routePoints?: RoutePoint[],
    roadWidthMultiplier: number = 1,
    poiDensity: 'none' | 'sparse' | 'medium' | 'dense' = 'medium'
): maplibregl.StyleSpecification {
    // 构建路线数据
    const routeData = routePoints && routePoints.length >= 2
        ? {
            type: 'Feature' as const,
            properties: {},
            geometry: {
                type: 'LineString' as const,
                coordinates: routePoints.map(p => [p.lon, p.lat]),
            },
        }
        : null;

    return {
        version: 8,
        sources: {
            openfreemap: {
                type: 'vector',
                url: 'https://tiles.openfreemap.org/planet',
                maxzoom: 14,
            },
            ...(routeData && showRoute ? {
                'route-source': {
                    type: 'geojson' as const,
                    data: routeData,
                },
            } : {}),
        },
        layers: [
            // 背景层
            {
                id: 'background',
                type: 'background',
                paint: { 'background-color': theme.bg },
            },
            // 水域层
            {
                id: 'water',
                source: 'openfreemap',
                'source-layer': 'water',
                type: 'fill',
                paint: { 'fill-color': theme.water },
            },
            // 公园/绿地层
            {
                id: 'park',
                source: 'openfreemap',
                'source-layer': 'park',
                type: 'fill',
                paint: { 'fill-color': theme.parks },
            },
            // 道路层 - 默认 (0.4)
            {
                id: 'road-default',
                source: 'openfreemap',
                'source-layer': 'transportation',
                type: 'line',
                filter: ['!', ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential'], true, false]],
                paint: { 'line-color': theme.road_default, 'line-width': 0.4 * roadWidthMultiplier },
            },
            // 道路层 - 住宅区 (0.4)
            {
                id: 'road-residential',
                source: 'openfreemap',
                'source-layer': 'transportation',
                type: 'line',
                filter: ['==', ['get', 'class'], 'residential'],
                paint: { 'line-color': theme.road_residential, 'line-width': 0.4 * roadWidthMultiplier },
            },
            // 道路层 - 支路 tertiary (0.6)
            {
                id: 'road-tertiary',
                source: 'openfreemap',
                'source-layer': 'transportation',
                type: 'line',
                filter: ['==', ['get', 'class'], 'tertiary'],
                paint: { 'line-color': theme.road_tertiary, 'line-width': 0.6 * roadWidthMultiplier },
            },
            // 道路层 - 次干道 secondary (0.8)
            {
                id: 'road-secondary',
                source: 'openfreemap',
                'source-layer': 'transportation',
                type: 'line',
                filter: ['==', ['get', 'class'], 'secondary'],
                paint: { 'line-color': theme.road_secondary, 'line-width': 0.8 * roadWidthMultiplier },
            },
            // 道路层 - 主干道 trunk/primary (1.0)
            {
                id: 'road-trunk',
                source: 'openfreemap',
                'source-layer': 'transportation',
                type: 'line',
                filter: ['==', ['get', 'class'], 'trunk'],
                paint: { 'line-color': theme.road_primary, 'line-width': 1.0 * roadWidthMultiplier },
            },
            {
                id: 'road-primary',
                source: 'openfreemap',
                'source-layer': 'transportation',
                type: 'line',
                filter: ['==', ['get', 'class'], 'primary'],
                paint: { 'line-color': theme.road_primary, 'line-width': 1.0 * roadWidthMultiplier },
            },
            // 道路层 - 高速公路 motorway (1.2)
            {
                id: 'road-motorway',
                source: 'openfreemap',
                'source-layer': 'transportation',
                type: 'line',
                filter: ['==', ['get', 'class'], 'motorway'],
                paint: { 'line-color': theme.road_motorway, 'line-width': 1.2 * roadWidthMultiplier },
            },
            // POI 兴趣点层（圆点）- 根据 poiDensity 控制显示数量
            ...(poiDensity !== 'none' ? [{
                id: 'poi',
                source: 'openfreemap',
                'source-layer': 'poi',
                type: 'circle' as const,
                ...(poiDensity === 'sparse'
                    ? { filter: ['<=', ['get', 'rank'], 3] as maplibregl.FilterSpecification }
                    : poiDensity === 'medium'
                        ? { filter: ['<=', ['get', 'rank'], 10] as maplibregl.FilterSpecification }
                        : {}),
                paint: {
                    'circle-radius': [
                        'interpolate', ['linear'], ['zoom'],
                        11, 5,   // zoom 11 时半径 5
                        14, 3    // zoom 14 时半径 3
                    ],
                    'circle-color': theme.poi || theme.road_default || '#666',
                    'circle-stroke-width': 1,
                    'circle-stroke-color': theme.bg
                }
            }] as maplibregl.LayerSpecification[] : []),
            // 路线层 - 边框 (增加可见度)
            ...(showRoute && routeData ? ([
                {
                    id: 'route-line-casing',
                    source: 'route-source',
                    type: 'line',
                    layout: {
                        'line-cap': 'round',
                        'line-join': 'round',
                        'visibility': 'visible',
                    },
                    paint: {
                        'line-color': theme.bg,
                        'line-width': 9,
                    },
                },
                // 路线层 - 主线
                {
                    id: 'route-line',
                    source: 'route-source',
                    type: 'line',
                    layout: {
                        'line-cap': 'round',
                        'line-join': 'round',
                        'visibility': 'visible',
                    },
                    paint: {
                        'line-color': theme.route,
                        'line-width': 4,
                    },
                },
            ] as maplibregl.LayerSpecification[]) : []),
        ],
    };
}

// ============================================
// 组件实现
// ============================================

export function ArtisticMap({
    location,
    zoom = 12,
    radius,
    theme,
    showRoute = false,
    routePoints,
    className = '',
    onLoad,
    onMoveEnd,
    roadWidthMultiplier = 1,
    aspectRatio,
    poiDensity = 'medium',
}: ArtisticMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    // 初始化地图
    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: generateMapLibreStyle(theme, showRoute, routePoints, roadWidthMultiplier, poiDensity),
            center: [location.lon, location.lat],
            zoom: zoom,
            attributionControl: false,
            canvasContextAttributes: { preserveDrawingBuffer: true },
            // 禁用所有交互
            interactive: false,
        });

        map.on('load', () => {
            setIsLoaded(true);
            onLoad?.(map);

            // 如果有 radius，使用 fitBounds 设置视图
            if (radius) {
                const bounds = getBoundsFromRadius(location, radius);
                map.fitBounds(bounds, { padding: 20, duration: 0, minZoom: poiDensity !== 'none' ? 11 : undefined });
            }
        });

        map.on('moveend', () => {
            const center = map.getCenter();
            onMoveEnd?.({
                lat: center.lat,
                lon: center.lng,
            });
        });

        // map.on('moveend', () => {
        //     const center = map.getCenter();
        //     console.log('zoom:', map.getZoom());
        //     console.log('poi layer 存在:', !!map.getLayer('poi')); // ← 加这行
        //     onMoveEnd?.({
        //         lat: center.lat,
        //         lon: center.lng,
        //     });
        // });

        mapRef.current = map;

        return () => {
            map.remove();
            mapRef.current = null;
        };
    }, []);

    // 更新主题
    const updateStyle = useCallback(() => {
        if (!mapRef.current || !isLoaded) return;

        mapRef.current.setStyle(
            generateMapLibreStyle(theme, showRoute, routePoints, roadWidthMultiplier, poiDensity)
        );

        // style 重载完成后重新设置视口，确保 zoom 正确
        if (radius) {
            mapRef.current.once('styledata', () => {
                const bounds = getBoundsFromRadius(location, radius);
                mapRef.current?.fitBounds(bounds, { padding: 20, duration: 0, minZoom: poiDensity !== 'none' ? 11 : undefined });
            });
        }
    }, [theme, showRoute, routePoints, roadWidthMultiplier, poiDensity, isLoaded, radius, location]);

    // 监听主题变化
    useEffect(() => {
        updateStyle();
    }, [updateStyle]);

    // 监听位置/缩放/半径变化
    useEffect(() => {
        if (!mapRef.current || !isLoaded) return;

        if (radius) {
            // 使用 fitBounds 精确匹配半径
            const bounds = getBoundsFromRadius(location, radius);
            mapRef.current.fitBounds(bounds, {
                padding: 20,
                duration: 0,
                minZoom: poiDensity !== 'none' ? 11 : undefined
            });
        } else {
            // 使用 flyTo 设置中心点和 zoom
            mapRef.current.flyTo({
                center: [location.lon, location.lat],
                zoom: zoom,
                essential: true,
            });
        }
    }, [location.lat, location.lon, zoom, radius, isLoaded]);

    return (
        <div
            ref={containerRef}
            className={className}
            style={{
                width: '100%',
                height: '100%',
                ...(aspectRatio ? { aspectRatio: String(aspectRatio) } : {})
            }}
        />
    );
}

// ============================================
// 工具函数：检测是否为拉丁文字
// ============================================
function isLatinScript(text: string): boolean {
    const latinRegex = /[\u0000-\u007F\u0080-\u00FF\u0100-\u017F\u0180-\u024F]/;
    let latinCount = 0;
    let totalAlpha = 0;
    for (const char of text) {
        if (/[a-zA-Z]/.test(char)) {
            totalAlpha++;
            if (latinRegex.test(char)) {
                latinCount++;
            }
        }
    }
    return totalAlpha > 0 && (latinCount / totalAlpha) > 0.8;
}

// ============================================
// 工具函数：格式化城市名（与 WASM 保持一致）
// ============================================
function formatCityName(city: string): string {
    if (isLatinScript(city)) {
        return city.toUpperCase().split('').join('  ');
    }
    return city;
}

// ============================================
// 工具函数：格式化坐标（与 WASM 保持一致）
// ============================================
function formatCoordinates(lat: number, lon: number): string {
    const latDir = lat >= 0 ? 'N' : 'S';
    const lonDir = lon >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(4)}° ${latDir} / ${Math.abs(lon).toFixed(4)}° ${lonDir}`;
}

// ============================================
// 文字叠加层组件
// ============================================
interface TextOverlayProps {
    city: string;
    country: string;
    lat: number;
    lon: number;
    textColor: string;
    customFontFamily: string;
    containerWidth: number;
    containerHeight: number;
}

function TextOverlay({
    city,
    country,
    lat,
    lon,
    textColor,
    customFontFamily,
    containerWidth,
    containerHeight,
}: TextOverlayProps) {
    // 计算 scale_factor（与 WASM 保持一致）
    const widthScale = containerWidth / 1200;
    const heightScale = (containerHeight / 1200) * 1.1;
    const scaleFactor = Math.min(widthScale, heightScale);

    // 计算字体大小
    const cityFontSize = 80 * scaleFactor;
    const countryFontSize = 28 * scaleFactor;
    const coordsFontSize = 18 * scaleFactor;

    // 计算位置（锚点在 88% 处）
    // 补偿父容器的 p-4 (1rem) padding，使用 rem 单位以支持自适应
    const rootFontSize = typeof document !== 'undefined'
        ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
        : 16;
    const paddingOffset = rootFontSize; // 1rem
    const anchorY = 0.88;
    const cityOffset = 50 * scaleFactor;
    const coordsOffset = 40 * scaleFactor;

    const cityY = anchorY * containerHeight + cityOffset - paddingOffset;
    const countryY = anchorY * containerHeight - paddingOffset;
    const coordsY = anchorY * containerHeight - coordsOffset - paddingOffset;

    // 格式化文字
    const formattedCity = formatCityName(city);
    const formattedCoords = formatCoordinates(lat, lon);
    const formattedCountry = country.toUpperCase();

    // 样式
    const baseStyle: React.CSSProperties = {
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        color: textColor,
        fontFamily: customFontFamily,
        textAlign: 'center',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        pointerEvents: 'none',
    };

    return (
        <div
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                overflow: 'hidden',
            }}
        >
            {/* 城市名 */}
            <span
                style={{
                    ...baseStyle,
                    top: cityY,
                    fontSize: `${cityFontSize}px`,
                    fontWeight: 400,
                }}
            >
                {formattedCity}
            </span>

            {/* 国家名 */}
            <span
                style={{
                    ...baseStyle,
                    top: countryY,
                    fontSize: `${countryFontSize}px`,
                    fontWeight: 400,
                }}
            >
                {formattedCountry}
            </span>

            {/* 经纬度 */}
            <span
                style={{
                    ...baseStyle,
                    top: coordsY,
                    fontSize: `${coordsFontSize}px`,
                    fontWeight: 300,
                    opacity: 0.8,
                }}
            >
                {formattedCoords}
            </span>
        </div>
    );
}

// ============================================
// 带文字的海报预览组件
// ============================================
interface MapPosterPreviewProps {
    /** 中心坐标 */
    location: MapLocation;
    /** 城市名 */
    city: string;
    /** 国家名 */
    country: string;
    /** 缩放级别 (1-18)，优先级低于 radius */
    zoom?: number;
    /** 可视半径（米），会覆盖 zoom 参数 */
    radius?: number;
    /** 自定义配色主题 */
    theme: ArtisticTheme;
    /** 文字颜色 */
    textColor: string;
    /** 是否显示路线 */
    showRoute?: boolean;
    /** 路线点 (起点和终点) */
    routePoints?: RoutePoint[];
    /** 自定义类名 */
    className?: string;
    /** 加载完成回调 */
    onLoad?: (map: maplibregl.Map) => void;
    /** 移动结束回调 */
    onMoveEnd?: (location: MapLocation) => void;
    /** 道路粗细缩放比例 */
    roadWidthMultiplier?: number;
    /** 海报尺寸 */
    posterSize?: PosterSize;
    /** 自定义字体数据 */
    customFont?: Uint8Array;
    /** POI 密度控制 */
    poiDensity?: 'none' | 'sparse' | 'medium' | 'dense';
    /** 渐变遮罩颜色 */
    gradientColor?: string;
}

export function MapPosterPreview({
    location,
    city,
    country,
    zoom = 12,
    radius,
    theme,
    textColor,
    showRoute = false,
    routePoints,
    className = '',
    onLoad,
    onMoveEnd,
    roadWidthMultiplier = 1,
    posterSize,
    customFont,
    poiDensity = 'medium',
    gradientColor,
}: MapPosterPreviewProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const [fontFamily, setFontFamily] = useState<string>('sans-serif');

    // 加载自定义字体
    useEffect(() => {
        if (!customFont) {
            setFontFamily('sans-serif');
            return;
        }

        const loadFont = async () => {
            try {
                const fontName = 'CustomFont';
                // 将 Uint8Array 转换为 ArrayBuffer
                const fontBuffer = customFont.slice(0).buffer;
                const fontFace = new FontFace(fontName, fontBuffer);
                await fontFace.load();
                document.fonts.add(fontFace);
                setFontFamily(fontName);
            } catch (error) {
                console.error('Failed to load custom font:', error);
                setFontFamily('sans-serif');
            }
        };

        loadFont();
    }, [customFont]);

    // 监听容器尺寸变化
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                setContainerSize({ width, height });
            }
        });

        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    // 初始化地图
    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: generateMapLibreStyle(theme, showRoute, routePoints, roadWidthMultiplier, poiDensity),
            center: [location.lon, location.lat],
            zoom: zoom,
            attributionControl: false,
            canvasContextAttributes: { preserveDrawingBuffer: true },
            interactive: false,
        });

        map.on('load', () => {
            setIsLoaded(true);
            onLoad?.(map);

            if (radius) {
                const bounds = getBoundsFromRadius(location, radius);
                map.fitBounds(bounds, { padding: 20, duration: 0, minZoom: poiDensity !== 'none' ? 11 : undefined });
            }
        });

        map.on('moveend', () => {
            const center = map.getCenter();
            onMoveEnd?.({
                lat: center.lat,
                lon: center.lng,
            });
        });

        mapRef.current = map;

        return () => {
            map.remove();
            mapRef.current = null;
        };
    }, []);

    // 更新主题
    const updateStyle = useCallback(() => {
        if (!mapRef.current || !isLoaded) return;

        mapRef.current.setStyle(
            generateMapLibreStyle(theme, showRoute, routePoints, roadWidthMultiplier, poiDensity)
        );

        if (radius) {
            mapRef.current.once('styledata', () => {
                const bounds = getBoundsFromRadius(location, radius);
                mapRef.current?.fitBounds(bounds, { padding: 20, duration: 0, minZoom: poiDensity !== 'none' ? 11 : undefined });
            });
        }
    }, [theme, showRoute, routePoints, roadWidthMultiplier, poiDensity, isLoaded, radius, location]);

    // 监听主题变化
    useEffect(() => {
        updateStyle();
    }, [updateStyle]);

    // 监听位置/缩放/半径变化
    useEffect(() => {
        if (!mapRef.current || !isLoaded) return;

        if (radius) {
            const bounds = getBoundsFromRadius(location, radius);
            mapRef.current.fitBounds(bounds, {
                padding: 20,
                duration: 0,
                minZoom: poiDensity !== 'none' ? 11 : undefined
            });
        } else {
            mapRef.current.flyTo({
                center: [location.lon, location.lat],
                zoom: zoom,
                essential: true,
            });
        }
    }, [location.lat, location.lon, zoom, radius, isLoaded]);

    // 计算容器的 aspectRatio
    const aspectRatio = useMemo(() => {
        if (posterSize) {
            return posterSize.width / posterSize.height;
        }
        return undefined;
    }, [posterSize]);

    return (
        <div
            className={className}
            style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                ...(aspectRatio ? { aspectRatio: String(aspectRatio) } : {})
            }}
        >
            {/* 地图层 */}
            <div
                ref={containerRef}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                }}
            />

            {/* 渐变遮罩层 - 顶部 0-25%, 底部 75-100% */}
            {gradientColor && (
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        pointerEvents: 'none',
                        background: `
                            linear-gradient(to bottom,
                                ${gradientColor} 0%,
                                transparent 25%
                            ),
                            linear-gradient(to top,
                                ${gradientColor} 0%,
                                transparent 25%
                            )
                        `,
                    }}
                />
            )}

            {/* 文字叠加层 */}
            {containerSize.width > 0 && containerSize.height > 0 && (
                <TextOverlay
                    city={city}
                    country={country}
                    lat={location.lat}
                    lon={location.lon}
                    textColor={textColor}
                    customFontFamily={fontFamily}
                    containerWidth={containerSize.width}
                    containerHeight={containerSize.height}
                />
            )}
        </div>
    );
}

export default ArtisticMap;
