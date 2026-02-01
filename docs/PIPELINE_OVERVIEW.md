# MapPoster 流程管道总览

按执行顺序列出每个流程环节的作用、核心代码函数与依赖库。

| # | 流程环节 | 作用 | 核心函数 | 引入依赖 | JS/WASM 替代依赖 |
|---|---------|------|----------|----------|-----|
| 1 | **CLI 参数解析** | 解析命令行输入（城市、国家、主题、尺寸、坐标、字体等）；验证参数与主题可用性 | `argparse.ArgumentParser()` / `parse_args()` / `get_available_themes()` / `list_themes()` | `argparse` | `yargs` (TypeScript-friendly CLI parser) |
| 2 | **坐标缓存检查** | 检查是否已缓存该城市的经纬度，避免重复地理编码请求 | `cache_get(key)` / `_cache_path(key)` | `pickle` / `pathlib.Path` / `os` | `localStorage` (浏览器) / `node-persist` (Node.js) |
| 3 | **地理编码** | 将城市/国家名称转换为经纬度坐标；若 CLI 提供了坐标则跳过此步 | `get_coordinates(city, country)` | `geopy.geocoders.Nominatim` / `time` / `asyncio` | `nominatim-client` (fetch-based) |
| 4 | **坐标缓存存储** | 将新获取的坐标缓存到本地，下次快速命中 | `cache_set(key, value)` | `pickle` / `os` | `localStorage` / `node-persist` |
| 5 | **主题加载** | 从 JSON 文件读取主题配置（背景色、道路色、水/公园色等）；若文件缺失则使用内置默认 | `load_theme(theme_name)` | `json` / `os` | 原生 JSON parsing + `fs.readFileSync` (Node) |
| 6 | **字体加载（可选）** | 若指定 `--font-family` 则从 Google Fonts 下载并缓存；否则使用本地 Roboto 字体 | `load_fonts(font_family)` | `requests` / `re` / `pathlib.Path` / `os` | `webfontloader` + `FontFace API` / `axios` |
| 7 | **图数据抓取** | 从 Overpass API（via OSMnx）拉取指定半径内的所有街道网络；结果缓存为 pickle | `fetch_graph(point, dist)` | `osmnx.graph_from_point()` / `pickle` / `time` | `osmtogeojson` + `Overpass API` (via fetch) |
| 8 | **水体特征抓取** | 从 OSM 拉取水体要素（natural=water、waterway=riverbank）；按 polygon 过滤；缓存为 pickle | `fetch_features(point, dist, ...)` | `osmnx.features_from_point()` / `geopandas` / `pickle` | `osmtogeojson` + `Overpass API` (via fetch) |
| 9 | **公园特征抓取** | 从 OSM 拉取绿地/公园（leisure=park、landuse=grass）；按 polygon 过滤；缓存为 pickle | `fetch_features(point, dist, ...)` | `osmnx.features_from_point()` / `geopandas` / `pickle` | `osmtogeojson` + `Overpass API` (via fetch) |
| 10 | **图投影** | 将图数据从 EPSG:4326（WGS84）投影到度量 CRS（米），便于准确的距离/裁切计算 | `ox.project_graph(g)` | `osmnx.projection.project_graph()` / `networkx.MultiDiGraph` | `proj4` (proj4js) |
| 11 | **要素投影** | 将水体/公园 GeoDataFrame 投影到与图相同的 CRS | `ox.projection.project_gdf(gdf)` / `gdf.to_crs()` | `geopandas` / `shapely.geometry` | `@turf/turf` (GeoJSON reprojection) |
| 12 | **matplotlib 初始化** | 创建图画布、设置尺寸（inch）、DPI、背景色 | `plt.subplots(figsize=(w, h), facecolor=...)` | `matplotlib.pyplot` / `matplotlib.figure` | Canvas API (`HTMLCanvasElement`) / `fabric.js` |
| 13 | **图形坐标系投影** | 进行投影图到图形坐标的映射；保证地理尺寸与纵横比正确 | `ox.project_graph()` 结果 | `osmnx` / `networkx` | `proj4` (proj4js) |
| 14 | **裁切边界计算** | 根据要求的半径（dist）和海报纵横比计算精确的绘图范围，确保中心对齐且充分覆盖 | `get_crop_limits(g_proj, center_lat_lon, fig, dist)` | `osmnx.projection.project_geometry()` / `shapely.geometry.Point` | `@turf/turf` (bounding box & area calculations) |
| 15 | **水体图层绘制** | 在 zorder=0.5 处绘制水体 polygon，填充主题配色 | `water_polys.plot(ax=ax, facecolor=THEME['water'], ...)` | `geopandas` / `matplotlib.axes.Axes` | Canvas / D3.js (polygon fill) |
| 16 | **公园图层绘制** | 在 zorder=0.8 处绘制公园 polygon，填充主题配色 | `parks_polys.plot(ax=ax, facecolor=THEME['parks'], ...)` | `geopandas` / `matplotlib.axes.Axes` | Canvas / D3.js (polygon fill) |
| 17 | **道路分层着色** | 根据 OSM highway 标签（motorway/primary/secondary/residential 等）计算每条边的颜色；分层赋予深浅不同的颜色 | `get_edge_colors_by_type(g_proj)` | `networkx.MultiDiGraph` / `THEME` dict | `graphlib` (dagrejs) + 纯 JS 逻辑 |
| 18 | **道路分层宽度** | 根据 highway 类型计算每条边的线宽；主干道粗、支路细 | `get_edge_widths_by_type(g_proj)` | `networkx.MultiDiGraph` | `graphlib` (dagrejs) + 纯 JS 逻辑 |
| 19 | **道路绘制** | 使用 OSMnx 提供的 API 绘制投影图，应用分层颜色与线宽；zorder=3 | `ox.plot_graph(g_proj, ax=ax, ...)` | `osmnx.plot.plot_graph()` / `matplotlib` | Canvas / D3.js (line drawing) |
| 20 | **纵横比与范围锁定** | 设置坐标轴纵横比为 1:1（equal）；应用裁切边界（xlim/ylim） | `ax.set_aspect("equal")` / `ax.set_xlim()` / `ax.set_ylim()` | `matplotlib.axes.Axes` | Canvas context (scale/transform) |
| 21 | **底部渐变绘制** | 在底部绘制从主题背景色到透明的渐变，创建视觉淡化效果；zorder=10 | `create_gradient_fade(ax, ...)` | `numpy` / `matplotlib.colors.ListedColormap` | Canvas `createLinearGradient()` |
| 22 | **顶部渐变绘制** | 在顶部绘制类似的渐变，平衡视觉 | `create_gradient_fade(ax, ...)` | `numpy` / `matplotlib.colors.ListedColormap` | Canvas `createLinearGradient()` |
| 23 | **字体与排版参数计算** | 根据海报尺寸（width/height）计算缩放因子，动态调整字体大小；根据城市名长度缩放主标题字号 | `scale_factor = min(height, width) / 12.0` | `matplotlib.font_manager.FontProperties` | 纯 JS 数值计算 |
| 24 | **脚本检测与城市名处理** | 检测城市名是否为拉丁文字；若是则转大写并添加字距；否则保持原样（支持 CJK/Arab/Thai） | `is_latin_script(display_city)` | `ord()` 内置函数 | 纯 JS (`String.charCodeAt()`) |
| 25 | **城市名绘制** | 在 y=0.14（相对坐标）绘制主标题（大字体、粗体）；zorder=11 | `ax.text(0.5, 0.14, spaced_city, ...)` | `matplotlib.axes.Axes.text()` | Canvas `fillText()` + `opentype.js` (字体测量) |
| 26 | **国家名绘制** | 在 y=0.10 处绘制国家名（中等字体、亮体）；zorder=11 | `ax.text(0.5, 0.10, display_country.upper(), ...)` | `matplotlib.axes.Axes.text()` | Canvas `fillText()` + `opentype.js` |
| 27 | **坐标显示** | 在 y=0.07 处绘制经纬度坐标（小字体、半透明）；zorder=11 | `ax.text(0.5, 0.07, coords_str, ...)` | `matplotlib.axes.Axes.text()` | Canvas `fillText()` + alpha |
| 28 | **装饰线绘制** | 在城市名与国家名间绘制一条水平线作装饰；y=0.125；zorder=11 | `ax.plot([0.4, 0.6], [0.125, 0.125], ...)` | `matplotlib.axes.Axes.plot()` | Canvas `strokeLine()` |
| 29 | **署名（归属）绘制** | 在右下角（0.98, 0.02）绘制 "© OpenStreetMap contributors"；zorder=11 | `ax.text(0.98, 0.02, "© ...", ...)` | `matplotlib.axes.Axes.text()` | Canvas `fillText()` |
| 30 | **图像保存** | 根据指定格式（PNG/SVG/PDF）保存图像；PNG 使用 DPI=300；应用边界与背景色设置 | `plt.savefig(output_file, format=fmt, ...)` | `matplotlib.pyplot.savefig()` | Canvas `toDataURL()` / `canvas.toBlob()` / SVG DOM export |
| 31 | **资源清理** | 关闭 matplotlib 图形，释放内存；打印完成消息 | `plt.close()` | `matplotlib.pyplot.close()` | 手动清空 Canvas context / React 组件卸载 |

