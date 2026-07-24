# MapPoster Online

<h1 align="center">
  <img src="public/icon.svg" alt="MapPoster Online" width="120" />
</h1>

<p align="center">
  <strong>Turn the cities you love into stunning designs</strong>
</p>

<p align="center">
  English | <a href="README_CN.md">简体中文</a>
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
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="License">
</p>

## Gallery

### Asia

| China - Beijing | Japan - Tokyo | South Korea - Seoul | China - Hong Kong |
|:---:|:---:|:---:|:---:|
| <img src="docs/assets/compressed/beijing-map-poster.webp" alt="Beijing" width="190" /> | <img src="docs/assets/compressed/tokyo-map-poster.webp" alt="Tokyo" width="190" /> | <img src="docs/assets/compressed/seoul-map-poster.webp" alt="Seoul" width="190" /> | <img src="docs/assets/compressed/hongkong-map-poster.webp" alt="Hong Kong" width="190" /> |

| Singapore | Malaysia - Kuala Lumpur | Thailand - Bangkok | India - New Delhi |
|:---:|:---:|:---:|:---:|
| <img src="docs/assets/compressed/singapore-map-poster.webp" alt="Singapore" width="190" /> | <img src="docs/assets/compressed/kuala-lumpur-map-poster.webp" alt="Kuala Lumpur" width="190" /> | <img src="docs/assets/compressed/bangkok-map-poster.webp" alt="Bangkok" width="190" /> | <img src="docs/assets/compressed/new-delhi-map-poster.webp" alt="New Delhi" width="190" /> |

### Europe

| Switzerland - Zurich | Norway - Oslo | Sweden - Stockholm | Denmark - Copenhagen |
|:---:|:---:|:---:|:---:|
| <img src="docs/assets/compressed/z%C3%BCrich-map-poster.webp" alt="Zurich" width="190" /> | <img src="docs/assets/compressed/oslo-map-poster.webp" alt="Oslo" width="190" /> | <img src="docs/assets/compressed/stockholm-map-poster.webp" alt="Stockholm" width="190" /> | <img src="docs/assets/compressed/k%C3%B8benhavn-map-poster.webp" alt="Copenhagen" width="190" /> |

| Austria - Vienna | Germany - Berlin | United Kingdom - London | France - Paris |
|:---:|:---:|:---:|:---:|
| <img src="docs/assets/compressed/vienna-map-poster.webp" alt="Vienna" width="190" /> | <img src="docs/assets/compressed/berlin-map-poster.webp" alt="Berlin" width="190" /> | <img src="docs/assets/compressed/london-map-poster.webp" alt="London" width="190" /> | <img src="docs/assets/compressed/paris-map-poster.webp" alt="Paris" width="190" /> |

| Italy - Rome | Russia - Moscow | Turkey - Istanbul | Netherlands - Amsterdam |
|:---:|:---:|:---:|:---:|
| <img src="docs/assets/compressed/rome-map-poster.webp" alt="Rome" width="190" /> | <img src="docs/assets/compressed/moscow-map-poster.webp" alt="Moscow" width="190" /> | <img src="docs/assets/compressed/istanbul-map-poster.webp" alt="Istanbul" width="190" /> | <img src="docs/assets/compressed/amsterdam-map-poster.webp" alt="Amsterdam" width="190" /> |

### Americas, Africa & Oceania

| USA - New York | Canada - Ottawa | Brazil - São Paulo | Mexico - Mexico City |
|:---:|:---:|:---:|:---:|
| <img src="docs/assets/compressed/new-york-city-map-poster.webp" alt="New York" width="190" /> | <img src="docs/assets/compressed/ottawa-map-poster.webp" alt="Ottawa" width="190" /> | <img src="docs/assets/compressed/brasília-map-poster.webp" alt="Sao Paulo" width="190" /> | <img src="docs/assets/compressed/mexico-city-map-poster.webp" alt="Mexico City" width="190" /> |

