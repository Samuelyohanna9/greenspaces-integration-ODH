import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as pmtiles from "pmtiles";
import Supercluster from "supercluster";
import { ViewportDataLoader } from "./ViewportDataLoader.js";
import { getGreenSpaceInfo } from "./GreenSpaceDictionary.js";

const DEFAULT_CENTER = [11.8768, 45.4064]; // Padova
const DEFAULT_ZOOM = 13;
const DEBOUNCE_MS = 300;
const LIVE_ZOOM_IN = 14.5;
const LIVE_ZOOM_OUT = 13.5;
const PMTILES_DEFAULT_URL = "https://pub-6af0cab720894f57a27ad4199ce3ffa3.r2.dev/urbangreen.pmtiles";
const PMTILES_SOURCE = "pmtiles";
const PMTILES_SOURCE_LAYER = "urbangreen";

const MAIN_TYPES = {
  "1": {
    name: "Vegetation",
    color: "#4CAF50",
    subcategories: {
      "all": {
        name: "All Vegetation",
        subtypes: null,
        geometries: null,
        color: "#4CAF50",
        multiColor: true,
        tooltip: "Trees, shrubs, hedges, lawns, flowerbeds, and ground cover"
      },
      "trees": {
        name: "Trees & Plants",
        subtypes: ["03"],
        geometries: ["Point"],
        icon: "ic-trees.svg",
        color: "#228B22",
        tooltip: "Individual trees, shrubs, and plant groups"
      },
      "hedges": {
        name: "Hedges & Roadsides",
        subtypes: ["03"],
        geometries: ["LineString"],
        icon: "hedge.svg",
        color: "#3CB371",
        tooltip: "Hedges, roadside vegetation, and tree lines"
      },
      "lawns": {
        name: "Lawns & Ground",
        subtypes: ["01"],
        geometries: ["Polygon"],
        icon: "lawn.svg",
        color: "#90EE90",
        tooltip: "Grass lawns, bare ground, green road banks, meadows"
      },
      "flowerbeds": {
        name: "Flowerbeds",
        subtypes: ["02"],
        geometries: ["Polygon"],
        icon: "flowerbed.svg",
        color: "#FF69B4",
        tooltip: "Flowerbeds, perennial beds, grated flowerbeds"
      }
    }
  },
  "2": {
    name: "Urban Furniture",
    color: "#8D6E63",
    subcategories: {
      // Grouped subcategories for better UX (6 groups instead of 14)
      "all": {
        name: "All Furniture",
        subtypes: null,
        geometries: null,
        color: "#8D6E63",
        multiColor: true,
        tooltip: "All urban furniture and infrastructure elements"
      },
      "street": {
        name: "Street Furniture",
        subtypes: ["14", "19", "24"],
        geometries: null,
        icon: "bench.svg",
        color: "#A0522D",
        tooltip: "Benches, litter bins, bollards, planters, bike racks, streetlamps, play equipment"
      },
      "boundaries": {
        name: "Boundaries",
        subtypes: ["15", "16", "17", "18"],
        geometries: ["LineString"],
        icon: null,
        color: "#8B4513",
        tooltip: "Walls, fences, gates, guardrails, kerbs"
      },
      "ground": {
        name: "Ground Surfaces",
        subtypes: ["05", "31", "42"],
        geometries: ["Polygon", "LineString"],
        icon: null,
        color: "#FF5722",
        tooltip: "Paving, stairs, ramps, safety surfacing"
      },
      "utilities": {
        name: "Utilities",
        subtypes: ["20", "21", "23", "32"],
        geometries: null,
        icon: null,
        color: "#607D8B",
        tooltip: "Manholes, hydrants, drainage pipes, irrigation systems"
      },
      "structures": {
        name: "Water & Structures",
        subtypes: ["04", "13", "22"],
        geometries: null,
        icon: null,
        color: "#03A9F4",
        tooltip: "Drinking fountains, water features, buildings, monuments, canopies"
      }
    }
  },
  "3": {
    name: "Use & Management",
    color: "#2196F3",
    subcategories: {
      "all": {
        name: "All Areas",
        subtypes: null,
        geometries: ["Polygon"],
        color: "#2196F3",
        multiColor: true,
        tooltip: "Management areas, activity zones, and temporary sites"
      },
      "boundary": {
        name: "Management Areas",
        subtypes: ["25"],
        geometries: ["Polygon"],
        icon: null,
        color: "#64B5F6",
        tooltip: "Green area boundaries and management zones"
      },
      "playground": {
        name: "Playgrounds & Sports",
        subtypes: ["27"],
        geometries: ["Polygon"],
        icon: null,
        color: "#FF6347",
        tooltip: "Playgrounds, sports areas, dog parks, community gardens"
      },
      "temporary": {
        name: "Construction Sites",
        subtypes: ["26"],
        geometries: ["Polygon"],
        icon: null,
        color: "#FFB74D",
        tooltip: "Active construction and temporary work zones"
      }
    }
  }
};


