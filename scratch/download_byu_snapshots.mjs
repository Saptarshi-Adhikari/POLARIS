import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function dayOfYearToDate(dayNum, yearNum) {
  const date = new Date(Date.UTC(yearNum, 0, 1));
  date.setUTCDate(dayNum);
  return date.toISOString().split('T')[0];
}

async function bundleBYUTracks() {
  const bergs = ['a23a', 'd15', 'b22a', 'b27'];
  const outDir = path.resolve(__dirname, '../data/antarctic/byu_tracks');

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  for (const b of bergs) {
    const url = `https://www.scp.byu.edu/data/iceberg/ascat/${b}.ascat`;
    console.log(`Downloading BYU track for ${b}:`, url);

    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`Failed to fetch ${b}: HTTP ${res.status}`);
        continue;
      }
      const text = await res.text();
      const lines = text.trim().split('\n');
      const observations = [];

      const regex = /lat:\s*([-\d.]+)\s*lon:\s*([-\d.]+)\s*day:\s*(\d+)\s*(\d{4})/;

      for (const line of lines) {
        const match = regex.exec(line);
        if (match) {
          const lat = parseFloat(match[1]);
          const lon = parseFloat(match[2]);
          const day = parseInt(match[3], 10);
          const year = parseInt(match[4], 10);

          if (!isNaN(lat) && !isNaN(lon) && !isNaN(day) && !isNaN(year) && lat <= -45.0) {
            const dateStr = dayOfYearToDate(day, year);
            observations.push({
              date: dateStr,
              timestamp: dateStr,
              year,
              day,
              latitude: lat,
              longitude: lon
            });
          }
        }
      }

      // Sort chronologically
      observations.sort((a, b) => a.date.localeCompare(b.date));

      const payload = {
        icebergId: b.toUpperCase(),
        name: `Iceberg ${b.toUpperCase()}`,
        source: 'BYU/NIC Scatterometer Climate Record Pathfinder (SCP)',
        observationCount: observations.length,
        startDate: observations[0]?.date || '',
        endDate: observations[observations.length - 1]?.date || '',
        observations
      };

      const filePath = path.join(outDir, `${b.toLowerCase()}_track.json`);
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
      console.log(`Saved ${payload.observationCount} observations for ${b.toUpperCase()} to ${filePath}`);
    } catch (e) {
      console.error(`Error processing ${b}:`, e);
    }
  }
}

bundleBYUTracks();
