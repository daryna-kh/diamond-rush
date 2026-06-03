import {
  getActiveEntityOfTypeAt,
  getGravityBlockerAt,
  isPlayerAt,
  isStaticPassable,
  setEntityMove,
} from "../simulationGrid.js";
import { TICK_MS } from "../simulationTiming.js";

const SNAKE_VISUAL_SPEED = 0.75;
const SNAKE_MOVE_DURATION = Math.round(TICK_MS / SNAKE_VISUAL_SPEED);

function getSnakeDelta(snake) {
  return snake.snakeAxis === "y"
    ? { dx: 0, dy: snake.snakeDirection || 1 }
    : { dx: snake.snakeDirection || 1, dy: 0 };
}

function reverseSnake(snake) {
  snake.snakeDirection = -(snake.snakeDirection || 1);
}

function isSnakeMoveBlocked(levelState, snake, x, y) {
  return (
    !isStaticPassable(levelState, x, y) ||
    !!getGravityBlockerAt(levelState, x, y, snake) ||
    !!getActiveEntityOfTypeAt(levelState, "snake", x, y, snake)
  );
}

function getSnakeMoveTarget(levelState, snake) {
  let delta = getSnakeDelta(snake);
  let target = { x: snake.x + delta.dx, y: snake.y + delta.dy };

  if (!isSnakeMoveBlocked(levelState, snake, target.x, target.y)) return target;

  reverseSnake(snake);
  delta = getSnakeDelta(snake);
  target = { x: snake.x + delta.dx, y: snake.y + delta.dy };

  return isSnakeMoveBlocked(levelState, snake, target.x, target.y) ? null : target;
}

export function applySnakeMovement(levelState, snake, now) {
  if (snake.type !== "snake" || !snake.active || snake.killed) {
    return { moved: false, entity: snake, kind: null, playerHit: null };
  }

  const target = getSnakeMoveTarget(levelState, snake);
  if (!target) return { moved: false, entity: snake, kind: "blocked", playerHit: null };

  const playerHit = isPlayerAt(levelState, target.x, target.y)
    ? { source: "snake", entity: snake, x: target.x, y: target.y }
    : null;

  snake.moved = true;
  setEntityMove(snake, target.x, target.y, now, SNAKE_MOVE_DURATION);
  return { moved: true, entity: snake, kind: "move", playerHit };
}
