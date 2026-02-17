import React from "react"
import { RefreshCw } from 'lucide-react';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LocationCombobox } from '@/components/location-combobox';
import { Download, MapPin, Palette, Square, Smartphone, Monitor, FileImage, Loader2, ImageIcon, AlertCircle, Type, FileText, FileCheck, Settings2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { VintageMapCanvas } from '@/components/vintage-map-canvas';
import { cn } from '@/lib/utils';
import { useLocationData } from '@/hooks/useLocationData';

// WASM and Utils
import init, { init_panic_hook } from './pkg/wasm';
import { shardRoadsBinary, getCoordinates } from './utils';
import { type MapColors, MAP_THEMES as THEMES } from '@/lib/types';
import { mapDataService } from './services/map-data';
import { getVibrant } from "./lib/vibrant";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Paraglide i18n
import * as m from '@/paraglide/messages';
import { getLocale, setLocale, locales } from '@/paraglide/runtime';

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
  { location: { country: 'France', state: 'Ile-de-France', city: 'Paris', lat: 48.8566, lng: 2.3522 }, themeId: 'vintage-sepia' },
  { location: { country: 'Japan', state: 'Tokyo', city: 'Tokyo', lat: 35.6762, lng: 139.6503 }, themeId: 'midnight-atlas' },
  { location: { country: 'United States', state: 'New York', city: 'New York', lat: 40.7128, lng: -74.0060 }, themeId: 'navy-gold' },
  { location: { country: 'United Kingdom', state: 'England', city: 'London', lat: 51.5074, lng: -0.1278 }, themeId: 'antique-parchment' },
  { location: { country: 'Italy', state: 'Lazio', city: 'Rome', lat: 41.9028, lng: 12.4964 }, themeId: 'forest-expedition' },
];

