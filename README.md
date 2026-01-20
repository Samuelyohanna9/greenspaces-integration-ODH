# Padova Green Spaces Integration - Open Data Hub

Interactive web component for visualizing urban green infrastructure in Padova, Italy. Built in collaboration with R3GIS and Open Data Hub.

## Features

- **Interactive Map Visualization** - Explore green spaces, urban furniture, and management zones
- **Category Filtering** - Filter by vegetation types, urban furniture, and usage zones
- **Subcategory Selection** - Detailed filtering (trees, lawns, benches, fountains, etc.)
- **Detailed Sidebar** - Click any feature to see detailed information
- **Navigation Integration** - Get directions to any green space via Google Maps
- **Two Data Sources**:
  - **Live API**: Real-time data from Open Data Hub
  - **PMTiles**: Optimized vector tiles for faster loading

## Live Demo

- **[Launch Application](https://samuelyohanna9.github.io/greenspaces-integration-ODH/client-site/)**
- [Live API Version](https://samuelyohanna9.github.io/greenspaces-integration-ODH/client-site/index-live.html)
- [PMTiles Version](https://samuelyohanna9.github.io/greenspaces-integration-ODH/client-site/index-pmtiles.html)

## Data Categories

### Vegetation
- **Trees & Plants** - Individual trees and plant points (Dark Green: #228B22)
- **Hedges** - Linear hedge features (Medium Sea Green: #3CB371)
- **Lawns** - Grass and lawn areas (Light Green: #90EE90)
- **Flowerbeds** - Garden and flowerbed zones (Bright Green: #7CFC00)

### Urban Furniture
- **Benches** - Seating areas (Sienna Brown: #A0522D)
- **Waste Bins** - Waste containers (Dim Grey: #696969)
- **Bollards** - Street bollards (Gold: #FFD700)
- **Fountains/Hydrants** - Water features (Dodger Blue: #1E90FF)
- **Shelters & Canopies** - Covered structures (Tan: #D2B48C)

### Use & Management
- Green area boundaries
- Usage zones
- Temporary areas

## Technology Stack

- **MapLibre GL JS** - Interactive map rendering
- **PMTiles** - Optimized vector tile format
- **Web Components** - Reusable custom elements
- **Vite** - Build tool and bundler
- **Open Data Hub API** - Real-time green space data

## Installation

```bash
# Clone the repository
git clone https://github.com/samuelyohanna9/greenspaces-integration-ODH.git
cd greenspaces-integration-ODH

# Install dependencies
cd web-component
npm install

# Build the components
npm run build:all
```

## Building

```bash
# Build live API version only
npm run build

# Build PMTiles version only
npm run build:pmtiles

# Build both versions
npm run build:all
```

## Usage

### Using the Web Component

```html
<!-- Live API Version -->
<r3gis-urbangreen-v2
  api-base="https://api.tourism.testingmachine.eu"
  lang="en">
</r3gis-urbangreen-v2>

<script src="./web-component/dist/r3gis-urbangreen.iife.js"></script>

<!-- PMTiles Version -->
<urbangreen-map-pmtiles
  pmtiles-url="https://your-url.com/urbangreen.pmtiles"
  language="en">
</urbangreen-map-pmtiles>

<script src="./web-component/dist/r3gis-urbangreen-pmtiles.iife.js"></script>
```

## Project Structure

```
greenspaces-integration-ODH/
├── client-site/              # Demo HTML pages
│   ├── index.html           # Main landing page
│   ├── index-live.html      # Live API demo
│   └── index-pmtiles.html   # PMTiles demo
├── web-component/           # Web component source
│   ├── src/
│   │   ├── UrbanGreenMapV2.js        # Live API version
│   │   └── UrbanGreenMapPMTiles.js   # PMTiles version
│   ├── dist/                # Built files
│   └── open-data-hub-icons/ # Category icons
└── README.md
```

## �� Color Standards

Colors are based on international urban planning and cartographic standards:

- **Vegetation**: Green family (#228B22 to #90EE90) - Based on LBCS and OpenStreetMap standards
- **Urban Furniture**: Brown/Grey family - Standard for street furniture mapping
- **Water Features**: Blue (#1E90FF) - Universal water element color
- **High Visibility Items**: Yellow/Gold (#FFD700) - Safety standard for bollards

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is part of the Open Data Hub collaboration.

## Credits

- **R3GIS** - Data, Development and implementation
- **Open Data Hub** - Data intergration and API
- **City of Padova** - Green space data

## Contact

For questions or support, please contact R3GIS or Open Data Hub.

