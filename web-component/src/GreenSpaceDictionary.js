
export const ICON_MAP = {
  "1-01": "lawn.svg",           
  "1-02": "flowerbed.svg",      
  "1-03": "ic-trees.svg",     
  "1-04": "hedge.svg",         
  "1-05": null,                 
  "2-13": "bench.svg",         
  "2-14": "fountain.svg",      
  "2-19": "waste-bin.svg",      
  "2-24": "bollard.svg",        
  "3-25": null,                 
};

export const GREEN_SPACE_DICTIONARY = {
  "1": {
    name: {
      en: "Vegetation",
      de: "Vegetation",
      it: "Vegetazione"
    },
    subtypes: {
      "01": {
        name: { en: "Lawn", de: "Rasen", it: "Prato" },
        description: { en: "Grass area", de: "Rasenfläche", it: "Area a prato" }
      },
      "02": {
        name: { en: "Flowerbed", de: "Blumenbeet", it: "Aiuola" },
        description: { en: "Planted flowerbed", de: "Bepflanztes Blumenbeet", it: "Aiuola fiorita" }
      },
      "03": {
        name: { en: "Tree/Shrub", de: "Baum/Strauch", it: "Albero/Arbusto" },
        description: { en: "Individual plant", de: "Einzelpflanze", it: "Pianta individuale" }
      },
      "04": {
        name: { en: "Hedge", de: "Hecke", it: "Siepe" },
        description: { en: "Hedge or border", de: "Hecke oder Grenze", it: "Siepe o confine" }
      },
      "05": {
        name: { en: "Ground cover", de: "Bodendecker", it: "Coprisuolo" },
        description: { en: "Ground covering plants", de: "Bodendeckende Pflanzen", it: "Piante coprisuolo" }
      }
    }
  },
  "2": {
    name: {
      en: "Urban Furniture & Infrastructure",
      de: "Stadtmöbel & Infrastruktur",
      it: "Arredo Urbano & Infrastruttura"
    },
    subtypes: {
      "05": {
        name: { en: "Paving", de: "Pflaster", it: "Pavimentazione" },
        description: { en: "Paved surface", de: "Gepflasterte Fläche", it: "Superficie pavimentata" }
      },
      "13": {
        name: { en: "Bench", de: "Bank", it: "Panchina" },
        description: { en: "Seating furniture", de: "Sitzmöbel", it: "Panchina" }
      },
      "14": {
        name: { en: "Fountain", de: "Brunnen", it: "Fontana" },
        description: { en: "Water fountain", de: "Wasserbrunnen", it: "Fontana d'acqua" }
      },
      "16": {
        name: { en: "Kerb", de: "Bordstein", it: "Cordolo" },
        description: { en: "Edge or border", de: "Kante oder Rand", it: "Bordo o margine" }
      },
      "19": {
        name: { en: "Waste bin", de: "Mülleimer", it: "Cestino rifiuti" },
        description: { en: "Trash receptacle", de: "Abfallbehälter", it: "Cestino dei rifiuti" }
      },
      "21": {
        name: { en: "Manhole", de: "Schacht", it: "Tombino" },
        description: { en: "Utility access cover", de: "Versorgungsschacht", it: "Chiusino di ispezione" }
      },
      "22": {
        name: { en: "Light pole", de: "Lichtmast", it: "Palo della luce" },
        description: { en: "Street light", de: "Straßenlaterne", it: "Lampione" }
      },
      "23": {
        name: { en: "Sign", de: "Schild", it: "Cartello" },
        description: { en: "Information or directional sign", de: "Informations- oder Wegweiser", it: "Cartello informativo" }
      },
      "24": {
        name: { en: "Bollard", de: "Poller", it: "Dissuasore" },
        description: { en: "Parking or traffic bollard", de: "Park- oder Verkehrspoller", it: "Dissuasore di sosta" }
      },
      "41": {
        name: { en: "Infrastructure", de: "Infrastruktur", it: "Infrastruttura" },
        description: { en: "Urban infrastructure element", de: "Städtische Infrastruktur", it: "Elemento infrastrutturale" }
      },
      "15": {
        name: { en: "Playground equipment", de: "Spielgerät", it: "Gioco" },
        description: { en: "Children's play equipment", de: "Kinderspielgerät", it: "Attrezzatura giochi" }
      },
      "17": {
        name: { en: "Fence", de: "Zaun", it: "Recinzione" },
        description: { en: "Barrier or fence", de: "Barriere oder Zaun", it: "Barriera o recinzione" }
      },
      "18": {
        name: { en: "Gate", de: "Tor", it: "Cancello" },
        description: { en: "Entry gate", de: "Eingangstor", it: "Cancello d'ingresso" }
      }
    }
  },
  "3": {
    name: {
      en: "Use & Management",
      de: "Nutzung & Verwaltung",
      it: "Uso & Gestione"
    },
    subtypes: {
      "25": {
        name: { en: "Management area", de: "Verwaltungsbereich", it: "Area di gestione" },
        description: { en: "Administrative boundary", de: "Verwaltungsgrenze", it: "Confine amministrativo" }
      },
      "26": {
        name: { en: "Protected area", de: "Schutzgebiet", it: "Area protetta" },
        description: { en: "Protected or restricted zone", de: "Geschützte oder eingeschränkte Zone", it: "Zona protetta" }
      },
      "27": {
        name: { en: "Recreation area", de: "Erholungsgebiet", it: "Area ricreativa" },
        description: { en: "Public recreation space", de: "Öffentlicher Erholungsraum", it: "Spazio ricreativo pubblico" }
      }
    }
  }
};

