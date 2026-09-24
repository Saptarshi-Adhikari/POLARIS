const fs = require('fs');
const path = require('path');

// Search ENTIRE @cesium packages for imageryProvider handling
// Check if it's handled in a newer way

// First check if there's a deprecated shim file
const dirs = [
  'node_modules/@cesium/widgets/Source',
  'node_modules/@cesium/engine/Source',
  'node_modules/cesium/Source',
];

for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  
  const allFiles = [];
  function walkDir(d) {
    try {
      for (const f of fs.readdirSync(d)) {
        const full = path.join(d, f);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walkDir(full);
        else if (f.endsWith('.js')) allFiles.push(full);
      }
    } catch(e) {}
  }
  walkDir(dir);
  
  for (const file of allFiles) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('imageryProvider') && content.includes('deprecated')) {
      const lines = content.split('\n');
      console.log('\n=== File with imageryProvider + deprecated:', file, '===');
      lines.forEach((line, i) => {
        if ((line.includes('imageryProvider') && !line.includes('@param') && !line.includes('*')) ||
            (line.includes('deprecated') && !line.includes('@deprecated') && !line.includes('*'))) {
          console.log(String(i+1).padStart(5) + ': ' + line.trim());
        }
      });
    }
  }
}
