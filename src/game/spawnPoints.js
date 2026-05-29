function getStageMetadata(stageMetadata, worldId, stageId) {
  return stageMetadata?.worlds?.[worldId]?.stages?.[stageId] || null;
}

function getCell(stage, x, y) {
  const index = x + y * stage.width;
  return {
    blocks: stage.layers.player[index],
    data: stage.layers.foreground[index],
    specifying_data: stage.layers.background[index],
  };
}

function findCells(stage, predicate) {
  const cells = [];
  for (let y = 0; y < stage.height; y++) {
    for (let x = 0; x < stage.width; x++) {
      const cell = getCell(stage, x, y);
      if (predicate(cell)) cells.push({ x, y, ...cell });
    }
  }
  return cells;
}

export function findStageSpawn(stage, worldId, stageMetadata) {
  const metadata = getStageMetadata(stageMetadata, worldId, stage.id);
  if (metadata?.spawn) {
    return {
      ...metadata.spawn,
      source: "metadata",
      rule: metadata.spawn.source,
    };
  }

  const doorCheckpointZero = findCells(
    stage,
    (cell) => cell.blocks === 79 && cell.data === 4 && cell.specifying_data === 0,
  )[0];
  if (doorCheckpointZero) return { ...doorCheckpointZero, source: "door-checkpoint-0" };

  const spawnPoint = findCells(stage, (cell) => cell.blocks === 79)[0];
  if (spawnPoint) return { ...spawnPoint, source: "spawn-point" };

  const checkpointZero = findCells(stage, (cell) => cell.data === 4 && cell.specifying_data === 0)[0];
  if (checkpointZero) return { ...checkpointZero, source: "checkpoint-0" };

  return null;
}
