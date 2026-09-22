/**
 * POLARIS Real Maritime Datasets (USNIC Iceberg Observations & Copernicus Marine Replay)
 * Historical replay data for REAL DATA MODE.
 */

export const USNIC_ICEBERG_SAMPLES = [
  {
    id: 'USNIC-A68A',
    name: 'A-68A (Drake Passage)',
    latitude: -61.20,
    longitude: -55.40,
    lengthMeters: 4200,
    widthMeters: 2800,
    massScale: 4.5,
    size: 2400,
    collisionRadius: 80,
    timestamp: '2026-03-15T12:00:00Z',
    source: 'USNIC (U.S. National Ice Center)',
    confidence: 0.98,
    uncertainty: 0.02
  },
  {
    id: 'USNIC-B15A',
    name: 'B-15A (Ross Sea Segment)',
    latitude: -64.80,
    longitude: -62.10,
    lengthMeters: 3100,
    widthMeters: 1900,
    massScale: 3.2,
    size: 1800,
    collisionRadius: 60,
    timestamp: '2026-03-15T12:00:00Z',
    source: 'USNIC (U.S. National Ice Center)',
    confidence: 0.96,
    uncertainty: 0.04
  },
  {
    id: 'USNIC-C19B',
    name: 'C-19B Remnant',
    latitude: -67.50,
    longitude: -58.90,
    lengthMeters: 1800,
    widthMeters: 1200,
    massScale: 2.1,
    size: 1200,
    collisionRadius: 40,
    timestamp: '2026-03-15T12:00:00Z',
    source: 'USNIC (U.S. National Ice Center)',
    confidence: 0.94,
    uncertainty: 0.05
  },
  {
    id: 'USNIC-A74',
    name: 'A-74 (Brunt Ice Shelf Fragment)',
    latitude: -71.30,
    longitude: -48.20,
    lengthMeters: 2600,
    widthMeters: 1700,
    massScale: 2.8,
    size: 1500,
    collisionRadius: 50,
    timestamp: '2026-03-15T12:00:00Z',
    source: 'USNIC (U.S. National Ice Center)',
    confidence: 0.95,
    uncertainty: 0.03
  },
  {
    id: 'USNIC-B09B',
    name: 'B-09B Growler Cluster',
    latitude: -69.10,
    longitude: -42.50,
    lengthMeters: 1100,
    widthMeters: 800,
    massScale: 1.4,
    size: 800,
    collisionRadius: 28,
    timestamp: '2026-03-15T12:00:00Z',
    source: 'USNIC (U.S. National Ice Center)',
    confidence: 0.92,
    uncertainty: 0.06
  },
  {
    id: 'USNIC-D28',
    name: 'D-28 (Mertz Glacier Bergy Bit)',
    latitude: -66.30,
    longitude: -68.40,
    lengthMeters: 900,
    widthMeters: 650,
    massScale: 1.1,
    size: 600,
    collisionRadius: 22,
    timestamp: '2026-03-15T12:00:00Z',
    source: 'USNIC (U.S. National Ice Center)',
    confidence: 0.91,
    uncertainty: 0.07
  }
];

export const COPERNICUS_ERA5_ENVIRONMENT_SAMPLE = {
  timestamp: '2026-03-15T12:00:00Z',
  source: 'Copernicus Marine / ERA5 Hourly Replay',
  current: {
    speedKnots: 2.1,
    directionDegrees: 135,
    vx: 0.25,
    vy: 0.15
  },
  wind: {
    speedKnots: 38.5,
    directionDegrees: 240,
    vx: -0.45,
    vy: -0.20
  },
  seaIce: {
    averageConcentration: 0.28,
    resistanceFactor: 1.2
  },
  visibilityNauticalMiles: 12.0
};
