const fs = require('fs');
const path = require('path');

// Find where options.imageryProvider is USED in Viewer.js (not just checked in condition)
const viewerFile = path.join('node_modules', '@cesium', 'widgets', 'Source', 'Viewer', 'Viewer.js');
const content = fs.readFileSync(viewerFile, 'utf8');
const lines = content.split('\n');

console.log('=== ALL lines with imageryProvider in Viewer.js ===');
lines.forEach((line, i) => {
  if (line.includes('imageryProvider')) {
    console.log(String(i+1).padStart(5) + ': ' + line.trim());
  }
});

// Also check what happens in the cesium built bundle 
// Look for where the Viewer instantiation adds the imagery layer
console.log('\n=== Viewer.js lines 720-780 ===');
for (let i = 719; i < 785; i++) {
  if (lines[i] !== undefined) {
    console.log(String(i+1).padStart(5) + ': ' + lines[i]);
  }
}
