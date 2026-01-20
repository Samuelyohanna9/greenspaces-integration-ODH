/**
 * Smart Data Optimizer for ODH GreenSpaces
 * 
 * Reduces massive datasets by:
 * 1. Viewport filtering (only visible features)
 * 2. Geometry simplification (reduce vertices)
 * 3. Clustering (combine nearby points)
 * 4. Zoom-based detail (progressive loading)
 * 5. Property reduction (only needed fields)
 */

import * as turf from '@turf/turf';
import Supercluster from 'supercluster';

export class ODHDataOptimizer {
  constructor(config = {}) {
    this.config = {
      simplificationTolerance: config.simplificationTolerance || 0.0001,
      clusterRadius: config.clusterRadius || 40,
      clusterMaxZoom: config.clusterMaxZoom || 16,
      minZoomForDetail: config.minZoomForDetail || 14,
      ...config
    };
    
    this.cluster = new Supercluster({
      radius: this.config.clusterRadius,
      maxZoom: this.config.clusterMaxZoom,
      reduce: (acc, props) => {
        // Combine properties from clustered features
        acc.types = acc.types || {};
        acc.types[props.type] = (acc.types[props.type] || 0) + 1;
      },
      map: (props) => ({ type: props.type })
    });
    
    this.rawData = null;
    this.processedData = null;
  }

  /**
   * Main optimization pipeline
   */
  async optimizeData(rawFeatures, bounds, zoom) {
    console.time('🎯 Data Optimization');
    
    // Step 1: Filter by viewport (HUGE reduction)
    const viewportFeatures = this.filterByViewport(rawFeatures, bounds);
    console.log(`📍 Viewport filter: ${rawFeatures.length} → ${viewportFeatures.length}`);
    
    // Step 2: Separate points and polygons
    const points = viewportFeatures.filter(f => 
      f.geometry.type === 'Point'
    );
    const polygons = viewportFeatures.filter(f => 
      f.geometry.type === 'Polygon' || 
      f.geometry.type === 'MultiPolygon'
    );
    
    // Step 3: Simplify polygons (reduce vertices)
    const simplifiedPolygons = this.simplifyPolygons(polygons, zoom);
    console.log(`🔺 Simplified polygons: ${this.countVertices(polygons)} → ${this.countVertices(simplifiedPolygons)} vertices`);
    
    // Step 4: Cluster points at low zoom
    let processedPoints;
    if (zoom < this.config.clusterMaxZoom) {
      processedPoints = this.clusterPoints(points, bounds, zoom);
      console.log(`📊 Clustered points: ${points.length} → ${processedPoints.length}`);
    } else {
      processedPoints = points;
    }
    
    // Step 5: Reduce properties based on zoom
    const optimizedFeatures = [
      ...processedPoints,
      ...simplifiedPolygons
    ].map(f => this.reduceProperties(f, zoom));
    
    console.timeEnd('🎯 Data Optimization');
    console.log(`✅ Final: ${optimizedFeatures.length} features (${this.estimateSize(optimizedFeatures)} KB)`);
    
    return {
      type: 'FeatureCollection',
      features: optimizedFeatures
    };
  }

  /**
   * Filter features by viewport bounds
   */
  filterByViewport(features, bounds) {
    if (!bounds) return features;
    
    const [west, south, east, north] = bounds;
    const bboxPolygon = turf.bboxPolygon([west, south, east, north]);
    
    return features.filter(feature => {
      try {
        // Check if feature intersects with viewport
        return turf.booleanIntersects(feature, bboxPolygon);
      } catch (e) {
        // If geometry is invalid, include it (edge case)
        return true;
      }
    });
  }

  /**
   * Simplify polygon geometries
   */
  simplifyPolygons(polygons, zoom) {
    // More simplification at lower zoom levels
    const tolerance = zoom < 12 ? 0.001 : 
                     zoom < 14 ? 0.0005 : 
                     this.config.simplificationTolerance;
    
    return polygons.map(feature => {
      try {
        return turf.simplify(feature, {
          tolerance: tolerance,
          highQuality: false
        });
      } catch (e) {
        console.warn('Failed to simplify feature:', e);
        return feature;
      }
    });
  }

  /**
   * Cluster points using Supercluster
   */
  clusterPoints(points, bounds, zoom) {
    if (!points.length) return [];
    
    // Load points into cluster index
    this.cluster.load(points);
    
    // Get clusters for current viewport
    const clusters = this.cluster.getClusters(bounds, Math.floor(zoom));
    
    // Convert cluster format to GeoJSON features
    return clusters.map(cluster => {
      if (cluster.properties.cluster) {
        // It's a cluster
        return {
          type: 'Feature',
          geometry: cluster.geometry,
          properties: {
            cluster: true,
            cluster_id: cluster.properties.cluster_id,
            point_count: cluster.properties.point_count,
            types: cluster.properties.types || {}
          }
        };
      } else {
        // It's an individual point (at high zoom)
        return cluster;
      }
    });
  }

