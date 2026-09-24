const fs = require('fs');
const path = require('path');

// Find the compiled Cesium bundle in the Vite build or in node_modules
// to understand how imageryProvider is handled in the actual built version

// Check the Viewer.js more carefully around lines 704-730
const viewerFile = path.join('node_modules', '@cesium', 'widgets', 'Source', 'Viewer', 'Viewer.js');
const content = fs.readFileSync(viewerFile, 'utf8');
const lines = content.split('\n');

console.log('=== Viewer.js lines 700-740 (after baseLayerPicker setup) ===');
for (let i = 699; i < 742; i++) {
  if (lines[i] !== undefined) {
    console.log(String(i+1).padStart(5) + ': ' + lines[i]);
  }
}

// Also check if there's a deprecated imageryProvider compat shim
console.log('\n=== Viewer.js: imageryProvider handling lines ===');
lines.forEach((line, i) => {
  if (line.trim().includes('options.imageryProvider') || 
      (line.includes('deprecated') && i > 300)) {
    console.log(String(i+1).padStart(5) + ': ' + line.trim());
  }
});

// Also look at CesiumWidget lines 370-400 (where baseLayer false check happens)
const widgetFile = path.join('node_modules', '@cesium', 'engine', 'Source', 'Widget', 'CesiumWidget.js');
const wContent = fs.readFileSync(widgetFile, 'utf8');
const wLines = wContent.split('\n');

console.log('\n=== CesiumWidget.js lines 368-400 ===');
for (let i = 367; i < 402; i++) {
  if (wLines[i] !== undefined) {
    console.log(String(i+1).padStart(5) + ': ' + wLines[i]);
  }
}
