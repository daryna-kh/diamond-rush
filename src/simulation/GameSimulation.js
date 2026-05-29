export const TICK_MS = 200;

const DIRECTIONS = {
  left: { dx: -1, dy: 0, direction: "left" },
  right: { dx: 1, dy: 0, direction: "right" },
  up: { dx: 0, dy: -1, direction: "up" },
  down: { dx: 0, dy: 1, direction: "down" },
};

function normalizeInput(input) {
  if (!input) return null;
  if (typeof input === "string") return DIRECTIONS[input] || null;
  if (input.direction && DIRECTIONS[input.direction]) return DIRECTIONS[input.direction];
  if (Number.isInteger(input.dx) && Number.isInteger(input.dy)) {
    if (input.dx === 0 && input.dy === 0) return null;
    const horizontal = Math.abs(input.dx) >= Math.abs(input.dy);
    const dx = horizontal ? Math.max(-1, Math.min(1, input.dx)) : 0;
    const dy = horizontal ? 0 : Math.max(-1, Math.min(1, input.dy));
    return {
      dx,
      dy,
      direction: input.direction || inputDirection(dx, dy),
    };
  }
  return null;
}

function inputDirection(dx, dy) {
  if (dx < 0) return "left";
  if (dx > 0) return "right";
  if (dy < 0) return "up";
  return "down";
}

function getRawCell(levelState, x, y) {
  const index = x + y * levelState.width;
  const blocks = levelState.rawStage.layers.player[index];
  const data = levelState.rawStage.layers.foreground[index];
  const specifying_data = levelState.rawStage.layers.background[index];
  return { blocks, data, specifying_data };
}

function isStaticBlocked(cell) {
  if (cell.blocks >= 80 && cell.blocks <= 146) return true;
  return cell.blocks !== 255 && cell.blocks !== 79 && cell.blocks !== 1 && cell.blocks !== 0;
}

function getActiveEntitiesAt(levelState, x, y) {
  return levelState.entities.filter((entity) => entity.active && entity.x === x && entity.y === y);
}

function getTargetInfo(levelState, x, y) {
  if (x < 0 || y < 0 || x >= levelState.width || y >= levelState.height) {
    return { passable: false, reason: "bounds", entities: [] };
  }

  const entities = getActiveEntitiesAt(levelState, x, y);
  if (entities.some((entity) => entity.type === "boulder")) {
    return { passable: false, reason: "boulder", entities };
  }

  const blockingEntity = entities.find(
    (entity) =>
      entity.type !== "diamond" &&
      entity.type !== "checkpoint" &&
      entity.type !== "player-spawn" &&
      entity.type !== "exit" &&
      entity.type !== "secret-exit",
  );
  if (blockingEntity) return { passable: false, reason: blockingEntity.type, entities };

  const rawCell = getRawCell(levelState, x, y);
  if (isStaticBlocked(rawCell)) return { passable: false, reason: "static", entities };

  return { passable: true, reason: null, entities };
}

function collectDiamonds(levelState, entities) {
  const collected = [];
  for (const entity of entities) {
    if (entity.type !== "diamond" || entity.collected) continue;
    entity.collected = true;
    entity.active = false;
    levelState.collectedDiamonds += 1;
    collected.push(entity);
  }
  return collected;
}

function activateCheckpoints(entities) {
  for (const entity of entities) {
    if (entity.type === "checkpoint" || entity.type === "player-spawn") entity.activated = true;
  }
}

export function createGameSimulation(levelState) {
  let tickCount = 0;

  return {
    get tickCount() {
      return tickCount;
    },
    tick(input) {
      tickCount += 1;
      const intent = normalizeInput(input);
      const result = {
        tick: tickCount,
        moved: false,
        blockedReason: null,
        collected: [],
      };

      levelState.player.moving = false;
      if (!intent) return result;

      levelState.player.direction = intent.direction;
      const targetX = levelState.player.x + intent.dx;
      const targetY = levelState.player.y + intent.dy;
      const target = getTargetInfo(levelState, targetX, targetY);
      if (!target.passable) {
        result.blockedReason = target.reason;
        return result;
      }

      result.collected = collectDiamonds(levelState, target.entities);
      activateCheckpoints(target.entities);
      levelState.player.x = targetX;
      levelState.player.y = targetY;
      levelState.player.moving = true;
      result.moved = true;

      return result;
    },
  };
}