  /**
   * Reduce properties based on zoom level
   */
  reduceProperties(feature, zoom) {
    const props = feature.properties;
    
    if (props.cluster) {
      // Cluster - keep minimal info
      return feature;
    }
    
    // At low zoom, keep only essential fields
    if (zoom < 12) {
      return {
        ...feature,
        properties: {
          type: props.type,
          id: props.id
        }
      };
    }
    
    // At medium zoom, add some detail
    if (zoom < this.config.minZoomForDetail) {
      return {
        ...feature,
        properties: {
          type: props.type,
          id: props.id,
          title: props.title,
          code: props.code
        }
      };
    }
    
    // At high zoom, keep all properties
    return feature;
  }

  /**
   * Count total vertices in features (for debugging)
   */
  countVertices(features) {
    return features.reduce((total, feature) => {
      const coords = turf.getCoords(feature);
      return total + JSON.stringify(coords).match(/\[/g).length;
    }, 0);
  }

  /**
   * Estimate size in KB
   */
  estimateSize(features) {
    const json = JSON.stringify(features);
    return (json.length / 1024).toFixed(2);
  }
}


/**
 * Usage Example with MapLibre
 */
export class OptimizedODHSource {
  constructor(map, odhEndpoint) {
    this.map = map;
    this.endpoint = odhEndpoint;
    this.optimizer = new ODHDataOptimizer({
      simplificationTolerance: 0.0001,
      clusterRadius: 50,
      clusterMaxZoom: 14,
      minZoomForDetail: 15
    });
    
    this.cache = new Map();
    this.loading = false;
  }

  async initialize() {
    // Add source
    this.map.addSource('odh-optimized', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: []
      }
    });

    // Add layers
    this.addLayers();

    // Load data when map moves
    this.map.on('moveend', () => this.updateData());
    this.map.on('zoomend', () => this.updateData());

    // Initial load
    await this.updateData();
  }

  async updateData() {
    if (this.loading) return;
    
    this.loading = true;
    
    try {
      const bounds = this.map.getBounds().toArray().flat();
      const zoom = this.map.getZoom();
      
      // Fetch raw data (you might want to cache this)
      const rawData = await this.fetchODHData();
      
      // Optimize data
      const optimizedData = await this.optimizer.optimizeData(
        rawData.features,
        bounds,
        zoom
      );
      
      // Update map source
      this.map.getSource('odh-optimized').setData(optimizedData);
      
    } catch (error) {
      console.error('Failed to update data:', error);
    } finally {
      this.loading = false;
    }
  }

  async fetchODHData() {
    // Check cache first
    if (this.cache.has('full-data')) {
      return this.cache.get('full-data');
    }
    
    console.log('📥 Fetching from ODH...');
    const response = await fetch(this.endpoint);
    const data = await response.json();
    
    // Convert to GeoJSON if needed
    const geojson = this.convertToGeoJSON(data);
    
    // Cache it
    this.cache.set('full-data', geojson);
    
    return geojson;
  }

  convertToGeoJSON(odhData) {
    // Adjust this based on your ODH response format
    if (odhData.type === 'FeatureCollection') {
      return odhData;
    }
    
    // Example conversion for different format
    return {
      type: 'FeatureCollection',
      features: odhData.Items?.map(item => ({
        type: 'Feature',
        geometry: item.GpsInfo?.[0]?.Gpstype === 'position' 
          ? {
              type: 'Point',
              coordinates: [
                item.GpsInfo[0].Longitude,
                item.GpsInfo[0].Latitude
              ]
            }
          : null, // Handle polygons differently
        properties: {
          id: item.Id,
          title: item.Detail?.en?.Title || item.Shortname,
          type: item.Type,
          code: item.GreenCode,
          active: item.Active
        }
      })).filter(f => f.geometry !== null) || []
    };
  }

  addLayers() {
    // Cluster circles
    this.map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'odh-optimized',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': [
          'step',
          ['get', 'point_count'],
          '#51bbd6',
          10, '#f1f075',
          50, '#f28cb1'
        ],
        'circle-radius': [
          'step',
          ['get', 'point_count'],
          20,
          10, 30,
          50, 40
        ]
      }
    });

    // Cluster count
    this.map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: 'odh-optimized',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': '{point_count_abbreviated}',
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 12
      }
    });

    // Individual points
    this.map.addLayer({
      id: 'unclustered-point',
      type: 'circle',
      source: 'odh-optimized',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': [
          'match',
          ['get', 'type'],
          '1', '#2E7D32',
          '2', '#5D4037',
          '3', '#1565C0',
          '#6A1B9A'
        ],
        'circle-radius': 6,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#fff'
      }
    });
  }
}