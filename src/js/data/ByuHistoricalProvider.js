/**
 * POLARIS BYU Historical Iceberg Trajectory Provider
 *
 * BYU/NIC Antarctic Iceberg Tracking Database (BYU MERS / NASA SCP)
 * Parses Scatterometer SIR tracking records (.ascat / YYYYDDD date format)
 * and manages historical trajectory playback.
 */

import a23aTrack from '../../../data/antarctic/byu_tracks/a23a_track.json' with { type: 'json' };
import d15Track from '../../../data/antarctic/byu_tracks/d15_track.json' with { type: 'json' };
import b22aTrack from '../../../data/antarctic/byu_tracks/b22a_track.json' with { type: 'json' };
import b27Track from '../../../data/antarctic/byu_tracks/b27_track.json' with { type: 'json' };

export function dayOfYearToDate(dayNum, yearNum) {
  const date = new Date(Date.UTC(yearNum, 0, 1));
  date.setUTCDate(dayNum);
  return date.toISOString().split('T')[0];
}

export class ByuHistoricalProvider {
  constructor() {
    this.bundledTracks = new Map([
      ['A23A', a23aTrack],
      ['D15', d15Track],
      ['B22A', b22aTrack],
      ['B27', b27Track]
    ]);
  }

  normalizeIcebergKey(name) {
    if (!name || typeof name !== 'string') return '';
    const upper = name.trim().toUpperCase();
    if (upper.includes('A23A')) return 'A23A';
    if (upper.includes('D15')) return 'D15';
    if (upper.includes('B22A')) return 'B22A';
    if (upper.includes('B27')) return 'B27';
    return upper;
  }

  async getHistoricalTrack(icebergName) {
    const key = this.normalizeIcebergKey(icebergName);
    if (!key) return null;

    const cacheKey = `astralis:real:byu_track:${key}`;
    if (typeof localStorage !== 'undefined') {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && Array.isArray(parsed.observations) && parsed.observations.length > 0) {
            return parsed;
          }
        }
      } catch (e) {}
    }

    // Attempt remote fetch from BYU
    try {
      const url = `https://www.scp.byu.edu/data/iceberg/ascat/${key.toLowerCase()}.ascat`;
      const res = await fetch(url);
      if (res.ok) {
        const text = await res.text();
        const parsed = this.parseAscatFile(key, text);
        if (parsed && parsed.observations.length > 0) {
          if (typeof localStorage !== 'undefined') {
            try {
              localStorage.setItem(cacheKey, JSON.stringify(parsed));
            } catch (e) {}
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn(`[ByuHistoricalProvider] Remote fetch for ${key} deferred, using bundled snapshot:`, e);
    }

    // Fallback to pre-bundled snapshot
    if (this.bundledTracks.has(key)) {
      const snapshot = this.bundledTracks.get(key);
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(cacheKey, JSON.stringify(snapshot));
        } catch (e) {}
      }
      return snapshot;
    }

    return null;
  }

  parseAscatFile(icebergKey, fileText) {
    if (!fileText || typeof fileText !== 'string') return null;
    const lines = fileText.trim().split('\n');
    const observations = [];
    const regex = /lat:\s*([-\d.]+)\s*lon:\s*([-\d.]+)\s*day:\s*(\d+)\s*(\d{4})/;

    for (const line of lines) {
      const match = regex.exec(line);
      if (match) {
        const lat = parseFloat(match[1]);
        const lon = parseFloat(match[2]);
        const day = parseInt(match[3], 10);
        const year = parseInt(match[4], 10);

        if (!isNaN(lat) && !isNaN(lon) && !isNaN(day) && !isNaN(year) && lat <= -45.0 && lat >= -90.0 && lon >= -180.0 && lon <= 180.0) {
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

    observations.sort((a, b) => a.date.localeCompare(b.date));

    if (observations.length === 0) return null;

    return {
      icebergId: icebergKey,
      name: `Iceberg ${icebergKey}`,
      source: 'BYU/NIC Scatterometer Climate Record Pathfinder (SCP)',
      observationCount: observations.length,
      startDate: observations[0].date,
      endDate: observations[observations.length - 1].date,
      observations
    };
  }

  /** Calculate replay position at or before targetDateStr (YYYY-MM-DD) */
  getReplayState(track, targetDateStr) {
    if (!track || !Array.isArray(track.observations) || track.observations.length === 0) {
      return null;
    }

    const obsList = track.observations;
    if (!targetDateStr) {
      const last = obsList[obsList.length - 1];
      return {
        currentIndex: obsList.length - 1,
        currentObservation: last,
        traversedObservations: obsList,
        progressPercent: 100
      };
    }

    let foundIdx = 0;
    for (let i = 0; i < obsList.length; i++) {
      if (obsList[i].date <= targetDateStr) {
        foundIdx = i;
      } else {
        break;
      }
    }

    const currentObs = obsList[foundIdx];
    const traversed = obsList.slice(0, foundIdx + 1);
    const progressPercent = Math.round(((foundIdx + 1) / obsList.length) * 100);

    return {
      currentIndex: foundIdx,
      currentObservation: currentObs,
      traversedObservations: traversed,
      progressPercent
    };
  }
}

export const byuHistoricalProvider = new ByuHistoricalProvider();
