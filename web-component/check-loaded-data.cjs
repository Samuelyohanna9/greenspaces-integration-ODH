// Test what data the ViewportDataLoader actually produces

const https = require('https');

const API_BASE = 'https://api.tourism.testingmachine.eu/v1/UrbanGreen';

function fetchPage(page) {
  const url = `${API_BASE}?fields=Id&fields=GreenCodeType&fields=GreenCodeSubtype&fields=Geo&pagesize=500&pagenumber=${page}&greencodetype=2&active=true&removenullvalues=false`;

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Simulate _toFeature from ViewportDataLoader
function toFeature(item) {
  const geometry = parseGeometry(item);
  if (!geometry) return null;

  return {
    type: 'Feature',
    geometry,
    properties: {
      id: item.Id,
      greenCodeType: String(item.GreenCodeType || ''),
      greenCodeSubtype: String(item.GreenCodeSubtype || '')
    }
  };
}

function parseGeometry(item) {
  const geoObj = item.Geo;
  if (!geoObj) return null;

  const geoArray = Array.isArray(geoObj) ? geoObj : Object.values(geoObj);
  const geo = geoArray.find(g => g?.Default) || geoArray[0];
  if (!geo) return null;

  const wkt = geo.Geometry || geo.geometry;
  if (!wkt) return null;

  return parseWKT(wkt);
}

function parseWKT(wkt) {
  const str = String(wkt).trim();

  // POINT
  const pointMatch = str.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
  if (pointMatch) {
    return { type: 'Point', coordinates: [+pointMatch[1], +pointMatch[2]] };
  }

  // LINESTRING
  const lineMatch = str.match(/LINESTRING\s*\((.+)\)/i);
  if (lineMatch) {
    const coords = lineMatch[1].split(',').map(p => {
      const [x, y] = p.trim().split(/\s+/).map(Number);
      return [x, y];
    });
    if (coords.length >= 2) {
      return { type: 'LineString', coordinates: coords };
    }
  }

  // POLYGON
  const polyMatch = str.match(/POLYGON\s*\(\s*\((.+)\)\s*\)/i);
  if (polyMatch) {
    const coords = polyMatch[1].split(',').map(p => {
      const [x, y] = p.trim().split(/\s+/).map(Number);
      return [x, y];
    });
    if (coords.length >= 3) {
      return { type: 'Polygon', coordinates: [coords] };
    }
  }

  return null;
}

async function main() {
  console.log('Simulating ViewportDataLoader for subtype 19...\n');

  let features = [];
  let subtype19Count = 0;
  let subtype19LineStrings = 0;

  for (let p = 1; p <= 8; p++) {
    const data = await fetchPage(p);

    data.Items.forEach(item => {
      const feature = toFeature(item);
      if (feature) {
        features.push(feature);
        if (feature.properties.greenCodeSubtype === '19') {
          subtype19Count++;
          if (feature.geometry.type === 'LineString') {
            subtype19LineStrings++;
          }
        }
      }
    });

    process.stdout.write(`Page ${p}/8\r`);
  }

  console.log(`\nTotal features parsed: ${features.length}`);
  console.log(`Subtype 19 features: ${subtype19Count}`);
  console.log(`Subtype 19 LineStrings: ${subtype19LineStrings}`);

  // Show first few subtype 19 features
  const sub19 = features.filter(f => f.properties.greenCodeSubtype === '19');
  console.log('\nFirst 3 subtype 19 features:');
  sub19.slice(0, 3).forEach((f, i) => {
    console.log(`  ${i}: geom=${f.geometry.type}, props=`, f.properties);
  });
}

main().catch(console.error);
