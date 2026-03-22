import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from "vite-plugin-wasm";
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import Sitemap from 'vite-plugin-sitemap'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [paraglideVitePlugin({ project: './project.inlang', outdir: './src/paraglide' }),
  react(),
  Sitemap({ hostname: 'http://maptoposter.0v0.one' }),
  // oxlint({ path: 'oxlint.json' }),
  wasm(),
  tailwindcss()
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    // Vite 8: 使用 rolldownOptions + codeSplitting
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'vendor-map', test: /maplibre-gl/ },
            { name: 'vendor-ui', test: /lucide-react|clsx|tailwind-merge|class-variance-authority|cmdk/ },
          ]
        }
      },
      treeshake: true
    },
    sourcemap: false
  }
})
