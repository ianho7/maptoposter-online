#!/usr/bin/env python3
"""
City Map Poster Generator

This module generates beautiful, minimalist map posters for any city in the world.
It fetches OpenStreetMap data using OSMnx, applies customizable themes, and creates
high-quality poster-ready images with roads, water features, and parks.
"""

"""
中文注释概览（模块级）：

本文件为 Map Poster 生成器的主脚本，主要职责是：
- 通过命令行参数接受城市、国家、坐标、主题、尺寸等输入；
- 使用地理编码将城市名解析为经纬度（若用户未显式提供坐标）；
- 使用 OSMnx 从 OpenStreetMap 下载街道网络与要素（水体、绿地等），并对请求结果做本地缓存以提升重复运行性能；
- 将矢量数据投影到度量 CRS（米为单位），便于按米为单位计算裁切与缩放；
- 根据主题配置（`themes/*.json`）应用配色规则与道路层次样式；
- 使用 matplotlib 绘制地图分层（背景、水体、公园、道路、渐变与排版文本）；
- 支持自定义/下载 Google Fonts（通过 `font_management.py`），并根据脚本判断（拉丁/非拉丁）调整字距与排版；
- 将最终海报导出为 PNG/SVG/PDF，保存到 `posters/` 目录。

文件中主要函数与其作用（按文件顺序）：
- `_cache_path(key)`: 将缓存键转换为文件系统安全路径（返回 .pkl 路径）。
- `cache_get(key)`: 读取并反序列化缓存（pickle），若不存在返回 None；出错抛出 CacheError。
- `cache_set(key, value)`: 将可序列化对象写入缓存（pickle）；写入失败抛出 CacheError。
- `is_latin_script(text)`: 简单的 Unicode 范围检查，用于判断字符串是否主要为拉丁字母，决定是否对城市名应用字距与大写处理。
- `generate_output_filename(city, theme_name, output_format)`: 根据城市、主题与当前时间生成唯一的输出文件名并确保 `posters/` 目录存在。
- `get_available_themes()`: 扫描 `themes/` 目录并返回可用主题列表（.json 文件名去扩展名）。
- `load_theme(theme_name)`: 从 `themes/{theme_name}.json` 加载主题配色字典，若文件缺失返回内置的 terracotta 主题作为回退。
- `create_gradient_fade(ax, color, location, zorder)`: 在 matplotlib `ax` 上绘制顶部或底部的渐变遮罩（用于视觉淡出效果）。
- `get_edge_colors_by_type(g)` / `get_edge_widths_by_type(g)`: 基于 OSM edge 的 `highway` 标签返回每条边对应的颜色与线宽（用于道路分层渲染）。
- `get_coordinates(city, country)`: 使用 `geopy.Nominatim` 进行地理编码；在调用前尝试从本地缓存读取；对返回的 coroutine 做兼容处理；将结果缓存。
- `get_crop_limits(g_proj, center_lat_lon, fig, dist)`: 将中心点投影到图 CRS，基于画布纵横比计算裁切的 x/y 范围（保证以米为单位覆盖请求半径并保留纵横比）。
- `fetch_graph(point, dist)`: 使用 `osmnx.graph_from_point` 获取包含不同道路类型的街道网络图（MultiDiGraph），并缓存 pickle 以减少重复下载。
- `fetch_features(point, dist, tags, name)`: 使用 `osmnx.features_from_point` 根据 OSM tags 获取 GeoDataFrame（如水体、公园），并缓存。
- `create_poster(...)`: 主渲染函数，按以下步骤执行：
    1. 计算补偿距离（compensated_dist）以应对纵横比裁切；
    2. 调用 `fetch_graph`、`fetch_features`（water & parks）获取数据并更新进度条；
    3. 初始化 matplotlib 画布并设置背景色；
    4. 将图投影到度量 CRS（`ox.project_graph`）；
    5. 投影并绘制水体与公园多边形（仅绘制 polygon / multipolygon）；
    6. 调用道路颜色/宽度计算函数并绘制道路（`ox.plot_graph`）；
    7. 计算并应用裁切范围与纵横比；
    8. 绘制顶部/底部渐变；
    9. 根据字体与画布尺寸计算字体属性并绘制城市名、国家名、坐标与署名；
 10. 保存图像并关闭 figure（释放资源）。

注意事项：
- 脚本对外部服务（Nominatim / OpenStreetMap）含有基本的 sleep 限流，但仍需谨慎避免频繁批量请求；
- OSMnx 在拉取大范围（大 dist）时可能非常耗时且占用大量内存，建议使用缓存与合适的 `network_type` 限制；
- 字体下载依赖 Google Fonts 的 CSS + 字体文件链接，可能被字体服务的 CORS 或策略限制影响。

以上模块级注释覆盖了文件中所有函数与关键步骤；如需我把注释直接插入到每个函数的 docstring 内部或以行注释形式逐行注释，告诉我要以哪种风格更新（docstring/行注释）。
"""

import argparse
import asyncio
import json
import os
import pickle
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import cast

import matplotlib.colors as mcolors
import matplotlib.pyplot as plt
import numpy as np
import osmnx as ox
from geopandas import GeoDataFrame
from geopy.geocoders import Nominatim
from lat_lon_parser import parse
from font_management import load_fonts
from matplotlib.font_manager import FontProperties
from networkx import MultiDiGraph
from shapely.geometry import Point
from tqdm import tqdm


class CacheError(Exception):
    """Raised when a cache operation fails."""

    pass


CACHE_DIR_PATH = os.environ.get("CACHE_DIR", "cache")
CACHE_DIR = Path(CACHE_DIR_PATH)
CACHE_DIR.mkdir(exist_ok=True)

THEMES_DIR = "themes"
FONTS_DIR = "fonts"
POSTERS_DIR = "posters"

FONTS = load_fonts()


def _cache_path(key: str) -> str:
    """
    将缓存键转换为文件系统安全的缓存文件路径。
    
    将缓存键中的路径分隔符替换为下划线，确保键名在不同操作系统上都能安全地用作文件名，
    最后追加 .pkl 扩展名以标识为 pickle 二进制缓存文件。

    参数：
        key (str): 缓存键标识符，通常形式为 "graph_lat_lon_dist" 或 "coords_city_country"

    返回值：
        str: 完整的缓存文件路径，例如 "cache/graph_lat_lon_dist.pkl"
    """
    safe = key.replace(os.sep, "_")
    return os.path.join(CACHE_DIR, f"{safe}.pkl")


