# Overpass Client 使用说明

本库是 OSMnx 在纯前端 (React + TypeScript + Bun) 环境下的核心机制复刻版。它内置了**自动限流避让**、**429/504 错误自动重试**、**大区域自动分块（自动切割多边形）**以及 **Remark 错误拦截**，专门用于解决浏览器端请求 Overpass API 时频繁失败的问题。

---

## 快速开始

```typescript
import * as turf from '@turf/turf';
### 完整实战：获取天安门方圆 15KM 数据以绘制地图海报

在制作类似地图海报或复杂渲染项目时，我们通常需要不同等级的道路数据（以便渲染不同粗细）、绿地、水体以及用于标注的兴趣点。以下是实现该需求的完整代码范例：

```typescript
import * as turf from '@turf/turf';
import { 
  downloadRoads, 
  downloadParks, 
  downloadWater, 
  downloadPOIs 
} from './overpass-client';

async function fetchMapPosterData() {
  // 1. 定义中心点 (天安门: 经度, 纬度)
  const centerPt = turf.point([116.3974, 39.9092]);
  
  // 2. 生成半径 15KM 的制图区域多边形
  const posterArea = turf.buffer(centerPt, 15, { units: 'kilometers', steps: 64 });
  if (!posterArea) throw new Error("无法生成区域区域");

  console.log("=== 开始下载地图海报基础数据 ===");

  // 3. 下载各级道路 (分层下载以便后期分层渲染)
  // 主干道 (drive) - 用于粗线绘制
  console.log("正在下载主干道...");
  const mainRoads = await downloadRoads(posterArea, "drive");
  
  // 步行道/小路 (walk) - 用于细线/浅色绘制
  console.log("正在下载步行道与小路...");
  const walkRoads = await downloadRoads(posterArea, "walk");

  // 4. 下载公园/绿地数据 (用于面状填充)
  console.log("正在下载绿地公园...");
  const parks = await downloadParks(posterArea);
  
  // 5. 下载水体网络 (用于蓝色面状/线状绘制)
  console.log("正在下载水系...");
  const water = await downloadWater(posterArea);
  
  // 6. 下载兴趣点 (用于添加文字地标)
  console.log("正在下载重点地标...");
  const landmarks = await downloadPOIs(posterArea, ["museum", "attraction", "park", "university"]);
  
  console.log("=== 所有海报数据下载完成 ===");
  
  // 7. 处理并合并分块数据供渲染引擎使用
  // (由于15km区域较大，可能被引擎自动切片，这里需展平为单一数组)
  const posterData = {
    mainRoads: mainRoads.flatMap(res => res.elements || []),
    walkRoads: walkRoads.flatMap(res => res.elements || []),
    parks: parks.flatMap(res => res.elements || []),
    water: water.flatMap(res => res.elements || []),
    labels: landmarks.flatMap(res => res.elements || []),
  };

  console.log(`获取汇总: 主干道 ${posterData.mainRoads.length} 段,
    小路 ${posterData.walkRoads.length} 段,
    绿地 ${posterData.parks.length} 块,
    水体 ${posterData.water.length} 块,
    地标 ${posterData.labels.length} 个`);
    
  return posterData;
}

