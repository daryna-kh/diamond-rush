import { Application, Text, TextStyle } from "pixi.js";
import { loadInitialAssets } from "./assets/loadInitialAssets.js";
import { createInputState } from "./input/InputState.js";
import { attachKeyboardInput } from "./input/KeyboardInput.js";
import { createStageScene } from "./render/stageScene.js";
import { TICK_MS } from "./simulation/GameSimulation.js";
import "./styles/ui.css";
import { createGameHud } from "./ui/gameHud.js";

const loadingTextStyle = new TextStyle({
  fill: "#e8f0f2",
  fontFamily: "Arial, sans-serif",
  fontSize: 18,
  lineHeight: 25,
});

function getDevTool() {
  return new URLSearchParams(window.location.search).get("tool");
}

async function loadDevRuntime() {
  await import("./styles/dev.css");
  const [
    { createCellInspector },
    { createDynamicEntityOverlay },
    { createStagePanController },
    { createStatusPanel },
    { createDevPicker },
    { createModeSwitch, getMode },
  ] = await Promise.all([
    import("./dev/cellInspector.js"),
    import("./dev/dynamicEntityOverlay.js"),
    import("./render/panController.js"),
    import("./ui/debugStatus.js"),
    import("./ui/devPicker.js"),
    import("./utils/modes.js"),
  ]);

  return {
    createCellInspector,
    createDynamicEntityOverlay,
    createStagePanController,
    createStatusPanel,
    createDevPicker,
    createModeSwitch,
    getMode,
  };
}

function exposeDebugGlobals(sceneState, assets, mode, panModeEnabled) {
  globalThis.__diamondRushAssets = assets;
  globalThis.__diamondRushStage = sceneState.stageRoot;
  globalThis.__diamondRushLevelState = sceneState.levelState;
  globalThis.__diamondRushSimulation = sceneState.simulation;
  globalThis.__diamondRushWorld = sceneState.worldId;
  globalThis.__diamondRushMode = mode;
  globalThis.__diamondRushZoom = sceneState.zoom;
  globalThis.__diamondRushPanMode = panModeEnabled;
  globalThis.__diamondRushUnknownHighlight =
    sceneState.unknownHighlightEnabled;
  globalThis.__diamondRushDynamicHighlight =
    sceneState.dynamicHighlightEnabled;
}

async function main() {
  if (import.meta.env.DEV && getDevTool() === "object-matcher") {
    try {
      const objectMatcher = await import("./tools/objectMatcher/index.js");
      await objectMatcher.createObjectMatcherTool();
    } catch (error) {
      document.body.textContent =
        error instanceof Error ? error.message : String(error);
      console.error(error);
    }
    return;
  }

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

  const loadingText = new Text({
    text: "Loading assets...",
    style: loadingTextStyle,
  });
  loadingText.x = 24;
  loadingText.y = 24;
  app.stage.addChild(loadingText);

  try {
    const devRuntime = import.meta.env.DEV ? await loadDevRuntime() : null;
    let mode = devRuntime ? devRuntime.getMode() : "game";
    let panModeEnabled = false;
    const assets = await loadInitialAssets();
    app.stage.removeChild(loadingText);

    const scene = createStageScene(app, assets, {
      initialWorldId: "angkor",
      createDynamicEntityOverlay: devRuntime?.createDynamicEntityOverlay,
    });
    scene.setMode(mode);
    const inputState = createInputState();
    attachKeyboardInput(inputState);
    const initialSceneState = scene.getState();
    const gameHud = createGameHud(initialSceneState.stageRoot);
    const statusPanel = devRuntime
      ? devRuntime.createStatusPanel(
          assets,
          initialSceneState.worldId,
          initialSceneState.stage,
          initialSceneState.stageRoot,
        )
      : null;
    statusPanel?.setMode(mode);
    let devPicker = null;
    scene.onSceneChange(({ worldId, stage, stageRoot }) => {
      statusPanel?.updateScene(worldId, stage, stageRoot);
      gameHud.updateScene(stageRoot);
      devPicker?.setSelection(worldId, stage.id);
      if (devRuntime) {
        exposeDebugGlobals(scene.getState(), assets, mode, panModeEnabled);
      }
    });

    let panController = null;
    if (devRuntime) {
      panController = devRuntime.createStagePanController(app.canvas, {
        isEnabled: () => mode === "dev" && panModeEnabled,
        onPan(dx, dy) {
          scene.panBy(dx, dy);
        },
      });
      devRuntime.createCellInspector(app.canvas, {
        getMode: () => mode,
        getStage: () => scene.getStage(),
        getStageRoot: () => scene.getStageRoot(),
        getRenderMap: () => scene.getRenderMap(),
        onInspect: (cell) => statusPanel?.updateCell(cell),
      });

      devPicker = devRuntime.createDevPicker({
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

      devRuntime.createModeSwitch(mode, (nextMode) => {
        mode = nextMode;
        scene.setMode(mode);
        devPicker.setMode(mode);
        statusPanel?.setMode(mode);
        panController.updateCursor();
        globalThis.__diamondRushMode = mode;
      });

      const objectMatcher = await import("./tools/objectMatcher/index.js");
      objectMatcher.createObjectMatcherButton();
    }
    window.addEventListener("resize", () => scene.layout());

    let lastSimulationTickTime = performance.now();
    app.ticker.add(() => {
      const now = performance.now();
      if (now - lastSimulationTickTime >= TICK_MS) {
        lastSimulationTickTime = now;
        scene.tick(inputState.consumeIntent(), now);
      }

      scene.update(now);
    });

    if (devRuntime) {
      exposeDebugGlobals(initialSceneState, assets, mode, panModeEnabled);
      globalThis.__diamondRushInputState = inputState;
      globalThis.__diamondRushTick = (input) =>
        scene.tick(input, performance.now());
    }
  } catch (error) {
    loadingText.text = error instanceof Error ? error.message : String(error);
    console.error(error);
  }
}

main();
