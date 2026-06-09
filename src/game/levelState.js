function copyDraw(draw) {
  return { ...draw };
}

const INTRO_PASSAGE_KEYS = new Set(["225/225/225", "255/255/255"]);
const INTRO_TILE_DURATION = 250;
const INITIAL_PLAYER_HEALTH = 4;
const INITIAL_PLAYER_LIVES = 5;

function copyDoorAnimation(doorAnimation) {
  return doorAnimation ? { ...doorAnimation } : doorAnimation;
}

function copyClosedDoorAnimation(doorAnimation) {
  return doorAnimation
    ? { ...doorAnimation, state: "closed", startedAt: null }
    : doorAnimation;
}

function getStageCellKey(stage, x, y) {
  const index = x + y * stage.width;
  return [
    stage.layers.player[index],
    stage.layers.foreground[index],
    stage.layers.background[index],
  ].join("/");
}

function findIntroStart(stage, playerSpawn) {
  if (!stage || !playerSpawn) return null;

  let startX = null;
  for (let x = playerSpawn.x - 1; x >= 0; x -= 1) {
    const key = getStageCellKey(stage, x, playerSpawn.y);
    if (!INTRO_PASSAGE_KEYS.has(key)) break;
    startX = x;
  }

  return startX === null ? null : { x: startX, y: playerSpawn.y };
}

function createEntityState(entity) {
  const baseEntity = {
    id: entity.id,
    type: entity.type,
    x: entity.x,
    y: entity.y,
    initialX: entity.x,
    initialY: entity.y,
    prevX: entity.x,
    prevY: entity.y,
    renderX: entity.x,
    renderY: entity.y,
    moveStartedAt: 0,
    moveDuration: 0,
    blocks: entity.blocks,
    data: entity.data,
    specifying_data: entity.specifying_data,
    key: entity.key,
    draws: entity.draws.map(copyDraw),
    sprite: null,
    sprites: [],
    active: true,
  };

  if (entity.type === "diamond") {
    return {
      ...baseEntity,
      collected: false,
      falling: false,
      disappearAfterMove: false,
      rollTargetX: null,
      rollTargetY: null,
      rollDirectionX: 0,
      rollPendingStartedAt: 0,
      rollPendingDuration: 0,
    };
  }
  if (entity.type === "boulder") {
    return {
      ...baseEntity,
      moved: false,
      falling: false,
      boulderFrameIndex: 0,
      playerSupportStartedAt: null,
      rollTargetX: null,
      rollTargetY: null,
      rollDirectionX: 0,
      rollPendingStartedAt: 0,
      rollPendingDuration: 0,
    };
  }
  if (entity.type === "leaf") {
    return {
      ...baseEntity,
      vanishing: false,
      vanished: false,
      vanishStartedAt: 0,
    };
  }
  if (entity.type === "chest-brown") {
    return {
      ...baseEntity,
      contentBlock: entity.blocks,
      opened: false,
      opening: false,
      openStartedAt: 0,
    };
  }
  if (entity.type === "gem-lock") {
    return {
      ...baseEntity,
      requiredDiamonds: entity.specifying_data,
      unlocked: false,
    };
  }
  if (entity.type === "snake") {
    const motion = getSnakeMotion(entity);
    return {
      ...baseEntity,
      killed: false,
      snakeAxis: motion.axis,
      snakeDirection: motion.direction,
    };
  }
  if (
    entity.type === "fire-spitter-left" ||
    entity.type === "fire-spitter-right"
  ) {
    return {
      ...baseEntity,
      fireDirectionX: entity.type === "fire-spitter-left" ? -1 : 1,
      fireDistanceIndex: 0,
    };
  }
  if (entity.type === "player-spawn") {
    return {
      ...baseEntity,
      checkpointIndex: entity.specifying_data,
      activated: false,
      doorAnimation: { state: "open", startedAt: null },
    };
  }
  if (entity.type === "checkpoint") {
    return {
      ...baseEntity,
      checkpointIndex: entity.specifying_data,
      activated: false,
    };
  }
  if (entity.type === "exit" || entity.type === "secret-exit") {
    return {
      ...baseEntity,
      open: false,
      secret: entity.type === "secret-exit",
    };
  }

  return baseEntity;
}

