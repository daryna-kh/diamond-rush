import {
  restoreCheckpointSnapshot,
  saveCheckpointSnapshot,
} from "../game/levelState.js";
import {
  CHEST_BROWN_OPEN_DURATION_MS,
  LEAF_VANISH_DURATION_MS,
} from "../game/entityAnimations.js";
import {
  CHEST_BROWN_REWARD_FRAME_MS,
  CHEST_BROWN_REWARD_LOOP_DURATION_MS,
  CHEST_BROWN_REWARD_LOOP_FRAME_INDEXES,
  CHEST_BROWN_REWARD_PLAYER_FRAME_INDEXES,
  DIAMOND_COLLECT_FRAME_MS,
  DIAMOND_COLLECT_PLAYER_FRAME_INDEXES,
  DIAMOND_COLLECT_PLAYER_FRAME_PREFIX,
  getDiamondCollectDurationMs,
  getChestBrownRewardDurationMs,
} from "../game/playerAnimations.js";
import { applyBoulderGravity, applyBoulderPush } from "./entities/boulder.js";
import { activateCheckpoints } from "./entities/checkpoints.js";
import { applyDiamondGravity } from "./entities/diamonds.js";
import { applyFireSpitters } from "./entities/fireSpitters.js";
import { applySnakeMovement } from "./entities/snakes.js";
import {
  getActiveEntitiesAt,
  getEntityFallTarget,
  getStaticCellPassability,
} from "./simulationGrid.js";
import { TICK_MS } from "./simulationTiming.js";

export { TICK_MS };

const DIRECTIONS = {
  left: { dx: -1, dy: 0, direction: "left" },
  right: { dx: 1, dy: 0, direction: "right" },
  up: { dx: 0, dy: -1, direction: "up" },
  down: { dx: 0, dy: 1, direction: "down" },
};
const PLAYER_DAMAGE_INVULNERABLE_MS = 700;
const BOULDER_CRUSH_STRUGGLE_MS = 600;
const BOULDER_CRUSH_CURTAIN_MS = 1000;
export const BOULDER_CRUSH_SEQUENCE_MS =
  BOULDER_CRUSH_STRUGGLE_MS + BOULDER_CRUSH_CURTAIN_MS;

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

function isPassableEntity(entity) {
  if (entity.type === "diamond") return true;
  if (entity.type === "leaf") return true;
  if (entity.type === "checkpoint") return true;
  if (entity.type === "chest-brown") return true;
  if (entity.type === "exit" || entity.type === "secret-exit") return true;
  if (entity.type === "player-spawn") return true;
  return false;
}

function getClosedDoorAt(levelState, x, y) {
  return levelState.entities.find(
    (entity) =>
      entity.type === "player-spawn" &&
      entity.active &&
      entity.doorAnimation?.state === "closed" &&
      entity.doorX === x &&
      entity.doorY === y,
  );
}

function getTargetInfo(levelState, x, y) {
  if (x < 0 || y < 0 || x >= levelState.width || y >= levelState.height) {
    return { passable: false, reason: "bounds", entities: [] };
  }

  const entities = getActiveEntitiesAt(levelState, x, y);
  const closedDoor = getClosedDoorAt(levelState, x, y);
  if (closedDoor) {
    return { passable: false, reason: "closed-door", entities };
  }

  if (entities.some((entity) => entity.type === "boulder")) {
    return { passable: false, reason: "boulder", entities };
  }

  const blockingEntity = entities.find(
    (entity) => !isPassableEntity(entity),
  );
  if (blockingEntity)
    return { passable: false, reason: blockingEntity.type, entities };

  const staticPassability = getStaticCellPassability(levelState, x, y);
  if (!staticPassability.passable) {
    return { passable: false, reason: staticPassability.reason, entities };
  }

  return { passable: true, reason: null, entities };
}

function collectDiamonds(levelState, entities, now) {
  const collected = [];
  for (const entity of entities) {
    if (entity.type !== "diamond" || entity.collected) continue;
    entity.collected = true;
    entity.active = false;
    levelState.collectedDiamonds += 1;
    collected.push(entity);
  }
  if (collected.length > 0) {
    startDiamondCollectAnimation(levelState.player, now);
  }
  return collected;
}

