import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/main.js",
      name: "R3GISUrbanGreen",
      fileName: () => "r3gis-urbangreen.iife.js",
      formats: ["iife"]
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
});
