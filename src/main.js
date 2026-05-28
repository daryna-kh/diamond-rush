import { Application, Text } from "pixi.js";
import { loadInitialAssets } from "./assets/loadInitialAssets.js";
import { fitStageToScreen } from "./render/layout.js";
import { renderStage } from "./render/StageRenderer.js";
import "./styles/ui.css";
import { createStatusText, textStyle } from "./ui/debugStatus.js";
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
    const assets = await loadInitialAssets();
    app.stage.removeChild(loadingText);

    const stage = assets.stages.angkor.stages[0];
    const stageRoot = renderStage(stage, assets.stageRenderMaps.angkor, assets);
    const statusText = createStatusText(assets);
    const unknownCount = Array.from(stageRoot.unknownTriples.values()).reduce(
      (sum, count) => sum + count,
      0,
    );

    statusText.text += `\nunknown cells in stage 0: ${unknownCount}`;
    app.stage.addChild(stageRoot);
    app.stage.addChild(statusText);
    fitStageToScreen(app, stageRoot, statusText, mode);
    createModeSwitch(mode, (nextMode) => {
      mode = nextMode;
      fitStageToScreen(app, stageRoot, statusText, mode);
      globalThis.__diamondRushMode = mode;
    });
    window.addEventListener("resize", () => fitStageToScreen(app, stageRoot, statusText, mode));

    globalThis.__diamondRushAssets = assets;
    globalThis.__diamondRushStage = stageRoot;
    globalThis.__diamondRushMode = mode;
  } catch (error) {
    loadingText.text = error instanceof Error ? error.message : String(error);
    console.error(error);
  }
}

main();
