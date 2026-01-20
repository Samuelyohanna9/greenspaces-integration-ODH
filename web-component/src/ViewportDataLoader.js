
import {
  chooseSpatialStrategy,
  buildAPIUrl,
  getTileKey,
  getOptimalPageSize,
  getGeometryStrategy,
  getLayersForZoom,
  getMaxPagesForZoom
} from './SpatialQueryUtils.js';

import { TileCache } from './TileCache.js';

const RETRY_DELAY = 1000;
const MAX_RETRIES = 2;

export class ViewportDataLoader {
  constructor(apiBase, lang = 'en') {
    this.apiBase = apiBase;
    this.lang = lang;
    this.endpoint = `${apiBase}/v1/UrbanGreen`;

    this.cache = new TileCache();

    // tileKey -> Promise<Array<Feature>>
    this.activeRequests = new Map();

    // Shared controller for the current "viewport load"
    this.viewportAbortController = null;
  }

  /**
   * Abort all in-flight requests for the current viewport
   */
  abortAll() {
    if (this.viewportAbortController) {
      this.viewportAbortController.abort();
      this.viewportAbortController = null;
    }
  }

  /**
   * Backwards compat alias
   */
  abort() {
    this.abortAll();
  }

  /**
   * Load data for current viewport using MULTI-LAYER SEMANTIC QUERYING
   *
   * @param {LngLatBounds} bounds
   * @param {number} zoom
   * @param {string|null} userSelectedType
   * @param {Object} options
   * @returns {Promise<Array>} GeoJSON features
   */
  async loadViewportData(bounds, zoom, userSelectedType = null, options = {}) {
    const startTime = performance.now();

    this.abortAll();
    this.viewportAbortController = new AbortController();
    const signal = this.viewportAbortController.signal;

    const layersToQuery = getLayersForZoom(zoom, userSelectedType);
    console.log(
      `🎯 Loading ${layersToQuery.length} layer(s) at zoom ${zoom.toFixed(1)}: [${layersToQuery.join(', ')}]`
    );

    const layerPromises = layersToQuery.map(async (layerType) => {
      const tileKey = getTileKey(bounds, zoom, layerType);

      // 1) CACHE (TileCache.get returns Array<Feature> | null)
      const cachedFeatures = await this.cache.get(tileKey);
      if (Array.isArray(cachedFeatures)) {
        console.log(`Cache hit: ${tileKey} (${cachedFeatures.length} features)`);
        return cachedFeatures;
      }

      // 2) De-dupe in-flight tile requests
      if (this.activeRequests.has(tileKey)) {
        return this.activeRequests.get(tileKey);
      }

      // 3) Fetch
      const requestPromise = this._fetchSingleLayer(bounds, zoom, layerType, options, signal)
        .then((features) => {
          // If aborted, don't cache partials
          if (signal.aborted) return [];

          const safeFeatures = Array.isArray(features) ? features : [];

          // Cache result
          this.cache.set(tileKey, safeFeatures, {
            bounds: {
              west: bounds.getWest(),
              south: bounds.getSouth(),
              east: bounds.getEast(),
              north: bounds.getNorth()
            },
            zoom,
            greenCodeType: layerType
          });

          return safeFeatures;
        })
        .catch((err) => {
          if (err?.name === 'AbortError') return [];
          console.error(`Failed tile ${tileKey}:`, err);
          return [];
        })
        .finally(() => {
          this.activeRequests.delete(tileKey);
        });

      this.activeRequests.set(tileKey, requestPromise);
      return requestPromise;
    });

    // Guard: one layer returning non-array must not crash
    const layerResults = await Promise.all(layerPromises);
    const allFeatures = layerResults.filter(Array.isArray).flat();

    const elapsed = (performance.now() - startTime).toFixed(0);
    console.log(
      `✓ Loaded viewport: ${allFeatures.length} features in ${elapsed}ms (${layersToQuery.length} layers)`
    );

    return allFeatures;
  }

  async _fetchSingleLayer(bounds, zoom, greenCodeType, options, signal) {
    const strategy = chooseSpatialStrategy(greenCodeType, zoom, bounds);
    console.log(`Layer ${greenCodeType}: ${strategy.type} query`);

    const maxPages = getMaxPagesForZoom(zoom);
    return this._fetchViewportData(bounds, zoom, greenCodeType, options, maxPages, signal, strategy);
  }