def cache_get(key: str):
    """
    从本地缓存读取并反序列化对象。
    
    根据缓存键查找对应的 .pkl 文件，如果存在则使用 pickle.load() 反序列化并返回原对象；
    如果文件不存在，返回 None；若读取或反序列化过程中发生异常，抛出 CacheError。
    此函数用于避免重复的网络请求（地理编码、OSM 数据下载）。

    参数：
        key (str): 缓存键标识符

    返回值：
        object | None: 缓存的对象（如 GeoDataFrame、MultiDiGraph、tuple 等），或 None 如果缓存不存在

    异常：
        CacheError: 当文件读取、反序列化或其他 I/O 操作失败时抛出
    """
    try:
        path = _cache_path(key)
        if not os.path.exists(path):
            return None
        with open(path, "rb") as f:
            return pickle.load(f)
    except Exception as e:
        raise CacheError(f"Cache read failed: {e}") from e


def cache_set(key: str, value):
    """
    将对象序列化后保存到本地缓存。
    
    使用 pickle.dump() 将任意可序列化的 Python 对象（如图、GeoDataFrame、坐标元组等）
    写入到 cache 目录下对应的 .pkl 文件中。如果 cache 目录不存在则先创建；
    若写入过程中发生异常，抛出 CacheError。

    参数：
        key (str): 缓存键标识符
        value: 要缓存的对象，必须能被 pickle 序列化（大多数 Python 内置类型和 numpy/geopandas 对象都支持）

    异常：
        CacheError: 当目录创建、文件写入或序列化操作失败时抛出
    """
    try:
        if not os.path.exists(CACHE_DIR):
            os.makedirs(CACHE_DIR)
        path = _cache_path(key)
        with open(path, "wb") as f:
            pickle.dump(value, f, protocol=pickle.HIGHEST_PROTOCOL)
    except Exception as e:
        raise CacheError(f"Cache write failed: {e}") from e


# Font loading now handled by font_management.py module


def is_latin_script(text):
    """
    检查文本是否主要为拉丁字母脚本。
    
    通过遍历文本中所有字母字符，统计其中有多少个落在拉丁字母范围内（Unicode < 0x250），
    如果超过 80% 的字母字符为拉丁字母，则判定为拉丁脚本。空文本或无字母字符默认返回 True。
    本函数用于决定是否对城市名应用字间距与大小写转换（拉丁脚本适合间距，非拉丁脚本如 CJK 不适合）。

    参数：
        text (str): 要分析的文本，通常为城市名

    返回值：
        bool: True 表示文本主要为拉丁字母（包括数字、符号或空字符串）；False 表示为非拉丁脚本（CJK、阿拉伯语、泰语等）
    """
    if not text:
        return True

    latin_count = 0
    total_alpha = 0

    for char in text:
        if char.isalpha():
            total_alpha += 1
            # Latin Unicode ranges:
            # - Basic Latin: U+0000 to U+007F
            # - Latin-1 Supplement: U+0080 to U+00FF
            # - Latin Extended-A: U+0100 to U+017F
            # - Latin Extended-B: U+0180 to U+024F
            if ord(char) < 0x250:
                latin_count += 1

    # If no alphabetic characters, default to Latin (numbers, symbols, etc.)
    if total_alpha == 0:
        return True

    # Consider it Latin if >80% of alphabetic characters are Latin
    return (latin_count / total_alpha) > 0.8


def generate_output_filename(city, theme_name, output_format):
    """
    根据城市名、主题名和时间戳生成唯一的输出文件名。
    
    将城市名转换为小写、用下划线替换空格作为文件名前缀；附加主题名和当前时间戳（精确到秒）
    以确保每次生成的文件名唯一；格式为 "{city_slug}_{theme_name}_{YYYYmmdd_HHMMSS}.{format}"。
    如果 posters/ 目录不存在则先创建。

    参数：
        city (str): 城市名
        theme_name (str): 主题名（如 "noir"、"terracotta"）
        output_format (str): 输出格式（"png"、"svg" 或 "pdf"）

    返回值：
        str: 完整的输出文件路径，例如 "posters/paris_noir_20260130_143052.png"
    """
    if not os.path.exists(POSTERS_DIR):
        os.makedirs(POSTERS_DIR)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    city_slug = city.lower().replace(" ", "_")
    ext = output_format.lower()
    filename = f"{city_slug}_{theme_name}_{timestamp}.{ext}"
    return os.path.join(POSTERS_DIR, filename)


def get_available_themes():
    """
    扫描 themes/ 目录并返回所有可用主题的列表。
    
    遍历 themes/ 目录下所有 .json 文件，提取文件名（去除 .json 后缀）作为主题名。
    返回的列表按字母顺序排序。如果 themes/ 目录不存在则先创建空目录，返回空列表。

    参数：
        无

    返回值：
        list[str]: 可用主题名称列表，例如 ["autumn", "blueprint", "noir", "terracotta", ...]
    """
    if not os.path.exists(THEMES_DIR):
        os.makedirs(THEMES_DIR)
        return []

    themes = []
    for file in sorted(os.listdir(THEMES_DIR)):
        if file.endswith(".json"):
            theme_name = file[:-5]  # Remove .json extension
            themes.append(theme_name)
    return themes


