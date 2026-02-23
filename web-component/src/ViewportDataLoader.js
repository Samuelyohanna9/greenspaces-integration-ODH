
const MAX_RETRIES = 2;
const RETRY_DELAY = 500;
const PAGE_SIZE = 500;
const PARALLEL_PAGES = 5;

const TYPE_CONFIG = {
  '1': { name: 'Vegetation', maxPages: 8, loadAll: false },       // ~4,000 items (lawns, trees, hedges)
  '2': { name: 'Urban Furniture', maxPages: 8, loadAll: false },  // ~4,000 items
  '3': { name: 'Management', maxPages: 8, loadAll: false }        // ~4,000 polygons
};

export class ViewportDataLoader {
  constructor(apiBase, lang = 'en') {
    this.apiBase = apiBase;
    this.lang = lang;
    this.endpoint = `${apiBase}/v1/UrbanGreen`;
    this.abortController = null;
    this.memoryCache = new Map();
  }

  abort() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  abortAll() {
    this.abort();
  }

 
  async loadTypeData(greenCodeType, onProgress = null) {
    // Check memory cache first
    if (this.memoryCache.has(greenCodeType)) {
      const cached = this.memoryCache.get(greenCodeType);
      console.log(`⚡ Memory cache hit: ${cached.length} features`);
      return cached;
    }

    this.abort();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const config = TYPE_CONFIG[greenCodeType] || { maxPages: 5, loadAll: false };
    console.log(`🔄 Loading ${config.name} (type ${greenCodeType})...`);
    const startTime = performance.now();

  
    const firstUrl = this._buildUrl(greenCodeType, 1);
    const firstResult = await this._fetchPage(firstUrl, signal);

    if (!firstResult.success || signal.aborted) {
      return [];
    }

    const totalPages = Math.min(firstResult.totalPages, config.maxPages);
    const allFeatures = this._parseItems(firstResult.items);

    if (onProgress) onProgress(1, totalPages, allFeatures.length);
    console.log(`📄 Page 1/${totalPages}: ${allFeatures.length} features`);

    if (totalPages > 1 && !signal.aborted) {
      const remainingPages = [];
      for (let p = 2; p <= totalPages; p++) {
        remainingPages.push(p);
      }

      // Fetch in parallel batches
      for (let i = 0; i < remainingPages.length; i += PARALLEL_PAGES) {
        if (signal.aborted) break;

        const batch = remainingPages.slice(i, i + PARALLEL_PAGES);
        const batchPromises = batch.map(page =>
          this._fetchPage(this._buildUrl(greenCodeType, page), signal)
        );

        const batchResults = await Promise.all(batchPromises);

        for (const result of batchResults) {
          if (result.success) {
            const features = this._parseItems(result.items);
            allFeatures.push(...features);
          }
        }

        const completedPages = Math.min(i + PARALLEL_PAGES + 1, totalPages);
        if (onProgress) onProgress(completedPages, totalPages, allFeatures.length);
        console.log(` Pages ${batch[0]}-${batch[batch.length-1]}/${totalPages}: ${allFeatures.length} total`);
      }
    }

    const elapsed = (performance.now() - startTime).toFixed(0);
    console.log(` Loaded ${allFeatures.length} features in ${elapsed}ms`);

    // Cache in memory
    if (!signal.aborted && allFeatures.length > 0) {
      this.memoryCache.set(greenCodeType, allFeatures);
    }

    return allFeatures;
  }


  async loadViewportData(bounds, zoom, greenCodeType = null) {
    if (greenCodeType) {
      return this.loadTypeData(greenCodeType);
    }
    return [];
  }

  _buildUrl(greenCodeType, page) {
    const url = new URL(this.endpoint);

    // Include Detail field for accurate feature names from API
    url.searchParams.append('fields', 'Id');
    url.searchParams.append('fields', 'GreenCodeType');
    url.searchParams.append('fields', 'GreenCodeSubtype');
    url.searchParams.append('fields', 'Detail');
    url.searchParams.append('fields', 'Geo');

    // Pagination
    url.searchParams.set('pagesize', PAGE_SIZE);
    url.searchParams.set('pagenumber', page);

    // CORRECT parameter name: greencodetype (not type!)
    url.searchParams.set('greencodetype', greenCodeType);

    // Only active
    url.searchParams.set('active', 'true');
    url.searchParams.set('removenullvalues', 'false');

    return url.toString();
  }

