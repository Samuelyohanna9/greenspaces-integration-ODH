**Purpose**: Short, actionable rules to help AI coding assistants be productive in this repo.

- **Project type**: client-side web components + Cloudflare Worker vector-tile backend.
- **Primary UI**: `web-component` contains the reusable web components and Vite build.
- **Tile/Backend**: `cloudflare-worker` builds vector tiles, stores chunked data in KV, and implements batched ODH fetch/refresh logic.

**Big Picture Architecture**
- **Web UI (browser)**: `web-component/src/*` exposes `<r3gis-urbangreen*>` components. See `web-component/src/UrbanGreenMap.js` and `web-component/src/UrbanGreenMapGL.js` for two implementations (hybrid Leaflet+MapLibre, and MapLibre-only respectively).
- **Client optimizations**: Spatial indexing and viewport filtering live in `web-component/src/SpatialIndex.js` and `web-component/src/DataOptimizer.js` (uses RBush, Turf, Supercluster). Use these for any performance-sensitive changes.
- **Backend/tile generation**: `cloudflare-worker/index.js` converts ODH API pages into geojson, slices by type, writes chunked keys to KV, and exposes tile endpoints. Key constants (KV prefix, paging, TILE_OPTIONS) are defined near the top of that file—change with care.

**Important data flows & conventions**
- ODH API paging: components call `${apiBase}/v1/UrbanGreen?pagenumber=...&pagesize=...&language=...` (see `endpoint` getters in `UrbanGreenMap*` files).
- Caching: Browser IndexedDB key `UrbanGreenCache` is used by components (`CacheDB` class); Cloudflare stores chunked JSON in KV under `urbangreen:data:v2:<lang>:typeX` as implemented in `cloudflare-worker/index.js`.
- Languages: supported languages are defined in `cloudflare-worker` (`SUPPORTED_LANGS`) and component defaults (`DEFAULT_LANG`).
- Geometry handling: code widely parses WKT strings (functions `extractWktString`, `parseWktPoint`, `parseWktPolygonRings`)—match existing parsing when adding geometry transforms.

**Developer workflows / commands**
- Local web dev (Vite):

  npm install
  npm run dev

  See `web-component/package.json` for `dev`, `build`, `preview` scripts.
- Build for deployment:

  cd web-component
  npm run build

  The built bundle used by `client-site/index.html` is `web-component/dist/r3gis-urbangreen.iife.js` (the HTML includes this generated file).
- Cloudflare Worker: repository contains `cloudflare-worker/wrangler.toml`. Use `wrangler dev` / `wrangler publish` as usual for deploying the worker (the worker code expects a KV binding named `URBANGREEN_KV`).

**Patterns & conventions to follow**
- Small, focused changes: most files are single-component and self-contained—prefer small PRs touching one component and tests/examples in `client-site`.
- Preserve parsing behavior: many utilities assume inconsistent ODH payload shapes; follow existing defensive patterns (e.g., `readItemsEnvelope`, `pickFirstGeo`) when adding parsers.
- Performance-first edits: the code uses viewport+indexing/clustering heavily—measure impact locally (open `client-site/index.html` and interact to profile changes).
- Naming: KV keys use prefix `urbangreen:data:v2`. If changing storage layout, update both `cloudflare-worker/index.js` and any scripts that read those keys.

**Where to look for examples**
- UI usage: [web-component/src/UrbanGreenMap.js](web-component/src/UrbanGreenMap.js)
- MapLibre implementation: [web-component/src/UrbanGreenMapGL.js](web-component/src/UrbanGreenMapGL.js)
- Spatial index: [web-component/src/SpatialIndex.js](web-component/src/SpatialIndex.js)
- Optimizer pipeline: [web-component/src/DataOptimizer.js](web-component/src/DataOptimizer.js)
- Cloudflare backend: [cloudflare-worker/index.js](cloudflare-worker/index.js)
- Local demo / consumer: [client-site/index.html](client-site/index.html)

**Quick guidance for common edits**
- Changing API base URL: set `api-base` attribute on the component or edit `DEFAULT` in components; for backend change `CONFIG.ODH_API_BASE` in `cloudflare-worker/index.js`.
- Adjusting tile options / tolerance: edit `TILE_OPTIONS`/`VECTOR_TILE_OPTIONS` in `cloudflare-worker/index.js` or `web-component/src/UrbanGreenMap.js` respectively.
- Adding a new language: add to `SUPPORTED_LANGS` in `cloudflare-worker/index.js` and ensure translations exist in source data.

**Notes / Caveats**
- There are no unit tests in the repo—use manual smoke tests with `client-site/index.html` and `mock-api/db.json` for quick validation.
- The project relies on browser IndexedDB and fetch; run tests in a real browser environment (Vite preview or `client-site`).

If any section is unclear or you want additional examples (e.g., a sample PR checklist or recommended unit-test targets), tell me which area to expand and I will iterate.