function createPlayerIntro(stage, playerSpawn, spawnEntity) {
  if (!playerSpawn) return null;
  const start = findIntroStart(stage, playerSpawn) || {
    x: playerSpawn.x - 2,
    y: playerSpawn.y,
  };
  const distance = Math.max(
    1,
    Math.abs(playerSpawn.x - start.x) + Math.abs(playerSpawn.y - start.y),
  );

  return {
    active: true,
    startX: start.x,
    startY: start.y,
    targetX: playerSpawn.x,
    targetY: playerSpawn.y,
    doorX: playerSpawn.x - 2,
    doorAnimation: spawnEntity?.doorAnimation || null,
    doorClosed: false,
    moveStartedAt: null,
    moveDuration: distance * INTRO_TILE_DURATION,
    finalDirection: "right",
  };
}

function createPlayerState(stage, playerSpawn, spawnEntity) {
  const intro = createPlayerIntro(stage, playerSpawn, spawnEntity);
  const startX = intro?.startX ?? playerSpawn?.x ?? 0;
  const startY = intro?.startY ?? playerSpawn?.y ?? 0;

  return {
    id: "player",
    type: "player",
    x: playerSpawn?.x ?? 0,
    y: playerSpawn?.y ?? 0,
    prevX: startX,
    prevY: startY,
    renderX: startX,
    renderY: startY,
    spawnX: playerSpawn?.x ?? 0,
    spawnY: playerSpawn?.y ?? 0,
    direction: intro ? "right" : "left",
    walkFrame: 0,
    pushing: false,
    moving: false,
    visualMoving: false,
    moveStartedAt: 0,
    moveDuration: 0,
    maxHealth: INITIAL_PLAYER_HEALTH,
    health: INITIAL_PLAYER_HEALTH,
    lives: INITIAL_PLAYER_LIVES,
    invulnerableUntil: 0,
    boulderHold: null,
    boulderCrush: null,
    intro,
    alive: true,
    gameOver: false,
    sprite: null,
    specialAnimation: null,
  };
}

function getSnakeMotion(entity) {
  const asset =
    entity.draws.find((draw) => draw.asset?.startsWith("snake-"))?.asset || "";
  if (asset.endsWith("-right")) return { axis: "x", direction: 1 };
  if (asset.endsWith("-down")) return { axis: "y", direction: 1 };
  return entity.specifying_data === 1 || entity.specifying_data === 3
    ? { axis: "y", direction: 1 }
    : { axis: "x", direction: 1 };
}

function snapshotEntity(entity) {
  return {
    x: entity.x,
    y: entity.y,
    prevX: entity.x,
    prevY: entity.y,
    renderX: entity.x,
    renderY: entity.y,
    moveStartedAt: 0,
    moveDuration: 0,
    active: entity.active,
    collected: entity.collected,
    falling: false,
    moved: entity.moved,
    killed: entity.killed,
    disappearAfterMove: false,
    vanishing: false,
    vanished: entity.vanished,
    vanishStartedAt: 0,
    activated: entity.activated,
    open: entity.open,
    opened: entity.opened,
    unlocked: entity.unlocked,
    opening: false,
    openStartedAt: 0,
    boulderFrameIndex: entity.boulderFrameIndex,
    rollTargetX: null,
    rollTargetY: null,
    rollDirectionX: 0,
    rollPendingStartedAt: 0,
    rollPendingDuration: 0,
    doorAnimation: copyClosedDoorAnimation(entity.doorAnimation),
    playerSupportStartedAt: null,
    snakeAxis: entity.snakeAxis,
    snakeDirection: entity.snakeDirection,
    fireDirectionX: entity.fireDirectionX,
    fireDistanceIndex: entity.fireDistanceIndex,
  };
}