/**
 * Get human-readable info for a green space type/subtype combination
 * @param {string} type - GreenCodeType (1, 2, or 3)
 * @param {string} subtype - GreenCodeSubtype (01, 02, etc.)
 * @param {string} lang - Language code (en, de, it)
 * @returns {Object} Object with name and description
 */
export function getGreenSpaceInfo(type, subtype, lang = 'en') {
  const typeStr = String(type);
  const subtypeStr = String(subtype).padStart(2, '0');
  const typeInfo = GREEN_SPACE_DICTIONARY[typeStr];
  if (!typeInfo) {
    return {
      typeName: `Type ${typeStr}`,
      name: `Unknown`,
      description: `Type ${typeStr}, Subtype ${subtypeStr}`,
      icon: null
    };
  }

  const subtypeInfo = typeInfo.subtypes?.[subtypeStr];
  const iconKey = `${typeStr}-${subtypeStr}`;

  if (!subtypeInfo) {
    return {
      typeName: typeInfo.name[lang] || typeInfo.name.en,
      name: `Subtype ${subtypeStr}`,
      description: `${typeInfo.name[lang] || typeInfo.name.en} - ${subtypeStr}`,
      icon: ICON_MAP[iconKey] || null
    };
  }

  return {
    typeName: typeInfo.name[lang] || typeInfo.name.en,
    name: subtypeInfo.name[lang] || subtypeInfo.name.en,
    description: subtypeInfo.description?.[lang] || subtypeInfo.description?.en,
    icon: ICON_MAP[iconKey] || null
  };
}

/**
 * Enrich a GeoJSON feature with human-readable information from the dictionary
 * @param {Object} feature - GeoJSON feature with properties.GreenCodeType and properties.GreenCodeSubtype
 * @param {string} lang - Language code
 * @returns {Object} Feature with enriched properties
 */
export function enrichFeature(feature, lang = 'en') {
  if (!feature?.properties) return feature;

  const type = feature.properties.GreenCodeType;
  const subtype = String(feature.properties.GreenCodeSubtype || "").padStart(2, "0");

  const info = getGreenSpaceInfo(type, subtype, lang);

  return {
    ...feature,
    properties: {
      ...feature.properties,
      _typeName: info.typeName,
      _subtypeName: info.name,
      _description: info.description,
      _displayName: `${info.name}`,
      _fullName: `${info.typeName} - ${info.name}`
    }
  };
}
