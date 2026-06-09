import {
  clearPendingRoundEntityRoll,
  getActiveEntityOfTypeAt,
  getGravityBlockerAt,
  getRoundEntityRollTarget,
  isPendingRoundEntityRollReady,
  isPendingRoundEntityRollTarget,
  isStaticPassable,
  isPlayerAt,
  ROUND_ENTITY_FALL_MOVE_MS,
  setEntityMove,
  startPendingRoundEntityRoll,
} from "../simulationGrid.js";

export const PLAYER_BOULDER_HOLD_MS = 2000;
const BOULDER_FRAME_COUNT = 8;
const BOULDER_CRUSH_DAMAGE = 2;
const BOULDER_INSTANT_DEATH_FALL_CELLS = 2;

function advanceBoulderFrameForDx(boulder, dx) {
  if (dx === 0) return;

  const currentFrame = boulder.boulderFrameIndex || 0;
  boulder.boulderFrameIndex =
    dx > 0
      ? (currentFrame + 1) % BOULDER_FRAME_COUNT
      : (currentFrame + BOULDER_FRAME_COUNT - 1) % BOULDER_FRAME_COUNT;
}

function setBoulderMove(boulder, targetX, targetY, now, duration) {
  const dx = targetX - boulder.x;
  advanceBoulderFrameForDx(boulder, dx);
  setEntityMove(boulder, targetX, targetY, now, duration);
}

function startBoulderFall(boulder) {
  if (!boulder.falling) {
    boulder.fallStartY = boulder.y;
  }
  boulder.falling = true;
  boulder.playerSupportStartedAt = null;
}

function stopBoulderFall(boulder) {
  boulder.falling = false;
  boulder.fallStartY = null;
}

function getBoulderFallCellsToPlayer(boulder, playerY) {
  const fallStartY = Number.isFinite(boulder.fallStartY)
    ? boulder.fallStartY
    : boulder.y;
  return Math.max(0, playerY - fallStartY);
}

function isHorizontalPushCellFree(levelState, boulder, x, y) {
  return (
    isStaticPassable(levelState, x, y) &&
    !getGravityBlockerAt(levelState, x, y, boulder) &&
    !getActiveEntityOfTypeAt(levelState, "snake", x, y, boulder)
  );
}

function pushSnakeHorizontally(levelState, snake, dx, now) {
  const target = { x: snake.x + dx, y: snake.y };
  if (
    !isStaticPassable(levelState, target.x, target.y) ||
    getGravityBlockerAt(levelState, target.x, target.y, snake) ||
    getActiveEntityOfTypeAt(levelState, "snake", target.x, target.y, snake)
  ) {
    return false;
  }

  snake.moved = true;
  setEntityMove(snake, target.x, target.y, now);
  return snake;
}

export function applyBoulderPush(levelState, boulder, dx, now) {
  if (boulder.type !== "boulder" || !boulder.active || boulder.falling || dx === 0) {
    return { moved: false, entity: boulder, kind: null };
  }

  const target = { x: boulder.x + dx, y: boulder.y };
  let pushedSnake = null;
  if (!isHorizontalPushCellFree(levelState, boulder, target.x, target.y)) {
    const snake = getActiveEntityOfTypeAt(levelState, "snake", target.x, target.y);
    pushedSnake = snake ? pushSnakeHorizontally(levelState, snake, dx, now) : null;
    if (!pushedSnake) {
      return { moved: false, entity: boulder, kind: "push-blocked" };
    }
  }

  boulder.moved = true;
  boulder.playerSupportStartedAt = null;
  boulder.fallStartY = null;
  clearPendingRoundEntityRoll(boulder);
  setBoulderMove(boulder, target.x, target.y, now);
  return {
    moved: true,
    entity: boulder,
    kind: "push",
    pushedEntities: pushedSnake ? [pushedSnake] : [],
  };
}

export function applyBoulderGravity(levelState, boulder, now, helpers) {
  const targetX = boulder.x;
  const targetY = boulder.y + 1;

  if (isPlayerAt(levelState, targetX, targetY)) {
    clearPendingRoundEntityRoll(boulder);
    if (boulder.falling) {
      const fallCells = getBoulderFallCellsToPlayer(boulder, targetY);
      const instantDeath = fallCells >= BOULDER_INSTANT_DEATH_FALL_CELLS;
      boulder.playerSupportStartedAt = null;
      return {
        moved: false,
        entity: boulder,
        kind: "falling-player-crush",
        playerCrush: true,
        damageAmount: instantDeath ? null : BOULDER_CRUSH_DAMAGE,
        instantDeath,
        fallCells,
      };
    }

    if (!boulder.playerSupportStartedAt) boulder.playerSupportStartedAt = now;
    stopBoulderFall(boulder);
    if (now - boulder.playerSupportStartedAt >= PLAYER_BOULDER_HOLD_MS) {
      boulder.playerSupportStartedAt = null;
      return {
        moved: false,
        entity: boulder,
        kind: "player-crush",
        playerCrush: true,
        damageAmount: BOULDER_CRUSH_DAMAGE,
        instantDeath: false,
        fallCells: 0,
      };
    }
    return {
      moved: false,
      entity: boulder,
      kind: "player-support",
      playerSupportStartedAt: boulder.playerSupportStartedAt,
    };
  }
  boulder.playerSupportStartedAt = null;

  const snake = getActiveEntityOfTypeAt(levelState, "snake", targetX, targetY);
  if (snake) {
    clearPendingRoundEntityRoll(boulder);
    snake.active = false;
    snake.killed = true;
    startBoulderFall(boulder);
    setBoulderMove(boulder, targetX, targetY, now, ROUND_ENTITY_FALL_MOVE_MS);
    return { moved: true, entity: boulder, kind: "snake-crush", killed: [snake] };
  }

  const fallTarget = helpers.getEntityFallTarget(levelState, boulder, targetX, targetY);

  if (fallTarget.canFall) {
    clearPendingRoundEntityRoll(boulder);
    startBoulderFall(boulder);
    setBoulderMove(boulder, targetX, targetY, now, ROUND_ENTITY_FALL_MOVE_MS);
    return { moved: true, entity: boulder, kind: "fall" };
  }

  const rollTarget = getRoundEntityRollTarget(levelState, boulder);
  if (rollTarget) {
    if (!isPendingRoundEntityRollReady(boulder, rollTarget, now)) {
      if (!isPendingRoundEntityRollTarget(boulder, rollTarget)) {
        startPendingRoundEntityRoll(boulder, rollTarget, now);
      }
      stopBoulderFall(boulder);
      return { moved: false, entity: boulder, kind: "roll-pending" };
    }

    clearPendingRoundEntityRoll(boulder);
    startBoulderFall(boulder);
    advanceBoulderFrameForDx(boulder, rollTarget.x - boulder.x);
    setEntityMove(boulder, rollTarget.x, rollTarget.y, now);
    return { moved: true, entity: boulder, kind: "roll" };
  }

  clearPendingRoundEntityRoll(boulder);
  stopBoulderFall(boulder);
  return { moved: false, entity: boulder, kind: null };
}
