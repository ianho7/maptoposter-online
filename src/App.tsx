import React from "react"
import { RefreshCw } from 'lucide-react'; // Import RefreshCw here

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, MapPin, Palette, Square, Smartphone, Monitor, FileImage, Loader2, ImageIcon } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { VintageMapCanvas } from '@/components/vintage-map-canvas';

// WASM and Utils
import init, { init_panic_hook } from './pkg/wasm';
import { shardRoadsBinary } from './utils';
import { mapDataService } from './services/map-data';

// Types
interface Location {
  country: string;
  state: string;
  city: string;
  lat: number;
  lng: number;
}

interface MapColors {
  bg: string;
  text: string;
  water: string;
  parks: string;
  roads: string;
  buildings: string;
}

interface PosterSize {
  id: string;
  name: string;
  width: number;
  height: number;
  icon: React.ReactNode;
}

// Preset themes
const THEMES = [
  {
    id: 'vintage-sepia',
    name: 'Vintage Sepia',
    colors: { bg: '#f5e6d3', text: '#4a3728', water: '#c9d4c5', parks: '#a8c090', roads: '#8b7355', buildings: '#d4c4b0' }
  },
  {
    id: 'antique-parchment',
    name: 'Antique Parchment',
    colors: { bg: '#f0e4d4', text: '#3d3528', water: '#b8c4b0', parks: '#9ab087', roads: '#7a6850', buildings: '#e0d4c0' }
  },
  {
    id: 'navy-gold',
    name: 'Navy & Gold',
    colors: { bg: '#1a2a3a', text: '#d4a84b', water: '#2a3a4a', parks: '#2a4a3a', roads: '#c4a040', buildings: '#3a4a5a' }
  },
  {
    id: 'forest-expedition',
    name: 'Forest Expedition',
    colors: { bg: '#2d3a2d', text: '#d4c4a0', water: '#3a4a4a', parks: '#4a5a4a', roads: '#b4a480', buildings: '#4a5a4a' }
  },
  {
    id: 'midnight-atlas',
    name: 'Midnight Atlas',
    colors: { bg: '#1a1a2e', text: '#c4b090', water: '#2a2a4e', parks: '#2a3a3e', roads: '#8a7a60', buildings: '#2a2a3e' }
  },
];

// Poster sizes
const SIZES: PosterSize[] = [
  { id: 'a4-portrait', name: 'A4 Portrait', width: 210, height: 297, icon: <FileImage className="w-4 h-4" /> },
  { id: 'a4-landscape', name: 'A4 Landscape', width: 297, height: 210, icon: <FileImage className="w-4 h-4 rotate-90" /> },
  { id: 'square', name: 'Square', width: 300, height: 300, icon: <Square className="w-4 h-4" /> },
  { id: 'phone', name: 'Phone Wallpaper', width: 390, height: 844, icon: <Smartphone className="w-4 h-4" /> },
  { id: 'desktop', name: 'Desktop 16:9', width: 1920, height: 1080, icon: <Monitor className="w-4 h-4" /> },
];

// Example locations
const EXAMPLES: { location: Location; themeId: string }[] = [
  { location: { country: 'France', state: 'Ile-de-France', city: 'Paris', lat: 48.8566, lng: 2.3522 }, themeId: 'vintage-sepia' },
  { location: { country: 'Japan', state: 'Tokyo', city: 'Tokyo', lat: 35.6762, lng: 139.6503 }, themeId: 'midnight-atlas' },
  { location: { country: 'United States', state: 'New York', city: 'New York', lat: 40.7128, lng: -74.0060 }, themeId: 'navy-gold' },
  { location: { country: 'United Kingdom', state: 'England', city: 'London', lat: 51.5074, lng: -0.1278 }, themeId: 'antique-parchment' },
  { location: { country: 'Italy', state: 'Lazio', city: 'Rome', lat: 41.9028, lng: 12.4964 }, themeId: 'forest-expedition' },
];

