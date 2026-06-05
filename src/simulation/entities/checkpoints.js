export function activateCheckpoints(entities) {
  let activatedCheckpoint = null;

  for (const entity of entities) {
    if (entity.type !== "checkpoint" && entity.type !== "player-spawn") continue;
    if (!entity.activated) entity.activated = true;
    activatedCheckpoint = entity;
  }

  return activatedCheckpoint;
}
