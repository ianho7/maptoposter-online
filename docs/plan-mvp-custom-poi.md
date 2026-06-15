# MVP Plan: Custom POI (Pushpin) Feature

## Objective

**Problem**: Users cannot add their own points of interest to the map poster. The existing POI system only renders auto-detected OSM landmarks as generic colored dots.

**Smallest useful outcome**: Users can search for places via the Amap (高德地图) API using their own API key (proxied through Cloudflare Worker), select locations, assign travel-themed type categories, and have those custom POIs rendered on the poster — as an alternative to Overpass auto-POIs, with no quantity limit.

**In scope**:
- New "Pushpin" nav section with a config block and dialog launcher
- Amap API key configuration with test button (calls proxied through CF Worker)
- Amap Place Text Search in a modal dialog
- Scrollable search results with "Add" action per item
- A managed list of added POIs with reordering and type selection
- 15 tourist/travel-themed POI type categories
- Custom POIs rendered as dots on the poster (default circle, SVG-per-type deferred)
- POI source: mutually exclusive choice — Overpass auto OR custom (radio-style toggle)
- Custom POIs: **no render cap** (unlike Overpass POIs which cap at 50)
- Full i18n (en + zh, other languages get key placeholders)
- State + API key persistence in localStorage

**Out of scope**:
- SVG icon rendering per POI type (deferred — user will design SVGs later)
- Non-Amap search providers
- Custom POI preview on the MapLibre interactive map
- Bulk import/export of POI lists
- Editing POI coordinates or name after adding
- POI type custom icons or icon upload
- Rendering both Overpass and custom POIs simultaneously

**Validation signal**: User searches a place on Amap, adds it with a type, selects "Custom" POI mode, generates a poster, and sees dots at the correct locations — no Overpass POIs, no 50-dot cap.

---

## MVP Scope Boundary

### Must Have

| Requirement | MVP Justification |
|---|---|
| New "Pushpin" nav section + config block | Users must discover and access the feature |
| Amap API key input + test button | Required for Amap; test button validates key without full search |
| CF Worker proxy for Amap API calls | Avoids CORS issues with direct browser→Amap |
| Amap Place Text Search in dialog | Core mechanism for finding places |
| Search results list with "Add" button per item | Users select which results to keep |
| Managed POI list (right panel) with reordering | User explicitly requested ordering control |
| POI type dropdown per added item | Type categories for future SVG rendering |
| 15 travel-themed type categories | Tourist memorabilia use case coverage |
| Custom POIs passed through poster generation pipeline | Required for poster output |
| Custom POIs rendered as circles on the poster | Minimum viable rendering; SVG-per-type deferred |
| POI source: radio-style toggle (Overpass / Custom / Off) | User explicitly wants mutual exclusion — one source at a time |
| Custom POI rendering with **no cap** | User explicitly wants no limit — unlike Overpass's 50 cap |
| i18n for all new UI strings (en + zh) | Project standard; user explicitly requested |
| localStorage persistence for API key + POI list + POI mode | Consistent with existing persistence pattern |
| Integration with existing `BinaryRenderConfig` (WASM) | Must not break the existing binary rendering pipeline |

### Must Not Have

| Excluded Item | Reason for Exclusion |
|---|---|
| SVG icon rendering per POI type | User stated SVGs will be designed later; circles are MVP default |
| Simultaneous Overpass + Custom POI rendering | User chose mutual exclusion |
| Support for non-Amap search providers | Single-provider MVP |
| Custom POI visibility on interactive MapLibre preview | Not required for poster generation |
| POI type icon previews in the dialog | Icons don't exist yet |
| Bulk add/remove/edit of POIs | Single-item operations cover MVP |
| POI search by category or area filter | Free-text search is sufficient |
| Custom POI color picker | All POIs use theme's `poi_color` |
| Per-POI type rendering differences | All render as circles for now |

### Deferred Until After MVP