def load_theme(theme_name="terracotta"):
    """
    从 themes/{theme_name}.json 文件加载主题配色字典。
    
    打开指定的主题 JSON 文件并解析为字典。字典通常包含 "name"、"description"、
    "bg"（背景色）、"text"（文字色）、"water"（水体色）、"parks"（公园色）
    以及各类道路的颜色（road_motorway、road_primary 等）。
    如果指定的主题文件不存在，打印警告并返回内置的 terracotta 主题作为后备。

    参数：
        theme_name (str): 主题名（不含 .json 后缀），默认为 "terracotta"

    返回值：
        dict: 主题配色字典，键为 "bg"、"text"、"road_motorway" 等，值为十六进制颜色码
    """
    theme_file = os.path.join(THEMES_DIR, f"{theme_name}.json")

    if not os.path.exists(theme_file):
        print(f"⚠ Theme file '{theme_file}' not found. Using default terracotta theme.")
        # Fallback to embedded terracotta theme
        return {
            "name": "Terracotta",
            "description": "Mediterranean warmth - burnt orange and clay tones on cream",
            "bg": "#F5EDE4",
            "text": "#8B4513",
            "gradient_color": "#F5EDE4",
            "water": "#A8C4C4",
            "parks": "#E8E0D0",
            "road_motorway": "#A0522D",
            "road_primary": "#B8653A",
            "road_secondary": "#C9846A",
            "road_tertiary": "#D9A08A",
            "road_residential": "#E5C4B0",
            "road_default": "#D9A08A",
        }

    with open(theme_file, "r") as f:
        theme = json.load(f)
        print(f"✓ Loaded theme: {theme.get('name', theme_name)}")
        if "description" in theme:
            print(f"  {theme['description']}")
        return theme


# Load theme (can be changed via command line or input)
THEME = dict[str, str]()  # Will be loaded later


def create_gradient_fade(ax, color, location="bottom", zorder=10):
    """
    在 matplotlib 坐标轴的顶部或底部绘制渐变淡出遮罩。
    
    生成一个 256x2 的梯度数组，使用指定颜色创建 RGBA 颜色映射，根据位置参数
    设置透明度从 1 到 0（底部）或 0 到 1（顶部）的线性变化。通过 imshow 将
    渐变图像叠加到图形上，覆盖底部或顶部约 25% 的区域，用于视觉淡出效果。

    参数：
        ax (matplotlib.axes.Axes): matplotlib 坐标轴对象
        color (str): 渐变颜色，可为十六进制码（如 "#F5EDE4"）或颜色名称
        location (str): 渐变位置，"bottom" 表示底部淡出，其他值表示顶部淡出，默认 "bottom"
        zorder (int): 图层顺序，默认 10（应在文字层之下）

    返回值：
        无（直接修改传入的 ax 对象）
    """
    vals = np.linspace(0, 1, 256).reshape(-1, 1)
    gradient = np.hstack((vals, vals))

    rgb = mcolors.to_rgb(color)
    my_colors = np.zeros((256, 4))
    my_colors[:, 0] = rgb[0]
    my_colors[:, 1] = rgb[1]
    my_colors[:, 2] = rgb[2]

    if location == "bottom":
        my_colors[:, 3] = np.linspace(1, 0, 256)
        extent_y_start = 0
        extent_y_end = 0.25
    else:
        my_colors[:, 3] = np.linspace(0, 1, 256)
        extent_y_start = 0.75
        extent_y_end = 1.0

    custom_cmap = mcolors.ListedColormap(my_colors)

    xlim = ax.get_xlim()
    ylim = ax.get_ylim()
    y_range = ylim[1] - ylim[0]

    y_bottom = ylim[0] + y_range * extent_y_start
    y_top = ylim[0] + y_range * extent_y_end

    ax.imshow(
        gradient,
        extent=[xlim[0], xlim[1], y_bottom, y_top],
        aspect="auto",
        cmap=custom_cmap,
        zorder=zorder,
        origin="lower",
    )


def get_edge_colors_by_type(g):
    """
    根据道路类型层级为图的每条边分配颜色。
    
    遍历图中所有边及其属性，从 "highway" 标签获取道路类型（motorway、primary、
    secondary 等），按层级映射到当前主题（THEME）中对应的颜色值。
    如果边的 "highway" 属性为列表，则取第一个元素；若不存在或无效，默认使用 "unclassified"。
    返回的颜色列表顺序与图的边遍历顺序一致，可直接用于 ox.plot_graph() 的 edge_color 参数。

    参数：
        g (networkx.MultiDiGraph): 投影后的街道网络图

    返回值：
        list[str]: 十六进制颜色码列表，长度等于图中边的数量
    """
    edge_colors = []

    for _u, _v, data in g.edges(data=True):
        # Get the highway type (can be a list or string)
        highway = data.get('highway', 'unclassified')

        # Handle list of highway types (take the first one)
        if isinstance(highway, list):
            highway = highway[0] if highway else 'unclassified'

        # Assign color based on road type
        if highway in ["motorway", "motorway_link"]:
            color = THEME["road_motorway"]
        elif highway in ["trunk", "trunk_link", "primary", "primary_link"]:
            color = THEME["road_primary"]
        elif highway in ["secondary", "secondary_link"]:
            color = THEME["road_secondary"]
        elif highway in ["tertiary", "tertiary_link"]:
            color = THEME["road_tertiary"]
        elif highway in ["residential", "living_street", "unclassified"]:
            color = THEME["road_residential"]
        else:
            color = THEME['road_default']

        edge_colors.append(color)

    return edge_colors


def get_edge_widths_by_type(g):
    """
    根据道路类型为图的每条边分配线宽。
    
    遍历图中所有边，根据 "highway" 标签的道路类型分配线宽值：
    - motorway 系列：1.2（最粗）
    - trunk/primary 系列：1.0
    - secondary 系列：0.8
    - tertiary 系列：0.6
    - 其他：0.4（最细）
    线宽值直接用于 matplotlib 的 linewidth 参数，单位为点（points）。

    参数：
        g (networkx.MultiDiGraph): 投影后的街道网络图

    返回值：
        list[float]: 线宽列表，长度等于图中边的数量
    """
    edge_widths = []

    for _u, _v, data in g.edges(data=True):
        highway = data.get('highway', 'unclassified')

        if isinstance(highway, list):
            highway = highway[0] if highway else 'unclassified'

        # Assign width based on road importance
        if highway in ["motorway", "motorway_link"]:
            width = 1.2
        elif highway in ["trunk", "trunk_link", "primary", "primary_link"]:
            width = 1.0
        elif highway in ["secondary", "secondary_link"]:
            width = 0.8
        elif highway in ["tertiary", "tertiary_link"]:
            width = 0.6
        else:
            width = 0.4

        edge_widths.append(width)

    return edge_widths


