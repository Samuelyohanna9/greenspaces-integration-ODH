/**
 * UrbanGreen PRODUCTION Vector Tile Server - KV Cache Version
 * FREE PLAN EDITION with Chunked Storage (25MB KV limit workaround)
 * 
 * Features:
 * - Splits data into multiple KV keys (by feature type)
 * - Works within 25MB per key limit
 * - Batched loading for free plan
 * - Merges data from all chunks when serving tiles
 * 
 * Version: 6.2.0-kv-chunked
 */

import geojsonvt from "geojson-vt";
import vtpbf from "vt-pbf";

const CONFIG = {
  ODH_API_BASE: "https://api.tourism.testingmachine.eu",
  ODH_ENDPOINT: "/v1/UrbanGreen",
  SUPPORTED_LANGS: ["en", "it", "de"],
  
  // KV keys - chunked by type
  KV_KEY_PREFIX: "urbangreen:data:v2",
  KV_KEY_METADATA: "urbangreen:metadata:v2",
  KV_KEY_PROGRESS: "urbangreen:progress:v2",
  
  // Batching (free plan limits)
  BATCH_SIZE: 100,  // Pages per batch
  
  // Tile settings
  TILE_OPTIONS: {
    maxZoom: 16,
    tolerance: 3,
    extent: 4096,
    buffer: 64,
    debug: 0,
    indexMaxZoom: 5,
    indexMaxPoints: 100000,
  },
  
  // ODH paging
  PAGESIZE: 200,
};

// Helper functions (same as before)
function toNumber(v) {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function truncateCoord(value) {
  return Math.round(value * 1000000) / 1000000;
}

function pickFirstGeo(geoObj) {
  if (!geoObj) return null;
  if (geoObj.position && typeof geoObj.position === "object") return geoObj.position;
  const entries = Array.isArray(geoObj) ? geoObj : Object.values(geoObj);
  if (!entries.length) return null;
  const def = entries.find((e) => e && e.Default === true);
  return def || entries[0];
}

function getLocalizedTitle(item, lang) {
  const d = item?.Detail;
  if (!d || typeof d !== "object") return item?.Shortname || item?.Id || "Unknown";
  if (d[lang]?.Title) return d[lang].Title;
  if (d.en?.Title) return d.en.Title;
  for (const v of Object.values(d)) {
    if (v?.Title) return v.Title;
  }
  return item?.Shortname || item?.Id || "Unknown";
}

function extractWktString(maybeWkt) {
  if (!maybeWkt || typeof maybeWkt !== "string") return null;
  const cleaned = maybeWkt.replace(/;SRID=\d+\s*$/i, "").trim();
  const m = cleaned.match(/\b(POINT|POLYGON|MULTIPOLYGON|LINESTRING|MULTILINESTRING)\b/i);
  if (!m) return null;
  return cleaned.slice(m.index).trim();
}

function parseCoordList(str) {
  const parts = String(str).trim().split(",").map((p) => p.trim()).filter(Boolean);
  const coords = [];
  for (const p of parts) {
    const [a, b] = p.split(/\s+/);
    const lng = toNumber(a);
    const lat = toNumber(b);
    if (lng === null || lat === null) continue;
    coords.push([truncateCoord(lng), truncateCoord(lat)]);
  }
  return coords.length ? coords : null;
}

function parseWktPoint(wkt) {
  const m = wkt.match(/POINT\s*\(\s*([-\d.,]+)\s+([-\d.,]+)\s*\)/i);
  if (!m) return null;
  const lng = toNumber(m[1]);
  const lat = toNumber(m[2]);
  if (lat === null || lng === null) return null;
  return [truncateCoord(lng), truncateCoord(lat)];
}

function parseWktPolygonRings(wkt) {
  const poly = wkt.match(/POLYGON\s*\(\s*\((.+)\)\s*\)\s*$/i);
  if (poly) {
    const inside = poly[1];
    const ringStrings = inside.split("),(");
    const rings = ringStrings.map((rs) => parseCoordList(rs));
    return rings.filter((r) => r && r.length);
  }
  return null;
}

function itemToGeoJSON(item, lang) {
  const g = pickFirstGeo(item.Geo);
  if (!g) return null;

  const wktRaw = g?.Geometry ?? g?.geometry ?? null;
  let geometry = null;

  if (wktRaw) {
    const wkt = extractWktString(wktRaw);
    if (wkt) {
      const pt = parseWktPoint(wkt);
      if (pt) {
        geometry = { type: "Point", coordinates: pt };
      } else {
        const rings = parseWktPolygonRings(wkt);
        if (rings && rings[0] && rings[0].length >= 3) {
          geometry = { type: "Polygon", coordinates: rings };
        }
      }
    }
  }

  if (!geometry) {
    const lat = toNumber(g?.Latitude ?? item?.Latitude);
    const lng = toNumber(g?.Longitude ?? item?.Longitude);
    if (lat !== null && lng !== null) {
      geometry = { type: "Point", coordinates: [truncateCoord(lng), truncateCoord(lat)] };
    }
  }

  if (!geometry) return null;

  return {
    type: "Feature",
    geometry,
    properties: {
      id: item.Id,
      title: getLocalizedTitle(item, lang),
      type: String(item.GreenCodeType || ""),
      code: item.GreenCode || "N/A",
      active: !!item.Active,
    },
  };
}

// Bbox helpers
function tileToBbox(x, y, z) {
  const n = Math.pow(2, z);
  const west = (x / n) * 360 - 180;
  const east = ((x + 1) / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
  const north = latRad * 180 / Math.PI;
  const latRad2 = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n)));
  const south = latRad2 * 180 / Math.PI;
  return { west, south, east, north };
}