function restoreEntity(entity, snapshot) {
  Object.assign(entity, snapshot, {
    doorAnimation: copyDoorAnimation(snapshot.doorAnimation),
  });
}

function snapshotPlayer(player, checkpoint) {
  const x = checkpoint?.x ?? player.x;
  const y = checkpoint?.y ?? player.y;
  return {
    x,
    y,
    prevX: x,
    prevY: y,
    renderX: x,
    renderY: y,
    spawnX: x,
    spawnY: y,
    direction: "left",
    walkFrame: 0,
    pushing: false,
    moving: false,
    visualMoving: false,
    moveStartedAt: 0,
    moveDuration: 0,
    maxHealth: player.maxHealth,
    health: player.maxHealth,
    lives: player.lives,
    invulnerableUntil: 0,
    boulderHold: null,
    boulderCrush: null,
    intro: null,
    alive: true,
    gameOver: false,
    hidden: false,
    specialAnimation: null,
  };
}

export function saveCheckpointSnapshot(levelState, checkpoint) {
  levelState.activeCheckpointId = checkpoint?.id || null;
  levelState.checkpointSnapshot = {
    checkpointId: levelState.activeCheckpointId,
    player: snapshotPlayer(levelState.player, checkpoint),
    entities: new Map(
      levelState.entities.map((entity) => [entity.id, snapshotEntity(entity)]),
    ),
    collectedDiamonds: levelState.collectedDiamonds,
  };
}

export function restoreCheckpointSnapshot(levelState) {
  const snapshot = levelState.checkpointSnapshot;
  if (!snapshot) return false;

  Object.assign(levelState.player, snapshot.player);
  for (const entity of levelState.entities) {
    const entitySnapshot = snapshot.entities.get(entity.id);
    if (entitySnapshot) restoreEntity(entity, entitySnapshot);
  }
  levelState.collectedDiamonds = snapshot.collectedDiamonds;
  for (const effect of levelState.effects) effect.active = false;
  return true;
}

export function createLevelState(stage, classification) {
  const entities = classification.entities.map(createEntityState);
  const spawnEntity =
    entities.find((entity) => entity.type === "player-spawn") || null;

  const levelState = {
    stageId: stage.id,
    width: stage.width,
    height: stage.height,
    rawStage: stage,
    classification,
    playerSpawn: classification.playerSpawn
      ? { ...classification.playerSpawn }
      : null,
    player: createPlayerState(stage, classification.playerSpawn, spawnEntity),
    entities,
    entitiesById: new Map(entities.map((entity) => [entity.id, entity])),
    collectibles: entities.filter((entity) => entity.type === "diamond"),
    leaves: entities.filter((entity) => entity.type === "leaf"),
    boulders: entities.filter((entity) => entity.type === "boulder"),
    chests: entities.filter((entity) => entity.type === "chest-brown"),
    checkpoints: entities.filter(
      (entity) =>
        entity.type === "checkpoint" || entity.type === "player-spawn",
    ),
    exits: entities.filter(
      (entity) => entity.type === "exit" || entity.type === "secret-exit",
    ),
    gemLocks: entities.filter((entity) => entity.type === "gem-lock"),
    fireSpitters: entities.filter(
      (entity) =>
        entity.type === "fire-spitter-left" ||
        entity.type === "fire-spitter-right",
    ),
    enemies: entities.filter(
      (entity) =>
        entity.type === "snake" ||
        entity.type === "fire-spitter-left" ||
        entity.type === "fire-spitter-right",
    ),
    effects: [],
    collectedDiamonds: 0,
    completedExit: null,
    completedStage: false,
    activeCheckpointId: null,
    checkpointSnapshot: null,
  };
  saveCheckpointSnapshot(levelState, spawnEntity || classification.playerSpawn);
  return levelState;
}
