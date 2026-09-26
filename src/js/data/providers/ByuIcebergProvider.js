/**
 * POLARIS BYU / SCP Iceberg Data & Track Provider
 * Secondary & historical iceberg provider (byu.edu)
 */

export class ByuIcebergProvider {
  constructor() {
    this.name = 'BYU SCP Iceberg Database';
    this.githubMirrorUrl = 'https://raw.githubusercontent.com/Joel-hanson/Iceberg-locations/main/api/latest.json';
    this.byuUrl = 'https://www.scp.byu.edu/current_icebergs.html';
  }

  async fetchIcebergs() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(this.githubMirrorUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        const json = await response.json();
        if (Array.isArray(json)) {
          return {
            records: json.map(item => ({
              id: item.name || item.id,
              name: item.name || item.id,
              latitude: item.latitude || item.lat,
              longitude: item.longitude || item.lon,
              source: 'BYU / SCP Mirror'
            })),
            source: 'BYU / SCP GitHub Mirror'
          };
        }
      }
    } catch (e) {}

    return null;
  }
}