function getFeatureBbox(feature) {
  const geom = feature.geometry;
  if (geom.type === "Point") {
    const [lng, lat] = geom.coordinates;
    return { west: lng, east: lng, south: lat, north: lat };
  } else if (geom.type === "Polygon") {
    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;
    for (const ring of geom.coordinates) {
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
    return { west: minLng, east: maxLng, south: minLat, north: maxLat };
  }
  return null;
}

function bboxesIntersect(bbox1, bbox2) {
  return !(bbox1.east < bbox2.west || bbox1.west > bbox2.east ||
           bbox1.north < bbox2.south || bbox1.south > bbox2.north);
}

// ========================================
// CHUNKED KV STORAGE (by type)
// ========================================

async function saveFeaturesByType(env, lang, features) {
  // Group features by type
  const byType = {
    "1": [],  // Vegetation
    "2": [],  // Furniture
    "3": [],  // Zones
    "other": []
  };
  
  for (const feature of features) {
    const type = feature.properties.type;
    if (byType[type]) {
      byType[type].push(feature);
    } else {
      byType["other"].push(feature);
    }
  }
  
  // Save each type separately
  for (const [type, typeFeatures] of Object.entries(byType)) {
    if (typeFeatures.length === 0) continue;
    
    const key = `${CONFIG.KV_KEY_PREFIX}:${lang}:type${type}`;
    const geojson = {
      type: "FeatureCollection",
      features: typeFeatures
    };
    
    const json = JSON.stringify(geojson);
    console.log(`Saving type ${type}: ${typeFeatures.length} features, ${json.length} bytes`);
    
    await env.URBANGREEN_KV.put(key, json);
  }
}

async function getAllFeatures(env, lang) {
  const allFeatures = [];
  
  // Load all type chunks
  const types = ["1", "2", "3", "other"];
  
  for (const type of types) {
    const key = `${CONFIG.KV_KEY_PREFIX}:${lang}:type${type}`;
    const data = await env.URBANGREEN_KV.get(key);
    
    if (data) {
      const geojson = JSON.parse(data);
      if (geojson.features) {
        allFeatures.push(...geojson.features);
      }
    }
  }
  
  return {
    type: "FeatureCollection",
    features: allFeatures
  };
}

// ========================================
// BATCHED FETCH
// ========================================

async function fetchBatchFromODH(lang, startPage, endPage) {
  console.log(`Fetching batch: pages ${startPage}-${endPage} for lang: ${lang}`);
  const startTime = Date.now();
  
  const allFeatures = [];
  let page = startPage;
  
  while (page <= endPage) {
    const url = new URL(`${CONFIG.ODH_API_BASE}${CONFIG.ODH_ENDPOINT}`);
    url.searchParams.set("pagenumber", String(page));
    url.searchParams.set("pagesize", String(CONFIG.PAGESIZE));
    url.searchParams.set("language", lang);

    try {
      const response = await fetch(url.toString(), {
        headers: { Accept: "application/json" }
      });

      if (!response.ok) {
        if (response.status === 404) break;
        throw new Error(`ODH API error: ${response.status}`);
      }

      const json = await response.json();
      const items = json?.Items ?? json?.items ?? [];

      if (items.length === 0) break;

      const features = items.map(item => itemToGeoJSON(item, lang)).filter(Boolean);
      allFeatures.push(...features);

      if (items.length < CONFIG.PAGESIZE) break;
      
      page++;
      
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error);
      break;
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`Batch complete: ${allFeatures.length} features in ${elapsed}ms`);

  return {
    features: allFeatures,
    lastPage: page,
    elapsed
  };
}

// Progress tracking
async function getProgress(env, lang) {
  const key = `${CONFIG.KV_KEY_PROGRESS}:${lang}`;
  const data = await env.URBANGREEN_KV.get(key);
  
  if (!data) {
    return {
      currentPage: 1,
      totalFeatures: 0,
      isComplete: false
    };
  }
  
  return JSON.parse(data);
}

async function saveProgress(env, lang, progress) {
  const key = `${CONFIG.KV_KEY_PROGRESS}:${lang}`;
  await env.URBANGREEN_KV.put(key, JSON.stringify(progress));
}

// ========================================
// BATCHED REFRESH
// ========================================

async function handleBatchedRefresh(request, env) {
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang") || "en";
  const reset = url.searchParams.get("reset") === "true";
  
  if (!CONFIG.SUPPORTED_LANGS.includes(lang)) {
    return new Response(JSON.stringify({ error: "Unsupported language" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  
  try {
    let progress = await getProgress(env, lang);
    
    if (reset) {
      progress = { currentPage: 1, totalFeatures: 0, isComplete: false };
      await saveProgress(env, lang, progress);
      
      // Clear all type chunks
      const types = ["1", "2", "3", "other"];
      for (const type of types) {
        await env.URBANGREEN_KV.delete(`${CONFIG.KV_KEY_PREFIX}:${lang}:type${type}`);
      }
    }
    
    if (progress.isComplete) {
      return new Response(JSON.stringify({
        success: true,
        message: "Refresh already complete",
        progress
      }, null, 2), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
    
    const startPage = progress.currentPage;
    const endPage = Math.min(startPage + CONFIG.BATCH_SIZE - 1, 1200);
    
    const batch = await fetchBatchFromODH(lang, startPage, endPage);
    
    // Save by type (chunked)
    await saveFeaturesByType(env, lang, batch.features);
    
    // Get total features across all chunks
    const allData = await getAllFeatures(env, lang);
    const totalFeatures = allData.features.length;
    
    const isComplete = batch.lastPage >= 1200 || batch.features.length === 0;
    
    progress = {
      currentPage: batch.lastPage + 1,
      totalFeatures,
      isComplete,
      lastBatch: {
        pages: `${startPage}-${batch.lastPage}`,
        features: batch.features.length,
        elapsed: batch.elapsed
      }
    };
    
    await saveProgress(env, lang, progress);
    
    if (isComplete) {
      const metadata = {
        lastRefresh: new Date().toISOString(),
        totalFeatures,
        language: lang,
        version: "6.2.0-kv-chunked"
      };
      await env.URBANGREEN_KV.put(`${CONFIG.KV_KEY_METADATA}:${lang}`, JSON.stringify(metadata));
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: isComplete ? "Refresh complete!" : "Batch processed",
      progress: {
        ...progress,
        percentComplete: Math.round((batch.lastPage / 1200) * 100),
        instruction: isComplete 
          ? "All data loaded! Your tiles are ready." 
          : "Call /refresh again to load next batch"
      }
    }, null, 2), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
    
  } catch (error) {
    console.error("Refresh error:", error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

async function getMetadataFromKV(env, lang) {
  const metaKey = `${CONFIG.KV_KEY_METADATA}:${lang}`;
  const data = await env.URBANGREEN_KV.get(metaKey);
  
  if (!data) return null;
  
  return JSON.parse(data);
}

// Tile generation
async function generateTileFromKV(env, lang, z, x, y) {
  const geojson = await getAllFeatures(env, lang);
  
  if (!geojson || geojson.features.length === 0) {
    throw new Error("Data not cached. Please call /refresh first.");
  }
  
  const tileBbox = tileToBbox(x, y, z);
  
  const featuresInTile = geojson.features.filter(feature => {
    const featureBbox = getFeatureBbox(feature);
    if (!featureBbox) return false;
    return bboxesIntersect(tileBbox, featureBbox);
  });
  
  if (featuresInTile.length === 0) return null;
  
  const tileGeoJSON = {
    type: "FeatureCollection",
    features: featuresInTile
  };
  
  const tileIndex = geojsonvt(tileGeoJSON, CONFIG.TILE_OPTIONS);
  const tile = tileIndex.getTile(z, x, y);
  
  if (!tile || !tile.features || tile.features.length === 0) return null;
  
  const pbf = vtpbf.fromGeojsonVt({ 'urbangreen': tile });
  
  return {
    pbf,
    featureCount: featuresInTile.length
  };
}

async function handleTileRequest(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/tiles\/([a-z]{2})\/(\d+)\/(\d+)\/(\d+)\.pbf$/);
  
  if (!match) {
    return new Response("Invalid tile URL", { status: 400 });
  }
  
  const [, lang, zStr, xStr, yStr] = match;
  const z = Number(zStr);
  const x = Number(xStr);
  const y = Number(yStr);
  
  if (!CONFIG.SUPPORTED_LANGS.includes(lang)) {
    return new Response("Unsupported language", { status: 400 });
  }
  
  try {
    const startTime = Date.now();
    const result = await generateTileFromKV(env, lang, z, x, y);
    const elapsed = Date.now() - startTime;
    
    if (!result) {
      return new Response(new ArrayBuffer(0), {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "X-Tile-Features": "0",
          "X-Tile-Time": `${elapsed}ms`
        }
      });
    }
    
    return new Response(result.pbf, {
      status: 200,
      headers: {
        "Content-Type": "application/x-protobuf",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600",
        "X-Tile-Features": String(result.featureCount),
        "X-Tile-Time": `${elapsed}ms`
      }
    });
  } catch (error) {
    console.error("Tile error:", error);
    return new Response(error.message, { status: 500 });
  }
}

async function handleInfo(env) {
  const metadata = {};
  const progress = {};
  
  for (const lang of CONFIG.SUPPORTED_LANGS) {
    const meta = await getMetadataFromKV(env, lang);
    const prog = await getProgress(env, lang);
    
    if (meta) metadata[lang] = meta;
    if (prog) progress[lang] = prog;
  }
  
  return new Response(JSON.stringify({
    service: "UrbanGreen PRODUCTION Vector Tile Server",
    version: "6.2.0-kv-chunked",
    status: "running",
    approach: "KV cache with chunked storage (25MB limit workaround)",
    metadata,
    progress,
    endpoints: {
      info: "/",
      health: "/health",
      refresh: "/refresh?lang={en|it|de}",
      refreshReset: "/refresh?lang={en|it|de}&reset=true",
      tiles: "/tiles/{lang}/{z}/{x}/{y}.pbf"
    }
  }, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "86400"
          }
        });
      }

      if (url.pathname === "/" || url.pathname === "/info") {
        return handleInfo(env);
      }

      if (url.pathname === "/health") {
        return new Response("OK", {
          headers: { "Access-Control-Allow-Origin": "*" }
        });
      }

      if (url.pathname === "/refresh") {
        return handleBatchedRefresh(request, env);
      }

      if (url.pathname.startsWith("/tiles/")) {
        return handleTileRequest(request, env);
      }

      return new Response("Not Found", { status: 404 });

    } catch (error) {
      console.error("Worker error:", error);
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  }
};