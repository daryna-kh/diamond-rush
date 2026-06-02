function copyDraw(draw) {
  return { ...draw };
}

const INTRO_PASSAGE_KEYS = new Set(["225/225/225", "255/255/255"]);
const INTRO_TILE_DURATION = 250;

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
    blocks: entity.blocks,
    data: entity.data,
    specifying_data: entity.specifying_data,
    key: entity.key,
    draws: entity.draws.map(copyDraw),
    sprite: null,
    sprites: [],
    active: true,
  };

  if (entity.type === "diamond") return { ...baseEntity, collected: false };
  if (entity.type === "boulder") return { ...baseEntity, moved: false, falling: false };
  if (entity.type === "leaf") {
    return {
      ...baseEntity,
      vanishing: false,
      vanished: false,
      vanishStartedAt: 0,
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
    return { ...baseEntity, checkpointIndex: entity.specifying_data, activated: false };
  }
  if (entity.type === "exit" || entity.type === "secret-exit") {
    return { ...baseEntity, open: false, secret: entity.type === "secret-exit" };
  }

  return baseEntity;
}

function createPlayerIntro(stage, playerSpawn, spawnEntity) {
  if (!playerSpawn) return null;
  const start = findIntroStart(stage, playerSpawn) || {
    x: playerSpawn.x - 2,
    y: playerSpawn.y,
  };
  const distance = Math.max(1, Math.abs(playerSpawn.x - start.x) + Math.abs(playerSpawn.y - start.y));

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
    moving: false,
    visualMoving: false,
    moveStartedAt: 0,
    moveDuration: 0,
    intro,
    alive: true,
    sprite: null,
  };
}

export function createLevelState(stage, classification) {
  const entities = classification.entities.map(createEntityState);
  const spawnEntity = entities.find((entity) => entity.type === "player-spawn") || null;

  return {
    stageId: stage.id,
    width: stage.width,
    height: stage.height,
    rawStage: stage,
    classification,
    playerSpawn: classification.playerSpawn ? { ...classification.playerSpawn } : null,
    player: createPlayerState(stage, classification.playerSpawn, spawnEntity),
    entities,
    entitiesById: new Map(entities.map((entity) => [entity.id, entity])),
    collectibles: entities.filter((entity) => entity.type === "diamond"),
    leaves: entities.filter((entity) => entity.type === "leaf"),
    boulders: entities.filter((entity) => entity.type === "boulder"),
    checkpoints: entities.filter((entity) => entity.type === "checkpoint" || entity.type === "player-spawn"),
    exits: entities.filter((entity) => entity.type === "exit" || entity.type === "secret-exit"),
    enemies: [],
    effects: [],
    collectedDiamonds: 0,
  };
}
