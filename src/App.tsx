import { useState, useRef, useEffect, useDeferredValue } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LocationCombobox } from "@/components/location-combobox";
import {
  Download,
  MapPin,
  Palette,
  Square,
  Smartphone,
  Monitor,
  FileImage,
  Loader2,
  AlertCircle,
  Type,
  FileText,
  FileCheck,
  Settings2,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { MapPosterPreview } from "@/components/artistic-map";
import { cn } from "@/lib/utils";
import { useLocationData } from "@/hooks/useLocationData";
import { getUserGeolocation } from "@/services/ip-geolocation";

// WASM and Utils
import init, { init_panic_hook } from "./pkg/wasm";
import { shardRoadsBinary } from "./utils";
import { type MapColors, MAP_THEMES as THEMES } from "@/lib/types";
import { mapDataService } from "./services/map-data";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Paraglide i18n
import * as m from "@/paraglide/messages";
import { getLocale, setLocale, locales } from "@/paraglide/runtime";
import { useDynamicFont } from "./hooks/useDynamicFont";

type AvailableLanguageTag = (typeof locales)[number];

// Types
interface Location {
  country: string;
  state: string;
  city: string;
  lat?: number;
  lng?: number;
}

interface PosterSize {
  id: string;
  name: string;
  width: number;
  height: number;
  icon: React.ReactNode;
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
  type: string,
  data: any,
  transfers: Transferable[] = []
): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = taskIdCounter++;
    const handler = (event: MessageEvent) => {
      if (event.data.id === id) {
        worker.removeEventListener("message", handler);
        if (event.data.success) {
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
const FRONTEND_SCALE = 1;

export default function MapPosterGenerator() {
  const {
    countries,
    getStatesByCountry,
    getCitiesByState,
    isLoading: locationLoading,
  } = useLocationData();

  // i18n language state
  const [activeLang, setActiveLang] = useState<AvailableLanguageTag>(getLocale());

  const [location, setLocation] = useState<Location>(EXAMPLES[0].location);
  const [selectedTheme, setSelectedTheme] = useState(THEMES[0]);
  const [customColors, setCustomColors] = useState<MapColors>(THEMES[0].colors);
  const [useCustomColors, setUseCustomColors] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStep, setGenerationStep] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);

  // Localized Sizes
  const SIZES: PosterSize[] = [
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
    {
      id: "square",
      name: m.size_square(),
      width: 3000,
      height: 3000,
      icon: <Square className="w-4 h-4" />,
    },
    {
      id: "phone",
      name: m.size_phone(),
      width: 1748,
      height: 3780,
      icon: <Smartphone className="w-4 h-4" />,
    },
    {
      id: "desktop",
      name: m.size_desktop(),
      width: 3840,
      height: 2160,
      icon: <Monitor className="w-4 h-4" />,
    },
  ];

  const [selectedSize, setSelectedSize] = useState(SIZES[0]);

  // Map theme IDs to translation functions
  const themeNameMap: Record<string, string> = {
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
  };

  // Location selection state
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const [selectedState, setSelectedState] = useState<string>("");
  const [selectedCity, setSelectedCity] = useState<string>("");
  const [states, setStates] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [isStatesLoading, setIsStatesLoading] = useState(false);
  const [isCitiesLoading, setIsCitiesLoading] = useState(false);

  // Font upload state
  const [customFont, setCustomFont] = useState<Uint8Array | null>(null);
  const [fontFileName, setFontFileName] = useState<string>("");
  const fontFileInputRef = useRef<HTMLInputElement>(null);

  // Data settings state
  const [lodMode, setLodMode] = useState<"simplified" | "detailed">("simplified");
  const [baseRadius, setBaseRadius] = useState(15000);

  // Initialize language on mount
  useEffect(() => {
    const savedLang = localStorage.getItem("lang") as AvailableLanguageTag;
    if (savedLang && locales.includes(savedLang)) {
      setLocale(savedLang, { reload: false });
      setActiveLang(savedLang);
    } else {
      const browserLang = navigator.language;
      const matchedLang = locales.find((tag) => browserLang.startsWith(tag));
      const finalLang = (matchedLang || "en") as AvailableLanguageTag;
      setLocale(finalLang, { reload: false });
      setActiveLang(finalLang);
      localStorage.setItem("lang", finalLang);
    }

    document.title = `${m.app_title()} - ${m.app_subtitle()}`;
  }, []);

  const handleLanguageChange = (newLang: AvailableLanguageTag) => {
    setLocale(newLang, { reload: false });
    setActiveLang(newLang);
    localStorage.setItem("lang", newLang);
    document.title = `${m.app_title()} - ${m.app_subtitle()}`;
  };

  // Persistence Handling
  const isRestored = useRef(false);

  // Persistence Effect: Save settings to LocalStorage whenever they change
  useEffect(() => {
    // Only save if we have finished the initial restoration from LocalStorage
    if (!isRestored.current) return;

    const config = {
      selectedCountry,
      selectedState,
      selectedCity,
      customTitle,
      lodMode,
      baseRadius,
      selectedSizeId: selectedSize.id,
      location, // Store the lat/lng coordinates too
    };
    localStorage.setItem("maptoposter_config", JSON.stringify(config));
  }, [
    selectedCountry,
    selectedState,
    selectedCity,
    customTitle,
    lodMode,
    baseRadius,
    selectedSize,
    location,
  ]);

  useEffect(() => {
    const savedConfig = localStorage.getItem("maptoposter_config");
    if (savedConfig && countries.length > 0 && !isRestored.current) {
      try {
        const config = JSON.parse(savedConfig);

        // Restore Size
        const savedSize = SIZES.find((s) => s.id === config.selectedSizeId);
        if (savedSize) setSelectedSize(savedSize);

        // Restore LOD & Radius
        if (config.lodMode) setLodMode(config.lodMode);
        if (config.baseRadius) setBaseRadius(config.baseRadius);

        // Restore Location Text/Coords
        if (config.customTitle) setCustomTitle(config.customTitle);
        if (config.location) setLocation(config.location);

        // Crucial: Restore Country/State/City selections and trigger their data loading
        if (config.selectedCountry) {
          const country = countries.find((c) => c.name === config.selectedCountry);
          if (country) {
            setSelectedCountry(config.selectedCountry);
            (async () => {
              setIsStatesLoading(true);
              const countryStates = await getStatesByCountry(country.id);
              setStates(countryStates);
              setIsStatesLoading(false);

              if (config.selectedState) {
                const state = countryStates.find((s: any) => s.name === config.selectedState);
                if (state) {
                  setSelectedState(config.selectedState);
                  setIsCitiesLoading(true);
                  const stateCities = await getCitiesByState(state.id);
                  setCities(stateCities);
                  setIsCitiesLoading(false);

                  if (config.selectedCity) {
                    setSelectedCity(config.selectedCity);
                    // 获取坐标（优先从城市数据获取）
                    const cityName = config.selectedCity;

                    // 优先从城市数据中获取坐标（CDN 数据包含坐标）
                    let lat = 0,
                      lng = 0;
                    const city = stateCities.find(
                      (c: any) => c.name.toLowerCase() === cityName.toLowerCase()
                    );
                    if (city && city.latitude && city.longitude) {
                      lat =
                        typeof city.latitude === "number"
                          ? city.latitude
                          : parseFloat(city.latitude as string) || 0;
                      lng =
                        typeof city.longitude === "number"
                          ? city.longitude
                          : parseFloat(city.longitude as string) || 0;
                    }

                    setLocation({
                      country: config.selectedCountry,
                      state: config.selectedState,
                      city: cityName,
                      lat,
                      lng,
                    });
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
                      : parseFloat(city.latitude as string) || parseFloat(geo.latitude) || 0;
                  let lng =
                    typeof city.longitude === "number"
                      ? city.longitude
                      : parseFloat(city.longitude as string) || parseFloat(geo.longitude) || 0;

                  setLocation({
                    country: country.name,
                    state: state.name,
                    city: city.name,
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

                setLocation({
                  country: firstCountry.name,
                  state: firstState.name,
                  city: cityName,
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
  const colors = useCustomColors ? deferredCustomColors : selectedTheme.colors;

  const stableTheme = {
    bg: colors.bg,
    water: colors.water,
    parks: colors.parks,
    road_motorway: colors.road_motorway,
    road_primary: colors.road_primary,
    road_secondary: colors.road_secondary,
    road_tertiary: colors.road_tertiary,
    road_residential: colors.road_residential,
    road_default: colors.road_default,
    route: colors.poi_color || colors.text || colors.bg,
    poi: colors.poi_color || colors.road_default,
  };

  const stableMapLocation = {
    lat: location.lat || 0,
    lon: location.lng || 0,
  };

  const handleCountryChange = async (countryName: string) => {
    setSelectedCountry(countryName);
    setStates([]);
    setCities([]);
    setIsStatesLoading(true);
    setIsCitiesLoading(true);
    try {
      const country = countries.find((c) => c.name.toLowerCase() === countryName.toLowerCase());
      const countryStates = await getStatesByCountry(country?.id || 0);
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

          setLocation({
            country: country?.name || countryName,
            state: firstState.name,
            city: cityName,
            lat,
            lng,
          });
        }
      } else {
        // 没有州/省份数据（如澳门），使用国家名作为城市名
        setSelectedState("");
        setSelectedCity("");
        setCities([]);
        setIsCitiesLoading(false);
        const cityName = countryName;
        // 无法获取坐标，仅设置地区名称
        setLocation({ country: countryName, state: "", city: cityName });
      }
    } catch (error) {
      console.error("Error loading states:", error);
      setIsStatesLoading(false);
      setIsCitiesLoading(false);
    }
  };

  const handleStateChange = async (stateName: string) => {
    setSelectedState(stateName);
    setCities([]);
    setIsCitiesLoading(true);
    try {
      const state = states.find((s) => s.name.toLowerCase() === stateName.toLowerCase());
      if (state) {
        const stateCities = await getCitiesByState(state.id);
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

          setLocation({
            country: selectedCountry,
            state: state.name,
            city: cityName,
            lat,
            lng,
          });
        } else {
          // No cities found, use state name as city
          const cityName = stateName;
          setSelectedCity(cityName);
          setCities([]);
          setLocation({ country: selectedCountry, state: state.name, city: cityName });
        }
      }
    } catch (error) {
      console.error("Error loading cities:", error);
      setIsCitiesLoading(false);
    }
  };

  const handleCityChange = async (cityName: string) => {
    setSelectedCity(cityName);

    // 获取城市坐标
    let lat = 0,
      lng = 0;

    // 首先尝试从已加载的城市数据中获取坐标（CDN 数据包含坐标）
    const state = states.find((s) => s.name.toLowerCase() === selectedState.toLowerCase());
    if (state) {
      try {
        const stateCities = await getCitiesByState(state.id);
        const city = stateCities.find((c: any) => c.name.toLowerCase() === cityName.toLowerCase());
        if (city && city.latitude && city.longitude) {
          lat =
            typeof city.latitude === "number"
              ? city.latitude
              : parseFloat(city.latitude as string) || 0;
          lng =
            typeof city.longitude === "number"
              ? city.longitude
              : parseFloat(city.longitude as string) || 0;
        }
      } catch (error) {
        console.error("Failed to get coordinates from city data:", error);
      }
    }

    setLocation({ country: selectedCountry, state: selectedState, city: cityName, lat, lng });
  };

  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".ttf") && !fileName.endsWith(".otf")) {
      alert(m.font_upload_error());
      if (fontFileInputRef.current) fontFileInputRef.current.value = "";
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert(m.font_upload_error());
      if (fontFileInputRef.current) fontFileInputRef.current.value = "";
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const fontData = new Uint8Array(arrayBuffer);
      setCustomFont(fontData);
      setFontFileName(file.name);
    } catch (error) {
      console.error("Font upload failed:", error);
      alert(m.font_upload_error());
      setCustomFont(null);
      setFontFileName("");
    }
  };

  const clearCustomFont = () => {
    setCustomFont(null);
    setFontFileName("");
    if (fontFileInputRef.current) {
      fontFileInputRef.current.value = "";
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

  const handleDownload = async () => {
    setIsGenerating(true);
    setGenerationProgress(0);
    setGenerationStep(m.step_init());
    await yieldMainThread();
    const numWorkers = navigator.hardwareConcurrency || 4;
    const workers = Array.from(
      { length: numWorkers },
      () => new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })
    );

    // 设置进度回调，用于接收 data-worker 发来的进度更新
    const progressHandler = (progress: number, step: string) => {
      // 处理带等待秒数的步骤 (格式: "step_waiting_api:30" 或 "step_retrying_error:55")
      if (step.startsWith("step_waiting_api:")) {
        const seconds = step.split(":")[1];
        setGenerationStep(m.step_waiting_api({ seconds }));
      } else if (step.startsWith("step_retrying_error:")) {
        const seconds = step.split(":")[1];
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
      setGenerationStep(m.step_coordinates());
      await yieldMainThread();
      // 直接使用 location 中已有的坐标（来自城市数据）
      const lat = location.lat || 0;
      const lng = location.lng || 0;

      const width = selectedSize.width * FRONTEND_SCALE;
      const height = selectedSize.height * FRONTEND_SCALE;
      setGenerationProgress(10);
      // 初始获取数据消息，会被 worker 的进度更新覆盖
      setGenerationStep(m.step_fetching_data());
      await yieldMainThread();

      // 【优化】：获取地图数据 (包含 POI)
      // 根据画幅比例计算补偿后的 radius，确保数据覆盖渲染区域
      // Landscape: width > height, aspect > 1, need radius * aspect
      // Portrait: height > width, aspect < 1, need radius / aspect
      const aspect = selectedSize.width / selectedSize.height;
      const compensatedRadius = baseRadius * Math.max(aspect, 1 / aspect);
      const mapResults = await mapDataService.getMapData(
        location.country,
        location.city,
        lat,
        lng,
        compensatedRadius,
        lodMode
      );

      const { roads, water, parks, pois: poisRaw, fromCache, cacheLevel, isProtomaps } = mapResults;

      // 根据缓存层级设置最终消息
      if (cacheLevel === "memory") {
        setGenerationProgress(60);
        setGenerationStep(m.step_restore_memory());
      } else {
        setGenerationProgress(60);
        setGenerationStep(fromCache ? m.step_restore_cache() : m.step_fetch_complete());
      }
      await yieldMainThread();

      setGenerationProgress(70);
      setGenerationStep(m.step_processing());
      await yieldMainThread();

      const roadShards = shardRoadsBinary(roads, numWorkers);
      // 这里的 TypedArray 是之后会被 transfer 的
      const waterTyped = water;
      const parksTyped = parks;
      const poisTyped = poisRaw;

      // 并行处理：道路、水体、公园
      // 注意：使用取模确保索引永远在 workers 范围内
      const roadProcessingPromises = roadShards.map((shard, i) =>
        runInWorker(workers[i % numWorkers], "roads", shard, [shard.buffer])
      );

      const [processedRoadShards, waterBin, parksBin, poisBin] = await Promise.all([
        Promise.all(roadProcessingPromises),
        runInWorker(workers[0 % numWorkers], "polygons", waterTyped, [waterTyped.buffer]),
        runInWorker(workers[1 % numWorkers], "polygons", parksTyped, [parksTyped.buffer]),
        runInWorker(workers[2 % numWorkers], "pois", poisTyped, [poisTyped.buffer]),
      ]);

      // 数据处理完成
      setGenerationProgress(70);
      setGenerationStep(m.step_processing_complete());
      await yieldMainThread();

      // 准备渲染配置
      const config = {
        center: { lat, lon: lng },
        radius: baseRadius,
        theme: colors,
        width,
        height,
        display_city: customTitle || location.city.toUpperCase(),
        display_country: location.country,
        text_position: "bottom",
        selected_size_height: selectedSize.height * FRONTEND_SCALE,
        frontend_scale: FRONTEND_SCALE,
        road_width_boost: isProtomaps ? 1.8 : 1.0, // 关键：如果是 Protomaps，则将全域线宽补偿 1.8 倍以对齐 Overpass 质感
        pois: Array.from(poisBin),
      };

      setGenerationProgress(90);
      setGenerationStep(m.step_rendering());
      await yieldMainThread();

      // 构建最终渲染载体
      const renderOptions: any = {
        roads_shards: processedRoadShards,
        water_bin: waterBin,
        parks_bin: parksBin,
        config_json: JSON.stringify(config),
      };

      const finalTransfers: Transferable[] = [
        ...processedRoadShards.map((s) => s.buffer),
        waterBin.buffer,
        parksBin.buffer,
        poisBin.buffer,
      ];

      // 如果有自定义字体，注入
      if (customFont) {
        const fontCopy = new Uint8Array(customFont);
        renderOptions.custom_font = fontCopy;
        finalTransfers.push(fontCopy.buffer);
      }

      // 执行渲染任务
      const pngData = await runInWorker(
        workers[0 % numWorkers],
        "render",
        renderOptions,
        finalTransfers
      );

      if (pngData) {
        setGenerationProgress(100);
        setGenerationStep(m.step_complete());
        await yieldMainThread();

        const blob = new Blob([pngData], { type: "image/png" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${(customTitle || location.city).toLowerCase().replace(/\s+/g, "-")}-map-poster.png`;
        link.click();
      }
    } catch (error) {
      console.error(m.error_generating(), error);
      alert(m.error_generating() + (error instanceof Error ? error.message : String(error)));
    } finally {
      mapDataService.setProgressCallback(null);
      setIsGenerating(false);
      workers.forEach((w) => w.terminate());
    }
  };

  const languageNames: Record<AvailableLanguageTag, string> = {
    en: "English",
    "zh-CN": "简体中文",
    ja: "日本語",
    ko: "한국어",
    fr: "Français",
    de: "Deutsch",
    es: "Español",
  };

  useDynamicFont(activeLang);

  return (
    <div className="flex flex-col bg-background md:h-screen md:overflow-hidden">
      <header className="shrink-0 bg-background">
        <div className="container mx-auto px-4 py-4 flex items-center">
          <img className="w-10 h-10 mr-2" src="/icon.svg" alt="icon" />
          <div className="mr-auto select-none">
            <h1 className="text-2xl tracking-wide font-serif text-foreground">{m.app_title()}</h1>
            <p className="text-xs tracking-widest uppercase text-muted-foreground">
              {m.app_subtitle()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select
              value={activeLang}
              onValueChange={(val) => handleLanguageChange(val as AvailableLanguageTag)}
            >
              <SelectTrigger className="w-[90px] sm:w-[120px] h-9 border-border bg-card text-card-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {locales.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {languageNames[tag]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleDownload}
              disabled={isGenerating || locationLoading}
              className="gap-1 sm:gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">
                {isGenerating ? m.generating() : m.download_button()}
              </span>
            </Button>
          </div>
        </div>
      </header>

      {isGenerating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <Card className="w-[400px] p-6 shadow-2xl bg-card border-primary">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-lg text-primary">{m.creating_art()}</h3>
                <span className="text-sm font-mono text-primary/60">
                  {Math.round(generationProgress)}%
                </span>
              </div>
              <Progress value={generationProgress} className="h-2 bg-secondary" />
              <p className="text-sm text-center animate-pulse text-muted-foreground">
                {generationStep}
              </p>
            </div>
          </Card>
        </div>
      )}

      <main className="md:flex-1 md:overflow-hidden container mx-auto px-4 py-6">
        <div className="grid md:grid-cols-[380px_1fr] gap-8 md:h-full">
          <div className="space-y-5 md:overflow-y-auto custom-scrollbar md:min-h-0">
            <Card className="p-4 bg-card border-border">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                <h2 className="text-lg font-serif text-foreground">{m.location()}</h2>
              </div>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    {m.label_country()}
                  </Label>
                  <LocationCombobox
                    options={countries}
                    value={selectedCountry}
                    onValueChange={handleCountryChange}
                    placeholder={m.placeholder_select_country()}
                    emptyText={m.empty_country()}
                    disabled={locationLoading}
                  />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    {m.label_state()}
                  </Label>
                  <LocationCombobox
                    options={states}
                    value={selectedState}
                    onValueChange={handleStateChange}
                    placeholder={m.placeholder_select_state()}
                    emptyText={m.empty_state()}
                    disabled={states.length === 0 && !isStatesLoading}
                    isLoading={isStatesLoading}
                  />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    {m.label_city()}
                  </Label>
                  <LocationCombobox
                    options={cities}
                    value={selectedCity}
                    onValueChange={handleCityChange}
                    placeholder={m.placeholder_select_city()}
                    emptyText={m.empty_city()}
                    disabled={cities.length === 0 && !isCitiesLoading}
                    isLoading={isCitiesLoading}
                  />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    {m.label_custom_title()}
                  </Label>
                  <Input
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder={location.city}
                    className="border-border bg-card text-foreground"
                  />
                </div>
              </div>
            </Card>

            <Card className="p-4 bg-card border-border">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-primary" />
                <h2 className="text-lg font-serif text-foreground">{m.label_lod_mode()}</h2>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    {m.label_lod_mode()}
                  </Label>
                  <Tabs
                    value={lodMode}
                    onValueChange={(val) => setLodMode(val as "simplified" | "detailed")}
                    className="w-full"
                  >
                    <TabsList className="w-full bg-secondary">
                      <TabsTrigger
                        value="simplified"
                        className="flex-1 text-foreground data-[state=active]:text-vanilla"
                      >
                        {m.lod_simplified()}
                      </TabsTrigger>
                      <TabsTrigger
                        value="detailed"
                        className="flex-1 text-foreground data-[state=active]:text-vanilla"
                      >
                        {m.lod_detailed()}
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  {lodMode === "detailed" && (
                    <div className="mt-2 flex items-start gap-2.5 p-3 bg-primary/5 border border-primary/10 transition-all duration-300 animate-in fade-in slide-in-from-top-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary/60" />
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium uppercase tracking-widest opacity-70 text-primary">
                          {m.label_note()}
                        </p>
                        <p className="text-[10px] leading-normal italic font-serif text-muted-foreground">
                          {m.lod_detailed_desc()}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                      {m.label_map_radius()}
                    </Label>
                    <span className="text-xs font-mono text-primary">{baseRadius}m</span>
                  </div>
                  <Select
                    value={baseRadius.toString()}
                    onValueChange={(val) => setBaseRadius(parseInt(val))}
                  >
                    <SelectTrigger className="w-full h-9 border-border bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 18 }, (_, i) => 3000 + i * 1000).map((radius) => (
                        <SelectItem key={radius} value={radius.toString()}>
                          {radius}m
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] italic px-1 text-muted-foreground">{m.radius_desc()}</p>
                </div>
              </div>
            </Card>

            <Card className="p-4 bg-card border-border">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-primary" />
                <h2 className="text-lg font-serif text-foreground">{m.theme_colors()}</h2>
              </div>
              <Tabs defaultValue="presets" className="w-full">
                <TabsList className="w-full bg-secondary">
                  <TabsTrigger
                    value="presets"
                    className="flex-1 text-foreground data-[state=active]:text-vanilla"
                    onClick={() => setUseCustomColors(false)}
                  >
                    {m.tab_presets()}
                  </TabsTrigger>
                  <TabsTrigger
                    value="custom"
                    className="flex-1 text-foreground data-[state=active]:text-vanilla"
                    onClick={() => setUseCustomColors(true)}
                  >
                    {m.tab_custom()}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="presets" className="mt-3">
                  <div className="grid grid-cols-2 gap-2">
                    {THEMES.map((theme) => (
                      <button
                        key={theme.id}
                        onClick={() => {
                          setSelectedTheme(theme);
                          setCustomColors(theme.colors);
                          setUseCustomColors(false);
                        }}
                        className={cn(
                          "p-2 border-1 transition-all flex flex-col items-start gap-2",
                          selectedTheme.id === theme.id && !useCustomColors
                            ? "border-primary bg-background/60"
                            : "border-transparent bg-transparent hover:bg-background/50"
                        )}
                      >
                        <div className="flex -space-x-1.5">
                          {Object.values(theme.colors)
                            .slice(0, 4)
                            .map((color, i) => (
                              <div
                                key={i}
                                className="w-5 h-5 border border-background shadow-sm"
                                style={{ backgroundColor: color }}
                              />
                            ))}
                        </div>
                        <span className="text-[11px] font-medium line-clamp-1 text-foreground">
                          {themeNameMap[theme.id] || theme.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="custom" className="mt-3">
                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar pt-1">
                    {[
                      { key: "bg", label: m.color_bg() },
                      { key: "text", label: m.color_text() },
                      { key: "gradient_color", label: m.color_gradient() },
                      { key: "water", label: m.color_water() },
                      { key: "parks", label: m.color_parks() },
                      { key: "poi_color", label: m.color_poi() },
                      { key: "road_motorway", label: m.color_road_motorway() },
                      { key: "road_primary", label: m.color_road_primary() },
                      { key: "road_secondary", label: m.color_road_secondary() },
                      { key: "road_tertiary", label: m.color_road_tertiary() },
                      { key: "road_residential", label: m.color_road_residential() },
                      { key: "road_default", label: m.color_road_default() },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center justify-between gap-4">
                        <Label className="text-[11px] whitespace-nowrap text-muted-foreground">
                          {label}
                        </Label>
                        <div className="flex items-center gap-2">
                          <div className="relative group">
                            <input
                              type="color"
                              value={customColors[key as keyof MapColors]}
                              onChange={(e) =>
                                setCustomColors({ ...customColors, [key]: e.target.value })
                              }
                              className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent p-0 overflow-hidden [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none"
                            />
                          </div>
                          <Input
                            value={customColors[key as keyof MapColors]}
                            onChange={(e) =>
                              setCustomColors({ ...customColors, [key]: e.target.value })
                            }
                            className="w-20 h-8 text-[11px] font-mono px-2 border-border bg-card text-foreground"
                            placeholder="#000000"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </Card>

            <Card className="p-4 bg-card border-border">
              <div className="flex items-center gap-2">
                <Type className="w-4 h-4 text-primary" />
                <h2 className="text-lg font-serif text-foreground">{m.font_settings()}</h2>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    {m.custom_font()}
                  </Label>
                  {customFont && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearCustomFont}
                      className="h-6 px-2 text-[10px] text-destructive"
                    >
                      Clear
                    </Button>
                  )}
                </div>
                {!customFont ? (
                  <div
                    onClick={() => fontFileInputRef.current?.click()}
                    className="border-2 border-dashed p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-secondary/50 transition-colors border-border"
                  >
                    <FileText className="w-6 h-6 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{m.upload_font()}</span>
                    <span className="text-[10px] text-muted-foreground">{m.font_formats()}</span>
                  </div>
                ) : (
                  <div className="border p-3 flex items-center justify-between border-border bg-card">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileCheck className="w-4 h-4 shrink-0 text-green-600" />
                      <span className="text-sm truncate text-foreground">{fontFileName}</span>
                    </div>
                  </div>
                )}
                <input
                  type="file"
                  ref={fontFileInputRef}
                  onChange={handleFontUpload}
                  accept=".ttf,.otf"
                  className="hidden"
                />
              </div>
            </Card>

            <Card className="p-4 bg-card border-border">
              <h2 className="text-lg mb-3 font-serif text-foreground">{m.poster_size()}</h2>
              <div className="grid grid-cols-2 gap-2">
                {SIZES.map((size) => (
                  <button
                    key={size.id}
                    onClick={() => setSelectedSize(size)}
                    className={cn(
                      "p-3 border-1 transition-all flex items-center gap-2",
                      selectedSize.id === size.id
                        ? "border-primary bg-background/60"
                        : "border-transparent bg-transparent hover:bg-background/50"
                    )}
                  >
                    <span className="text-primary">{size.icon}</span>
                    <span className="text-xs text-foreground">{size.name}</span>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          <div
            className="flex flex-col items-center justify-center p-8 relative overflow-hidden bg-card border-border md:h-full min-h-[400px]"
            style={{
              maxHeight: "100%",
              maxWidth: "100%",
              background: `
                      radial-gradient(ellipse at 30% 20%, ${colors.bg}dd 0%, transparent 50%),
                      radial-gradient(ellipse at 70% 80%, ${colors.text}cc 0%, transparent 40%),
                      linear-gradient(135deg, ${colors.parks} 0%, ${colors.water}f0 50%, ${colors.poi_color}dd 100%)
                    `,
              backdropFilter: "blur(8px)",
            }}
          >
            <div
              className="absolute inset-0 opacity-[0.03] pointer-events-none"
              style={{
                backgroundImage: "radial-gradient(#000 1px, transparent 1px)",
                backgroundSize: "20px 20px",
              }}
            />
            <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full pointer-events-none select-none">
              <span className="text-xs tracking-wide text-white font-light whitespace-nowrap text-shadow-sm">
                {m.preview_actual_result()} :)
              </span>
            </div>
            <div
              ref={previewRef}
              className="flex items-center justify-center relative transition-all duration-300 ease-in-out w-full h-full p-4"
              style={{ containerType: "size" }}
            >
              <div
                className="relative shadow-lg"
                style={{
                  aspectRatio: `${selectedSize.width} / ${selectedSize.height}`,
                  width: `min(${((selectedSize.width / selectedSize.height) * 100).toFixed(4)}cqh, 100cqw)`,
                  height: `min(${((selectedSize.height / selectedSize.width) * 100).toFixed(4)}cqw, 100cqh)`,
                }}
              >
                <MapPosterPreview
                  location={stableMapLocation}
                  city={customTitle || location.city.toUpperCase() || ""}
                  country={location.country || ""}
                  zoom={12}
                  radius={baseRadius}
                  poiDensity="dense"
                  theme={stableTheme}
                  textColor={colors.text}
                  gradientColor={colors.gradient_color}
                  posterSize={selectedSize}
                  customFont={customFont || undefined}
                  className="w-full h-full"
                  roadWidthMultiplier={1}
                />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
