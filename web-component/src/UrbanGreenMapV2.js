import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Supercluster from "supercluster";
import { ViewportDataLoader } from "./ViewportDataLoader.js";

const DEFAULT_CENTER = [11.8768, 45.4064];
const DEFAULT_ZOOM = 11;
const MAP_MOVE_DEBOUNCE = 250;

const CLUSTER_RADIUS = 60;
const CLUSTER_MAX_ZOOM = 16;

const MAIN_TYPES = {
  "1": {
    name: "Vegetation",
    color: "#4CAF50",
    subcategories: {
      "trees": { name: "Trees & Plants", subtypes: ["03"], geometries: ["Point"], icon: "ic-trees.svg", color: "#228B22" },
      "hedges": { name: "Hedges", subtypes: ["03"], geometries: ["LineString"], icon: "hedge.svg", color: "#3CB371" },
      "lawns": { name: "Lawns", subtypes: ["01"], icon: "lawn.svg", color: "#90EE90" },
      "flowerbeds": { name: "Flowerbeds", subtypes: ["02"], icon: "flowerbed.svg", color: "#7CFC00" }
    }
  },
  "2": {
    name: "Urban Furniture",
    color: "#8D6E63",
    subcategories: {
      "benches": { name: "Benches", subtypes: ["19"], icon: "bench.svg", color: "#A0522D" },
      "bins": { name: "Waste bins", subtypes: ["24"], icon: "waste-bin.svg", color: "#696969" },
      "bollards": { name: "Bollards", subtypes: ["14"], icon: "bollard.svg", color: "#FFD700" },
      "fountains": { name: "Fountains / Hydrants", subtypes: ["22", "23"], icon: "fountain.svg", color: "#1E90FF" },
      "shelters": { name: "Shelters & Canopies", subtypes: ["13"], icon: "canopy.svg", color: "#D2B48C" }
    }
  },
  "3": {
    name: "Use & Management",
    color: "#2196F3",
    subcategories: {
      "boundary": { name: "Green area boundary", subtypes: ["25"] },
      "usage": { name: "Usage zones", subtypes: ["27"] },
      "temporary": { name: "Temporary areas", subtypes: ["26"] }
    }
  }
};