| Argentina - Buenos Aires | Australia - Melbourne | South Africa - Cape Town | Chile - Santiago |
|:---:|:---:|:---:|:---:|
| <img src="docs/assets/compressed/buenos-aires-map-poster.webp" alt="Buenos Aires" width="190" /> | <img src="docs/assets/compressed/melbourne-map-poster.webp" alt="Melbourne" width="190" /> | <img src="docs/assets/compressed/cape-town-map-poster.webp" alt="Cape Town" width="190" /> | <img src="docs/assets/compressed/santiago-map-poster.webp" alt="Santiago" width="190" /> |

## Features

- 🚀 **Zero installation** — Runs entirely in the browser. Open the site, pick a city, and download your poster
- ⚡ **Rust/WASM rendering engine** — High-performance map rendering compiled from Rust to WebAssembly (powered by [tiny-skia](https://github.com/RazrFalcon/tiny-skia))
- 👁️ **Live preview** — See changes instantly and confirm results before exporting
- 🎨 **20 built-in themes** — From frozen Nordic minimalism to cyberpunk neon, vintage nautical to glitch purple
- ✏️ **Custom color controls** — Fine-tune every color: background, roads, water, green spaces, POIs, and text
- 📍 **Custom POI pushpins** — Search places with Amap, save your own POIs, and render them on the exported poster
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

### Custom POI Setup

The custom POI dialog calls the Amap place-search API directly from the browser.

1. Apply for your own Amap Web Service API key at the Amap Open Platform.
2. Open the `Pushpin` section in the app, paste the key, test it, then start searching.

Notes:

- Users must provide their own Amap key. Free-tier limits are managed by Amap.

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

## 💖 Support

If this project has saved you time or made your life easier, consider buying me a coffee. Your support is the driving force behind the continued maintenance of this project!

| Platform | Payment Method | Link |
| :--- | :--- | :--- |
| **Afdian** | WeChat / Alipay | [👉 Click to Sponsor](https://afdian.com/a/ianho7) |
| **Buy Me a Coffee** | Credit Card / Apple Pay / Google Pay | [👉 Click to Sponsor](https://www.buymeacoffee.com/ianho7) |

## Acknowledgments

Inspired by [@originalankur](https://github.com/originalankur)'s [maptoposter](https://github.com/originalankur/maptoposter)

Map data provided by [OpenStreetMap](https://www.openstreetmap.org/) and [Protomaps](https://protomaps.com/)

Font LXGW Neo ZhiSong (霞鹜新致宋) by [lxgw](https://github.com/lxgw/LxgwNeoZhiSong), licensed under IPA Font License 1.0

## Cold-Start Performance Regression Test

`scripts/record-cold-start.ps1` launches a fresh headless Chrome profile for each run and records cold-start navigation, long-task, and main-thread timing through the Chrome DevTools Protocol.

Requirements: Windows PowerShell 5.1+ and Google Chrome installed at `C:\Program Files\Google\Chrome\Application\chrome.exe` (or pass `-ChromePath`). Build and start the production preview before running the script:

```powershell
bun run build
bun run preview -- --host localhost --port 4173
```

In a second terminal, collect a three-run summary:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\record-cold-start.ps1 -Runs 3 -Summary
```

Use thresholds to turn it into a regression test. The command exits with code `1` when **any** run exceeds a supplied limit:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\record-cold-start.ps1 `
  -Runs 3 -Summary -MaxLoadMs 800 -MaxLongTaskMs 300 -MaxTaskDurationMs 3000
```

`-MaxLoadMs` checks the page `load` event, `-MaxLongTaskMs` checks the largest browser long task, and `-MaxTaskDurationMs` checks Chrome's cumulative main-thread task duration. Set a threshold to `0` (the default) to disable that check. Omit `-Summary` to retain the detailed per-resource JSON record.

This is a browser-level regression test, not a hermetic unit test: map tiles, IP geolocation, and other external requests can vary by network. Use it locally or in scheduled monitoring first; a blocking CI gate should use mocked external endpoints and a calibrated baseline.
