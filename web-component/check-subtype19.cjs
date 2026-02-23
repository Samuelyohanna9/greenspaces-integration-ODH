const https = require('https');

const API_BASE = 'https://api.tourism.testingmachine.eu/v1/UrbanGreen';

function fetchPage(page) {
  const url = `${API_BASE}?fields=Id&fields=GreenCodeType&fields=GreenCodeSubtype&fields=Geo&pagesize=500&pagenumber=${page}&greencodetype=2&active=true`;

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

async function main() {
  console.log('Looking for subtype 19 (Waste bins) in first 8 pages...\n');

  let found = [];

  for (let p = 1; p <= 8; p++) {
    const data = await fetchPage(p);

    data.Items.forEach(item => {
      const subtype = item.GreenCodeSubtype;
      // Check for subtype 19 in various formats
      if (subtype == 19 || subtype === '19' || subtype === 19) {
        found.push({
          id: item.Id,
          subtype: subtype,
          subtypeType: typeof subtype,
          hasGeo: !!item.Geo
        });
      }
    });

    process.stdout.write(`Page ${p}/8 - found ${found.length} so far\r`);
  }

  console.log(`\n\nFound ${found.length} items with subtype 19:`);
  console.log('First 5 examples:');
  found.slice(0, 5).forEach(item => {
    console.log(`  ID: ${item.id}, Subtype: ${item.subtype} (${item.subtypeType}), HasGeo: ${item.hasGeo}`);
  });

  // Check if the subtype is stored as number or string
  const types = [...new Set(found.map(f => f.subtypeType))];
  console.log(`\nSubtype value types found: ${types.join(', ')}`);
}

main().catch(console.error);
