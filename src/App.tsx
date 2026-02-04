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
import { cn } from '@/lib/utils';

// WASM and Utils
import init, { init_panic_hook } from './pkg/wasm';
import { shardRoadsBinary, getCoordinates } from './utils';
import { type MapColors, MAP_THEMES as THEMES } from '@/lib/types';
import { mapDataService } from './services/map-data';
import { getVibrant } from "./lib/vibrant";

// Types
interface Location {
  country: string;
  state: string;
  city: string;
  lat?: number;  // 可选，预览时使用默认值，生成时从 getCoordinates 获取
  lng?: number;  // 可选，预览时使用默认值，生成时从 getCoordinates 获取
}



interface PosterSize {
  id: string;
  name: string;
  width: number;
  height: number;
  icon: React.ReactNode;
}



// Poster sizes
const SIZES: PosterSize[] = [
  // A4 竖版：210x297mm 在 300 DPI 下的像素
  { id: 'a4-portrait', name: 'A4 Portrait', width: 2480, height: 3508, icon: <FileImage className="w-4 h-4" /> },
  
  // A4 横版
  { id: 'a4-landscape', name: 'A4 Landscape', width: 3508, height: 2480, icon: <FileImage className="w-4 h-4 rotate-90" /> },
  
  // 正方形：升级为高清 2K 规格
  { id: 'square', name: 'Square', width: 2048, height: 2048, icon: <Square className="w-4 h-4" /> },
  
  // 手机壁纸：适配主流 iPhone/安卓 的 Retina 分辨率 (约 3:6.5)
  { id: 'phone', name: 'Phone Wallpaper', width: 1170, height: 2532, icon: <Smartphone className="w-4 h-4" /> },
  
  // 桌面：升级为标准 4K 比例 (16:9)
  { id: 'desktop', name: 'Desktop 16:9', width: 3840, height: 2160, icon: <Monitor className="w-4 h-4" /> },
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

// 统一的前端分辨率倍数配置
const FRONTEND_SCALE = 1;

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

  // Palette extraction state
  const [extractedColors, setExtractedColors] = useState<string[]>([]);
  const [isExtractingColors, setIsExtractingColors] = useState(false);
  const [uploadedImagePreview, setUploadedImagePreview] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        // 不设置 lat/lng，生成时从 getCoordinates 获取更准确的数据
        setLocation({
          country,
          state: states[0],
          city: cities[0].city,
        });
      }
    }
  };

  const handleStateChange = (state: string) => {
    setSelectedState(state);
    setShowGenerated(false); // Switch to live preview when config changes
    const cities = LOCATIONS[selectedCountry]?.[state];
    if (cities && cities.length > 0) {
      // 不设置 lat/lng，生成时从 getCoordinates 获取更准确的数据
      setLocation({
        country: selectedCountry,
        state,
        city: cities[0].city,
      });
    }
  };

  const handleCityChange = (cityName: string) => {
    setShowGenerated(false); // Switch to live preview when config changes
    const cities = LOCATIONS[selectedCountry]?.[selectedState];
    const city = cities?.find(c => c.city === cityName);
    if (city) {
      // 不设置 lat/lng，生成时从 getCoordinates 获取更准确的数据
      setLocation({
        country: selectedCountry,
        state: selectedState,
        city: city.city,
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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview immediately
    const objectUrl = URL.createObjectURL(file);
    setUploadedImagePreview(objectUrl);

    setIsExtractingColors(true);
    setExtractedColors([]);

    try {
      const src = URL.createObjectURL(file);
      const colors = await getVibrant(src);

      if (colors) {
        // 设置上传图片的主题颜色
        setExtractedColors(Object.values(colors).map((item) => item.hex));

        // 替换自定义色
        // setCustomColors({
        //   bg: colors.lightMuted.hex,
        //   text: colors.darkVibrant.hex,
        //   gradient_color: colors.vibrant.hex,
        //   water: colors.lightVibrant.hex,
        //   parks: colors.muted.hex,
        //   road_motorway: colors.vibrant.hex,
        //   road_primary: colors.vibrant.hex,
        //   road_secondary: colors.darkVibrant.hex,
        //   road_tertiary: colors.muted.hex,
        //   road_residential: colors.lightMuted.hex,
        //   road_default: colors.lightMuted.hex,
        //   buildings: colors.lightMuted.hex
        // })
      }
    } catch (error) {
      console.error("Failed to extract colors:", error);
    } finally {
      setIsExtractingColors(false);
    }
  };

  const clearUploadedImage = () => {
    if (uploadedImagePreview) {
      URL.revokeObjectURL(uploadedImagePreview);
    }
    setUploadedImagePreview(null);
    setExtractedColors([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleColorClick = (hex: string) => {
    navigator.clipboard.writeText(hex);
    setCopyFeedback(hex);
    setTimeout(() => setCopyFeedback(null), 1500);
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
      // 从 getCoordinates 获取准确的坐标数据
      setGenerationProgress(5);
      setGenerationStep('正在获取精确坐标...');
      await yieldMainThread();

      let lat = 0;
      let lng = 0;

      // 查看缓存
      const cachedCoordinates = mapDataService.getCoordinates(location.city, location.country);
      if (cachedCoordinates) {
        console.log(`✓ 使用缓存坐标: ${cachedCoordinates.latitude}, ${cachedCoordinates.longitude}`);
        lat = cachedCoordinates.latitude;
        lng = cachedCoordinates.longitude;
      } else {
        console.log(`✓ 使用精确坐标: ${lat}, ${lng}`);
        const coordinates = await getCoordinates(location.city, location.country);
        lat = coordinates.latitude;
        lng = coordinates.longitude;

        // 保存到坐标缓存
        mapDataService.saveCoordinates(location.city, location.country, lat, lng);
      }

      // 计算所有尺寸中最大的宽高比，以确定需要获取的最大半径
      // 这样可以确保所有尺寸都能填满画布，且共享同一个缓存
      const baseRadius = 15000;
      const maxAspectRatio = Math.max(
        ...SIZES.map(s => Math.max(s.width / s.height, s.height / s.width))
      );
      let fetchRadius = baseRadius * maxAspectRatio;

      if (fetchRadius > 20000) {
        fetchRadius = 20000;
        console.log(`fetchRadius(${baseRadius * maxAspectRatio}) > 20000, set fetchRadius to 20000`);
      }

      // High-res dimensions (using unified FRONTEND_SCALE)
      const width = selectedSize.width * FRONTEND_SCALE;
      const height = selectedSize.height * FRONTEND_SCALE;

      setGenerationProgress(10);
      setGenerationStep("正在获取海报地理要素 (缓存/网络)...");
      await yieldMainThread();

      // 使用 MapDataService 全自动处理 L1/L2 缓存与 DataWorker 解析
      // 使用从 getCoordinates 获取的精确坐标
      const { roads, water, parks, fromCache } = await mapDataService.getMapData(
        location.country,
        location.city,
        lat,
        lng,
        fetchRadius
      );

      setGenerationProgress(60);
      setGenerationStep(fromCache ? "已从本地数据库还原数据..." : "已完成网络抓取并保存本地缓存...");
      await yieldMainThread();

      // 获取 POI 数据
      setGenerationProgress(62);
      setGenerationStep("正在获取兴趣点数据 (POI)...");
      await yieldMainThread();

      const { pois } = await mapDataService.getPOIs(
        location.country,
        location.city,
        lat,
        lng,
        fetchRadius
      );

      setGenerationProgress(64);
      setGenerationStep(`已获取 ${pois[0] || 0} 个兴趣点...`);
      await yieldMainThread();

      const roadShards = shardRoadsBinary(roads, numWorkers);
      const waterTyped = water; // 已经是 Float64Array
      const parksTyped = parks;
      const poisTyped = pois;  // 已经是 Float64Array

      setGenerationProgress(65);
      setGenerationStep("正在并行计算投影坐标 (Worker Pool)...");
      await yieldMainThread();

      let processedShardsCount = 0;
      const totalShards = roadShards.length + 3;  // 包括 POI
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
      const poisPromise = runInWorker(workers[2], 'pois', poisTyped, [poisTyped.buffer]).then(async res => { await updateTaskProgress(); return res; });

      const [processedRoadShards, waterBin, parksBin, poisBin] = await Promise.all([
        Promise.all(roadProcessingPromises),
        waterPromise,
        parksPromise,
        poisPromise
      ]);

      // 调试：打印数据大小
      const waterCount = waterBin[0] || 0;
      const parksCount = parksBin[0] || 0;
      const poiCount = poisBin[0] || 0;
      
      console.log(`✓ 水体数据：共 ${waterCount} 个多边形`);
      console.log(`  水体 Float64Array 长度: ${waterBin.length} 个数字`);
      console.log(`  水体 数据大小: ${(waterBin.byteLength / 1024).toFixed(2)} KB`);
      
      console.log(`✓ 公园数据：共 ${parksCount} 个多边形`);
      console.log(`  公园 Float64Array 长度: ${parksBin.length} 个数字`);
      console.log(`  公园 数据大小: ${(parksBin.byteLength / 1024).toFixed(2)} KB`);
      
      console.log(`✓ POI 数据：共 ${poiCount} 个兴趣点`);
      console.log(`  POI Float64Array 长度: ${poisBin.length} 个数字`);
      console.log(`  POI 数据大小: ${(poisBin.byteLength / 1024).toFixed(2)} KB`);
      console.log(`  前 10 个 POI 坐标:`, poisBin.slice(1, 21));

      setGenerationProgress(85);
      setGenerationStep("正在执行 WASM 图层渲染...");
      await yieldMainThread();

      // Map App colors to WASM theme
      const wasmTheme = {
        "bg": useCustomColors ? customColors.bg : colors.bg,
        "text": useCustomColors ? customColors.text : colors.text,
        "gradient_color": useCustomColors ? customColors.gradient_color : colors.gradient_color,
        "poi_color": useCustomColors ? customColors.poi_color : colors.poi_color,
        "water": useCustomColors ? customColors.water : colors.water,
        "parks": useCustomColors ? customColors.parks : colors.parks,
        "road_motorway": useCustomColors ? customColors.road_motorway : colors.road_motorway,
        "road_primary": useCustomColors ? customColors.road_primary : colors.road_primary,
        "road_secondary": useCustomColors ? customColors.road_secondary : colors.road_secondary,
        "road_tertiary": useCustomColors ? customColors.road_tertiary : colors.road_tertiary,
        "road_residential": useCustomColors ? customColors.road_residential : colors.road_residential,
        "road_default": useCustomColors ? customColors.road_default : colors.road_default,
        "buildings": useCustomColors ? customColors.buildings : colors.buildings
      };

      const config = {
        center: { lat, lon: lng },  // 使用从 getCoordinates 获取的精确坐标
        radius: baseRadius,
        theme: wasmTheme,
        width: width,
        height: height,
        display_city: customTitle || location.city,
        display_country: location.country,
        text_position: "bottom",
        // Dynamic road width scaling parameters (unified with FRONTEND_SCALE)
        selected_size_height: selectedSize.height * FRONTEND_SCALE,
        frontend_scale: FRONTEND_SCALE,
        // POI 数据
        pois: Array.from(poisBin)
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
        parksBin.buffer,
        poisBin.buffer
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 z-50 bg-background/95 border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl tracking-wide font-serif text-foreground">CARTOGRAPHIA</h1>
            <p className="text-xs tracking-widest uppercase text-muted-foreground">Vintage Map Poster Generator</p>
          </div>
          <div className="flex items-center gap-3">
            {generatedImage && (
              <Button
                onClick={() => setShowGenerated(!showGenerated)}
                variant="outline"
                className="gap-2 border-border text-foreground hover:bg-transparent"
              >
                {showGenerated ? <RefreshCw className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                {showGenerated ? 'View Live Preview' : 'View Generated'}
              </Button>
            )}
            <Button
              onClick={handleDownload}
              disabled={isGenerating}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isGenerating ? 'Generating...' : 'Download Poster'}
            </Button>
          </div>
        </div>
      </header>

      {/* Progress Bar */}
      {isGenerating && (
        <div className="fixed top-[73px] left-0 right-0 z-50 border-b bg-[#ebe4d4] border-border">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Progress
                  value={generationProgress}
                  className="h-2 bg-[#ddd4c2]"
                />
              </div>
              <div className="text-sm min-w-[180px] text-right text-primary">
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
            <Card className="p-4 bg-muted border-border">
              <h2 className="text-lg mb-3 font-serif text-foreground">Quick Examples</h2>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((example, index) => {
                  const theme = THEMES.find(t => t.id === example.themeId);
                  return (
                    <button
                      key={index}
                      onClick={() => handleExampleClick(example)}
                      className={cn(
                        "px-3 py-1.5 rounded-full border transition-all flex items-center gap-2 text-xs hover:opacity-80 text-foreground",
                        location.city === example.location.city ? "border-primary bg-background" : "border-border bg-transparent"
                      )}
                    >
                      <div
                        className="w-3 h-3 rounded-full border border-border"
                        style={{ backgroundColor: theme?.colors.bg }}
                      />
                      {example.location.city}
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* Location Selection */}
            <Card className="p-4 bg-muted border-border">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-4 h-4 text-primary" />
                <h2 className="text-lg font-serif text-foreground">Location</h2>
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Country</Label>
                  <Select value={selectedCountry} onValueChange={handleCountryChange}>
                    <SelectTrigger className="mt-1 bg-background border-border text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background border-border">
                      {Object.keys(LOCATIONS).map(country => (
                        <SelectItem key={country} value={country} className="text-foreground">{country}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">State / Province</Label>
                  <Select value={selectedState} onValueChange={handleStateChange}>
                    <SelectTrigger className="mt-1 bg-background border-border text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background border-border">
                      {states.map(state => (
                        <SelectItem key={state} value={state} className="text-foreground">{state}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">City</Label>
                  <Select value={location.city} onValueChange={handleCityChange}>
                    <SelectTrigger className="mt-1 bg-background border-border text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background border-border">
                      {cities.map(city => (
                        <SelectItem key={city.city} value={city.city} className="text-foreground">{city.city}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Custom Title (Optional)</Label>
                  <Input
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder={location.city}
                    className="mt-1 bg-background border-border text-foreground"
                  />
                </div>
              </div>
            </Card>

            {/* Theme & Colors */}
            <Card className="p-4 bg-muted border-border">
              <div className="flex items-center gap-2 mb-4">
                <Palette className="w-4 h-4 text-primary" />
                <h2 className="text-lg font-serif text-foreground">Theme & Colors {useCustomColors ? "Custom" : "Preset"}</h2>
              </div>

              <Tabs defaultValue="presets" className="w-full">
                <TabsList className="w-full bg-secondary">
                  <TabsTrigger value="presets" className="flex-1 data-[state=active]:bg-background text-foreground" onClick={() => {
                    setUseCustomColors(false);
                  }}>Presets</TabsTrigger>
                  <TabsTrigger value="custom" className="flex-1 data-[state=active]:bg-background text-foreground" onClick={() => {
                    setUseCustomColors(true);
                  }}>Custom</TabsTrigger>
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
                        className={cn(
                          "p-3 rounded-lg border-2 transition-all flex items-center gap-3",
                          selectedTheme.id === theme.id && !useCustomColors ? "border-primary bg-background" : "border-transparent bg-transparent"
                        )}
                      >
                        <div className="flex gap-1">
                          {Object.values(theme.colors).slice(0, 4).map((color, i) => (
                            <div
                              key={i}
                              className="w-4 h-4 rounded-full border border-border"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                        <span className="text-sm text-foreground">{theme.name}</span>
                      </button>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="custom" className="mt-3">
                  {/* Color Extraction from Image */}
                  <div className="mb-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Extract from Photo</Label>
                      {uploadedImagePreview && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={clearUploadedImage}
                          className="h-6 px-2 text-[10px] text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          Clear
                        </Button>
                      )}
                    </div>

                    {!uploadedImagePreview ? (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-border rounded-lg p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-secondary/50 transition-colors"
                      >
                        <ImageIcon className="w-6 h-6 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Click to upload photo</span>
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleImageUpload}
                          accept="image/*"
                          className="hidden"
                        />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <div className="relative w-16 h-16 rounded-md overflow-hidden border border-border group">
                            <img
                              src={uploadedImagePreview}
                              alt="Uploaded"
                              className="w-full h-full object-cover"
                            />
                            <button
                              onClick={() => fileInputRef.current?.click()}
                              className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                            >
                              <RefreshCw className="w-4 h-4 text-white" />
                            </button>
                            <input
                              type="file"
                              ref={fileInputRef}
                              onChange={handleImageUpload}
                              accept="image/*"
                              className="hidden"
                            />
                          </div>
                          <div className="flex-1">
                            {isExtractingColors ? (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Extracting palette...
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {extractedColors.map((color, i) => (
                                  <button
                                    key={i}
                                    onClick={() => handleColorClick(color)}
                                    className="w-16 aspect-square rounded-sm border border-border transition-transform hover:scale-110 active:scale-95 relative"
                                    style={{ backgroundColor: color }}
                                    title={color}
                                  >
                                    {copyFeedback === color && (
                                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] py-0.5 px-1.5 rounded shadow-sm whitespace-nowrap z-10">
                                        Copied!
                                      </div>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                            {!isExtractingColors && extractedColors.length > 0 && (
                              <p className="text-[10px] text-muted-foreground mt-2 italic">
                                Click a color to copy hex code
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="border-t border-border/50 pt-3" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(customColors).map(([key, value]) => (
                      <div key={key}>
                        <Label className="text-[10px] uppercase tracking-wider capitalize text-muted-foreground">
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
                            className="w-8 h-8 rounded border border-border cursor-pointer appearance-none bg-transparent"
                          />
                          <Input
                            value={value}
                            onChange={(e) => {
                              setCustomColors(prev => ({ ...prev, [key]: e.target.value }));
                              setUseCustomColors(true);
                            }}
                            className="flex-1 h-8 text-xs font-mono bg-background border-border text-foreground"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </Card>

            {/* Poster Size */}
            <Card className="p-4 bg-muted border-border">
              <h2 className="text-lg mb-3 font-serif text-foreground">Poster Size</h2>
              <div className="grid grid-cols-2 gap-2">
                {SIZES.map(size => (
                  <button
                    key={size.id}
                    onClick={() => setSelectedSize(size)}
                    className={cn(
                      "p-3 rounded-lg border-2 transition-all flex items-center gap-2",
                      selectedSize.id === size.id ? "border-primary bg-background" : "border-transparent bg-transparent"
                    )}
                  >
                    <span className="text-primary">{size.icon}</span>
                    <span className="text-xs text-foreground">{size.name}</span>
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
                className="mb-3 px-4 py-2 rounded-full text-xs tracking-wider uppercase flex items-center gap-2 bg-muted text-primary border border-border"
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
