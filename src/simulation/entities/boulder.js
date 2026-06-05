import {
  getActiveEntityOfTypeAt,
  getGravityBlockerAt,
  getRoundEntityRollTarget,
  isStaticPassable,
  isPlayerAt,
  setEntityMove,
} from "../simulationGrid.js";

const PLAYER_BOULDER_HOLD_MS = 3000;

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
  setEntityMove(boulder, target.x, target.y, now);
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
    if (boulder.falling) {
      boulder.playerSupportStartedAt = null;
      return { moved: false, entity: boulder, kind: "falling-player-crush", playerRespawn: true };
    }

    if (!boulder.playerSupportStartedAt) boulder.playerSupportStartedAt = now;
    boulder.falling = false;
    if (now - boulder.playerSupportStartedAt >= PLAYER_BOULDER_HOLD_MS) {
      boulder.playerSupportStartedAt = null;
      return { moved: false, entity: boulder, kind: "player-crush", playerRespawn: true };
    }
    return { moved: false, entity: boulder, kind: "player-support" };
  }
  boulder.playerSupportStartedAt = null;

  const snake = getActiveEntityOfTypeAt(levelState, "snake", targetX, targetY);
  if (snake) {
    snake.active = false;
    snake.killed = true;
    boulder.falling = true;
    setEntityMove(boulder, targetX, targetY, now);
    return { moved: true, entity: boulder, kind: "snake-crush", killed: [snake] };
  }

  const fallTarget = helpers.getEntityFallTarget(levelState, boulder, targetX, targetY);

  if (fallTarget.canFall) {
    boulder.falling = true;
    boulder.playerSupportStartedAt = null;
    setEntityMove(boulder, targetX, targetY, now);
    return { moved: true, entity: boulder, kind: "fall" };
  }

  const rollTarget = getRoundEntityRollTarget(levelState, boulder);
  if (rollTarget) {
    boulder.falling = true;
    boulder.playerSupportStartedAt = null;
    setEntityMove(boulder, rollTarget.x, rollTarget.y, now);
    return { moved: true, entity: boulder, kind: "roll" };
  }

  boulder.falling = false;
  return { moved: false, entity: boulder, kind: null };
}