const SUBTYPE_COLORS = {
  // Vegetation (Type 1)
  "01": "#90EE90",  // Lawns & Ground - light green
  "02": "#FF69B4",  // Flowerbeds - hot pink
  "03": "#228B22",  // Trees/Shrubs/Hedges - forest green
  // Urban Furniture (Type 2) - based on API data analysis
  "04": "#03A9F4",  // Water features - light blue
  "05": "#FF5722",  // Paving - deep orange
  "08": "#9E9E9E",  // Roller rink - gray
  "09": "#81C784",  // Football pitch - light green
  "10": "#81C784",  // Futsal pitch - light green
  "11": "#81C784",  // Sport facility - light green
  "12": "#795548",  // Building - brown
  "13": "#9E9E9E",  // Structures (construction, canopy, monument) - gray
  "14": "#FFD700",  // Urban furniture points (bollards, planters, bike rack, etc.) - gold
  "15": "#795548",  // Walls - brown
  "16": "#E91E63",  // Kerbs - pink
  "17": "#8B4513",  // Fences - saddle brown
  "18": "#8B4513",  // Gates - saddle brown
  "19": "#A0522D",  // Benches (lines) - sienna
  "20": "#607D8B",  // Drainage - blue gray
  "21": "#607D8B",  // Manholes - blue gray
  "22": "#1E90FF",  // Drinking fountains - dodger blue
  "23": "#F44336",  // Hydrants - red
  "24": "#2E7D32",  // Litter bins - green
  "28": "#795548",  // Bicycle path - brown
  "31": "#BCAAA4",  // Stairs/Ramps - light brown
  "32": "#03A9F4",  // Irrigation - light blue
  "34": "#D84315",  // Tennis court - deep orange
  "37": "#616161",  // Running track - dark gray
  "42": "#FF9800",  // Safety surfacing - orange
  // Management (Type 3)
  "25": "#64B5F6",  // Management areas - light blue
  "26": "#FFB74D",  // Construction sites - orange
  "27": "#FF6347"   // Playgrounds/Sports/Dogs areas - tomato
};

const LIVE_LAYER_IDS = [
  "polygons-fill",
  "polygons-outline",
  "polygons-outline-outer",
  "lines-outer",
  "lines",
  "clusters",
  "cluster-count",
  "points"
];

const PM_LAYER_IDS = [
  "pm-polygons-fill",
  "pm-polygons-outline",
  "pm-polygons-outline-outer",
  "pm-lines-outer",
  "pm-lines",
  "pm-points"
];