function unlockGemLocks(levelState) {
  const unlocked = [];
  for (const lock of levelState.gemLocks) {
    if (
      lock.type !== "gem-lock" ||
      lock.unlocked ||
      levelState.collectedDiamonds < lock.requiredDiamonds
    ) {
      continue;
    }

    lock.unlocked = true;
    lock.active = false;
    unlocked.push(lock);
  }
  return unlocked;
}

function completeExit(levelState, entities) {
  if (levelState.completedStage) return null;
  const exit = entities.find(
    (entity) =>
      (entity.type === "exit" || entity.type === "secret-exit") &&
      entity.active,
  );
  if (!exit) return null;

  levelState.completedStage = true;
  levelState.completedExit = {
    id: exit.id,
    x: exit.x,
    y: exit.y,
    secret: exit.type === "secret-exit",
  };
  return exit;
}

function respawnPlayer(levelState, now, reason) {
  const nextLives = levelState.player.lives - 1;
  if (nextLives < 0) {
    levelState.player.lives = 0;
    levelState.player.health = 0;
    levelState.player.alive = false;
    levelState.player.gameOver = true;
    return {
      playerRespawned: false,
      gameOver: true,
      reason,
    };
  }

  restoreCheckpointSnapshot(levelState);
  levelState.player.lives = nextLives;
  levelState.player.health = levelState.player.maxHealth;
  levelState.player.alive = true;
  levelState.player.gameOver = false;
  levelState.player.invulnerableUntil = now + PLAYER_DAMAGE_INVULNERABLE_MS;
  return {
    playerRespawned: true,
    gameOver: false,
    reason,
  };
}

function damagePlayer(levelState, amount, now, reason, options = {}) {
  const player = levelState.player;
  if (player.gameOver || player.alive === false) {
    return { damaged: false, playerRespawned: false, gameOver: !!player.gameOver, reason };
  }
  if (!options.bypassInvulnerability && now < (player.invulnerableUntil || 0)) {
    return { damaged: false, playerRespawned: false, gameOver: false, reason: "invulnerable" };
  }

  player.health = Math.max(0, player.health - amount);
  player.invulnerableUntil = now + PLAYER_DAMAGE_INVULNERABLE_MS;
  if (player.health > 0) {
    return { damaged: true, playerRespawned: false, gameOver: false, reason };
  }

  return {
    damaged: true,
    ...respawnPlayer(levelState, now, reason),
  };
}

function killPlayer(levelState, now, reason) {
  return damagePlayer(
    levelState,
    levelState.player.health || levelState.player.maxHealth,
    now,
    reason,
    { bypassInvulnerability: true },
  );
}

function clearBoulderHold(levelState) {
  levelState.player.boulderHold = null;
}

function setBoulderHold(levelState, startedAt, boulder) {
  if (levelState.player.boulderCrush?.active) return;
  levelState.player.boulderHold = {
    active: true,
    startedAt,
    boulderId: boulder?.id || null,
  };
}

function startBoulderCrushSequence(levelState, now, reason, boulder) {
  if (levelState.player.boulderCrush?.active) return;
  levelState.player.boulderHold = null;
  levelState.player.boulderCrush = {
    active: true,
    startedAt: now,
    reason,
    boulderId: boulder?.id || null,
    curtainStartedAt: now + BOULDER_CRUSH_STRUGGLE_MS,
    restoreAt: now + BOULDER_CRUSH_SEQUENCE_MS,
  };
  levelState.player.moving = false;
  levelState.player.visualMoving = false;
  levelState.player.pushing = false;
}

function advanceBoulderCrushSequence(levelState, now) {
  const sequence = levelState.player.boulderCrush;
  if (!sequence?.active) return null;
  if (now < sequence.restoreAt) {
    return {
      active: true,
      completed: false,
      playerRespawned: false,
      gameOver: false,
      reason: sequence.reason,
    };
  }

  const reason = sequence.reason || "player-crush";
  levelState.player.boulderCrush = null;
  const damage = killPlayer(levelState, now, reason);
  return {
    active: false,
    completed: true,
    playerRespawned: damage.playerRespawned,
    gameOver: damage.gameOver,
    reason,
  };
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

function isPlayerSpecialAnimationActive(player, now) {
  const animation = player.specialAnimation;
  if (!animation?.active) return false;

  const duration =
    animation.durationMs ||
    getChestBrownRewardDurationMs(animation.frameMs || CHEST_BROWN_REWARD_FRAME_MS);
  if (duration > 0 && now - animation.startedAt >= duration) {
    animation.active = false;
    return false;
  }

  return animation.blocksSimulation !== false;
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
    blocksSimulation: true,
  };
  player.walkFrame = 0;
}

