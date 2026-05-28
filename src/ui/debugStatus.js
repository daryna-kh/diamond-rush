import { TextStyle } from "pixi.js";

export const textStyle = new TextStyle({
  fill: "#e8f0f2",
  fontFamily: "Arial, sans-serif",
  fontSize: 18,
  lineHeight: 25,
});

function getUnknownCount(stageRoot) {
  return Array.from(stageRoot.unknownTriples.values()).reduce((sum, count) => sum + count, 0);
}

function getStageMetadata(assets, worldId, stageId) {
  return assets.stageMetadata?.worlds?.[worldId]?.stages?.[stageId] || null;
}

function getCellLines(inspectedCell) {
  if (!inspectedCell) {
    return [
      "",
      "cell",
      "x/y: -",
      "blocks: -",
      "data: -",
      "specifying_data: -",
      "key: -",
      "unknown: -",
      "unknown reason: -",
      "draws: -",
    ];
  }

  const lines = [
    "",
    "cell",
    `x/y: ${inspectedCell.x}/${inspectedCell.y}`,
    `blocks: ${inspectedCell.blocks}`,
    `data: ${inspectedCell.data}`,
    `specifying_data: ${inspectedCell.specifying_data}`,
    `key: ${inspectedCell.key}`,
    `unknown: ${inspectedCell.unknown ? "yes" : "no"}`,
    `unknown reason: ${inspectedCell.unknownReason || "-"}`,
    `draws: ${inspectedCell.draws.length}`,
  ];

  for (const draw of inspectedCell.draws) {
    lines.push(`- ${draw.layer}: ${draw.asset} (${draw.frameId})`);
  }

  return lines;
}

function getStatusLines(assets, worldId, stage, stageRoot, inspectedCell) {
  const stageCount = assets.stages[worldId].stages.length;
  const world = assets.worlds.find((candidate) => candidate.id === worldId);
  const tilesAtlas = assets.atlases[`tiles-${worldId}`];
  const stageMetadata = getStageMetadata(assets, worldId, stage.id);
  const lines = [
    `Diamond Rush ${world?.label || worldId} stage ${stage.id}`,
    "",
    `tiles-${worldId}.png: ${assets.textures[`tiles-${worldId}`].width} x ${assets.textures[`tiles-${worldId}`].height}`,
    `tiles-${worldId}.json: ${tilesAtlas.frames.length} frames`,
    `objects.png: ${assets.textures.objects.width} x ${assets.textures.objects.height}`,
    `objects.json: ${assets.atlases.objects.frames.length} frames`,
    `stages-${worldId}.json: ${stageCount} stages`,
    `stage ${stage.id}: ${stage.width} x ${stage.height}`,
    `stage-render-map-${worldId}.json: ${assets.stageRenderMaps[worldId].triples.length} triples`,
    `unknown cells in stage ${stage.id}: ${getUnknownCount(stageRoot)}`,
  ];

  if (stageMetadata?.role) lines.push(`role: ${stageMetadata.role}`);
  if (stageMetadata?.label) lines.push(`label: ${stageMetadata.label}`);
  for (const note of stageMetadata?.notes || []) lines.push(`note: ${note}`);

  lines.push(...getCellLines(inspectedCell));

  return lines;
}

export function createStatusPanel(assets, worldId, stage, stageRoot) {
  const panel = document.createElement("aside");
  panel.className = "debug-status";
  let current = { worldId, stage, stageRoot, inspectedCell: null };

  const render = () => {
    panel.textContent = getStatusLines(
      assets,
      current.worldId,
      current.stage,
      current.stageRoot,
      current.inspectedCell,
    ).join("\n");
  };

  render();
  document.body.appendChild(panel);

  return {
    element: panel,
    updateScene(nextWorldId, nextStage, nextStageRoot) {
      current = {
        worldId: nextWorldId,
        stage: nextStage,
        stageRoot: nextStageRoot,
        inspectedCell: null,
      };
      render();
    },
    updateCell(inspectedCell) {
      current.inspectedCell = inspectedCell;
      render();
    },
    setMode(mode) {
      panel.hidden = mode !== "dev";
    },
  };
}
