/**
 * MapLibre GL 艺术模式地图 - React + TypeScript
 *
 * 使用方法：
 * 1. 安装依赖: npm install maplibre-gl
 * 2. 传入你的自定义配色
 */

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

function isValidHexColor(color: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(color);
}

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

// ============================================
// 根据 radius 计算合适的 zoom 级别
// ============================================
function getZoomFromRadius(
  center: { lat: number; lon: number },
  radiusMeters: number,
  mapWidthPx: number,
  mapHeightPx: number
): number {
  // 用地图较小边来计算，保证 radius 完整显示
  const sizePx = Math.min(mapWidthPx, mapHeightPx);
  // 赤道上1像素对应的米数公式：metersPerPx = 156543.03392 * cos(lat) / 2^zoom
  // 反推 zoom：zoom = log2(156543.03392 * cos(lat) * sizePx / (2 * radiusMeters))
  const zoom = Math.log2(
    (156543.03392 * Math.cos((center.lat * Math.PI) / 180) * sizePx) / (2 * radiusMeters)
  );
  // 限制在合理范围内
  return Math.max(10, Math.min(16, zoom - 0.3)); // 留一点 padding
}

// ============================================
// 样式生成器（仅用于初始化）
// ============================================

function generateMapLibreStyle(
  theme: ArtisticTheme,
  showRoute: boolean,
  routePoints?: RoutePoint[],
  roadWidthMultiplier: number = 1,
  poiDensity: "none" | "sparse" | "medium" | "dense" = "medium"
): maplibregl.StyleSpecification {
  const routeData =
    routePoints && routePoints.length >= 2
      ? {
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "LineString" as const,
            coordinates: routePoints.map((p) => [p.lon, p.lat]),
          },
        }
      : null;

  return {
    version: 8,
    sources: {
      openfreemap: {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet",
        maxzoom: 14,
      },
      ...(routeData && showRoute
        ? {
            "route-source": { type: "geojson" as const, data: routeData },
          }
        : {}),
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": theme.bg } },
      {
        id: "water",
        source: "openfreemap",
        "source-layer": "water",
        type: "fill",
        paint: { "fill-color": theme.water },
      },
      {
        id: "park",
        source: "openfreemap",
        "source-layer": "park",
        type: "fill",
        paint: { "fill-color": theme.parks },
      },
      {
        id: "road-default",
        source: "openfreemap",
        "source-layer": "transportation",
        type: "line",
        filter: [
          "!",
          [
            "match",
            ["get", "class"],
            ["motorway", "trunk", "primary", "secondary", "tertiary", "residential"],
            true,
            false,
          ],
        ],
        paint: { "line-color": theme.road_default, "line-width": 0.4 * roadWidthMultiplier },
      },
      {
        id: "road-residential",
        source: "openfreemap",
        "source-layer": "transportation",
        type: "line",
        filter: ["==", ["get", "class"], "residential"],
        paint: { "line-color": theme.road_residential, "line-width": 0.4 * roadWidthMultiplier },
      },
      {
        id: "road-tertiary",
        source: "openfreemap",
        "source-layer": "transportation",
        type: "line",
        filter: ["==", ["get", "class"], "tertiary"],
        paint: { "line-color": theme.road_tertiary, "line-width": 0.6 * roadWidthMultiplier },
      },
      {
        id: "road-secondary",
        source: "openfreemap",
        "source-layer": "transportation",
        type: "line",
        filter: ["==", ["get", "class"], "secondary"],
        paint: { "line-color": theme.road_secondary, "line-width": 0.8 * roadWidthMultiplier },
      },
      {
        id: "road-trunk",
        source: "openfreemap",
        "source-layer": "transportation",
        type: "line",
        filter: ["==", ["get", "class"], "trunk"],
        paint: { "line-color": theme.road_primary, "line-width": 1.0 * roadWidthMultiplier },
      },
      {
        id: "road-primary",
        source: "openfreemap",
        "source-layer": "transportation",
        type: "line",
        filter: ["==", ["get", "class"], "primary"],
        paint: { "line-color": theme.road_primary, "line-width": 1.0 * roadWidthMultiplier },
      },
      {
        id: "road-motorway",
        source: "openfreemap",
        "source-layer": "transportation",
        type: "line",
        filter: ["==", ["get", "class"], "motorway"],
        paint: { "line-color": theme.road_motorway, "line-width": 1.2 * roadWidthMultiplier },
      },
      ...(poiDensity !== "none"
        ? ([
            {
              id: "poi",
              source: "openfreemap",
              "source-layer": "poi",
              type: "circle" as const,
              minzoom: 11,
              ...(poiDensity === "sparse"
                ? { filter: ["<=", ["get", "rank"], 3] as maplibregl.FilterSpecification }
                : poiDensity === "medium"
                  ? { filter: ["<=", ["get", "rank"], 10] as maplibregl.FilterSpecification }
                  : {}),
              paint: {
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 5, 14, 3],
                "circle-color": theme.poi || theme.road_default || "#666",
                "circle-stroke-width": 1,
                "circle-stroke-color": theme.bg,
              },
            },
          ] as maplibregl.LayerSpecification[])
        : []),
      ...(showRoute && routeData
        ? ([
            {
              id: "route-line-casing",
              source: "route-source",
              type: "line",
              layout: { "line-cap": "round", "line-join": "round", visibility: "visible" },
              paint: { "line-color": theme.bg, "line-width": 9 },
            },
            {
              id: "route-line",
              source: "route-source",
              type: "line",
              layout: { "line-cap": "round", "line-join": "round", visibility: "visible" },
              paint: { "line-color": theme.route, "line-width": 4 },
            },
          ] as maplibregl.LayerSpecification[])
        : []),
    ],
  };
}

