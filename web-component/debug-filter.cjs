// Simulate the exact filtering logic from UrbanGreenMapV2.js

const testFeatures = [
  { properties: { greenCodeSubtype: "19" }, geometry: { type: "LineString" } },
  { properties: { greenCodeSubtype: "19" }, geometry: { type: "Point" } },
  { properties: { greenCodeSubtype: "13" }, geometry: { type: "Point" } },
  { properties: { greenCodeSubtype: "5" }, geometry: { type: "Polygon" } },
  { properties: { greenCodeSubtype: "05" }, geometry: { type: "Polygon" } },
];

const category = {
  subtypes: ["19"],
  geometries: ["LineString"]
};

console.log('Testing filter logic:\n');
console.log('Category config:', category);
console.log('');

testFeatures.forEach((f, i) => {
  const props = f.properties;
  const geomType = f.geometry?.type;

  // Exact logic from UrbanGreenMapV2.js filterFeatures()
  let pass = true;
  let reason = '';

  // Match geometry type (if specified)
  if (category.geometries && !category.geometries.includes(geomType)) {
    pass = false;
    reason = `Geometry ${geomType} not in ${category.geometries}`;
  }

  // Match subtype if specified
  if (pass && category.subtypes) {
    const subtype = String(props.greenCodeSubtype || "").padStart(2, "0");
    if (!category.subtypes.includes(subtype)) {
      pass = false;
      reason = `Subtype "${subtype}" (from "${props.greenCodeSubtype}") not in ${category.subtypes}`;
    }
  }

  const padded = String(props.greenCodeSubtype || "").padStart(2, "0");
  console.log(`Feature ${i}: subtype="${props.greenCodeSubtype}" -> padded="${padded}", geom=${geomType} => ${pass ? 'PASS' : 'FAIL'} ${reason}`);
});
