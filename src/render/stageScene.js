import { createDynamicEntityOverlay } from "../dev/dynamicEntityOverlay.js";
import { createEntityLayers } from "../game/entityRenderer.js";
import { createPlayerSprite } from "../game/playerSprite.js";
import { classifyStage, isDynamicCell } from "../game/stageClassification.js";
import { fitStageToScreen } from "./layout.js";
import { renderStage } from "./StageRenderer.js";

function findStage(assets, worldId, stageId) {
  return assets.stages[worldId]?.stages.find((stage) => stage.id === stageId) || null;
}

export function createStageScene(app, assets, { initialWorldId = "angkor" } = {}) {
  let mode = "game";
  let zoom = 1;
  let unknownHighlightEnabled = false;
  let dynamicHighlightEnabled = false;
  let worldId = initialWorldId;
  let stage = assets.stages[worldId].stages[0];
  let stageRoot = null;
  const pan = { x: 0, y: 0 };
  const sceneListeners = new Set();

  const emitSceneChange = () => {
    for (const listener of sceneListeners) listener(scene.getState());
  };

  const layout = () => {
    fitStageToScreen(app, stageRoot, mode, zoom, pan);
  };

  const createStageRoot = () => {
    const classification = classifyStage(stage, assets.stageRenderMaps[worldId], {
      worldId,
      stageMetadata: assets.stageMetadata,
    });
    const nextStageRoot = renderStage(stage, assets.stageRenderMaps[worldId], assets, {
      highlightUnknown: mode === "dev" && unknownHighlightEnabled,
      skipDraw: (draw, cell) => isDynamicCell(cell) && draw.asset !== "background",
    });
    const entityLayers = createEntityLayers(assets, classification);

    nextStageRoot.addChildAt(entityLayers.itemLayer, 2);
    nextStageRoot.addChildAt(entityLayers.actorLayer, 3);
    nextStageRoot.addChildAt(entityLayers.effectLayer, nextStageRoot.children.length - 1);
    if (classification.playerSpawn) {
      entityLayers.actorLayer.addChild(createPlayerSprite(assets, classification.playerSpawn));
    }
    if (mode === "dev" && dynamicHighlightEnabled) {
      nextStageRoot.addChildAt(createDynamicEntityOverlay(classification), nextStageRoot.children.length - 1);
    }

    nextStageRoot.classification = classification;
    nextStageRoot.spawn = classification.playerSpawn;
    nextStageRoot.entityLayers = entityLayers;
    nextStageRoot.dynamicHighlightEnabled = mode === "dev" && dynamicHighlightEnabled;
    return nextStageRoot;
  };

  const replaceStageRoot = () => {
    const previousStageRoot = stageRoot;
    stageRoot = createStageRoot();
    app.stage.addChildAt(stageRoot, 0);
    if (previousStageRoot) {
      app.stage.removeChild(previousStageRoot);
      previousStageRoot.destroy({ children: true });
    }
    layout();
    emitSceneChange();
  };

  stageRoot = createStageRoot();
  app.stage.addChild(stageRoot);
  layout();

  const scene = {
    getState() {
      return {
        mode,
        zoom,
        pan,
        unknownHighlightEnabled,
        dynamicHighlightEnabled,
        worldId,
        stage,
        stageRoot,
      };
    },
    getMode() {
      return mode;
    },
    getStage() {
      return stage;
    },
    getStageRoot() {
      return stageRoot;
    },
    getRenderMap() {
      return assets.stageRenderMaps[worldId];
    },
    onSceneChange(listener) {
      sceneListeners.add(listener);
      return () => sceneListeners.delete(listener);
    },
    layout,
    setMode(nextMode) {
      mode = nextMode;
      if (unknownHighlightEnabled || dynamicHighlightEnabled) replaceStageRoot();
      else layout();
    },
    setStage(nextWorldId, stageId) {
      const nextStage = findStage(assets, nextWorldId, stageId);
      if (!nextStage) return;

      worldId = nextWorldId;
      stage = nextStage;
      pan.x = 0;
      pan.y = 0;
      replaceStageRoot();
    },
    setZoom(nextZoom) {
      zoom = nextZoom;
      layout();
    },
    panBy(dx, dy) {
      pan.x += dx;
      pan.y += dy;
      layout();
    },
    setUnknownHighlight(enabled) {
      unknownHighlightEnabled = enabled;
      replaceStageRoot();
    },
    setDynamicHighlight(enabled) {
      dynamicHighlightEnabled = enabled;
      replaceStageRoot();
    },
  };

  return scene;
}
