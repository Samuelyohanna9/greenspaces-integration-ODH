/**
 * Ultra-fast spatial indexing using RBush
 * Enables instant viewport queries on massive datasets
 */
import RBush from 'rbush';

export class SpatialIndex {
  constructor() {
    this.tree = new RBush();
    this.featureMap = new Map(); // id -> feature
    this.indexed = false;
  }

  /**
   * Build spatial index from features
   */
  buildIndex(features) {
    const start = performance.now();

    this.tree.clear();
    this.featureMap.clear();

    const items = [];

    for (const feature of features) {
      if (!feature || !feature.geometry) continue;

      const bounds = this.getFeatureBounds(feature);
      if (!bounds) continue;

      const item = {
        minX: bounds.minX,
        minY: bounds.minY,
        maxX: bounds.maxX,
        maxY: bounds.maxY,
        id: feature.properties.id
      };

      items.push(item);
      this.featureMap.set(feature.properties.id, feature);
    }

    this.tree.load(items);
    this.indexed = true;

    const elapsed = (performance.now() - start).toFixed(0);
    console.log(`✓ Spatial index built: ${items.length} features in ${elapsed}ms`);

    return items.length;
  }

  /**
   * Get bounding box for a feature
   */
  getFeatureBounds(feature) {
    const geom = feature.geometry;

    if (geom.type === 'Point') {
      const [lng, lat] = geom.coordinates;
      return {
        minX: lng,
        minY: lat,
        maxX: lng,
        maxY: lat
      };
    }

    if (geom.type === 'Polygon') {
      const coords = geom.coordinates[0];
      if (!coords || coords.length === 0) return null;

      let minX = Infinity, minY = Infinity;
      let maxX = -Infinity, maxY = -Infinity;

      for (const [lng, lat] of coords) {
        if (lng < minX) minX = lng;
        if (lng > maxX) maxX = lng;
        if (lat < minY) minY = lat;
        if (lat > maxY) maxY = lat;
      }

      return { minX, minY, maxX, maxY };
    }

    return null;
  }

  /**
   * Query features in viewport bounds (ULTRA FAST)
   */
  queryViewport(bounds) {
    if (!this.indexed) return [];

    const start = performance.now();

    // bounds = { west, south, east, north }
    const results = this.tree.search({
      minX: bounds.west,
      minY: bounds.south,
      maxX: bounds.east,
      maxY: bounds.north
    });

    const features = results.map(item => this.featureMap.get(item.id)).filter(Boolean);

    const elapsed = (performance.now() - start).toFixed(1);
    console.log(`🎯 Spatial query: ${features.length} features in ${elapsed}ms`);

    return features;
  }

  /**
   * Get all features
   */
  getAllFeatures() {
    return Array.from(this.featureMap.values());
  }

  /**
   * Clear index
   */
  clear() {
    this.tree.clear();
    this.featureMap.clear();
    this.indexed = false;
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      indexed: this.indexed,
      totalFeatures: this.featureMap.size,
      treeSize: this.tree.all().length
    };
  }
}
