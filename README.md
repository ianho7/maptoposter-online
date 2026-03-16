<h1 align="center">
  <img src="public/icon.svg" alt="MapPoster Online" width="120" />
</h1>

# MapPoster Online

Turn the cities you love into stunning artistic map posters. A web-based alternative to [maptoposter (Python CLI)](https://github.com/originalankur/maptoposter) — no installation required, runs directly in your browser.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-repo/maptoposter-online)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Gallery

<!-- TODO: Add poster screenshots
     Suggested: docs/screenshots/paris_nordic.png, docs/screenshots/tokyo_cyberpunk.png, docs/screenshots/ny_vintage.png
     Format: <img src="docs/screenshots/xxx.png" width="30%"> -->

Sample outputs (generated with this tool):

| Nordic Frost - Paris | Cyberpunk Neon - Tokyo | Vintage Nautical - NYC |
|---|---|---|
| ![Nordic Frost](https://placehold.co/600x848/F0F4F7/2C3E50?text=Nordic+Frost+-+Paris) | ![Cyberpunk](https://placehold.co/600x848/0D0221/00F2FF?text=Cyberpunk+Neon+-+Tokyo) | ![Vintage](https://placehold.co/600x848/E8DCC4/1B3B5A?text=Vintage+Nautical+-+NYC) |

| Desert Rose - Rome | Matcha Latte - London | Gilded Noir - Shanghai |
|---|---|---|
| ![Desert Rose](https://placehold.co/600x848/F9F1ED/8E5B4A?text=Desert+Rose+-+Rome) | ![Matcha](https://placehold.co/600x848/F1F5E8/3E4C33?text=Matcha+Latte+-+London) | ![Noir](https://placehold.co/600x848/121212/E5C100?text=Gilded+Noir+-+Shanghai) |

---

## Features

- **Zero Installation** — Runs entirely in the browser. Open the website, select a city, and download your poster
- **Rust/WASM Rendering Engine** — High-performance map rendering compiled from Rust to WebAssembly (powered by [tiny-skia](https://github.com/RazrFalcon/tiny-skia))
- **Real-time Preview** — Adjust parameters and see changes instantly before exporting
- **20 Built-in Themes** — From Nordic Frost to Cyberpunk Neon, Vintage Nautical to Glitch Purple
- **Custom Color Control** — Fine-tune every color: background, roads, water, parks, POIs, and text
- **Multiple Export Formats** — Supports A4 (Portrait/Landscape), Square, Phone Wallpaper, and Desktop 16:9
- **Multi-language Interface** — Available in English, Japanese, Korean, Chinese (Simplified), German, Spanish, and French
- **IndexedDB Caching** — Previously fetched map data is cached locally for faster regeneration
- **Dynamic Font Loading** — Use built-in serif fonts or upload your own TTF/OTF files

---

## vs maptoposter (Python CLI)

| Feature | maptoposter-online | maptoposter (Python CLI) |
|---------|-------------------|--------------------------|
| **Usage** | Open in browser | Command-line interface |
| **Installation** | None (zero门槛) | Requires Python + pip |
| **Preview** | Real-time, interactive | Generate then view |
| **Rendering Engine** | Rust/WASM (tiny-skia) | Python/matplotlib |
| **Performance** | Fast (WASM) | Moderate (Python) |
| **Platform** | Cross-browser | Desktop only |
| **Best for** | Beginners, quick results | Developers, CLI enthusiasts |

---

## Try It Online

[//]: # (Replace with your deployed URL - e.g., https://maptoposter.online)
[TODO: Add live demo URL]

Visit [maptoposter.online](https://maptoposter.online) to create your first poster.

---

## Local Development

### Prerequisites

- [Bun](https://bun.sh/) (recommended) or Node.js 18+
- [Rust](https://www.rust-lang.org/) (for building WASM)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)

### Setup

```bash
# 1. Install dependencies
bun install

# 2. Build the Rust/WASM rendering engine
# This compiles Rust code to WebAssembly using wasm-pack
cd wasm && wasm-pack build --target web --out-dir ../src/pkg
# Or use the npm script:
bun run build:wasm

# 3. Start development server
bun run dev
```

The app will be available at `http://localhost:5173`.

### Available Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development server |
| `bun run build` | Build production version |
| `bun run build:wasm` | Rebuild WASM engine |
| `bun run preview` | Preview production build |
| `bun run lint` | Run code linting |
| `bun run fix` | Format + lint fix |

---

## Themes

20 built-in themes with distinctive color palettes:

| Theme | Style |
|-------|-------|
| Nordic Frost | Cool blue-gray tones, Scandinavian minimalism |
| Desert Rose | Warm sandy beige, terracotta accents |
| Cyberpunk Neon | Dark purple background, neon pink/cyan roads |
| Sulfur & Slate | Dark mode with golden highways |
| Vintage Nautical | Sepia tones, maritime-inspired palette |
| Lavender Mist | Soft purple hues, ethereal and calming |
| Carbon Fiber | High-contrast black with red accents |
| Mediterranean Summer | Bright whites with orange/yellow roads |
| Royal Velvet | Deep purple, elegant and luxurious |
| Forest Moss | Dark green/gold, nature-inspired |
| Cotton Candy | Pastel pink/blue, playful aesthetic |
| Brutalist Concrete | Gray monochrome with orange highlights |
| Solarized Dark | Classic terminal-inspired dark theme |
| Matcha Latte | Soft green/beige, Japanese cafe vibes |
| Red Alert | Intense red/black, bold statement |
| Gilded Noir | Dark with gold accents, art deco feel |
| Ocean Abyss | Deep blue, underwater atmosphere |
| Sakura Branch | White background with pink roads |
| Terra Clay | Warm earth tones, Mediterranean feel |
| Glitch Purple | Cyberpunk variant with green/pink |

---

## Internationalization

The interface supports 7 languages:

- English (en)
- Japanese (ja)
- Korean (ko)
- Chinese Simplified (zh-CN)
- German (de)
- Spanish (es)
- French (fr)

Language files are located in `messages/` and compiled using [@inlang/paraglide-js](https://inlang.com/).

---

## Tech Stack

- **Build**: Vite 7 + Bun
- **Frontend**: React 19 + TypeScript
- **Styling**: Tailwind CSS v4
- **UI Components**: Radix UI + lucide-react
- **Map Data**: OpenStreetMap via Overpass API + Protomaps
- **Rendering**: Rust (wasm-pack) + tiny-skia
- **i18n**: @inlang/paraglide-js
- **Cache**: IndexedDB (idb)

---

## Architecture Overview

```
src/
├── components/          # React UI components
│   ├── artistic-map.tsx # Main map rendering component
│   └── ui/              # Radix UI wrappers
├── services/            # Data fetching (Overpass, location)
├── hooks/               # React hooks (fonts, location data)
├── lib/                 # Types, utilities, theme definitions
├── pkg/                 # WASM compiled output (auto-generated)
└── paraglide/          # i18n messages (auto-generated)
```

The rendering pipeline:
1. User selects location → fetches coordinates via Nominatim
2. Overpass API downloads map features (roads, water, parks, POIs)
3. Web Worker processes and transforms GeoJSON data
4. Rust/WASM renders final poster to canvas
5. Export as PNG with 300 DPI metadata

---

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Acknowledgements

Inspired by [maptoposter](https://github.com/originalankur/maptoposter) by [@originalankur](https://github.com/originalankur).

Map data provided by [OpenStreetMap](https://www.openstreetmap.org/) and [Protomaps](https://protomaps.com/).