def get_coordinates(city, country):
    """
    使用 Nominatim 地理编码服务获取城市的经纬度坐标。
    
    首先尝试从本地缓存读取坐标；若缓存不存在，则向 Nominatim 服务发送地理编码请求。
    为了遵守 Nominatim 的使用政策，每次请求前暂停 1 秒。函数处理了地理编码器可能返回
    协程的情况（在某些异步环境下），通过 asyncio 运行或重用现有事件循环。
    获取成功后，将坐标缓存以加速后续相同请求。

    参数：
        city (str): 城市名
        country (str): 国家名

    返回值：
        tuple[float, float]: (纬度, 经度)，例如 (48.8566, 2.3522) 表示巴黎

    异常：
        ValueError: 当地理编码失败或无法找到城市坐标时抛出
        RuntimeError: 当地理编码器返回协程但事件循环已在运行时抛出
    """
    coords = f"coords_{city.lower()}_{country.lower()}"
    cached = cache_get(coords)
    if cached:
        print(f"✓ Using cached coordinates for {city}, {country}")
        return cached

    print("Looking up coordinates...")
    geolocator = Nominatim(user_agent="city_map_poster", timeout=10)

    # Add a small delay to respect Nominatim's usage policy
    time.sleep(1)

    try:
        location = geolocator.geocode(f"{city}, {country}")
    except Exception as e:
        raise ValueError(f"Geocoding failed for {city}, {country}: {e}") from e

    # If geocode returned a coroutine in some environments, run it to get the result.
    if asyncio.iscoroutine(location):
        try:
            location = asyncio.run(location)
        except RuntimeError as exc:
            # If an event loop is already running, try using it to complete the coroutine.
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # Running event loop in the same thread; raise a clear error.
                raise RuntimeError(
                    "Geocoder returned a coroutine while an event loop is already running. "
                    "Run this script in a synchronous environment."
                ) from exc
            location = loop.run_until_complete(location)

    if location:
        # Use getattr to safely access address (helps static analyzers)
        addr = getattr(location, "address", None)
        if addr:
            print(f"✓ Found: {addr}")
        else:
            print("✓ Found location (address not available)")
        print(f"✓ Coordinates: {location.latitude}, {location.longitude}")
        try:
            cache_set(coords, (location.latitude, location.longitude))
        except CacheError as e:
            print(e)
        return (location.latitude, location.longitude)

    raise ValueError(f"Could not find coordinates for {city}, {country}")


def get_crop_limits(g_proj, center_lat_lon, fig, dist):
    """
    根据图形纵横比计算地图的裁切范围，确保覆盖完整的请求半径同时保持纵横比。
    
    将中心点（纬经度）投影到图的坐标参考系（CRS，通常为度量 CRS），
    根据画布纵横比调整 x 和 y 的半范围：
    - 如果宽 > 高（横向），减小 y 半范围
    - 如果高 > 宽（纵向），减小 x 半范围
    返回的范围用于设置 matplotlib 坐标轴的 xlim 和 ylim，实现正确的图形裁切。

    参数：
        g_proj (osmnx.MultiDiGraph): 已投影到度量 CRS 的街道网络图
        center_lat_lon (tuple[float, float]): (纬度, 经度) 中心点
        fig (matplotlib.figure.Figure): matplotlib 图形对象
        dist (int): 地图半径（米），作为计算裁切范围的初始值

    返回值：
        tuple[tuple[float, float], tuple[float, float]]: 返回 ((x_min, x_max), (y_min, y_max))，单位为投影 CRS 的单位（通常为米）
    """
    lat, lon = center_lat_lon

    # Project center point into graph CRS
    center = (
        ox.projection.project_geometry(
            Point(lon, lat),
            crs="EPSG:4326",
            to_crs=g_proj.graph["crs"]
        )[0]
    )
    center_x, center_y = center.x, center.y

    fig_width, fig_height = fig.get_size_inches()
    aspect = fig_width / fig_height

    # Start from the *requested* radius
    half_x = dist
    half_y = dist

    # Cut inward to match aspect
    if aspect > 1:  # landscape → reduce height
        half_y = half_x / aspect
    else:  # portrait → reduce width
        half_x = half_y * aspect

    return (
        (center_x - half_x, center_x + half_x),
        (center_y - half_y, center_y + half_y),
    )


def fetch_graph(point, dist) -> MultiDiGraph | None:
    """
    从 OpenStreetMap 下载街道网络图。
    
    使用本地缓存避免重复下载；若缓存不存在，通过 OSMnx 的 graph_from_point() 获取
    指定半径内的所有道路网络（network_type='all'），包括机动车道、步道等。
    下载后缓存为 pickle 文件以加速后续相同地点的请求。
    网络请求前后添加 0.5 秒延迟以避免对 OSM 服务器过度请求。

    参数：
        point (tuple[float, float]): (纬度, 经度) 中心点
        dist (int): 搜索半径（米），dist_type='bbox' 表示以矩形范围搜索

    返回值：
        networkx.MultiDiGraph | None: 街道网络图对象，若下载失败则返回 None
    """
    lat, lon = point
    graph = f"graph_{lat}_{lon}_{dist}"
    cached = cache_get(graph)
    if cached is not None:
        print("✓ Using cached street network")
        return cast(MultiDiGraph, cached)

    try:
        g = ox.graph_from_point(point, dist=dist, dist_type='bbox', network_type='all', truncate_by_edge=True)
        # Rate limit between requests
        time.sleep(0.5)
        try:
            cache_set(graph, g)
        except CacheError as e:
            print(e)
        return g
    except Exception as e:
        print(f"OSMnx error while fetching graph: {e}")
        return None