class UrbanGreenMapV2 extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this.map = null;
    this.dataLoader = null;

    this.layerData = { "1": [], "2": [], "3": [] };
    this.clusterIndex = { "1": null, "2": null }; 

    this.currentMainType = null;
    this.currentSubcategory = null;
    this.moveDebounceTimer = null;
    this._requestSeq = 0;
    this._handlersBound = false;

    this._sidebar = null;
    this._sidebarContent = null;
  }

  connectedCallback() {
    this.renderLayout();
    this.initMap();
  }

  disconnectedCallback() {
    this.closeSidebar();
    this.dataLoader?.abortAll();
    this.map?.remove();
  }

  get apiBase() {
    return this.getAttribute("api-base") || "https://api.tourism.testingmachine.eu";
  }

  get lang() {
    return this.getAttribute("lang") || "en";
  }

  /* ================= UI ================= */

  renderLayout() {
    this.shadowRoot.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Source+Sans+Pro:wght@400;600;700&display=swap');

        :host {
          display: block;
          width: 100%;
          height: 100%;
          min-height: 400px;
          position: relative;
          font-family: 'Source Sans Pro', sans-serif;
          font-size: 16px;
          color: #212529;
        }
        .wrapper {
          display: flex;
          flex-direction: column;
          width: 100%;
          height: 100%;
          position: relative;
          overflow: hidden;
        }
        .header-bar {
          padding: 20px 16px;
          background: #e8e8e8;
          border-bottom: none;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .header-bar img {
          height: 50px;
          width: auto;
        }
        .description-bar {
          padding: 24px 16px;
          background: #ffffff;
          text-align: center;
          border-bottom: 1px solid #565e64;
          flex-shrink: 0;
        }
        .description-bar h2 {
          font-family: 'Source Sans Pro', sans-serif;
          font-size: 24px;
          font-weight: 700;
          color: #212529;
          margin: 0 0 8px 0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .description-bar p {
          font-family: 'Source Sans Pro', sans-serif;
          font-size: 16px;
          font-weight: 400;
          color: #212529;
          margin: 0;
          line-height: 1.5;
        }
        .panel {
          padding: 12px 16px;
          background: #ffffff;
          display: flex;
          flex-direction: column;
          gap: 8px;
          border-bottom: 1px solid #565e64;
          flex-shrink: 0;
        }
        .panel-row {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }
        #mainTypeSelect {
          min-width: 200px;
          padding: 6px 12px;
          border: 1px solid #000000;
          border-radius: 4px;
          background: white;
          font-size: 16px;
          font-family: 'Source Sans Pro', sans-serif;
          color: #212529;
        }
        .subcategory-buttons {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          min-height: 42px;
        }
        .subcat-btn {
          padding: 6px 14px;
          border: 1px solid #000000;
          border-radius: 4px;
          background: white;
          cursor: pointer;
          font-size: 16px;
          font-family: 'Source Sans Pro', sans-serif;
          font-weight: 400;
          color: #212529;
          transition: all 0.2s;
        }
        .subcat-btn:hover {
          background: #000000;
          color: #ffffff;
        }
        .subcat-btn.active {
          background: #000000;
          color: white;
          border-color: #000000;
        }
        .subcat-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        #clearCache {
          padding: 8px 16px;
          border: 1px solid #000000;
          border-radius: 4px;
          background: white;
          cursor: pointer;
          font-size: 16px;
          font-family: 'Source Sans Pro', sans-serif;
          color: #212529;
        }
        #clearCache:hover {
          background: #000000;
          color: #ffffff;
        }
        #map {
          width: 100%;
          flex: 1;
          min-height: 400px;
          position: relative;
          will-change: transform;
        }

        /* Sidebar styles */
        .sidebar-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 1000;
        }

        .sidebar {
          position: absolute;
          top: 290px;
          left: -480px;
          width: 380px;
          max-width: 85vw;
          max-height: calc(100vh - 340px);
          background-color: #ffffff;
          box-shadow: 4px 0 16px rgba(0, 0, 0, 0.15);
          pointer-events: auto;
          transition: left 0.3s ease-out;
          overflow-y: auto;
          z-index: 1001;
          border-radius: 0 8px 8px 0;
        }

        .sidebar.open {
          left: 0;
        }

        .sidebar-header {
          background: #ffffff;
          padding: 16px 20px;
          position: relative;
          display: flex;
          align-items: center;
          gap: 12px;
          border-bottom: 2px solid #000000;
        }

        .sidebar-header-logo {
          height: 32px;
          width: auto;
        }

        .sidebar-close {
          background: #f3f3f3;
          border: 1px solid #000000;
          font-size: 20px;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          color: #000000;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }

        .sidebar-close:hover {
          background-color: #000000;
          color: #ffffff;
          transform: scale(1.05);
        }

        .sidebar-title {
          font-family: 'Source Sans Pro', sans-serif;
          font-weight: 600;
          font-size: 17px;
          margin: 0;
          color: #000000;
          line-height: 1.3;
          flex: 1;
        }

        .sidebar-content {
          padding: 24px 20px;
          font-family: 'Source Sans Pro', sans-serif;
          color: #212529;
        }

        .sidebar-icon-main {
          width: 100px;
          height: 100px;
          margin: 0 auto 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f3f3f3;
          border-radius: 20px;
          padding: 20px;
        }

        .sidebar-icon-main img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .sidebar-details {
          display: flex;
          flex-direction: row;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 20px;
        }

        .sidebar-detail-item {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #f3f3f3;
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px solid #565e64;
          white-space: nowrap;
        }

        .sidebar-detail-label {
          font-size: 11px;
          color: #565e64;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .sidebar-detail-label::after {
          content: ':';
        }

        .sidebar-detail-value {
          font-size: 13px;
          color: #212529;
          font-weight: 600;
        }

        .sidebar-nav-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          padding: 12px 16px;
          background: #ffffff;
          border: 2px solid #000000;
          border-radius: 8px;
          color: #000000;
          font-weight: 600;
          font-size: 16px;
          font-family: 'Source Sans Pro', sans-serif;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-top: 16px;
        }

        .sidebar-nav-btn:hover {
          background: #000000;
          color: white;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .sidebar-nav-btn:hover img {
          filter: brightness(0) invert(1);
        }

        .sidebar-nav-btn img {
          width: 28px;
          height: 28px;
          transition: filter 0.2s ease;
        }

        /* Footer */
        .footer {
          background: #e8e8e8;
          padding: 0.5rem 1.5rem;
          text-align: right;
          font-size: 80%;
          border-top: none;
          position: relative;
          z-index: 10;
        }
        .footer a {
          color: #212529;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-family: 'Source Sans Pro', sans-serif;
          transition: opacity 0.2s;
        }
        .footer a:hover {
          opacity: 0.7;
        }
        .footer img {
          height: 25px;
          width: auto;
          display: inline-block;
          margin-left: 10px;
        }
      </style>

      <div class="wrapper">
        <div class="header-bar">
          <img src="../web-component/open-data-hub-icons/Logo_RBG/OpenDataHub_Logo_BK-RGB.svg" alt="Open Data Hub" />
        </div>
        <div class="description-bar">
          <h2>Explore Urban Green Spaces</h2>
          <p>Discover vegetation, urban furniture, and green infrastructure in Padova. Browse the map and select categories to explore trees, benches, lawns, and more.</p>
        </div>
        <div class="panel">
          <div class="panel-row">
            <select id="mainTypeSelect">
              <option value="">Select main category</option>
              <option value="1">Vegetation</option>
              <option value="2">Urban Furniture</option>
              <option value="3">Use & Management</option>
            </select>
            <button id="clearCache">Clear cache</button>
          </div>
          <div class="panel-row subcategory-buttons" id="subcategoryButtons"></div>
        </div>

        <div id="map"></div>

        <div class="sidebar-overlay">
          <div class="sidebar" id="sidebar">
            <div class="sidebar-header">
              <img src="../web-component/open-data-hub-icons/Logo_RBG/OpenDataHub_Logo_BK-RGB.svg" alt="Open Data Hub" class="sidebar-header-logo" />
              <div class="sidebar-title" id="sidebarTitle"></div>
              <button class="sidebar-close" aria-label="Close">×</button>
            </div>
            <div class="sidebar-content" id="sidebarContent"></div>
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

    this._sidebar = this.shadowRoot.querySelector("#sidebar");
    this._sidebarTitle = this.shadowRoot.querySelector("#sidebarTitle");
    this._sidebarContent = this.shadowRoot.querySelector("#sidebarContent");

    this.shadowRoot.querySelector(".sidebar-close").addEventListener("click", () => {
      this.closeSidebar();
    });

    this.shadowRoot.querySelector("#mainTypeSelect").addEventListener("change", (e) => {
      this.currentMainType = e.target.value || null;
      this.currentSubcategory = null;
      this.closeSidebar();
      this.renderSubcategoryButtons();
      this.clearLayers();
      if (this.currentMainType) this.loadViewportData();
    });

    this.shadowRoot.querySelector("#clearCache").addEventListener("click", () => {
      this.clearCacheAndReload();
    });

    this.renderSubcategoryButtons();
  }

  renderSubcategoryButtons() {
    const container = this.shadowRoot.querySelector("#subcategoryButtons");
    container.innerHTML = "";

    if (!this.currentMainType) return;

    const mainType = MAIN_TYPES[this.currentMainType];
    if (!mainType) return;

    Object.entries(mainType.subcategories).forEach(([key, subcat]) => {
      const btn = document.createElement("button");
      btn.className = "subcat-btn";
      btn.textContent = subcat.name;
      btn.dataset.subcategory = key;
      
      if (this.currentSubcategory === key) {
        btn.classList.add("active");
      }

      btn.addEventListener("click", () => {
        if (this.currentSubcategory === key) {
          this.currentSubcategory = null;
        } else {
          this.currentSubcategory = key;
        }
        this.renderSubcategoryButtons();
        this.updateSources();
      });

      container.appendChild(btn);
    });
  }


  initMap() {
    this.dataLoader = new ViewportDataLoader(this.apiBase, this.lang);

    const mapContainer = this.shadowRoot.querySelector("#map");

    this.map = new maplibregl.Map({
      container: mapContainer,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      maxZoom: 22,
      style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            maxzoom: 19,
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
    });

    this.map.addControl(new maplibregl.NavigationControl());

    this.map.on("load", () => {
      this.createSourcesAndLayers();
      this.bindInteractionHandlersOnce();
    });

    this.map.on("moveend", () => this.onMapMove());
    this.map.on("zoomend", () => this.onMapMove());
    this.map.on("movestart", () => {
      this.dataLoader?.abortAll();
    });

    this.map.on("click", (e) => {
      if (!e.defaultPrevented) {
        this.closeSidebar();
      }
    });
  }

  onMapMove() {
    clearTimeout(this.moveDebounceTimer);
    this.moveDebounceTimer = setTimeout(() => {
      if (this.currentMainType) this.loadViewportData();
    }, MAP_MOVE_DEBOUNCE);
  }


  async loadViewportData() {
    if (!this.currentMainType) return;

    const requestId = ++this._requestSeq;
    this.dataLoader.abortAll();

    const bounds = this.map.getBounds();
    const zoom = this.map.getZoom();

    const features = await this.dataLoader.loadViewportData(bounds, zoom, this.currentMainType, {
      activeOnly: true,
      profile: "map",
    });

    if (requestId !== this._requestSeq) return;

    this.layerData[this.currentMainType] = Array.isArray(features) ? features : [];

    if (this.currentMainType !== "3") {
      this.buildClusters(this.currentMainType);
    }

    this.updateSources();
  }

  buildClusters(type) {
    const filtered = this.getFilteredFeatures(type);
    const points = filtered
      .filter((f) => f?.geometry?.type === "Point")
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: { ...(f.properties || {}) },
      }));

    const cluster = new Supercluster({
      radius: CLUSTER_RADIUS,
      maxZoom: CLUSTER_MAX_ZOOM,
      extent: 512,
      minPoints: 2,
    });

    cluster.load(points);
    this.clusterIndex[type] = cluster;
  }

  getFilteredFeatures(type) {
    const raw = Array.isArray(this.layerData[type]) ? this.layerData[type] : [];
    
    if (!this.currentSubcategory) {
      return raw;
    }

    const mainType = MAIN_TYPES[type];
    if (!mainType) return raw;

    const subcat = mainType.subcategories[this.currentSubcategory];
    if (!subcat) return raw;

    const filtered = raw.filter(f => {
      const props = f.properties || {};
      const subtype = String(props.greenCodeSubtype || "").padStart(2, "0");
      
      const subtypeMatch = subcat.subtypes.includes(subtype);
      if (!subtypeMatch) return false;

      if (subcat.geometries && subcat.geometries.length > 0) {
        return subcat.geometries.includes(f.geometry?.type);
      }

      return true;
    });
    
    console.log(`Filtered ${raw.length} → ${filtered.length} features for subcategory ${this.currentSubcategory}`);
    
    return filtered;
  }


  createSourcesAndLayers() {
    ["1", "2", "3"].forEach((type) => {
      const srcId = `src-${type}`;

      if (!this.map.getSource(srcId)) {
        this.map.addSource(srcId, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }

      if (!this.map.getLayer(`fill-${type}`)) {
        this.map.addLayer({
          id: `fill-${type}`,
          type: "fill",
          source: srcId,
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: {
            "fill-color": this.getSubcategoryColorExpression(type),
            "fill-opacity": type === "1" ? 0.45 : 0.6,
          },
        });
      }

      if (!this.map.getLayer(`outline-${type}`)) {
        this.map.addLayer({
          id: `outline-${type}`,
          type: "line",
          source: srcId,
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "line-color": "#fff", "line-width": 1 },
        });
      }

      if (!this.map.getLayer(`lines-${type}`)) {
        this.map.addLayer({
          id: `lines-${type}`,
          type: "line",
          source: srcId,
          filter: ["==", ["geometry-type"], "LineString"],
          paint: {
            "line-color": this.getSubcategoryColorExpression(type),
            "line-width": 3,
            "line-opacity": 0.8,
          },
        });
      }

      if (type !== "3") {
        if (!this.map.getLayer(`clusters-${type}`)) {
          this.map.addLayer({
            id: `clusters-${type}`,
            type: "circle",
            source: srcId,
            filter: ["has", "point_count"],
            paint: {
              "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 50, 28, 200, 34],
              "circle-color": "#10b981",
              "circle-stroke-width": 2,
              "circle-stroke-color": "#fff",
              "circle-opacity": 0.9,
            },
          });
        }

        if (!this.map.getLayer(`cluster-count-${type}`)) {
          this.map.addLayer({
            id: `cluster-count-${type}`,
            type: "symbol",
            source: srcId,
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count_abbreviated"],
              "text-size": 13,
              "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
              "text-allow-overlap": true,
            },
            paint: { "text-color": "#fff" },
          });
        }

        if (!this.map.getLayer(`points-${type}`)) {
          this.map.addLayer({
            id: `points-${type}`,
            type: "circle",
            source: srcId,
            filter: ["all", ["==", ["geometry-type"], "Point"], ["!", ["has", "point_count"]]],
            paint: {
              "circle-radius": 6,
              "circle-color": this.getSubcategoryColorExpression(type),
              "circle-stroke-width": 1,
              "circle-stroke-color": "#fff",
            },
          });
        }
      }
    });
  }

  updateSources() {
    ["1", "2", "3"].forEach((type) => {
      const src = this.map.getSource(`src-${type}`);
      if (!src) return;

      if (type !== this.currentMainType) {
        src.setData({ type: "FeatureCollection", features: [] });
        return;
      }

      const filtered = this.getFilteredFeatures(type);

      if (type === "3") {
        src.setData({
          type: "FeatureCollection",
          features: filtered.filter((f) => f?.geometry?.type === "Polygon"),
        });
        return;
      }

      const polygons = filtered.filter((f) => f?.geometry?.type === "Polygon");
      const lines = filtered.filter((f) => f?.geometry?.type === "LineString");
      const cluster = this.clusterIndex[type];

      const b = this.map.getBounds();
      const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      const z = Math.floor(this.map.getZoom());

      const clustered = cluster ? cluster.getClusters(bbox, z) : [];

      src.setData({
        type: "FeatureCollection",
        features: [...polygons, ...lines, ...clustered],
      });
    });
  }


  bindInteractionHandlersOnce() {
    if (this._handlersBound) return;
    this._handlersBound = true;

    ["1", "2", "3"].forEach((type) => {
      if (type !== "3") {
        this.map.on("click", `clusters-${type}`, (e) => {
          e.preventDefault();
          const f = e.features?.[0];
          if (!f) return;

          const idx = this.clusterIndex[type];
          const clusterId = f.properties?.cluster_id;
          const coords = f.geometry?.coordinates;

          if (!idx || clusterId === undefined || !coords) {
            if (coords) this.map.easeTo({ center: coords, zoom: this.map.getZoom() + 2 });
            return;
          }

          const targetZoom = Math.min(idx.getClusterExpansionZoom(clusterId), this.map.getMaxZoom());
          this.map.easeTo({ center: coords, zoom: targetZoom });
        });

        this.map.on("click", `points-${type}`, (e) => {
          e.preventDefault();
          const f = e.features?.[0];
          if (!f) return;
          this.showSidebar(f);
        });

        ["clusters-" + type, "points-" + type].forEach((layerId) => {
          this.map.on("mouseenter", layerId, () => (this.map.getCanvas().style.cursor = "pointer"));
          this.map.on("mouseleave", layerId, () => (this.map.getCanvas().style.cursor = ""));
        });
      }

      this.map.on("click", `fill-${type}`, (e) => {
        e.preventDefault();
        const f = e.features?.[0];
        if (!f) return;
        this.showSidebar(f);
      });

      this.map.on("click", `lines-${type}`, (e) => {
        e.preventDefault();
        const f = e.features?.[0];
        if (!f) return;
        this.showSidebar(f);
      });

      this.map.on("mouseenter", `fill-${type}`, () => (this.map.getCanvas().style.cursor = "pointer"));
      this.map.on("mouseleave", `fill-${type}`, () => (this.map.getCanvas().style.cursor = ""));
      
      this.map.on("mouseenter", `lines-${type}`, () => (this.map.getCanvas().style.cursor = "pointer"));
      this.map.on("mouseleave", `lines-${type}`, () => (this.map.getCanvas().style.cursor = ""));
    });
  }


  showSidebar(feature) {
    const p = feature?.properties || {};
    const mainType = MAIN_TYPES[this.currentMainType];
    const typeName = mainType?.name || "Unknown";

    let subcatName = "";
    let subcatIcon = "";
    let subcatKey = "";

    if (mainType) {
      const subtype = String(p.greenCodeSubtype || "").padStart(2, "0");
      const geomType = feature.geometry?.type;

      for (const [key, subcat] of Object.entries(mainType.subcategories)) {
        const subtypeMatch = subcat.subtypes.includes(subtype);
        const geomMatch = !subcat.geometries || subcat.geometries.includes(geomType);

        if (subtypeMatch && geomMatch) {
          subcatName = subcat.name;
          subcatIcon = subcat.icon || "";
          subcatKey = key;
          break;
        }
      }
    }

    const iconPath = subcatIcon ? `../web-component/open-data-hub-icons/${subcatIcon}` : "";

    // Get coordinates for navigation
    let coordinates = null;
    if (feature.geometry?.type === "Point") {
      coordinates = feature.geometry.coordinates;
    } else if (feature.geometry?.type === "Polygon" && feature.geometry.coordinates?.[0]?.[0]) {
      // Use first coordinate of polygon
      coordinates = feature.geometry.coordinates[0][0];
    } else if (feature.geometry?.type === "LineString" && feature.geometry.coordinates?.[0]) {
      // Use first coordinate of line
      coordinates = feature.geometry.coordinates[0];
    }

    this._sidebarTitle.textContent = p.title || "Green Area";

    this._sidebarContent.innerHTML = `
      ${iconPath ? `
      <div class="sidebar-icon-main">
        <img src="${iconPath}" alt="${this._escapeHtml(subcatName)}" />
      </div>
      ` : ''}
      <div class="sidebar-details">
        ${subcatName ? `
        <div class="sidebar-detail-item">
          <span class="sidebar-detail-label">Subcategory</span>
          <span class="sidebar-detail-value">${this._escapeHtml(subcatName)}</span>
        </div>
        ` : ''}
        <div class="sidebar-detail-item">
          <span class="sidebar-detail-label">Category</span>
          <span class="sidebar-detail-value">${this._escapeHtml(typeName)}</span>
        </div>
        <div class="sidebar-detail-item">
          <span class="sidebar-detail-label">Green Code</span>
          <span class="sidebar-detail-value">${this._escapeHtml(p.greenCode || "N/A")}</span>
        </div>
        <div class="sidebar-detail-item">
          <span class="sidebar-detail-label">Geometry</span>
          <span class="sidebar-detail-value">${this._escapeHtml(feature.geometry?.type || "Unknown")}</span>
        </div>
        <div class="sidebar-detail-item">
          <span class="sidebar-detail-label">Status</span>
          <span class="sidebar-detail-value">${p.isActive ? "Active" : "Inactive"}</span>
        </div>
      </div>
      ${coordinates ? `
      <button class="sidebar-nav-btn" onclick="window.open('https://www.google.com/maps/dir/?api=1&destination=${coordinates[1]},${coordinates[0]}', '_blank')" title="Get directions">
        <img src="../web-component/open-data-hub-icons/btn-navigation.svg" alt="Navigate" />
        <span>Get Directions</span>
      </button>
      ` : ''}
    `;

    this._sidebar.classList.add("open");
  }

  closeSidebar() {
    this._sidebar?.classList.remove("open");
  }

  _escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str ?? "");
    return div.innerHTML;
  }


  async clearCacheAndReload() {
    this.closeSidebar();
    await this.dataLoader.clearCache();
    this.clearLayers();
    if (this.currentMainType) this.loadViewportData();
  }

  clearLayers() {
    ["1", "2", "3"].forEach((t) => {
      const src = this.map.getSource(`src-${t}`);
      if (src) src.setData({ type: "FeatureCollection", features: [] });
      this.layerData[t] = [];
    });
  }

  colorForType(type) {
    return MAIN_TYPES[type]?.color || "#999";
  }

  getSubcategoryColorExpression(type) {
    const mainType = MAIN_TYPES[type];
    if (!mainType) return this.colorForType(type);

    const expression = ["case"];
    let hasColors = false;

    for (const [key, subcat] of Object.entries(mainType.subcategories)) {
      if (subcat.color) {
        hasColors = true;
        for (const subtype of subcat.subtypes) {
          const subtypeStr = subtype.padStart(2, "0");

          if (subcat.geometries) {
            for (const geom of subcat.geometries) {
              expression.push(
                ["all",
                  ["any",
                    ["==", ["to-string", ["get", "greenCodeSubtype"]], subtypeStr],
                    ["==", ["get", "greenCodeSubtype"], subtypeStr],
                    ["==", ["get", "greenCodeSubtype"], parseInt(subtype, 10)]
                  ],
                  ["==", ["geometry-type"], geom]
                ],
                subcat.color
              );
            }
          } else {
            expression.push(
              ["any",
                ["==", ["to-string", ["get", "greenCodeSubtype"]], subtypeStr],
                ["==", ["get", "greenCodeSubtype"], subtypeStr],
                ["==", ["get", "greenCodeSubtype"], parseInt(subtype, 10)]
              ],
              subcat.color
            );
          }
        }
      }
    }

    if (!hasColors) {
      return this.colorForType(type);
    }

    expression.push(this.colorForType(type));
    return expression;
  }
}

customElements.define("r3gis-urbangreen-v2", UrbanGreenMapV2);
export default UrbanGreenMapV2;