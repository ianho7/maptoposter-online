# Repository Guidelines

## Project Structure & Module Organization

The React application lives in `src/`: feature components in `src/components/`, reusable hooks in `src/hooks/`, API and data access in `src/services/`, and shared types/utilities in `src/lib/`. `src/worker.ts` and `src/data-worker.ts` handle browser-worker work; `wasm/` contains the Rust renderer and `src/pkg/` is generated output. Localized source messages are in `messages/`; generated Paraglide output must not be edited. Static fonts and icons belong in `public/` or `src/assets/`.

Read `FILETREE.md` before deciding where a change belongs. Update it when adding, renaming, or materially repurposing files.

## Build, Test, and Development Commands

- `bun run dev` — start Vite locally.
- `bun run build` — compile Paraglide, type-check, and create `dist/`.
- `bun run build:wasm` — rebuild the Rust/WASM package after changes under `wasm/`.
- `bun run lint` / `bun run format:check` — run Oxlint / Oxfmt checks.
- `bun test src/services/location-resolution.test.ts` — run a focused Bun test; use the matching `*.test.ts` file for the area changed.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\record-cold-start.ps1 -Runs 3 -Summary` — collect production cold-start metrics after starting `bun run preview`.

## Coding Style & Naming Conventions

Use TypeScript, two-space indentation, double quotes, and the existing Oxfmt output. Name React components in `PascalCase`; hooks begin with `use`; services and utility files use `kebab-case`. Import application modules through `@/`. Compose Tailwind classes with `cn()` from `@/lib/utils`, and use the Radix wrappers in `src/components/ui/` before adding new primitives.

## Testing Guidelines

Keep tests beside the relevant domain as `*.test.ts`. Test public behavior, not implementation details. Mock WASM initialization, Worker APIs, and IndexedDB boundaries; avoid loading real WASM in unit tests. Run the focused test plus `bun run build` before handing off changes. Browser performance checks use a fresh Chrome profile; treat external map and geolocation traffic as non-hermetic.

## Commit & Pull Request Guidelines

Use Conventional Commit-style subjects seen in history: `feat(poi): ...`, `fix(map): ...`, or `perf: ...`. Keep commits scoped and imperative. PRs should explain user-visible behavior, validation commands, linked issues, and screenshots for UI/map rendering changes. Call out data-source, WASM, worker-protocol, or i18n changes explicitly.

## Security & Configuration

Never commit API keys or `.env` contents. Keep custom POI provider keys user-supplied, and document any new external endpoint or required environment variable.
