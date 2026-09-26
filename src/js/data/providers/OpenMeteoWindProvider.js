/**
 * POLARIS Open-Meteo Wind & Marine Provider
 * Requests live atmospheric wind & surface current vectors for Antarctic coordinates.
 */

export class OpenMeteoWindProvider {
  constructor() {
    this.name = 'Open-Meteo Atmospheric Weather API';
    this.apiUrl = 'https://api.open-meteo.com/v1/forecast';
  }

  async fetchWind(lat = -65.0, lon = -60.0) {
    const fetchStart = performance.now();
    try {
      const url = `${this.apiUrl}?latitude=${lat}&longitude=${lon}&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data && data.current) {
          const speedKnots = (data.current.wind_speed_10m || 20) * 0.539957; // km/h to knots
          const direction = data.current.wind_direction_10m || 240;
          return {
            speed: speedKnots,
            direction: direction,
            source: 'Open-Meteo Live API',
            timestamp: new Date().toISOString(),
            latencyMs: Math.round(performance.now() - fetchStart)
          };
        }
      }
    } catch (err) {
      console.info('[OpenMeteoWindProvider] Live wind fetch offline/fallback:', err.message);
    }

    return {
      speed: 38.5,
      direction: 240,
      source: 'Open-Meteo Sample Replay',
      timestamp: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - fetchStart)
    };
  }
}
