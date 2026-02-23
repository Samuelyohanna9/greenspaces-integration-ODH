const https = require('https');

const API_BASE = 'https://api.tourism.testingmachine.eu/v1/UrbanGreen';

function fetchPage(type, page) {
  const url = `${API_BASE}?fields=Id&fields=GreenCodeType&fields=GreenCodeSubtype&fields=Detail&fields=Geo&pagesize=500&pagenumber=${page}&greencodetype=${type}&active=true`;

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

function extractName(detail) {
  if (!detail) return null;
  if (typeof detail === 'string') return detail;

  // Structure: detail.en.Title
  if (detail.en && detail.en.Title) return detail.en.Title;
  if (detail.it && detail.it.Title) return detail.it.Title;
  if (detail.de && detail.de.Title) return detail.de.Title;

  return null;
}

async function main() {
  console.log('Checking API for feature names...\n');

  const featuresBySubtype = {};

  for (const type of ['1', '2', '3']) {
    console.log(`Checking Type ${type}...`);

    for (let p = 1; p <= 8; p++) {
      const data = await fetchPage(type, p);

      data.Items.forEach(item => {
        const name = extractName(item.Detail);
        if (!name) return;

        const key = `${item.GreenCodeType}-${String(item.GreenCodeSubtype).padStart(2, '0')}`;
        if (!featuresBySubtype[key]) {
          featuresBySubtype[key] = {
            type: item.GreenCodeType,
            subtype: item.GreenCodeSubtype,
            names: {},
            total: 0
          };
        }

        featuresBySubtype[key].names[name] = (featuresBySubtype[key].names[name] || 0) + 1;
        featuresBySubtype[key].total++;
      });

      process.stdout.write(`  Page ${p}/8\r`);
    }
    console.log('');
  }

  console.log('\n=== All Feature Names by Type/Subtype ===\n');

  Object.keys(featuresBySubtype)
    .sort()
    .forEach(key => {
      const f = featuresBySubtype[key];
      console.log(`\n--- Type ${f.type}, Subtype ${f.subtype} (${f.total} items) ---`);

      // Sort names by count
      const sortedNames = Object.entries(f.names)
        .sort((a, b) => b[1] - a[1]);

      sortedNames.forEach(([name, count]) => {
        console.log(`  ${count}x "${name}"`);
      });
    });

  // Now search for user's specific features
  console.log('\n\n=== Searching for user-mentioned features ===\n');

  const userFeatures = [
    'Plastic-coated fence',
    'Concrete slabs kerb',
    'Metal fence',
    'Roadside',
    'Hedge',
    'Cement wall',
    'u-shaped bollard',
    'guardrail',
    'Planter',
    'Stone wall',
    'Picket fence',
    'Bike rack',
    'Wooden bench',
    'Green Road Bank',
    'Gravel paving'
  ];

  // Check all collected names
  for (const search of userFeatures) {
    let found = false;
    const searchLower = search.toLowerCase();

    for (const [key, f] of Object.entries(featuresBySubtype)) {
      for (const name of Object.keys(f.names)) {
        if (name.toLowerCase().includes(searchLower) || searchLower.includes(name.toLowerCase())) {
          console.log(`"${search}" → Type ${f.type}, Subtype ${f.subtype} ("${name}")`);
          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (!found) {
      console.log(`"${search}" → NOT FOUND (might need partial match search)`);
    }
  }
}

main().catch(console.error);
