import {
  restoreCheckpointSnapshot,
  saveCheckpointSnapshot,
} from "../game/levelState.js";
import {
  CHEST_BROWN_REWARD_FRAME_MS,
  CHEST_BROWN_REWARD_LOOP_DURATION_MS,
  CHEST_BROWN_REWARD_LOOP_FRAME_INDEXES,
  CHEST_BROWN_REWARD_PLAYER_FRAME_INDEXES,
  getChestBrownRewardDurationMs,
} from "../game/playerAnimations.js";
import { applyBoulderGravity, applyBoulderPush } from "./entities/boulder.js";
import { applyFireSpitters } from "./entities/fireSpitters.js";
import { applySnakeMovement } from "./entities/snakes.js";
import {
  getActiveEntitiesAt,
  getEntityFallTarget,
  getStaticCellPassability,
  setEntityMove,
} from "./simulationGrid.js";
import { TICK_MS } from "./simulationTiming.js";

export { TICK_MS };

const DIRECTIONS = {
  left: { dx: -1, dy: 0, direction: "left" },
  right: { dx: 1, dy: 0, direction: "right" },
  up: { dx: 0, dy: -1, direction: "up" },
  down: { dx: 0, dy: 1, direction: "down" },
};

function normalizeInput(input) {
  if (!input) return null;
  if (typeof input === "string") return DIRECTIONS[input] || null;
  if (input.direction && DIRECTIONS[input.direction])
    return DIRECTIONS[input.direction];
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

function isFallingEntity(entity) {
  return entity.type === "diamond" || entity.type === "boulder";
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
      entity.type !== "leaf" &&
      entity.type !== "checkpoint" &&
      entity.type !== "chest-brown" &&
      entity.type !== "player-spawn" &&
      entity.type !== "exit" &&
      entity.type !== "secret-exit",
  );
  if (blockingEntity)
    return { passable: false, reason: blockingEntity.type, entities };

  const staticPassability = getStaticCellPassability(levelState, x, y);
  if (!staticPassability.passable) {
    return { passable: false, reason: staticPassability.reason, entities };
  }

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

function vanishLeaves(entities, now) {
  const vanishing = [];
  for (const entity of entities) {
    if (entity.type !== "leaf" || entity.vanishing || entity.vanished) continue;
    entity.vanishing = true;
    entity.vanishStartedAt = now;
    vanishing.push(entity);
  }
  return vanishing;
}

function activateCheckpoints(entities) {
  let activatedCheckpoint = null;
  for (const entity of entities) {
    if (entity.type === "checkpoint" || entity.type === "player-spawn") {
      entity.activated = true;
      activatedCheckpoint = entity;
    }
  }
  return activatedCheckpoint;
}

function isPlayerSpecialAnimationActive(player, now) {
  const animation = player.specialAnimation;
  if (!animation?.active) return false;

  const duration =
    animation.durationMs ||
    getChestBrownRewardDurationMs(animation.frameMs || CHEST_BROWN_REWARD_FRAME_MS);
  if (duration <= 0 || now - animation.startedAt < duration) return true;

  animation.active = false;
  return false;
}

function startChestBrownRewardAnimation(player, chest, now) {
  player.specialAnimation = {
    type: "chest-brown-reward",
    chestId: chest.id,
    active: true,
    startedAt: now,
    frameMs: CHEST_BROWN_REWARD_FRAME_MS,
    frameIndexes: CHEST_BROWN_REWARD_PLAYER_FRAME_INDEXES,
    loopFrameIndexes: CHEST_BROWN_REWARD_LOOP_FRAME_INDEXES,
    loopDurationMs: CHEST_BROWN_REWARD_LOOP_DURATION_MS,
    durationMs: getChestBrownRewardDurationMs(CHEST_BROWN_REWARD_FRAME_MS),
  };
  player.walkFrame = 0;
}

function openBrownChests(levelState, entities, now) {
  const opened = [];
  for (const chest of entities) {
    if (chest.type !== "chest-brown" || chest.opened) continue;

    chest.opened = true;
    chest.opening = true;
    chest.openStartedAt = now;
    startChestBrownRewardAnimation(levelState.player, chest, now);
    opened.push(chest);
  }
  return opened;
}

function advancePlayerWalkFrame(player) {
  player.walkFrame = (player.walkFrame || 0) + 1;
}

function isHorizontalDirection(direction) {
  return direction === "left" || direction === "right";
}

function shouldTurnBeforeMove(player, intent) {
  return (
    isHorizontalDirection(player.direction) &&
    isHorizontalDirection(intent.direction) &&
    player.direction !== intent.direction
  );
}

function setPlayerDirection(player, direction) {
  player.direction = direction;
  player.walkFrame = 0;
}

function setPlayerMove(player, targetX, targetY, now) {
  player.prevX = player.x;
  player.prevY = player.y;
  player.x = targetX;
  player.y = targetY;
  player.moveStartedAt = now;
  player.moveDuration = TICK_MS;
  player.moving = true;
  advancePlayerWalkFrame(player);
}

function tryPushBoulder(levelState, target, intent, now) {
  if (intent.dy !== 0) return { pushed: false, entity: null };
  const boulder = target.entities.find((entity) => entity.type === "boulder");
  if (!boulder) return { pushed: false, entity: null };

  const result = applyBoulderPush(levelState, boulder, intent.dx, now);
  return {
    pushed: result.moved,
    entity: boulder,
    pushedEntities: result.pushedEntities || [],
    reason: result.kind,
  };
}

function applySnakes(levelState, now, skippedEntities = new Set()) {
  const moved = [];
  const playerDamageEvents = [];
  const snakes = levelState.enemies.filter(
    (entity) =>
      entity.type === "snake" &&
      entity.active &&
      !entity.killed &&
      !skippedEntities.has(entity),
  );

  for (const snake of snakes) {
    const result = applySnakeMovement(levelState, snake, now);
    if (result.moved) moved.push(snake);
    if (result.playerHit) playerDamageEvents.push(result.playerHit);
  }

  return { moved, playerDamageEvents };
}

function applyGravity(levelState, now, skippedEntities = new Set()) {
  const moved = [];
  const fallingEntities = levelState.entities
    .filter(
      (entity) =>
        entity.active &&
        !entity.collected &&
        isFallingEntity(entity) &&
        !skippedEntities.has(entity),
    )
    .sort((left, right) => right.y - left.y);

  for (const entity of fallingEntities) {
    if (entity.type === "boulder") {
      const result = applyBoulderGravity(levelState, entity, now, {
        getEntityFallTarget,
      });
      if (result.playerRespawn) {
        restoreCheckpointSnapshot(levelState);
        return { moved, playerRespawned: true, respawnReason: result.kind };
      }
      if (result.moved) moved.push(entity);
      continue;
    }

    const targetX = entity.x;
    const targetY = entity.y + 1;
    const target = getEntityFallTarget(levelState, entity, targetX, targetY);
    if (!target.canFall) {
      entity.falling = false;
      continue;
    }

    entity.falling = true;
    setEntityMove(entity, targetX, targetY, now);
    if (target.hitPlayer) entity.disappearAfterMove = true;
    moved.push(entity);
  }

  return { moved, playerRespawned: false, respawnReason: null };
}

export function createGameSimulation(levelState) {
  let tickCount = 0;

  return {
    get tickCount() {
      return tickCount;
    },
    tick(input, now = Date.now()) {
      tickCount += 1;
      const intent = normalizeInput(input);
      const result = {
        tick: tickCount,
        moved: false,
        turned: false,
        blockedReason: null,
        collected: [],
        vanishing: [],
        falling: [],
        fireSpitterEffects: [],
        pushed: [],
        snakes: [],
        playerDamageEvents: [],
        openedChests: [],
        playerRespawned: false,
        respawnReason: null,
      };

      levelState.player.moving = false;
      if (levelState.player.intro?.active) return result;
      if (isPlayerSpecialAnimationActive(levelState.player, now)) return result;

      const gravitySkippedEntities = new Set();
      if (intent) {
        if (shouldTurnBeforeMove(levelState.player, intent)) {
          setPlayerDirection(levelState.player, intent.direction);
          result.turned = true;
        } else {
          levelState.player.direction = intent.direction;
          const targetX = levelState.player.x + intent.dx;
          const targetY = levelState.player.y + intent.dy;
          const target = getTargetInfo(levelState, targetX, targetY);
          if (!target.passable) {
            const pushResult = tryPushBoulder(levelState, target, intent, now);
            if (pushResult.pushed) {
              setPlayerMove(levelState.player, targetX, targetY, now);
              gravitySkippedEntities.add(pushResult.entity);
              for (const pushedEntity of pushResult.pushedEntities) {
                gravitySkippedEntities.add(pushedEntity);
              }
              result.pushed = [pushResult.entity];
              result.moved = true;
            } else {
              result.blockedReason = target.reason;
            }
          } else {
            result.collected = collectDiamonds(levelState, target.entities);
            result.vanishing = vanishLeaves(target.entities, now);
            setPlayerMove(levelState.player, targetX, targetY, now);
            result.openedChests = openBrownChests(levelState, target.entities, now);
            const activatedCheckpoint = activateCheckpoints(target.entities);
            if (activatedCheckpoint)
              saveCheckpointSnapshot(levelState, activatedCheckpoint);
            result.moved = true;
          }
        }
      }

      const snakes = applySnakes(levelState, now, gravitySkippedEntities);
      result.snakes = snakes.moved;
      result.playerDamageEvents = snakes.playerDamageEvents;
      result.fireSpitterEffects = applyFireSpitters(levelState, now);

      const gravity = applyGravity(levelState, now, gravitySkippedEntities);
      result.falling = gravity.moved;
      result.playerRespawned = gravity.playerRespawned;
      result.respawnReason = gravity.respawnReason;

      return result;
    },
  };
}
