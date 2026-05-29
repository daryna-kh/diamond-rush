import { Application, Text } from "pixi.js";
import { loadInitialAssets } from "./assets/loadInitialAssets.js";
import { createCellInspector } from "./dev/cellInspector.js";
import { createStagePanController } from "./render/panController.js";
import { createStageScene } from "./render/stageScene.js";
import "./styles/ui.css";
import { createStatusPanel, textStyle } from "./ui/debugStatus.js";
import { createDevPicker } from "./ui/devPicker.js";
import { createModeSwitch, getMode } from "./utils/modes.js";

async function main() {
  document.body.style.margin = "0";
  document.body.style.background = "#111719";
  document.body.style.overflow = "hidden";

  const app = new Application();
  await app.init({
    background: "#111719",
    resizeTo: window,
    antialias: false,
    preference: "webgl",
  });

  document.querySelector("#app").appendChild(app.canvas);

  const loadingText = new Text({ text: "Loading assets...", style: textStyle });
  loadingText.x = 24;
  loadingText.y = 24;
  app.stage.addChild(loadingText);

  try {
    let mode = getMode();
    let panModeEnabled = false;
    const assets = await loadInitialAssets();
    app.stage.removeChild(loadingText);

    const scene = createStageScene(app, assets, { initialWorldId: "angkor" });
    scene.setMode(mode);
    const initialSceneState = scene.getState();
    const statusPanel = createStatusPanel(
      assets,
      initialSceneState.worldId,
      initialSceneState.stage,
      initialSceneState.stageRoot,
    );
    statusPanel.setMode(mode);
    scene.onSceneChange(({ worldId, stage, stageRoot }) => {
      statusPanel.updateScene(worldId, stage, stageRoot);
      globalThis.__diamondRushStage = stageRoot;
      globalThis.__diamondRushWorld = worldId;
      globalThis.__diamondRushLevelState = stageRoot.levelState;
      globalThis.__diamondRushSimulation = stageRoot.simulation;
    });

    const panController = createStagePanController(app.canvas, {
      isEnabled: () => mode === "dev" && panModeEnabled,
      onPan(dx, dy) {
        scene.panBy(dx, dy);
      },
    });
    createCellInspector(app.canvas, {
      getMode: () => mode,
      getStage: () => scene.getStage(),
      getStageRoot: () => scene.getStageRoot(),
      getRenderMap: () => scene.getRenderMap(),
      onInspect: (cell) => statusPanel.updateCell(cell),
    });

    const devPicker = createDevPicker({
      worlds: assets.worlds,
      stagesByWorld: assets.stages,
      stageMetadata: assets.stageMetadata,
      initialWorldId: initialSceneState.worldId,
      initialStageId: initialSceneState.stage.id,
      initialZoom: initialSceneState.zoom,
      onChange: ({ worldId, stageId }) => scene.setStage(worldId, stageId),
      onZoomChange: (nextZoom) => {
        scene.setZoom(nextZoom);
        globalThis.__diamondRushZoom = nextZoom;
      },
      onPanModeChange: (enabled) => {
        panModeEnabled = enabled;
        panController.updateCursor();
        globalThis.__diamondRushPanMode = panModeEnabled;
      },
      onUnknownHighlightChange: (enabled) => {
        scene.setUnknownHighlight(enabled);
        globalThis.__diamondRushUnknownHighlight = enabled;
      },
      onDynamicHighlightChange: (enabled) => {
        scene.setDynamicHighlight(enabled);
        globalThis.__diamondRushDynamicHighlight = enabled;
      },
    });
    devPicker.setMode(mode);

    createModeSwitch(mode, (nextMode) => {
      mode = nextMode;
      scene.setMode(mode);
      devPicker.setMode(mode);
      statusPanel.setMode(mode);
      panController.updateCursor();
      globalThis.__diamondRushMode = mode;
    });
    window.addEventListener("resize", () => scene.layout());

    globalThis.__diamondRushAssets = assets;
    globalThis.__diamondRushStage = initialSceneState.stageRoot;
    globalThis.__diamondRushLevelState = initialSceneState.levelState;
    globalThis.__diamondRushSimulation = initialSceneState.simulation;
    globalThis.__diamondRushTick = (input) => scene.tick(input);
    globalThis.__diamondRushWorld = initialSceneState.worldId;
    globalThis.__diamondRushMode = mode;
    globalThis.__diamondRushZoom = initialSceneState.zoom;
    globalThis.__diamondRushPanMode = panModeEnabled;
    globalThis.__diamondRushUnknownHighlight = initialSceneState.unknownHighlightEnabled;
    globalThis.__diamondRushDynamicHighlight = initialSceneState.dynamicHighlightEnabled;
  } catch (error) {
    loadingText.text = error instanceof Error ? error.message : String(error);
    console.error(error);
  }
}

main();
