import { Container } from "pixi.js";
import { createDynamicEntityOverlay } from "../dev/dynamicEntityOverlay.js";
import { createEntityLayers, syncLevelStateSprites } from "../game/entityRenderer.js";
import { createLevelState } from "../game/levelState.js";
import { createPlayerSprite } from "../game/playerSprite.js";
import { classifyStage } from "../game/stageClassification.js";
import { createGameSimulation } from "../simulation/GameSimulation.js";
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
    const levelState = createLevelState(stage, classification);
    const simulation = createGameSimulation(levelState);
    const nextStageRoot = new Container();
    const debugLayer = new Container();
    const staticLayer = renderStage(stage, assets.stageRenderMaps[worldId], assets, {
      highlightUnknown: mode === "dev" && unknownHighlightEnabled,
      skipDynamicEntities: true,
      debugLayer,
    });
    const entityLayers = createEntityLayers(assets, levelState);

    nextStageRoot.label = "stageRoot";
    staticLayer.label = "staticLayer";
    debugLayer.label = "debugLayer";

    nextStageRoot.addChild(
      staticLayer,
      entityLayers.itemLayer,
      entityLayers.actorLayer,
      entityLayers.effectLayer,
      debugLayer,
    );

    if (levelState.playerSpawn) {
      levelState.player.sprite = createPlayerSprite(assets, levelState.player);
      entityLayers.actorLayer.addChild(levelState.player.sprite);
    }
    if (mode === "dev" && dynamicHighlightEnabled) {
      debugLayer.addChild(createDynamicEntityOverlay(levelState));
    }

    nextStageRoot.stagePixelWidth = staticLayer.stagePixelWidth;
    nextStageRoot.stagePixelHeight = staticLayer.stagePixelHeight;
    nextStageRoot.unknownTriples = staticLayer.unknownTriples;
    nextStageRoot.unknownCells = staticLayer.unknownCells;
    nextStageRoot.stageLayers = {
      staticLayer,
      itemLayer: entityLayers.itemLayer,
      actorLayer: entityLayers.actorLayer,
      effectLayer: entityLayers.effectLayer,
      debugLayer,
    };
    nextStageRoot.staticRendererLayers = staticLayer.stageLayers;
    nextStageRoot.classification = classification;
    nextStageRoot.levelState = levelState;
    nextStageRoot.simulation = simulation;
    nextStageRoot.spawn = levelState.playerSpawn;
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
        levelState: stageRoot.levelState,
        simulation: stageRoot.simulation,
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
    tick(input) {
      const result = stageRoot.simulation.tick(input);
      syncLevelStateSprites(stageRoot.levelState);
      emitSceneChange();
      return result;
    },
  };

  return scene;
}
