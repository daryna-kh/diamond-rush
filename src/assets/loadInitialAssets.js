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
  const [
    objectsTexture,
    objectsAtlas,
    uiTexture,
    uiAtlas,
    stageMetadata,
  ] = await Promise.all([
    Assets.load(publicAssetUrl("assets/atlases/objects.png")),
    loadJson(publicAssetUrl("assets/atlases/objects.json")),
    Assets.load(publicAssetUrl("assets/atlases/ui.png")),
    loadJson(publicAssetUrl("assets/atlases/ui.json")),
    loadJson(publicAssetUrl("assets/data/stage-metadata.json")),
  ]);

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

  const textures = { objects: objectsTexture, ui: uiTexture };
  const atlases = { objects: objectsAtlas, ui: uiAtlas };
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
