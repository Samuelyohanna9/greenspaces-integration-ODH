const https = require('https');

const API_BASE = 'https://api.tourism.testingmachine.eu/v1/UrbanGreen';

function fetchPage(type, page) {
  const url = `${API_BASE}?fields=Id&fields=GreenCodeType&fields=GreenCodeSubtype&fields=Geo&pagesize=500&pagenumber=${page}&greencodetype=${type}&active=true`;

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

async function analyzeType(type, typeName, pages) {
  console.log(`\n=== Analyzing Type ${type}: ${typeName} (${pages} pages) ===\n`);

  const subtypeCounts = {};
  const geomBySubtype = {};

  for (let p = 1; p <= pages; p++) {
    const data = await fetchPage(type, p);

    data.Items.forEach(item => {
      const subtype = item.GreenCodeSubtype || 'null';
      subtypeCounts[subtype] = (subtypeCounts[subtype] || 0) + 1;

      const geo = item.Geo;
      if (geo) {
        const geoArray = Array.isArray(geo) ? geo : Object.values(geo);
        const g = geoArray.find(x => x && x.Default) || geoArray[0];
        const wkt = (g && g.Geometry) || '';
        let geomType = 'unknown';
        if (wkt.startsWith('POINT')) geomType = 'Point';
        else if (wkt.startsWith('POLYGON')) geomType = 'Polygon';
        else if (wkt.startsWith('LINESTRING')) geomType = 'LineString';

        if (!geomBySubtype[subtype]) geomBySubtype[subtype] = {};
        geomBySubtype[subtype][geomType] = (geomBySubtype[subtype][geomType] || 0) + 1;
      }
    });

    process.stdout.write(`Page ${p}/${pages}\r`);
  }

  console.log('\nSubtype\tCount\tGeometries');
  console.log('-------\t-----\t----------');

  let total = 0;
  Object.keys(subtypeCounts).sort().forEach(st => {
    const geoms = geomBySubtype[st] || {};
    const geomStr = Object.entries(geoms).map(([k,v]) => `${k}:${v}`).join(', ');
    console.log(`${st}\t${subtypeCounts[st]}\t${geomStr}`);
    total += subtypeCounts[st];
  });
  console.log('-------\t-----');
  console.log(`TOTAL\t${total}`);

  return { subtypeCounts, geomBySubtype };
}

async function main() {
  console.log('Analyzing subtypes and geometry distribution...\n');

  // Analyze Type 2 with only 8 pages (what the app loads)
  console.log('=== What the APP loads (8 pages) ===');
  await analyzeType('2', 'Urban Furniture', 8);

  console.log('\n=== Full data (15 pages) ===');
  await analyzeType('2', 'Urban Furniture', 15);
}

main().catch(console.error);