  async _fetchPage(url, signal, retryCount = 0) {
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      return {
        success: true,
        items: json.Items || [],
        totalPages: json.TotalPages || 1,
        totalResults: json.TotalResults || 0
      };
    } catch (err) {
      if (signal.aborted) return { success: false, items: [], totalPages: 0 };
      if (retryCount < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY));
        return this._fetchPage(url, signal, retryCount + 1);
      }
      console.error('Fetch error:', err.message);
      return { success: false, items: [], totalPages: 0 };
    }
  }

  _parseItems(items) {
    return items.map(item => this._toFeature(item)).filter(Boolean);
  }

  _toFeature(item) {
    const geometry = this._parseGeometry(item);
    if (!geometry) return null;

  
    const detail = item.Detail;
    let name = null;
    if (detail) {
  
      if (detail.en?.Title) name = detail.en.Title;
      else if (detail.it?.Title) name = detail.it.Title;
      else if (detail.de?.Title) name = detail.de.Title;
    }

    return {
      type: 'Feature',
      geometry,
      properties: {
        id: item.Id,
        greenCodeType: String(item.GreenCodeType || ''),
        greenCodeSubtype: String(item.GreenCodeSubtype || ''),
        name: name  // Actual feature name from API
      }
    };
  }

  _parseGeometry(item) {
    const geoObj = item.Geo;
    if (!geoObj) return null;

    const geoArray = Array.isArray(geoObj) ? geoObj : Object.values(geoObj);
    const geo = geoArray.find(g => g?.Default) || geoArray[0];
    if (!geo) return null;

    const wkt = geo.Geometry || geo.geometry;
    if (!wkt) return null;

    return this._parseWKT(wkt);
  }

  _parseWKT(wkt) {
    const str = String(wkt).trim();

    // POINT
    const pointMatch = str.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
    if (pointMatch) {
      const lng = +pointMatch[1];
      const lat = +pointMatch[2];
      if (!this._validCoord(lng, lat)) return null;
      return { type: 'Point', coordinates: [lng, lat] };
    }

    // LINESTRING
    const lineMatch = str.match(/LINESTRING\s*\((.+)\)/i);
    if (lineMatch) {
      const coords = this._parseCoords(lineMatch[1]);
      if (coords && coords.length >= 2 && this._validCoords(coords)) {
        return { type: 'LineString', coordinates: coords };
      }
    }

    // POLYGON
    const polyMatch = str.match(/POLYGON\s*\(\s*\((.+)\)\s*\)/i);
    if (polyMatch) {
      const coords = this._parseCoords(polyMatch[1]);
      if (coords && coords.length >= 3 && this._validCoords(coords)) {
        // Ensure closed
        if (coords[0][0] !== coords[coords.length-1][0] ||
            coords[0][1] !== coords[coords.length-1][1]) {
          coords.push([...coords[0]]);
        }
        // Skip oversized
        if (!this._validPolygonSize(coords)) return null;
        return { type: 'Polygon', coordinates: [coords] };
      }
    }

    return null;
  }

  _parseCoords(str) {
    return str.split(',').map(p => {
      const [x, y] = p.trim().split(/\s+/).map(Number);
      return [x, y];
    });
  }

  _validCoord(lng, lat) {
    return lng >= 10 && lng <= 13 && lat >= 44 && lat <= 47;
  }

  _validCoords(coords) {
    for (const [lng, lat] of coords) {
      if (!this._validCoord(lng, lat)) return false;
    }
    return true;
  }

  _validPolygonSize(coords) {
    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;
    for (const [lng, lat] of coords) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    return (maxLng - minLng) < 0.1 && (maxLat - minLat) < 0.1;
  }

  clearCache() {
    this.memoryCache.clear();
    console.log('🗑️ Memory cache cleared');
  }
}
