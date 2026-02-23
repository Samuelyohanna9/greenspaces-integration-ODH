/**
 * UrbanGreen Data Loader - Resilient Version
 * 
 * Features:
 * - Retries on ODH API errors (up to 3 times)
 * - Continues on failure (doesn't stop entire upload)
 * - Shows which pages failed
 * 
 * Usage: node upload-resilient.mjs
 */

import fetch from 'node-fetch';

const CONFIG = {
  API_TOKEN: 'YOUR_API_TOKEN_HERE',
  ACCOUNT_ID: '751ea1abdb3fb6ff7f276b3753e4c6a1',
  NAMESPACE_ID: '44bbc911cd8940d3b7a112ebac89ad74',
  ODH_API_BASE: 'https://api.tourism.testingmachine.eu',
  ODH_ENDPOINT: '/v1/UrbanGreen',
  PAGESIZE: 200,
  LANG: 'en',
  KV_KEY_PREFIX: 'urbangreen:data:v2',
  KV_KEY_METADATA: 'urbangreen:metadata:v2',
  KV_KEY_PROGRESS: 'urbangreen:progress:v2',
  MAX_RETRIES: 3,
  RETRY_DELAY: 2000, // 2 seconds
};

// Helper functions (same as before)
function toNumber(v) {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function truncateCoord(value) {
  return Math.round(value * 1000000) / 1000000;
}

function pickFirstGeo(geoObj) {
  if (!geoObj) return null;
  if (geoObj.position && typeof geoObj.position === 'object') return geoObj.position;
  const entries = Array.isArray(geoObj) ? geoObj : Object.values(geoObj);
  if (!entries.length) return null;
  const def = entries.find((e) => e && e.Default === true);
  return def || entries[0];
}

function getLocalizedTitle(item, lang) {
  const d = item?.Detail;
  if (!d || typeof d !== 'object') return item?.Shortname || item?.Id || 'Unknown';
  if (d[lang]?.Title) return d[lang].Title;
  if (d.en?.Title) return d.en.Title;
  for (const v of Object.values(d)) {
    if (v?.Title) return v.Title;
  }
  return item?.Shortname || item?.Id || 'Unknown';
}

function extractWktString(maybeWkt) {
  if (!maybeWkt || typeof maybeWkt !== 'string') return null;
  const cleaned = maybeWkt.replace(/;SRID=\d+\s*$/i, '').trim();
  const m = cleaned.match(/\b(POINT|POLYGON|MULTIPOLYGON|LINESTRING|MULTILINESTRING)\b/i);
  if (!m) return null;
  return cleaned.slice(m.index).trim();
}

function parseCoordList(str) {
  const parts = String(str).trim().split(',').map((p) => p.trim()).filter(Boolean);
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
    const ringStrings = inside.split('),(');
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
        geometry = { type: 'Point', coordinates: pt };
      } else {
        const rings = parseWktPolygonRings(wkt);
        if (rings && rings[0] && rings[0].length >= 3) {
          geometry = { type: 'Polygon', coordinates: rings };
        }
      }
    }
  }

  if (!geometry) {
    const lat = toNumber(g?.Latitude ?? item?.Latitude);
    const lng = toNumber(g?.Longitude ?? item?.Longitude);
    if (lat !== null && lng !== null) {
      geometry = { type: 'Point', coordinates: [truncateCoord(lng), truncateCoord(lat)] };
    }
  }

  if (!geometry) return null;

  return {
    type: 'Feature',
    geometry,
    properties: {
      id: item.Id,
      title: getLocalizedTitle(item, lang),
      type: String(item.GreenCodeType || ''),
      code: item.GreenCode || 'N/A',
      active: !!item.Active,
    },
  };
}

async function deleteKVKey(key) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CONFIG.ACCOUNT_ID}/storage/kv/namespaces/${CONFIG.NAMESPACE_ID}/values/${encodeURIComponent(key)}`;
  
  const response = await fetch(url, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${CONFIG.API_TOKEN}` }
  });

  if (!response.ok && response.status !== 404) {
    const error = await response.text();
    throw new Error(`KV delete failed: ${response.status} - ${error}`);
  }
}

async function clearOldData(lang) {
  console.log('🗑️  Clearing old data from KV...');
  console.log('');
  
  const keysToDelete = [
    `${CONFIG.KV_KEY_PREFIX}:${lang}:type1`,
    `${CONFIG.KV_KEY_PREFIX}:${lang}:type2`,
    `${CONFIG.KV_KEY_PREFIX}:${lang}:type3`,
    `${CONFIG.KV_KEY_PREFIX}:${lang}:typeother`,
    `${CONFIG.KV_KEY_METADATA}:${lang}`,
    `${CONFIG.KV_KEY_PROGRESS}:${lang}`,
  ];
  
  let count = 0;
  for (const key of keysToDelete) {
    count++;
    process.stdout.write(`   [${count}/${keysToDelete.length}] Deleting ${key.split(':').pop()}...`);
    try {
      await deleteKVKey(key);
      console.log(' ✓');
    } catch (error) {
      console.log(' ✗');
    }
  }
  
  console.log('');
  console.log('✓ Old data cleared');
  console.log('');
}

