import { TILE_SIZE } from "../render/StageRenderer.js";

function getCell(stage, renderMap, x, y) {
  if (x < 0 || y < 0 || x >= stage.width || y >= stage.height) return null;

  const index = x + y * stage.width;
  const blocks = stage.layers.player[index];
  const data = stage.layers.foreground[index];
  const specifying_data = stage.layers.background[index];
  const key = [blocks, data, specifying_data].join("/");
  const rule = renderMap.triples.find((triple) => triple.key === key);
  const unknownReason = rule?.unknown ? "unknown-render-rule" : "missing-rule";

  return {
    x,
    y,
    blocks,
    data,
    specifying_data,
    key,
    draws: rule?.draws || [],
    unknown: !rule || !!rule.unknown,
    unknownReason: !rule || rule.unknown ? unknownReason : null,
  };
}

export function createCellInspector(canvas, { getMode, getStage, getStageRoot, getRenderMap, onInspect }) {
  canvas.addEventListener("pointermove", (event) => {
    if (getMode() !== "dev") return;

    const stageRoot = getStageRoot();
    const scale = stageRoot.scale.x || 1;
    const stageX = Math.floor((event.offsetX - stageRoot.x) / scale / TILE_SIZE);
    const stageY = Math.floor((event.offsetY - stageRoot.y) / scale / TILE_SIZE);

    onInspect(getCell(getStage(), getRenderMap(), stageX, stageY));
  });

  canvas.addEventListener("pointerleave", () => onInspect(null));
}