function startDiamondCollectAnimation(player, now) {
  player.specialAnimation = {
    type: "diamond-collect",
    active: true,
    startedAt: now,
    framePrefix: DIAMOND_COLLECT_PLAYER_FRAME_PREFIX,
    frameMs: DIAMOND_COLLECT_FRAME_MS,
    frameIndexes: DIAMOND_COLLECT_PLAYER_FRAME_INDEXES,
    loopFrameIndexes: [],
    loopDurationMs: 0,
    durationMs: getDiamondCollectDurationMs(DIAMOND_COLLECT_FRAME_MS),
    blocksSimulation: false,
  };
}

function applyChestReward(levelState, chest) {
  if (chest.contentBlock === 6) {
    levelState.player.lives += 1;
    return { type: "one-up", amount: 1, chest };
  }

  if (chest.contentBlock === 7) {
    if (levelState.player.health < levelState.player.maxHealth) {
      const amount = levelState.player.maxHealth - levelState.player.health;
      levelState.player.health = levelState.player.maxHealth;
      return { type: "heal", amount, chest };
    }

    levelState.collectedDiamonds += 10;
    return { type: "diamond", amount: 10, chest };
  }

  if (chest.contentBlock === 41) {
    const amount = Number.isFinite(chest.specifying_data)
      ? chest.specifying_data
      : 0;
    levelState.collectedDiamonds += amount;
    return { type: "diamond", amount, chest };
  }

  return null;
}

function openBrownChests(levelState, entities, now) {
  const opened = [];
  const rewards = [];
  for (const chest of entities) {
    if (chest.type !== "chest-brown" || chest.opened) continue;

    chest.opened = true;
    chest.opening = true;
    chest.openStartedAt = now;
    startChestBrownRewardAnimation(levelState.player, chest, now);
    const reward = applyChestReward(levelState, chest);
    if (reward) rewards.push(reward);
    opened.push(chest);
  }
  return { opened, rewards };
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
  const playerDamageEvents = [];
  let playerHoldingBoulder = null;
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
      if (result.playerCrush) {
        startBoulderCrushSequence(levelState, now, result.kind, entity);
        playerDamageEvents.push({
          source: "boulder",
          entity,
          amount: levelState.player.maxHealth,
          reason: result.kind,
          damaged: false,
          playerRespawned: false,
          gameOver: false,
        });
        return {
          moved,
          playerDamageEvents,
          playerRespawned: false,
          gameOver: false,
          playerCrushSequenceStarted: true,
          respawnReason: result.kind,
        };
      }
      if (result.kind === "player-support") {
        playerHoldingBoulder = {
          boulder: entity,
          startedAt: result.playerSupportStartedAt || now,
        };
      }
      if (result.moved) moved.push(entity);
      continue;
    }

    const result = applyDiamondGravity(levelState, entity, now, {
      getEntityFallTarget,
    });
    if (result.moved) moved.push(entity);
  }

  if (playerHoldingBoulder) {
    setBoulderHold(
      levelState,
      playerHoldingBoulder.startedAt,
      playerHoldingBoulder.boulder,
    );
  } else {
    clearBoulderHold(levelState);
  }

  return { moved, playerDamageEvents, playerRespawned: false, gameOver: false, playerCrushSequenceStarted: false, respawnReason: null };
}

function isMoveComplete(entity, now) {
  return (
    entity.moveStartedAt > 0 &&
    entity.moveDuration > 0 &&
    now - entity.moveStartedAt >= entity.moveDuration
  );
}

function completeEntityMove(entity) {
  entity.prevX = entity.x;
  entity.prevY = entity.y;
  entity.renderX = entity.x;
  entity.renderY = entity.y;
  entity.moveStartedAt = 0;
  entity.moveDuration = 0;
}