// ============================================
// 用 setPaintProperty 更新主题颜色，不调用 setStyle()
// ============================================
function applyThemePaintProperties(map: maplibregl.Map, theme: ArtisticTheme) {
  const safe = (layerId: string, prop: string, value: unknown) => {
    try {
      // Validate hex color if it's a string starting with #
      if (typeof value === "string" && value.startsWith("#") && !isValidHexColor(value)) {
        console.warn(`Invalid color ${value} for ${layerId}:${prop}, skipping`);
        return;
      }
      if (map.getLayer(layerId)) map.setPaintProperty(layerId, prop, value);
    } catch (err) {
      console.warn(`Failed to set paint property for ${layerId}:`, err);
    }
  };
  safe("background", "background-color", theme.bg);
  safe("water", "fill-color", theme.water);
  safe("park", "fill-color", theme.parks);
  safe("road-default", "line-color", theme.road_default);
  safe("road-residential", "line-color", theme.road_residential);
  safe("road-tertiary", "line-color", theme.road_tertiary);
  safe("road-secondary", "line-color", theme.road_secondary);
  safe("road-trunk", "line-color", theme.road_primary);
  safe("road-primary", "line-color", theme.road_primary);
  safe("road-motorway", "line-color", theme.road_motorway);
  safe("poi", "circle-color", theme.poi || theme.road_default || "#666");
  safe("poi", "circle-stroke-color", theme.bg);
  safe("route-line-casing", "line-color", theme.bg);
  safe("route-line", "line-color", theme.route);
}

// ============================================
// 组件实现：ArtisticMap
// ============================================

// ============================================
// 工具函数
// ============================================

function isLatinScript(text: string): boolean {
  const latinRegex = /[\u0000-\u007F\u0080-\u00FF\u0100-\u017F\u0180-\u024F]/;
  let latinCount = 0,
    totalAlpha = 0;
  for (const char of text) {
    if (/[a-zA-Z]/.test(char)) {
      totalAlpha++;
      if (latinRegex.test(char)) latinCount++;
    }
  }
  return totalAlpha > 0 && latinCount / totalAlpha > 0.8;
}

function formatCityName(city: string): string {
  if (isLatinScript(city)) return city.split("").join("  ");
  return city;
}

/// 动态计算字体大小（与 WASM 端 calculate_font_size 逻辑一致）
function calculateFontSize(text: string, baseSize: number, threshold: number): number {
  if (text.length > threshold) {
    return Math.max(10, (baseSize * threshold) / text.length);
  }
  return baseSize;
}