| Deferred Item | Why Deferred | Signal to Reconsider |
|---|---|---|
| SVG icon rendering per POI type in WASM | User needs to design SVGs first | User provides SVG assets |
| Map preview showing custom POI markers | Not blocking poster generation | Users request visual preview |
| Multiple search providers (Baidu, Google) | Amap covers primary use case | Users outside Amap coverage request alternatives |
| POI search with city/location bias | Free-text search returns relevant results | Results too broad/irrelevant |
| Custom POI categories defined by user | 15 predefined categories cover travel | Users request custom categories |
| POI list sharing/export | Not core to single-user flow | Multiple users request it |
| Simultaneous Overpass + Custom POI rendering | User chose mutual exclusion for MVP | Users want combined rendering |

---

## Background and Context

### Existing Architecture

Single-page React 19 + Vite application generating stylized map posters. Map data from OpenStreetMap (Overpass API), processed through Web Workers and a Rust/WASM rendering engine (tiny_skia for PNG, custom SVG renderer for SVG export).

**Current POI data flow**:
1. Overpass API fetches POI data (tourism, historic, building landmarks) → GeoJSON
2. Flattened to `Float64Array` format: `[count, lon1, lat1, lon2, lat2, ...]`
3. Flows through `mapDataService` → `data-worker.ts` → memory/IndexedDB cache
4. In `App.tsx`, `showPois` boolean controls whether POIs are fetched + rendered
5. Config JSON includes `pois: [count, x1, y1, ...]` (lon/lat → WASM projects to screen)
6. WASM `BinaryRenderConfig.pois: Option<Vec<f64>>` receives flat array
7. WASM projects + renders as filled circles (10px radius, **max 50**, spatial grid collision detection)

**Key files**:
| File | Role |
|---|---|
| `src/App.tsx` | All config state, download pipeline, nav sections, persistence |
| `src/components/config-nav.tsx` | Vertical nav sidebar with scroll-spy (`NavSection[]`) |
| `src/components/render-control-settings.tsx` | `showPois` toggle lives here |
| `src/components/ui/dialog.tsx` | Radix UI Dialog wrapper |
| `src/lib/types.ts` | `MapColors`, `MapTheme`, `Location`, `PosterSize` |
| `src/services/map-data.ts` | L1/L2 cache + data fetching; `skipPois` parameter |
| `src/worker.ts` | WASM processing worker |
| `wasm/src/lib.rs` | `BinaryRenderConfig`, `render_map_binary`, POI projection + rendering (lines 343-361) |
| `wasm/src/types.rs` | `POI { x, y }`, `Theme`, `RenderRequest` |
| `wasm/src/renderer.rs` | `MapRenderer::draw_pois_bin_scaled` — circle rendering with collision grid (MAX_POIS = 50) |
| `wasm/src/svg_renderer.rs` | Mirror POI rendering for SVG export |
| `messages/en.json` | i18n source messages (English) |
| `messages/zh.json` | Chinese translations |

### Key constraints

- **POI binary format**: `Float64Array([count, lon1, lat1, ...])`. Custom POIs can't merge into this — they carry metadata (name, type). Must travel via a separate JSON field.
- **Projection**: Overpass POIs projected lon/lat→x/y inside WASM (`lib.rs:343-361`). Custom POIs follow the same path.
- **Overpass render cap**: `MAX_POIS = 50` with spatial grid collision detection. Custom POIs must bypass this cap.
- **Mutual exclusion**: Only one POI source renders per poster — either Overpass (existing) or Custom (new). No combined mode.
- **i18n pattern**: Functions from `@/paraglide/messages`. Keys in `messages/` JSON files.
- **State persistence**: `localStorage` key `maptoposter_config`. Custom POI state joins this.
- **No routing**: Single page, scroll-based navigation via `IntersectionObserver`.

### Assumptions

1. A Cloudflare Worker proxies Amap API calls (`restapi.amap.com`), avoiding browser CORS.
2. Users obtain their own Amap API key (free tier: 5000 calls/day).
3. Custom POI count is reasonable (< 200) — tourist use case. No hard cap, but very large lists (> 500) may have performance implications.
4. The POI source choice is: off / Overpass auto / Custom. Represented as a single enum value, persisted and toggled via radio-style UI.

---

## Current State Analysis

### Existing POI system