// Location data
const LOCATIONS: Record<string, Record<string, { city: string; lat: number; lng: number }[]>> = {
  'China': {
    'Beijing': [{ city: 'Beijing', lat: 39.9042, lng: 116.4074 }],
    'Shanghai': [{ city: 'Shanghai', lat: 31.2304, lng: 121.4737 }],
    'Guangdong': [{ city: 'Guangzhou', lat: 23.1291, lng: 113.2644 }, { city: 'Shenzhen', lat: 22.5431, lng: 114.0579 }],
    'Sichuan': [{ city: 'Chengdu', lat: 30.5728, lng: 104.0668 }],
    'Zhejiang': [{ city: 'Hangzhou', lat: 30.2741, lng: 120.1551 }],
    'Jiangsu': [{ city: 'Nanjing', lat: 32.0603, lng: 118.7969 }, { city: 'Suzhou', lat: 31.2990, lng: 120.5853 }],
  },
  'United States': {
    'New York': [{ city: 'New York City', lat: 40.7128, lng: -74.0060 }],
    'California': [{ city: 'Los Angeles', lat: 34.0522, lng: -118.2437 }, { city: 'San Francisco', lat: 37.7749, lng: -122.4194 }],
    'Illinois': [{ city: 'Chicago', lat: 41.8781, lng: -87.6298 }],
    'Texas': [{ city: 'Houston', lat: 29.7604, lng: -95.3698 }, { city: 'Austin', lat: 30.2672, lng: -97.7431 }],
  },
  'Japan': {
    'Tokyo': [{ city: 'Tokyo', lat: 35.6762, lng: 139.6503 }],
    'Osaka': [{ city: 'Osaka', lat: 34.6937, lng: 135.5023 }],
    'Kyoto': [{ city: 'Kyoto', lat: 35.0116, lng: 135.7681 }],
  },
  'France': {
    'Ile-de-France': [{ city: 'Paris', lat: 48.8566, lng: 2.3522 }],
    'Provence': [{ city: 'Marseille', lat: 43.2965, lng: 5.3698 }, { city: 'Nice', lat: 43.7102, lng: 7.2620 }],
  },
  'United Kingdom': {
    'England': [{ city: 'London', lat: 51.5074, lng: -0.1278 }, { city: 'Manchester', lat: 53.4808, lng: -2.2426 }],
    'Scotland': [{ city: 'Edinburgh', lat: 55.9533, lng: -3.1883 }],
  },
  'Italy': {
    'Lazio': [{ city: 'Rome', lat: 41.9028, lng: 12.4964 }],
    'Lombardy': [{ city: 'Milan', lat: 45.4642, lng: 9.1900 }],
    'Veneto': [{ city: 'Venice', lat: 45.4408, lng: 12.3155 }],
  },
  'Germany': {
    'Berlin': [{ city: 'Berlin', lat: 52.5200, lng: 13.4050 }],
    'Bavaria': [{ city: 'Munich', lat: 48.1351, lng: 11.5820 }],
  },
  'Australia': {
    'New South Wales': [{ city: 'Sydney', lat: -33.8688, lng: 151.2093 }],
    'Victoria': [{ city: 'Melbourne', lat: -37.8136, lng: 144.9631 }],
  },
  'Spain': {
    'Madrid': [{ city: 'Madrid', lat: 40.4168, lng: -3.7038 }],
    'Catalonia': [{ city: 'Barcelona', lat: 41.3851, lng: 2.1734 }],
  },
};

// Worker task helper with Transferable support
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

// Utility to yield main thread for UI updates
const yieldMainThread = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