// 执行抓取
fetchMapPosterData().catch(console.error);
```

---

## 核心 API 详解

### 1. 预置查询 (最常用)

这里封装了日常最常用的地理要素提取，无需你自己手写复杂的 Overpass QL，且全部**自带大面积自动切割功能**（超大区域会自动拆分为多个相互独立的小请求）。

#### `downloadRoads(polygon, networkType)`
- **作用**：下载指定网络类型的道路数据。内部精确移植了 OSMnx 的 6 种道路过滤器。
- **参数**：
  - `polygon`: GeoJSON Polygon 几何对象 (`Feature<Polygon>`)。
  - `networkType`: 道路级别（字符串），只允许以下 6 种：
    - `"drive"`: 仅机动车道（排除人行道、自行车道、停车场小巷等）
    - `"drive_service"`: 机动车道 + 服务道路（如停车场通道）
    - `"walk"`: 仅步行道（包含人行道、广场等）
    - `"bike"`: 仅自行车道
    - `"all_public"`: 所有公共道路
    - `"all"`: 所有道路（包括私人道路等）
- **返回**：`Promise<Record<string, unknown>[]>`
  - 注意：返回的是一个**数组**。因为大区域可能被切割成了 N 块，数组里的每个元素都是一块独立的 Overpass JSON 响应。

#### `downloadParks(polygon)`
- **作用**：下载公园、花园、自然保护区大类。
- **参数**：GeoJSON Polygon。
- **返回**：同上。

#### `downloadWater(polygon)`
- **作用**：下载水系（河流、湖泊、池塘等）。
- **参数**：GeoJSON Polygon。
- **返回**：同上。

#### `downloadPOIs(polygon, amenityTypes?)`
- **作用**：下载兴趣点（POI），查询 `amenity` 标签。
- **参数**：
  - `polygon`: GeoJSON Polygon。
  - `amenityTypes`: （可选）字符串数组。例如 `["restaurant", "cafe", "hospital"]`。如果不传该参数，将下载所有带 `amenity` 标签的点。
- **返回**：同上。

---

### 2. 自定义高级查询

如果预置查询不能满足要求，你可以使用以下接口：

#### `downloadOverpassFeatures(polygon, tags)`
- **作用**：传入任意 `tags` 对区域内要素进行结构化抓取。同样自带**自动切割**机制。
- **参数**：
  - `polygon`: 边界多边形。
  - `tags`: Key-Value 对象。例如 `{ building: true, leisure: ["pitch", "track"] }` 将被解析为查询所有建筑和运动场。
- **返回**：Overpass JSON 数组。

#### `overpassRequest(query)`
- **作用**：最底层的万能请求接口。接受一段长长的自定义 Overpass QL 字符串，执行核心的“查槽位 -> 睡眠限流 -> 发请求 -> 拦截 Remark” 闭环。
- **参数**：
  - `query`: 完整的 Overpass QL 字符串（必须包含 `[out:json]` 等 settings 头）。
- **返回**：`Promise<Record<string, unknown>>`
  - 返回的是**单个** Overpass JSON 对象（这里没有多边形切割概念）。

---

## 3. 返回结果数据结构说明

API 返回的原始数据是标准的 Overpass API JSON 格式。如果你调用的是带有自动分块的 `downloadRoads()` 或 `downloadPOIs()`，你会得到一个响应**数组**：

```json
[
  {
    "version": 0.6,
    "generator": "Overpass API ...",
    "osm3s": { "timestamp_osm_base": "2026-...", "copyright": "..." },
    "elements": [
      {
        "type": "node",
        "id": 1234567,
        "lat": 39.913,
        "lon": 116.391,
        "tags": { "amenity": "cafe", "name": "星巴克" }
      },
      {
        "type": "way",
        "id": 9876543,
        "nodes": [1234567, 1234568, 1234569],
        "tags": { "highway": "primary", "name": "长安街" }
      }
    ]
  },
  { 
    // ... 如果区域过大，这里会有第二块（子块）的响应数据
  }
]
```
**说明**：你通常需要遍历这层数组，提取其中所有的 `elements` 组装起来，然后在前端进一步解析（比如去重合并 id，或者转换为前端地图库如 Leaflet/Mapbox 的 GeoJSON 格式）。

---

## 4. 全局参数配置 (`overpassConfig`)

你可以随时在代码中修改配置改变库的底层行为：

```typescript
import { overpassConfig } from './overpass-client';

// [关键配置1] 切换上游 Overpass 数据源服务器 
// （推荐使用镜像而非官方 de 节点，以避免遭遇负载均衡器强退。已默认为镜像）
overpassConfig.overpassUrl = "https://overpass.kumi.systems/api";

// [关键配置2] 单次请求极限面积控制 (平方米)
// 若多边形总面积大于此值，库会自动将其切成网格状，发起多次请求。默认值：2500平方公里
overpassConfig.maxQueryAreaSize = 2_500_000_000;

// [关键配置3] HTTP Timeout / Overpass QL 内的 [timeout:xx]
// 默认 180,000 毫秒（3分钟）
overpassConfig.requestsTimeout = 180_000;

// [关键配置4] 控制台日志输出级别
// "debug" | "info" | "warn" | "error" | "silent"，默认 "info"
overpassConfig.logLevel = "info"; 
```

## 5. 异常处理机制

只要本库抛出异常，通常意味着必须要阻止业务跑下去（属于灾难级错误）。
你可以捕获库暴露出的自定义 `Error` 做错误埋点：

```typescript
import { OverpassResponseError, OverpassStatusCodeError } from './overpass-client';

try {
  await downloadRoads(poly, "drive");
} catch (err) {
  if (err instanceof OverpassResponseError) {
    // 触发原因：通常是触发了服务器内部的 "remark"（如内存溢出，请求语法有误）
    // 或者达到最大重试次数还是 429。
    console.error("Overpass 层严重异常:", err.message);
  } else if (err instanceof OverpassStatusCodeError) {
    // 触发原因：HTTP 状态码不是 2xx，且不是 429 / 504
    console.error("HTTP 状态异常:", err.statusCode);
  }
}
```
