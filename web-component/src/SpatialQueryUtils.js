
export function bboxToPolygon(bounds) {
  const w = bounds.getWest();
  const s = bounds.getSouth();
  const e = bounds.getEast();
  const n = bounds.getNorth();

  return `POLYGON((${w} ${s}, ${e} ${s}, ${e} ${n}, ${w} ${n}, ${w} ${s}))`;
}

export function buildRadiusQuery(center, radiusMeters) {
  return {
    latitude: center.lat.toFixed(6),
    longitude: center.lng.toFixed(6),
    radius: Math.round(radiusMeters)
  };
}

export function buildPolygonQuery(bounds, options = {}) {
  let polygon = bboxToPolygon(bounds);
  if (options.srid) polygon += `;SRID=${options.srid}`;
  return { polygon };
}


export function calculateRadiusFromBounds(bounds) {
  const c = bounds.getCenter();
  const ne = bounds.getNorthEast();

  const R = 6371000;
  const lat1 = c.lat * Math.PI / 180;
  const lat2 = ne.lat * Math.PI / 180;
  const dLat = (ne.lat - c.lat) * Math.PI / 180;
  const dLng = (ne.lng - c.lng) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(dLng / 2) ** 2;

  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function shrinkBounds(bounds, zoom) {
  const factor = zoom < 13 ? 0.6 : 0.8;

  const cx = (bounds.getWest() + bounds.getEast()) / 2;
  const cy = (bounds.getSouth() + bounds.getNorth()) / 2;

  const w = (bounds.getEast() - bounds.getWest()) * factor / 2;
  const h = (bounds.getNorth() - bounds.getSouth()) * factor / 2;

  return {
    getWest: () => cx - w,
    getEast: () => cx + w,
    getSouth: () => cy - h,
    getNorth: () => cy + h,
    getCenter: () => bounds.getCenter()
  };
}


export function getLayersForZoom(zoom, userSelectedType) {
  if (userSelectedType) return [userSelectedType];

  if (zoom <= 10) return ['3'];           
  if (zoom <= 12) return ['3', '1'];      
  if (zoom <= 14) return ['3', '1', '2']; 
  return ['1', '2', '3'];                 
}

export function chooseSpatialStrategy(greenCodeType, zoom, bounds) {
  const center = bounds.getCenter();
  const shrunk = shrinkBounds(bounds, zoom);
  const radius = calculateRadiusFromBounds(bounds);


  if (zoom <= 10) {
    return {
      type: 'radius',
      params: buildRadiusQuery(center, Math.min(radius, 20000))
    };
  }

  if (greenCodeType === '2') {
    return {
      type: 'radius',
      params: buildRadiusQuery(center, zoom >= 13 ? 1500 : 3000)
    };
  }

  return {
    type: 'polygon',
    params: buildPolygonQuery(shrunk)
  };
}


export function getGeometryStrategy(zoom) {
  if (zoom <= 11) {
    return { includeFullGeometry: false, simplificationTolerance: 0.001 };
  }
  if (zoom <= 13) {
    return { includeFullGeometry: true, simplificationTolerance: 0.0005 };
  }
  if (zoom <= 15) {
    return { includeFullGeometry: true, simplificationTolerance: 0.0001 };
  }
  return { includeFullGeometry: true, simplificationTolerance: 0.00005 };
}


export function getTileKey(bounds, zoom, layerType = 'all') {
  const c = bounds.getCenter();
  const z = Math.floor(zoom);
  const n = Math.pow(2, z);

  const x = Math.floor(((c.lng + 180) / 360) * n);
  const y = Math.floor(
    (1 - Math.log(Math.tan(c.lat * Math.PI / 180) + 1 / Math.cos(c.lat * Math.PI / 180)) / Math.PI) / 2 * n
  );


  return `urbangreen:v2:${z}:${x}:${y}:${layerType}`;
}

export function buildAPIUrl(baseEndpoint, spatialParams, options = {}) {
  const url = new URL(baseEndpoint);

  Object.entries(spatialParams).forEach(([k, v]) => {
    url.searchParams.set(k, v);
  });

  if (options.pagesize) url.searchParams.set('pagesize', options.pagesize);
  if (options.pagenumber) url.searchParams.set('pagenumber', options.pagenumber);


  if (options.greenCodeType) url.searchParams.set('type', options.greenCodeType);
  if (options.activeOnly) url.searchParams.set('active', 'true');

  const lang = options.language || 'en';

  url.searchParams.append('fields', 'Id');
  url.searchParams.append('fields', 'Active');
  url.searchParams.append('fields', 'GreenCode');
  url.searchParams.append('fields', 'GreenCodeType');
  url.searchParams.append('fields', 'GreenCodeSubtype');
  url.searchParams.append('fields', 'Shortname');
  url.searchParams.append('fields', 'Geo');
  url.searchParams.append('fields', `Detail.${lang}`);


  url.searchParams.set('removenullvalues', 'false');
  url.searchParams.set('getasidarray', 'false');

  return url.toString();
}


export function getOptimalPageSize(zoom) {
  if (zoom <= 10) return 100;
  if (zoom <= 13) return 150;
  if (zoom <= 15) return 250;
  return 400;
}

export function getMaxPagesForZoom(zoom) {
  if (zoom <= 11) return 1;
  if (zoom <= 13) return 2;
  if (zoom <= 15) return 3;
  return 999;
}