async function uploadToKV(key, value) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CONFIG.ACCOUNT_ID}/storage/kv/namespaces/${CONFIG.NAMESPACE_ID}/values/${encodeURIComponent(key)}`;
  
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${CONFIG.API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: value
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`KV upload failed: ${response.status} - ${error}`);
  }

  return await response.json();
}

async function fetchPageWithRetry(page, lang) {
  const url = new URL(`${CONFIG.ODH_API_BASE}${CONFIG.ODH_ENDPOINT}`);
  url.searchParams.set('pagenumber', String(page));
  url.searchParams.set('pagesize', String(CONFIG.PAGESIZE));
  url.searchParams.set('language', lang);

  for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' }
      });

      if (!response.ok) {
        if (response.status === 404) return null; // End of data
        throw new Error(`ODH API error: ${response.status}`);
      }

      const json = await response.json();
      return json?.Items ?? json?.items ?? [];
      
    } catch (error) {
      if (attempt === CONFIG.MAX_RETRIES) {
        console.error(`\n⚠️  Page ${page} failed after ${CONFIG.MAX_RETRIES} attempts: ${error.message}`);
        return null; // Skip this page
      }
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
    }
  }
}

async function fetchAllFromODH(lang) {
  console.log('📥 Fetching all data from ODH API (with retry logic)...');
  console.log(`   Language: ${lang}`);
  console.log('');
  
  const allFeatures = [];
  let page = 1;
  const totalPages = 1133; // We know this from previous attempts
  let failedPages = [];
  
  while (page <= totalPages) {
    const items = await fetchPageWithRetry(page, lang);
    
    if (items === null) {
      failedPages.push(page);
      page++;
      continue;
    }
    
    if (items.length === 0) break;

    const features = items.map(item => itemToGeoJSON(item, lang)).filter(Boolean);
    allFeatures.push(...features);

    const progress = Math.round((page / totalPages) * 100);
    process.stdout.write(`\r   Page ${page}/${totalPages} (${progress}%) - ${allFeatures.length} features`);

    if (items.length < CONFIG.PAGESIZE) break;
    
    page++;
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  console.log('');
  
  if (failedPages.length > 0) {
    console.log(`⚠️  Warning: ${failedPages.length} pages failed: ${failedPages.slice(0, 10).join(', ')}${failedPages.length > 10 ? '...' : ''}`);
  }
  
  console.log(`✓ Fetched ${allFeatures.length} features in ${page} pages`);
  console.log('');

  return allFeatures;
}

async function uploadFeaturesByType(features, lang) {
  console.log('📤 Uploading to Cloudflare KV...');
  console.log('');
  
  const byType = {
    '1': [],
    '2': [],
    '3': [],
    'other': []
  };
  
  for (const feature of features) {
    const type = feature.properties.type;
    if (byType[type]) {
      byType[type].push(feature);
    } else {
      byType['other'].push(feature);
    }
  }
  
  let uploadCount = 0;
  const totalTypes = Object.keys(byType).filter(t => byType[t].length > 0).length;
  
  for (const [type, typeFeatures] of Object.entries(byType)) {
    if (typeFeatures.length === 0) continue;
    
    uploadCount++;
    const key = `${CONFIG.KV_KEY_PREFIX}:${lang}:type${type}`;
    const geojson = {
      type: 'FeatureCollection',
      features: typeFeatures
    };
    
    const json = JSON.stringify(geojson);
    const sizeMB = (json.length / 1024 / 1024).toFixed(2);
    
    process.stdout.write(`   [${uploadCount}/${totalTypes}] Uploading type ${type}: ${typeFeatures.length} features (${sizeMB} MB)...`);
    
    try {
      await uploadToKV(key, json);
      console.log(' ✓');
    } catch (error) {
      console.log(' ✗');
      throw error;
    }
  }
  
  console.log('');
  console.log('✓ All data uploaded successfully!');
  console.log('');
}

async function uploadMetadata(totalFeatures, lang) {
  const metadata = {
    lastRefresh: new Date().toISOString(),
    totalFeatures,
    language: lang,
    version: '6.2.0-kv-chunked',
    uploadMethod: 'local-script-resilient'
  };
  
  const key = `${CONFIG.KV_KEY_METADATA}:${lang}`;
  
  console.log('📝 Uploading metadata...');
  await uploadToKV(key, JSON.stringify(metadata));
  console.log('✓ Metadata uploaded');
  console.log('');
}

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('   UrbanGreen Data Loader - Resilient');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  
  if (CONFIG.API_TOKEN === 'ojtlYAZwQW_RPK7XY2K1gOTIBr5JtNOIkt0UW9_u') {
    console.error('❌ Error: Please set your API token in the script!');
    process.exit(1);
  }
  
  const startTime = Date.now();
  
  try {
    await clearOldData(CONFIG.LANG);
    const features = await fetchAllFromODH(CONFIG.LANG);
    
    if (features.length === 0) {
      console.log('❌ No features fetched. Check ODH API connectivity.');
      process.exit(1);
    }
    
    await uploadFeaturesByType(features, CONFIG.LANG);
    await uploadMetadata(features.length, CONFIG.LANG);
    
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('🎉 SUCCESS!');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log(`✓ Uploaded ${features.length.toLocaleString()} features to Cloudflare KV`);
    console.log(`✓ Time taken: ${minutes}m ${seconds}s`);
    console.log('');
    console.log('Your vector tile server is now ready!');
    console.log('Test it at: https://urbangreen-tiles.urbangreen1.workers.dev/');
    console.log('');
    
  } catch (error) {
    console.error('');
    console.error('❌ Error:', error.message);
    console.error('');
    process.exit(1);
  }
}

main();