def fetch_features(point, dist, tags, name) -> GeoDataFrame | None:
    """
    从 OpenStreetMap 下载指定类型的地理要素（水体、公园等）。
    
    使用本地缓存避免重复下载；若缓存不存在，通过 OSMnx 的 features_from_point() 获取
    指定 OSM 标签匹配的要素（GeoDataFrame）。例如，传入 tags={"natural": "water"} 可获取水体，
    tags={"leisure": "park"} 可获取公园。下载后缓存以加速后续请求。
    网络请求前后添加 0.3 秒延迟。

    参数：
        point (tuple[float, float]): (纬度, 经度) 中心点
        dist (int): 搜索半径（米）
        tags (dict): OSM 标签字典，如 {"natural": "water", "waterway": "riverbank"}
        name (str): 要素类型名称，用于缓存键和日志输出（如 "water"、"parks"）

    返回值：
        geopandas.GeoDataFrame | None: 包含地理要素的 GeoDataFrame，若下载失败则返回 None
    """
    lat, lon = point
    tag_str = "_".join(tags.keys())
    features = f"{name}_{lat}_{lon}_{dist}_{tag_str}"
    cached = cache_get(features)
    if cached is not None:
        print(f"✓ Using cached {name}")
        return cast(GeoDataFrame, cached)

    try:
        data = ox.features_from_point(point, tags=tags, dist=dist)
        # Rate limit between requests
        time.sleep(0.3)
        try:
            cache_set(features, data)
        except CacheError as e:
            print(e)
        return data
    except Exception as e:
        print(f"OSMnx error while fetching features: {e}")
        return None


