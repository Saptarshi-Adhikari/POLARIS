/**
 * POLARIS Antarctic Coastline & Land Polygon Data
 */
export const antarcticaCoastlineData = {
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "name": "Antarctica Continent & Ice Shelf Boundary" },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [60.0, -69.2], [70.0, -69.2], [72.0, -69.3], [74.0, -69.4], [76.0, -69.4], [78.0, -69.5],
            [80.0, -69.2], [90.0, -69.2], [90.0, -78.0], [60.0, -78.0], [60.0, -69.2]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": { "name": "Prydz Bay Coastline Shelf" },
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [68.0, -67.5], [71.5, -68.2], [74.5, -68.6], [76.2, -69.4], [78.5, -69.2], [82.0, -68.4]
        ]
      }
    }
  ]
};
