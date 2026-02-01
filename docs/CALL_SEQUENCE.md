# MapPoster 调用序列（Call Sequence）

按执行顺序列出在 `create_map_poster.py` 中调用的函数、输入参数、返回值、作用与外部依赖。

| 顺序 | 被调用函数 | 输入参数 | 返回值 | 作用 / 说明 | 外部依赖 |
|---:|---|---|---|---|---|
| 0 | `load_fonts()` (模块顶层调用) | (font_family=None) | dict or None（字体路径） | 模块导入时初始化 `FONTS`（加载本地 Roboto 或缓存字体） | `font_management.py`（requests, pathlib, os） |
| 1 | `argparse.ArgumentParser()` / `parser.parse_args()` | CLI argv | `args` Namespace | 解析命令行参数 | `argparse` |
| 2 | `load_fonts(args.font_family)` （条件） | `args.font_family` (str) | dict or None | 若指定 `--font-family`，下载/加载自定义字体 | `font_management.py`（requests） |
| 3 | `parse()` (`lat_lon_parser`) （条件） | `args.latitude` / `args.longitude` (str) | numeric lat / lon | 将字符串坐标解析为数值 | `lat_lon_parser` |
| 4 | `get_coordinates(city, country)` （当未提供坐标） | `city` (str), `country` (str) | tuple (`lat`, `lon`) | 使用 `geopy.Nominatim` 进行地理编码，结果缓存到 `cache/` | `geopy` (Nominatim), `cache_get`/`cache_set`, `time`, `asyncio` |
| 5 | `get_available_themes()` | 无 | `list[str]` | 列出 `themes/` 下可用主题名 | `os` |
| 6 | `load_theme(theme_name)`（每个主题） | `theme_name` (str) | `dict` THEME | 从 `themes/{name}.json` 加载主题，或返回内置默认 | `json`, `os` |
| 7 | `generate_output_filename(city, theme_name, output_format)` | `city`, `theme_name`, `output_format` | `output_file` (str) | 生成输出文件名（含时间戳） | `datetime`, `os` |
| 8 | `create_poster(...)` | `city, country, point(lat,lon), dist, output_file, output_format, width, height, country_label, name_label, display_city, display_country, fonts` | None（写入文件） | 主渲染流水线：抓取 OSM 数据、投影、绘制图层与文本、保存海报 | 见下列子步骤 |
| 8.1 | `fetch_graph(point, compensated_dist)` | `point` (lat,lon), `dist` (m) | `MultiDiGraph` or `None` | 使用 `osmnx.graph_from_point` 获取街道网络并缓存为 pickle | `osmnx`, `pickle`, `cache_get`/`cache_set` |
| 8.2 | `fetch_features(point, compensated_dist, tags, name)`（water） | `point`, `dist`, `tags={'natural':'water', ...}` | `GeoDataFrame` or `None` | 使用 `osmnx.features_from_point` 获取水体要素并缓存 | `osmnx`, `geopandas`, `pickle` |
| 8.3 | `fetch_features(...)`（parks） | `point`, `dist`, `tags={'leisure':'park', ...}` | `GeoDataFrame` or `None` | 获取绿地/公园要素并缓存 | `osmnx`, `geopandas`, `pickle` |
| 8.4 | `plt.subplots(figsize=(width,height), facecolor=THEME['bg'])` | `width`, `height`, `bg` | `(fig, ax)` | 初始化 Matplotlib 画布与轴 | `matplotlib.pyplot` |
| 8.5 | `ox.project_graph(g)` | `g` (MultiDiGraph) | `g_proj` (projected graph) | 将街道网络投影到度量 CRS（米）以便度量与裁切 | `osmnx` |
| 8.6 | `ox.projection.project_gdf(water_polys)` 或 `gdf.to_crs()` | `GeoDataFrame` | 投影后的 `GeoDataFrame` | 将矢量要素投影到与图相同的 CRS | `osmnx.projection` / `geopandas` |
| 8.7 | `water_polys.plot(ax=ax, facecolor=THEME['water'], ...)` | `GeoDataFrame`, `ax` | Axes artist | 在地图上填充水体多边形 | `geopandas`, `matplotlib` |
| 8.8 | `parks_polys.plot(...)` | `GeoDataFrame`, `ax` | Axes artist | 绘制公园多边形 | `geopandas`, `matplotlib` |
| 8.9 | `get_edge_colors_by_type(g_proj)` | `g_proj` | `list[str]`（每条边的颜色） | 根据 OSM `highway` 标签为每条边选择颜色（使用 `THEME`） | `networkx` edges, `THEME` dict |
| 8.10 | `get_edge_widths_by_type(g_proj)` | `g_proj` | `list[float]`（每条边的线宽） | 根据 `highway` 类型为边分配线宽 | `networkx` |
| 8.11 | `get_crop_limits(g_proj, point, fig, compensated_dist)` | `g_proj`, `center lat/lon`, `fig`, `dist` | `(x_limits, y_limits)` tuples | 根据海报纵横比与请求半径计算裁切范围 | `ox.projection.project_geometry`, `shapely.geometry.Point` |
| 8.12 | `ox.plot_graph(g_proj, ax=ax, edge_color=edge_colors, edge_linewidth=edge_widths, ...)` | `g_proj`, `ax`, `edge_colors`, `edge_widths` | 绘制道路到 `ax`（返回绘制状态） | 在轴上绘制道路网络，应用分层颜色与线宽 | `osmnx.plot`, `matplotlib` |
| 8.13 | `ax.set_aspect('equal') / ax.set_xlim(...) / ax.set_ylim(...)` | `ax`, limits | None | 锁定纵横比并应用裁切边界 | `matplotlib.axes` |
| 8.14 | `create_gradient_fade(ax, color, location='bottom'|'top', zorder=10)` | `ax`, `color`, `location` | None（渲染渐变） | 在图上下绘制渐变覆盖层增加视觉效果 | `numpy`, `matplotlib.colors`, `ax.imshow` |
| 8.15 | `FontProperties(fname=..., size=...)`（多次） | 字体文件路径、字号 | `FontProperties` 对象 | 为主标题、副标题、坐标、署名创建字体属性 | `matplotlib.font_manager` + `font_management` 结果 |
| 8.16 | `is_latin_script(display_city)` | `display_city` (str) | `bool` | 检测城市名是否主要为拉丁字母，决定字距与大写策略 | Python 内置（`str.isalpha`, `ord`） |
| 8.17 | `ax.text(...)`（城市、国家、坐标、署名） | `position`, `string`, `fontprops`, `color` | Axes text artists | 将文本元素绘制到画布上 | `matplotlib.axes.Axes.text` |
| 8.18 | `ax.plot([0.4,0.6],[0.125,0.125], ...)` | 坐标、样式 | Line artist | 绘制装饰线 | `matplotlib.axes.Axes.plot` |
| 8.19 | `plt.savefig(output_file, format=fmt, **save_kwargs)` | `output_file`, `fmt`, `save_kwargs` | 写入文件（PNG/SVG/PDF） | 导出并保存最终海报图像 | `matplotlib.pyplot.savefig` |
| 8.20 | `plt.close()` | `fig` | None | 关闭并释放 Matplotlib 资源 | `matplotlib.pyplot.close` |
| 9 | `cache_get(key)` / `cache_set(key, value)`（贯穿） | `key` / `(key,value)` | `cached object` or `None` / `None` | 本地 pickle 缓存读写，避免重复网络请求 | `pickle`, `os` |

---

如需：
- 将本表追加到现有 `PIPELINE_OVERVIEW.md` 或替换其内容；
- 为每个调用添加示例输入/典型返回值；
- 在表中标注“推荐迁移到 WASM 的步骤”；
请告诉我下一步操作。