def create_poster(
    city,
    country,
    point,
    dist,
    output_file,
    output_format,
    width=12,
    height=16,
    country_label=None,
    name_label=None,
    display_city=None,
    display_country=None,
    fonts=None,
):
    """
    生成完整的地图海报，包含道路、水体、公园和排版文字。
    
    主要步骤：
    1. 计算补偿距离以应对纵横比裁切，然后并行获取街道网络、水体和公园的 OSM 数据。
    2. 创建 matplotlib 图形，设置背景色，投影图到度量坐标系（米为单位）。
    3. 按图层顺序绘制：水体多边形 → 公园多边形 → 道路（按类型着色和分宽度） → 渐变遮罩。
    4. 应用纵横比裁切，计算缩放因子（基于短边与 12 英寸的比例）。
    5. 根据是否为拉丁脚本决定城市名的排版（拉丁脚本加间距和大写，非拉丁脚本保持原样）；
       根据城市名长度动态调整字体大小以防止溢出。
    6. 绘制城市名、国家名、坐标、署名等文字，并应用对应字体。
    7. 保存图像为指定格式（PNG 300 DPI、SVG、或 PDF）。

    参数：
        city (str): 城市英文名（用于缓存键、文件名）
        country (str): 国家名
        point (tuple[float, float]): (纬度, 经度) 地图中心
        dist (int): 地图搜索半径（米）
        output_file (str): 输出文件完整路径
        output_format (str): 输出格式，"png"、"svg" 或 "pdf"
        width (float): 海报宽度（英寸），默认 12
        height (float): 海报高度（英寸），默认 16
        country_label (str | None): 海报上显示的国家名覆盖值（可用于翻译或缩写）
        name_label (str | None): 海报上显示的城市名覆盖值（保留参数，目前未使用）
        display_city (str | None): 海报上显示的城市名（优先级：display_city > name_label > city）
        display_country (str | None): 海报上显示的国家名（优先级：display_country > country_label > country）
        fonts (dict | None): 字体字典，包含 "bold"、"light"、"regular" 键值对，指向本地字体文件路径；若为 None 则使用内置字体或系统 monospace 后备

    异常：
        RuntimeError: 当无法下载街道网络数据时抛出
    """
    # ----------（步骤）处理：显示名称 i18n 支持----------
    # 输入: display_city/display_country/name_label/country_label 或原始 city/country
    # 输出: 规范后的 display_city, display_country（str）
    # 外部库调用: 无（标准库字符串处理）
    # Priority: display_city/display_country > name_label/country_label > city/country
    display_city = display_city or name_label or city
    display_country = display_country or country_label or country

    print(f"\nGenerating map for {city}, {country}...")

    # ----------（步骤）数据获取：向 OSM 请求并读取缓存----------
    # 输入: point (lat,lon), dist (米)
    # 输出: g (MultiDiGraph), water (GeoDataFrame | None), parks (GeoDataFrame | None)
    # 外部库调用: OSMnx (graph_from_point, features_from_point), cache_get/cache_set (pickle 缓存)
    # 注意: 使用 tqdm 展示进度条（UI），并在 fetch_* 中处理网络异常与缓存
    with tqdm(
        total=3,
        desc="Fetching map data",
        unit="step",
        bar_format="{l_bar}{bar}| {n_fmt}/{total_fmt}",
    ) as pbar:
        # 1. Fetch Street Network (NetworkX MultiDiGraph)
        pbar.set_description("Downloading street network")
        compensated_dist = dist * (max(height, width) / min(height, width)) / 4  # To compensate for viewport crop
        g = fetch_graph(point, compensated_dist)
        if g is None:
            raise RuntimeError("Failed to retrieve street network data.")
        pbar.update(1)

        # 2. Fetch Water Features (GeoPandas GeoDataFrame)
        pbar.set_description("Downloading water features")
        water = fetch_features(
            point,
            compensated_dist,
            tags={"natural": "water", "waterway": "riverbank"},
            name="water",
        )
        pbar.update(1)

        # 3. Fetch Parks/Green Spaces (GeoPandas GeoDataFrame)
        pbar.set_description("Downloading parks/green spaces")
        parks = fetch_features(
            point,
            compensated_dist,
            tags={"leisure": "park", "landuse": "grass"},
            name="parks",
        )
        pbar.update(1)

    print("✓ All data retrieved successfully!")

    # ----------（步骤）绘图设置：Matplotlib 初始化----------
    # 输入: THEME 配色, width/height
    # 输出: fig (Figure), ax (Axes)
    # 外部库调用: Matplotlib
    print("Rendering map...")
    fig, ax = plt.subplots(figsize=(width, height), facecolor=THEME["bg"])
    ax.set_facecolor(THEME["bg"])
    ax.set_position((0.0, 0.0, 1.0, 1.0))

    # ----------（步骤）投影：将图投影到度量 CRS（单位：米）----------
    # 输入: g (MultiDiGraph, 通常 EPSG:4326)
    # 输出: g_proj (MultiDiGraph, 投影后，图的 node/edge 坐标为米单位)
    # 外部库调用: OSMnx (ox.project_graph)
    g_proj = ox.project_graph(g)

    # 3. Plot Layers
    # Layer 1: Polygons (filter to only plot polygon/multipolygon geometries, not points)
    # ----------（步骤）绘制：水体多边形 ----------
    # 输入: water (GeoDataFrame 或 None)，g_proj.graph['crs']
    # 输出: 在 ax 上绘制的水体图层（无返回值，副作用）
    # 外部库调用: GeoPandas.plot, OSMnx 投影辅助函数
    if water is not None and not water.empty:
        # Filter to only polygon/multipolygon geometries to avoid point features showing as dots
        water_polys = water[water.geometry.type.isin(["Polygon", "MultiPolygon"])]
        if not water_polys.empty:
            # Project water features in the same CRS as the graph
            try:
                water_polys = ox.projection.project_gdf(water_polys)
            except Exception:
                water_polys = water_polys.to_crs(g_proj.graph['crs'])
            water_polys.plot(ax=ax, facecolor=THEME['water'], edgecolor='none', zorder=0.5)

    # ----------（步骤）绘制：公园/绿地多边形 ----------
    # 输入: parks (GeoDataFrame 或 None)
    # 输出: 在 ax 上绘制的公园图层（副作用）
    # 外部库调用: GeoPandas.plot, OSMnx 投影辅助函数
    if parks is not None and not parks.empty:
        # Filter to only polygon/multipolygon geometries to avoid point features showing as dots
        parks_polys = parks[parks.geometry.type.isin(["Polygon", "MultiPolygon"])]
        if not parks_polys.empty:
            # Project park features in the same CRS as the graph
            try:
                parks_polys = ox.projection.project_gdf(parks_polys)
            except Exception:
                parks_polys = parks_polys.to_crs(g_proj.graph['crs'])
            parks_polys.plot(ax=ax, facecolor=THEME['parks'], edgecolor='none', zorder=0.8)
    # Layer 2: Roads with hierarchy coloring
    # ----------（步骤）道路绘制：计算颜色与宽度并绘制道路网络 ----------
    # 输入: g_proj (投影后的 MultiDiGraph)
    # 输出: 在 ax 上绘制的道路图層（副作用）
    # 外部庫调用: 自定义函数 get_edge_colors_by_type/get_edge_widths_by_type (基于 THEME), OSMnx.plot_graph
    print("Applying road hierarchy colors...")
    edge_colors = get_edge_colors_by_type(g_proj)
    edge_widths = get_edge_widths_by_type(g_proj)

    # ----------（步骤）裁切：根据画布纵横比计算显示范围 ----------
    # 输入: g_proj, center point, fig, compensated_dist
    # 输出: crop_xlim, crop_ylim (以投影 CRS 单位[米]表示的范围元组)
    crop_xlim, crop_ylim = get_crop_limits(g_proj, point, fig, compensated_dist)
    # Plot the projected graph and then apply the cropped limits
    ox.plot_graph(
        g_proj, ax=ax, bgcolor=THEME['bg'],
        node_size=0,
        edge_color=edge_colors,
        edge_linewidth=edge_widths,
        show=False,
        close=False,
    )
    ax.set_aspect("equal", adjustable="box")
    ax.set_xlim(crop_xlim)
    ax.set_ylim(crop_ylim)

    # ----------（步骤）视觉修饰：添加上下渐变遮罩 ----------
    # 输入: ax, 颜色
    # 输出: 在 ax 上叠加的渐变图像（副作用）
    create_gradient_fade(ax, THEME['gradient_color'], location='bottom', zorder=10)
    create_gradient_fade(ax, THEME['gradient_color'], location='top', zorder=10)

    # Calculate scale factor based on smaller dimension (reference 12 inches)
    # This ensures text scales properly for both portrait and landscape orientations
    scale_factor = min(height, width) / 12.0

    # Base font sizes (at 12 inches width)
    BASE_MAIN = 60
    BASE_SUB = 22
    BASE_COORDS = 14
    BASE_ATTR = 8

    # ----------（步骤）排版：字体选择与尺寸计算 ----------
    # 输入: fonts (字体路径字典) 或全局 FONTS, width/height
    # 输出: font_main_adjusted, font_sub, font_coords, font_attr (FontProperties 对象)
    # 外部库调用: Matplotlib.font_manager.FontProperties
    # 说明: 字体文件路径优先级为传入的 `fonts`，否则使用已加载的 `FONTS`。
    # 这些 FontProperties 对象将用于后续的 ax.text() 文本渲染。
    # 生成字体属性对象不会直接绘制文本，仅创建参数对象。
    active_fonts = fonts or FONTS
    if active_fonts:
        # font_main is calculated dynamically later based on length
        font_sub = FontProperties(
            fname=active_fonts["light"], size=BASE_SUB * scale_factor
        )
        font_coords = FontProperties(
            fname=active_fonts["regular"], size=BASE_COORDS * scale_factor
        )
        font_attr = FontProperties(
            fname=active_fonts["light"], size=BASE_ATTR * scale_factor
        )
    else:
        # Fallback to system fonts
        font_sub = FontProperties(
            family="monospace", weight="normal", size=BASE_SUB * scale_factor
        )
        font_coords = FontProperties(
            family="monospace", size=BASE_COORDS * scale_factor
        )
        font_attr = FontProperties(family="monospace", size=BASE_ATTR * scale_factor)

    # ----------（步骤）文本格式化：根据脚本类型决定是否加字间距 ----------
    # 输入: display_city (str)
    # 输出: spaced_city (str)（已处理间距与大小写）
    # 外部库调用: 本模块的 is_latin_script()（基于 Unicode 判断）
    # Latin scripts: apply uppercase and letter spacing for aesthetic
    # Non-Latin scripts (CJK, Thai, Arabic, etc.): no spacing, preserve case structure
    if is_latin_script(display_city):
        # Latin script: uppercase with letter spacing (e.g., "P  A  R  I  S")
        spaced_city = "  ".join(list(display_city.upper()))
    else:
        # Non-Latin script: no spacing, no forced uppercase
        # For scripts like Arabic, Thai, Japanese, etc.
        spaced_city = display_city

    # ----------（步骤）字体自适应：根据城市名长度动态缩放主标题字号 ----------
    # 输入: display_city 长度, base font sizes, scale_factor
    # 输出: adjusted_font_size (float) -> 用于 FontProperties
    # We use the already scaled "main" font size as the starting point.
    base_adjusted_main = BASE_MAIN * scale_factor
    city_char_count = len(display_city)

    # Heuristic: If length is > 10, start reducing.
    if city_char_count > 10:
        length_factor = 10 / city_char_count
        adjusted_font_size = max(base_adjusted_main * length_factor, 10 * scale_factor)
    else:
        adjusted_font_size = base_adjusted_main

    if active_fonts:
        font_main_adjusted = FontProperties(
            fname=active_fonts["bold"], size=adjusted_font_size
        )
    else:
        font_main_adjusted = FontProperties(
            family="monospace", weight="bold", size=adjusted_font_size
        )

    # ----------（步骤）文字渲染：将城市名/国家/坐标绘制到底部 ----------
    # 输入: spaced_city, display_country, coords, font_main_adjusted, font_sub, font_coords
    # 输出: 在 ax 上绘制的 Text 对象（副作用）
    # 外部库调用: Matplotlib.Axes.text
    # 注: ax.text 返回 Matplotlib 的 Text 对象，但这里只确认渲染，未显式保存 Text 对象引用。
    ax.text(
        0.5,
        0.14,
        spaced_city,
        transform=ax.transAxes,
        color=THEME["text"],
        ha="center",
        fontproperties=font_main_adjusted,
        zorder=11,
    )

    ax.text(
        0.5,
        0.10,
        display_country.upper(),
        transform=ax.transAxes,
        color=THEME["text"],
        ha="center",
        fontproperties=font_sub,
        zorder=11,
    )

    lat, lon = point
    coords = (
        f"{lat:.4f}° N / {lon:.4f}° E"
        if lat >= 0
        else f"{abs(lat):.4f}° S / {lon:.4f}° E"
    )
    if lon < 0:
        coords = coords.replace("E", "W")

    ax.text(
        0.5,
        0.07,
        coords,
        transform=ax.transAxes,
        color=THEME["text"],
        alpha=0.7,
        ha="center",
        fontproperties=font_coords,
        zorder=11,
    )

    ax.plot(
        [0.4, 0.6],
        [0.125, 0.125],
        transform=ax.transAxes,
        color=THEME["text"],
        linewidth=1 * scale_factor,
        zorder=11,
    )

    # ----------（步骤）署名与版权信息 ----------
    # 输入: FONTS, font size
    # 输出: 在 ax 右下角的署名文本（副作用）
    # 外部库调用: Matplotlib.Axes.text
    if FONTS:
        font_attr = FontProperties(fname=FONTS["light"], size=8)
    else:
        font_attr = FontProperties(family="monospace", size=8)

    ax.text(
        0.98,
        0.02,
        "© OpenStreetMap contributors",
        transform=ax.transAxes,
        color=THEME["text"],
        alpha=0.5,
        ha="right",
        va="bottom",
        fontproperties=font_attr,
        zorder=11,
    )

    # ----------（步骤）导出：将绘制结果保存为文件 ----------
    # 输入: output_file (str), output_format (png/svg/pdf), save_kwargs
    # 输出: 磁盘文件（PNG/SVG/PDF）
    # 外部库调用: Matplotlib.pyplot.savefig
    # 注意: 对 PNG 使用高 DPI (300)；SVG/PDF 为矢量格式
    # 将在保存后关闭 figure 以释放内存
    # 该步骤有文件 I/O 的副作用，可能抛出 OSError
    # 下面进入实际保存流程：
    print(f"Saving to {output_file}...")

    fmt = output_format.lower()
    save_kwargs = dict(
        facecolor=THEME["bg"],
        bbox_inches="tight",
        pad_inches=0.05,
    )

    # DPI matters mainly for raster formats
    if fmt == "png":
        save_kwargs["dpi"] = 300

    plt.savefig(output_file, format=fmt, **save_kwargs)

    plt.close()
    print(f"✓ Done! Poster saved as {output_file}")


