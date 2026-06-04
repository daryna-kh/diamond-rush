import { Assets } from "pixi.js";

export const worlds = [
  { id: "angkor", label: "Angkor" },
  { id: "bavaria", label: "Bavaria" },
  { id: "siberia", label: "Siberia" },
];

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
  return response.json();
}

function publicAssetUrl(path) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
}

export async function loadInitialAssets() {
  const objectsTexture = await Assets.load(publicAssetUrl("assets/atlases/objects.png"));
  const objectsAtlas = await loadJson(publicAssetUrl("assets/atlases/objects.json"));
  const stageMetadata = await loadJson(publicAssetUrl("assets/data/stage-metadata.json"));

  const worldAssets = await Promise.all(
    worlds.map(async (world) => {
      const [tilesTexture, tilesAtlas, stages, stageRenderMap] = await Promise.all([
        Assets.load(publicAssetUrl(`assets/atlases/tiles-${world.id}.png`)),
        loadJson(publicAssetUrl(`assets/atlases/tiles-${world.id}.json`)),
        loadJson(publicAssetUrl(`assets/data/stages-${world.id}.json`)),
        loadJson(publicAssetUrl(`assets/data/stage-render-map-${world.id}.json`)),
      ]);

      return { world, tilesTexture, tilesAtlas, stages, stageRenderMap };
    }),
  );

  const textures = { objects: objectsTexture };
  const atlases = { objects: objectsAtlas };
  const stagesByWorld = {};
  const stageRenderMaps = {};

  for (const entry of worldAssets) {
    const tilesKey = `tiles-${entry.world.id}`;
    textures[tilesKey] = entry.tilesTexture;
    atlases[tilesKey] = entry.tilesAtlas;
    stagesByWorld[entry.world.id] = entry.stages;
    stageRenderMaps[entry.world.id] = entry.stageRenderMap;
  }

  return {
    worlds,
    textures,
    atlases,
    stages: stagesByWorld,
    stageRenderMaps,
    stageMetadata,
  };
}
