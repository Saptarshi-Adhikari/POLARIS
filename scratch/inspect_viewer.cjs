const fs = require('fs');
const path = require('path');

// Inspect Viewer.js around imageryProvider handling to find default Ion terrain/imagery loading
const viewerFile = path.join('node_modules', '@cesium', 'widgets', 'Source', 'Viewer', 'Viewer.js');
const content = fs.readFileSync(viewerFile, 'utf8');
const lines = content.split('\n');

// Print lines 500-560 (imageryProvider handling)
console.log('=== Viewer.js lines 500-560 ===');
for (let i = 499; i < 570; i++) {
  console.log(String(i+1).padStart(5) + ': ' + lines[i]);
}

// Find all references to 'terrain' and 'IonImagery' in default setup
console.log('\n=== Lines referencing Terrain/Ion world terrain ===');
lines.forEach((line, i) => {
  if (line.includes('createWorldTerrain') || line.includes('createWorldImagery') || 
      line.includes('WorldTerrain') || line.includes('CesiumTerrainProvider') ||
      line.includes('requestWaterMask') || line.includes('requestVertexNormals')) {
    console.log(String(i+1).padStart(5) + ': ' + line.trim());
  }
});