def print_examples():
    """
    打印脚本的使用说明和示例命令。
    
    展示常见用法、多个地理位置的示例命令（网格城市、运河城市、径向城市、有机老城、
    沿海城市、河流城市等）、距离指南和可用选项的详细说明。
    """
    print("""
City Map Poster Generator
=========================

Usage:
  python create_map_poster.py --city <city> --country <country> [options]

Examples:
  # Iconic grid patterns
  python create_map_poster.py -c "New York" -C "USA" -t noir -d 12000           # Manhattan grid
  python create_map_poster.py -c "Barcelona" -C "Spain" -t warm_beige -d 8000   # Eixample district grid

  # Waterfront & canals
  python create_map_poster.py -c "Venice" -C "Italy" -t blueprint -d 4000       # Canal network
  python create_map_poster.py -c "Amsterdam" -C "Netherlands" -t ocean -d 6000  # Concentric canals
  python create_map_poster.py -c "Dubai" -C "UAE" -t midnight_blue -d 15000     # Palm & coastline

  # Radial patterns
  python create_map_poster.py -c "Paris" -C "France" -t pastel_dream -d 10000   # Haussmann boulevards
  python create_map_poster.py -c "Moscow" -C "Russia" -t noir -d 12000          # Ring roads

  # Organic old cities
  python create_map_poster.py -c "Tokyo" -C "Japan" -t japanese_ink -d 15000    # Dense organic streets
  python create_map_poster.py -c "Marrakech" -C "Morocco" -t terracotta -d 5000 # Medina maze
  python create_map_poster.py -c "Rome" -C "Italy" -t warm_beige -d 8000        # Ancient street layout

  # Coastal cities
  python create_map_poster.py -c "San Francisco" -C "USA" -t sunset -d 10000    # Peninsula grid
  python create_map_poster.py -c "Sydney" -C "Australia" -t ocean -d 12000      # Harbor city
  python create_map_poster.py -c "Mumbai" -C "India" -t contrast_zones -d 18000 # Coastal peninsula

  # River cities
  python create_map_poster.py -c "London" -C "UK" -t noir -d 15000              # Thames curves
  python create_map_poster.py -c "Budapest" -C "Hungary" -t copper_patina -d 8000  # Danube split

  # List themes
  python create_map_poster.py --list-themes

Options:
  --city, -c        City name (required)
  --country, -C     Country name (required)
  --country-label   Override country text displayed on poster
  --theme, -t       Theme name (default: terracotta)
  --all-themes      Generate posters for all themes
  --distance, -d    Map radius in meters (default: 18000)
  --list-themes     List all available themes

Distance guide:
  4000-6000m   Small/dense cities (Venice, Amsterdam old center)
  8000-12000m  Medium cities, focused downtown (Paris, Barcelona)
  15000-20000m Large metros, full city view (Tokyo, Mumbai)

Available themes can be found in the 'themes/' directory.
Generated posters are saved to 'posters/' directory.
""")


