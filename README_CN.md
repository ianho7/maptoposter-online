# MapPoster Online

<h1 align="center">
  <img src="public/icon.svg" alt="MapPoster Online" width="120" />
</h1>

<p align="center">
  <strong>把你心里的那座城，变成一眼惊艳的设计</strong>
</p>

<p align="center">
  <a href="README.md">English</a> | 简体中文
</p>

---

## 项目简介

作为 [maptoposter (Python CLI)](https://github.com/originalankur/maptoposter) 的网页版升级方案 —— 无需安装，可直接在浏览器中运行

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white" alt="Tailwind CSS">
  <img src="https://img.shields.io/badge/Bun-1.0-FEF0C9?style=flat-square&logo=bun&logoColor=white" alt="Bun">
  <img src="https://img.shields.io/badge/Rust-WASM-DEA584?style=flat-square&logo=rust&logoColor=white" alt="Rust">
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="License">
</p>

## 画廊

### 亚洲

| 中国 - 北京 | 日本 - 东京 | 韩国 - 首尔 | 中国 - 香港 |
|:---:|:---:|:---:|:---:|
| <img src="docs/assets/compressed/beijing-map-poster.webp" alt="Beijing" width="190" /> | <img src="docs/assets/compressed/tokyo-map-poster.webp" alt="Tokyo" width="190" /> | <img src="docs/assets/compressed/seoul-map-poster.webp" alt="Seoul" width="190" /> | <img src="docs/assets/compressed/hongkong-map-poster.webp" alt="Hong Kong" width="190" /> |

| 新加坡 | 马来西亚 - 吉隆坡 | 泰国 - 曼谷 | 印度 - 新德里 |
|:---:|:---:|:---:|:---:|
| <img src="docs/assets/compressed/singapore-map-poster.webp" alt="Singapore" width="190" /> | <img src="docs/assets/compressed/kuala-lumpur-map-poster.webp" alt="Kuala Lumpur" width="190" /> | <img src="docs/assets/compressed/bangkok-map-poster.webp" alt="Bangkok" width="190" /> | <img src="docs/assets/compressed/new-delhi-map-poster.webp" alt="New Delhi" width="190" /> |

### 欧洲

| 瑞士 - 苏黎世 | 挪威 - 奥斯陆 | 瑞典 - 斯德哥尔摩 | 丹麦 - 哥本哈根 |
|:---:|:---:|:---:|:---:|
| <img src="docs/assets/compressed/z%C3%BCrich-map-poster.webp" alt="Zurich" width="190" /> | <img src="docs/assets/compressed/oslo-map-poster.webp" alt="Oslo" width="190" /> | <img src="docs/assets/compressed/stockholm-map-poster.webp" alt="Stockholm" width="190" /> | <img src="docs/assets/compressed/k%C3%B8benhavn-map-poster.webp" alt="Copenhagen" width="190" /> |

| 奥地利 - 维也纳 | 德国 - 柏林 | 英国 - 伦敦 | 法国 - 巴黎 |
|:---:|:---:|:---:|:---:|
| <img src="docs/assets/compressed/vienna-map-poster.webp" alt="Vienna" width="190" /> | <img src="docs/assets/compressed/berlin-map-poster.webp" alt="Berlin" width="190" /> | <img src="docs/assets/compressed/london-map-poster.webp" alt="London" width="190" /> | <img src="docs/assets/compressed/paris-map-poster.webp" alt="Paris" width="190" /> |

| 意大利 - 罗马 | 俄罗斯 - 莫斯科 | 土耳其 - 伊斯坦布尔 | 荷兰 - 阿姆斯特丹 |
|:---:|:---:|:---:|:---:|
| <img src="docs/assets/compressed/rome-map-poster.webp" alt="Rome" width="190" /> | <img src="docs/assets/compressed/moscow-map-poster.webp" alt="Moscow" width="190" /> | <img src="docs/assets/compressed/istanbul-map-poster.webp" alt="Istanbul" width="190" /> | <img src="docs/assets/compressed/amsterdam-map-poster.webp" alt="Amsterdam" width="190" /> |

### 美洲、非洲、大洋洲

| 美国 - 纽约 | 加拿大 - 渥太华 | 巴西 - 圣保罗 | 墨西哥 - 墨西哥城 |
|:---:|:---:|:---:|:---:|
| <img src="docs/assets/compressed/new-york-city-map-poster.webp" alt="New York" width="190" /> | <img src="docs/assets/compressed/ottawa-map-poster.webp" alt="Ottawa" width="190" /> | <img src="docs/assets/compressed/brasília-map-poster.webp" alt="Sao Paulo" width="190" /> | <img src="docs/assets/compressed/mexico-city-map-poster.webp" alt="Mexico City" width="190" /> |

| 阿根廷 - 布宜诺斯艾利斯 | 澳大利亚 - 墨尔本 | 南非 - 开普敦 | 智利 - 圣地亚哥 |
|:---:|:---:|:---:|:---:|
| <img src="docs/assets/compressed/buenos-aires-map-poster.webp" alt="Buenos Aires" width="190" /> | <img src="docs/assets/compressed/melbourne-map-poster.webp" alt="Melbourne" width="190" /> | <img src="docs/assets/compressed/cape-town-map-poster.webp" alt="Cape Town" width="190" /> | <img src="docs/assets/compressed/santiago-map-poster.webp" alt="Santiago" width="190" /> |

## 功能特点

- 🚀 **零安装** — 完全在浏览器中运行，打开网站，选择城市，即可下载海报
- ⚡ **Rust/WASM 渲染引擎** — 高性能地图渲染，由 Rust 编译为 WebAssembly（由 [tiny-skia](https://github.com/RazrFalcon/tiny-skia) 驱动）
- 👁️ **实时预览** — 调整参数后可立即查看效果，导出前即可确认
- 🎨 **20 种内置主题** — 从酷寒北欧到赛博朋克霓虹，从复古航海到故障紫
- ✏️ **自定义颜色控制** — 可精细调整所有颜色：背景、道路、水体、绿地、兴趣点及文字
- 📐 **多种导出格式** — 支持 A4（竖版/横版）、方形、手机壁纸、桌面 16:9，300 DPI 高质量印刷输出
- 🌐 **多语言界面** — 支持英语、日语、韩语、简体中文、德语、西班牙语和法语
- 💾 **IndexedDB 缓存** — 之前获取的地图数据会缓存在本地，加快重新生成速度
- 🔤 **动态字体加载** — 使用内置衬线字体或上传你自己的 TTF/OTF 文件
- 🐍 **贪吃蛇游戏** — 消除你等待图片生成时的无聊（受 [Chrome Dinosaur Game](https://en.wikipedia.org/wiki/Dinosaur_Game) 启发）

## 与 maptoposter (Python CLI) 的区别

本项目诞生于 maptoposter (Python CLI) 的创意启发，两者各有特色，适合不同的使用场景：

| | maptoposter-online | maptoposter (Python CLI) |
|---------|-------------------|--------------------------|
| **使用方式** | 浏览器直接打开，无需安装 | 命令行界面，需本机部署 |
| **适合人群** | 追求快速上手、随手即用 | 熟悉命令行、喜欢本地定制的用户 |
| **渲染引擎** | Rust/WASM (tiny-skia) | Python/matplotlib |
| **平台** | 跨平台浏览器访问 | 桌面端（需 Python 环境） |

两者采用不同的技术栈，核心目标一致 —— 让你将喜欢的城市变成独特的艺术地图。

## 本地开发

### 技术栈

- **构建** — Vite 7 + Bun
- **前端** — React 19 + TypeScript
- **样式** — Tailwind CSS v4
- **UI 组件** — Radix UI + lucide-react
- **地图数据** — OpenStreetMap（Overpass API）+ Protomaps
- **渲染** — Rust (wasm-pack) + tiny-skia
- **国际化** — @inlang/paraglide-js
- **缓存** — IndexedDB (idb)

### 环境要求

- [Bun](https://bun.sh/)（推荐）或 Node.js 22+
- [Rust](https://www.rust-lang.org/)（用于构建 WASM）
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)

### 安装步骤

```bash
# 1. 安装依赖
bun install

# 2. 构建 Rust/WASM 渲染引擎
# 使用 wasm-pack 将 Rust 代码编译为 WebAssembly
cd wasm && wasm-pack build --target web --out-dir ../src/pkg
# 或使用 npm 脚本：
bun run build:wasm

# 3. 启动开发服务器
bun run dev

# 4. 应用将在 `http://localhost:5173` 可用
```

### 可用命令

| 命令 | 说明 |
|---------|-------------|
| `bun run dev` | 启动开发服务器 |
| `bun run build` | 构建生产版本 |
| `bun run build:wasm` | 重新构建 WASM 引擎 |
| `bun run preview` | 预览生产构建 |
| `bun run lint` | 运行代码检查 |
| `bun run fix` | 格式化 + 检查修复 |

## 工程备忘

### 渲染引擎 — Rust/WASM

- **渲染字锯齿** — 2× 超采样 + Box Filter 下采样
- **道路缺乏层次感** — Road Casing 双遍渲染（描边 → 填充）+ Z-order 按路网等级控制绘制顺序
- **渲染计算量过大速度慢** — 屏幕坐标空间 Douglas-Peucker 剔除亚像素冗余点；单次扫描按类型分发到对应

### 数据处理

- **移植 Python OSMnx 运行机制** — 来自 [osmnx](https://github.com/gboeing/osmnx) 的专业地理空间数据处理逻辑
- **Overpass 查询失败** — 面积超标时自动切割为小分块（默认 2500km² 上限），避免 Overpass 查询失败
- **单节点超时导致等待过长** — 并发请求 4 个镜像节点，取最快响应

### 页面响应

- **生成过程阻塞页面** — 数据获取、投影变换、WASM 渲染全部在 Web Worker 中执行，大半径时自动降低道路精度
- **重复生成耗时** — IndexedDB Gzip 压缩缓存，单城市约 100KB，再次生成直接读取

## 许可证

MIT 许可证 —— 详见 [LICENSE](LICENSE)

## 💖 赞助支持

如果您觉得这个工具为您节省了时间，欢迎请我喝杯咖啡。您的支持是项目持续更新的动力！

| 支付平台 | 支付方式 | 链接 |
| :--- | :--- | :--- |
| **爱发电 (Afdian)** | 微信 / 支付宝 | [👉 点击前往赞助](https://afdian.com/a/ianho7) |
| **Buy Me a Coffee** | 国际信用卡 / Apple Pay | [👉 点击前往赞助](https://www.buymeacoffee.com/ianho7) |

## 致谢

灵感来源于 [@originalankur](https://github.com/originalankur) 的 [maptoposter](https://github.com/originalankur/maptoposter)

地图数据由 [OpenStreetMap](https://www.openstreetmap.org/) 和 [Protomaps](https://protomaps.com/) 提供
