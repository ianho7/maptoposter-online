import { useState, useRef, useEffect, useDeferredValue, useMemo } from "react";
import { type PosterSize } from "@/components/artistic-map";
import {
  Square,
  Smartphone,
  Monitor,
  FileImage,
  MapPin,
  Settings2,
  Palette,
  Eye,
  FileText,
  Scaling,
  Pin,
} from "lucide-react";
import { useLocationData } from "@/hooks/useLocationData";
import { getUserGeolocation } from "@/services/ip-geolocation";

// WASM and Utils
import init, { init_panic_hook } from "./pkg/wasm";
import { shardRoadsBinary } from "./utils";
import {
  type CustomPOI,
  type MapColors,
  MAP_THEMES as THEMES,
  type Location,
  type PoiShape,
  type PoiSource,
} from "@/lib/types";
import { mapDataService } from "./services/map-data";
import { type State, type City, type District } from "@/services/location-types";
// Paraglide i18n
import * as m from "@/paraglide/messages";
import { useDynamicFont } from "./hooks/useDynamicFont";
import { useLanguage } from "./hooks/useLanguage";
import { useConfigNavigation } from "./hooks/useConfigNavigation";
import { useFontManagement } from "./hooks/useFontManagement";
import { PosterGallery } from "./components/gallery";
import Footer from "./components/footer";
import { ConfigNav, type NavSection } from "./components/config-nav";
import { SEOHead } from "./hooks/useSEO";
import { AppHeader } from "./components/app-header";
import { LocationSettings } from "./components/location-settings";
import { DataSettings } from "./components/data-settings";
import { ThemeColors } from "./components/theme-colors";
import { FontSettings } from "./components/font-settings";
import { RenderControlSettings } from "./components/render-control-settings";
import { PosterSizeSelector } from "./components/poster-size-selector";
import { MapPreview } from "./components/map-preview";
import { GenerationModal } from "./components/generation-modal";
import { ErrorModal } from "./components/error-modal";
import { useReverseGeocode } from "@/hooks/useReverseGeocode";
import { getPoiIconDefinition } from "@/lib/poi-icon-registry";
import { CustomPOISettings } from "./components/custom-poi-settings";
import { POIManagementDialog } from "./components/poi-management-dialog";
import {
  buildResolvedLocation,
  coalesceCoordinates,
  namesReferToSameLocation,
  parseCityCoordinates,
  resolveCitySelection,
} from "@/services/location-resolution";

// Extended PosterSize includes icon for size selector UI
interface LocalPosterSize extends PosterSize {
  icon: React.ReactNode;
}

// Worker task types
type WorkerTaskType = "roads" | "polygons" | "pois" | "render";
type ExportFormat = "png" | "svg";
type PinThemeStyle = "puff" | "badge" | "pinhead";
interface PinThemeConfig {
  // 风格名称：puff / badge / pinhead
  style: PinThemeStyle;
  // 图标在圆形徽章中的相对尺寸，基于徽章直径
  iconScale: number;
  // 图标纵向偏移，基于图标目标尺寸，正值向下
  iconOffsetYScale: number;
  // 没有 SVG 图标时，中间回退小圆点的相对尺寸，基于徽章半径
  fallbackDotScale: number;
  // 外阴影透明度
  shadowAlpha: number;
  // 外阴影纵向偏移，基于徽章半径
  shadowOffsetYScale: number;
  // 外阴影半径，基于徽章半径
  shadowRadiusScale: number;
  // 外圈压边/边框的加深系数，数值越小边缘越深
  rimDarken: number;
  // 内层主体颜色的加深系数，主要用于 badge / pinhead
  innerBodyDarken: number;
  // 内层主体尺寸，基于徽章半径
  innerBodyScale: number;
  // 主高光透明度
  highlightAlpha: number;
  // 主高光横向偏移，基于徽章半径
  highlightOffsetXScale: number;
  // 主高光纵向偏移，基于徽章半径
  highlightOffsetYScale: number;
  // 主高光尺寸，基于徽章半径
  highlightRadiusScale: number;
  // 次级高光透明度，主要用于 pinhead 的硬质反光
  secondaryHighlightAlpha: number;
  // 次级高光横向偏移，基于徽章半径
  secondaryHighlightOffsetXScale: number;
  // 次级高光纵向偏移，基于徽章半径
  secondaryHighlightOffsetYScale: number;
  // 次级高光尺寸，基于徽章半径
  secondaryHighlightRadiusScale: number;
  // 内阴影透明度，主要用于 puff 的柔和鼓起感
  innerShadowAlpha: number;
  // 内阴影纵向偏移，基于徽章半径
  innerShadowOffsetYScale: number;
  // 内阴影尺寸，基于徽章半径
  innerShadowRadiusScale: number;
  // 是否启用径向渐变渲染
  gradientEnabled: boolean;
  // 球体中心提亮系数（0.12 = 向白色混合 12%）
  bodyLighten: number;
  // 球体边缘压暗系数（0.18 = 亮度 × 0.82）
  bodyDarken: number;
  // 高光扩散系数（>1.0 扩大高光范围）
  highlightSpread: number;
  // 阴影扩散系数（>1.0 扩大阴影范围）
  shadowSpread: number;
  // 阴影颜色（hex，默认 #000000）
  shadowColor: string;
  // POI 直径占海报短边的比例
  poiRatio: number;
}

type DiagnosticSamplingScale = number; // 1 | 2;

interface RenderScaleRoadConfig {
  motorway: DiagnosticSamplingScale;
  primary: DiagnosticSamplingScale;
  secondary: DiagnosticSamplingScale;
  tertiary: DiagnosticSamplingScale;
  residential: DiagnosticSamplingScale;
  default: DiagnosticSamplingScale;
}

interface RenderScalePoiConfig {
  standard: DiagnosticSamplingScale;
  custom_badge: DiagnosticSamplingScale;
  custom_icon: DiagnosticSamplingScale;
}

interface RenderScaleConfig {
  background: DiagnosticSamplingScale;
  water: DiagnosticSamplingScale;
  parks: DiagnosticSamplingScale;
  roads: RenderScaleRoadConfig;
  pois: RenderScalePoiConfig;
  gradients: DiagnosticSamplingScale;
  text: DiagnosticSamplingScale;
}

