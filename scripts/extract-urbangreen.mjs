// script/extract-urbangreen.mjs
import fs from 'fs';
import fetch from 'node-fetch';
import wellknown from 'wellknown';

const URL =
  'https://api.tourism.testingmachine.eu/v1/UrbanGreen' +
  '?pagenumber=1' +
  '&pagesize=2000000' +
  '&fields=Geo' +
  '&fields=Detail.en' +
  '&fields=GreenCodeType' +
  '&fields=GreenCode' +
  '&fields=Active' +
  '&removenullvalues=false' +
  '&getasidarray=false';

console.log('Fetching UrbanGreen bulk dataset...');
const res = await fetch(URL);
const json = await res.json();

console.log(`Items received: ${json.Items.length}`);

const features = json.Items.map(item => {
  const geoArr = Array.isArray(item.Geo)
    ? item.Geo
    : Object.values(item.Geo || {});

  const geo = geoArr.find(g => g?.Geometry) || null;
  if (!geo) return null;

  const geometry = wellknown(geo.Geometry);
  if (!geometry) return null;

  return {
    type: 'Feature',
    geometry,
    properties: {
      id: item.Id,
      title: item.Detail?.en?.Title || '',
      greenCodeType: String(item.GreenCodeType || ''),
      greenCode: item.GreenCode || '',
      isActive: item.Active === true
    }
  };
}).filter(Boolean);

const geojson = {
  type: 'FeatureCollection',
  features
};

fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/urbangreen.geojson', JSON.stringify(geojson));

console.log(`GeoJSON written: ${features.length} features`);