- `showPois` boolean controls Overpass POI fetch + render
- `poi_color` from theme colors all POI dots
- Max 50 rendered, 10px radius, spatial grid collision detection
- `BinaryRenderConfig.pois: Option<Vec<f64>>` — flat array, no metadata

### What changes (the `showPois` boolean → `poiSource` enum)

The current `showPois: boolean` becomes a three-state enum:
- `"off"` — no POIs rendered
- `"overpass"` — Overpass auto-POIs (existing behavior, 50 cap)
- `"custom"` — custom POIs only (new, no cap)

When `poiSource === "overpass"`: fetch Overpass POIs, pass via `pois` field, render with 50 cap.
When `poiSource === "custom"`: skip Overpass fetch, pass `custom_pois` field, render all without cap.

### Files that change

| File | Change |
|---|---|
| `App.tsx` | Replace `showPois: boolean` → `poiSource: PoiSource`; add `customPois`, `amapApiKey`; nav; persistence; pipeline |
| `src/lib/types.ts` | Add `PoiSource` type, `POI_TYPE_CATEGORIES`, `CustomPOI` |
| `src/components/custom-poi-settings.tsx` | **New** — config block + dialog trigger |
| `src/components/poi-management-dialog.tsx` | **New** — Radix Dialog, two-panel layout |
| `src/components/render-control-settings.tsx` | Replace `showPois` checkbox → POI source radio/segmented control |
| `wasm/src/types.rs` | Add `CustomPOI` struct |
| `wasm/src/lib.rs` | Add `custom_pois` to `BinaryRenderConfig`; render without cap |
| `wasm/src/renderer.rs` | Add `draw_custom_pois` (no MAX_POIS cap) |
| `wasm/src/svg_renderer.rs` | Mirror for SVG export |
| `messages/*.json` | Add ~35 i18n keys |

---

## MVP Decision Gate

| Question | Assessment |
|---|---|
| Does this solve the user's immediate problem? | Yes — search, add, type, select custom mode, generate, see dots. |
| Can the MVP be validated without any one item? | Core loop validatable. |
| Existing patterns avoid new design? | Yes — Radix Dialog, ConfigNav section, paraglide i18n, localStorage |
| Any speculative future prep? | `poi_type` field preserved in WASM for future SVG — user requested this forward-compatibility |
| New dependencies truly necessary? | No npm packages. CF Worker for proxy (user-authorized). |
| Simplest acceptable implementation? | `custom_pois` JSON in config, circles with no cap, up/down reorder, radio-style POI source |

**Keep**: Nav section, dialog with Amap search (CF-proxied), managed POI list with types, WASM rendering without cap, radio-style POI source toggle, i18n, persistence.

**Remove**: Combined Overpass+Custom rendering, independent toggles, SVG-per-type.

**Defer**: Everything in the deferred list above.

**Simplify**: Radio-style instead of independent checkboxes, no render cap for custom path.

---

## Proposed MVP Solution

### High-level approach

Replace `showPois: boolean` with `poiSource: "off" | "overpass" | "custom"`. When "custom", skip Overpass POI fetch and render `custom_pois` from a new JSON array field in `BinaryRenderConfig`. Each custom POI carries `name`, `lat`, `lon`, `poi_type`. WASM renders all without the 50 cap. Frontend provides a Radix Dialog for Amap search (via CF Worker proxy) and POI list management.

### Decision: POI source — radio-style mutual exclusion

- **Choice**: Three-way radio/segmented control: Off / Overpass / Custom. Mutually exclusive — selecting one deselects others.
- **MVP Justification**: User explicitly wants 二选一. Simpler mental model. Avoids edge cases of combined rendering. One source = one data path in WASM.
- **Why Not More Complex**: Not two independent checkboxes (user rejected). Not a matrix with per-type filtering. Three radio options is the simplest expression of 二选一 + off.
- **State**: `PoiSource = "off" | "overpass" | "custom"` replaces `showPois: boolean`.

### Decision: Custom POI data format

- **Choice**: `{ name: string, lat: number, lon: number, poi_type: string }[]` in config JSON
- **MVP Justification**: Coordinates for rendering + name for future label + type for future SVG. 4 fields. Minimal.
- **Simpler Alternative Considered**: Merge into `pois: Vec<f64>`. Rejected — loses metadata.
- **Why Not More Complex**: Separate binary channel overkill for typical POI counts.