function formatCoordinates(lat: number, lon: number): string {
  const latDir = lat >= 0 ? "N" : "S";
  const lonDir = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}° ${latDir} / ${Math.abs(lon).toFixed(4)}° ${lonDir}`;
}

// ============================================
// 文字叠加层
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
  const widthScale = containerWidth / 1200;
  const heightScale = (containerHeight / 1200) * 1.1;
  const scaleFactor = Math.min(widthScale, heightScale);

  // 城市名需要先格式化再计算字号（与 WASM 端逻辑一致）
  const formattedCity = formatCityName(city);
  const cityFontSize = calculateFontSize(formattedCity, 80 * scaleFactor, 30);
  const countryFontSize = 28 * scaleFactor;
  const coordsFontSize = 18 * scaleFactor;

  const rootFontSize =
    typeof document !== "undefined"
      ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      : 16;
  const paddingOffset = rootFontSize;
  const anchorY = 0.88;

  const cityY = anchorY * containerHeight + 50 * scaleFactor - paddingOffset;
  const countryY = anchorY * containerHeight - paddingOffset;
  const coordsY = anchorY * containerHeight - 40 * scaleFactor - paddingOffset;

  const baseStyle: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    transform: "translateX(-50%)",
    color: textColor,
    fontFamily: customFontFamily,
    textAlign: "center",
    whiteSpace: "nowrap",
    userSelect: "none",
    pointerEvents: "none",
  };

  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
      <span style={{ ...baseStyle, top: cityY, fontSize: `${cityFontSize}px`, fontWeight: 400 }}>
        {formatCityName(city)}
      </span>
      <span
        style={{ ...baseStyle, top: countryY, fontSize: `${countryFontSize}px`, fontWeight: 400 }}
      >
        {country.toUpperCase()}
      </span>
      <span
        style={{
          ...baseStyle,
          top: coordsY,
          fontSize: `${coordsFontSize}px`,
          fontWeight: 400,
          opacity: 0.8,
        }}
      >
        {formatCoordinates(lat, lon)}
      </span>
    </div>
  );
}

// ============================================
// 带文字的海报预览组件
// ============================================

interface MapPosterPreviewProps {
  location: MapLocation;
  city: string;
  country: string;
  zoom?: number;
  radius?: number;
  theme: ArtisticTheme;
  textColor: string;
  showRoute?: boolean;
  routePoints?: RoutePoint[];
  className?: string;
  onLoad?: (map: maplibregl.Map) => void;
  onMoveEnd?: (location: MapLocation) => void;
  roadWidthMultiplier?: number;
  posterSize?: PosterSize;
  customFont?: Uint8Array;
  poiDensity?: "none" | "sparse" | "medium" | "dense";
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
  className = "",
  onLoad,
  onMoveEnd,
  roadWidthMultiplier = 1,
  posterSize,
  customFont,
  poiDensity = "medium",
  gradientColor,
}: MapPosterPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [fontFamily, setFontFamily] = useState<string>("sans-serif");

  // 加载自定义字体
  useEffect(() => {
    if (!customFont) {
      setFontFamily("sans-serif");
      return;
    }
    const loadFont = async () => {
      try {
        const fontFace = new FontFace("CustomFont", customFont.slice(0).buffer);
        await fontFace.load();
        document.fonts.add(fontFace);
        setFontFamily("CustomFont");
      } catch (err) {
        console.warn("Failed to load custom font:", err);
        setFontFamily("sans-serif");
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

  // 初始化地图（只跑一次）
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // 在 effect 执行时捕获初始坐标快照。
    // load 事件里只用这个快照做 jumpTo，不读闭包外的 location。
    // 原因：load 触发时 location 可能已经变成新城市，若用最新 location 做 jumpTo，
    // 地图会直接跳到新城市，之后位置 effect 发现 currentCenter === targetCenter，
    // easeTo 不会启动，动画消失。
    const initLat = location.lat;
    const initLon = location.lon;
    const initRadius = radius;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: generateMapLibreStyle(theme, showRoute, routePoints, roadWidthMultiplier, poiDensity),
      center: [initLon, initLat],
      zoom: zoom,
      attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
      interactive: false,
    });

    map.on("load", () => {
      onLoad?.(map);
      // 用初始快照做 jumpTo，把地图放在初始城市
      if (initRadius) {
        const canvas = map.getCanvas();
        const targetZoom = getZoomFromRadius(
          { lat: initLat, lon: initLon },
          initRadius,
          canvas.width,
          canvas.height
        );
        map.jumpTo({ center: [initLon, initLat], zoom: targetZoom });
      }
      // setIsLoaded 放在最后，触发位置 effect。
      // 此时若 location 已变成新城市，位置 effect 会从初始城市 easeTo 到新城市，动画出现。
      setIsLoaded(true);
    });

    map.on("moveend", () => {
      const center = map.getCenter();
      onMoveEnd?.({ lat: center.lat, lon: center.lng });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 主题颜色变化：用 setPaintProperty，不调用 setStyle()
  useEffect(() => {
    if (!mapRef.current || !isLoaded) return;
    applyThemePaintProperties(mapRef.current, theme);
  }, [theme, isLoaded]);

  // 位置变化：统一用 flyTo，天然有动画，不走 fitBounds
  useEffect(() => {
    if (!mapRef.current || !isLoaded) return;

    const targetZoom = radius
      ? getZoomFromRadius(
          location,
          radius,
          mapRef.current.getCanvas().width,
          mapRef.current.getCanvas().height
        )
      : zoom;

    mapRef.current.flyTo({
      center: [location.lon, location.lat],
      zoom: targetZoom,
      essential: true,
      duration: 1200,
      speed: 1.2, // 默认 1.2，越大越快
      curve: 1.42, // 默认 1.42，控制飞行弧度
    });
  }, [location.lat, location.lon, zoom, radius, isLoaded]);

  const aspectRatio = posterSize ? posterSize.width / posterSize.height : undefined;

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        ...(aspectRatio ? { aspectRatio: String(aspectRatio) } : {}),
      }}
    >
      <div
        ref={containerRef}
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
      />

      {gradientColor && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: "none",
            background: `linear-gradient(to bottom, ${gradientColor} 0%, transparent 25%),
                                 linear-gradient(to top,   ${gradientColor} 0%, transparent 25%)`,
          }}
        />
      )}

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
