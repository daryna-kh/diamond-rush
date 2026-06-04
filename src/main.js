import { Application, Text } from "pixi.js";
import { loadInitialAssets } from "./assets/loadInitialAssets.js";
import { createCellInspector } from "./dev/cellInspector.js";
import { createInputState } from "./input/InputState.js";
import { attachKeyboardInput } from "./input/KeyboardInput.js";
import { createStagePanController } from "./render/panController.js";
import { createStageScene } from "./render/stageScene.js";
import { TICK_MS } from "./simulation/GameSimulation.js";
import "./styles/ui.css";
import { createStatusPanel, textStyle } from "./ui/debugStatus.js";
import { createDevPicker } from "./ui/devPicker.js";
import { createModeSwitch, getMode } from "./utils/modes.js";

function isDevToolEnabled(tool) {
  return (
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("tool") === tool
  );
}

async function loadObjectMatcherModule() {
  if (!import.meta.env.DEV) return null;
  try {
    const moduleUrl = `${import.meta.env.BASE_URL}src/tools/objectMatcher/index.js`;
    return await import(/* @vite-ignore */ moduleUrl);
  } catch (error) {
    console.warn("Object matcher dev tool is unavailable.", error);
    return null;
  }
}

async function createDevToolButton(tool) {
  if (!import.meta.env.DEV) return null;
  if (tool !== "object-matcher") return null;

  const objectMatcher = await loadObjectMatcherModule();
  return objectMatcher?.createObjectMatcherButton() || null;
}

async function main() {
  if (isDevToolEnabled("object-matcher")) {
    try {
      const objectMatcher = await loadObjectMatcherModule();
      if (!objectMatcher)
        throw new Error("Object matcher dev tool is unavailable.");
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
    const inputState = createInputState();
    attachKeyboardInput(inputState);
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
    await createDevToolButton("object-matcher");
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

    globalThis.__diamondRushAssets = assets;
    globalThis.__diamondRushStage = initialSceneState.stageRoot;
    globalThis.__diamondRushLevelState = initialSceneState.levelState;
    globalThis.__diamondRushSimulation = initialSceneState.simulation;
    globalThis.__diamondRushInputState = inputState;
    globalThis.__diamondRushTick = (input) =>
      scene.tick(input, performance.now());
    globalThis.__diamondRushWorld = initialSceneState.worldId;
    globalThis.__diamondRushMode = mode;
    globalThis.__diamondRushZoom = initialSceneState.zoom;
    globalThis.__diamondRushPanMode = panModeEnabled;
    globalThis.__diamondRushUnknownHighlight =
      initialSceneState.unknownHighlightEnabled;
    globalThis.__diamondRushDynamicHighlight =
      initialSceneState.dynamicHighlightEnabled;
  } catch (error) {
    loadingText.text = error instanceof Error ? error.message : String(error);
    console.error(error);
  }
}

main();
