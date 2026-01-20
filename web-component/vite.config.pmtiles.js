import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false, 
    rollupOptions: {
      input: "src/main-pmtiles.js",
      output: {
        entryFileNames: "r3gis-urbangreen-pmtiles.iife.js",
        format: "iife",
        name: "UrbanGreenMapPMTiles",
        inlineDynamicImports: true,
      }
    },
    minify: false,
    outDir: "dist"
  }
});