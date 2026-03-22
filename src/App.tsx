import { useState, useRef, useEffect, useDeferredValue, useMemo } from "react";
import { type PosterSize } from "@/components/artistic-map";
import { Square, Smartphone, Monitor, FileImage } from "lucide-react";
import { useLocationData } from "@/hooks/useLocationData";
import { getUserGeolocation } from "@/services/ip-geolocation";

// WASM and Utils
import init, { init_panic_hook } from "./pkg/wasm";
import { shardRoadsBinary } from "./utils";
import { type MapColors, MAP_THEMES as THEMES, type Location } from "@/lib/types";
import { mapDataService } from "./services/map-data";
import { type State, type City } from "@/services/location-types";
// Paraglide i18n
import * as m from "@/paraglide/messages";
import { getLocale, setLocale, locales } from "@/paraglide/runtime";
import { useDynamicFont } from "./hooks/useDynamicFont";
import { PosterGallery } from "./components/gallery";
import Footer from "./components/footer";
import { SEOHead } from "./hooks/useSEO";
import { AppHeader } from "./components/app-header";
import { LocationSettings } from "./components/location-settings";
import { DataSettings } from "./components/data-settings";
import { ThemeColors } from "./components/theme-colors";
import { FontSettings } from "./components/font-settings";
import { PosterSizeSelector } from "./components/poster-size-selector";
import { MapPreview } from "./components/map-preview";
import { GenerationModal } from "./components/generation-modal";

type AvailableLanguageTag = (typeof locales)[number];

// Extended PosterSize includes icon for size selector UI
interface LocalPosterSize extends PosterSize {
  icon: React.ReactNode;
}

// Worker task types
type WorkerTaskType = "roads" | "polygons" | "pois" | "render";