  async _fetchViewportData(bounds, zoom, greenCodeType, options, maxPages, signal, strategy) {
    const pagesize = options.pagesize || getOptimalPageSize(zoom);

    const allFeatures = [];
    let pageNumber = 1;
    let hasMore = true;

    try {
      while (hasMore && pageNumber <= maxPages) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

        const url = buildAPIUrl(this.endpoint, strategy.params, {
          language: this.lang,
          pagesize,
          pagenumber: pageNumber,
          greenCodeType,
          ...options
        });

        console.log(`Layer ${greenCodeType} page ${pageNumber}...`);

        const pageData = await this._fetchPageWithRetry(url, signal, pageNumber);

        if (!pageData.success) {
          console.warn(`Layer ${greenCodeType} page ${pageNumber} failed, stopping pagination`);
          break;
        }

        const items = Array.isArray(pageData.items) ? pageData.items : [];

        const features = items
          .map((item) => this._itemToFeature(item, zoom))
          .filter(Boolean);

        allFeatures.push(...features);

        
        hasMore = items.length === pagesize;
        if (!hasMore) break;

        pageNumber++;
        await new Promise((r) => setTimeout(r, 50));
      }

      if (pageNumber > maxPages && hasMore) {
        console.warn(
          `⚠️ Hit max pages limit (${maxPages} at zoom ${zoom.toFixed(1)}). Zoom in for complete data.`
        );
      }

      return allFeatures;
    } catch (err) {
      if (err?.name === 'AbortError') return allFeatures;
      throw err;
    }
  }

  async _fetchPageWithRetry(url, signal, pageNumber, retryCount = 0) {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal
      });

      if (!response.ok) {
        if (response.status === 404) return { success: true, items: [] };

        if (response.status === 500 && retryCount < MAX_RETRIES) {
          const delay = RETRY_DELAY * Math.pow(2, retryCount);
          console.warn(`Page ${pageNumber} error 500, retrying in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
          return this._fetchPageWithRetry(url, signal, pageNumber, retryCount + 1);
        }

        throw new Error(`HTTP ${response.status}`);
      }

      const json = await response.json();
      const items = this._extractItems(json);
      return { success: true, items };
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      console.error(`Page ${pageNumber} fetch failed:`, err?.message || err);
      return { success: false, items: [] };
    }
  }

  _extractItems(json) {
    if (Array.isArray(json)) return json;
    return json?.Items ?? json?.items ?? [];
  }

  _itemToFeature(item, zoom) {
    const geoStrategy = getGeometryStrategy(zoom);

    const geometry = this._extractGeometry(item, geoStrategy);
    if (!geometry) return null;

    const properties = this._extractProperties(item, zoom);

    return { type: 'Feature', geometry, properties };
  }

  _extractGeometry(item, strategy) {
    const geoObj = item?.Geo;
    if (!geoObj) return null;

    const geoArray = Array.isArray(geoObj) ? geoObj : Object.values(geoObj);
    if (!geoArray.length) return null;

    const geo = geoArray.find((g) => g && g.Default === true) || geoArray[0];
    if (!geo) return null;

    const wktRaw = geo.Geometry ?? geo.geometry ?? null;

    if (wktRaw) {
      const geometry = this._parseWKT(wktRaw, strategy);
      if (geometry) return geometry;
    }

    const lat = this._toNumber(geo.Latitude ?? item.Latitude);
    const lng = this._toNumber(geo.Longitude ?? item.Longitude);

    if (lat !== null && lng !== null) {
      return { type: 'Point', coordinates: this._reduceCoordinatePrecision([lng, lat]) };
    }

    return null;
  }

  _parseWKT(wktString, strategy) {
    const cleaned = String(wktString).replace(/;SRID=\d+\s*$/i, '').trim();

    // POINT
    const pointMatch = cleaned.match(/POINT\s*\(\s*([-\d.,]+)\s+([-\d.,]+)\s*\)/i);
    if (pointMatch) {
      const lng = this._toNumber(pointMatch[1]);
      const lat = this._toNumber(pointMatch[2]);
      if (lng !== null && lat !== null) {
        return { type: 'Point', coordinates: this._reduceCoordinatePrecision([lng, lat]) };
      }
    }

    // LINESTRING
    const lineMatch = cleaned.match(/LINESTRING\s*\(\s*(.+)\s*\)\s*$/i);
    if (lineMatch && strategy.includeFullGeometry) {
      const coords = this._parseCoordList(lineMatch[1]);
      if (coords && coords.length >= 2) {
        const reduced = this._reduceCoordinatePrecision(coords);
        return { type: 'LineString', coordinates: reduced };
      }
    }

    // POLYGON 
    const polyMatch = cleaned.match(/POLYGON\s*\(\s*\((.+)\)\s*\)\s*$/i);

    if (polyMatch && strategy.includeFullGeometry) {
      const coords = this._parseCoordList(polyMatch[1]);
      if (coords && coords.length >= 3) {
        const simplified = this._simplifyPolygon([coords], strategy.simplificationTolerance);
        const reduced = this._reduceCoordinatePrecision(simplified);
        return { type: 'Polygon', coordinates: reduced };
      }
    }

    // Low zoom: centroid
    if (polyMatch && !strategy.includeFullGeometry) {
      const coords = this._parseCoordList(polyMatch[1]);
      if (coords && coords.length >= 3) {
        const centroid = this._calculateCentroid(coords);
        return { type: 'Point', coordinates: this._reduceCoordinatePrecision(centroid) };
      }
    }

    return null;
  }

  _parseCoordList(str) {
    const parts = String(str).trim().split(',').map((p) => p.trim()).filter(Boolean);
    const coords = [];

    for (const part of parts) {
      const [lngStr, latStr] = part.split(/\s+/);
      const lng = this._toNumber(lngStr);
      const lat = this._toNumber(latStr);
      if (lng !== null && lat !== null) coords.push([lng, lat]);
    }

    return coords.length ? coords : null;
  }

  _simplifyPolygon(rings, tolerance) {
    return rings.map((ring) => {
      if (ring.length < 4) return ring;
      return this._douglasPeucker(ring, tolerance);
    });
  }

  _douglasPeucker(points, tolerance) {
    if (points.length <= 2) return points;

    let maxDistance = 0;
    let maxIndex = 0;
    const first = points[0];
    const last = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
      const distance = this._perpendicularDistance(points[i], first, last);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }

    if (maxDistance > tolerance) {
      const left = this._douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
      const right = this._douglasPeucker(points.slice(maxIndex), tolerance);
      return left.slice(0, -1).concat(right);
    }

    return [first, last];
  }

  _perpendicularDistance(point, lineStart, lineEnd) {
    const [x, y] = point;
    const [x1, y1] = lineStart;
    const [x2, y2] = lineEnd;

    const dx = x2 - x1;
    const dy = y2 - y1;

    if (dx === 0 && dy === 0) return Math.sqrt((x - x1) ** 2 + (y - y1) ** 2);

    const numerator = Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1);
    const denominator = Math.sqrt(dx * dx + dy * dy);

    return numerator / denominator;
  }

  _calculateCentroid(coords) {
    const x = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
    const y = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
    return [x, y];
  }

  _reduceCoordinatePrecision(coords, decimals = 6) {
    const factor = Math.pow(10, decimals);

    if (typeof coords[0] === 'number') {
      return coords.map((c) => Math.round(c * factor) / factor);
    }
    return coords.map((c) => this._reduceCoordinatePrecision(c, decimals));
  }

  _extractProperties(item, zoom) {
    
    const baseProps = {
      id: item.Id,
      greenCodeType: String(item.GreenCodeType || ''),
      greenCodeSubtype: String(item.GreenCodeSubtype || ''),
      greenCode: item.GreenCode || 'N/A',
      isActive: item.Active || false
    };

    if (zoom < 12) return baseProps;

    if (zoom < 15) {
      return {
        ...baseProps,
        title: this._getLocalizedTitle(item)
      };
    }

    return {
      ...baseProps,
      title: this._getLocalizedTitle(item),
      active: item.Active ? 'Yes' : 'No',
      shortname: item.Shortname || ''
    };
  }

  _getLocalizedTitle(item) {
    const detail = item?.Detail;
    if (!detail || typeof detail !== 'object') return item?.Shortname || item?.Id || 'Unknown';

    if (detail[this.lang]?.Title) return detail[this.lang].Title;
    if (detail.en?.Title) return detail.en.Title;

    for (const v of Object.values(detail)) {
      if (v?.Title) return v.Title;
    }

    return item?.Shortname || item?.Id || 'Unknown';
  }

  _toNumber(v) {
    if (v === null || v === undefined) return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  async clearCache() {
    await this.cache.clear();
  }

  async getCacheStats() {
    return this.cache.getStats();
  }
}