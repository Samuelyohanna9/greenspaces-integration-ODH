import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as pmtiles from "pmtiles";

const DEFAULT_CENTER = [11.8768, 45.4064];
const DEFAULT_ZOOM = 11;

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

class UrbanGreenMapPMTiles extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this.map = null;
    this.pmtilesUrl = null;
    this.lang = "en";
    this.currentMainType = null;
    this.currentSubcategory = null;
    this._sidebar = null;
    this._sidebarTitle = null;
    this._sidebarContent = null;
  }

  connectedCallback() {
    this.pmtilesUrl = this.getAttribute("pmtiles-url") ||
      "https://pub-6af0cab720894f57a27ad4199ce3ffa3.r2.dev/urbangreen.pmtiles";
    this.lang = this.getAttribute("language") || "en";

    this.render();
    this.initMap();
  }

  disconnectedCallback() {
    this.closeSidebar();
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  render() {
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
          padding: 12px 16px;
          background: #e8e8e8;
          border-bottom: none;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .header-bar img {
          height: 45px;
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
        .badge {
          position: absolute;
          top: 20px;
          right: 20px;
          background: #000000;
          color: #ffffff;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          font-family: 'Source Sans Pro', sans-serif;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
          z-index: 1;
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
            <div class="badge">PMTiles</div>
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
      this.updateLayerVisibility();
    });

    this.renderSubcategoryButtons();
  }

  async initMap() {
    try {
      console.log('Initializing PMTiles map...');
      console.log('PMTiles URL:', this.pmtilesUrl);

      if (!window.__pmtilesProtocol) {
        console.log('Registering PMTiles protocol...');
        window.__pmtilesProtocol = new pmtiles.Protocol();
        maplibregl.addProtocol("pmtiles", window.__pmtilesProtocol.tile);
        console.log('PMTiles protocol registered');
      }
      const protocol = window.__pmtilesProtocol;

      const style = {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors"
          }
        },
        layers: [
          {
            id: "osm",
            type: "raster",
            source: "osm"
          }
        ]
      };

      this.map = new maplibregl.Map({
        container: this.shadowRoot.querySelector("#map"),
        style: style,
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM
      });

      this.map.on("load", async () => {
        console.log('Map loaded successfully');

        const archive = new pmtiles.PMTiles(this.pmtilesUrl);
        this.archive = archive;
        protocol.add(archive);
        console.log('PMTiles archive added to protocol');

        this.addPMTilesSource();
        this.createLayers();
        this.setupInteractivity();
      });

      this.map.on("click", (e) => {
        if (!e.defaultPrevented) {
          this.closeSidebar();
        }
      });

      this.map.on("error", (e) => {
        console.error('Map error:', e);
      });

      this.map.addControl(new maplibregl.NavigationControl());

    } catch (error) {
      console.error(' Failed to initialize map:', error);
    }
  }

  addPMTilesSource() {
    try {
      console.log('Adding PMTiles source...');
      console.log('PMTiles URL for source:', this.pmtilesUrl);

      this.map.addSource('urbangreen', {
        type: 'vector',
        url: `pmtiles://${this.pmtilesUrl}`,
        attribution: '© Data contributors'
      });

      console.log('PMTiles source added');

      setTimeout(() => {
        const source = this.map.getSource('urbangreen');
        console.log('Source object:', source);
        if (source && source._tileJSONURL) {
          console.log('TileJSON URL:', source._tileJSONURL);
        }
      }, 1000);
    } catch (error) {
      console.error(' Error adding PMTiles source:', error);
    }
  }

  createLayers() {
    const types = ["1", "2", "3"];

    const sourceLayer = "urbangreen"; 

    types.forEach((type) => {
      const color = MAIN_TYPES[type].color;
      const subcategoryColor = this.getSubcategoryColorExpression(type);

      try {
        const typeFilter = [
          "==",
          ["slice", ["to-string", ["get", "greenCode"]], 1, 2],
          type
        ];

        this.map.addLayer({
          id: `polygons-fill-${type}`,
          type: "fill",
          source: 'urbangreen',
          "source-layer": sourceLayer,
          filter: [
            "all",
            typeFilter,
            ["==", ["geometry-type"], "Polygon"]
          ],
          paint: {
            "fill-color": subcategoryColor,
            "fill-opacity": 0.3
          },
          layout: {
            visibility: "none"
          }
        });

        this.map.addLayer({
          id: `polygons-outline-${type}`,
          type: "line",
          source: 'urbangreen',
          "source-layer": sourceLayer,
          filter: [
            "all",
            typeFilter,
            ["==", ["geometry-type"], "Polygon"]
          ],
          paint: {
            "line-color": subcategoryColor,
            "line-width": 2
          },
          layout: {
            visibility: "none"
          }
        });

        this.map.addLayer({
          id: `lines-${type}`,
          type: "line",
          source: 'urbangreen',
          "source-layer": sourceLayer,
          filter: [
            "all",
            typeFilter,
            ["==", ["geometry-type"], "LineString"]
          ],
          paint: {
            "line-color": subcategoryColor,
            "line-width": 3
          },
          layout: {
            visibility: "none"
          }
        });

        this.map.addLayer({
          id: `points-${type}`,
          type: "circle",
          source: 'urbangreen',
          "source-layer": sourceLayer,
          filter: [
            "all",
            typeFilter,
            ["==", ["geometry-type"], "Point"]
          ],
          paint: {
            "circle-color": subcategoryColor,
            "circle-radius": 6,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#fff"
          },
          layout: {
            visibility: "none"
          }
        });

        console.log(`Created layers for type ${type}`);
      } catch (error) {
        console.error(`Error creating layers for type ${type}:`, error);
      }
    });
  }

  setupInteractivity() {
    const layers = [
      "polygons-fill-1", "polygons-fill-2", "polygons-fill-3",
      "lines-1", "lines-2", "lines-3",
      "points-1", "points-2", "points-3"
    ];

    layers.forEach((layer) => {
      this.map.on("mouseenter", layer, () => {
        this.map.getCanvas().style.cursor = "pointer";
      });
      this.map.on("mouseleave", layer, () => {
        this.map.getCanvas().style.cursor = "";
      });
    });

    layers.forEach((layer) => {
      this.map.on("click", layer, (e) => {
        e.preventDefault();
        const f = e.features?.[0];
        if (!f) return;
        this.showSidebar(f);
      });
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
      const greenCode = String(p.greenCode || "");
      const subtype = greenCode.length >= 4 ? greenCode.substring(2, 4) : "";
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
        this.updateLayerVisibility();
      });

      container.appendChild(btn);
    });
  }

  clearSubcategoryButtons() {
    const container = this.shadowRoot.querySelector("#subcategoryButtons");
    container.innerHTML = "";
  }

  updateLayerVisibility() {
    const types = ["1", "2", "3"];

    console.log('Updating layer visibility. Current main type:', this.currentMainType, 'Current subcategory:', this.currentSubcategory);

    types.forEach((type) => {
      const visible = type === this.currentMainType;
      const visibility = visible ? "visible" : "none";

      let filter = [
        "==",
        ["slice", ["to-string", ["get", "greenCode"]], 1, 2],
        type
      ];

      if (visible && this.currentSubcategory) {
        const mainType = MAIN_TYPES[type];
        const subcat = mainType?.subcategories[this.currentSubcategory];

        if (subcat) {
          const subtypeFilters = subcat.subtypes.map(st =>
            ["==", ["slice", ["to-string", ["get", "greenCode"]], 2, 4], st]
          );

          const subtypeFilter = subtypeFilters.length > 1
            ? ["any", ...subtypeFilters]
            : subtypeFilters[0];

          filter = ["all", filter, subtypeFilter];

          if (subcat.geometries && subcat.geometries.length > 0) {
            const geomFilters = subcat.geometries.map(g =>
              ["==", ["geometry-type"], g]
            );
            const geomFilter = geomFilters.length > 1
              ? ["any", ...geomFilters]
              : geomFilters[0];
            filter = ["all", filter, geomFilter];
          }
        }
      }

      ["polygons-fill", "polygons-outline", "lines", "points"].forEach((prefix) => {
        const layerId = `${prefix}-${type}`;
        if (this.map.getLayer(layerId)) {
          this.map.setLayoutProperty(layerId, "visibility", visibility);
          if (visible) {
            this.map.setFilter(layerId, [
              "all",
              filter,
              ["==", ["geometry-type"], this.getGeometryTypeForLayer(prefix)]
            ]);
          }
        }
      });
    });
  }

  getGeometryTypeForLayer(prefix) {
    if (prefix.startsWith("polygons")) return "Polygon";
    if (prefix === "lines") return "LineString";
    if (prefix === "points") return "Point";
    return "Point";
  }

  hideAllLayers() {
    const types = ["1", "2", "3"];
    types.forEach((type) => {
      ["polygons-fill", "polygons-outline", "lines", "points"].forEach((prefix) => {
        const layerId = `${prefix}-${type}`;
        if (this.map.getLayer(layerId)) {
          this.map.setLayoutProperty(layerId, "visibility", "none");
        }
      });
    });
  }

  getSubcategoryColorExpression(type) {
    const mainType = MAIN_TYPES[type];
    if (!mainType) return "#999";

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
                  ["==", ["slice", ["to-string", ["get", "greenCode"]], 2, 4], subtypeStr],
                  ["==", ["geometry-type"], geom]
                ],
                subcat.color
              );
            }
          } else {
            expression.push(
              ["==", ["slice", ["to-string", ["get", "greenCode"]], 2, 4], subtypeStr],
              subcat.color
            );
          }
        }
      }
    }

    if (!hasColors) {
      return mainType.color || "#999";
    }

    expression.push(mainType.color || "#999");
    return expression;
  }
}

customElements.define("urbangreen-map-pmtiles", UrbanGreenMapPMTiles);

export default UrbanGreenMapPMTiles;