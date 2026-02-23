const https = require('https');

const API_BASE = 'https://api.tourism.testingmachine.eu/v1/UrbanGreen';

async function fetchPage(type, page, pageSize = 500) {
  // CORRECT parameter: greencodetype (not type)
  const url = `${API_BASE}?fields=Id&fields=GreenCodeType&fields=GreenCodeSubtype&fields=Geo&pagesize=${pageSize}&pagenumber=${page}&greencodetype=${type}&active=true`;

  return new Promise((resolve, reject) => {
    const start = Date.now();
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const elapsed = Date.now() - start;
        try {
          const json = JSON.parse(data);
          const items = json.Items || [];

          // Count geometry types
          const geomCounts = { Point: 0, Polygon: 0, LineString: 0, other: 0 };
          items.forEach(item => {
            const geo = item.Geo;
            if (!geo) { geomCounts.other++; return; }
            const geoArray = Array.isArray(geo) ? geo : Object.values(geo);
            const g = geoArray.find(x => x?.Default) || geoArray[0];
            const wkt = g?.Geometry || '';
            if (wkt.startsWith('POINT')) geomCounts.Point++;
            else if (wkt.startsWith('POLYGON')) geomCounts.Polygon++;
            else if (wkt.startsWith('LINESTRING')) geomCounts.LineString++;
            else geomCounts.other++;
          });

          resolve({
            page,
            elapsed,
            total: items.length,
            totalPages: json.TotalPages,
            totalResults: json.TotalResults,
            ...geomCounts
          });
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function analyzeType(type, typeName) {
  console.log(`\n=== Type ${type}: ${typeName} ===`);

  // Get first page to see totals
  const first = await fetchPage(type, 1);
  console.log(`Total: ${first.totalResults} items in ${first.totalPages} pages`);
  console.log(`First page: ${first.Point} Points, ${first.Polygon} Polygons, ${first.LineString} Lines\n`);

  // Test pages 1-5 for speed comparison
  console.log('Page\tTime\tItems\tPoint\tPolygon\tLine');
  console.log('----\t----\t-----\t-----\t-------\t----');

  let cumTime = 0;
  let cumItems = 0;
  let cumPoint = 0;
  let cumPoly = 0;
  let cumLine = 0;

  for (let p = 1; p <= Math.min(10, first.totalPages); p++) {
    const r = await fetchPage(type, p);
    cumTime += r.elapsed;
    cumItems += r.total;
    cumPoint += r.Point;
    cumPoly += r.Polygon;
    cumLine += r.LineString;
    console.log(`${r.page}\t${r.elapsed}ms\t${r.total}\t${r.Point}\t${r.Polygon}\t${r.LineString}`);
  }

  console.log('----\t----\t-----\t-----\t-------\t----');
  console.log(`Tot\t${cumTime}ms\t${cumItems}\t${cumPoint}\t${cumPoly}\t${cumLine}`);

  return {
    type,
    typeName,
    totalResults: first.totalResults,
    totalPages: first.totalPages,
    first10Pages: { time: cumTime, items: cumItems, points: cumPoint, polygons: cumPoly, lines: cumLine }
  };
}

async function main() {
  console.log('📊 API Performance & Data Distribution Test');
  console.log('Using CORRECT parameter: greencodetype\n');

  const results = [];
  results.push(await analyzeType('1', 'Vegetation'));
  results.push(await analyzeType('2', 'Urban Furniture'));
  results.push(await analyzeType('3', 'Management'));

  // Summary
  console.log('\n\n========== SUMMARY ==========\n');
  console.log('Type\tName\t\t\tTotal\tPages\t10-Page Time\t10-Page Items');
  console.log('----\t----\t\t\t-----\t-----\t------------\t-------------');
  for (const r of results) {
    const name = r.typeName.padEnd(20);
    console.log(`${r.type}\t${name}\t${r.totalResults}\t${r.totalPages}\t${r.first10Pages.time}ms\t\t${r.first10Pages.items}`);
  }

  console.log('\n--- Recommendation ---');
  for (const r of results) {
    const avgPageTime = Math.round(r.first10Pages.time / 10);
    const pagesFor5Sec = Math.floor(5000 / avgPageTime);
    const itemsIn5Sec = pagesFor5Sec * 500;
    console.log(`Type ${r.type}: ~${avgPageTime}ms/page → ${pagesFor5Sec} pages in 5 sec → ~${itemsIn5Sec} items`);
  }
}

main().catch(console.error);
