import { findStageSpawn } from "./spawnPoints.js";

function getCell(stage, x, y) {
  const index = x + y * stage.width;
  const blocks = stage.layers.player[index];
  const data = stage.layers.foreground[index];
  const specifying_data = stage.layers.background[index];
  return {
    x,
    y,
    blocks,
    data,
    specifying_data,
    key: [blocks, data, specifying_data].join("/"),
  };
}

function getEntityType(cell) {
  if (cell.blocks === 79 && cell.data === 4 && cell.specifying_data === 0) return "player-spawn";
  if (cell.blocks === 1) return "diamond";
  if (cell.blocks === 0) return "boulder";
  if (cell.data === 4) return "checkpoint";
  if (cell.data === 5) return "exit";
  if (cell.data === 28) return "secret-exit";
  return null;
}

export function classifyStage(stage, renderMap, { worldId, stageMetadata } = {}) {
  const renderRules = new Map(renderMap.triples.map((triple) => [triple.key, triple]));
  const classification = {
    staticCells: [],
    entities: [],
    collectibles: [],
    enemies: [],
    playerSpawn: worldId ? findStageSpawn(stage, worldId, stageMetadata) : null,
    checkpoints: [],
    exits: [],
    unknown: [],
  };

  for (let y = 0; y < stage.height; y++) {
    for (let x = 0; x < stage.width; x++) {
      const cell = getCell(stage, x, y);
      const rule = renderRules.get(cell.key);
      const entityType = getEntityType(cell);

      if (!rule || rule.unknown) {
        classification.unknown.push({
          ...cell,
          reason: rule ? "unknown-render-rule" : "missing-rule",
        });
      }

      if (!entityType) {
        classification.staticCells.push(cell);
        continue;
      }

      const entity = {
        id: `${entityType}:${x}:${y}`,
        type: entityType,
        ...cell,
        draws: rule?.draws || [],
      };

      classification.entities.push(entity);
      if (entityType === "diamond") classification.collectibles.push(entity);
      else if (entityType === "checkpoint" || entityType === "player-spawn") {
        classification.checkpoints.push(entity);
      } else if (entityType === "exit" || entityType === "secret-exit") {
        classification.exits.push(entity);
      }
    }
  }

  return classification;
}

export function isDynamicCell(cell) {
  return !!getEntityType(cell);
}