---

## 关键缓存点

| 缓存类型 | 缓存键 | 存储位置 | 目的 |
|---------|--------|---------|------|
| 坐标缓存 | `coords_{city}_{country}` | `cache/` (pickle) | 避免重复地理编码 API 调用 |
| 图数据缓存 | `graph_{lat}_{lon}_{dist}` | `cache/` (pickle) | 避免重复 OSM 街道数据下载 |
| 水体缓存 | `water_{lat}_{lon}_{dist}_...` | `cache/` (pickle) | 避免重复 OSM 水体要素下载 |
| 公园缓存 | `parks_{lat}_{lon}_{dist}_...` | `cache/` (pickle) | 避免重复 OSM 公园要素下载 |
| 字体缓存 | `fonts/cache/{font_name}_{weight}.woff2\|ttf` | `fonts/cache/` | 避免重复 Google Fonts 下载 |
| 本地字体 | Roboto 字体文件 | `fonts/` | 默认排版字体 |
| 主题配置 | `themes/{theme_name}.json` | `themes/` | 主题样式定义 |

---

## 命令行选项映射

| CLI 参数 | 作用 | 流程环节 |
|---------|------|---------|
| `--city` / `-c` | 城市名称 | 地理编码（#3） |
| `--country` / `-C` | 国家名称 | 地理编码（#3） |
| `--latitude` / `-lat` | 覆盖经度 | 跳过地理编码，直接使用坐标 |
| `--longitude` / `-long` | 覆盖纬度 | 跳过地理编码，直接使用坐标 |
| `--theme` / `-t` | 主题名称 | 主题加载（#5） |
| `--distance` / `-d` | 地图半径（米） | OSM 数据抓取（#7-9） |
| `--width` / `-W` | 海报宽度（英寸） | matplotlib 初始化（#12）、字体缩放（#23） |
| `--height` / `-H` | 海报高度（英寸） | matplotlib 初始化（#12）、字体缩放（#23） |
| `--display-city` / `-dc` | 城市显示名（i18n） | 城市名绘制（#24-25） |
| `--display-country` / `-dC` | 国家显示名（i18n） | 国家名绘制（#26） |
| `--country-label` | 国家标签覆盖 | 国家名绘制（#26） |
| `--font-family` | Google Fonts 字体名 | 字体加载（#6） |
| `--all-themes` | 生成所有主题版本 | 主题加载循环（#5） |
| `--list-themes` | 列出可用主题 | 主题加载（#5） |
| `--format` / `-f` | 输出格式（png/svg/pdf） | 图像保存（#30） |

