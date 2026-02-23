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

function _validCoord(lng, lat) {
  return lng >= 10 && lng <= 13 && lat >= 44 && lat <= 47;
}

async function main() {
  console.log('Checking coordinates for subtype 19...\n');

  const data = await fetchPage(1);

  let valid = 0;
  let invalid = 0;

  data.Items.filter(item => item.GreenCodeSubtype == '19').forEach(item => {
    const geo = item.Geo;
    if (!geo) return;

    const geoArray = Array.isArray(geo) ? geo : Object.values(geo);
    const g = geoArray.find(x => x?.Default) || geoArray[0];
    const wkt = g?.Geometry || '';

    const lineMatch = wkt.match(/LINESTRING\s*\((.+)\)/i);
    if (lineMatch) {
      const coordStr = lineMatch[1];
      const coords = coordStr.split(',').map(p => {
        const [x, y] = p.trim().split(/\s+/).map(Number);
        return [x, y];
      });

      let allValid = true;
      for (const [lng, lat] of coords) {
        if (!_validCoord(lng, lat)) {
          allValid = false;
          console.log(`  INVALID: lng=${lng}, lat=${lat} (ID: ${item.Id})`);
          break;
        }
      }

      if (allValid) valid++;
      else invalid++;
    }
  });

  console.log(`\nValid: ${valid}, Invalid: ${invalid}`);
}

main().catch(console.error);
