const VectorTileLayer = require("@mapbox/vector-tile/lib/vectortilelayer");
const Protobuf = require("pbf");

function VectorTile(pbf, end) {
  this.layers = pbf.readFields(readTile, { last: 0 }, end);
  delete this.layers.last;
}

const readTile = (tag, layers, pbf) => {
  if (tag === 3) {
    const layer = new VectorTileLayer(pbf, pbf.readVarint() + pbf.pos);
    layer.bytelength = pbf.pos - layers.last;
    layers.last = pbf.pos;
    if (layer.length) layers[layer.name] = layer;
  }
};

const tileHash = {};

onmessage = function (e) {
  const tileInfo = { layers: {} };
  if (!(e.data in tileHash)) {
    let tileCoords = /(\d+)\/(\d+)\/(\d+)\./.exec(e.data);

    if (tileCoords.length) {
      const [z, x, y] = tileCoords.slice(1, 4).map((c) => {
        return parseInt(c);
      });
      tileCoords = [x, y, z];
    }

    fetch(e.data)
      .then((response) => {
        return response.arrayBuffer();
      })
      .then((data) => {
        tileHash[e.data] = true;
        const tile = new VectorTile(new Protobuf(data));
        tileInfo.size = data.byteLength / 1000;
        for (let layer in tile.layers) {
          const layerInfo = {
            features: [tile.layers[layer].length],
            coords: [0],
            "kb min/avg/max": [tile.layers[layer].bytelength / 1000],
          };
          const layerPropertyHasher = [];
          for (var f = 0; f < tile.layers[layer].length; f++) {
            for (const [key, value] of Object.entries(
              tile.layers[layer].feature(f).properties
            )) {
              layerPropertyHasher.push(`${key}:${value}`);
            }
            layerInfo.features[0] += tile.layers[layer].length;
            let coordinates;

            let geometry = tile.layers[layer]
              .feature(f)
              .toGeoJSON(10, 10, 10).geometry; // zoom doesn't matter here, we just want to count the coords
            if (geometry["type"] === "Point") {
              coordinates = [[[geometry["coordinates"]]]];
            } else if (
              geometry["type"] === "MultiPoint" ||
              geometry["type"] === "LineString"
            ) {
              coordinates = [[geometry["coordinates"]]];
            } else if (
              geometry["type"] === "MultiLineString" ||
              geometry["type"] === "Polygon"
            ) {
              coordinates = [geometry["coordinates"]];
            } else {
              coordinates = geometry["coordinates"];
            }

            coordinates.forEach((chunk) => {
              chunk.forEach((part) => {
                layerInfo.coords[0] += part.length;
              });
            });
          }
          const unique = [...new Set(layerPropertyHasher)];
          layerInfo.u_attrs = [unique.length];
          tileInfo.layers[layer] = layerInfo;
        }
        if (tileCoords.length) {
          tileInfo.tile = tileCoords;
        }
        postMessage(tileInfo);
      });
  } else {
    console.log(`Already checked ${e.data}, skipping`);
  }
};