interface RenderOptions {
  roads_shards: Float64Array[];
  water_bin: Float64Array;
  parks_bin: Float64Array;
  config_json: string;
  custom_font?: Uint8Array;
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
  transfers: Transferable[] = []
): Promise<Float64Array | Uint8Array> {
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
  const [isGameOpen, setIsGameOpen] = useState(false);
  const isGameOpenRef = useRef(false); // track isGameOpen without waiting for React re-render
  const generationCompleteRef = useRef(false);
  const [customTitle, setCustomTitle] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);

  // Localized Sizes
  const SIZES: LocalPosterSize[] = [
    {
      id: "iphone",
      name: m.size_iphone(),
      width: 1500,
      height: 3200,
      icon: <Smartphone className="w-4 h-4" />,
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
  const [states, setStates] = useState<State[]>([]);
  const [cities, setCities] = useState<City[]>([]);
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
    let lang: AvailableLanguageTag;

    // Priority 1: URL path (e.g., /fr/ or /zh/)
    const pathLang = window.location.pathname.replace(/^\//, "").split("/")[0];
    if (pathLang && locales.includes(pathLang as AvailableLanguageTag)) {
      lang = pathLang as AvailableLanguageTag;
    }
    // Priority 2: localStorage
    else {
      const savedLang = localStorage.getItem("lang") as AvailableLanguageTag;
      if (savedLang && locales.includes(savedLang)) {
        lang = savedLang;
      }
      // Priority 3: Browser language
      else {
        const browserLang = navigator.language;
        const matchedLang = locales.find((tag) => browserLang.startsWith(tag));
        lang = (matchedLang || "en") as AvailableLanguageTag;
      }
    }

    setLocale(lang, { reload: false });
    setActiveLang(lang);
    localStorage.setItem("lang", lang);
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
                      : parseFloat(city.latitude as string) ||
                        parseFloat(String(geo.latitude)) ||
                        0;
                  let lng =
                    typeof city.longitude === "number"
                      ? city.longitude
                      : parseFloat(city.longitude as string) ||
                        parseFloat(String(geo.longitude)) ||
                        0;

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

  const stableTheme = useMemo(
    () => ({
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
    }),
    [colors]
  );

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

  // const handlePasteFromClipboard = async () => {
  //   try {
  //     const text = await navigator.clipboard.readText();
  //     const json = JSON.parse(text);

  //     // Validate required fields
  //     const requiredFields = [
  //       "background",
  //       "text",
  //       "mask_gradient",
  //       "water",
  //       "park_greenery",
  //       "poi",
  //       "roads",
  //     ];
  //     const hasAllFields = requiredFields.every((field) => field in json);
  //     const hasRoadsFields =
  //       json.roads &&
  //       "highway" in json.roads &&
  //       "primary" in json.roads &&
  //       "secondary" in json.roads &&
  //       "tertiary" in json.roads &&
  //       "residential" in json.roads &&
  //       "other" in json.roads;

  //     if (!hasAllFields || !hasRoadsFields) {
  //       alert(m.paste_json_invalid_format());
  //       return;
  //     }

  //     // Map JSON fields to customColors
  //     setCustomColors({
  //       bg: json.background,
  //       text: json.text,
  //       gradient_color: json.mask_gradient,
  //       water: json.water,
  //       parks: json.park_greenery,
  //       poi_color: json.poi,
  //       road_motorway: json.roads.highway,
  //       road_primary: json.roads.primary,
  //       road_secondary: json.roads.secondary,
  //       road_tertiary: json.roads.tertiary,
  //       road_residential: json.roads.residential,
  //       road_default: json.roads.other,
  //     });
  //     setUseCustomColors(true);
  //   } catch (error) {
  //     console.error("Failed to paste from clipboard:", error);
  //     alert(m.paste_json_invalid_format());
  //   }
  // };

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
      // 处理带等待秒数的步骤 (格式: "step_waiting_api:30" 或 "step_retrying_error:55")
      if (step.startsWith("step_waiting_api:")) {
        const seconds = step.split(":")[1];
        setGenerationStep(m.step_waiting_api({ seconds }));
      } else if (step.startsWith("step_retrying_error:")) {
        const seconds = step.split(":")[1];
        console.log(
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
        baseRadius,
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
        console.log(
          "[App] generationCompleteRef set to true, isGameOpen:",
          isGameOpen,
          new Date().toISOString()
        );
        generationCompleteRef.current = true;
        await yieldMainThread();

        const blob = new Blob([pngData as BlobPart], { type: "image/png" });
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
      console.log(
        "[App] finally block, isGameOpenRef:",
        isGameOpenRef.current,
        "isGameOpen(state):",
        isGameOpen,
        "generationCompleteRef:",
        generationCompleteRef.current,
        new Date().toISOString()
      );
      mapDataService.setProgressCallback(null);
      if (!isGameOpenRef.current) {
        console.log("[App] finally: closing loading because game is not open");
        setIsGenerating(false);
      } else {
        console.log("[App] finally: game is open, NOT closing loading");
      }
      workers.forEach((w) => w.terminate());
    }
  };

  useDynamicFont(activeLang);

  return (
    <>
      <SEOHead />
      <div className="flex flex-col bg-background md:h-screen md:overflow-hidden">
        <AppHeader
          activeLang={activeLang}
          onLangChange={handleLanguageChange}
          onDownload={handleDownload}
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

        <main className="flex-1 overflow-auto custom-scrollbar w-full mx-auto px-4 py-6">
          <div className="grid md:grid-cols-[380px_1fr] px-0 md:px-20 gap-8 md:h-full">
            <div className="space-y-5 md:overflow-y-auto custom-scrollbar md:min-h-0">
              <LocationSettings
                location={location}
                countries={countries}
                states={states}
                cities={cities}
                selectedCountry={selectedCountry}
                selectedState={selectedState}
                selectedCity={selectedCity}
                customTitle={customTitle}
                isStatesLoading={isStatesLoading}
                isCitiesLoading={isCitiesLoading}
                locationLoading={locationLoading}
                onCountryChange={handleCountryChange}
                onStateChange={handleStateChange}
                onCityChange={handleCityChange}
                onCustomTitleChange={setCustomTitle}
              />

              <DataSettings baseRadius={baseRadius} onBaseRadiusChange={setBaseRadius} />

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

              <FontSettings
                customFont={customFont}
                fontFileName={fontFileName}
                fontFileInputRef={fontFileInputRef}
                onFontUpload={handleFontUpload}
                onClearFont={clearCustomFont}
              />

              <PosterSizeSelector
                sizes={SIZES}
                selectedSize={selectedSize}
                onSizeChange={setSelectedSize}
              />
            </div>

            <MapPreview
              location={location}
              selectedSize={selectedSize}
              stableTheme={stableTheme}
              colors={colors}
              customFont={customFont}
              baseRadius={baseRadius}
              customTitle={customTitle}
              previewRef={previewRef}
            />
          </div>
          <PosterGallery />
          <Footer />
        </main>
      </div>
    </>
  );
}
