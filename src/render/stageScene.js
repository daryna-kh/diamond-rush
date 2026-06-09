import { Container, Graphics } from "pixi.js";
import { createDynamicEntityOverlay } from "../dev/dynamicEntityOverlay.js";
import { createLevelState } from "../game/levelState.js";
import { createPlayerSprite } from "../game/playerSprite.js";
import { classifyStage } from "../game/stageClassification.js";
import { createGameSimulation } from "../simulation/GameSimulation.js";
import { createEntityLayers, syncLevelStateSprites } from "./entities/entityRenderer.js";
import { fitStageToScreen } from "./layout.js";
import { renderStage, syncStageAnimations } from "./StageRenderer.js";

const STAGE_OPENING_CURTAIN_DURATION_MS = 1000;

function findStage(assets, worldId, stageId) {
  return assets.stages[worldId]?.stages.find((stage) => stage.id === stageId) || null;
}

function syncBoulderCrushCurtain(stageRoot, now) {
  const layer = stageRoot?.stageLayers?.crushCurtainLayer;
  const sequence = stageRoot?.levelState?.player?.boulderCrush;
  if (!layer) return;

  layer.clear();
  if (!sequence?.active || now < sequence.curtainStartedAt) return;

  const duration = Math.max(1, sequence.restoreAt - sequence.curtainStartedAt);
  const progress = Math.max(
    0,
    Math.min(1, (now - sequence.curtainStartedAt) / duration),
  );
  const width = stageRoot.stagePixelWidth || 0;
  const height = stageRoot.stagePixelHeight || 0;
  const curtainHeight = Math.ceil((height / 2) * progress);

  layer
    .rect(0, 0, width, curtainHeight)
    .rect(0, height - curtainHeight, width, curtainHeight)
    .fill({ color: 0x000000, alpha: 1 });
}

function drawHorizontalCurtain(layer, stageRoot, curtainHeight) {
  const width = stageRoot.stagePixelWidth || 0;
  const height = stageRoot.stagePixelHeight || 0;

  layer
    .rect(0, 0, width, curtainHeight)
    .rect(0, height - curtainHeight, width, curtainHeight)
    .fill({ color: 0x000000, alpha: 1 });
}

function syncStageOpeningCurtain(stageRoot, now) {
  const layer = stageRoot?.stageLayers?.exitCurtainLayer;
  const curtain = stageRoot?.openingCurtain;
  if (!layer || !curtain?.active) return false;

  if (curtain.startedAt === null) curtain.startedAt = now;

  const progress = Math.max(
    0,
    Math.min(1, (now - curtain.startedAt) / Math.max(1, curtain.duration)),
  );
  const height = stageRoot.stagePixelHeight || 0;
  const curtainHeight = Math.ceil((height / 2) * (1 - progress));

  if (progress >= 1) {
    curtain.active = false;
    return false;
  }

  drawHorizontalCurtain(layer, stageRoot, curtainHeight);
  return true;
}

function syncTopCurtain(stageRoot, now) {
  const layer = stageRoot?.stageLayers?.exitCurtainLayer;
  const curtain = stageRoot?.levelState?.player?.exitCurtain;
  if (!layer) return;

  layer.clear();
  if (syncStageOpeningCurtain(stageRoot, now)) return;
  if (!curtain?.active) return;

  const progress = Math.max(
    0,
    Math.min(1, (now - curtain.startedAt) / Math.max(1, curtain.duration)),
  );
  const height = stageRoot.stagePixelHeight || 0;
  const curtainHeight = Math.ceil((height / 2) * progress);

  drawHorizontalCurtain(layer, stageRoot, curtainHeight);
}

export function createStageScene(app, assets, { initialWorldId = "angkor" } = {}) {
  let mode = "game";
  let zoom = 1.5;
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
    const crushCurtainLayer = new Graphics();
    const exitCurtainLayer = new Graphics();
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
      entityLayers.effectLayer,
      crushCurtainLayer,
      entityLayers.actorLayer,
      debugLayer,
      exitCurtainLayer,
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
      crushCurtainLayer,
      exitCurtainLayer,
      debugLayer,
    };
    nextStageRoot.staticRendererLayers = staticLayer.stageLayers;
    nextStageRoot.classification = classification;
    nextStageRoot.levelState = levelState;
    nextStageRoot.simulation = simulation;
    nextStageRoot.spawn = levelState.playerSpawn;
    nextStageRoot.entityLayers = entityLayers;
    nextStageRoot.dynamicHighlightEnabled = mode === "dev" && dynamicHighlightEnabled;
    nextStageRoot.openingCurtain = {
      active: true,
      startedAt: null,
      duration: STAGE_OPENING_CURTAIN_DURATION_MS,
    };
    drawHorizontalCurtain(
      exitCurtainLayer,
      nextStageRoot,
      Math.ceil((nextStageRoot.stagePixelHeight || 0) / 2),
    );
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
    tick(input, now = Date.now()) {
      const result = stageRoot.simulation.tick(input, now);
      if (result.completedExit) {
        syncStageAnimations(stageRoot.stageLayers.staticLayer, assets, now);
        syncLevelStateSprites(assets, stageRoot.levelState, now);
        syncBoulderCrushCurtain(stageRoot, now);
        syncTopCurtain(stageRoot, now);
        emitSceneChange();
        return result;
      }
      syncStageAnimations(stageRoot.stageLayers.staticLayer, assets, now);
      syncLevelStateSprites(assets, stageRoot.levelState, now);
      syncBoulderCrushCurtain(stageRoot, now);
      syncTopCurtain(stageRoot, now);
      emitSceneChange();
      return result;
    },
    update(now = Date.now()) {
      syncStageAnimations(stageRoot.stageLayers.staticLayer, assets, now);
      syncLevelStateSprites(assets, stageRoot.levelState, now);
      syncBoulderCrushCurtain(stageRoot, now);
      syncTopCurtain(stageRoot, now);
    },
  };

  return scene;
}
