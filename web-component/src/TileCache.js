const DB_NAME = 'UrbanGreenTileCache';
const DB_VERSION = 2;
const STORE_NAME = 'tiles';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

export class TileCache {
  constructor() {
    this.db = null;
    this.initPromise = null;
  }

  async init() {
    if (!this.isAvailable()) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (db.objectStoreNames.contains('geodata')) {
          db.deleteObjectStore('geodata');
        }
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp');
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => resolve();
    });

    return this.initPromise;
  }

  async get(tileKey) {
    if (!this.db) await this.init();
    if (!this.db) return null;

    return new Promise((resolve) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(tileKey);

      req.onsuccess = () => {
        const r = req.result;
        if (!r) return resolve(null);
        if (Date.now() - r.timestamp > CACHE_DURATION) {
          this.delete(tileKey);
          return resolve(null);
        }
        resolve(r.features); // ✅ ONLY FEATURES
      };

      req.onerror = () => resolve(null);
    });
  }

  async set(tileKey, features, metadata = {}) {
    if (!this.db) await this.init();
    if (!this.db) return;

    const parts = tileKey.split(':');
    const layerType = parts.at(-1);
    const y = Number(parts.at(-2));
    const x = Number(parts.at(-3));
    const z = Number(parts.at(-4));

    const record = {
      key: tileKey,
      z, x, y, layerType,
      features,
      metadata,
      timestamp: Date.now()
    };

    const tx = this.db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
  }

  async delete(tileKey) {
    if (!this.db) await this.init();
    if (!this.db) return;

    const tx = this.db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(tileKey);
  }

  async clear() {
    if (!this.db) await this.init();
    if (!this.db) return;

    const tx = this.db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
  }

  async getStats() {
    if (!this.db) await this.init();
    if (!this.db) return { totalTiles: 0 };

    return new Promise((resolve) => {
      const stats = { totalTiles: 0 };
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).openCursor();

      req.onsuccess = (e) => {
        const c = e.target.result;
        if (!c) return resolve(stats);
        stats.totalTiles++;
        c.continue();
      };

      req.onerror = () => resolve(stats);
    });
  }

  isAvailable() {
    return typeof indexedDB !== 'undefined';
  }
}
