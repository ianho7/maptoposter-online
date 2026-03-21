# MapPoster Online

<h1 align="center">
  <img src="public/icon.svg" alt="MapPoster Online" width="120" />
</h1>

<p align="center">
  <strong>Turn the cities you love into stunning designs</strong>
</p>

<p align="center">
  English | <a href="README-CN.md">简体中文</a>
</p>

---

## Project Description

A browser-based upgrade to [maptoposter (Python CLI)](https://github.com/originalankur/maptoposter) — no installation needed, just open and go

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white" alt="Tailwind CSS">
  <img src="https://img.shields.io/badge/Bun-1.0-FEF0C9?style=flat-square&logo=bun&logoColor=white" alt="Bun">
  <img src="https://img.shields.io/badge/Rust-WASM-DEA584?style=flat-square&logo=rust&logoColor=white" alt="Rust">
  <img src="https://img.shields.io/badge/License-Apache_2.0-blue?style=flat-square" alt="License">
</p>

## Gallery

### Asia

| China - Beijing | Japan - Tokyo | South Korea - Seoul | China - Hong Kong |
|:---:|:---:|:---:|:---:|
| ![Beijing](docs/assets/compressed/beijing-map-poster.webp) | ![Tokyo](docs/assets/compressed/tokyo-map-poster.webp) | ![Seoul](docs/assets/compressed/seoul-map-poster.webp) | ![Hong Kong](docs/assets/compressed/hongkong-map-poster.webp) |

| Singapore | Malaysia - Kuala Lumpur | Thailand - Bangkok | India - New Delhi |
|:---:|:---:|:---:|:---:|
| ![Singapore](docs/assets/compressed/singapore-map-poster.webp) | ![Kuala Lumpur](docs/assets/compressed/kuala-lumpur-map-poster.webp) | ![Bangkok](docs/assets/compressed/bangkok-map-poster.webp) | ![New Delhi](docs/assets/compressed/new-delhi-map-poster.webp) |

### Europe

| Switzerland - Zurich | Norway - Oslo | Sweden - Stockholm | Denmark - Copenhagen |
|:---:|:---:|:---:|:---:|
| ![Zürich](docs/assets/compressed/z%C3%BCrich-map-poster.webp) | ![Oslo](docs/assets/compressed/oslo-map-poster.webp) | ![Stockholm](docs/assets/compressed/stockholm-map-poster.webp) | ![København](docs/assets/compressed/k%C3%B8benhavn-map-poster.webp) |

| Austria - Vienna | Germany - Berlin | United Kingdom - London | France - Paris |
|:---:|:---:|:---:|:---:|
| ![Vienna](docs/assets/compressed/vienna-map-poster.webp) | ![Berlin](docs/assets/compressed/berlin-map-poster.webp) | ![London](docs/assets/compressed/london-map-poster.webp) | ![Paris](docs/assets/compressed/paris-map-poster.webp) |

| Italy - Rome | Russia - Moscow | Turkey - Istanbul | Netherlands - Amsterdam |
|:---:|:---:|:---:|:---:|
| ![Rome](docs/assets/compressed/rome-map-poster.webp) | ![Moscow](docs/assets/compressed/moscow-map-poster.webp) | ![Istanbul](docs/assets/compressed/istanbul-map-poster.webp) | ![Amsterdam](docs/assets/compressed/amsterdam-map-poster.webp) |

### Americas, Africa & Oceania

| USA - New York | Canada - Ottawa | Brazil - São Paulo | Mexico - Mexico City |
|:---:|:---:|:---:|:---:|
| ![New York](docs/assets/compressed/new-york-city-map-poster.webp) | ![Ottawa](docs/assets/compressed/ottawa-map-poster.webp) | ![São Paulo](docs/assets/compressed/brasília-map-poster.webp) | ![Mexico City](docs/assets/compressed/mexico-city-map-poster.webp) |

| Argentina - Buenos Aires | Australia - Melbourne | South Africa - Cape Town | Chile - Santiago |
|:---:|:---:|:---:|:---:|
| ![Buenos Aires](docs/assets/compressed/buenos-aires-map-poster.webp) | ![Melbourne](docs/assets/compressed/melbourne-map-poster.webp) | ![Cape Town](docs/assets/compressed/cape-town-map-poster.webp) | ![Santiago](docs/assets/compressed/santiago-map-poster.webp) |

## Features

- 🚀 **Zero installation** — Runs entirely in the browser. Open the site, pick a city, and download your poster
- ⚡ **Rust/WASM rendering engine** — High-performance map rendering compiled from Rust to WebAssembly (powered by [tiny-skia](https://github.com/RazrFalcon/tiny-skia))
- 👁️ **Live preview** — See changes instantly and confirm results before exporting
- 🎨 **20 built-in themes** — From frozen Nordic minimalism to cyberpunk neon, vintage nautical to glitch purple
- ✏️ **Custom color controls** — Fine-tune every color: background, roads, water, green spaces, POIs, and text
- 📐 **Multiple export formats** — A4 (portrait/landscape), square, phone wallpaper, desktop 16:9, at 300 DPI for high-quality print
- 🌐 **Multi-language interface** — Supports English, Japanese, Korean, Simplified Chinese, German, Spanish, and French
- 💾 **IndexedDB caching** — Previously fetched map data is cached locally for faster regeneration
- 🔤 **Dynamic font loading** — Use built-in serif fonts or upload your own TTF/OTF files
- 🐍 **Snake game** — Beat boredom while waiting for your poster to generate (inspired by [Chrome Dinosaur Game](https://en.wikipedia.org/wiki/Dinosaur_Game))

## How it differs from maptoposter (Python CLI)

This project was inspired by maptoposter (Python CLI) — they each have their own strengths for different use cases:

| | maptoposter-online | maptoposter (Python CLI) |
|---------|-------------------|--------------------------|
| **Usage** | Open in browser, no install needed | Command-line interface, requires local setup |
| **Best for** | Quick start, on-the-go usage | Command-line enthusiasts, advanced local customization |
| **Rendering engine** | Rust/WASM (tiny-skia) | Python/matplotlib |
| **Platform** | Cross-browser, any device | Desktop only (requires Python) |

Different tech stacks, same goal — turning your favorite city into unique art.

## Local Development

### Tech Stack

- **Build** — Vite 7 + Bun
- **Frontend** — React 19 + TypeScript
- **Styling** — Tailwind CSS v4
- **UI components** — Radix UI + lucide-react
- **Map data** — OpenStreetMap (Overpass API) + Protomaps
- **Rendering** — Rust (wasm-pack) + tiny-skia
- **i18n** — @inlang/paraglide-js
- **Caching** — IndexedDB (idb)

### Requirements

- [Bun](https://bun.sh/) (recommended) or Node.js 22+
- [Rust](https://www.rust-lang.org/) (for building WASM)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)

### Setup

```bash
# 1. Install dependencies
bun install

# 2. Build the Rust/WASM rendering engine
# Compile Rust to WebAssembly using wasm-pack
cd wasm && wasm-pack build --target web --out-dir ../src/pkg
# Or use the npm script:
bun run build:wasm

# 3. Start the dev server
bun run dev

# 4. App available at http://localhost:5173
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start dev server |
| `bun run build` | Build for production |
| `bun run build:wasm` | Rebuild WASM engine |
| `bun run preview` | Preview production build |
| `bun run lint` | Run linter |
| `bun run fix` | Format + lint with auto-fix |

## Engineering Notes

### Rendering Engine — Rust/WASM

- **Font anti-aliasing** — 2× supersampling + Box Filter downsampling
- **Road hierarchy lacking depth** — Road casing rendered in two passes (stroke first, then fill) + Z-order controls draw sequence by road class
- **Rendering too slow** — Douglas-Peucker in screen coordinate space removes subpixel redundancy; single-scan dispatch by feature type

### Data Processing

- **Python OSMnx workflow ported** — Professional geospatial data processing logic adapted from [osmnx](https://github.com/gboeing/osmnx)
- **Overpass query failures** — Auto-splits oversized areas into smaller chunks (2500km² default limit) to prevent Overpass failures
- **Single node timeout causing long waits** — Concurrent requests to 4 mirror servers, fastest response wins

### Page Responsiveness

- **Generation blocking the page** — Data fetching, projection transforms, and WASM rendering all run in a Web Worker; road precision auto-reduces at large radii
- **Repeated generation taking too long** — IndexedDB Gzip-compressed cache, ~100KB per city; direct read on regeneration

## License

MIT License — see [LICENSE](LICENSE)

## Acknowledgments

Inspired by [@originalankur](https://github.com/originalankur)'s [maptoposter](https://github.com/originalankur/maptoposter)

Map data provided by [OpenStreetMap](https://www.openstreetmap.org/) and [Protomaps](https://protomaps.com/)