export default function MapPosterGenerator() {
  const [location, setLocation] = useState<Location>(EXAMPLES[0].location);
  const [selectedTheme, setSelectedTheme] = useState(THEMES[0]);
  const [customColors, setCustomColors] = useState<MapColors>(THEMES[0].colors);
  const [useCustomColors, setUseCustomColors] = useState(false);
  const [selectedSize, setSelectedSize] = useState(SIZES[0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStep, setGenerationStep] = useState('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [showGenerated, setShowGenerated] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const previewRef = useRef<HTMLDivElement>(null);

  // Location selection state
  const [selectedCountry, setSelectedCountry] = useState('France');
  const [selectedState, setSelectedState] = useState('Ile-de-France');

  const colors = useCustomColors ? customColors : selectedTheme.colors;

  const handleCountryChange = (country: string) => {
    setSelectedCountry(country);
    setShowGenerated(false); // Switch to live preview when config changes
    const states = Object.keys(LOCATIONS[country] || {});
    if (states.length > 0) {
      setSelectedState(states[0]);
      const cities = LOCATIONS[country][states[0]];
      if (cities && cities.length > 0) {
        setLocation({
          country,
          state: states[0],
          city: cities[0].city,
          lat: cities[0].lat,
          lng: cities[0].lng,
        });
      }
    }
  };

  const handleStateChange = (state: string) => {
    setSelectedState(state);
    setShowGenerated(false); // Switch to live preview when config changes
    const cities = LOCATIONS[selectedCountry]?.[state];
    if (cities && cities.length > 0) {
      setLocation({
        country: selectedCountry,
        state,
        city: cities[0].city,
        lat: cities[0].lat,
        lng: cities[0].lng,
      });
    }
  };

  const handleCityChange = (cityName: string) => {
    setShowGenerated(false); // Switch to live preview when config changes
    const cities = LOCATIONS[selectedCountry]?.[selectedState];
    const city = cities?.find(c => c.city === cityName);
    if (city) {
      setLocation({
        country: selectedCountry,
        state: selectedState,
        city: city.city,
        lat: city.lat,
        lng: city.lng,
      });
    }
  };

  const handleExampleClick = (example: typeof EXAMPLES[0]) => {
    setLocation(example.location);
    setShowGenerated(false); // Switch to live preview when config changes
    const theme = THEMES.find(t => t.id === example.themeId);
    if (theme) {
      setSelectedTheme(theme);
      setCustomColors(theme.colors);
    }
    setUseCustomColors(false);
    setSelectedCountry(example.location.country);
    setSelectedState(example.location.state);
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
    setGenerationStep('初始化引擎与 Worker 线程池...');
    await yieldMainThread();

    // Web Worker initialization (Vite style)
    const numWorkers = navigator.hardwareConcurrency || 4;
    const workers = Array.from({ length: numWorkers }, () =>
      new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    );

    try {
      const radius = 18000;
      // High-res dimensions
      const width = selectedSize.width * 8;
      const height = selectedSize.height * 8;

      setGenerationProgress(10);
      setGenerationStep("正在获取海报地理要素 (缓存/网络)...");
      await yieldMainThread();

      // 使用 MapDataService 全自动处理 L1/L2 缓存与 DataWorker 解析
      const { roads, water, parks, fromCache } = await mapDataService.getMapData(
        location.country,
        location.city,
        location.lat,
        location.lng,
        radius
      );

      setGenerationProgress(60);
      setGenerationStep(fromCache ? "已从本地数据库还原数据..." : "已完成网络抓取并保存本地缓存...");
      await yieldMainThread();

      const roadShards = shardRoadsBinary(roads, numWorkers);
      const waterTyped = water; // 已经是 Float64Array
      const parksTyped = parks;

      setGenerationProgress(65);
      setGenerationStep("正在并行计算投影坐标 (Worker Pool)...");
      await yieldMainThread();

      let processedShardsCount = 0;
      const totalShards = roadShards.length + 2;
      const updateTaskProgress = async () => {
        processedShardsCount++;
        const currentPercent = 65 + (processedShardsCount / totalShards) * 20;
        setGenerationProgress(currentPercent);
        setGenerationStep(`Worker 已处理完成任务: ${processedShardsCount}/${totalShards}`);
        await yieldMainThread();
      };

      const roadProcessingPromises = roadShards.map((shard, i) =>
        runInWorker(workers[i % numWorkers], 'roads', shard, [shard.buffer]).then(async res => { await updateTaskProgress(); return res; })
      );
      const waterPromise = runInWorker(workers[0], 'polygons', waterTyped, [waterTyped.buffer]).then(async res => { await updateTaskProgress(); return res; });
      const parksPromise = runInWorker(workers[1], 'polygons', parksTyped, [parksTyped.buffer]).then(async res => { await updateTaskProgress(); return res; });

      const [processedRoadShards, waterBin, parksBin] = await Promise.all([
        Promise.all(roadProcessingPromises),
        waterPromise,
        parksPromise
      ]);

      setGenerationProgress(85);
      setGenerationStep("正在执行 WASM 图层渲染...");
      await yieldMainThread();

      // Map App colors to WASM theme
      const wasmTheme = {
        "bg": colors.bg,
        "text": colors.text,
        "gradient_color": colors.bg,
        "water": colors.water,
        "parks": colors.parks,
        "road_motorway": colors.roads,
        "road_primary": colors.roads,
        "road_secondary": colors.roads,
        "road_tertiary": colors.roads,
        "road_residential": colors.roads,
        "road_default": colors.roads
      };

      const config = {
        center: { lat: location.lat, lon: location.lng },
        radius: radius,
        theme: wasmTheme,
        width: width,
        height: height,
        display_city: customTitle || location.city,
        display_country: location.country,
        text_position: "bottom"
      };

      // Offload rendering to worker too
      const pngData = await runInWorker(workers[0], 'render', {
        roads_shards: processedRoadShards,
        water_bin: waterBin,
        parks_bin: parksBin,
        config_json: JSON.stringify(config)
      }, [
        ...processedRoadShards.map(s => s.buffer),
        waterBin.buffer,
        parksBin.buffer
      ]);

      setGenerationProgress(95);
      setGenerationStep("正在生成图片并发起下载...");
      await yieldMainThread();

      if (pngData) {
        // Copy data to avoid SharedArrayBuffer issues with Blob
        const buffer = new Uint8Array(pngData.length);
        buffer.set(pngData);
        const blob = new Blob([buffer], { type: 'image/png' });
        const url = URL.createObjectURL(blob);

        setGeneratedImage(url);
        setShowGenerated(true);

        const link = document.createElement('a');
        link.href = url;
        link.download = `${(customTitle || location.city).toLowerCase().replace(/\s+/g, '-')}-map-poster.png`;
        link.click();

        setGenerationProgress(100);
        setGenerationStep('完成！');
      } else {
        throw new Error(`渲染失败: No PNG data received`);
      }

    } catch (error) {
      console.error('Failed to generate poster:', error);
      alert(error instanceof Error ? error.message : "生成海报时发生未知错误");
    } finally {
      setIsGenerating(false);
      workers.forEach(w => w.terminate());
    }
  }, [colors, location, selectedSize, customTitle]);

  const states = LOCATIONS[selectedCountry] ? Object.keys(LOCATIONS[selectedCountry]) : [];
  const cities = LOCATIONS[selectedCountry]?.[selectedState] || [];

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f5e6d3' }}>
      {/* Header */}
      <header className="border-b sticky top-0 z-50" style={{ backgroundColor: 'rgba(245, 230, 211, 0.95)', borderColor: '#c9bda6' }}>
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl tracking-wide" style={{ fontFamily: 'Georgia, serif', color: '#4a3728' }}>CARTOGRAPHIA</h1>
            <p className="text-xs tracking-widest uppercase" style={{ color: '#6b5f4d' }}>Vintage Map Poster Generator</p>
          </div>
          <div className="flex items-center gap-3">
            {generatedImage && (
              <Button
                onClick={() => setShowGenerated(!showGenerated)}
                variant="outline"
                className="gap-2"
                style={{ borderColor: '#c9bda6', color: '#4a3728', backgroundColor: 'transparent' }}
              >
                {showGenerated ? <RefreshCw className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                {showGenerated ? 'View Live Preview' : 'View Generated'}
              </Button>
            )}
            <Button
              onClick={handleDownload}
              disabled={isGenerating}
              className="gap-2"
              style={{ backgroundColor: '#5c4a32', color: '#f5e6d3' }}
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isGenerating ? 'Generating...' : 'Download Poster'}
            </Button>
          </div>
        </div>
      </header>

      {/* Progress Bar */}
      {isGenerating && (
        <div className="fixed top-[73px] left-0 right-0 z-50 border-b" style={{ backgroundColor: '#ebe4d4', borderColor: '#c9bda6' }}>
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Progress
                  value={generationProgress}
                  className="h-2"
                  style={{ backgroundColor: '#ddd4c2' }}
                />
              </div>
              <div className="text-sm min-w-[180px] text-right" style={{ color: '#5c4a32' }}>
                {generationStep}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-[380px_1fr] gap-6">
          {/* Left Panel - Configuration */}
          <div className="space-y-5">
            {/* Quick Examples */}
            <Card className="p-4" style={{ backgroundColor: '#ebe4d4', borderColor: '#c9bda6' }}>
              <h2 className="text-lg mb-3" style={{ fontFamily: 'Georgia, serif', color: '#4a3728' }}>Quick Examples</h2>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((example, index) => {
                  const theme = THEMES.find(t => t.id === example.themeId);
                  return (
                    <button
                      key={index}
                      onClick={() => handleExampleClick(example)}
                      className="px-3 py-1.5 rounded-full border transition-all flex items-center gap-2 text-xs hover:opacity-80"
                      style={{
                        borderColor: location.city === example.location.city ? '#5c4a32' : '#c9bda6',
                        backgroundColor: location.city === example.location.city ? '#f5e6d3' : 'transparent',
                        color: '#4a3728'
                      }}
                    >
                      <div
                        className="w-3 h-3 rounded-full border"
                        style={{ backgroundColor: theme?.colors.bg, borderColor: '#c9bda6' }}
                      />
                      {example.location.city}
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* Location Selection */}
            <Card className="p-4" style={{ backgroundColor: '#ebe4d4', borderColor: '#c9bda6' }}>
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-4 h-4" style={{ color: '#5c4a32' }} />
                <h2 className="text-lg" style={{ fontFamily: 'Georgia, serif', color: '#4a3728' }}>Location</h2>
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-xs uppercase tracking-wider" style={{ color: '#6b5f4d' }}>Country</Label>
                  <Select value={selectedCountry} onValueChange={handleCountryChange}>
                    <SelectTrigger className="mt-1" style={{ backgroundColor: '#f5e6d3', borderColor: '#c9bda6', color: '#4a3728' }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent style={{ backgroundColor: '#f5e6d3', borderColor: '#c9bda6' }}>
                      {Object.keys(LOCATIONS).map(country => (
                        <SelectItem key={country} value={country} style={{ color: '#4a3728' }}>{country}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-wider" style={{ color: '#6b5f4d' }}>State / Province</Label>
                  <Select value={selectedState} onValueChange={handleStateChange}>
                    <SelectTrigger className="mt-1" style={{ backgroundColor: '#f5e6d3', borderColor: '#c9bda6', color: '#4a3728' }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent style={{ backgroundColor: '#f5e6d3', borderColor: '#c9bda6' }}>
                      {states.map(state => (
                        <SelectItem key={state} value={state} style={{ color: '#4a3728' }}>{state}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-wider" style={{ color: '#6b5f4d' }}>City</Label>
                  <Select value={location.city} onValueChange={handleCityChange}>
                    <SelectTrigger className="mt-1" style={{ backgroundColor: '#f5e6d3', borderColor: '#c9bda6', color: '#4a3728' }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent style={{ backgroundColor: '#f5e6d3', borderColor: '#c9bda6' }}>
                      {cities.map(city => (
                        <SelectItem key={city.city} value={city.city} style={{ color: '#4a3728' }}>{city.city}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-wider" style={{ color: '#6b5f4d' }}>Custom Title (Optional)</Label>
                  <Input
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder={location.city}
                    className="mt-1"
                    style={{ backgroundColor: '#f5e6d3', borderColor: '#c9bda6', color: '#4a3728' }}
                  />
                </div>
              </div>
            </Card>

            {/* Theme & Colors */}
            <Card className="p-4" style={{ backgroundColor: '#ebe4d4', borderColor: '#c9bda6' }}>
              <div className="flex items-center gap-2 mb-4">
                <Palette className="w-4 h-4" style={{ color: '#5c4a32' }} />
                <h2 className="text-lg" style={{ fontFamily: 'Georgia, serif', color: '#4a3728' }}>Theme & Colors</h2>
              </div>

              <Tabs defaultValue="presets" className="w-full">
                <TabsList className="w-full" style={{ backgroundColor: '#ddd4c2' }}>
                  <TabsTrigger value="presets" className="flex-1 data-[state=active]:bg-[#f5e6d3]" style={{ color: '#4a3728' }}>Presets</TabsTrigger>
                  <TabsTrigger value="custom" className="flex-1 data-[state=active]:bg-[#f5e6d3]" style={{ color: '#4a3728' }}>Custom</TabsTrigger>
                </TabsList>

                <TabsContent value="presets" className="mt-3">
                  <div className="grid grid-cols-1 gap-2">
                    {THEMES.map(theme => (
                      <button
                        key={theme.id}
                        onClick={() => {
                          setSelectedTheme(theme);
                          setCustomColors(theme.colors);
                          setUseCustomColors(false);
                        }}
                        className="p-3 rounded-lg border-2 transition-all flex items-center gap-3"
                        style={{
                          borderColor: selectedTheme.id === theme.id && !useCustomColors ? '#5c4a32' : 'transparent',
                          backgroundColor: selectedTheme.id === theme.id && !useCustomColors ? '#f5e6d3' : 'transparent'
                        }}
                      >
                        <div className="flex gap-1">
                          {Object.values(theme.colors).slice(0, 4).map((color, i) => (
                            <div
                              key={i}
                              className="w-4 h-4 rounded-full border"
                              style={{ backgroundColor: color, borderColor: '#c9bda6' }}
                            />
                          ))}
                        </div>
                        <span className="text-sm" style={{ color: '#4a3728' }}>{theme.name}</span>
                      </button>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="custom" className="mt-3">
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(customColors).map(([key, value]) => (
                      <div key={key}>
                        <Label className="text-[10px] uppercase tracking-wider capitalize" style={{ color: '#6b5f4d' }}>
                          {key}
                        </Label>
                        <div className="flex gap-2 mt-1">
                          <input
                            type="color"
                            value={value}
                            onChange={(e) => {
                              setCustomColors(prev => ({ ...prev, [key]: e.target.value }));
                              setUseCustomColors(true);
                            }}
                            className="w-8 h-8 rounded border cursor-pointer"
                            style={{ borderColor: '#c9bda6' }}
                          />
                          <Input
                            value={value}
                            onChange={(e) => {
                              setCustomColors(prev => ({ ...prev, [key]: e.target.value }));
                              setUseCustomColors(true);
                            }}
                            className="flex-1 h-8 text-xs font-mono"
                            style={{ backgroundColor: '#f5e6d3', borderColor: '#c9bda6', color: '#4a3728' }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </Card>

            {/* Poster Size */}
            <Card className="p-4" style={{ backgroundColor: '#ebe4d4', borderColor: '#c9bda6' }}>
              <h2 className="text-lg mb-3" style={{ fontFamily: 'Georgia, serif', color: '#4a3728' }}>Poster Size</h2>
              <div className="grid grid-cols-2 gap-2">
                {SIZES.map(size => (
                  <button
                    key={size.id}
                    onClick={() => setSelectedSize(size)}
                    className="p-3 rounded-lg border-2 transition-all flex items-center gap-2"
                    style={{
                      borderColor: selectedSize.id === size.id ? '#5c4a32' : 'transparent',
                      backgroundColor: selectedSize.id === size.id ? '#f5e6d3' : 'transparent'
                    }}
                  >
                    <span style={{ color: '#5c4a32' }}>{size.icon}</span>
                    <span className="text-xs" style={{ color: '#4a3728' }}>{size.name}</span>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          {/* Right Panel - Preview */}
          <div className="flex flex-col items-center lg:sticky lg:top-24">
            {/* Preview Mode Indicator */}
            {generatedImage && (
              <div
                className="mb-3 px-4 py-2 rounded-full text-xs tracking-wider uppercase flex items-center gap-2"
                style={{ backgroundColor: '#ebe4d4', color: '#5c4a32', border: '1px solid #c9bda6' }}
              >
                {showGenerated ? (
                  <>
                    <ImageIcon className="w-3 h-3" />
                    Viewing Generated Poster
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3 h-3" />
                    Live Preview Mode
                  </>
                )}
              </div>
            )}

            <div
              ref={previewRef}
              className="shadow-2xl overflow-hidden relative"
              style={{
                aspectRatio: `${selectedSize.width} / ${selectedSize.height}`,
                maxHeight: 'calc(100vh - 180px)',
                width: selectedSize.width > selectedSize.height ? '100%' : 'auto',
                height: selectedSize.width <= selectedSize.height ? 'calc(100vh - 180px)' : 'auto',
                maxWidth: '100%',
              }}
            >
              {/* Show generated image or live preview */}
              {showGenerated && generatedImage ? (
                <img
                  src={generatedImage || "/placeholder.svg"}
                  alt="Generated poster"
                  className="w-full h-full object-contain"
                />
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
      </div>
    </div>
  );
}