### Decision: No render cap for custom POIs

- **Choice**: WASM renders ALL custom POIs without a `MAX_POIS` limit (still uses collision grid for spatial efficiency, but no count-based early exit).
- **MVP Justification**: User explicitly wants no limit. Custom POIs are deliberate user choices — every one should appear.
- **Simpler Alternative Considered**: Raise cap to 200. Rejected — arbitrary limit contradicts user's intent.
- **Why Not More Complex**: No progressive rendering, no LOD. Just remove the `if rendered_count >= MAX_POIS { break }` early exit for custom POIs.

### Decision: Amap API proxy

- **Choice**: Cloudflare Worker forwards requests to `restapi.amap.com/v3/place/text`.
- **MVP Justification**: Eliminates CORS. Simple passthrough.
- **Why Not More Complex**: No caching, rate-limiting, or transformation.

### Decision: Reordering mechanism

- **Choice**: Up/down arrow buttons (move ±1 position).
- **MVP Justification**: No new dependency. Achieves ordering requirement.
- **Why Not More Complex**: Drag-and-drop adds `@dnd-kit` for equivalent functionality.

### Decision: Dialog vs inline panel

- **Choice**: Radix UI Dialog — two-panel layout needs more horizontal space than the 480px config column.
- **MVP Justification**: Follows existing `Dialog` component pattern. Enough room for search + manage panels.
- **Why Not More Complex**: Not a full-page route or separate tab.

### Expected behavior after implementation

1. ConfigNav shows "Pushpin" → config block with description + "Manage" button
2. Dialog: enter API key → test → search → "+" to add → reorder → set types → "Done"
3. Render control: three-way radio (Off / Overpass / Custom). Select "Custom".
4. Download poster: custom POI dots render (all of them, no cap), Overpass POIs absent

---

## Alternatives Considered

### Alternative A: Extend existing `pois` flat array

- **Description**: Append custom POI lon/lat to the Overpass `Float64Array`
- **Advantages**: Zero WASM changes
- **Disadvantages**: Loses name + type; no mutual exclusion; can't remove cap; blocks future SVG
- **Reason Not Selected**: Fails user's requirements for type categories, mutual exclusion, and no cap

### Alternative B: Two independent toggles

- **Description**: Separate `showPois` + `showCustomPois` checkboxes; both can be on
- **Advantages**: Flexible; could render both sources
- **Disadvantages**: User explicitly wants 二选一 (mutual exclusion)
- **Reason Not Selected**: User feedback rejected this approach

### Alternative C: Inline config panel instead of dialog

- **Description**: Two-panel editor inline in the config column
- **Advantages**: No modal; always visible
- **Disadvantages**: 480px column too narrow for two-panel layout
- **Reason Not Selected**: Dialog provides needed horizontal space

---

## Implementation Plan

### Phase 1: Foundation — Types, i18n, state, nav section, toggle migration

**Goal**: All scaffolding in place. `showPois` migrated to `poiSource`. Nav section visible, empty dialog shell, types and i18n defined.

**Files**:
- `src/lib/types.ts` — Add `PoiSource`, `POI_TYPE_CATEGORIES`, `CustomPOI`
- `messages/en.json` — Add keys
- `messages/zh.json` — Chinese translations
- `messages/ja.json` through `messages/ru.json` — Placeholder keys (copy en)
- `src/App.tsx` — Replace `showPois` → `poiSource`; add `customPois`, `amapApiKey`; persistence; nav; pipeline adapt
- `src/components/render-control-settings.tsx` — Replace checkbox → radio/segmented control
- `src/components/custom-poi-settings.tsx` — **New**: config block
- `src/components/poi-management-dialog.tsx` — **New**: dialog shell

**Tasks**:
1. Define types:
   - `PoiSource = "off" | "overpass" | "custom"`
   - `CustomPOI = { id: string, name: string, lat: number, lng: number, poiType: string }`
   - `POI_TYPE_CATEGORIES`: 15 entries (id, i18n key, future SVG slot)