// Worker task helper
let taskIdCounter = 0;
function runInWorker(worker: Worker, type: string, data: any, transfers: Transferable[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = taskIdCounter++;
    const handler = (event: MessageEvent) => {
      if (event.data.id === id) {
        worker.removeEventListener('message', handler);
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
    worker.addEventListener('message', handler);
    worker.addEventListener('error', errorHandler, { once: true });
    worker.postMessage({ id, type, data }, transfers);
  });
}

const yieldMainThread = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
const FRONTEND_SCALE = 1;

export default function MapPosterGenerator() {
  const { countries, getStatesByCountry, getCitiesByState, isLoading: locationLoading, error: locationError, refresh: refreshLocations } = useLocationData();

  // i18n language state
  const [activeLang, setActiveLang] = useState<AvailableLanguageTag>(getLocale());

  const [location, setLocation] = useState<Location>(EXAMPLES[0].location);
  const [selectedTheme, setSelectedTheme] = useState(THEMES[0]);
  const [customColors, setCustomColors] = useState<MapColors>(THEMES[0].colors);
  const [useCustomColors, setUseCustomColors] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStep, setGenerationStep] = useState('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [showGenerated, setShowGenerated] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const previewRef = useRef<HTMLDivElement>(null);

  // Localized Sizes
  const SIZES: PosterSize[] = React.useMemo(() => [
    { id: 'a4-portrait', name: m.size_a4_portrait(), width: 2480, height: 3508, icon: <FileImage className="w-4 h-4" /> },
    { id: 'a4-landscape', name: m.size_a4_landscape(), width: 3508, height: 2480, icon: <FileImage className="w-4 h-4 rotate-90" /> },
    { id: 'square', name: m.size_square(), width: 2048, height: 2048, icon: <Square className="w-4 h-4" /> },
    { id: 'phone', name: m.size_phone(), width: 1170, height: 2532, icon: <Smartphone className="w-4 h-4" /> },
    { id: 'desktop', name: m.size_desktop(), width: 3840, height: 2160, icon: <Monitor className="w-4 h-4" /> },
  ], [activeLang]);

  const [selectedSize, setSelectedSize] = useState(SIZES[0]);

  // Map theme IDs to translation functions
  const themeNameMap: Record<string, string> = {
    'Nordic-Frost': m.theme_nordic_frost(),
    'Desert-Rose': m.theme_desert_rose(),
    'Cyberpunk-Neon': m.theme_cyberpunk_neon(),
    'Sulfur-Slate': m.theme_sulfur_slate(),
    'Vintage-Nautical': m.theme_vintage_nautical(),
    'Lavender-Mist': m.theme_lavender_mist(),
    'Carbon-Fiber': m.theme_carbon_fiber(),
    'Mediterranean-Summer': m.theme_mediterranean_summer(),
    'Royal-Velvet': m.theme_royal_velvet(),
    'Forest-Moss': m.theme_forest_moss(),
    'Cotton-Candy': m.theme_cotton_candy(),
    'Brutalist-Concrete': m.theme_brutalist_concrete(),
    'Solarized-Dark': m.theme_solarized_dark(),
    'Matcha-Latte': m.theme_matcha_latte(),
    'Red-Alert': m.theme_red_alert(),
    'Gilded-Noir': m.theme_gilded_noir(),
    'Ocean-Abyss': m.theme_ocean_abyss(),
    'Sakura-Branch': m.theme_sakura_branch(),
    'Terra-Clay': m.theme_terra_clay(),
    'Glitch-Purple': m.theme_glitch_purple()
  };

  // Palette extraction state
  const [extractedColors, setExtractedColors] = useState<string[]>([]);
  const [isExtractingColors, setIsExtractingColors] = useState(false);
  const [uploadedImagePreview, setUploadedImagePreview] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Location selection state
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [states, setStates] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [isStatesLoading, setIsStatesLoading] = useState(false);
  const [isCitiesLoading, setIsCitiesLoading] = useState(false);

  // Font upload state
  const [customFont, setCustomFont] = useState<Uint8Array | null>(null);
  const [fontFileName, setFontFileName] = useState<string>('');
  const fontFileInputRef = useRef<HTMLInputElement>(null);

  // Data settings state
  const [lodMode, setLodMode] = useState<'simplified' | 'detailed'>('simplified');
  const [baseRadius, setBaseRadius] = useState(15000);

  // Initialize language on mount
  useEffect(() => {
    const savedLang = localStorage.getItem('lang') as AvailableLanguageTag;
    if (savedLang && locales.includes(savedLang)) {
      setLocale(savedLang, { reload: false });
      setActiveLang(savedLang);
    } else {
      const browserLang = navigator.language;
      const matchedLang = locales.find(tag => browserLang.startsWith(tag));
      const finalLang = (matchedLang || 'en') as AvailableLanguageTag;
      setLocale(finalLang, { reload: false });
      setActiveLang(finalLang);
      localStorage.setItem('lang', finalLang);
    }
  }, []);

  const handleLanguageChange = (newLang: AvailableLanguageTag) => {
    setLocale(newLang, { reload: false });
    setActiveLang(newLang);
    localStorage.setItem('lang', newLang);
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
      location // Store the lat/lng coordinates too
    };
    localStorage.setItem('maptoposter_config', JSON.stringify(config));
  }, [selectedCountry, selectedState, selectedCity, customTitle, lodMode, baseRadius, selectedSize, location]);

  useEffect(() => {
    const savedConfig = localStorage.getItem('maptoposter_config');
    if (savedConfig && countries.length > 0 && !isRestored.current) {
      try {
        const config = JSON.parse(savedConfig);

        // Restore Size
        const savedSize = SIZES.find(s => s.id === config.selectedSizeId);
        if (savedSize) setSelectedSize(savedSize);

        // Restore LOD & Radius
        if (config.lodMode) setLodMode(config.lodMode);
        if (config.baseRadius) setBaseRadius(config.baseRadius);

        // Restore Location Text/Coords
        if (config.customTitle) setCustomTitle(config.customTitle);
        if (config.location) setLocation(config.location);

        // Crucial: Restore Country/State/City selections and trigger their data loading
        if (config.selectedCountry) {
          const country = countries.find(c => c.name === config.selectedCountry);
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
      // Default initialization if no config exists
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
              setLocation({ country: firstCountry.name, state: firstState.name, city: stateCities[0].name });
            }
          }
          isRestored.current = true;
        } catch (error) {
          console.error('Error initializing location data:', error);
          setIsStatesLoading(false);
          setIsCitiesLoading(false);
          isRestored.current = true;
        }
      })();
    }
  }, [countries]);

  // Remove the old initialization useEffect (lines 182-211) as it's merged above


  const colors = useCustomColors ? customColors : selectedTheme.colors;

  const handleCountryChange = useCallback(async (countryName: string) => {
    setSelectedCountry(countryName);
    setShowGenerated(false);
    setStates([]);
    setCities([]);
    setIsStatesLoading(true);
    setIsCitiesLoading(true);
    try {
      const country = countries.find(c => c.name.toLowerCase() === countryName.toLowerCase());
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
          setLocation({ country: country?.name || countryName, state: firstState.name, city: stateCities[0].name });
        }
      }
    } catch (error) {
      console.error('Error loading states:', error);
      setIsStatesLoading(false);
      setIsCitiesLoading(false);
    }
  }, [countries, getStatesByCountry, getCitiesByState]);

  const handleStateChange = useCallback(async (stateName: string) => {
    setSelectedState(stateName);
    setShowGenerated(false);
    setCities([]);
    setIsCitiesLoading(true);
    try {
      const state = states.find(s => s.name.toLowerCase() === stateName.toLowerCase());
      if (state) {
        const stateCities = await getCitiesByState(state.id);
        setCities(stateCities);
        setIsCitiesLoading(false);
        if (stateCities.length > 0) {
          const firstCity = stateCities[0];
          setSelectedCity(firstCity.name);
          setLocation({ country: selectedCountry, state: state.name, city: firstCity.name });
        }
      }
    } catch (error) {
      console.error('Error loading cities:', error);
      setIsCitiesLoading(false);
    }
  }, [states, selectedCountry, getCitiesByState]);

  const handleCityChange = useCallback((cityName: string) => {
    setSelectedCity(cityName);
    setShowGenerated(false);
    setLocation({ country: selectedCountry, state: selectedState, city: cityName });
  }, [selectedCountry, selectedState]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setUploadedImagePreview(objectUrl);
    setIsExtractingColors(true);
    setExtractedColors([]);
    try {
      const src = URL.createObjectURL(file);
      const colors = await getVibrant(src);
      if (colors) {
        setExtractedColors(Object.values(colors).map((item) => item.hex));
        setCustomColors({
          bg: colors.lightMuted.hex,
          text: colors.darkVibrant.hex,
          gradient_color: colors.vibrant.hex,
          water: colors.lightVibrant.hex,
          parks: colors.muted.hex,
          road_motorway: colors.vibrant.hex,
          road_primary: colors.vibrant.hex,
          road_secondary: colors.darkVibrant.hex,
          road_tertiary: colors.muted.hex,
          road_residential: colors.lightMuted.hex,
          road_default: colors.lightMuted.hex,
          poi_color: colors.lightMuted.hex
        })
      }
    } catch (error) {
      console.error("Failed to extract colors:", error);
    } finally {
      setIsExtractingColors(false);
    }
  };

  const clearUploadedImage = () => {
    if (uploadedImagePreview) URL.revokeObjectURL(uploadedImagePreview);
    setUploadedImagePreview(null);
    setExtractedColors([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleColorClick = (hex: string) => {
    navigator.clipboard.writeText(hex);
    setCopyFeedback(hex);
    setTimeout(() => setCopyFeedback(null), 1500);
  };

  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.ttf') && !fileName.endsWith('.otf')) {
      alert(m.font_upload_error());
      if (fontFileInputRef.current) fontFileInputRef.current.value = '';
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert(m.font_upload_error());
      if (fontFileInputRef.current) fontFileInputRef.current.value = '';
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const fontData = new Uint8Array(arrayBuffer);
      setCustomFont(fontData);
      setFontFileName(file.name);
    } catch (error) {
      console.error('Font upload failed:', error);
      alert(m.font_upload_error());
      setCustomFont(null);
      setFontFileName('');
    }
  };

  const clearCustomFont = () => {
    setCustomFont(null);
    setFontFileName('');
    if (fontFileInputRef.current) {
      fontFileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    init().then(() => {
      init_panic_hook();
    }).catch(err => {
      console.error("Failed to initialize WASM:", err);
    });
  }, []);

  const handleDownload = useCallback(async () => {
    setIsGenerating(true);
    setGenerationProgress(0);
    setGenerationStep(m.step_init());
    await yieldMainThread();
    const numWorkers = navigator.hardwareConcurrency || 4;
    const workers = Array.from({ length: numWorkers }, () =>
      new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    );
    try {
      setGenerationProgress(5);
      setGenerationStep(m.step_coordinates());
      await yieldMainThread();
      let lat = 0, lng = 0;
      const cachedCoordinates = mapDataService.getCoordinates(location.city, location.country);
      if (cachedCoordinates) {
        lat = cachedCoordinates.latitude;
        lng = cachedCoordinates.longitude;
      } else {
        const coordinates = await getCoordinates(location.city, location.country);
        lat = coordinates.latitude;
        lng = coordinates.longitude;
        mapDataService.saveCoordinates(location.city, location.country, lat, lng);
      }
      const width = selectedSize.width * FRONTEND_SCALE;
      const height = selectedSize.height * FRONTEND_SCALE;
      setGenerationProgress(10);
      setGenerationStep(m.step_fetching_data());
      await yieldMainThread();

      // 【优化】：并行发起所有 OSM 请求。
      // 由于 utils.ts 的轮询机制，这 4 个请求会几乎同时命中 4 个不同的镜像站点
      const [mapResults, poiResults] = await Promise.all([
        mapDataService.getMapData(location.country, location.city, lat, lng, baseRadius, lodMode),
        mapDataService.getPOIs(location.country, location.city, lat, lng, baseRadius)
      ]);

      const { roads, water, parks, fromCache, isProtomaps: mapIsProtomaps } = mapResults;
      const { pois: poisRaw, fromCache: poiFromCache, isProtomaps: poiIsProtomaps } = poiResults;

      setGenerationProgress(60);
      setGenerationStep((fromCache && poiFromCache) ? m.step_restore_cache() : m.step_fetch_complete());
      await yieldMainThread();

      const isProtomaps = mapIsProtomaps || poiIsProtomaps;

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
        runInWorker(workers[i % numWorkers], 'roads', shard, [shard.buffer])
      );

      const [processedRoadShards, waterBin, parksBin, poisBin] = await Promise.all([
        Promise.all(roadProcessingPromises),
        runInWorker(workers[0 % numWorkers], 'polygons', waterTyped, [waterTyped.buffer]),
        runInWorker(workers[1 % numWorkers], 'polygons', parksTyped, [parksTyped.buffer]),
        runInWorker(workers[2 % numWorkers], 'pois', poisTyped, [poisTyped.buffer])
      ]);

      // 准备渲染配置
      const config = {
        center: { lat, lon: lng },
        radius: baseRadius,
        theme: colors,
        width,
        height,
        display_city: customTitle || location.city,
        display_country: location.country,
        text_position: "bottom",
        selected_size_height: selectedSize.height * FRONTEND_SCALE,
        frontend_scale: FRONTEND_SCALE,
        road_width_boost: isProtomaps ? 1.8 : 1.0, // 关键：如果是 Protomaps，则将全域线宽补偿 1.8 倍以对齐 Overpass 质感
        pois: Array.from(poisBin)
      };

      setGenerationProgress(90);
      setGenerationStep(m.step_rendering());
      await yieldMainThread();

      // 构建最终渲染载体
      const renderOptions: any = {
        roads_shards: processedRoadShards,
        water_bin: waterBin,
        parks_bin: parksBin,
        config_json: JSON.stringify(config)
      };

      const finalTransfers: Transferable[] = [
        ...processedRoadShards.map(s => s.buffer),
        waterBin.buffer,
        parksBin.buffer,
        poisBin.buffer
      ];

      // 如果有自定义字体，注入
      if (customFont) {
        const fontCopy = new Uint8Array(customFont);
        renderOptions.custom_font = fontCopy;
        finalTransfers.push(fontCopy.buffer);
      }

      // 执行渲染任务
      const pngData = await runInWorker(workers[0 % numWorkers], 'render', renderOptions, finalTransfers);

      if (pngData) {
        const blob = new Blob([pngData], { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        setGeneratedImage(url);
        setShowGenerated(true);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${(customTitle || location.city).toLowerCase().replace(/\s+/g, '-')}-map-poster.png`;
        link.click();
      }
    } catch (error) {
      console.error(m.error_generating(), error);
      alert(m.error_generating() + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsGenerating(false);
      workers.forEach(w => w.terminate());
    }
  }, [colors, location, selectedSize, customTitle, activeLang, customFont, lodMode, baseRadius]);

  const languageNames: Record<AvailableLanguageTag, string> = {
    'en': 'English', 'zh-CN': '简体中文', 'ja': '日本語', 'ko': '한국어', 'fr': 'Français', 'de': 'Deutsch', 'es': 'Español'
  };

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <header className="border-b bg-background/95 border-border shrink-0">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl tracking-wide font-serif text-foreground">{m.app_title()}</h1>
            <p className="text-xs tracking-widest uppercase text-muted-foreground">{m.app_subtitle()}</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={activeLang} onValueChange={(val) => handleLanguageChange(val as AvailableLanguageTag)}>
              <SelectTrigger className="w-[120px] h-9 bg-background border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {locales.map((tag) => <SelectItem key={tag} value={tag}>{languageNames[tag]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={handleDownload} disabled={isGenerating || locationLoading} className="gap-2 bg-primary text-primary-foreground">
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isGenerating ? m.generating() : m.download_button()}
            </Button>
          </div>
        </div>
      </header>

      {isGenerating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <Card className="w-[400px] p-6 shadow-2xl border-primary/20 bg-[#f8f5f0]">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-lg text-primary">{m.creating_art()}</h3>
                <span className="text-sm font-mono text-primary/60">{Math.round(generationProgress)}%</span>
              </div>
              <Progress value={generationProgress} className="h-2 bg-primary/10" />
              <p className="text-sm text-center text-muted-foreground animate-pulse">{generationStep}</p>
            </div>
          </Card>
        </div>
      )}

      <main className="flex-1 overflow-hidden container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-[380px_1fr] gap-8 h-full">
          <div className="space-y-5 overflow-y-auto pr-4 pb-10 custom-scrollbar">
            <Card className="p-4 bg-muted/50 border-border">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-4 h-4 text-primary" />
                <h2 className="text-lg font-serif text-foreground">{m.location()}</h2>
              </div>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">{m.label_country()}</Label>
                  <LocationCombobox options={countries} value={selectedCountry} onValueChange={handleCountryChange} placeholder={m.placeholder_select_country()} emptyText={m.empty_country()} disabled={locationLoading} />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">{m.label_state()}</Label>
                  <LocationCombobox options={states} value={selectedState} onValueChange={handleStateChange} placeholder={m.placeholder_select_state()} emptyText={m.empty_state()} disabled={states.length === 0 && !isStatesLoading} isLoading={isStatesLoading} />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">{m.label_city()}</Label>
                  <LocationCombobox options={cities} value={selectedCity} onValueChange={handleCityChange} placeholder={m.placeholder_select_city()} emptyText={m.empty_city()} disabled={cities.length === 0 && !isCitiesLoading} isLoading={isCitiesLoading} />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">{m.label_custom_title()}</Label>
                  <Input value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder={location.city} />
                </div>
              </div>
            </Card>

            <Card className="p-4 bg-muted/50 border-border">
              <div className="flex items-center gap-2 mb-4">
                <Settings2 className="w-4 h-4 text-primary" />
                <h2 className="text-lg font-serif text-foreground">{m.label_lod_mode()}</h2>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">{m.label_lod_mode()}</Label>
                  <Tabs value={lodMode} onValueChange={(val) => setLodMode(val as 'simplified' | 'detailed')} className="w-full">
                    <TabsList className="w-full bg-secondary/50">
                      <TabsTrigger value="simplified" className="flex-1 text-xs">{m.lod_simplified()}</TabsTrigger>
                      <TabsTrigger value="detailed" className="flex-1 text-xs">{m.lod_detailed()}</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  {lodMode === 'detailed' && (
                    <div className="mt-2 flex items-start gap-2.5 p-3 rounded-md bg-primary/5 border border-primary/10 transition-all duration-300 animate-in fade-in slide-in-from-top-2">
                      <AlertCircle className="w-3.5 h-3.5 text-primary/60 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium text-primary uppercase tracking-widest opacity-70">{m.label_note()}</p>
                        <p className="text-[10px] leading-normal text-muted-foreground italic font-serif">
                          {m.lod_detailed_desc()}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">{m.label_map_radius()}</Label>
                    <span className="text-xs font-mono text-primary">{baseRadius}m</span>
                  </div>
                  <Select value={baseRadius.toString()} onValueChange={(val) => setBaseRadius(parseInt(val))}>
                    <SelectTrigger className="w-full h-9 bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 11 }, (_, i) => 5000 + i * 1000).map(radius => (
                        <SelectItem key={radius} value={radius.toString()}>{radius}m</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground italic px-1">{m.radius_desc()}</p>
                </div>
              </div>
            </Card>

            <Card className="p-4 bg-muted/50 border-border">
              <div className="flex items-center gap-2 mb-4">
                <Palette className="w-4 h-4 text-primary" />
                <h2 className="text-lg font-serif text-foreground">{m.theme_colors()}</h2>
              </div>
              <Tabs defaultValue="presets" className="w-full">
                <TabsList className="w-full bg-secondary/50">
                  <TabsTrigger value="presets" className="flex-1" onClick={() => setUseCustomColors(false)}>{m.tab_presets()}</TabsTrigger>
                  <TabsTrigger value="custom" className="flex-1" onClick={() => setUseCustomColors(true)}>{m.tab_custom()}</TabsTrigger>
                </TabsList>
                <TabsContent value="presets" className="mt-3">
                  <div className="grid grid-cols-2 gap-2">
                    {THEMES.map(theme => (
                      <button key={theme.id} onClick={() => { setSelectedTheme(theme); setCustomColors(theme.colors); setUseCustomColors(false); }} className={cn("p-2 rounded-lg border-2 transition-all flex flex-col items-start gap-2", selectedTheme.id === theme.id && !useCustomColors ? "border-primary bg-background shadow-sm" : "border-transparent bg-transparent hover:bg-background/50")}>
                        <div className="flex -space-x-1.5">
                          {Object.values(theme.colors).slice(0, 4).map((color, i) => <div key={i} className="w-5 h-5 rounded-full border border-background shadow-sm" style={{ backgroundColor: color }} />)}
                        </div>
                        <span className="text-[11px] font-medium text-foreground line-clamp-1">{themeNameMap[theme.id] || theme.name}</span>
                      </button>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="custom" className="mt-3">
                  <div className="mb-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{m.extract_from_photo()}</Label>
                      {uploadedImagePreview && <Button variant="ghost" size="sm" onClick={clearUploadedImage} className="h-6 px-2 text-[10px] text-destructive">{m.clear()}</Button>}
                    </div>
                    {!uploadedImagePreview ? (
                      <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-border rounded-lg p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-secondary/50 transition-colors">
                        <ImageIcon className="w-6 h-6 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{m.click_to_upload()}</span>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <div className="relative w-16 h-16 rounded-md overflow-hidden border border-border">
                            <img src={uploadedImagePreview} alt="Uploaded" className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1">
                            {isExtractingColors ? (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" />{m.extracting_palette()}</div>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {extractedColors.map((color, i) => <button key={i} onClick={() => handleColorClick(color)} className="w-6 h-6 rounded-sm border border-border" style={{ backgroundColor: color }} />)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
                  </div>
                </TabsContent>
              </Tabs>
            </Card>

            <Card className="p-4 bg-muted/50 border-border">
              <div className="flex items-center gap-2 mb-4">
                <Type className="w-4 h-4 text-primary" />
                <h2 className="text-lg font-serif text-foreground">{m.font_settings()}</h2>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">{m.custom_font()}</Label>
                  {customFont && <Button variant="ghost" size="sm" onClick={clearCustomFont} className="h-6 px-2 text-[10px] text-destructive">{m.clear()}</Button>}
                </div>
                {!customFont ? (
                  <div onClick={() => fontFileInputRef.current?.click()} className="border-2 border-dashed border-border rounded-lg p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-secondary/50 transition-colors">
                    <FileText className="w-6 h-6 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{m.upload_font()}</span>
                    <span className="text-[10px] text-muted-foreground">{m.font_formats()}</span>
                  </div>
                ) : (
                  <div className="border border-border rounded-lg p-3 bg-background flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileCheck className="w-4 h-4 text-green-600 shrink-0" />
                      <span className="text-sm text-foreground truncate">{fontFileName}</span>
                    </div>
                  </div>
                )}
                <input type="file" ref={fontFileInputRef} onChange={handleFontUpload} accept=".ttf,.otf" className="hidden" />
              </div>
            </Card>

            <Card className="p-4 bg-muted/50 border-border">
              <h2 className="text-lg mb-3 font-serif text-foreground">{m.poster_size()}</h2>
              <div className="grid grid-cols-2 gap-2">
                {SIZES.map(size => (
                  <button key={size.id} onClick={() => setSelectedSize(size)} className={cn("p-3 rounded-lg border-2 transition-all flex items-center gap-2", selectedSize.id === size.id ? "border-primary bg-background shadow-sm" : "border-transparent bg-transparent hover:bg-background/40")}>
                    <span className="text-primary">{size.icon}</span>
                    <span className="text-xs text-foreground">{size.name}</span>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          <div className="flex flex-col items-center justify-center p-4 bg-secondary/10 rounded-xl border border-border/50 relative overflow-hidden h-full">
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
            <div
              ref={previewRef}
              className="flex items-center justify-center relative transition-all duration-300 ease-in-out w-full h-full max-w-full max-h-full"
            >
              {showGenerated && generatedImage ? (
                <div
                  className="shadow-[0_20px_50px_rgba(0,0,0,0.15)] overflow-hidden"
                  style={{
                    aspectRatio: `${selectedSize.width} / ${selectedSize.height}`,
                    maxWidth: '100%',
                    maxHeight: '100%',
                    width: selectedSize.width > selectedSize.height ? '100%' : 'auto',
                    height: selectedSize.width > selectedSize.height ? 'auto' : '100%'
                  }}
                >
                  <img src={generatedImage || "/placeholder.svg"} alt="Generated poster" className="w-full h-full object-contain" />
                </div>
              ) : (
                <VintageMapCanvas
                  location={location}
                  colors={colors}
                  customTitle={customTitle}
                  aspectRatio={selectedSize.width / selectedSize.height}
                />
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
