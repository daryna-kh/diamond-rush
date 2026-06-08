import { getRawCell, getStaticPassability } from "./passability.js";
import { TICK_MS } from "./simulationTiming.js";

export const ROUND_ENTITY_ROLL_PREPARE_MS = 1000;
export const ROUND_ENTITY_FALL_MOVE_MS = 320;

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
  return (
    entity.type === "leaf" ||
    entity.type === "diamond" ||
    entity.type === "boulder" ||
    entity.type === "chest-brown"
  );
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

export function isRoundGravitySupport(entity) {
  return entity?.type === "boulder" || entity?.type === "diamond";
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

export function getRoundEntityRollTarget(levelState, entity) {
  const support = getGravityBlockerAt(levelState, entity.x, entity.y + 1, entity);
  if (!isRoundGravitySupport(support)) return null;

  for (const dx of [-1, 1]) {
    const sideX = entity.x + dx;
    const sideY = entity.y;
    const diagonalY = entity.y + 1;
    if (
      isGravityCellFree(levelState, sideX, sideY, entity) &&
      isGravityCellFree(levelState, sideX, diagonalY, entity)
    ) {
      return { x: sideX, y: diagonalY };
    }
  }

  return null;
}

export function clearPendingRoundEntityRoll(entity) {
  entity.rollTargetX = null;
  entity.rollTargetY = null;
  entity.rollDirectionX = 0;
  entity.rollPendingStartedAt = 0;
  entity.rollPendingDuration = 0;
}

export function startPendingRoundEntityRoll(
  entity,
  target,
  now,
  duration = ROUND_ENTITY_ROLL_PREPARE_MS,
) {
  entity.rollTargetX = target.x;
  entity.rollTargetY = target.y;
  entity.rollDirectionX = Math.sign(target.x - entity.x);
  entity.rollPendingStartedAt = now;
  entity.rollPendingDuration = duration;
}

export function isPendingRoundEntityRollTarget(entity, target) {
  return entity.rollTargetX === target.x && entity.rollTargetY === target.y;
}

export function isPendingRoundEntityRollReady(entity, target, now) {
  return (
    isPendingRoundEntityRollTarget(entity, target) &&
    entity.rollPendingStartedAt > 0 &&
    entity.rollPendingDuration > 0 &&
    now - entity.rollPendingStartedAt >= entity.rollPendingDuration
  );
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function lerp(from, to, progress) {
  return from + (to - from) * progress;
}

function getEntityMoveRenderPosition(entity, now) {
  const duration = entity.moveDuration || 0;
  const hasMove = duration > 0 && entity.moveStartedAt > 0;
  const progress = hasMove ? clamp01((now - entity.moveStartedAt) / duration) : 1;

  return {
    x: lerp(entity.prevX ?? entity.x, entity.x, progress),
    y: lerp(entity.prevY ?? entity.y, entity.y, progress),
  };
}

export function setEntityMove(entity, targetX, targetY, now, duration = TICK_MS) {
  const renderPosition = getEntityMoveRenderPosition(entity, now);
  entity.prevX = renderPosition.x;
  entity.prevY = renderPosition.y;
  entity.renderX = renderPosition.x;
  entity.renderY = renderPosition.y;
  entity.x = targetX;
  entity.y = targetY;
  entity.moveStartedAt = now;
  entity.moveDuration = duration;
}