function downloadTextFile(filename: string, content: string, mimeType = "application/json") {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function toJsonArrayChunks(chunks: ArrayLike<number>[]) {
  return chunks.map((chunk) => Array.from(chunk));
}

// Internal-only marker theme switch.
const INTERNAL_PIN_THEME_STYLE: PinThemeStyle = "puff";
// 诊断数据下载开关。只有本地环境且此开关为 true 时，才会自动下载 Overpass/WASM fixture。
const INTERNAL_ENABLE_DIAGNOSTIC_FIXTURE_DOWNLOADS = false;
// 诊断日志下载开关。只有本地环境且此开关为 true 时，才会在导出成功后自动下载 render log。
const INTERNAL_ENABLE_DIAGNOSTIC_LOG_DOWNLOADS = false;
// 浏览器诊断用采样配置。后续直接手改这份对象即可，不再通过 profile 名字切换。
const INTERNAL_RENDER_SCALE_CONFIG: RenderScaleConfig = {
  background: 1, // 背景
  water: 1, // 水体
  parks: 1, // 公园绿地
  roads: {
    motorway: 2, // 高速
    primary: 2, // 主干道
    secondary: 1, // 次干道
    tertiary: 1, // 三级道路
    residential: 1, // 住宅
    default: 1, // 默认
  },
  pois: {
    standard: 1,
    custom_badge: 1,
    custom_icon: 1,
  },
  gradients: 1, // 渐变
  text: 1, // 文字
};
// 内部测试用图钉主题参数表。
// 修改这里的数值后，保存并刷新页面即可重新导出对比效果；仅调这些前端参数时，不需要重新打包 wasm。
const INTERNAL_PIN_THEME_CONFIGS: Record<PinThemeStyle, Record<PoiShape, PinThemeConfig>> = {
  puff: {
    circle: {
      style: "puff",
      // --- gradient-active params ---
      gradientEnabled: true,
      shadowAlpha: 0.32, // 控制阴影透明度
      shadowOffsetYScale: 0.32, // 控制阴影向下偏移
      shadowRadiusScale: 0.92, // 值越大，阴影范围越大，通常会显得更“糊”
      shadowSpread: 1.2, // 值越大，阴影越松、越柔
      shadowColor: "#000000",
      poiRatio: 0.016,
      bodyLighten: 0.12,
      bodyDarken: 0.85,
      highlightAlpha: 0.32,
      highlightOffsetXScale: -0.22,
      highlightOffsetYScale: -0.28,
      highlightRadiusScale: 0.72,
      highlightSpread: 1.0,
      iconScale: 0.65,
      iconOffsetYScale: 0,
      fallbackDotScale: 0.28,
      // --- solid-only fallback (dead when gradientEnabled=true) ---
      rimDarken: 0.82,
      innerBodyDarken: 0.96,
      innerBodyScale: 0.88,
      secondaryHighlightAlpha: 0,
      secondaryHighlightOffsetXScale: 0,
      secondaryHighlightOffsetYScale: 0,
      secondaryHighlightRadiusScale: 0,
      innerShadowAlpha: 0.1,
      innerShadowOffsetYScale: 0.22,
      innerShadowRadiusScale: 0.78,
    },
    star: {
      style: "puff",
      gradientEnabled: true,
      shadowAlpha: 0.1, // 控制阴影透明度
      shadowOffsetYScale: 0.1, // 控制阴影向下偏移
      shadowRadiusScale: 1.05, // 值越大，阴影范围越大，通常会显得更“糊”
      shadowSpread: 1.1, // 值越大，阴影越松、越柔
      shadowColor: "#000000",
      poiRatio: 0.02,
      bodyLighten: 0.12,
      bodyDarken: 0.85,
      highlightAlpha: 0.32,
      highlightOffsetXScale: -0.22,
      highlightOffsetYScale: -0.28,
      highlightRadiusScale: 0.72,
      highlightSpread: 1.0,
      iconScale: 0.45,
      iconOffsetYScale: 0,
      fallbackDotScale: 0.24,
      rimDarken: 0.82,
      innerBodyDarken: 0.96,
      innerBodyScale: 0.88,
      secondaryHighlightAlpha: 0,
      secondaryHighlightOffsetXScale: 0,
      secondaryHighlightOffsetYScale: 0,
      secondaryHighlightRadiusScale: 0,
      innerShadowAlpha: 0.1,
      innerShadowOffsetYScale: 0.22,
      innerShadowRadiusScale: 0.78,
    },
    heart: {
      style: "puff",
      gradientEnabled: true,
      shadowAlpha: 0.1,
      shadowOffsetYScale: 0.1,
      shadowRadiusScale: 1.05,
      shadowSpread: 1.1,
      shadowColor: "#000000",
      poiRatio: 0.016,
      bodyLighten: 0.12,
      bodyDarken: 0.85,
      highlightAlpha: 0.32,
      highlightOffsetXScale: -0.22,
      highlightOffsetYScale: -0.28,
      highlightRadiusScale: 0.72,
      highlightSpread: 1.0,
      iconScale: 0.45,
      iconOffsetYScale: 0.25,
      fallbackDotScale: 0.22,
      rimDarken: 0.82,
      innerBodyDarken: 0.96,
      innerBodyScale: 0.88,
      secondaryHighlightAlpha: 0,
      secondaryHighlightOffsetXScale: 0,
      secondaryHighlightOffsetYScale: 0,
      secondaryHighlightRadiusScale: 0,
      innerShadowAlpha: 0.1,
      innerShadowOffsetYScale: 0.22,
      innerShadowRadiusScale: 0.78,
    },
  },

  // 暂不启用
  badge: {
    circle: {
      style: "badge",
      iconScale: 0.78,
      iconOffsetYScale: 0,
      fallbackDotScale: 0.28,
      // 阴影：扁平徽章，阴影小而实，不飘
      shadowAlpha: 0.22, // 0.18→0.22，徽章阴影清晰
      shadowOffsetYScale: 0.14, // 0.18→0.14，偏移略小
      shadowRadiusScale: 0.6, // 1.0→0.60，硬质阴影，收紧
      // 边缘：压制感，像冲压金属边缘
      rimDarken: 0.6, // 0.74→0.60，边缘明显更暗
      innerBodyDarken: 0.82, // 0.9→0.82，内层主体明显压暗，凹入感
      innerBodyScale: 0.88,
      // 高光：极小且弱，接近哑光珐琅，仅有轻微光泽
      highlightAlpha: 0.1, // 0.20→0.10，哑光不该有强高光
      highlightOffsetXScale: -0.14,
      highlightOffsetYScale: -0.26,
      highlightRadiusScale: 0.32, // 0.48→0.32，高光很小很紧
      // 次级高光：无
      secondaryHighlightAlpha: 0,
      secondaryHighlightOffsetXScale: 0,
      secondaryHighlightOffsetYScale: 0,
      secondaryHighlightRadiusScale: 0,
      // 内阴影：无，badge 是平的
      innerShadowAlpha: 0,
      innerShadowOffsetYScale: 0,
      innerShadowRadiusScale: 0,
      gradientEnabled: false,
      bodyLighten: 0.12,
      bodyDarken: 0.18,
      highlightSpread: 1.0,
      shadowSpread: 1.2,
      shadowColor: "#000000",
      poiRatio: 0.016,
    },
    star: {
      style: "badge",
      iconScale: 0.64,
      iconOffsetYScale: 0,
      fallbackDotScale: 0.24,
      shadowAlpha: 0.22,
      shadowOffsetYScale: 0.14,
      shadowRadiusScale: 0.6,
      rimDarken: 0.6,
      innerBodyDarken: 0.82,
      innerBodyScale: 0.88,
      highlightAlpha: 0.1,
      highlightOffsetXScale: -0.14,
      highlightOffsetYScale: -0.26,
      highlightRadiusScale: 0.32,
      secondaryHighlightAlpha: 0,
      secondaryHighlightOffsetXScale: 0,
      secondaryHighlightOffsetYScale: 0,
      secondaryHighlightRadiusScale: 0,
      innerShadowAlpha: 0,
      innerShadowOffsetYScale: 0,
      innerShadowRadiusScale: 0,
      gradientEnabled: false,
      bodyLighten: 0.12,
      bodyDarken: 0.18,
      highlightSpread: 1.0,
      shadowSpread: 1.2,
      shadowColor: "#000000",
      poiRatio: 0.016,
    },
    heart: {
      style: "badge",
      iconScale: 0.6,
      iconOffsetYScale: 0.08,
      fallbackDotScale: 0.22,
      shadowAlpha: 0.22,
      shadowOffsetYScale: 0.14,
      shadowRadiusScale: 0.6,
      rimDarken: 0.6,
      innerBodyDarken: 0.82,
      innerBodyScale: 0.88,
      highlightAlpha: 0.1,
      highlightOffsetXScale: -0.14,
      highlightOffsetYScale: -0.26,
      highlightRadiusScale: 0.32,
      secondaryHighlightAlpha: 0,
      secondaryHighlightOffsetXScale: 0,
      secondaryHighlightOffsetYScale: 0,
      secondaryHighlightRadiusScale: 0,
      innerShadowAlpha: 0,
      innerShadowOffsetYScale: 0,
      innerShadowRadiusScale: 0,
      gradientEnabled: false,
      bodyLighten: 0.12,
      bodyDarken: 0.18,
      highlightSpread: 1.0,
      shadowSpread: 1.2,
      shadowColor: "#000000",
      poiRatio: 0.016,
    },
  },

  pinhead: {
    circle: {
      style: "pinhead",
      iconScale: 0.78,
      iconOffsetYScale: 0,
      fallbackDotScale: 0.28,
      // 阴影：硬质球体投影，清晰
      shadowAlpha: 0.24, // 0.20→0.24
      shadowOffsetYScale: 0.18,
      shadowRadiusScale: 0.8, // 0.96→0.80，玻璃球阴影较实
      // 边缘：玻璃球边缘暗部很重，折射造成深色边圈
      rimDarken: 0.44, // 0.62→0.44，边缘显著更暗
      innerBodyDarken: 0.92, // 0.9→0.92，内部略微暗，背景色透过玻璃
      innerBodyScale: 0.9, // 0.88→0.90
      // 主高光：强且集中，镜面反射点，偏左上
      highlightAlpha: 0.38, // 0.26→0.38，玻璃主高光要强
      highlightOffsetXScale: -0.22, // -0.18→-0.22
      highlightOffsetYScale: -0.32, // -0.28→-0.32，更偏顶部
      highlightRadiusScale: 0.28, // 0.42→0.28，高光小且集中，镜面感
      // 次级高光：右下环境光反射，玻璃球特有
      secondaryHighlightAlpha: 0.2, // 0.14→0.20，加强，模拟底部透光
      secondaryHighlightOffsetXScale: 0.16, // 0.10→0.16，更偏右
      secondaryHighlightOffsetYScale: 0.14, // 0.08→0.14，更偏下
      secondaryHighlightRadiusScale: 0.48, // 0.62→0.48，比主高光大但仍集中
      // 内阴影：无
      innerShadowAlpha: 0,
      innerShadowOffsetYScale: 0,
      innerShadowRadiusScale: 0,
      gradientEnabled: false,
      bodyLighten: 0.12,
      bodyDarken: 0.18,
      highlightSpread: 1.0,
      shadowSpread: 1.2,
      shadowColor: "#000000",
      poiRatio: 0.016,
    },
    star: {
      style: "pinhead",
      iconScale: 0.64,
      iconOffsetYScale: 0,
      fallbackDotScale: 0.24,
      shadowAlpha: 0.24,
      shadowOffsetYScale: 0.18,
      shadowRadiusScale: 0.8,
      rimDarken: 0.44,
      innerBodyDarken: 0.92,
      innerBodyScale: 0.9,
      highlightAlpha: 0.38,
      highlightOffsetXScale: -0.22,
      highlightOffsetYScale: -0.32,
      highlightRadiusScale: 0.28,
      secondaryHighlightAlpha: 0.2,
      secondaryHighlightOffsetXScale: 0.16,
      secondaryHighlightOffsetYScale: 0.14,
      secondaryHighlightRadiusScale: 0.48,
      innerShadowAlpha: 0,
      innerShadowOffsetYScale: 0,
      innerShadowRadiusScale: 0,
      gradientEnabled: false,
      bodyLighten: 0.12,
      bodyDarken: 0.18,
      highlightSpread: 1.0,
      shadowSpread: 1.2,
      shadowColor: "#000000",
      poiRatio: 0.016,
    },
    heart: {
      style: "pinhead",
      iconScale: 0.58,
      iconOffsetYScale: 0.5,
      fallbackDotScale: 0.22,
      shadowAlpha: 0.24,
      shadowOffsetYScale: 0.18,
      shadowRadiusScale: 0.8,
      rimDarken: 0.44,
      innerBodyDarken: 0.92,
      innerBodyScale: 0.9,
      highlightAlpha: 0.38,
      highlightOffsetXScale: -0.22,
      highlightOffsetYScale: -0.32,
      highlightRadiusScale: 0.28,
      secondaryHighlightAlpha: 0.2,
      secondaryHighlightOffsetXScale: 0.16,
      secondaryHighlightOffsetYScale: 0.14,
      secondaryHighlightRadiusScale: 0.48,
      innerShadowAlpha: 0,
      innerShadowOffsetYScale: 0,
      innerShadowRadiusScale: 0,
      gradientEnabled: false,
      bodyLighten: 0.12,
      bodyDarken: 0.18,
      highlightSpread: 1.0,
      shadowSpread: 1.2,
      shadowColor: "#000000",
      poiRatio: 0.016,
    },
  },
};

interface RenderOptions {
  roads_shards: Float64Array[];
  water_bin: Float64Array;
  parks_bin: Float64Array;
  config_json: string;
  custom_font?: Uint8Array;
}

const diagnosticLogBuffer: string[] = [];

function appendDiagnosticLog(line: string) {
  diagnosticLogBuffer.push(`${new Date().toISOString()} ${line}`);
}

function resetDiagnosticLogBuffer() {
  diagnosticLogBuffer.length = 0;
}

function snapshotDiagnosticLogBuffer(): string[] {
  return [...diagnosticLogBuffer];
}

function logDiagnosticMessage(message: string) {
  console.log(message);
  appendDiagnosticLog(message);
}

function formatTimingMs(duration: number): string {
  return `${Math.round(duration)}ms`;
}

function logClientTiming(
  scope: string,
  name: string,
  timings: Record<string, number | string | undefined>
) {
  const parts = Object.entries(timings)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${typeof value === "number" ? formatTimingMs(value) : value}`);
  const line = `[Timing][${scope}][${name}] ${parts.join(" ")}`;
  console.log(line);
  appendDiagnosticLog(line);
}

// Example locations
const EXAMPLES: { location: Location; themeId: string }[] = [
  {
    location: {
      country: "France",
      state: "Ile-de-France",
      city: "Paris",
      lat: 48.8566,
      lng: 2.3522,
    },
    themeId: "vintage-sepia",
  },
  {
    location: { country: "Japan", state: "Tokyo", city: "Tokyo", lat: 35.6762, lng: 139.6503 },
    themeId: "midnight-atlas",
  },
  {
    location: {
      country: "United States",
      state: "New York",
      city: "New York",
      lat: 40.7128,
      lng: -74.006,
    },
    themeId: "navy-gold",
  },
  {
    location: {
      country: "United Kingdom",
      state: "England",
      city: "London",
      lat: 51.5074,
      lng: -0.1278,
    },
    themeId: "antique-parchment",
  },
  {
    location: { country: "Italy", state: "Lazio", city: "Rome", lat: 41.9028, lng: 12.4964 },
    themeId: "forest-expedition",
  },
];

// Worker task helper
let taskIdCounter = 0;
function runInWorker(
  worker: Worker,
  type: WorkerTaskType,
  data: Float64Array | RenderOptions,
  transfers: Transferable[] = [],
  label: string = type
): Promise<Float64Array | Uint8Array> {
  return new Promise((resolve, reject) => {
    const id = taskIdCounter++;
    const handler = (event: MessageEvent) => {
      if (event.data.id === id) {
        worker.removeEventListener("message", handler);
        if (Array.isArray(event.data.logs)) {
          for (const line of event.data.logs as string[]) {
            appendDiagnosticLog(`[Worker][${label}] ${line}`);
          }
        }
        if (event.data.success) {
          if (typeof event.data.duration === "number") {
            const scope = type === "render" ? "render" : "wasm";
            const metric = type === "render" ? "total" : "duration";
            logClientTiming(scope, label, { [metric]: event.data.duration });
          }
          resolve(event.data.result);
        } else {
          reject(new Error(`Worker Protocol Error: ${event.data.error}`));
        }
      }
    };
    const errorHandler = (error: ErrorEvent) => {
      reject(new Error(`Worker Crash: ${error.message}`));
    };
    worker.addEventListener("message", handler);
    worker.addEventListener("error", errorHandler, { once: true });
    worker.postMessage({ id, type, data }, transfers);
  });
}

const yieldMainThread = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

function getStateName(state: Pick<State, "name"> | string | undefined): string {
  return typeof state === "string" ? state : state?.name || "";
}

function getStateIso2(state: Pick<State, "iso2"> | string | undefined): string {
  return typeof state === "string" ? "" : state?.iso2?.toUpperCase() || "";
}

export default function MapPosterGenerator() {
  const isLocalRuntime =
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const shouldDownloadDiagnosticFixtures =
    INTERNAL_ENABLE_DIAGNOSTIC_FIXTURE_DOWNLOADS && isLocalRuntime;
  const shouldDownloadDiagnosticLogs = INTERNAL_ENABLE_DIAGNOSTIC_LOG_DOWNLOADS && isLocalRuntime;

  const {
    countries,
    getStatesByCountry,
    getCitiesByState,
    getCitiesByCountry,
    getDistrictsByCity,
    isLoading: locationLoading,
  } = useLocationData();

  const { activeLang, handleLanguageChange } = useLanguage();
  const {
    customFont,
    fontFileName,
    fontFileInputRef,
    selectedPreset,
    fontLoadingPreset,
    fontCacheRef,
    handleFontUpload,
    clearCustomFont,
    handlePresetFontSelect,
  } = useFontManagement();

  const [location, setLocation] = useState<Location>(EXAMPLES[0].location);
  const [selectedTheme, setSelectedTheme] = useState(THEMES[0]);
  const [customColors, setCustomColors] = useState<MapColors>(THEMES[0].colors);
  const [useCustomColors, setUseCustomColors] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStep, setGenerationStep] = useState("");
  const [isGameOpen, setIsGameOpen] = useState(false);
  const isGameOpenRef = useRef(false); // track isGameOpen without waiting for React re-render
  const generationCompleteRef = useRef(false);
  const currentStepRef = useRef<string>("");
  const [errorModal, setErrorModal] = useState<{
    error: Error;
    step: string;
    diagnostics: Record<string, string>;
  } | null>(null);
  const [customTitle, setCustomTitle] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);
  const [locationMode, setLocationMode] = useState<"search" | "coordinates">("search");
  const locationFlowRequestIdRef = useRef(0);

  // Localized Sizes
  const SIZES: LocalPosterSize[] = useMemo(
    () => [
      {
        id: "iphone",
        name: m.size_iphone(),
        width: 1500,
        height: 3200,
        icon: <Smartphone className="w-4 h-4" />,
      },
      {
        id: "square",
        name: m.size_square(),
        width: 3000,
        height: 3000,
        icon: <Square className="w-4 h-4" />,
      },
      {
        id: "poster-3x4-portrait",
        name: m.size_poster_3x4_portrait(),
        width: 2400,
        height: 3200,
        icon: <FileImage className="w-4 h-4" />,
      },
      {
        id: "poster-9x16-portrait",
        name: m.size_poster_9x16_portrait(),
        width: 2160,
        height: 3840,
        icon: <FileImage className="w-4 h-4" />,
      },
      {
        id: "poster-4x3-landscape",
        name: m.size_poster_4x3_landscape(),
        width: 3200,
        height: 2400,
        icon: <Monitor className="w-4 h-4" />,
      },
      {
        id: "desktop",
        name: m.size_desktop(),
        width: 3840,
        height: 2160,
        icon: <Monitor className="w-4 h-4" />,
      },
      {
        id: "a4-portrait",
        name: m.size_a4_portrait(),
        width: 2480,
        height: 3508,
        icon: <FileImage className="w-4 h-4" />,
      },
      {
        id: "a4-landscape",
        name: m.size_a4_landscape(),
        width: 3508,
        height: 2480,
        icon: <FileImage className="w-4 h-4 rotate-90" />,
      },
    ],
    [activeLang]
  );

  const [selectedSizeId, setSelectedSizeId] = useState<string>("iphone");
  const selectedSize = SIZES.find((size) => size.id === selectedSizeId) || SIZES[0];

  // Map theme IDs to translation functions
  const themeNameMap: Record<string, string> = useMemo(
    () => ({
      "Nordic-Frost": m.theme_nordic_frost(),
      "Desert-Rose": m.theme_desert_rose(),
      "Cyberpunk-Neon": m.theme_cyberpunk_neon(),
      "Sulfur-Slate": m.theme_sulfur_slate(),
      "Vintage-Nautical": m.theme_vintage_nautical(),
      "Lavender-Mist": m.theme_lavender_mist(),
      "Carbon-Fiber": m.theme_carbon_fiber(),
      "Mediterranean-Summer": m.theme_mediterranean_summer(),
      "Royal-Velvet": m.theme_royal_velvet(),
      "Forest-Moss": m.theme_forest_moss(),
      "Cotton-Candy": m.theme_cotton_candy(),
      "Brutalist-Concrete": m.theme_brutalist_concrete(),
      "Solarized-Dark": m.theme_solarized_dark(),
      "Matcha-Latte": m.theme_matcha_latte(),
      "Red-Alert": m.theme_red_alert(),
      "Gilded-Noir": m.theme_gilded_noir(),
      "Ocean-Abyss": m.theme_ocean_abyss(),
      "Sakura-Branch": m.theme_sakura_branch(),
      "Terra-Clay": m.theme_terra_clay(),
      "Glitch-Purple": m.theme_glitch_purple(),
    }),
    [activeLang]
  );

  // 地点选择状态（国 → 省 → 市 → 区 四级联动）
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const [selectedState, setSelectedState] = useState<string>("");
  const [selectedCity, setSelectedCity] = useState<string>("");
  const [selectedDistrict, setSelectedDistrict] = useState<string>(""); // 区/县/郡，通过 Overpass API 动态获取
  const selectedCountryIso2 =
    countries.find((country) => country.name.toLowerCase() === selectedCountry.toLowerCase())?.iso2 || "";
  const [states, setStates] = useState<State[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [districts, setDistricts] = useState<District[]>([]); // 始终包含城市自身作为首选项（id=0）
  const [isStatesLoading, setIsStatesLoading] = useState(false);
  const [isCitiesLoading, setIsCitiesLoading] = useState(false);
  const [isDistrictsLoading, setIsDistrictsLoading] = useState(false);

  const resolveStandaloneRegionFallback = async (
    countryName: string,
    sourceState: Pick<State, "name" | "iso2"> | string | undefined
  ): Promise<{ city: string; lat: number; lng: number } | null> => {
    const stateName = getStateName(sourceState);
    const stateIso = getStateIso2(sourceState);
    if (!stateName || !stateIso) return null;

    const sourceCountry = countries.find(
      (country) => country.name.toLowerCase() === countryName.toLowerCase()
    );
    const standaloneCountry = countries.find(
      (country) =>
        country.iso2.toUpperCase() === stateIso &&
        country.id !== sourceCountry?.id &&
        namesReferToSameLocation(stateName, country.name)
    );
    if (!standaloneCountry) return null;

    const standaloneStates = await getStatesByCountry(standaloneCountry.id);
    const standaloneState =
      standaloneStates.find((state) => state.iso2.toUpperCase() === stateIso) ||
      standaloneStates.find((state) => namesReferToSameLocation(stateName, state.name)) ||
      standaloneStates[0];
    if (!standaloneState) return null;

    const standaloneCities = await getCitiesByState(standaloneState.id);
    const cityWithCoordinates = standaloneCities.find((city) => parseCityCoordinates(city));
    const coordinates = parseCityCoordinates(cityWithCoordinates);
    if (!coordinates) return null;

    return {
      city: stateName,
      ...coordinates,
    };
  };

  // Data settings state
  const [lodMode, setLodMode] = useState<"simplified" | "detailed">("simplified");
  const [baseRadius, setBaseRadius] = useState(15000);

  // Text display toggle state
  const [showCoords, setShowCoords] = useState(true);
  const [showCity, setShowCity] = useState(true);
  const [showCountry, setShowCountry] = useState(true);
  const [enableRoadMaskOptimization, setEnableRoadMaskOptimization] = useState(false);
  const [poiSource, setPoiSource] = useState<PoiSource>("off");
  const [poiShape, setPoiShape] = useState<PoiShape>("circle");
  const [customPois, setCustomPois] = useState<CustomPOI[]>([]);
  const [amapApiKey, setAmapApiKey] = useState("");
  const [isPoiDialogOpen, setIsPoiDialogOpen] = useState(false);
  const internalPinThemeConfig = INTERNAL_PIN_THEME_CONFIGS[INTERNAL_PIN_THEME_STYLE][poiShape];

  const beginLocationFlow = () => ++locationFlowRequestIdRef.current;
  const isLatestLocationFlow = (requestId: number) =>
    requestId === locationFlowRequestIdRef.current;

  // Persistence Handling
  const isRestored = useRef(false);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPersistedConfigRef = useRef<string>("");
  const pendingPersistConfigRef = useRef<string | null>(null);

  const handleLocationModeChange = (mode: "search" | "coordinates") => {
    setLocationMode(mode);
  };

  const handleLatChange = (lat: number) => {
    setLocation((prev) => ({ ...prev, lat }));
  };

  const handleLngChange = (lng: number) => {
    setLocation((prev) => ({ ...prev, lng }));
  };

  const { handleCoordinateReverseGeocode } = useReverseGeocode({
    countries,
    getStatesByCountry,
    getCitiesByState,
    getDistrictsByCity,
    setters: {
      setSelectedCountry,
      setSelectedState,
      setSelectedCity,
      setSelectedDistrict,
      setStates,
      setCities,
      setDistricts,
      setIsStatesLoading,
      setIsCitiesLoading,
      setIsDistrictsLoading,
      setLocation,
    },
  });

  const persistConfig = (configJson: string) => {
    if (!isRestored.current || latestPersistedConfigRef.current === configJson) return;
    localStorage.setItem("maptoposter_config", configJson);
    latestPersistedConfigRef.current = configJson;
  };

  // Persistence Effect: Save settings to LocalStorage whenever they change
  useEffect(() => {
    // Only save if we have finished the initial restoration from LocalStorage
    if (!isRestored.current) return;

    const config = {
      selectedCountry,
      selectedState,
      selectedCity,
      selectedDistrict,
      customTitle,
      lodMode,
      baseRadius,
      selectedSizeId,
      location, // Store the lat/lng coordinates too
      showCoords,
      showCity,
      showCountry,
      enableRoadMaskOptimization,
      poiSource,
      poiShape,
      customPois,
      amapApiKey,
    };
    const configJson = JSON.stringify(config);
    pendingPersistConfigRef.current = configJson;

    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }

    persistTimerRef.current = setTimeout(() => {
      persistConfig(configJson);
      pendingPersistConfigRef.current = null;
      persistTimerRef.current = null;
    }, 400);

    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [
    selectedCountry,
    selectedState,
    selectedCity,
    selectedDistrict,
    customTitle,
    lodMode,
    baseRadius,
    selectedSizeId,
    location,
    showCoords,
    showCity,
    showCountry,
    enableRoadMaskOptimization,
    poiSource,
    poiShape,
    customPois,
    amapApiKey,
  ]);

  useEffect(() => {
    return () => {
      if (pendingPersistConfigRef.current) {
        persistConfig(pendingPersistConfigRef.current);
        pendingPersistConfigRef.current = null;
      }
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const savedConfig = localStorage.getItem("maptoposter_config");
    if (savedConfig && countries.length > 0 && !isRestored.current) {
      try {
        const config = JSON.parse(savedConfig);

        // Restore Size
        if (SIZES.some((size) => size.id === config.selectedSizeId)) {
          setSelectedSizeId(config.selectedSizeId);
        }

        // Restore LOD & Radius
        if (config.lodMode) setLodMode(config.lodMode);
        if (config.baseRadius) setBaseRadius(config.baseRadius);
        if (typeof config.showCoords === "boolean") setShowCoords(config.showCoords);
        if (typeof config.showCity === "boolean") setShowCity(config.showCity);
        if (typeof config.showCountry === "boolean") setShowCountry(config.showCountry);
        if (typeof config.enableRoadMaskOptimization === "boolean") {
          setEnableRoadMaskOptimization(config.enableRoadMaskOptimization);
        }
        // Migrate the old boolean flag to the new mutually exclusive POI source enum.
        if (
          config.poiSource === "off" ||
          config.poiSource === "overpass" ||
          config.poiSource === "custom"
        ) {
          setPoiSource(config.poiSource);
        } else if (typeof config.showPois === "boolean") {
          setPoiSource(config.showPois ? "overpass" : "off");
        }
        if (
          config.poiShape === "circle" ||
          config.poiShape === "star" ||
          config.poiShape === "heart"
        ) {
          setPoiShape(config.poiShape);
        }
        if (Array.isArray(config.customPois)) {
          setCustomPois(config.customPois);
        }
        if (typeof config.amapApiKey === "string") {
          setAmapApiKey(config.amapApiKey);
        }

        // Restore Location Text
        if (config.customTitle) setCustomTitle(config.customTitle);

        // Crucial: Restore Country/State/City selections and trigger their data loading
        if (config.selectedCountry) {
          const country = countries.find((c) => c.name === config.selectedCountry);
          if (country) {
            setSelectedCountry(config.selectedCountry);
            (async () => {
              const requestId = beginLocationFlow();
              setIsStatesLoading(true);
              const countryStates = await getStatesByCountry(country.id);
              if (!isLatestLocationFlow(requestId)) return;
              setStates(countryStates);
              setIsStatesLoading(false);

              if (config.selectedState) {
                const state = countryStates.find((s: any) => s.name === config.selectedState);
                if (state) {
                  setSelectedState(config.selectedState);
                  setIsCitiesLoading(true);
                  const stateCities = await getCitiesByState(state.id);
                  if (!isLatestLocationFlow(requestId)) return;
                  setCities(stateCities);
                  setIsCitiesLoading(false);

                  if (config.selectedCity) {
                    const cityName = config.selectedCity;
                    const city = stateCities.find(
                      (c: any) => c.name.toLowerCase() === cityName.toLowerCase()
                    );
                    const countryCities = city ? stateCities : await getCitiesByCountry(country.id);
                    if (!isLatestLocationFlow(requestId)) return;
                    const fallback =
                      countryCities.length > 0
                        ? null
                        : await resolveStandaloneRegionFallback(config.selectedCountry, state);
                    if (!isLatestLocationFlow(requestId)) return;
                    const resolution = resolveCitySelection(
                      {
                        requestedCityName: cityName,
                        state,
                        stateCities: countryCities,
                      },
                      fallback
                    );
                    const resolvedCityName = resolution.resolvedCityName;
                    const resolvedCoordinates = resolution.coordinates;

                    setSelectedCity(resolvedCityName);

                    // 恢复区选择：先设城市为 fallback，再异步拉 API 结果合并
                    setSelectedDistrict(config.selectedDistrict || resolvedCityName);
                    const cityAsDistrict: District = {
                      id: 0,
                      name: resolvedCityName,
                      lat: resolvedCoordinates?.lat ?? config.location?.lat ?? 0,
                      lng: resolvedCoordinates?.lng ?? config.location?.lng ?? 0,
                    };
                    setIsDistrictsLoading(true);
                    try {
                      const apiDistricts = await getDistrictsByCity(
                        resolvedCityName,
                        config.selectedState,
                        config.selectedCountry
                      );
                      if (!isLatestLocationFlow(requestId)) return;
                      setDistricts([cityAsDistrict, ...apiDistricts]);
                    } catch {
                      if (!isLatestLocationFlow(requestId)) return;
                      setDistricts([cityAsDistrict]);
                    }
                    setIsDistrictsLoading(false);

                    setLocation(
                      buildResolvedLocation({
                        country: config.selectedCountry,
                        state: config.selectedState,
                        city: resolvedCityName,
                        district: config.selectedDistrict || resolvedCityName,
                        coordinates: coalesceCoordinates(resolvedCoordinates, config.location),
                      })
                    );
                  }
                }
              }
              // Mark as restored AFTER child data is loaded
              isRestored.current = true;
            })();
          }
        } else {
          isRestored.current = true;
        }
      } catch (e) {
        console.error("Failed to restore config", e);
        isRestored.current = true;
      }
    } else if (countries.length > 0 && !selectedCountry && !isRestored.current) {
      // Try to auto-detect user location based on IP when no saved config exists
      (async () => {
        try {
          const geo = await getUserGeolocation();
          if (geo) {
            // 1. Find country by ISO2 code
            const country = countries.find(
              (c) => c.iso2.toUpperCase() === geo.country.toUpperCase()
            );

            if (country) {
              setIsStatesLoading(true);
              setIsCitiesLoading(true);
              setSelectedCountry(country.name);

              const countryStates = await getStatesByCountry(country.id);
              setStates(countryStates);
              setIsStatesLoading(false);

              // 2. Find state by region name (fuzzy match)
              let matchedState = countryStates.find(
                (s) => s.name.toLowerCase() === geo.region.toLowerCase()
              );

              // If exact match fails, try fuzzy match
              if (!matchedState && geo.region !== "Unknown") {
                matchedState = countryStates.find(
                  (s) =>
                    s.name.toLowerCase().includes(geo.region.toLowerCase()) ||
                    geo.region.toLowerCase().includes(s.name.toLowerCase())
                );
              }

              // Fallback to first state
              const state = matchedState || countryStates[0];
              if (state) {
                setSelectedState(state.name);
                const stateCities = await getCitiesByState(state.id);
                setCities(stateCities);
                setIsCitiesLoading(false);

                // 3. Find city by name (fuzzy match)
                let matchedCity = stateCities.find(
                  (c) => c.name.toLowerCase() === geo.city.toLowerCase()
                );

                // If exact match fails, try fuzzy match
                if (!matchedCity) {
                  matchedCity = stateCities.find(
                    (c) =>
                      c.name.toLowerCase().includes(geo.city.toLowerCase()) ||
                      geo.city.toLowerCase().includes(c.name.toLowerCase())
                  );
                }

                // Fallback to first city
                const city = matchedCity || stateCities[0];
                if (city) {
                  setSelectedCity(city.name);

                  // Use city coordinates if available, otherwise fallback to IP coordinates
                  let lat =
                    typeof city.latitude === "number"
                      ? city.latitude
                      : parseFloat(city.latitude as string) ||
                        parseFloat(String(geo.latitude)) ||
                        0;
                  let lng =
                    typeof city.longitude === "number"
                      ? city.longitude
                      : parseFloat(city.longitude as string) ||
                        parseFloat(String(geo.longitude)) ||
                        0;

                  // IP 定位成功后拉取区列表（城市自身 + API 数据）
                  setSelectedDistrict(city.name);
                  setDistricts([{ id: 0, name: city.name, lat, lng }]);
                  try {
                    const apiDistricts = await getDistrictsByCity(
                      city.name as string,
                      state.name,
                      country.name
                    );
                    setDistricts([{ id: 0, name: city.name, lat, lng }, ...apiDistricts]);
                  } catch {
                    /* 失败则仅保留城市自身选项 */
                  }

                  setLocation({
                    country: country.name,
                    state: state.name,
                    city: city.name,
                    district: city.name,
                    lat,
                    lng,
                  });
                }
              }
              isRestored.current = true;
              return; // Skip default logic
            }
          }
        } catch (error) {
          console.error("Failed to detect user location:", error);
        }

        // Default initialization if IP detection fails or no match found
        const firstCountry = countries[0];
        setSelectedCountry(firstCountry.name);
        (async () => {
          try {
            setIsStatesLoading(true);
            setIsCitiesLoading(true);
            const countryStates = await getStatesByCountry(firstCountry.id);
            setStates(countryStates);
            setIsStatesLoading(false);
            if (countryStates.length > 0) {
              const firstState = countryStates[0];
              setSelectedState(firstState.name);
              const stateCities = await getCitiesByState(firstState.id);
              setCities(stateCities);
              setIsCitiesLoading(false);
              if (stateCities.length > 0) {
                setSelectedCity(stateCities[0].name);
                const cityName = stateCities[0].name;

                // 优先从城市数据中获取坐标（CDN 数据包含坐标）
                let lat = 0,
                  lng = 0;
                const firstCity = stateCities[0];
                if (firstCity.latitude && firstCity.longitude) {
                  lat =
                    typeof firstCity.latitude === "number"
                      ? firstCity.latitude
                      : parseFloat(firstCity.latitude as string) || 0;
                  lng =
                    typeof firstCity.longitude === "number"
                      ? firstCity.longitude
                      : parseFloat(firstCity.longitude as string) || 0;
                }

                setSelectedDistrict(cityName);
                const cityDistrict: District = { id: 0, name: cityName, lat, lng };
                try {
                  const apiDistricts = await getDistrictsByCity(
                    cityName,
                    firstState.name,
                    firstCountry.name
                  );
                  setDistricts([cityDistrict, ...apiDistricts]);
                } catch {
                  setDistricts([cityDistrict]);
                }

                setLocation({
                  country: firstCountry.name,
                  state: firstState.name,
                  city: cityName,
                  district: cityName,
                  lat,
                  lng,
                });
              }
            }
            isRestored.current = true;
          } catch (error) {
            console.error("Error initializing location data:", error);
            setIsStatesLoading(false);
            setIsCitiesLoading(false);
            isRestored.current = true;
          }
        })();
      })();
    }
  }, [countries]);

  // Remove the old initialization useEffect (lines 182-211) as it's merged above

  const deferredCustomColors = useDeferredValue(customColors);
  const deferredSelectedPreset = useDeferredValue(selectedPreset);
  const colors = useCustomColors ? deferredCustomColors : selectedTheme.colors;

  const handleCountryChange = async (countryName: string) => {
    const requestId = beginLocationFlow();
    setSelectedCountry(countryName);
    setStates([]);
    setCities([]);
    setDistricts([]);
    setIsStatesLoading(true);
    setIsCitiesLoading(true);
    setIsDistrictsLoading(true);
    try {
      const country = countries.find((c) => c.name.toLowerCase() === countryName.toLowerCase());
      const countryStates = await getStatesByCountry(country?.id || 0);
      if (!isLatestLocationFlow(requestId)) return;
      setStates(countryStates);
      setIsStatesLoading(false);
      if (countryStates.length > 0) {
        const firstState = countryStates[0];
        setSelectedState(firstState.name);
        const stateCities = await getCitiesByState(firstState.id);
        if (!isLatestLocationFlow(requestId)) return;
        setCities(stateCities);
        setIsCitiesLoading(false);
        if (stateCities.length > 0) {
          setSelectedCity(stateCities[0].name);
          const cityName = stateCities[0].name;

          // 优先从城市数据中获取坐标（CDN 数据包含坐标）
          let lat = 0,
            lng = 0;
          const firstCity = stateCities[0];
          if (firstCity.latitude && firstCity.longitude) {
            lat =
              typeof firstCity.latitude === "number"
                ? firstCity.latitude
                : parseFloat(firstCity.latitude as string) || 0;
            lng =
              typeof firstCity.longitude === "number"
                ? firstCity.longitude
                : parseFloat(firstCity.longitude as string) || 0;
          }

          // 区列表：城市自身作为默认 fallback + API 获取的区县数据
          setSelectedDistrict(cityName);
          const cityAsDistrict: District = { id: 0, name: cityName, lat, lng };
          try {
            const apiDistricts = await getDistrictsByCity(
              cityName,
              firstState.name,
              country?.name || countryName
            );
            if (!isLatestLocationFlow(requestId)) return;
            setDistricts([cityAsDistrict, ...apiDistricts]);
          } catch {
            if (!isLatestLocationFlow(requestId)) return;
            setDistricts([cityAsDistrict]);
          }
          setIsDistrictsLoading(false);

          setLocation({
            country: country?.name || countryName,
            state: firstState.name,
            city: cityName,
            district: cityName,
            lat,
            lng,
          });
        }
      } else {
        // 没有州/省份数据（如澳门），使用国家名作为城市名
        setSelectedState("");
        setSelectedCity("");
        setSelectedDistrict("");
        setCities([]);
        setDistricts([]);
        setIsCitiesLoading(false);
        setIsDistrictsLoading(false);
        const cityName = countryName;
        // 无法获取坐标，仅设置地区名称
        setLocation({ country: countryName, state: "", city: cityName });
      }
    } catch (error) {
      console.error("Error loading states:", error);
      setIsStatesLoading(false);
      setIsCitiesLoading(false);
      setIsDistrictsLoading(false);
    }
  };

  const handleStateChange = async (stateName: string) => {
    const requestId = beginLocationFlow();
    setSelectedState(stateName);
    setCities([]);
    setDistricts([]);
    setIsCitiesLoading(true);
    setIsDistrictsLoading(true);
    try {
      const state = states.find((s) => s.name.toLowerCase() === stateName.toLowerCase());
      if (state) {
        const stateCities = await getCitiesByState(state.id);
        if (!isLatestLocationFlow(requestId)) return;
        setCities(stateCities);
        setIsCitiesLoading(false);
        if (stateCities.length > 0) {
          const firstCity = stateCities[0];
          setSelectedCity(firstCity.name);
          const cityName = firstCity.name;

          // 优先从城市数据中获取坐标（CDN 数据包含坐标）
          let lat = 0,
            lng = 0;
          if (firstCity.latitude && firstCity.longitude) {
            lat =
              typeof firstCity.latitude === "number"
                ? firstCity.latitude
                : parseFloat(firstCity.latitude as string) || 0;
            lng =
              typeof firstCity.longitude === "number"
                ? firstCity.longitude
                : parseFloat(firstCity.longitude as string) || 0;
          }

          setSelectedDistrict(cityName);
          const cityAsDistrict: District = { id: 0, name: cityName, lat, lng };
          try {
            const apiDistricts = await getDistrictsByCity(cityName, state.name, selectedCountry);
            if (!isLatestLocationFlow(requestId)) return;
            setDistricts([cityAsDistrict, ...apiDistricts]);
          } catch {
            if (!isLatestLocationFlow(requestId)) return;
            setDistricts([cityAsDistrict]);
          }
          setIsDistrictsLoading(false);

          setLocation(
            buildResolvedLocation({
              country: selectedCountry,
              state: state.name,
              city: cityName,
              district: cityName,
              coordinates: { lat, lng },
            })
          );
        } else {
          const country = countries.find(
            (c) => c.name.toLowerCase() === selectedCountry.toLowerCase()
          );
          const countryCities = country ? await getCitiesByCountry(country.id) : [];
          if (!isLatestLocationFlow(requestId)) return;
          const resolution = resolveCitySelection(
            {
              requestedCityName: stateName,
              state,
              stateCities: countryCities,
            },
            await resolveStandaloneRegionFallback(selectedCountry, state)
          );
          if (!isLatestLocationFlow(requestId)) return;
          const cityName = resolution.resolvedCityName;
          setSelectedCity(cityName);
          setSelectedDistrict(cityName);
          setDistricts([
            {
              id: 0,
              name: cityName,
              lat: resolution.coordinates?.lat || 0,
              lng: resolution.coordinates?.lng || 0,
            },
          ]);
          setIsDistrictsLoading(false);
          setLocation(
            buildResolvedLocation({
              country: selectedCountry,
              state: state.name,
              city: cityName,
              district: cityName,
              coordinates: resolution.coordinates || undefined,
            })
          );
        }
      }
    } catch (error) {
      console.error("Error loading cities:", error);
      setIsCitiesLoading(false);
      setIsDistrictsLoading(false);
    }
  };

  const handleCityChange = async (cityName: string) => {
    const requestId = beginLocationFlow();
    setSelectedCity(cityName);
    setDistricts([]);
    setIsDistrictsLoading(true);

    const state = states.find((s) => s.name.toLowerCase() === selectedState.toLowerCase());
    let stateCities: City[] = [];
    if (state) {
      try {
        stateCities = await getCitiesByState(state.id);
        if (!isLatestLocationFlow(requestId)) return;
      } catch (error) {
        console.error("Failed to get coordinates from city data:", error);
      }
    }

    const country = countries.find((c) => c.name.toLowerCase() === selectedCountry.toLowerCase());
    const candidateCities =
      stateCities.length > 0 ? stateCities : country ? await getCitiesByCountry(country.id) : [];
    if (!isLatestLocationFlow(requestId)) return;
    const fallback =
      candidateCities.length > 0
        ? null
        : await resolveStandaloneRegionFallback(selectedCountry, state || selectedState);
    if (!isLatestLocationFlow(requestId)) return;
    const resolution = resolveCitySelection(
      {
        requestedCityName: cityName,
        state: state || null,
        stateCities: candidateCities,
      },
      fallback
    );
    const resolvedCityName = resolution.resolvedCityName;
    const resolvedCoordinates = resolution.coordinates;

    if (resolvedCityName !== cityName) {
      setSelectedCity(resolvedCityName);
    }

    // 构建区列表：城市自身作为默认项（id=0），API 数据排后面
    setSelectedDistrict(resolvedCityName);
    const cityAsDistrict: District = {
      id: 0,
      name: resolvedCityName,
      lat: resolvedCoordinates?.lat ?? location.lat ?? 0,
      lng: resolvedCoordinates?.lng ?? location.lng ?? 0,
    };
    try {
      const apiDistricts = await getDistrictsByCity(
        resolvedCityName,
        selectedState,
        selectedCountry
      );
      if (!isLatestLocationFlow(requestId)) return;
      setDistricts([cityAsDistrict, ...apiDistricts]);
    } catch {
      if (!isLatestLocationFlow(requestId)) return;
      setDistricts([cityAsDistrict]);
    }
    setIsDistrictsLoading(false);

    setLocation(
      buildResolvedLocation({
        country: selectedCountry,
        state: selectedState,
        city: resolvedCityName,
        district: resolvedCityName,
        coordinates: coalesceCoordinates(resolvedCoordinates, location),
      })
    );
  };

  /**
   * 区/县选择变更：从 districts 中查找对应坐标并更新 location
   * 选中城市自身（id=0）时 location.district 仍写城市名，等价于三级选择器的行为
   */
  const handleDistrictChange = (districtName: string) => {
    setSelectedDistrict(districtName);

    const district = districts.find((d) => d.name === districtName);
    if (district) {
      setLocation((prev) => ({
        ...prev,
        district: districtName,
        lat: district.lat,
        lng: district.lng,
      }));
    }
  };

  useEffect(() => {
    init()
      .then(() => {
        init_panic_hook();
      })
      .catch((err) => {
        console.error("Failed to initialize WASM:", err);
      });
  }, []);

  const handleDownload = async (scale: number, exportFormat: ExportFormat = "png") => {
    const generationStart = performance.now();
    const renderScaleConfig = INTERNAL_RENDER_SCALE_CONFIG;
    resetDiagnosticLogBuffer();
    appendDiagnosticLog(
      `[Export] start scale=${scale} format=${exportFormat} location=${location.country}/${location.state || "-"}/${location.city || "-"}/${location.district || "-"}`
    );
    setIsGenerating(true);
    setGenerationProgress(0);
    currentStepRef.current = "step_init";
    setGenerationStep(m.step_init());
    generationCompleteRef.current = false;
    isGameOpenRef.current = false;
    await yieldMainThread();
    const numWorkers = navigator.hardwareConcurrency || 4;
    const workers = Array.from(
      { length: numWorkers },
      () => new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })
    );

    // 设置进度回调，用于接收 data-worker 发来的进度更新
    const progressHandler = (progress: number, step: string) => {
      currentStepRef.current = step;
      // 处理带等待秒数的步骤 (格式: "step_waiting_api:30" 或 "step_retrying_error:55")
      if (step.startsWith("step_waiting_api:")) {
        const seconds = step.split(":")[1];
        setGenerationStep(m.step_waiting_api({ seconds }));
      } else if (step.startsWith("step_retrying_error:")) {
        const seconds = step.split(":")[1];
        logDiagnosticMessage(
          `[App] step_retrying_error: seconds=${seconds}, message=${m.step_retrying_error({ seconds })}`
        );
        setGenerationStep(m.step_retrying_error({ seconds }));
      } else {
        // 处理普通步骤
        const stepKey = step as keyof typeof m;
        if (stepKey && m[stepKey]) {
          // @ts-ignore - 动态调用国际化消息
          setGenerationStep(m[stepKey]());
        } else {
          setGenerationStep(step);
        }
      }
      setGenerationProgress(progress);
    };
    mapDataService.setProgressCallback(progressHandler);

    try {
      setGenerationProgress(5);
      currentStepRef.current = "step_coordinates";
      setGenerationStep(m.step_coordinates());
      await yieldMainThread();
      // 直接使用 location 中已有的坐标（来自城市数据）
      const lat = location.lat || 0;
      const lng = location.lng || 0;

      const width = selectedSize.width * scale;
      const height = selectedSize.height * scale;
      setGenerationProgress(10);
      // 初始获取数据消息，会被 worker 的进度更新覆盖
      currentStepRef.current = "step_fetching_data";
      setGenerationStep(m.step_fetching_data());
      await yieldMainThread();

      // 获取地图数据 (包含 POI)
      // 下载范围使用固定的 canonical fetch viewport，避免同半径切换画幅时重新拉取数据。
      const mapDataStart = performance.now();
      // skipPois: 用户关闭 POI 渲染时跳过 Overpass 请求和缓存检查，节省带宽与时间
      const mapResults = await mapDataService.getMapData(
        location.country,
        location.city,
        lat,
        lng,
        baseRadius,
        lodMode,
        location.district,
        poiSource !== "overpass"
      );

      const { roads, water, parks, pois: poisRaw, fromCache, cacheLevel, isProtomaps } = mapResults;
      logClientTiming("mapData", "getMapData", {
        total: performance.now() - mapDataStart,
        cacheLevel: cacheLevel ?? "unknown",
        roads: roads.length.toString(),
        water: water.length.toString(),
        parks: parks.length.toString(),
        pois: poisRaw.length.toString(),
      });

      // 根据缓存层级设置最终消息
      if (cacheLevel === "memory") {
        currentStepRef.current = "step_restore_memory";
        setGenerationProgress(60);
        setGenerationStep(m.step_restore_memory());
      } else if (fromCache) {
        currentStepRef.current = "step_cache_restore_complete";
        setGenerationProgress(60);
        setGenerationStep(m.step_cache_restore_complete());
      } else {
        currentStepRef.current = "step_fetch_complete";
        setGenerationProgress(60);
        setGenerationStep(m.step_fetch_complete());
      }
      await yieldMainThread();

      setGenerationProgress(62);
      currentStepRef.current = "step_sharding_roads";
      setGenerationStep(m.step_sharding_roads());
      await yieldMainThread();

      const shardStart = performance.now();
      const roadShards = shardRoadsBinary(roads, numWorkers);
      logClientTiming("processing", "shardRoads", {
        total: performance.now() - shardStart,
        shards: roadShards.length.toString(),
      });

      setGenerationProgress(65);
      currentStepRef.current = "step_wasm_processing";
      setGenerationStep(m.step_wasm_processing());
      await yieldMainThread();

      // 这里的 TypedArray 是之后会被 transfer 的
      const waterTyped = water;
      const parksTyped = parks;
      const poisTyped = poisRaw;

      // 并行处理：道路、水体、公园
      // 注意：使用取模确保索引永远在 workers 范围内
      const roadProcessingPromises = roadShards.map((shard, i) =>
        runInWorker(workers[i % numWorkers], "roads", shard, [shard.buffer], `roads_shard_${i + 1}`)
      );

      const wasmProcessingStart = performance.now();
      // 道路、水体、公园并行处理；POI 按用户开关决定是否参与 worker 处理
      const [processedRoadShards, waterBin, parksBin] = await Promise.all([
        Promise.all(roadProcessingPromises),
        runInWorker(workers[0 % numWorkers], "polygons", waterTyped, [waterTyped.buffer], "water"),
        runInWorker(workers[1 % numWorkers], "polygons", parksTyped, [parksTyped.buffer], "parks"),
      ]);
      // 用户关闭 POI 时跳过 worker 处理，直接构造空数组（WASM 会跳过渲染）
      const poisBin =
        poiSource === "overpass"
          ? await runInWorker(
              workers[2 % numWorkers],
              "pois",
              poisTyped,
              [poisTyped.buffer],
              "pois"
            )
          : new Float64Array([0]);
      logClientTiming("processing", "wasmAll", { total: performance.now() - wasmProcessingStart });

      // 数据处理完成
      setGenerationProgress(82);
      currentStepRef.current = "step_processing_complete";
      setGenerationStep(m.step_processing_complete());
      await yieldMainThread();

      setGenerationProgress(84);
      currentStepRef.current = "step_prepare_render";
      setGenerationStep(m.step_prepare_render());
      await yieldMainThread();

      // 准备渲染配置
      const configStart = performance.now();
      const config = {
        center: { lat, lon: lng },
        radius: baseRadius,
        theme: colors,
        width,
        height,
        export_resolution_scale: scale,
        display_city:
          customTitle || location.district?.toUpperCase() || location.city.toUpperCase(),
        display_country: location.country,
        text_position: "bottom",
        selected_size_height: selectedSize.height * scale,
        frontend_scale: scale,
        road_width_boost: isProtomaps ? 1.8 : 1.0,
        // 用户关闭 POI 时不传 pois 字段，WASM 端 #[serde(default)] 自动为 None
        ...(poiSource === "overpass" ? { pois: Array.from(poisBin) } : {}),
        ...(poiSource === "custom"
          ? {
              custom_pois: customPois.map((poi) => ({
                name: poi.name,
                lat: poi.lat,
                lon: poi.lng,
                poi_type: poi.poiType,
                icon: getPoiIconDefinition(poi.poiType),
              })),
            }
          : {}),
        poi_shape: poiShape,
        show_coords: showCoords,
        show_city: showCity,
        show_country: showCountry,
        enable_road_mask_optimization: enableRoadMaskOptimization,
        export_format: exportFormat,
        svg_font_mode: "embed",
        ...(renderScaleConfig
          ? {
              render_scale_config: renderScaleConfig,
            }
          : {}),
        pin_theme_config: {
          ...internalPinThemeConfig,
          // 选择自动时，因为没有icon，所以需要更小的poi圆点
          poiRatio: poiSource === "overpass" ? 0.008 : internalPinThemeConfig.poiRatio,
        },
      };
      logClientTiming("processing", "prepareRenderConfig", {
        total: performance.now() - configStart,
        pois: poisBin.length.toString(),
        exportResolutionScale: scale.toString(),
        renderScaleConfig: JSON.stringify(renderScaleConfig),
      });

      setGenerationProgress(90);
      currentStepRef.current = "step_rendering";
      setGenerationStep(m.step_rendering());
      await yieldMainThread();

      // 构建最终渲染载体
      const configJson = JSON.stringify(config);
      const renderOptions: any = {
        roads_shards: processedRoadShards,
        water_bin: waterBin,
        parks_bin: parksBin,
        config_json: configJson,
      };

      const fixtureSlug = (customTitle || location.district || location.city || "map")
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
        .replace(/^-+|-+$/g, "");
      const fixtureTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fixturePrefix = `${fixtureSlug || "map"}-${fixtureTimestamp}`;

      if (shouldDownloadDiagnosticFixtures) {
        const fixtureDownloadStart = performance.now();
        downloadTextFile(
          `${fixturePrefix}-roads-shards.json`,
          JSON.stringify(toJsonArrayChunks(processedRoadShards))
        );
        downloadTextFile(`${fixturePrefix}-water-bin.json`, JSON.stringify(Array.from(waterBin)));
        downloadTextFile(`${fixturePrefix}-parks-bin.json`, JSON.stringify(Array.from(parksBin)));
        downloadTextFile(`${fixturePrefix}-config.json`, configJson);
        logClientTiming("download", "diagnostic_fixture", {
          total: performance.now() - fixtureDownloadStart,
        });
      }

      const finalTransfers: Transferable[] = [
        ...processedRoadShards.map((s) => s.buffer),
        waterBin.buffer,
        parksBin.buffer,
        // 空 POI 数组无 buffer 可 transfer，仅当用户开启 POI 时加入传输列表
        ...(poiSource === "overpass" && poisBin.length > 1 ? [poisBin.buffer] : []),
      ];

      // 从缓存直接取字体数据，与预览状态解耦
      const fontData = fontCacheRef.current.get(selectedPreset)?.data;
      if (fontData) {
        const fontCopy = new Uint8Array(fontData);
        renderOptions.custom_font = fontCopy;
        finalTransfers.push(fontCopy.buffer);
      }

      // 执行渲染任务
      const renderStart = performance.now();
      const renderedData = await runInWorker(
        workers[0 % numWorkers],
        "render",
        renderOptions,
        finalTransfers,
        "poster"
      );
      logClientTiming("render", "roundTrip", { total: performance.now() - renderStart });

      if (renderedData) {
        setGenerationProgress(97);
        currentStepRef.current = "step_downloading_file";
        setGenerationStep(m.step_downloading_file());
        logDiagnosticMessage(
          `[App] generationCompleteRef set to true isGameOpen=${String(isGameOpen)}`
        );
        generationCompleteRef.current = true;
        await yieldMainThread();

        const downloadStart = performance.now();
        const mimeType = exportFormat === "svg" ? "image/svg+xml;charset=utf-8" : "image/png";
        const blob = new Blob([renderedData as BlobPart], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const outputBaseName = `${(customTitle || location.city).toLowerCase().replace(/\s+/g, "-")}-map-poster`;
        link.href = url;
        link.download = `${outputBaseName}.${exportFormat}`;
        link.click();
        logClientTiming("download", "file", { total: performance.now() - downloadStart });
        logClientTiming("generation", "total", { total: performance.now() - generationStart });
        if (shouldDownloadDiagnosticLogs) {
          const logFileContent = [
            `export_file=${outputBaseName}.${exportFormat}`,
            `fixture_prefix=${fixturePrefix}`,
            `timestamp=${new Date().toISOString()}`,
            `export_resolution_scale=${scale}`,
            `export_resolution_label=${scale}x`,
            `render_scale_config=${JSON.stringify(renderScaleConfig)}`,
            `road_mask_optimization=${String(enableRoadMaskOptimization)}`,
            "",
            ...snapshotDiagnosticLogBuffer(),
          ].join("\n");
          downloadTextFile(`${fixturePrefix}-render-log.txt`, logFileContent, "text/plain");
        }
        setGenerationProgress(100);
        currentStepRef.current = "step_complete";
        setGenerationStep(m.step_complete());
      }
    } catch (error) {
      console.error(m.error_generating(), error);
      appendDiagnosticLog(
        `[Error] ${m.error_generating()} ${
          error instanceof Error ? `${error.name}: ${error.message}` : String(error)
        }`
      );

      const err = error instanceof Error ? error : new Error(String(error));

      const diagnostics: Record<string, string> = {
        Language: activeLang,
        Country: location.country || "(none)",
        State: location.state || "(none)",
        City: location.city || "(none)",
        District: location.district || "(none)",
        Coordinates: `${location.lat?.toFixed(4) ?? "?"}, ${location.lng?.toFixed(4) ?? "?"}`,
        Size: `${selectedSize.width}x${selectedSize.height}`,
        Scale: String(scale),
        "Export Resolution Scale": `${scale}x`,
        Radius: `${baseRadius}m`,
        "LOD Mode": lodMode,
        Theme: selectedTheme.id,
        Font: customFont ? `Custom (${fontFileName})` : selectedPreset,
        "POI Source": poiSource,
        "POI Shape": poiShape,
        "Custom POIs": String(customPois.length),
        "Show Coords": String(showCoords),
        "Show City": String(showCity),
        "Show Country": String(showCountry),
        "Road Mask Optimization": String(enableRoadMaskOptimization),
        "Render Scale Config": JSON.stringify(renderScaleConfig),
        Timestamp: new Date().toISOString(),
        "User Agent": navigator.userAgent,
      };

      setErrorModal({
        error: err,
        step: currentStepRef.current || "unknown",
        diagnostics,
      });
    } finally {
      logDiagnosticMessage(
        `[App] finally block isGameOpenRef=${String(isGameOpenRef.current)} isGameOpen=${String(
          isGameOpen
        )} generationCompleteRef=${String(generationCompleteRef.current)}`
      );
      mapDataService.setProgressCallback(null);
      if (!isGameOpenRef.current) {
        logDiagnosticMessage("[App] finally: closing loading because game is not open");
        setIsGenerating(false);
      } else {
        logDiagnosticMessage("[App] finally: game is open, NOT closing loading");
      }
      workers.forEach((w) => w.terminate());
    }
  };

  useDynamicFont(activeLang);

  const navSections = useMemo<NavSection[]>(
    () => [
      { id: "section-location", icon: <MapPin className="w-5 h-5" />, label: m.location() },
      { id: "section-data", icon: <Settings2 className="w-5 h-5" />, label: m.label_map_radius() },
      {
        id: "section-theme-colors",
        icon: <Palette className="w-5 h-5" />,
        label: m.theme_colors(),
      },
      {
        id: "section-custom-pois",
        icon: <Pin className="w-5 h-5" />,
        label: m.custom_poi_nav_label(),
      },
      {
        id: "section-text-display",
        icon: <Eye className="w-5 h-5" />,
        label: m.render_control(),
      },
      {
        id: "section-font-settings",
        icon: <FileText className="w-5 h-5" />,
        label: m.font_settings(),
      },
      { id: "section-poster-size", icon: <Scaling className="w-5 h-5" />, label: m.poster_size() },
    ],
    [activeLang]
  );
  const { configScrollRef, activeSection, setSectionRef, handleNavNavigate } =
    useConfigNavigation(navSections);

  return (
    <>
      <SEOHead />
      <div className="flex flex-col bg-background md:h-screen md:overflow-hidden">
        <AppHeader
          activeLang={activeLang}
          onLangChange={handleLanguageChange}
          onDownload={(scale, format) => handleDownload(scale, format)}
          isGenerating={isGenerating}
          locationLoading={locationLoading}
        />

        <GenerationModal
          isGenerating={isGenerating}
          generationProgress={generationProgress}
          generationStep={generationStep}
          isGameOpen={isGameOpen}
          generationCompleteRef={generationCompleteRef}
          onGameOpenChange={(open) => {
            setIsGameOpen(open);
            isGameOpenRef.current = open;
            if (!open && generationCompleteRef.current) {
              setIsGenerating(false);
              generationCompleteRef.current = false;
            }
          }}
          onClose={() => {
            setIsGenerating(false);
            generationCompleteRef.current = false;
          }}
          triggerLabel={m.snake_game_trigger()}
        />

        <ErrorModal
          open={errorModal !== null}
          onClose={() => setErrorModal(null)}
          error={errorModal?.error ?? null}
          errorStep={errorModal?.step ?? ""}
          diagnosticInfo={errorModal?.diagnostics ?? {}}
        />

        <POIManagementDialog
          open={isPoiDialogOpen}
          onOpenChange={setIsPoiDialogOpen}
          customPois={customPois}
          setCustomPois={setCustomPois}
          amapApiKey={amapApiKey}
          setAmapApiKey={setAmapApiKey}
          currentLat={location.lat ?? null}
          currentLng={location.lng ?? null}
          areaCacheKey={[
            location.country,
            location.state,
            location.city,
            location.district,
            location.lat?.toFixed(4),
            location.lng?.toFixed(4),
          ]
            .filter(Boolean)
            .join("|")}
          searchCity={selectedCity || location.city || location.district || ""}
          searchCountry={selectedCountry || location.country || ""}
          countryIso2={selectedCountryIso2}
          language={activeLang}
        />

        <main className="flex-1 overflow-auto custom-scrollbar w-full mx-auto px-4 py-6">
          <div className="grid md:grid-cols-[480px_1fr] px-0 md:px-20 gap-8 md:h-full">
            <div className="flex flex-row gap-8 md:min-h-0">
              <ConfigNav
                sections={navSections}
                activeSection={activeSection}
                onNavigate={handleNavNavigate}
              />
              <div
                ref={configScrollRef}
                className="flex-1 space-y-8 md:overflow-y-auto custom-scrollbar md:min-h-0"
                key={activeLang}
              >
                <div id="section-location" ref={setSectionRef("section-location")}>
                  <LocationSettings
                    location={location}
                    countries={countries}
                    states={states}
                    cities={cities}
                    districts={districts}
                    selectedCountry={selectedCountry}
                    selectedState={selectedState}
                    selectedCity={selectedCity}
                    selectedDistrict={selectedDistrict}
                    customTitle={customTitle}
                    isStatesLoading={isStatesLoading}
                    isCitiesLoading={isCitiesLoading}
                    isDistrictsLoading={isDistrictsLoading}
                    locationLoading={locationLoading}
                    onCountryChange={handleCountryChange}
                    onStateChange={handleStateChange}
                    onCityChange={handleCityChange}
                    onDistrictChange={handleDistrictChange}
                    onCustomTitleChange={setCustomTitle}
                    locationMode={locationMode}
                    onLocationModeChange={handleLocationModeChange}
                    coordinateLat={location.lat ?? 0}
                    coordinateLng={location.lng ?? 0}
                    onLatChange={handleLatChange}
                    onLngChange={handleLngChange}
                    onCoordinatesChange={handleCoordinateReverseGeocode}
                  />
                </div>

                <div id="section-data" ref={setSectionRef("section-data")}>
                  <DataSettings baseRadius={baseRadius} onBaseRadiusChange={setBaseRadius} />
                </div>

                <div id="section-theme-colors" ref={setSectionRef("section-theme-colors")}>
                  <ThemeColors
                    selectedTheme={selectedTheme}
                    customColors={customColors}
                    useCustomColors={useCustomColors}
                    themeNameMap={themeNameMap}
                    onThemeChange={(theme) => {
                      setSelectedTheme(theme);
                      setCustomColors(theme.colors);
                      setUseCustomColors(false);
                    }}
                    onCustomColorsChange={setCustomColors}
                    onUseCustomColorsChange={setUseCustomColors}
                  />
                </div>

                <div id="section-custom-pois" ref={setSectionRef("section-custom-pois")}>
                  <CustomPOISettings
                    customPoiCount={customPois.length}
                    poiSource={poiSource}
                    poiShape={poiShape}
                    onManageClick={() => setIsPoiDialogOpen(true)}
                    onPoiSourceChange={setPoiSource}
                    onPoiShapeChange={setPoiShape}
                  />
                </div>

                <div id="section-text-display" ref={setSectionRef("section-text-display")}>
                  <RenderControlSettings
                    showCoords={showCoords}
                    showCity={showCity}
                    showCountry={showCountry}
                    enableRoadMaskOptimization={enableRoadMaskOptimization}
                    onShowCoordsChange={setShowCoords}
                    onShowCityChange={setShowCity}
                    onShowCountryChange={setShowCountry}
                    onEnableRoadMaskOptimizationChange={setEnableRoadMaskOptimization}
                  />
                </div>

                <div id="section-font-settings" ref={setSectionRef("section-font-settings")}>
                  <FontSettings
                    customFont={customFont}
                    fontFileName={fontFileName}
                    fontFileInputRef={fontFileInputRef}
                    onFontUpload={handleFontUpload}
                    onClearFont={clearCustomFont}
                    selectedPreset={selectedPreset}
                    fontLoadingPreset={fontLoadingPreset}
                    onPresetFontSelect={handlePresetFontSelect}
                  />
                </div>

                <div id="section-poster-size" ref={setSectionRef("section-poster-size")}>
                  <PosterSizeSelector
                    sizes={SIZES}
                    selectedSize={selectedSize}
                    onSizeChange={(size) => setSelectedSizeId(size.id)}
                  />
                </div>
              </div>
            </div>

            <MapPreview
              location={location}
              selectedSize={selectedSize}
              selectedThemeName={themeNameMap[selectedTheme.id] || selectedTheme.name}
              poiSourceLabel={
                poiSource === "off"
                  ? m.poi_source_off()
                  : poiSource === "overpass"
                    ? m.poi_source_overpass()
                    : m.poi_source_custom()
              }
              summaryLabels={{
                title: m.preview_summary_title(),
                location: m.preview_summary_location(),
                coordinates: m.preview_summary_coordinates(),
                size: m.preview_summary_size(),
                theme: m.preview_summary_theme(),
                poi: m.preview_summary_poi(),
                text: m.preview_summary_text(),
                none: m.preview_summary_none(),
                city: m.toggle_show_city(),
                country: m.toggle_show_country(),
                coordinatesToggle: m.toggle_show_coords(),
              }}
              colors={colors}
              customPois={customPois}
              showCustomPois={poiSource === "custom"}
              fontCacheRef={fontCacheRef}
              selectedPreset={deferredSelectedPreset}
              baseRadius={baseRadius}
              customTitle={customTitle}
              showCoords={showCoords}
              showCity={showCity}
              showCountry={showCountry}
              previewRef={previewRef}
              previewHint={m.preview_actual_result()}
              interactive={locationMode === "coordinates"}
              onMove={(loc) => {
                setLocation((prev) => ({ ...prev, lat: loc.lat, lng: loc.lon }));
              }}
              onMoveEnd={(loc) => {
                setLocation((prev) => ({ ...prev, lat: loc.lat, lng: loc.lon }));
                handleCoordinateReverseGeocode(loc.lat, loc.lon);
              }}
            />
          </div>
          <PosterGallery />
          <Footer activeLang={activeLang} />
        </main>
      </div>
    </>
  );
}
