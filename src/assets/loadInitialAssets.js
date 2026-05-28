import { Assets } from "pixi.js";

const assetPaths = {
  tilesAngkorImage: "/assets/atlases/tiles-angkor.png",
  tilesAngkorJson: "/assets/atlases/tiles-angkor.json",
  objectsImage: "/assets/atlases/objects.png",
  objectsJson: "/assets/atlases/objects.json",
  stagesAngkor: "/assets/data/stages-angkor.json",
  stageRenderMapAngkor: "/assets/data/stage-render-map-angkor.json",
};

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
  return response.json();
}

export async function loadInitialAssets() {
  const [
    tilesAngkorTexture,
    objectsTexture,
    tilesAngkorAtlas,
    objectsAtlas,
    stagesAngkor,
    stageRenderMapAngkor,
  ] = await Promise.all([
    Assets.load(assetPaths.tilesAngkorImage),
    Assets.load(assetPaths.objectsImage),
    loadJson(assetPaths.tilesAngkorJson),
    loadJson(assetPaths.objectsJson),
    loadJson(assetPaths.stagesAngkor),
    loadJson(assetPaths.stageRenderMapAngkor),
  ]);

  return {
    textures: {
      tilesAngkor: tilesAngkorTexture,
      "tiles-angkor": tilesAngkorTexture,
      objects: objectsTexture,
    },
    atlases: {
      tilesAngkor: tilesAngkorAtlas,
      objects: objectsAtlas,
    },
    stages: {
      angkor: stagesAngkor,
    },
    stageRenderMaps: {
      angkor: stageRenderMapAngkor,
    },
  };
}