2. Add ~35 i18n keys: nav label, block description, dialog title, "Manage" button, API key label, test button, search placeholder, add/remove/reorder buttons, type dropdown label, 15 type names, POI source radio labels, status/error messages, "Done" button
3. Migrate `showPois: boolean` → `poiSource: PoiSource` in App.tsx:
   - Update state declaration
   - Update `skipPois` logic: skip when `poiSource !== "overpass"`
   - Update config JSON: pass `pois` only when overpass, pass `custom_pois` only when custom
   - Update localStorage persistence (backward-compat: read old `showPois` → migrate to `poiSource`)
4. Add `customPois: CustomPOI[]`, `amapApiKey: string` state + persistence
5. Update `RenderControlSettings` props: replace `showPois` → `poiSource` + `onPoiSourceChange`
6. Add `section-custom-pois` nav section (lucide `Pin` icon)
7. Create `CustomPOISettings` — description + "Manage" button
8. Create `POIManagementDialog` shell — empty two-panel `DialogContent`
9. Translate all new keys to Chinese; copy en to other 6 languages

**Expected Result**: Three-way POI source radio visible in render control. "Pushpin" in nav. Config block visible. Empty dialog opens/closes. No search or WASM yet.

**MVP Check**:
- **Why necessary**: All subsequent phases depend on types, keys, state, and the migrated toggle.
- **Not included**: Search functionality, WASM changes, actual POI management UI.

---

### Phase 2: WASM — Rust types, config extension, uncapped rendering

**Goal**: Custom POIs can be passed through the binary rendering pipeline, rendered as circles without the 50 cap.

**Files**:
- `wasm/src/types.rs` — Add `CustomPOI` struct
- `wasm/src/lib.rs` — Extend `BinaryRenderConfig`, render custom POIs (PNG + SVG paths)
- `wasm/src/renderer.rs` — Add `draw_custom_pois` method (no MAX_POIS)
- `wasm/src/svg_renderer.rs` — Mirror for SVG export
- `src/App.tsx` — Conditionally pass `custom_pois` in render config

**Tasks**:
1. Add `CustomPOI` struct to `wasm/src/types.rs`:
   ```rust
   #[derive(Debug, Clone, Serialize, Deserialize)]
   pub struct CustomPOI {
       pub name: String,
       pub lat: f64,
       pub lon: f64,
       pub poi_type: String,
   }
   ```
2. Add `custom_pois: Option<Vec<CustomPOI>>` to `BinaryRenderConfig` (with `#[serde(default)]`)
3. In `render_map_binary_internal`: when `poiSource` is custom, skip Overpass POI rendering and call `draw_custom_pois` instead. Custom POIs are projected lon/lat → x/y same as Overpass POIs.
4. Add `draw_custom_pois(&mut self, pois: &[CustomPOI])` to `MapRenderer`:
   - Same circle rendering logic as `draw_pois_bin_scaled`
   - **No `MAX_POIS` early exit** — render all entries
   - Keep collision grid for spatial efficiency but never skip due to count
   - Accept `poi_type` parameter (unused for now, preserved for future SVG dispatch)
5. Mirror in `render_map_binary_svg` + `SvgRenderer`
6. In `App.tsx` download handler: pass `custom_pois` in config JSON when `poiSource === "custom"`
7. Rebuild WASM: `cd wasm && wasm-pack build --target web --out-dir ../src/pkg`

**Expected Result**: Hardcoded `customPois` entries render as circles. All entries appear (no cap). Radio toggling works: "overpass" shows auto POIs, "custom" shows custom POIs, "off" shows none.

**MVP Check**:
- **Why necessary**: Without WASM changes, feature has no output.
- **Not included**: Per-type SVG rendering, per-type color, labels.

---

### Phase 3: UI — POI Management Dialog

**Goal**: Full functional dialog with Amap search (CF-proxied), POI management, reordering, type selection.

**Files**:
- `src/components/poi-management-dialog.tsx` — Full implementation
- `src/components/custom-poi-settings.tsx` — Connect state via props

**Tasks**:

