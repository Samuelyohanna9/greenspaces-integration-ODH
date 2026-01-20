/**
 * UrbanGreen Map - ULTIMATE VERSION with Full Visibility
 * 
 * FEATURES:
 * - All 3 types visible (Vegetation, Furniture, Zones)
 * - Points vs Polygons visually distinct
 * - Detailed feature breakdown (Points/Polygons count)
 * - Better colors and outlines for all polygon types
 * - Debug mode to see what's rendering
 */

import maplibregl from "https://cdn.jsdelivr.net/npm/maplibre-gl@4/+esm";

const DEFAULT_CENTER = [11.8768, 45.4064];
const DEFAULT_ZOOM = 12;
const DEFAULT_LANG = "en";

// GreenCode Types - Complete and accurate
const GREEN_CODE_TYPES = {
  "": { name: "All Types", color: "#9C27B0" },
  "1": { name: "Vegetation", color: "#4CAF50", pointColor: "#2E7D32", polyColor: "#81C784" },
  "2": { name: "Furniture", color: "#8D6E63", pointColor: "#5D4037", polyColor: "#A1887F" },
  "3": { name: "Zones", color: "#2196F3", pointColor: "#1565C0", polyColor: "#64B5F6" }
};

class UrbanGreenMapGL extends HTMLElement {
  static get observedAttributes() {
    return ["tile-server", "lang", "height", "type-filter", "debug"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.map = null;
    this.featureBreakdown = { points: {}, polygons: {} };
  }

  connectedCallback() {
    this.renderLayout();
    this.initMap();
  }

  disconnectedCallback() {
    this.map?.remove();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (!this.shadowRoot) return;

    if (name === "height") {
      const mapDiv = this.shadowRoot.querySelector("#map");
      if (mapDiv) mapDiv.style.height = this.height;
      this.map?.resize();
    }

    if (name === "type-filter" && oldVal !== newVal && this.map) {
      this.updateMapFilter();
    }

    if ((name === "lang" || name === "tile-server") && oldVal !== newVal && this.map) {
      this.updateStyle();
    }
  }

  get tileServer() {
    return this.getAttribute("tile-server") || "https://urbangreen-tiles.urbangreen1.workers.dev";
  }
  
  get lang() {
    return this.getAttribute("lang") || DEFAULT_LANG;
  }
  
  get height() {
    return this.getAttribute("height") || "700px";
  }

  get typeFilter() {
    return this.getAttribute("type-filter") || "";
  }

  get debug() {
    return this.hasAttribute("debug");
  }

  renderLayout() {
    this.shadowRoot.innerHTML = `
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/maplibre-gl@4/dist/maplibre-gl.css">
      <style>
        :host { display: block; }
        .map-container { 
          font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; 
          position: relative; 
        }
        .header { 
          padding: 12px; 
          background: linear-gradient(135deg, #10b981 0%, #059669 100%); 
          color: white; 
          display: flex; 
          gap: 8px; 
          align-items: center;
          flex-wrap: wrap;
        }
        .badge { 
          padding: 2px 8px; 
          background: rgba(255,255,255,0.2); 
          border-radius: 3px; 
          font-size: 0.85em; 
          font-weight: 700; 
        }
        .controls { 
          margin-left: auto; 
          display: flex; 
          gap: 8px;
          flex-wrap: wrap;
        }
        .control-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .control-label {
          font-size: 0.75em;
          opacity: 0.9;
        }
        select { 
          padding: 6px 10px; 
          border-radius: 4px; 
          border: 1px solid rgba(255,255,255,0.3);
          background: rgba(255,255,255,0.95);
          font-size: 0.9em;
          cursor: pointer;
          min-width: 140px;
        }
        select:hover {
          background: white;
        }
        .info { 
          padding: 8px 12px; 
          background: #e1f5fe; 
          border-bottom: 1px solid #03a9f4; 
          font-size: 0.9em;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
        }
        .legend {
          display: flex;
          gap: 16px;
          font-size: 0.85em;
          flex-wrap: wrap;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .legend-symbols {
          display: flex;
          gap: 4px;
        }
        .legend-circle {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          border: 1px solid rgba(0,0,0,0.3);
        }
        .legend-square {
          width: 10px;
          height: 10px;
          border-radius: 2px;
          border: 1px solid rgba(0,0,0,0.3);
        }
        #map { width: 100%; height: ${this.height}; }
        .status { 
          padding: 8px 12px; 
          background: #f5f5f5; 
          border-top: 1px solid #ddd; 
          font-size: 0.9em;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
        }
        .status-left { 
          display: flex; 
          gap: 16px; 
          flex-wrap: wrap; 
        }
        .status-item { 
          display: flex; 
          gap: 4px; 
          align-items: center; 
        }
        .status-label { color: #666; }
        .status-value { 
          font-weight: 600; 
          color: #059669; 
        }
        .breakdown {
          display: flex;
          gap: 12px;
          font-size: 0.85em;
          flex-wrap: wrap;
        }
        .breakdown-item {
          background: white;
          padding: 4px 8px;
          border-radius: 4px;
          border: 1px solid #ddd;
        }
        .loading { 
          display: inline-block; 
          width: 8px; 
          height: 8px; 
          background: #059669; 
          border-radius: 50%; 
          animation: pulse 1s infinite; 
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      </style>

      <div class="map-container">
        <div class="header">
          <strong>🚀 UrbanGreen</strong>
          <span class="badge">Dynamic Tiles</span>
          <span class="badge">Full Dataset ✓</span>
          
          <div class="controls">
            <div class="control-group">
              <span class="control-label">Language</span>
              <select id="lang">
                <option value="en">English</option>
                <option value="it">Italiano</option>
                <option value="de">Deutsch</option>
              </select>
            </div>
            
            <div class="control-group">
              <span class="control-label">Feature Type</span>
              <select id="type-filter">
                <option value="">All Types</option>
                <option value="1">🌳 Vegetation</option>
                <option value="2">🏛️ Furniture</option>
                <option value="3">🏞️ Zones</option>
              </select>
            </div>
          </div>
        </div>

        <div class="info">
          <div>
            ⚡ <strong>Viewport loading:</strong> Showing features in current view
          </div>
          <div class="legend">
            <div class="legend-item">
              <div class="legend-symbols">
                <div class="legend-circle" style="background: #2E7D32;"></div>
                <div class="legend-square" style="background: #81C784;"></div>
              </div>
              <span>Vegetation (●=tree, ◼=lawn)</span>
            </div>
            <div class="legend-item">
              <div class="legend-symbols">
                <div class="legend-circle" style="background: #5D4037;"></div>
                <div class="legend-square" style="background: #A1887F;"></div>
              </div>
              <span>Furniture (●=item, ◼=area)</span>
            </div>
            <div class="legend-item">
              <div class="legend-symbols">
                <div class="legend-circle" style="background: #1565C0;"></div>
                <div class="legend-square" style="background: #64B5F6;"></div>
              </div>
              <span>Zones (●=point, ◼=polygon)</span>
            </div>
          </div>
        </div>

        <div id="map"></div>
        
        <div class="status" id="status">
          <div class="status-left">
            <div class="status-item">
              <span class="status-label">Status:</span>
              <span class="status-value" id="status-text">Initializing...</span>
            </div>
            <div class="status-item">
              <span class="status-label">Tiles:</span>
              <span class="status-value" id="tiles-loaded">0</span>
            </div>
            <div class="status-item">
              <span class="status-label">Total:</span>
              <span class="status-value" id="features-total">0</span>
            </div>
          </div>
          
          <div class="breakdown" id="breakdown">
            <div class="breakdown-item">
              <strong>Points:</strong> <span id="points-count">0</span>
            </div>
            <div class="breakdown-item">
              <strong>Polygons:</strong> <span id="polygons-count">0</span>
            </div>
          </div>
          
          <div id="loading-indicator" style="display: none;">
            <span class="loading"></span>
          </div>
        </div>
      </div>
    `;

    const langSel = this.shadowRoot.querySelector("#lang");
    langSel.value = this.lang;
    langSel.addEventListener("change", (e) => {
      this.setAttribute("lang", e.target.value);
    });

    const typeSel = this.shadowRoot.querySelector("#type-filter");
    typeSel.value = this.typeFilter;
    typeSel.addEventListener("change", (e) => {
      this.setAttribute("type-filter", e.target.value);
    });
  }

  setStatus(msg, loading = false) {
    const el = this.shadowRoot.querySelector("#status-text");
    const loadingEl = this.shadowRoot.querySelector("#loading-indicator");
    
    if (el) el.textContent = msg;
    if (loadingEl) loadingEl.style.display = loading ? 'block' : 'none';
  }

  updateTileCount(count) {
    const el = this.shadowRoot.querySelector("#tiles-loaded");
    if (el) el.textContent = count;
  }

  updateFeatureCounts() {
    if (!this.map) return;

    const pointFeatures = this.map.queryRenderedFeatures({
      layers: ['urbangreen-points']
    });
    
    const polyFeatures = this.map.queryRenderedFeatures({
      layers: ['urbangreen-polygons']
    });

    const totalCount = pointFeatures.length + polyFeatures.length;

    // Update UI
    const totalEl = this.shadowRoot.querySelector("#features-total");
    const pointsEl = this.shadowRoot.querySelector("#points-count");
    const polygonsEl = this.shadowRoot.querySelector("#polygons-count");

    if (totalEl) totalEl.textContent = totalCount.toLocaleString();
    if (pointsEl) pointsEl.textContent = pointFeatures.length.toLocaleString();
    if (polygonsEl) polygonsEl.textContent = polyFeatures.length.toLocaleString();

    // Debug logging
    if (this.debug) {
      const byType = {};
      [...pointFeatures, ...polyFeatures].forEach(f => {
        const type = f.properties.type;
        const geom = f.geometry.type;
        const key = `Type ${type} (${geom})`;
        byType[key] = (byType[key] || 0) + 1;
      });
      console.log('Feature breakdown:', byType);
    }
  }

  getMapFilter() {
    const type = this.typeFilter;
    if (!type) return ["has", "type"];
    return ["==", ["get", "type"], type];
  }

  buildStyle() {
    const filter = this.getMapFilter();

    return {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "© OpenStreetMap",
        },
        urbangreen: {
          type: "vector",
          tiles: [`${this.tileServer}/tiles/${this.lang}/{z}/{x}/{y}.pbf`],
          minzoom: 10,
          maxzoom: 16,
        },
      },
      layers: [
        { id: "osm-tiles", type: "raster", source: "osm" },

        // POLYGONS - Highly visible with distinct colors
        {
          id: "urbangreen-polygons",
          type: "fill",
          source: "urbangreen",
          "source-layer": "urbangreen",
          filter: ["all",
            ["==", ["geometry-type"], "Polygon"],
            filter
          ],
          paint: {
            "fill-color": [
              "match",
              ["get", "type"],
              "1", "#81C784", // Light green for vegetation polygons (lawns, flowerbeds)
              "2", "#A1887F", // Light brown for furniture polygons
              "3", "#64B5F6", // Light blue for zone polygons
              "#CE93D8"       // Light purple default
            ],
            "fill-opacity": 0.4, // Semi-transparent
          },
        },
        {
          id: "urbangreen-polygons-outline",
          type: "line",
          source: "urbangreen",
          "source-layer": "urbangreen",
          filter: ["all",
            ["==", ["geometry-type"], "Polygon"],
            filter
          ],
          paint: { 
            "line-color": [
              "match",
              ["get", "type"],
              "1", "#2E7D32", // Dark green outline
              "2", "#5D4037", // Dark brown outline
              "3", "#1565C0", // Dark blue outline
              "#6A1B9A"       // Dark purple default
            ],
            "line-width": 2,
            "line-opacity": 0.9
          },
        },

        // POINTS - Darker colors to distinguish from polygons
        {
          id: "urbangreen-points",
          type: "circle",
          source: "urbangreen",
          "source-layer": "urbangreen",
          filter: ["all",
            ["==", ["geometry-type"], "Point"],
            filter
          ],
          paint: {
            "circle-radius": [
              "interpolate", 
              ["linear"], 
              ["zoom"], 
              10, 4,
              14, 7,
              18, 12
            ],
            "circle-color": [
              "match",
              ["get", "type"],
              "1", "#2E7D32", // Dark green for vegetation points (trees)
              "2", "#5D4037", // Dark brown for furniture points
              "3", "#1565C0", // Dark blue for zone points
              "#6A1B9A"       // Dark purple default
            ],
            "circle-opacity": 0.85,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
          },
        },
      ],
    };
  }

  updateMapFilter() {
    if (!this.map) return;

    const filter = this.getMapFilter();

    this.map.setFilter("urbangreen-points", [
      "all",
      ["==", ["geometry-type"], "Point"],
      filter
    ]);

    this.map.setFilter("urbangreen-polygons", [
      "all",
      ["==", ["geometry-type"], "Polygon"],
      filter
    ]);

    this.map.setFilter("urbangreen-polygons-outline", [
      "all",
      ["==", ["geometry-type"], "Polygon"],
      filter
    ]);

    setTimeout(() => this.updateFeatureCounts(), 100);
  }

  initMap() {
    const mapDiv = this.shadowRoot.querySelector("#map");

    this.map = new maplibregl.Map({
      container: mapDiv,
      style: this.buildStyle(),
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    });

    this.map.addControl(new maplibregl.NavigationControl(), "top-right");
    this.map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 100, unit: "metric" }), 
      "bottom-left"
    );

    let tilesLoaded = 0;
    
    this.map.on('data', (e) => {
      if (e.sourceId === 'urbangreen' && e.isSourceLoaded) {
        tilesLoaded++;
        this.updateTileCount(tilesLoaded);
        this.updateFeatureCounts();
      }
    });

    this.map.on("load", () => {
      this.setStatus("✓ Ready", false);
      this.updateFeatureCounts();
    });

    this.map.on("dataloading", (e) => {
      if (e.sourceId === 'urbangreen') {
        this.setStatus("Loading...", true);
      }
    });

    this.map.on("idle", () => {
      this.setStatus("✓ Ready", false);
      this.updateFeatureCounts();
    });

    this.map.on("moveend", () => {
      this.updateFeatureCounts();
    });

    this.map.on("error", (e) => {
      console.error("Map error:", e);
      this.setStatus(`Error: ${e.error?.message || "Unknown error"}`, false);
    });

    const popupHTML = (props, geomType) => {
      const typeNames = { 
        "1": "Vegetation", 
        "2": "Furniture", 
        "3": "Zone"
      };
      
      const typeColors = {
        "1": "#2E7D32",
        "2": "#5D4037",
        "3": "#1565C0"
      };

      const geomEmoji = geomType === 'Point' ? '●' : '◼';
      const geomLabel = geomType === 'Point' ? 'Point' : 'Polygon';

      return `
        <div style="font-family: sans-serif; min-width: 220px;">
          <h3 style="margin: 0 0 8px 0; font-size: 14px; color: ${typeColors[props.type] || '#6A1B9A'};">
            ${geomEmoji} ${props.title}
          </h3>
          <div style="font-size: 12px; color: #666; line-height: 1.6;">
            <div style="margin-bottom: 4px;">
              <strong>Type:</strong> ${typeNames[props.type] || "Unknown"} (${props.type})
            </div>
            <div style="margin-bottom: 4px;">
              <strong>Geometry:</strong> ${geomLabel}
            </div>
            <div style="margin-bottom: 4px;">
              <strong>Code:</strong> ${props.code}
            </div>
            <div style="margin-bottom: 4px;">
              <strong>Status:</strong> ${props.active ? "✅ Active" : "❌ Inactive"}
            </div>
            <div style="font-size: 10px; color: #999; margin-top: 6px;">
              ID: ${props.id}
            </div>
          </div>
        </div>
      `;
    };

    const bindClick = (layerId) => {
      this.map.on("click", layerId, (e) => {
        if (!e.features?.length) return;
        const feature = e.features[0];
        const props = feature.properties;
        const geomType = feature.geometry.type;
        
        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(popupHTML(props, geomType))
          .addTo(this.map);
      });
      
      this.map.on("mouseenter", layerId, () => {
        this.map.getCanvas().style.cursor = "pointer";
      });
      
      this.map.on("mouseleave", layerId, () => {
        this.map.getCanvas().style.cursor = "";
      });
    };

    bindClick("urbangreen-points");
    bindClick("urbangreen-polygons");
  }

  updateStyle() {
    if (!this.map) return;
    this.setStatus(`↻ Reloading: ${this.lang.toUpperCase()}`, true);
    this.map.setStyle(this.buildStyle());
  }
}

customElements.define("r3gis-urbangreen-gl", UrbanGreenMapGL);