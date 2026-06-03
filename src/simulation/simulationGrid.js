import { getRawCell, getStaticPassability } from "./passability.js";
import { TICK_MS } from "./simulationTiming.js";

export function isInBounds(levelState, x, y) {
  return x >= 0 && y >= 0 && x < levelState.width && y < levelState.height;
}

export function getActiveEntitiesAt(levelState, x, y) {
  return levelState.entities.filter((entity) => entity.active && entity.x === x && entity.y === y);
}

export function isPlayerAt(levelState, x, y) {
  return levelState.player.alive !== false && levelState.player.x === x && levelState.player.y === y;
}

export function isGravityBlocker(entity) {
  return entity.type === "leaf" || entity.type === "diamond" || entity.type === "boulder";
}

export function getActiveEntityOfTypeAt(levelState, type, x, y, ignoredEntity = null) {
  return getActiveEntitiesAt(levelState, x, y).find(
    (entity) => entity !== ignoredEntity && entity.type === type,
  ) || null;
}

export function getStaticCellPassability(levelState, x, y) {
  if (!isInBounds(levelState, x, y)) {
    return { passable: false, reason: "bounds", terrainType: "bounds" };
  }
  return getStaticPassability(getRawCell(levelState, x, y));
}

export function isStaticPassable(levelState, x, y) {
  return getStaticCellPassability(levelState, x, y).passable;
}

export function getGravityBlockerAt(levelState, x, y, ignoredEntity = null) {
  return getActiveEntitiesAt(levelState, x, y).find(
    (candidate) => candidate !== ignoredEntity && isGravityBlocker(candidate),
  ) || null;
}

export function isGravityCellFree(levelState, x, y, ignoredEntity = null) {
  return (
    isStaticPassable(levelState, x, y) &&
    !isPlayerAt(levelState, x, y) &&
    !getGravityBlockerAt(levelState, x, y, ignoredEntity)
  );
}

export function getEntityFallTarget(levelState, entity, x, y) {
  if (!isInBounds(levelState, x, y)) return { canFall: false, hitPlayer: false };

  if (isPlayerAt(levelState, x, y)) {
    return {
      canFall: entity.type === "diamond" && entity.falling,
      hitPlayer: entity.type === "diamond" && entity.falling,
    };
  }

  if (getGravityBlockerAt(levelState, x, y, entity)) {
    return { canFall: false, hitPlayer: false };
  }

  return {
    canFall: isStaticPassable(levelState, x, y),
    hitPlayer: false,
  };
}

export function setEntityMove(entity, targetX, targetY, now, duration = TICK_MS) {
  entity.prevX = entity.renderX ?? entity.x;
  entity.prevY = entity.renderY ?? entity.y;
  entity.x = targetX;
  entity.y = targetY;
  entity.moveStartedAt = now;
  entity.moveDuration = duration;
}