**Left panel (60% width)**:
1. API key section (top):
   - Password-masked input
   - "Test" button → CF Worker → Amap ping to validate
   - Inline success/error feedback (green/red text + icon)
2. Search section (bottom):
   - Input with 300ms debounce
   - Calls CF Worker → `restapi.amap.com/v3/place/text?key=KEY&keywords=...`
   - Scrollable results: name + address per item, "+" button on right
   - States: idle, loading (spinner), results, no-results, error (with message)

**Right panel (40% width)**:
1. Header: "My POIs" + count badge
2. Scrollable list:
   - Each item row: name (truncated), type dropdown, ↑, ↓, X
   - First item ↑ disabled, last item ↓ disabled
   - Remove with confirmation (or instant with undo — MVP: just instant remove)
3. Empty state: hint text pointing to left panel

**Deduplication**: Skip items already in the right panel (match by Amap `id` or name+coord proximity).

**Props**: `customPois`, `setCustomPois`, `amapApiKey`, `setAmapApiKey`, `isOpen`, `onClose`

**States**: API key empty/valid/invalid/testing; search idle/loading/results/empty/error; list empty/populated

**Expected Result**: Full search → add → reorder → type → remove flow. State persisted.

**MVP Check**:
- **Why necessary**: User-facing core of the feature.
- **Not included**: Drag-and-drop, city filter, pagination, map preview, color swatch.

---

### Phase 4: Integration & Polish

**Goal**: End-to-end flow verified. Edge cases handled. i18n complete.

**Files**: All changed files — final wiring and cleanup.

**Tasks**:
1. End-to-end: search → add 5+ POIs → reorder → set types → select "Custom" → download → all 5 dots visible (no cap)
2. POI source toggle: verify all 3 states work correctly (off/overpass/custom)
3. Backward compatibility: old `showPois` in localStorage migrates to `poiSource` without error
4. localStorage: API key, POI list, poiSource survive reload
5. Error sweep: bad API key, CF Worker down, Amap rate limit, network error, empty search
6. i18n: switch to zh, verify all new text translated
7. Dialog hygiene: close/reopen preserves state; "Done" vs "X" both close
8. SVG export: custom POIs in SVG output
9. Overpass POIs still work when `poiSource === "overpass"` (no regression)

**MVP Check**:
- **Why necessary**: Integration verification. Edge cases. Polish.
- **Not included**: Automated tests (project has minimal coverage).

---

## Validation Strategy

### Manual checks

| # | Test | Expected |
|---|---|---|
| 1 | Nav visible | "Pushpin" in sidebar, scroll-spy works |
| 2 | Config block | Description + "Manage" button |
| 3 | Dialog open/close | Opens, closes via X/Done, state preserved |
| 4 | API key test (valid) | Green success |
| 5 | API key test (invalid) | Red error with reason |
| 6 | Search results | Name + address list; loading spinner between |
| 7 | Search empty | "No results" state |
| 8 | Search error | Error message, not crash |
| 9 | Add POI | "+" → appears in right panel |
| 10 | Duplicate prevention | "+" twice → only one entry |
| 11 | Reorder up/down | Arrows move item; first ↑ disabled, last ↓ disabled |
| 12 | Type change | Dropdown updates type |
| 13 | Remove | X removes item |
| 14 | Empty list | "No POIs yet" hint |
| 15 | POI source: off | No POIs on poster |
| 16 | POI source: overpass | Overpass POIs, 50 cap (no regression) |
| 17 | POI source: custom | All custom POIs render (no cap) |
| 18 | 50+ custom POIs | All render (cap verification) |
| 19 | SVG export | Custom POIs in SVG output |
| 20 | Persistence | Reload → API key, POIs, poiSource restored |
| 21 | Backward compat | Old `showPois: true` in localStorage → migrates to `poiSource: "overpass"` |
| 22 | i18n zh | All new text in Chinese |

### Commands

```bash
cd wasm && wasm-pack build --target web --out-dir ../src/pkg
bun run dev
bun run tsc --noEmit
```

### Failure cases

- Invalid API key → error message, not blank screen
- CF Worker down → "search unavailable" message
- Amap rate limit → "too many requests, try later"
- 0 results → empty state, not stuck loading
- Very long POI name → truncation in list
- Old localStorage format → graceful migration