class UrbanGreenMapV2 extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.map = null;
    this.loader = null;
    this.cluster = null;
    this.currentType = null;
    this.currentSubCategory = null;
    this.debounceTimer = null;
    this._seq = 0;
    this._currentFeatures = null;
    this._dataMode = "live";
    this._featureClicked = false;
    this.pmtilesUrl = null;
    this.pmtilesReady = false;
    this.pmtilesArchive = null;
    this.pmtilesProtocol = null;
    this._pmAllowedGeometries = null;
    this._pmHasCategory = false;
    this._pmSubtypeColorExpr = null;

    this._pmGreenCodeExpr = ["to-string", ["coalesce", ["get", "greenCode"], ["get", "code"], ""]];
    this._pmTypeExpr = ["to-string", ["coalesce", ["get", "greenCodeType"], ["get", "type"], ["slice", this._pmGreenCodeExpr, 1, 2]]];
    this._pmSubtypeExpr = ["slice", this._pmGreenCodeExpr, 2, 4];
  }

  connectedCallback() {
    this.pmtilesUrl = this.getAttribute("pmtiles-url") || PMTILES_DEFAULT_URL;
    this.render();
    this.initMap();
  }

  disconnectedCallback() {
    this.loader?.abort();
    this.map?.remove();
  }

  get apiBase() {
    return this.getAttribute("api-base") || "https://api.tourism.testingmachine.eu";
  }

  get lang() {
    return this.getAttribute("lang") || "en";
  }

  get liveZoomIn() {
    const val = parseFloat(this.getAttribute("live-zoom-in"));
    return Number.isFinite(val) ? val : LIVE_ZOOM_IN;
  }

  get liveZoomOut() {
    const val = parseFloat(this.getAttribute("live-zoom-out"));
    return Number.isFinite(val) ? val : LIVE_ZOOM_OUT;
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; width: 100%; height: 100%; font-family: system-ui, sans-serif; }
        .container { display: flex; flex-direction: column; height: 100%; }
        .header { padding: 12px; background: #f5f5f5; text-align: center; border-bottom: 1px solid #ddd; }
        .header img { height: 40px; }
        .title { padding: 16px; text-align: center; background: #fff; }
        .title h2 { margin: 0 0 8px; font-size: 20px; text-transform: uppercase; }
        .title p { margin: 0; color: #666; font-size: 14px; }
        .controls { padding: 12px; background: #fff; border-bottom: 1px solid #ddd; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
        select { min-width: 160px; padding: 8px 12px; border: 1px solid #333; border-radius: 4px; font-size: 14px; }
        button { padding: 8px 16px; border: 1px solid #333; border-radius: 4px; background: #fff; cursor: pointer; }
        button:hover { background: #333; color: #fff; }

        /* Chip container for sub-categories */
        .chip-container { display: none; gap: 6px; flex-wrap: wrap; align-items: center; }
        .chip-container.show { display: flex; }
        .chip-divider { width: 1px; height: 24px; background: #ddd; margin: 0 4px; }

        /* Chip/pill buttons - uses CSS custom property for color */
        .chip { position: relative; padding: 6px 14px; border: 1px solid var(--chip-color, #4CAF50); border-radius: 20px; background: #fff;
                color: var(--chip-color, #4CAF50); font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
        .chip:hover { background: color-mix(in srgb, var(--chip-color, #4CAF50) 15%, white); }
        .chip.active { background: var(--chip-color, #4CAF50); color: #fff; }
        .chip.active:hover { filter: brightness(0.9); }

        /* Chip tooltip on hover */
        .chip-tooltip { position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%);
                        background: #333; color: #fff; padding: 8px 12px; border-radius: 6px; font-size: 12px;
                        font-weight: 400; white-space: normal; width: max-content; max-width: 220px; text-align: center;
                        opacity: 0; visibility: hidden; transition: opacity 0.2s, visibility 0.2s; z-index: 100;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.2); line-height: 1.4; }
        .chip-tooltip::after { content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
                               border: 6px solid transparent; border-top-color: #333; }
        .chip:hover .chip-tooltip { opacity: 1; visibility: visible; }
        .footer { padding: 16px 20px; background: #f5f5f5; display: flex; justify-content: flex-end; align-items: center; gap: 10px; position: relative; z-index: 10; }
        .footer a { display: inline-flex; align-items: center; gap: 10px; color: #0066cc; text-decoration: none; font-size: 14px; font-weight: 500; cursor: pointer; position: relative; z-index: 11; }
        .footer a:hover { text-decoration: underline; color: #004499; }
        .footer img { height: 32px; width: auto; }

        /* Map wrapper for sidebar positioning */
        .map-wrapper { position: relative; flex: 1; min-height: 400px; }
        .map-wrapper #map { position: absolute; top: 0; left: 0; right: 0; bottom: 0; }

        .sidebar { position: absolute; top: 12px; left: -340px; width: 300px; max-height: calc(100% - 24px);
                   background: #fff; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                   transition: left 0.3s ease; z-index: 1000; overflow: hidden; display: flex; flex-direction: column; }
        .sidebar.open { left: 12px; }
        .sidebar-header { padding: 8px 12px; background: #fff; display: flex; justify-content: flex-end; align-items: center;
                          border-bottom: 1px solid #eee; flex-shrink: 0; }
        .sidebar-close { background: none; border: none; font-size: 24px; cursor: pointer; color: #999; padding: 4px 8px; line-height: 1; }
        .sidebar-close:hover { color: #333; }
        .sidebar-content { padding: 16px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; flex: 1; }

        /* Icon card at top */
        .sidebar-icon { width: 100%; aspect-ratio: 1.2; max-height: 120px; background: #f8f8f8; border-radius: 12px;
                        display: flex; align-items: center; justify-content: center; margin-bottom: 4px; }
        .sidebar-icon img { max-width: 70px; max-height: 70px; object-fit: contain; }
        .sidebar-icon.empty { display: none; }

        /* Info pills/badges */
        .info-pill { display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px; background: #fff;
                     border-radius: 24px; font-size: 13px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
        .info-pill-label { color: #666; text-transform: uppercase; font-size: 11px; font-weight: 500; }
        .info-pill-value { color: #333; font-weight: 600; }
        .info-pills-row { display: flex; gap: 8px; flex-wrap: wrap; }

        /* Directions button */
        .directions-btn { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%;
                          padding: 12px 20px; background: #fff; border: 2px solid #333; border-radius: 28px;
                          font-size: 15px; font-weight: 600; cursor: pointer; margin-top: 8px; transition: all 0.2s; }
        .directions-btn:hover { background: #f5f5f5; }
        .directions-btn img { width: 32px; height: 32px; }

        .toast { position: absolute; bottom: 80px; left: 50%; transform: translateX(-50%);
                 background: #333; color: #fff; padding: 10px 20px; border-radius: 4px;
                 opacity: 0; transition: opacity 0.3s; z-index: 2000; }
        .toast.show { opacity: 1; }

        .loader { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                  display: none; flex-direction: column; align-items: center; gap: 12px;
                  background: rgba(255,255,255,0.95); padding: 24px 32px; border-radius: 8px;
                  box-shadow: 0 4px 20px rgba(0,0,0,0.15); z-index: 1500; }
        .loader.show { display: flex; }
        .spinner { width: 40px; height: 40px; border: 4px solid #e0e0e0;
                   border-top-color: #4CAF50; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .loader-text { font-size: 14px; color: #333; font-weight: 500; }
      </style>

      <div class="container">
        <div class="header">
          <img src="../web-component/open-data-hub-icons/Logo_RBG/OpenDataHub_Logo_BK-RGB.svg" alt="Open Data Hub" />
        </div>
        <div class="title">
          <h2>Explore Urban Green Spaces</h2>
          <p>Discover vegetation, urban furniture, and green infrastructure in Padova</p>
        </div>
        <div class="controls">
          <select id="layerSelect">
            <option value="">Select a category</option>
            <option value="1">Vegetation</option>
            <option value="2">Urban Furniture</option>
            <option value="3">Use & Management</option>
          </select>
          <div class="chip-container" id="subChips">
            <!-- Chips will be dynamically generated based on selected type -->
          </div>
          <button id="clearCache">Clear cache</button>
        </div>
        <div class="map-wrapper">
          <div id="map"></div>
          <div class="sidebar" id="sidebar">
            <div class="sidebar-header">
              <button class="sidebar-close" id="closeSidebar">&times;</button>
            </div>
            <div class="sidebar-content" id="sidebarContent">
              <div class="sidebar-icon" id="sidebarIcon"></div>
              <div id="sidebarPills"></div>
              <button class="directions-btn" id="directionsBtn">
                <img src="../web-component/open-data-hub-icons/btn-navigation.svg" alt="Navigate" />
                Get Directions
              </button>
            </div>
          </div>
          <div class="toast" id="toast"></div>
          <div class="loader" id="loader">
            <div class="spinner"></div>
            <div class="loader-text" id="loaderText">Loading...</div>
          </div>
        </div>
        <div class="footer">
          <a href="https://opendatahub.com" target="_blank">
            powered by Open Data Hub
            <img src="../web-component/open-data-hub-icons/Logo_RBG/OpenDataHub_Logo_BK-RGB.svg" alt="Open Data Hub" />
          </a>
        </div>
      </div>
    `;

    // Event listeners
    this.shadowRoot.querySelector("#layerSelect").addEventListener("change", e => {
      this.onTypeChange(e.target.value);
    });

    this.shadowRoot.querySelector("#clearCache").addEventListener("click", () => {
      this.clearCache();
    });

    this.shadowRoot.querySelector("#closeSidebar").addEventListener("click", () => {
      this.closeSidebar();
    });
  }

  // Generate chips for a given type's subcategories
  generateChips(typeKey) {
    const chipContainer = this.shadowRoot.querySelector("#subChips");
    chipContainer.innerHTML = "";

    if (!typeKey || !MAIN_TYPES[typeKey]) {
      chipContainer.classList.remove("show");
      return;
    }

    const typeConfig = MAIN_TYPES[typeKey];
    const subcats = typeConfig.subcategories;

    // Add divider
    const divider = document.createElement("span");
    divider.className = "chip-divider";
    chipContainer.appendChild(divider);

    // Add chip for each subcategory
    Object.entries(subcats).forEach(([subKey, subConfig], index) => {
      const chip = document.createElement("button");
      chip.className = "chip" + (index === 0 ? " active" : "");
      chip.dataset.sub = subKey;
      chip.style.setProperty("--chip-color", subConfig.color);

      // Chip label
      const label = document.createElement("span");
      label.textContent = subConfig.name;
      chip.appendChild(label);

      // Add tooltip if description exists
      if (subConfig.tooltip) {
        const tooltip = document.createElement("span");
        tooltip.className = "chip-tooltip";
        tooltip.textContent = subConfig.tooltip;
        chip.appendChild(tooltip);
      }

      chip.addEventListener("click", () => {
        this.onSubCategoryChange(subKey);
        chipContainer.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
      });

      chipContainer.appendChild(chip);
    });

    chipContainer.classList.add("show");
  }

  onTypeChange(typeKey) {
    if (!typeKey) {
      // No selection - hide chips, clear map
      this.shadowRoot.querySelector("#subChips").classList.remove("show");
      this.currentType = null;
      this.currentSubCategory = null;
      this._currentFeatures = null;
      this.cluster = null;
      this.clearMap();
      this.closeSidebar();
      return;
    }

    // Generate chips for this type
    this.generateChips(typeKey);

    // Set current type and default to "all" subcategory
    this.currentType = typeKey;
    this.currentSubCategory = "all";

    // Reset zoom to default when changing category
    this.resetMapView();
    this.updatePmtilesFilters();
    if (this.isLiveMode()) {
      this.loadData();
    } else {
      this.closeSidebar();
    }
  }

  onSubCategoryChange(subKey) {
    this.currentSubCategory = subKey;

    // Reset zoom to default when changing subcategory
    this.resetMapView();

    // Data is already cached by type, just re-filter and display
    this.updatePmtilesFilters();
    if (this.isLiveMode()) {
      this.loadData();
    } else {
      this.closeSidebar();
    }
  }

  // Reset map to default center and zoom
  resetMapView() {
    if (this.map) {
      this.map.easeTo({
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        duration: 500
      });
    }
  }

  initMap() {
    this.loader = new ViewportDataLoader(this.apiBase, this.lang);

    if (!window.__pmtilesProtocol) {
      window.__pmtilesProtocol = new pmtiles.Protocol();
      maplibregl.addProtocol("pmtiles", window.__pmtilesProtocol.tile);
    }
    this.pmtilesProtocol = window.__pmtilesProtocol;

    this.map = new maplibregl.Map({
      container: this.shadowRoot.querySelector("#map"),
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256
          }
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }]
      }
    });

    this.map.addControl(new maplibregl.NavigationControl());

    this.map.on("load", () => {
      this.setupLiveLayers();
      this.setupBaseInteractions();
      this.setupLiveInteractions();
      this.setupPmtiles();
      this.updateDataMode(true);
    });

    // Re-cluster points on zoom/pan (no API reload, just re-render clusters)
    this.map.on("moveend", () => this.onMapMove());
    this.map.on("zoomend", () => this.updateDataMode());
  }

  onMapMove() {
    if (!this.isLiveMode()) return;
    // Only re-cluster if we have data and it contains points
    if (this._currentFeatures && this.cluster) {
      this.renderClusters();
    }
  }

  setupLiveLayers() {
    // Single source for all data
    this.map.addSource("data", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    });

    // Fill layer for polygons
    this.map.addLayer({
      id: "polygons-fill",
      type: "fill",
      source: "data",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "fill-color": ["get", "_color"],
        "fill-opacity": 0.7
      }
    });

    // Outline for polygons - thicker colored border for visibility
    this.map.addLayer({
      id: "polygons-outline",
      type: "line",
      source: "data",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "line-color": ["get", "_color"],
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          10, 2,    // At zoom 10: 2px border
          14, 3,    // At zoom 14: 3px border
          18, 4     // At zoom 18: 4px border
        ],
        "line-opacity": 0.9
      }
    });

    // Extra outline for small polygons - white outer stroke for contrast
    this.map.addLayer({
      id: "polygons-outline-outer",
      type: "line",
      source: "data",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "line-color": "#ffffff",
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          10, 3,
          14, 4,
          18, 5
        ],
        "line-opacity": 0.5,
        "line-gap-width": 0
      }
    });

    // Move polygons-outline above the outer stroke
    this.map.moveLayer("polygons-outline");

    // Line layer outer stroke (for contrast)
    this.map.addLayer({
      id: "lines-outer",
      type: "line",
      source: "data",
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-color": "#ffffff",
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          10, 5,
          14, 7,
          18, 9
        ],
        "line-opacity": 0.6
      }
    });

    // Line layer (hedges, tree rows)
    this.map.addLayer({
      id: "lines",
      type: "line",
      source: "data",
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-color": ["get", "_color"],
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          10, 3,
          14, 4,
          18, 6
        ],
        "line-opacity": 0.9
      }
    });

    // Cluster circles
    this.map.addLayer({
      id: "clusters",
      type: "circle",
      source: "data",
      filter: ["has", "point_count"],
      paint: {
        "circle-radius": ["step", ["get", "point_count"], 15, 10, 20, 50, 25, 200, 30],
        "circle-color": "#10b981",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#fff"
      }
    });

    // Cluster count
    this.map.addLayer({
      id: "cluster-count",
      type: "symbol",
      source: "data",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-size": 12
      },
      paint: { "text-color": "#fff" }
    });

    // Individual points
    this.map.addLayer({
      id: "points",
      type: "circle",
      source: "data",
      filter: ["all", ["==", ["geometry-type"], "Point"], ["!", ["has", "point_count"]]],
      paint: {
        "circle-radius": 6,
        "circle-color": ["get", "_color"],
        "circle-stroke-width": 1,
        "circle-stroke-color": "#fff"
      }
    });
  }

  setupPmtiles() {
    if (!this.map || this.pmtilesReady) return;

    try {
      const archive = new pmtiles.PMTiles(this.pmtilesUrl);
      this.pmtilesArchive = archive;
      this.pmtilesProtocol.add(archive);

      if (!this.map.getSource(PMTILES_SOURCE)) {
        this.map.addSource(PMTILES_SOURCE, {
          type: "vector",
          url: `pmtiles://${this.pmtilesUrl}`,
          attribution: "© Data contributors"
        });
      }

      this.setupPmtilesLayers();
      this.setupPmtilesInteractions();
      this.pmtilesReady = true;
      this.updatePmtilesFilters();
      this.applyDataModeVisibility();
    } catch (err) {
      console.error("PMTiles setup error:", err);
    }
  }

  setupPmtilesLayers() {
    if (this.map.getLayer("pm-polygons-fill")) return;

    const baseFilter = ["==", ["get", "__never__"], "__never__"];

    this.map.addLayer({
      id: "pm-polygons-fill",
      type: "fill",
      source: PMTILES_SOURCE,
      "source-layer": PMTILES_SOURCE_LAYER,
      filter: baseFilter,
      paint: {
        "fill-color": "#888888",
        "fill-opacity": 0.7
      },
      layout: { visibility: "none" }
    });

    this.map.addLayer({
      id: "pm-polygons-outline-outer",
      type: "line",
      source: PMTILES_SOURCE,
      "source-layer": PMTILES_SOURCE_LAYER,
      filter: baseFilter,
      paint: {
        "line-color": "#ffffff",
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          10, 3,
          14, 4,
          18, 5
        ],
        "line-opacity": 0.5
      },
      layout: { visibility: "none" }
    });

    this.map.addLayer({
      id: "pm-polygons-outline",
      type: "line",
      source: PMTILES_SOURCE,
      "source-layer": PMTILES_SOURCE_LAYER,
      filter: baseFilter,
      paint: {
        "line-color": "#888888",
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          10, 2,
          14, 3,
          18, 4
        ],
        "line-opacity": 0.9
      },
      layout: { visibility: "none" }
    });

    this.map.addLayer({
      id: "pm-lines-outer",
      type: "line",
      source: PMTILES_SOURCE,
      "source-layer": PMTILES_SOURCE_LAYER,
      filter: baseFilter,
      paint: {
        "line-color": "#ffffff",
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          10, 5,
          14, 7,
          18, 9
        ],
        "line-opacity": 0.6
      },
      layout: { visibility: "none" }
    });

    this.map.addLayer({
      id: "pm-lines",
      type: "line",
      source: PMTILES_SOURCE,
      "source-layer": PMTILES_SOURCE_LAYER,
      filter: baseFilter,
      paint: {
        "line-color": "#888888",
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          10, 3,
          14, 4,
          18, 6
        ],
        "line-opacity": 0.9
      },
      layout: { visibility: "none" }
    });

    this.map.addLayer({
      id: "pm-points",
      type: "circle",
      source: PMTILES_SOURCE,
      "source-layer": PMTILES_SOURCE_LAYER,
      filter: baseFilter,
      paint: {
        "circle-radius": 6,
        "circle-color": "#888888",
        "circle-stroke-width": 1,
        "circle-stroke-color": "#fff"
      },
      layout: { visibility: "none" }
    });
  }

  updatePmtilesFilters() {
    if (!this.pmtilesReady || !this.map) return;

    const category = this.getActiveCategory();
    this._pmAllowedGeometries = category?.geometries || null;
    this._pmHasCategory = !!category;

    if (!category) {
      this.setPmtilesLayerVisibility(false);
      return;
    }

    const filters = [
      ["==", this._pmTypeExpr, category.type]
    ];

    if (category.subtypes) {
      filters.push(["in", this._pmSubtypeExpr, ["literal", category.subtypes]]);
    }

    const polygonFilter = ["all", ["==", ["geometry-type"], "Polygon"], ...filters];
    const lineFilter = ["all", ["==", ["geometry-type"], "LineString"], ...filters];
    const pointFilter = ["all", ["==", ["geometry-type"], "Point"], ...filters];

    this.map.setFilter("pm-polygons-fill", polygonFilter);
    this.map.setFilter("pm-polygons-outline", polygonFilter);
    this.map.setFilter("pm-polygons-outline-outer", polygonFilter);
    this.map.setFilter("pm-lines", lineFilter);
    this.map.setFilter("pm-lines-outer", lineFilter);
    this.map.setFilter("pm-points", pointFilter);

    const colorExpr = category.multiColor ? this.getPmSubtypeColorExpression() : category.color;
    this.map.setPaintProperty("pm-polygons-fill", "fill-color", colorExpr);
    this.map.setPaintProperty("pm-polygons-outline", "line-color", colorExpr);
    this.map.setPaintProperty("pm-lines", "line-color", colorExpr);
    this.map.setPaintProperty("pm-points", "circle-color", colorExpr);

    this.setPmtilesLayerVisibility(this._dataMode === "pmtiles", this._pmAllowedGeometries);
  }

  getPmSubtypeColorExpression() {
    if (this._pmSubtypeColorExpr) return this._pmSubtypeColorExpr;

    const expr = ["match", this._pmSubtypeExpr];
    Object.entries(SUBTYPE_COLORS).forEach(([subtype, color]) => {
      expr.push(subtype, color);
    });
    expr.push("#888888");
    this._pmSubtypeColorExpr = expr;
    return expr;
  }

  setLayerVisibility(layerId, visible) {
    if (!this.map.getLayer(layerId)) return;
    this.map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  }

  setLiveLayerVisibility(visible) {
    LIVE_LAYER_IDS.forEach(layerId => this.setLayerVisibility(layerId, visible));
  }

  setPmtilesLayerVisibility(visible, allowedGeometries = null) {
    const show = visible && this._pmHasCategory;
    const geomSet = allowedGeometries ? new Set(allowedGeometries) : null;
    const showPolygons = show && (!geomSet || geomSet.has("Polygon"));
    const showLines = show && (!geomSet || geomSet.has("LineString"));
    const showPoints = show && (!geomSet || geomSet.has("Point"));

    this.setLayerVisibility("pm-polygons-fill", showPolygons);
    this.setLayerVisibility("pm-polygons-outline", showPolygons);
    this.setLayerVisibility("pm-polygons-outline-outer", showPolygons);
    this.setLayerVisibility("pm-lines", showLines);
    this.setLayerVisibility("pm-lines-outer", showLines);
    this.setLayerVisibility("pm-points", showPoints);
  }

  applyDataModeVisibility() {
    const liveVisible = this.isLiveMode();
    this.setLiveLayerVisibility(liveVisible);
    this.setPmtilesLayerVisibility(!liveVisible, this._pmAllowedGeometries);
  }

  updateDataMode(force = false) {
    if (!this.map) return;
    const zoom = this.map.getZoom();

    let nextMode = this._dataMode;
    if (zoom >= this.liveZoomIn) {
      nextMode = "pmtiles";
    } else if (zoom <= this.liveZoomOut) {
      nextMode = "live";
    }

    if (force || nextMode !== this._dataMode) {
      this.setDataMode(nextMode, force);
    }
  }

  setDataMode(mode, force = false) {
    if (!force && this._dataMode === mode) return;
    this._dataMode = mode;

    this.closeSidebar();
    this.hideLoader();
    this.applyDataModeVisibility();

    if (this.isLiveMode()) {
      if (this.currentType) {
        this.loadData();
      }
    } else {
      this.loader?.abort();
      this.clearMap();
    }
  }

  setupBaseInteractions() {
    this._featureClicked = false;

    // Close sidebar when clicking empty map area
    this.map.on("click", () => {
      // Use setTimeout to check after feature click handlers have run
      setTimeout(() => {
        if (!this._featureClicked) {
          this.closeSidebar();
        }
        this._featureClicked = false;
      }, 0);
    });
  }

  setupLiveInteractions() {
    // Click handlers for live features
    ["polygons-fill", "lines", "points"].forEach(layer => {
      this.map.on("click", layer, e => {
        if (e.features?.[0]) {
          this._featureClicked = true;
          this.showSidebar(e.features[0]);
        }
      });
      this.map.on("mouseenter", layer, () => this.map.getCanvas().style.cursor = "pointer");
      this.map.on("mouseleave", layer, () => this.map.getCanvas().style.cursor = "");
    });

    // Cluster click to zoom (live only)
    this.map.on("click", "clusters", e => {
      if (!this.isLiveMode() || !e.features?.[0] || !this.cluster) return;
      this._featureClicked = true;
      const clusterId = e.features[0].properties.cluster_id;
      const zoom = this.cluster.getClusterExpansionZoom(clusterId);
      this.map.easeTo({ center: e.features[0].geometry.coordinates, zoom });
    });
  }

  setupPmtilesInteractions() {
    // Click handlers for PMTiles features
    ["pm-polygons-fill", "pm-lines", "pm-points"].forEach(layer => {
      this.map.on("click", layer, e => {
        if (e.features?.[0]) {
          this._featureClicked = true;
          this.showSidebar(e.features[0]);
        }
      });
      this.map.on("mouseenter", layer, () => this.map.getCanvas().style.cursor = "pointer");
      this.map.on("mouseleave", layer, () => this.map.getCanvas().style.cursor = "");
    });
  }

  isLiveMode() {
    return this._dataMode === "live";
  }

  getActiveCategory() {
    // Get the active category config based on current selections
    if (!this.currentType) return null;

    const typeConfig = MAIN_TYPES[this.currentType];
    if (!typeConfig) return null;

    const subKey = this.currentSubCategory || "all";
    const subConfig = typeConfig.subcategories[subKey];

    if (!subConfig) return null;

    // Return a combined config object
    return {
      type: this.currentType,
      typeName: typeConfig.name,
      name: subConfig.name,
      subtypes: subConfig.subtypes,
      geometries: subConfig.geometries,
      color: subConfig.color,
      multiColor: subConfig.multiColor,
      icon: subConfig.icon
    };
  }

  async loadData() {
    const category = this.getActiveCategory();
    if (!category) return;
    if (!this.isLiveMode()) return;

    const seq = ++this._seq;

    console.log(`🔄 Loading ${category.name}...`);
    this.showLoader(`Loading ${category.name}...`);

    // Abort any pending requests
    this.loader.abort();

    // Clear map immediately
    this.clearMap();
    this.closeSidebar();

    try {
      // Load ALL data for this type (uses memory cache after first load)
      const features = await this.loader.loadTypeData(category.type);

      if (seq !== this._seq) {
        this.hideLoader();
        return; // Outdated request
      }

      // Filter by category criteria
      const filtered = this.filterFeatures(features, category);
      console.log(`🎯 Filtered to ${filtered.length} features`);

      // Update map
      this.updateMap(filtered, category);
      this.hideLoader();

    } catch (err) {
      console.error("Load error:", err);
      this.hideLoader();
    }
  }

  filterFeatures(features, category) {
    // Debug: count subtypes and geometry types before filtering
    const subtypeCounts = {};
    const geomCounts = {};
    features.forEach(f => {
      const st = f.properties.greenCodeSubtype;
      const gt = f.geometry?.type;
      subtypeCounts[st] = (subtypeCounts[st] || 0) + 1;
      geomCounts[gt] = (geomCounts[gt] || 0) + 1;
    });
    console.log('📊 Subtypes in data:', subtypeCounts);
    console.log('📊 Geometries in data:', geomCounts);
    console.log('🎯 Filter config:', { subtypes: category.subtypes, geometries: category.geometries });

    const filtered = features.filter(f => {
      const props = f.properties;
      const geomType = f.geometry?.type;

      // Match geometry type (if specified)
      if (category.geometries && !category.geometries.includes(geomType)) {
        return false;
      }

      // Match subtype if specified
      if (category.subtypes) {
        const subtype = String(props.greenCodeSubtype || "").padStart(2, "0");
        if (!category.subtypes.includes(subtype)) {
          return false;
        }
      }

      return true;
    });

    console.log(`🔍 Filter: geometries=${category.geometries}, subtypes=${category.subtypes} → ${filtered.length} features`);
    return filtered;
  }

  updateMap(features, category) {
    // Add color to features - either single color or multi-color based on subtype
    const enriched = features.map(f => {
      let color = category.color;

      // Multi-color mode: color by subtype
      if (category.multiColor) {
        const subtype = String(f.properties.greenCodeSubtype || "").padStart(2, "0");
        color = SUBTYPE_COLORS[subtype] || "#888888";
      }

      return {
        ...f,
        properties: {
          ...f.properties,
          _color: color
        }
      };
    });

    // Separate points for clustering
    const points = enriched.filter(f => f.geometry?.type === "Point");
    const others = enriched.filter(f => f.geometry?.type !== "Point");

    // Store for re-clustering on zoom
    this._currentFeatures = { points, others };

    // Setup cluster index
    this.cluster = new Supercluster({ radius: 60, maxZoom: 16 });
    this.cluster.load(points);

    // Render with current zoom
    this.renderClusters();
  }

  renderClusters() {
    if (!this._currentFeatures) return;

    const { points, others } = this._currentFeatures;

    // Get clusters for current view
    const bounds = this.map.getBounds();
    const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
    const zoom = Math.floor(this.map.getZoom());
    const clustered = this.cluster ? this.cluster.getClusters(bbox, zoom) : points;

    // Combine all features
    const allFeatures = [...others, ...clustered];

    // Update source
    const source = this.map.getSource("data");
    if (source) {
      source.setData({
        type: "FeatureCollection",
        features: allFeatures
      });
    }

    console.log(`🗺️ Rendered: ${others.length} polygons/lines, ${clustered.length} point clusters (zoom ${zoom})`);
  }

  clearMap() {
    const source = this.map.getSource("data");
    if (source) {
      source.setData({ type: "FeatureCollection", features: [] });
    }
  }

  showSidebar(feature) {
    const props = feature.properties || {};
    const langKey = `name_${this.lang}`;
    const rawGreenCode = props.greenCode || props.code || null;

    let typeCode = props.greenCodeType || props.type || null;
    if (!typeCode && rawGreenCode) {
      typeCode = String(rawGreenCode).slice(1, 2);
    }
    typeCode = typeCode ? String(typeCode) : "";

    let subtype = props.greenCodeSubtype || null;
    if (!subtype && rawGreenCode) {
      subtype = String(rawGreenCode).slice(2, 4);
    }
    subtype = String(subtype || "").padStart(2, "0");

    const info = getGreenSpaceInfo(typeCode, subtype, this.lang);
    const apiName = props.name || props[langKey] || props.title;
    const displayName = apiName && String(apiName).trim() ? apiName : info.name;

    let greenCode = rawGreenCode;
    if (!greenCode && typeCode) {
      greenCode = `P${typeCode}${subtype}${String(props.id || "").slice(-2)}`;
    }
    if (!greenCode) {
      greenCode = "N/A";
    }

    // Get feature center for directions
    const geom = feature.geometry;
    let center = null;
    if (geom?.type === "Point") {
      center = geom.coordinates;
    } else if (geom?.type === "Polygon" && geom.coordinates?.[0]) {
      // Get centroid of polygon
      const coords = geom.coordinates[0];
      let sumLng = 0, sumLat = 0;
      for (const [lng, lat] of coords) { sumLng += lng; sumLat += lat; }
      center = [sumLng / coords.length, sumLat / coords.length];
    } else if (geom?.type === "LineString" && geom.coordinates?.length) {
      // Get midpoint of line
      const mid = Math.floor(geom.coordinates.length / 2);
      center = geom.coordinates[mid];
    }

    // Icon section - use icon based on subtype
    const iconEl = this.shadowRoot.querySelector("#sidebarIcon");
    if (info.icon) {
      iconEl.innerHTML = `<img src="../web-component/open-data-hub-icons/${info.icon}" alt="${displayName}" />`;
      iconEl.classList.remove("empty");
    } else {
      iconEl.innerHTML = "";
      iconEl.classList.add("empty");
    }

    // Pills section - now shows actual API name
    this.shadowRoot.querySelector("#sidebarPills").innerHTML = `
      <div class="info-pill">
        <span class="info-pill-label">Name:</span>
        <span class="info-pill-value">${displayName}</span>
      </div>
      <div class="info-pill">
        <span class="info-pill-label">Category:</span>
        <span class="info-pill-value">${info.typeName}</span>
      </div>
      <div class="info-pills-row">
        <div class="info-pill">
          <span class="info-pill-label">Green Code:</span>
          <span class="info-pill-value">${greenCode}</span>
        </div>
        <div class="info-pill">
          <span class="info-pill-label">Geometry:</span>
          <span class="info-pill-value">${geom?.type || 'N/A'}</span>
        </div>
      </div>
      <div class="info-pill">
        <span class="info-pill-label">ID:</span>
        <span class="info-pill-value">${props.id || 'N/A'}</span>
      </div>
    `;

    // Directions button - store center for click handler
    const directionsBtn = this.shadowRoot.querySelector("#directionsBtn");
    if (center) {
      directionsBtn.style.display = "flex";
      directionsBtn.onclick = () => {
        const [lng, lat] = center;
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, "_blank");
      };
    } else {
      directionsBtn.style.display = "none";
    }

    this.shadowRoot.querySelector("#sidebar").classList.add("open");
  }

  closeSidebar() {
    this.shadowRoot.querySelector("#sidebar").classList.remove("open");
  }

  showToast(msg) {
    const toast = this.shadowRoot.querySelector("#toast");
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2000);
  }

  showLoader(text = "Loading...") {
    const loader = this.shadowRoot.querySelector("#loader");
    const loaderText = this.shadowRoot.querySelector("#loaderText");
    loaderText.textContent = text;
    loader.classList.add("show");
  }

  hideLoader() {
    this.shadowRoot.querySelector("#loader").classList.remove("show");
  }

  async clearCache() {
    this.loader.clearCache();
    try {
      indexedDB.deleteDatabase('UrbanGreenTileCache');
    } catch (e) {}
    this.showToast("Cache cleared");
    if (this.currentType && this.isLiveMode()) {
      this.loadData();
    }
  }
}

customElements.define("r3gis-urbangreen-v2", UrbanGreenMapV2);
export default UrbanGreenMapV2;