function advanceEntityLifecycle(levelState, now) {
  const result = {
    disappearedAfterMove: [],
    vanishedLeaves: [],
    completedChestOpenings: [],
  };

  for (const entity of levelState.entities) {
    if (isMoveComplete(entity, now)) completeEntityMove(entity);

    if (entity.disappearAfterMove && entity.moveStartedAt === 0) {
      entity.active = false;
      entity.collected = true;
      entity.falling = false;
      entity.disappearAfterMove = false;
      result.disappearedAfterMove.push(entity);
    }

    if (
      entity.type === "leaf" &&
      entity.active &&
      entity.vanishing &&
      !entity.vanished &&
      now - entity.vanishStartedAt >= LEAF_VANISH_DURATION_MS
    ) {
      entity.active = false;
      entity.vanishing = false;
      entity.vanished = true;
      result.vanishedLeaves.push(entity);
    }

    if (
      entity.type === "chest-brown" &&
      entity.opening &&
      now - entity.openStartedAt >= CHEST_BROWN_OPEN_DURATION_MS
    ) {
      entity.opening = false;
      result.completedChestOpenings.push(entity);
    }
  }

  return result;
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
        chestRewards: [],
        unlockedGemLocks: [],
        completedExit: null,
        lifecycle: null,
        playerRespawned: false,
        gameOver: false,
        boulderCrushSequence: null,
        respawnReason: null,
      };

      result.lifecycle = advanceEntityLifecycle(levelState, now);
      const crushSequence = advanceBoulderCrushSequence(levelState, now);
      if (crushSequence) {
        result.boulderCrushSequence = crushSequence;
        result.playerRespawned = crushSequence.playerRespawned;
        result.gameOver = crushSequence.gameOver;
        result.respawnReason = crushSequence.reason;
        return result;
      }
      result.unlockedGemLocks.push(...unlockGemLocks(levelState));
      levelState.player.moving = false;
      levelState.player.pushing = false;
      if (levelState.player.gameOver) {
        result.gameOver = true;
        return result;
      }
      if (levelState.completedStage) return result;
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
              levelState.player.pushing = true;
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
            result.collected = collectDiamonds(levelState, target.entities, now);
            result.unlockedGemLocks.push(...unlockGemLocks(levelState));
            result.vanishing = vanishLeaves(target.entities, now);
            setPlayerMove(levelState.player, targetX, targetY, now);
            const chests = openBrownChests(levelState, target.entities, now);
            result.openedChests = chests.opened;
            result.chestRewards = chests.rewards;
            if (result.chestRewards.some((reward) => reward.type === "diamond")) {
              result.unlockedGemLocks.push(...unlockGemLocks(levelState));
            }
            const activatedCheckpoint = activateCheckpoints(target.entities);
            if (activatedCheckpoint)
              saveCheckpointSnapshot(levelState, activatedCheckpoint);
            result.completedExit = completeExit(levelState, target.entities);
            result.moved = true;
          }
        }
      }

      if (result.completedExit) return result;

      const snakes = applySnakes(levelState, now, gravitySkippedEntities);
      result.snakes = snakes.moved;
      for (const event of snakes.playerDamageEvents) {
        const damage = damagePlayer(levelState, 1, now, event.source);
        result.playerDamageEvents.push({ ...event, amount: 1, ...damage });
        result.playerRespawned ||= damage.playerRespawned;
        result.gameOver ||= damage.gameOver;
        if (damage.playerRespawned || damage.gameOver) break;
      }
      if (result.playerRespawned || result.gameOver) {
        result.respawnReason = result.playerDamageEvents.at(-1)?.reason || null;
        return result;
      }
      result.fireSpitterEffects = applyFireSpitters(levelState, now);

      const gravity = applyGravity(levelState, now, gravitySkippedEntities);
      result.falling = gravity.moved;
      result.playerDamageEvents.push(...gravity.playerDamageEvents);
      result.playerRespawned = gravity.playerRespawned;
      result.gameOver = gravity.gameOver;
      result.boulderCrushSequence = gravity.playerCrushSequenceStarted
        ? { active: true, completed: false, reason: gravity.respawnReason }
        : null;
      result.respawnReason = gravity.respawnReason;

      return result;
    },
  };
}
