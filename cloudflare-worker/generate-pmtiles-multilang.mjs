/**
 * UrbanGreen Multilingual PMTiles Generator
 * 
 * Generates PMTiles with ALL languages from ODH data
 * Languages: de, en, it, fr, el, hu, sl, uk, zh, fi, he, etc.
 * 
 * Run: node generate-pmtiles-multilang.mjs
 */

import fetch from 'node-fetch';
import fs from 'fs';
import { execSync } from 'child_process';

const CONFIG = {
  // ODH API
  ODH_API_BASE: 'https://api.tourism.testingmachine.eu',
  ODH_ENDPOINT: '/v1/UrbanGreen',
  PAGESIZE: 200,
  
  // Languages to fetch (we'll fetch once and extract all languages from Detail)
  PRIMARY_LANG: 'en',
  
  // Output files
  GEOJSON_FILE: 'urbangreen-multilang.geojson',
  PMTILES_FILE: 'urbangreen-multilang.pmtiles',
  
  // Tippecanoe settings
  MAX_ZOOM: 16,
  MIN_ZOOM: 10,
  LAYER_NAME: 'urbangreen',
};

// ========================================
// HELPER FUNCTIONS
// ========================================

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

function getAllTitles(item) {
  const d = item?.Detail;
  if (!d || typeof d !== 'object') {
    return { en: item?.Shortname || item?.Id || 'Unknown' };
  }
  
  const titles = {};
  
  // Extract titles from all languages
  for (const [lang, details] of Object.entries(d)) {
    if (details?.Title) {
      titles[lang] = details.Title;
    }
  }
  
  // Fallback to Shortname if no titles found
  if (Object.keys(titles).length === 0) {
    titles.en = item?.Shortname || item?.Id || 'Unknown';
  }
  
  return titles;
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

function itemToGeoJSON(item) {
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

  // Get ALL language titles
  const titles = getAllTitles(item);
  
  // Create properties with all languages
  const properties = {
    id: item.Id,
    type: String(item.GreenCodeType || ''),
    code: item.GreenCode || 'N/A',
    active: !!item.Active,
    // Add all language titles with name_ prefix
    ...Object.fromEntries(
      Object.entries(titles).map(([lang, title]) => [`name_${lang}`, title])
    )
  };

  return {
    type: 'Feature',
    geometry,
    properties,
  };
}

// ========================================
// STEP 1: FETCH ALL DATA FROM ODH
// ========================================

async function fetchAllFromODH() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  STEP 1: Fetching Data from ODH API');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('  Fetching all languages in single request...');
  console.log('');
  
  const allFeatures = [];
  const languagesFound = new Set();
  let page = 1;
  let totalPages = null;
  
  while (true) {
    const url = new URL(`${CONFIG.ODH_API_BASE}${CONFIG.ODH_ENDPOINT}`);
    url.searchParams.set('pagenumber', String(page));
    url.searchParams.set('pagesize', String(CONFIG.PAGESIZE));
    url.searchParams.set('language', CONFIG.PRIMARY_LANG);

    try {
      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' }
      });

      if (!response.ok) {
        if (response.status === 404) break;
        throw new Error(`ODH API error: ${response.status}`);
      }

      const json = await response.json();
      const items = json?.Items ?? json?.items ?? [];
      
      if (totalPages === null) {
        const total = json?.TotalResults ?? 0;
        totalPages = Math.ceil(total / CONFIG.PAGESIZE);
      }

      if (items.length === 0) break;

      const features = items.map(item => {
        const feature = itemToGeoJSON(item);
        
        // Track languages found
        if (feature && item.Detail) {
          Object.keys(item.Detail).forEach(lang => languagesFound.add(lang));
        }
        
        return feature;
      }).filter(Boolean);
      
      allFeatures.push(...features);

      const progress = Math.round((page / totalPages) * 100);
      process.stdout.write(`\r  Page ${page}/${totalPages} (${progress}%) - ${allFeatures.length} features`);

      if (items.length < CONFIG.PAGESIZE) break;
      
      page++;
      await new Promise(resolve => setTimeout(resolve, 50));
      
    } catch (error) {
      console.error(`\n  ❌ Error fetching page ${page}:`, error.message);
      break;
    }
  }

  console.log('');
  console.log(`  ✓ Fetched ${allFeatures.length} features`);
  console.log(`  ✓ Languages found: ${Array.from(languagesFound).sort().join(', ')}`);
  console.log('');

  return { features: allFeatures, languages: Array.from(languagesFound) };
}

// ========================================
// STEP 2: SAVE AS GEOJSON
// ========================================