---

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation | Fallback |
|---|---|---|---|---|
| CF Worker cold start | Slow search (1-3s extra) | Low | Loading spinner; reasonable timeout | Direct fetch with JSONP fallback |
| Amap rate limit | Search blocked | Medium | Clear rate-limit error message | User waits or upgrades key |
| WASM build regression | Posters fail | Low | Build + test after Phase 2 | Revert WASM changes |
| Non-en/zh translations missing | Other 6 languages show English | High | Accept en fallback (paraglide default) | Community translations later |
| Dialog too narrow on mobile | Cramped layout | Medium | `max-w-3xl` + responsive stacking | Accept as known limitation |
| Old `showPois` migration edge case | Toggle state wrong after update | Low | Explicit migration in persistence useEffect | User manually re-selects |
| Large custom POI list (> 200) | WASM rendering slower | Low | No cap; accept linear performance | Add spatial optimization if reported |

---

## Over-Engineering Watchlist

- **Do not** add `@dnd-kit` — up/down arrow buttons are sufficient
- **Do not** create a generic "search provider" abstraction — only Amap through CF Worker
- **Do not** build POI preview on MapLibre map — defer
- **Do not** create POI category CRUD — 15 categories are fixed
- **Do not** add separate WASM rendering function — extend `BinaryRenderConfig`
- **Do not** add new worker message types — custom POIs travel via config JSON
- **Do not** build POI import/export — manual search is MVP
- **Do not** add search filters — free text is enough
- **Do not** embed SVG data or icon rasterization in WASM — circles are default
- **Do not** refactor `draw_pois_bin_scaled` — add separate `draw_custom_pois` method
- **Do not** support combined Overpass+Custom rendering — user chose mutual exclusion
- **Do not** add per-POI colors — all use theme's `poi_color`

---

## POI Type Categories

15 categories, travel/tourist commemorative focus:

| ID | English | Chinese | Future Icon |
|---|---|---|---|
| `cafe` | Cafe | 咖啡店 | Coffee cup |
| `restaurant` | Restaurant | 餐厅 | Fork/knife |
| `park` | Park | 公园 | Tree |
| `shopping` | Shopping | 购物中心 | Shopping bag |
| `museum` | Museum | 博物馆 | Museum building |
| `landmark` | Landmark | 地标景点 | Star/monument |
| `hotel` | Hotel | 酒店住宿 | Bed |
| `station` | Station | 车站交通 | Train/bus |
| `beach` | Beach | 海滩 | Umbrella/wave |
| `viewpoint` | Viewpoint | 观景台 | Binoculars |
| `temple` | Temple | 寺庙教堂 | Temple building |
| `night-market` | Night Market | 夜市 | Lantern |
| `library` | Library | 图书馆 | Book |
| `stadium` | Stadium | 体育场馆 | Stadium |
| `other` | Other | 其他 | Dot/circle (default) |

---

## Open Questions

1. **Question**: What is the CF Worker endpoint URL? Dedicated subdomain or path on existing domain?
   - **Why It Matters**: Dialog needs a hardcoded proxy URL constant.
   - **Default MVP Assumption**: A dedicated path (e.g., `/api/amap-proxy/`) on the same domain, forwarding to `restapi.amap.com`. The URL is a constant in the dialog component. If no CF Worker exists yet, created as part of Phase 3.

2. **Question**: Should `poiSource` be persisted as a string enum (`"off" | "overpass" | "custom"`) or as separate boolean flags with migration?
   - **Why It Matters**: Simplicity and backward compatibility with existing `showPois` in users' localStorage.
   - **Default MVP Assumption**: Persist as `poiSource: "off" | "overpass" | "custom"` string. On load, if old `showPois: true` is found and no `poiSource` exists, migrate to `"overpass"`. If `showPois: false`, migrate to `"off"`.

---

## Recommended Next Step

**Begin Phase 1**: Define `PoiSource` type, `POI_TYPE_CATEGORIES`, and `CustomPOI` in `src/lib/types.ts`, then add all i18n keys to `messages/en.json`. These are the foundation all other phases build on.
