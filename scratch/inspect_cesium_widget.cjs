const fs = require('fs');
const path = require('path');

// Inspect CesiumWidget.js for default imagery/terrain providers
const widgetFile = path.join('node_modules', '@cesium', 'engine', 'Source', 'Widget', 'CesiumWidget.js');
const altWidgetFile = path.join('node_modules', 'cesium', 'Source', 'Widget', 'CesiumWidget.js');

let content = null;
let usedFile = null;

if (fs.existsSync(widgetFile)) {
  content = fs.readFileSync(widgetFile, 'utf8');
  usedFile = widgetFile;
} else if (fs.existsSync(altWidgetFile)) {
  content = fs.readFileSync(altWidgetFile, 'utf8');
  usedFile = altWidgetFile;
} else {
  // search
  const searchDirs = ['node_modules/@cesium', 'node_modules/cesium'];
  for (const d of searchDirs) {
    if (fs.existsSync(d)) {
      const files = [];
      function walk(dir) {
        for (const f of fs.readdirSync(dir)) {
          const full = path.join(dir, f);
          if (fs.statSync(full).isDirectory()) walk(full);
          else if (f === 'CesiumWidget.js') files.push(full);
        }
      }
      walk(d);
      if (files.length > 0) {
        usedFile = files[0];
        content = fs.readFileSync(usedFile, 'utf8');
        break;
      }
    }
  }
}

if (!content) {
  console.log('CesiumWidget.js not found in any expected location');
  process.exit(1);
}

console.log('Found CesiumWidget.js at:', usedFile);
const lines = content.split('\n');

// Find default imagery setup
console.log('\n=== Lines referencing baseLayer / imageryProvider / terrain in CesiumWidget ===');
lines.forEach((line, i) => {
  if (line.includes('baseLayer') || line.includes('imageryProvider') || 
      line.includes('terrainProvider') || line.includes('createWorldTerrain') ||
      line.includes('Ion') || line.includes('defaultImagery') ||
      line.includes('IonImagery') || line.includes('TileMapService')) {
    console.log(String(i+1).padStart(5) + ': ' + line.trim());
  }
});

// Print lines 1-80 of the widget setup
console.log('\n=== CesiumWidget.js first 80 lines ===');
for (let i = 0; i < Math.min(80, lines.length); i++) {
  console.log(String(i+1).padStart(5) + ': ' + lines[i]);
}
