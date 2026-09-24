const fs = require('fs');
const path = require('path');

// Look at the actual Viewer.js lines that handle imageryProvider → baseLayer conversion
const viewerFile = path.join('node_modules', '@cesium', 'widgets', 'Source', 'Viewer', 'Viewer.js');
const content = fs.readFileSync(viewerFile, 'utf8');
const lines = content.split('\n');

// Find imageryProvider deprecated handling
console.log('=== Viewer.js lines referencing imageryProvider deprecation ===');
lines.forEach((line, i) => {
  if (line.includes('imageryProvider') || line.includes('deprecated') || line.includes('baseLayer')) {
    console.log(String(i+1).padStart(5) + ': ' + line.trim());
  }
});

// Also look at what ImageryLayer.fromWorldImagery does - find its source
const engineDir = path.join('node_modules', '@cesium', 'engine', 'Source');
const imageryLayerFile = path.join(engineDir, 'Scene', 'ImageryLayer.js');
if (fs.existsSync(imageryLayerFile)) {
  const ilContent = fs.readFileSync(imageryLayerFile, 'utf8');
  const ilLines = ilContent.split('\n');
  console.log('\n=== ImageryLayer.fromWorldImagery ===');
  let inMethod = false;
  ilLines.forEach((line, i) => {
    if (line.includes('fromWorldImagery')) {
      inMethod = true;
    }
    if (inMethod) {
      console.log(String(i+1).padStart(5) + ': ' + line.trim());
      if (i > 0 && ilLines[i] === '}' && inMethod) {
        inMethod = false;
      }
    }
    if (inMethod && i > 500) inMethod = false; // safety limit
  });
}
