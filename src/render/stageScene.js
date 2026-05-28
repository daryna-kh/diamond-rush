import { createPlayerSprite } from "../game/playerSprite.js";
import { findStageSpawn } from "../game/spawnPoints.js";
import { fitStageToScreen } from "./layout.js";
import { renderStage } from "./StageRenderer.js";

function findStage(assets, worldId, stageId) {
  return assets.stages[worldId]?.stages.find((stage) => stage.id === stageId) || null;
}

export function createStageScene(app, assets, { initialWorldId = "angkor" } = {}) {
  let mode = "game";
  let zoom = 1;
  let unknownHighlightEnabled = false;
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
    const nextStageRoot = renderStage(stage, assets.stageRenderMaps[worldId], assets, {
      highlightUnknown: mode === "dev" && unknownHighlightEnabled,
    });
    const spawn = findStageSpawn(stage, worldId, assets.stageMetadata);
    nextStageRoot.spawn = spawn;
    if (spawn) nextStageRoot.addChild(createPlayerSprite(assets, spawn));
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
      if (unknownHighlightEnabled) replaceStageRoot();
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
  };

  return scene;
}