function saveGeoJSON(features, languages, filename) {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  STEP 2: Saving Multilingual GeoJSON');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  
  const geojson = {
    type: 'FeatureCollection',
    features
  };
  
  const json = JSON.stringify(geojson);
  const sizeMB = (json.length / 1024 / 1024).toFixed(2);
  
  fs.writeFileSync(filename, json);
  
  console.log(`  ✓ Saved to: ${filename}`);
  console.log(`  ✓ Size: ${sizeMB} MB`);
  console.log(`  ✓ Features: ${features.length}`);
  console.log(`  ✓ Languages: ${languages.length} (${languages.join(', ')})`);
  console.log('');
  
  // Show sample properties
  if (features.length > 0) {
    const sampleProps = Object.keys(features[0].properties).filter(k => k.startsWith('name_'));
    console.log(`  ✓ Sample name fields: ${sampleProps.slice(0, 5).join(', ')}...`);
    console.log('');
  }
}

// ========================================
// STEP 3: GENERATE PMTILES WITH TIPPECANOE
// ========================================

function generatePMTiles(geojsonFile, pmtilesFile) {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  STEP 3: Generating Multilingual PMTiles');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  
  // Check if tippecanoe is installed
  try {
    execSync('tippecanoe --version', { stdio: 'ignore' });
  } catch (error) {
    console.error('  ❌ Tippecanoe not found!');
    console.log('');
    console.log('  Install in WSL:');
    console.log('    wsl');
    console.log('    sudo apt update');
    console.log('    sudo apt install tippecanoe');
    console.log('');
    process.exit(1);
  }
  
  console.log('  Running Tippecanoe...');
  console.log('');
  
  const command = [
    'tippecanoe',
    `-o ${pmtilesFile}`,
    `-z${CONFIG.MAX_ZOOM}`,
    `-Z${CONFIG.MIN_ZOOM}`,
    `-l ${CONFIG.LAYER_NAME}`,
    '--drop-densest-as-needed',
    '--extend-zooms-if-still-dropping',
    '--force',
    geojsonFile
  ].join(' ');
  
  try {
    execSync(command, { stdio: 'inherit' });
    
    const stats = fs.statSync(pmtilesFile);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    
    console.log('');
    console.log(`  ✓ PMTiles generated: ${pmtilesFile}`);
    console.log(`  ✓ Size: ${sizeMB} MB`);
    console.log('');
    
  } catch (error) {
    console.error('  ❌ Tippecanoe failed:', error.message);
    process.exit(1);
  }
}

// ========================================
// STEP 4: UPLOAD INSTRUCTIONS
// ========================================

function showUploadInstructions(pmtilesFile, languages) {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  STEP 4: Upload to Cloudflare R2');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('  Your multilingual PMTiles is ready!');
  console.log('');
  console.log('  Languages included:');
  console.log(`    ${languages.join(', ')}`);
  console.log('');
  console.log('  Upload to R2:');
  console.log('');
  console.log('  1. Create R2 bucket (if not exists):');
  console.log('     wrangler r2 bucket create urbangreen');
  console.log('');
  console.log('  2. Upload PMTiles:');
  console.log(`     wrangler r2 object put urbangreen/${pmtilesFile} --file=${pmtilesFile}`);
  console.log('');
  console.log('  3. Make bucket public:');
  console.log('     Dashboard → R2 → urbangreen → Settings → Public Access');
  console.log('');
  console.log('  4. Your PMTiles URL:');
  console.log('     https://pub-<YOUR-ID>.r2.dev/' + pmtilesFile);
  console.log('');
  console.log('  In your web component, access names like:');
  console.log('     feature.properties.name_en  (English)');
  console.log('     feature.properties.name_de  (German)');
  console.log('     feature.properties.name_it  (Italian)');
  console.log('     feature.properties.name_fr  (French)');
  console.log('     etc...');
  console.log('');
}

// ========================================
// MAIN
// ========================================

async function main() {
  console.log('');
  console.log('███████████████████████████████████████████████████████');
  console.log('   UrbanGreen Multilingual PMTiles Generator');
  console.log('   ALL Languages Included!');
  console.log('███████████████████████████████████████████████████████');
  
  const startTime = Date.now();
  
  try {
    // Step 1: Fetch data
    const { features, languages } = await fetchAllFromODH();
    
    if (features.length === 0) {
      console.log('❌ No features fetched. Check ODH API connectivity.');
      process.exit(1);
    }
    
    // Step 2: Save GeoJSON
    saveGeoJSON(features, languages, CONFIG.GEOJSON_FILE);
    
    // Step 3: Generate PMTiles
    generatePMTiles(CONFIG.GEOJSON_FILE, CONFIG.PMTILES_FILE);
    
    // Step 4: Show upload instructions
    showUploadInstructions(CONFIG.PMTILES_FILE, languages);
    
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('  🎉 SUCCESS!');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log(`  ✓ Generated: ${CONFIG.PMTILES_FILE}`);
    console.log(`  ✓ Features: ${features.length.toLocaleString()}`);
    console.log(`  ✓ Languages: ${languages.length}`);
    console.log(`  ✓ Time: ${minutes}m ${seconds}s`);
    console.log('');
    console.log('  🌍 Your tiles now support:');
    console.log(`     ${languages.join(', ')}`);
    console.log('');
    
  } catch (error) {
    console.error('');
    console.error('❌ Error:', error.message);
    console.error('');
    process.exit(1);
  }
}

main();
