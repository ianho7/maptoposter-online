import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
// import oxlint from 'vite-plugin-oxlint';

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [paraglideVitePlugin({ project: './project.inlang', outdir: './src/paraglide' }),
  react(),
  // oxlint({ path: 'oxlint.json' }),
  wasm(),
  topLevelAwait(),
  tailwindcss()
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-map': ['maplibre-gl'],
          // 'vendor-radix': [
          //   '@radix-ui/react-dialog',
          //   '@radix-ui/react-select',
          //   '@radix-ui/react-tabs',
          //   '@radix-ui/react-popover',
          //   '@radix-ui/react-progress',
          //   '@radix-ui/react-accordion',
          //   '@radix-ui/react-label',
          //   '@radix-ui/react-slot',
          // ],
          'vendor-ui': ['lucide-react', 'clsx', 'tailwind-merge', 'class-variance-authority', 'cmdk'],
        }
      },
      treeshake: {
        preset: 'recommended'
      }
    },
    sourcemap: false
  }
})