def list_themes():
    """
    列出所有可用的主题及其名称和描述。
    
    扫描 themes/ 目录，加载每个主题的 JSON 文件，提取 "name" 和 "description" 字段，
    以格式化的表格形式打印到控制台。若 themes/ 目录为空或 JSON 解析失败，输出相应提示。
    """
    available_themes = get_available_themes()
    if not available_themes:
        print("No themes found in 'themes/' directory.")
        return

    print("\nAvailable Themes:")
    print("-" * 60)
    for theme_name in available_themes:
        theme_path = os.path.join(THEMES_DIR, f"{theme_name}.json")
        try:
            with open(theme_path, "r") as f:
                theme_data = json.load(f)
                display_name = theme_data.get('name', theme_name)
                description = theme_data.get('description', '')
        except (OSError, json.JSONDecodeError):
            display_name = theme_name
            description = ""
        print(f"  {theme_name}")
        print(f"    {display_name}")
        if description:
            print(f"    {description}")
        print()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Generate beautiful map posters for any city",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python create_map_poster.py --city "New York" --country "USA"
  python create_map_poster.py --city "New York" --country "USA" -l 40.776676 -73.971321 --theme neon_cyberpunk
  python create_map_poster.py --city Tokyo --country Japan --theme midnight_blue
  python create_map_poster.py --city Paris --country France --theme noir --distance 15000
  python create_map_poster.py --list-themes
        """,
    )

    parser.add_argument("--city", "-c", type=str, help="City name")
    parser.add_argument("--country", "-C", type=str, help="Country name")
    parser.add_argument(
        "--latitude",
        "-lat",
        dest="latitude",
        type=str,
        help="Override latitude center point",
    )
    parser.add_argument(
        "--longitude",
        "-long",
        dest="longitude",
        type=str,
        help="Override longitude center point",
    )
    parser.add_argument(
        "--country-label",
        dest="country_label",
        type=str,
        help="Override country text displayed on poster",
    )
    parser.add_argument(
        "--theme",
        "-t",
        type=str,
        default="terracotta",
        help="Theme name (default: terracotta)",
    )
    parser.add_argument(
        "--all-themes",
        "--All-themes",
        dest="all_themes",
        action="store_true",
        help="Generate posters for all themes",
    )
    parser.add_argument(
        "--distance",
        "-d",
        type=int,
        default=18000,
        help="Map radius in meters (default: 18000)",
    )
    parser.add_argument(
        "--width",
        "-W",
        type=float,
        default=12,
        help="Image width in inches (default: 12, max: 20 )",
    )
    parser.add_argument(
        "--height",
        "-H",
        type=float,
        default=16,
        help="Image height in inches (default: 16, max: 20)",
    )
    parser.add_argument(
        "--list-themes", action="store_true", help="List all available themes"
    )
    parser.add_argument(
        "--display-city",
        "-dc",
        type=str,
        help="Custom display name for city (for i18n support)",
    )
    parser.add_argument(
        "--display-country",
        "-dC",
        type=str,
        help="Custom display name for country (for i18n support)",
    )
    parser.add_argument(
        "--font-family",
        type=str,
        help='Google Fonts family name (e.g., "Noto Sans JP", "Open Sans"). If not specified, uses local Roboto fonts.',
    )
    parser.add_argument(
        "--format",
        "-f",
        default="png",
        choices=["png", "svg", "pdf"],
        help="Output format for the poster (default: png)",
    )

    args = parser.parse_args()

    # If no arguments provided, show examples
    if len(sys.argv) == 1:
        print_examples()
        sys.exit(0)

    # List themes if requested
    if args.list_themes:
        list_themes()
        sys.exit(0)

    # Validate required arguments
    if not args.city or not args.country:
        print("Error: --city and --country are required.\n")
        print_examples()
        sys.exit(1)

    # Enforce maximum dimensions
    if args.width > 20:
        print(
            f"⚠ Width {args.width} exceeds the maximum allowed limit of 20. It's enforced as max limit 20."
        )
        args.width = 20.0
    if args.height > 20:
        print(
            f"⚠ Height {args.height} exceeds the maximum allowed limit of 20. It's enforced as max limit 20."
        )
        args.height = 20.0

    available_themes = get_available_themes()
    if not available_themes:
        print("No themes found in 'themes/' directory.")
        sys.exit(1)

    if args.all_themes:
        themes_to_generate = available_themes
    else:
        if args.theme not in available_themes:
            print(f"Error: Theme '{args.theme}' not found.")
            print(f"Available themes: {', '.join(available_themes)}")
            sys.exit(1)
        themes_to_generate = [args.theme]

    print("=" * 50)
    print("City Map Poster Generator")
    print("=" * 50)

    # Load custom fonts if specified
    custom_fonts = None
    if args.font_family:
        custom_fonts = load_fonts(args.font_family)
        if not custom_fonts:
            print(f"⚠ Failed to load '{args.font_family}', falling back to Roboto")

    # Get coordinates and generate poster
    try:
        if args.latitude and args.longitude:
            lat = parse(args.latitude)
            lon = parse(args.longitude)
            coords = [lat, lon]
            print(f"✓ Coordinates: {', '.join([str(i) for i in coords])}")
        else:
            coords = get_coordinates(args.city, args.country)

        for theme_name in themes_to_generate:
            THEME = load_theme(theme_name)
            output_file = generate_output_filename(args.city, theme_name, args.format)
            create_poster(
                args.city,
                args.country,
                coords,
                args.distance,
                output_file,
                args.format,
                args.width,
                args.height,
                country_label=args.country_label,
                display_city=args.display_city,
                display_country=args.display_country,
                fonts=custom_fonts,
            )

        print("\n" + "=" * 50)
        print("✓ Poster generation complete!")
        print("=" * 50)

    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
